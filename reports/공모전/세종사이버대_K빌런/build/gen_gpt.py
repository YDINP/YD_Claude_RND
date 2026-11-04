"""Codex CLI 내장 image_gen 으로 시안 생성 -> raw/ 로 회수.
사용: python gen_gpt.py prompts.json  (prompts.json = [{"id":"A","en":"..."}...])
"""
import datetime, glob, json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("CODEX_MODEL", "gpt-5.6-sol")

def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    tag = sys.argv[2] if len(sys.argv) > 2 else "r1"
    style = spec["style"]; items = spec["images"]
    lines = [f"Image {i+1}: {it['en']}" for i, it in enumerate(items)]
    prompt = ("Use your built-in image_gen tool to generate exactly %d portrait images (size 1024x1536), "
              "one image_gen call per image, strictly in the order listed. Do not write any files and do not run scripts; "
              "just generate the images and stop. Apply this SHARED STYLE to every image: %s\n\n%s\n\nDo not ask questions."
              % (len(items), style, "\n".join(lines)))
    home = os.environ["CODEX_HOME"]
    codex = shutil.which("codex.cmd") or shutil.which("codex")
    t0 = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    p = subprocess.run([codex, "exec", "--json", "-m", MODEL, "-s", "read-only", "--skip-git-repo-check",
                        "-c", 'windows.sandbox="unelevated"', "-C", HERE, "-"],
                       input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=1800)
    raw = os.path.join(HERE, "raw"); os.makedirs(raw, exist_ok=True)
    open(os.path.join(raw, f"codex_{tag}.jsonl"), "w", encoding="utf-8", newline="").write(p.stdout)
    tid = next(json.loads(l)["thread_id"] for l in p.stdout.splitlines() if '"thread.started"' in l)
    pngs = sorted(glob.glob(os.path.join(home, "generated_images", tid, "*.png")), key=os.path.getmtime)
    print("thread", tid, "images", len(pngs))
    rec = []
    for it, src in zip(items, pngs):
        dst = os.path.join(raw, f"{tag}_{it['id']}.png"); shutil.copy2(src, dst)
        rec.append(dict(id=it["id"], file=dst, source=src, prompt=it["en"] + " " + style))
    log = os.path.join(HERE, "생성기록.json")
    allr = json.load(open(log, encoding="utf-8")) if os.path.exists(log) else []
    allr.append(dict(service="OpenAI ChatGPT (Codex CLI 내장 image_gen)", model=MODEL, thread_id=tid, tag=tag,
                     started=t0, finished=datetime.datetime.now().astimezone().isoformat(timespec="seconds"), runs=rec))
    open(log, "w", encoding="utf-8", newline="").write(json.dumps(allr, ensure_ascii=False, indent=2) + "\n")
    if len(pngs) < len(items): print("부족", p.stderr[-2000:])

if __name__ == "__main__":
    main()
