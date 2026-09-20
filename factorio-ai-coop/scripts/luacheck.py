"""Before deploying: does every block close?

모드가 문법 하나로 죽으면 서버가 통째로 죽는다. 그런데 이 기계에는 lua 도
luac 도 없다 - 검사할 방법이 없어서 «눈으로 꼼꼼히» 보고 배포해 왔다.

문법 전부를 보는 것은 루아 파서를 새로 쓰는 일이다. 그런데 실제로 난
사고는 전부 «짝»이었다 - 괄호가 안 닫히거나 end 가 모자라거나.

    다 못 보는 것과 «아무것도 안 보는 것»은 다르다.

다만 이 셈은 절대값으로 읽으면 안 된다. `repeat..until` 처럼 여는 말에
end 가 안 붙는 것이 있어 정확히 0 이 되지 않는다. 그래서 «고치기 전
파일»과 같은 수인지를 본다 - 돌던 파일과 같은 만큼 어긋나면 이번 변경은
짝이 맞는 것이다.

    python scripts/luacheck.py mods/ai-bridge_0.3.0/belts.lua
    python scripts/luacheck.py --base HEAD mods/ai-bridge_0.3.0/belts.lua
"""
import argparse
import io
import os
import re
import subprocess
import sys

# repeat 는 until 로 닫힌다. end 를 세는 자리에 넣으면 안 된다.
KW_OPEN = re.compile(r"\b(function|if|for|while|do)\b")
KW_END = re.compile(r"\bend\b")
PAIRS = {"(": ")", "{": "}", "[": "]"}


def strip(src):
    """주석과 문자열을 지운다. 그 안의 괄호는 짝이 아니다."""
    out = []
    i, n = 0, len(src)
    while i < n:
        if src[i:i + 4] == "--[[":
            j = src.find("]]", i)
            i = n if j < 0 else j + 2
            continue
        if src[i:i + 2] == "--":
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src[i:i + 2] == "[[":
            j = src.find("]]", i)
            out.append('""')
            i = n if j < 0 else j + 2
            continue
        ch = src[i]
        if ch in "\"'":
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == ch or src[j] == "\n":
                    break
                j += 1
            out.append('""')
            i = j + 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def gap_of(body, label):
    """괄호가 온전한가, 그리고 end 가 몇 개 치우쳤나.

    괄호가 깨졌으면 None. 그쪽은 «얼마나»가 아니라 «어디»가 중요하다.
    """
    stack, line = [], 1
    for ch in body:
        if ch == "\n":
            line += 1
        elif ch in PAIRS:
            stack.append((ch, line))
        elif ch in PAIRS.values():
            if not stack or PAIRS[stack[-1][0]] != ch:
                print(f"  {label}:{line} 짝이 안 맞는 '{ch}'")
                return None
            stack.pop()
    if stack:
        ch, at = stack[-1]
        print(f"  {label}:{at} 안 닫힌 '{ch}'")
        return None

    opens = len(KW_OPEN.findall(body))
    # `do` 는 for/while/repeat 뒤에 한 번 더 세어지므로 그만큼 뺀다.
    dup = len(re.findall(r"\b(for|while|repeat)\b[^\n]*\bdo\b", body))
    return (opens - dup) - len(KW_END.findall(body))


def was(path, base):
    """git 의 그 판본. 없으면 None - 비교는 포기하고 절대값만 본다."""
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                          capture_output=True, text=True)
    if root.returncode != 0:
        return None
    top = root.stdout.strip()
    rel = os.path.relpath(os.path.abspath(path), top).replace(os.sep, "/")
    # 인코딩을 안 박으면 이 기계에서는 cp949 로 읽으려다 한글 주석에서
    # 터진다. 파일은 UTF-8 로 쓰고 있으므로 읽을 때도 그렇게 말해 준다.
    got = subprocess.run(["git", "show", f"{base}:{rel}"],
                         capture_output=True, text=True,
                         encoding="utf-8", errors="replace")
    return got.stdout if got.returncode == 0 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--base", default="HEAD",
                    help="무엇과 견줄 것인가. 기본은 HEAD")
    args = ap.parse_args()

    ok = True
    for path in args.files:
        now = gap_of(strip(io.open(path, encoding="utf-8").read()), path)
        if now is None:
            ok = False
            continue
        old_src = was(path, args.base)
        if old_src is None:
            print(f"  {path}: 괄호 온전, 치우침 {now:+d} (견줄 판본이 없다)")
            if now != 0:
                ok = False
            continue
        then = gap_of(strip(old_src), f"{args.base}:{path}")
        if then is None:
            print(f"  {path}: 괄호 온전, 치우침 {now:+d} "
                  f"(예전 판본이 깨져 있어 못 견준다)")
            continue
        if now == then:
            print(f"  {path}: 짝 맞음 (치우침 {now:+d}, 고치기 전과 같다)")
        else:
            print(f"  {path}: [!] 치우침이 {then:+d} 에서 {now:+d} 로 "
                  f"바뀌었다 - end 가 {abs(now - then)}개 "
                  f"{'모자란다' if now > then else '남는다'}")
            ok = False

    print("배포해도 된다" if ok else "배포 금지")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
