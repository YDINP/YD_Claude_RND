"""서식 4 제안서를 hwpx 로 만든다.
원본 서식은 hwp(바이너리)라 직접 채울 수 없으므로, 검증된 hwpx 골격(다른 공모의 지정서식 hwpx)의
header/settings/version/META-INF 를 빌려 쓰고 section0.xml 을 원본 서식 4 구조대로 새로 쓴다.
- mimetype 첫 항목 무압축, 나머지 항목·압축 방식 유지
- 글꼴 '맑은 고딕' 추가, 글자/문단/테두리 모양 추가(기존 id 뒤에 붙임)
- linesegarray 없이 써서 한글이 줄 배치를 다시 계산
- 미리보기(PrvText/PrvImage)는 이 제안서 것으로 교체
실행: python -I make_hwpx.py
"""
import re, sys, zipfile
from pathlib import Path
from xml.dom import minidom
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import ME, TITLE, SUBTITLE, SUMMARY, SUMMARY_TABLE, SECTIONS, SOURCES  # noqa: E402

SKEL = HERE.parent / "의정부도시공사_AI아이디어" / "원본" / "(양식) 제출서류.hwpx"
OUT = HERE / "AI혁신 경진대회_개인(박용진)_②아이디어제안서.hwpx"
PRV_IMG = HERE / "_build" / "prop1.png"

C0, P0, B0 = 34, 43, 24      # 원본 charPr 0~33, paraPr 0~42, borderFill 1~23 → 새 id 시작
FONT = 4                     # 새 글꼴 id (각 언어 fontface 의 5번째)
TW = 51000                   # 본문 폭(HWPUNIT)

# 글자 모양: 이름 → (크기 1/100pt, 굵게, 색, 밑줄)
CHARS = {
    "n": (950, 0, "#000000", 0), "b": (950, 1, "#000000", 0),
    "s": (850, 0, "#000000", 0), "sb": (850, 1, "#000000", 0),
    "g": (820, 1, "#1F3FBF", 0), "h": (1150, 1, "#000000", 1),
    "t": (1400, 1, "#000000", 0), "st": (1000, 0, "#333333", 0),
    "hd": (1200, 1, "#000000", 0), "w": (920, 1, "#1F3FBF", 0),
    "src": (750, 0, "#333333", 0), "cap": (1200, 1, "#000000", 1),
}
CID = {k: C0 + i for i, k in enumerate(CHARS)}
# 문단 모양: 이름 → (정렬, 내어쓰기, 위, 아래, 줄간격%)
PARAS = {
    "j": ("JUSTIFY", 0, 0, 0, 130), "c": ("CENTER", 0, 0, 0, 130), "l": ("LEFT", 0, 0, 0, 125),
    "bul": ("JUSTIFY", -1300, 0, 150, 130), "tb": ("LEFT", 0, 0, 0, 120),
    "h": ("LEFT", 0, 900, 0, 130), "g": ("LEFT", 0, 0, 200, 120),
}
PID = {k: P0 + i for i, k in enumerate(PARAS)}
# 테두리/배경: 이름 → 배경색(None=없음)
FILLS = {"gray": "#D9D9D9", "light": "#F2F2F2", "blue": "#EEF2FB", "flow": "#E9EDF6", "yellow": "#FFF7B3", "plain": None}
BID = {k: B0 + i for i, k in enumerate(FILLS)}


