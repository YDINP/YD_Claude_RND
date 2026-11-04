"""모두의 KISA 공모 — 국민제안서(양식3 국민참여예산, 양식1 슬로건) + 개인정보 수집·이용 동의서(붙임3) PDF.
HTML → Chrome headless --print-to-pdf. 서식 문구는 원본 hwpx(원본/붙임2·3) 그대로.
실행: python make_pdf.py
"""
import base64, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).parent
ASSETS = HERE / "assets"
OUT = HERE
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def b64(p):
    return "data:image/png;base64," + base64.b64encode((ASSETS / p).read_bytes()).decode()


SIG, LOGO, GOV = b64("sig_1_10.png"), b64("kisa_logo.png"), b64("gov_mark.png")
ME = dict(name="박용진", birth="1997. 5. 29.", phone="010-2576-9278", email="parkkb10@gmail.com",
          y="2026", m="11", d="4")

CSS = """
@page { size:A4; margin:13mm 14mm 12mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.6pt; color:#111; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.top { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.top img.l { height:22px; } .top img.r { height:34px; }
.tagrow { display:flex; align-items:stretch; margin-bottom:4px; }
.tag { background:#1c2f5e; color:#fff; font-weight:700; font-size:12pt; padding:3px 12px; }
.ttl { flex:1; margin-left:6px; font-weight:700; font-size:12.5pt; padding:3px 8px;
       border-top:1.5px solid #1c2f5e; border-bottom:1.5px solid #1c2f5e; }
.f { border:1.6px solid #000; }
.f td { border:1px solid #000; padding:5px 8px; vertical-align:middle; }
.f .h1 { text-align:center; font-size:15pt; font-weight:700; padding:6px; border-bottom:1px dotted #000; }
.f .h2 { text-align:center; font-size:12pt; font-weight:700; background:#e7e7e7; padding:5px; }
.f .lb { text-align:center; font-weight:400; }
.f .lb small { display:block; font-size:8pt; font-weight:700; line-height:1.35; margin-top:2px; }
.f .c { text-align:center; }
.f .v { vertical-align:top; }
.note { font-size:9.2pt; text-align:center; margin-top:5px; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }
p { margin:2px 0; } ul { margin:1px 0 2px 16px; padding:0; } li { margin:1px 0; }
.sub { font-weight:700; color:#1c2f5e; margin-top:5px; }
.src { font-size:7.6pt; color:#444; line-height:1.4; margin-top:5px; }
.mini td, .mini th { border:1px solid #999; padding:3px 6px; font-size:8.8pt; }
.mini th { background:#eef1f7; }
"""


def head(tag, title):
    return f"""<div class="top"><img class="l" src="{LOGO}"><img class="r" src="{GOV}"></div>
<div class="tagrow"><div class="tag">{tag}</div><div class="ttl">{title}</div></div>"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def person_rows(lw, span=1):
    m, cs = ME, f' colspan="{span}"'
    return f"""<tr><td class="lb" rowspan="2" style="width:{lw}">인적<br>사항*</td>
