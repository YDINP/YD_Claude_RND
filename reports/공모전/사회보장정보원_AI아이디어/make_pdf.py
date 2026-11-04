"""제출서식(서식1~4) 원본 hwp 구조를 따라 PDF 4개를 만든다: 참가신청서·개인정보동의서·청렴서약서(서명), 제안서.
실행: python -I make_pdf.py
"""
import base64, re, subprocess, sys
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import ME, TITLE, SUBTITLE, CATEGORY, SUMMARY, SUMMARY_TABLE, SECTIONS, SOURCES  # noqa: E402

BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROF = Path(r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/chrome_ud")
FILE = "AI혁신 경진대회_개인(박용진)"

CSS = """
@page { size:A4; margin:16mm 17mm 15mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.head { display:flex; border:1.2px solid #444; margin-bottom:14px; }
.head .no { background:#d9d9d9; font-weight:700; font-size:12.5pt; padding:6px 14px; border-right:1.2px solid #444; white-space:nowrap; }
.head .tt { font-weight:700; font-size:12.5pt; padding:6px 14px; }
.g td, .g th { border:1px solid #555; padding:6px 8px; vertical-align:middle; }
.g th { background:#d9d9d9; font-weight:700; text-align:center; }
.blue { color:#1f3fbf; font-size:8.5pt; font-weight:700; }
.note { color:#1f3fbf; font-size:8.5pt; font-weight:700; margin-top:6px; }
.sw { position:relative; display:inline-block; margin:0 34px 0 30px; }
.sig { position:absolute; left:50%; top:50%; height:46px; transform:translate(-50%,-55%); }
"""


def sign(label="(서명)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def md(t):
    t = escape(t)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t).replace("\n", "<br>")


def page(title, body, extra=""):
    return f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{title}</title><style>{CSS}{extra}</style></head><body>{body}</body></html>'


def pdf(html, name):
    src = BUILD / f"{name}.html"
    src.write_text(html, encoding="utf-8")
    out = HERE / f"{name}.pdf"
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--user-data-dir={PROF}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True, timeout=120)
    print(name, r.returncode, out.exists())


ck = lambda on: "■" if on else "□"


def form1():
    m = ME
    team_rows = "".join('<tr><td class="c">팀원</td><td></td><td></td><td></td><td></td></tr>' for _ in range(5))
    body = f"""
<div class="head"><div class="no">서식 1</div><div class="tt">「2026 AI 혁신 아이디어 경진대회」 참가신청서</div></div>
<table class="g f1"><colgroup><col style="width:16%"><col style="width:12%"><col style="width:14%"><col style="width:13%"><col style="width:11%"><col style="width:14%"><col style="width:20%"></colgroup>
<tr><td colspan="7" class="ttl">「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」 참가신청서</td></tr>
<tr><td colspan="7" class="sec">참가자 정보 <span class="blue">* 개인 참가 시, 대표자 부분만 작성</span></td></tr>
<tr><th>참가 구분</th><td colspan="5">{ck(0)} 공무원 &nbsp;{ck(0)} 공공기관 &nbsp;{ck(1)} 일반국민 &nbsp;{ck(0)} 학생 &nbsp;&nbsp;/&nbsp;&nbsp; {ck(1)} 개인 &nbsp;{ck(0)} 팀</td><td style="text-align:center">총인원 &nbsp;<b>1</b>&nbsp; 명</td></tr>
<tr><th>아이디어 주제</th><td colspan="6"><b>{TITLE}</b><br><span style="font-size:9pt">— {SUBTITLE} ({CATEGORY})</span></td></tr>
<tr><th>팀명</th><td colspan="6" class="gray">개인 단위 참가 시, 작성 불필요</td></tr>
<tr><th rowspan="3">대표자*<br>또는<br>개인</th><th>성명</th><td colspan="5">{m['name']}</td></tr>
<tr><th>소속</th><td colspan="2">개인({m['job']})</td><th>직위</th><td colspan="2">-</td></tr>
<tr><th>휴대전화</th><td colspan="2">{m['phone']}</td><th>이메일</th><td colspan="2">{m['email']}</td></tr>
<tr><th rowspan="6">팀<br>구성원<br><span class="blue">(필요 시, 칸 추가 및 삭제 가능하며, 개인 단위로 참가 시 작성 불필요)</span></th><th>구분</th><th>성명</th><th>소속</th><th colspan="2">휴대전화</th><th>이메일</th></tr>
{''.join('<tr><th>팀원</th><td></td><td></td><td colspan="2"></td><td></td></tr>' for _ in range(5))}
<tr><th rowspan="2">타 경진대회<br>수상(수상 예정<br>포함) 여부 등</th><td colspan="3" style="text-align:center">수상 경력 {ck(0)} 있음 {ck(1)} 없음</td><td colspan="3">{ck(1)} 자체 점검 완료(공고문 내 「유의사항」 확인 완료)</td></tr>
<tr><td colspan="6"><span class="blue" style="font-size:10pt">☞ 참가신청서 작성 시, 공고문 내 「유의사항」 필독</span><br><span class="blue" style="font-weight:400;text-decoration:underline">(동일(유사) 아이디어(서비스)로 기존 경진대회 및 유사 경진대회에 입상(또는 입상 예정)한 경우 응모 불가)</span></td></tr>
<tr><th>창업 여부</th><td colspan="6" class="gray">사업자등록번호 및 소재지 (창업한 경우에만 작성, 000-00-00000 / 서울) — 해당 없음(미창업)</td></tr>
<tr><td colspan="7" class="foot">
<div style="text-align:right;margin:10px 6px 14px">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</div>
<div style="text-align:right;margin:0 40px 18px"><b>신청인(대표자):</b> &nbsp;&nbsp;{m['name']} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{sign()}</div>
<div style="text-align:center;font-weight:700;font-size:13pt;margin-bottom:8px">대구가톨릭대학교 총장 / 한국사회보장정보원장 귀하</div></td></tr>
</table>
<div class="note">* 개인 참가자는 본인, 팀 참가자는 대표자가 자필 서명한 후 스캔본(PDF)으로 제출합니다.<br><u>(※ 서명은 반드시 “자필”로 작성 후, 이미지 형식으로 삽입 가능)</u></div>
"""
    extra = """.f1 .ttl { text-align:center; font-weight:700; font-size:13pt; padding:12px; }
.f1 .sec { text-align:right; background:#e7e7e7; font-weight:700; }
.f1 { table-layout:fixed; } .f1 th { font-size:9.5pt; } .f1 td { height:30px; } .gray { color:#888; font-style:italic; text-align:center; }
.foot { padding:4px 8px; }"""
    return page("참가신청서", body, extra)


