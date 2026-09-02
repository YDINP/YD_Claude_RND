"""asset-spec.json의 알파 필요 항목(frame/button/logo/icon)을 Codex image_gen으로 생성(투명 배경).
전신 배치(fullbody_run.out.log에 ALL DONE)가 끝날 때까지 대기 후 순차 실행. 출력 art/gen/assets/<id>.png (있으면 건너뜀)."""
import json, subprocess, os, time, pathlib, shutil, sys, re
ROOT = pathlib.Path(__file__).resolve().parents[2]; os.chdir(ROOT)
CODEX = shutil.which("codex") or shutil.which("codex.cmd") or "codex"
LOG = ROOT/"art/gen/logs/fullbody_run.out.log"
if "--nowait" not in sys.argv:
    while not (LOG.exists() and "ALL DONE" in LOG.read_text(encoding="utf-8", errors="ignore")):
        time.sleep(30)
spec = json.load(open("tools/art/asset-spec.json", encoding="utf-8"))
cats = {"frame", "button", "logo", "icon"}
if "--cat" in sys.argv: cats = set(sys.argv[sys.argv.index("--cat")+1].split(","))
items = [a for a in spec["assets"] if a["category"] in cats and not (ROOT/"art/gen/assets"/f"{a['id']}.png").exists()]
print(f"todo {len(items)}", flush=True)
def clean(p):  # 크로마키 지시 제거 → 투명 배경 지시로 대체
    p = re.sub(r"isolated on a pure flat chroma green background #00FF00[^,\.]*", "isolated on a fully TRANSPARENT background (PNG alpha)", p)
    return p.replace("#00FF00", "").replace("chroma green", "transparent")
B = 4
for i in range(0, len(items), B):
    grp = items[i:i+B]
    lines = [f"Use your built-in image_gen tool to generate {len(grp)} images (one image_gen call per image), each with background set to transparent (PNG alpha), quality high, and save each final PNG to the exact workspace path shown. These are UI assets for a mobile gacha RPG (Blue Archive x NIKKE hybrid, dark indigo + cyan + gold). Do not ask questions. Generate all and save to those exact paths, then stop.", ""]
    for k, a in enumerate(grp, 1):
        size = f"{a['width']}x{a['height']}"
        lines.append(f"Image {k} -> save to art/gen/assets/{a['id']}.png (aspect {size}): {clean(a['positive'])} AVOID: {a.get('negative','')}")
        lines.append("")
    prompt = "\n".join(lines)
    (ROOT/"art/gen/logs"/f"assets_batch_{i//B+1}.prompt.txt").write_text(prompt, encoding="utf-8")
    t0 = time.time(); print(f"batch {i//B+1}: {[a['id'] for a in grp]}", flush=True)
    r = subprocess.run([CODEX, "exec", "-m", "gpt-5.6-sol", "-s", "workspace-write", "--skip-git-repo-check", "-c", 'windows.sandbox="unelevated"', "-C", str(ROOT), "-"], input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=1500)
    (ROOT/"art/gen/logs"/f"assets_batch_{i//B+1}.log").write_text(r.stdout + "\n--- stderr ---\n" + r.stderr, encoding="utf-8")
    done = [a['id'] for a in grp if (ROOT/"art/gen/assets"/f"{a['id']}.png").exists()]
    print(f"  -> {len(done)}/{len(grp)} in {time.time()-t0:.0f}s (exit {r.returncode})", flush=True)
print("ASSETS DONE", flush=True)
