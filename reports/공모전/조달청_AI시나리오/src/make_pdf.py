"""조달청 AI 시나리오 응모 — 참가신청서·시나리오 본문·개인정보동의서 PDF (HTML → Chrome headless)."""
import base64
import html
import subprocess
import tempfile
from pathlib import Path

from content import (ME, TITLE, GENRE, FILE_SCN, LOGLINE, INTENT, SYNOPSIS, CHARACTERS, AI_USE, PROGRAMS)

SRC = Path(__file__).parent
OUT = SRC.parent
SIG = "data:image/png;base64," + base64.b64encode((OUT / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
E = html.escape

BASE = """
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic','맑은 고딕',sans-serif; color:#000; margin:0; }
table { width:100%; border-collapse:collapse; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }
"""


def sign(label="(서명)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def pdf(doc, name):
    tmp = Path(tempfile.mkdtemp(prefix="pps_"))
    src = tmp / "page.html"
    src.write_text(doc, encoding="utf-8")
    out = OUT / name
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={tmp / 'prof'}", f"--print-to-pdf={out}", src.as_uri()],
                   capture_output=True, timeout=120)
    print(out, out.stat().st_size)


# ───────────── 참가신청서 (붙임 1-2) ─────────────
def application():
    m = ME
    paras = lambda xs: "".join(f"<p>{E(x)}</p>" for x in xs)
    chars = "".join(f'<p class="ch"><b>■ {E(n)}: {E(r)}</b><br>{E(d)}</p>' for n, r, d in CHARACTERS)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참가신청서</title><style>{BASE}
@page {{ size:A4; margin:20mm 18mm 16mm; @bottom-center {{ content:"- " counter(page) " -"; font:9pt 'Malgun Gothic'; }} }}
body {{ font-size:10pt; line-height:1.55; }}
.top {{ display:flex; gap:8px; align-items:stretch; margin-bottom:12px; }}
.badge {{ background:#1f3a93; color:#fff; font-weight:700; font-size:13pt; padding:6px 12px; display:flex; align-items:center; }}
.tbox {{ flex:1; border:1.5px solid #000; font-size:13pt; font-weight:700; padding:6px 10px; }}
h1 {{ text-align:center; font-size:16pt; margin:4px 0 10px; letter-spacing:-0.5px; }}
.f td {{ border:1px solid #000; padding:6px 8px; vertical-align:middle; }}
.f .h {{ background:#e7e7e7; font-weight:700; text-align:center; width:17%; }}
.f .s {{ text-align:left; width:13%; }}
.f .txt p {{ margin:0 0 5px; text-align:justify; }}
.f .ch {{ margin:0 0 7px; }}
.f .top-al {{ vertical-align:top; }}
.small {{ font-size:8pt; }}
.chk {{ letter-spacing:0; }}
.bottom {{ text-align:center; padding:16px 8px 18px; font-size:12pt; }}
.bottom .d {{ margin:16px 0 14px; letter-spacing:1px; }}
.bottom .n {{ text-align:right; margin-right:60px; }}
tr {{ page-break-inside:avoid; }}
</style></head><body>
<div class="top"><div class="badge">붙임 1-2</div><div class="tbox">2026 조달청 AI 게임 · 콘텐츠 공모전 참가신청서 (AI 시나리오)</div></div>
<h1>2026 조달청 AI 게임 · 콘텐츠 공모전 참가신청서 (AI 시나리오)</h1>
<table class="f">
<tr><td colspan="3" style="border:none;border-bottom:1px solid #000;padding-left:0">(해당사항에 ☑)</td>
    <td class="h" style="width:13%">접수번호</td><td colspan="3" class="small">※접수번호는 기재하지 마십시오.</td></tr>
<tr><td class="h">참가구분</td><td colspan="6" class="chk">☑ 개인 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 팀</td></tr>
<tr><td class="h">팀명(인원)</td><td colspan="6" style="text-align:center">해당 없음 (개인 참가)</td></tr>
<tr><td class="h" rowspan="3">개인 또는<br>팀 대표자</td><td class="s">성명(한글)</td><td colspan="2">{m['name']}</td>
    <td class="s" colspan="2">생년월일</td><td>{m['birth']}</td></tr>
<tr><td class="s">E-mail</td><td colspan="2">{m['email']}</td><td class="s" colspan="2">연락처<br>(휴대전화번호)</td><td>{m['phone']}</td></tr>
<tr><td class="s">주소</td><td colspan="5">{m['addr']}</td></tr>
<tr><td class="h">작품명</td><td colspan="6"><b>{TITLE}</b></td></tr>
<tr><td class="h">작품구분</td><td colspan="6" class="chk">□ 장편 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ☑ 단편 <span class="small">(시나리오 본문 A4 8쪽 · 예상 러닝타임 약 12분)</span></td></tr>
<tr><td class="h">장르</td><td colspan="6">{GENRE}</td></tr>
<tr><td class="h">로그라인<br><span style="font-size:9pt">(작품 한 줄 소개)</span></td><td colspan="6" class="txt"><p>{E(LOGLINE)}</p></td></tr>
<tr><td class="h">기획의도</td><td colspan="6" class="txt">{paras(INTENT)}</td></tr>
<tr><td class="h">시놉시스<br>(스토리<br>주요내용)</td><td colspan="6" class="txt top-al">{paras(SYNOPSIS)}</td></tr>
<tr><td class="h">등장인물 소개</td><td colspan="6" class="txt top-al">{chars}</td></tr>
<tr><td class="h">AI 활용 내용</td><td colspan="6" class="txt">{paras(AI_USE)}</td></tr>
<tr><td class="h">사용 프로그램</td><td colspan="6">{PROGRAMS}</td></tr>
<tr><td class="h">제출파일(명)</td><td colspan="6">{FILE_SCN} <span class="small">(단편 · 시나리오 본문, 지정양식 규격 준수)</span></td></tr>
<tr><td class="h">참고사항</td><td colspan="6" class="small" style="font-size:9pt">
 - 1인 또는 1팀(10명 이내)당 부문별 1개 작품만 출품 가능<br>
 - 이미 타 공모전에서 수상했거나 타 기관 등에서 동일 작품이 활용 중인 경우 심사대상에서 제외<br>
 - 신청서 또는 필수 제출물을 누락하거나 중요 사항을 잘못 기재한 경우 접수·심사에서 제외될 수 있습니다.</td></tr>
<tr><td colspan="7" class="bottom">상기와 같이 「2026 조달청 AI 게임·콘텐츠 공모전」<br>참가신청서를 제출합니다.
<div class="d">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</div>
<div class="n">참가자 성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}</div></td></tr>
</table>
</body></html>"""


# ───────────── 시나리오 본문 ─────────────
def scenario_blocks():
    out = []
    for raw in (SRC / "scenario.txt").read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line:
            out.append(("gap", ""))
        elif line.startswith("= "):
            out.append(("head", line[2:]))
        elif "\t" in line:
            n, t = line.split("\t", 1)
            out.append(("dlg", (n, t)))
        elif line == "끝":
            out.append(("end", line))
        elif line.startswith("타이틀 —"):
            out.append(("title", line))
        else:
            out.append(("act", line))
    return out


def scenario():
    body = []
    prev = None
    for kind, v in scenario_blocks():
        if kind == "head":
            if prev not in (None, "gap"):
                body.append('<div class="gap"></div>')
            body.append(f'<p class="head">{E(v)}</p>')
        elif kind == "gap":
            body.append('<div class="gap"></div>')
        elif kind == "dlg":
            n, t = v
            body.append(f'<div class="dlg"><span class="n">{E(n)}</span><span class="t">{E(t)}</span></div>')
        elif kind == "end":
            body.append(f'<div class="gap"></div><p class="end">{E(v)}</p>')
        elif kind == "title":
            body.append(f'<p class="act ttl">{E(v)}</p>')
        else:
            body.append(f'<p class="act">{E(v)}</p>')
        prev = kind
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{TITLE}</title><style>{BASE}
/* 지정양식 규격: A4, 여백 위20+머리말10 / 아래15+꼬리말5 / 좌우20mm, 맑은 고딕 10pt, 줄간격 160%, 검정 */
@page {{ size:A4; margin:30mm 20mm 20mm 20mm; @bottom-center {{ content:"- " counter(page) " -"; font:9pt 'Malgun Gothic'; color:#000; }} }}
body {{ font-size:10pt; line-height:16pt; }}
p {{ margin:0; }}
.hdr td {{ border:1px solid #000; font-weight:700; font-size:14pt; line-height:1.3; padding:6px 10px; text-align:center; }}
.hdr td:first-child {{ width:23%; background:#f0f0f0; }}
.gap {{ height:16pt; }}
.head {{ font-weight:700; }}
.act {{ text-align:justify; }}
.ttl {{ font-weight:700; }}
.dlg {{ display:grid; grid-template-columns:14.5mm 1fr; }}
.dlg .t {{ text-align:justify; }}
.end {{ text-align:center; font-weight:700; }}
.head, .dlg {{ break-inside:avoid; }}
.head {{ break-after:avoid; }}
</style></head><body>
<table class="hdr"><tr><td>시나리오 본문</td><td>{TITLE}</td></tr></table>
<div class="gap"></div>
{''.join(body)}
</body></html>"""


# ───────────── 개인정보 동의서·서약 (붙임 2) ─────────────
def consent():
    m = ME
    pledges = [
        "출품한 작품은 일체 반환하지 않습니다.",
        "수상작에 대한 저작권은 응모자에게 있습니다. 다만, 주최자는 수상작을 사전에 고지한 목적 범위 내에서 주최자가 관리하는 누리집, SNS 채널(유튜브, 인스타그램, 블로그, X, 페이스북)에 게재할 수 있습니다.",
        "수상자(저작자)는 주최 측이 동 저작물을 공모전의 취지·목적을 달성하기 위해 필요한 한도 내에서 이용할 수 있도록 허락합니다.",
        "응모자 본인의 창작물이 아니거나 표절·도용 사실이 확인된 경우, 이미 타 공모전에서 수상했거나 타 기관 등에서 동일 작품이 활용 중인 경우에는 심사에서 제외하며, 수상 후 해당 사실이 확인될 경우 수상을 취소하고 상금을 회수합니다.",
        "이미지·영상·음원·서체 등 제3자의 저작물을 활용한 경우, 주최 측의 요청에 따라 해당 저작물의 이용권한 및 출처에 관한 증빙자료를 제출합니다.",
        "출품작의 법적분쟁(초상권, 저작권, 지적재사권 등)에 관한 문제가 발생할 경우 응모자 본인이 민·형사상 책임을 집니다.",
        "수상작에 한해 수정, 변경이 가능한 원본 파일을 주최 측의 요청에 따라 제출합니다.",
        "출품자는 출품작이 제3자의 저작권을 침해하지 않도록 주의의무를 다하여야 합니다.",
        "주최자는 수상작을 3년간 비영리·공익 목적의 범위에서 복제·전송·배포·전시할 수 있습니다.",
        "주최자는 수상자로부터 별도의 허락을 받아 2차적저작물을 작성할 수 있습니다.",
    ]
    circ = "①②③④⑤⑥⑦⑧⑨⑩"
    pl = "".join(f'<p class="pl">{circ[i]} {E(t)}</p>' for i, t in enumerate(pledges))
    notes = [
        "출품 시 참가신청서의 모든 사항을 반드시 기재",
        "출품한 작품은 일체 반환하지 않음",
        "출품작 수 및 수준(심사위원 결정)에 따른 수상작 수 및 행사 일정에 따른 공모·심사·수상작 발표 일정 등은 변경될 수 있음",
        "출품작 제작 시  생성형 AI 프로그램 활용은 가능하나, 상업적 이용이 허용되고 저작권·이용약관상 문제가 없는 도구 및 결과물을 사용해야 함",
        "출품작이 심사기준에 적합하지 않은 경우 심사에서 제외되며, 심사결과에 따라 수상작을 선정하지 않을 수 있음",
        "신청서 및 출품작을 누락하거나, 중요 사항에 대해 오기한 자는 심사에서 제외되며 책임은 응모자에게 있음",
        "주최 측은 수상하지 않은 응모작을 공모전 종료일로부터 3개월 이내에 모두 폐기하며, 수상하지 않은 응모작 대한 유출방지 등 주의의무를 다하도록 함",
        "수상작에 한해 수정, 변경이 가능한 원본 파일 제출을 요청할 수 있음",
        "출품작에 대한 저작권은 응모자에게 있음, 다만 주최자는 수상작을 사전에 고지한 목적 범위 내에서 주최자가 관리하는 누리집, SNS 채널(유튜브, 인스타그램, 블로그, X, 페이스북)에 게재할 수 있음",
        "향후, 수상자(저작자)는 주최 측이 동 건 저작물을 공모전의 취지·목적을 달성하기 위해 필요한 한도 내에서 이용할 수 있도록 함",
        "이미지·영상·음원·서체 등 제3자의 저작물을 활용한 경우 필요 시 해당 저작물의 이용권한 및 출처에 관한 증빙자료 제출을 요청할 수 있음",
        "지정형식이나 규격을 준수하지 않을 경우 심사에서 제외",
        "응모자 본인의 창작물이 아니거나 표절·도용 사실이 확인된 경우, 이미 타 공모전에서 수상했거나 타 기관 등에서 동일 작품이 활용 중인 경우에는 심사에서 제외하며, 수상 후 해당 사실이 확인될 경우 수상 취소 및 상금 회수 조치함",
        "출품작의 법적분쟁(초상권, 저작권, 지적재산권 등)에 관한 문제가 발생할 경우 응모자 본인에게 민·형사상 책임이 있음",
        "수상자로 선정된 개인 또는 팀은 상금 수령을 위해 추가서류 제출 요청에 응해야 함",
        "상금에 대한 제세공과금은 수상자 본인이 부담함",
    ]
    nt = "".join(f"<p>- {E(t)}</p>" for t in notes)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보 동의서 및 서약사항</title><style>{BASE}
@page {{ size:A4; margin:14mm 18mm 12mm; }}
body {{ font-size:9.6pt; line-height:1.45; }}
p {{ margin:2px 0; }}
.badge {{ display:inline-block; background:#1f3a93; color:#fff; font-weight:700; font-size:12pt; padding:4px 12px; }}
h1 {{ text-align:center; font-size:15pt; margin:10px 0 8px; }}
h2 {{ font-size:11pt; margin:10px 0 4px; }}
.t td, .t th {{ border:1px solid #000; padding:5px 7px; vertical-align:middle; }}
.t th {{ background:#e7e7e7; }}
.dt {{ text-align:center; margin:10px 0 6px; font-size:10.5pt; letter-spacing:1px; }}
.sl {{ text-align:right; margin-right:80px; line-height:2.4; font-size:10.5pt; }}
.pl {{ margin:3px 0 3px 1.2em; text-indent:-1.2em; }}
.pb {{ page-break-before:always; }}
.box {{ border:1px solid #000; padding:8px 12px; }}
</style></head><body>
<span class="badge">붙임 2</span>
<h1>개인정보 수집·이용·제공 동의서 및 서약사항</h1>
<h2 style="text-align:center;font-size:12.5pt">개인정보 수집·이용·제공 동의서</h2>
<p><b>□ 참가자 정보(필수입력사항)</b></p>
<table class="t">
<tr><th style="width:18%">성 &nbsp;명</th><td style="width:32%">{m['name']}</td><th style="width:18%">생년월일</th><td>{m['birth']}</td></tr>
<tr><th>주 &nbsp;소</th><td colspan="3">{m['addr']}</td></tr>
<tr><th>연락처 (휴대전화)</th><td>{m['phone']}</td><th>e-mail</th><td>{m['email']}</td></tr>
</table>
<p style="font-size:8.8pt">※ 팀 참가 시 개인정보 동의서는 팀원 전원이 각각 작성하여 제출</p>
<p><b>□ 개인정보 수집․이용 목적</b></p>
<p>&nbsp;❍ 「개인정보 보호법」 제15조 및 동 시행령 제17조, 「공공기록물 관리에 관한 법률」제19조 및 동 시행령 제26조에 따라 「2026 조달청 AI 게임·콘텐츠 공모전」 개최에 따른 아래사항에 대하여 개인정보를 수집합니다.</p>
<p style="margin-top:8px"><b>□ 개인정보 수집·이용에 관한 동의 여부 (예 ☑, 아니오 □ )</b></p>
<table class="t">
<tr><th>수집항목</th><th>수집 및 이용목적</th><th>보유 및 이용기간</th></tr>
<tr><td>성명, 생년월일, 주소, 휴대전화번호, 전자우편</td><td>공모전 접수, 심사, 결과 발표, 시상, 수상작 공개 및 관련 안내</td>
<td>*심사결과 수상하지 않은 자는 공모전 종료후 개인정보 파기<br>*수상자의 경우 : 상금 지급기간 및 지급종료일로부터 5년</td></tr>
</table>
<p style="font-size:8.8pt">&nbsp;* 공모전 개최 및 상금 지급 업무수행을 위하여 취득한 본인의 개인정보를 보유 및 이용하는 것에 동의합니다.<br>&nbsp;* 만 14세 미만 학생의 경우 보호자(법정대리인)의 동의가 필요합니다.</p>
<p style="margin-top:8px"><b>□ 개인정보의 제3자 제공에 관한 동의 여부 (예 ☑, 아니오 □ )</b></p>
<table class="t">
<tr><th>제공 받는자</th><th>제공 항목</th><th>제공 목적</th><th>보유 및 이용기간</th></tr>
<tr><td>조달청</td><td>성명, 생년월일, 휴대전화번호, 주소</td><td>상금 지급 및 공모전 관리·운영</td><td>상금 지급기간 및 지급 종료일로부터 5년</td></tr>
</table>
<p style="font-size:8.8pt">&nbsp;* 공모전 상금 지급 업무수행을 위하여 취득한 본인의 개인정보 및 상금 지급내역의 자료를 제공하는 것에 동의합니다.<br>&nbsp;* 위의 개인정보의 이용을 동의하지 않으실 경우에는 상금 지급이 제한되며, 해당 개인정보 제공자가 동의한 내용 외에 다른 목적으로 활용하지 않음을 안내하여 드립니다.</p>
<div class="dt">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</div>
<div class="sl">개인정보 제공 동의자 &nbsp; 성명 &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}<br>
보호자(법정대리인) &nbsp; 성명 &nbsp;<span style="color:#000">해당 없음</span> &nbsp;&nbsp;(서명)</div>

<div class="pb"></div>
<h2 style="text-align:center;font-size:12.5pt">2026 조달청 AI 게임·콘텐츠 공모전 서약사항</h2>
<div class="box">{pl}
<p style="margin-top:6px">&nbsp;※ 위 사항에 대하여 동의를 거부할 수 있으며, 동의 거부 시에는 공모전 신청 자격이 제한됩니다. 향후 위의 사항을 준수함은 물론 이의를 제기하지 않을 것을 서약합니다.</p>
<p style="text-align:center;margin:8px 0">예 ( &nbsp;O&nbsp; ) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 아니오 ( &nbsp;&nbsp;&nbsp; )</p></div>
<div class="dt">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</div>
<div class="sl">참가자(대표자) 성명 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}</div>
<p style="text-align:center;font-size:13pt;font-weight:700;margin:6px 0 12px">조달청장 귀하</p>
<div class="box" style="font-size:8.2pt;line-height:1.38"><p><b>유의사항 및 문의처</b></p><p><b>❍ 유의사항</b></p>{nt}
<p><b>❍ 문의사항</b> : 070-7209-3702 / dnccompany3@daum.net</p><p><b>❍ ‘조달청’ 알아보기</b> : (홈페이지) https://www.pps.go.kr</p></div>
</body></html>"""


if __name__ == "__main__":
    pdf(application(), "참가신청서_AI시나리오_박용진.pdf")
    pdf(scenario(), FILE_SCN)
    pdf(consent(), "개인정보동의서_박용진.pdf")
