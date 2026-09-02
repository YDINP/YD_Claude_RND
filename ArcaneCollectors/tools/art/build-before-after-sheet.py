"""
build-before-after-sheet.py — T-26 before/after 대조 시트 생성
29쌍(before/after)을 좌우로 배치해 라벨과 함께 3장의 JPG 시트로 나눠 저장한다.
실행: python tools/art/build-before-after-sheet.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BEFORE_DIR = os.path.join(ROOT, "docs", "redesign", "screenshots", "before")
AFTER_DIR = os.path.join(ROOT, "docs", "redesign", "screenshots", "after-full")
OUT_PREFIX = os.path.join(ROOT, "docs", "redesign", "screenshots", "BEFORE_AFTER_2026-09-03")

THUMB_W = 240
THUMB_H = int(THUMB_W * 1920 / 1080)  # 427
PAD = 12
LABEL_H = 26
BLOCK_W = THUMB_W * 2 + PAD * 3  # 좌(before) + 우(after) + 여백
BLOCK_H = LABEL_H + PAD + THUMB_H + PAD * 2
COLS = 2
ROWS_PER_SHEET = 5
PER_SHEET = COLS * ROWS_PER_SHEET  # 10
MARGIN = 24
HEADER_H = 70
BG = (24, 24, 30)
LABEL_BG = (40, 40, 50)
LABEL_FG = (235, 235, 245)
BEFORE_TAG_BG = (120, 60, 60)
AFTER_TAG_BG = (60, 110, 70)

try:
    FONT = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 17)
    FONT_SMALL = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 13)
    FONT_TITLE = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 26)
except Exception:
    FONT = ImageFont.load_default()
    FONT_SMALL = FONT
    FONT_TITLE = FONT

names = sorted(f[:-4] for f in os.listdir(BEFORE_DIR) if f.endswith(".png"))
missing_after = [n for n in names if not os.path.exists(os.path.join(AFTER_DIR, n + ".png"))]
if missing_after:
    print("[warn] after 누락:", missing_after)
names = [n for n in names if n not in missing_after]
print(f"대조 대상: {len(names)}쌍")

def load_thumb(path):
    im = Image.open(path).convert("RGB")
    return im.resize((THUMB_W, THUMB_H), Image.LANCZOS)

def draw_block(sheet, x, y, name):
    d = ImageDraw.Draw(sheet)
    d.rectangle([x, y, x + BLOCK_W, y + BLOCK_H], fill=(32, 32, 40), outline=(70, 70, 80), width=1)
    d.text((x + PAD, y + 6), name, font=FONT, fill=LABEL_FG)

    bpath = os.path.join(BEFORE_DIR, name + ".png")
    apath = os.path.join(AFTER_DIR, name + ".png")
    bthumb = load_thumb(bpath)
    athumb = load_thumb(apath)

    iy = y + LABEL_H + PAD
    bx = x + PAD
    ax = bx + THUMB_W + PAD
    sheet.paste(bthumb, (bx, iy))
    sheet.paste(athumb, (ax, iy))

    # 태그
    d.rectangle([bx, iy, bx + 62, iy + 18], fill=BEFORE_TAG_BG)
    d.text((bx + 6, iy + 2), "BEFORE", font=FONT_SMALL, fill=(255, 230, 230))
    d.rectangle([ax, iy, ax + 54, iy + 18], fill=AFTER_TAG_BG)
    d.text((ax + 6, iy + 2), "AFTER", font=FONT_SMALL, fill=(230, 255, 230))

n_sheets = (len(names) + PER_SHEET - 1) // PER_SHEET
saved = []
for sheet_idx in range(n_sheets):
    chunk = names[sheet_idx * PER_SHEET:(sheet_idx + 1) * PER_SHEET]
    rows = (len(chunk) + COLS - 1) // COLS
    sheet_w = MARGIN * 2 + COLS * BLOCK_W + (COLS - 1) * PAD
    sheet_h = HEADER_H + MARGIN + rows * (BLOCK_H + PAD)
    sheet = Image.new("RGB", (sheet_w, sheet_h), BG)
    d = ImageDraw.Draw(sheet)
    d.text((MARGIN, 18), f"ArcaneCollectors 리디자인 Before / After 대조 — 시트 {sheet_idx + 1}/{n_sheets}", font=FONT_TITLE, fill=(255, 255, 255))

    for i, name in enumerate(chunk):
        col = i % COLS
        row = i // COLS
        x = MARGIN + col * (BLOCK_W + PAD)
        y = HEADER_H + MARGIN + row * (BLOCK_H + PAD)
        draw_block(sheet, x, y, name)

    out_path = f"{OUT_PREFIX}_{sheet_idx + 1}.jpg"
    sheet.save(out_path, "JPEG", quality=90)
    saved.append(out_path)
    print(f"  [saved] {out_path} ({sheet_w}x{sheet_h}, {len(chunk)}쌍)")

print(f"\nTOTAL {len(saved)}장 시트, {len(names)}쌍 대조")
for p in saved:
    print(" -", p)
