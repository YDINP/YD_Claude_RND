"""서식1 참가신청서 · 서식2 아이디어 제안 요약서 · 서식3 개인정보 수집·이용 동의서
- PDF: 원본 서식 문구를 HTML로 재현 → Chrome headless 인쇄 (맑은 고딕, 서명 이미지 겹침)
- HWPX: 원본/공고문.hwp(실제 HWPX)에서 해당 서식 문단만 남겨 칸을 채움 (mimetype 무압축 첫 항목, 구조 보존)
실행: python make_forms.py
"""
import base64, re, subprocess, time, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from content import ME, TITLE, BACKGROUND, EFFECT, ROLE_GCGF, ROLE_BANK, ROLE_ETC

HERE = Path(__file__).parent
ROOT = HERE.parent
SRC = ROOT / "원본" / "공고문.hwp"
SIG = "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
M = ME

CSS = """
@page { size:A4; margin:14mm 15mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#000; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.formhead { display:flex; align-items:stretch; border:1px solid #000; margin-bottom:10px; }
.formhead .no { background:#1f3864; color:#fff; font-weight:700; padding:6px 12px; font-size:11pt; }
.formhead .nm { padding:6px 14px; font-weight:700; font-size:11pt; }
.f td { border:1px solid #000; padding:6px 8px; vertical-align:middle; }
.f .lb { background:#e8ecf4; text-align:center; font-weight:700; }
.f .ttl { font-size:16pt; font-weight:700; text-align:center; letter-spacing:2px; border:none; }
.f .rcv { font-size:9pt; text-align:center; }
.ck { font-size:11pt; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:46px; transform:translateY(-50%); }
.sigc { position:relative; display:inline-block; }
.sigc .sig { left:50%; height:40px; transform:translate(-50%,-50%); }
.small { font-size:9pt; line-height:1.55; }
.sec { vertical-align:top !important; padding:8px 12px !important; }
.sec h4 { margin:0 0 4px; font-size:10.5pt; }
.sec p { margin:0; font-size:9.6pt; line-height:1.55; text-align:justify; }
.sec .o { margin:4px 0 0; font-size:9.6pt; line-height:1.5; }
"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def ck(on):
    return "■" if on else "□"


TOPICS = ["경영혁신", "AI·디지털 전환", "재도약", "자유주제"]


def form1():
    topic_cells = "".join(f'<td class="lb" style="white-space:nowrap" colspan="{c}">{t}</td>' for t, c in zip(TOPICS, (2, 2, 4, 1)))
    topic_ck = "".join(f'<td class="ck" style="text-align:center;height:38px" colspan="{c}">{ck(t == "재도약")}</td>' for t, c in zip(TOPICS, (2, 2, 4, 1)))
    return f"""
