"""전신 시트에서 흉상 영역을 크롭해 초상화 생성 — 정체성 100% 일치 보장.
알파 채널로 캐릭터 상단(머리 꼭대기)을 찾고, 머리+어깨 영역을 정사각 크롭 후 512로 리샘플."""
import glob, os, pathlib
from PIL import Image, ImageFilter
ROOT = pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
OUT = ROOT / "art/gen/portraits_crop"
OUT.mkdir(parents=True, exist_ok=True)

import json
_CJ = json.load(open("src/data/cults.json", encoding="utf-8"))["cults"]
CULTS = {k: (v.get("color") or v.get("themeColor") or "#2A3050") for k, v in _CJ.items()}
MAP = json.load(open("src/data/portrait-mapping.json", encoding="utf-8"))
FILE2CHAR = {v + ".png": k for k, v in MAP.items() if isinstance(v, str)}
HEROES = {}
for src in ("src/data/base-heroes.json", "src/data/ascended-heroes.json"):
    raw = json.load(open(src, encoding="utf-8"))
    lst = raw if isinstance(raw, list) else list(raw.values())[0]
    for hh in lst:
        HEROES[hh["id"]] = hh


def hex_to_rgb(hx):
    hx = str(hx).lstrip("#")
    return tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))


def composite_background(crop, name):
    """교단색 방사형 그라데이션 배경을 깔아 투명 영역을 채운다."""
    cid = FILE2CHAR.get(name)
    hero = HEROES.get(cid, {})
    cult = hero.get("cultId") or hero.get("cult")
    base = hex_to_rgb(CULTS.get(cult, "#2A3050"))
    w = h = 512
    bg = Image.new("RGB", (w, h))
    px = bg.load()
    cx, cy, maxd = w * 0.5, h * 0.42, (w ** 2 + h ** 2) ** 0.5 * 0.55
    dark = tuple(int(v * 0.16) for v in base)
    mid = tuple(int(v * 0.55) for v in base)
    for y in range(h):
        for x in range(w):
            d = min(1.0, (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / maxd)
            px[x, y] = tuple(int(mid[i] * (1 - d) + dark[i] * d) for i in range(3))
    bg = bg.filter(ImageFilter.GaussianBlur(6))
    out = Image.new("RGBA", (w, h))
    out.paste(bg.convert("RGBA"), (0, 0))
    out.alpha_composite(crop)
    return out.convert("RGBA")


def top_of_subject(im, thresh=16):
    """알파(없으면 배경색 차이)로 피사체 최상단 y와 가로 중심을 찾는다."""
    a = im.getchannel("A") if im.mode == "RGBA" else None
    if a is None or a.getextrema()[1] == 0:
        return 0, im.width // 2
    px = a.load()
    w, h = im.size
    top = 0
    for y in range(0, h, 2):
        row = sum(1 for x in range(0, w, 4) if px[x, y] > thresh)
        if row >= 3:
            top = y
            break
    # 머리 부근(top~top+18%)의 가로 무게중심
    xs, tot = 0, 0
    for y in range(top, min(h, top + int(h * 0.18)), 3):
        for x in range(0, w, 3):
            v = px[x, y]
            if v > thresh:
                xs += x * v
                tot += v
    cx = int(xs / tot) if tot else w // 2
    return top, cx

results = []
for f in sorted(glob.glob("art/gen/fullbody/hero_*.png")):
    name = os.path.basename(f)
    im = Image.open(f).convert("RGBA")
    w, h = im.size
    top, cx = top_of_subject(im)
    # 흉상: 머리 꼭대기 위 여백 6% + 아래로 전체 높이의 30% (머리~가슴)
    pad = int(h * 0.05)
    y0 = max(0, top - pad)
    side = int(h * 0.27)
    y1 = min(h, y0 + side)
    side = y1 - y0
    x0 = max(0, min(w - side, cx - side // 2))
    crop = im.crop((x0, y0, x0 + side, y1))
    # 512 리샘플 + 가벼운 샤픈(업스케일 보정)
    crop = crop.resize((512, 512), Image.LANCZOS)
    if side < 512:
        crop = crop.filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=3))
    crop = composite_background(crop, name)
    crop.save(OUT / name)
    results.append((name, top, cx, side))

print(f"cropped {len(results)}")
for r in results[:6]:
    print("  ", r)