<td class="c" style="width:11%">성 &nbsp;명</td><td class="c"{cs}>{m['name']}</td>
<td class="c" style="width:12%">생년월일</td><td class="c"{cs}>{m['birth']}</td></tr>
<tr><td class="c">연락처</td><td class="c"{cs}>{m['phone']}</td><td class="c">이메일</td><td class="c"{cs}>{m['email']}</td></tr>"""


NOTE = '<div class="note">※ <b>(작성)</b> 필수(*), <b>(분량)</b> A4 2장 이내(HWP 1부, PDF 1부), <b>(제출)</b> idea@kisa.or.kr</div>'

# ───────────────────────── 양식3 국민참여예산 아이디어 ─────────────────────────
TITLE3 = "가짜를 쫓기 전에 진짜를 등록하자 — 공공기관 발송 문자 「진짜 문자 장부」"


def form3():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>국민제안서_국민참여예산</title><style>{CSS}</style></head><body>
{head('양식3', '국민제안서 양식(국민참여예산 아이디어)')}
<table class="f">
<tr><td colspan="7" class="h1">모두의 KISA 국민제안서</td></tr>
<tr><td colspan="7" class="h2">국민 체감 사업 발굴: 국민참여예산 아이디어 공모</td></tr>
<tr><td class="lb" style="width:14%">공모분야*</td><td colspan="6"><b>디지털위협예방 (스미싱·공공기관 사칭 문자 피해 예방)</b>
<div style="font-size:8pt;color:#444">연계 사업: 스미싱 확인 서비스(보호나라 카카오톡 채널), 악성문자 사전차단 체계(엑스레이), 118 상담</div></td></tr>
<tr><td class="lb">제안유형<br>(중복가능)</td><td colspan="2" style="white-space:nowrap">■ 국민애로 해소</td><td style="white-space:nowrap">■ 행정서비스 개선</td><td colspan="2" style="white-space:nowrap">■ 수행사업 효과 제고</td><td style="white-space:nowrap">□ 사업비 절감</td></tr>
{person_rows('14%', 2)}
<tr><td class="lb" colspan="2" style="width:25%">개 &nbsp;요*<small>주요내용 요약</small></td><td colspan="5" class="v">
<p style="font-weight:700;font-size:10.2pt">{TITLE3}</p>
<p>o <b>(주요 내용)</b> 공공기관 사칭 스미싱을 받는 사람이 아니라 <b>보내는 쪽에서 가려내기</b> 위한 「진짜 문자 장부」 추진</p>
<p>&nbsp;- 공공기관이 대량 발송하는 문자의 <b>링크 주소·발신번호·기관명·발송일</b>을 엑스레이 검사 단계에서 장부에 자동 기록(본문·수신자 정보는 저장 안 함)</p>
<p>&nbsp;- 스미싱 확인 서비스·118에 공공기관 이름 문자가 들어오면 장부와 대조해 <b>“○○구청이 11월 4일 보낸 진짜 문자” / “공공기관 장부에 없는 문자 — 누르지 마세요”</b>를 즉시 답변</p>
<p>o <b>(기대효과)</b> 공공기관 사칭 문자의 즉시 판별, 진짜 공공 안내 문자의 신뢰 회복</p>
<p>&nbsp;- 국민에게 매번 바뀌는 주의사항 대신 “<b>공공기관 이름을 단 문자는 장부·안심마크로 확인된 것만 진짜</b>”라는 한 줄 규칙을 줌</p>
</td></tr>
<tr><td class="lb" colspan="2">추진배경*</td><td colspan="5" class="v">
<p class="sub" style="margin-top:0">왜 피해가 줄지 않는가 — 판별 책임이 ‘받는 사람’에게만 있다</p>
<p>o 차단 기술은 강해지고 있지만 스미싱은 줄지 않음: 2024년 상반기 KISA 접수 스미싱 신고 <b>88만 7,859건</b>(2020년 이후 최다)<sup>①</sup>, 2025년 상반기 탐지 <b>100만 건</b>, 과태료·국민연금 등 <b>공공기관 사칭이 상위</b><sup>②</sup></p>
<p>o 국민이 받는 링크 문자 대부분은 진짜이고, 가짜는 그 사이에 섞여 옴: 한 스팸 알림 앱 이용자가 1주일간 받은 링크 문자 2천만 건 중 ‘위험·의심’ 판정은 <b>16%</b><sup>③</sup>. “링크를 누르지 말라”는 교육은 매일 오는 진짜 링크 문자와 부딪혀 지켜지기 어려움</p>
<p>o 정부의 “이번 문자에는 링크가 없다” 안내는 <b>사안마다 따로</b> 나옴(소비쿠폰 2차·고유가 피해지원금 등)<sup>④</sup> → 국민이 외울 상시 규칙이 없음. 반대로 진짜 구청 문자를 스팸으로 알고 지우는 일도 많아 송파구는 KISA 인증 안심마크 문자를 따로 도입<sup>⑤</sup></p>
<p>o 스미싱 확인 서비스는 ‘가짜 목록’ 중심이라, 처음 보는 주소는 우선 ‘주의’로 답하고 재검사함. 언론 점검 때는 <b>KISA 공식 누리집 주소도 ‘주의’</b>로 안내됨<sup>①</sup> → 진짜 목록이 없으면 진짜도 확인해 줄 수 없음</p>
<p><b>⇒ 가짜는 끝없이 새로 생기지만, 공공기관이 보내는 진짜 문자는 보내는 순간 이미 알 수 있다. 진짜를 먼저 등록하면, 공공기관 이름을 달고 장부에 없는 문자는 곧바로 가짜다.</b></p>
</td></tr>
<tr><td class="lb" colspan="2">주요 내용*<small>국가예산 관련</small></td><td colspan="5" class="v">
<p class="sub" style="margin-top:0">① 진짜 문자 장부 (등록)</p>
<ul><li>중앙부처·지자체·공공기관의 대량 문자 발송 계정을 문자 중계사에 ‘공공 발신’으로 지정</li>
<li>이미 모든 중계사 문자의 링크를 검사하는 엑스레이 체계<sup>②</sup>에 기록 기능만 더해, 공공 발신 문자의 <b>링크 주소·발신번호·기관명·발송일시</b>를 자동 저장 — 기관이 따로 할 일 없음, 본문·수신자 저장 안 함</li></ul>
<p class="sub">② 즉시 확인 (조회)</p>
<ul><li>스미싱 확인 서비스·118·KISA와 협약한 은행 앱 확인 기능에서 장부 대조 결과를 바로 답변: <b>진짜</b>(기관·발송일 표시) / <b>장부에 없는 공공기관 이름 문자</b>(가짜로 즉시 안내)</li>
<li>처음 보는 주소라도 ‘주의’ 대기 없이 답할 수 있어 확인 서비스의 답변 품질이 올라감</li></ul>
<p class="sub">③ 사칭 경보 (역방향 통보)</p>
<ul><li>장부에 없는 ‘○○구청’, ‘국민연금’ 이름의 문자가 엑스레이·확인 서비스에 잡히면 <b>해당 기관에 바로 통보</b> → 기관이 누리집·공식 채널로 “지금 우리 이름의 가짜 문자가 돌고 있다”를 알림</li></ul>
<p class="sub">④ 한 줄 규칙 홍보</p>
<ul><li>“공공기관 이름을 단 문자, <b>방패(안심마크)가 없으면 확인부터</b>” — KISA 인증 안심마크 문자(RCS)<sup>⑤</sup>와 장부를 묶어, 안심마크가 안 보이는 휴대폰도 확인 서비스로 같은 답을 받게 함</li></ul>
<p class="sub">⑤ 단계 추진</p>
<table class="mini"><tr><th style="width:16%">시기</th><th>범위</th><th style="width:38%">확인 지표</th></tr>
<tr><td>1년차(시범)</td><td>과기정통부·KISA, 지자체 10곳, 국민연금 등 사칭 상위 공공기관</td><td>장부 대조 답변 비율, ‘주의’ 답변 감소, 사칭 통보 건수</td></tr>
<tr><td>2년차(확대)</td><td>전 중앙부처·지자체·공공기관 발송 계정</td><td>공공기관 사칭 문자 신고·피해 상담 변화</td></tr></table>
</td></tr>
<tr><td class="lb" colspan="2">추정 사업비<br>및 산출근거</td><td colspan="5" class="v">
<p><b>1년차 시범 약 2억 6천만 원</b> (제안자 추정. 기존 엑스레이·스미싱 확인 서비스를 재사용해 새 장비 없이 구축)</p>
<table class="mini"><tr><th>항목</th><th style="width:20%">금액</th><th>산출근거</th></tr>
<tr><td>장부 기록·조회 기능 개발(엑스레이 연계 API, 저장소)</td><td>1억 5천만 원</td><td>개발 인력 5명 × 6개월 수준(추정)</td></tr>
<tr><td>스미싱 확인 서비스·118 상담 화면 장부 대조 연계</td><td>5천만 원</td><td>기존 서비스 기능 추가(추정)</td></tr>
<tr><td>시범 기관·중계사 연동 지원, 담당자 안내</td><td>3천만 원</td><td>시범 기관 약 15곳 연동 점검(추정)</td></tr>
<tr><td>한 줄 규칙 홍보, 효과 분석</td><td>3천만 원</td><td>홍보물·온라인 홍보 2천 + 분석 1천(추정)</td></tr></table>
</td></tr>
</table>
{NOTE}
<div class="src"><b>근거 자료</b> ① 바이라인네트워크, 「스미싱 예방 어딜 의지해야 하나…KISA 대국민 서비스도 글쎄」, 2024.10.11. byline.network/2024/10/241011_002/
② 바이라인네트워크, 「스미싱 문자 사전 차단…KISA ‘엑스레이’ 체계 가동」, 2025.8. byline.network/2025/08/29-390/
③ 아시아경제, 「URL 포함 문자 16%가 스미싱 위험」(후후 이용자 1주일 2천만 건 분석), 2023.5.31. asiae.co.kr/en/article/2023053109315266011
④ 아시아경제, 소비쿠폰 2차 URL 문자 미발송, 2025.9.14. asiae.co.kr/en/article/2025091411501244630 · 헤럴드경제, 「URL 링크가 포함된 고유가 피해지원금 문자와 알림은 100% 사기」, 2026.4. heraldk.com/article/2026041521362549780
⑤ 헤럴드경제, 「송파구, 공공기관 사칭 막는 ‘RCS 안심문자 서비스’ 도입」, 2026.3.19. heraldk.com/article/2026031914302535907</div>
</body></html>"""


