"""Codex image_gen(gpt-image)로 참조 포트레이트 기반 전신 캐릭터 시트 생성.
사용: python tools/art/gen-fullbody-codex.py [--only 5,6] [--batch 5]
- 참조: public/assets/characters/portraits/hero_XXX.png (1024px 채택본)
- 출력: art/gen/fullbody/hero_XXX.png (이미 있으면 건너뜀)
- codex exec는 반드시 순차 실행(샌드박스 계정 공유 문제).
"""
import json, subprocess, sys, os, time, pathlib, shutil
CODEX = shutil.which("codex") or shutil.which("codex.cmd") or "codex"
ROOT = pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
chars = json.loads(subprocess.check_output(["node", "tools/portraits/generate-portraits.mjs", "--dump-json"], text=True, encoding="utf-8"))
only = None; batch = 5
a = sys.argv[1:]
if "--only" in a: only = {int(x) for x in a[a.index("--only")+1].split(",")}
if "--batch" in a: batch = int(a[a.index("--batch")+1])
todo = [c for c in chars if (only is None or c["num"] in only) and not (ROOT/"art/gen/fullbody"/c["file"]).exists()]
print(f"todo {len(todo)}")
STYLE = ("premium anime gacha-game full-body character illustration (splash-art quality, Blue Archive x NIKKE hybrid), "
         "single character standing, front three-quarter view, whole body from head to feet visible, looking at viewer, "
         "HIGHLY DETAILED: intricate outfit and armor construction, fabric folds, metallic reflections, ornaments, weapon detail, "
         "rich cel-shading with soft gradients and dramatic rim light, crisp clean lineart, sharp detailed face and eyes, "
         "high resolution, transparent background (PNG alpha), no text, no watermark, portrait orientation 1024x1536")
for i in range(0, len(todo), batch):
    grp = todo[i:i+batch]
    lines = [f"Use your built-in image_gen tool to generate {len(grp)} images (one image_gen call per image) and save each final PNG to the exact workspace path shown. "
             f"I attached {len(grp)} reference portraits in the same order as the images below; each image must depict EXACTLY the same character as its reference (same hair color/style, eye color, skin tone, scars, outfit, weapon). "
             f"SHARED STYLE for every image: {STYLE}. Call image_gen with quality set to the highest available (high), size 1024x1536, and background transparent. Do not ask questions. Generate all and save to those exact paths, then stop.", ""]
    refs = []
    for k, c in enumerate(grp, 1):
        ref = ROOT/"public/assets/characters/portraits"/c["file"]
        refs += ["-i", str(ref)]
        gender = "female" if c["gender"] == "female" else "male"
        weapon = c.get("weapon") or ""
        lines.append(f"Image {k} (reference #{k}) -> save to art/gen/fullbody/{c['file']} : {gender} {c['cls']}, {c['nameEn']}. Identity: {c['looks']}. {('Holding: ' + weapon + '. ') if weapon else ''}{'Mood: ' + c['mood'] + '. ' if c.get('mood') else ''}")
        lines.append("")
    prompt = "\n".join(lines)
    (ROOT/"art/gen/logs"/f"fullbody_batch_{i//batch+1}.prompt.txt").write_text(prompt, encoding="utf-8")
    cmd = [CODEX, "exec", "-m", "gpt-5.6-sol", "-s", "workspace-write", "--skip-git-repo-check",
           "-c", 'windows.sandbox="unelevated"', "-C", str(ROOT)] + refs + ["-"]
    t0 = time.time()
    print(f"batch {i//batch+1}: {[c['file'] for c in grp]}", flush=True)
    r = subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=1200)
    (ROOT/"art/gen/logs"/f"fullbody_batch_{i//batch+1}.log").write_text(r.stdout + "\n--- stderr ---\n" + r.stderr, encoding="utf-8")
    done = [c["file"] for c in grp if (ROOT/"art/gen/fullbody"/c["file"]).exists()]
    print(f"  -> {len(done)}/{len(grp)} saved in {time.time()-t0:.0f}s (exit {r.returncode})", flush=True)
print("ALL DONE")
