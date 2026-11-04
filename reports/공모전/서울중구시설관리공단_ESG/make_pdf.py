"""서울중구시설관리공단 ESG혁신 아이디어 공모전 — 지정 신청서식(+개인정보 동의서) 채운 PDF.
원본 서식(원본/신청서식_및_개인정보동의서.hwp)의 문구를 그대로 재현한다."""
import base64, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).parent
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = HERE / "박용진_ESG혁신아이디어_신청서(S사회공헌_결석안부).pdf"

NAME, PHONE = "박용진", "010-2576-9278"
TITLE = "매일 오던 회원이 안 보이면 먼저 묻는다 — 체육센터 출석 기록으로 하는 ‘결석 안부’"


def chk(on):
    return "■" if on else "□"


def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


DETAIL = f"""
<div class="lead"><b>한 줄 요약</b> — 공단 체육센터는 같은 사람이 같은 시간에 몇 달, 몇 년씩 오는 곳입니다.
그 사람이 <b>갑자기 오지 않는 것</b>은 낙상·입원·우울·고립이 시작됐다는 가장 이른 신호일 수 있습니다.
동의한 회원에 한해, <b>연속 결석이 생기면 공단이 먼저 안부를 묻고</b>, 답이 없으면 본인이 정한 연락처와 동 주민센터로 이어 주는 절차를 만듭니다.
새 장비·앱·예산 없이 공단이 이미 가진 출석 기록과 감면 회원 정보로 다음 달부터 1개 센터에서 시범할 수 있습니다.</div>

<h4>1. 문제 — 위기는 ‘늦게’ 발견된다</h4>
<table class="facts">
<tr><td>늘어나는 고독사</td><td>2024년 고독사 사망자 <b>3,924명</b>(전년 3,661명보다 7.2% 증가). 남성 81.7%, 50대·60대가 약 60%. 사망 전 1년 안에 기초생활보장 수급 이력이 있는 사람이 39.1%. <span class="s">(보건복지부 「2024년도 고독사 발생 실태조사」, 뉴시스 2025.11.27.)</span></td></tr>
<tr><td>누가 발견하나</td><td>최초 발견자 중 <b>임대인이 28.4%(2020) → 43.1%(2024)</b>로 늘고, <b>지인은 14.5% → 7.1%</b>로 절반이 됐습니다. 일상에서 그 사람을 매일 보던 사람이 알아채는 경우가 줄고, 집세가 밀리거나 냄새가 난 뒤에야 발견되는 셈입니다. <span class="s">(같은 자료)</span></td></tr>
<tr><td>지금의 발견 체계</td><td>보건복지부 ‘고독사위기 대응시스템’은 경제·고용·생계·주거·정신건강 등 <b>27종 위기정보</b>(가스요금 체납 등)로 위험자를 찾습니다. <span class="s">(유니콘팩토리 2026.5.13.)</span> 대부분 <b>이미 생활이 무너진 뒤</b>에 쌓이는 정보입니다.</td></tr>
<tr><td>중구의 조건</td><td>중구의 1인 가구 비율은 <b>54.1%</b>로 서울 자치구 중 두 번째로 높습니다. <span class="s">(서울신문 2025.8.26.)</span></td></tr>
</table>
<p class="gap"><b>빈칸:</b> 아직 건강하게 운동하러 다니는 사람, 특히 혼자 사는 중장년·어르신은 어떤 명단에도 오르지 않습니다. 이들이 넘어지거나 앓아누워 <b>운동을 끊는 순간</b>이 도움이 가장 쉬운 때인데, 그 변화를 기록으로 알 수 있는 곳은 체육센터뿐입니다. 그런데 지금 결석은 ‘회원 개인 사정’으로 처리되고, 그 기록은 수강료 정산에만 쓰입니다.</p>

<h4>2. 왜 지금까지 아무도 안 했나 — 세 가지 막힘과 푸는 방법</h4>
<table class="cmp">
<tr><th style="width:30%">막힘</th><th>이 제안의 장치</th></tr>
<tr><td>① 개인정보: 결석을 이유로 연락하는 것이 실례이거나 감시로 느껴질 수 있음</td><td><b>수강 신청·감면 등록 때 체크박스 하나</b>(「결석 안부 받기」 □동의)로 본인이 고릅니다. 수집하는 것은 <b>결석 횟수와 마지막 출석일뿐</b>, 건강 정보는 묻지 않습니다. 언제든 끌 수 있습니다.</td></tr>
<tr><td>② 역할: 체육센터 직원은 복지 담당이 아니어서 누가 무엇을 해야 할지 없음</td><td>공단 직원·강사는 <b>‘첫 문자 한 통’까지만</b> 합니다. 그다음은 본인이 지정한 가족·지인, 마지막은 동 주민센터 복지 담당이 맡도록 <b>단계를 나눕니다</b>.</td></tr>
<tr><td>③ 신호: 결석은 흔해서 누가 ‘이상한 결석’인지 모름</td><td>기준을 <b>‘평소 규칙적으로 오던 사람의 연속 결석’</b>으로 좁힙니다. 주 2회 이상 강습 회원이 예고 없이 3회 연속 빠지거나, 월 회원(자유수영·헬스)이 평소와 달리 7일간 입장 기록이 없을 때만 알림이 뜹니다.</td></tr>
</table>

<h4>3. 운영 절차 — 결석 다음 날 아침 10분</h4>
<div class="flow">
<div class="st"><span>0단계 · 신청</span>수강 신청·감면 등록 때 동의 회원 표시<br>(안부 연락처 1곳 선택 기재)</div>
<div class="ar">→</div>
<div class="st"><span>1단계 · 당일</span>오전 접수 마감 후 대상 목록 확인, 강사·접수 직원이 <b>안부 문자</b> 1통</div>
<div class="ar">→</div>
<div class="st"><span>2단계 · +2일</span>답이 없으면 전화 1회, 이어서 <b>본인이 정한 연락처</b>에 연락</div>
<div class="ar">→</div>
<div class="st"><span>3단계 · +3일</span>연락이 끝내 안 되면 주소지 <b>동 주민센터 복지 담당</b>에 확인 요청</div>
</div>
<ul>
<li><b>문자는 서비스 말투로:</b> “○○님, 이번 주 아쿠아로빅에서 못 뵈어 연락드립니다. 별일 없으시죠? ‘1’(괜찮아요) ‘2’(아파서 쉬어요) ‘3’(그만둘게요) 중 하나만 답해 주세요.” — 답장 한 글자로 끝나게 만들어, 받는 사람의 부담을 줄입니다.</li>
<li><b>목록 뽑기:</b> 전산 입장·출석 기록이 있는 센터는 조회 1회, 없는 강좌는 강사 출석부로 합니다. 담당 직원 1명이 하루 10분 안팎(추정)이면 됩니다.</li>
<li><b>‘2’(아파서 쉬어요)라고 답하면:</b> 입원·부상 때 수강료 이월·환불 위약금 감면 등 <b>규정 안에서 받을 수 있는 처리</b>를 먼저 알려 줍니다. 아파서 한 달을 쉬면 수강료를 날리고, 다시 등록하기 어려워 아예 끊는 흐름을 막아 <b>복귀</b>를 돕습니다.</li>
<li><b>3단계 전달 내용은 최소로:</b> 이름·연락처·마지막 출석일만, 신청 때 따로 동의한 사람에 한해 전달합니다(「개인정보 보호법」 동의 기반 제공).</li>
</ul>

<h4>4. 공단이라서 할 수 있는 이유</h4>
<ul>
<li><b>이미 가진 정보:</b> 공단 체육센터는 65세 이상 경로우대(20%), 기초생활수급자·차상위계층·장애인(50%) 등 <b>요금감면 대상을 등록 때 확인</b>합니다. <span class="s">(공단 누리집 충무스포츠센터 이용안내)</span> 위기에 가까운 회원을 새로 찾을 필요 없이, 감면 등록 창구에서 동의만 받으면 됩니다.</li>
<li><b>같은 시간, 같은 얼굴:</b> 매월 재등록하는 강습은 성인이 정해진 요일·시간에 같은 강사와 같은 동료를 몇 달씩 만나는, 지역에 몇 안 남은 ‘매일 보던 사람’의 자리입니다.</li>
<li><b>여러 시설을 한 기관이:</b> 체육시설 7곳과 복지시설을 함께 운영하므로, 한 센터에서 만든 절차와 문자 문구를 그대로 다른 센터·구민회관 강좌에 옮길 수 있습니다.</li>
</ul>

<h4>5. 시범 운영안 — 첫 달에 1개 센터</h4>
<table class="cmp">
<tr><th style="width:16%">시기</th><th>할 일</th></tr>
<tr><td>1주차</td><td>시범 센터 1곳(예: 회현체육센터 또는 충무스포츠센터)과 오전 시간대 강좌 2~3개 반 선정, 동의서 문구·문자 문구·결석 기준을 개인정보 담당과 확정</td></tr>
<tr><td>2주차</td><td>다음 달 재등록 기간에 맞춰 접수처에서 동의 받기(희망자만), 강사 대상 10분 안내</td></tr>
<tr><td>3~4주차</td><td>운영. 알림 건수, 답장 비율, 답 내용(괜찮음·아픔·그만둠·무응답), 2·3단계로 넘어간 건수를 표 하나에 기록</td></tr>
<tr><td>월말</td><td>결과 보고. 반응이 좋으면 다른 센터·구민회관 강좌로 넓히고, 중구청 복지 부서와 3단계 연계 방식을 협약으로 정리</td></tr>
</table>
<p class="s" style="margin-top:3px">※ 비용: 기존 문자 발송 체계와 직원 업무 시간 안에서 운영(추가 예산 거의 없음, 추정). 장비·앱 개발 없음.</p>

<h4>6. 기대 효과</h4>
<ul>
<li><b>사회(S):</b> 혼자 사는 회원의 낙상·입원·고립을 ‘집세가 밀린 뒤’가 아니라 <b>운동을 끊은 첫 주</b>에 알아챕니다. 공단이 지역 안전망의 한 칸이 됩니다.</li>
<li><b>고객만족:</b> “못 뵈어 연락드렸다”는 한 통은 회원에게 ‘나를 기억하는 곳’이라는 경험을 줍니다. 아파서 쉰 회원이 다시 돌아오도록 도와 재등록률에도 도움이 됩니다(추정).</li>
<li><b>경영 개선:</b> ‘그만둘게요’ 답의 사유를 모으면 강좌 시간·난이도·접근성 등 회원이 떠나는 이유를 처음으로 데이터로 볼 수 있습니다.</li>
</ul>

<h4>7. 기존 사업과 다른 점</h4>
<table class="cmp">
<tr><th style="width:30%">기존</th><th>이 제안</th></tr>
<tr><td>공단 어르신 무료 체력증진교실 등</td><td>참여 기회를 <b>주는</b> 사업에 더해, 참여하던 사람이 <b>사라지는 순간</b>을 챙깁니다. 서로 보완합니다.</td></tr>
<tr><td>지자체 안부 전화·AI 안부 콜, 전력·통신 데이터 분석</td><td>미리 정한 취약 명단이나 새 장비가 필요 없습니다. <b>평소와 달라진 ‘변화’</b>(규칙적 출석의 중단)를 공단이 이미 가진 기록으로 봅니다.</td></tr>
<tr><td>보건복지부 고독사위기 대응시스템(체납 등 27종)</td><td>생활이 무너진 뒤 쌓이는 정보보다 <b>앞선 신호</b>를 더합니다. 3단계에서 동 주민센터로 이어져 기존 체계와 연결됩니다.</td></tr>
</table>

<p class="src"><b>근거 자료</b><br>
· 뉴시스, 「‘외로운 죽음’ 고독사, 작년 3924명…10명 중 8명 남성」, 2025.11.27. (newsis.com/view/NISX20251127_0003419323)<br>
· 유니콘팩토리, 「체납 데이터 보고 AI가 안부 묻는다…케어링, 어르신 고독사 예방 강화」, 2026.5.13. (unicornfactory.co.kr/article/2026051309281125137)<br>
· 서울신문, 「“100가지 1인 가구 사업 고도화”…오래 머물고 싶은 중구」, 2025.8.26. (go.seoul.co.kr/news/2025/08/26/20250826500099)<br>
· 서울중구시설관리공단 누리집, 충무스포츠센터 이용안내 — 요금감면 (e-junggu.or.kr/fmcs/45)<br>
· 서울중구시설관리공단, 2024년 상반기 ESG경영 우수사례 — 어르신 무료 체력증진교실 (e-junggu.or.kr/fmcs/960)<br>
※ ‘추정’ 표시는 제안자 추정치이며, 시범 운영으로 확인할 항목입니다.</p>
"""

