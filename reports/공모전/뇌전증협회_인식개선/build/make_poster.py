"""포스터 「붙잡지 말고, 재세요」 — A3 세로 300dpi(3508x4961) 합성.
실행: python build/make_poster.py <raw 이미지 경로> [출력 이름]
일러스트(gpt-image) 위에 한글 문구를 Pillow로 합성. 폰트: Noto Sans KR(가변, 굵기만 바꿔 1종).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 3508, 4961
FONT = r"C:\Windows\Fonts\NotoSansKR-VF.ttf"
VIOLET = (58, 32, 102)
VIOLET_D = (40, 22, 72)
CREAM = (246, 239, 226)
ORANGE = (204, 92, 44)
INK = (33, 24, 44)


def font(size, wght):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([wght])
    except Exception:
        pass
    return f


def tw(d, s, f):
    return d.textlength(s, font=f)


def _soft_light(img, n):
    """아주 약한 종이 결: 노이즈를 3.5%만 섞는다."""
    return Image.merge("RGB", [Image.blend(ch, n, 0.035) for ch in img.split()])


def main():
    src = Path(sys.argv[1])
    name = sys.argv[2] if len(sys.argv) > 2 else "poster"
    L = dict(top_crop=float(sys.argv[3]) if len(sys.argv) > 3 else 0.0)
    art = Image.open(src).convert("RGB")
    # 폭 맞춤 확대 후 위쪽 여백 일부를 잘라 세로 비율을 A3에 맞춘다
    s = W / art.width
    art = art.resize((W, round(art.height * s)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 40, 3))
    panel_h = int(__import__("os").environ.get("PANEL", 1150))
    avail = H - panel_h
    extra = art.height - avail
    top = int(max(0, min(extra, extra * L["top_crop"])))
    canvas = Image.new("RGB", (W, H), CREAM)
    canvas.paste(art.crop((0, top, W, top + avail)), (0, 0))
    d = ImageDraw.Draw(canvas)

    M = 250  # 좌우 여백
    # ── 상단 문구 ──
    k = font(92, 600)
    d.text((M, 250), "뇌전증 발작을 목격했다면", font=k, fill=VIOLET)
    d.rectangle((M, 250 + 140, M + 120, 250 + 152), fill=ORANGE)
    hb = font(400, 900)
    y = 470
    d.text((M - 14, y), "붙잡지 말고,", font=hb, fill=VIOLET_D)
    y += 470
    d.text((M - 14, y), "재세요.", font=hb, fill=ORANGE)
    sub = font(100, 500)
    y += 560
    for line in ["발작은 대개 몇 분 안에 저절로 멈춥니다.", "도와주고 싶은 손이 할 일은 하나, 시간을 재는 것."]:
        d.text((M, y), line, font=sub, fill=INK)
        y += 150

    # ── 하단 패널 ──
    py = H - panel_h
    d.rectangle((0, py, W, H), fill=VIOLET_D)
    # 타임라인 0분 → 5분
    ty = py + 210
    x0, x1 = M + 40, W - M - 40
    d.line((x0, ty, x1, ty), fill=CREAM, width=14)
    for i in range(6):
        x = x0 + (x1 - x0) * i / 5
        d.line((x, ty - (46 if i in (0, 5) else 26), x, ty + (46 if i in (0, 5) else 26)), fill=CREAM, width=12 if i in (0, 5) else 8)
    d.ellipse((x0 - 34, ty - 34, x0 + 34, ty + 34), fill=ORANGE)
    lab = font(70, 700)
    small = font(62, 500)
    d.text((x0 - 34, ty - 170), "0분 · 스톱워치 시작", font=lab, fill=CREAM)
    t5 = "5분이 넘으면 119"
    d.rounded_rectangle((x1 - tw(d, t5, lab) - 70, ty - 196, x1 + 30, ty - 76), 26, fill=ORANGE)
    d.text((x1 - tw(d, t5, lab) - 20, ty - 182), t5, font=lab, fill=CREAM)
    d.text((x0 - 34, ty + 80), "대부분 이 안에 멈춥니다. 끝날 때까지 곁에 있어 주세요.", font=small, fill=(214, 200, 232))

    # 두 칸: 재는 동안 / 하지 마세요
    cy = ty + 260
    colw = (W - 2 * M - 140) // 2
    hx = [M, M + colw + 140]
    hd = font(80, 800)
    it = font(66, 500)
    d.text((hx[0], cy), "재는 동안", font=hd, fill=CREAM)
    d.text((hx[1], cy), "하지 마세요", font=hd, fill=(255, 176, 140))
    left = ["주변의 위험한 물건 치우기", "머리 밑에 겉옷 받치기", "멈춘 뒤 의식이 없으면 옆으로 눕히기"]
    right = ["입에 아무것도 넣지 않기", "몸을 꽉 붙잡지 않기", "발작 중 가슴 압박(심폐소생술) 하지 않기*"]
    for col, items in ((0, left), (1, right)):
        yy = cy + 135
        for s_ in items:
            cx, cy_ = hx[col] + 30, yy + 48
            if col == 0:
                d.ellipse((cx - 24, cy_ - 24, cx + 24, cy_ + 24), outline=CREAM, width=9)
            else:
                for a, b in (((cx - 22, cy_ - 22), (cx + 22, cy_ + 22)), ((cx - 22, cy_ + 22), (cx + 22, cy_ - 22))):
                    d.line((a, b), fill=(255, 176, 140), width=11)
            d.text((hx[col] + 90, yy), s_, font=it, fill=CREAM)
            yy += 100
    foot = font(46, 400)
    d.text((M, H - 150), "* 발작이 끝난 뒤 1분 넘게 숨을 쉬지 않으면 119에 신고하고 심폐소생술을 하세요.  "
           "의식이 돌아오기 전에 또 발작하거나, 다쳤거나, 물속이라면 바로 119.", font=foot, fill=(190, 176, 210))
    d.text((M, H - 88), "응급처치 기준: 한국뇌전증협회·행정안전부 「뇌전증 발작 응급 수칙」(함께·안전하게·옆으로)",
           font=foot, fill=(150, 136, 172))

    canvas = _soft_light(canvas, Image.effect_noise((W, H), 30).convert("L"))
    out = ROOT / "build" / f"{name}.png"
    canvas.save(out, dpi=(300, 300))
    jpg = ROOT / "제출" / f"{name}.jpg"
    canvas.save(jpg, "JPEG", quality=92, dpi=(300, 300), subsampling=0)
    print(jpg)
    canvas.resize((W // 4, H // 4), Image.LANCZOS).save(ROOT / "build" / f"{name}_s.png")
    print(out)


if __name__ == "__main__":
    main()
