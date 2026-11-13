"""A1 엠블럼: Noto Sans KR(OFL) 글자를 윤곽선 path로 변환해 폰트 의존 없는 SVG 생성 → PNG 300dpi
실행: python make_emblem.py <NotoSansKR-VF.ttf 경로>
"""
import sys, subprocess
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

HERE = Path(__file__).parent; OUT = HERE.parent / "제출"; OUT.mkdir(exist_ok=True)
NAVY, TEAL = "#0B2E6F", "#00A6A6"
src = sys.argv[1]
fonts = {w: instantiateVariableFont(TTFont(src), {"wght": w}) for w in (600, 700, 800)}

def text_path(s, w, size, cx, baseline, track=0.0):
    f = fonts[w]; gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f["head"].unitsPerEm
    sc = size / upm; adv = [f["hmtx"][cmap[ord(c)]][0] * sc + track for c in s]
    total = sum(adv) - track; x = cx - total / 2; ds = []
    for c, a in zip(s, adv):
        g = cmap[ord(c)]; pen = SVGPathPen(gs); gs[g].draw(pen)
        d = pen.getCommands()
        if d: ds.append(f'<path transform="translate({x:.2f},{baseline:.2f}) scale({sc:.5f},{-sc:.5f})" d="{d}"/>')
        x += a
    return "".join(ds)

def emblem(caption=True, bg="#ffffff"):
    fade = f'<linearGradient id="vf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{TEAL}"/><stop offset="1" stop-color="{TEAL}" stop-opacity="0"/></linearGradient>'
    body = (f'<path d="M262 220 H182 V690 H262" fill="none" stroke="{NAVY}" stroke-width="46"/>'
            f'<g fill="{NAVY}">{text_path("50", 800, 340, 500, 590, -10)}</g>'
            f'<path d="M738 220 H841" stroke="{TEAL}" stroke-width="46"/><rect x="795" y="243" width="46" height="447" fill="url(#vf)"/>')
    if caption:
        body += (f'<g fill="{NAVY}">{text_path("1977 — 2027", 600, 44, 500, 800, 8)}</g>'
                 f'<g fill="{NAVY}">{text_path("한국연구재단 창립 50주년", 700, 44, 500, 872, 0)}</g>')
    bgr = f'<rect width="1000" height="1000" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><defs>{fade}</defs>{bgr}{body}</svg>'

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
def render(name, svg, px=3000):
    p = OUT / f"{name}.svg"; p.write_text(svg, encoding="utf-8")
    html = HERE / f"_{name}.html"
    html.write_text(f'<html><body style="margin:0"><img src="{p.as_uri()}" style="width:{px}px;height:{px}px;display:block"></body></html>', encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={px},{px}",
                    f"--screenshot={OUT / (name + '.png')}", html.as_uri()], capture_output=True)
    print(name, (OUT / (name + ".png")).exists())

render("엠블럼_열린괄호", emblem())
render("엠블럼_A1_심볼만", emblem(caption=False))
