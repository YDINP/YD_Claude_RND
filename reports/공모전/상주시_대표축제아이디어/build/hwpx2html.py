"""채운 HWPX(section0.xml + header.xml)를 같은 모양의 HTML 로 옮긴다 → Chrome 으로 PDF.
HWPX 가 유일한 원본이 되게 해 PDF 와 HWPX 의 내용이 어긋나지 않게 한다."""
import base64
import html
import re

FONT_MAP = {
    "휴먼명조": "'HY신명조','HYSinMyeongJo-Medium','Batang',serif",
    "한양신명조": "'HY신명조','HYSinMyeongJo-Medium','Batang',serif",
    "함초롬바탕": "'Batang',serif", "한컴바탕": "'Batang',serif", "바탕": "'Batang',serif",
    "한컴 소망 B": "'HY헤드라인M','HYHeadLine-Medium','Malgun Gothic',sans-serif",
    "HY헤드라인M": "'HY헤드라인M','HYHeadLine-Medium',sans-serif",
    "맑은 고딕": "'Malgun Gothic',sans-serif", "돋움": "'Dotum','Malgun Gothic',sans-serif",
    "굴림체": "'GulimChe','Malgun Gothic',sans-serif", "함초롬돋움": "'Malgun Gothic',sans-serif",
    "한양중고딕": "'Malgun Gothic',sans-serif", "-윤고딕120": "'Malgun Gothic',sans-serif",
}


class Header:
    def __init__(self, hx):
        ff = re.search(r'<hh:fontface lang="HANGUL".*?</hh:fontface>', hx, re.S).group()
        self.fonts = {i: f for i, f in re.findall(r'<hh:font id="(\d+)" face="([^"]+)"', ff)}
        self.cp, self.pp, self.bf = {}, {}, {}
        for m in re.finditer(r'<hh:charPr id="(\d+)" (.*?)</hh:charPr>', hx, re.S):
            body = m.group(2)
            face = self.fonts.get(re.search(r'<hh:fontRef hangul="(\d+)"', body).group(1), "휴먼명조")
            self.cp[m.group(1)] = dict(
                size=int(re.search(r'height="(\d+)"', body).group(1)) / 100,
                color=re.search(r'textColor="([^"]+)"', body).group(1),
                bold="<hh:bold/>" in body, italic="<hh:italic/>" in body,
                ratio=int(re.search(r'<hh:ratio hangul="(\d+)"', body).group(1)),
                spacing=int(re.search(r'<hh:spacing hangul="(-?\d+)"', body).group(1)),
                face=FONT_MAP.get(face, "'HY신명조','Batang',serif"))
        for m in re.finditer(r'<hh:paraPr id="(\d+)" (.*?)</hh:paraPr>', hx, re.S):
            body = m.group(2)
            case = body.split("<hp:default>")[0]
            g = lambda k: int(re.search(rf'<hc:{k} value="(-?\d+)"', case).group(1))
            ls = re.search(r'<hh:lineSpacing type="(\w+)" value="(\d+)"', case)
            self.pp[m.group(1)] = dict(align=re.search(r'<hh:align horizontal="(\w+)"', body).group(1),
                                       intent=g("intent"), left=g("left"), right=g("right"), prev=g("prev"), next=g("next"),
                                       ls_type=ls.group(1), ls=int(ls.group(2)),
                                       keep='keepWithNext="1"' in body,
                                       numbered=bool(re.search(r'<hh:heading type="NUMBER" idRef="\d+" level="0"', body)))
        for m in re.finditer(r'<hh:borderFill id="(\d+)" (.*?)</hh:borderFill>', hx, re.S):
            fc = re.search(r'faceColor="([^"]+)"', m.group(2))
            borders = {k: (t, w) for k, t, w in re.findall(r'<hh:(left|right|top|bottom)Border type="(\w+)" width="([^"]+)"', m.group(2))}
            self.bf[m.group(1)] = dict(fill=fc.group(1) if fc and fc.group(1) != "none" else None, borders=borders)


