"""원본 서식 hwpx(참가신청서·개인정보 동의서·기획서 양식)를 채운 hwpx 를 만든다.
원본은 데이터로만 읽는다(zip + XML 문자열 처리)."""
import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

import content as C

HERE = Path(__file__).parent
ROOT = HERE.parent
SRC = ROOT / "원본" / "붙임2_참가신청서_개인정보동의서.hwpx"
OUT = ROOT / "박용진_참가신청서_동의서_기획서.hwpx"
M = C.ME
BODY, BOLD = "18", "12"   # 10pt 맑은 고딕 / 11pt 맑은 고딕 굵게 (원본 header 의 글자 모양)


def plain(t):
    return re.sub(r"<[^>]+>", "", t)


def run(cid, text):
    return f'<hp:run charPrIDRef="{cid}"><hp:t>{escape(text)}</hp:t></hp:run>'


def para(p_open, runs):
    return f"{p_open}{runs}</hp:p>"


def block_paras(p_open, bs):
    out = []
    for b in bs:
        k = b[0]
        if k == "h":
            out.append(para(p_open, run(BOLD, "■ " + plain(b[1]))))
        elif k == "p":
            out.append(para(p_open, run(BODY, plain(b[1]))))
        elif k == "b":
            out.append(para(p_open, run(BODY, "  · " + plain(b[1]))))
        elif k == "box":
            out.append(para(p_open, run(BOLD, "▶ " + plain(b[1]))))
        elif k == "fig":
            out.append(para(p_open, run(BODY, "  [흐름] 입구·출구 통행 기록 + 구간 속도 → AI ① 쉬었나?(정체/휴식 판별) "
                                             "→ AI ② 지금 어디쯤?(주행 중 차량을 구간에 배분) → AI ③ 구간×30분 졸음위험지수")))
        elif k == "t":
            head, rows = b[1], b[2]
            out.append(para(p_open, run(BODY, "  [" + " | ".join(plain(h) for h in head) + "]")))
            for r in rows:
                out.append(para(p_open, run(BODY, "  · " + plain(r[0]) + " — " + " / ".join(plain(x) for x in r[1:]))))
    return "".join(out)


def cell_bounds(s, start, col, row):
    m = re.search(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>', s[start:])
    pos = start + m.start()
    a = s.rfind("<hp:tc ", 0, pos)
    sub_a = s.find("<hp:subList", a)
    sub_open_end = s.find(">", sub_a) + 1
    sub_b = s.find("</hp:subList>", sub_open_end)
    return sub_a, sub_open_end, sub_b


def set_cell(s, start, col, row, text):
    sub_a, so, sub_b = cell_bounds(s, start, col, row)
    body = s[so:sub_b]
    first = re.search(r"<hp:p [^>]*>", body).group()
    cid = re.search(r'<hp:run charPrIDRef="(\d+)"', body).group(1)
    return s[:so] + para(first, run(cid, text)) + s[sub_b:]


def fill_long_cell(s, start, col, row, bs, keep_first=True, extra=""):
    sub_a, so, sub_b = cell_bounds(s, start, col, row)
    body = s[so:sub_b]
    paras = re.findall(r"<hp:p [^>]*>.*?</hp:p>", body, flags=re.S)
    p_open = re.search(r"<hp:p [^>]*>", paras[0]).group()
    keep = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", paras[0]) if keep_first else ""
    new = keep + block_paras(p_open, bs) + extra
    sub_open = re.sub(r'vertAlign="\w+"', 'vertAlign="TOP"', s[sub_a:so])
    return s[:sub_a] + sub_open + new + s[sub_b:]


def rep(s, old, new, start=0):
    i = s.find(old, start)
    assert i >= 0, old
    return s[:i] + new + s[i + len(old):]


def build():
    zin = zipfile.ZipFile(SRC)
    s = zin.read("Contents/section0.xml").decode("utf-8")

    # ── 참가신청서
    t1 = s.find("참가구분")
    s = rep(s, "<hp:t>□ 개인                   □ 팀</hp:t>", "<hp:t>■ 개인                   □ 팀</hp:t>", t1)
    for col, v in ((1, M["name"]), (2, M["phone"]), (3, M["email"])):
        s = set_cell(s, t1, col, 2, v)
    for row in (3, 4):
        for col in (1, 2, 3):
            s = set_cell(s, t1, col, row, "-")
    s = set_cell(s, t1, 1, 5, C.TITLE)
    s = rep(s, "<hp:t>                                  2026년    월    일  </hp:t>",
            f"<hp:t>                                  {M['y']}년  {M['m']}월   {M['d']}일  </hp:t>")
    s = rep(s, "<hp:t>                                 신청인(대표자)            </hp:t>",
            f"<hp:t>                                 신청인(대표자)   {M['name']}   </hp:t>")

    # ── 개인정보 동의서
    t2 = s.find("개인정보 수집･이용 동의서")
    i = s.find("동의함", t2)
    seg_a = s.rfind("<hp:p ", 0, i)
    seg_b = s.find("</hp:p>", i)
    seg = s[seg_a:seg_b]
    seg2 = seg.replace("동의함 □", "동의함 ■", 1)
    assert seg2 != seg, "동의함 체크 실패"
    s = s[:seg_a] + seg2 + s[seg_b:]
    s = rep(s, "<hp:t>2026년    월    일 </hp:t>", f"<hp:t>{M['y']}년  {M['m']}월   {M['d']}일 </hp:t>", t2)
    s = rep(s, "<hp:t>                                        본인      </hp:t>",
            f"<hp:t>                                        본인   {M['name']}   </hp:t>", t2)

    # ── 기획서
    t3 = s.find("1. 기본 정보")
    s = rep(s, "<hp:t>□ 팀                        □ 개인</hp:t>", "<hp:t>□ 팀                        ■ 개인</hp:t>", t3)
    s = set_cell(s, t3, 1, 2, "해당 없음 (개인 참가)")
    for col, v in ((1, M["name"]), (2, M["phone"]), (3, M["email"])):
        s = set_cell(s, t3, col, 4, v)
    s = set_cell(s, t3, 1, 5, C.TITLE)
    s = fill_long_cell(s, t3, 0, 8, C.PROBLEM)
    s = fill_long_cell(s, t3, 0, 9, C.NEED)
    s = fill_long_cell(s, t3, 0, 11, C.OVERVIEW)
    s = fill_long_cell(s, t3, 0, 12, C.DATA)
    p14 = '<hp:p id="2147483648" paraPrIDRef="11" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
    src = para(p14, run(BOLD, "■ 근거 자료")) + "".join(
        para(p14, run(BODY, f"  [{i}] {t} ({u})")) for i, (t, u) in enumerate(C.SOURCES, 1))
    src += para(p14, run(BODY, "  ※ 자료 조사와 초안 작성에 생성형 AI(Claude)를 활용했으며, 내용 확인과 최종 판단은 제안자가 했습니다."))
    s = fill_long_cell(s, t3, 0, 14, C.EFFECT, keep_first=False, extra=src)
    # 작성 유의사항(표 아래 안내 문단 2개)은 그대로 둔다(원본 보존).

    # 고친 셀의 높이 고정값은 내용에 맞게 한글이 다시 계산하도록 linesegarray 만 지움(새 문단에는 없음)
    with zipfile.ZipFile(OUT, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = s.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                txt = "\n".join("".join(re.findall(r"<hp:t>([^<]*)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", s, flags=re.S))
                data = txt[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" or info.compress_type == 0 else zipfile.ZIP_DEFLATED
            zout.writestr(info, data, compress_type=ct)
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    build()
