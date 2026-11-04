"""상주시 대표축제 공모 — 서식1~6 HWPX 채우기 + 같은 XML 로 PDF 렌더 + 제출 ZIP.
원본 서식(원본/*.hwpx)은 데이터로만 읽는다(zip + XML 문자열 처리)."""
import re
import struct
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import content as C  # noqa: E402
import docgen as D  # noqa: E402
from hwpx2html import Renderer, data_uri  # noqa: E402

ROOT = HERE.parent
SRC = ROOT / "원본"
OUT = ROOT / "제출"
OUT.mkdir(exist_ok=True)
FIG = ROOT / "assets" / "fig"
SIG = (ROOT / "assets" / "sig.png").read_bytes()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ME = C.ME


def png_px(b):
    return struct.unpack(">II", b[16:24])


def tmpl(n):
    f = next(SRC.glob(f"(서식{n})*.hwpx"))
    z = zipfile.ZipFile(f)
    return f, z.read("Contents/section0.xml").decode("utf-8"), z.read("Contents/header.xml").decode("utf-8")


def tops_of(s):
    t = D.top_paragraphs(s)
    return t, (lambda i: s[t[i][0]:t[i][1]])


def text_of(xml):
    lines = []
    for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S):
        t = "".join(re.findall(r"<hp:t>(.*?)</hp:t>", q))
        lines.append(re.sub(r"<[^>]+>", "", t))
    return "\r\n".join(lines)


def package(src, out, section, header, images=(), preview=None):
    zin = zipfile.ZipFile(src)
    with zipfile.ZipFile(out, "w") as z:
        for info in zin.infolist():
            fn = info.filename
            data = zin.read(fn)
            if fn == "Contents/section0.xml":
                data = section.encode("utf-8")
            elif fn == "Contents/header.xml":
                data = header.encode("utf-8")
            elif fn == "Contents/content.hpf" and images:
                s = data.decode("utf-8")
                items = "".join(f'<opf:item id="{iid}" href="BinData/{iid}.png" media-type="image/png" isEmbeded="1"/>' for iid, _ in images)
                s = s.replace('<opf:item id="section0"', items + '<opf:item id="section0"', 1)
                data = s.encode("utf-8")
            elif fn == "Preview/PrvText.txt":
                data = text_of(section)[:1000].encode("utf-8")
            elif fn == "Preview/PrvImage.png" and preview:
                data = preview
            ct = zipfile.ZIP_STORED if fn in ("mimetype", "version.xml", "Preview/PrvImage.png") else zipfile.ZIP_DEFLATED
            z.writestr(zipfile.ZipInfo(fn, date_time=info.date_time), data, compress_type=ct)
            if fn == "Contents/header.xml":
                for iid, b in images:
                    z.writestr(zipfile.ZipInfo(f"BinData/{iid}.png", date_time=info.date_time), b, compress_type=zipfile.ZIP_STORED)
    # 정합성: XML 파싱 확인
    import xml.dom.minidom as md
    with zipfile.ZipFile(out) as z:
        for n in ("Contents/section0.xml", "Contents/header.xml", "Contents/content.hpf"):
            md.parseString(z.read(n))
        assert z.namelist()[0] == "mimetype" and z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
    print("hwpx", out.name, out.stat().st_size)


def pdf(html, name):
    src = HERE / "_html" / f"{name}.html"
    src.parent.mkdir(exist_ok=True)
    src.write_text(html, encoding="utf-8")
    out = OUT / f"{name}.pdf"
    prof = tempfile.mkdtemp(prefix="chr_pdf_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--user-data-dir={prof}",
                    f"--print-to-pdf={out}", src.as_uri()], capture_output=True, timeout=120)
    time.sleep(0.5)
    n = len(re.findall(rb"/Type\s*/Page[^s]", out.read_bytes()))
    print("pdf ", out.name, n, "쪽")
    return out, n


def preview_png(pdf_path):
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        return doc[0].get_pixmap(dpi=40).tobytes("png")
    except Exception:
        return None


