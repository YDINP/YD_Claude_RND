"""2026 뇌전증 인식개선 공모전 — 참가 신청서 + 저작물 이용허락·개인정보 동의서 (원본 hwp 문구 재현, 서명 PDF).
실행: python build/make_forms.py
"""
import base64, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "제출"
OUT.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호", y="2026", m="11", d="4")
TITLE = "붙잡지 말고, 재세요"
DESC = [
    "뇌전증 발작을 처음 본 사람은 ‘뭐라도 해야 한다’는 마음에 몸을 붙잡거나, 입에 무언가를 넣거나, 쓰러진 사람에게 배운 대로 가슴을 누르기도 합니다. "
    "도우려는 선의가 오히려 2차 피해가 되는 순간입니다.",
    "이 포스터는 ‘하지 마세요’ 목록을 늘어놓는 대신, 도와주고 싶은 손에 할 일 하나를 쥐여 줍니다. 바로 <b>시간을 재는 것</b>입니다. "
    "발작은 대개 몇 분 안에 저절로 멈추고, 5분이 넘으면 119에 신고해야 하므로 시간은 목격자가 줄 수 있는 가장 정확한 도움입니다. "
    "휴대폰 스톱워치를 누르는 손은 환자를 붙잡지 않습니다. 재는 동안 주변의 위험한 물건을 치우고 머리 밑에 겉옷을 받쳐 주며, 멈춘 뒤 의식이 없으면 옆으로 눕힙니다.",
    "응급처치 내용은 한국뇌전증협회·행정안전부 「뇌전증 발작 응급 수칙」(함께·안전하게·옆으로, 5분 이상 시 119, 하지 마세요)에 맞췄습니다. "
    "지하철역·버스정류장·학교 게시판에 붙여, 지나가며 한 번 본 사람도 ‘붙잡지 말고, 재세요’ 한 문장만은 기억하도록 만들었습니다.",
    "<b>[AI 도구 활용]</b> 배경 일러스트: ChatGPT 이미지 생성(OpenAI gpt-image, Codex CLI 내장 이미지 생성 도구) · "
    "자료조사·문구 초안: Claude(Anthropic) · 한글 문구는 이미지 생성 후 Python(Pillow)으로 별도 합성 · 최종 문구·구성 판단은 응모자 본인.",
]

CSS = """
@page { size:A4; margin:16mm 17mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.55; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:2px; top:50%; height:46px; transform:translateY(-50%); }
h1 { text-align:center; font-size:17pt; margin:4px 0 14px; letter-spacing:.5px; }
.f td, .f th { border:1px solid #000; padding:7px 9px; vertical-align:middle; }
.f th { background:#eee; font-weight:700; text-align:center; }
.note { font-size:9pt; color:#333; }
.box { border:1px solid #000; padding:9px 13px; margin:12px 0 6px; font-size:9.4pt; }
.box .h { text-align:center; font-weight:700; font-size:10.5pt; margin-bottom:4px; }
.box p { margin:2px 0; }
.date { text-align:center; margin:12px 0 6px; font-size:11pt; letter-spacing:1px; }
.signline { text-align:right; margin-right:30px; font-size:11pt; }
.to { text-align:center; font-size:13pt; font-weight:700; margin-top:14px; }
.desc p { margin:0 0 6px; text-align:justify; font-size:9.3pt; line-height:1.55; }
h2 { text-align:center; font-size:15pt; margin:0 0 10px; }
h3 { font-size:11pt; margin:12px 0 4px; text-align:center; }
.agree { text-align:center; font-size:10.5pt; margin:6px 0; }
"""


def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def date():
    return f'<div class="date">{ME["y"]}. &nbsp;{ME["m"]}. &nbsp;{ME["d"]}.</div>'


def html():
    m = ME
    desc = "".join(f"<p>{p}</p>" for p in DESC)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>신청서</title><style>{CSS}</style></head><body>
<h1>2026 뇌전증 인식개선 공모전 참가 신청서</h1>
<table class="f">
<tr><th rowspan="2" style="width:14%">신청인</th><th style="width:11%">성함</th><td style="width:24%">{m['name']}</td><th style="width:11%">연락처</th><td>{m['phone']}</td></tr>
<tr><th>이메일</th><td>{m['email']}</td><th>주소</th><td>{m['addr']}</td></tr>
<tr><th>응모 분야</th><td colspan="4">&nbsp;□ 글 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ■ 그림 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 기타</td></tr>
<tr><th>작품제목</th><td colspan="4"><b>{TITLE}</b> (포스터)</td></tr>
<tr><th>작품설명</th><td colspan="4" style="vertical-align:top">
<div class="note">* 제출 시 신청서와 함께 작품 원본 파일을 이메일( epilepsy-kr@daum.net )로 보내주시기 바랍니다.<br>* 작품의 의도 또는 의미 등 작성</div>
<div class="desc" style="margin-top:6px">{desc}</div></td></tr>
</table>
<div class="box"><div class="h">공모전 참가 신청서 제출 전 확인 사항</div>
<p>○ 다른 공모전에 제출한 응모작과 동일하거나 유사한 응모작인 경우, 심사에서 제외되고, 시상 이후라도 수상작 선정을 취소할 수 있습니다.</p>
<p>○ 출품작에 타인의 명예를 훼손하는 내용, 초상권 등 타인의 권리를 침해하는 내용, 타인의 작품을 표절한 내용 등이 있는 경우, 심사에서 제외되고, 시상 이후라도 수상작 선정을 취소할 수 있습니다.</p>
<p>○ 수상 후 창작이 아닌 모방 혹은 표절 등으로 밝혀진 경우 수상은 취소되며, 상금은 반납하겠습니다.</p>
<p>○ 제출작과 관련한 문제가 발생할 경우 일체의 법적·도의적 책임은 본인에게 있음을 확인합니다.</p>
<p style="text-align:center;margin-top:6px">위 사항을 모두 확인하고 동의하였으며,<br>한국뇌전증협회 [2026 뇌전증 인식개선 공모전]에 위와 같이 출품합니다.</p>
</div>
{date()}
<div class="signline">참가자 : <b>{m['name']}</b> &nbsp;&nbsp;{sign()}</div>
<div class="to">한국뇌전증협회 귀하</div>

