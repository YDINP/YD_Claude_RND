"""원본 양식(첨부2: 참가신청서·제안서·서약서가 한 파일) hwpx 를 구조 그대로 두고 칸만 채운다.
- zip 항목 순서·압축 방식 유지(mimetype 무압축 첫 항목)
- 바꾼 문단은 linesegarray 를 빼서 한글이 줄 배치를 다시 계산
- 글자/문단 모양은 기존 id 뒤에 추가(45~)
실행: python -I make_hwpx.py
"""
import re
import sys
import zipfile
from pathlib import Path
from xml.dom import minidom
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import ME, TITLE, SUBTITLE, FIELD_TEXT, APP_SUMMARY, ROWS, SOURCES  # noqa: E402

SRC = HERE / "원본" / "첨부2_양식.hwpx"
OUT = HERE / f"K-Petro 혁신아이디어 공모전_{ME['name']}_신청서·제안서·서약서.hwpx"

# 새 글자 모양 id: 복제 원본 id, 크기, 굵게
CH = {"n": (45, "23", 950, False), "b": (46, "23", 950, True), "src": (47, "38", 750, False),
      "h": (48, "23", 1000, True), "app": (49, "13", 1050, False)}
# 새 문단 모양 id: (intent, left, prev, lineSpacing, align)  — HwpUnitChar 기준 값(기본값은 ×2)
PA = {"bul": (50, -1000, 0, 60, 140, "JUSTIFY"), "sub": (51, -1000, 1000, 30, 140, "JUSTIFY"),
      "h": (52, 0, 0, 220, 140, "LEFT"), "src": (53, -700, 0, 0, 125, "LEFT"), "n": (54, 0, 0, 40, 140, "JUSTIFY")}


def patch_header(h):
    out = ""
    for k, (nid, base_id, size, bold) in CH.items():
        base = re.search(rf'<hh:charPr id="{base_id}".*?</hh:charPr>', h, re.S).group(0)
        x = re.sub(r'^<hh:charPr id="\d+" height="\d+" textColor="[^"]+"',
                   f'<hh:charPr id="{nid}" height="{size}" textColor="{"#333333" if k == "src" else "#000000"}"', base)
        x = x.replace("<hh:bold/>", "")
        if bold:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
        out += x
    h = h.replace("</hh:charProperties>", out + "</hh:charProperties>")
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1)) + len(CH)}"', h)

    base = re.search(r'<hh:paraPr id="36".*?</hh:paraPr>', h, re.S).group(0)
    out = ""
    for k, (nid, ind, left, prev, ls, al) in PA.items():
        x = base.replace('id="36"', f'id="{nid}"', 1).replace('horizontal="JUSTIFY"', f'horizontal="{al}"')
        case, default = x.split("<hp:default>")

        def setv(t, mul):
            t = re.sub(r'<hc:intent value="-?\d+"', f'<hc:intent value="{ind * mul}"', t)
            t = re.sub(r'<hc:left value="-?\d+"', f'<hc:left value="{left * mul}"', t)
            t = re.sub(r'<hc:prev value="-?\d+"', f'<hc:prev value="{prev * mul}"', t)
            t = re.sub(r'<hh:lineSpacing type="PERCENT" value="\d+"', f'<hh:lineSpacing type="PERCENT" value="{ls}"', t)
            return t
        x = setv(case, 1) + "<hp:default>" + setv(default, 2)
        out += x
    h = h.replace("</hh:paraProperties>", out + "</hh:paraProperties>")
    h = re.sub(r'<hh:paraProperties itemCnt="(\d+)"', lambda m: f'<hh:paraProperties itemCnt="{int(m.group(1)) + len(PA)}"', h)
    return h


def runs(text, base="n", bold="b"):
    out = ""
    for x in re.split(r"(\*\*.*?\*\*)", text):
        if not x:
            continue
        st, t = (bold, x[2:-2]) if x.startswith("**") else (base, x)
        out += f'<hp:run charPrIDRef="{CH[st][0]}"><hp:t>{escape(t)}</hp:t></hp:run>'
    return out


def para(text, pp, base="n", bold="b"):
    return (f'<hp:p id="2147483648" paraPrIDRef="{PA[pp][0]}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
            f'{runs(text, base, bold)}</hp:p>')


def block(kind, text):
    if kind == "h":
        return para("■ " + text, "h", "h", "h")
    if kind == "b":
        return para("◦ " + text, "bul")
    if kind == "s":
        return para("- " + text, "sub")
    if kind == "src":
        return para(text, "src", "src", "src")
    return para(text, "n")


