"""지정서식 (양식) 제출서류.hwpx 의 표 셀만 채운 hwpx 를 만든다. 원본은 데이터로만 읽는다(zip+XML 문자열 처리)."""
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape
import xml.dom.minidom

from content import *

HERE = Path(__file__).parent
SRC = HERE / "원본" / "(양식) 제출서류.hwpx"
OUT = HERE / "박용진_AI혁신아이디어_제안서(번호인식 오답노트).hwpx"
BODY, BOLD = 34, 35  # 새로 추가하는 10pt 본문 / 10pt 굵게


def add_charprs(h):
    def clone(src_id, new_id, height):
        m = re.search(rf'<hh:charPr id="{src_id}" .*?</hh:charPr>', h, flags=re.S).group()
        m = m.replace(f'id="{src_id}"', f'id="{new_id}"', 1)
        return re.sub(r'height="\d+"', f'height="{height}"', m, count=1)
    extra = clone(18, BODY, 1000) + clone(23, BOLD, 1000)
    n = int(re.search(r'<hh:charProperties itemCnt="(\d+)"', h).group(1))
    h = h.replace(f'<hh:charProperties itemCnt="{n}">', f'<hh:charProperties itemCnt="{n + 2}">', 1)
    i = h.find("</hh:charProperties>")
    return h[:i] + extra + h[i:]


def para(p_open, runs):
    """runs: [(charPrID, text)]"""
    r = "".join(f'<hp:run charPrIDRef="{c}"><hp:t>{escape(t)}</hp:t></hp:run>' for c, t in runs)
    return f"{p_open}{r}</hp:p>"


def cell_span(tbl, row, col):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    a = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", a)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    return sub_a, sub_open_end, sub_b


def set_cell(tbl, row, col, paras, valign=None, p_open=None):
    """paras: [[(charPrID, text), ...], ...] 문단 목록. 첫 문단의 문단 모양을 따른다."""
    sub_a, so, sub_b = cell_span(tbl, row, col)
    body = tbl[so:sub_b]
    first = p_open or re.search(r"<hp:p [^>]*>", body).group()
    new = "".join(para(first, runs) for runs in paras)
    sub_open = tbl[sub_a:so]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return tbl[:sub_a] + sub_open + new + tbl[sub_b:]


def rep(seg, old, new):
    assert old in seg, old
    return seg.replace(old, new, 1)


def body_lines(lines):
    return [[(BODY, t)] for t in lines]


def table0(t):
    t = re.sub(r'pageBreak="NONE"', 'pageBreak="CELL"', t, count=1)
    t = set_cell(t, 1, 5, [[(12, ME["date_dot"])]])
    t = set_cell(t, 2, 1, [[(11, TITLE)]])
    t = rep(t, f"☐ {CATEGORY}", f"■ {CATEGORY}")
    t = set_cell(t, 5, 1, body_lines(SUMMARY), valign="TOP")
    t = set_cell(t, 6, 1, body_lines(BACKGROUND), valign="TOP")
    # 제안내용: 원본 '○ ' 소제목 문단 모양(paraPr 24)을 따르고, 작성 안내(회색) 4줄은 지운다
    p24 = '<hp:p id="0" paraPrIDRef="24" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
    ps = [[(12, "○ 현황 및 문제점")]]
    for h, ls in STATUS:
        ps += [[(BOLD, h)]] + body_lines(ls)
    ps += [[(12, "")], [(12, "○ 아이디어(개선방법 등) 상세")], [(BOLD, DETAIL_LEAD)],
           [(BODY, "흐름: 카메라 판독값 → 관리원 수정 → 오답노트 → 원인 분류 AI → 카메라 처방전(기동처리반 순회) → 전환 순서표(A·B·C)")]]
    ps += [[(BOLD, f"· {h} — "), (BODY, d)] for h, d in DETAIL]
    ps += [[(BOLD, "공사의 역할")]] + [[(BOLD, f"· {a}: "), (BODY, b)] for a, b in ROLES]
    ps += [[(BOLD, "첫 달부터 시작하는 시범 일정")]] + [[(BOLD, f"· {a}: "), (BODY, b)] for a, b in PILOT]
    ps += [[(BODY, f"· {DIFF}")], [(12, "")], [(12, "○ 소요예산")]]
    ps += [[(BODY, f"· {a}: {b} ({c})")] for a, b, c in BUDGET]
    ps += [[(BODY, f"· {BUDGET_TOTAL}")]]
    t = set_cell(t, 7, 1, ps, valign="TOP", p_open=p24)
    eff = body_lines(EFFECTS) + [[(BOLD, "근거 자료")]] + [[(BODY, f"{i}. {s}")] for i, s in enumerate(SOURCES, 1)] + [[(BODY, AI_NOTE)]]
    t = set_cell(t, 8, 1, eff, valign="TOP")
    return t


def table1(t):
    t = set_cell(t, 1, 1, [[(18, ME["name"])]])
    t = rep(t, "□ O (직원) □ X", "□ O (직원) ■ X")
    t = set_cell(t, 2, 1, [[(12, ME["phone"])]])
    t = set_cell(t, 2, 5, [[(12, ME["email"])]])
    t = rep(t, "【□ 동의함", "【■ 동의함")
    t = rep(t, "2026년     월     일", f"2026년  {ME['m']}월  {ME['d']}일")
    t = set_cell(t, 7, 3, [[(32, ME["name"])]])
    return t


def text_of(x):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q, flags=re.S)) for q in re.findall(r"<hp:p .*?</hp:p>", x, flags=re.S))


def main():
    zin = zipfile.ZipFile(SRC)
    s = zin.read("Contents/section0.xml").decode("utf-8")
    tbls = list(re.finditer(r"<hp:tbl .*?</hp:tbl>", s, flags=re.S))
    (a0, b0), (a1, b1) = tbls[0].span(), tbls[1].span()
    s = s[:a0] + table0(s[a0:b0]) + s[b0:a1] + table1(s[a1:b1]) + s[b1:]
    s = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", s, flags=re.S)  # 한글이 줄 배치를 다시 계산
    h = add_charprs(zin.read("Contents/header.xml").decode("utf-8"))
    for x in (s, h):
        xml.dom.minidom.parseString(x.encode("utf-8"))
    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = s.encode("utf-8")
            elif info.filename == "Contents/header.xml":
                data = h.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(s)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    print(OUT.name, OUT.stat().st_size)


if __name__ == "__main__":
    main()
