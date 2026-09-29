"""Resident-loop roster: list which loops should be running, show which are alive, restart the dead ones.

23회차 복기 §3-20: 계정 전환 때 상주 스크립트 ~20 개가 한꺼번에 죽었고 일부만 되살렸다.
그래서 상주 목록을 파일로 둔다 - state/{run}_loops.json  {"이름": ["scripts/x.py", "--arg", ...]}.

    python scripts/loops.py --run run24                 # 살아 있나 (이름 · PID)
    python scripts/loops.py --run run24 --start         # 죽은 것만 띄운다 (로그: --logdir/<이름>.log)
    python scripts/loops.py --run run24 --add jevloop scripts/jevloop.py --run run24
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import runsite  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, ".."))
PATH = runsite.path("loops")
LOGDIR = os.environ.get("AI_LOOP_LOGS", os.path.join(ROOT, "state", "loops"))


def roster() -> dict:
    try:
        return json.load(open(PATH, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def procs() -> list:
    """[(pid, 명령줄)] - 파이썬 프로세스만."""
    out = subprocess.run(["powershell", "-NoProfile", "-Command",
                          "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
                          "ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    rows = []
    for line in out.splitlines():
        if "\t" in line:
            pid, cmd = line.split("\t", 1)
            rows.append((int(pid), cmd.replace("\\", "/")))
    return rows


def alive(args: list, ps: list) -> list:
    script = args[0].replace("\\", "/")
    tail = " ".join(args[1:])
    return [pid for pid, cmd in ps if script in cmd and tail in cmd and "loops.py" not in cmd]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", action="store_true")
    ap.add_argument("--add", nargs=argparse.REMAINDER, help="이름 스크립트 인자...")
    ap.add_argument("--drop", default="")
    ap.add_argument("--logdir", default=LOGDIR)
    a = ap.parse_args()
    r = roster()
    if a.add:
        r[a.add[0]] = a.add[1:]
    if a.drop:
        r.pop(a.drop, None)
    if a.add or a.drop:
        json.dump(r, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ps = procs()
    os.makedirs(a.logdir, exist_ok=True)
    for name, args in r.items():
        pids = alive(args, ps)
        if not pids and a.start:
            log = open(os.path.join(a.logdir, f"{name}.log"), "a", encoding="utf-8")
            env = dict(os.environ, PYTHONIOENCODING="utf-8", AI_RUN=runsite.RUN)
            p = subprocess.Popen([sys.executable, "-u", *args], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, env=env,
                                 creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                                 | getattr(subprocess, "DETACHED_PROCESS", 0))
            pids = [p.pid]
            print(f"  {name:<16} 띄움 PID {p.pid}")
        else:
            print(f"  {name:<16} {'PID ' + ','.join(map(str, pids)) if pids else '죽음'}")
    print(f"{len(r)} 개 · {PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
