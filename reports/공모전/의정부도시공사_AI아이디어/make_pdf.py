"""지정서식 (양식) 제출서류.hwpx 를 HTML로 재현해 채운 PDF 를 만든다 (Chrome headless)."""
import base64, subprocess, time
from pathlib import Path
from html import escape as e

from content import *

HERE = Path(__file__).parent
BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = HERE / "박용진_AI혁신아이디어_제안서(번호인식 오답노트).pdf"

CSS = """
@page { size:A4; margin:13mm 14mm 12mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.2pt; color:#000; line-height:1.48; margin:0; }
table.f { width:100%; border-collapse:collapse; table-layout:fixed; }
.f td { border:1px solid #000; padding:4px 7px; vertical-align:middle; }
.f .h { text-align:center; font-weight:700; font-size:10.5pt; }
.f .ttl { background:#e6e6e6; text-align:center; font-weight:700; font-size:16pt; padding:8px; border-width:2px 1px 1px 1px; }
.gray { color:#808080; }
.cat { display:grid; grid-template-columns:1fr 1fr; row-gap:1px; font-size:10pt; }
p { margin:2px 0; }
.sh { font-weight:700; margin:6px 0 2px; font-size:9.8pt; }
.sub { font-weight:700; margin:4px 0 1px; }
.it { padding-left:10px; text-indent:-10px; margin:1px 0; }
.lead { border:1.3px solid #1f4e79; background:#eef4fa; padding:5px 8px; margin:3px 0 4px; font-weight:700; }
table.in { width:100%; border-collapse:collapse; margin:3px 0 4px; }
.in td, .in th { border:1px solid #888; padding:3px 6px; font-size:8.8pt; vertical-align:top; }
.in th { background:#eef1f4; }
.src { font-size:7.8pt; color:#333; margin-top:6px; line-height:1.4; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:50%; top:50%; height:40px; transform:translate(-50%,-50%); }
.app td { font-size:10pt; }
.small { font-size:9.3pt; line-height:1.55; }
"""


def items(lines):
    return "".join(f'<p class="it">{e(t)}</p>' if t.startswith("·") else f"<p>{e(t)}</p>" for t in lines)


def flow_svg():
    boxes = [("카메라 판독값", "#f2f2f2"), ("관리원 수정", "#f2f2f2"), ("오답노트", "#1f4e79"),
             ("원인 분류 AI", "#dce8f4"), ("카메라 처방전", "#dce8f4"), ("전환 순서표", "#dce8f4")]
    w, gap = 98, 12
    out = []
    for i, (t, c) in enumerate(boxes):
        x = i * (w + gap)
        fc = "#fff" if c == "#1f4e79" else "#000"
        out.append(f'<rect x="{x}" y="6" width="{w}" height="30" rx="5" fill="{c}" stroke="#1f4e79" stroke-width="1"/>'
                   f'<text x="{x + w / 2}" y="26" text-anchor="middle" font-size="11.5" font-weight="700" fill="{fc}">{t}</text>')
        if i < len(boxes) - 1:
            out.append(f'<path d="M{x + w + 1},21 L{x + w + gap - 2},21" stroke="#1f4e79" stroke-width="1.6" marker-end="url(#ar)"/>')
    return ('<svg viewBox="0 0 650 60" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic">'
            '<defs><marker id="ar" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#1f4e79"/></marker></defs>'
            + "".join(out) +
            '<text x="104" y="52" font-size="9.5" fill="#555">사람이 고친 번호 = 정답(추가 입력 없음)</text>'
            '<text x="440" y="52" font-size="9.5" fill="#555">→ 기동처리반 순회 · 개방형 전환 A/B/C</text></svg>')


