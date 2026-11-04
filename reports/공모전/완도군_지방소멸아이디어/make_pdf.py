"""완도군 지방소멸 대응 아이디어 공모전 — 제안서(붙임1, 제1·2쪽 + 참고자료) PDF, 개인정보 동의서(붙임1-1) PDF.
서식 문구는 원본/완도군_지방소멸대응아이디어공모_공고.hwpx 붙임1·1-1 을 그대로 옮겼다.
HTML → Chrome headless --print-to-pdf (전용 --user-data-dir). 서명은 sign() 으로 겹친다."""
import base64
import html
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from content import (ME, TITLE, TITLE_SHORT, PROBLEMS, PLAN, EFFECTS, COMPARE, SOURCES,
                     KOR_20, KOR_30, FOR_20, FOR_30)

HERE = Path(__file__).parent
BUILD = HERE / "_build"
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
E = html.escape
OUT_PROP = f"박용진-완도 {TITLE_SHORT}_제안서"
OUT_AGREE = "박용진-개인정보 수집·이용 동의서"

BASE_CSS = """
@page { size:A4; margin:14mm 15mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.55; margin:0; background:#fff; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:4px; top:50%; height:44px; transform:translateY(-50%); }
.tag { display:inline-block; border:1px solid #000; padding:1px 10px; font-weight:700; margin-bottom:8px; }
.small { font-size:8.8pt; color:#333; }
"""


def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def paras(lines):
    out = []
    for t in lines:
        cls = ' class="key"' if t.startswith(("→", "「")) else (' class="box"' if t.startswith("【") else "")
        out.append(f"<p{cls}>{E(t)}</p>")
    return "".join(out)


FORM_CSS = """
.f td { border:1px solid #000; padding:6px 8px; vertical-align:middle; }
.f .l { background:#f2f2f2; text-align:center; font-weight:700; }
.f .c { text-align:center; }
.nb { border:none !important; }
.ttl { text-align:center; font-size:17pt; font-weight:700; letter-spacing:10px; padding:12px 0 !important; }
.p2 td { border:1px solid #000; padding:8px 10px; vertical-align:top; }
.p2 .h { font-weight:700; font-size:10.5pt; margin:0 0 4px; }
.p2 p { margin:3px 0; font-size:9.6pt; text-align:justify; }
.p2 p.key { font-weight:700; color:#0b3a5b; }
.p2 p.box { background:#f4f7f9; padding:4px 6px; }
"""


