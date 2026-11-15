# 「꼭 잡아, 타구!」 링 그립 제안 시트 — 공식 캐릭터 AI(PDF 호환) 벡터를 그대로 재배치해 A3 가로 .ai 를 만든다.
import os
import cv2
import fitz
import numpy as np
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, '공고', 'char_ai', '기본형 조합.ai')
OUT_AI = os.path.join(ROOT, '제출', '박용진_꼭잡아타구_링그립_디자인원본.ai')
OUT_PNG = os.path.join(ROOT, '제출', '박용진_꼭잡아타구_링그립_시안.png')
FR = 'C:/Windows/Fonts/malgun.ttf'
FB = 'C:/Windows/Fonts/malgunbd.ttf'
MM = 72 / 25.4
W, H = 420 * MM, 297 * MM
CLIP = fitz.Rect(130, 233, 400, 472)  # 공식 조합 A (타구+바쿠)

BLUE, BLUE2, NAVY = (0.0, 0.705, 0.931), (0.0, 0.629, 0.913), (0.0, 0.305, 0.634)
LINE = {  # 몸통 색만 노선색으로 (공식 응용형 1·2·3호선 이미지 기준)
    '기본': None,
    '1호선': {BLUE: (0.89, 0.13, 0.15), BLUE2: (0.78, 0.07, 0.10)},
    '2호선': {BLUE: (0.18, 0.66, 0.24), BLUE2: (0.12, 0.55, 0.18)},
    '3호선': {BLUE: (0.98, 0.72, 0.05), BLUE2: (0.93, 0.62, 0.0)},
}
INK = (0.137, 0.096, 0.085)
GREEN = (0.56, 0.766, 0.122)
CUT = (0.93, 0.0, 0.55)
GREY = (0.5, 0.5, 0.5)
LIGHT = (0.94, 0.95, 0.96)
WHITE = (1, 1, 1)

src_doc = fitz.open(stream=open(SRC, 'rb').read(), filetype='pdf')
src = src_doc[0]
LABEL = fitz.Rect(125, 230, 205, 262)  # 원화의 '기본형A' 글자는 뺀다
DRAW = [d for d in src.get_drawings() if d['rect'].intersects(CLIP) and not LABEL.contains(d['rect'])]
BAKU_C = fitz.Point(350, 405.5)
PT_PER_MM = CLIP.width / 42  # 실물 가로 42mm 기준


def rnd(c):
    return tuple(round(x, 3) for x in c) if c else None


def fit(box):
    s = min(box.width / CLIP.width, box.height / CLIP.height)
    ox = box.x0 + (box.width - CLIP.width * s) / 2 - CLIP.x0 * s
    oy = box.y0 + (box.height - CLIP.height * s) / 2 - CLIP.y0 * s
    return fitz.Matrix(s, 0, 0, s, ox, oy), s


def art(page, box, cmap=None):
    """공식 벡터를 box 에 맞춰 다시 그린다. cmap 으로 몸통 파랑만 바꾼다."""
    m, s = fit(box)
    keys = {rnd(k): v for k, v in (cmap or {}).items()}
    for d in DRAW:
        sh = page.new_shape()
        for it in d['items']:
            k = it[0]
            if k == 'l':
                sh.draw_line(it[1] * m, it[2] * m)
            elif k == 'c':
                sh.draw_bezier(it[1] * m, it[2] * m, it[3] * m, it[4] * m)
            elif k == 're':
                sh.draw_rect(it[1] * m)
            elif k == 'qu':
                sh.draw_quad(it[1] * m)
        f = d.get('fill')
        if f:
            f = keys.get(rnd(f), f)
        lc = d.get('lineCap') or 0
        if isinstance(lc, (list, tuple)):
            lc = max(lc)
        sh.finish(fill=f, color=d.get('color'), width=(d.get('width') or 0) * s,
                  closePath=d.get('closePath', False), even_odd=d.get('even_odd', False),
                  fill_opacity=d.get('fill_opacity') or 1, stroke_opacity=d.get('stroke_opacity') or 1,
                  lineCap=lc, lineJoin=d.get('lineJoin') or 0)
        sh.commit()
    return m, s


