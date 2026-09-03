"""전신 시트(art/gen/fullbody/hero_XXX.png)를 참조로 같은 캐릭터의 흉상 초상화를 Codex로 재생성 → 초상화와 전신 일치.
적 아트 배치(enemies_run.out.log: ENEMIES DONE) 이후 자동 실행. 출력 art/gen/portraits_v2/hero_XXX.png"""
import json, subprocess, os, time, pathlib, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]; os.chdir(ROOT)
CODEX = shutil.which("codex") or shutil.which("codex.cmd") or "codex"
LOG = ROOT/"art/gen/logs/enemies_run.out.log"
if "--nowait" not in sys.argv:
    while not (LOG.exists() and "ENEMIES DONE" in LOG.read_text(encoding="utf-8", errors="ignore")): time.sleep(60)
chars = json.loads(subprocess.check_output(["node", "tools/portraits/generate-portraits.mjs", "--dump-json"], text=True, encoding="utf-8"))
todo = [c for c in chars if (ROOT/"art/gen/fullbody"/c["file"]).exists() and not (ROOT/"art/gen/portraits_v2"/c["file"]).exists()]
print(f"todo {len(todo)}", flush=True)
STYLE = ("premium anime gacha-game character PORTRAIT (bust shot, head and shoulders to chest, face focus, looking at viewer), "
         "EXACTLY the same character as the attached full-body reference: identical face, hair color/style, eye color, skin tone, outfit and accessories; "
         "same art style, rich cel-shading, rim light, detailed eyes, painted background matching the character's theme (soft bokeh), no text, no frame, square 1024x1024")
B = 4
for i in range(0, len(todo), B):
    grp = todo[i:i+B]; refs = []
    lines = [f"Use your built-in image_gen tool to generate {len(grp)} images (one image_gen call per image), quality high, size 1024x1024, and save each PNG to the exact workspace path shown. I attached {len(grp)} full-body reference images in the same order. SHARED STYLE: {STYLE}. Do not ask questions. Generate all and save, then stop.", ""]
    for k, c in enumerate(grp, 1):
        refs += ["-i", str(ROOT/"art/gen/fullbody"/c["file"])]
        lines += [f"Image {k} (reference #{k}) -> save to art/gen/portraits_v2/{c['file']} : {c['nameEn']} — bust portrait of the attached character. Identity: {c['looks']}", ""]
    prompt = "\n".join(lines)
    (ROOT/"art/gen/logs"/f"portraits_v2_batch_{i//B+1}.prompt.txt").write_text(prompt, encoding="utf-8")
    t0 = time.time(); print(f"batch {i//B+1}: {[c['file'] for c in grp]}", flush=True)
    r = subprocess.run([CODEX, "exec", "-m", "gpt-5.6-sol", "-s", "workspace-write", "--skip-git-repo-check", "-c", 'windows.sandbox="unelevated"', "-C", str(ROOT)] + refs + ["-"], input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=1500)
    (ROOT/"art/gen/logs"/f"portraits_v2_batch_{i//B+1}.log").write_text(r.stdout + "\n--- stderr ---\n" + r.stderr, encoding="utf-8")
    done = [c["file"] for c in grp if (ROOT/"art/gen/portraits_v2"/c["file"]).exists()]
    print(f"  -> {len(done)}/{len(grp)} in {time.time()-t0:.0f}s (exit {r.returncode})", flush=True)
print("PORTRAITS V2 DONE", flush=True)