def proposal():
    left, right = CATEGORIES_SRC[:4], CATEGORIES_SRC[4:]
    cat = "".join(f"<div>{'■' if a == CATEGORY else '☐'} {e(a)}</div><div>{'■' if b == CATEGORY else '☐'} {e(b)}</div>"
                  for a, b in zip(left, right))
    status = "".join(f'<p class="sub">{e(h)}</p>' + items(ls) for h, ls in STATUS)
    detail = "".join(f'<p class="it">· <b>{e(h)}</b> — {e(t)}</p>' for h, t in DETAIL)
    roles = "".join(f"<tr><td style='width:29%'><b>{e(a)}</b></td><td>{e(b)}</td></tr>" for a, b in ROLES)
    pilot = "".join(f"<tr><td style='width:14%'><b>{e(a)}</b></td><td>{e(b)}</td></tr>" for a, b in PILOT)
    budget = "".join(f"<tr><td>{e(a)}</td><td style='white-space:nowrap'>{e(b)}</td><td>{e(c)}</td></tr>" for a, b, c in BUDGET)
    src = "<br>".join(f"{i}. {e(t)}" for i, t in enumerate(SOURCES, 1))
    return f"""
<table class="f">
<colgroup><col style="width:12.5%"><col style="width:20.6%"><col style="width:12.4%"><col style="width:21.1%"><col style="width:12.2%"><col style="width:21.2%"></colgroup>
<tr><td colspan="6" class="ttl">아이디어 제안서</td></tr>
<tr><td class="h">접수번호</td><td class="gray" style="text-align:center">기재하지 않음</td><td class="h">심사번호</td><td class="gray" style="text-align:center">기재하지 않음</td><td class="h">접수일자</td><td style="text-align:center">{ME['date_dot']}</td></tr>
<tr><td class="h">제 &nbsp;&nbsp; 목</td><td colspan="5" style="font-weight:700;font-size:10.3pt;padding:6px 8px">{e(TITLE)}</td></tr>
<tr><td class="h">제안분류</td><td colspan="5"><p>제안의 주된 목적에 해당하는 항목 1개를 선택하여 주십시오.</p><div class="cat">{cat}</div></td></tr>
<tr><td class="h">제안요약</td><td colspan="5" class="small">{items(SUMMARY)}</td></tr>
<tr><td class="h">제안배경</td><td colspan="5" class="small">{items(BACKGROUND)}</td></tr>
<tr><td class="h">제안내용</td><td colspan="5" style="vertical-align:top;padding:6px 9px">
<p class="sh">○ 현황 및 문제점</p>{status}
<p class="sh">○ 아이디어(개선방법 등) 상세</p>
<div class="lead">{e(DETAIL_LEAD)}</div>
{flow_svg()}
{detail}
<p class="sub">공사의 역할</p><table class="in">{roles}</table>
<p class="sub">첫 달부터 시작하는 시범 일정</p><table class="in">{pilot}</table>
<p class="it">· {e(DIFF)}</p>
<p class="sh">○ 소요예산</p>
<table class="in"><tr><th>항목</th><th style="width:22%">금액(추정)</th><th style="width:36%">비고</th></tr>{budget}</table>
<p class="it">· {e(BUDGET_TOTAL)}</p>
</td></tr>
<tr><td class="h">기대효과</td><td colspan="5" class="small">{items(EFFECTS)}
<p class="src"><b>근거 자료</b><br>{src}<br>{e(AI_NOTE)}</p></td></tr>
</table>"""