def tables(s):
    return [m.start() for m in re.finditer(r"<hp:tbl ", s)]


def set_cell(s, tbl_start, col, row, inner):
    m = re.compile(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>').search(s, tbl_start)
    a = s.rfind("<hp:tc ", 0, m.start())
    sub_a = s.find("<hp:subList", a)
    sub_open_end = s.find(">", sub_a) + 1
    sub_b = s.find("</hp:subList>", sub_open_end)
    return s[:sub_open_end] + inner + s[sub_b:]


def replace_text_in_cell(s, tbl_start, col, row, old, new):
    m = re.compile(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>').search(s, tbl_start)
    a = s.rfind("<hp:tc ", 0, m.start())
    seg = s[a:m.start()]
    assert old in seg, (col, row, old)
    seg = seg.replace(old, new, 1)
    seg = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", seg, flags=re.S)
    return s[:a] + seg + s[m.start():]


def build_section(s):
    # 표 순서: 0 신청서제목, 1 신청서, 2 제안서제목, 3 제안서, 4 서약서제목, 5 서약서, 6 서약서 안 상자
    # 뒤쪽 표부터 고쳐야 앞쪽 오프셋이 유지된다.
    T = tables(s)
    # 서약서: 아이디어명, 날짜·서명
    s = replace_text_in_cell(s, T[5], 1, 0, "ㆍ아이디어 명칭", TITLE)
    # 제안서 칸
    T = tables(s)
    rows = {
        0: para(TITLE, "n", "b", "b") + para(SUBTITLE, "n"),
        1: para(FIELD_TEXT, "n"),
    }
    for i, (_, blocks) in enumerate(ROWS):
        if blocks:
            rows[i] = "".join(block(k, t) for k, t in blocks)
    rows[5] += para("출처", "h", "src", "src") + "".join(block("src", f"{n}. {x}") for n, x in enumerate(SOURCES, 1))
    for r in sorted(rows, reverse=True):
        s = set_cell(s, tables(s)[3], 1, r, rows[r])
    # 신청서 칸 (뒤에서부터)
    t1 = lambda: tables(s)[1]
    s = replace_text_in_cell(s, t1(), 0, 11, "□ 동의함", "■ 동의함")
    s = replace_text_in_cell(s, t1(), 1, 7, "□ 아니오", "■ 아니오")
    s = set_cell(s, t1(), 1, 6, "".join(para("◦ " + x, "bul", "app", "app") for x in APP_SUMMARY))
    s = replace_text_in_cell(s, t1(), 7, 5, "□ AI·데이터 혁신", "■ AI·데이터 혁신")
    s = set_cell(s, t1(), 1, 4, para(TITLE, "n", "b", "b"))
    s = replace_text_in_cell(s, t1(), 6, 3, "@", ME["email"])
    s = replace_text_in_cell(s, t1(), 2, 3, "    -", ME["phone"])
    s = replace_text_in_cell(s, t1(), 6, 2, "ex) 0000. 00. 00.", ME["birth"])
    s = set_cell(s, t1(), 2, 2, para(ME["name"], "n"))
    s = replace_text_in_cell(s, t1(), 1, 1, "□ 개인", "■ 개인")
    # 날짜·신청인(신청서·서약서 공통 문구)
    date_old, sign_old = "2026년       월       일", "신 청 인 :              (서명 또는 날인)"
    assert s.count(date_old) == 2 and s.count(sign_old) == 2
    s = s.replace(date_old, f"{ME['y']}년  {ME['m']}월  {ME['d']}일")
    s = s.replace(sign_old, f"신 청 인 :  {ME['name']}      (서명 또는 날인)")
    return s


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def main():
    zin = zipfile.ZipFile(SRC)
    sec = build_section(zin.read("Contents/section0.xml").decode("utf-8"))
    hdr = patch_header(zin.read("Contents/header.xml").decode("utf-8"))
    for x in (sec, hdr):
        minidom.parseString(x.encode("utf-8"))
    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = sec.encode("utf-8")
            elif info.filename == "Contents/header.xml":
                data = hdr.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(sec)[:1000].encode("utf-8")
            zout.writestr(info, data, compress_type=info.compress_type)
    print("written", OUT.name, OUT.stat().st_size)


if __name__ == "__main__":
    main()
