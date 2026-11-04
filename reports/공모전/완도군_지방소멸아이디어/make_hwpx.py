"""원본 공고 hwpx(붙임 서식 포함)에서 붙임1(제안서)·붙임1-1(동의서)만 남겨 내용을 채운 hwpx 2개를 만든다.
원본은 데이터로만 읽는다(zip+XML 문자열 처리). mimetype 은 첫 항목·무압축으로 보존."""
import re
import xml.dom.minidom
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from content import ME, TITLE, TITLE_SHORT, PROBLEMS, PLAN, EFFECTS, COMPARE, SOURCES

HERE = Path(__file__).parent
SRC = HERE / "원본" / "완도군_지방소멸대응아이디어공모_공고.hwpx"
OUT_PROP = HERE / f"박용진-완도 {TITLE_SHORT}_제안서.hwpx"
OUT_AGREE = HERE / "박용진-개인정보 수집·이용 동의서.hwpx"
PREVIEW = {OUT_PROP: HERE / "_build" / "prv_prop.png", OUT_AGREE: HERE / "_build" / "prv_agree.png"}
BODY_P = '<hp:p id="0" paraPrIDRef="31" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
BODY_C = "37"


def top_paragraphs(s):
    depth, tops, start = 0, [], 0
    for m in re.finditer(r"<hp:p[ >]|</hp:p>", s):
        if m.group().startswith("</"):
            depth -= 1
            if depth == 0:
                tops.append((start, m.end()))
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return tops


def find_top(s, tops, needle):
    for i, (a, b) in enumerate(tops):
        if needle in "".join(re.findall(r"<hp:t>([^<]*)</hp:t>", s[a:b])):
            return i
    raise KeyError(needle)


def make_para(p_open, char_id, text):
    return f'{p_open}<hp:run charPrIDRef="{char_id}"><hp:t>{escape(text)}</hp:t></hp:run></hp:p>'


def cell_bounds(tbl, row, col):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    a = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", a)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    return sub_open_end, sub_b


