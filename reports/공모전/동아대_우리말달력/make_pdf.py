"""동아대 국어문화원 「아름다운 우리말 달력 만들기 공모전」 신청서(+개인정보 동의서) PDF — 원본 서식 문구 그대로."""
import base64, subprocess, tempfile, time
from pathlib import Path

HERE = Path(__file__).parent
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호", m="11", d="4")
TITLE = "떡비 — 가을비는 떡 먹는 비"
DESC = [
    "‘떡비’는 “떡이나 먹을 수 있게 하는 비라는 뜻으로, 가을비를 이르는 말”(표준국어대사전)입니다. 흔히 가을비는 쓸쓸하다고 하지만, "
    "옛사람들은 가을걷이를 마친 뒤 내리는 비를 떡 해 먹으며 쉬어 가라는 반가운 비로 여겼습니다. 여름비를 ‘잠비’(여름에 일을 쉬고 낮잠을 잘 수 있게 하는 비)라 부른 것과 짝을 이루는 말입니다.",
    "그림은 추수를 끝낸 11월 들녘에 찬비가 내리는 날, 할머니와 아이가 마루 안쪽에서 김이 오르는 팥시루떡을 가운데 두고 앉은 모습입니다. "
    "바깥의 차가운 잿빛 비와 방 안의 따뜻한 불빛·떡을 마주 놓아 낱말의 뜻이 그림 한 장으로 읽히도록 했고, 처마 끝 낙숫물, 그루터기만 남은 논과 볏가리, "
    "까치밥으로 남긴 감 몇 알로 늦가을을 나타냈습니다. 낱말·발음·뜻풀이는 그림 왼쪽 하늘에 넣었습니다.",
    "11월 달력을 넘기는 분들이 찬비 오는 날을 ‘떡비 오는 날’이라고 한 번 불러 보시면 좋겠습니다.",
    "※ 작품 파일: 11월_떡비_박용진.jpg (3000×1875픽셀, 300dpi 기준 254×159mm, JPG)",
]

CSS = """
@page { size:A4; margin:16mm 14mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#000; margin:0; line-height:1.5; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-14px; top:50%; height:46px; transform:translateY(-50%); }
.sub { text-align:center; font-size:9.5pt; margin:6px 0 0; }
h1 { text-align:center; font-size:19pt; margin:0 0 14px; letter-spacing:-0.5px; }
.f td { border:1px solid #000; padding:6px 8px; vertical-align:middle; }
.f .h { background:#fbecd2; font-weight:700; text-align:center; width:10.5%; font-size:11pt; }
.hint { font-size:8.3pt; background:#fbecd2; padding:1px 4px !important; }
.desc p { margin:0 0 6px; text-indent:0; font-size:9.6pt; line-height:1.6; }
.foot { margin:26px 0 0 auto; width:300px; font-size:11pt; font-weight:700; line-height:2.1; }
.foot span.k { display:inline-block; width:80px; }
.org { text-align:center; font-size:20pt; font-weight:700; margin-top:46px; }
/* 동의서 */
h2 { text-align:center; font-size:22pt; margin:20px 0 22px; letter-spacing:1px; }
.lead { border:1px solid #000; background:#eee; padding:12px 16px; font-weight:700; font-size:10.5pt; line-height:1.8; margin-bottom:30px; }
.c td { border:1px solid #000; padding:12px 12px; font-size:9.8pt; vertical-align:middle; }
.c .k { width:21%; text-align:center; }
.ck { text-align:center; font-weight:700; margin:2px 0 6px; }
"""


