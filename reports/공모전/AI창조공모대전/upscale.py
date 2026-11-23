# 시안을 9:16으로 자르고 4x-UltraSharp(spandrel)로 4배 키운 뒤 300dpi PNG/JPG 저장.
# 사용: <ComfyUI2 venv python> upscale.py raw/a_3.png 110 out/a_3
import sys, torch, numpy as np
from PIL import Image
from spandrel import ModelLoader
src, x0, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
im = Image.open(src).convert('RGB'); w, h = im.size; cw = h * 9 // 16
im = im.crop((x0, 0, x0 + cw, h))
MODEL = sys.argv[4] if len(sys.argv) > 4 else 'D:/AI/models/upscale_models/4x-UltraSharp.pth'
m = ModelLoader().load_from_file(MODEL).cuda().eval().half()
a = torch.from_numpy(np.asarray(im)).permute(2, 0, 1).float().div(255)[None].cuda().half()
T, P = 256, 16; _, _, H, W = a.shape; res = torch.zeros(1, 3, H * 4, W * 4, device='cuda', dtype=torch.half)
with torch.no_grad():
    for y in range(0, H, T):
        for x in range(0, W, T):
            ya, xa = max(y - P, 0), max(x - P, 0); yb, xb = min(y + T + P, H), min(x + T + P, W)
            o = m(a[:, :, ya:yb, xa:xb])
            res[:, :, y*4:min(y+T,H)*4, x*4:min(x+T,W)*4] = o[:, :, (y-ya)*4:(y-ya+min(T,H-y))*4, (x-xa)*4:(x-xa+min(T,W-x))*4]
r = Image.fromarray(res[0].float().clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).cpu().numpy())
r.save(out + '.png', dpi=(300, 300)); r.save(out + '.jpg', quality=95, dpi=(300, 300))
print(r.size)
