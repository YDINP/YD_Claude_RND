"""치비 프레임 → 공용 규격 스프라이트 시트.
1) 크로마키 제거 2) 최대 연결성분(중앙 캐릭터)만 남김 3) 공용 캔버스에 발밑 기준 정렬 4) 가로 시트 패킹.
공용 규격(모든 캐릭터 동일): CELL 256, 캐릭터 높이 = CELL*0.82, 발밑 y = CELL*0.94, 가로 중앙."""
import glob, os, pathlib, json, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
SRC = ROOT / "art/gen/chibi"
OUT = ROOT / "art/gen/chibi_sheet"
OUT.mkdir(parents=True, exist_ok=True)

CELL = 256
BODY_H = int(CELL * 0.82)
FOOT_Y = int(CELL * 0.94)
FRAME_ORDER = ["idle", "meditate", "channel", "awaken"]

def dekey(img):
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = g - np.maximum(r, b)
    bg = (green > 35) & (g > 80)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # despill
    edge = (alpha > 0) & (green > 12)
    rgb = a.copy()
    rgb[..., 1] = np.where(edge, np.minimum(g, (r + b) / 2 + 10), g)
    return np.clip(rgb, 0, 255).astype(np.uint8), alpha

def largest_blob(alpha, min_frac=0.004):
    """가장 큰 연결 성분만 남긴다(분신·잔여 제거)."""
    lab, n = ndimage.label(alpha > 128)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(alpha > 128, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    return np.where(lab == keep, alpha, 0).astype(np.uint8)

def normalize(rgb, alpha):
    """공용 규격 캔버스에 정렬: 세로 BODY_H로 스케일, 발밑 FOOT_Y, 가로 중앙."""
    ys, xs = np.nonzero(alpha > 16)
    if ys.size == 0:
        return Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = Image.fromarray(np.dstack([rgb, alpha]), "RGBA").crop((x0, y0, x1 + 1, y1 + 1))
    scale = BODY_H / crop.height
    w = max(1, int(round(crop.width * scale)))
    crop = crop.resize((w, BODY_H), Image.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    canvas.paste(crop, ((CELL - w) // 2, FOOT_Y - BODY_H), crop)
    return canvas

heroes = {}
for f in sorted(glob.glob(str(SRC / "*.png"))):
    stem = os.path.basename(f)[:-4]
    hero, frame = stem.rsplit("_", 1)
    heroes.setdefault(hero, {})[frame] = f

report = {}
for hero, frames in heroes.items():
    order = [k for k in FRAME_ORDER if k in frames]
    sheet = Image.new("RGBA", (CELL * len(order), CELL), (0, 0, 0, 0))
    for i, k in enumerate(order):
        rgb, alpha = dekey(Image.open(frames[k]))
        alpha = largest_blob(alpha)
        alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
        alpha = np.where(alpha > 140, 255, np.where(alpha < 60, 0, alpha)).astype(np.uint8)
        cell_img = normalize(rgb, alpha)
        cell_img.save(OUT / f"{hero}_{k}.png")
        sheet.paste(cell_img, (i * CELL, 0), cell_img)
    sheet.save(OUT / f"{hero}_sheet.png")
    report[hero] = {"frames": order, "cell": CELL, "sheet": f"{hero}_sheet.png"}
    print(f"{hero}: {len(order)} frames -> {hero}_sheet.png ({sheet.width}x{sheet.height})")

(OUT / "chibi-manifest.json").write_text(json.dumps({
    "cell": CELL, "bodyHeight": BODY_H, "footY": FOOT_Y,
    "frameOrder": FRAME_ORDER, "heroes": report,
}, indent=2, ensure_ascii=False), encoding="utf-8")
print("manifest written")
