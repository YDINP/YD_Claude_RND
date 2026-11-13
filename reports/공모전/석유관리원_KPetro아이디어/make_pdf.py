"""원본 양식(첨부2) 구조대로 PDF 3개: 참가신청서(서명), 제안서(3쪽 이내), 서약서(서명).
실행: python -I make_pdf.py
"""
import base64, re, subprocess, sys
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import ME, TITLE, SUBTITLE, FIELD_TEXT, APP_SUMMARY, ROWS, SOURCES  # noqa: E402

BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROF = Path(r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/chrome_ud_kpetro")
FILE = f"K-Petro 혁신아이디어 공모전_{ME['name']}"

CSS = """
@page { size:A4; margin:20mm 20mm 18mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10.5pt; color:#111; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.ttl { display:flex; border:1.5px solid #222; margin-bottom:10px; }
.ttl .ic { width:12%; background:#1f4e9c; }
.ttl .tx { flex:1; text-align:center; font-weight:700; font-size:16pt; padding:8px 0; letter-spacing:-0.5px; }
.g td, .g th { border:1px solid #444; padding:5px 7px; vertical-align:middle; }
.g th { background:#e8edf5; font-weight:700; text-align:center; font-size:10pt; }
.sw { position:relative; display:inline-block; margin-left:14px; }
.sig { position:absolute; left:50%; top:50%; height:44px; transform:translate(-50%,-55%); }
.c { text-align:center; }
"""


def sign():
    return f'<span class="sw">(서명 또는 날인)<img class="sig" src="{SIG}"></span>'


def md(t):
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escape(t)).replace("\n", "<br>")


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


def signblock(lead):
    return f"""<div class="sb">{lead}
<p class="c" style="margin:16px 0">{ME['y']}년 &nbsp;{ME['m']}월 &nbsp;{ME['d']}일</p>
<p style="text-align:right;margin:18px 40px 18px 0">신 청 인 : &nbsp;{ME['name']} &nbsp;&nbsp;&nbsp;{sign()}</p>
<p style="text-align:right;margin:0 40px 6px 0;font-size:12pt">한국석유관리원 이사장 귀하</p></div>"""


