"""서식1(참가신청서)·서식2(개인정보 동의서)를 원본 문구 그대로 채운 hwpx + 서명 PDF.
원본 공고 hwpx 는 데이터로만 읽는다(zip+XML 문자열 처리)."""
import base64, re, subprocess, time, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from content import ME, TITLE, FIELD, INTENT

HERE = Path(__file__).parent
ROOT = HERE.parent
SRC = ROOT / "원본" / "공고문.hwpx"
OUT_HWPX = ROOT / "제출서류(박용진).hwpx"
OUT_PDF = ROOT / "제출서류(박용진).pdf"
SIG = "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


# ---------------- hwpx ----------------
def top_paragraphs(s):
    depth, tops, start = 0, [], 0
    for m in re.finditer(r"<hp:p[ >]|</hp:p>", s):
        if m.group().startswith("</"):
            depth -= 1
            if depth == 0:
                tops.append((start, m.end()))
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return tops


def make_para(p_open, char_id, text):
    return f'{p_open}<hp:run charPrIDRef="{char_id}"><hp:t>{escape(text)}</hp:t></hp:run></hp:p>'


def set_cell(tbl, row, col, lines, valign=None, align=None):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    a = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", a)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    body = tbl[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    cid = re.search(r'<hp:run charPrIDRef="(\d+)"', body).group(1)
    new = "".join(make_para(first, cid, t) for t in lines)
    sub_open = tbl[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return tbl[:sub_a] + sub_open + new + tbl[sub_b:]


def rep(seg, old, new, count=1):
    assert old in seg, old
    return seg.replace(old, new, count)


def fill_form1(p):
    m = ME
    p = set_cell(p, 2, 2, [m["name"]])
    p = set_cell(p, 2, 5, [f"{m['birth']} (남)"])
    p = set_cell(p, 3, 2, [m["phone"]])
    p = set_cell(p, 3, 5, [m["email"]])
    p = set_cell(p, 4, 2, [m["addr"]])
    p = set_cell(p, 5, 2, [TITLE])
    p = rep(p, "<hp:t>□사진 □포스터 □동영상</hp:t>", "<hp:t>□사진 ■포스터 □동영상</hp:t>")
    p = set_cell(p, 6, 2, INTENT, valign="TOP")
    p = rep(p, "<hp:t>2026년    월      일</hp:t>", f"<hp:t>2026년  {m['m']}월  {m['d']}일</hp:t>")
    p = rep(p, "<hp:t>응모자 성명                </hp:t>", f"<hp:t>응모자 성명    {m['name']}    </hp:t>")
    return p


def fill_form2(p):
    m = ME
    p = rep(p, "<hp:t> □ </hp:t></hp:run><hp:run charPrIDRef=\"110\"><hp:t>동의</hp:t>",
            "<hp:t> ■ </hp:t></hp:run><hp:run charPrIDRef=\"110\"><hp:t>동의</hp:t>")
    p = rep(p, "<hp:t>2026년    월     일</hp:t>", f"<hp:t>2026년  {m['m']}월  {m['d']}일</hp:t>")
    p = rep(p, "<hp:t>응모자 성명                </hp:t>", f"<hp:t>응모자 성명    {m['name']}    </hp:t>")
    return p


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def build_hwpx():
    zin = zipfile.ZipFile(SRC)
    s = zin.read("Contents/section0.xml").decode("utf-8")
    tops = top_paragraphs(s)
    head, tail = s[:tops[0][0]], s[tops[-1][1]:]
    p0 = s[tops[0][0]:tops[0][1]]
    p0_clean = p0[:p0.find("</hp:run>") + len("</hp:run>")] + "</hp:p>"   # 구역 정의만 남김
    seg = lambda i: s[tops[i][0]:tops[i][1]]
    idx = {k: next(i for i, (a, b) in enumerate(tops) if k in s[a:b]) for k in
           ["&lt;서식 1. 참가신청서&gt;", "&lt;서식 2."]}
    i_t1, i_f2t = idx["&lt;서식 1. 참가신청서&gt;"], idx["&lt;서식 2."]
    i_f1 = i_t1 + 1
    i_f2 = i_f2t + 1
    t1 = re.sub(r'pageBreak="1"', 'pageBreak="0"', seg(i_t1), count=1)
    xml = head + p0_clean + t1 + fill_form1(seg(i_f1)) + seg(i_f2t) + fill_form2(seg(i_f2)) + tail
    __import__("xml.dom.minidom").dom.minidom.parseString(xml.encode("utf-8"))
    with zipfile.ZipFile(OUT_HWPX, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = xml.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(xml)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    (HERE / "_hwpx_text.txt").write_text(text_of(xml), encoding="utf-8")
    print(OUT_HWPX, OUT_HWPX.stat().st_size)


# ---------------- PDF ----------------
def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def html():
    m = ME
    intent = "".join(f"<p>{escape(t)}</p>" for t in INTENT)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제출서류</title><style>
@page {{ size:A4; margin:11mm 14mm; }}
* {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }}
body {{ font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.5; margin:0; }}
table {{ width:100%; border-collapse:collapse; }}
.pb {{ page-break-before:always; }}
.sw {{ position:relative; display:inline-block; }}
.sig {{ position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }}
.tag {{ font-weight:700; font-size:10.5pt; margin-bottom:6px; }}
.f td {{ border:1px solid #000; padding:4px 7px; vertical-align:middle; }}
.f .h {{ background:#e9eef5; font-weight:700; text-align:center; }}
.f .title {{ font-size:15pt; font-weight:700; text-align:center; padding:12px; letter-spacing:-0.3px; }}
.intent p {{ margin:0 0 3px; font-size:8.7pt; line-height:1.42; text-align:justify; }}
.note {{ font-size:8.2pt; line-height:1.4; padding:5px 9px; }}
.note p {{ margin:2px 0; }}
.pledge {{ text-align:center; font-size:10pt; line-height:1.6; padding:8px 10px 8px; }}
h1 {{ text-align:center; font-size:16pt; margin:6px 0 12px; }}
.g td {{ border:1px solid #000; padding:7px 9px; font-size:9.6pt; vertical-align:middle; }}
.g .h {{ background:#e9eef5; font-weight:700; text-align:center; }}
.sm {{ font-size:9.6pt; line-height:1.65; margin:8px 0; }}
</style></head><body>
<div class="tag">&lt;서식 1. 참가신청서&gt;</div>
<table class="f">
<colgroup><col style="width:9%"><col style="width:9%"><col style="width:29%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:28%"></colgroup>
<tr><td colspan="7" class="title">2026년 전남자치경찰 홍보 콘텐츠 공모전 참가 신청서</td></tr>
<tr><td colspan="2" class="h">접수번호</td><td colspan="5" style="color:#777">No.(기재하지 마세요)</td></tr>
<tr><td rowspan="3" class="h">참가자</td><td class="h">성 &nbsp;명</td><td>{m['name']}</td><td colspan="2" class="h">생년월일(성별)</td><td colspan="2">{m['birth']} (남)</td></tr>
<tr><td class="h">연락처</td><td>{m['phone']}</td><td colspan="2" class="h">전자우편<br>(e-mail)</td><td colspan="2">{m['email']}</td></tr>
<tr><td class="h">주 &nbsp;소</td><td colspan="5">{m['addr']}</td></tr>
<tr><td colspan="2" class="h">작 품 명</td><td colspan="2"><b>{TITLE}</b></td><td colspan="2" class="h">분야</td><td>□사진 ■포스터 □동영상</td></tr>
<tr><td colspan="2" class="h">기획의도<br>(작품설명)</td><td colspan="5" class="intent">{intent}</td></tr>
<tr><td colspan="2" class="h">제출자료</td><td colspan="5">① 출품작 파일 1부<br>② 참가신청서 1부<br>③ 개인정보 제공 및 수집·이용 동의서 1부</td></tr>
<tr><td colspan="7" class="note"><p style="text-align:center;font-weight:700">【 유 의 사 항 】</p>
<p>• 응모작은 타인의 저작권, 초상권, 상표권 등 제3자의 권리를 침해하지 않아야 하며, 이에 대한 모든 법적 책임은 응모자에게 있습니다.</p>
<p>• 응모작에 AI 생성물, 이미지, 폰트 등 외부자료를 활용하는 경우 관련 법령 및 이용 조건을 준수하여야 합니다. 해당 자료의 사용으로 저작권 침해 등 법적 분쟁이 발생할 경우 그 책임은 응모자에게 있습니다.</p>
<p>• 공모작은 본인의 창작물이어야 하며, 다음의 경우 심사에서 제외될 수 있으며 수상이후라도 확인될 경우 수상이 취소되고 상장 및 상금은 반환하여야 합니다.</p>
<p>&nbsp;&nbsp;* 국내‧외 타 공모전에 입상한 작품, 모방 또는 표절, 저작권 등 법적 분쟁의 소지가 있는 경우</p>
<p>• 수상작에 대한 저작재산권(복제권, 전시권, 2차적 저작물 작성권 등)은 시상금 지급을 대가로 주최기관에 양도되며, 디자인 정교화(수정, 보완 및 2차 저작물 작성)를 수행할 수 있습니다.</p>
<p>&nbsp;&nbsp;* 저작권 귀속, 이용허락 등에 관련한 사항은 「저작권법」 등 관계법령에 따름</p></td></tr>
<tr><td colspan="7" class="pledge">본인은 「2026년 전남자치경찰 홍보 콘텐츠 공모전」 유의사항을<br>숙지하고 준수하여 공모전 참가신청서를 제출합니다.<br><br>
2026년 &nbsp;{m['m']}월 &nbsp;{m['d']}일
<div style="text-align:right;margin:6px 40px 0 0">응모자 성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}</div>
<b style="font-size:11.5pt">전남광주통합특별시 전남자치경찰위원장 귀하</b></td></tr>
</table>

<div class="pb"></div>
<div class="tag">&lt;서식 2. 개인정보 활용 동의서&gt;</div>
<h1>개인정보 제공 및 수집‧이용 동의서</h1>
<p class="sm">&nbsp;전남자치경찰위원회는 「2026년 전남자치경찰 홍보 콘텐츠 공모전」 추진에 필요한 개인정보를 아래와 같이 수집‧이용하고자 합니다. 아래 내용을 확인하신 후 동의 여부를 결정하여 주시기 바랍니다.</p>
<table class="g">
<tr><td class="h" style="width:22%">제공·수집·이용 목적</td><td colspan="2">· 공모전 운영 관련 접수, 심사 및 수상작 선정, 시상 등을 위한 개인 인적사항 수집<br>· 참가자 및 수상작 선정 안내<br>· 수상작에 한해 전남자치경찰위원회 홍보 등을 위한 공공의 목적으로 활용</td></tr>
<tr><td class="h">수집 항목</td><td class="h">수집 목적</td><td class="h" style="width:20%">보유 기간</td></tr>
<tr><td>성명, 생년월일, 성별, 주소, 이메일, 연락처, 보호자(법정대리인)의 성명 및 연락처</td><td>응모자 확인 및 연락 등 공모전 운영‧관리</td><td style="text-align:center">공모 접수일로부터 1년</td></tr>
</table>
<p class="sm">&nbsp;수집한 개인정보는 보유 기간 이후 폐기됩니다. 다만 수상작품으로 선정된 경우 초상권 및 저작권 관리를 위해 보관합니다.<br>
&nbsp;개인정보는 공모전 참가 및 작품 선정 이외에 이용하거나 제3자에게 제공하지 않습니다.<br>
&nbsp;참가자는 개인정보 수집 및 이용에 관하여 거부할 권리가 있습니다. 다만, 동의를 거부 할 경우 공모전 참가에 제외되는 등 제한을 받을 수 있습니다.</p>
<table class="g" style="margin-top:6px">
<tr><td colspan="2"><b>[법정대리인 동의서]</b> &nbsp; ※ 참가자가 만 14세 미만일 경우 필히 작성<br>
&nbsp;본인은 미성년자의 법정대리인으로 「2026년 전남자치경찰 홍보 콘텐츠 공모전」에 필요한 개인정보 수집·이용에 동의합니다.</td></tr>
<tr><td class="h" style="width:22%">대리인 성명</td><td style="text-align:right">(인/서명)</td></tr>
<tr><td class="h">대리인 연락처</td><td></td></tr>
<tr><td class="h">대리인과의 관계</td><td></td></tr>
<tr><td colspan="2" style="font-size:8.6pt">※ 개인정보보호법 제22조에 따라 만14세 미만의 아동으로부터 개인정보 수집동의를 받으려면 보호자(법정대리인)의 동의를 받아야 합니다. 법정대리인의 개인정보는 만14세 미만의 아동과의 관계를 확인하는 이외의 용도로는 사용되지 않습니다.</td></tr>
</table>
<p class="sm" style="text-align:center;margin-top:16px">&nbsp;위와 같이 개인정보를 수집‧이용하는데 동의하십니까?</p>
<p style="text-align:center;font-size:11pt">■ 동의 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 동의하지 않음</p>
<p style="text-align:center;font-size:11pt;margin-top:18px">2026년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</p>
<div style="text-align:right;margin-right:50px;font-size:11pt;line-height:2.4">응모자 성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign()}<br>
법정대리인 성명 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</div>
<p style="text-align:center;font-size:12.5pt;font-weight:700;margin-top:26px">전남광주통합특별시 전남자치경찰위원장 귀하</p>
</body></html>"""


def build_pdf():
    src = HERE / "forms.html"
    src.write_text(html(), encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / 'prof'}", f"--print-to-pdf={OUT_PDF}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(OUT_PDF, OUT_PDF.exists())


if __name__ == "__main__":
    build_hwpx()
    build_pdf()
