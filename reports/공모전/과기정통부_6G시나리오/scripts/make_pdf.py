"""6G 시나리오 공모 — 첨부 PDF(2쪽) 생성. HTML -> Chrome headless."""
import subprocess, tempfile
from pathlib import Path

OUT = Path(r"D:/park/YD_Claude_RND/reports/공모전/과기정통부_6G시나리오")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

TITLE = "기지국이 먼저 밟아 본 새벽길"
SUB = "6G 통신·센싱으로 보이지 않는 살얼음을 걸음 단위로 알려 주는 빙판 지도"

STEPS = [
    ("02:10", "측정", "가로등·옥상의 6G 기지국이 통신 전파의 노면 반사를 읽고, 기지국 안 AI가 '결빙 칸'을 판정해 빙판 지도를 그린다. 영상은 찍지 않는다."),
    ("02:40", "제설", "구청 제설 담당자에게 지도 전달. 정류장 경사로·지하철 계단·학교 앞 순서로 우선순위. 살포차는 순찰 대신 표시된 칸으로."),
    ("04:50", "출발 전", "72세 정옥순 씨: \"왼쪽 난간 쪽은 말라 있어요. 오른쪽 배수구 앞 다섯 걸음은 얼었어요.\""),
    ("05:02", "걷는 중", "정밀 측위로 '얼음 세 걸음 앞'을 알고, 주머니 속 휴대폰이 두 번 떨리며 \"왼쪽으로 붙으세요\"."),
    ("05:15", "도로", "배달 라이더 내비: \"다음 그늘진 우회전 결빙, 미리 감속하세요.\""),
    ("07:30", "녹음", "해가 들어 녹은 칸은 지도에서 스스로 지워진다. 예보가 아니라 측정이기 때문."),
]

ROWS = [
    ("노면 상태 측정", "통신 전용 설계. 5G-Advanced 센싱 연구도 드론 탐지 등 일부 사례 중심", "통신·센싱 융합(ISAC)이 6대 사용 시나리오 중 하나. ITU 사례에 보행자 탐지·환경 모니터링(비·오염 탐지) 명시"),
    ("사용자 위치", "상용 목표 실내 3 m · 실외 10 m (단말 80%, 3GPP TR 38.855)", "연구 목표 1~10 cm (ITU-R M.2160) → 보도 좌·우, '세 걸음 앞' 구분"),
    ("판정 위치·사생활", "센서 원자료를 서버로 모아 분석", "기지국 안 AI가 바로 판정, '결빙 칸'만 전송. 영상·신원 없음"),
    ("덮는 범위", "결빙 취약구간 등 정해진 지점의 고정 센서·표지", "통신망이 깔린 모든 골목·보도를 매일 밤 새로 측정"),
]

