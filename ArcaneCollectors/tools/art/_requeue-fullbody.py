import time, pathlib, subprocess, os
ROOT = pathlib.Path(__file__).resolve().parents[2]; os.chdir(ROOT)
LOG = ROOT/"art/gen/logs/assets_run.out.log"
while not (LOG.exists() and "ASSETS DONE" in LOG.read_text(encoding="utf-8", errors="ignore")): time.sleep(30)
subprocess.run(["python", "tools/art/gen-fullbody-codex.py", "--only", "7,8,9,10", "--batch", "4"])
print("REQUEUE DONE", flush=True)