def outline_poly():
    zoom = 6
    pix = src.get_pixmap(clip=CLIP, matrix=fitz.Matrix(zoom, zoom), alpha=True)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, 4)[:, :, 3]
    mask = (a > 10).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)[:, 0, :] / zoom
    return Polygon([(CLIP.x0 + x, CLIP.y0 + y) for x, y in c]).buffer(0)


POLY = outline_poly()


def cutline(page, box, off_mm_page, color=CUT, fill=None, dashes=None, width=0.8):
    m, s = fit(box)
    p = POLY.buffer(off_mm_page * MM / s, join_style=1).simplify(0.6)
    pts = [fitz.Point(x, y) * m for x, y in p.exterior.coords]
    sh = page.new_shape()
    sh.draw_polyline(pts)
    sh.finish(color=color, fill=fill, width=width, closePath=True, dashes=dashes)
    sh.commit()


def text(page, x, y, t, size=10, bold=False, color=INK, w=None, align=0):
    fn = 'mb' if bold else 'mr'
    ff = FB if bold else FR
    if w is None:
        page.insert_text((x, y), t, fontsize=size, fontname=fn, fontfile=ff, color=color)
    else:
        r = fitz.Rect(x, y, x + w, y + size * 40)
        page.insert_textbox(r, t, fontsize=size, fontname=fn, fontfile=ff, color=color, align=align, lineheight=1.5)


def rrect(page, r, rad, color=None, fill=None, width=1.0, dashes=None):
    sh = page.new_shape()
    sh.draw_rect(r, radius=min(0.5, rad / min(r.width, r.height)) if rad else None)
    sh.finish(color=color, fill=fill, width=width, dashes=dashes)
    sh.commit()


def ring(page, box, opacity=0.92):
    m, s = fit(box)
    od, idm = 26 * PT_PER_MM, 18 * PT_PER_MM
    r = (od + idm) / 4 * s
    page.draw_circle(BAKU_C * m, r, color=(0.47, 0.68, 0.09), width=(od - idm) / 2 * s, stroke_opacity=opacity)
    page.draw_circle(BAKU_C * m, od / 2 * s, color=INK, width=0.5)
    page.draw_circle(BAKU_C * m, idm / 2 * s, color=INK, width=0.5)


def grip(page, box, cmap=None, cut=False, edge=1.0, with_ring=False):
    cutline(page, box, edge, color=(0.84, 0.84, 0.84), fill=LIGHT, width=0.5)
    art(page, box, cmap)
    if with_ring:
        ring(page, box)
    if cut:
        cutline(page, box, edge, dashes='[4 2] 0')


doc = fitz.open()
pg = doc.new_page(width=W, height=H)
pg.draw_rect(pg.rect, color=None, fill=WHITE)
L = 18 * MM

# 머리글
text(pg, L, 22 * MM, '대구교통공사 신규 캐릭터 기념품 디자인 공모전', 9, color=GREY)
text(pg, L, 37 * MM, '꼭 잡아, 타구!', 30, True, NAVY)
text(pg, L + 92 * MM, 37 * MM, '선로 낙하를 막는 타구·바쿠 링 그립 (스마트폰 그립 겸 거치대)', 13, True)
pg.draw_line((L, 43 * MM), (W - L, 43 * MM), color=INK, width=0.6)

# ① 정면
y0 = 50 * MM
text(pg, L, y0 + 4 * MM, '① 정면 — 실물 42×38mm 를 2.5배로 그림', 10, True)
box = fitz.Rect(L + 4 * MM, y0 + 10 * MM, L + 124 * MM, y0 + 118 * MM)
grip(pg, box, None, cut=True, edge=2.5)
text(pg, L, y0 + 126 * MM, '분홍 점선 = 칼선 (원화 외곽 + 1mm, 실물 기준)    회색 면 = 흰 바탕 인쇄    링은 뒤에 숨어 있어 앞면 원화를 가리지 않습니다', 8, color=GREY)

