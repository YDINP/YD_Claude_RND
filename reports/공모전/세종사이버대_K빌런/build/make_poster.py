"""시안 PNG -> 3:4 크롭/업스케일 -> 한글 타이포 후합성 -> final/ 저장.
사용: python make_poster.py raw/r2_A.png y0 out.png
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
F_B = r"C:\Windows\Fonts\malgunbd.ttf"   # 맑은 고딕 Bold
F_R = r"C:\Windows\Fonts\malgun.ttf"     # 맑은 고딕 Regular
W, H = 1800, 2400
CREAM = (246, 233, 205); ORANGE = (241, 112, 48)

def tracked(draw, xy, text, font, fill, track=0.0, anchor_right=False, space=1.0):
    """자간(track = 글자 크기 대비 비율) 적용해 한 글자씩 그림. 폭 반환."""
    size = font.size; x, y = xy
    widths = [draw.textlength(c, font=font) * (space if c == " " else 1) for c in text]
    total = sum(widths) + track * size * (len(text) - 1)
    if anchor_right: x -= total
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=font, fill=fill); x += w + track * size
    return total

def width_of(draw, text, font, track):
    return sum(draw.textlength(c, font=font) for c in text) + track * font.size * (len(text) - 1)

def build(src, y0, out, layout):
    im = Image.open(src).convert("RGB")
    w, h = im.size; ch = round(w * 4 / 3)
    im = im.crop((0, y0, w, y0 + ch)).resize((W, H), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    d = ImageDraw.Draw(im)
    M = 132  # 좌우 여백
    k = ImageFont.truetype(F_R, 34); hb = ImageFont.truetype(F_B, layout.get("hsize", 156)); s = ImageFont.truetype(F_R, 40)
    y = layout.get("top", 104)
    tracked(d, (M, y), "K-빌런의 21세기 서울 상륙 작전  ·  「해와 달이 된 오누이」의 호랑이", k, CREAM, track=0.02)
    y += 34 + layout.get("kgap", 50)
    tr = layout.get("htrack", -0.05)
    lead = round(hb.size * layout.get("lead", 1.13))
    tracked(d, (M - 8, y), "한 편만 더 보면", hb, CREAM, track=tr, space=0.75)
    tracked(d, (M - 8, y + lead), "안 잡아먹지", hb, ORANGE, track=tr, space=0.75)
    # 보조 문구: 둘째 줄 기준선에 맞춰 오른쪽 정렬
    asc, desc = hb.getmetrics(); base2 = y + lead + asc
    sa, sd = s.getmetrics(); lines = layout.get("sub", ["호랑이는 한 번에 잡아먹지 않는다.", "고개마다 하나씩 받아 갈 뿐."])
    ls = 62
    for i, line in enumerate(reversed(lines)):
        tracked(d, (W - M, base2 - sa - i * ls - layout.get("subup", 28)), line, s, CREAM, track=-0.01, anchor_right=True)
    im.save(out, dpi=(300, 300), optimize=True)
    print(out, im.size)

if __name__ == "__main__":
    import json
    lay = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
    build(sys.argv[1], int(sys.argv[2]), sys.argv[3], lay)
