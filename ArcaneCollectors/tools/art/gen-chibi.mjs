#!/usr/bin/env node
/** 치비(2.5등신) 캐릭터 스프라이트 프레임 생성 — 명상 로비용.
 *  같은 시드 + 포즈 프롬프트만 변경해 프레임 간 정체성 유지 시도.
 *  사용: node tools/art/gen-chibi.mjs --hero base_iris [--seed N] [--frames idle,meditate,...] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "art", "gen", "chibi");
const SERVER = (process.env.COMFY_SERVER || "http://127.0.0.1:8189").replace(/\/$/, "");
const MODEL = "novaAnimeXL_ilV190.safetensors";
const SIZE = 1024, STEPS = 28, CFG = 6.5;
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

// 공용 규격: 모든 캐릭터가 같은 캔버스·등신·시선을 쓰도록 고정
const BASE = "solo, 1 character only, chibi super deformed character, 2.5 heads tall, big head small body, cute mascot proportions, "
  + "full body visible with feet, exactly one character centered in frame, front view, symmetrical, "
  + "clean thick lineart, flat cel shading, bright saturated colors, fully colored, mobile game sprite asset, "
  + "face clearly visible with both eyes, no helmet or mask covering the face, cute expressive face, "
  + "isolated on a plain flat chroma green screen background, nothing else in frame, even flat lighting";
const NEG = "multiple views, multiple characters, 2girls, 3girls, duplicate, twins, clones, character sheet, turnaround sheet, reference sheet, side view, back view, "
  + "realistic proportions, tall body, 6 heads tall, adult proportions, cropped, cut off feet, cut off head, "
  + "helmet covering face, full face mask, visor over eyes, hood hiding face, dark silhouette, unlit face, "
  + "lineart only, uncolored, sketch, outline only, monochrome, "
  + "text, letters, watermark, signature, logo, frame, border, ui, panel, shadow on background, "
  + "gradient background, scenery, props, furniture, lowres, blurry, worst quality, extra limbs, extra fingers";

const FRAMES = {
  idle:      "standing calm idle pose, arms relaxed at sides, eyes open, gentle smile",
  meditate:  "sitting cross-legged in lotus meditation pose, both hands resting on knees palms up, eyes closed, serene peaceful expression, floating slightly",
  channel:   "sitting cross-legged in lotus meditation pose, both hands together in prayer gesture at chest, eyes closed, brow focused, glowing aura around body",
  awaken:    "sitting cross-legged, arms raised outward, eyes open glowing, joyful surprised expression, energy burst around body",
};

// 외모 정보는 포트레이트 생성기의 캐릭터 표를 SSOT로 재사용(중복 정의 방지)
import { execFileSync } from "node:child_process";
const ROSTER = JSON.parse(execFileSync("node", [path.join(ROOT, "tools/portraits/generate-portraits.mjs"), "--dump-json"], { encoding: "utf-8" }));
const HEROES = Object.fromEntries(ROSTER.filter((c) => c.id.startsWith("base_")).map((c) => [c.id, c.looks]));

const hero = argOf("--hero", "base_iris");
const looks = HEROES[hero];
if (!looks) { console.error(`unknown hero ${hero}`); process.exit(2); }
const seed = parseInt(argOf("--seed", "424242"), 10);
const frames = (argOf("--frames", "idle,meditate,channel,awaken")).split(",");
fs.mkdirSync(OUT, { recursive: true });

const api = async (p, o = {}) => { const r = await fetch(`${SERVER}${p}`, o); if (!r.ok) throw new Error(`HTTP ${r.status} @ ${p}`); return r; };

const workflow = (positive, s) => ({
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: MODEL } },
  2: { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["1", 1] } },
  3: { class_type: "CLIPTextEncode", inputs: { text: NEG, clip: ["1", 1] } },
  4: { class_type: "EmptyLatentImage", inputs: { width: SIZE, height: SIZE, batch_size: 1 } },
  5: { class_type: "KSampler", inputs: { seed: s, steps: STEPS, cfg: CFG, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1.0, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
  6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  7: { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "AC_chibi" } },
});

async function gen(positive, s, dest) {
  const res = await api("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow(positive, s), client_id: "ac-chibi" }) });
  const { prompt_id } = await res.json();
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    await new Promise((r) => setTimeout(r, 1500));
    const hist = await (await api(`/history/${prompt_id}`)).json();
    const e = hist[prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw new Error("comfy error");
    for (const nid of Object.keys(e.outputs || {})) {
      const img = e.outputs[nid]?.images?.[0];
      if (img) {
        const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
        fs.writeFileSync(dest, Buffer.from(await (await api(`/view?${q}`)).arrayBuffer()));
        return;
      }
    }
  }
  throw new Error("timeout");
}

console.log(`hero=${hero} seed=${seed} frames=${frames.join(",")}`);
for (const f of frames) {
  const pose = FRAMES[f];
  if (!pose) { console.log(`skip unknown frame ${f}`); continue; }
  const positive = [BASE, looks, pose].join(", ");
  const dest = path.join(OUT, `${hero}_${f}.png`);
  const t0 = Date.now();
  process.stdout.write(`  ${f} ... `);
  try { await gen(positive, seed, dest); console.log(`OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { console.log(`FAIL ${e.message}`); }
}
console.log("CHIBI DONE");
