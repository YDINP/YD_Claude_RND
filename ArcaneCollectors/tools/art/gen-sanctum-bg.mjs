#!/usr/bin/env node
/** 명상 성소 전용 배경 생성 (ComfyUI novaAnimeXL). 인물 없는 환경 컨셉아트. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "art", "gen", "sanctum");
const SERVER = "http://127.0.0.1:8189"; const MODEL = "novaAnimeXL_ilV190.safetensors";
const W = 832, H = 1216, STEPS = 28, CFG = 6.0;
const STYLE = "masterpiece, best quality, highly detailed environment concept art, anime game background, "
  + "ancient arcane meditation sanctum interior, empty scenery with no people, no characters, "
  + "circular stone platform with glowing runic inlays on the floor, tall broken pillars, floating light motes, "
  + "deep indigo night palette with cyan and gold luminescence, volumetric god rays from above, "
  + "vertical composition, wide establishing shot, background art for game UI, cinematic lighting";
const NEG = "1girl, 1boy, person, people, character, humanoid, figure, statue of a person, creature, monster, "
  + "text, letters, watermark, signature, logo, ui, hud, frame, border, lowres, blurry, worst quality";
const VARIANTS = [
  { id: "bg_sanctum", extra: "serene sacred atmosphere, soft blue-white glow, cherry-blossom-like light petals drifting" },
  { id: "bg_sanctum_deep", extra: "deeper underground vault, amber braziers, warm gold accents against indigo shadow" },
];
const api = async (p, o = {}) => { const r = await fetch(`${SERVER}${p}`, o); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; };
const wf = (pos, seed) => ({
  1:{class_type:"CheckpointLoaderSimple",inputs:{ckpt_name:MODEL}},
  2:{class_type:"CLIPTextEncode",inputs:{text:pos,clip:["1",1]}},
  3:{class_type:"CLIPTextEncode",inputs:{text:NEG,clip:["1",1]}},
  4:{class_type:"EmptyLatentImage",inputs:{width:W,height:H,batch_size:1}},
  5:{class_type:"KSampler",inputs:{seed,steps:STEPS,cfg:CFG,sampler_name:"dpmpp_2m",scheduler:"karras",denoise:1.0,model:["1",0],positive:["2",0],negative:["3",0],latent_image:["4",0]}},
  6:{class_type:"VAEDecode",inputs:{samples:["5",0],vae:["1",2]}},
  7:{class_type:"SaveImage",inputs:{images:["6",0],filename_prefix:"AC_sanctum"}},
});
async function gen(pos, seed, dest) {
  const { prompt_id } = await (await api("/prompt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:wf(pos,seed),client_id:"ac-sanctum"})})).json();
  const t0 = Date.now();
  while (Date.now()-t0 < 300000) {
    await new Promise(r=>setTimeout(r,1500));
    const h = await (await api(`/history/${prompt_id}`)).json(); const e = h[prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw new Error("comfy error");
    for (const nid of Object.keys(e.outputs||{})) {
      const img = e.outputs[nid]?.images?.[0];
      if (img) { const q=new URLSearchParams({filename:img.filename,subfolder:img.subfolder||"",type:img.type||"output"});
        fs.writeFileSync(dest, Buffer.from(await (await api(`/view?${q}`)).arrayBuffer())); return; }
    }
  }
  throw new Error("timeout");
}
fs.mkdirSync(OUT,{recursive:true});
for (const v of VARIANTS) {
  for (const s of [111,222]) {
    const dest = path.join(OUT, `${v.id}_s${s}.png`);
    process.stdout.write(`${v.id} seed${s} ... `);
    try { await gen([STYLE, v.extra].join(", "), s, dest); console.log("OK"); }
    catch (e) { console.log(`FAIL ${e.message}`); }
  }
}
console.log("SANCTUM DONE");
