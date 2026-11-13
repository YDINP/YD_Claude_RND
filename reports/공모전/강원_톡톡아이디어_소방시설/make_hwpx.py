"""원본 지정서식 hwpx([붙임1~3])를 직접 채워 신청서([붙임1])·동의서([붙임2]) hwpx 두 개를 만든다.
- 원본 header/settings 등 구조 유지, mimetype 첫 항목 무압축, 나머지 압축 방식 유지
- 글자 모양 2개(굵게 11pt, 작은 9.5pt)·문단 모양 1개(소제목) 추가
- 새로 쓴 문단은 linesegarray 없이 → 한글이 줄 배치를 다시 계산
실행: python -I make_hwpx.py
"""
import re, sys, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import ME, TITLE, BG, MAIN, EFFECT  # noqa: E402

SRC = HERE / "원본" / "[붙임1~3] 제안 신청서, 개인정보수집동의서, 주제 개요서(게시용).hwpx"
OUT1 = HERE / "[붙임1] 제안신청서_박용진.hwpx"
OUT2 = HERE / "[붙임2] 개인정보수집동의서_박용진.hwpx"
PRV = {OUT1: HERE / "_build" / "app_p1.png", OUT2: HERE / "_build" / "con_p1.png"}

CB, CS, PH = 46, 47, 50  # 새 charPr(굵게), charPr(작게), paraPr(소제목)
CN, PB = 14, 25          # 기존 본문 charPr, 내어쓰기 paraPr


def patch_header(h):
    c14 = re.search(r'<hh:charPr id="14".*?</hh:charPr>', h, re.S).group(0)
    bold = c14.replace('id="14"', f'id="{CB}"').replace('<hh:underline', '<hh:bold/><hh:underline')
    small = c14.replace('id="14"', f'id="{CS}"').replace('height="1100"', 'height="950"').replace('textColor="#000000"', 'textColor="#333333"', 1)
    h = h.replace('</hh:charProperties>', bold + small + '</hh:charProperties>')
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1)) + 2}"', h)
    p25 = re.search(r'<hh:paraPr id="25".*?</hh:paraPr>', h, re.S).group(0)
    ph = p25.replace('id="25"', f'id="{PH}"')
    ph = re.sub(r'<hc:intent value="-?\d+"', '<hc:intent value="0"', ph)
    ph = re.sub(r'<hc:left value="\d+"', '<hc:left value="0"', ph)
    ph = re.sub(r'<hc:prev value="\d+"', '<hc:prev value="500"', ph)
    h = h.replace('</hh:paraProperties>', ph + '</hh:paraProperties>')
    h = re.sub(r'<hh:paraProperties itemCnt="(\d+)"', lambda m: f'<hh:paraProperties itemCnt="{int(m.group(1)) + 1}"', h)
    return h


def runs(text, base):
    out = []
    for i, seg in enumerate(text.split("**")):
        if not seg:
            continue
        cid = CB if (i % 2 == 1 or base == CB) else base
        out.append(f'<hp:run charPrIDRef="{cid}"><hp:t>{escape(seg)}</hp:t></hp:run>')
    return "".join(out)


def para(text, ppr=0, cpr=CN):
    return (f'<hp:p id="2147483648" paraPrIDRef="{ppr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
            f'{runs(text, cpr)}</hp:p>')


def block(items):
    xs = []
    for kind, text in items:
        if kind == "h":
            xs.append(para(text, PH, CB))
        elif kind == "s":
            xs.append(para(text, PB, CS))
        else:
            xs.append(para(text, PB, CN))
    return "".join(xs)


def top_level_paras(body):
    """section 루트의 <hp:p> 덩어리들을 순서대로 돌려준다(표 안 문단은 포함된 채)."""
    res, depth, start = [], 0, None
    for m in re.finditer(r'<hp:p[ >]|</hp:p>', body):
        if m.group(0).startswith('</'):
            depth -= 1
            if depth == 0:
                res.append(body[start:m.end()])
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return res