def sign(label="(인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def html():
    m = ME
    desc = "".join(f"<p>{p}</p>" for p in DESC)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>신청서</title><style>{CSS}</style></head><body>
<div class="sub">580돌 한글날 기념</div>
<h1>‘아름다운 우리말 달력 만들기 공모전’ 신청서</h1>
<table class="f">
<colgroup><col style="width:10.5%"><col style="width:9%"><col style="width:27%"><col style="width:11%"><col></colgroup>
<tr style="height:62px"><td class="h">제 목</td><td colspan="2"><b>{TITLE}</b></td><td class="h" style="font-size:10pt">작품 속에<br>표현한 달</td>
  <td style="vertical-align:top;text-align:center"><span style="font-size:9pt">(1월~12월 중 택 1)</span><br><b style="font-size:13pt">11월</b></td></tr>
<tr><td class="h" rowspan="2">참 가<br>단 위</td><td colspan="2" class="hint">(예: 개인 또는 팀)</td><td class="h" rowspan="2">소 속</td><td rowspan="2">회사원 (개인 참가)</td></tr>
<tr style="height:44px"><td colspan="2">개인</td></tr>
<tr><td class="h" rowspan="2">성 명</td><td colspan="4" class="hint">팀일 경우, 팀명과 팀 구성원들의 성명을 모두 기재해야 함 (예: 팀명-국어사랑/팀원-홍길동, 이순신, 최영)</td></tr>
<tr style="height:50px"><td colspan="4">{m['name']}</td></tr>
<tr style="height:62px"><td class="h">주 소</td><td colspan="4">{m['addr']}</td></tr>
<tr style="height:52px"><td class="h">연락처</td><td style="text-align:center;font-weight:700;background:#fbecd2">휴대폰</td><td>{m['phone']}</td>
  <td class="h" style="font-size:10.5pt">이메일</td><td>{m['email']}</td></tr>
<tr><td class="h">작 품<br>설 명</td><td colspan="4" class="desc" style="vertical-align:top;padding:10px 12px">{desc}</td></tr>
</table>
<div class="foot"><span class="k">지원일자</span>2026년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일<br>
<span class="k">신 청 자</span>{m['name']} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{sign()}</div>
<div class="org">동아대학교 국어문화원</div>

<div class="pb"></div>
<h2>개인정보 수집 · 이용 동의서</h2>
<div class="lead">&nbsp;동아대학교 국어문화원 주관 프로그램 참여와 관련하여 본인의 개인정보를 수집·이용하는 경우에는「개인정보보호법」에 따라 본인의 동의를 얻어야 합니다. 이에 본인은 귀 기관이 아래의 내용과 같이 본인의 개인정보를 수집 · 이용하는 것에 동의합니다.</div>
<table class="c">
<tr><td class="k">목적</td><td>▪ 국어문화원 주관 프로그램의 신청 및 운영 · 진행 · 관리</td></tr>
<tr><td class="k">수집 항목</td><td>1. 필수 항목: 성명, 참가 단위, 소속, 휴대폰, 제목, 작품 설명<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(수상 시 주민등록증사본 및 통장사본)<br>2. 선택 항목: 주소, E-Mail</td></tr>
<tr><td class="k">보유 이용 기간</td><td>▪ 위 개인정보는 수집·이용에 관한 동의일로부터 2년 동안 위 이용목적을 위하여 보유·이용됩니다.</td></tr>
<tr><td class="k">동의를 거부할 권리<br>및 동의를 거부할<br>경우의 불이익</td><td>▪ 위 개인정보 중 필수항목의 수집·이용에 관한 동의는 공모전 신청을 위하여 필수적이므로, 위 사항에 동의하셔야만 공모전 응모가 가능합니다. 동의하지 않으실 경우 공모전 신청 및 상금 지급에 제한을 받으실 수 있습니다. 선택 항목 수집·이용에 동의하지 않으실 경우 별다른 불이익은 없습니다.</td></tr>
<tr><td class="k">수집·이용 동의 여부</td><td>▪ 본인은 위와 같이 개인정보 필수항목을 수집·이용하는 것에 동의합니다.<div class="ck">동의함 ■ &nbsp;&nbsp;동의하지 않음 □</div>
▪ 본인은 위와 같이 개인정보 선택항목을 수집·이용하는 것에 동의합니다.<div class="ck">동의함 ■ &nbsp;&nbsp;동의하지 않음 □</div></td></tr>
<tr><td colspan="2" style="text-align:center">위의 내용을 이해하였으며, 위와 같은 개인정보 수집·이용에 동의합니다.</td></tr>
</table>
<table class="c" style="margin-top:-1px"><tr>
<td class="k" style="width:21%">날 짜</td><td style="width:29%;text-align:center">2026. {m['m']}. {m['d']}.</td>
<td class="k" style="width:21%">이 름</td><td style="text-align:center;padding-right:70px">{m['name']} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{sign()}</td></tr></table>
<div class="org" style="margin-top:60px">동아대학교 국어문화원장</div>
</body></html>"""


def pdf(name):
    src = HERE / (name + ".html")
    src.write_text(html(), encoding="utf-8")
    out = HERE / (name + ".pdf")
    with tempfile.TemporaryDirectory() as prof:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--user-data-dir={prof}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
        time.sleep(1)
    src.unlink()
    print(out, out.exists())


pdf("신청서_개인정보동의서_박용진")