def top_elems(s, tag):
    """s 안의 최상위 <tag ...>...</tag> 구간."""
    out, depth, start = [], 0, 0
    for m in re.finditer(rf"<{tag}(?=[ >/])[^>]*>|</{tag}>", s):
        g = m.group()
        if g.startswith("</"):
            depth -= 1
            if depth == 0:
                out.append(s[start:m.end()])
        elif g.endswith("/>"):
            if depth == 0:
                out.append(g)
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return out


def in_cell_obj(inner):
    return "<hp:tbl " in inner or "<hp:rect " in inner


ALIGN = {"LEFT": "left", "RIGHT": "right", "CENTER": "center", "JUSTIFY": "justify", "DISTRIBUTE": "justify"}


class Renderer:
    def __init__(self, hx, images, sig_ids=()):
        self.h = Header(hx)
        self.images = images  # id -> data uri
        self.sig_ids = set(sig_ids)
        self.num = 0

    def run_html(self, run):
        cp = self.h.cp.get(re.search(r'charPrIDRef="(\d+)"', run).group(1))
        out = []
        # 러닝 안 요소를 순서대로
        inner = run[run.find(">") + 1: run.rfind("</hp:run>")] if "</hp:run>" in run else ""
        pos = 0
        for m in re.finditer(r"<hp:t>(.*?)</hp:t>|<hp:t/>|<hp:tbl .*?</hp:tbl>|<hp:pic .*?</hp:pic>|<hp:rect .*?</hp:rect>", inner, re.S):
            g = m.group()
            if g.startswith("<hp:t>"):
                t = m.group(1)
                t = re.sub(r"<hp:lineBreak/>", "\n", t)
                t = re.sub(r"<hp:tab[^>]*/>", " ", t)
                t = re.sub(r"<[^>]+>", "", t)
                t = html.escape(html.unescape(t)).replace("\n", "<br>")
                t = re.sub(r"  ", " &nbsp;", t)
                out.append(("t", t))
            elif g.startswith("<hp:tbl"):
                out.append(("blk", self.table(g)))
            elif g.startswith("<hp:pic"):
                out.append(("pic", self.pic(g)))
            elif g.startswith("<hp:rect"):
                out.append(("blk", self.rect(g)))
        style = ""
        if cp:
            style = (f"font-size:{cp['size']}pt;color:{cp['color']};font-family:{cp['face']};"
                     + ("font-weight:bold;" if cp["bold"] else "font-weight:normal;")
                     + (f"letter-spacing:{cp['spacing'] / 100:.2f}em;" if cp["spacing"] else ""))
        return style, out

    def pic(self, g):
        iid = re.search(r'binaryItemIDRef="([^"]+)"', g).group(1)
        w = int(re.search(r'<hp:sz width="(\d+)"', g).group(1)) / 100
        if iid in self.sig_ids:
            return f'<img class="sig" src="{self.images[iid]}">'
        return f'<img src="{self.images[iid]}" style="width:{w}pt;max-width:100%">'

    def rect(self, g):
        fill = re.search(r'<hc:winBrush faceColor="([^"]+)"', g)
        hgt = int(re.search(r'<hp:sz width="\d+" widthRelTo="\w+" height="(\d+)"', g).group(1)) / 100
        inner = re.search(r"<hp:subList [^>]*>(.*)</hp:subList>", g, re.S).group(1)
        body = "".join(self.para(p) for p in top_elems(inner, "hp:p"))
        return (f'<div class="rect" style="background:{fill.group(1) if fill else "#eee"};min-height:{hgt}pt">'
                f'<div>{body}</div></div>')

    def table(self, g):
        tw = int(re.search(r'<hp:sz width="(\d+)"', g).group(1))
        rows = {}
        for tr in top_elems(g, "hp:tr"):
            for tc in top_elems(tr, "hp:tc"):
                c, r = map(int, re.search(r'colAddr="(\d+)" rowAddr="(\d+)"', tc).groups())
                cs, rs = map(int, re.search(r'colSpan="(\d+)" rowSpan="(\d+)"', tc).groups())
                w = int(re.search(r'<hp:cellSz width="(\d+)"', tc).group(1))
                bf = self.h.bf.get(re.search(r'borderFillIDRef="(\d+)"', tc).group(1), {})
                va = re.search(r'vertAlign="(\w+)"', tc).group(1).lower()
                mg = re.search(r'<hp:cellMargin left="(\d+)" right="(\d+)" top="(\d+)" bottom="(\d+)"', tc)
                head = 'header="1"' in tc[:200]
                sub = re.search(r"<hp:subList [^>]*>(.*)</hp:subList>", tc, re.S).group(1)
                body = "".join(self.para(p, in_cell=True) for p in top_elems(sub, "hp:p"))
                rows.setdefault(r, []).append((c, cs, rs, w, bf, va, mg, body, head))
        # 열 너비: 1칸짜리 셀 너비로 추정
        ncol = int(re.search(r'colCnt="(\d+)"', g).group(1))
        colw = [None] * ncol
        for r in rows.values():
            for c, cs, rs, w, *_ in r:
                if cs == 1 and colw[c] is None:
                    colw[c] = w
        known = sum(x for x in colw if x)
        miss = [i for i, x in enumerate(colw) if x is None]
        for i in miss:
            colw[i] = max(1, (tw - known) / len(miss))
        tot = sum(colw)
        h = [f'<table class="hx" style="width:{min(100, tw / 48188 * 100):.1f}%"><colgroup>'
             + "".join(f'<col style="width:{w / tot * 100:.2f}%">' for w in colw) + "</colgroup>"]
        head_rows = [r for r in sorted(rows) if all(x[8] for x in rows[r])]
        for r in sorted(rows):
            if r == (head_rows[0] if head_rows else -1):
                h.append("<thead>")
            h.append("<tr>")
            for c, cs, rs, w, bf, va, mg, body, head in sorted(rows[r]):
                st = f"vertical-align:{'middle' if va == 'center' else va};"
                if bf.get("fill"):
                    st += f"background:{bf['fill']};"
                for side, (typ, wid) in bf.get("borders", {}).items():
                    if typ == "NONE":
                        st += f"border-{side}:none;"
                    else:
                        st += f"border-{side}:{wid.replace(' ', '')} solid #000;"
                if mg:
                    l, rr, t, b = (int(x) / 100 for x in mg.groups())
                    st += f"padding:{t}pt {rr}pt {b}pt {l}pt;"
                h.append(f'<td colspan="{cs}" rowspan="{rs}" style="{st}">{body}</td>')
            h.append("</tr>")
            if head_rows and r == head_rows[-1]:
                h.append("</thead><tbody>")
        h.append("</tbody></table>" if head_rows else "</table>")
        return "".join(h)

    def para(self, p, in_cell=False):
        po = re.match(r"<hp:p [^>]*>", p).group()
        pp = self.h.pp.get(re.search(r'paraPrIDRef="(\d+)"', po).group(1))
        pb = 'pageBreak="1"' in po
        inner = p[len(po): p.rfind("</hp:p>")]
        lsm = re.search(r'<hp:linesegarray><hp:lineseg [^>]*vertsize="(\d+)"[^>]*spacing="(-?\d+)"', inner)
        pitch = (int(lsm.group(1)) + int(lsm.group(2))) / 100 if lsm else None
        inner = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", inner, flags=re.S)
        parts, blocks = [], []
        maxsz = 0
        maxsz_any = 0
        for run in top_elems(inner, "hp:run"):
            style, items = self.run_html(run)
            sz = re.search(r"font-size:([\d.]+)pt", style)
            if sz and not maxsz_any:
                maxsz_any = float(sz.group(1))
            for kind, x in items:
                if kind == "t":
                    if sz and x.strip():
                        maxsz = max(maxsz, float(sz.group(1)))
                    parts.append(f'<span style="{style}">{x}</span>')
                elif kind == "pic":
                    if 'class="sig"' in x and parts:
                        # 직전 '(서명 또는 인)' 위에 서명을 겹친다
                        last = parts[-1]
                        parts[-1] = re.sub(r"(\(서명 또는 인\)|\(인\)|\(서명\))(</span>)$",
                                           lambda m: f'<span class="sw">{m.group(1)}{x}</span>{m.group(2)}', last)
                    else:
                        parts.append(x)
                else:
                    blocks.append(x)
        st = []
        if pp:
            st.append(f"text-align:{ALIGN.get(pp['align'], 'left')};")
            it, lf = pp["intent"] / 100, pp["left"] / 100
            if it < 0:
                st.append(f"padding-left:{lf - it}pt;text-indent:{it}pt;")
            else:
                st.append(f"padding-left:{lf}pt;text-indent:{it}pt;")
            st.append(f"margin:{pp['prev'] / 100}pt 0 {pp['next'] / 100}pt 0;")
            if pp.get("keep"):
                st.append("break-after:avoid;")
            if pitch and not in_cell_obj(inner):
                st.append(f"line-height:{pitch:.1f}pt;")
            elif pp["ls_type"] == "PERCENT":
                st.append(f"line-height:{pp['ls'] / 100 * 1.0:.2f};")
        txt = "".join(parts)
        if pp and pp.get("numbered") and not in_cell:
            self.num += 1
            txt = f"<span>{self.num}. </span>" + txt
        out = ""
        if pb:
            out += '<div class="pb"></div>'
        if blocks:
            has_txt = re.sub(r"<[^>]+>|&nbsp;|\s", "", txt)
            floating = 'treatAsChar="0"' in inner
            objs = "".join(f'<div class="objwrap">{b}</div>' for b in blocks)
            if floating and has_txt:  # 글자 아래 떠 있는 표: 글자 먼저
                return out + f'<p style="{"".join(st)}">{txt}</p>' + objs
            out += objs
            if has_txt:
                out += f'<p style="{"".join(st)}">{txt}</p>'
            return out
        if not re.sub(r"<[^>]+>|&nbsp;|\s", "", txt) and '<img' not in txt:
            # 빈 문단: 글자 크기만큼 높이
            if pitch:
                return out + f'<p style="{"".join(st)}height:{pitch:.1f}pt;line-height:{pitch:.1f}pt"><span style="font-size:1pt">&nbsp;</span></p>'
            return out + f'<p style="{"".join(st)}"><span style="font-size:{maxsz or maxsz_any or 10}pt">&nbsp;</span></p>'
        return out + f'<p style="{"".join(st)}">{txt}</p>'

    def page_css(self, sec, tight=False):
        m = re.search(r'<hp:margin header="(\d+)" footer="(\d+)" gutter="\d+" left="(\d+)" right="(\d+)" top="(\d+)" bottom="(\d+)"/>', sec)
        hd, ft, l, r, t, b = (int(x) / 7200 * 25.4 for x in m.groups())
        if tight:  # 꼬리말이 없는 서식: 꼬리말 영역까지 본문으로(PDF 사본만)
            return f"@page {{ size:A4; margin:{t + hd:.1f}mm {r:.1f}mm {max(6.0, b - 2):.1f}mm {l:.1f}mm; }}"
        return f"@page {{ size:A4; margin:{t + hd:.1f}mm {r:.1f}mm {b + ft:.1f}mm {l:.1f}mm; }}"

    def document(self, sec, title, page_numbers=False, tight=False):
        body = "".join(self.para(p) for p in top_elems(sec, "hp:p"))
        pn = ("@page { @bottom-center { content: '- ' counter(page) ' -'; font-family:'HY신명조','Batang',serif; font-size:9pt; } }"
              if page_numbers else "")
        css = f"""{self.page_css(sec, tight)} {pn}
* {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }}
body {{ margin:0; font-family:'HY신명조','Batang',serif; color:#000; }}
p {{ margin:0; word-break:keep-all; overflow-wrap:break-word; }}
table.hx {{ border-collapse:collapse; margin:0; table-layout:fixed; }}
table.hx td {{ border:0.15mm solid #000; word-break:keep-all; overflow-wrap:break-word; }}
table.hx tr {{ break-inside:avoid; }}
thead {{ display:table-header-group; }}
.objwrap {{ margin:0; }}
.rect {{ display:flex; align-items:center; padding:2.8pt 6pt; margin:2pt 0 4pt; }}
.rect > div {{ width:100%; }}
.pb {{ break-before:page; }}
.sw {{ position:relative; display:inline-block; }}
.sig {{ position:absolute; left:50%; top:50%; height:13mm; transform:translate(-50%,-50%); }}
"""
        return f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{css}</style></head><body>{body}</body></html>'


def data_uri(b):
    return "data:image/png;base64," + base64.b64encode(b).decode()