def form_app():
    m = ME
    summ = "".join(f"<p class='bl'>◦ {md(x)}</p>" for x in APP_SUMMARY)
    body = f"""
<div class="ttl"><div class="ic"></div><div class="tx">K-Petro 대국민 혁신 아이디어 공모전 참가신청서</div></div>
<table class="g ap"><colgroup><col style="width:15%"><col style="width:12%"><col style="width:12%"><col style="width:8%"><col style="width:8%"><col style="width:13%"><col style="width:6%"><col style="width:8%"><col style="width:18%"></colgroup>
<tr><td colspan="5" style="border:none"></td><th>접수번호</th><td colspan="3" class="c" style="color:#888">접수 담당자가 기재</td></tr>
<tr><th>신청구분</th><td colspan="4">{ck(1)} 개인</td><td colspan="4">{ck(0)} 기관 및 단체 등</td></tr>
<tr><th rowspan="2">제안자</th><th>성 명</th><td colspan="3">{m['name']}</td><th>생년월일</th><td colspan="3">{m['birth']}</td></tr>
<tr><th>연락처<br>(휴대전화)</th><td colspan="3">{m['phone']}</td><th>E-mail</th><td colspan="3">{m['email']}</td></tr>
<tr><th>아이디어명</th><td colspan="8"><b>{escape(TITLE)}</b></td></tr>
<tr><th>참가분야</th><td colspan="2">{ck(0)} 소통 혁신</td><td colspan="4">{ck(0)} 친환경·탄소중립 혁신</td><td colspan="2">{ck(1)} AI·데이터 혁신</td></tr>
<tr><th>아이디어<br>주요내용<br>(요약)</th><td colspan="8" style="vertical-align:top">{summ}</td></tr>
<tr><th rowspan="3">타 공모전<br>참가 여부</th><td colspan="4" rowspan="3">{ck(1)} 아니오</td><td rowspan="3">{ck(0)} 예</td><td colspan="2">제출기관 :</td><td></td></tr>
<tr><td colspan="2">공모시기 :</td><td></td></tr>
<tr><td colspan="2">공모내용 :</td><td></td></tr>
<tr><td colspan="9" class="pi"><p class="c"><b>개인정보의 수집·이용에 대한 동의</b></p>
<p>한국석유관리원 대국민 혁신 아이디어 공모전 개최와 관련하여 아래와 같이 귀하의 개인정보를 수집·이용하기 위하여 「개인정보법」 제15조에 따라 관련 사항을 공지하오니 동의하여 주시기 바랍니다.</p>
<p>◻ 개인정보의 수집․이용 목적 : 한국석유관리원 대국민 혁신 아이디어 공모전 참가에 따른 본인확인, 심사, 선정결과 발표, 포상 등을 위한 용도로만 사용됩니다.</p>
<p>◻ 수집·이용하려는 개인정보 항목 : 성명, 생년월일, 연락처(휴대폰), e-mail</p>
<p>※ 귀하는 개인정보보호법에 의해 개인정보 수집 동의를 거부할 권리가 있으며, 수집에 동의하지 않을 경우 공모전 심사에서 제한될 수 있음을 알려 드립니다.</p></td></tr>
<tr><td colspan="4" class="c">{ck(1)} 동의함</td><td colspan="5" class="c">{ck(0)} 동의하지 않음</td></tr>
<tr><td colspan="9">{signblock('<p class="c" style="margin-top:10px">위와 같이 한국석유관리원 아이디어 공모전에 참가 신청합니다.</p>')}</td></tr>
</table>"""
    extra = """.ap td { font-size:10pt; height:28px; } .bl { margin:2px 0; padding-left:1em; text-indent:-1em; font-size:9.6pt; line-height:1.45; }
.pi p { margin:5px 4px; font-size:9.6pt; } .sb p { font-size:11pt; }"""
    return page("참가신청서", body, extra)


def blocks_html(blocks):
    out = ""
    for k, t in blocks:
        if k == "h":
            out += f'<p class="h">■ {md(t)}</p>'
        elif k == "b":
            out += f'<p class="b">◦ {md(t)}</p>'
        elif k == "s":
            out += f'<p class="s">- {md(t)}</p>'
        else:
            out += f"<p>{md(t)}</p>"
    return out


def form_prop():
    cells = {0: f"<b>{escape(TITLE)}</b><br><span style='font-size:9.5pt'>{escape(SUBTITLE)}</span>", 1: escape(FIELD_TEXT)}
    for i, (_, b) in enumerate(ROWS):
        if b:
            cells[i] = blocks_html(b)
    cells[5] += '<div class="src"><b>출처</b>' + "".join(f"<p>{n}. {escape(x)}</p>" for n, x in enumerate(SOURCES, 1)) + "</div>"
    trs = "".join(f'<tr><th>{escape(h).replace(chr(10), "<br>")}</th><td>{cells[i]}</td></tr>' for i, (h, _) in enumerate(ROWS))
    body = f"""<div class="ttl"><div class="ic"></div><div class="tx">K-Petro 대국민 혁신 아이디어 공모전 제안서</div></div>
<table class="g pr"><colgroup><col style="width:15.5%"><col></colgroup>{trs}</table>
<p style="font-size:8.5pt;margin:3px 0 0">* A4(210 X 297 mm) 3장 이내</p>"""
    extra = """
@page { margin:16mm 18mm 15mm; }
.pr td { font-size:9.4pt; line-height:1.44; vertical-align:top; padding:5px 8px; }
.pr th { vertical-align:middle; }
.pr tr { page-break-inside:auto; }
p.b { margin:2px 0 3px; padding-left:1em; text-indent:-1em; text-align:justify; }
p.s { margin:1px 0 2px 1em; padding-left:0.9em; text-indent:-0.9em; text-align:justify; }
p.h { margin:6px 0 1px; font-weight:700; font-size:9.8pt; color:#1f3f7a; }
p.h:first-child { margin-top:0; }
.src { margin-top:6px; border-top:1px solid #999; padding-top:3px; } .src p { margin:0; font-size:7.3pt; color:#333; line-height:1.3; padding-left:1.2em; text-indent:-1.2em; }
"""
    return page("제안서", body, extra)