def patch_header(h):
    # 글꼴 추가
    def addfont(m):
        cnt = int(m.group(2))
        return f'{m.group(1)}fontCnt="{cnt + 1}">'
    h = re.sub(r'(<hh:fontface lang="\w+" )fontCnt="(\d+)">', addfont, h)
    font = f'<hh:font id="{FONT}" face="맑은 고딕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>'
    h = h.replace("</hh:fontface>", font + "</hh:fontface>")
    # 글자 모양
    base = re.search(r'<hh:charPr id="0".*?</hh:charPr>', h, flags=re.S).group(0)
    out = ""
    for k, (sz, bold, color, ul) in CHARS.items():
        x = base.replace('id="0"', f'id="{CID[k]}"').replace('height="1000"', f'height="{sz}"').replace('textColor="#000000"', f'textColor="{color}"', 1)
        x = re.sub(r'<hh:fontRef [^>]*/>', f'<hh:fontRef hangul="{FONT}" latin="{FONT}" hanja="{FONT}" japanese="{FONT}" other="{FONT}" symbol="{FONT}" user="{FONT}"/>', x)
        if bold:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline")
        if ul:
            x = x.replace('<hh:underline type="NONE"', '<hh:underline type="BOTTOM"')
        out += x
    h = h.replace("</hh:charProperties>", out + "</hh:charProperties>")
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1)) + len(CHARS)}"', h)
    # 문단 모양
    base = re.search(r'<hh:paraPr id="0".*?</hh:paraPr>', h, flags=re.S).group(0)
    out = ""
    for k, (al, ind, prev, nxt, ls) in PARAS.items():
        x = base.replace('id="0"', f'id="{PID[k]}"').replace('horizontal="JUSTIFY"', f'horizontal="{al}"')
        x = x.replace('<hc:intent value="0"', f'<hc:intent value="{ind}"').replace('<hc:prev value="0"', f'<hc:prev value="{prev}"')
        x = x.replace('<hc:next value="0"', f'<hc:next value="{nxt}"').replace('<hh:lineSpacing type="PERCENT" value="160"', f'<hh:lineSpacing type="PERCENT" value="{ls}"')
        x = x.replace('snapToGrid="1"', 'snapToGrid="0"')
        out += x
    h = h.replace("</hh:paraProperties>", out + "</hh:paraProperties>")
    h = re.sub(r'<hh:paraProperties itemCnt="(\d+)"', lambda m: f'<hh:paraProperties itemCnt="{int(m.group(1)) + len(PARAS)}"', h)
    # 테두리/배경
    base = re.search(r'<hh:borderFill id="8".*?</hh:borderFill>', h, flags=re.S).group(0)
    out = ""
    for k, col in FILLS.items():
        x = base.replace('id="8"', f'id="{BID[k]}"')
        x = x.replace('faceColor="#F2F2F2"', f'faceColor="{col}"') if col else re.sub(r"<hc:fillBrush>.*?</hc:fillBrush>", "", x)
        out += x
    h = h.replace("</hh:borderFills>", out + "</hh:borderFills>")
    h = re.sub(r'<hh:borderFills itemCnt="(\d+)"', lambda m: f'<hh:borderFills itemCnt="{int(m.group(1)) + len(FILLS)}"', h)
    return h


def runs(text, base="n", bold="b"):
    parts = re.split(r"(\*\*.*?\*\*)", text)
    out = ""
    for x in parts:
        if not x:
            continue
        st, t = (bold, x[2:-2]) if x.startswith("**") else (base, x)
        out += f'<hp:run charPrIDRef="{CID[st]}"><hp:t>{escape(t)}</hp:t></hp:run>'
    return out or f'<hp:run charPrIDRef="{CID[base]}"/>'


def P(text, pp="j", st="n", bold="b", page_break=False):
    return (f'<hp:p id="0" paraPrIDRef="{PID[pp]}" styleIDRef="0" pageBreak="{1 if page_break else 0}" columnBreak="0" merged="0">'
            f'{runs(text, st, bold)}</hp:p>')


_tid = [1900000000]


def table(rows, widths, valign="CENTER"):
    """rows: [[(paras_xml, fill), ...], ...] widths: 비율 목록."""
    tot = sum(widths)
    ws = [round(TW * w / tot) for w in widths]
    ws[-1] = TW - sum(ws[:-1])
    _tid[0] += 1
    trs = ""
    for r, row in enumerate(rows):
        tcs = ""
        for c, (paras, fill) in enumerate(row):
            tcs += (f'<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{BID.get(fill, 1)}">'
                    f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="{valign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
                    f'{paras}</hp:subList><hp:cellAddr colAddr="{c}" rowAddr="{r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>'
                    f'<hp:cellSz width="{ws[c]}" height="1000"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/></hp:tc>')
        trs += f"<hp:tr>{tcs}</hp:tr>"
    tbl = (f'<hp:tbl id="{_tid[0]}" zOrder="{_tid[0] - 1900000000}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" '
           f'rowCnt="{len(rows)}" colCnt="{len(widths)}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">'
           f'<hp:sz width="{TW}" widthRelTo="ABSOLUTE" height="{1000 * len(rows)}" heightRelTo="ABSOLUTE" protect="0"/>'
           '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
           '<hp:outMargin left="0" right="0" top="141" bottom="141"/><hp:inMargin left="283" right="283" top="141" bottom="141"/>'
           f"{trs}</hp:tbl>")
    return f'<hp:p id="0" paraPrIDRef="{PID["c"]}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="{CID["n"]}">{tbl}</hp:run></hp:p>'


def cell(lines, pp="tb", st="s", bold="sb"):
    if isinstance(lines, str):
        lines = lines.split("\n")
    return "".join(P(x, pp, st, bold) for x in lines)


