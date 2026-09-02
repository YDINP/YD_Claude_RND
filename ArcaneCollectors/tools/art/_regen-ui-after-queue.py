"""regen-list.json 항목을 Codex로 재생성 — 전신 재큐(REQUEUE DONE) 이후 실행."""
import time, pathlib, subprocess, os, json, shutil
ROOT = pathlib.Path(__file__).resolve().parents[2]; os.chdir(ROOT)
CODEX = shutil.which("codex") or shutil.which("codex.cmd") or "codex"
LOG = ROOT/"art/gen/logs/fullbody_requeue.out.log"
while not (LOG.exists() and "REQUEUE DONE" in LOG.read_text(encoding="utf-8", errors="ignore")): time.sleep(30)
spec = {a["id"]: a for a in json.load(open("tools/art/asset-spec.json", encoding="utf-8"))["assets"]}
try: regen = json.load(open("tools/art/regen-list.json", encoding="utf-8"))
except Exception: regen = []
ids = [r["id"] if isinstance(r, dict) else r for r in (regen if isinstance(regen, list) else regen.get("items", []))]
ids = [i for i in ids if i in spec]
print("regen", ids, flush=True)
if ids:
    lines = [f"Use your built-in image_gen tool to generate {len(ids)} images (one image_gen call per image), each with background set to transparent (PNG alpha), quality high, and save each PNG to the exact workspace path shown. UI assets for a mobile gacha RPG (dark indigo + cyan + gold). Do not ask questions. Generate all and save, then stop.", ""]
    for k, i in enumerate(ids, 1):
        a = spec[i]; w, h = a["width"], a["height"]
        extra = " Make the composition EXACTLY this wide-strip aspect ratio; no letterboxing." if w / max(h, 1) >= 4 else ""
        pos = a["positive"].replace("isolated on a pure flat chroma green background #00FF00", "isolated on a fully TRANSPARENT background (PNG alpha)").replace("#00FF00", "")
        lines += [f"Image {k} -> save to art/gen/assets/{i}.png (aspect {w}x{h}){extra}: {pos} AVOID: {a.get('negative','')}", ""]
    prompt = "\n".join(lines)
    (ROOT/"art/gen/logs/regen_ui.prompt.txt").write_text(prompt, encoding="utf-8")
    r = subprocess.run([CODEX, "exec", "-m", "gpt-5.6-sol", "-s", "workspace-write", "--skip-git-repo-check", "-c", 'windows.sandbox="unelevated"', "-C", str(ROOT), "-"], input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=1500)
    (ROOT/"art/gen/logs/regen_ui.log").write_text(r.stdout + "\n--- stderr ---\n" + r.stderr, encoding="utf-8")
print("REGEN UI DONE", flush=True)
