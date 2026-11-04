"""원본 붙임1(작성양식)·붙임3(동의서) hwpx 를 채워 저장. 구조 보존(mimetype 첫 항목 무압축, 항목·압축 방식 그대로).
본문 칸은 새 문단(linesegarray 없이 → 한글이 다시 줄나눔). header.xml 에 맑은 고딕 글자 모양 4개·문단 모양 1개 추가.
실행: python make_hwpx.py
"""
import re, sys, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import *  # noqa


def patch_header(h, base_id, n_char, n_para, para_base):
    base = re.search(rf'<hh:charPr id="{base_id}".*?</hh:charPr>', h, flags=re.S).group(0)

    def cp(i, size, bold, color="#000000"):
        x = base.replace(f'id="{base_id}"', f'id="{i}"', 1)
        x = re.sub(r'height="\d+"', f'height="{size}"', x, count=1)
        x = re.sub(r'textColor="#[0-9A-Fa-f]{6}"', f'textColor="{color}"', x, count=1)
        x = x.replace("<hh:bold/>", "")
        if bold:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
        return x

    ids = dict(n=n_char, b=n_char + 1, h=n_char + 2, s=n_char + 3)
    new = cp(ids["n"], 1000, False) + cp(ids["b"], 1000, True) + cp(ids["h"], 1000, True, "#1C2F5E") + cp(ids["s"], 800, False)
    h = h.replace("</hh:charProperties>", new + "</hh:charProperties>")
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1)) + 4}"', h)
    p = re.search(rf'<hh:paraPr id="{para_base}".*?</hh:paraPr>', h, flags=re.S).group(0)
    p = p.replace(f'id="{para_base}"', f'id="{n_para}"', 1)
    p = re.sub(r'<hc:intent value="-?\d+"', '<hc:intent value="0"', p)
    p = re.sub(r'<hh:lineSpacing type="PERCENT" value="\d+"', '<hh:lineSpacing type="PERCENT" value="130"', p)
    h = h.replace("</hh:paraProperties>", p + "</hh:paraProperties>")
    h = re.sub(r'<hh:paraProperties itemCnt="(\d+)"', lambda m: f'<hh:paraProperties itemCnt="{int(m.group(1)) + 1}"', h)
    return h, ids


def mkpara(runs, ids, pp):
    if isinstance(runs, str):
        parts = re.split(r"(\*\*.*?\*\*)", runs)
        runs = [("b", x[2:-2]) if x.startswith("**") else ("n", x) for x in parts if x]
    body = "".join(f'<hp:run charPrIDRef="{ids[s]}"><hp:t>{escape(t)}</hp:t></hp:run>' for s, t in runs)
    return f'<hp:p id="0" paraPrIDRef="{pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{body or f"<hp:run charPrIDRef={chr(34)}{ids[chr(110)]}{chr(34)}/>"}</hp:p>'


def lines_xml(lines, ids, pp):
    out = []
    for x in lines:
        out.append(mkpara([("h", x[1])], ids, pp) if isinstance(x, tuple) else mkpara(x, ids, pp))
    return "".join(out)


def tables(sec):
    return [(m.start(), m.end()) for m in re.finditer(r"<hp:tbl\b.*?</hp:tbl>", sec, flags=re.S)]


def fill_cell(tbl, col, row, xml, top=True):
    for m in re.finditer(r"<hp:tc\b.*?</hp:tc>", tbl, flags=re.S):
        tc = m.group(0)
        if f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>' in tc:
            new = re.sub(r"(<hp:subList[^>]*>).*?(</hp:subList>)", lambda k: k.group(1) + xml + k.group(2), tc, count=1, flags=re.S)
            if top:
                new = new.replace('vertAlign="CENTER"', 'vertAlign="TOP"', 1)
            return tbl[:m.start()] + new + tbl[m.end():]
    raise KeyError((col, row))


def write(src, out, sec, header):
    zin = zipfile.ZipFile(src)
    prv = re.sub(r"<[^>]+>", "", sec.replace("</hp:p>", "\r\n"))
    with zipfile.ZipFile(out, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = sec.encode("utf-8")
            elif info.filename == "Contents/header.xml":
                data = header.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = prv[:1024].encode("utf-8")
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    print(out, out.exists())


def build_form():
    src = HERE / "원본" / "붙임1_작성양식.hwpx"
    z = zipfile.ZipFile(src)
    sec = z.read("Contents/section0.xml").decode("utf-8")
    header, ids = patch_header(z.read("Contents/header.xml").decode("utf-8"), "10", 32, 27, "26")
    PP = 27
    P = lambda lines: lines_xml(lines, ids, PP)
    C = lambda t: mkpara(t, ids, "20")  # 가운데 정렬 원본 문단 모양
    spans = tables(sec)
    t1 = sec[spans[1][0]:spans[1][1]]
    t1 = t1.replace("□ 외부(임직원 외 대국민)", "■ 외부(임직원 외 대국민)", 1)
    t1 = fill_cell(t1, 1, 1, C(f"{ME['job']} (개인 참가)"), top=False)
    t1 = fill_cell(t1, 3, 1, C(f"{ME['name']} / 개인"), top=False)
    t1 = fill_cell(t1, 1, 2, C(ME["phone"]) + C(ME["email"]), top=False)
    t1 = fill_cell(t1, 3, 2, C(ME["date"]), top=False)
    t2 = sec[spans[2][0]:spans[2][1]]
    t2 = fill_cell(t2, 1, 0, mkpara([("b", TITLE)], ids, PP), top=False)
    t2 = t2.replace("□ AI·디지털 탄소중립형", "■ AI·디지털 탄소중립형", 1)
    t2 = fill_cell(t2, 2, 2, P(BACKGROUND))
    t2 = fill_cell(t2, 2, 3, P(PURPOSE))
    t2 = fill_cell(t2, 2, 4, P(MAIN))
    t2 = fill_cell(t2, 2, 5, P(EFFECT))
    t2 = fill_cell(t2, 2, 6, P(ETC) + mkpara([("b", "근거")], ids, PP) + "".join(mkpara([("s", x)], ids, PP) for x in SOURCES))
    t2 = fill_cell(t2, 1, 7, P(ATTACH))
    assert "■ 외부" in t1 and "■ AI·디지털" in t2
    sec = sec[:spans[1][0]] + t1 + sec[spans[1][1]:spans[2][0]] + t2 + sec[spans[2][1]:]
    write(src, HERE / "붙임1_작성양식_저탄소기본값_박용진.hwpx", sec, header)


def build_consent():
    src = HERE / "원본" / "붙임3_개인정보동의서.hwpx"
    z = zipfile.ZipFile(src)
    sec = z.read("Contents/section0.xml").decode("utf-8")
    header = z.read("Contents/header.xml").decode("utf-8")
    n = sec.count("□ 동의함")
    sec = sec.replace("□ 동의함", "■ 동의함", 1)
    sec = sec.replace("2026년     월      일", "2026년  11월   4일", 1)
    sec = sec.replace("<hp:t>                 </hp:t></hp:run><hp:run charPrIDRef=\"42\"><hp:t>(서명 또는 인)</hp:t>",
                      f"<hp:t>{ME['name']}          </hp:t></hp:run><hp:run charPrIDRef=\"42\"><hp:t>(서명 또는 인)</hp:t>", 1)
    assert n == 1 and ME["name"] in sec and "11월" in sec
    write(src, HERE / "붙임3_개인정보동의서_박용진.hwpx", sec, header)


if __name__ == "__main__":
    build_form()
    build_consent()
