"""GPT(Codex CLI 내장 image_gen)로 4컷 생성 -> raw/cutN_raw.png -> make.py comp 합성.

사용: python gen_gpt.py        (codex 로그인 필요, API 키·건별 과금 없음)
codex 샌드박스는 작업 폴더로 이미지를 못 옮기므로 read-only 로 돌리고
$CODEX_HOME/generated_images/<thread_id>/ 에서 생성 순서대로 회수한다.
"""
import datetime, glob, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make

MODEL = os.environ.get("CODEX_MODEL", "gpt-5.6-sol")
STYLE = make.STYLE.replace("Leave the top-left corner", "Portrait 4:5 framing. Leave the top-left corner")


def prompt():
    lines = [f"Image {c['n']}: {c['en']}" for c in make.CUTS]
    return ("Use your built-in image_gen tool to generate exactly 4 portrait images (size 1024x1536), "
            "one image_gen call per image, strictly in the order listed. Do not write any files and do not run scripts; "
            "just generate the images and stop. Apply this SHARED STYLE to every image: " + STYLE + "\n\n" + "\n".join(lines) +
            "\n\nDo not ask questions.")


def main():
    home = os.environ.get("CODEX_HOME")
    if not home:
        sys.exit("CODEX_HOME 미설정")
    codex = shutil.which("codex.cmd") or shutil.which("codex")
    t0 = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    p = subprocess.run([codex, "exec", "--json", "-m", MODEL, "-s", "read-only", "--skip-git-repo-check",
                        "-c", 'windows.sandbox="unelevated"', "-C", HERE, "-"],
                       input=prompt(), capture_output=True, text=True, encoding="utf-8", timeout=1800)
    os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
    with open(os.path.join(HERE, "raw", "codex_session.jsonl"), "w", encoding="utf-8", newline="") as f:
        f.write(p.stdout)
    tid = next(json.loads(l)["thread_id"] for l in p.stdout.splitlines() if '"thread.started"' in l)
    pngs = sorted(glob.glob(os.path.join(home, "generated_images", tid, "*.png")), key=os.path.getmtime)
    print("thread", tid, "images", len(pngs))
    runs = []
    for c, src in zip(make.CUTS, pngs):
        dst = os.path.join(HERE, "raw", "cut%d_raw.png" % c["n"])
        shutil.copy2(src, dst)
        runs.append(dict(cut=c["n"], source=src, prompt=c["en"] + " " + STYLE))
    make.write(os.path.join(HERE, "생성기록.json"), json.dumps(dict(
        service="OpenAI ChatGPT (Codex CLI 내장 image_gen)", model=MODEL, thread_id=tid, started=t0,
        finished=datetime.datetime.now().astimezone().isoformat(timespec="seconds"), runs=runs), ensure_ascii=False, indent=2) + "\n")
    if len(pngs) >= len(make.CUTS):
        make.comp()
    else:
        print("부족:", len(pngs), p.stderr[-2000:])


if __name__ == "__main__":
    main()
