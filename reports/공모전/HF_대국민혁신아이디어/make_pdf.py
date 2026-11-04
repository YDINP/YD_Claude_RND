"""붙임2 제안서·붙임3 동의서 PDF (원본 서식 문구 재현) — HTML → Chrome headless."""
import base64, subprocess, time
from html import escape as e
from pathlib import Path

from content import (ME, TITLE, FIELD, FIELDS, SUMMARY, BACKGROUND, DETAIL, EFFECTS, AI_PLAN,
                     SOURCES, REF_NOTE, AI_NOTE)

HERE = Path(__file__).parent
BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

CSS = """
@page { size:A4; margin:16mm 17mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; color:#111; margin:0; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:50%; top:50%; height:46px; transform:translate(-50%,-50%); }
"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def paras(lines):
    out = []
    for t in lines:
        cls = "h" if t.startswith("■") else ("n" if t[:1] in "①②③④" else "")
        out.append(f'<p class="{cls}">{e(t.lstrip("■ ").strip()) if cls == "h" else e(t)}</p>')
    return "".join(out)


def mock_card():
    rows = ""
    for age in ("85세", "90세", "95세"):
        rows += f"<tr><th>{age}까지</th><td>○억 ○천만 원</td><td>○억 ○천만 원</td><td>○억 ○천만 원</td></tr>"
    return f"""<div class="card"><div class="ct">우리 집 주택연금 설명서 <span>(자녀용 예시 화면 · 숫자는 자리표시)</span></div>
<div class="cg"><div class="cb"><b>부모님 예상 월지급금</b><br>매달 ○○○만 원 (종신 정액형)</div>
<div class="cb"><b>꼭 알아야 할 네 가지</b><br>소유권 그대로 · 넘어도 청구 없음 · 남으면 상속인에게 · 갚고 물려받기 가능</div></div>
<table class="mt"><tr><th>받으시는 기간 ＼ 집값</th><th>그대로</th><th>연 1% 상승</th><th>연 2% 상승</th></tr>{rows}</table>
<div class="cq">💬 궁금한 점을 물어보세요 (공사 규정 안에서 답하고 근거를 보여 드립니다) &nbsp;|&nbsp; 📞 부모님·상담사와 함께 상담 예약</div></div>"""


def proposal_html():
    m = ME
    boxes = "".join(f'<p class="ck">{"■" if k == FIELD else "□"} {e(t)}</p>' for k, t in FIELDS)
    src = "".join(f"<p class='s'>{e(a)} {e(u)}</p>" for a, u in SOURCES)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>혁신 아이디어 제안서</title><style>{CSS}
body {{ font-size:12pt; line-height:1.45; }}
.tag {{ font-size:10.5pt; }}
h1 {{ text-align:center; font-size:17pt; margin:6px 0 2px; letter-spacing:1px; }}
.sub {{ text-align:center; font-size:12pt; margin:0 0 10px; }}
.note {{ font-size:9.5pt; color:#444; margin:1px 0; }}
table.f {{ width:100%; border-collapse:collapse; margin-top:8px; }}
table.f td {{ border:1px solid #555; padding:5px 8px; vertical-align:top; }}
table.f td.l {{ width:17.6%; background:#eef1f5; font-weight:700; text-align:center; vertical-align:middle; font-size:12pt; }}
table.f td.v {{ vertical-align:middle; }}
p {{ margin:2px 0; }} p.h {{ font-weight:700; margin-top:5px; }} p.h:first-child {{ margin-top:0; }}
p.n {{ padding-left:1.1em; text-indent:-1.1em; }}
p.ck {{ margin:1px 0; }} p.s {{ font-size:12pt; color:#222; line-height:1.4; }}
.title {{ font-weight:700; font-size:12pt; }}
tr {{ page-break-inside:auto; }}
.card {{ border:1.5px solid #2b5c8a; border-radius:6px; padding:7px 9px; margin:4px 0 6px; font-size:9pt; }}
.ct {{ font-weight:700; color:#2b5c8a; font-size:10pt; margin-bottom:4px; }} .ct span {{ font-weight:400; color:#777; font-size:8.5pt; }}
.cg {{ display:flex; gap:6px; margin-bottom:5px; }} .cb {{ flex:1; background:#f1f5f9; border-radius:4px; padding:4px 7px; line-height:1.4; }}
table.mt {{ width:100%; border-collapse:collapse; }} table.mt th, table.mt td {{ border:1px solid #b8c6d4; padding:2px 5px; text-align:center; font-size:8.8pt; }}
table.mt th {{ background:#e3ebf3; }}
.cq {{ margin-top:5px; background:#fff7e6; border-radius:4px; padding:3px 7px; font-size:8.8pt; }}
</style></head><body>
<div class="tag">(붙임2)</div>
<h1>혁신 아이디어 제안서</h1>
<div class="sub">2026년 HF 대국민 혁신 아이디어 공모전</div>
<p class="note">※ 전문용어보다 누구나 이해하기 쉬운 표현으로 작성해 주세요.</p>
<p class="note">※ A4용지 1~3 페이지 이내 (글자크기 12포인트 기준)</p>
<table class="f">
<tr><td class="l">성명</td><td class="v" style="width:16%">{m['name']}</td><td class="l" style="width:15%">생년월일</td><td class="v" style="width:17%">{m['birth']}</td><td class="l" style="width:13%">연락처</td><td class="v">{m['phone']}</td></tr>
<tr><td class="l">제안명</td><td colspan="5" class="v title">{e(TITLE)}</td></tr>
<tr><td class="l">공모 분야</td><td colspan="5" class="v">{boxes}<p class="note">※ 가장 관련 있는 분야 하나에 표시해 주세요.</p></td></tr>
<tr><td class="l">제안요약</td><td colspan="5">{paras(SUMMARY)}</td></tr>
<tr><td class="l">제안배경</td><td colspan="5">{paras(BACKGROUND)}</td></tr>
<tr><td class="l">아이디어<br>세부내용</td><td colspan="5">{paras(DETAIL)}</td></tr>
<tr><td class="l">기대효과</td><td colspan="5">{paras(EFFECTS)}</td></tr>
<tr><td class="l">AI 활용방안<br>(해당 시)</td><td colspan="5">{paras(AI_PLAN)}</td></tr>
<tr><td class="l">참고자료<br>(선택)</td><td colspan="5">{mock_card()}<p class="s">{e(REF_NOTE)}</p>{src}<p class="s">{e(AI_NOTE)}</p></td></tr>
</table></body></html>"""