def form_pledge():
    items = [
        "1. 제출한 제안내용 중 초상권, 저작권, 명예훼손 등의 문제가 발생할 경우 일체의 법적･도의적 책임은 제안자에게 있습니다.",
        "2. 제출한 제안은 미발표된 순수 창작물이며, 타 공모전 수상 및 타인의 저작물 모방 혹은 표절 등으로 확인되는 등 아래 참가제한 기준에 해당이 없음을 서약하며 참가제한 기준에 해당될 경우 참가 및 수상 취소, 시상내역을 회수함에 동의합니다.",
    ]
    limits = ["단순한 주의환기, 진정, 비판, 건의 또는 불만 등의 표시에 불과한 경우", "기관에서 이미 운영계획이 수립되었거나 정부정책 입안단계에 있는 경우",
              "특정 개인･단체･기업 등의 수익사업 및 홍보와 관련된 사항", "타인이 취득한 특허권･실용신안권, 디자인권, 저작권에 속하는 것",
              "신청서 등의 서류에 허위 정보를 기재한 경우", "타 기관에 동일･유사한 내용으로 기 포상사례가 있는 경우", "기타 사회통념상 그 적용이 불가능하다고 판단되는 경우 등"]
    more = [
        "3. 제출한 제안은 공모전 운영 및 선정, 개발, 평가를 위해 제3자에게 제공될 수 있습니다.",
        "4. 공모전 수상작은 향후 한국석유관리원의 사업 추진, 홍보 등에 활용될 수 있으며, 공모전 취지와 목적을 달성하기 위한 2차 저작물로 활용하는 데 동의합니다. (최초 제안에 대한 수정, 변경 등을 포함)",
        "5. 그 외 제안의 지식재산권과 관련한 협의가 필요할 경우, 제안자와 관리원이 상호 협의하여 정하는 바에 따릅니다.",
        "6. 공고내용 및 심사규정의 제반조건에 동의하며, 이에 따른 결과에 대해 이의를 제기하지 않습니다.",
        "7. 심사위원의 심사 결과에 따라 적합한 제안이 없는 경우, 수상작을 선정하지 않을 수 있습니다.",
        "8. 공모전과 관련하여 본 동의서 제출을 거부할 수 있으나, 제출되지 않을 경우 운영절차 상 부득이하게 공모전 참가 신청 및 심사 등에 제한될 수 있다.",
    ]
    lim = "".join(f"<p>◦ {escape(x)}</p>" for x in limits)
    body = f"""<div class="ttl"><div class="ic"></div><div class="tx">K-Petro 대국민 혁신 아이디어 공모전 서약서</div></div>
<table class="g"><colgroup><col style="width:15%"><col></colgroup>
<tr><th>아이디어명</th><td><b>{escape(TITLE)}</b></td></tr>
<tr><td colspan="2" class="pl"><p>본인은 『2026년 K-Petro 대국민 혁신 아이디어 공모전』에 출품함에 있어, 다음의 사항을 확인하고 다음과 같이 서약합니다.</p>
{''.join(f'<p class="it">{escape(x)}</p>' for x in items)}
<div class="lim">{lim}</div>
{''.join(f'<p class="it">{escape(x)}</p>' for x in more)}
{signblock('')}</td></tr></table>"""
    extra = """.pl { padding:10px 14px; } .pl p { margin:7px 0; font-size:10.3pt; } .it { padding-left:1.2em; text-indent:-1.2em; }
.lim { border:1px solid #666; padding:4px 12px; margin:4px 0 4px 1.2em; } .lim p { margin:2px 0; font-size:9.6pt; }"""
    return page("서약서", body, extra)


if __name__ == "__main__":
    pdf(form_app(), f"{FILE}_1_참가신청서")
    pdf(form_prop(), f"{FILE}_2_제안서")
    pdf(form_pledge(), f"{FILE}_3_서약서")