CSS = """
@page { size:A4; margin:14mm 14mm 13mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.6pt; color:#111; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
h1 { text-align:center; font-size:15.5pt; margin:4px 0 14px; letter-spacing:-0.3px; }
.f > tbody > tr > td, .f > tbody > tr > th { border:1px solid #000; padding:7px 9px; vertical-align:middle; }
.f > tbody > tr > th { background:#e9edf5; font-weight:700; text-align:center; width:15%; }
.f .grp { width:13%; text-align:center; font-weight:700; background:#f4f6fa; }
.opt span { display:inline-block; min-width:24%; }
.on { font-weight:700; }
.ttl { font-size:11pt; font-weight:700; }
.det { vertical-align:top !important; padding:10px 11px !important; }
.lead { border:1.5px solid #274081; background:#f1f4fb; padding:8px 10px; border-radius:4px; margin-bottom:6px; }
h4 { font-size:10.6pt; color:#274081; border-bottom:1.5px solid #274081; padding-bottom:2px; margin:12px 0 6px; break-after:avoid; }
.facts td, .cmp td, .cmp th { border:1px solid #c5ccd9; padding:5px 7px; vertical-align:top; font-size:9.2pt; }
.facts td:first-child { width:21%; white-space:nowrap; background:#eef1f8; font-weight:700; }
.cmp th { background:#eef1f8; text-align:left; font-weight:700; }
.facts tr, .cmp tr { break-inside:avoid; }
.s { color:#555; font-size:8.3pt; }
.gap { margin:6px 0 2px; }
ul { margin:4px 0 4px 17px; padding:0; } li { margin:2px 0; }
p { margin:3px 0; }
.flow { display:flex; align-items:stretch; gap:4px; margin:4px 0 6px; break-inside:avoid; }
.flow .st { flex:1; border:1.2px solid #274081; border-radius:4px; padding:5px 6px; font-size:8.6pt; line-height:1.4; background:#fff; }
.flow .st span { display:block; font-weight:700; color:#fff; background:#274081; margin:-5px -6px 4px; padding:2px 6px; }
.flow .ar { align-self:center; color:#274081; font-weight:700; }
.src { font-size:8pt; color:#444; line-height:1.45; margin-top:10px; }
.pb { break-before:page; }
.agree h2 { text-align:center; font-size:14pt; margin:0 0 12px; }
.agree p { line-height:1.7; }
.agree .sec { font-weight:700; margin:12px 0 4px; }
.agree table td, .agree table th { border:1px solid #000; padding:7px 8px; text-align:center; font-size:9.6pt; }
.agree table th { background:#e9edf5; }
.agree .ck { text-align:center; font-size:11pt; margin:12px 0; }
.date { text-align:center; font-size:11.5pt; margin:22px 0 14px; letter-spacing:1px; }
.signline { text-align:right; margin-right:30px; font-size:11pt; }
.to { text-align:center; font-size:13pt; font-weight:700; margin-top:30px; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:4px; top:50%; height:44px; transform:translateY(-50%); }
"""


