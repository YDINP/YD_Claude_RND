"""4x-UltraSharp 타일 업스케일 (ComfyUI2 venv의 torch+spandrel 사용).
사용: D:/AI/ComfyUI2/venv/Scripts/python.exe upscale.py in.png out.png
"""
import sys
import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

MODEL = r"D:/AI/models/upscale_models/4x-UltraSharp.pth"
TILE, PAD = 384, 24


def main(src, dst):
    m = ModelLoader().load_from_file(MODEL).cuda().eval().half()
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
    h, w, _ = a.shape
    s = 4
    out = np.zeros((h * s, w * s, 3), np.float32)
    t = torch.from_numpy(a).permute(2, 0, 1)[None]
    with torch.no_grad():
        for y in range(0, h, TILE):
            for x in range(0, w, TILE):
                y0, x0 = max(0, y - PAD), max(0, x - PAD)
                y1, x1 = min(h, y + TILE + PAD), min(w, x + TILE + PAD)
                r = m(t[:, :, y0:y1, x0:x1].cuda().half()).float().clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()
                ty, tx = (y - y0) * s, (x - x0) * s
                hh, ww = min(TILE, h - y) * s, min(TILE, w - x) * s
                out[y * s:y * s + hh, x * s:x * s + ww] = r[ty:ty + hh, tx:tx + ww]
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(dst)
    print(dst, out.shape)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