def fill_cell(tbl, col, row, inner, valign=None):
    """cellAddr(col,row) 셀의 subList 안 문단을 inner 로 바꾼다."""
    pat = re.compile(r'<hp:tc [^>]*>(?:(?!</hp:tc>).)*?<hp:cellAddr colAddr="%d" rowAddr="%d"/>.*?</hp:tc>' % (col, row), re.S)
    cells = [m for m in re.finditer(r'<hp:tc .*?</hp:tc>', tbl, re.S)]
    for m in cells:
        c = m.group(0)
        if f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>' in c:
            sub_open = re.search(r'<hp:subList [^>]*>', c).group(0)
            if valign:
                sub_open2 = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
            else:
                sub_open2 = sub_open
            new = re.sub(r'<hp:subList [^>]*>.*</hp:subList>', lambda _: sub_open2 + inner + '</hp:subList>', c, flags=re.S)
            return tbl[:m.start()] + new + tbl[m.end():]
    raise ValueError((col, row))


def build_app(paras):
    p0, t1 = paras[0], paras[1]
    t1 = t1.replace('pageBreak="NONE"', 'pageBreak="TABLE"', 1)
    t1 = fill_cell(t1, 1, 1, para(TITLE, 0, CB))
    t1 = fill_cell(t1, 2, 2, para(ME["name"], 17))
    t1 = fill_cell(t1, 4, 2, para(ME["birth"], 17))
    t1 = fill_cell(t1, 2, 3, para(ME["phone"], 17))
    t1 = fill_cell(t1, 4, 3, para(ME["email"], 17))
    t1 = fill_cell(t1, 1, 6, block(BG), "TOP")
    t1 = fill_cell(t1, 1, 7, block(MAIN), "TOP")
    t1 = fill_cell(t1, 1, 8, block(EFFECT), "TOP")
    return [p0, t1]


def build_consent(paras):
    p0 = paras[0].replace('<hp:t>[붙임1]</hp:t>', '<hp:t>[붙임2]</hp:t>')
    i2 = next(i for i, p in enumerate(paras) if '<hp:t>[붙임2]</hp:t>' in p)
    i3 = next(i for i, p in enumerate(paras) if '<hp:t>[붙임3]</hp:t>' in p)
    rest = paras[i2 + 1:i3]
    out = []
    for p in rest:
        p = p.replace('□ 동의함  □ 동의하지 않음', '■ 동의함  □ 동의하지 않음')
        p = p.replace('2026년    월    일', f'2026년  {ME["m"]}월  {ME["d"]}일')
        p = p.replace('동의인 :             (서명 또는 인)', f'동의인 :   {ME["name"]}   (서명 또는 인)')
        out.append(p)
    return [p0] + out


def write(out, parts, z, header, head_xml, prv_text):
    with zipfile.ZipFile(out, "w") as o:
        for info in z.infolist():
            data = z.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = (head_xml + "".join(parts) + "</hs:sec>").encode("utf-8")
            elif info.filename == "Contents/header.xml":
                data = header.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = prv_text.encode("utf-16-le") if data[:2] != b"\xff\xfe" and b"\x00" in data[:8] else prv_text.encode("utf-8")
            elif info.filename == "Preview/PrvImage.png" and PRV[out].exists():
                data = PRV[out].read_bytes()
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            o.writestr(zi, data)
    print(out, out.stat().st_size)


def main():
    z = zipfile.ZipFile(SRC)
    sec = z.read("Contents/section0.xml").decode("utf-8")
    header = patch_header(z.read("Contents/header.xml").decode("utf-8"))
    head_xml = sec[:re.search(r'<hp:p[ >]', sec).start()]
    paras = top_level_paras(sec[len(head_xml):])
    prv_enc_probe = z.read("Preview/PrvText.txt")
    print("PrvText head bytes:", prv_enc_probe[:8])
    t_app = f"[붙임1] 2026년 톡톡 Idea 공모전 제안 신청서\r\n제안제목: {TITLE}\r\n제안자: {ME['name']}"
    t_con = f"[붙임2] 개인정보 수집 동의서\r\n동의인: {ME['name']}"
    write(OUT1, build_app(paras), z, header, head_xml, t_app)
    write(OUT2, build_consent(paras), z, header, head_xml, t_con)


if __name__ == "__main__":
    main()