<div class="pb"></div>
<h2>저작물 이용허락· 개인정보수집이용제공 동의서</h2>
<p>｢개인정보보호법｣, ｢저작권법｣에 따라 뇌전증 인식개선 공모전 참여 시 아래와 같이 개인정보 수집 및 이용에 대한 동의, 저작물 이용 허락에 대한 동의를 받고자 합니다. 아래 사항을 충분히 읽은 후, 각 항목에 동의 여부를 표시하고 서명하여 주시기 바랍니다.</p>
<p class="note">* 팀 제출 시 팀원 모두 작성하여 제출<br>* 만 14세 미만의 경우 법정대리인의 서명이 필요합니다.</p>
<div class="box"><div class="h">저작물 이용허락 동의서</div>
<p>○ 이용 방법: 한국뇌전증협회 홈페이지, SNS 등에 게시되고, 뇌전증 인식개선 행사 시 상영, 전시, 인쇄 될 수 있으며, 일부 내용을 수정하거나 변형하여 사용할 수 있음</p>
<p>&nbsp;&nbsp;- 조건의 범위: 한국뇌전증협회에서 공익 목적으로만 활용</p>
<p>&nbsp;&nbsp;- 제3자에게 양도: 저작재산권자의 동의 없이 이를 양도할 수 없음</p>
<p>○ 동의를 거부할 권리 및 미동의 시 불이익</p>
<p>&nbsp;&nbsp;&nbsp;저작물 이용 허락에 대한 동의를 거부할 수 있으며, 이 경우 공모전 접수가 제한될 수 있습니다.</p>
<div class="agree">■ 동의함 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 동의하지 않음</div>
</div>
{date()}
<div class="signline">참가자 : <b>{m['name']}</b> &nbsp;&nbsp;{sign()}</div>
<div class="box"><div class="h">개인정보 수집 및 이용동의서</div>
<p>○ 수집 이용 목적: 공모전 참가자 본인확인 및 심사진행, 참여 현황 파악 등</p>
<p>○ 개인정보의 항목</p>
<p>&nbsp;&nbsp;&nbsp;필수항목 : 성명, 연락처, 이메일, 주소 등 개인 식별 정보</p>
<p>○ 개인정보의 처리 및 보유기간</p>
<p>&nbsp;&nbsp;&nbsp;- 위의 개인정보는 공모전 결과 발표일로부터 3년 까지 보유ㆍ이용 합니다. 다만, 수상자의 경우 입상자 선정 후 5년 까지 보유ㆍ이용 합니다.</p>
<p>○ 동의를 거부할 권리 및 미동의 시 불이익</p>
<p>&nbsp;&nbsp;- 개인정보 수집에 동의를 거부할 수 있으며, 필수항목을 입력하지 않으시는 경우 공모전 접수가 불가하며, 공모전 관련 일체의 안내와 연락을 받으실 수 없습니다.</p>
<div class="agree">■ 동의함 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 동의하지 않음</div>
</div>
{date()}
<div class="signline">참가자 : <b>{m['name']}</b> &nbsp;&nbsp;{sign()}</div>
<h3>[법정대리인 동의서]</h3>
<p style="text-align:center;margin:0 0 4px">본인은 미성년자의 법정대리인으로 위의 정보제공 및 수집·이용에 동의합니다.</p>
<table class="f">
<tr><th style="width:26%">법정대리인 성 명</th><td style="color:#777">해당 없음 (성인 참가자) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</td></tr>
<tr><th>법정대리인 연락처</th><td></td></tr>
<tr><th>법정대리인과의 관계</th><td></td></tr>
</table>
<div class="to">한국뇌전증협회 귀하</div>
</body></html>"""


def main():
    name = f"박용진_그림_{TITLE.replace(', ', '').replace(' ', '')}_신청서"
    h = ROOT / "build" / "forms.html"
    h.write_text(html(), encoding="utf-8")
    pdf = OUT / f"{name}.pdf"
    with tempfile.TemporaryDirectory() as ud:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={ud}", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", h.as_uri()], check=True, capture_output=True, timeout=120)
    print(pdf)


if __name__ == "__main__":
    main()
