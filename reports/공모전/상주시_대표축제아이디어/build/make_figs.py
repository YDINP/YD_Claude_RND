"""제안서 그림 3종(SVG → PNG, Chrome headless 스크린샷)."""
import math
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
FIG = HERE.parent / "assets" / "fig"
FIG.mkdir(parents=True, exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
F = "'Malgun Gothic',sans-serif"
O, OD, N, G, L = "#E8772E", "#B5501A", "#1F4E79", "#6B7280", "#F5F7FA"


def shot(name, svg, w, h):
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#fff}}</style></head>
<body>{svg}</body></html>"""
    src = HERE / f"_fig_{name}.html"
    src.write_text(html, encoding="utf-8")
    out = FIG / f"{name}.png"
    prof = tempfile.mkdtemp(prefix="chr_fig_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                    "--force-device-scale-factor=2", f"--window-size={w},{h}", f"--screenshot={out}", src.as_uri()],
                   capture_output=True, timeout=60)
    print(out, out.exists())


# 1. 감 한 줄의 달력 ---------------------------------------------------------
def timeline():
    W, H = 1000, 300
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="{F}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="20" y="30" font-size="19" font-weight="700" fill="{N}">감 한 줄의 달력 — 가을에 걸고, 설 앞에 받는다</text>']
    # 축
    x0, x1, y = 40, 960, 140
    s.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="#9CA3AF" stroke-width="3"/>')
    months = [("9월", 40), ("10월", 225), ("11월", 410), ("12월", 595), ("2028.1월", 780)]
    for t, x in months:
        s.append(f'<line x1="{x}" y1="{y - 6}" x2="{x}" y2="{y + 6}" stroke="#9CA3AF" stroke-width="2"/>'
                 f'<text x="{x + 4}" y="{y + 24}" font-size="13" fill="{G}">{t}</text>')
    # 구간 막대
    def band(xa, xb, yy, col, label, sub, txtcol="#fff"):
        s.append(f'<rect x="{xa}" y="{yy}" width="{xb - xa}" height="34" rx="6" fill="{col}"/>'
                 f'<text x="{(xa + xb) / 2}" y="{yy + 22}" text-anchor="middle" font-size="14" font-weight="700" fill="{txtcol}">{label}</text>')
        if sub:
            s.append(f'<text x="{(xa + xb) / 2}" y="{yy - 8}" text-anchor="middle" font-size="12.5" fill="#333">{sub}</text>')
    band(40, 225, 82, "#FCE3D2", "① 감 한 줄 예약", "추석 전후 온라인·고향사랑기부 답례품", OD)
    band(358, 455, 82, O, "② 열린 덕장", "상강(10.24)~입동(11.8) 농가 20곳")
    band(396, 428, 175, OD, "", "")
    s.append(f'<text x="412" y="232" text-anchor="middle" font-size="14" font-weight="700" fill="{OD}">③ 감 거는 사흘</text>'
             f'<text x="412" y="250" text-anchor="middle" font-size="12.5" fill="#333">10.29(금)~31(일) 경상감영공원</text>')
    band(455, 780, 175, "#FDF1E8", "④ 마르는 60일 — 2주마다 ‘내 감 사진 편지’", "", OD)
    band(780, 960, 82, N, "⑤ 받는 날", "1월 초 배송 · 1월 곶감축제에서 직접 수령")
    s.append(f'<line x1="935" y1="{y - 40}" x2="935" y2="{y + 40}" stroke="{N}" stroke-width="2" stroke-dasharray="4 3"/>'
             f'<text x="935" y="{y + 58}" text-anchor="middle" font-size="13" font-weight="700" fill="{N}">설(1.26)</text>')
    s.append(f'<text x="20" y="290" font-size="12" fill="{G}">※ 둥시 곶감 자연건조 약 60일(매일신문, 2026.2.25). 2027년 절기·요일 기준. 1월 곶감축제(기존)를 ‘받는 날’로 이어 2막 구조로 만든다.</text>')
    s.append("</svg>")
    shot("timeline", "".join(s), W, H)


# 2. 주황 노선 개념도 ------------------------------------------------------
PTS = {  # (위도, 경도) — OpenStreetMap 지오코딩(감영공원은 복룡동 기준점)
    "곶감공원": (36.3757, 128.1028), "남장동": (36.4186, 128.1147), "감영공원": (36.4190, 128.1720),
    "북천": (36.4271, 128.1549), "시청": (36.4110, 128.1591), "경천섬": (36.4392, 128.2592),
}


def km(a, b):
    (la1, lo1), (la2, lo2) = PTS[a], PTS[b]
    dy = (la1 - la2) * 111.0
    dx = (lo1 - lo2) * 111.0 * math.cos(math.radians(36.41))
    return math.hypot(dx, dy)


def routemap():
    lo0, la1 = 128.085, 36.452
    PX = 48  # px/km (가로·세로 같은 축척)
    kx_ = 111.0 * math.cos(math.radians(36.41))
    W, H = 1000, int(70 + (la1 - 36.362) * 111.0 * PX + 110)
    def xy(k):
        la, lo = PTS[k]
        return 60 + (lo - lo0) * kx_ * PX, 70 + (la1 - la) * 111.0 * PX
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="{F}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="20" y="30" font-size="19" font-weight="700" fill="{N}">한 거점 · 두 노선 — 경상감영공원에서 덕장 마을과 낙동강으로</text>']
    # 낙동강(개념)
    gx, gy = xy("곶감공원"); nx, ny = xy("남장동"); kx, ky = xy("감영공원"); bx, by = xy("북천"); cx, cy = xy("시청"); rx, ry = xy("경천섬")
    s.append(f'<path d="M {rx + 70} 50 C {rx + 20} {ry - 80}, {rx - 30} {ry + 40}, {rx + 10} {ry + 200} S {rx + 90} {H - 160}, {rx + 60} {H - 110}" stroke="#9CC3E6" stroke-width="22" fill="none" stroke-linecap="round"/>'
             f'<text x="{rx + 90}" y="{H - 130}" font-size="13" fill="#3B6E9C">낙동강(개념)</text>')
    s.append(f'<polyline points="{kx},{ky} {nx},{ny} {gx},{gy}" fill="none" stroke="{O}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
    s.append(f'<polyline points="{kx},{ky} {rx},{ry}" fill="none" stroke="{N}" stroke-width="9" stroke-linecap="round"/>')
    s.append(f'<polyline points="{cx},{cy} {bx},{by} {kx},{ky} {cx},{cy}" fill="none" stroke="#9CA3AF" stroke-width="5" stroke-dasharray="9 6"/>')
    def node(x, y, r, col, t1, t2, dx=0, dy=-22, anchor="middle"):
        s.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="{col}" stroke-width="5"/>'
                 f'<text x="{x + dx}" y="{y + dy}" text-anchor="{anchor}" font-size="15" font-weight="700" fill="#111">{t1}</text>'
                 f'<text x="{x + dx}" y="{y + dy + 18}" text-anchor="{anchor}" font-size="12.5" fill="#444">{t2}</text>')
    node(kx, ky, 17, OD, "경상감영공원 (주 행사장)", "감 깎는 마당·축제 덕장·삼백 장터", 26, 40, "start")
    node(nx, ny, 11, O, "남장동 곶감마을", "열린 덕장 · 곶감특구", -16, -30, "start")
    node(gx, gy, 11, O, "외남면 소은리", "상주곶감공원 · 하늘 아래 첫 감나무", 22, 2, "start")
    node(rx, ry, 11, N, "경천섬 · 상주보", "자전거박물관 · 낙동강생물자원관", -10, -26, "end")
    node(bx, by, 8, G, "북천시민공원", "주차 · ‘덕장 옆 하룻밤’ 캠핑", -14, -40, "end")
    node(cx, cy, 8, G, "시내 · 중앙시장", "상주역 · 종합터미널", -16, 30, "end")
    d1 = km("감영공원", "남장동") + km("남장동", "곶감공원"); d2 = km("감영공원", "경천섬")
    ly = H - 58
    s.append(f'<rect x="20" y="{ly - 18}" width="{W - 40}" height="58" rx="8" fill="{L}"/>')
    s.append(f'<line x1="40" y1="{ly}" x2="80" y2="{ly}" stroke="{O}" stroke-width="8"/><text x="88" y="{ly + 5}" font-size="13.5">덕장선(셔틀·감길 자전거 A) 직선 약 {d1:.0f}km</text>'
             f'<line x1="400" y1="{ly}" x2="440" y2="{ly}" stroke="{N}" stroke-width="8"/><text x="448" y="{ly + 5}" font-size="13.5">강변선(셔틀·감길 자전거 B) 직선 약 {d2:.0f}km</text>'
             f'<line x1="740" y1="{ly}" x2="780" y2="{ly}" stroke="#9CA3AF" stroke-width="5" stroke-dasharray="9 6"/><text x="788" y="{ly + 5}" font-size="13.5">시내 순환</text>')
    s.append(f'<text x="40" y="{ly + 28}" font-size="12" fill="{G}">※ 위치는 OpenStreetMap 좌표로 그린 개념도(축척 근사). 거리는 직선거리이며 도로 거리는 이보다 길다(추정 1.2~1.4배).</text>')
    s.append("</svg>")
    shot("routemap", "".join(s), W, H)
    return d1, d2


# 3. 경상감영공원 배치 개념도 ----------------------------------------------
def layout():
    W, H = 1000, 640
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="{F}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="20" y="30" font-size="19" font-weight="700" fill="{N}">주 행사장 배치 개념도 — 태평성대 경상감영공원(약 6.5만㎡)</text>']
    s.append(f'<rect x="40" y="60" width="920" height="470" rx="18" fill="#F3F7EE" stroke="#9DB58A" stroke-width="3"/>')
    def z(x, y, w, h, col, num, t1, t2, tc="#111"):
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{col}" stroke="#fff" stroke-width="3"/>'
                 f'<circle cx="{x + 22}" cy="{y + 22}" r="14" fill="#fff"/><text x="{x + 22}" y="{y + 27}" text-anchor="middle" font-size="14" font-weight="700" fill="{N}">{num}</text>'
                 f'<text x="{x + 44}" y="{y + 28}" font-size="16" font-weight="700" fill="{tc}">{t1}</text>'
                 + "".join(f'<text x="{x + 16}" y="{y + 52 + i * 19}" font-size="13" fill="{tc}">{t}</text>' for i, t in enumerate(t2)))
    # 위쪽(정문에서 먼 곳): 무대·공방·어린이 / 가운데: 장터 / 아래(정문 쪽): 깎기·덕장·안전본부
    z(70, 90, 290, 130, "#E3ECF7", "3", "명주 이름표 공방 · 전시", ["함창 명주 이름표", "국가중요농업유산 해설전(감영 건물)"])
    z(380, 90, 260, 130, "#EDE7F6", "5", "마당 무대", ["지역 예술인·청년 공연", "대형 가수 초청 없음"])
    z(660, 90, 270, 130, "#E6F4EA", "6", "어린이 마당", ["감 따기·걸기 놀이", "감물 들이기"])
    z(70, 235, 170, 135, "#E3ECF7", "7", "자전거 거점", ["감길 자전거", "출발·대여 300대"])
    z(255, 235, 505, 135, "#FFF4D6", "4", "삼백 장터 · 삼백 밥상", ["곶감·햅쌀·한우·오이 농가 직판 40", "지역 음식점 20 — 가격 사전 공개 · 다회용기 세척장"])
    z(775, 235, 155, 135, "#F1F1F1", "9", "편의 · 쉼터", ["화장실", "수유실 · 보온 쉼터"])
    z(70, 385, 330, 130, "#FCE3D2", "1", "감 깎는 마당", ["깎기 50면(100석, 천막 5동)", "감 선생님 100명 · 한 줄 = 감 10개"])
    z(415, 385, 330, 130, O, "2", "축제 덕장 (야경)", ["가설 덕장 2동 60m×8m, 지붕·방충망", "농가 전시분 + 그날 걸린 줄, 18~22시 조명"], "#fff")
    z(760, 385, 170, 130, "#F1F1F1", "8", "안전본부", ["의무실 · 미아", "인파 관제"])
    # 동선 화살표
    s.append(f'<defs><marker id="ar" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto"><path d="M0,0 L14,7 L0,14z" fill="{OD}"/></marker></defs>')
    s.append(f'<path d="M 500 528 C 420 528, 360 524, 330 518" stroke="{OD}" stroke-width="3" fill="none" stroke-dasharray="7 5" marker-end="url(#ar)"/>')
    s.append(f'<path d="M 395 400 L 418 400" stroke="{OD}" stroke-width="3" fill="none" marker-end="url(#ar)"/>')
    s.append(f'<path d="M 700 388 L 700 368" stroke="{OD}" stroke-width="3" fill="none" marker-end="url(#ar)"/>')
    # 출입구
    for x, y, t in ((40, 300, "서문"), (560, 530, "정문(주출입)"), (960, 300, "동문")):
        ww = 120 if len(t) > 2 else 68
        s.append(f'<rect x="{x - ww / 2}" y="{y - 14}" width="{ww}" height="28" rx="6" fill="{N}"/><text x="{x}" y="{y + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">{t}</text>')
    s.append(f'<text x="560" y="572" text-anchor="middle" font-size="14" fill="#333">정문 앞 셔틀 정류장 ① 시내 순환 ② 덕장선 ③ 강변선 · 택시·장애인 승하차장</text>')
    
    s.append(f'<text x="20" y="612" font-size="12" fill="{G}">※ 존 구성과 상대 배치를 보인 개념도. 실제 위치·면적은 공원 현황 측량과 기존 행사(곶감축제·모자페스티벌) 배치 자료로 확정한다.</text>')
    s.append(f'<text x="20" y="630" font-size="12" fill="{G}">※ 한 방향 동선(점선 화살표): 정문 → ① 깎기 → ② 걸기(이름표 부착) → ④ 장터 → 동·서문 분산 퇴장. 무대(⑤)는 정문 반대편 안쪽에 두어 병목을 막는다.</text>')
    s.append("</svg>")
    shot("layout", "".join(s), W, H)


if __name__ == "__main__":
    timeline()
    print(routemap())
    layout()
