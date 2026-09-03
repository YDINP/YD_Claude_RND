"""ComfyUI 생성 적 아트(크로마키 그린 배경)에서 알파를 추출해 art/gen/enemies로 합류."""
import glob, os, pathlib
from PIL import Image, ImageFilter
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
SRC = ROOT / "art/gen/enemies_comfy"
DST = ROOT / "art/gen/enemies"
DST.mkdir(parents=True, exist_ok=True)

done, skipped = 0, []
for f in sorted(glob.glob(str(SRC / "*.png"))):
    name = os.path.basename(f)
    out = DST / name
    if out.exists():
        skipped.append(name)
        continue
    im = Image.open(f).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 그린 스크린 판정: G가 R·B보다 뚜렷하게 크고 충분히 밝음
    greenness = g - np.maximum(r, b)
    mask_bg = (greenness > 40) & (g > 90)
    if mask_bg.mean() < 0.02:          # 크로마키가 아예 안 걸린 경우
        skipped.append(name + "(no-key)")
        continue
    alpha = np.where(mask_bg, 0, 255).astype(np.uint8)
    # 경계 부드럽게
    alpha_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8))
    alpha = np.asarray(alpha_img)
    alpha = np.where(alpha > 140, 255, np.where(alpha < 60, 0, alpha)).astype(np.uint8)
    # despill: 남은 초록 번짐을 R·B 평균 쪽으로 눌러줌
    edge = (alpha > 0) & (greenness > 12)
    rgb = a.copy()
    lim = ((r + b) / 2 + 12)
    rgb[..., 1] = np.where(edge, np.minimum(g, lim), g)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    res = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    # 알파 바운딩박스로 여백 정리 후 정사각 캔버스 중앙 배치
    bbox = res.getbbox()
    if bbox:
        res = res.crop(bbox)
        side = max(res.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(res, ((side - res.width) // 2, (side - res.height) // 2))
        res = canvas.resize((1024, 1024), Image.LANCZOS)
    res.save(out)
    done += 1

print(f"chromakey applied: {done}, skipped: {len(skipped)}")
if skipped[:5]:
    print("  skipped sample:", skipped[:5])
print("total enemies:", len(list(DST.glob('*.png'))))