<div class="formhead"><div class="no">서식1</div><div class="nm">공모전 참가신청서</div></div>
<table class="f">
<colgroup><col style="width:15%"><col style="width:14.6%"><col style="width:9%"><col style="width:9%"><col style="width:9.7%"><col style="width:7.3%"><col style="width:7.3%"><col style="width:9.7%"><col style="width:9%"><col style="width:9.4%"></colgroup>
<tr><td colspan="7" class="ttl" style="padding:14px 0">공모전 참가신청서</td><td colspan="2" class="lb rcv">접수번호</td><td class="rcv" style="color:#888">(공란)</td></tr>
<tr><td colspan="2" class="lb">신청구분</td><td colspan="4" class="ck">■ 개인</td><td colspan="4" class="ck">□ 팀(팀명 :&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
<tr><td rowspan="3" class="lb">인적사항<br>(팀 대표자)</td><td class="lb">성 명</td><td colspan="3">{M['name']}</td><td colspan="2" class="lb">이메일</td><td colspan="3">{M['email']}</td></tr>
<tr><td class="lb">생년월일</td><td colspan="3">{M['birth']}</td><td colspan="2" class="lb">연락처</td><td colspan="3">{M['phone']}</td></tr>
<tr><td class="lb" style="height:52px">주 소</td><td colspan="8">{M['addr']}</td></tr>
<tr><td rowspan="2" class="lb">공동제안자<br>(팀 구성원)</td><td class="lb">성명</td><td colspan="2" style="color:#888">해당 없음(개인)</td><td colspan="4"></td><td colspan="2"></td></tr>
<tr><td class="lb">연락처</td><td colspan="2"></td><td colspan="4"></td><td colspan="2"></td></tr>
<tr><td rowspan="2" class="lb">공모주제</td>{topic_cells}</tr>
<tr>{topic_ck}</tr>
<tr><td colspan="10" style="text-align:center;padding:26px 10px;height:190px">
「모두의 소통」 소상공인 성장 및 재도약을 위한 정책 아이디어 공모 안내 및 유의사항에 대해 충분히 읽고 이에 동의하며 참가합니다.<br><br><br>
{M['y']}년 &nbsp;&nbsp;{M['m']}월 &nbsp;&nbsp;{M['d']}일<br><br><br>
응모자(또는 팀 대표) : &nbsp;<b>{M['name']}</b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{sign('(서명 또는 인)')}<br><br>
<b style="font-size:13pt">경기신용보증재단 이사장 귀하</b></td></tr>
<tr><td class="lb">유의사항</td><td colspan="9" class="small">
※ 서명은 반드시 자필로 기재하여 스캔 후 제출하여 주시기 바랍니다.(파일명 : 참가신청서_제안자명)<br>
※ 아래에 해당하는 제안내용은 심사대상에서 제외될 수 있습니다.<br>
&nbsp;&nbsp;1) 공모주제와 무관한 제안, 또는 경기신용보증재단 업무와 무관한 제안<br>
&nbsp;&nbsp;2) 관계법령 등에 위반되는 것<br>
&nbsp;&nbsp;3) 단순한 건의, 비판 또는 요망사항에 불과한 것(단순 불만 및 민원성 제안)<br>
&nbsp;&nbsp;4) 그 밖의 내용이 경미하거나 업무제안으로 볼 수 없는 것<br>
※ 타 기관 공모전에 참가하여 수상한 제안은 응모할 수 없습니다.<br>
※ 제안내용의 표절 등 기타 부정한 방법으로 인한 모든 책임은 제안자에게 있으며, 수상무효‧상금지급 취소 및 환수 처리될 수 있습니다.<br>
※ 우수한 아이디어가 없는 경우 포상하지 않을 수 있습니다.</td></tr>
</table>"""


def form2():
    topic_cells = "".join(f'<td class="lb">{t}</td>' for t in TOPICS)
    topic_ck = "".join(f'<td class="ck" style="text-align:center">{ck(t == "재도약")}</td>' for t in TOPICS)
    return f"""