# ───────────────────────── 양식1 슬로건 ─────────────────────────
SLOGAN = "진짜와 가짜 사이, KISA가 있습니다"
REASON = ("KISA가 하는 일을 한 문장으로 줄이면 ‘진짜와 가짜를 가려 주는 일’입니다. 택배 문자와 사칭 문자, 진짜 누리집과 피싱 사이트, "
          "정상 앱과 악성 앱 사이에서 국민은 매일 판단을 강요받고, 그 판단이 틀리는 순간 피해가 생깁니다. KISA는 바로 그 사이에서 "
          "스미싱을 판별하고, 악성 주소를 막고, 118로 답해 줍니다. ‘보안’, ‘안전’ 같은 넓은 말 대신 국민이 실제로 겪는 장면인 "
          "‘진짜와 가짜 사이’를 넣어, 듣는 순간 수상한 문자를 받았던 기억과 KISA가 연결되도록 했습니다. 어려운 말 없이 누구나 바로 "
          "이해하도록 일상어로만 지었습니다.")
EFFECT = ("수상한 문자 앞에서 ‘진짜와 가짜 사이에 KISA가 있다’가 떠올라 118·스미싱 확인 서비스 이용이 늘고, "
          "사칭 경보·안내문 어디에 붙여도 KISA의 역할이 한 줄로 전달됩니다.")


