"""공고문.hwpx(붙임 서식 포함)에서 붙임1(신청서)·붙임2(동의서)만 남겨 내용을 채운 hwpx 2개를 만든다.
원본 공고 파일은 데이터로만 읽는다(zip+XML 문자열 처리)."""
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from content import ME, TITLE, FIELDS, OVERVIEW, PROBLEMS, PLAN, EFFECTS, ACTIONS, SOURCES, CALENDAR_TEXT, COMPARE

HERE = Path(__file__).parent
SRC = HERE / "원본_공고" / "공고문.hwpx"
OUT_PROP = HERE / "박용진-보령 겨울 바다 처방_제안서.hwpx"
OUT_AGREE = HERE / "박용진-개인정보 수집·이용 동의서.hwpx"
PREVIEW = {OUT_PROP: HERE / "_build" / "prv_prop.png", OUT_AGREE: HERE / "_build" / "prv_agree.png"}


def top_paragraphs(s):
    """section 최상위 <hp:p> 구간 목록 [(start, end)]."""
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
        if needle in s[a:b]:
            return i
    raise KeyError(needle)


def strip_ls(p):
    return re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", p, flags=re.S)


def make_para(p_open, char_id, text):
    return f'{p_open}<hp:run charPrIDRef="{char_id}"><hp:t>{escape(text)}</hp:t></hp:run></hp:p>'


