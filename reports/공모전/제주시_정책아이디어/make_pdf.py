"""서식1(제안서)·서식2(개인정보 활용 동의서)를 원본 서식 문구대로 재현해 PDF로 만든다."""
import base64, subprocess, tempfile, time
from html import escape as E
from pathlib import Path

from content import ME, TASK, TITLE, SUMMARY, BODY, SOURCES

HERE = Path(__file__).parent
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = HERE / "박용진_제주시 정책 공모전_제안서·동의서.pdf"

CSS = """
@page { size:A4; margin:10mm 13mm 8mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:13pt; color:#000; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-8px; top:50%; height:46px; transform:translateY(-50%); }
.head { border:1.5px solid #000; display:flex; align-items:center; margin-bottom:10px; }
.head .k { background:#1f3f75; color:#fff; font-weight:700; padding:6px 14px; font-size:13pt; }
.head .t { padding:6px 14px; font-size:16pt; font-weight:700; }
.tag { font-weight:700; font-size:14pt; margin:6px 0 2px; }
.note { font-size:11pt; margin:0 0 6px; }
.sec { font-weight:700; font-size:13pt; margin:8px 0 4px; }
.f td { border:1px solid #000; padding:5px 8px; vertical-align:middle; font-size:13pt; }
.f .lb { background:#e9eef6; text-align:center; font-weight:700; width:17%; white-space:nowrap; }
.body h4 { font-size:13pt; margin:12px 0 4px; }
.body h4:first-child { margin-top:2px; }
.body p { margin:3px 0; text-align:justify; }
.body ul { margin:2px 0 2px 0; padding-left:16px; }
.body li { margin:3px 0; text-align:justify; }
.it td, .it th { border:1px solid #777; padding:3px 6px; font-size:12pt; vertical-align:top; }
.it th { background:#f0f3f8; }
.it td:first-child { white-space:nowrap; }
.it { margin:4px 0 6px; }
.box { border:1.5px solid #1f3f75; background:#f6f8fc; padding:6px 10px; margin:6px 0; font-size:12pt; }
.src { font-size:10pt; line-height:1.45; margin-top:10px; }
.decl { text-align:center; padding:14px 0 10px; }
.consent p { margin:4px 0; }
.consent .q { font-weight:700; margin:10px 0 18px; }
"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def body_html():
    out, ul = [], False
    for kind, v in BODY:
        if kind != "li" and ul:
            out.append("</ul>"); ul = False
        if kind == "h":
            out.append(f"<h4>{E(v)}</h4>")
        elif kind == "p":
            out.append(f"<p>{E(v)}</p>")
        elif kind == "li":
            if not ul:
                out.append("<ul>"); ul = True
            out.append(f"<li>{E(v)}</li>")
        elif kind == "table":
            head, *rows = v
            t = "<table class='it'><tr>" + "".join(f"<th>{E(c)}</th>" for c in head) + "</tr>"
            t += "".join("<tr>" + "".join(f"<td>{E(c)}</td>" for c in r) + "</tr>" for r in rows)
            out.append(t + "</table>")
        elif kind == "box":
            out.append("<div class='box'><b>" + E(v[0]) + "</b><br>" + "<br>".join(E(x) for x in v[1:]) + "</div>")
    if ul:
        out.append("</ul>")
    out.append("<div class='src'><b>근거 자료</b><br>" + "<br>".join(f"{i}. {E(s)}" for i, s in enumerate(SOURCES, 1)) + "</div>")
    return "\n".join(out)


def html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>정책 아이디어 제안서</title><style>{CSS}</style></head><body>
<div class="head"><div class="k">서식</div><div class="t">정책 아이디어 제안서 (국민 제출 서식)</div></div>
<div class="tag">&lt;서식 1&gt; 제안서 (필수 제출)</div>
<p class="note">※ 아래의 사항을 참고하여 자유롭게 기술(글자크기 13point), 5페이지 이내로 작성</p>
<table class="f">
<tr><td colspan="6" class="sec" style="border:none;padding-left:0">□ 제안자 인적사항</td></tr>
<tr><td class="lb">성&nbsp;&nbsp;&nbsp;&nbsp;명</td><td style="width:22%">{m['name']}</td><td style="width:10%;text-align:center">({m['sex']})</td>
<td class="lb" style="width:15%">생년월일</td><td colspan="2">{m['birth']}</td></tr>
<tr><td class="lb">주&nbsp;&nbsp;&nbsp;&nbsp;소</td><td colspan="5">{m['addr']}</td></tr>
<tr><td class="lb">연 락 처</td><td colspan="3">(휴대전화) {m['phone']}</td><td colspan="2">(이 메 일) {m['email']}</td></tr>
<tr><td colspan="6" class="sec" style="border:none;padding-left:0">□ 제안내용</td></tr>
<tr><td class="lb">과 제 명</td><td colspan="5">{E(TASK)}</td></tr>
<tr><td class="lb">제 안 명</td><td colspan="5"><b>{E(TITLE)}</b></td></tr>
<tr><td class="lb">제안요지</td><td colspan="5" style="text-align:justify">{'<br>'.join(E(s) for s in SUMMARY)}</td></tr>
<tr><td class="lb">제안내용</td><td colspan="5" class="body" style="vertical-align:top">{body_html()}</td></tr>
<tr><td colspan="6" class="decl">「제주특별자치도 주민창안제도 운영 조례」 제6조에 따라 제안서를 제출합니다.<br><br>
{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일<br><br>
<div style="text-align:right;margin-right:60px">제안자: &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명)')}</div><br>
<div style="text-align:left;padding-left:16px">제주시장 귀하</div></td></tr>
</table>

<div class="pb"></div>
<div class="tag">&lt;서식 2&gt; 개인정보 활용 동의서 (필수 제출)</div>
<div class="consent" style="border:1.5px solid #000;padding:14px 18px;margin-top:8px">
<p style="text-align:center;font-weight:700;font-size:15pt;margin:4px 0 14px">&lt; 개인정보 제공 및 활용 동의서 &gt;</p>
<p><b>1. 개인정보 수집 및 이용 동의</b></p>
<p>&nbsp;- 제주시에서는 「2026년 제주시 정책 아이디어 공모전」 운영을 위하여 아래와 같이 개인정보를 수집·이용하고자 합니다.</p>
<p>&nbsp;○ 수집항목: 성명, 생년월일, 주소, 연락처, 이메일, 계좌번호(시상금 지급 시)</p>
<p>&nbsp;○ 수집목적: 제안 접수, 심사 진행, 결과 통보, 시상금 지급, 우수제안 활용</p>
<p>&nbsp;○ 보유 및 이용기간: 공모전 종료 후 3년 (또는 시상금 지급 후 5년)</p>
<p>&nbsp;○ 동의 거부 권리: 귀하는 개인정보 수집·이용에 동의하지 않을 권리가 있으나, 동의 거부 시 공모전 참여(접수 및 심사)가 제한될 수 있습니다.</p>
<p class="q">▶ 개인정보 수집 및 이용에 동의하십니까? &nbsp;[■] 동의함 &nbsp;[ &nbsp;] 동의하지 않음</p>
<p><b>2. 제안 내용 공개 및 활용 동의</b></p>
<p>&nbsp;- 제출된 제안서는 제주시 정책 수립 및 추진을 위해 내부적으로 활용되며, 우수 제안의 경우 제목과 주요 내용이 언론보도, 사례집, 홈페이지 등을 통해 대외적으로 공개될 수 있습니다. (단, 제안자의 개인정보는 익명 처리됩니다.)</p>
<p>&nbsp;- 본 제안이 제주시의 정책으로 채택되어 실행될 경우, 그에 대한 권리는 제주시에 귀속됩니다.</p>
<p class="q">▶ 제안 내용 공개 및 정책 활용에 동의하십니까? &nbsp;[■] 동의함 &nbsp;[ &nbsp;] 동의하지 않음</p>
<p style="text-align:center;margin:30px 0 24px">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</p>
<p style="text-align:right;margin:0 60px 30px 0">성명: &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명 또는 인)')}</p>
</div>
</body></html>"""


def main():
    build = HERE / "_build"; build.mkdir(exist_ok=True)
    src = build / "제안서.html"
    src.write_text(html(), encoding="utf-8")
    prof = tempfile.mkdtemp(prefix="chrome-pdf-")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={prof}", f"--print-to-pdf={OUT}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(OUT, OUT.exists())


if __name__ == "__main__":
    main()
