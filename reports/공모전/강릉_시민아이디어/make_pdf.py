"""강릉 시민 아이디어 공모전 — 지정 제안서 서식(1쪽·2쪽)을 그대로 재현해 채운 PDF."""
import base64
import re
import subprocess
import tempfile
import time
from html import escape
from pathlib import Path

from content import ME, TITLE, OVERVIEW, PROBLEMS, PLAN, SOURCES

HERE = Path(__file__).parent
BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)
OUT = HERE / "박용진_강릉시민아이디어_제안서_재난한장.pdf"
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def cite(t):
    t = escape(t)
    return re.sub(r"\[(\d)\]", r"<sup>[\1]</sup>", t)


def blocks(items):
    out = []
    for kind, val in items:
        if kind == "h":
            out.append(f'<p class="h">{escape(val)}</p>')
        elif kind == "p":
            cls = ' class="note"' if val.startswith("※") else ""
            out.append(f"<p{cls}>{cite(val)}</p>")
        elif kind == "t":
            rows = "".join(f"<tr><th>{escape(a)}</th><td>{escape(b)}</td></tr>" for a, b in val)
            out.append(f'<table class="in card"><tr><th colspan="2" class="cap">재난 한 장 (예시 서식)</th></tr>{rows}</table>')
        elif kind == "s":
            rows = "".join(f"<tr><th>{escape(a)}</th><td>{escape(b)}</td><td>{escape(c)}</td></tr>" for a, b, c in val)
            out.append(f'<table class="in"><tr><th class="cap">계절·재난</th><th class="cap">신호(예보)</th><th class="cap">할 일</th></tr>{rows}</table>')
        elif kind == "c":
            rows = "".join(f"<tr><th>{escape(a)}</th><td>{escape(b)}</td><td><b>{escape(c)}</b></td></tr>" for a, b, c in val)
            out.append(f'<table class="in"><tr><th class="cap">기존 제도</th><th class="cap">지금</th><th class="cap">이 제안</th></tr>{rows}</table>')
    return "\n".join(out)


def blocks_kept(items):
    """소제목은 바로 다음 덩어리와 묶어 쪽 끝에 홀로 남지 않게 한다."""
    html_, i = [], 0
    while i < len(items):
        if items[i][0] == "h" and i + 1 < len(items):
            html_.append('<div class="keep">' + blocks(items[i:i + 2]) + '</div>')
            i += 2
        else:
            html_.append(blocks(items[i:i + 1]))
            i += 1
    return "\n".join(html_)


CSS = """
@page { size:A4; margin:15mm 15mm 14mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#000; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.f td, .f th { border:1px solid #000; padding:6px 8px; vertical-align:middle; font-weight:400; }
.f .lb { background:#f2f2f2; text-align:center; }
.f .tt { text-align:center; font-size:16pt; font-weight:700; letter-spacing:10px; padding:10px; position:relative; border-bottom:2px solid #000; }
.f .tt .pg { position:absolute; right:8px; top:12px; font-size:9pt; letter-spacing:0; font-weight:400; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:40px; transform:translateY(-50%); }
.c { text-align:center; }
.tag { font-weight:700; margin-bottom:4px; }
.pb { page-break-before:always; }
.p2 td, .p2 th { border:1px solid #000; padding:7px 10px; vertical-align:top; }
.p2 .k { width:17%; background:#f2f2f2; font-weight:700; text-align:center; vertical-align:middle; }
.p2 p { margin:3px 0; text-align:justify; }
.p2 p.h { font-weight:700; margin-top:9px; }
.p2 p.h:first-child { margin-top:0; }
.p2 p.note { font-size:8.8pt; color:#333; }
.p2 sup { font-size:7pt; color:#444; }
table.in { margin:4px 0 6px; font-size:9pt; }
table.in th, table.in td { border:1px solid #888; padding:3px 6px; vertical-align:top; line-height:1.4; }
table.in th { background:#f5f5f5; font-weight:700; text-align:left; white-space:nowrap; }
table.in th.cap { background:#e6e6e6; text-align:center; }
table.card th { width:22%; }
tr { page-break-inside:avoid; }
.keep { page-break-inside:avoid; break-inside:avoid; }
.keep:first-child p.h { margin-top:0; }
.src { font-size:8.2pt; line-height:1.4; margin:2px 0; word-break:break-all; }
"""


