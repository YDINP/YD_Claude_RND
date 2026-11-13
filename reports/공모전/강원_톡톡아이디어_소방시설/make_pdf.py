"""[붙임1] 제안 신청서·[붙임2] 개인정보 수집 동의서 PDF (원본 서식 문구 그대로 재현, Chrome headless).
실행: python -I make_pdf.py
"""
import base64, html, re, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import ME, TITLE, BG, MAIN, EFFECT  # noqa: E402

BUILD = HERE / "_build"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()

CSS = """
@page { size:A4; margin:15mm 16mm 14mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; color:#000; margin:0; font-size:10.5pt; line-height:1.6; }
.tag { font-weight:700; font-size:13pt; margin:0 0 6px; }
table.f { width:100%; border-collapse:collapse; table-layout:fixed; }
table.f td { border:1px solid #000; padding:6px 8px; vertical-align:middle; }
table.f tr:first-child td { border-top:2px solid #000; }
.ttl { text-align:center; font-size:17pt; font-weight:700; padding:14px 0 !important; }
.lab { background:#e6e6e6; font-weight:700; text-align:center; font-size:11pt; }
.sub { text-align:center; font-size:10.5pt; }
.c { text-align:center; }
.big { vertical-align:top !important; padding:7px 9px !important; font-size:10pt; line-height:1.5; }
.big p { margin:0; text-align:justify; }
.big p.h { font-weight:700; margin-top:5px; }
.big p.h:first-child { margin-top:0; }
.big p.b { padding-left:1.1em; text-indent:-1.1em; margin-top:2px; }
.big p.s { font-size:8.6pt; color:#333; line-height:1.45; margin-top:8px; padding-left:0; text-indent:0; word-break:break-all; }
/* 동의서 */
.cbox { border:1px solid #000; }
.chead { text-align:center; font-size:18pt; font-weight:700; letter-spacing:6px; padding:12px 0; border-bottom:1px solid #000; border-top:2px solid #000; }
.cbody { padding:14px 18px 22px; font-size:11pt; line-height:1.75; }
.cbody p { margin:0; }
.cbody .gap { height:12px; }
.cbody .q { font-weight:700; }
.cbody .ttl2 { text-align:center; font-weight:700; margin-top:6px; }
.date { text-align:center; font-size:13pt; margin:28px 0 18px; letter-spacing:1px; }
.signline { text-align:right; font-size:13pt; margin-right:30px; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:46px; transform:translateY(-50%); }
"""


def rich(t):
    t = html.escape(t)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


def block(items):
    return "".join(f'<p class="{k}">{rich(t)}</p>' for k, t in items)


def app_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제안 신청서</title><style>{CSS}</style></head><body>
<div class="tag">[붙임1]</div>
<table class="f">
<colgroup><col style="width:13.5%"><col style="width:14.6%"><col style="width:29.3%"><col style="width:12.8%"><col style="width:29.8%"></colgroup>
<tr><td colspan="5" class="ttl">2026년 ｢톡톡 Idea 공모전｣ 제안 신청서</td></tr>
<tr><td class="lab">제안제목</td><td colspan="4" style="font-weight:700;font-size:11pt">{rich(TITLE)}</td></tr>
<tr><td class="lab" rowspan="2">제안자</td><td class="sub">성명</td><td class="c">{m['name']}</td><td class="sub">생년월일</td><td class="c">{m['birth']}</td></tr>
<tr><td class="sub">휴대전화<br>번호</td><td class="c">{m['phone']}</td><td class="sub">전자우편<br>주소</td><td class="c">{m['email']}</td></tr>
<tr><td class="lab" rowspan="2">공동<br>제안자<br><span style="font-weight:400;font-size:9pt">(해당사항 있을 시 작성)</span></td><td class="sub">성명</td><td></td><td class="sub">생년월일</td><td></td></tr>
<tr><td class="sub">휴대전화<br>번호</td><td></td><td class="sub">전자우편<br>주소</td><td></td></tr>
<tr><td class="lab">제안배경</td><td colspan="4" class="big">{block(BG)}</td></tr>
<tr><td class="lab">주요내용</td><td colspan="4" class="big">{block(MAIN)}</td></tr>
<tr><td class="lab">기대효과</td><td colspan="4" class="big">{block(EFFECT)}</td></tr>
</table></body></html>"""


def consent_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보 수집 동의서</title><style>{CSS}</style></head><body>
<div class="tag">[붙임2]</div>
<div class="cbox"><div class="chead">개 인 정 보 수 집 동 의 서</div>
<div class="cbody">
<p>·｢개인정보 보호법｣ 제15조(개인정보의 수집·이용)에 의거하여 개인정보처리자는 개인정보를 수집할 수 있으며, 그 수집 목적의 범위에서 이용할 수 있습니다.</p>
<p>· 개인정보처리자는 개인정보 수집 시 아래 사항을 정보주체에게 알려야 하며, 정보주체의 동의를 받아야 합니다.</p>
<div class="gap"></div>
<p>□ 개인정보 수집･이용 목적</p><p>&nbsp;- 강원특별자치도 2026년 ｢톡톡 Idea 공모전｣ 운영 및 심사결과 통보</p>
<div class="gap"></div>
<p>□ 수집항목</p><p>&nbsp;- 성명, 전화번호, 전자우편, 생년월일 등 제안자 개인정보</p>
<div class="gap"></div>
<p>□ 개인정보의 보유 및 이용기간</p><p>&nbsp;- 보유기간 : 2년</p><p>&nbsp;- 보존사유 : 채택제안에 대한 정책추진 시, 자문요청 등 연락 필요</p>
<div class="gap"></div><div class="gap"></div>
<p class="ttl2">&lt;개인정보 수집․이용․제공 동의&gt;</p>
<div class="gap"></div>
<p class="q">· 개인정보의 수집 및 이용에 동의하십니까? &nbsp;&nbsp; ■ 동의함 &nbsp;□ 동의하지 않음</p>
<div class="gap"></div>
<p class="ttl2">&lt;개인정보 거부권 및 거부 시 불이익&gt;</p>
<div class="gap"></div>
<p>&nbsp;제안자는 수집․이용․제공과 관련하여 개인정보 동의를 거부할 수 있으며, 동의 거부 시에는 공모자 접수에서 제외됩니다.</p>
<div class="gap"></div>
<p class="q">· 동의거부에 따른 불이익 내용에 동의하십니까? &nbsp;&nbsp; ■ 동의함 &nbsp;□ 동의하지 않음</p>
</div></div>
<div class="date">2026년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일</div>
<div class="signline">동의인 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;<span class="sw">(서명 또는 인)<img class="sig" src="{SIG}"></span></div>
</body></html>"""


def pdf(doc, name):
    src = BUILD / (name + ".html")
    src.write_text(doc, encoding="utf-8")
    out = HERE / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={BUILD / 'chrome_prof'}", f"--print-to-pdf={out}", src.as_uri()],
                   capture_output=True, timeout=120)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    BUILD.mkdir(exist_ok=True)
    pdf(app_html(), "[붙임1] 제안신청서_박용진")
    pdf(consent_html(), "[붙임2] 개인정보수집동의서_박용진")