# ② 구조
x1 = L + 136 * MM
text(pg, x1, y0 + 4 * MM, '② 구조 · 옆모습 (2.5배)', 10, True)
cx, cy = x1 + 4 * MM, y0 + 16 * MM
layers = [('투명 아크릴 3T, 앞면 UV 인쇄', 3.0, (0.86, 0.94, 1.0)),
          ('360° 회전판 (아연합금)', 1.6, (0.78, 0.78, 0.8)),
          ('재부착 실리콘 패드', 1.4, (0.62, 0.62, 0.64))]
yy = cy
for name, t_mm, col in layers:
    r = fitz.Rect(cx, yy, cx + 42 * MM * 1.25, yy + t_mm * MM * 2.5)
    rrect(pg, r, 1, color=INK, fill=col, width=0.6)
    text(pg, r.x1 + 4 * MM, r.y0 + r.height / 2 + 3, name, 8.5)
    yy = r.y1
hinge = fitz.Point(cx + 6 * MM, cy + 3.0 * MM * 2.5 + 0.8 * MM * 2.5)
tip = fitz.Point(hinge.x - 14 * MM, hinge.y + 26 * MM)
sh = pg.new_shape()
sh.draw_line(hinge, tip)
sh.finish(color=GREEN, width=8, lineCap=1)
sh.commit()
text(pg, tip.x + 4 * MM, tip.y + 1 * MM, '바쿠 고리 (초록 링)', 9, True, (0.3, 0.5, 0.05))
text(pg, tip.x + 4 * MM, tip.y + 5.5 * MM, '회전판에 달려 아크릴 뒤로 접히고, 펼치면 손가락에 끼움', 8.5, color=GREY)
text(pg, cx, yy + 31 * MM, '두께 약 6mm · 링 바깥 26mm, 안지름 18mm · 180° 펼침 · 회전판 360°. 링은 바쿠와 같은 초록으로 칠해, 펼치면 타구가 바쿠 고리를 내밀어 손을 잡아 주는 모양이 됩니다.', 8.5, color=GREY, w=128 * MM)

# ③ 쓰는 법
text(pg, x1, yy + 50 * MM, '③ 쓰는 법', 10, True)
uses = [('잡기', '승강장과 계단에서 바쿠 고리에 검지를 끼우면 폰이 손에서 빠지지 않습니다.'),
        ('세우기', '고리를 반쯤 펼치면 거치대가 됩니다. 열차 안에서 영상 볼 때.'),
        ('걸기', '접은 고리에 스트랩을 끼워 가방에 겁니다.')]
uy = yy + 56 * MM
for i, (a, b) in enumerate(uses):
    pg.draw_circle((x1 + 4.5 * MM, uy + 3.5 * MM), 4 * MM, color=None, fill=GREEN)
    text(pg, x1 + 3.1 * MM, uy + 5.3 * MM, str(i + 1), 10, True, WHITE)
    text(pg, x1 + 12 * MM, uy + 4.5 * MM, a, 10, True)
    text(pg, x1 + 26 * MM, uy + 1.2 * MM, b, 8.5, w=100 * MM)
    uy += 13 * MM

# 오른쪽: 왜 / 규격
x2 = L + 278 * MM
rrect(pg, fitz.Rect(x2, y0, W - L, y0 + 66 * MM), 3 * MM, fill=(0.93, 0.97, 1.0))
text(pg, x2 + 6 * MM, y0 + 9 * MM, '왜 그립인가', 11, True, NAVY)
text(pg, x2 + 6 * MM, y0 + 12 * MM,
     '선로에 떨어지는 물건 가운데 가장 많은 것이 휴대전화입니다. '
     '서울교통공사 집계로 2023년 1~8월 선로 유실물 1,276건 중 547건(43%)이 휴대전화였습니다. '
     '떨어진 폰은 운행이 끝난 밤에야 주울 수 있고, 주우려고 선로로 내려가는 일은 그 자체로 사고가 됩니다.\n'
     '그래서 안전 히어로 타구가 폰을 직접 붙잡게 했습니다. 늘 손에 쥐는 물건이라 하루에도 몇십 번 타구와 바쿠를 보게 됩니다.',
     8.5, w=92 * MM)
