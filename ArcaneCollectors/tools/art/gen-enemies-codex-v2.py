"""적 유닛 아트를 Codex image_gen으로 재생성 — 캐릭터(전신/초상화)와 같은 화풍으로 통일.
기존 ComfyUI판(art/gen/enemies)은 화풍·채도가 캐릭터와 어긋나 교체한다.
출력 art/gen/enemies_codex/<id>.png (있으면 스킵 → 재개 가능). 순차 실행 필수."""
import json, subprocess, os, time, pathlib, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]; os.chdir(ROOT)
CODEX = shutil.which("codex") or shutil.which("codex.cmd") or "codex"
OUT = ROOT / "art/gen/enemies_codex"; OUT.mkdir(parents=True, exist_ok=True)
LOGS = ROOT / "art/gen/logs"; LOGS.mkdir(parents=True, exist_ok=True)

stages = json.load(open("src/data/stages.json", encoding="utf-8"))
tower = json.load(open("src/data/tower.json", encoding="utf-8"))
enemies = {e["id"]: e for e in json.load(open("src/data/enemies.json", encoding="utf-8"))["enemies"]}
ids = set()
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("enemies", "enemyIds") and isinstance(v, list):
                for x in v: ids.add(x["id"] if isinstance(x, dict) else x)
            walk(v)
    elif isinstance(o, list):
        for x in o: walk(x)
walk(stages)
for f in tower["floors"]:
    for x in f["enemies"]: ids.add(x["id"])

todo = [enemies[i] for i in sorted(ids) if i in enemies and not (OUT / f"{i}.png").exists()]
print(f"todo {len(todo)}", flush=True)

STYLE = ("premium anime gacha-game character illustration (Blue Archive x NIKKE hybrid), "
         "clean crisp lineart, soft cel-shading with gentle gradients, bright readable colors on a dark-fantasy palette, "
         "gentle rim light, detailed but not gritty, bust/upper-body facing viewer, single character centered, "
         "transparent background, no text, no watermark, no frame")
TYPE_HINT = {"boss": "imposing boss with a larger commanding presence and dramatic aura",
             "elite": "elite variant with ornate armor and refined detail",
             "normal": "standard enemy unit"}
B = 3
for i in range(0, len(todo), B):
    grp = todo[i:i+B]
    lines = [f"Use your built-in image_gen tool to generate {len(grp)} images (one image_gen call per image), each with background transparent (PNG alpha), quality high, size 1024x1024, and save each PNG to the exact workspace path shown.",
             "",
             f"SHARED STYLE — match this exactly so it looks like the same artist drew the player characters: {STYLE}.",
             ""]
    for k, e in enumerate(grp, 1):
        t = e.get("type", "normal"); mood = e.get("mood") or ""
        lines.append(f"Image {k} -> save to art/gen/enemies_codex/{e['id']}.png : "
                     f"{e.get('nameEn') or e['id']} ({e.get('name','')}). {TYPE_HINT.get(t, TYPE_HINT['normal'])}."
                     + (f" Mood: {mood}." if mood else ""))
        lines.append("")
    lines.append("Do not ask questions. Generate all and save them to those exact paths, then stop.")
    prompt = "\n".join(lines)
    (LOGS / f"enemies_codex_b{i//B+1}.prompt.txt").write_text(prompt, encoding="utf-8")
    t0 = time.time(); print(f"batch {i//B+1}: {[e['id'] for e in grp]}", flush=True)
    try:
        r = subprocess.run([CODEX, "exec", "-m", "gpt-5.6-sol", "-s", "workspace-write", "--skip-git-repo-check",
                            "-c", 'windows.sandbox="unelevated"', "-C", str(ROOT), "-"],
                           input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=1500)
        (LOGS / f"enemies_codex_b{i//B+1}.log").write_text((r.stdout or "") + "\n--- stderr ---\n" + (r.stderr or ""), encoding="utf-8")
        done = [e["id"] for e in grp if (OUT / f"{e['id']}.png").exists()]
        print(f"  -> {len(done)}/{len(grp)} in {time.time()-t0:.0f}s", flush=True)
        if "usage limit" in ((r.stdout or "") + (r.stderr or "")).lower():
            print("USAGE LIMIT - stopping, rerun later to resume", flush=True); break
    except subprocess.TimeoutExpired:
        print("  -> timeout", flush=True)
print("ENEMIES CODEX DONE", flush=True)