def form2():
    m = ME
    body = f"""
<div class="head"><div class="no">서식 2</div><div class="tt">「2026 AI 혁신 아이디어 경진대회」 개인정보 수집·이용 동의서</div></div>
<div class="frame">
<p style="text-align:center;font-weight:700;font-size:11.5pt;text-decoration:underline">【 개인정보 수집･이용 동의 안내 】</p>
<p>대구가톨릭대학교-한국사회보장정보원에서 주관하는 <b>「2026 AI 혁신 아이디어 경진대회」</b>를 위한 참여자의 모든 개인정보는 <b>「개인정보 보호법」</b>에 의거하여 안전하게 보관·관리되며, 제15조 및 제22조에 따라 아래와 같이 동의를 얻고자 합니다.</p>
<p style="font-weight:700">아래의 사항을 숙지하신 후, 동의 여부에 체크 및 서명하여 주시기 바랍니다.</p>
<div class="inner">
<p style="font-weight:700;text-decoration:underline">가. 개인정보의 수집･이용에 관한 사항</p>
<p>◦ 귀하의 개인정보는 <b>대구가톨릭대학교와 한국사회보장정보원에서 주최하는 ｢2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회｣ 운영 및 관리 목적</b>으로 수집·이용됩니다.</p>
<table class="g kv">
<tr><th>수집기관</th><td>대구가톨릭대학교, 한국사회보장정보원</td></tr>
<tr><th>수집·이용 목적</th><td>2026 AI 혁신 아이디어 경진대회 운영 관리 및 홍보 등</td></tr>
<tr><th>수집항목</th><td>성명, 소속, 직위, 연락처(휴대전화·이메일), 주소, 창업 여부, 대회 중 취득한 정보</td></tr>
<tr><th>보유기간</th><td>제공에 동의한 날로부터 2027.12.31.까지</td></tr>
</table>
<p style="font-weight:700;text-decoration:underline;margin-top:14px">나. 개인정보 수집･이용 동의를 거부할 권리 및 동의를 거부할 경우의 불이익</p>
<p>◦ 정보 주체는 개인정보의 수집·이용에 관한 사항에 대해 거부할 수 있습니다.</p>
<p>◦ 단, 거부할 경우 「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」에 참가할 수 없습니다.</p>
</div>
<p style="font-weight:700;margin-top:14px">본인은 「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」와 관련하여 본인의 개인정보를 수집･이용하는 것에 동의합니다.</p>
<p style="text-align:center;font-size:11pt;margin:14px 0">{ck(1)} 동의함 &nbsp;&nbsp;&nbsp;&nbsp; {ck(0)} 동의하지 않음</p>
<p style="text-align:center;font-weight:700;margin:26px 0">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</p>
<p style="text-align:right;font-weight:700;margin:30px 10px 10px">신청인 &nbsp;&nbsp;{m['name']} &nbsp;&nbsp;&nbsp;{sign()}</p>
</div>
<div class="note">* 팀으로 참가하는 경우, 참가자 전원이 각각 작성·자필 서명한 하나의 스캔본(PDF)으로 제출합니다.<br><u>(※ 서명은 반드시 “자필”로 작성 후, 이미지 형식으로 삽입 가능)</u></div>
"""
    extra = """.frame { border:1.2px solid #444; padding:14px 18px; } .inner { border:1px solid #555; padding:6px 12px 10px; }
.kv th { width:22%; background:#e7e7e7; font-size:9pt; } .kv td { font-size:9pt; } p { margin:6px 0; }"""
    return page("개인정보 수집·이용 동의서", body, extra)


