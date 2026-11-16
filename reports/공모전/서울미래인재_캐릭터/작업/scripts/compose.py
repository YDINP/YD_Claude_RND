# 생성 원본을 출품용 이미지로 손질한다 (배경 정리, 여백, 해상도, 글자 직접 입력, 띠 색 변주)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, os
from collections import deque
B = r"D:/park/YD_Claude_RND/reports/공모전/서울미래인재_캐릭터"
SRC = B + "/작업/원본"; OUT = B + "/작업/출품"; os.makedirs(OUT, exist_ok=True)
FB = "C:/Windows/Fonts/malgunbd.ttf"; FR = "C:/Windows/Fonts/malgun.ttf"
INK = (58, 58, 58)

def flatten_bg(im, thr=242):
    """테두리와 이어진 거의 흰 픽셀만 순백으로 (캐릭터 안쪽은 건드리지 않음)."""
    a = np.array(im.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    near = (a.min(axis=2) >= thr)
    seen = np.zeros((h, w), bool); q = deque()
    for x in range(w):
        for y in (0, h-1):
            if near[y, x]: seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if near[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    a[seen] = 255
    return Image.fromarray(a.astype(np.uint8)), ~seen

def bbox(mask):
    ys, xs = np.where(mask); return xs.min(), ys.min(), xs.max(), ys.max()

def recolor_band(im, mask, rgb):
    """하늘색 물결 띠 픽셀만 다른 색으로 바꾼다."""
    a = np.array(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = mask & (b > 180) & (b - r > 80) & (b - g > 20)
    tgt = np.array(rgb, np.float32)
    # 밝기 비율을 유지해 안티앨리어싱 가장자리도 자연스럽게
    lum = (b[blue] / 246.0)[:, None]
    a[blue] = np.clip(tgt * lum, 0, 255)
    return Image.fromarray(a.astype(np.uint8))

def text_c(d, xy, s, font, fill=INK):
    w = d.textlength(s, font=font); d.text((xy[0] - w/2, xy[1]), s, font=font, fill=fill)

# ---------- 01 기본형 ----------
base, m = flatten_bg(Image.open(SRC + "/g01a_기본형후보A.png"))
x0, y0, x1, y1 = bbox(m)
char = base.crop((x0, y0, x1+1, y1+1))
S = 2400
canvas = Image.new("RGB", (S, S), "white")
cw, ch = char.size; sc = 1650 / max(cw, ch)
char_big = char.resize((int(cw*sc), int(ch*sc)), Image.LANCZOS)
top = (S - (char_big.height + 380)) // 2
canvas.paste(char_big, ((S - char_big.width)//2, top))
d = ImageDraw.Draw(canvas)
text_c(d, (S/2, top + char_big.height + 60), "징검이", ImageFont.truetype(FB, 150))
text_c(d, (S/2, top + char_big.height + 260), "한 걸음 앞에 놓이는 한강 징검돌", ImageFont.truetype(FR, 72), (110,110,110))
canvas.save(OUT + "/01_징검이_기본형.png", optimize=True)

# ---------- 02 표정·포즈 + 띠 색 변주 ----------
pose, pm = flatten_bg(Image.open(SRC + "/g02c_표정포즈.png"))
px0, py0, px1, py1 = bbox(pm)
pose_c = pose.crop((px0, py0, px1+1, py1+1))
W, H = 3000, 2000
cv = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(cv)
ft = ImageFont.truetype(FB, 64); fl = ImageFont.truetype(FR, 48); fs = ImageFont.truetype(FR, 40)
d.text((120, 80), "표정과 몸짓", font=ft, fill=INK)
sc = 2760 / pose_c.width
pose_big = pose_c.resize((int(pose_c.width*sc), int(pose_c.height*sc)), Image.LANCZOS)
cv.paste(pose_big, (120, 210))
# 각 포즈 중심 x (원본 폭 비율로 계산)
labels = ["다음 돌 건네기", "잘 건넜어!", "디딤돌 자세", "고마워"]
cols = np.where(np.array(pose_big.convert("L")).min(axis=0) < 200)[0]
# 열 그룹 나누기
groups = []; start = cols[0]; prev = cols[0]
for c in cols[1:]:
    if c - prev > 25: groups.append((start, prev)); start = c
    prev = c
groups.append((start, prev))
centers = [int(120 + pose_big.width*(i+0.5)/4) for i in range(4)]
ly = 210 + pose_big.height + 30
for cx, s in zip(centers, labels): text_c(d, (cx, ly), s, fl)
d.line((120, ly + 120, W-120, ly + 120), fill=(225,225,225), width=4)
y2 = ly + 170
d.text((120, y2), "물결 띠 색으로 사업 구분 (예시)", font=ft, fill=INK)
variants = [((96,186,246), "장학 (기본)"), ((80,190,140), "해외 인재"), ((150,120,220), "AI 연구"), ((245,160,70), "동행·멘토")]
small_h = H - (y2 + 110) - 130
gap = (W - 240) / 4
csc = min(small_h / char.height, gap*0.88 / char.width)
small = char.resize((int(char.width*csc), int(char.height*csc)), Image.LANCZOS)
small_h = small.height
_, sm = flatten_bg(small)
gap = (W - 240) / 4
for i, (rgb, name) in enumerate(variants):
    v = small if i == 0 else recolor_band(small, sm, rgb)
    cx = int(120 + gap*i + gap/2)
    cv.paste(v, (cx - v.width//2, y2 + 110))
    text_c(d, (cx, y2 + 110 + small_h + 20), name, fs, (90,90,90))
cv = cv.crop((0, 0, W, min(H, y2 + 110 + small_h + 120)))
cv = cv.resize((3000, int(cv.height*3000/cv.width)))
cv.save(OUT + "/02_징검이_표정포즈_색변주.png", optimize=True)

# ---------- 03 활용 목업 ----------
mk = Image.open(SRC + "/g03a_굿즈목업.png").convert("RGB")
sc = 3000 / mk.width
mk = mk.resize((3000, int(mk.height*sc)), Image.LANCZOS)
W3, H3 = 3000, mk.height + 150
cv3 = Image.new("RGB", (W3, H3), (250, 247, 242)); cv3.paste(mk, (0, 0))
d = ImageDraw.Draw(cv3)
# 스티커 3번(왼쪽 아래) 오른손 윤곽선이 끊긴 부분을 직접 이어 그림
d.arc((598, 1648, 636, 1690), start=-85, end=118, fill=(45,42,40), width=6)
fl = ImageFont.truetype(FB, 52)
fn = ImageFont.truetype(FB, 54)
def num(x, y, s):
    d.ellipse((x, y, x+84, y+84), fill=(255,255,255), outline=(90,90,90), width=4)
    text_c(d, (x+42, y+6), s, fn)
hh = mk.height // 2; hw = 1380
num(14, 14, "1"); num(1530, 14, "2"); num(14, hh + 14, "3"); num(hw + 14, hh + 14, "4")
text_c(d, (W3/2, mk.height + 40), "1 문진(장학 증서와 함께)   2 배지(받은 돌)   3 스티커·이모티콘   4 행사장 바닥 징검다리", ImageFont.truetype(FR, 52), (90,90,90))
cv3.save(OUT + "/03_징검이_활용예시.png", optimize=True)
for f in sorted(os.listdir(OUT)):
    p = OUT + "/" + f; print(f, Image.open(p).size, os.path.getsize(p)//1024, "KB")