def timeline_svg():
    w, h = 680, 300
    x0, x1, y = 50, 630, 105
    parts = [f'<svg viewBox="0 0 {w} {h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic">',
             f'<rect x="0" y="0" width="{w}" height="{h}" rx="10" fill="#0f1e33"/>',
             f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="#6b8bb5" stroke-width="3"/>']
    n = len(STEPS)
    for i, (t, name, _) in enumerate(STEPS):
        x = x0 + (x1 - x0) * i / (n - 1)
        col = "#8fd3ff" if i < 2 else ("#ffd479" if i < 5 else "#ffb38a")
        parts.append(f'<circle cx="{x}" cy="{y}" r="11" fill="{col}"/>')
        ty = y - 40 if i % 2 == 0 else y + 36
        parts.append(f'<text x="{x}" y="{ty}" fill="#fff" font-size="17" font-weight="700" text-anchor="middle">{t}</text>')
        parts.append(f'<text x="{x}" y="{ty + 20}" fill="{col}" font-size="14" text-anchor="middle">{name}</text>')
    # 기지국 + 전파 반사 + 얼음 칸 그림
    parts += [
        '<rect x="70" y="236" width="540" height="14" fill="#3a4a60"/>',
        '<rect x="330" y="236" width="70" height="14" fill="#bfe8ff" opacity="0.9"/>',
        '<text x="365" y="272" fill="#bfe8ff" font-size="12" text-anchor="middle">결빙 칸 (투명한 살얼음)</text>',
        '<line x1="120" y1="200" x2="120" y2="236" stroke="#9aa9bd" stroke-width="3"/>',
        '<rect x="108" y="190" width="24" height="12" rx="3" fill="#8fd3ff"/>',
        '<text x="120" y="184" fill="#8fd3ff" font-size="12" text-anchor="middle">6G 기지국</text>',
        '<path d="M132 198 L355 236" stroke="#8fd3ff" stroke-width="2" stroke-dasharray="6 4"/>',
        '<path d="M365 236 L470 205" stroke="#ffd479" stroke-width="2" stroke-dasharray="6 4"/>',
        '<text x="500" y="200" fill="#ffd479" font-size="12">반사 모양이 바뀜 → AI 판정</text>',
        '</svg>']
    return "\n".join(parts)

def html():
    steps = "".join(f'<tr><td class="t">{t}</td><td class="n">{n}</td><td>{d}</td></tr>' for t, n, d in STEPS)
    rows = "".join(f'<tr><th>{a}</th><td>{b}</td><td class="g">{c}</td></tr>' for a, b, c in ROWS)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{TITLE}</title><style>
@page {{ size:A4; margin:14mm 15mm; }}
* {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }}
body {{ font-family:'Malgun Gothic',sans-serif; font-size:10.2pt; color:#14202e; line-height:1.6; margin:0; }}
.kicker {{ color:#3a6ea5; font-weight:700; font-size:9.5pt; letter-spacing:.5px; }}
h1 {{ font-size:22pt; margin:2px 0 0; }}
.sub {{ font-size:12pt; color:#33475e; margin:2px 0 12px; }}
h2 {{ font-size:12.5pt; border-left:5px solid #3a6ea5; padding-left:8px; margin:16px 0 8px; }}
.box {{ background:#f1f6fb; border-radius:8px; padding:10px 14px; }}
.big {{ font-size:15pt; font-weight:700; color:#b3402a; }}
table {{ width:100%; border-collapse:collapse; }}
.tl td {{ border-bottom:1px solid #dde5ee; padding:5px 6px; vertical-align:top; }}
.tl .t {{ width:52px; font-weight:700; color:#3a6ea5; }}
.tl .n {{ width:62px; font-weight:700; }}
.cmp th, .cmp td {{ border:1px solid #c9d5e2; padding:7px 8px; vertical-align:top; font-size:9.6pt; }}
.cmp thead th {{ background:#1d3557; color:#fff; }}
.cmp tbody th {{ background:#f1f6fb; width:18%; text-align:left; }}
.cmp .g {{ background:#eef8ef; }}
.src {{ font-size:8.3pt; color:#4b5b6c; line-height:1.45; }}
.pb {{ page-break-before:always; }}
.two {{ display:flex; gap:12px; }} .two > div {{ flex:1; }}
</style></head><body>
<div class="kicker">6G 서비스 시나리오 공모전 · 6G 예상 시나리오 Track · 일반부문</div>
<h1>{TITLE}</h1>
<div class="sub">{SUB}</div>
<div class="box"><span class="big">97.6%</span> — 국내 결빙 사고 가운데 '결빙 취약구간'으로 지정되지 <b>않은</b> 곳에서 일어난 비율(한국도로학회논문집 26(6), 2024).
얼음은 '늘 얼던 곳'이 아니라 '오늘 밤 언 곳'에 생깁니다. 블랙아이스는 투명해 어두운 새벽엔 눈에도 카메라에도 젖은 길로 보입니다.
결빙 교통사고 치사율 2.3은 전체 교통사고(1.5)의 약 1.5배입니다(도로교통공단, 2018~2022).<br>
<b>이 시나리오의 생각:</b> 동네마다 이미 깔릴 6G 기지국이 통신하는 그 전파로 노면을 매일 밤 재면, 지정 구간이 아니라 <b>측정된 지점</b>에 대응할 수 있습니다.</div>
<h2>1월 어느 새벽 — 이용 장면</h2>
{timeline_svg()}
<table class="tl" style="margin-top:8px">{steps}</table>
<h2>누가 무엇을 얻나</h2>
<div class="two">
<div><b>고령 보행자</b> — 땅만 보며 걷지 않아도 되고, "넘어질까 봐" 첫차를 포기하는 날이 줄어듭니다. 새 기기 없이 지금 휴대폰 그대로.</div>
<div><b>라이더·운전자</b> — 볼 수 없는 얼음을 닿기 전에 압니다.<br><b>제설 담당자</b> — 밤샘 순찰 대신 표시된 칸만 처리하고 결과를 지도로 확인.</div>
</div>

<div class="pb"></div>
<h2>왜 6G여야 하나 — 5G와의 차이</h2>
<table class="cmp"><thead><tr><th>필요한 기능</th><th>5G (현재)</th><th>6G (IMT-2030)</th></tr></thead><tbody>{rows}</tbody></table>
<p style="margin-top:8px">노면 판정의 원리는 이미 실험으로 확인되고 있습니다. 밀리미터파 센서의 노면 반사로 건조·젖음·블랙아이스를 구분한 실내 실험에서 정확도 98.2%, 어두운 조건 95.6%, 햇빛 아래 실외 98.5%가 보고되었습니다(Kim 외, Remote Sensing 14(20), 2022).
6G는 이 원리를 차량 한 대의 센서가 아니라 <b>통신망 전체</b>에 펼칩니다. 넓은 대역폭의 높은 주파수와 초대형 안테나(E-MIMO)가 해상도를, 기지국 안 AI가 현장 판정을, 초정밀 측위가 '세 걸음 앞' 알림을 맡습니다.</p>
<h2>사회·산업에 미치는 영향</h2>
<ul>
<li><b>안전</b> — 결빙 대책의 기준이 '미리 지정한 구간'에서 '오늘 밤 측정한 지점'으로. 지정 밖 구간과 보도까지 매일 측정.</li>
<li><b>행정·환경</b> — 제설제를 언 곳에만 뿌려 사용량·야간 인력·도로 부식·가로수 피해를 줄임(감소 폭은 시범 운영으로 측정).</li>
<li><b>산업</b> — 통신망이 '도시를 재는 센서'로. 통신사의 센싱 정보 서비스, 지자체·내비게이션·보험·물류의 실시간 노면 정보. 같은 원리로 비·안개·도로 침수 측정까지 확장.</li>
<li><b>국가</b> — 겨울 결빙이 뚜렷한 한국에서 국민이 매일 체감하는 첫 센싱 서비스로, 6G 통신·센싱 융합 기술·장비의 실증 무대.</li>
</ul>
<h2>사생활 원칙</h2>
<p>카메라 영상 없음 · 반사 원자료는 기지국 밖으로 나가지 않음 · 내보내는 것은 '결빙 칸'과 익명 보행량 숫자뿐 · 개인 알림은 본인이 켠 경우에만 휴대폰 안에서 위치와 지도를 맞춰 봄.</p>
<h2>출처</h2>
<div class="src">
· 김세호 외, 「국내 노면 결빙사고의 영향인자 분석」, 한국도로학회논문집 26(6), 2024. https://db.koreascholar.com/Article/Detail/438100<br>
· 도로교통공단 결빙 교통사고 분석(2018~2022, 4,609건·사망 107명, 치사율 2.3 vs 1.5), 뉴시스 2024. 1. 3. https://www.newsis.com/view/NISX20240103_0002579871<br>
· ITU-R M.2160-0 (2023), IMT-2030 Framework — §3 Integrated Sensing and Communication, §4 Positioning(1–10 cm). https://www.itu.int/rec/R-REC-M.2160-0-202311-I<br>
· 3GPP TR 38.855, Study on NR positioning support (Rel-16) §5. https://itecspec.com/3gpp/38.855/s/5<br>
· 3GPP Rel-20 ISAC for NR 연구(TR 38.765, gNB 기반 UAV 탐지 중심) 개관: arXiv 2608.11606. https://arxiv.org/pdf/2608.11606<br>
· J. Kim et al., "A Black Ice Detection Method Based on 1-Dimensional CNN Using mmWave Sensor Backscattering," Remote Sensing 14(20):5252, 2022. https://doi.org/10.3390/rs14205252<br>
· 제안자: 박용진(개인, 일반부문) · 작성 2026. 11. 4. · 자료조사·초안에 생성형 AI(Claude) 활용, 최종 판단은 본인.
</div>
</body></html>"""

def main():
    src = OUT / "scripts" / "attach.html"
    src.write_text(html(), encoding="utf-8")
    pdf = OUT / "빙판지도시나리오.pdf"
    with tempfile.TemporaryDirectory() as ud:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={ud}", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", src.as_uri()], check=True, timeout=120)
    print(pdf, pdf.stat().st_size)

if __name__ == "__main__":
    main()
