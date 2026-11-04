"""시안 PNG -> 176x250mm(300dpi, 2079x2953) 크롭·업스케일 -> 한글 타이포 후합성.
사용: python make_poster.py raw/v1_1.png y0 out.jpg
폰트 2종: Noto Serif KR(헤드라인) · Noto Sans KR(본문).
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

SERIF = r"C:\Windows\Fonts\NotoSerifKR-VF.ttf"
SANS = r"C:\Windows\Fonts\NotoSansKR-VF.ttf"
W, H = 2079, 2953                     # 176 x 250 mm @ 300dpi
CREAM = (244, 236, 214); YEL = (232, 240, 60); DIM = (214, 210, 196)


def font(path, size, wght):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_axes([wght])
    except Exception:
        pass
    return f


def tw(d, t, f, tr):
    return sum(d.textlength(c, font=f) for c in t) + tr * f.size * (len(t) - 1)


def tracked(d, xy, t, f, fill, tr=0.0, align="l"):
    x, y = xy
    if align == "r":
        x -= tw(d, t, f, tr)
    elif align == "c":
        x -= tw(d, t, f, tr) / 2
    for c in t:
        d.text((x, y), c, font=f, fill=fill)
        x += d.textlength(c, font=f) + tr * f.size
    return x


def grain(im, amt=7):
    a = np.asarray(im).astype(np.int16)
    n = np.random.default_rng(7).normal(0, amt, a.shape[:2])[..., None]
    return Image.fromarray(np.clip(a + n, 0, 255).astype(np.uint8))


BAND = 230


def retouch(im):
    """v2_2 시안의 가짜 글자 자국 2곳만 색 조건으로 지우기(엔진 덮개 'ILL' 모양 선, 조끼 옆 노란 점)."""
    a = np.asarray(im).astype(np.float32).copy()
    rng = np.random.default_rng(3)
    # 엔진 덮개: 영역 안 어두운 선 픽셀만 덮개 색으로
    y0, y1, x0, x1 = 1790, 1822, 1123, 1146
    reg = a[y0:y1, x0:x1]
    body = np.median(a[1795:1815, 1162:1180].reshape(-1, 3), axis=0)
    m = reg.sum(axis=2) < body.sum() * 0.82
    reg[m] = body + rng.normal(0, 5, (m.sum(), 3))
    # 조끼 옆 노란 점: 남색 소매 영역(사선 띠) 안에서 남색과 다른 픽셀을 마스크로 인페인트
    import cv2
    img = np.clip(a, 0, 255).astype(np.uint8)
    navy = np.median(img[2140:2150, 900:910].reshape(-1, 3), axis=0)
    mask = np.zeros(img.shape[:2], np.uint8)
    poly = np.array([[884, 2150], [896, 2150], [893, 2208], [876, 2208], [876, 2185]], np.int32)
    cv2.fillPoly(mask, [poly], 1)
    diff = np.abs(img.astype(np.int16) - navy).sum(axis=2) > 45
    mask = (mask.astype(bool) & diff).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    img = cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)
    a = img.astype(np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def build(src, y0, out, xm=16, bottom=17, top_y=None):
    im0 = Image.open(src).convert("RGB")
    w, h = im0.size
    cw = w - 2 * xm
    ch = round(cw * (H - BAND) / W)
    yb = h - bottom
    art = im0.crop((xm, yb - ch, w - xm, yb)).resize((W, H - BAND), Image.LANCZOS)
    art = art.filter(ImageFilter.UnsharpMask(radius=1.4, percent=45, threshold=2))
    im = Image.new("RGB", (W, H), (30, 30, 62))
    im.paste(art, (0, 0))
    if "v2_2" in src:
        im = retouch(im)
    im = grain(im, 5)
    d = ImageDraw.Draw(im)
    M = 150
    k = font(SANS, 40, 500)
    y = top_y or 190
    tracked(d, (M, y), "전남자치경찰 바로알기  ·  국가경찰과 무엇이 다른가", k, DIM, tr=0.02)
    h1 = font(SERIF, 184, 800)
    y += 110
    L = 236
    tracked(d, (M - 6, y), "자치경찰은", h1, CREAM, tr=-0.04)
    x = tracked(d, (M - 6, y + L), "사고 ", h1, CREAM, tr=-0.04)
    x = tracked(d, (x - 8, y + L), "‘전’", h1, YEL, tr=-0.04)
    tracked(d, (x + 2, y + L), "에", h1, CREAM, tr=-0.04)
    tracked(d, (M - 6, y + 2 * L), "출동합니다", h1, CREAM, tr=-0.04)
    b = font(SANS, 45, 400)
    lines = ["해 질 녘 농로, 경운기 뒤판에 붙인 반사지 한 줄.",
             "범인을 쫓기 전에 우리 동네의 위험을 먼저 찾는 일,",
             "생활안전 · 교통 · 어르신과 아이 보호가 자치경찰의 일입니다."]
    yb2 = y + 2 * L + 300
    for i, t in enumerate(lines):
        tracked(d, (M, yb2 + i * 76), t, b, CREAM, tr=-0.01)
    # 하단 띠
    top = H - BAND
    s = font(SANS, 32, 400)
    tracked(d, (M, top + 58), "농기계 교통사고 100건당 사망 15명  (2020~2024, 도로교통공단 TAAS)", s, DIM)
    st = font(SANS, 52, 700)
    tracked(d, (M, top + 118), "우리 곁엔 전남자치경찰, 치안의 가치를 더하다", st, CREAM, tr=-0.01)
    org = font(SANS, 40, 700)
    tracked(d, (W - M, top + 126), "전남자치경찰위원회", org, YEL, align="r")
    im.save(out, quality=95, dpi=(300, 300), subsampling=0)
    print(out, im.size)


if __name__ == "__main__":
    build(sys.argv[1], 0, sys.argv[2])
