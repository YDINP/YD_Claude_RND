"""서울금연지원센터 2026 금연 정책제안 연구공모전 — 연구포스터(A1 세로) + 서식1·2 PDF."""
import base64, json, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
SIG = "data:image/png;base64," + base64.b64encode((ROOT / "assets/sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
A = json.loads((HERE / "data/analysis.json").read_text(encoding="utf-8"))
S = A["seoul_std"]

ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호", birth="1997. 5. 29.", org="개인 참가 (회사원)")
TITLE = "‘담배연기를 맡았나요?’의 맹점"
SUBTITLE = "전자담배 시대 서울시 간접흡연 지표 재분석과 ‘목격 기반’ 측정·관리 제안"
KEYWORDS = ["간접흡연", "전자담배", "은밀 사용(stealth use)", "측정 타당도", "지역사회건강조사"]


def img(name):
    return "data:image/png;base64," + base64.b64encode((HERE / "fig" / name).read_bytes()).decode()


def sign(label="(서명)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


REFS = [
    "서울특별시(2026.6). 2025년 서울특별시 지역사회 건강통계(표 1, 55~59, 184·187~189·191). news.seoul.go.kr/welfare/archives/581688",
    "서울특별시 건강격차모니터링 통계표: 현재 흡연율(DT_201004_E050008), 가정실내 간접흡연 노출률(DT_201004_E050010). 서울 열린데이터광장 data.seoul.go.kr/dataList/DT201004E050010/S/2/datasetView.do",
    "질병관리청(2025.12.9). 2025년 지역사회건강조사 결과 발표(보도자료). www.kdca.go.kr/bbs/kdca/42/215513/artclView.do",
    "문소연(2024). 담배제품 다중 사용과 금연구역 및 실내 사용의 관련성. 연세대학교 대학원 석사학위논문. ir.ymlib.yonsei.ac.kr/handle/22282913/205233",
    "뉴시스(2026.5.27). 전자담배, 금연에 도움?…70% ‘여전히 못끊어’(한국의학바이오기자협회·대한금연학회 포럼, 입소스 흡연자 500명 조사). www.newsis.com/view/NISX20260527_0003645802",
    "뉴시스(2026.4.23). 내일부터 액상 전자담배 온라인 판매 안돼…가격도↑(개정 담배사업법 2026.4.24 시행). mobile.newsis.com/view/NISX20260423_0003604277",
    "Prince William County Public Schools. Vape Detection(학교 화장실 전자담배 감지기 시범 안내). www.pwcs.edu/about/departments/security/vape_detection/korean",
]


def poster_html():
    ratio0, ratio1 = A["ratio_work_per_user"][0], A["ratio_work_per_user"][-1]
    refs = "".join(f"<li>{r}</li>" for r in REFS)
    kw = "".join(f"<span>{k}</span>" for k in KEYWORDS)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>연구포스터</title><style>
@page {{ size:594mm 841mm; margin:0; }}
* {{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
:root {{ --navy:#17324d; --blue:#2a78d6; --or:#eb6834; --orl:#fdeee7; --aq:#12996a; --bg:#f5f4f0; --ink:#1b1b1a; --ink2:#4a4945; --line:#d9d7d0; }}
html,body {{ margin:0; padding:0; background:#fff; }}
body {{ width:594mm; height:841mm; font-family:'Malgun Gothic',sans-serif; color:var(--ink); font-size:16pt; line-height:1.47; overflow:hidden; }}
.head {{ background:var(--navy); color:#fff; padding:13mm 22mm 10mm; position:relative; }}
.head .tag {{ font-size:16pt; letter-spacing:1px; opacity:.85; }}
.head h1 {{ font-size:68pt; line-height:1.12; margin:3mm 0 2mm; letter-spacing:-1px; }}
.head h1 em {{ font-style:normal; color:#ffb48f; }}
.head .sub {{ font-size:28pt; font-weight:700; opacity:.95; }}
.head .by {{ margin-top:6mm; font-size:18pt; opacity:.9; display:flex; justify-content:space-between; align-items:flex-end; }}
.kw {{ display:flex; gap:3mm; flex-wrap:wrap; }}
.kw b {{ margin-right:2mm; }}
.kw span {{ border:1.2px solid rgba(255,255,255,.7); border-radius:20mm; padding:1mm 5mm; font-size:15.5pt; }}
.hook {{ background:var(--orl); border-bottom:2px solid var(--or); padding:5mm 22mm; display:grid; grid-template-columns:repeat(4,1fr); gap:8mm; }}
.hook div {{ font-size:15pt; color:var(--ink2); line-height:1.35; }}
.hook b {{ display:block; font-size:38pt; color:var(--or); line-height:1.1; letter-spacing:-1px; }}
.hook div:nth-child(4) b {{ color:var(--aq); }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:0 13mm; padding:7mm 22mm 0; }}
h2 {{ font-size:27pt; color:var(--navy); margin:0 0 3mm; padding-bottom:2mm; border-bottom:3px solid var(--navy); display:flex; gap:4mm; align-items:baseline; }}
h2 .n {{ background:var(--navy); color:#fff; border-radius:2mm; padding:0 3.5mm; font-size:22pt; }}
section {{ margin-bottom:6mm; }}
p {{ margin:1.5mm 0; }} ul {{ margin:1.5mm 0; padding-left:7mm; }} li {{ margin:1.2mm 0; }}
.small {{ font-size:14pt; color:var(--ink2); line-height:1.45; }}
.fig {{ margin:3mm 0 2mm; }}
.fig img {{ width:100%; display:block; }}
.cap {{ font-size:14pt; color:var(--ink2); margin-top:1mm; line-height:1.4; }}
.cap b {{ color:var(--ink); }}
.res {{ border-left:2.2mm solid var(--or); background:#fbfaf7; padding:3mm 5mm; margin:3mm 0; }}
.res .t {{ font-weight:700; font-size:19pt; }}
.quote {{ border:2px dashed var(--ink2); border-radius:3mm; padding:4mm 6mm; margin:3mm 0; font-size:16.5pt; background:#fff; }}
.quote .q {{ font-weight:700; }}
.pols {{ display:grid; grid-template-columns:repeat(3,1fr); gap:7mm; padding:0 22mm; margin:4mm 0 4mm; }}
.pol {{ border:2.5px solid var(--navy); border-radius:3mm; padding:3.5mm 5mm; font-size:15pt; line-height:1.45; }}
.pol .h {{ font-size:20.5pt; font-weight:800; color:var(--navy); }}
.pol .h i {{ font-style:normal; background:var(--or); color:#fff; border-radius:1.5mm; padding:0 3mm; margin-right:3mm; font-size:17pt; }}
.q2 {{ display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin:2.5mm 0; }}
.q2 div {{ border-radius:2mm; padding:2.5mm 4mm; font-size:15pt; line-height:1.4; }}
.q2 .old {{ background:#eeeeea; }} .q2 .new {{ background:var(--orl); border:1.5px solid var(--or); }}
.q2 b {{ display:block; font-size:13.5pt; color:var(--ink2); }}
table.plan {{ width:100%; border-collapse:collapse; font-size:15pt; margin-top:2mm; }}
table.plan td, table.plan th {{ border:1px solid var(--line); padding:2mm 3mm; vertical-align:top; text-align:left; }}
table.plan th {{ background:var(--navy); color:#fff; font-weight:700; }}
.concl {{ background:var(--navy); color:#fff; border-radius:3mm; padding:5mm 7mm; font-size:19pt; font-weight:700; line-height:1.45; margin:3mm 0 4mm; }}
.concl span {{ color:#ffb48f; }}
.foot {{ position:absolute; left:22mm; right:22mm; bottom:10mm; border-top:2px solid var(--line); padding-top:3mm; display:grid; grid-template-columns:1.75fr 1fr; gap:10mm; }}
.foot ol {{ margin:0; padding-left:6mm; font-size:11.3pt; line-height:1.38; color:var(--ink2); }}
.foot h3 {{ margin:0 0 1.5mm; font-size:14pt; color:var(--navy); }}
.foot .r {{ font-size:11.5pt; color:var(--ink2); line-height:1.42; }}
</style></head><body>
<div class="head">
 <div class="tag">2026년 금연 정책제안 연구공모전 · 연구포스터 · 주제: 간접흡연 및 전자담배</div>
 <h1>‘담배연기를 맡았나요?’의 <em>맹점</em></h1>
 <div class="sub">{SUBTITLE}</div>
 <div class="by"><div><b>박용진</b> · 개인 연구자(회사원)</div><div class="kw"><b>키워드</b>{kw}</div></div>
</div>
<div class="hook">
 <div><b>4 / 4</b>서울 간접흡연 노출 지표 4종 모두<br>“<b style="display:inline;font-size:inherit;color:var(--ink)">담배연기를 맡은 적</b>”으로 정의</div>
 <div><b>157</b>서울 전자담배 사용률 지수<br>(2021=100 → 2025, 궐련형+액상형)</div>
 <div><b>102</b>서울 담배제품 사용률 지수<br>담배 쓰는 사람 비율은 그대로</div>
 <div><b>67</b>직장실내 간접흡연 노출률 지수<br>연기 냄새로 잰 노출은 1/3 감소</div>
</div>
<div class="grid">
<div>
<section><h2><span class="n">1</span>연구배경</h2>
<ul>
<li><b>담배는 줄지 않고 ‘바뀌고’ 있다.</b> 서울 2021→2025년 일반담배 흡연율 {S['cig'][0]}→{S['cig'][-1]}%, 전자담배(궐련형+액상형) {S['ecig_sum'][0]}→{S['ecig_sum'][-1]:.1f}%, 모든 담배제품 사용률 {S['total'][0]}→{S['total'][-1]}%(표준화율)<sup>1</sup>. 전국도 2019년 대비 일반담배 흡연율은 약 12% 줄고 전자담배 사용률은 약 82% 늘었다<sup>3</sup>.</li>
<li><b>법은 따라왔다.</b> 개정 담배사업법(2026.4.24 시행)으로 합성니코틴 액상형도 ‘담배’가 되어 금연구역에서 모든 담배제품 사용이 금지된다<sup>6</sup>.</li>
<li><b>측정은 그대로다.</b> 간접흡연 노출률은 가정·직장·실내 공공장소·실외 공공장소 모두 “다른 사람이 피우는 <u>담배연기를 맡은</u> 적”으로 센다<sup>1</sup>.</li>
<li><b>그런데 전자담배는 냄새가 적어 실내에서 쓰인다.</b> 13~39세 흡연자의 50.0%가 주로 실내·금연구역에서 사용, 일반담배+액상형 이중사용자는 일반담배 단독 사용자보다 그 오즈가 7.41배<sup>4</sup>. 흡연자 500명 조사에서 전자담배로 바꾼 이유 1위는 “냄새가 덜 나서”(66.5%)<sup>5</sup>.</li>
</ul>
<div class="quote"><span class="q">문제 제기</span> — 냄새가 줄어든 담배를 ‘냄새를 맡았는가’로 재면, 노출이 실제로 줄었는지 <b>보이지 않게 된 것인지</b> 구분할 수 없다.</div>
</section>
<section><h2><span class="n">2</span>연구목적</h2>
<ol style="margin:1mm 0;padding-left:8mm">
<li>서울시 간접흡연 지표가 ‘냄새 감지’에 의존하는 구조를 공식 정의로 확인한다.</li>
<li>전자담배 사용 증가와 노출 지표 감소가 함께 나타나는지 서울 전체·25개 구 공개 통계로 검증한다.</li>
<li>서울시·서울금연지원센터가 곧바로 시범할 수 있는 측정·관리 개선안을 제시한다.</li>
</ol></section>
<section><h2><span class="n">3</span>연구방법</h2>
<ul>
<li><b>자료</b> ① 2025년 서울특별시 지역사회 건강통계<sup>1</sup>: 25개 구 2021~2025년 현재흡연율·궐련형/액상형 전자담배 현재사용률·담배제품 현재사용률·직장실내 간접흡연 노출률(표준화율), 장소별 노출률 4종(2025, 조율) ② 서울시 건강격차모니터링 통계표<sup>2</sup>: 2014~2025년 가정실내 노출률 ③ 공식 발표·학술 문헌<sup>3~7</sup></li>
<li><b>분석</b> (a) 노출 지표 4종의 분자 정의 문구 검토 (b) 2021=100 지수화 추세 비교 (c) 25개 구별 2021→2025 변화량(%p)·사분면 분류·피어슨 상관 (d) 사용자 대비 노출 보고 비율 = 직장실내 노출률 ÷ 담배제품 사용률</li>
<li><b>처리</b> 통계집 PDF·통계표에서 원 수치를 직접 추출해 Python(numpy·matplotlib)으로 계산·작도.</li>
</ul>
<p class="small">※ 전자담배 사용률은 궐련형+액상형 단순 합(중복 사용자 포함, 상한값). 직장실내 노출률은 2020년 응답대상 변경(‘모든 담배 미사용자’)으로 2021년 이후만 비교.</p>
</section>
</div>
<div>
<section><h2><span class="n">4</span>연구결과</h2>
<div class="res" style="margin-top:0"><div class="t">결과 1. 노출 지표 4종 모두 ‘연기 냄새’ 기준 — 전자담배를 ‘본’ 경험은 묻지 않는다</div>
<div class="fig"><img src="{img('fig3_place.png')}"></div>
<div class="cap"><b>그림 1.</b> 2025년 서울 담배 미사용자의 장소별 간접흡연 노출률(조율). 서울특별시(2026) 표 55~58. 각 표 주석의 분자 정의는 모두 “다른 사람이 피우는 담배연기를 맡은 적이 있는 사람”. 가정실내는 2014년 5.7%에서 1.6%로 내려와 지표상 ‘거의 해결’된 영역이 되었다<sup>2</sup>.</div></div>
<div class="res"><div class="t">결과 2. 담배 사용자는 그대로인데 ‘연기를 맡았다’는 응답만 1/3 줄었다</div>
<div class="fig"><img src="{img('fig1_index.png')}"></div>
<div class="cap"><b>그림 2.</b> 서울 지표 지수(2021=100, 표준화율). 2025년 전자담배 {S['idx_ecig'][-1]:.0f} · 담배제품 {S['idx_total'][-1]:.0f} · 일반담배 {S['idx_cig'][-1]:.0f} · 직장실내 노출 {S['idx_work'][-1]:.0f}. 사용자 대비 노출 보고 비율 {ratio0:.2f} → {ratio1:.2f}.</div></div>
</section>
</div>
</div>
<div class="grid" style="padding-top:0">
<div class="res" style="margin-top:0"><div class="t">결과 3. 25개 구 모두 전자담배 ↑, 그중 {A['n_ecig_up_work_down']}개 구는 노출 보고 ↓</div>
<div class="fig"><img src="{img('fig2_gu.png')}"></div>
<div class="cap"><b>그림 3.</b> 자치구별 2021→2025 변화(표준화율). 전자담배 사용률 변화 중앙값 +{A['median_d_ecig']:.1f}%p, 직장실내 노출률 변화 중앙값 {A['median_d_work']:.1f}%p.</div></div>
<div>
<div class="res" style="border-color:var(--aq);margin-top:0"><div class="t">결과 4. 현행 측정으로는 ‘줄었다’와 ‘안 보인다’를 가를 수 없다</div>
<p>구 단위에서 전자담배 증가폭과 노출 변화의 상관은 거의 없다(r = {A['r_dwork_decig']:.2f}; 일반담배 흡연율 변화와는 r = {A['r_dwork_dcig']:.2f}). 실내 흡연 관행이 실제로 개선됐을 수도 있고(가설 A), 냄새가 적은 제품의 노출이 응답에 잡히지 않았을 수도 있다(가설 B). 전자담배 이중사용자의 실내·금연구역 사용이 7.41배라는 문헌<sup>4</sup>은 B의 가능성을 키우지만, <b>현행 문항은 A와 B를 가를 정보를 모으지 않는다.</b></p></div>
<section style="margin:5mm 0 0"><h2><span class="n">5</span>결론 및 정책제안</h2>
<div class="concl">간접흡연을 <span>‘냄새’</span>로만 재는 한, 전자담배로 옮겨 간 노출은 통계에서 사라진다. 측정을 <span>‘냄새 + 목격’</span> 두 줄로 바꾸고, 사용자 쪽 기록과 지점 측정으로 보완한다.</div>
<div><table class="plan"><tr><th style="width:14%">첫 달 시범</th><th>할 일</th><th style="width:28%">산출물</th></tr>
<tr><td><b>1주</b></td><td>제안 1·2 문항(장소별 목격 4문항 + 상담 2문항) 확정, 시범 시설 2곳 선정</td><td>문항지 · 측정 계획</td></tr>
<tr><td><b>2~3주</b></td><td>센터 상담 등록자·찾아가는 금연서비스 사업장 대상 시범 조사, 측정기 운영</td><td>응답 자료 · 시간대별 측정값</td></tr>
<tr><td><b>4주</b></td><td>‘냄새 기준’ vs ‘목격 기준’ 노출률 비교 → 2026 서울금연지원센터 포럼에서 공개</td><td>질병관리청 문항 건의안</td></tr></table></div>
<p class="small" style="margin-top:2.5mm"><b>한계</b> 구 단위 생태학적 분석으로 인과를 말하지 않음. 직장실내 노출률은 구별 표본 약 400명으로 표준오차 1~2%p. 전자담배 합산치는 중복 사용자 포함. 2023년 전자담배 급증에는 조사 변동이 섞였을 수 있음.</p>
</section>
</div>
</div>
<div class="pols">
<div class="pol"><div class="h"><i>제안 1</i>조사에 ‘목격 문항’을 나란히</div>
<div class="q2"><div class="old"><b>현행(유지: 시계열 보존)</b>최근 1주일 동안 직장 실내에서 다른 사람이 피우는 담배연기를 맡은 적이 있습니까?</div>
<div class="new"><b>추가</b>냄새와 관계없이, 최근 1주일 동안 직장 실내에서 다른 사람이 전자담배를 쓰는 것을 본 적이 있습니까?</div></div>
<p>두 응답의 차이 = <b>‘냄새로는 잡히지 않은 노출’ 비율</b>(신규 지표). 서울시가 질병관리청에 지역사회건강조사 문항 개선을 건의하고, 그 전에 센터 사업 대상자 설문으로 시범 측정.</p></div>
<div class="pol"><div class="h"><i>제안 2</i>상담 등록 때 ‘실내 사용 장소’ 기록</div>
<p>센터 내소·찾아가는 금연서비스 등록 문항에 “최근 1주 실내 사용 장소(집 실내·직장 실내·차 안·화장실)”와 “같은 공간의 비흡연자 유무” 2문항 추가. 바로 끊기 어려운 전자담배 사용자에게는 <b>‘실내 0회’</b>를 첫 단계 목표로 두고 상담 기록으로 추적 — 간접노출 감소를 사업 성과로 측정.</p></div>
<div class="pol"><div class="h"><i>제안 3</i>은밀 사용 ‘지점 지도’ 만들기</div>
<p>처벌보다 위치 찾기. 금연구역 위반 신고·민원을 ‘일반담배/전자담배’로 나눠 집계. 서울시 소관 공공시설 일부 화장실·계단실에 실내공기(미세입자) 측정기를 4주 설치해 사용 의심 지점을 찾고 순회·안내를 그 지점에 집중. 카메라 등 개인 식별 장비는 쓰지 않고, 오경보가 있어<sup>7</sup> 단속 증거가 아닌 추세 판단용으로만.</p></div>
</div>

<div class="foot">
 <div><h3>참고문헌 · 자료 출처</h3><ol>{refs}</ol></div>
 <div class="r"><h3>연구윤리 · 재현성</h3>설문·실험을 새로 하지 않았으며 공개 통계와 공개 문헌만 사용. 모든 수치는 위 출처의 원 수치이거나 그로부터 계산한 값(계산식은 ‘연구방법’ 참고). 담배·전자담배 업계의 후원·협찬 없음.<br><b>AI 활용</b> 자료 조사, 계산 코드와 문안 초안 작성에 생성형 AI(Claude)를 활용했고, 수치 확인과 최종 판단은 본인이 함.</div>
</div>
</body></html>"""


ABSTRACT = {
    "연구제목": f"{TITLE} — {SUBTITLE}",
    "연구배경": ("서울의 담배 사용은 줄지 않고 제품이 바뀌고 있다. 2021→2025년 서울 일반담배 흡연율은 15.8→14.9%로 낮아졌지만 "
             "전자담배(궐련형+액상형) 사용률은 7.5→11.8%로 늘었고, 모든 담배제품 사용률은 19.4→19.7%로 그대로였다(표준화율). "
             "2026년 4월 24일 개정 담배사업법 시행으로 합성니코틴 액상형도 ‘담배’가 되었다. 그러나 서울시 간접흡연 노출률 4종(가정·직장·실내 공공장소·실외 공공장소)은 "
             "모두 ‘다른 사람이 피우는 담배연기를 맡은 적’으로 정의된다. 전자담배는 연기와 냄새가 적어 실내·금연구역 사용이 쉽고(일반담배+액상형 이중사용자의 실내·금연구역 사용 오즈 7.41배, 문소연 2024), "
             "흡연자가 전자담배로 바꾼 이유 1위도 ‘냄새가 덜 나서’(66.5%)였다."),
    "연구목적": ("① 서울시 간접흡연 지표가 냄새 감지에 의존하는 구조를 공식 정의로 확인하고, ② 전자담배 사용 증가와 노출 지표 감소가 함께 나타나는지 서울 전체·25개 구 공개 통계로 검증하며, "
             "③ 서울시와 서울금연지원센터가 곧바로 시범할 수 있는 측정·관리 개선안을 제시한다."),
    "연구방법": ("2025년 서울특별시 지역사회 건강통계(서울시, 2026.6)의 25개 구 2021~2025년 표준화율(현재흡연율, 궐련형·액상형 전자담배 현재사용률, 담배제품 현재사용률, 직장실내 간접흡연 노출률)과 "
             "2025년 장소별 노출률 4종, 서울시 건강격차모니터링 통계표(2014~2025년 현재흡연율·가정실내 노출률)를 원 수치 그대로 추출했다. "
             "(a) 노출 지표의 분자 정의 문구 검토, (b) 2021=100 지수화 추세 비교, (c) 25개 구별 2021→2025 변화량 산출·사분면 분류·피어슨 상관, "
             "(d) 사용자 대비 노출 보고 비율(직장실내 노출률 ÷ 담배제품 사용률)을 Python으로 계산했다. 전자담배 합산치는 중복 사용자를 포함한 상한값이며, "
             "직장실내 노출률은 2020년 응답대상 변경으로 2021년 이후만 비교했다."),
    "연구결과": ("노출 지표 4종은 모두 ‘담배연기를 맡은’ 경험만 세며, 전자담배 사용을 ‘본’ 경험은 묻지 않는다(2025년 서울: 실외 공공장소 79.5%, 실내 공공장소 10.8%, 직장 실내 6.9%, 가정 실내 1.6%). "
             "2021=100 기준 2025년 지수는 전자담배 157, 담배제품 102, 일반담배 94, 직장실내 노출 67로, 담배 사용자 비율은 그대로인데 비사용자의 ‘연기를 맡았다’는 응답만 1/3 줄었다(사용자 대비 노출 보고 비율 0.52→0.34). "
             "25개 구 모두 전자담배 사용률이 올랐고(중앙값 +4.2%p) 그중 21개 구에서 직장실내 노출률이 내려갔다(중앙값 −3.2%p). 구 단위 두 변화량의 상관은 r=−0.05로, "
             "현행 공개 자료로는 노출이 실제로 줄었는지 냄새가 적은 제품의 노출이 응답에 잡히지 않은 것인지 구분할 수 없다. "
             "<br><b>정책제안</b> ① 기존 ‘냄새’ 문항은 유지하고 ‘냄새와 관계없이 다른 사람이 전자담배를 쓰는 것을 본 적’ 문항을 장소별로 추가해, 두 응답의 차이(냄새로는 잡히지 않은 노출)를 신규 지표로 삼는다. "
             "② 센터 금연상담 등록 때 실내 사용 장소와 같은 공간의 비흡연자 유무를 기록하고, 전자담배 사용자에게 ‘실내 0회’를 첫 단계 목표로 둔다. "
             "③ 금연구역 위반 신고를 일반담배/전자담배로 나눠 집계하고, 서울시 소관 공공시설 일부 화장실·계단실에 실내공기 측정기를 4주 설치해 은밀 사용 지점을 찾아 순회·안내를 집중한다(개인 식별 장비 미사용). "
             "첫 달에 문항 확정→센터 대상자 시범 조사→‘냄새 기준 vs 목격 기준’ 비교 결과 공개와 질병관리청 문항 건의안 작성까지 진행할 수 있다."),
    "주요어": ", ".join(KEYWORDS),
}

FORM_CSS = """
@page { size:A4; margin:16mm 17mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#000; line-height:1.55; margin:0; }
.tag { font-size:12.5pt; margin:0 0 6px; }
.ttl { border:1px solid #000; background:#f2f2f2; text-align:center; font-size:16pt; font-weight:700; padding:5px; margin-bottom:6px; }
table.f { width:100%; border-collapse:collapse; }
table.f td { border:1px solid #000; padding:6px 9px; vertical-align:middle; }
table.f.ab td { padding:4px 8px; }
table.f .h { background:#f2f2f2; text-align:center; font-weight:700; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }
.decl { text-align:center; margin:12px 0 6px; font-size:11pt; }
.sl { text-align:center; font-size:11pt; line-height:2.3; }
.to { text-align:center; font-size:14pt; font-weight:700; margin-top:14px; }
.box { border:1px solid #000; }
.box .sec { padding:6px 10px; border-bottom:1px solid #000; }
.box .sec:last-child { border-bottom:none; }
.box p { margin:2px 0; }
.ck { text-align:center; font-weight:700; margin-top:4px; }
"""


def forms_html():
    m = ME
    ab = ABSTRACT
    abrows = "".join(f'<tr><td class="h" style="width:17%">{k if k != "주요어" else "주요어<br>(Keyword)"}</td><td style="text-align:justify">{v}</td></tr>' for k, v in ab.items())
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>신청서·동의서</title><style>{FORM_CSS}</style></head><body>
<div class="tag">[서식 1] 공모전 신청서</div>
<div class="ttl">공모전 신청서</div>
<table class="f">
<tr><td class="h" colspan="2" style="width:25%">참가 구분</td><td style="text-align:center;font-weight:700">■ 개인 &nbsp;&nbsp;&nbsp; □ 팀</td></tr>
<tr><td class="h" colspan="2">소속</td><td>{m['org']}</td></tr>
<tr><td class="h" rowspan="5" style="width:10%">응모자<br>정보<br>(대표)</td><td class="h" style="width:15%">성명</td><td>{m['name']}</td></tr>
<tr><td class="h">생년월일</td><td>{m['birth']}</td></tr>
<tr><td class="h">연락처</td><td>{m['phone']}</td></tr>
<tr><td class="h">이메일</td><td>{m['email']}</td></tr>
<tr><td class="h">주소</td><td>{m['addr']}</td></tr>
<tr><td class="h" rowspan="2">응모자<br>정보<br>(공동)</td><td class="h">성명</td><td style="color:#555">해당 없음 (개인 응모)</td></tr>
<tr><td class="h">생년월일</td><td></td></tr>
<tr><td class="h" rowspan="2">응모자<br>정보<br>(공동)</td><td class="h">성명</td><td></td></tr>
<tr><td class="h">생년월일</td><td></td></tr>
<tr><td class="h" rowspan="2">응모자<br>정보<br>(공동)</td><td class="h">성명</td><td></td></tr>
<tr><td class="h">생년월일</td><td></td></tr>
</table>
<div class="pb"></div>
<div class="ttl">연구 초록</div>
<table class="f ab" style="font-size:8.9pt;line-height:1.5">{abrows}</table>
<div class="decl">본인은 위와 같이 공모전에 응모합니다.</div>
<div class="sl">대표자 성명 : <b>{m['name']}</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {sign('(서명)')}<br>2026년 &nbsp;&nbsp;11월 &nbsp;&nbsp;4일</div>
<div class="to">서울금연지원센터장 귀하</div>

<div class="pb"></div>
<div class="tag">[서식 2] 공모전 참가 동의서</div>
<div style="color:#000;font-size:10pt;margin-bottom:6px">※ 팀 응모 시, 팀 구성원 전원의 개별 개인정보 수집·이용 동의서를 제출하여야 함</div>
<div class="ttl">공모전 참가 동의서</div>
<div class="box">
<div class="sec"><p><b>▣ 개인정보 수집 및 활용 동의</b></p>
<p>&nbsp;서울금연지원센터는 「2026년 금연 정책제안 연구공모전」 운영을 위하여 아래와 같이 개인정보를 수집·이용하고자 합니다. 내용을 확인하신 후 동의 여부를 선택해 주시기 바랍니다.</p>
<p><b>1. 수집 항목</b></p><p>&nbsp;- 성명(국문), 소속, 연락처, E-mail, 주소 등 신청서 기재사항</p>
<p><b>2. 수집 및 이용 목적</b></p><p>&nbsp;- 공모전 신청 접수 및 관리, 안내사항 전달</p>
<p><b>3. 보유 및 이용기간</b></p><p>&nbsp;- 공모전 종료일로부터 5년 보관 후 파기</p>
<p><b>4. 수집‧이용 동의 거부권리</b></p><p>&nbsp;- 상기 개인정보 수집·이용과 관련하여 동의를 거부할 수 있습니다. 단, 동의하지 않을 경우 공모전에 작품을 접수하실 수 없으며, 심사 대상에서 제외됩니다.</p>
<p><b>5. 개인정보 제공</b></p><p>&nbsp;- 서울금연지원센터는 참가자의 개인정보를 제3자에게 제공하지 않습니다.</p>
<p class="ck">■ 동의함</p></div>
<div class="sec"><p><b>▣ 저작권 활용 동의</b></p>
<p>&nbsp;&nbsp;출품작의 저작권은 원칙적으로 응모자에게 귀속됩니다. 다만 수상작에 한하여 서울금연지원센터는 비영리 목적 범위에서 다음과 같이 활용할 수 있습니다.</p>
<p>1. 수상작은 ‘2026 서울금연지원센터 포럼’에서 발표, 전시, 상영될 수 있습니다.</p>
<p>2. 서울금연지원센터는 수상작을 공익·홍보 목적으로 편집·수정·재가공하여 각종 홍보 배너, 보도자료, 홈페이지, SNS 게시, 홍보물 제작 등에 활용할 수 있습니다.</p>
<p>3. 서울금연지원센터는 수상작에 한하여 수정·변경이 가능한 원본파일을 요청할 수 있으며, 수상자는 이에 응해야 합니다.</p>
<p>4. 수상작 활용 기간은 수상일로부터 5년으로 하며, 활용 기간 연장이 필요한 경우 수상자와 별도 협의할 수 있습니다.</p>
<p>5. 수상작 활용에 동의하지 않을 경우 수상작 선정 대상에서 제외됩니다.</p>
<p class="ck">■ 동의함</p></div>
<div class="sec"><p><b>▣ 청렴서약서 및 확인서</b></p>
<p>&nbsp;&nbsp;본인은 본 공모전에 참가함에 있어 다음 사항을 모두 숙지했으며, 제반사항에 동의합니다.</p>
<p><b>1. 출품작의 독창성 및 저작권 (책임 소재)</b></p>
<p>&nbsp;- 제출 작품은 본인 또는 팀이 직접 본 공모전을 위해 기획·제작한 순수 창작물이며, 타 공모전에서 제출 또는 수상한 사실이 없으며, 이미 상업적으로 활용되었거나 공개적으로 유포된 작품이 아니어야 합니다.</p>
<p>&nbsp;- 제출 작품에 사용한 이미지, 영상, 음악, 폰트, 일러스트, 캐릭터, 디자인 요소, AI 생성물 등 모든 소스는 저작권, 초상권, 라이선스를 비롯한 각종 지식재산권 기타 법적 문제가 없어야 합니다.</p>
<p>&nbsp;- 향후 제출 작품에 대한 저작권, 초상권, 개인정보 활용, 라이선스를 비롯한 각종 지식재산권 기타 법적 분쟁이나 명예훼손 등의 문제가 발생하는 경우 이와 관련한 분쟁 및 민·형사상의 책임은 모두 출품자(제작자)에게 있습니다.</p>
<p><b>2. 결격 사유 및 조치</b></p>
<p>&nbsp;- 담배회사, 전자담배 제조·판매업체, 니코틴 제품 관련 업계 등의 후원·협찬·제작 지원을 받은 작품은 심사에서 제외됩니다.</p>
<p>&nbsp;- 제출 작품이 지식재산권 침해, 표절(AI 기반 제작 포함), 도용, 허위사실 포함, 타인의 명예훼손, 혐오·비하 표현, 공모 취지에 부적합한 광고성·상업성 내용은 심사에서 제외됩니다.</p>
<p>&nbsp;- 위 내용을 위반하였을 경우, 수상이 취소되고 부상은 전액 환수됩니다.</p>
<p><b>3. 심사 및 시상 조건</b></p>
<p>&nbsp;- 심사 결과 적격 작품이 없을 경우 시상하지 않을 수 있으며, 주최측 사정에 따라 시상 규모가 조정될 수 있습니다.</p>
<p><b>4. 출품작의 반환 및 폐기</b></p>
<p>&nbsp;- 실물 출품작은 공모전 종료 후 반환을 신청한 응모자에 한하여 반환합니다. 반환에 소요되는 배송비 등 제반 비용은 응모자가 부담합니다.</p>
<p>&nbsp;- 반환 신청을 하지 않은 작품은 공모전 종료 후 주최기관의 내부 기준(보안 규정 등)에 따라 안전하게 폐기 또는 처리될 수 있습니다.</p>
<p class="ck">■ 동의함</p></div>
</div>
<p style="margin:12px 4px">&nbsp;&nbsp;본인은 공고 내용과 유의사항, 신청서 및 동의서의 내용을 모두 확인·숙지하였으며, 이에 따른 제반 사항에 동의하고 기재한 내용이 사실과 다름없음을 확인합니다.</p>
<div class="sl">참가자 성명 : <b>{m['name']}</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {sign('(서명)')}<br>2026년 &nbsp;&nbsp;11월 &nbsp;&nbsp;4일</div>
<div class="to">서울금연지원센터장 귀하</div>
</body></html>"""


def pdf(html, name):
    src = HERE / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = ROOT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / 'chrome_prof'}", f"--print-to-pdf={out}", src.as_uri()],
                   capture_output=True, timeout=180)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    pdf(poster_html(), "연구포스터_담배연기를맡았나요의맹점_박용진")
    pdf(forms_html(), "신청서·참가동의서_박용진")
