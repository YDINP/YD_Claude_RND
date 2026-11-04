"""2026 KDN Eco-Life 대국민 환경 공모전 (아이디어 분야) — 서식 1·2·3 PDF 생성.

원본 서식: 원본/서식/*.hwp (문구는 hwp 본문에서 추출해 그대로 옮김)
방식: HTML -> Chrome headless --print-to-pdf, 맑은 고딕, 서명 이미지 겹침.
"""
import base64, subprocess, time, tempfile
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE
KIT = Path(r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/kit")
SIG = "data:image/png;base64," + base64.b64encode((KIT / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BUILD = Path(tempfile.gettempdir()) / "kdn_ecolife_build"
BUILD.mkdir(exist_ok=True)

ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호", birth="1997. 5. 29.", y="2026", m="11", d="4")
TITLE = "새벽 3시의 계량기 — 아무도 안 쓸 때 나가는 전기가 진짜 낭비다"
SUBTITLE = "고지서에 섞여 안 보이던 상시전력을 AMI 새벽 사용량으로 떼어 내 찾고, 끄고, 다시 재는 4주 미션"
ONELINE = "모두 잠든 새벽 사용량으로 숨은 상시전력을 떼어 내 찾고 끄는 가정·이웃 미션"
INTRO = ("가족이 모두 잠든 새벽의 전기 사용량에는 사람의 행동이 빠져 있어, 그 숫자가 곧 우리 집 낭비의 크기입니다. "
         "「새벽 3시의 계량기」는 한 달 합계 고지서에 섞여 안 보이던 이 상시전력을 한전 파워플래너(AMI)로 떼어 보고, "
         "전력측정기로 셋톱박스·비데·충전기 같은 원인을 찾아 불편 없는 것만 끈 뒤, 4주 뒤 다시 재어 줄어든 W를 인증하는 KDN Eco-Life 미션입니다. "
         "임직원 가정에서 지역 취약계층 「새벽 전기 이웃 진단」과 대국민 인증으로 넓힙니다.")
AI_TOOL, AI_SCOPE = "Claude", "자료 조사·문장 다듬기"

ON, OFF = "■", "□"

BASE_CSS = """
@page { size:A4; margin:16mm 17mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10.5pt; color:#000; line-height:1.55; margin:0; }
table { width:100%; border-collapse:collapse; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }
.titlebox { border:1px solid #000; text-align:center; padding:8px 4px; margin:0 0 6px; }
.titlebox .t { font-size:17pt; font-weight:700; text-decoration:underline; text-underline-offset:4px; }
.mng { text-align:right; font-weight:700; margin-bottom:14px; }
.mng i { font-weight:400; color:#888; font-size:9pt; margin-left:40px; }
h2 { font-size:11pt; margin:16px 0 6px; }
.f td, .f th { border:1px solid #000; padding:6px 9px; vertical-align:middle; }
.f th { background:#d9d9d9; font-weight:700; text-align:center; white-space:nowrap; }
.note { font-size:9pt; margin:4px 0 0 8px; }
.gray { color:#777; }
"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def form1():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>서식1 참가신청서</title><style>{BASE_CSS}
.decl {{ text-align:center; font-weight:700; margin:22px 0 14px; line-height:1.8; }}
.date {{ text-align:center; font-weight:700; margin:16px 0 18px; }}
.signline {{ text-align:center; font-weight:700; }}
</style></head><body>
<div class="titlebox"><span class="t">2026 한전KDN 환경 공모전 참가신청서</span></div>
<div class="mng">[관리번호 : <i>(주관부서 기재란)</i> ]</div>
<h2>1. 응모 구분</h2>
<table class="f">
<tr><th style="width:15%">트랙</th><td>{OFF} 임직원 트랙(한전KDN 전 임직원)<br>{ON} 대국민 트랙(국민 누구나, 임직원 신청 불가)</td></tr>
<tr><th>응모 부문</th><td>{ON} 아이디어<br>{OFF} 포스터<br>{OFF} 웹툰</td></tr>
</table>
<div class="note">※ 해당되는 항목의 네모칸(□)을 ■로 바꾸거나 체크(✔)표시를 해주시기 바랍니다.</div>
<h2>2. 응모자 정보</h2>
<table class="f">
<tr><th style="width:15%">성 명</th><td style="width:37%">{m['name']}</td><th style="width:13%">생년월일</th><td>{m['birth']}</td></tr>
<tr><th>소 속</th><td class="gray" style="font-size:9.5pt">해당 없음 (대국민 트랙)</td><th>연락처</th><td>{m['phone']}</td></tr>
<tr><th>이메일 주소</th><td colspan="3">{m['email']}</td></tr>
</table>
<h2>3. 응모작 정보</h2>
<table class="f">
<tr><th style="width:21%">작품명</th><td><b>{TITLE}</b></td></tr>
<tr><th>작품 소개</th><td style="height:150px;line-height:1.65">{INTRO}</td></tr>
<tr><th>생성형 AI 활용</th><td>{ON} 활용함 (도구 : {AI_TOOL} &nbsp;/ 활용 범위 : {AI_SCOPE} )<br>{OFF} 활용하지 않음</td></tr>
</table>
<div class="decl">본인은 응모작이 직접 창작한 것임을 확인하며, 공모 요강과 유의사항을 모두 읽고<br>이에 동의하며, 위와 같이 참가를 신청합니다.</div>
<div class="date">{m['y']}년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일</div>
<div class="signline">응모자 : &nbsp;{m['name']} &nbsp;&nbsp;&nbsp;&nbsp;{sign('(서명)')}</div>
</body></html>"""


def form2():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>서식2 개인정보 동의서</title><style>{BASE_CSS}
body {{ font-size:10pt; }}
.titlebox .t {{ font-size:13pt; }}
.f th {{ background:#fff; font-weight:400; }}
.f .b {{ background:#dce6f1; }}
.ask {{ font-size:11.5pt; font-weight:700; margin:12px 0 6px 6px; }}
.box {{ font-size:14pt; text-align:center; }}
.date {{ text-align:center; font-size:12pt; font-weight:700; letter-spacing:2px; margin:46px 0 26px; }}
.signline {{ text-align:center; font-size:12pt; font-weight:700; }}
.to {{ text-align:center; font-size:17pt; margin-top:40px; letter-spacing:2px; }}
</style></head><body>
<div class="titlebox"><span class="t">「2026년도 한전KDN 환경 공모전」 공모 및 포상을 위한 개인정보 수집·이용 동의서</span></div>
<p style="margin:12px 0">한전KDN(주)는 「2026년도 한전KDN 환경 공모전」공모 및 포상을 위하여 아래와 같이 개인정보를 수집·이용하고자 합니다. 아래 내용을 자세히 읽으신 후 동의 여부를 결정하여 주시기 바랍니다.</p>
<h2>1. 개인정보 수집 및 이용 동의(필수)</h2>
<table class="f">
<tr><th style="width:30%">수집·이용목적</th><td>공모전 신청 접수 및 본인확인, 공모전 운영 전반(심사, 결과 통보)</td></tr>
<tr><th>수집하는 개인정보 항목</th><td>성명, 연락처, 이메일, 소속 등</td></tr>
<tr><th>보유·이용기간</th><td>공모전 포상으로부터 30일</td></tr>
<tr><th>개인정보 수집 동의<br>거부의 권리</th><td>귀하는 위의 개인정보 수집․이용에 대한 동의를 거부할 권리가 있습니다. 그러나 동의를 거부할 경우「산업안전 포스터 공모전」 참여 및 심사에서 제한될 수 있습니다.</td></tr>
</table>
<div class="ask">☞ 위와 같이 개인정보의 수집 및 이용에 동의하십니까?</div>
<table class="f"><tr><th style="width:17%;font-weight:700">필수항목</th><th class="b" style="width:20%">동의함</th><td class="box" style="width:20%">{ON}</td><th class="b" style="width:23%">동의하지 않음</th><td class="box">{OFF}</td></tr></table>
<h2>2. 법정대리인 동의 <span style="font-weight:400">(만 14세 미만인 경우에 해당하며, 개인정보보호법 제22조 제5항에 의거 법정대리인의 동의를 받습니다)</span></h2>
<table class="f">
<tr><th style="width:37%;font-weight:700">법정대리인 성명</th><th style="font-weight:700">연락처</th><th style="width:17%;font-weight:700">관계</th></tr>
<tr><td style="text-align:right;font-size:9pt;height:34px"><span class="gray" style="float:left">해당 없음(성인)</span>(인/서명)</td><td></td><td></td></tr>
</table>
<div class="ask">☞ 위와 같이 개인정보의 수집 및 이용에 동의하십니까?</div>
<table class="f"><tr><th class="b" style="width:18%">동의함</th><td class="box" style="width:32%">{OFF}</td><th class="b" style="width:28%">동의하지 않음</th><td class="box">{OFF}</td></tr></table>
<h2>3. 기타사항</h2>
<table class="f"><tr><td>❍ 공모 접수 및 심사, 포상처리 과정에서 공모자 본인 확인, 심사 결과 통보, 포상비 지급 등을 위한 연락을 드릴 수 있습니다.</td></tr></table>
<div class="date">{m['y']} 년 &nbsp;&nbsp;{m['m']} 월 &nbsp;&nbsp;{m['d']} 일</div>
<div class="signline">본 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;인 &nbsp;&nbsp;&nbsp;&nbsp;성명 &nbsp;&nbsp;{m['name']} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{sign('(서명 또는 인)')}</div>
<div class="to">한전KDN주식회사 귀중</div>
</body></html>"""


def form3():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>서식3 에코라이프 신규 아이디어 제안서</title><style>{BASE_CSS}
@page {{ margin:11mm 14mm; }}
body {{ font-size:9.4pt; line-height:1.43; }}
.titlebox .t1 {{ font-size:13pt; font-weight:700; text-decoration:underline; }}
.titlebox .t {{ font-size:18pt; }}
h2 {{ margin:9px 0 4px; font-size:10.5pt; }}
.cell {{ border:1px solid #000; padding:7px 11px; }}
.cell p {{ margin:3px 0; }}
.cell ul {{ margin:3px 0 3px 17px; padding:0; }} .cell li {{ margin:2px 0; }}
.k {{ font-weight:700; color:#1d4e89; }}
.wk td, .wk th {{ border:1px solid #9aa9b9; padding:3px 7px; vertical-align:top; font-size:9pt; }}
.wk th {{ background:#e6edf5; white-space:nowrap; }}
.src {{ font-size:7.8pt; color:#444; line-height:1.35; margin-top:4px; }}
.calc {{ background:#f3f6fa; border-left:3px solid #1d4e89; padding:5px 9px; margin:5px 0; }}
.avoid {{ page-break-inside:avoid; }}
</style></head><body>
<div class="titlebox"><div class="t1">2026 한전KDN 환경 공모전</div><div class="t">에코라이프 신규 아이디어 제안서</div></div>
<div class="mng">[관리번호 : <i>(주관부서 기재란)</i> ]</div>
<h2>1. 응모자 정보</h2>
<table class="f">
<tr><th style="width:15%">트랙</th><td colspan="3">{OFF} 임직원 트랙(한전KDN 전 임직원)<br>{ON} 대국민 트랙(국민 누구나, 임직원 신청 불가)</td></tr>
<tr><th>성 명</th><td style="width:37%">{m['name']}</td><th style="width:13%">생년월일</th><td>{m['birth']}</td></tr>
</table>
<h2>2. 아이디어 개요</h2>
<table class="f">
<tr><th style="width:21%">아이디어 제목</th><td><b>{TITLE}</b><br><span style="font-size:9.3pt">— {SUBTITLE}</span></td></tr>
<tr><th>제안 분야</th><td>{ON} 온실가스 감축 &nbsp;&nbsp;&nbsp; {OFF} 자원순환 &nbsp;&nbsp;&nbsp; {ON} 에너지 절약<br>{OFF} 환경보호 문화 확산 &nbsp;&nbsp;&nbsp; {OFF} 기타( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</td></tr>
<tr><th>참여 대상</th><td>{ON} 임직원 &nbsp;&nbsp;&nbsp; {ON} 지역사회 &nbsp;&nbsp;&nbsp; {ON} 대국민</td></tr>
<tr><th>한 줄 요약</th><td>{ONELINE}</td></tr>
</table>

<h2>3. 제안 배경</h2>
<div class="cell">
<p><span class="k">① 꺼진 줄 알았던 전기.</span> 가족이 모두 잠든 새벽에도 셋톱박스·공유기·비데 온열·정수기·충전기처럼 계속 전기를 먹는 기기가 있습니다. 한국전기연구원의 2011년 전국 105가구 실측조사에서 일반 가정은 전체 전기 사용량의 <b>6% 이상</b>이 대기전력으로 나갔고, 셋톱박스의 대기전력은 <b>12.3W</b>로 TV(1.3W)의 약 10배였습니다.<sup>1)</sup></p>
<p><span class="k">② 사람들이 지금 안 끄는 이유는 의지가 아니다.</span> “플러그를 뽑자”는 말은 오래됐지만 실천이 안 되는 데는 세 가지 원인이 있습니다. <b>(가) 안 보인다</b> — 고지서는 한 달 합계라 상시전력이 냉난방·조리 전기와 섞여 구분되지 않습니다. <b>(나) 범인을 모른다</b> — 어느 기기가 새는지 모르니 “전부 뽑자”는 막연한 요구가 됩니다. <b>(다) 불편할까 봐 걱정된다</b> — 셋톱박스·공유기를 끄면 생활이 불편해질 것 같아 아예 손대지 않습니다. 이 미션은 원인마다 장치를 하나씩 둡니다: (가) → <b>새벽 사용량만 떼어 보여 주기</b>, (나) → <b>전력측정기 대여와 기기별 목록표</b>, (다) → <b>‘불편 없는 것만 끈다’ 원칙과 전후 숫자 비교</b>.</p>
<p><span class="k">③ 이제는 숫자로 볼 수 있다.</span> 지능형 전력량계(AMI)가 설치된 가정은 누구나 한전 「파워플래너」 앱으로 실시간 사용량과 사용 패턴을 볼 수 있고(2024년 6월 가입 90만 5천 호), AMI가 없으면 「한전:ON」에서 우선 설치를 신청할 수 있습니다.<sup>2)</sup> 가족이 모두 잠든 <b>새벽 시간대 사용량</b>에는 사람의 행동이 빠져 있으므로, 냉장고처럼 꼭 필요한 기기를 빼면 <b>그 자체가 낭비의 크기</b>입니다. 한 달 합계 고지서로는 볼 수 없던 이 숫자를 AMI가 떼어 보여 줍니다.</p>
<p><span class="k">④ 기존 Eco-Life 프로그램의 빈칸.</span> 별첨 「기수별 운영 프로그램」을 보면 걸음수(1·4·5기), 다회용컵·텀블러(2·4기), 메일 삭제(4기)처럼 <b>행동을 인증</b>하는 미션이 중심이고, 실천 전후의 <b>전력 절감량을 계량 숫자로 확인</b>하는 미션은 없습니다. 지역사회 에너지 복지도 고효율 조명 교체(4기)·시설 개선(5기)처럼 <b>설비 교체</b> 위주입니다. 한전KDN은 국가 지능형 전력계량 인프라(AMI) 구축을 맡아 온 회사인데<sup>3)</sup>, 정작 Eco-Life에는 그 강점인 ‘계량’을 쓰는 미션이 없었습니다.</p>
</div>

<h2>4. 아이디어 주요 내용</h2>
<div class="cell">
<p><b>프로그램:</b> KDN Eco-Life 6기 4주 미션 「새벽 3시의 계량기」 — <b>재고 → 찾고 → 끄고 → 다시 잰다.</b></p>
<table class="wk" style="margin:6px 0">
<tr><th style="width:15%">주차</th><th>참여자가 하는 일</th><th style="width:27%">운영 측 준비</th></tr>
<tr><td><b>1주 재기</b></td><td>파워플래너의 실시간 사용량·사용 패턴 화면에서 가족이 모두 자는 <b>새벽 2~5시</b> 사용량을 확인해 캡처. 이것이 ‘우리 집 새벽 전기(W)’</td><td>앱 보는 법 1장 안내문, AMI 미설치 가구는 한전:ON 우선 설치 신청 안내</td></tr>
<tr><td><b>2주 찾기</b></td><td>콘센트형 전력측정기를 빌려 셋톱박스·공유기·비데·정수기·전기매트·충전기 등을 하나씩 재고 「우리 집 새벽 전기 목록표」 작성</td><td>사옥 내 측정기 대여함, 목록표 양식</td></tr>
<tr><td><b>3주 끄기</b></td><td>생활에 불편 없는 것만 끈다: 개별 스위치 멀티탭, 셋톱박스 절전·예약 설정, 비데 절전 모드, 안 쓰는 충전기 뽑기</td><td>기기별 절전 설정 방법 카드</td></tr>
<tr><td><b>4주 다시 재기</b></td><td>같은 새벽 시간대 사용량을 다시 확인해 <b>줄어든 W</b>와 연간 환산량을 인증</td><td>인증 폼(전후 캡처 2장), 결과 익명 집계</td></tr>
</table>
<p><b>지역사회로 — 「새벽 전기 이웃 진단」:</b> 미션을 마친 임직원이 2인 1조로 본사 인근(나주) 취약계층 가구·복지시설을 찾아가 측정기로 새벽 전기 원인을 함께 찾고, 개별 스위치 멀티탭을 달아 드린 뒤 4주 후 다시 잽니다. 기존 「취약계층 고효율 조명기기 교체」·「따밝동행」 방문 일정에 얹으면 별도 동선 없이 운영할 수 있습니다.</p>
<p><b>대국민으로 — 「우리 집 새벽 전기 몇 W?」 인증 이벤트:</b> KDN 에코톡 채널에서 전후 캡처를 받아 추첨 보상하고, 모인 결과로 ‘새벽에 전기를 가장 많이 먹는 가전 순위’를 익명 집계해 카드뉴스·환경톡톡 카툰 소재로 다시 알립니다.</p>
<p><b>다음 단계(제안):</b> 참여 결과가 쌓이면, AMI 운영 경험을 살려 한전과 파워플래너에 ‘새벽 최저 사용량’ 표시·알림 기능을 넣는 방안을 협의할 수 있습니다. 처음에는 기존 앱 화면과 설문폼만으로 시작해 개발비가 들지 않습니다.</p>
<table class="wk avoid" style="margin-top:6px">
<tr><th style="width:24%">기존 Eco-Life</th><th>이 미션과 다른 점</th></tr>
<tr><td>걸음수·텀블러·메일 삭제 등 행동 인증</td><td>행동이 아니라 <b>계량기 숫자의 전후 차이</b>로 효과를 확인 — 참여자가 자기 집 절감량을 직접 봄</td></tr>
<tr><td>취약계층 고효율 조명 교체(설비 교체)</td><td>조명 밖의 <b>상시전력</b>을 진단하고 생활 습관·멀티탭으로 줄임. 4주 뒤 재측정으로 효과를 남김</td></tr>
<tr><td>캠페인별 단발 운영</td><td>1년에 두 번(여름·겨울 전) 반복 가능, 같은 집의 숫자를 계속 비교할 수 있어 <b>지속</b>이 쉬움</td></tr>
</table>
</div>

<h2>5. 기대 효과</h2>
<div class="cell avoid">
<p><span class="k">참여 확산 (예상 참여 인원·목표치)</span> — 임직원 가정 <b>200가구</b>, 「새벽 전기 이웃 진단」 지역 취약계층 <b>30가구</b>, 대국민 인증 이벤트 <b>500명</b>(1회 운영 기준, 제안자 설정 목표). 스마트폰 앱 확인과 측정기 대여만 있으면 되어 누구나 바로 따라 할 수 있습니다.</p>
<p><span class="k">환경 효과 (추정)</span> — 상시전력은 하루 24시간 내내 나가므로 작은 W도 1년이면 커집니다.</p>
<div class="calc">· 가구당 상시전력 <b>10W</b>를 줄이면: 10W × 8,760시간 = <b>연 87.6kWh</b> → × 0.4173 kgCO₂eq/kWh<sup>4)</sup> = <b>연 약 36.6kg CO₂eq</b><br>
· 목표 참여 230가구(임직원 200 + 지역 30)가 같은 만큼 줄이면: <b>연 약 20,148kWh</b>, <b>약 8.4t CO₂eq</b> 감축<br>
· 셋톱박스 한 대(대기전력 12.3W<sup>1)</sup>)를 하루 8시간 꺼 두면: 12.3W × 8시간 × 365일 = <b>연 약 35.9kWh</b></div>
<p style="font-size:9pt">※ 10W·230가구는 계산을 위한 가정값이며, 실제 효과는 4주차 전후 측정값의 합계로 집계·공개합니다.</p>
<p><span class="k">에너지 복지</span> — 취약계층 가구는 새는 전기를 찾을 도구와 정보가 부족합니다. 측정과 멀티탭 설치를 함께 하면 전기요금 부담을 덜고, 조명 교체에 이어 KDN의 지역 에너지 복지를 넓힐 수 있습니다.</p>
</div>
<p class="src"><b>근거 자료</b><br>
1) 부산일보, 「대기전력 TV의 10배 셋톱박스 ‘헛돈 줄줄’」, 2012.6.15. (한국전기연구원 2011 대기전력 실측조사, 105가구) https://www.busan.com/view/busan/view.php?code=20120615000071<br>
2) 뉴시스, 「‘파워플래너’로 올여름 전기요금 아끼세요…한전, 요금 절감 지원」, 2024.7.1. https://www.newsis.com/view/NISX20240628_0002791606<br>
3) 한전KDN 누리집, 솔루션·서비스 › 판매ICT › 지능형 전력계량 인프라 https://www.kdn.com/menu.kdn?mid=a10204110100<br>
4) 쿠키뉴스, 「전력배출계수 갱신 주기, 3년에서 1년으로 단축」, 2025.12.18. (기후에너지환경부 공표 2023년 전력배출계수 0.4173 tCO₂eq/MWh) https://www.kukinews.com/article/view/kuk202512180131<br>
※ 기존 Eco-Life 프로그램은 「공모전 시행(안)」 별첨 《KDN Eco-Life 기수별 운영 프로그램》 기준</p>
</body></html>"""


def pdf(html, name):
    src = BUILD / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = OUT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={BUILD / 'prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    pdf(form1(), "서식1_참가신청서_박용진")
    pdf(form2(), "서식2_개인정보수집이용동의서_박용진")
    pdf(form3(), "서식3_에코라이프신규아이디어제안서_박용진")
