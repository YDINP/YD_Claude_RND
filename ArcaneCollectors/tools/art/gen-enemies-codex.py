"""Codex image_gen으로 적 유닛 아트 생성(스테이지+탑 참조 84종 + regen-list). 출력 art/gen/enemies/<id>.png (있으면 스킵). 순차 실행."""
import json, subprocess, os, time, pathlib, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]; os.chdir(ROOT)
CODEX = shutil.which("codex") or shutil.which("codex.cmd") or "codex"
stages = json.load(open("src/data/stages.json", encoding="utf-8")); tower = json.load(open("src/data/tower.json", encoding="utf-8"))
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
todo = [enemies[i] for i in sorted(ids) if i in enemies and not (ROOT/"art/gen/enemies"/f"{i}.png").exists()]
only = None
if "--only" in sys.argv: only = set(sys.argv[sys.argv.index("--only")+1].split(",")); todo = [e for e in todo if e["id"] in only]
print(f"todo {len(todo)}", flush=True)
TYPE_HINT = {"boss": "imposing boss, larger silhouette, dramatic aura", "elite": "elite variant, ornate armor details", "normal": "standard enemy unit"}
STYLE = ("anime dark-fantasy game enemy unit illustration matching a Blue Archive x NIKKE hybrid hero art style, bust/upper-body portrait facing viewer, "
         "menacing but readable silhouette, crisp lineart, rich cel-shading, rim light, high detail, transparent background (PNG alpha), no text, no watermark, square 1024x1024")
B = 4
for i in range(0, len(todo), B):
    grp = todo[i:i+B]
    lines = [f"Use your built-in image_gen tool to generate {len(grp)} images (one image_gen call per image), background transparent, quality high, size 1024x1024, and save each PNG to the exact workspace path shown. SHARED STYLE: {STYLE}. Do not ask questions. Generate all and save, then stop.", ""]
    for k, e in enumerate(grp, 1):
        t = e.get("type", "normal"); mood = e.get("mood") or ""
        desc = e.get("description") or e.get("desc") or ""
        lines += [f"Image {k} -> save to art/gen/enemies/{e['id']}.png : {e.get('nameEn') or e['id']} ({e.get('name','')}). {TYPE_HINT.get(t, TYPE_HINT['normal'])}. Mood: {mood}. {desc}", ""]
    prompt = "\n".join(lines)
    (ROOT/"art/gen/logs"/f"enemies_batch_{i//B+1}.prompt.txt").write_text(prompt, encoding="utf-8")
    t0 = time.time(); print(f"batch {i//B+1}: {[e['id'] for e in grp]}", flush=True)
    r = subprocess.run([CODEX, "exec", "-m", "gpt-5.6-sol", "-s", "workspace-write", "--skip-git-repo-check", "-c", 'windows.sandbox="unelevated"', "-C", str(ROOT), "-"], input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=1500)
    (ROOT/"art/gen/logs"/f"enemies_batch_{i//B+1}.log").write_text(r.stdout + "\n--- stderr ---\n" + r.stderr, encoding="utf-8")
    done = [e["id"] for e in grp if (ROOT/"art/gen/enemies"/f"{e['id']}.png").exists()]
    print(f"  -> {len(done)}/{len(grp)} in {time.time()-t0:.0f}s (exit {r.returncode})", flush=True)
print("ENEMIES DONE", flush=True)