def html():
    m = ME
    page1 = f"""
<div class="tag">붙임 &nbsp;제안서 양식</div>
<table class="f">
<tr><td colspan="7" class="tt">제 안 서<span class="pg">(1쪽)</span></td></tr>
<tr><td colspan="4" style="width:55%">접수번호</td><td colspan="3">접수일</td></tr>
<tr><td colspan="2" class="lb" style="width:20%">제안 제목</td><td colspan="5"><b>{escape(TITLE)}</b></td></tr>
<tr><td colspan="2" class="lb">동일․유사제안의<br>다른기관 제출여부</td><td colspan="5">【 ✔ 】없음 &nbsp;【 &nbsp;】있음 (제출기관: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;, 제출일시: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
<tr><td rowspan="3" class="lb" style="width:6%">제<br>안<br>자</td><td class="lb" style="width:17%">성명</td><td colspan="3">{m['name']}</td><td class="lb" style="width:12%">생년월일</td><td>{m['birth']}</td></tr>
<tr><td class="lb">전화번호</td><td colspan="5">{m['phone']} &nbsp;(전자우편: {m['email']})</td></tr>
<tr><td class="lb">주소 또는<br>소속∙직급(직위)</td><td colspan="5">{m['addr']} / {m['job']}</td></tr>
<tr><td colspan="3" class="lb">※ 제안과 동일내용으로 표창∙상금 수여<br>및 특허 등 출원∙등록 여부</td><td colspan="4" class="c">해당 없음</td></tr>
<tr><td colspan="7" style="padding:14px 10px">
<p class="c" style="margin:0 0 14px">「강릉시 시민 제안 운영 조례」 제5조에 따라 제안서를 제출합니다.</p>
<p class="c" style="margin:0 0 12px">{m['y']}년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일</p>
<p style="text-align:right;margin:0 30px 6px 0">제안자 성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}</p>
</td></tr>
<tr><td colspan="7" style="padding:10px 12px">
<p class="c" style="font-weight:700;margin:0 0 6px">◈ 개인정보 수집이용 동의 ◈</p>
<p style="margin:0 0 4px">❍ 개인정보 수집‧이용 내역</p>
<table class="in" style="font-size:9.5pt"><tr><th class="cap">수집 및 이용 항목</th><th class="cap">수집 및 이용 목적</th><th class="cap">보유기간</th></tr>
<tr><td class="c">성명, 생년월일, 전화번호, 주소, 소속, 직급(직위)</td><td class="c">제안 심사 결과 통보 등<br>공모 운영</td><td class="c">3년</td></tr></table>
<p style="font-size:9pt;margin:6px 0">※ 참가자는 개인정보 수집이용에 대한 동의를 거부할 권리가 있습니다. 다만, 위 개인정보는 공모전 운영에 필요한 정보이므로 동의를 거부할 경우 응모 접수에서 제외됩니다.</p>
<p style="margin:6px 0">❍ 개인정보 수집 및 제3자에게 개인정보 제공: <b>(동의함 ■ &nbsp;&nbsp;동의하지 않음 □)</b></p>
<p class="c" style="margin:12px 0 10px">{m['y']}년 &nbsp;&nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;&nbsp;{m['d']}일</p>
<p style="text-align:right;margin:0 30px 10px 0">제안자 성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}</p>
<p style="font-size:12pt;font-weight:700;margin:6px 0 0 12px">강릉시장 귀하</p>
</td></tr>
</table>"""
    srcs = "".join(f'<p class="src">[{i}] {escape(t)}<br>&nbsp;&nbsp;&nbsp;&nbsp;{escape(u)}</p>' for i, (t, u) in enumerate(SOURCES, 1))
    page2 = f"""
<div class="pb"></div>
<table class="p2">
<tr><td colspan="2" style="text-align:right;border:none;border-bottom:1px solid #000;padding:2px 4px">(2쪽)</td></tr>
<tr><td class="k">1. 제안 제목</td><td><b>{escape(TITLE)}</b></td></tr>
<tr><td class="k">2. 개 요</td><td>{''.join(f'<p>{escape(t)}</p>' for t in OVERVIEW)}</td></tr>
<tr><td class="k">3. 현황 및<br>문제점</td><td>{blocks_kept(PROBLEMS)}</td></tr>
<tr><td class="k">4. 개선방안<br><span style="font-weight:400">(개선내용)</span></td><td>{blocks_kept(PLAN)}
<p class="h">사. 근거 자료</p>{srcs}
<p class="note" style="margin-top:6px">※ 자료 조사와 초안 작성에 생성형 AI(Claude)를 활용했으며, 내용 확인과 최종 판단은 제안자가 했습니다.</p></td></tr>
</table>"""
    return f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제안서</title><style>{CSS}</style></head><body>{page1}{page2}</body></html>'


def main():
    src = BUILD / "제안서.html"
    src.write_text(html(), encoding="utf-8")
    prof = tempfile.mkdtemp(prefix="chrome_gn_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={prof}", f"--print-to-pdf={OUT}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(OUT, OUT.exists())


if __name__ == "__main__":
    main()
