#!/usr/bin/env node
// asset-spec.json 항목을 ComfyUI(SDXL novaAnimeXL)로 생성. 사용: node tools/art/gen-comfy-assets.mjs --cat background,banner [--only id1,id2] [--steps 28]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SERVER = (process.env.COMFY_SERVER || "http://127.0.0.1:8189").replace(/\/$/, "");
const MODEL = argOf("--model", "novaAnimeXL_ilV190.safetensors");
const STEPS = parseInt(argOf("--steps", "28"), 10); const CFG = parseFloat(argOf("--cfg", "6.0"));
const OUT = path.resolve(ROOT, argOf("--out", "art/gen/assets")); fs.mkdirSync(OUT, { recursive: true });
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "art", "asset-spec.json"), "utf-8"));
const cats = new Set(argOf("--cat", "background,banner").split(","));
const only = argOf("--only", null)?.split(",");
const EXTRA_POS = argOf("--extra-pos", ""); const EXTRA_NEG = argOf("--extra-neg", "");
let items = spec.assets.filter(a => cats.has(a.category) && (!only || only.includes(a.id)));
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h) % 2147483647; };
const wf = (a, seed) => ({
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: MODEL } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: EXTRA_POS ? `${EXTRA_POS}, ${a.positive.replace(/anime key visual, gacha mobile game art, /,"")}` : a.positive, clip: ["1", 1] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: [a.negative || "lowres, worst quality, text, watermark", EXTRA_NEG].filter(Boolean).join(", "), clip: ["1", 1] } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: a.width, height: a.height, batch_size: 1 } },
  "5": { class_type: "KSampler", inputs: { seed, steps: STEPS, cfg: CFG, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1.0, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `AC_asset_${a.id}` } },
});
async function run(a, v) {
  const seed = (hash(a.id) + v * 104729) % 2147483647;
  const q = await (await fetch(`${SERVER}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: wf(a, seed), client_id: "ac-assets" }) })).json();
  if (!q.prompt_id) throw new Error(JSON.stringify(q).slice(0, 300));
  for (let t = 0; t < 400; t++) {
    await new Promise(r => setTimeout(r, 1500));
    const h = (await (await fetch(`${SERVER}/history/${q.prompt_id}`)).json())[q.prompt_id];
    if (!h) continue; if (h.status?.status_str === "error") throw new Error("comfy error");
    const img = Object.values(h.outputs || {}).flatMap(o => o.images || [])[0];
    if (img) { const buf = Buffer.from(await (await fetch(`${SERVER}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" })}`)).arrayBuffer()); const dest = path.join(OUT, `${a.id}${v ? `_v${v + 1}` : ""}.png`); fs.writeFileSync(dest, buf); return dest; }
  }
  throw new Error("timeout");
}
const variants = parseInt(argOf("--variants", "1"), 10);
console.log(`items ${items.length} x${variants} @ ${SERVER}`);
let ok = 0, fail = 0; const t0 = Date.now();
for (const a of items) for (let v = 0; v < variants; v++) {
  const destPre = path.join(OUT, `${a.id}${v ? `_v${v + 1}` : ""}.png`); if (fs.existsSync(destPre) && !process.argv.includes("--force")) { console.log(`${a.id}${v ? `_v${v + 1}` : ""} skip (exists)`); continue; }
  const s0 = Date.now(); process.stdout.write(`${a.id}${v ? `_v${v + 1}` : ""} (${a.width}x${a.height}) ... `);
  try { await run(a, v); ok++; console.log(`OK ${((Date.now() - s0) / 1000).toFixed(0)}s`); } catch (e) { fail++; console.log(`FAIL ${e.message}`); }
}
console.log(`DONE ok=${ok} fail=${fail} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
