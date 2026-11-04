"""공고문.hwpx의 붙임(제안서 양식, section1)만 남겨 내용을 채운 hwpx를 만든다.
원본 파일은 데이터로만 읽는다(zip + XML 문자열 처리)."""
import re
import zipfile
from pathlib import Path
from xml.dom import minidom
from xml.sax.saxutils import escape

from content import ME, TITLE, OVERVIEW, PROBLEMS, PLAN, SOURCES

HERE = Path(__file__).parent
SRC = HERE / "원본" / "(공고문) 2026년 시민 아이디어 공모전.hwpx"
OUT = HERE / "박용진_강릉시민아이디어_제안서_재난한장.hwpx"
NORMAL, BOLD = "53", "57"


def make_para(p_open, char_id, text):
    return f'{p_open}<hp:run charPrIDRef="{char_id}"><hp:t>{escape(text)}</hp:t></hp:run></hp:p>'


def table_span(s, n):
    """n번째 최상위 <hp:tbl> 구간 (중첩 표 포함)."""
    starts = [m.start() for m in re.finditer(r"<hp:tbl ", s)]
    depth, idx, out = 0, -1, []
    for m in re.finditer(r"<hp:tbl |</hp:tbl>", s):
        if m.group() == "<hp:tbl ":
            if depth == 0:
                a = m.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append((a, m.end()))
    return out[n]


def set_cell(tbl, row, col, items, valign=None):
    """items: [(char_id, text)] 로 (row, col) 셀 문단 교체."""
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    a = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", a)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    body = tbl[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    new = "".join(make_para(first, cid, t) for cid, t in items)
    sub_open = tbl[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return tbl[:sub_a] + sub_open + new + tbl[sub_b:]


def flat(items):
    """content 의 블록 목록을 셀 문단 [(char_id, text)] 로."""
    out = []
    for kind, val in items:
        if kind == "h":
            out.append((BOLD, val))
        elif kind == "p":
            out.append((NORMAL, val))
        elif kind == "t":
            out.append((BOLD, "  [재난 한 장 — 예시 서식]"))
            out += [(NORMAL, f"   · {a}: {b}") for a, b in val]
        elif kind == "s":
            out += [(NORMAL, f"   · {a} | 신호: {b} → {c}") for a, b, c in val]
        elif kind == "c":
            out += [(NORMAL, f"   · {a}: (지금) {b} → (이 제안) {c}") for a, b, c in val]
    return out


def replace_once(s, old, new, count=1):
    assert s.count(old) >= count, old
    return s.replace(old, new, count)


def fill(s):
    m = ME
    # 1쪽 표(두 번째 최상위 표)
    a, b = table_span(s, 1)
    t = s[a:b]
    t = set_cell(t, 4, 2, [(BOLD, TITLE)])
    t = replace_once(t, "【  】없음", "【 √ 】없음")
    t = set_cell(t, 6, 2, [(NORMAL, m["name"])])
    t = set_cell(t, 6, 6, [(NORMAL, m["birth"])])
    t = set_cell(t, 7, 2, [(NORMAL, f"{m['phone']}  (전자우편: {m['email']})")])
    t = set_cell(t, 8, 2, [(NORMAL, f"{m['addr']} / {m['job']}")])
    t = set_cell(t, 9, 3, [(NORMAL, "해당 없음")])
    t = replace_once(t, '<hp:t>년   <hp:tab width="1500" leader="0" type="1"/>월<hp:tab width="3000" leader="0" type="1"/>일</hp:t>',
                     f'<hp:t>{m["y"]}년   {m["m"]}월   {m["d"]}일</hp:t>')
    t = t.replace("<hp:t>제안자 성명            (서명 또는 인)</hp:t>",
                  f"<hp:t>제안자 성명   {m['name']}   (서명 또는 인)</hp:t>")
    t = replace_once(t, "(동의함 □   동의하지 않음 □）", "(동의함 ■   동의하지 않음 □）")
    t = replace_once(t, "<hp:t>년       월       일</hp:t>", f"<hp:t>{m['y']}년    {m['m']}월    {m['d']}일</hp:t>")
    s = s[:a] + t + s[b:]
    # 2쪽 표(네 번째 최상위 표 = 마지막)
    a, b = table_span(s, -1)
    t = s[a:b]
    plan = flat(PLAN) + [(BOLD, "사. 근거 자료")] + [(NORMAL, f"[{i}] {x}  {u}") for i, (x, u) in enumerate(SOURCES, 1)]
    plan.append((NORMAL, "※ 자료 조사와 초안 작성에 생성형 AI(Claude)를 활용했으며, 내용 확인과 최종 판단은 제안자가 했습니다."))
    t = set_cell(t, 1, 1, [(BOLD, TITLE)])
    t = set_cell(t, 2, 1, [(NORMAL, x) for x in OVERVIEW], valign="TOP")
    t = set_cell(t, 3, 1, flat(PROBLEMS), valign="TOP")
    t = set_cell(t, 4, 1, plan, valign="TOP")
    # 긴 셀이 쪽을 넘어 나뉘도록
    t = re.sub(r'(<hp:tbl [^>]*?)pageBreak="\w+"', r'\1pageBreak="CELL"', t, count=1)
    s = s[:a] + t + s[b:]
    return s


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def main():
    zin = zipfile.ZipFile(SRC)
    sec = fill(zin.read("Contents/section1.xml").decode("utf-8"))
    minidom.parseString(sec.encode("utf-8"))  # 정합성 확인
    hpf = zin.read("Contents/content.hpf").decode("utf-8")
    hpf = hpf.replace('<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/>', "")
    hpf = hpf.replace('<opf:itemref idref="section1" linear="yes"/>', "")
    header = zin.read("Contents/header.xml").decode("utf-8").replace('secCnt="2"', 'secCnt="1"')
    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            name = info.filename
            if name == "Contents/section1.xml":
                continue
            data = zin.read(name)
            if name == "Contents/section0.xml":
                data = sec.encode("utf-8")
            elif name == "Contents/content.hpf":
                data = hpf.encode("utf-8")
            elif name == "Contents/header.xml":
                data = header.encode("utf-8")
            elif name == "Preview/PrvText.txt":
                data = text_of(sec)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(name, date_time=info.date_time), data, compress_type=ct)
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