def html():
    e = [("친환경", False), ("탄소중립", False)]
    s = [("사회공헌", True), ("고객만족(CS)", False), ("저출생", False), ("일자리창출", False)]
    g = [("경영혁신", False), ("적극행정", False), ("윤리경영", False), ("시설안전", False)]

    def opts(items):
        return "".join(f'<span class="{"on" if on else ""}">{chk(on)} {t}</span>' for t, on in items)

    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>ESG혁신 아이디어 공모전 신청서식</title><style>{CSS}</style></head><body>
<h1>「중구시설관리공단 ESG혁신 아이디어」공모전 신청서식</h1>
<table class="f">
<tr><th>성 &nbsp;&nbsp; 명</th><td colspan="2">{NAME}</td><th>연 락 처</th><td>{PHONE}</td></tr>
<tr><th rowspan="3">응모분야<br><span style="font-weight:400;font-size:8.6pt">(1개분야 &nbsp;필수선택)</span></th>
<td class="grp">E(환경)</td><td colspan="3" class="opt">{opts(e)}</td></tr>
<tr><td class="grp">S(사회)</td><td colspan="3" class="opt">{opts(s)}</td></tr>
<tr><td class="grp">G(지배구조)</td><td colspan="3" class="opt">{opts(g)}</td></tr>
<tr><th>아이디어<br>제목</th><td colspan="4" class="ttl">{TITLE}</td></tr>
<tr><th>세부내용</th><td colspan="4" class="det">{DETAIL}</td></tr>
</table>

