"""한 가지 내용 모델(블록 목록)을 HTML(PDF용)과 HWPX section XML 로 함께 그린다.

블록:
  ("sec", 원본 사각형 문단 XML, 제목)      — 서식의 Ⅰ~Ⅴ 장 제목 상자(원본 재사용)
  ("h", "1. 축제 기본구상")                 — 항목 제목(14pt 굵게)
  ("o", "텍스트")                           — ◦ 단계
  ("d", "텍스트")                           — - 단계
  ("b", "텍스트")                           — · 단계
  ("p", "텍스트")                           — 들여 쓴 일반 문단
  ("tbl", dict(cols=[..], head=[..], rows=[[..]], first=True, align="clll"))
  ("box", ["줄", ...])                      — 옅은 바탕 1칸 표(강조 상자, 10pt)
  ("img", png경로, 폭mm, 캡션)
  ("gap",) / ("pb",)
텍스트 안 **굵게** 를 지원한다.
"""
import re
import random
from xml.sax.saxutils import escape

# ── 원본 서식(header.xml)의 ID ──
CP_BODY, CP_H, CP_T, CP_TH = 5, 44, 47, 46          # 13pt / 14pt 굵게 / 표 10pt / 표머리 흰 굵게
PP_O, PP_H, PP_CELL_C, PP_CELL_L, PP_PLAIN = 53, 51, 42, 43, 41
BF_HEAD, BF_FIRST, BF_SHADE, BF_BODY = 9, 10, 11, 12

rng = random.Random(20261104)


class Ids:
    """header.xml 에 덧붙일 글자·문단 모양 ID."""
    def __init__(self, cp_next, pp_next):
        self.cp_next, self.pp_next = cp_next, pp_next
        self.cp, self.pp = {}, {}


def bold_runs(text, cp, cpb, br=False):
    """'**굵게**' 표기를 run 목록으로."""
    out = []
    for i, part in enumerate(re.split(r"\*\*", text)):
        if part:
            out.append(f'<hp:run charPrIDRef="{cpb if i % 2 else cp}"><hp:t>{escape(part)}</hp:t></hp:run>')
    return "".join(out) or f'<hp:run charPrIDRef="{cp}"/>'


def para(pp, runs, pb=0):
    return f'<hp:p id="0" paraPrIDRef="{pp}" styleIDRef="47" pageBreak="{pb}" columnBreak="0" merged="0">{runs}</hp:p>'