def set_cell(tbl, row, col, lines, valign=None, char_id=None):
    """표(tbl) 안 (row, col) 셀의 문단을 lines 로 교체. 첫 문단의 문단·글자 모양을 따른다."""
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    a = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", a)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    body = tbl[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    cid = char_id or re.search(r'<hp:run charPrIDRef="(\d+)"', body).group(1)
    new = "".join(make_para(first, cid, t) for t in lines)
    sub_open = tbl[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return tbl[:sub_a] + sub_open + new + tbl[sub_b:]


def replace_text(seg, old, new):
    assert old in seg, old
    return seg.replace(old, new, 1)


def drop_rows(tbl, rows):
    trs = list(re.finditer(r"<hp:tr>.*?</hp:tr>", tbl, flags=re.S))
    for i in sorted(rows, reverse=True):
        t = trs[i]
        tbl = tbl[:t.start()] + tbl[t.end():]
    n = int(re.search(r'rowCnt="(\d+)"', tbl).group(1))
    return re.sub(r'rowCnt="\d+"', f'rowCnt="{n - len(rows)}"', tbl, count=1)


def fill_form1(p):
    m = ME
    p = set_cell(p, 3, 1, [TITLE])
    p = set_cell(p, 5, 3, [m["name"]])
    p = set_cell(p, 5, 9, [m["birth"]])
    p = set_cell(p, 6, 3, [m["addr"]])
    p = set_cell(p, 6, 9, [m["job"]])
    p = set_cell(p, 7, 3, ["100"])
    p = set_cell(p, 7, 9, [m["email"]])
    # 전화번호 셀: 두 번째 문단의 '(휴대 전화번호 : )' 를 채운다
    p = replace_text(p, "(휴대 전화번호 :              )", f"(휴대 전화번호 : {m['phone']})")
    p = set_cell(p, 8, 9, ["-"])
    p = replace_text(p, "<hp:t>(    년)</hp:t>", "<hp:t>해당 없음</hp:t>")
    p = replace_text(p, "<hp:t>년     월     일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>")
    p = replace_text(p, "<hp:t>제안자               </hp:t>", f"<hp:t>제안자   {m['name']}  </hp:t>")
    return p


def fill_form2(p):
    p = set_cell(p, 1, 1, [TITLE])
    for c, mark in enumerate(FIELDS, start=1):
        if mark:
            p = set_cell(p, 3, c, [mark])
    p = set_cell(p, 4, 1, OVERVIEW, valign="TOP")
    p = set_cell(p, 5, 1, PROBLEMS, valign="TOP")
    p = set_cell(p, 6, 1, PLAN, valign="TOP")
    p = set_cell(p, 7, 1, EFFECTS, valign="TOP")
    p = set_cell(p, 8, 1, ACTIONS)
    # 작성방법 안내(10·11행)는 지우고, 길어진 표가 쪽을 넘어 나뉘도록
    tbl_a = p.find("<hp:tbl ")
    tbl_b = p.rfind("</hp:tbl>") + len("</hp:tbl>")
    tbl = drop_rows(p[tbl_a:tbl_b], [10, 11])
    tbl = re.sub(r'(<hp:tbl [^>]*?)pageBreak="\w+"', r'\1pageBreak="TABLE"', tbl, count=1)
    p = p[:tbl_a] + tbl + p[tbl_b:]
    # 제2쪽은 새 쪽에서 시작
    return re.sub(r'pageBreak="0"', 'pageBreak="1"', p, count=1)


def fill_agree(p):
    m = ME
    p = replace_text(p, "□ 동의 □ 미동의", "■ 동의 □ 미동의")
    p = replace_text(p, "<hp:t>2026년     월     일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>")
    p = replace_text(p, "<hp:t>성명           </hp:t>", f"<hp:t>성명   {m['name']}   </hp:t>")
    return p


def ref_paras():
    """PDF '기타 참고자료' 쪽과 같은 내용(그림 대신 글)을 본문 문단으로."""
    big = '<hp:p id="0" paraPrIDRef="12" styleIDRef="0" pageBreak="{pb}" columnBreak="0" merged="0">'
    small = '<hp:p id="0" paraPrIDRef="41" styleIDRef="26" pageBreak="0" columnBreak="0" merged="0">'
    out = [make_para(big.format(pb=1), 28, "첨부  기타 참고자료"),
           make_para(big.format(pb=0), 28, "1. 핵심 — 보령 웰니스는 ‘관광 달력’에 묶여 있다")]
    out += [make_para(small, 55, t) for t in CALENDAR_TEXT]
    out.append(make_para(big.format(pb=0), 28, "2. 기존 사업과 무엇이 다른가"))
    out += [make_para(small, 55, f"· {a}: {b} → {c}") for a, b, c in COMPARE]
    out.append(make_para(big.format(pb=0), 28, "3. 근거 자료"))
    out += [make_para(small, 55, f"{i}. {t}  {u}") for i, (t, u) in enumerate(SOURCES, 1)]
    return "".join(out)


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


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
    print(out, out.stat().st_size)


def main():
    zin = zipfile.ZipFile(SRC)
    s = zin.read("Contents/section0.xml").decode("utf-8")
    tops = top_paragraphs(s)
    head = s[:tops[0][0]]
    tail = s[tops[-1][1]:]
    p0 = s[tops[0][0]:tops[0][1]]
    # 첫 문단: 구역 정의(secPr)+단 정의만 남기고 공고문 표는 버린다
    first_run_end = p0.find("</hp:run>") + len("</hp:run>")
    p0_clean = p0[:first_run_end] + "</hp:p>"

    i1 = find_top(s, tops, "붙임1")
    i_f1 = find_top(s, tops, "[별지 제1호서식]")
    i_f2 = find_top(s, tops, "(제2쪽)")
    i2 = find_top(s, tops, "붙임2")
    i_ag = find_top(s, tops, "개인정보 수집·이용 동의서 [필수]")
    seg = lambda i: s[tops[i][0]:tops[i][1]]

    prop = head + p0_clean + seg(i1) + fill_form1(seg(i_f1)) + fill_form2(seg(i_f2)) + ref_paras() + tail
    agree = head + p0_clean + seg(i2) + fill_agree(seg(i_ag)) + tail
    # 채운 문단은 줄 배치 캐시를 지워 한글이 다시 계산하게 한다
    prop = prop.replace("<hp:linesegarray></hp:linesegarray>", "")
    for out, xml in ((OUT_PROP, prop), (OUT_AGREE, agree)):
        __import__("xml.dom.minidom").dom.minidom.parseString(xml.encode("utf-8"))  # 정합성 확인
        build(out, xml)


if __name__ == "__main__":
    main()
