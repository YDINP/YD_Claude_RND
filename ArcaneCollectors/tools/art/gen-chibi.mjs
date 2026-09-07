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
const HEROES = Object.fromEntries(ROSTER.filter((c) => c.id.startsWith("base_") || c.id.startsWith("asc_")).map((c) => [c.id, c.looks]));
const CULT_OF = Object.fromEntries(ROSTER.filter((c) => c.cult).map((c) => [c.id, c.cult]));

const hero = argOf("--hero", "base_iris");
const looks = HEROES[hero];
if (!looks) { console.error(`unknown hero ${hero}`); process.exit(2); }
const seed = parseInt(argOf("--seed", "424242"), 10);
const frames = (argOf("--frames", "idle,meditate,channel,awaken")).split(",");
fs.mkdirSync(OUT, { recursive: true });

// 특정 캐릭터는 포트레이트용 공용 외모 문구가 치비 화풍에서 검은 실루엣 실패 모드를 유발한다.
// 포트레이트 SSOT(generate-portraits.mjs)는 건드리지 않고 치비 생성에서만 국소 보강한다.
const LOOKS_OVERRIDE = {
  // base_kai: "face mask pulled down to chin" 문구가 치비에서 마스크가 얼굴을 덮은 것처럼 그려지고
  // "black fitted stealth outfit"이 전신을 검게 만들어 알파 평균 밝기가 83.2까지 떨어졌다(다른 치비 110~180대).
  // 1차: "ninja"/"stealth" 제거 → idle·meditate는 해결됐으나 channel/awaken에서 "combat tunic" 표현이
  // warrior 클래스 특유의 갑옷 투구 연상을 재유발(base_omar도 동일 패턴).
  // 2차: 갑옷/전투 연상 단어를 전부 제거하고 평상복으로 대체 → 마스크는 사라졌으나 과교정으로 남성/장발
  // 포니테일/어두운 전투복 정체성(포트레이트 hero_008 기준)까지 함께 사라져 여자아이 사복 캐릭터로 읽힘.
  // 3차: 지워야 할 건 "코·입을 덮는 마스크" 하나뿐 — 갑옷 실루엣과 남성성·헤어스타일은 정체성 앵커로 복원하고
  // 성별 역전(체크포인트가 mage/암살자류를 기본적으로 소녀로 그리는 편향, base_luca에서도 동일 현상 확인)을
  // 네거티브로 직접 겨냥. 가중치 괄호로 헤어·복장 문구를 강조해 프레임 간 흔들림을 줄인다.
  // 4차: idle은 성공(포니테일·전투복 정체성 복원 + 맨얼굴). 그런데 meditate/channel/awaken(눈 감음·아우라)에서
  // "tactical outfit" 연상이 마스크(가스마스크/호흡기형)를 다시 불러옴. 얼굴 노출 문구를 가중치로 더 세게 걸고
  // 네거티브에 전술 마스크류(가스마스크·호흡기·하관 가드)를 명시적으로 추가해 대응.
  base_kai: "solo male chibi boy character, masculine face, (short black hair swept back with a long thin ponytail tied high at the back of the head:1.3), sharp narrow dark eyes, calm stoic expression, (nose and mouth completely bare with visible skin, no fabric or gear covering the lower face:1.5), (fitted black high-collar bodysuit with dark grey segmented shoulder armor plates and a chest harness buckle strap, dark oriental tactical outfit, black gloves:1.3)",
};
const NEG_EXTRA = {
  base_kai: "girl, woman, female, feminine face, feminine features, dress, skirt, cute girl outfit, witch hat, "
    + "(face mask:1.5), (mouth mask:1.5), (nose mask:1.4), (gas mask:1.5), (respirator:1.5), muzzle guard, mouth guard, chin strap mask, tactical mask, breathing mask, half mask, lower face mask, "
    + "ninja mask, neck gaiter, balaclava, scarf over face, "
    + "helmet, kabuto helmet, samurai helmet, mecha helmet, robot face, animal ear helmet, kitsune mask, oni mask, iron mask, "
    + "forehead guard, visor band, goggles, party hat, opaque face plate, eye holes only without visible face, glowing dot eyes without visible face, "
    + "full face covering, opaque visor, glowing eyes replacing face, red mask, mask covering forehead and eyes, mask covering eyes, blindfold, "
    + "faceless, featureless face, black silhouette, solid black body, all black outfit, unlit face, shadowed face, bright colored clothing, pastel outfit",
};

const api = async (p, o = {}) => { const r = await fetch(`${SERVER}${p}`, o); if (!r.ok) throw new Error(`HTTP ${r.status} @ ${p}`); return r; };

const workflow = (positive, negative, s) => ({
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: MODEL } },
  2: { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["1", 1] } },
  3: { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
  4: { class_type: "EmptyLatentImage", inputs: { width: SIZE, height: SIZE, batch_size: 1 } },
  5: { class_type: "KSampler", inputs: { seed: s, steps: STEPS, cfg: CFG, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1.0, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
  6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  7: { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "AC_chibi" } },
});

async function gen(positive, negative, s, dest) {
  const res = await api("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow(positive, negative, s), client_id: "ac-chibi" }) });
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
  const cult = CULT_OF[hero];
  const cultHint = cult ? `${cult} institution themed outfit accents` : "";
  const looksFinal = LOOKS_OVERRIDE[hero] || looks;
  const negFinal = NEG_EXTRA[hero] ? `${NEG}, ${NEG_EXTRA[hero]}` : NEG;
  const positive = [BASE, looksFinal, cultHint, pose].filter(Boolean).join(", ");
  const dest = path.join(OUT, `${hero}_${f}.png`);
  const t0 = Date.now();
  process.stdout.write(`  ${f} ... `);
  try { await gen(positive, negFinal, seed, dest); console.log(`OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { console.log(`FAIL ${e.message}`); }
}
console.log("CHIBI DONE");