def form1():
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>국민제안서_슬로건</title><style>{CSS}
body {{ font-size:10.5pt; line-height:1.7; }} .f td {{ padding:8px 10px; }}</style></head><body>
{head('양식1', '국민제안서 양식(슬로건 부문)')}
<table class="f">
<tr><td colspan="5" class="h1">모두의 KISA 국민제안서</td></tr>
<tr><td colspan="5" class="h2">국민참여 기반 조성: ① 슬로건 부문 공모</td></tr>
{person_rows('20%')}
<tr><td class="lb" style="height:120px">슬로건*<small>글자 수, 국문 40자<br>이내(공백 미포함)</small></td>
<td colspan="4" style="text-align:center;font-size:17pt;font-weight:700;letter-spacing:1px">{SLOGAN}</td></tr>
<tr><td class="lb" style="height:330px">기획 이유*<small>글자 수, 300자<br>이내(공백 미포함)</small></td><td colspan="4">{REASON}</td></tr>
<tr><td class="lb" style="height:150px">기대효과*<small>글자 수, 100자<br>이내(공백 미포함)</small></td><td colspan="4">{EFFECT}</td></tr>
</table>
{NOTE}
</body></html>"""


# ───────────────────────── 붙임3 개인정보 동의서 ─────────────────────────
def consent():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보동의서</title><style>{CSS}
body {{ font-size:10.5pt; line-height:1.75; }}
.box {{ border:1.2px solid #000; padding:22px 20px; }}
.box h3 {{ text-align:center; font-size:12pt; margin:10px 0 22px; }}
.it {{ font-weight:700; margin-top:10px; }} .ind {{ padding-left:16px; }}
.sm {{ font-size:9pt; margin-top:12px; }}
</style></head><body>
{head('붙임3', '개인정보 수집 · 이용 동의서')}
<div class="box" style="border-bottom:none">
<h3>개인정보의 수집·이용에 대한 동의서</h3>
<p>‘모두의 KISA’와 관련하여 아래와 같이 귀하의 개인정보를 수집·이용하기 위하여 「개인정보보호법」 제15조에 따라 관련 사항을 안내하오니 아래 내용을 숙지하신 후 동의하여 주시기 바랍니다.</p>
<p class="it">□ 개인정보의 수집·이용 목적</p>
<p class="ind">‘모두의 KISA’ 지원에 따른 본인확인 및 활동에 대한 개인 식별, 공지사항 전달 및 상금 지급 등 공모전 관리를 위한 용도로만 사용됩니다.</p>
<p class="it">□ 수집·이용하려는 개인정보 항목</p>
<p class="ind">성명, 생년월일, 연락처, 이메일</p>
<p class="it">□ 개인정보의 보유 및 이용기간</p>
<p class="ind">수집일로부터 활동 종료 시(응모 접수, 심사, 결과 발표, 상금 지급 등)까지 보유 및 활용하며, 일정 보유기간 경과 후 즉시 파기</p>
<p class="sm">※ 귀하는 개인정보보호법에 의해 개인정보 수집 동의를 거부할 권리가 있으며, 수집 동의 거부 시에는 ‘모두의 KISA’ 심사에서 제한될 수 있음을 알려 드립니다.</p>
</div>
<div class="box">
<p style="text-align:center;font-weight:700;margin-top:6px">본인은 상기의 개인정보 수집·이용에 대한 내용을 숙지하였으며, 이에 동의합니다.</p>
<p style="text-align:right;margin:16px 40px 0 0;font-size:11.5pt">동의함 ■ &nbsp;&nbsp;동의하지 않음 □</p>
<p style="text-align:right;margin:40px 0 0;font-size:11pt">{m['y']}년 &nbsp;&nbsp;&nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;&nbsp;&nbsp;{m['d']}일</p>
<p style="text-align:right;margin:26px 0 6px;font-size:11pt"><span style="border-bottom:1px solid #000;padding:0 4px">성명 : &nbsp;&nbsp;&nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{sign('(서명 또는 인)')}</span></p>
</div>
<p style="margin-top:6px;font-size:10pt">&nbsp;&nbsp;※ 개인정보 수집·이용 동의서는 자필 서명 후 스캔하여 국민제안서와 함께 제출</p>
</body></html>"""


def pdf(html, name):
    work = Path(tempfile.mkdtemp(prefix="kisa_pdf_"))
    src = work / "page.html"
    src.write_text(html, encoding="utf-8")
    out = OUT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={work / 'prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    pdf(form3(), "국민제안서_국민참여예산_진짜문자장부_박용진")
    pdf(form1(), "국민제안서_슬로건_박용진")
    pdf(consent(), "개인정보수집이용동의서_박용진")