def form3():
    m = ME
    body = f"""
<div class="head"><div class="no">서식 3</div><div class="tt">「2026 AI 혁신 아이디어 경진대회」 청렴 서약서</div></div>
<div class="frame">
<p style="text-align:center;font-weight:700;font-size:16pt;text-decoration:underline;margin:10px 0 16px">청렴 서약서</p>
<p>&nbsp;&nbsp;상기 본인은 「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」 참가에 있어 아래의 사항을 숙지하였으며, 서약 내용 위반 시 추후 수상 취소 및 포상금 반환에 응할 것을 서약합니다.</p>
<div class="inner">
<p class="it"><b>하나,</b> 공모 참여에 있어 공고문 및 유의사항 등을 숙지하고 이해하였으며, 「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」의 원활한 운영을 위해 적극적으로 협조한다.</p>
<p class="it"><b>둘,</b> 공모전의 심사 과정 및 결과를 존중하며, 타인의 지적 재산권을 도용 및 침해하는 위조·변조·표절 등의 부정행위를 하지 않는다.</p>
<p class="it"><b>셋,</b> 동일 또는 유사 아이디어(서비스)로 기존 또는 타 경진대회 및 유사 공모전에 입상(또는 입상 예정)한 경력*이 없음을 확인한다.<br><span class="blue">* 공고문 내 「유의사항」 에 기재된 내용 일체</span></p>
<p class="it"><b>넷,</b> 참가자는 출품작이 타인이 취득한 특허, 실용신안 등 지적 재산권 및 기타 제반 권리를 침해하지 않았음을 보증하며, 타인의 권리를 침해하거나 위조·변조·표절 등 부정행위를 한 사실이 밝혀지면 포상금(부상 등 일체)을 반환하고, 향후 분쟁 발생 시 손해배상 등 모든 민·형사상 책임을 감수할 것을 서약한다.</p>
</div>
<p style="text-align:center;margin:22px 0 8px">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</p>
<p style="text-align:center;font-weight:700;margin:6px 0 18px">팀명 : &nbsp;<span style="font-weight:400">개인 참가</span></p>
<table class="sg"><tr><td style="width:46%;text-align:right"><b>서약자 성명 :</b></td><td style="padding-left:20px">{m['name']}</td><td style="text-align:center;width:24%">{sign()}</td></tr></table>
</div>
<div class="note">* 팀원의 수에 따라 행을 추가 및 삭제할 수 있으며, 팀원 전원 자필 서명 후 하나의 스캔본(PDF)으로 제출합니다.<br><u>(※ 서명은 반드시 “자필”로 작성 후, 이미지 형식으로 삽입 가능)</u></div>
"""
    extra = """.frame { border:1.2px solid #444; padding:14px 18px 20px; } .inner { border:1px dashed #777; background:#f2f2f2; padding:8px 14px; }
.it { padding-left:2.4em; text-indent:-2.4em; margin:8px 0; } .sg td { padding:10px 4px; font-size:11pt; border-top:1.2px solid #444; }"""
    return page("청렴 서약서", body, extra)


# ---------- 서식 4 제안서 ----------
def block_html(b):
    k = b[0]
    if k == "b":
        return f'<p class="b">◦ {md(b[1])}</p>'
    if k == "s":
        return f'<p class="s">- {md(b[1])}</p>'
    if k == "p":
        return f"<p>{md(b[1])}</p>"
    if k == "t":
        _, head, rows, w = b
        cols = "".join(f'<col style="width:{x}%">' for x in w)
        th = "".join(f"<th>{md(h)}</th>" for h in head)
        trs = "".join("<tr>" + "".join(f'<td{" class=k" if i == 0 else ""}>{md(c)}</td>' for i, c in enumerate(r)) + "</tr>" for r in rows)
        return f'<table class="g dt"><colgroup>{cols}</colgroup><tr>{th}</tr>{trs}</table>'
    if k == "box":
        lines = b[1]
        return '<div class="box"><b>' + md(lines[0]) + "</b>" + "".join(f"<br>{md(x)}" for x in lines[1:]) + "</div>"
    if k == "flow":
        cells = '<td class="ar">→</td>'.join(f'<td class="st">{md(x)}</td>' for x in b[1])
        return f'<table class="flow"><tr>{cells}</tr></table>'
    raise ValueError(k)


