"""4x 업스케일본 -> A1 비율 7016x9933(300dpi) -> 한글 타이포 후합성.
사용: python make_poster.py raw/v1_2_x4.png out.jpg [out.png]
폰트 2종: Noto Serif KR(헤드라인) · Noto Sans KR(본문).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SERIF = r"C:\Windows\Fonts\NotoSerifKR-VF.ttf"
SANS = r"C:\Windows\Fonts\NotoSansKR-VF.ttf"
W, H = 7016, 9933                      # A1 594 x 841 mm @ 300dpi
BAND = 1320
CREAM = (244, 236, 216)
DIM = (196, 202, 226)
PAPER = (239, 231, 211)
INK = (27, 39, 98)
GREY = (104, 108, 128)


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


def runs(d, xy, parts, f, tr=0.0):
    """[(text, color), ...] 를 한 줄로 이어 쓰기."""
    x, y = xy
    for t, c in parts:
        x = tracked(d, (x, y), t, f, c, tr) + tr * f.size
    return x


def grain(im, amt, seed):
    a = np.asarray(im).astype(np.int16)
    n = np.random.default_rng(seed).normal(0, amt, a.shape[:2])[..., None]
    return Image.fromarray(np.clip(a + n, 0, 255).astype(np.uint8))


def build(src, out, out_png=None):
    up = Image.open(src).convert("RGB")
    sh = round(up.height * W / up.width)
    up = up.resize((W, sh), Image.LANCZOS)
    art_h = H - BAND
    art = up.crop((0, sh - art_h, W, sh))           # 위(하늘)를 잘라 맞춤
    art = art.filter(ImageFilter.GaussianBlur(0.6))   # 업스케일 과선명 완화
    art = grain(art, 6, 11)

    a = np.asarray(art)
    sky = tuple(int(v) for v in np.median(a[200:600, 2500:4500].reshape(-1, 3), axis=0))
    win = a.reshape(-1, 3).astype(int)
    m = (win[:, 0] > 215) & (win[:, 1] > 150) & (win[:, 1] < 205) & (win[:, 2] < 130)
    amber = tuple(int(v) for v in np.median(win[m], axis=0)) if m.sum() > 1000 else (246, 184, 90)
    print("sky", sky, "amber", amber)

    im = Image.new("RGB", (W, H), PAPER)
    im.paste(art, (0, 0))
    band = grain(Image.new("RGB", (W, BAND), PAPER), 5, 12)
    im.paste(band, (0, art_h))
    d = ImageDraw.Draw(im)
    M = 560

    # 하늘: 머리말 + 헤드라인
    k = font(SANS, 132, 500)
    tracked(d, (M, 360), "주거실태조사는 해마다 전국 6만 1천 가구의 문을 두드립니다", k, DIM, tr=0.0)
    h1 = font(SERIF, 670, 800)
    tracked(d, (M - 24, 560), "한 집이 대답하면", h1, CREAM, tr=-0.045)
    runs(d, (M - 24, 560 + 820), [("365", amber), ("집이 보입니다", CREAM)], h1, tr=-0.045)

    # 하단 종이 띠
    y = art_h + 150
    b1 = font(SANS, 118, 700)
    tracked(d, (M, y), "전국 약 2,229만 가구 가운데 조사원이 찾아가는 집은 6만 1천 가구.", b1, INK, tr=-0.02)
    runs(d, (M, y + 175), [("그래서 문을 연 한 집의 대답이 평균 ", INK), ("365가구", (196, 112, 24)),
                            ("의 방 크기·집세·이사 계획을 대신합니다.", INK)], b1, tr=-0.02)
    b2 = font(SANS, 100, 400)
    tracked(d, (M, y + 395), "그 대답이 모여 최저주거기준 미달가구를 세고(2024년 3.8%, 청년 8.2%), 주택정책의 근거가 됩니다.",
            b2, INK, tr=-0.02)
    d.line([(M, y + 600), (W - M, y + 600)], fill=(INK[0], INK[1], INK[2]), width=6)
    cta = font(SANS, 150, 800)
    tracked(d, (M, y + 680), "조사원이 찾아오면, 365집을 대신해 답해 주세요.", cta, INK, tr=-0.03)
    org = font(SANS, 110, 800)
    tracked(d, (W - M, y + 706), "주거실태조사", org, (196, 112, 24), align="r")
    fn = font(SANS, 58, 400)
    tracked(d, (M, H - 150),
            "* 365가구: 2024년 일반가구 약 2,229만(1인가구 804.5만=36.1%로 환산, 국가데이터처) ÷ 2024년도 주거실태조사 표본 6만 1천 가구(국토교통부). "
            "평균값이며 실제 가중치는 가구마다 다릅니다.", fn, GREY)

    im.save(out, quality=93, dpi=(300, 300), subsampling=0)
    if out_png:
        im.save(out_png, dpi=(300, 300))
    print(out, im.size)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