def block(b):
    k = b[0]
    if k == "b":
        return P("◦ " + b[1], "bul")
    if k == "s":
        return P("- " + b[1], "bul")
    if k == "p":
        return P(b[1])
    if k == "t":
        _, head, rows, w = b
        hr = [(cell(h, "c", "sb"), "gray") for h in head]
        body = [[(cell(c, "tb", "sb" if i == 0 else "s"), "light" if i == 0 else "plain") for i, c in enumerate(r)] for r in rows]
        return table([hr] + body, w, "TOP")
    if k == "box":
        ls = b[1]
        paras = P("**" + ls[0] + "**", "tb", "s", "sb") + "".join(P(x, "tb", "s") for x in ls[1:])
        return table([[(paras, "blue")]], [1])
    if k == "flow":
        row = []
        for i, x in enumerate(b[1]):
            if i:
                row.append((P("→", "c", "b"), "none"))
            row.append((cell(x, "c", "sb"), "flow"))
        return table([row], [23 if j % 2 == 0 else 2.6 for j in range(len(row))])
    raise ValueError(k)


def section_xml(sec_head):
    out = []
    # 서식 4 머리 상자 + 유의사항
    out.append(table([[(P("서식 4", "c", "hd"), "gray"), (P("「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」 제안서", "l", "hd"), "plain")]], [14, 86]))
    out.append(table([[(P("※ (유의 사항) 아래 서식을 참고하여 5쪽 이내 분량 및 한글파일(hwp 또는 hwpx)로 작성·제출", "c", "w"), "yellow")]], [1]))
    out.append(P(TITLE, "c", "t"))
    out.append(P(SUBTITLE, "c", "st"))
    out.append(table([[(cell("아이디어 요약\n(5줄 이내)", "c", "b"), "gray"), ("".join(P("◦ " + x, "bul") for x in SUMMARY), "plain")]], [19, 81]))
    out.append(P("【제안서 요약】", "c", "cap"))
    rows = [[(cell(h, "c", "b"), "gray"), ("".join(P("◦ " + x, "bul", "s") for x in ls), "plain")] for h, ls in SUMMARY_TABLE]
    out.append(table(rows, [19, 81]))
    # 2쪽~: 본문
    out.append(P(f"아이디어 주제(팀명 또는 신청인명) — **{TITLE}** ({ME['name']})", "c", "n", page_break=True))
    for h, guide, blocks in SECTIONS:
        out.append(P(h, "h", "h"))
        out.append(P("* " + guide, "g", "g"))
        out += [block(b) for b in blocks]
    out.append(P("출처", "l", "sb"))
    out += [P(f"{i}. {s}", "l", "src") for i, s in enumerate(SOURCES, 1)]
    return "".join(out)


def main():
    zin = zipfile.ZipFile(SKEL)
    s = zin.read("Contents/section0.xml").decode("utf-8")
    first_open = re.match(r'.*?(<hp:p [^>]*>)', s, flags=re.S)
    head = s[: first_open.start(1)]
    secpr = re.search(r"<hp:secPr.*?</hp:secPr>", s, flags=re.S).group(0)
    secpr = re.sub(r'<hp:margin header="\d+" footer="\d+" gutter="0" left="\d+" right="\d+" top="\d+" bottom="\d+"/>',
                   '<hp:margin header="1134" footer="1134" gutter="0" left="4251" right="4251" top="2268" bottom="2268"/>', secpr)
    colpr = re.search(r"<hp:ctrl><hp:colPr[^>]*/></hp:ctrl>", s).group(0)
    p0 = (f'<hp:p id="0" paraPrIDRef="{PID["l"]}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
          f'<hp:run charPrIDRef="{CID["n"]}">{secpr}{colpr}</hp:run></hp:p>')
    body = section_xml(None)
    sec = head + p0 + body + "</hs:sec>"
    hdr = patch_header(zin.read("Contents/header.xml").decode("utf-8"))
    for x in (sec, hdr):
        minidom.parseString(x.encode("utf-8"))
    # 미리보기 텍스트
    prv = "\r\n".join([TITLE, SUBTITLE] + SUMMARY).encode("utf-8")
    hpf = zin.read("Contents/content.hpf").decode("utf-8")
    hpf = re.sub(r'<opf:title/>', f"<opf:title>{escape(TITLE)}</opf:title>", hpf)
    hpf = re.sub(r'(name="(?:creator|lastsaveby)" content="text">)[^<]*', r"\g<1>" + ME["name"], hpf)
    hpf = re.sub(r'(name="(?:CreatedDate|ModifiedDate)" content="text">)[^<]*', r"\g<1>2026-11-04T09:00:00Z", hpf)
    hpf = re.sub(r'(name="date" content="text">)[^<]*', r"\g<1>2026년 11월 4일", hpf)
    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = sec.encode("utf-8")
            elif info.filename == "Contents/header.xml":
                data = hdr.encode("utf-8")
            elif info.filename == "Contents/content.hpf":
                data = hpf.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = prv
            elif info.filename == "Preview/PrvImage.png" and PRV_IMG.exists():
                data = PRV_IMG.read_bytes()
            zout.writestr(info, data, compress_type=info.compress_type)
    print("written", OUT.name)


if __name__ == "__main__":
    main()
