# 두 업스케일 결과 합치기: 사람(머리·옷)은 RealisticRescaler, 나머지(모시 조각보·바닥)는 UltraSharp.
# 사람 마스크는 원본 시안에서 대략 윤곽을 씨앗으로 GrabCut 으로 다듬는다. 좌표는 raw 1024x1536 기준.
import sys, cv2, numpy as np
from PIL import Image
raw, x0, us, rr, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]
im = cv2.cvtColor(np.asarray(Image.open(raw).convert('RGB')), cv2.COLOR_RGB2BGR)
h = im.shape[0]; cw = h * 9 // 16; im = np.ascontiguousarray(im[:, x0:x0 + cw])
fg = np.zeros(im.shape[:2], np.uint8)
def s(pts): return np.array([(x - x0, y) for x, y in pts], np.int32)
cv2.ellipse(fg, (345 - x0, 680), (115, 115), 0, 0, 360, 1, -1)          # 할머니 머리
cv2.fillPoly(fg, [s([(150, 800), (540, 800), (580, 1330), (120, 1330)])], 1)  # 할머니 몸
cv2.ellipse(fg, (690 - x0, 830), (108, 105), 0, 0, 360, 1, -1)          # 아이 머리
cv2.fillPoly(fg, [s([(570, 930), (840, 930), (865, 1285), (560, 1285)])], 1)  # 아이 몸
k = np.ones((41, 41), np.uint8)
m = np.full(fg.shape, cv2.GC_BGD, np.uint8)
m[cv2.dilate(fg, k) > 0] = cv2.GC_PR_BGD
m[fg > 0] = cv2.GC_PR_FGD
m[cv2.erode(fg, k) > 0] = cv2.GC_FGD
bg, fgm = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(im, m, None, bg, fgm, 5, cv2.GC_INIT_WITH_MASK)
mask = np.where((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
Image.fromarray(mask).save(out + '_mask.png')
A = np.asarray(Image.open(us)).astype(np.float32); B = np.asarray(Image.open(rr)).astype(np.float32)
M = cv2.resize(mask, (A.shape[1], A.shape[0]), interpolation=cv2.INTER_LINEAR).astype(np.float32)
M = cv2.GaussianBlur(M, (0, 0), 10)[..., None] / 255
r = Image.fromarray((A * (1 - M) + B * M).round().clip(0, 255).astype(np.uint8))
r.save(out + '.jpg', quality=95, dpi=(300, 300)); print(r.size)