def proposal_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제안서</title><style>{BASE_CSS}{FORM_CSS}</style></head><body>
<div class="tag">붙임1 &nbsp;제안서</div>
<table class="f">
<tr><td colspan="3" class="nb"></td><td class="nb small" style="text-align:right">(제1쪽)</td></tr>
<tr><td colspan="4" class="ttl">제 안 서</td></tr>
<tr><td class="l" style="width:24%">① 제목</td><td colspan="3"><b>{E(TITLE)}</b></td></tr>
<tr><td class="l">② 제출기관</td><td colspan="3"> 전라남도 완도군</td></tr>
<tr><td class="l">③ 동일ㆍ유사제안의<br>다른 기관 제출 여부</td><td colspan="3">[ √ ] 없음 &nbsp;[ &nbsp;] 있음(제출기관: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;, 제출일시: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
<tr><td class="l" rowspan="3">④ 주제안자</td><td class="l" style="width:18%">성 명</td><td colspan="2">{m['name']}</td></tr>
<tr><td class="l">생년월일</td><td colspan="2">{m['birth']}</td></tr>
<tr><td class="l">기여도(%)</td><td colspan="2">100</td></tr>
<tr><td class="l" rowspan="2">⑤ 공동제안자</td><td class="l">성 명</td><td class="l" style="width:30%">생년월일</td><td class="l">기여도(%)</td></tr>
<tr><td class="c small">해당 없음</td><td></td><td></td></tr>
<tr><td class="l">⑥ 처리 상황<br>공개여부</td><td colspan="3">[ √ ] 공개 &nbsp;[ &nbsp;] 비공개(제목 및 채택 여부 제외)</td></tr>
<tr><td class="l" rowspan="3">⑦ 처리 결과<br>통보방식</td><td>[ &nbsp;] SMS<br>(문자 메시지)</td><td colspan="2">휴대전화번호:</td></tr>
<tr><td>[ √ ] 전자우편</td><td colspan="2">전자우편주소: {m['email']}</td></tr>
<tr><td>[ &nbsp;] 우편</td><td colspan="2">주소:</td></tr>
<tr><td colspan="4" class="c" style="padding:16px 6px 10px;border-bottom:none"> 「국민 제안 규정」 제5조 및 「국민 제안 규정 시행규칙」 제2조제1항에 따라 국민제안서를 제출합니다.</td></tr>
<tr><td colspan="4" class="c" style="border-top:none;border-bottom:none;padding:8px">{m['y']}년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일</td></tr>
<tr><td colspan="2" style="text-align:right;border-top:none;border-bottom:none;border-right:none;padding:14px 8px">주제안자 &nbsp;&nbsp;<b>{m['name']}</b></td><td colspan="2" style="border-top:none;border-bottom:none;border-left:none;padding:14px 8px">{sign()}</td></tr>
<tr><td colspan="4" style="border-top:none;padding:14px 10px 18px;font-size:13pt;font-weight:700">완 도 군 수 귀하</td></tr>
<tr><td colspan="4" class="small" style="padding:8px">※ 행정기관의 홈페이지 등 제안자의 신원을 확인할 수 있는 전자적 방법으로 제출하는 경우에는 제안자의 서명을 생략할 수 있습니다.</td></tr>
</table>

<div class="pb"></div>
<table class="p2">
<tr><td class="nb small" style="text-align:right;padding:0 0 4px">(제2쪽)</td></tr>
<tr><td><p class="h">⑧ 현황과 문제점</p>{paras(PROBLEMS)}</td></tr>
<tr><td><p class="h">⑨ 개선방안</p>{paras(PLAN)}</td></tr>
<tr><td><p class="h">⑩ 기대효과</p>{paras(EFFECTS)}</td></tr>
</table>
<p class="small" style="margin-top:6px">※ 첨부: 참고자료(다음 쪽) — 완도 20·30대 구성 그림, 기존 사업과의 차이, 근거 자료</p>

<div class="pb"></div>
{ref_html()}
</body></html>"""


def chart_svg():
    rows = [("20대", KOR_20, FOR_20), ("30대", KOR_30, FOR_30),
            ("20·30대 합계", KOR_20 + KOR_30, FOR_20 + FOR_30)]
    vmax = max(k + f for _, k, f in rows)
    x0, wmax = 120, 470
    out = ['<svg viewBox="0 0 700 190" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="12">',
           '<rect width="700" height="190" fill="#fbfcfd"/>']
    for i, (lab, k, f) in enumerate(rows):
        y = 18 + i * 50
        wk, wf = k / vmax * wmax, f / vmax * wmax
        bold = ' font-weight="700"' if i == 2 else ""
        out.append(f'<text x="10" y="{y + 21}"{bold} fill="#222">{lab}</text>')
        out.append(f'<rect x="{x0}" y="{y}" width="{wk:.1f}" height="30" fill="#9db4c6"/>')
        out.append(f'<rect x="{x0 + wk:.1f}" y="{y}" width="{wf:.1f}" height="30" fill="#0b5a7a"/>')
        out.append(f'<text x="{x0 + 6}" y="{y + 20}" fill="#0d2b3a">주민등록 {k:,}</text>')
        out.append(f'<text x="{x0 + wk + 6:.1f}" y="{y + 20}" fill="#fff">외국인 {f:,}</text>')
        out.append(f'<text x="{x0 + wk + wf + 6:.1f}" y="{y + 20}"{bold} fill="#0b5a7a">{f / (k + f) * 100:.0f}%</text>')
    out.append('<text x="10" y="180" fill="#555" font-size="10.5">주민등록: 2026.10. / 외국인 주민: 행안부 외국인주민 현황 — 기준 시점이 달라 대략 비교. 오른쪽 %는 외국인 비중</text>')
    out.append('</svg>')
    return "".join(out)


def ref_html():
    rows = "".join(f"<tr><td>{E(a)}</td><td>{E(b)}</td><td><b>{E(c)}</b></td></tr>" for a, b, c in COMPARE)
    src = "".join(f"<li>{E(t)}<br><span class='u'>{E(u)}</span></li>" for t, u in SOURCES)
    return f"""<style>
.r h2 {{ font-size:11.5pt; margin:8px 0 4px; color:#0b3a5b; }}
.r .cmp td, .r .cmp th {{ border:1px solid #888; padding:5px 7px; font-size:9.4pt; vertical-align:top; }}
.r .cmp th {{ background:#eef3f6; }}
.r ol {{ margin:2px 0 0 18px; padding:0; font-size:8.1pt; line-height:1.35; }}
.r li {{ margin-bottom:1px; }} .r .u {{ color:#2a5d84; word-break:break-all; }}
.r .lead {{ font-size:10pt; margin:4px 0 8px; }}
</style><div class="r">
<div class="tag">참고자료</div>
<h2>1. 완도에 사는 20·30대 — 거의 둘 중 한 명이 외국인</h2>
{chart_svg()}
<p class="lead">완도 양식업을 떠받치는 젊은 사람은 이미 섬에 와 있습니다. 다만 4년 10개월이 지나면 떠나도록 되어 있고, 군의 정착 정책 대상에도 들어 있지 않습니다. 이 제안은 그 가운데 숙련된 사람이 가족과 함께 남을 수 있도록, 국가 제도(E-7-4·E-7-4R)까지 가는 다리를 완도가 놓자는 것입니다.</p>
<h2>2. 기존 사업과 무엇이 다른가</h2>
<table class="cmp"><tr><th style="width:32%">기존 사업·제도</th><th style="width:28%">하는 일</th><th>이 제안이 더하는 것</th></tr>{rows}</table>
<h2>3. 근거 자료</h2>
<ol>{src}</ol>
<p class="small" style="margin-top:8px">※ 효과 수치(전환 인원·가족 수·비용)는 가정에 따른 추정입니다. 자료조사와 초안 작성에 생성형 AI(Claude)를 활용했고, 내용 판단과 최종 작성은 제안자 본인이 했습니다.</p>
</div>"""


def agree_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보 수집·이용 동의서</title><style>{BASE_CSS}
.ag {{ border:1px solid #000; padding:22px 26px; }}
.ag h1 {{ text-align:center; font-size:17pt; margin:6px 0 22px; letter-spacing:2px; }}
.ag p {{ margin:6px 0; line-height:1.75; }}
.ag .q {{ text-align:center; margin-top:26px; }}
</style></head><body>
<div class="tag">붙임1-1 &nbsp;개인정보 수집·이용 동의서</div>
<div class="ag">
<h1>개인정보 수집ㆍ이용 동의서</h1>
<p>&nbsp;&nbsp;2026년 완도군 지방소멸 대응 아이디어 공모전의 운영을 위해「개인정보보호법」제15조(개인정보의 수집·이용)에 의거하여 아래와 같은 내용으로 개인정보를 수집하고 있습니다. 귀하께서는 아래 내용을 자세히 읽어 보시고, 모든 내용을 이해하신 후에 동의 여부를 결정하여 주시기 바랍니다.</p>
<p style="margin-top:18px;font-weight:700">■ 개인정보의 수집 및 이용 동의서</p>
<p>&nbsp;&nbsp;귀하께서 제공한 모든 정보는 다음의 목적을 위해 활용하며, 아래 목적 이외의 용도로는 사용되지 않습니다.</p>
<p style="margin-top:14px">&nbsp;&nbsp;1. 개인정보 수집 및 이용 목적 : 제안 공모와 선정을 위해서만 사용함</p>
<p>&nbsp;&nbsp;2. 개인정보 수집항목 : 성명, 생년월일, 주소, 연락처, 이메일 등</p>
<p>&nbsp;&nbsp;3. 개인정보 보유 및 이용기간 : 수집․이용 동의일로부터 개인정보의 수집․이용 목적을 달성할 때까지</p>
<p style="margin-top:14px">&nbsp;&nbsp;&nbsp;※ 귀하는 개인정보 수집·이용에 대한 동의를 거부할 수 있습니다.다만, 동의하지 않을 경우, 공모전에 참여할 수 없음을 알려드립니다.</p>
<p class="q">위 동의서 내용을 충분히 숙지하였으며, 개인정보 수집 및 이용하는 것에 동의하시겠습니까?</p>
<p class="q" style="margin-top:10px;font-size:11pt">■ 동의함 &nbsp;&nbsp; □ 동의하지 않음</p>
</div>
<p style="margin-top:34px;text-align:center;font-size:11pt">{m['y']}년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일</p>
<p style="margin-top:22px;text-align:right;padding-right:40px;font-size:11pt">성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;&nbsp;{sign()}</p>
</body></html>"""


def chrome(args, src):
    prof = Path(tempfile.mkdtemp(prefix="chrome-prof-", dir=BUILD))
    try:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--hide-scrollbars",
                        f"--user-data-dir={prof}", *args, src.as_uri()], capture_output=True, timeout=120)
        time.sleep(1)
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def pdf(doc, name):
    src = BUILD / (name + ".html")
    src.write_text(doc, encoding="utf-8")
    out = HERE / (name + ".pdf")
    chrome([f"--print-to-pdf={out}"], src)
    print(out, out.exists())
    return src


def preview(src, png):
    chrome([f"--screenshot={png}", "--window-size=794,1123"], src)


if __name__ == "__main__":
    BUILD.mkdir(exist_ok=True)
    s1 = pdf(proposal_html(), OUT_PROP)
    s2 = pdf(agree_html(), OUT_AGREE)
    preview(s1, BUILD / "prv_prop.png")
    preview(s2, BUILD / "prv_agree.png")