<div class="formhead"><div class="no">서식2</div><div class="nm">아이디어 제안 요약서</div></div>
<table class="f">
<colgroup><col style="width:25%"><col style="width:18.75%"><col style="width:18.75%"><col style="width:18.75%"><col style="width:18.75%"></colgroup>
<tr><td colspan="3" class="ttl" style="padding:10px 0">아이디어 제안 요약서</td><td class="lb rcv">접수번호</td><td class="rcv" style="color:#888">(공란)</td></tr>
<tr><td class="lb">신청구분</td><td colspan="2" class="ck">■ 개인</td><td colspan="2" class="ck">□ 팀(팀명 :&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
<tr><td rowspan="2" class="lb">공모주제</td>{topic_cells}</tr>
<tr>{topic_ck}</tr>
<tr><td colspan="5" style="padding:6px 12px"><b>제안명</b> &nbsp;{TITLE}</td></tr>
<tr><td colspan="5" class="sec"><h4>■ 정책 아이디어 제안 배경 (500자 이내)</h4><p>{BACKGROUND}</p></td></tr>
<tr><td colspan="5" class="sec"><h4>■ 정책이 실행될 경우 소상공인에게 미치는 효과 (500자 이내)</h4><p>{EFFECT}</p></td></tr>
<tr><td colspan="5" class="sec"><h4>■ 기관별 역할 (정책 관련기관 선택, 500자 이내)</h4>
<div class="o"><b>○ 경기신용보증재단</b> : {ROLE_GCGF}</div>
<div class="o"><b>○ 금융기관(은행)</b> : {ROLE_BANK}</div>
<div class="o"><b>○ 소상공인 유관기관 등</b> : {ROLE_ETC}</div></td></tr>
</table>
<p style="font-size:8.3pt;color:#444;margin:5px 2px 0">※ 근거: 경기신용보증재단 「2025 경기도 소상공인 백서」(92%는 백서 수치로 제안자 계산), 한국은행 경기본부(메트로신문 2026.10.8), 경기도시장상권진흥원(메트로신문 2024.12.16), 한국경제 2026.3.19. 상세 출처는 PPT 11쪽.</p>"""


def form3():
    return f"""
<div class="formhead"><div class="no">서식3</div><div class="nm">개인정보 수집·이용 동의서</div></div>
<h2 style="text-align:center;font-size:17pt;margin:18px 0 14px;letter-spacing:2px">개인정보 수집․이용 동의서</h2>
<p style="border:1px solid #000;padding:10px 12px;margin:0 0 14px">“「모두의 소통」 소상공인 성장 및 재도약을 위한 정책 아이디어 공모전” 신청인의 모든 개인정보는 ‘개인정보보호법’에 의하여 안전하게 보관·관리되며, 이용기간 종료 시 지체 없이 폐기합니다.</p>
<p style="font-weight:700;font-size:11pt;margin:0 0 6px">1. 개인정보 수집․이용 동의</p>
<div style="border:1px solid #000;padding:10px 12px">
<p style="margin:0 0 4px;font-weight:700">1) 개인정보의 수집항목 및 수집방법</p>
<p style="margin:0 0 4px">&nbsp;&nbsp;「모두의 소통」 소상공인 성장 및 재도약을 위한 정책 아이디어 공모전 접수 시 다음의 정보를 수집하고 있습니다.</p>
<p style="margin:0">&nbsp;&nbsp;가. 수집하는 개인정보 항목</p>
<p style="margin:0 0 0 28px">· 필수항목 : 성명, 생년월일, 연락처(전화번호), 이메일, 주소</p>
<p style="margin:0">&nbsp;&nbsp;나. 수상자 추가 수집 항목 (수상자에 한함)</p>
<p style="margin:0 0 8px 28px">· 수상자 선정 시 시상금 지급 및 기타소득 원천징수(지급명세서 제출)를 위해 주민등록번호, 계좌정보 등을 별도로 수집합니다. 응모 단계에서는 수집하지 않습니다.</p>
<p style="margin:0 0 4px;font-weight:700">2) 개인정보의 수집·이용목적 및 보유·이용기간</p>
<p style="margin:0 0 6px">&nbsp;아이디어 공모 접수, 심사와 수상자 선정 및 포상금 지급을 위하여 아래 기간 동안 최소한의 개인정보를 보유 및 이용하게 됩니다.</p>
<table class="f" style="margin-bottom:6px"><tr><td class="lb">수집하는 개인정보의 항목</td><td class="lb">개인정보의 수집․이용 목적</td><td class="lb">보유 및 이용 기간</td></tr>
<tr><td>· 필수항목 : 성명, 생년월일, 연락처, 이메일, 주소</td><td>· 아이디어 공모 접수 및 심사<br>· 심사 후 수상자 선정 및 포상금 지급</td><td>· 미수상자 : 공모전 종료일로부터 3개월 이내 파기<br>· 수상자 : 시상금 지급 및 관련 법령에 따른 보관기간 종료 시까지</td></tr></table>
<p style="margin:0 0 8px;font-size:9.5pt">&nbsp;수상자에 대해서는 당사자의 동의 후 활용목적에 따라 개인정보 보유가 연장될 수 있으며, 연장기간은 당사자와 협의 후 결정합니다.</p>
<p style="margin:0 0 6px;font-weight:700">3) 개인정보 처리업무의 위탁</p>
<table class="f"><tr><td class="lb">수탁자</td><td class="lb">위탁업무</td><td class="lb">보유 및 이용 기간</td></tr>
<tr><td style="text-align:center">㈜인투인미디어</td><td>· 공모전 홈페이지 운영<br>· 응모작 접수·보관<br>· 공모전 홍보 및 시상식 운영지원</td><td style="text-align:center">위탁계약 종료 시까지</td></tr></table>
</div>
<p style="margin:12px 0">정보주체는 필수 개인정보의 수집·이용에 대해 거부할 수 있으며, 동의 거부 시 공모전 진행이 불가할 수 있습니다.</p>
<p style="text-align:center;font-size:11pt;margin:22px 0 16px">{M['y']}년 &nbsp;&nbsp;{M['m']}월 &nbsp;&nbsp;{M['d']}일</p>
<table class="f"><tr><td style="width:56%">■ 필수 개인정보 수집·이용에 동의합니다.</td><td style="width:26%">서명: <b>{M['name']}</b></td><td style="text-align:center;width:18%"><span class="sigc">(인)<img class="sig" src="{SIG}"></span></td></tr></table>
<p style="text-align:center;font-size:13pt;font-weight:700;margin-top:40px">경기신용보증재단 이사장 귀하</p>"""


def pdf(body, title, name):
    html = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body>{body}</body></html>'
    src = HERE / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = ROOT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / '_chrome_prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


# ───────────────────────── HWPX ─────────────────────────
def top_paras(sec):
    out, depth, start = [], 0, None
    for m in re.finditer(r"<hp:p[ >]|</hp:p>", sec):
        if m.group(0) == "</hp:p>":
            depth -= 1
            if depth == 0:
                out.append((start, m.end()))
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return out


def p_xml(text, char, para="20"):
    return f'<hp:p id="0" paraPrIDRef="{para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="{char}"><hp:t>{escape(text)}</hp:t></hp:run></hp:p>'


def run_text(xml, old, new, count=1):
    """<hp:t>old</hp:t> → new (문단 줄나눔 정보는 한글이 다시 계산하도록 linesegarray 제거)."""
    k = f"<hp:t>{old}</hp:t>"
    assert k in xml, old
    return xml.replace(k, f"<hp:t>{escape(new)}</hp:t>", count)


def fill_empty_cell(tbl, col, row, text, char_like=None):
    """빈 칸(cellAddr col,row)의 첫 문단 run 에 글자 넣기."""
    pat = re.compile(r'(<hp:tc\b(?:(?!<hp:tc\b).)*?<hp:cellAddr colAddr="%d" rowAddr="%d"/>)' % (col, row), re.S)
    m = pat.search(tbl)
    assert m, (col, row)
    tc = m.group(1)
    new = re.sub(r'<hp:run charPrIDRef="(\d+)"/>', lambda k: f'<hp:run charPrIDRef="{char_like or k.group(1)}"><hp:t>{escape(text)}</hp:t></hp:run>', tc, count=1)
    return tbl[:m.start()] + new + tbl[m.end():]


def strip_lineseg(x):
    return re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", x, flags=re.S)


def build(keep, fill, out):
    zin = zipfile.ZipFile(SRC)
    sec = zin.read("Contents/section0.xml").decode("utf-8")
    spans = top_paras(sec)
    head, tail = sec[:spans[0][0]], sec[spans[-1][1]:]
    parts = [sec[a:b] for a, b in spans]
    first = re.sub(r"<hp:run charPrIDRef=\"26\"><hp:t>[^<]*</hp:t></hp:run>", "", parts[0])  # 용지 설정만 남기고 공고문 제목 글자 제거
    kept = [first] + [parts[i] for i in keep]
    kept[1] = kept[1].replace('pageBreak="1"', 'pageBreak="0"', 1)
    kept = [strip_lineseg(x) for x in fill(kept)]
    new_sec = head + "".join(kept) + tail
    prv = re.sub(r"<[^>]+>", "", new_sec.replace("</hp:p>", "\r\n"))
    with zipfile.ZipFile(out, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = new_sec.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = prv[:1024].encode("utf-8")
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    print(out, out.exists())


def fill1(kept):
    t = kept[2]
    t = run_text(t, "□ 개인", "■ 개인")
    for (c, r), v in {(2, 2): M["name"], (7, 2): M["email"], (2, 3): M["birth"], (7, 3): M["phone"], (2, 4): M["addr"]}.items():
        t = fill_empty_cell(t, c, r, v)
    # 공모주제: 재도약(c5 r8) 체크
    pat = re.compile(r'(<hp:tc\b(?:(?!<hp:tc\b).)*?<hp:cellAddr colAddr="5" rowAddr="8"/>)', re.S)
    m = pat.search(t)
    t = t[:m.start()] + m.group(1).replace("<hp:t>□</hp:t>", "<hp:t>■</hp:t>", 1) + t[m.end():]
    t = run_text(t, "2026년    월    일", f"{M['y']}년  {M['m']}월  {M['d']}일")
    t = run_text(t, "응모자(또는 팀 대표) :                      (서명 또는 인)", f"응모자(또는 팀 대표) :     {M['name']}           (서명 또는 인)")
    kept[2] = t
    return kept


def fill2(kept):
    t = kept[3]
    t = run_text(t, "□ 개인", "■ 개인")
    pat = re.compile(r'(<hp:tc\b(?:(?!<hp:tc\b).)*?<hp:cellAddr colAddr="3" rowAddr="3"/>)', re.S)
    m = pat.search(t)
    t = t[:m.start()] + m.group(1).replace("<hp:t>□</hp:t>", "<hp:t>■</hp:t>", 1) + t[m.end():]

    def after_header(x, header_end, body_xml):
        i = x.index(header_end) + len(header_end)
        j = x.index("</hp:p>", i) + len("</hp:p>")  # 머리 문단 끝
        # 머리 문단 바로 다음의 빈 문단 하나를 본문으로 교체
        k = re.compile(r'<hp:p [^>]*><hp:run charPrIDRef="\d+"/>(?:<hp:linesegarray>.*?</hp:linesegarray>)?</hp:p>', re.S).match(x, j)
        assert k, header_end
        return x[:j] + body_xml + x[k.end():]

    t = after_header(t, "정책 아이디어 제안 배경 (500자 이내)</hp:t>", p_xml("제안명: " + TITLE, "37") + p_xml(BACKGROUND, "37"))
    t = after_header(t, "정책이 실행될 경우 소상공인에게 미치는 효과 (500자 이내)</hp:t>", p_xml(EFFECT, "37"))
    t = run_text(t, " ○ 경기신용보증재단", " ○ 경기신용보증재단 : " + ROLE_GCGF)
    t = run_text(t, " ○ 금융기관(은행)", " ○ 금융기관(은행) : " + ROLE_BANK)
    t = run_text(t, " ○ 소상공인 유관기관 등", " ○ 소상공인 유관기관 등 : " + ROLE_ETC)
    kept[3] = t
    return kept


def fill3(kept):
    out = []
    for x in kept:
        if "<hp:t>2026년     월     일</hp:t>" in x:
            x = run_text(x, "2026년     월     일", f"{M['y']}년   {M['m']}월   {M['d']}일")
        if "<hp:t>서명: </hp:t>" in x:
            x = x.replace('<hp:t>서명: </hp:t></hp:run><hp:run charPrIDRef="126"><hp:t>             </hp:t>',
                          f'<hp:t>서명: </hp:t></hp:run><hp:run charPrIDRef="126"><hp:t>{M["name"]}</hp:t>', 1)
        out.append(x)
    return out


if __name__ == "__main__":
    pdf(form1(), "참가신청서", "참가신청서_박용진")
    pdf(form2(), "아이디어 제안 요약서", "아이디어제안요약서_박용진")
    pdf(form3(), "개인정보 수집·이용 동의서", "개인정보수집이용동의서_박용진")
    build([73, 74], fill1, ROOT / "참가신청서_박용진.hwpx")
    build([75, 76, 77], fill2, ROOT / "아이디어제안요약서_박용진.hwpx")
    build(list(range(78, 92)), fill3, ROOT / "개인정보수집이용동의서_박용진.hwpx")
