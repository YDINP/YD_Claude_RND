"""codex image_gen 으로 배경 일러스트 생성 → generated_images/<thread_id> 에서 회수.
실행: python gen.py <이름> <prompt.txt>"""
import json, os, shutil, subprocess, sys, glob
from pathlib import Path
name, pf = sys.argv[1], sys.argv[2]
prompt = Path(pf).read_text(encoding="utf-8")
codex = shutil.which("codex.cmd") or shutil.which("codex")
p = subprocess.run([codex, "exec", "--json", "-s", "read-only", "--skip-git-repo-check", "-"], input=prompt.encode("utf-8"), capture_output=True, timeout=900)
tid = None
for line in p.stdout.decode("utf-8", "replace").splitlines():
    try: ev = json.loads(line)
    except Exception: continue
    if ev.get("type") == "thread.started": tid = ev.get("thread_id")
home = os.environ.get("CODEX_HOME") or str(Path.home() / ".codex")
fs = sorted(glob.glob(os.path.join(home, "generated_images", tid or "__none__", "*"))) if tid else []
out = Path(__file__).parent / "gen"
for i, f in enumerate(fs):
    shutil.copy(f, out / f"{name}_{i}{Path(f).suffix}")
print("thread", tid, "files", len(fs), "rc", p.returncode)
if not fs: print(p.stdout.decode("utf-8","replace")[-1500:], p.stderr.decode("utf-8","replace")[-800:])