def proposal():
    rows = "".join(f'<tr><th>{md(h)}</th><td>{"".join(f"<p>◦ {md(x)}</p>" for x in ls)}</td></tr>' for h, ls in SUMMARY_TABLE)
    summ = "".join(f"<p>◦ {md(x)}</p>" for x in SUMMARY)
    secs = ""
    for h, guide, blocks in SECTIONS:
        secs += f'<h2>{md(h)}</h2><div class="guide">* {md(guide)}</div>' + "".join(block_html(b) for b in blocks)
    src = "".join(f"<li>{escape(s)}</li>" for s in SOURCES)
    body = f"""
<div class="head"><div class="no">서식 4</div><div class="tt">「2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회」 제안서</div></div>
<div class="warn">※ <u>(유의 사항)</u> 아래 서식을 참고하여 <u>5쪽 이내 분량</u> 및 <u>한글파일(hwp 또는 hwpx)</u>로 작성·제출</div>
<div class="ptitle"><b>{escape(TITLE)}</b><br><span>{escape(SUBTITLE)}</span></div>
<table class="g sm"><tr><th>아이디어 요약<br>(5줄 이내)</th><td>{summ}</td></tr></table>
<h3 class="cap">【제안서 요약】</h3>
<table class="g sm">{rows}</table>
<div class="pb"></div>
<div class="topic">아이디어 주제(팀명 또는 신청인명) &nbsp;—&nbsp; <b>{escape(TITLE)}</b> ({ME['name']})</div>
{secs}
<div class="srcs"><b>출처</b><ol>{src}</ol></div>
"""
    extra = """
@page { margin:13mm 15mm 12mm; }
body { font-size:9.7pt; line-height:1.47; }
.warn { background:#fff7b3; border:1px solid #c9b400; color:#1f3fbf; font-weight:700; text-align:center; padding:4px; font-size:9.5pt; margin-bottom:10px; }
.ptitle { text-align:center; margin:4px 0 10px; font-size:14pt; } .ptitle span { font-size:10pt; color:#333; }
.sm th { width:19%; background:#d9d9d9; font-size:9.5pt; } .sm td { font-size:9.2pt; } .sm p { margin:1px 0; padding-left:1em; text-indent:-1em; }
.cap { text-align:center; text-decoration:underline; font-size:12pt; margin:12px 0 8px; }
.topic { border:1.2px solid #444; text-align:center; font-size:11.5pt; padding:8px; margin-bottom:8px; }
h2 { font-size:11.5pt; margin:10px 0 0; text-decoration:underline; }
.guide { color:#1f3fbf; font-size:8.3pt; font-weight:700; margin:1px 0 4px; }
p.b { margin:3px 0; padding-left:1em; text-indent:-1em; text-align:justify; }
p.s { margin:2px 0 2px 1em; padding-left:1em; text-indent:-1em; }
.dt { margin:4px 0 5px; } .dt th { font-size:8.6pt; padding:3px 5px; } .dt td { font-size:8.5pt; padding:3px 5px; line-height:1.35; vertical-align:top; }
.dt td.k { font-weight:700; background:#f2f2f2; }
.box { border:1px solid #6a7fb8; background:#eef2fb; padding:5px 10px; margin:4px 0 5px 1em; font-size:8.8pt; }
.flow { margin:5px 0 6px; } .flow td { text-align:center; font-size:8.6pt; line-height:1.3; }
.flow .st { border:1.2px solid #1c2f5e; background:#e9edf6; padding:5px 3px; font-weight:700; width:23%; } .flow .ar { width:2.6%; font-weight:700; color:#1c2f5e; }
.srcs { font-size:7.6pt; color:#333; margin-top:8px; border-top:1px solid #999; padding-top:3px; } .srcs ol { margin:0; padding-left:16px; }
"""
    return page("아이디어 제안서", body, extra)


if __name__ == "__main__":
    pdf(form1(), f"{FILE}_①참가신청서")
    pdf(form2(), f"{FILE}_④개인정보수집이용동의서")
    pdf(form3(), f"{FILE}_③청렴서약서")
    pdf(proposal(), f"{FILE}_②아이디어제안서")