rrect(pg, fitz.Rect(x2, y0 + 70 * MM, W - L, y0 + 126 * MM), 3 * MM, color=(0.84, 0.84, 0.84), width=0.6)
text(pg, x2 + 6 * MM, y0 + 79 * MM, '규격', 11, True)
spec = ('크기    42 × 38 × 6mm (원화 외곽 다이컷)\n'
        '소재    투명 아크릴 3T UV 인쇄, 아연합금 링·회전판\n'
        '부착    재부착 실리콘 패드 (케이스 뒷면)\n'
        '포장    95 × 150mm 헤더 카드 + OPP 봉투\n'
        '제작    기성 그립 부품 + 아크릴 다이컷이라 새 금형 없음')
text(pg, x2 + 6 * MM, y0 + 82 * MM, spec, 8.5, w=104 * MM)

# ④ 노선 4종
yb = 186 * MM
pg.draw_line((L, yb - 6 * MM), (W - L, yb - 6 * MM), color=(0.85, 0.85, 0.85), width=0.5)
text(pg, L, yb, '④ 노선 4종 — 몸통 색만 바꿔 기본형과 1·2·3호선을 모으게 합니다 (공식 응용형 호선 색)', 10, True)
for i, (name, cmap) in enumerate(LINE.items()):
    bx = L + i * 60 * MM
    b = fitz.Rect(bx, yb + 7 * MM, bx + 52 * MM, yb + 55 * MM)
    grip(pg, b, cmap, edge=1.0)
    text(pg, bx + 20 * MM, yb + 63 * MM, name, 10, True)

# 헤더 카드 목업
hx, hy = L + 250 * MM, yb + 1 * MM
card = fitz.Rect(hx, hy, hx + 66 * MM, hy + 96 * MM)
rrect(pg, card, 2 * MM, color=(0.8, 0.8, 0.8), fill=WHITE, width=0.6)
pg.draw_circle((card.x0 + 33 * MM, card.y0 + 6 * MM), 2.6 * MM, color=(0.7, 0.7, 0.7), width=0.6)
pg.draw_rect(fitz.Rect(card.x0, card.y0 + 12 * MM, card.x1, card.y0 + 30 * MM), color=None, fill=BLUE)
text(pg, card.x0 + 4 * MM, card.y0 + 20 * MM, '꼭 잡아, 타구!', 14, True, WHITE)
text(pg, card.x0 + 4 * MM, card.y0 + 26.5 * MM, '선로에 떨어뜨리지 마세요', 8.5, color=WHITE)
grip(pg, fitz.Rect(card.x0 + 10 * MM, card.y0 + 33 * MM, card.x1 - 10 * MM, card.y0 + 76 * MM), None, edge=1.0)
text(pg, card.x0 + 4 * MM, card.y0 + 80 * MM, '승강장에서는 바쿠 고리에\n손가락을 끼워 주세요.', 7.5, w=60 * MM)
text(pg, card.x0 + 4 * MM, card.y1 - 4 * MM, 'DTRO 대구교통공사', 7, True, NAVY)
text(pg, card.x1 + 4 * MM, hy + 8 * MM, '헤더 카드\n95 × 150mm\n뒷면: 쓰는 법\n· 노선도', 8, color=GREY, w=36 * MM)

text(pg, L, H - 9 * MM, '캐릭터 원화: 대구교통공사 누리집 공개 AI 파일(기본형 조합)을 그대로 사용하고, 노선 4종은 몸통 색만 바꿈. 생성형 AI 미활용.', 7.5, color=GREY)

doc.subset_fonts()
open(OUT_AI, 'wb').write(doc.tobytes(garbage=4, deflate=True))
open(OUT_PNG, 'wb').write(pg.get_pixmap(dpi=150).tobytes('png'))
print('ok')