def set_cell(tbl, row, col, lines, char_id=None, valign=None):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    a = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", a)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    body = tbl[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    cid = char_id or re.search(r'<hp:run charPrIDRef="(\d+)"', body).group(1)
    new = "".join(f'{first}<hp:run charPrIDRef="{cid}"><hp:t>{escape(t)}</hp:t></hp:run></hp:p>' for t in lines)
    sub_open = tbl[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return tbl[:sub_a] + sub_open + new + tbl[sub_b:]


def rep(seg, old, new):
    assert old in seg, old
    return seg.replace(old, new, 1)


def strip_ls(x):
    return re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", x, flags=re.S)


DATE = f"{ME['y']}년  {ME['m']}월  {ME['d']}일"


def sig_run(cp):
    h = D.Hwpx(None)
    x = h.pic(SIG, png_px(SIG), 20)
    return f'<hp:run charPrIDRef="{cp}">{x}<hp:t/></hp:run>'


def add_sig(seg, label_text, new_text):
    """'…(서명 또는 인)' 문단의 글자를 바꾸고 바로 뒤에 서명 그림 run 을 붙인다."""
    m = re.search(r'<hp:run charPrIDRef="(\d+)"><hp:t>' + re.escape(label_text) + r"</hp:t></hp:run>", seg)
    assert m, label_text
    cp = m.group(1)
    new = f'<hp:run charPrIDRef="{cp}"><hp:t>{escape(new_text)}</hp:t></hp:run>' + sig_run(cp)
    return seg[:m.start()] + new + seg[m.end():]


def finish(n, raw, header, name, images=(), sig=False, page_numbers=False):
    """raw: 줄 배치(lineseg) 정보가 남은 XML — PDF 렌더에 쓰고, HWPX 에는 지운 판을 넣는다."""
    f, _, _ = tmpl(n)
    imgs = {iid: data_uri(b) for iid, b in images}
    r = Renderer(header, imgs, sig_ids=[i for i, _ in images] if sig else [])
    html = r.document(raw, name, page_numbers=page_numbers, tight=sig)
    out_pdf, pages = pdf(html, name)
    package(f, OUT / f"{name}.hwpx", strip_ls(raw), header, images, preview_png(out_pdf))
    return pages


# ─────────────── 서식1 참가신청서 ───────────────
def form1():
    f, s, hx = tmpl(1)
    t, seg = tops_of(s)
    parts = [s[:t[0][0]]]
    for i in range(len(t)):
        x = seg(i)
        if "□ 개인          □ 팀" in x:
            x = rep(x, "□ 개인          □ 팀", "■ 개인          □ 팀")
        if "<hp:t>성명</hp:t>" in x and "생년월일" in x and "주소" in x:
            x = set_cell(x, 0, 1, [ME["name"]]); x = set_cell(x, 0, 3, [ME["birth"]])
            x = set_cell(x, 1, 1, [ME["phone"]]); x = set_cell(x, 1, 3, [ME["email"]])
            x = set_cell(x, 2, 1, [ME["addr"]])
        if "202  년       월       일" in x:
            x = rep(x, "202  년       월       일", DATE)
        if "참가자(대표자) :                            (서명 또는 인)" in x:
            x = add_sig(x, "참가자(대표자) :                            (서명 또는 인)",
                        f"참가자(대표자) :   {ME['name']}              (서명 또는 인)")
        parts.append(x)
    parts.append(s[t[-1][1]:])
    sec = "".join(parts)
    return finish(1, sec, hx, "박용진_서식1_참가신청서", [("image1", SIG)], sig=True)


# ─────────────── 서식4 개인정보 동의서 ───────────────
def form4():
    f, s, hx = tmpl(4)
    s = s.replace("□ 동의                                □ 동의하지 않음", "■ 동의                                □ 동의하지 않음")
    s = s.replace("□ 동의                                 □ 동의하지 않음", "■ 동의                                 □ 동의하지 않음")
    t, seg = tops_of(s)
    parts = [s[:t[0][0]]]
    for i in range(len(t)):
        x = seg(i)
        if "<hp:t>성명</hp:t>" in x and "참가구분" in x:
            x = set_cell(x, 0, 1, [ME["name"]]); x = set_cell(x, 0, 3, [ME["birth"]])
            x = set_cell(x, 1, 1, [ME["phone"]])
            x = rep(x, "□ 개인  □ 팀 대표", "■ 개인  □ 팀 대표")
        if "202  년       월       일" in x:
            x = rep(x, "202  년       월       일", DATE)
        if "본인 성명 :              (서명 또는 인)" in x:
            x = add_sig(x, "         본인 성명 :              (서명 또는 인)",
                        f"         본인 성명 :   {ME['name']}    (서명 또는 인)")
        parts.append(x)
    parts.append(s[t[-1][1]:])
    return finish(4, "".join(parts), hx, "박용진_서식4_개인정보수집이용동의서", [("image1", SIG)], sig=True)


# ─────────────── 서식5 저작권 동의서 ───────────────
def form5():
    f, s, hx = tmpl(5)
    t, seg = tops_of(s)
    parts = [s[:t[0][0]]]
    for i in range(len(t)):
        x = seg(i)
        if "응모작명(축제명)" in x:
            x = set_cell(x, 0, 1, [C.FEST])
            x = rep(x, "☐ 개인    ☐ 팀", "■ 개인    ☐ 팀")
            x = set_cell(x, 2, 1, [ME["name"]]); x = set_cell(x, 2, 3, [ME["name"]])
            x = set_cell(x, 3, 1, [ME["phone"]]); x = set_cell(x, 3, 3, [ME["email"]])
        if "202  년       월       일" in x:
            x = rep(x, "202  년       월       일", DATE)
        if "참가자(대표자) :                              (서명 또는 인)" in x:
            x = add_sig(x, "참가자(대표자) :                              (서명 또는 인)",
                        f"참가자(대표자) :   {ME['name']}                (서명 또는 인)")
        parts.append(x)
    parts.append(s[t[-1][1]:])
    return finish(5, "".join(parts), hx, "박용진_서식5_저작권및공모작활용동의서", [("image1", SIG)], sig=True)


# ─────────────── 서식6 참가 서약서 ───────────────
def form6():
    f, s, hx = tmpl(6)
    s = rep(s, "202  년       월       일", DATE)
    s = add_sig(s, "참가자(대표자) :                              (서명 또는 인)",
                f"참가자(대표자) :   {ME['name']}                (서명 또는 인)")
    return finish(6, s, hx, "박용진_서식6_공모전참가서약서", [("image1", SIG)], sig=True)


# ─────────────── 서식3 종합기획 제안서 ───────────────
def form3():
    f, s, hx = tmpl(3)
    t, seg = tops_of(s)
    ids = D.Ids(int(re.search(r'<hh:charProperties itemCnt="(\d+)"', hx).group(1)),
                int(re.search(r'<hh:paraProperties itemCnt="(\d+)"', hx).group(1)))
    hx2 = D.extend_header(hx, ids)
    rect_idx = {}
    for i in range(len(t)):
        if "<hp:rect" in seg(i):
            rect_idx[len(rect_idx) + 1] = i
    rect_title = {n: re.sub(r"\s+", " ", "".join(re.findall(r"<hp:t>(.*?)</hp:t>", seg(i)))).strip() for n, i in rect_idx.items()}
    blocks = []
    for b in C.proposal_blocks():
        if b[0] == "sec":
            n = b[1]
            x = seg(rect_idx[n])
            blocks.append(("pb",) if n > 1 else ("gap",))
            blocks.append(("sec", x, rect_title[n]))
        else:
            blocks.append(b)
    h = D.Hwpx(ids)
    load = lambda name: ((FIG / f"{name}.png").read_bytes(), png_px((FIG / f"{name}.png").read_bytes()))
    body = h.render(blocks, load)
    p0 = seg(0)
    # 쪽 번호(아래 가운데)
    p0 = p0.replace("</hp:ctrl></hp:run>", '</hp:ctrl><hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl></hp:run>', 1)
    sec = s[:t[0][0]] + p0 + seg(1) + seg(2) + body + s[t[-1][1]:]
    return finish(3, sec, hx2, "박용진_서식3_축제종합기획제안서_상주감거는축제", h.images, page_numbers=True)


# ─────────────── 서식2 요약본 ───────────────
def form2():
    f, s, hx = tmpl(2)
    t, seg = tops_of(s)
    ncp = int(re.search(r'<hh:charProperties itemCnt="(\d+)"', hx).group(1))
    npp = int(re.search(r'<hh:paraProperties itemCnt="(\d+)"', hx).group(1))
    # 굵은 13pt, ◦·- 내어쓰기 문단 모양 추가
    m = re.search(r'<hh:charPr id="37" .*?</hh:charPr>', hx, re.S).group()
    cpb = m.replace('id="37"', f'id="{ncp}"', 1).replace("<hh:underline", "<hh:bold/><hh:underline", 1)
    BOLD, CP = ncp, 37
    pm = re.search(r'<hh:paraPr id="49" .*?</hh:paraPr>', hx, re.S).group()

    def clone_pp(new_id, left, intent, nxt):
        x = pm.replace('id="49"', f'id="{new_id}"', 1)
        case, default = x.split("<hp:default>")
        def setv(seg_, k):
            seg_ = re.sub(r'<hc:intent value="-?\d+"', f'<hc:intent value="{intent * k}"', seg_)
            seg_ = re.sub(r'<hc:left value="-?\d+"', f'<hc:left value="{left * k}"', seg_)
            return re.sub(r'<hc:next value="-?\d+"', f'<hc:next value="{nxt * k}"', seg_)
        return setv(case, 1) + "<hp:default>" + setv(default, 2)
    PO, PD = npp, npp + 1
    hx = hx.replace("</hh:charProperties>", cpb + "</hh:charProperties>", 1)
    hx = re.sub(r'<hh:charProperties itemCnt="\d+"', f'<hh:charProperties itemCnt="{ncp + 1}"', hx, count=1)
    hx = hx.replace("</hh:paraProperties>", clone_pp(PO, 0, -1950, 250) + clone_pp(PD, 1300, -1300, 200) + "</hh:paraProperties>", 1)
    hx = re.sub(r'<hh:paraProperties itemCnt="\d+"', f'<hh:paraProperties itemCnt="{npp + 2}"', hx, count=1)

    def P(kind, text):
        pp = PO if kind == "o" else PD
        mark = "◦ " if kind == "o" else "- "
        return D.para(pp, D.bold_runs(mark + text, CP, BOLD))

    S = C.summary_blocks()
    out = [s[:t[0][0]], seg(0), seg(1)]
    # 축제 개요 표
    x = seg(6)
    for r, (_, v) in enumerate(C.SUMMARY_INFO):
        x = set_cell(x, r, 1, [v], char_id="45")
    out.append(x)
    out.append(seg(9))                       # 축제 기본 정보(자동 번호 2.)
    out += [P(k, v) for k, v in S["basic"]]
    out.append(seg(15))                      # 3. 주요 프로그램 구성
    x = seg(16)
    for r, (_, name, desc) in enumerate(S["programs"], start=1):
        x = set_cell(x, r, 1, [name], valign="CENTER")
        x = set_cell(x, r, 2, [desc], valign="CENTER")
    out.append(x)
    out.append(seg(18))
    out += [P(k, v) for k, v in S["diff"]]
    out.append(seg(24))
    out += [P(k, v) for k, v in S["local"]]
    out.append(seg(29))
    out += [P(k, v) for k, v in S["budget"]]
    out.append(seg(37))
    out += [P(k, v) for k, v in S["sustain"]]
    out.append(s[t[-1][1]:])
    sec = "".join(out)
    return finish(2, sec, hx, "박용진_서식2_제안서요약본")


if __name__ == "__main__":
    which = sys.argv[1:] or ["1", "2", "3", "4", "5", "6"]
    fn = {"1": form1, "2": form2, "3": form3, "4": form4, "5": form5, "6": form6}
    for w in which:
        print("pages", w, fn[w]())