<div class="pb agree">
<h2>개인정보 제공 및 수집이용 동의서</h2>
<p>&nbsp;&nbsp;서울중구시설관리공단은 「서울중구시설관리공단 ESG혁신 아이디어 공모전」운영 및 관리를 위하여 아래와 같이 개인정보를 수집‧이용 및 제공하고자 합니다. 내용을 자세히 읽으신 후 동의 여부를 결정하여 주십시오.</p>
<p class="sec">□ 개인정보 수집‧이용 내역(필수사항)</p>
<table><tr><th>항 &nbsp;&nbsp; 목</th><th>수집ㆍ이용 목적</th><th>보유기간</th></tr>
<tr><td>이름 및 연락처</td><td>참가자 본인여부 확인 및 수상자·참가상 대상 상품지급</td><td>공모전 접수 시작일로부터 1년</td></tr></table>
<p class="sec">□ 개인정보 수집 동의 거부의 권리</p>
<p>&nbsp;&nbsp;위의 개인정보 수집‧이용에 대한 동의를 거부할 권리가 있으며, 동의하지 않을 경우 공모전 신청에 제한 받을 수 있습니다.</p>
<p class="sec">□ 법정대리인 동의서 ※신청자가 만 14세 미만일 경우 반드시 기재</p>
<p>&nbsp;&nbsp;본인은 미성년자의 법정대리인으로 위의 정보제공 및 수집·이용에 동의합니다.</p>
<table><tr><th>신청자명</th><th>법정대리인 성명</th><th>신청자와의 관계</th><th>법정대리인 연락처</th></tr>
<tr><td style="height:30px"></td><td style="text-align:right;font-size:8.6pt;color:#333">(서명 또는 인)</td><td></td><td></td></tr></table>
<p style="margin-top:14px">&nbsp;&nbsp;위 동의서 내용을 충분히 숙지하였으며, 「개인정보보호법」 등 관련 법규에 의거하여 상기 본인은 위와 같이 개인정보 수집 및 활용에 동의합니다.</p>
<p class="ck"><b>■ 동의함</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 동의하지 않음</p>
<p>&nbsp;&nbsp;본인은 위 공모전과 관련한 유의사항 등을 숙지 및 동의하였으며, 위와 같이‘서울중구시설관리공단 ESG혁신 아이디어 공모전’참가를 신청합니다.</p>
<div class="date">2026년 &nbsp;&nbsp;11월 &nbsp;&nbsp;4일</div>
<div class="signline">참가자: &nbsp;&nbsp;<b>{NAME}</b> &nbsp;&nbsp;&nbsp;&nbsp;{sign()}</div>
<div class="to">서울중구시설관리공단 귀하</div>
</div>
</body></html>"""


def main():
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "form.html"
        src.write_text(html(), encoding="utf-8")
        (HERE / "_build").mkdir(exist_ok=True)
        (HERE / "_build" / "form.html").write_text(html(), encoding="utf-8")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--user-data-dir={Path(td) / 'prof'}", f"--print-to-pdf={OUT}", src.as_uri()],
                       capture_output=True, timeout=120)
        time.sleep(1)
    print(OUT, OUT.exists())


if __name__ == "__main__":
    main()
