"""현대모비스 50주년 굿즈 공모 — 굿즈 설명 PDF + 필수 서류 3종 PDF."""
import base64, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent
B = HERE / "build"
B.mkdir(exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def uri(p):
    p = HERE / p
    mime = "image/png" if p.suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


SIG = uri("assets/sig_1_10.png")
ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com", y="2026", m="11", d="4")
NAME = "1977 컨테이너 — 50년을 담는 데스크 박스"
SUMMARY = [
    "현대모비스의 시작(1977, 울산 매암동)에는 컨테이너가 있었고, 회사는 4년 만인 1980년 세계 1위 컨테이너 제조업체가 됐습니다.",
    "그 첫 세계 1위 제품을 1:40 강철 데스크 박스로 되살려, 실제 컨테이너처럼 잠기는 문과 이름·입사연도를 새기는 명판을 달았습니다.",
    "10년마다 한 색, 다섯 색으로 만들어 코너끼리 쌓으면 ‘50년’이 되는 임직원·협력사 기념 굿즈입니다.",
]
AI_USE = ("Claude(Anthropic) – 자료 조사·기획 초안·설명문 정리 / ChatGPT(OpenAI 이미지 생성) – 굿즈 이미지 시안 제작 "
          "(명판 문구는 이미지 생성 뒤 직접 합성, 아이디어 선정·최종 판단은 본인)")

BASE_CSS = """
@page { size:A4; margin:14mm 15mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.55; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:50%; top:50%; height:46px; transform:translate(-50%,-50%); }
"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def forms_html():
    m = ME
    summ = "".join(f"<p style='margin:4px 0'>· {s}</p>" for s in SUMMARY)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>필수 제출 서류 3종</title><style>{BASE_CSS}
.app {{ border:1.4px solid #000; }}
.app td {{ border:1px solid #000; padding:8px 10px; vertical-align:middle; font-size:10.5pt; }}
.app .h {{ width:21%; text-align:center; }}
.app .title {{ text-align:center; font-size:14pt; font-weight:700; padding:20px 0; text-decoration:underline; }}
.c {{ text-align:center; }}
h1 {{ text-align:center; font-size:15pt; text-decoration:underline; margin:6px 0 16px; }}
.ci {{ margin:10px 0 3px; font-size:11pt; }}
.ci + p, .d {{ margin:2px 0 2px 12px; }}
.t td, .t th {{ border:1px solid #000; padding:5px 7px; font-size:9.3pt; text-align:center; vertical-align:middle; }}
.t th {{ font-weight:400; background:#f2f2f2; }}
.small {{ font-size:9.3pt; }}
p {{ margin:3px 0; }}
.f3 p {{ margin:2px 0; }} .f3 h3 {{ font-size:10.5pt; margin:14px 0 4px; }}
</style></head><body>
<table class="app">
<tr><td colspan="4" class="title">&lt;현대모비스 창립 50주년 굿즈 아이디어 공모전&gt; 참가 신청서</td></tr>
<tr><td class="h">굿즈명(아이디어명)</td><td colspan="3"><b>{NAME}</b></td></tr>
<tr><td class="h" rowspan="2">신청자</td><td class="c">이름</td><td class="c">공모한 메일 주소</td><td class="c">휴대폰번호</td></tr>
<tr><td class="c">{m['name']}</td><td class="c">{m['email']}</td><td class="c">{m['phone']}</td></tr>
<tr><td class="h">AI 활용 여부</td><td colspan="3" class="c" style="line-height:1.9">□ 활용하지 않음<br>■ 활용함 → 사용 도구 및 활용 범위 작성<br>
<span style="font-size:9.3pt;line-height:1.5;display:block;text-align:left;margin:2px 6px">{AI_USE}</span></td></tr>
<tr><td class="h">주요 내용</td><td colspan="3" style="height:200px">{summ}
<p class="small" style="margin-top:8px;color:#333">※ 상세한 기획 배경·주요 특징·활용 방법·현대모비스와의 연관성: 첨부 「굿즈 설명 및 아이디어 스토리」 PDF</p></td></tr>
<tr><td class="h">제출 자료</td><td colspan="3" style="line-height:1.75">① 현대모비스 창립 50주년 굿즈 아이디어 공모전 필수 제출 서류 3종<br>&nbsp;&nbsp;&nbsp;&nbsp;(참가신청서·위탁동의서·상품화활용동의서)<br>
② 굿즈 아이디어<br>&nbsp;&nbsp;&nbsp;- 굿즈 아이디어 이미지 (JPG, PNG 별도 이미지 파일 제출)<br>&nbsp;&nbsp;&nbsp;- 굿즈 설명 및 아이디어 스토리<br>
<span class="small">※ 이미지와 설명 내용을 하나의 파일로 구성하여 PDF 형식으로 제출해 주세요.</span></td></tr>
<tr><td colspan="4" class="c" style="padding:14px;line-height:2">현대모비스 &lt;창립 50주년 굿즈 아이디어 공모전&gt;<br>참가 신청서를 제출합니다.</td></tr>
<tr><td colspan="4" class="c" style="padding:16px">{m['y']}년 &nbsp;&nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;&nbsp;{m['d']}일</td></tr>
</table>

<div class="pb"></div>
<h1>개인정보 수집·이용·제공 및 취급업무 위탁 동의서</h1>
<div class="ci">❍ 개인정보 수집‧이용‧제공 동의 목적</div>
<p class="d">- 현대모비스 &lt;창립 50주년 굿즈 아이디어 공모전&gt;의 접수·심사·수상 등 운영 전반</p>
<div class="ci">❍ 수집‧이용‧제공하는 개인정보의 항목</div>
<p class="d">- 공모 시: 성명, 이메일 주소, 휴대폰번호</p>
<p class="d">- 수상 시: 성명, 주민등록번호, 주소, 휴대폰번호, 통장사본(제세공과금 신고를 위함)</p>
<div class="ci">❍ 보유‧이용기간</div>
<p class="d">- 공모전 모집 마감일로부터 최대 1년(단, 이용 목적 달성 후 즉시 파기)</p>
<div class="ci">❍ 개인정보 제공 내역</div>
<table class="t"><tr><th style="width:17%">제공받는 자</th><th style="width:27%">제공 목적</th><th>제공 항목</th><th style="width:15%">보유‧이용 기간</th></tr>
<tr><td>현대모비스<br>주식회사</td><td>&lt;창립 50주년 굿즈 아이디어<br>공모전&gt;의 접수‧심사‧수상 등<br>운영 전반</td><td style="text-align:left">- 공모 시: 성명, 이메일주소, 휴대폰번호<br>- 수상 시: 성명, 주민등록번호, 주소,<br>휴대폰번호, 통장사본</td><td>공모전 모집<br>마감일로부터<br>최대 1년</td></tr></table>
<div class="ci">❍ 개인 정보의 취급 위탁</div>
<table class="t"><tr><th>위탁 목적</th><th style="width:35%">수탁업체</th></tr>
<tr><td>현대모비스 &lt;창립 50주년 굿즈 아이디어 공모전&gt;<br>운영</td><td>㈜펑션</td></tr></table>
<p class="small" style="margin-top:8px">(1) 회사는 이용자의 민원사항에 대한 처리 등 원활한 업무 수행을 위하여 위와 같이 개인정보 처리 업무를 외부 전문업체(수탁업체)에 위탁하여 운영하고 있습니다. 동 업체가 변경될 경우, 회사는 변경된 업체명을 공지사항 내지 개인정보 처리방침을 통해 고지하도록 하겠습니다.</p>
<p class="small">(2) 회사는 위탁계약 체결 시 위탁업무 수행목적 외 개인정보 처리금지, 기술적·관리적 보호조치, 재위탁 제한, 수탁자에 대한 관리·감독, 손해배상 등 책임에 관한 사항을 계약서 등 문서에 명시하고, 수탁자가 개인정보를 안전하게 처리하는지를 감독하고 있습니다.</p>
<div class="ci">❍ 동의 거부권리 안내</div>
<p>- 신청자는 본 개인정보 수집‧이용‧제공에 대한 동의를 거부할 수 있으나, 동의를 거부할 경우 공모전 참가가 제한됩니다.</p>
<p class="c" style="margin-top:8px">위 사항을 숙지하고 개인정보 수집‧이용‧제공에 동의합니다.</p>
<p class="c" style="margin-top:34px">{m['y']}년 &nbsp;&nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;&nbsp;{m['d']}일</p>
<p style="text-align:right;margin-top:22px;font-size:11pt;text-decoration:underline">신청자 성명: &nbsp;&nbsp;<b>{m['name']}</b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {sign('(서명, 날인)')}</p>

<div class="pb"></div>
<div class="f3">
<h1>저작재산권 양도 및 상품화 활용 동의서</h1>
<h3>1. 출품작 저작재산권 양도에 권한 사항</h3>
<p>하기 서명인(이하 “본인”)은 현대모비스 &lt;창립 50주년 굿즈 아이디어 공모전&gt;에 제출한 출품작의 활용 및 상품화를 위하여 본인 출품작에 대한 저작재산권을 아래와 같이 현대모비스에 양도함에 동의합니다.</p>
<p>□ 양도 대상: 현대모비스 &lt;창립 50주년 굿즈 아이디어 공모전&gt;에 제출한 출품작 일체</p>
<p>□ 양도 범위: 출품작에 대한 복제권, 배포권, 전시권, 공중송신권 및 2차적저작물작성권 등 상품화와 홍보에 필요한 저작재산권</p>
<p>□ 양도 목적: 현대모비스 창립 50주년 기념 굿즈 제작, 브랜드 홍보 및 관련 콘텐츠 활용</p>
<p>□ 양도 기간: 별도의 기간 제한 없음</p>
<h3>2. 굿즈 제작 및 상품화 활용에 권한 사항</h3>
<p>현대모비스는 제출된 아이디어를 바탕으로 실제 굿즈를 제작하거나 브랜드 및 행사 운영 목적에 맞게 활용할 수 있습니다.</p>
<p>□ 활용 목적: 현대모비스 창립 50주년 기념 굿즈 제작 및 브랜드 홍보</p>
<p>□ 활용 내용: 제품 제작, 전시, 배포, 증정, 행사 활용, 온라인·오프라인 홍보 콘텐츠 제작 등</p>
<p>□ 활용 매체: 모비스라이브, 현대모비스 공식 홈페이지 및 블로그, SNS 채널, 오프라인 행사 및 홍보물 등</p>
<p>□ 활용 범위: 출품작의 전체 또는 일부를 활용한 굿즈 제작 및 콘텐츠 제작</p>
<p>※ 실제 제작 과정에서 제품 규격, 소재, 색상, 문구, 형태 등은 제작 환경 및 활용 목적에 따라 일부 수정·보완될 수 있습니다.</p>
<h3>3. 출품작 수정ㆍ가공 및 2차 활용에 관한 사항</h3>
<p>현대모비스는 굿즈 제작과 홍보 콘텐츠 활용을 위해 출품작을 필요한 범위 내에서 수정·편집·가공할 수 있습니다.</p>
<p>□ 가공 범위: 디자인 수정, 색상 변경, 크기 조정, 문구 편집, 구성 변경 등</p>
<p>□ 활용 범위: 굿즈 제작 및 홍보를 위한 이미지·영상·인쇄물·디지털 콘텐츠 제작</p>
<p>□ 활용 매체: 현대모비스 공식 온라인 채널 및 오프라인 홍보 매체 전반</p>
<p>□ 별도 사용료: 없음</p>
<p>※ 귀하는 상기 사항에 대하여 각각 동의를 거부할 수 있으며, 다만 어느 하나라도 동의하지 않는 경우 현대모비스 &lt;창립 50주년 굿즈 아이디어 공모전&gt;에 참여할 수 없음을 알려드립니다.</p>
<h3>4. 초상권 사용 및 지식재산권 사용·가공에 관한 동의/미동의 자필 서명란</h3>
<table class="t"><tr><th>1. 저작재산권 양도</th><th>2. 굿즈 제작·상품화 활용</th><th>3. 출품작 수정·가공 및 2차 활용</th></tr>
<tr><td>■ 동의 □ 미동의</td><td>■ 동의 □ 미동의</td><td>■ 동의 □ 미동의</td></tr></table>
<p class="c" style="margin-top:30px">{m['y']}년 &nbsp;&nbsp;&nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;&nbsp;&nbsp;{m['d']}일</p>
<p style="text-align:right;margin-top:26px;font-size:11pt">성명 &nbsp;&nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {sign('(서명 또는 인)')}</p>
</div>
</body></html>"""


def idea_html():
    I = {k: uri(f"final/{k}.jpg") for k in ("01_hero", "02_open", "03_plate", "04_stack")}
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>굿즈 설명 및 아이디어 스토리</title><style>{BASE_CSS}
:root {{ --n:#14284b; --nl:#eef1f6; --a:#b0772f; }}
@page {{ margin:12mm 14mm; }}
body {{ font-size:9.7pt; }}
.k {{ font-size:9pt; color:#555; letter-spacing:.5px; }}
h1 {{ font-size:21pt; margin:2px 0 4px; color:var(--n); line-height:1.3; letter-spacing:-.5px; }}
.lead {{ font-size:11.5pt; color:#222; margin:0 0 8px; }}
h2 {{ font-size:12pt; color:var(--n); border-bottom:1.6px solid var(--n); padding-bottom:2px; margin:13px 0 6px; }}
img.full {{ width:100%; display:block; border-radius:3px; }}
.cap {{ font-size:8.4pt; color:#666; margin:3px 0 0; }}
.tl {{ display:flex; gap:0; margin:6px 0 2px; }}
.tl div {{ flex:1; border-top:3px solid var(--n); padding:5px 8px 0 0; font-size:9pt; }}
.tl b {{ display:block; font-size:12pt; color:var(--n); }}
.tl .now {{ border-top-color:var(--a); }} .tl .now b {{ color:var(--a); }}
.two {{ display:flex; gap:12px; }} .two > div {{ flex:1; }}
.feat td {{ padding:5px 7px; border-bottom:1px solid #dde2ea; vertical-align:top; font-size:9.4pt; }}
.feat td:first-child {{ width:25%; font-weight:700; color:var(--n); }}
.spec td {{ border:1px solid #cfd6e1; padding:4px 7px; font-size:9.2pt; }}
.spec td:first-child {{ width:22%; background:var(--nl); font-weight:700; }}
.q {{ border-left:3px solid var(--a); padding:4px 10px; background:#faf6f0; margin:6px 0; }}
.src {{ font-size:8pt; color:#555; line-height:1.45; }}
ul {{ margin:3px 0 3px 17px; padding:0; }} li {{ margin:2px 0; }}
.sw5 span {{ display:inline-block; width:12px; height:12px; border-radius:2px; vertical-align:-1px; margin-right:3px; }}
</style></head><body>
<div class="k">현대모비스 창립 50주년 굿즈 아이디어 공모전 · 굿즈 설명 및 아이디어 스토리 · 박용진</div>
<h1>1977 컨테이너<br><span style="font-size:15pt">— 50년을 담는 데스크 박스</span></h1>
<p class="lead">현대모비스의 첫 ‘세계 1위’는 자동차 부품이 아니라 <b>컨테이너</b>였습니다. 그 컨테이너를 책상 위로 되돌려 놓습니다.</p>
<img class="full" src="{I['01_hero']}">
<p class="cap">이미지 1. 1:40 축척 20피트 컨테이너 데스크 박스(닫힌 모습). 오른쪽 문의 명판에 기념 문구를 새깁니다. ※ 제품 이미지는 생성형 AI로 만든 시안이며, 명판 문구는 따로 합성했습니다.</p>

<h2>1. 기획 배경 — 왜 ‘차 모양’이 아니라 ‘상자’인가</h2>
<div class="tl">
<div><b>1977</b>울산 매암동 야산에서 휠·머플러·범퍼·<b style="display:inline;font-size:9pt">컨테이너</b> 생산으로 출발</div>
<div><b>1980</b>창립 4년 만에 세계 1위 컨테이너 제조업체</div>
<div><b>2000</b>현대모비스로 사명 변경, 자동차 모듈·서비스부품 중심으로</div>
<div class="now"><b>2027</b>창립 50주년 — 전동화·전장·로보틱스로</div>
</div>
<p style="margin-top:6px">50주년 굿즈로 가장 먼저 떠오르는 것은 로고 텀블러나 미니카입니다. 하지만 현대모비스는 <b>차를 만드는 회사가 아니라, 차 안에 들어가는 것을 만들어 보내는 회사</b>입니다. 그래서 차 모양 대신, 현대모비스가 가장 처음 세계 1위에 올려놓은 물건을 골랐습니다.</p>
<div class="q">1977년의 컨테이너는 한국의 수출품을 담아 바다를 건넜고, 오늘의 모듈은 수많은 부품을 한 덩어리로 묶어 자동차 공장으로 갑니다. 현대모비스의 50년은 언제나 <b>‘잘 담아서, 제때 보내는 일’</b>이었습니다. 이 굿즈는 그 50년의 시작점을 손에 쥘 수 있는 크기로 만든 것입니다.</div>
<p>입사한 지 얼마 안 된 직원도, 오래 함께한 협력사도 “우리 회사가 컨테이너로 시작했다고?” 하고 한 번 더 들여다보게 되는 이야기 — 그 놀라움이 이 굿즈의 출발점입니다.</p>

<div class="pb"></div>
<h2>2. 주요 특징 — 실제 컨테이너의 구조를 그대로</h2>
<div class="two">
<div><img class="full" src="{I['03_plate']}"><p class="cap">이미지 2. 문 쪽 정면. 잠금봉 4개와 기념 명판(예시 각인: MOBIS 50 · 1977—2027 · 일련번호. 이름·입사연도로 바꿔 새길 수 있음).</p></div>
<div><img class="full" src="{I['02_open']}"><p class="cap">이미지 3. 문을 연 모습. 합판 바닥에 명함·펜·클립 수납.</p></div>
</div>
<table class="feat" style="margin-top:6px">
<tr><td>① 1:40 실측 축척</td><td>표준 20피트 컨테이너(외부 약 6,058×2,438×2,591mm)를 1:40으로 줄여 <b>약 151×61×65mm</b>. 주름진 측벽, 네 귀의 코너 캐스팅, 상·하부 레일까지 실제 구조를 따릅니다.</td></tr>
<tr><td>② 진짜로 잠기는 문</td><td>양쪽 문의 세로 잠금봉 4개가 손잡이를 돌리면 위아래 캠에 걸려 잠깁니다. 열고 닫을 때의 ‘딸깍’ 손맛이 이 굿즈를 장식품이 아니라 매일 쓰는 물건으로 만듭니다.</td></tr>
<tr><td>③ 나만의 명판</td><td>실제 컨테이너 문에 붙는 금속 명판 자리에 <b>‘MOBIS 50 · 1977–2027’</b>과 받는 사람의 <b>이름·입사연도</b>를 레이저로 새깁니다. 같은 박스라도 한 사람에게 하나뿐인 물건이 됩니다.</td></tr>
<tr><td>④ 합판 바닥</td><td>실제 컨테이너처럼 바닥에 얇은 합판을 깔아, 펜·명함·클립이 미끄러지지 않고 쇠 소리도 나지 않습니다.</td></tr>
<tr><td>⑤ 쌓는 코너</td><td>코너 캐스팅 안에 작은 자석을 넣어, 항구의 컨테이너처럼 위아래로 맞물려 쌓입니다(다음 쪽).</td></tr>
</table>

<div class="pb"></div>
<h2>3. 다섯 색 = 다섯 번의 10년</h2>
<img class="full" src="{I['04_stack']}">
<p class="cap">이미지 4. 다섯 색 박스를 쌓은 모습.</p>
<p style="margin-top:5px" class="sw5">같은 금형에 도장 색만 바꿔 다섯 가지로 만들고, 각 색에 10년씩을 맡깁니다:
<span style="background:#1d2f55"></span>1977–86 &nbsp;<span style="background:#e9e4d8;border:1px solid #bbb"></span>1987–96 &nbsp;<span style="background:#b9b6ae"></span>1997–2006 &nbsp;<span style="background:#3f6f78"></span>2007–16 &nbsp;<span style="background:#3a3d42"></span>2017–27.
명판에는 그 10년의 대표 사건(예: 1980 세계 1위 컨테이너, 2000 현대모비스 출범)을 한 줄 새깁니다. <b>한 개는 개인의 기념품, 다섯 개를 쌓으면 회사의 50년</b>이 됩니다.</p>

<h2>4. 활용 방법</h2>
<ul>
<li><b>임직원 50주년 기념품</b> — 명판에 이름과 입사연도. 책상 위 명함·펜·이어폰 보관함으로 매일 씁니다. 입사연도가 속한 10년의 색을 고르게 하면 ‘나의 모비스 시대’가 됩니다.</li>
<li><b>협력사·고객 감사 선물</b> — 명판에 ‘MOBIS 50 · 1977–2027’과 함께한 해. 다섯 색 세트는 VIP용 한정판.</li>
<li><b>본사 로비·공장 견학 전시</b> — 50개를 항구처럼 쌓은 ‘50년 컨테이너 벽’. 박스 하나마다 그 해의 일을 새긴 명판을 달아, 걸으며 연혁을 읽는 전시물로 씁니다.</li>
<li><b>신입사원 입사 키트</b> — 박스를 열면 사원증·명함·회사 연혁 카드. ‘우리 회사의 첫 물건’ 이야기로 시작하는 첫날.</li>
</ul>

<div class="pb"></div>
<h2>5. 제작 사양 (가늠)</h2>
<table class="spec">
<tr><td>크기·무게</td><td>약 151 × 61 × 65mm (20피트 컨테이너 1:40) · 약 250~300g (추정)</td></tr>
<tr><td>몸체</td><td>0.6mm 냉연강판 프레스 성형(주름 측벽) + 분체도장 무광 마감 / 또는 아연 다이캐스트</td></tr>
<tr><td>문·잠금봉</td><td>강판 문 2장 + 스테인리스 잠금봉 4개, 핀 경첩</td></tr>
<tr><td>코너·바닥</td><td>아연 다이캐스트 코너 캐스팅 8개(상부 4개에 네오디뮴 자석) · 3mm 자작합판 바닥</td></tr>
<tr><td>명판</td><td>헤어라인 알루미늄 18×11mm, 리벳 4개, 개인별 레이저 각인</td></tr>
<tr><td>포장</td><td>골판지 슬리브(화물 상자 느낌의 크라프트지) + 연혁 카드 1장</td></tr>
<tr><td>단가 가늠</td><td>1,000개 기준 개당 1만 5천~2만 5천 원 내외로 추정(금형비 별도, 개인 각인 시 추가). <b>견적을 받은 금액이 아니며 제작사 견적으로 확인 필요</b></td></tr>
</table>

<h2>6. 현대모비스와의 연관성</h2>
<ul>
<li><b>헤리티지:</b> 1977년 출발 제품이자 1980년 세계 1위를 만든 컨테이너를 그대로 옮겨, 50년 역사의 첫 장을 물건으로 보여줍니다.</li>
<li><b>정체성:</b> 컨테이너(1977) → 모듈(2000~) → 전동화·전장(2027)으로 이어지는 ‘잘 담아 제때 보내는 회사’의 이야기를 한 물건에 담습니다.</li>
<li><b>제조 회사다운 굿즈:</b> 주름 강판·코너 캐스팅·잠금봉처럼 실제 산업 부품의 구조를 정확히 재현해, 기술 회사의 기념품다운 만듦새를 보여줍니다.</li>
</ul>

<p class="src" style="margin-top:12px"><b>근거 자료</b><br>
· 헤럴드경제, 「車부품 넘어 전장·반도체·로보틱스까지…미래 모빌리티 선도 [그 회사 어때?-현대모비스]」, 2025.11.4. — “1977년 설립한 ‘고려정공’”, “컨테이너 제조 분야에 진출, 4년 만인 1980년 세계 1위 컨테이너 제조 업체로 성장”, “2000년에 현대모비스로 사명을 변경하며 자동차 모듈과 서비스부품…” (heraldk.com/article/2025110418401437172)<br>
· 시사경제신문(sateconomy), 「현대모비스 창립 30주년」, 2007.6.29. — “지난 77년 울산 매암동 야산에서 휠, 머플러, 범퍼, 컨테이너 등을 생산하던”, 사사에 “컨테이너 생산 세계 1위” 수록 (sateconomy.co.kr/news/view/179590106327948)<br>
· 20피트 ISO 컨테이너 외부 치수(6,058×2,438×2,591mm)는 ISO 668 표준 규격.<br>
※ 제품 이미지는 생성형 AI(ChatGPT 이미지 생성)로 만든 시안이며, 실제 상표·로고는 사용하지 않았습니다. 명판 문구는 이미지 생성 뒤 직접 합성했습니다.</p>
</body></html>"""


def pdf(html, name):
    src = B / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = HERE / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={B / 'prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    import sys
    if "forms" in sys.argv or len(sys.argv) == 1:
        pdf(forms_html(), "필수제출서류3종_참가신청서·위탁동의서·상품화활용동의서_박용진")
    if "idea" in sys.argv or len(sys.argv) == 1:
        pdf(idea_html(), "굿즈설명_1977컨테이너_데스크박스_박용진")