def agree_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보 수집·이용 동의서</title><style>{CSS}
body {{ font-size:11pt; line-height:1.75; }}
.box {{ border:1px solid #333; padding:16px 20px; }}
h1 {{ text-align:center; font-size:16pt; margin:4px 0 16px; }}
p {{ margin:3px 0; }} .sec {{ font-weight:700; margin-top:12px; }}
.r {{ text-align:right; }} .c {{ text-align:center; }}
</style></head><body>
<div>(붙임3)</div>
<div class="box">
<h1>혁신 아이디어 공모전 개인정보 수집ㆍ이용 동의서</h1>
<p>&nbsp;한국주택금융공사는 대국민 혁신 아이디어 공모전과 관련하여 아래의 내용과 같이 개인정보를 수집ㆍ이용 하고자 합니다.</p>
<p>&nbsp;아래의 내용을 상세히 읽어보신 후에 동의 여부를 결정하여 주시기 바랍니다.</p>
<p class="sec">❏ 개인정보 수집·이용 목적</p>
<p>&nbsp;&nbsp;○ 공모전 참가자의 식별 및 참가자 관리</p>
<p>&nbsp;&nbsp;○ 공지사항 통지, 질의 응답 안내 등 공모전 진행</p>
<p>&nbsp;&nbsp;○ 포상 및 경품 지급 (해당시)</p>
<p class="sec">❏ 수집ㆍ이용 항목</p>
<p>&nbsp;&nbsp;○ 성명, 생년월일, 연락처</p>
<p class="sec">❏ 보유ㆍ이용기간</p>
<p>&nbsp;&nbsp;○ 공모전 종료 후 3개월 까지</p>
<p class="sec">❏ 동의에 거부할 권리 및 불이익</p>
<p>&nbsp;&nbsp;※ 위의 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다.<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;다만, 수집·이용하는 개인정보는 참가 접수와 행사 진행을 위한 최소한의 정보로 거부 시에는 공모전 참여가 불가합니다</p>
</div>
<div class="box" style="border-top:none"><p>&nbsp;위와 같이 개인정보를 수집·이용하는데 동의하십니까?</p>
<p class="r">(동의하지 않음 □ &nbsp;동의함 ■)</p></div>
<p class="c" style="margin-top:60px">{m['y']} 년 &nbsp;&nbsp;{m['m']} 월 &nbsp;&nbsp;{m['d']} 일</p>
<p class="r" style="margin-top:30px;margin-right:30px">본인 성명 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명 또는 인)')}</p>
<p class="c" style="margin-top:60px;font-size:15pt;font-weight:700">한국주택금융공사 귀중</p>
</body></html>"""


def pdf(html, name):
    src = BUILD / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = HERE / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={BUILD / 'chrome-prof'}", f"--print-to-pdf={out}", src.as_uri()],
                   capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    pdf(proposal_html(), "박용진_혁신아이디어제안서_주택연금_가족설명서")
    pdf(agree_html(), "박용진_개인정보수집이용동의서")
