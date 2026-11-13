"""기획서 그림(PNG) — analysis.json 수치로 SVG/HTML 을 그리고 크롬 헤드리스로 캡처.
실행: python -I build/make_figs.py   (analysis.py 다음)
"""
import json
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
FIG = ROOT / "assets" / "fig"
FIG.mkdir(parents=True, exist_ok=True)
A = json.load(open(HERE / "analysis.json", encoding="utf-8"))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

BASE = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
html,body{margin:0;background:#fff;font-family:'Malgun Gothic',sans-serif;color:#222}
.wrap{padding:14px 18px} h3{margin:0 0 4px;font-size:15px} .sub{font-size:11.5px;color:#555;margin:0 0 8px}
text{font-family:'Malgun Gothic',sans-serif}
</style></head><body><div class="wrap">%s</div></body></html>"""

INK, ACC, ACC2, GRAY, LIGHT = "#2b2b2b", "#c0392b", "#1f5f8b", "#9aa3ab", "#e9edf1"


def shot(name, html, w, h):
    src = HERE / "_fig" / f"{name}.html"
    src.parent.mkdir(exist_ok=True)
    src.write_text(BASE % html, encoding="utf-8")
    out = FIG / f"{name}.png"
    prof = tempfile.mkdtemp(prefix="chr_fig_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                    f"--window-size={w},{h}", "--force-device-scale-factor=2", f"--screenshot={out}", src.as_uri()],
                   capture_output=True, timeout=120)
    print(name, out.exists())


def bars(vals, labels, x0, y0, w, h, vmax, color_fn, show=True):
    n = len(vals)
    bw = w / n
    s = []
    for i, v in enumerate(vals):
        bh = h * v / vmax
        x = x0 + i * bw + bw * 0.14
        s.append(f'<rect x="{x:.1f}" y="{y0 + h - bh:.1f}" width="{bw * 0.72:.1f}" height="{bh:.1f}" fill="{color_fn(i, v)}"/>')
        if show:
            s.append(f'<text x="{x + bw * 0.36:.1f}" y="{y0 + h - bh - 4:.1f}" font-size="11" text-anchor="middle" fill="{INK}">{v:,}</text>')
        s.append(f'<text x="{x + bw * 0.36:.1f}" y="{y0 + h + 15:.1f}" font-size="11" text-anchor="middle" fill="#444">{labels[i]}</text>')
    return "".join(s)


def fig1():
    """같은 두 공연, 시작 시각만 다른 이틀 — 올림픽공원역(5·9호선) 시간대별 승차."""
    S = A["subway"]
    hrs = list(range(16, 24))
    lab = [f"{h}시" for h in hrs]
    d20 = [S["2024-07-20"]["park_by_hour"][str(h)] for h in hrs]
    d21 = [S["2024-07-21"]["park_by_hour"][str(h)] for h in hrs]
    vmax = 4300
    W, H = 760, 330
    pk20, pk21 = max(d20), max(d21)
    col20 = lambda i, v: ACC if v == pk20 else GRAY
    col21 = lambda i, v: ACC2 if v == pk21 else GRAY
    svg = f'''<svg width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg">
<text x="10" y="18" font-size="13" font-weight="700">7월 20일(토) — 두 공연 모두 18:00 시작</text>
<text x="10" y="35" font-size="11" fill="#555">KSPO DOME(SG워너비, 소요 150분) · 올림픽홀(휘인, 소요 120분)</text>
<line x1="20" y1="270" x2="360" y2="270" stroke="#bbb"/>
{bars(d20, lab, 20, 60, 340, 210, vmax, col20)}
<text x="400" y="18" font-size="13" font-weight="700">7월 21일(일) — 1시간 엇갈려 시작</text>
<text x="400" y="35" font-size="11" fill="#555">올림픽홀 16:00 · KSPO DOME 17:00 (같은 두 공연)</text>
<line x1="410" y1="270" x2="750" y2="270" stroke="#bbb"/>
{bars(d21, lab, 410, 60, 340, 210, vmax, col21)}
<text x="10" y="312" font-size="11" fill="#444">세로: 올림픽공원역 5호선+9호선 시간대별 승차 인원(명). 가장 붐빈 1시간 — 20일 {pk20:,}명, 21일 {pk21:,}명({round(100 * (pk21 - pk20) / pk20)}%).</text>
<text x="10" y="327" font-size="10.5" fill="#666">자료: 서울교통공사 역별 일별 시간대별 승하차인원(5호선)·9호선 2·3단계 역별일별시간대별승하차인원(2024), 올림픽공원 공연정보</text>
</svg>'''
    shot("fig1_same_vs_stagger", svg, W + 40, H + 40)


def fig2():
    """공연이 끝난 1시간, 역별 승차 — 평일 같은 시각 평균과 비교."""
    S = A["subway"]
    days = [("2024-07-13", "7/13(토)"), ("2024-07-20", "7/20(토)"), ("2024-07-27", "7/27(토)"), ("2024-07-28", "7/28(일)")]
    st = [("올림픽공원역(5호선)", "올림픽공원역(9호선)"), ("한성백제역(9호선)",), ("몽촌토성역(8호선)",)]
    names = ["올림픽공원역\n(5·9호선)", "한성백제역\n(9호선)", "몽촌토성역\n(8호선)"]
    W, H = 760, 345
    g = []
    gx = 70
    vmax = 6500
    for di, (d, dl) in enumerate(days):
        row = S[d]
        x0 = gx + di * 172
        for si, keys in enumerate(st):
            v = sum(row[k]["v"] for k in keys)
            b = sum(row[k]["weekday_avg"] for k in keys)
            x = x0 + si * 46
            bh, bbh = 210 * v / vmax, 210 * b / vmax
            col = ACC if si == 0 else ACC2
            g.append(f'<rect x="{x}" y="{270 - bh:.1f}" width="34" height="{bh:.1f}" fill="{col}" opacity="{1 if si == 0 else .85}"/>')
            g.append(f'<line x1="{x - 3}" x2="{x + 37}" y1="{270 - bbh:.1f}" y2="{270 - bbh:.1f}" stroke="{INK}" stroke-width="2" stroke-dasharray="3 2"/>')
            g.append(f'<text x="{x + 17}" y="{270 - bh - 5:.1f}" font-size="10.5" text-anchor="middle">{v:,}</text>')
            g.append(f'<text x="{x + 17}" y="283" font-size="9.5" text-anchor="middle" fill="#555">{["올림픽공원", "한성백제", "몽촌토성"][si]}</text>')
        g.append(f'<text x="{x0 + 63}" y="300" font-size="11.5" text-anchor="middle" font-weight="700">{dl} {row["peak_hour"]}시대</text>')
    svg = f'''<svg width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg">
<text x="10" y="18" font-size="13" font-weight="700">공연이 끝난 1시간, 공원 주변 세 역의 승차 인원</text>
<text x="10" y="35" font-size="11" fill="#555">막대: 그날 그 시간 승차(명) · 점선: 7월 평일 같은 시간 평균</text>
<rect x="470" y="8" width="12" height="12" fill="{ACC}"/><text x="487" y="18" font-size="11">올림픽공원역(5·9호선)</text>
<rect x="610" y="8" width="12" height="12" fill="{ACC2}"/><text x="627" y="18" font-size="11">한성백제역 · 몽촌토성역</text>
<line x1="60" y1="270" x2="750" y2="270" stroke="#bbb"/>
{''.join(g)}
<text x="10" y="322" font-size="11" fill="#444">네 날 모두 평일보다 늘어난 승차의 99% 이상이 올림픽공원역에서 생겼고, 공원 남4문(평화의문광장) 쪽 한성백제역·몽촌토성역은 평일 수준이었다.</text>
<text x="10" y="337" font-size="10.5" fill="#666">자료: 서울교통공사 역별 일별 시간대별 승하차인원 / 9호선 2·3단계 역별일별시간대별승하차인원(2024.7), 제안자 집계</text>
</svg>'''
    shot("fig2_one_station", svg, W + 40, H + 40)


def fig3():
    """2024·2025 공연정보 집계 — 같은 시각 시작."""
    O = A["overlap"]
    W, H = 760, 250
    rows = []
    for i, y in enumerate(("2024", "2025")):
        o = O[y]
        y0 = 62 + i * 78
        tot = o["evening_days"]
        sc = 560 / 140
        rows.append(f'<text x="10" y="{y0 + 20}" font-size="13" font-weight="700">{y}년</text>')
        rows.append(f'<rect x="70" y="{y0}" width="{tot * sc:.1f}" height="30" fill="{LIGHT}"/>')
        rows.append(f'<rect x="70" y="{y0}" width="{o["multi_venue_days"] * sc:.1f}" height="30" fill="#b9c6d3"/>')
        rows.append(f'<rect x="70" y="{y0}" width="{o["same_start_days"] * sc:.1f}" height="30" fill="{ACC}"/>')
        rows.append(f'<text x="76" y="{y0 + 20}" font-size="11.5" fill="#fff" font-weight="700">같은 시각 시작 {o["same_start_days"]}일</text>')
        rows.append(f'<text x="{70 + o["multi_venue_days"] * sc - 6:.1f}" y="{y0 + 20}" font-size="11" text-anchor="end">2곳 이상 {o["multi_venue_days"]}일</text>')
        rows.append(f'<text x="{70 + tot * sc + 6:.1f}" y="{y0 + 20}" font-size="11">저녁 공연일 {tot}일</text>')
        rows.append(f'<text x="70" y="{y0 + 47}" font-size="10.5" fill="#555">같은 시각 시작한 날 중 주말 {o["same_start_weekend"]}일 · 그 시각에 동시에 시작한 좌석 합 중앙값 약 {o["median_seats_same"]:,}석</text>')
    svg = f'''<svg width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg">
<text x="10" y="18" font-size="13" font-weight="700">대형 공연장 4곳(KSPO DOME·티켓링크 라이브 아레나·올림픽홀·우리금융아트홀)의 저녁 공연일</text>
<text x="10" y="35" font-size="11" fill="#555">15시 이후 시작, 공연기간 7일 이하 공연만. 장기 상설 공연·여러 무대 페스티벌 제외</text>
{''.join(rows)}
<text x="10" y="232" font-size="10.5" fill="#666">자료: 한국체육산업개발 올림픽공원 공연정보(공연일정 원천 누리집, 2026.11.8. 수집) 시간 표기를 자동 해석해 제안자 집계. 해석 못 한 공연일 연 14건은 제외</text>
</svg>'''
    shot("fig3_overlap_stats", svg, W + 40, H + 30)


def fig4():
    """서비스 구조."""
    box = lambda x, y, w, h, t, sub="", fill="#fff", stroke=INK: (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="1.3"/>'
        f'<text x="{x + w / 2}" y="{y + (h / 2 if not sub else h / 2 - 6)}" font-size="12.5" font-weight="700" text-anchor="middle" dominant-baseline="middle">{t}</text>'
        + (f'<text x="{x + w / 2}" y="{y + h / 2 + 11}" font-size="10.5" text-anchor="middle" fill="#444">{sub}</text>' if sub else ""))
    arrow = lambda x1, y1, x2, y2: f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="1.3" marker-end="url(#a)"/>'
    W, H = 760, 300
    svg = f'''<svg width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="{INK}"/></marker></defs>
<text x="10" y="18" font-size="13" font-weight="700">퇴장 겹침 예보 — 데이터에서 안내까지</text>
{box(10, 40, 200, 46, "올림픽공원 공연정보", "장소·시간·소요시간", LIGHT)}
{box(10, 96, 200, 46, "입출차 정보(+연계 데이터)", "실제 퇴장 늦어짐 학습", LIGHT)}
{box(10, 152, 200, 46, "대관정보", "공연정보에 없는 행사", LIGHT)}
{box(10, 208, 200, 46, "주차장 혼잡도·실시간 주차", "차량 관객 출차 안내", LIGHT)}
{box(270, 70, 200, 56, "① 예상 퇴장 시각", "시작+소요+공연장별 늦어짐")}
{box(270, 150, 200, 56, "② 겹침 판정", "30분 안에 2곳 이상·좌석 합")}
{arrow(210, 63, 268, 92)}{arrow(210, 119, 268, 102)}{arrow(210, 175, 268, 175)}{arrow(370, 126, 370, 148)}
{box(530, 40, 220, 66, "③ 관객 안내(웹)", "오늘 겹침 여부 · 내 공연장의 출구/역", "#fff", ACC)}
{box(530, 120, 220, 66, "④ 운영자 화면", "겹침일 달력 · 인력·안내 시각표", "#fff", ACC2)}
{box(530, 200, 220, 66, "⑤ 대관 단계 권고", "같은 날 시작 30~60분 엇갈림", "#fff", ACC2)}
{arrow(470, 170, 528, 76)}{arrow(470, 176, 528, 152)}{arrow(470, 184, 528, 230)}<polyline points="210,231 500,231 500,98 526,98" fill="none" stroke="{INK}" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#a)"/>
<text x="10" y="290" font-size="10.5" fill="#666">왼쪽 네 칸은 한국체육산업개발 개방 데이터. 지하철 승하차(서울교통공사)는 효과 확인용으로 함께 씁니다.</text>
</svg>'''
    shot("fig4_structure", svg, W + 40, H + 30)


if __name__ == "__main__":
    fig1(); fig2(); fig3(); fig4()
