"""원본 제출서식 hwpx(서식1·2)를 구조 그대로 두고 칸만 채운 hwpx를 만든다. 원본은 데이터로만 읽는다."""
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from content import ME, TASK, TITLE, SUMMARY, BODY, SOURCES

HERE = Path(__file__).parent
SRC = HERE / "원본" / "★(제출서식) 정책 아이디어 제안서 및 개인정보활용동의서.hwpx"
OUT = HERE / "박용진_제주시 정책 공모전_제안서·동의서.hwpx"
NORMAL, BOLD = "25", "24"   # 원본 header 의 13pt 보통/굵게


def para(p_open, cid, text):
    t = f"<hp:t>{escape(text)}</hp:t>" if text else ""
    return f'{p_open}<hp:run charPrIDRef="{cid}">{t}</hp:run></hp:p>'


def cell_span(s, col, row):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', s)
    a = s.rfind("<hp:tc ", 0, m.start())
    sub_a = s.find("<hp:subList", a)
    sub_open_end = s.find(">", sub_a) + 1
    sub_b = s.find("</hp:subList>", sub_open_end)
    return sub_a, sub_open_end, sub_b


def set_cell(s, col, row, items, valign=None):
    """items: [(charPr, text)] — 첫 문단의 문단 모양을 따른다."""
    sub_a, sub_open_end, sub_b = cell_span(s, col, row)
    body = s[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    new = "".join(para(first, c, t) for c, t in items)
    sub_open = s[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return s[:sub_a] + sub_open + new + s[sub_b:]


def rep(s, old, new):
    assert old in s, old
    return s.replace(old, new, 1)


def body_items():
    out = []
    for kind, v in BODY:
        if kind == "h":
            out += [(NORMAL, ""), (BOLD, v)]
        elif kind == "p":
            out.append((NORMAL, " " + v))
        elif kind == "li":
            out.append((NORMAL, " ○ " + v))
        elif kind == "table":
            head, *rows = v
            out.append((NORMAL, "   [" + " | ".join(head) + "]"))
            out += [(NORMAL, "   · " + " | ".join(r)) for r in rows]
        elif kind == "box":
            out.append((BOLD, " " + v[0]))
            out += [(NORMAL, "   " + x) for x in v[1:]]
    out += [(NORMAL, ""), (BOLD, "근거 자료")]
    out += [(NORMAL, f" {i}. {s}") for i, s in enumerate(SOURCES, 1)]
    return out


def fill(s):
    m = ME
    s = set_cell(s, 1, 1, [(NORMAL, m["name"])])
    s = set_cell(s, 2, 1, [(NORMAL, f"({m['sex']})")])
    s = set_cell(s, 5, 1, [(NORMAL, m["birth"])])
    s = set_cell(s, 1, 2, [(NORMAL, " " + m["addr"])])
    s = set_cell(s, 1, 3, [(NORMAL, f" (휴대전화) {m['phone']}")])
    s = set_cell(s, 4, 3, [(NORMAL, f" (이 메 일) {m['email']}")])
    s = set_cell(s, 1, 5, [(NORMAL, " " + TASK)])
    s = set_cell(s, 1, 6, [(BOLD, " " + TITLE)])
    s = set_cell(s, 1, 7, [(NORMAL, " " + x) for x in SUMMARY])
    s = set_cell(s, 1, 8, body_items(), valign="TOP")
    # 서명란
    s = rep(s, "<hp:t>2026년      월      일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>")
    s = rep(s, "제안자:       　　　　　　(서명)", f"제안자:   {m['name']}   (서명)")
    # 서식2: 동의 체크·날짜·성명
    s = rep(s, "[ ] 동의함 [ ] 동의하지 않음", "[■] 동의함 [ ] 동의하지 않음")
    s = rep(s, "[ ] 동의함 [ ] 동의하지 않음", "[■] 동의함 [ ] 동의하지 않음")
    s = rep(s, "<hp:t>2026년      월      일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>")
    s = rep(s, "성명:         (서명 또는 인)", f"성명:   {m['name']}   (서명 또는 인)")
    # 서식2는 새 쪽에서
    i = s.find("&lt;서식 2&gt;")
    a = s.rfind("<hp:p ", 0, i)
    s = s[:a] + s[a:i].replace('pageBreak="0"', 'pageBreak="1"', 1) + s[i:]
    return s


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def main():
    zin = zipfile.ZipFile(SRC)
    s = zin.read("Contents/section0.xml").decode("utf-8")
    s = fill(s)
    s = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", s, flags=re.S)  # 줄 배치는 한글이 다시 계산
    __import__("xml.dom.minidom").dom.minidom.parseString(s.encode("utf-8"))
    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = s.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(s)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
