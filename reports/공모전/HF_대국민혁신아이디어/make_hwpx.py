"""원본 붙임2(제안서)·붙임3(동의서) hwpx 를 구조 그대로 두고 내용만 채운다 (zip+XML 문자열 처리)."""
import re
import zipfile
import xml.dom.minidom
from pathlib import Path
from xml.sax.saxutils import escape

from content import ME, TITLE, FIELD, SUMMARY, BACKGROUND, DETAIL, EFFECTS, AI_PLAN, SOURCES, REF_NOTE, AI_NOTE

HERE = Path(__file__).parent
SRC_PROP = HERE / "원본" / "붙임2_제안서.hwpx"
SRC_AGREE = HERE / "원본" / "붙임3_개인정보동의서.hwpx"
OUT_PROP = HERE / "박용진_혁신아이디어제안서_주택연금_가족설명서.hwpx"
OUT_AGREE = HERE / "박용진_개인정보수집이용동의서.hwpx"
BODY_CHAR = "21"  # 12pt 보통 (charPr 14 를 복제해 header 에 추가)
BOLD_CHAR = "22"  # 12pt 굵게 (■ 소제목·제안명)


def make_para(p_open, char_id, text):
    return f'{p_open}<hp:run charPrIDRef="{char_id}"><hp:t>{escape(text)}</hp:t></hp:run></hp:p>'


def set_cell(s, col, row, lines, char_id=BODY_CHAR):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', s)
    a = s.rfind("<hp:tc ", 0, m.start())
    sub_a = s.find("<hp:subList", a)
    sub_open_end = s.find(">", sub_a) + 1
    sub_b = s.find("</hp:subList>", sub_open_end)
    body = s[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    new = "".join(make_para(first, BOLD_CHAR if t.startswith("■") else char_id, t) for t in lines)
    return s[:sub_open_end] + new + s[sub_b:]


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def build(src, out, section_xml, header_fn=None):
    xml.dom.minidom.parseString(section_xml.encode("utf-8"))  # 정합성 확인
    zin = zipfile.ZipFile(src)
    with zipfile.ZipFile(out, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/header.xml" and header_fn:
                data = header_fn(data.decode("utf-8")).encode("utf-8")
            if info.filename == "Contents/section0.xml":
                data = section_xml.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(section_xml)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    print(out, out.stat().st_size)


def add_12pt(h):
    """charPr 14(10.5pt 굵게)를 복제해 12pt 보통(21)·12pt 굵게(22)를 추가."""
    base = re.search(r'<hh:charPr id="14".*?</hh:charPr>', h, re.S).group(0)
    reg = base.replace('id="14"', f'id="{BODY_CHAR}"').replace('height="1050"', 'height="1200"').replace("<hh:bold/>", "")
    bold = base.replace('id="14"', f'id="{BOLD_CHAR}"').replace('height="1050"', 'height="1200"')
    assert reg != bold and 'itemCnt="21"' in h
    h = h.replace("</hh:charProperties>", reg + bold + "</hh:charProperties>", 1)
    return h.replace('<hh:charProperties itemCnt="21">', '<hh:charProperties itemCnt="23">', 1)


def proposal():
    s = zipfile.ZipFile(SRC_PROP).read("Contents/section0.xml").decode("utf-8")
    m = ME
    s = set_cell(s, 1, 0, [m["name"]])
    s = set_cell(s, 3, 0, [m["birth"]])
    s = set_cell(s, 5, 0, [m["phone"]])
    s = set_cell(s, 1, 1, [TITLE], char_id=BOLD_CHAR)
    label = {"A": "□ A.", "C": "□ C.", "T": "□ T."}[FIELD]
    assert label in s
    s = s.replace(label, "■" + label[1:], 1)
    s = set_cell(s, 1, 3, SUMMARY)
    s = set_cell(s, 1, 4, BACKGROUND)
    s = set_cell(s, 1, 5, DETAIL)
    s = set_cell(s, 1, 6, EFFECTS)
    s = set_cell(s, 1, 7, AI_PLAN)
    refs = ["[예시] 자녀용 「우리 집 주택연금 설명서」 화면 구성: 부모님 예상 월지급금 / 꼭 알아야 할 네 가지 / "
            "받으시는 기간(85·90·95세) × 집값(그대로·연 1%·연 2% 상승) 9칸 정산 표 / 질문창 / 3자 상담 예약 (그림은 PDF 본 참조)",
            REF_NOTE] + [f"{a} {u}" for a, u in SOURCES] + [AI_NOTE]
    s = set_cell(s, 1, 8, refs)
    return s


def agree():
    s = zipfile.ZipFile(SRC_AGREE).read("Contents/section0.xml").decode("utf-8")
    m = ME
    for old, new in [("(동의하지 않음 □  동의함 □)", "(동의하지 않음 □  동의함 ■)"),
                     ("<hp:t>2026 년     월      일</hp:t>", f"<hp:t>{m['y']} 년  {m['m']} 월  {m['d']} 일</hp:t>"),
                     ("본인 성명 :             (서명 또는 인)", f"본인 성명 :  {m['name']}   (서명 또는 인)")]:
        assert old in s, old
        s = s.replace(old, new, 1)
    return s


if __name__ == "__main__":
    build(SRC_PROP, OUT_PROP, proposal(), add_12pt)
    build(SRC_AGREE, OUT_AGREE, agree())