def application():
    m = ME
    sig = f'<span class="sw">(서명 또는 날인)<img class="sig" src="{SIG}"></span>'
    return f"""
<div class="pb"></div>
<table class="f app">
<colgroup><col style="width:11.3%"><col style="width:9.4%"><col style="width:12.4%"><col style="width:10.2%"><col style="width:18.2%"><col style="width:22.5%"><col style="width:16%"></colgroup>
<tr><td colspan="7" class="ttl" style="font-size:15pt">신청서 및 개인정보제공동의서</td></tr>
<tr><td class="h">성명</td><td colspan="3" style="text-align:center">{m['name']}</td><td class="h">의정부도시공사 소속 여부</td><td colspan="2" style="text-align:center">□ O (직원) &nbsp;■ X</td></tr>
<tr><td class="h">연락처</td><td colspan="3" style="text-align:center">{m['phone']}</td><td class="h">E-mail</td><td colspan="2" style="text-align:center">{m['email']}</td></tr>
<tr><td class="h">유의사항</td><td colspan="6" style="font-size:9.6pt;line-height:1.6">
<p>- 접수된 서류 일체는 반환되지 않으며 수상작 및 채택 제안은 공사의 사업·정책 등에 활용될 수 있습니다.</p>
<p>- 지식재산권 등 응모한 아이디어의 모든 법적인 책임은 공모전 참가자에게 있습니다.</p>
<p>- 타 공모전 입상작, 타인의 저작물·지식재산권 침해, 서류의 허위기재, 부정행위 등이 있다고 판단되는 경우 심사대상에서 제외하고, 시상 이후 확인 시 상금 및 상장은 환수 조치됩니다.</p>
<p>- 적합한 응모작이 없을 경우 수상자를 선정하지 않을 수 있습니다.</p>
<p>잘못된 정보(연락처 등)로 인하여 발생하는 불이익은 공사에서 책임지지 않습니다.</p></td></tr>
<tr><td class="h" style="font-size:9.5pt">개인정보 수집 및 이용에 대한 안내</td><td colspan="6" style="font-size:9.6pt;line-height:1.6">
<p>의정부도시공사는 개인정보보호법에 의거, 『아이디어 공모전』 시행을 위하여 개인정보를 아래와 같이 수집·이용하고자 합니다.</p>
<p><b>1. 개인정보 수집·이용 목적</b></p>
<p>&nbsp;- 본 공모전에서 수집한 참가자의 개인정보는 공모 접수에 따른 본인 확인 및 공지사항 전달, 시상 등 참가자 관리와 수상작 활용 및 포상 등 안내를 위한 용도로만 사용됩니다.</p>
<p>&nbsp;&nbsp;&nbsp;※ 개인정보는 해당 목적 이외의 다른 목적으로 사용하지 않습니다.</p>
<p><b>2. 개인정보 수집항목</b></p>
<p>&nbsp;- 필수항목: 성명, 연락처, 이메일, 주소, 생년월일</p>
<p><b>3. 개인정보의 보유 및 이용기간</b></p>
<p>&nbsp;- 1년(보유기간 경과 시 파기)</p>
<p>&nbsp;&nbsp;&nbsp;※ 단, 민원처리, 분쟁해결, 법령상 의무이행을 위하여 필요한 범위 내에서만 보유·이용됩니다.</p>
<p><b>4. 동의 거부 및 동의 거부 시 불이익 내용</b></p>
<p>&nbsp;- 귀하는 개인정보의 수집·이용에 관한 동의를 거부하실 수 있습니다. 그러나 동의를 거부할 경우<br>아이디어 공모전 응모 및 시상에서 제외될 수 있음을 알려드립니다.</p>
<p style="text-align:center;margin-top:8px"><b>위와 같이 개인정보를 수집·이용하는데 동의하십니까?</b></p>
<p style="text-align:center"><b>【■ 동의함 &nbsp;&nbsp;□ 동의하지 않음】</b></p></td></tr>
<tr><td colspan="7" style="text-align:center;padding:10px;font-size:10pt">위 유의사항을 확인하였으며 개인정보 수집·이용에 대하여 동의하여,<br>의정부도시공사 아이디어 공모전에 참가하고자 첨부의 내용과 같이 신청합니다.<br>
<span style="display:block;text-align:left;margin-top:6px">첨부: 의정부도시공사 아이디어 공모전 제안서 1부.</span></td></tr>
<tr><td colspan="7" style="text-align:center;padding:8px">2026년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</td></tr>
<tr><td colspan="2" style="border-right:none"></td><td class="h" style="border-left:none;border-right:none">성명</td><td colspan="2" style="text-align:center;border-left:none;border-right:none">{m['name']}</td><td class="h" style="border-left:none;border-right:none;height:46px">{sig}</td><td style="border-left:none"></td></tr>
<tr><td colspan="7" style="text-align:center;font-weight:700;font-size:13pt;padding:10px">의정부도시공사 사장 귀하</td></tr>
</table>"""


def main():
    html = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>아이디어 제안서</title><style>{CSS}</style></head><body>{proposal()}{application()}</body></html>'
    src = BUILD / "proposal.html"
    src.write_text(html, encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={BUILD / 'chrome-prof'}", f"--print-to-pdf={OUT}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(OUT, OUT.exists())


if __name__ == "__main__":
    main()
