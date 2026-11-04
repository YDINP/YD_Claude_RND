"""떡비 달력 삽화: 생성 원화 → 3000x1875px(254x158.75mm @300dpi, 규격 240x150mm 이상) + 한글 후합성.
글꼴 2종: 제목 Song Myung, 본문 Gowun Batang(Regular/Bold) — 모두 SIL OFL."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
A = HERE / "assets"
W, H = 3000, 1875

F_TITLE = str(A / "SongMyung-Regular.ttf")
F_BODY = str(A / "GowunBatang-Regular.ttf")
F_BOLD = str(A / "GowunBatang-Bold.ttf")

INK = (34, 33, 44)
MUTED = (70, 72, 86)
PERSIMMON = (182, 74, 32)


def fit(src, top_bias):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    ch = round(w * H / W)
    top = round((h - ch) * top_bias)
    return im.crop((0, top, w, top + ch)).resize((W, H), Image.LANCZOS)


def tracked(draw, xy, text, font, fill, track=0):
    """자간(track px) 적용 글자 그리기. 반환: 끝 x."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + track
    return x - track


class Layer:
    """글자를 별도 마스크에 모아 한 번에 은은한 종이빛 번짐(halo)을 깔고 그 위에 글자를 얹는다."""

    def __init__(self, size):
        self.mask = Image.new("L", size, 0)
        self.ink = Image.new("RGBA", size, (0, 0, 0, 0))
        self.md, self.idraw = ImageDraw.Draw(self.mask), ImageDraw.Draw(self.ink)

    def text(self, xy, s, font, fill, track=0):
        tracked(self.md, xy, s, font, 255, track)
        return tracked(self.idraw, xy, s, font, fill + (255,), track)

    def rule(self, box, fill):
        self.md.rectangle(box, fill=255)
        self.idraw.rectangle(box, fill=fill + (255,))

    def apply(self, base, glow=(232, 234, 238), radius=26, strength=0.55):
        halo = self.mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(radius))
        halo = halo.point(lambda v: int(v * strength))
        base.paste(Image.new("RGB", base.size, glow), (0, 0), halo)
        base.paste(self.ink, (0, 0), self.ink)
        return base


def compose(src, out, top_bias=0.25, x0=190, y0=96):
    im = fit(src, top_bias)
    L = Layer(im.size)
    d = L.idraw
    f_month = ImageFont.truetype(F_BOLD, 50)
    f_title = ImageFont.truetype(F_TITLE, 300)
    f_read = ImageFont.truetype(F_BODY, 50)
    f_say = ImageFont.truetype(F_BOLD, 54)
    f_def = ImageFont.truetype(F_BODY, 52)
    f_src = ImageFont.truetype(F_BODY, 36)

    # 11월 라벨 (자간 넓게)
    L.text((x0 + 10, y0), "11월", f_month, PERSIMMON, track=2)

    # 제목 — 글자 사이를 살짝 좁혀 한 덩어리로
    ty = y0 + 56
    title_end = L.text((x0, ty), "떡비", f_title, INK, track=-6)
    tb = d.textbbox((x0, ty), "떡비", font=f_title)
    top_ink, bot_ink = tb[1], tb[3]

    # 제목 오른쪽: 발음 + 짝말 두 줄 (제목 높이 안에 세로 중앙 정렬)
    rx = title_end + 70
    block = [("[떡삐]", f_read, MUTED, 6, 0), ("여름비는 잠비,", f_say, PERSIMMON, 2, 34), ("가을비는 떡비", f_say, PERSIMMON, 2, 18)]
    heights = [d.textbbox((0, 0), s, font=f)[3] for s, f, *_ in block]
    total = sum(heights) + sum(g for *_, g in block)
    y = top_ink + (bot_ink - top_ink - total) // 2 - 10
    for (s, f, c, tr, gap), h in zip(block, heights):
        y += gap
        L.text((rx, y), s, f, c, track=tr)
        y += h

    # 가는 선 + 사전 뜻풀이(표준국어대사전 원문 그대로)
    ry = bot_ink + 46
    L.rule((x0 + 10, ry, x0 + 10 + 120, ry + 4), INK)
    y = ry + 36
    lines = ["떡이나 먹을 수 있게 하는 비라는 뜻으로,", "가을비를 이르는 말."]
    first_end = 0
    for i, line in enumerate(lines):
        e = L.text((x0 + 10, y), line, f_def, INK, track=1)
        first_end = first_end or e
        if i == len(lines) - 1:  # 출처는 마지막 줄 오른쪽 끝, 첫 줄 끝선에 맞춤
            sw = d.textlength("표준국어대사전", font=f_src) + 6 * 4
            L.text((first_end - sw, y + 14), "표준국어대사전", f_src, MUTED, track=4)
        y += 84  # 행간 약 1.6

    L.apply(im)
    im.save(out, quality=95, subsampling=0, dpi=(300, 300))
    print(out, im.size)
    return im


if __name__ == "__main__":
    import sys
    S = HERE / "시안"
    for name in (sys.argv[1:] or ["J_0", "I_0"]):
        compose(S / f"{name}.png", S / f"{name[0]}_합성.jpg")
