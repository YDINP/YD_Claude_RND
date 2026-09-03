#!/usr/bin/env node
/** 적 유닛 아트를 ComfyUI(novaAnimeXL)로 생성. 크로마키 그린 배경 → 후처리에서 알파 추출.
 *  사용: node tools/art/gen-enemies-comfy.mjs [--only id1,id2] [--force] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "art", "gen", "enemies_comfy");
const SERVER = (process.env.COMFY_SERVER || "http://127.0.0.1:8189").replace(/\/$/, "");
const MODEL = "novaAnimeXL_ilV190.safetensors";
const W = 1024, H = 1024, STEPS = 26, CFG = 6.0;
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const STYLE = "masterpiece, best quality, highly detailed digital painting, vivid saturated colors, brightly lit subject, dark fantasy creature concept art, single character bust upper body facing viewer, menacing intimidating expression, painterly rendering, dramatic rim light, full color, isolated on a plain flat chroma green screen background, nothing else in frame";
const NEG = "frame, border, card frame, card border, ornate frame, trading card, card layout, badge, emblem overlay, star rating, rarity stars, level number, ui, hud, panel, text, letters, numbers, japanese text, kanji, hiragana, katakana, chinese text, korean text, caption, title, label, logo, watermark, signature, speed lines, manga panel, silhouette, black silhouette, backlit, monochrome, greyscale, underexposed, lowres, worst quality, blurry, multiple characters, full body, feet, scenery, cropped head, extra limbs, slot machine, casino, 777";

const TYPE_HINT = { boss: "imposing boss, larger imposing silhouette, ornate dramatic aura", elite: "elite variant, ornate armor and detailed ornaments", normal: "standard enemy unit" };
const MOOD_KW = { brave: "fierce aggressive glare", devoted: "solemn zealous expression", cunning: "sly malicious grin", stoic: "cold impassive stare", mystic: "eerie arcane glow, floating runes", calm: "still unnerving calm", wild: "feral snarling, chaotic energy", fierce: "savage roaring expression", noble: "haughty regal bearing" };

const hashSeed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h) % 2147483647; };

const stages = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/stages.json"), "utf-8"));
const tower = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/tower.json"), "utf-8"));
const enemies = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/enemies.json"), "utf-8")).enemies;
const byId = Object.fromEntries(enemies.map((e) => [e.id, e]));
const ids = new Set();
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    if ((k === "enemies" || k === "enemyIds") && Array.isArray(v)) v.forEach((x) => ids.add(typeof x === "string" ? x : x.id));
    walk(v);
  }
})(stages);
for (const f of tower.floors) for (const x of f.enemies) ids.add(x.id);

fs.mkdirSync(OUT, { recursive: true });
const onlyArg = argOf("--only", null);
const force = process.argv.includes("--force");
const existing = (id) => fs.existsSync(path.join(ROOT, "art/gen/enemies", `${id}.png`)) || fs.existsSync(path.join(OUT, `${id}.png`));
let targets = [...ids].filter((i) => byId[i]).sort();
if (onlyArg) targets = targets.filter((i) => onlyArg.split(",").includes(i));
else if (!force) targets = targets.filter((i) => !existing(i));

const buildPrompt = (e) => [STYLE, `${e.nameEn || e.id}`, TYPE_HINT[e.type] || TYPE_HINT.normal, MOOD_KW[e.mood] || "", e.description || ""].filter(Boolean).join(", ");

const workflow = (e, seed) => ({
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: MODEL } },
  2: { class_type: "CLIPTextEncode", inputs: { text: buildPrompt(e), clip: ["1", 1] } },
  3: { class_type: "CLIPTextEncode", inputs: { text: NEG, clip: ["1", 1] } },
  4: { class_type: "EmptyLatentImage", inputs: { width: W, height: H, batch_size: 1 } },
  5: { class_type: "KSampler", inputs: { seed, steps: STEPS, cfg: CFG, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1.0, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
  6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  7: { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `AC_enemy_${e.id}` } },
});

const api = async (p, o = {}) => { const r = await fetch(`${SERVER}${p}`, o); if (!r.ok) throw new Error(`HTTP ${r.status} @ ${p}`); return r; };

async function generate(e, seed) {
  const res = await api("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow(e, seed), client_id: "ac-enemy-gen" }) });
  const { prompt_id } = await res.json();
  const start = Date.now();
  while (Date.now() - start < 300000) {
    await new Promise((r) => setTimeout(r, 1500));
    const hist = await (await api(`/history/${prompt_id}`)).json();
    const entry = hist[prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === "error") throw new Error("comfy execution error");
    for (const nid of Object.keys(entry.outputs || {})) {
      const img = entry.outputs[nid]?.images?.[0];
      if (img) {
        const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
        const buf = Buffer.from(await (await api(`/view?${q}`)).arrayBuffer());
        if (buf.length < 1024) throw new Error("output too small");
        fs.writeFileSync(path.join(OUT, `${e.id}.png`), buf);
        return buf.length;
      }
    }
  }
  throw new Error("timeout");
}

console.log(`targets ${targets.length} | ${SERVER} | ${MODEL}`);
let ok = 0, fail = 0;
for (let i = 0; i < targets.length; i++) {
  const e = byId[targets[i]];
  process.stdout.write(`[${i + 1}/${targets.length}] ${e.id} ... `);
  const t0 = Date.now();
  try { const b = await generate(e, hashSeed(e.id)); ok++; console.log(`OK ${(b / 1024).toFixed(0)}KB (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (err) {
    try { const b = await generate(e, (hashSeed(e.id) + 77777) % 2147483647); ok++; console.log(`OK(retry) ${(b / 1024).toFixed(0)}KB`); }
    catch (e2) { fail++; console.log(`FAIL ${e2.message}`); }
  }
}
console.log(`DONE ok=${ok} fail=${fail}`);