def set_cell(tbl, row, col, lines):
    a, b = cell_bounds(tbl, row, col)
    body = tbl[a:b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    cid = re.search(r'<hp:run charPrIDRef="(\d+)"', body).group(1)
    return tbl[:a] + "".join(make_para(first, cid, t) for t in lines) + tbl[b:]


def append_cell(tbl, row, col, lines):
    """라벨 문단은 두고 그 뒤에 본문 문단을 붙인다."""
    a, b = cell_bounds(tbl, row, col)
    return tbl[:b] + "".join(make_para(BODY_P, BODY_C, t) for t in lines) + tbl[b:]


def rep(seg, old, new):
    assert old in seg, old
    return seg.replace(old, new, 1)


def drop_rows(tbl, rows):
    trs = list(re.finditer(r"<hp:tr>.*?</hp:tr>", tbl, flags=re.S))
    for i in sorted(rows, reverse=True):
        tbl = tbl[:trs[i].start()] + tbl[trs[i].end():]
    n = int(re.search(r'rowCnt="(\d+)"', tbl).group(1))
    return re.sub(r'rowCnt="\d+"', f'rowCnt="{n - len(rows)}"', tbl, count=1)


def fill_p1(p):
    m = ME
    p = set_cell(p, 2, 1, [TITLE])
    p = rep(p, "<hp:t>[  ] 없음 [  ] 있음", "<hp:t>[√] 없음 [  ] 있음")
    p = set_cell(p, 5, 2, [m["name"]])
    p = set_cell(p, 6, 2, [m["birth"]])
    p = set_cell(p, 7, 2, ["100"])
    p = set_cell(p, 9, 1, ["해당 없음"])
    p = rep(p, "<hp:t>[  ] 공개 [  ] 비공개", "<hp:t>[√] 공개 [  ] 비공개")
    p = rep(p, "<hp:t>[  ] 전자우편</hp:t>", "<hp:t>[√] 전자우편</hp:t>")
    p = rep(p, "<hp:t>전자우편주소:</hp:t>", f"<hp:t>전자우편주소: {m['email']}</hp:t>")
    p = rep(p, "<hp:t>2026년      월      일</hp:t>", f"<hp:t>{m['y']}년   {m['m']}월   {m['d']}일</hp:t>")
    p = rep(p, "<hp:t>주제안자</hp:t>", f"<hp:t>주제안자   {m['name']}</hp:t>")
    return p


def fill_p2(p):
    p = append_cell(p, 1, 0, PROBLEMS)
    p = append_cell(p, 2, 0, PLAN)
    p = append_cell(p, 3, 0, EFFECTS)
    tbl_a = p.find("<hp:tbl ")
    tbl_b = p.rfind("</hp:tbl>") + len("</hp:tbl>")
    tbl = drop_rows(p[tbl_a:tbl_b], [4, 5, 6, 7])  # 작성방법 안내와 빈 줄 제거
    tbl = re.sub(r'(<hp:tbl [^>]*?)pageBreak="\w+"', r'\1pageBreak="TABLE"', tbl, count=1)
    return p[:tbl_a] + tbl + p[tbl_b:]


def fill_agree(p):
    m = ME
    p = rep(p, "<hp:t>□ 동의함   □ 동의하지 않음</hp:t>", "<hp:t>■ 동의함   □ 동의하지 않음</hp:t>")
    p = rep(p, "<hp:t>2026년    월    일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>")
    p = rep(p, "<hp:t>성명              (서명 또는 인)</hp:t>", f"<hp:t>성명   {m['name']}   (서명 또는 인)</hp:t>")
    return p


def ref_paras():
    big = '<hp:p id="0" paraPrIDRef="31" styleIDRef="0" pageBreak="{pb}" columnBreak="0" merged="0">'
    out = [make_para(big.format(pb=1), "39", "참고자료"),
           make_para(big.format(pb=0), "39", "1. 완도에 사는 20·30대 — 거의 둘 중 한 명이 외국인")]
    out += [make_para(BODY_P, BODY_C, t) for t in [
        "· 20대: 주민등록 2,617명 / 외국인 주민 1,759명 (외국인 비중 40%)",
        "· 30대: 주민등록 2,685명 / 외국인 주민 2,997명 (53%)",
        "· 20·30대 합계: 주민등록 5,302명 / 외국인 주민 4,756명 (47%)",
        "  (주민등록 2026.10., 외국인 주민 행정안전부 외국인주민 현황 — 기준 시점이 달라 대략 비교)"]]
    out.append(make_para(big.format(pb=0), "39", "2. 기존 사업과 무엇이 다른가"))
    out += [make_para(BODY_P, BODY_C, f"· {a}: {b} → {c}") for a, b, c in COMPARE]
    out.append(make_para(big.format(pb=0), "39", "3. 근거 자료"))
    out += [make_para(BODY_P, BODY_C, f"{i}. {t}  {u}") for i, (t, u) in enumerate(SOURCES, 1)]
    out.append(make_para(BODY_P, BODY_C, "※ 효과 수치는 가정에 따른 추정입니다. 자료조사와 초안 작성에 생성형 AI(Claude)를 활용했고, 내용 판단과 최종 작성은 제안자 본인이 했습니다."))
    return "".join(out)


def text_of(x):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", x, flags=re.S))


def build(out, section_xml):
    zin = zipfile.ZipFile(SRC)
    with zipfile.ZipFile(out, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = section_xml.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(section_xml)[:1024].encode("utf-8")
            elif info.filename == "Preview/PrvImage.png" and PREVIEW[out].exists():
                data = PREVIEW[out].read_bytes()
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    print(out.name, out.stat().st_size)


def main():
    s = zipfile.ZipFile(SRC).read("Contents/section0.xml").decode("utf-8")
    tops = top_paragraphs(s)
    head, tail = s[:tops[0][0]], s[tops[-1][1]:]
    p0 = s[tops[0][0]:tops[0][1]]
    p0_clean = p0[:p0.find("</hp:run>") + len("</hp:run>")] + "</hp:p>"  # 구역 정의만 남김
    seg = lambda i: s[tops[i][0]:tops[i][1]]
    nopb = lambda x: x.replace('pageBreak="1"', 'pageBreak="0"', 1)

    i_h1 = find_top(s, tops, "붙임1 제안서")
    i_f1 = find_top(s, tops, "(제1쪽)")
    i_f2 = find_top(s, tops, "(제2쪽)")
    i_h2 = find_top(s, tops, "붙임1-1 개인정보")
    i_ag = i_h2 + 1

    prop = head + p0_clean + nopb(seg(i_h1)) + fill_p1(seg(i_f1)) + fill_p2(seg(i_f2)) + ref_paras() + tail
    agree = head + p0_clean + nopb(seg(i_h2)) + fill_agree(seg(i_ag)) + tail
    for out, x in ((OUT_PROP, prop), (OUT_AGREE, agree)):
        x = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", x, flags=re.S)  # 줄 배치 캐시 제거 → 한글이 다시 계산
        xml.dom.minidom.parseString(x.encode("utf-8"))
        build(out, x)


if __name__ == "__main__":
    main()
