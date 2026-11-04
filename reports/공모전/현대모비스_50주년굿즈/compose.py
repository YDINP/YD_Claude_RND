"""생성 이미지의 빈 명판에 각인 문구를 원근 맞춰 합성 -> final/*.jpg (+ 이미지/ 제출용 사본)."""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path

HERE = Path(__file__).parent
FB = "C:/Windows/Fonts/malgunbd.ttf"
FR = "C:/Windows/Fonts/malgun.ttf"


def coeffs(dst, src):
    """dst 쿼드 -> src 사각형 매핑용 PERSPECTIVE 계수."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def plate_layer(W, H, lines):
    """흰 배경 대신 알파 마스크: 각인 깊이(어두운 글자) + 아래쪽 밝은 반사선."""
    m = Image.new("L", (W, H), 0)
    hl = Image.new("L", (W, H), 0)
    d, dh = ImageDraw.Draw(m), ImageDraw.Draw(hl)
    total = sum(s for _, s, _ in lines) + (len(lines) - 1) * H * 0.06
    y = (H - total) / 2
    for text, size, bold in lines:
        f = ImageFont.truetype(FB if bold else FR, int(size))
        w = d.textlength(text, font=f)
        x = (W - w) / 2
        d.text((x, y - size * 0.12), text, font=f, fill=255)
        dh.text((x, y - size * 0.12 + max(1, size * 0.05)), text, font=f, fill=255)
        y += size + H * 0.06
    return m, hl


def engrave(img, quad, lines, W=600, H=500, depth=0.62, blur=0.6):
    m, hl = plate_layer(W, H, lines)
    rect = [(0, 0), (W, 0), (W, H), (0, H)]
    c = coeffs(quad, rect)
    m = m.transform(img.size, Image.PERSPECTIVE, c, Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    hl = hl.transform(img.size, Image.PERSPECTIVE, c, Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img).astype(float)
    mm = np.asarray(m).astype(float)[..., None] / 255
    hh = np.clip(np.asarray(hl).astype(float)[..., None] / 255 - mm, 0, 1)
    a = a * (1 - hh * 0.25) + 245 * hh * 0.25          # 아래 가장자리 반사
    a = a * (1 - mm * depth) + (a * 0.35) * mm * depth   # 파인 곳은 어둡게(금속 색 유지)
    return Image.fromarray(np.clip(a, 0, 255).astype("uint8"))


JOBS = json.load(open(HERE / "plates.json", encoding="utf-8"))


def main():
    out = HERE / "final"; out.mkdir(exist_ok=True)
    sub = HERE / "이미지"; sub.mkdir(exist_ok=True)
    for j in JOBS:
        img = Image.open(HERE / j["src"]).convert("RGB")
        if j.get("quad"):
            img = engrave(img, j["quad"], j["lines"], **j.get("opt", {}))
        img.save(out / f"{j['key']}.jpg", quality=93, subsampling=0)
        img.save(sub / f"{j['name']}.jpg", quality=93, subsampling=0, dpi=(300, 300))
        if j.get("quad"):
            xs = [p[0] for p in j["quad"]]; ys = [p[1] for p in j["quad"]]
            pad = 30
            box = (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)
            k = max(1, int(500 / (box[2] - box[0])))
            img.crop(box).resize(((box[2] - box[0]) * k, (box[3] - box[1]) * k), Image.LANCZOS).save(HERE / "build" / f"zoom_{j['key']}.png")
        print(j["key"], img.size)


if __name__ == "__main__":
    main()
