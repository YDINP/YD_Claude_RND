"""Codex CLI 내장 image_gen(gpt-image)으로 시안 생성 -> raw/ 로 회수.

사용: python gen_gpt.py <tag>   (prompts.json 의 해당 tag 시안들을 생성)
"""
import datetime, glob, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("CODEX_MODEL", "gpt-5.6-sol")


def main():
    tag = sys.argv[1]
    P = json.load(open(os.path.join(HERE, "prompts.json"), encoding="utf-8"))
    items = P[tag]
    home = os.environ.get("CODEX_HOME") or os.path.expanduser("~/.codex")
    lines = [f"Image {i+1}: {it}" for i, it in enumerate(items)]
    prompt = ("Use your built-in image_gen tool to generate exactly %d portrait images (size 1024x1536), "
              "one image_gen call per image, strictly in the order listed. Do not write any files and do not run scripts; "
              "just generate the images and stop. Do not ask questions.\n\nSHARED STYLE: %s\n\n%s"
              % (len(items), P["style"], "\n".join(lines)))
    codex = shutil.which("codex.cmd") or shutil.which("codex")
    t0 = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    p = subprocess.run([codex, "exec", "--json", "-m", MODEL, "-s", "read-only", "--skip-git-repo-check",
                        "-c", 'windows.sandbox="unelevated"', "-C", HERE, "-"],
                       input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=2400)
    os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
    open(os.path.join(HERE, "raw", f"codex_{tag}.jsonl"), "w", encoding="utf-8").write(p.stdout + "\n" + p.stderr[-3000:])
    tid = next(json.loads(l)["thread_id"] for l in p.stdout.splitlines() if '"thread.started"' in l)
    pngs = sorted(glob.glob(os.path.join(home, "generated_images", tid, "*.png")), key=os.path.getmtime)
    print("thread", tid, "images", len(pngs))
    rec_path = os.path.join(HERE, "생성기록.json")
    rec = json.load(open(rec_path, encoding="utf-8")) if os.path.exists(rec_path) else []
    for i, src in enumerate(pngs):
        dst = os.path.join(HERE, "raw", f"{tag}_{i+1}.png")
        shutil.copy2(src, dst)
        rec.append(dict(tag=tag, n=i + 1, file=dst, source=src, thread_id=tid, model=MODEL, started=t0,
                        prompt=items[i] if i < len(items) else "", style=P["style"]))
    json.dump(rec, open(rec_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if len(pngs) < len(items):
        print("부족", p.stderr[-2000:])


if __name__ == "__main__":
    main()
