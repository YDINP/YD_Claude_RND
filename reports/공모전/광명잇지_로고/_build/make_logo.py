"""광명잇지 로고: '잇'의 받침 ㅅ을 두 색 획(기업=파랑, 시민=주황)이 만나는 심볼로 교체.
Noto Sans KR(OFL)을 윤곽선 path로 바꿔 폰트 의존 없는 SVG → Chrome 헤드리스로 PNG.
실행: python make_logo.py
"""
import subprocess
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.recordingPen import RecordingPen

HERE = Path(__file__).parent; OUT = HERE.parent / "시안"; OUT.mkdir(exist_ok=True)
FONT = "C:/Windows/Fonts/NotoSansKR-VF.ttf"
INK = "#1B2A4A"
BLUE_A, BLUE_B = "#004896", "#0A8FD0"      # 광명시 CI 파랑(미래·비전)
ORG_A, ORG_B = "#F07E00", "#FCC21E"        # 광명시 CI 주황(빛)
GREEN = "#8DC21F"                          # 광명시 CI 녹색(자연)
fonts = {w: instantiateVariableFont(TTFont(FONT), {"wght": w}) for w in (500, 800)}
UPM = fonts[800]["head"].unitsPerEm

def contours(f, ch):
    gs = f.getGlyphSet(); rp = RecordingPen(); gs[f.getBestCmap()[ord(ch)]].draw(rp)
    out, cur = [], []
    for op, a in rp.value:
        cur.append((op, a))
        if op in ("closePath", "endPath"): out.append(cur); cur = []
    return out

def cmds(cs):
    pen = SVGPathPen(None)
    for c in cs:
        for op, a in c: getattr(pen, op)(*a)
    return pen.getCommands()

def defs():
    return (f'<linearGradient id="gb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{BLUE_A}"/><stop offset="1" stop-color="{BLUE_B}"/></linearGradient>'
            f'<linearGradient id="go" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{ORG_B}"/><stop offset="1" stop-color="{ORG_A}"/></linearGradient>')

def siot(x0=132, x1=859, y0=-89, y1=265, w=170):
    """받침 ㅅ 심볼 (폰트 좌표, y 위쪽). 왼다리=파랑 직선, 오른다리=주황 곡선(CI 날개 곡선 인용).
    두 다리가 꼭짓점 세로선에서 맞물림 → 지붕(Ground)·위로 솟는 화살촉(Growth)·만남(잇다)."""
    ax = (x0 + x1) / 2 - 15; P = (ax, y1)
    k = (y1 - y0) / (ax - x0); J = (ax, y1 - w * k)          # 안쪽 꼭짓점
    left = f'<path d="M{P[0]},{P[1]} L{x0},{y0} L{x0+w},{y0} L{J[0]},{J[1]} Z" fill="url(#gb)"/>'
    cx, cy = ax + (x1 - ax) * 0.30, y0 + (y1 - y0) * 0.25      # 오른쪽 곡선 조절점(아래로 처지는 날개)
    right = (f'<path d="M{P[0]},{P[1]} Q{cx+w*0.55},{cy+w*0.35} {x1},{y0} L{x1-w},{y0} '
             f'Q{cx-w*0.10},{cy-w*0.05} {J[0]},{J[1]} Z" fill="url(#go)"/>')
    return "", left + right

def word(s, w, size, x, base, fill=INK, track=0, special=None, colors=None):
    """s를 x(왼쪽)부터 그림. special=글자 → 그 글자의 받침 ㅅ 윤곽(1,2번)을 심볼로 교체."""
    f = fonts[w]; cm = f.getBestCmap(); sc = size / UPM; parts, extra = [], ""
    for ch in s:
        adv = f["hmtx"][cm[ord(ch)]][0]
        cs = contours(f, ch); T = f'translate({x:.2f},{base:.2f}) scale({sc:.5f},{-sc:.5f})'
        if ch == special:
            keep = [c for i, c in enumerate(cs) if i not in (1, 2)]
            clip, sym = siot()
            extra = clip
            parts.append(f'<g transform="{T}"><path fill="{fill}" d="{cmds(keep)}"/>{sym}</g>')
        else:
            parts.append(f'<path transform="{T}" fill="{(colors or {}).get(ch, fill)}" d="{cmds(cs)}"/>')
        x += adv * sc + track
    return "".join(parts), extra, x

def width(s, w, size, track=0):
    f = fonts[w]; cm = f.getBestCmap()
    return sum(f["hmtx"][cm[ord(c)]][0] for c in s) * size / UPM + track * (len(s) - 1)

def svg(W, H, body, extra="", bg="#ffffff"):
    b = f'<rect width="{W}" height="{H}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><defs>{defs()}{extra}</defs>{b}{body}</svg>'

def lockup_h(bg="#ffffff", ink=INK):
    """가로형: 광명잇지 + 아래 GM It'G"""
    size = 300; W, H = 1600, 640
    tw = width("광명잇지", 800, size, -6); x = (W - tw) / 2
    k, extra, _ = word("광명잇지", 800, size, x, 360, ink, -6, special="잇")
    ew = width("GM It'G", 500, 92, 14)
    e, _, _ = word("GM It'G", 500, 92, (W - ew) / 2, 520, ink, 14, colors={"'": GREEN})
    return svg(W, H, k + e, extra, bg)

def symbol(bg="#ffffff"):
    """심볼 단독: 받침 ㅅ만 크게 (앱 아이콘·파비콘용)"""
    clip, sym = siot()
    sc = 1.0; tx, ty = 1000 / 2 - 480 * sc, 588
    return svg(1000, 1000, f'<g transform="translate({tx},{ty}) scale({sc},{-sc})">{sym}</g>', clip, bg)

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
def render(name, s, W, H, k=3):
    p = OUT / f"{name}.svg"; p.write_text(s, encoding="utf-8")
    html = HERE / f"_{name}.html"
    html.write_text(f'<html><body style="margin:0"><img src="{p.as_uri()}" style="width:{W*k}px;height:{H*k}px;display:block"></body></html>', encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={W*k},{H*k}",
                    f"--screenshot={OUT / (name + '.png')}", html.as_uri()], capture_output=True)
    print(name, (OUT / (name + ".png")).exists())

if __name__ == "__main__":
    render("로고_가로형", lockup_h(), 1600, 640)
    render("로고_가로형_반전", lockup_h("#1B2A4A", "#ffffff"), 1600, 640)
    render("로고_심볼", symbol(), 1000, 1000)
