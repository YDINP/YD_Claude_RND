"""지정 서식 hwpx(참가 신청서 양식)를 구조 그대로 두고 내용만 채운다.
원본은 데이터로만 읽는다(zip+XML 문자열 처리). 만 14세 미만 동의서 쪽은 해당 없어 뺀다."""
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape
import xml.dom.minidom

from content import ME, TITLE, TOPIC, TYPE, TARGET, BACKGROUND, MESSAGE, PLAN, DATA, DIFF

HERE = Path(__file__).parent
SRC = HERE / "원본" / "1. 2026 대국민 재정교육 아이디어 공모전_참가 신청서 양식.hwpx"
OUT = HERE / "박용진_대국민재정교육아이디어_참가신청서(0원 영수증).hwpx"
CK = "☑"


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


def set_cell(doc, tbl_id, row, col, lines, char_id=None, valign=None):
    a = doc.find(f'<hp:tbl id="{tbl_id}"')
    b = doc.find("</hp:tbl>", a)
    tbl = doc[a:b]
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', tbl)
    ta = tbl.rfind("<hp:tc ", 0, m.start())
    sub_a = tbl.find("<hp:subList", ta)
    sub_open_end = tbl.find(">", sub_a) + 1
    sub_b = tbl.find("</hp:subList>", sub_open_end)
    body = tbl[sub_open_end:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    cid = char_id or re.search(r'<hp:run charPrIDRef="(\d+)"', body).group(1)
    sub_open = tbl[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    new = "".join(make_para(first, cid, t) for t in lines)
    tbl = tbl[:sub_a] + sub_open + new + tbl[sub_b:]
    return doc[:a] + tbl + doc[b:]


def rep(doc, old, new):
    assert old in doc, old
    return doc.replace(old, new, 1)


def text_of(x):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", x, flags=re.S))


def main():
    zin = zipfile.ZipFile(SRC)
    s = zin.read("Contents/section0.xml").decode("utf-8")
    tops = top_paragraphs(s)
    # 21번째 최상위 문단(만14세 미만 동의서 안내)부터 끝 문단까지 제거
    i14 = next(i for i, (a, b) in enumerate(tops) if "만14세 미만 참가자의 경우" in s[a:b])
    doc = s[:tops[i14][0]] + s[tops[-1][1]:]

    m = ME
    doc = rep(doc, "<hp:t> 대국민 재정교육 아이디어 제안서(양식)</hp:t>", "<hp:t> 대국민 재정교육 아이디어 제안서</hp:t>")
    # 1. 제안자 정보
    T1, T2, T3 = "1219548958", "1219548959", "1219548963"
    doc = set_cell(doc, T1, 0, 1, [f"{CK} 개인   □ 팀(    명)"])
    doc = set_cell(doc, T1, 0, 3, ["-"])
    doc = set_cell(doc, T1, 1, 1, [m["name"]])
    doc = set_cell(doc, T1, 1, 3, [m["birth"]])
    doc = set_cell(doc, T1, 2, 1, [m["org"]])
    doc = set_cell(doc, T1, 2, 3, [m["phone"]])
    doc = set_cell(doc, T1, 3, 1, [m["email"]])
    doc = set_cell(doc, T1, 3, 3, ["-"])
    # 2. 제안 내용 — 체크칸
    topics = {(0, 1): "① 알기 쉽게 배우는 나라살림", (0, 5): "② 내 삶에서 배우는 나라살림",
              (1, 1): "③ 체험하며 배우는 나라살림", (1, 5): "④ 재정을 배우는 새로운 방법", (2, 1): "⑤ 기타"}
    for (r, c), t in topics.items():
        mark = CK if t.startswith("①②③④⑤"[TOPIC - 1]) else "□"
        doc = set_cell(doc, T2, r, c, [f"{mark} {t}"])
    doc = set_cell(doc, T2, 3, 1, [TITLE], char_id="14")
    types = {(4, 1): "숏폼(영상)", (4, 3): "웹툰·만화", (4, 6): "카드뉴스·인포그래픽",
             (5, 1): "교육 프로그램·체험활동", (5, 3): "게임·교구"}
    for (r, c), t in types.items():
        doc = set_cell(doc, T2, r, c, [f"{CK if t == TYPE else '□'} {t}"])
    targets = {(6, 1): "초등학생", (6, 2): "중·고등학생", (6, 4): "대학생·청년", (6, 7): "일반 성인", (7, 1): "어르신"}
    for (r, c), t in targets.items():
        doc = set_cell(doc, T2, r, c, [f"{CK if t == TARGET else '□'} {t}"])
    doc = set_cell(doc, T2, 7, 2, ["□ 기타(                    )"], char_id="14")
    # 본문 칸(예시 문구 대신 내용)
    doc = set_cell(doc, T2, 8, 1, BACKGROUND, char_id="14", valign="TOP")
    doc = set_cell(doc, T2, 9, 1, MESSAGE, char_id="14", valign="TOP")
    doc = set_cell(doc, T2, 10, 1, PLAN, char_id="14", valign="TOP")
    doc = set_cell(doc, T2, 11, 1, DATA, char_id="14", valign="TOP")
    doc = set_cell(doc, T2, 12, 1, DIFF, char_id="14", valign="TOP")
    # 서명 줄
    doc = rep(doc, "<hp:t>2026년     월     일          제안자(대표)                    (서명)</hp:t>",
              f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일          제안자(대표)     {m['name']}          (서명)</hp:t>")
    # 자가점검표 전부 확인
    for r in range(1, 11):
        doc = set_cell(doc, T3, r, 2, [CK])
    # 줄 배치 캐시 제거(한글이 다시 계산)
    doc = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", doc, flags=re.S)
    xml.dom.minidom.parseString(doc.encode("utf-8"))  # 정합성 확인

    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = doc.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(doc)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" or info.compress_type == 0 else zipfile.ZIP_DEFLATED
            zout.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