# ─────────────────────────── HWPX ───────────────────────────
class Hwpx:
    W = 48188  # 본문 폭(HWPUNIT)

    def __init__(self, ids):
        self.ids = ids
        self.images = []  # (id, png bytes, (w,h) px)

    # 표 ---------------------------------------------------------
    def cell(self, r, c, w, h, text, bf, cp, cpb, pp, header=False, cs=1, rs=1, valign="CENTER"):
        lines = text if isinstance(text, list) else str(text).split("\n")
        ps = "".join(para(pp, bold_runs(t, cp, cpb)) for t in lines)
        return (f'<hp:tc name="" header="{1 if header else 0}" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="{bf}">'
                f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="{valign}" linkListIDRef="0" linkListNextIDRef="0" '
                f'textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{ps}</hp:subList>'
                f'<hp:cellAddr colAddr="{c}" rowAddr="{r}"/><hp:cellSpan colSpan="{cs}" rowSpan="{rs}"/>'
                f'<hp:cellSz width="{w}" height="{h}"/><hp:cellMargin left="650" right="650" top="450" bottom="450"/></hp:tc>')

    def table(self, spec):
        cols = spec["cols"]
        tot = sum(cols)
        ws = [int(self.W * c / tot) for c in cols]
        ws[-1] = self.W - sum(ws[:-1])
        align = spec.get("align", "c" + "l" * (len(cols) - 1))
        rows = []
        grid = []
        if spec.get("head"):
            grid.append(("H", spec["head"]))
        for r in spec["rows"]:
            grid.append(("B", r))
        cpb = self.ids.cp["T_B"]
        # 행 높이 추정(줄 수 × 1160 + 여백 900)
        heights = []
        for ri, (kind, row) in enumerate(grid):
            nl = 1
            for ci, t in enumerate(row):
                if t is None or t == "^":
                    continue
                chars = ws[ci] / 1000 * 0.98
                n = sum(max(1, -(-len(x) // max(1, int(chars - 1.3)))) for x in str(t).split("\n"))
                nl = max(nl, n)
            heights.append(nl * 1160 + 900)
        def rspan(ri, ci):
            k = 1
            while ri + k < len(grid) and ci < len(grid[ri + k][1]) and grid[ri + k][1][ci] == "^":
                k += 1
            return k
        trs, H = [], 0
        for ri, (kind, row) in enumerate(grid):
            nl = 1
            for ci, t in enumerate(row):
                if t is None or t == "^":
                    continue
                chars = ws[ci] / 1000 * 0.98  # 10pt 한글 1자 ≈ 1000
                n = sum(max(1, -(-len(x) // max(1, int(chars - 1.3)))) for x in str(t).split("\n"))
                nl = max(nl, n)
            h = heights[ri]
            H += h
            tcs = []
            for ci, t in enumerate(row):
                if t is None or t == "^":  # 병합으로 가려진 칸
                    continue
                rs = rspan(ri, ci)
                hh = sum(heights[ri:ri + rs])
                cs = 1
                while ci + cs < len(row) and row[ci + cs] is None:
                    cs += 1
                w = sum(ws[ci:ci + cs])
                if kind == "H":
                    tcs.append(self.cell(ri, ci, w, hh, t, BF_HEAD, CP_TH, CP_TH, PP_CELL_C, header=True, cs=cs, rs=rs))
                else:
                    first = spec.get("first", True) and ci == 0
                    shade = spec.get("shade_rows") and ri in spec["shade_rows"]
                    bf = BF_FIRST if first else (BF_SHADE if shade else BF_BODY)
                    pp = PP_CELL_C if align[min(ci, len(align) - 1)] == "c" else PP_CELL_L
                    tcs.append(self.cell(ri, ci, w, hh, t, bf, CP_T, cpb, pp, cs=cs, rs=rs,
                                         ) if not first else self.cell(ri, ci, w, hh, t, bf, cpb, cpb, pp, cs=cs, rs=rs))
            trs.append("<hp:tr>" + "".join(tcs) + "</hp:tr>")
        tid = rng.randint(1_000_000_000, 2_000_000_000)
        tbl = (f'<hp:tbl id="{tid}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" '
               f'dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="{len(grid)}" colCnt="{len(cols)}" cellSpacing="0" '
               f'borderFillIDRef="{BF_BODY}" noAdjust="0"><hp:sz width="{self.W}" widthRelTo="ABSOLUTE" height="{H}" heightRelTo="ABSOLUTE" protect="0"/>'
               f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" '
               f'horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               f'<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="540" right="540" top="0" bottom="0"/>'
               + "".join(trs) + "</hp:tbl>")
        return para(self.ids.pp["TBL"], f'<hp:run charPrIDRef="{CP_T}">{tbl}<hp:t/></hp:run>')

    def box(self, lines):
        spec = dict(cols=[1], rows=[["\n".join(lines)]], first=False, align="l", shade_rows=[0])
        return self.table(spec)

    # 그림 ---------------------------------------------------------
    def pic(self, png_bytes, px, width_mm, pp=PP_CELL_C):
        n = len(self.images) + 1
        iid = f"image{n}"
        self.images.append((iid, png_bytes))
        pw, ph = px
        w = int(width_mm / 25.4 * 7200)
        h = int(w * ph / pw)
        dw, dh = pw * 75, ph * 75
        pid = rng.randint(1_000_000_000, 2_000_000_000)
        x = (f'<hp:pic id="{pid}" zOrder="{10 + n}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" '
             f'dropcapstyle="None" href="" groupLevel="0" instid="{pid - 7}" reverse="0"><hp:offset x="0" y="0"/>'
             f'<hp:orgSz width="{w}" height="{h}"/><hp:curSz width="0" height="0"/><hp:flip horizontal="0" vertical="0"/>'
             f'<hp:rotationInfo angle="0" centerX="{w // 2}" centerY="{h // 2}" rotateimage="1"/><hp:renderingInfo>'
             f'<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
             f'<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>'
             f'<hc:img binaryItemIDRef="{iid}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>'
             f'<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="{w}" y="0"/><hc:pt2 x="{w}" y="{h}"/><hc:pt3 x="0" y="{h}"/></hp:imgRect>'
             f'<hp:imgClip left="0" right="{dw}" top="0" bottom="{dh}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>'
             f'<hp:imgDim dimwidth="{dw}" dimheight="{dh}"/><hp:effects/>'
             f'<hp:sz width="{w}" widthRelTo="ABSOLUTE" height="{h}" heightRelTo="ABSOLUTE" protect="0"/>'
             f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PARA" '
             f'horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
             f'<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>그림입니다.</hp:shapeComment></hp:pic>')
        return x

    # 블록 → XML ----------------------------------------------------
    def render(self, blocks, img_loader):
        out = []
        pb = 0
        ids = self.ids
        for blk in blocks:
            k = blk[0]
            if k == "pb":
                pb = 1
                continue
            if k == "sec":
                x = blk[1]
                x = re.sub(r'pageBreak="\d"', f'pageBreak="{pb}"', x, count=1)
                out.append(x)
            elif k == "h":
                out.append(para(ids.pp["H"], bold_runs(blk[1], CP_H, CP_H), pb))
            elif k == "o":
                out.append(para(ids.pp["O"], bold_runs("◦ " + blk[1], CP_BODY, ids.cp["B_B"]), pb))
            elif k == "d":
                out.append(para(ids.pp["D"], bold_runs("- " + blk[1], CP_BODY, ids.cp["B_B"]), pb))
            elif k == "b":
                out.append(para(ids.pp["B"], bold_runs("· " + blk[1], CP_BODY, ids.cp["B_B"]), pb))
            elif k == "p":
                out.append(para(ids.pp["P"], bold_runs(blk[1], CP_BODY, ids.cp["B_B"]), pb))
            elif k == "note":  # 표 아래 10pt 주석(출처 등)
                out.append(para(ids.pp["N"], bold_runs(blk[1], CP_T, ids.cp["T_B"]), pb))
            elif k == "tbl":
                x = self.table(blk[1])
                out.append(re.sub(r'pageBreak="\d"', f'pageBreak="{pb}"', x, count=1))
            elif k == "box":
                x = self.box(blk[1])
                out.append(re.sub(r'pageBreak="\d"', f'pageBreak="{pb}"', x, count=1))
            elif k == "img":
                data, px = img_loader(blk[1])
                pic = self.pic(data, px, blk[2])
                out.append(para(PP_CELL_C, f'<hp:run charPrIDRef="{CP_T}">{pic}<hp:t/></hp:run>', pb))
                if len(blk) > 3 and blk[3]:
                    out.append(para(PP_CELL_C, bold_runs(blk[3], CP_T, ids.cp["T_B"])))
            elif k == "gap":
                out.append(para(PP_PLAIN, f'<hp:run charPrIDRef="{CP_T}"/>', pb))
            else:
                raise ValueError(k)
            pb = 0
        return "".join(out)


def extend_header(hx, ids):
    """header.xml 에 굵은 글자 모양·들여쓰기 문단 모양을 덧붙인다."""
    def clone_cp(src, new_id, bold=True, color=None):
        m = re.search(rf'<hh:charPr id="{src}" .*?</hh:charPr>', hx, re.S).group()
        x = m.replace(f'id="{src}"', f'id="{new_id}"', 1)
        if bold and "<hh:bold/>" not in x:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
        if color:
            x = re.sub(r'textColor="[^"]+"', f'textColor="{color}"', x, count=1)
        return x

    def clone_pp(src, new_id, left, intent, nxt=350, keep=False):
        m = re.search(rf'<hh:paraPr id="{src}" .*?</hh:paraPr>', hx, re.S).group()
        x = m.replace(f'id="{src}"', f'id="{new_id}"', 1)
        if keep:
            x = x.replace('keepWithNext="0"', 'keepWithNext="1"', 1)
        case, default = x.split("<hp:default>")
        def setv(seg, k):
            seg = re.sub(r'<hc:intent value="-?\d+"', f'<hc:intent value="{intent * k}"', seg)
            seg = re.sub(r'<hc:left value="-?\d+"', f'<hc:left value="{left * k}"', seg)
            seg = re.sub(r'<hc:next value="-?\d+"', f'<hc:next value="{nxt * k}"', seg)
            return seg
        return setv(case, 1) + "<hp:default>" + setv(default, 2)

    new_cp = []
    for key, src, color in (("B_B", CP_BODY, None), ("T_B", CP_T, None)):
        ids.cp[key] = ids.cp_next
        new_cp.append(clone_cp(src, ids.cp_next, True, color))
        ids.cp_next += 1
    new_pp = []
    for key, left, intent, nxt in (("D", 1300, -1300, 300), ("B", 2600, -1300, 300), ("P", 1950, 0, 350), ("N", 0, 0, 200), ("TBL", 0, 0, 500)):
        ids.pp[key] = ids.pp_next
        new_pp.append(clone_pp(PP_O, ids.pp_next, left, intent, nxt))
        ids.pp_next += 1
    for key, src, left, intent, nxt in (("O", PP_O, 0, -1948, 350), ("H", PP_H, 0, 0, 450)):
        ids.pp[key] = ids.pp_next
        new_pp.append(clone_pp(src, ids.pp_next, left, intent, nxt, keep=True))
        ids.pp_next += 1
    hx = hx.replace("</hh:charProperties>", "".join(new_cp) + "</hh:charProperties>", 1)
    hx = re.sub(r'<hh:charProperties itemCnt="\d+"', f'<hh:charProperties itemCnt="{ids.cp_next}"', hx, count=1)
    hx = hx.replace("</hh:paraProperties>", "".join(new_pp) + "</hh:paraProperties>", 1)
    hx = re.sub(r'<hh:paraProperties itemCnt="\d+"', f'<hh:paraProperties itemCnt="{ids.pp_next}"', hx, count=1)
    return hx


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


# ─────────────────────────── HTML ───────────────────────────
def md(text):
    t = escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


CSS = """
@page { size:A4; margin:20mm 20mm 20mm 20mm;
  @bottom-center { content: "- " counter(page) " -"; font-family:'HY신명조','Batang',serif; font-size:9pt; color:#333; } }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'HY신명조','Batang',serif; font-size:13pt; line-height:1.6; color:#000; margin:0; }
p { margin:0; }
.o { padding-left:1.5em; text-indent:-1.5em; margin:0 0 3.5pt; }
.d { padding-left:2em; text-indent:-1em; margin:0 0 3pt; }
.b { padding-left:3em; text-indent:-1em; margin:0 0 3pt; }
.p { padding-left:1.5em; margin:0 0 3.5pt; }
.h { font-size:14pt; font-weight:bold; margin:11.5pt 0 4.5pt; }
.note { font-size:10pt; line-height:1.3; margin:0 0 2pt; }
.sec { background:#DFE6F7; font-size:15pt; font-weight:bold; height:25pt; line-height:25pt; padding:0 8pt; margin:0 0 4pt; }
table.t { width:100%; border-collapse:collapse; font-size:10pt; line-height:1.16; margin:0 0 5pt; }
table.t td, table.t th { border:0.15mm solid #000; padding:4.5pt 6.5pt; vertical-align:middle; }
table.t th { background:#1F4E79; color:#fff; font-weight:bold; text-align:center; }
table.t td.f { background:#F5F7FA; font-weight:bold; }
table.t td.s { background:#EAF1F8; }
table.t td.c { text-align:center; }
table.t td p + p { margin-top:1.5pt; }
thead { display:table-header-group; }
tr { break-inside:avoid; }
.img { text-align:center; margin:2pt 0 2pt; }
.cap { text-align:center; font-size:10pt; line-height:1.3; margin:0 0 6pt; }
.pb { break-before:page; }
.gap { height:10pt; }
"""


def table_html(spec):
    cols = spec["cols"]
    tot = sum(cols)
    align = spec.get("align", "c" + "l" * (len(cols) - 1))
    h = ['<table class="t"><colgroup>' + "".join(f'<col style="width:{c / tot * 100:.2f}%">' for c in cols) + "</colgroup>"]
    if spec.get("head"):
        h.append("<thead><tr>")
        row = spec["head"]
        for ci, t in enumerate(row):
            if t is None:
                continue
            cs = 1
            while ci + cs < len(row) and row[ci + cs] is None:
                cs += 1
            h.append(f'<th colspan="{cs}">' + "".join(f"<p>{md(x)}</p>" for x in str(t).split("\n")) + "</th>")
        h.append("</tr></thead>")
    h.append("<tbody>")
    for ri, row in enumerate(spec["rows"], start=1 if spec.get("head") else 0):
        h.append("<tr>")
        for ci, t in enumerate(row):
            if t is None:
                continue
            cs = 1
            while ci + cs < len(row) and row[ci + cs] is None:
                cs += 1
            cls = []
            if spec.get("first", True) and ci == 0:
                cls.append("f")
            if spec.get("shade_rows") and ri in spec["shade_rows"]:
                cls.append("s")
            if align[min(ci, len(align) - 1)] == "c":
                cls.append("c")
            h.append(f'<td colspan="{cs}" class="{" ".join(cls)}">' + "".join(f"<p>{md(x)}</p>" for x in str(t).split("\n")) + "</td>")
        h.append("</tr>")
    h.append("</tbody></table>")
    return "".join(h)


def render_html(blocks, img_src):
    out = []
    pb = False
    for blk in blocks:
        k = blk[0]
        if k == "pb":
            pb = True
            continue
        pre = '<div class="pb"></div>' if pb else ""
        pb = False
        if k == "sec":
            out.append(pre + f'<div class="sec">{escape(blk[2])}</div>')
        elif k == "h":
            out.append(pre + f'<p class="h">{md(blk[1])}</p>')
        elif k in ("o", "d", "b"):
            mark = {"o": "◦", "d": "-", "b": "·"}[k]
            out.append(pre + f'<p class="{k}">{mark} {md(blk[1])}</p>')
        elif k == "p":
            out.append(pre + f'<p class="p">{md(blk[1])}</p>')
        elif k == "note":
            out.append(pre + f'<p class="note">{md(blk[1])}</p>')
        elif k == "tbl":
            out.append(pre + table_html(blk[1]))
        elif k == "box":
            out.append(pre + table_html(dict(cols=[1], rows=[["\n".join(blk[1])]], first=False, align="l", shade_rows=[0])))
        elif k == "img":
            out.append(pre + f'<div class="img"><img src="{img_src(blk[1])}" style="width:{blk[2]}mm"></div>')
            if len(blk) > 3 and blk[3]:
                out.append(f'<p class="cap">{md(blk[3])}</p>')
        elif k == "gap":
            out.append(pre + '<div class="gap"></div>')
    return "\n".join(out)
