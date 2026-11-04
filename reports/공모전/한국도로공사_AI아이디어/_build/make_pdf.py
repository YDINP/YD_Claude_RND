"""기획서 PDF + 참가신청서·개인정보 동의서 PDF (HTML → Chrome headless)."""
import base64, re, subprocess, time
from pathlib import Path

import content as C

HERE = Path(__file__).parent
OUT = HERE.parent
SIG = "data:image/png;base64," + base64.b64encode((OUT / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
M = C.ME

BASE_CSS = """
@page { size:A4; margin:13mm 14mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.6pt; color:#111; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:44px; transform:translateY(-50%); }
"""


def sign(label="(서명)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def blocks(bs):
    out = []
    for b in bs:
        k = b[0]
        if k == "h":
            out.append(f"<h4>{b[1]}</h4>")
        elif k == "p":
            out.append(f"<p>{b[1]}</p>")
        elif k == "b":
            out.append(f"<ul><li>{b[1]}</li></ul>")
        elif k == "box":
            out.append(f'<div class="box">{b[1]}</div>')
        elif k == "t":
            head, rows = b[1], b[2]
            ws = b[3] if len(b) > 3 else [None] * len(head)
            h = "".join(f'<th style="width:{w}%">{x}</th>' if w else f"<th>{x}</th>" for x, w in zip(head, ws))
            r = "".join("<tr>" + "".join(f"<td>{x}</td>" for x in row) + "</tr>" for row in rows)
            out.append(f'<table class="g"><thead><tr>{h}</tr></thead>{r}</table>')
        elif k == "fig":
            out.append(FLOW)
    html = "\n".join(out).replace("</ul>\n<ul>", "")
    return re.sub(r"\[(\d)\]", r"<sup>[\1]</sup>", html)


FLOW = """<svg viewBox="0 0 720 196" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="11.5">
<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#1d4e89"/></marker></defs>
<rect x="0" y="0" width="720" height="196" rx="6" fill="#f5f8fc"/>
<g>
<rect x="10" y="14" width="150" height="72" rx="6" fill="#fff" stroke="#9fb4cc"/>
<text x="85" y="34" text-anchor="middle" font-weight="700">공사가 가진 기록</text>
<text x="85" y="52" text-anchor="middle">입구 영업소·시각</text><text x="85" y="67" text-anchor="middle">출구 영업소·시각·차종</text><text x="85" y="82" text-anchor="middle" fill="#555">+ 구간 속도(VDS·DSRC)</text>
</g>
<line x1="160" y1="50" x2="186" y2="50" stroke="#1d4e89" stroke-width="2" marker-end="url(#ar)"/>
<rect x="188" y="14" width="160" height="72" rx="6" fill="#e3ecf7" stroke="#1d4e89"/>
<text x="268" y="34" text-anchor="middle" font-weight="700" fill="#1d4e89">AI ① 쉬었나?</text>
<text x="268" y="53" text-anchor="middle">정상 통행시간 대비 초과분을</text><text x="268" y="68" text-anchor="middle">정체 / 휴식으로 판별</text>
<line x1="348" y1="50" x2="374" y2="50" stroke="#1d4e89" stroke-width="2" marker-end="url(#ar)"/>
<rect x="376" y="14" width="160" height="72" rx="6" fill="#e3ecf7" stroke="#1d4e89"/>
<text x="456" y="34" text-anchor="middle" font-weight="700" fill="#1d4e89">AI ② 지금 어디쯤?</text>
<text x="456" y="53" text-anchor="middle">주행 중 차량을 구간에 배분</text><text x="456" y="68" text-anchor="middle">(30분 단위 nowcast)</text>
<line x1="536" y1="50" x2="562" y2="50" stroke="#1d4e89" stroke-width="2" marker-end="url(#ar)"/>
<rect x="564" y="14" width="146" height="72" rx="6" fill="#1d4e89"/>
<text x="637" y="34" text-anchor="middle" font-weight="700" fill="#fff">AI ③ 졸음위험지수</text>
<text x="637" y="53" text-anchor="middle" fill="#fff">구간 × 30분</text><text x="637" y="68" text-anchor="middle" fill="#fff">졸음사고 통계로 학습</text>
<line x1="637" y1="86" x2="637" y2="108" stroke="#1d4e89" stroke-width="2" marker-end="url(#ar)"/>
<text x="12" y="126" font-weight="700" fill="#333">예보 화면 (예시)</text>
<g font-size="10.5">
<text x="12" y="146">○○선 ○○IC→○○JC  02:00~03:30</text>
<rect x="210" y="136" width="230" height="12" fill="#e8edf3"/><rect x="210" y="136" width="196" height="12" fill="#c0392b"/>
<text x="448" y="146">위험 높음 · 3시간+ 무휴식 화물차 비중↑</text>
<text x="12" y="166">○○선 ○○IC→○○IC  03:00~04:30</text>
<rect x="210" y="156" width="230" height="12" fill="#e8edf3"/><rect x="210" y="156" width="132" height="12" fill="#e67e22"/>
<text x="448" y="166">주의 · 장거리 승용 귀가 차량</text>
<text x="12" y="186">○○선 ○○JC→○○IC  01:00~02:30</text>
<rect x="210" y="176" width="230" height="12" fill="#e8edf3"/><rect x="210" y="176" width="64" height="12" fill="#f1c40f"/>
<text x="448" y="186">보통</text>
</g>
<text x="708" y="190" text-anchor="end" font-size="9.5" fill="#777">※ 구간명·막대는 설명용 가상 예시</text>
</svg>"""


def idea_html():
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>AI 아이디어 기획서</title><style>{BASE_CSS}
@page {{ margin:11mm 13mm; }} body {{ line-height:1.46; }}
:root {{ --n:#1d4e89; --nl:#e3ecf7; }}
.doc {{ text-align:center; font-size:15pt; font-weight:700; margin:0 0 6px; letter-spacing:2px; }}
.f td, .f th {{ border:1px solid #000; padding:5px 8px; vertical-align:middle; font-size:9.8pt; }}
.f th {{ background:#eceff3; font-weight:700; text-align:center; }}
.sec {{ background:#d9e1ea; border:1px solid #000; padding:5px 8px; font-weight:700; font-size:11pt; margin-top:8px; }}
.sub {{ border:1px solid #000; border-top:none; padding:6px 10px 8px; }}
.sub > .lab {{ font-weight:700; font-size:10.6pt; margin-bottom:3px; }}
.hero {{ background:var(--n); color:#fff; padding:10px 14px; border-radius:5px; margin:8px 0 2px; }}
.hero b {{ font-size:13pt; }} .hero div {{ font-size:9.4pt; opacity:.92; margin-top:2px; }}
h4 {{ font-size:10pt; color:var(--n); margin:7px 0 3px; }}
p {{ margin:3px 0; }} ul {{ margin:2px 0 2px 16px; padding:0; }} li {{ margin:2px 0; }}
.g td, .g th {{ border:1px solid #b9c6d6; padding:4px 6px; vertical-align:top; font-size:9.1pt; line-height:1.42; }}
.g th {{ background:var(--nl); text-align:left; }}
.g {{ margin:4px 0; }} .g tr {{ page-break-inside:avoid; }} h4 {{ page-break-after:avoid; }}
.box {{ border:1.5px solid var(--n); background:#f5f8fc; border-radius:5px; padding:6px 10px; margin:6px 0 2px; }}
sup {{ font-size:7pt; color:#1d4e89; }}
.src {{ font-size:7.8pt; color:#444; line-height:1.4; }}
</style></head><body>
<div class="doc">아이디어 기획서</div>
<div class="sec" style="margin-top:4px">1. 기본 정보</div>
<table class="f">
<tr><th style="width:17%">참가형태</th><td colspan="3">□ 팀 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ■ 개인</td></tr>
<tr><th>팀 명</th><td colspan="3">해당 없음 (개인 참가)</td></tr>
<tr><th>참가자정보</th><th style="width:22%">이름</th><th style="width:26%">연락처</th><th>이메일</th></tr>
<tr><th>대표자</th><td style="text-align:center">{M['name']}</td><td style="text-align:center">{M['phone']}</td><td style="text-align:center">{M['email']}</td></tr>
<tr><th>아이디어 제목</th><td colspan="3"><b>{C.TITLE}</b></td></tr>
</table>
<div class="hero"><b>{C.TITLE_SHORT}</b><div>{C.SUBTITLE}</div></div>

<div class="sec">2. 아이디어 내용</div>
<div class="sec" style="margin-top:0;border-top:none;background:#eef2f6;font-size:10.4pt">2-1 아이디어 제안 배경 및 목표</div>
<div class="sub"><div class="lab">1) 해결하고자 하는 문제</div>{blocks(C.PROBLEM)}</div>
<div class="sub"><div class="lab">2) AI 활용 필요성 및 달성목표</div>{blocks(C.NEED)}</div>
<div class="sec" style="margin-top:6px;background:#eef2f6;font-size:10.4pt">2-2 AI 활용 아이디어</div>
<div class="sub"><div class="lab">1) 아이디어 개요</div>{blocks(C.OVERVIEW)}</div>
<div class="sub"><div class="lab">2) 필요데이터 및 AI 기술</div>{blocks(C.DATA)}</div>
<div class="sec" style="margin-top:6px;background:#eef2f6;font-size:10.4pt">2-3 활용방안 및 기대효과</div>
<div class="sub">{blocks(C.EFFECT)}</div>
<p class="src" style="margin-top:8px"><b>근거 자료</b><br>{'<br>'.join(f'[{i}] {t} ({u})' for i, (t, u) in enumerate(C.SOURCES, 1))}<br>
※ 자료 조사와 초안 작성에 생성형 AI(Claude)를 활용했으며, 내용 확인과 최종 판단은 제안자가 했습니다.</p>
</body></html>"""


def forms_html():
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참가신청서</title><style>{BASE_CSS}
body {{ font-size:10.5pt; }}
h1 {{ text-align:center; font-size:17pt; margin:6px 0 16px; }}
.f td, .f th {{ border:1px solid #000; padding:8px 9px; vertical-align:middle; }}
.f th {{ background:#eceff3; }}
.f .c {{ text-align:center; }}
.oath p {{ margin:5px 0; line-height:1.75; }}
.date {{ text-align:right; margin:16px 60px 6px 0; font-size:11pt; }}
.signline {{ text-align:right; margin-right:60px; font-size:11pt; }}
.ag {{ border:1px solid #000; padding:12px 16px; line-height:1.85; }}
.ag h3 {{ margin:8px 0 2px; font-size:10.8pt; }}
</style></head><body>
<h1>한국도로공사 AI 활용 아이디어 공모전 참가신청서</h1>
<table class="f">
<tr><th style="width:15%">참가구분</th><td colspan="3">■ 개인 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 팀</td></tr>
<tr><th>참가자</th><th class="c" style="width:22%">이름</th><th class="c" style="width:28%">휴대폰 번호</th><th class="c">이메일</th></tr>
<tr><th>대표자</th><td class="c">{M['name']}</td><td class="c">{M['phone']}</td><td class="c">{M['email']}</td></tr>
<tr><th>팀원1</th><td class="c">-</td><td class="c">-</td><td class="c">-</td></tr>
<tr><th>팀원2</th><td class="c">-</td><td class="c">-</td><td class="c">-</td></tr>
<tr><th>제목</th><td colspan="3"><b>{C.TITLE}</b></td></tr>
<tr><td colspan="4" class="oath" style="padding:12px 16px">
<p>상기 본인은 『한국도로공사 AI 활용 아이디어 공모전』에 출품함에 있어, 다음 각 호의 규정을 준수할 것을 서약합니다.</p>
<p>&nbsp;&nbsp;1. 공모전 제반 규정을 준수하며, 이를 준수하지 않을 경우 어떠한 조치도 감수한다.</p>
<p>&nbsp;&nbsp;2. 출품작에 대한 저작권으로 인하여 발생하는 민ㆍ형사상 책임은 출품자에게 있다.</p>
<p>&nbsp;&nbsp;3. 타 경진대회 수상작, 대리작 및 타인의 저작물을 표절, 도용, 중복 응모한 경우 부정행위로 간주하여 심사에서 제외하며, 수상 이후에 그 사실이 밝혀질 경우 수상취소 및 상금 등 환수 조치에 동의한다.</p>
<p>&nbsp;&nbsp;4. 수상작은 공모전의 취지 및 목적에 따라 공공서비스 개선, AI 서비스 발굴·검토 등을 위한 자료로 활용될 수 있음에 동의한다.</p>
<p style="margin-top:12px;text-align:center">신청서 및 서약서 내용이 모두 사실임을 확인하며, 허위사실 기재 등으로 인하여 어떠한 문제가 발생했을 시, 모든 책임은 본인에게 있음을 확인합니다.</p>
<div class="date">{M['y']}년 &nbsp;{M['m']}월 &nbsp;{M['d']}일</div>
<div class="signline">신청인(대표자) &nbsp;<b>{M['name']}</b> &nbsp;&nbsp;{sign()}</div>
<p style="text-align:center;font-size:13pt;font-weight:700;margin-top:22px">한국도로공사사장 귀하</p>
</td></tr>
<tr><th>첨부</th><td colspan="3">1. 개인정보 수집·이용 동의서 1부.<br>2. 기획서 1부.</td></tr>
</table>

<div class="pb"></div>
<h1 style="font-size:15pt;line-height:1.5">「한국도로공사 AI 활용 아이디어 공모전」<br>개인정보 수집･이용 동의서</h1>
<div class="ag">
<p style="text-align:center;font-weight:700">【개인정보 수집･이용 동의 안내】</p>
<h3>가. 개인정보 수집･이용 목적</h3>
<p>◦ ｢한국도로공사 AI 활용 아이디어 공모전｣에서 수집되는 개인정보는 정보주체의 동의를 얻어 ‘수상작 선정평가 및 공모전 운영·관리를 목적’으로 이용 됩니다.</p>
<h3>나. 개인정보 수집 항목</h3>
<p>◦ 성명, 휴대전화 번호, 이메일 주소</p>
<h3>다. 개인정보의 보유･이용기간</h3>
<p>◦ 수집된 개인정보는 공모전 결과 발표일로부터 1년 이내 폐기합니다.<br>&nbsp;&nbsp;&nbsp;다만, 본 공모전에서 수상한 제안자의 동의를 얻어 5년의 기간 동안 폐기하지 아니할 수 있습니다.</p>
<h3>라. 개인정보 수집･이용에 동의하지 않을 권리 및 동의하지 않을 경우의 불이익</h3>
<p>◦ 정보주체는 ｢한국도로공사 AI 활용 아이디어 공모전｣에 개인정보 수집･이용의 동의를 거부할 권리가 있습니다.</p>
<p>◦ 개인정보 수집･이용에 동의하지 않을 경우, 본 공모전에 참가신청이 불가합니다.</p>
<p style="margin-top:14px"><b>▩ 본인은 ｢한국도로공사 AI 활용 아이디어 공모전｣에서 본인의 개인정보를 수집･이용하는 것에 동의합니다.</b></p>
<p style="text-align:center;font-size:11pt">(동의함 ■ &nbsp;&nbsp;&nbsp;동의하지 않음 □)</p>
<div class="date" style="margin-top:20px">{M['y']}년 &nbsp;{M['m']}월 &nbsp;{M['d']}일</div>
<div class="signline" style="margin-bottom:10px">본인 &nbsp;<b>{M['name']}</b> &nbsp;&nbsp;{sign()}</div>
</div>
</body></html>"""


def pdf(html, name):
    src = HERE / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = OUT / (name + ".pdf")
    if out.exists():
        out.unlink()
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / 'prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    pdf(idea_html(), "박용진_AI아이디어기획서_쉬지않은차지도")
    pdf(forms_html(), "박용진_참가신청서_개인정보동의서")
