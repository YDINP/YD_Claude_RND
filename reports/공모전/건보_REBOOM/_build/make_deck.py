"""건보 RE:BOOM 제안 PPT — 슬라이드 HTML → PNG(크롬) → PDF·PPTX
실행: python make_deck.py"""
import subprocess, os
from pathlib import Path

B = Path(__file__).parent
OUT = B.parent / "제출"
SL = B / "slides"
SL.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"
TITLE = "먼저 계산했습니다"

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;700&display=block');
:root{--ink:#16202b;--sub:#5a6672;--line:#d9d4c7;--paper:#f6f3ec;--blue:#0b5cad;--blue2:#e3edf8;--red:#c8432f}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px}
body{font-family:'Noto Sans KR',sans-serif;color:var(--ink);background:var(--paper);word-break:keep-all;line-height:1.45}
.s{width:1920px;height:1080px;padding:96px 120px 80px;position:relative;overflow:hidden;page-break-after:always}
.no{position:absolute;right:120px;bottom:52px;font:500 22px 'IBM Plex Mono';color:var(--sub)}
.tag{position:absolute;left:120px;bottom:52px;font-size:20px;color:var(--sub)}
.k{font-size:26px;font-weight:700;color:var(--blue);letter-spacing:.02em;margin-bottom:22px}
h1{font-size:76px;font-weight:900;line-height:1.18;letter-spacing:-.02em}
h2{font-size:56px;font-weight:900;line-height:1.22;letter-spacing:-.02em;margin-bottom:40px}
p,li{font-size:30px}
.sub{color:var(--sub)}
.mono{font-family:'IBM Plex Mono','Noto Sans KR',monospace}
.cols{display:grid;gap:48px}
.card{background:#fff;border:2px solid var(--line);border-radius:14px;padding:36px 40px}
.card h3{font-size:34px;font-weight:900;margin-bottom:14px}
.card p{font-size:27px;color:#34404c}
.card.blue p{color:#fff}
.big{font:700 120px 'IBM Plex Mono';color:var(--blue);line-height:1}
.src{position:absolute;left:120px;bottom:92px;font-size:18px;color:#7b858f}
.rc{background:#fff;width:560px;padding:44px 46px 40px;box-shadow:0 2px 0 var(--line);font-size:26px;
  -webkit-mask:radial-gradient(circle 9px at 50% 100%,transparent 98%,#000) 0 0/28px 100%}
.rc .row{display:flex;justify-content:space-between;border-bottom:1px dashed #cfc9bb;padding:12px 0}
.rc .row b{font-family:'IBM Plex Mono';font-weight:700}
.rc .hl{background:var(--blue2);margin:0 -16px;padding:12px 16px;border:none}
.pill{display:inline-block;background:var(--blue);color:#fff;border-radius:40px;padding:8px 22px;font-size:24px;font-weight:700}
.phone{width:420px;height:650px;border:14px solid #1d2630;border-radius:52px;background:#fff;padding:54px 30px;position:relative}
"""

def page(inner, n, tag="국민건강보험공단 브랜드 제안 · 먼저 계산했습니다"):
    no = f'<div class="no">{n:02d} / 10</div>' if n > 1 else ""
    tg = f'<div class="tag">{tag}</div>' if n > 1 else ""
    return f'<section class="s">{inner}{tg}{no}</section>'

S = []

# 1 표지
S.append(page(f"""
<div style="display:flex;height:100%;align-items:center;gap:110px">
 <div style="flex:1">
  <div class="k">건강보험을 RE:BOOM 하라! · 브랜드 이미지·홍보 아이디어 제안</div>
  <h1 style="font-size:118px;margin:10px 0 36px">{TITLE}</h1>
  <p style="font-size:36px;color:#34404c">병원비 계산대에서 늘 먼저 계산하던 공단을<br>미래세대 눈에 보이게 하는 법</p>
  <p style="margin-top:70px;font-size:26px" class="sub">제안자 박용진</p>
 </div>
 <div class="rc">
  <div style="text-align:center;font-weight:900;font-size:30px;margin-bottom:14px">진료비 영수증</div>
  <div class="row"><span>총 진료비</span><b>10,000</b></div>
  <div class="row hl"><span><b style="font-family:inherit;color:var(--blue)">먼저 계산</b> · 국민건강보험</span><b style="color:var(--blue)">6,490</b></div>
  <div class="row"><span>내가 낸 돈</span><b>3,510</b></div>
  <p style="font-size:19px;color:#7b858f;margin-top:16px">* 2024년 건강보험 보장률 64.9%를 1만 원에 적용한 예시</p>
 </div>
</div>""", 1))

# 2 현재 이미지 ① 접점
S.append(page("""
<div class="k">① 현재 브랜드 이미지 분석 — 미래세대가 공단을 만나는 순간</div>
<h2>공단의 이름은 돈이 나갈 때만 보입니다</h2>
<div class="cols" style="grid-template-columns:repeat(3,1fr)">
 <div class="card"><div class="pill" style="background:#9aa3ad">첫 월급 명세서</div><h3 style="margin-top:24px">공제 항목 맨 위 한 줄</h3><p>사회생활 첫 달, 공단은 '건강보험료 ○○원 공제'라는 숫자로 처음 등장합니다.</p></div>
 <div class="card"><div class="pill" style="background:#9aa3ad">퇴사 후 우편함</div><h3 style="margin-top:24px">지역보험료 고지서</h3><p>회사가 내 주던 절반이 사라진 금액이 집으로 옵니다. 커뮤니티에서는 이걸 '건보료 폭탄'이라 부릅니다.</p></div>
 <div class="card" style="border-color:var(--blue)"><div class="pill">병원·약국 계산대</div><h3 style="margin-top:24px;color:var(--blue)">정작 혜택은 안 보임</h3><p>공단이 진료비 절반 이상을 낸 순간인데, 이미 빠진 금액이라 영수증 한쪽 칸에 조용히 찍히고 끝납니다.</p></div>
</div>
<p style="margin-top:56px;font-size:34px;font-weight:700">돈을 걷는 장면은 또렷하고, 대신 내 주는 장면은 보이지 않습니다.<br><span class="sub" style="font-weight:500">그래서 미래세대에게 공단은 '떼 가는 곳'으로 남습니다.</span></p>
""", 2))

# 3 현재 이미지 ② 근거
S.append(page("""
<div class="k">① 현재 브랜드 이미지 분석 — 숫자로 본 인식의 틈</div>
<h2>혜택은 크지만, 젊을수록 체감이 작습니다</h2>
<div class="cols" style="grid-template-columns:1fr 1fr 1fr">
 <div class="card"><div class="big">64.9%</div><p style="margin-top:22px">2024년 건강보험 보장률.<br>병원비 10원 중 6.5원을 공단이 냅니다.</p></div>
 <div class="card"><div class="big" style="font-size:78px;white-space:nowrap">1.1<span style="font-size:52px">배</span> <span style="color:#9aa3ad;font-size:52px">vs</span> 2.5<span style="font-size:52px">배</span></div><p style="margin-top:22px">낸 보험료 대비 받은 급여(직장가입자).<br>30세 미만 1.1배, 60세 이상 2.5배.</p></div>
 <div class="card"><div class="big">4/10</div><p style="margin-top:22px">'건강보험이 도움이 된다'고 답하면서도<br>10명 중 4명은 '불공평하다'고 답했습니다.</p></div>
</div>
<div class="card" style="margin-top:44px;background:var(--blue2);border:none">
 <h3>개선이 필요한 점</h3>
 <p style="font-size:29px">젊은 세대는 아플 일이 적어 혜택을 겪을 기회 자체가 적고, 겪더라도 계산대에서 이미 빠진 금액이라 모릅니다.<br>문제는 혜택의 크기가 아니라 <b>혜택이 보이는 자리</b>가 없다는 것입니다.</p>
</div>
<div class="src" style="bottom:20px">출처: 국민건강보험공단 「2024년도 건강보험환자 진료비 실태조사」(2025.12) · 공단 보험료 대비 급여비 분석(2018년 기준, 데일리팜 보도) · SBS Biz 건강보험 인식 보도(2026)</div>
""", 3))

# 4 새 브랜드 방향
S.append(page("""
<div class="k">② 새로운 브랜드 방향 제안</div>
<h2>'떼 가는 곳'에서 '먼저 계산한 곳'으로</h2>
<div style="display:grid;grid-template-columns:1fr 120px 1fr;align-items:center;gap:20px">
 <div class="card" style="text-align:center;padding:56px"><p class="sub" style="font-size:26px">지금</p><p style="font-size:62px;font-weight:900;color:#8a939c;margin:14px 0">떼 가는 곳</p><p class="sub">월급 명세서·고지서 속 공단</p></div>
 <div style="font-size:90px;text-align:center;color:var(--blue)">→</div>
 <div class="card" style="text-align:center;padding:56px;border-color:var(--blue)"><p class="sub" style="font-size:26px">앞으로</p><p style="font-size:62px;font-weight:900;color:var(--blue);margin:14px 0">먼저 계산한 곳</p><p class="sub">계산대 영수증 속 공단</p></div>
</div>
<div class="cols" style="grid-template-columns:repeat(3,1fr);margin-top:56px;gap:36px">
 <div><h3 style="font-size:32px;font-weight:900;margin-bottom:10px">보여 주는 자리</h3><p style="font-size:26px">고지서가 아니라 계산대·약 봉투·앱 알림처럼 혜택이 생기는 순간에 이름을 둡니다.</p></div>
 <div><h3 style="font-size:32px;font-weight:900;margin-bottom:10px">말투</h3><p style="font-size:26px">생색내지 않고 영수증처럼 담담하게. 감성 문구보다 '6,490원' 같은 숫자 하나로 말합니다.</p></div>
 <div><h3 style="font-size:32px;font-weight:900;margin-bottom:10px">정직함</h3><p style="font-size:26px">낸 것보다 덜 받은 해도 숨기지 않고, 그 차액이 누구의 병원비가 됐는지 함께 보여 줍니다.</p></div>
</div>
""", 4))

# 5 핵심 메시지
S.append(page("""
<div class="k">③ 홍보 전략 — 핵심 메시지</div>
<h2>"계산대에서 내신 돈은 나머지입니다"</h2>
<div class="cols" style="grid-template-columns:1fr 1fr 1fr;gap:36px">
 <div class="card"><div class="pill">병원·약국에서</div><p style="font-size:34px;font-weight:900;margin-top:24px;line-height:1.35">오늘 진료비 중<br><span style="color:var(--blue)">18,400원</span>은<br>먼저 계산했습니다.</p></div>
 <div class="card"><div class="pill">연말 결산에서</div><p style="font-size:34px;font-weight:900;margin-top:24px;line-height:1.35">올해 당신 몫으로<br><span style="color:var(--blue)">23만 원</span>을<br>먼저 계산했습니다.</p></div>
 <div class="card"><div class="pill">첫 고지서에서</div><p style="font-size:34px;font-weight:900;margin-top:24px;line-height:1.35">이 보험료가 무엇이고<br>어떻게 줄일 수 있는지<br>먼저 알려 드립니다.</p></div>
</div>
<p style="margin-top:50px;font-size:30px">세 메시지 모두 끝은 같은 서명으로 닫습니다. &nbsp;<b style="font-size:38px">먼저 계산했습니다. <span style="color:var(--blue)">국민건강보험</span></b></p>
<p class="sub" style="font-size:22px;margin-top:14px">* 금액은 예시. 실제 문구에는 개인 진료 데이터의 공단부담금을 그대로 넣습니다.</p>
""", 5))

# 6 전략1 영수증
S.append(page("""
<div class="k">③ 홍보 전략 1 — 영수증을 매체로</div>
<h2>이미 찍혀 있는 숫자에 이름만 붙입니다</h2>
<div style="display:flex;gap:80px;align-items:flex-start">
 <div class="rc" style="width:520px">
  <div style="text-align:center;font-weight:900;font-size:28px;margin-bottom:12px">○○약국 영수증</div>
  <div class="row"><span>약제비 총액</span><b>12,300</b></div>
  <div class="row"><span>본인부담금</span><b>3,700</b></div>
  <div class="row hl"><span style="color:var(--blue);font-weight:700">먼저 계산 · 국민건강보험</span><b style="color:var(--blue)">8,600</b></div>
  <p style="text-align:center;margin-top:20px;font-size:22px;color:var(--sub)">[먼저 계산했습니다] 스탬프 자리</p>
 </div>
 <div style="flex:1">
  <p style="font-size:30px;margin-bottom:30px">진료비·약제비 영수증에는 지금도 '공단부담금' 칸이 있습니다. 새 데이터도, 새 시스템도 필요 없습니다. 아무도 읽지 않는 그 칸을 읽히게 만들면 됩니다.</p>
  <ul style="list-style:none;display:grid;gap:22px">
   <li><b>약 봉투 띠지</b> — "이 약값 중 공단이 먼저 낸 돈은 영수증 ○번째 줄에 있어요"</li>
   <li><b>계산대 스탬프·POP</b> — 약사회·의원 협조로 '먼저 계산' 칸에 표시</li>
   <li><b>인증샷 이벤트</b> — 영수증의 '먼저 계산' 금액을 가리고 찍어 올리면 추첨</li>
  </ul>
 </div>
</div>
""", 6))

# 7 전략2 앱
S.append(page("""
<div class="k">③ 홍보 전략 2 — The건강보험 앱 「먼저 계산 알림」 · 연말 「내 건강보험 결산」</div>
<h2>혜택이 생긴 날, 앱이 먼저 말합니다</h2>
<div style="display:flex;gap:70px;align-items:flex-start">
 <div class="phone">
  <p style="font-size:20px;color:var(--sub)">The건강보험 · 알림</p>
  <div class="card" style="padding:22px;margin-top:18px;border-radius:18px"><p style="font-size:22px;font-weight:700">11월 진료 3건</p><p style="font-size:24px;margin-top:8px">진료비 중 <b style="color:var(--blue)">41,200원</b>을<br>먼저 계산했어요.</p></div>
  <div class="card blue" style="padding:22px;margin-top:18px;border-radius:18px;background:var(--blue);border:none;color:#fff">
   <p style="font-size:22px;opacity:.85">2026 내 건강보험 결산</p>
   <p style="font-size:26px;margin-top:10px;line-height:1.5">낸 보험료 <b class="mono">1,680,000</b><br>내 병원비에 <b class="mono">  412,000</b><br>함께 낸 병원비 <b class="mono">1,268,000</b></p>
   <p style="font-size:20px;margin-top:12px;opacity:.85">→ 소아 진료, 암 치료, 응급실에 쓰였어요</p>
  </div>
 </div>
 <div style="flex:1">
  <ul style="list-style:none;display:grid;gap:30px">
   <li><b>월간 알림</b> — 진료 청구가 들어온 달, 그달 공단이 낸 금액을 한 줄로 알려 줍니다.</li>
   <li><b>연말 결산 카드</b> — 음악 앱 연말 결산처럼 한 해를 카드 한 장으로 보여 주고, SNS 공유 버튼을 붙입니다.</li>
   <li><b>덜 받은 해도 솔직하게</b> — 낸 보험료가 더 많았다면 그 차액을 '함께 낸 병원비'로 보여 줍니다. 미래세대가 불공평하다고 느끼는 지점을 피하지 않고 정면으로 설명합니다.</li>
  </ul>
  <p class="sub" style="font-size:22px;margin-top:30px">* 화면은 개념 예시이며 금액은 가상입니다. '함께 낸 병원비' 용처는 공단 급여비 통계의 진료 분야 비중을 사용합니다.</p>
 </div>
</div>
""", 7))

# 8 전략3 첫 고지서
S.append(page("""
<div class="k">③ 홍보 전략 3 — 가장 미움받는 접점을 바꾸기</div>
<h2>퇴사 후 첫 고지서를 '안내서'로</h2>
<div class="cols" style="grid-template-columns:1fr 1fr;gap:56px">
 <div class="card"><h3 class="sub">지금의 첫 고지서</h3><p style="font-size:30px;margin-top:10px">금액과 납부기한만 있습니다. 왜 올랐는지, 줄일 방법은 없는지는 각자 검색해야 합니다. 임의계속가입은 첫 지역보험료 납부기한에서 2개월이 지나면 신청할 수 없는데, 이를 모르고 지나치는 사람이 생깁니다.</p></div>
 <div class="card" style="border-color:var(--blue)"><h3 style="color:var(--blue)">바꾼 첫 고지서</h3>
  <ul style="list-style:none;display:grid;gap:14px;font-size:28px;margin-top:10px">
   <li>① 회사가 내 주던 절반이 빠져 금액이 달라진 이유</li>
   <li>② 임의계속가입·피부양자 중 나에게 맞는 선택과 <b>신청 마감일</b></li>
   <li>③ 지난 직장 기간 동안 공단이 먼저 계산한 내 병원비</li>
  </ul>
 </div>
</div>
<p style="margin-top:50px;font-size:32px;font-weight:700">고지서가 오는 날 줄이는 방법도 같이 오면, 공단의 첫인상이 달라집니다.</p>
""", 8))

# 9 실행·활용
S.append(page("""
<div class="k">④ 실행 및 활용 방안</div>
<h2>있는 데이터로, 작게 시작해 넓힙니다</h2>
<div class="cols" style="grid-template-columns:repeat(3,1fr);gap:36px">
 <div class="card"><div class="pill">1단계 · 상반기</div><h3 style="margin-top:20px">영수증 시범</h3><p>약사회와 협력해 시범 지역 약국에 약 봉투 띠지·스탬프 배포, 인증샷 이벤트로 2030 참여 유도</p></div>
 <div class="card"><div class="pill">2단계 · 하반기</div><h3 style="margin-top:20px">앱 알림·첫 고지서</h3><p>The건강보험 앱 월간 '먼저 계산' 알림, 직장→지역 전환자 첫 고지서에 안내 면 추가</p></div>
 <div class="card"><div class="pill">3단계 · 연말</div><h3 style="margin-top:20px">내 건강보험 결산</h3><p>연말정산 시즌에 결산 카드 공개, SNS 공유로 확산. 다음 해 홍보물은 공유된 숫자로 제작</p></div>
</div>
<div class="card" style="margin-top:40px;background:var(--blue2);border:none">
 <h3>성과 지표</h3>
 <p style="font-size:28px">· 결산 카드 공유 수와 2030 앱 신규 이용자 &nbsp; · 임의계속가입 기한 내 신청 비율 &nbsp; · 인식 조사에서 공단을 '도움 받는 곳'으로 답한 2030 비율</p>
 <p style="font-size:24px;margin-top:12px" class="sub">별도 시스템 구축 없이 기존 청구·부과 데이터와 영수증 서식을 활용해 비용을 낮춥니다.</p>
</div>
""", 9))

# 10 마무리
S.append(page("""
<div style="display:flex;flex-direction:column;justify-content:center;height:100%;align-items:flex-start">
 <p style="font-size:34px;color:#34404c;margin-bottom:28px">미래세대는 공단을 모르는 게 아니라, 공단이 일하는 장면을 본 적이 없습니다.</p>
 <h1 style="font-size:110px">먼저 계산했습니다.</h1>
 <h1 style="font-size:110px;color:var(--blue)">국민건강보험</h1>
 <div style="margin-top:80px;font-size:21px;color:#7b858f;line-height:1.7">
  출처 · 국민건강보험공단 「2024년도 건강보험환자 진료비 실태조사」(2025.12 발표, 보장률 64.9%)<br>
  · 공단 「보험료 대비 급여비 현황」 2018년 기준 연령별 분석(데일리팜 보도) · SBS Biz 건강보험 인식 보도(2026)<br>
  AI 활용 표기 · 본 자료의 이미지·도식은 직접 제작했으며 생성형 AI 이미지·영상을 사용하지 않았습니다.
 </div>
</div>""", 10))

def html(body):
    return f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'

pngs = []
for i, s in enumerate(S, 1):
    f = SL / f"s{i:02d}.html"
    f.write_text(html(s), encoding="utf-8")
    png = SL / f"s{i:02d}.png"
    subprocess.run([CHROME, "--headless=new", f"--user-data-dir={B/'.chrome'}", "--hide-scrollbars",
                    "--window-size=1920,1080", "--virtual-time-budget=8000", f"--screenshot={png}", f.as_uri()],
                   capture_output=True, timeout=120)
    pngs.append(png)

deck = SL / "deck.html"
deck.write_text(html("".join(S)).replace("<style>", "<style>@page{size:1920px 1080px;margin:0}"), encoding="utf-8")
pdf = OUT / "박용진_건강보험RE-BOOM_먼저계산했습니다.pdf"
subprocess.run([CHROME, "--headless=new", f"--user-data-dir={B/'.chrome'}", "--no-pdf-header-footer",
                "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", deck.as_uri()], capture_output=True, timeout=180)

from pptx import Presentation
from pptx.util import Emu
prs = Presentation(); prs.slide_width = Emu(12192000); prs.slide_height = Emu(6858000)
for p in pngs:
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    sl.shapes.add_picture(str(p), 0, 0, prs.slide_width, prs.slide_height)
prs.save(OUT / "박용진_건강보험RE-BOOM_먼저계산했습니다.pptx")
print("ok", [p.exists() for p in pngs], pdf.exists())
