#!/usr/bin/env node
/**
 * ArcaneCollectors - Character Portrait Batch Generator via ComfyUI API
 *
 * Usage:
 *   node generate-portraits.mjs                    # all 38 (hero_005 ~ hero_038)
 *   node generate-portraits.mjs --from 5 --to 14   # by hero number range
 *   node generate-portraits.mjs --only 5,17,33     # specific hero numbers
 *   COMFY_SERVER=http://127.0.0.1:8189 node generate-portraits.mjs
 *
 * Default server: http://127.0.0.1:8189  (D:\AI\ComfyUI2, no login plugin)
 * Model: novaAnimeXL_ilV190.safetensors (SDXL anime)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = path.resolve(__dirname, "..", "..", "public", "assets", "characters", "portraits");

// ---------- config ----------
const argOf = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const SERVER = (process.env.COMFY_SERVER || argOf("--server", "http://127.0.0.1:8189")).replace(/\/$/, "");
const MODEL = argOf("--model", "novaAnimeXL_ilV190.safetensors");
const WIDTH = parseInt(argOf("--width", "768"), 10);
const HEIGHT = parseInt(argOf("--height", "768"), 10);
const STEPS = parseInt(argOf("--steps", "25"), 10);
const CFG = parseFloat(argOf("--cfg", "6.0"));
const POLL_TIMEOUT_MS = 300_000;
// --out DIR : write candidates elsewhere instead of overwriting the live portraits
// --variants N : generate N seed variants per character (files get _v1.._vN suffix)
const OUT_DIR = path.resolve(argOf("--out", DEFAULT_OUT_DIR));
const VARIANTS = Math.max(1, parseInt(argOf("--variants", "1"), 10));
// --fullbody : full-body character sheet (portrait aspect, simple backdrop, no scene) — use with --width 832 --height 1216
const FULLBODY = process.argv.includes("--fullbody");
const SUFFIX_ARG = argOf("--suffix", "");

const STYLE_PREFIX_FULLBODY =
  "masterpiece, best quality, anime style, game character design sheet, full body, standing pose, front view, single character, looking at viewer, detailed face, detailed eyes, detailed outfit, feet visible, whole body in frame, plain flat light gray background, simple background, soft studio lighting";
const STYLE_PREFIX =
  "masterpiece, best quality, anime style, game character portrait illustration, single character, bust shot, upper body, face focus, looking at viewer, detailed face, detailed eyes, clean composition, full-bleed painted background, borderless";
const NEGATIVE =
  "lowres, bad anatomy, bad hands, extra fingers, blurry, worst quality, low quality, multiple views, multiple boys, multiple girls, frame, border, card frame, card border, ornate frame, picture frame, ui, hud, text, letters, numbers, kanji, caption, title, label, star rating, stars icon, logo, emblem badge, icon overlay, watermark, signature, speech bubble, split screen, panel, comic panel, out of frame, cropped head, cleavage, exposed chest, open chest, nsfw, revealing clothes";

// ---------- keyword tables ----------
const CULT_BG = {
  olympus: {
    bg: "marble temple, white columns, greek architecture, golden sky",
    outfit: "greek toga with golden armor accents, laurel wreath",
  },
  valhalla: {
    bg: "viking warrior hall, snowy mountains, northern lights sky",
    outfit: "viking armor, fur cloak over shoulders",
  },
  yomi: {
    bg: "japanese underworld, foggy haunted shrine, floating blue spirit flames",
    outfit: "dark purple-black kimono, tattered robes, hitodama fireflies",
  },
  takamagahara: {
    bg: "shinto shrine above golden clouds, red torii gate, cherry blossoms, heavenly sunlight",
    outfit: "elegant celestial white-gold kimono, sacred ornaments",
  },
  asgard: {
    bg: "golden divine palace, rainbow bifrost bridge in sky",
    outfit: "shining silver-gold plate armor engraved with glowing runes, royal blue cape",
  },
  helheim: {
    bg: "icy shore, leafless dead trees, ghostly mist, frozen wasteland",
    outfit: "frost-covered tattered armor, pale blue ice crystals on shoulders",
  },
  tartarus: {
    bg: "dark deep abyss, broken chained ruins, volcanic lava glow",
    outfit: "tattered black armor wrapped in chains, cursed crimson runes",
  },
  avalon: {
    bg: "misty lake, enchanted forest, ancient castle silhouette in fog",
    outfit: "polished silver knight armor with celtic knotwork, royal blue cape",
  },
  kunlun: {
    bg: "jade mountain peaks above sea of clouds, chinese celestial temple, floating islands",
    outfit: "flowing chinese hanfu robe with jade-green and gold trim",
  },
  nature: {
    bg: "lush ancient forest, giant world tree, glowing flowers and fireflies",
    outfit: "forest ranger outfit decorated with living leaves and vines, flower crown",
  },
  chaos: {
    bg: "surreal cosmic void, swirling rainbow rift, floating shattered crystals",
    outfit: "asymmetric outfit crackling with unstable multicolor energy patterns",
  },
  balance: {
    bg: "serene neutral sanctuary, glowing yin-yang circle of light, twilight gradient sky",
    outfit: "harmonious grey-white outfit with balanced silver scale ornaments",
  },
};

const MOOD_KW = {
  brave: "confident heroic smile, determined eyes, bold pose, flame ember particles",
  devoted: "gentle warm smile, compassionate eyes, hands offering soft healing light",
  cunning: "sly smirk, sharp calculating gaze, one finger raised, glinting ice-crystal sparkles",
  stoic: "stern composed expression, calm unwavering stare, arms crossed",
  mystic: "mysterious serene gaze, ethereal floating gesture, starlight particles, magical aura",
  calm: "peaceful relaxed expression, soft half-lidded eyes, gentle water ripple aura",
  wild: "wild feral grin, fierce glowing eyes, chaotic electric sparks, untamed energy",
};

const CLASS_KW = {
  warrior: { pose: "battle-ready stance holding a sword", extra: "" },
  mage: { pose: "casting a spell with glowing magical orb in hand", extra: "arcane glyphs floating" },
  healer: { pose: "prayer gesture with warm glowing light between hands", extra: "soft light motes" },
  archer: { pose: "drawing an elegant bow with nocked arrow", extra: "wind-blown hair" },
};

const RARITY_KW = {
  SSR: "ultra detailed, intricate costume details, golden rim light, glowing particle effects, dramatic lighting",
  SR: "detailed, silver aura rim light, subtle particle effects",
  R: "clean vivid colors, simple colored aura",
};

// ---------- character roster (38) ----------
// looks: hair/eyes/face/outfit-base; weapon overrides class default where noted
const CHARACTERS = [
  // ===== Base Heroes (10) =====
  {
    num: 5, id: "base_iris", file: "hero_005.png", nameEn: "Iris", gender: "female", cls: "warrior",
    mood: "brave", cult: null, rarity: null,
    looks: "silver-white short messy hair, golden eyes, small scar on left cheek, dark blue traveler jacket with light leather armor",
    weapon: "lightning-wreathed sword, crackling thunder sparks around blade",
    scene: "stormy sky, distant lightning strikes, windswept highland road",
  },
  {
    num: 6, id: "base_sera", file: "hero_006.png", nameEn: "Sera", gender: "female", cls: "healer",
    mood: "devoted", cult: null, rarity: null,
    looks: "long soft pink hair, gentle teal eyes, white-and-gold priestess robe with holy sun emblem",
    weapon: "",
    scene: "sacred sanctuary interior, warm god rays through stained glass",
  },
  {
    num: 7, id: "base_luca", file: "hero_007.png", nameEn: "Luca", gender: "male", cls: "mage",
    mood: "cunning", cult: null, rarity: null,
    looks: "messy orange hair, bright green eyes, freckles, slightly oversized apprentice mage robe covered in pouches and charms",
    weapon: "short gnarled wand sparking colorful misfiring magic",
    scene: "magic academy library, floating open spellbooks, candle light",
  },
  {
    num: 8, id: "base_kai", file: "hero_008.png", nameEn: "Kai", gender: "male", cls: "warrior",
    mood: "stoic", cult: null, rarity: null,
    looks: "black hair tied back, sharp narrow dark eyes, black fitted stealth outfit with face mask pulled down to chin",
    weapon: "twin short blades held reversed",
    scene: "night rooftop under full moon, moonlit tiles, drifting mist",
  },
  {
    num: 9, id: "base_lin", file: "hero_009.png", nameEn: "Lin", gender: "female", cls: "healer",
    mood: "mystic", cult: null, rarity: null,
    looks: "long straight black hair with white ribbon, amber eyes, traditional red-and-white shrine maiden outfit",
    weapon: "paper talisman cards floating around hands",
    scene: "quiet mountain shinto shrine at dusk, paper lanterns, soft mist",
  },
  {
    num: 10, id: "base_omar", file: "hero_010.png", nameEn: "Omar", gender: "male", cls: "warrior",
    mood: "stoic", cult: null, rarity: null,
    looks: "dark tan skin, trimmed black beard, broad heavy build, sand-colored desert guard armor with brass fittings",
    weapon: "massive tower shield planted forward",
    scene: "desert caravan route, rolling sand dunes, harsh noon sun",
  },
  {
    num: 11, id: "base_sol", file: "hero_011.png", nameEn: "Sol", gender: "male", cls: "archer",
    mood: "calm", cult: null, rarity: null,
    looks: "handsome young man, masculine face, flat chest, light brown hair tied in a short low ponytail, calm green eyes, forest ranger cloak over leather archer gear",
    neg: "1girl, female, girl, woman, feminine, breasts, hair ribbon, hair bow",
    weapon: "wooden bow etched with faintly glowing nature runes",
    scene: "sun-dappled deep forest clearing, morning mist between trees",
  },
  {
    num: 12, id: "base_hana", file: "hero_012.png", nameEn: "Hana", gender: "female", cls: "mage",
    mood: "mystic", cult: null, rarity: null,
    looks: "pale lavender bob hair, heterochromia violet and pale-gold eyes, ghostly white-purple kimono-style dress, faint translucent afterimage",
    weapon: "floating spectral lantern orbs circling her hand",
    scene: "twilight boundary between life and death, drifting blue soul wisps, faded torii",
  },
  {
    num: 13, id: "base_leon", file: "hero_013.png", nameEn: "Leon", gender: "male", cls: "warrior",
    mood: "brave", cult: null, rarity: null,
    looks: "crimson swept-back hair, steel-gray eyes, battle-scarred face, worn heavy knight armor with faint rune engravings and red half-cape",
    weapon: "greatsword resting on shoulder",
    scene: "fortress battlements overlooking battlefield banners at sunset",
  },
  {
    num: 14, id: "base_paolo", file: "hero_014.png", nameEn: "Paolo", gender: "male", cls: "mage",
    mood: "cunning", cult: null, rarity: null,
    looks: "ash-blond neatly parted hair, round glasses over hazel eyes, refined noble alchemist coat with brass buckles, glass vials on belt",
    weapon: "swirling transmutation circles and bubbling flask in gloved hand",
    scene: "alchemy laboratory, glowing distillation apparatus, shelves of reagents",
  },

  // ===== Ascended Heroes (24) =====
  {
    num: 15, id: "asc_iris_olympus", file: "hero_015.png", nameEn: "Iris of Lightning", gender: "female", cls: "warrior",
    mood: "brave", cult: "olympus", rarity: "SSR",
    looks: "silver-white hair now streaked with radiant gold, blazing golden eyes, white-and-gold olympian battle dress over light armor",
    weapon: "sword channeling a bolt of divine lightning from storm clouds",
  },
  {
    num: 16, id: "asc_iris_valhalla", file: "hero_016.png", nameEn: "Iris of the Storm", gender: "female", cls: "warrior",
    mood: "brave", cult: "valhalla", rarity: "SSR",
    looks: "silver-white hair whipping in storm wind, defiant golden eyes, iron viking armor with wolf-fur mantle and war paint on cheek",
    weapon: "sword crackling with tempest wind, roaring storm vortex behind her",
  },
  {
    num: 17, id: "asc_iris_chaos", file: "hero_017.png", nameEn: "Iris of Chaos", gender: "female", cls: "warrior",
    mood: "wild", cult: "chaos", rarity: "SSR",
    looks: "fair pale skin, silver-white hair tipped with shifting prismatic colors, manic glowing multicolor eyes, fractured asymmetric battle outfit leaking raw energy",
    neg: "dark skin, tan skin",
    weapon: "sword dissolving into random-colored lightning arcs",
  },
  {
    num: 18, id: "asc_sera_avalon", file: "hero_018.png", nameEn: "Sera of the Sacred Pact", gender: "female", cls: "healer",
    mood: "devoted", cult: "avalon", rarity: "SSR",
    looks: "long pink hair braided with silver circlet, luminous teal eyes, white cleric vestments with celtic gold embroidery over polished pauldrons",
    weapon: "radiant halo shield of light projected before her palms",
  },
  {
    num: 19, id: "asc_sera_kunlun", file: "hero_019.png", nameEn: "Sera of Celestial Medicine", gender: "female", cls: "healer",
    mood: "devoted", cult: "kunlun", rarity: "SR",
    looks: "pink hair pinned with jade lotus pin, kind teal eyes, elegant white-green hanfu healer robe with golden sash",
    weapon: "porcelain medicine gourd emitting purifying green mist",
  },
  {
    num: 20, id: "asc_sera_nature", file: "hero_020.png", nameEn: "Sera of the Earth", gender: "female", cls: "healer",
    mood: "devoted", cult: "nature", rarity: "SR",
    looks: "loose pink hair crowned with small flowers, warm teal eyes, flowing druid dress woven with leaves and vines",
    weapon: "spiral of blooming flowers and light growing around her hands",
  },
  {
    num: 21, id: "asc_luca_asgard", file: "hero_021.png", nameEn: "Luca the Runescholar", gender: "male", cls: "mage",
    mood: "cunning", cult: "asgard", rarity: "SSR",
    looks: "orange hair swept back, gleaming green eyes, scholar robe layered over runed light armor with golden trim, floating rune tome",
    weapon: "orbiting glowing rune stones forming a burst array",
  },
  {
    num: 22, id: "asc_luca_tartarus", file: "hero_022.png", nameEn: "Luca of the Abyss", gender: "male", cls: "mage",
    mood: "cunning", cult: "tartarus", rarity: "SR",
    looks: "orange hair shadowed darker, green eyes glowing faint violet, blackened scholar coat with chain accessories and abyssal sigils",
    weapon: "crackling void lance piercing through a shattered magic barrier",
  },
  {
    num: 23, id: "asc_kai_yomi", file: "hero_023.png", nameEn: "Kai the Death God", gender: "male", cls: "warrior",
    mood: "stoic", cult: "yomi", rarity: "SSR",
    looks: "black hair with single pale streak, hollow calm dark eyes, black haori over dark battle wear marked with underworld sigils",
    weapon: "ominous scythe trailing blue-black soul flames",
  },
  {
    num: 24, id: "asc_kai_helheim", file: "hero_024.png", nameEn: "Kai of Frozen Hell", gender: "male", cls: "warrior",
    mood: "stoic", cult: "helheim", rarity: "SR",
    looks: "black hair dusted with frost, icy gray-blue eyes, frost-rimmed dark armor with frozen breath visible",
    weapon: "blades sheathed in solid ice, freezing the air around him",
  },
  {
    num: 25, id: "asc_lin_takamagahara", file: "hero_025.png", nameEn: "Lin the Heavenly Shaman", gender: "female", cls: "healer",
    mood: "mystic", cult: "takamagahara", rarity: "SSR",
    looks: "black hair adorned with golden celestial hairpiece, shining amber eyes, divine white-red ceremonial miko robe with gold thread",
    weapon: "sacred mirror and floating ofuda radiating heavenly light",
  },
  {
    num: 26, id: "asc_lin_balance", file: "hero_026.png", nameEn: "Lin of Balance", gender: "female", cls: "healer",
    mood: "mystic", cult: "balance", rarity: "R",
    looks: "black hair with neutral grey ribbon, calm dual-toned amber-silver eyes, monochrome grey-white shrine attire with balanced scale emblem",
    weapon: "twin orbs of light and shadow orbiting symmetrically",
  },
  {
    num: 27, id: "asc_omar_valhalla", file: "hero_027.png", nameEn: "Omar the Iron-Blooded", gender: "male", cls: "warrior",
    mood: "stoic", cult: "valhalla", rarity: "SR",
    looks: "bearded weathered face with new battle scars, iron-gray determination in dark eyes, battered but unbroken viking plate with bear fur",
    weapon: "tower shield bearing raven crest, bloodied but standing firm",
  },
  {
    num: 28, id: "asc_omar_avalon", file: "hero_028.png", nameEn: "Omar the Holy Fortress", gender: "male", cls: "warrior",
    mood: "stoic", cult: "avalon", rarity: "SR",
    looks: "dark tan skin, short black hair, trimmed black beard, bearded dignified mature face, steady protective dark eyes, radiant white-silver holy knight armor with celtic filigree",
    neg: "white hair, blonde hair, orange hair, pale skin, young boy",
    weapon: "tower shield blessed with glowing sanctified barrier light",
  },
  {
    num: 29, id: "asc_sol_nature", file: "hero_029.png", nameEn: "Sol of the Earth", gender: "male", cls: "archer",
    mood: "calm", cult: "nature", rarity: "SSR",
    looks: "handsome young man, masculine face, flat chest, short brown ponytail intertwined with growing vines, serene glowing green eyes, ranger garb blooming with living plants and moss",
    neg: "1girl, female, girl, woman, feminine, breasts, hair ribbon, hair bow",
    weapon: "bow grown from living wood, arrow sprouting petals mid-draw",
  },
  {
    num: 30, id: "asc_sol_kunlun", file: "hero_030.png", nameEn: "Sol the Poisoned Arrow", gender: "male", cls: "archer",
    mood: "calm", cult: "kunlun", rarity: "SR",
    looks: "brown ponytail with jade clasp, focused green eyes, dark green hanfu-styled archer robe with poison-dart embroidery",
    weapon: "bow drawn with arrows dripping luminous violet toxin",
  },
  {
    num: 31, id: "asc_hana_yomi", file: "hero_031.png", nameEn: "Hana of the Underworld", gender: "female", cls: "mage",
    mood: "mystic", cult: "yomi", rarity: "SSR",
    looks: "lavender hair fading into wisps of smoke, hypnotic violet eyes, luxurious black-purple underworld kimono with golden spider lilies",
    weapon: "great spectral gate opening behind her pouring cursed flame",
  },
  {
    num: 32, id: "asc_hana_helheim", file: "hero_032.png", nameEn: "Hana of Frost", gender: "female", cls: "mage",
    mood: "mystic", cult: "helheim", rarity: "R",
    looks: "frosted lavender hair with ice crystals, pale glacial eyes, pale blue-white funeral kimono rimmed with hoarfrost",
    weapon: "snowflake seal spinning above her palm, blizzard swirl",
  },
  {
    num: 33, id: "asc_hana_chaos", file: "hero_033.png", nameEn: "Hana of Frenzy", gender: "female", cls: "mage",
    mood: "wild", cult: "chaos", rarity: "SSR",
    looks: "wild lavender hair crackling with static, ecstatic mismatched glowing eyes, torn festive kimono bursting with uncontrolled rainbow energy",
    weapon: "detonating cluster of random elemental bursts around her",
  },
  {
    num: 34, id: "asc_leon_asgard", file: "hero_034.png", nameEn: "Leon the Rune Warrior", gender: "male", cls: "warrior",
    mood: "brave", cult: "asgard", rarity: "SR",
    looks: "crimson hair, resolute gray eyes, asgardian plate armor fully inscribed with burning golden runes, fur-lined cape",
    weapon: "greatsword whose runes ignite sequentially down the blade",
  },
  {
    num: 35, id: "asc_leon_olympus", file: "hero_035.png", nameEn: "Leon of Divine Wrath", gender: "male", cls: "warrior",
    mood: "brave", cult: "olympus", rarity: "SSR",
    looks: "crimson hair lit by golden light, blazing righteous gray eyes, ornate gold-trimmed olympian armor with sunburst pauldron and white cape",
    weapon: "greatsword calling down pillars of judgment lightning",
  },
  {
    num: 36, id: "asc_paolo_tartarus", file: "hero_036.png", nameEn: "Paolo the Abyss Scholar", gender: "male", cls: "mage",
    mood: "cunning", cult: "tartarus", rarity: "SSR",
    looks: "ash-blond hair with cracked glasses reflecting abyss light, violet-burning hazel eyes, grand black alchemist regalia with titan-chain ornaments",
    weapon: "deconstruction formula circle unraveling matter into dust",
  },
  {
    num: 37, id: "asc_paolo_chaos", file: "hero_037.png", nameEn: "Paolo the Chaos Alchemist", gender: "male", cls: "mage",
    mood: "cunning", cult: "chaos", rarity: "SSR",
    looks: "wild ash-blond hair, manic grin behind cracked glasses, patchwork alchemist coat flickering through random colors",
    weapon: "unstable flasks detonating into random elemental explosions",
  },
  {
    num: 38, id: "asc_paolo_balance", file: "hero_038.png", nameEn: "Paolo the Balance Tuner", gender: "male", cls: "mage",
    mood: "cunning", cult: "balance", rarity: "R",
    looks: "neat ash-blond hair, measured knowing hazel eyes, immaculate grey-white alchemist uniform with silver equilibrium insignia",
    weapon: "twin flasks of opposing elements merging into neutral silver glow",
  },
];

// ---------- helpers ----------
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2147483647;
}

function buildPrompt(c) {
  const parts = [FULLBODY ? STYLE_PREFIX_FULLBODY : STYLE_PREFIX];
  parts.push(c.gender === "female" ? "1girl" : "1boy");
  parts.push(`${c.gender} ${c.cls}`);
  if (MOOD_KW[c.mood]) parts.push(MOOD_KW[c.mood]);
  parts.push(c.looks);
  if (c.weapon) parts.push(c.weapon);
  else if (CLASS_KW[c.cls]) parts.push(CLASS_KW[c.cls].pose);

  const cultDef = c.cult ? CULT_BG[c.cult] : null;
  if (cultDef) {
    parts.push(cultDef.outfit);
    if (!FULLBODY) parts.push(cultDef.bg);
  } else if (c.scene && !FULLBODY) {
    parts.push(c.scene);
  }
  if (RARITY_KW[c.rarity]) parts.push(RARITY_KW[c.rarity]);
  return parts.filter(Boolean).join(", ");
}

function buildWorkflow(c, seedOverride) {
  const seed = seedOverride ?? hashSeed(c.id);
  const positive = buildPrompt(c);
  return {
    workflow: {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: MODEL }, _meta: { title: "Load Checkpoint" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["1", 1] }, _meta: { title: "Positive" } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: [NEGATIVE, c.neg, FULLBODY ? "close-up, bust shot, portrait, cropped legs, cropped feet, scenery, complex background" : ""].filter(Boolean).join(", "), clip: ["1", 1] }, _meta: { title: "Negative" } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: WIDTH, height: HEIGHT, batch_size: 1 }, _meta: { title: "Empty Latent" } },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed, steps: STEPS, cfg: CFG, sampler_name: "dpmpp_2m", scheduler: "karras",
          denoise: 1.0, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
        },
        _meta: { title: "KSampler" },
      },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] }, _meta: { title: "VAE Decode" } },
      "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: `AC_portraits_${c.id}` }, _meta: { title: "Save" } },
    },
    positive,
    seed,
  };
}

async function api(path_, opts = {}) {
  const res = await fetch(`${SERVER}${path_}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} @ ${path_}`);
  return res;
}

async function queuePrompt(workflow) {
  const res = await api("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: "ac-portrait-gen" }),
  });
  const j = await res.json();
  const nodeErrCount = Object.keys(j.node_errors || {}).length;
  if (j.error || nodeErrCount > 0) throw new Error(`queue error: ${JSON.stringify(j).slice(0, 500)}`);
  if (!j.prompt_id) throw new Error(`no prompt_id in response: ${JSON.stringify(j).slice(0, 200)}`);
  return j.prompt_id;
}

async function waitForResult(promptId) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await api(`/history/${promptId}`);
    const hist = await res.json();
    const entry = hist[promptId];
    if (!entry) continue;
    const statusStr = entry.status?.status_str;
    if (statusStr === "error") throw new Error("comfy reported execution error");
    if (statusStr === "success" && entry.outputs && Object.keys(entry.outputs).length > 0) {
      for (const nodeId of Object.keys(entry.outputs)) {
        const imgs = entry.outputs[nodeId]?.images;
        if (imgs && imgs.length) return imgs[0]; // {filename, subfolder, type}
      }
    }
  }
  throw new Error(`timeout waiting for ${promptId}`);
}

async function downloadImage(imgInfo, destPath) {
  const q = new URLSearchParams({ filename: imgInfo.filename, subfolder: imgInfo.subfolder || "", type: imgInfo.type || "output" });
  const res = await api(`/view?${q.toString()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`downloaded too small (${buf.length}B)`);
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) throw new Error("not a valid PNG");
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

function selectTargets() {
  let list = CHARACTERS.slice().sort((a, b) => a.num - b.num);
  const onlyArg = argOf("--only", null);
  if (onlyArg) {
    const nums = onlyArg.split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    list = list.filter((c) => nums.includes(c.num));
  } else {
    const from = parseInt(argOf("--from", "0"), 10);
    const to = parseInt(argOf("--to", "999"), 10);
    list = list.filter((c) => c.num >= from && c.num <= to);
  }
  return list;
}

async function generateOne(c, attempt, altSeed, suffix = "") {
  const { workflow, seed } = buildWorkflow(c, altSeed);
  const promptId = await queuePrompt(workflow);
  const imgInfo = await waitForResult(promptId);
  const dest = path.join(OUT_DIR, c.file.replace(/\.png$/i, `${SUFFIX_ARG}${suffix}.png`));
  const bytes = await downloadImage(imgInfo, dest);
  if (bytes < 50 * 1024) throw new Error(`output suspiciously small: ${bytes}B`);
  return { bytes, seed };
}

// ---------- main ----------
async function main() {
  if (process.argv.includes("--dump-json")) { console.log(JSON.stringify(CHARACTERS)); return; }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const targets = selectTargets();
  console.log(`Server: ${SERVER} | model: ${MODEL} | ${WIDTH}x${HEIGHT} | steps=${STEPS} cfg=${CFG}`);
  console.log(`Targets: ${targets.length}`);

  try {
    const info = await api("/system_stats");
    const stats = await info.json();
    const dev = stats.devices?.[0];
    console.log(`ComfyUI OK | GPU: ${dev?.name ?? "?"} | VRAM free: ${Math.round((dev?.vram_free ?? 0) / 1048576)}MB`);
  } catch (e) {
    console.error(`FATAL: cannot reach ComfyUI at ${SERVER}: ${e.message}`);
    process.exit(2);
  }

  let ok = 0, fail = 0;
  const failures = [];
  const t0 = Date.now();

  const jobs = [];
  for (const c of targets) for (let v = 0; v < VARIANTS; v++) jobs.push({ c, v });
  for (let i = 0; i < jobs.length; i++) {
    const { c, v } = jobs[i];
    const suffix = VARIANTS > 1 ? `_v${v + 1}` : "";
    const baseSeed = v === 0 ? undefined : (hashSeed(c.id) + v * 104729) % 2147483647;
    const label = `[${i + 1}/${jobs.length}] ${c.file}${suffix} (${c.id})`;
    const s0 = Date.now();
    process.stdout.write(`${label} ... `);
    try {
      const { bytes, seed } = await generateOne(c, 1, baseSeed, suffix);
      ok++;
      console.log(`OK ${(bytes / 1024).toFixed(1)}KB seed=${seed} (${((Date.now() - s0) / 1000).toFixed(1)}s)`);
    } catch (e1) {
      process.stdout.write(`retry (${e1.message.slice(0, 120)}) ... `);
      try {
        const altSeed = ((baseSeed ?? hashSeed(c.id)) + 77777) % 2147483647;
        const { bytes, seed } = await generateOne(c, 2, altSeed, suffix);
        ok++;
        console.log(`OK(retry) ${(bytes / 1024).toFixed(1)}KB seed=${seed} (${((Date.now() - s0) / 1000).toFixed(1)}s)`);
      } catch (e2) {
        fail++;
        failures.push({ file: c.file, id: c.id, reason: e2.message });
        console.log(`FAIL (${e2.message})`);
      }
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log("\n========== SUMMARY ==========");
  console.log(`OK: ${ok} / FAIL: ${fail} / total: ${targets.length} | ${elapsed}s`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f.file} (${f.id}): ${f.reason}`);
  }

  // final validation pass over written files
  console.log("\nValidation (>50KB PNG required):");
  for (const c of targets.sort((a, b) => a.num - b.num)) {
    const p = path.join(OUT_DIR, c.file);
    if (!fs.existsSync(p)) { console.log(`  MISSING ${c.file}`); continue; }
    const st = fs.statSync(p);
    const head = Buffer.alloc(4);
    const fd = fs.openSync(p, "r");
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    const flag = isPng && st.size > 50 * 1024 ? "PASS" : "CHECK";
    console.log(`  ${flag} ${c.file} ${(st.size / 1024).toFixed(1)}KB`);
  }
}

main().catch((e) => {
  console.error("UNEXPECTED ERROR:", e);
  process.exit(1);
});
