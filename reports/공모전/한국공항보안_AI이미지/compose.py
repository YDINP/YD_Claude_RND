"""생성 일러스트 + 한글 문구 + AI 고지 문구 + AI 워터마크 → A3 가로 300dpi 최종 이미지.
사용: python compose.py raw/v3_1.png [shift]
  shift: 원본을 오른쪽으로 밀어 글자 영역을 넓힐 비율(0~0.2, 기본 0). 밀린 왼쪽은 원본 왼쪽 끝 색으로 채움.
글꼴은 맑은 고딕 한 벌(굵게/보통)만 사용.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).parent
W, H = 4961, 3508                      # A3 가로 420x297mm @300dpi
BOLD, REG = "C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf"
OUT = HERE / "제출" / "작품_첫번째보안검색대는오늘밤당신의방_박용진.jpg"
NOTICE = "본 작품은 생성형 AI기술을 활용하여 제작되었음."

CREAM = (244, 236, 220, 255)
SOFT = (222, 216, 204, 255)
OCHRE = (229, 172, 92, 255)
M = 360                                # 바깥 여백(약 30mm)


def F(p, s):
    return ImageFont.truetype(p, s)


def tw(s, f, tr):
    return sum(f.getlength(c) for c in s) + tr * (len(s) - 1)


def draw_t(d, x, y, s, f, fill, tr=0):
    """자간(tr px) 적용 글자 쓰기. y = 글자 윗선."""
    for c in s:
        d.text((x, y), c, font=f, fill=fill)
        x += f.getlength(c) + tr
    return x


def cover(img, shift):
    r = H / img.height
    img = img.resize((round(img.width * r), H), Image.LANCZOS)
    if img.width < W:
        r = W / img.width
        img = img.resize((W, round(img.height * r)), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H))
    off = W - img.width + int(W * shift)       # 오른쪽 끝 기준 정렬 후 shift 만큼 밀기
    # 밀려서 빈 왼쪽은 원본 왼쪽 띠를 늘려 채움
    edge = img.crop((0, 0, 8, img.height)).resize((max(1, off + 8), img.height), Image.BILINEAR) if off > 0 else None
    if edge:
        canvas.paste(edge.filter(ImageFilter.GaussianBlur(6)), (0, (H - img.height) // 2))
    canvas.paste(img, (off, (H - img.height) // 2))
    return canvas


def main(src, shift=0.0):
    base = cover(Image.open(src).convert("RGB"), shift)
    # 왼쪽 글자 영역 가독성 확보: 아주 완만한 그라데이션만
    shade = Image.linear_gradient("L").rotate(-90).resize((W, H))   # 왼쪽 255 → 오른쪽 0
    shade = shade.point(lambda v: int(max(0, (v - 110)) * 0.9))
    base = Image.composite(Image.new("RGB", (W, H), (16, 22, 52)), base, shade)
    im = base.convert("RGBA")
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)

    X, y = M, M + 190
    WID = []
    fk = F(BOLD, 62)
    draw_t(d, X, y, "나로부터 시작되는 항공보안", fk, OCHRE, tr=4)
    y += 62 + 120

    fh = F(BOLD, 172)
    for line in ("첫 번째 보안검색대는", "오늘 밤, 당신의 방입니다"):
        draw_t(d, X - 6, y, line, fh, CREAM, tr=-4)
        WID.append(tw(line, fh, -4))
        y += int(172 * 1.36)
    y += 90

    fb = F(REG, 64)
    for line in ("가방 속 물건 하나가 검색대 앞 줄 전체를 멈춥니다.",
                 "금지물품이 나오면 밖으로 나가 짐을 부치고",
                 "다시 검색을 받아야 하니까요.",
                 "그러니 떠나기 전날 밤, 가방을 닫기 전에 세 가지만."):
        draw_t(d, X, y, line, fb, SOFT, tr=0)
        WID.append(tw(line, fb, 0))
        y += int(64 * 1.62)
    y += 120

    items = [
        ("01", "보조배터리·전자담배·라이터는 몸에", "부치는 짐에 넣지 않기 · 단자는 절연테이프나 파우치로"),
        ("02", "칼·가위는 부치는 짐으로", "작은 공구·날붙이도 들고 타는 가방에서 빼 두기"),
        ("03", "국제선 액체는 100ml 이하 용기로", "1L 이하 투명 지퍼백 하나에 모아 담기"),
    ]
    fn, ft, fs = F(BOLD, 74), F(BOLD, 80), F(REG, 50)
    colw = 1840
    d.line((X, y, X + colw, y), fill=(244, 236, 220, 110), width=3)
    for n, t, s in items:
        y += 52
        draw_t(d, X, y + 6, n, fn, OCHRE, tr=2)
        draw_t(d, X + 190, y, t, ft, CREAM, tr=-1)
        draw_t(d, X + 192, y + 80 + 34, s, fs, SOFT)
        WID.append(190 + max(tw(t, ft, -1), tw(s, fs, 0)))
        y += 80 + 34 + 50 + 52
        d.line((X, y, X + colw, y), fill=(244, 236, 220, 110), width=3)
    y += 70
    draw_t(d, X, y, "헷갈리면 짐 싸기 전에, 카카오톡 ‘물어보안’에 물어보세요.", F(BOLD, 56), OCHRE, tr=0)

    # 하단: AI 고지 문구(왼쪽) · AI 워터마크(오른쪽) — 같은 기준선, 바깥 여백 유지
    fy = H - M + 40
    fnote = F(REG, 50)
    nwid = tw(NOTICE, fnote, 0)
    d.rounded_rectangle((X - 34, fy - 26, X + nwid + 34, fy + 50 + 40), radius=18, fill=(10, 14, 34, 150))
    draw_t(d, X, fy - 4, NOTICE, fnote, CREAM)

    fw = F(BOLD, 52)
    label = "AI GENERATED  |  생성형 AI 활용 이미지"
    lw = tw(label, fw, 2)
    bx1 = W - M + 34
    bx0 = bx1 - lw - 68
    d.rounded_rectangle((bx0, fy - 26, bx1, fy + 50 + 40), radius=48, fill=(244, 236, 220, 120), outline=(244, 236, 220, 220), width=4)
    draw_t(d, bx0 + 34, fy - 6, label, fw, (16, 22, 52, 255), tr=2)

    im = Image.alpha_composite(im, lay).convert("RGB")
    OUT.parent.mkdir(exist_ok=True)
    q = 93
    while True:
        im.save(OUT, "JPEG", quality=q, dpi=(300, 300), optimize=True, subsampling=0,
                comment="Generative AI used (OpenAI ChatGPT image generation). 본 작품은 생성형 AI기술을 활용하여 제작되었음.".encode("utf-8"))
        if OUT.stat().st_size <= 9.5 * 1024 * 1024 or q <= 70:
            break
        q -= 4
    im.resize((W // 4, H // 4), Image.LANCZOS).save(HERE / "build" / "preview.png")
    print("text right edge px", X + max(WID), "of", W)
    print(OUT.name, im.size, OUT.stat().st_size, "q", q)


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.0)
