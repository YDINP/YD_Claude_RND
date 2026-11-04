"""지정양식 hwpx(붙임1-2·붙임2)를 그대로 두고 내용만 채운 hwpx를 만든다. 원본은 데이터로만 읽는다."""
import re
import zipfile
from pathlib import Path
from xml.dom import minidom
from xml.sax.saxutils import escape

from content import (ME, TITLE, GENRE, FILE_SCN, LOGLINE, INTENT, SYNOPSIS, CHARACTERS, AI_USE, PROGRAMS)

SRC = Path(__file__).parent
OUT = SRC.parent
F12 = OUT / "원본" / "붙임1-2_AI시나리오_참가신청서.hwpx"
F2 = OUT / "원본" / "붙임2_개인정보동의서_서약사항.hwpx"
TXT, BOLD = 55, 54          # 맑은 고딕 10pt 검정 / 굵게 (양식 header 의 charPr)
P_ACT, P_DLG = 34, 99       # 지문: 줄간격 160%·들여쓰기 0 / 대사: 99 = 35 복제 + 탭 위치 4104


def set_cell(s, row, col, paras, start=0, valign=None):
    """start 위치 이후 첫 (row,col) 셀의 문단을 paras[(char_id, text)...] 로 교체."""
    m = re.compile(rf'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>').search(s, start)
    a = s.rfind("<hp:tc ", 0, m.start())
    sub_a = s.find("<hp:subList", a)
    sub_open_end = s.find(">", sub_a) + 1
    sub_b = s.find("</hp:subList>", sub_open_end)
    first = re.search(r"<hp:p [^>]*>", s[sub_open_end:sub_b]).group()
    new = "".join(f'{first}<hp:run charPrIDRef="{c}"><hp:t>{escape(t)}</hp:t></hp:run></hp:p>' for c, t in paras)
    sub_open = s[sub_a:sub_open_end]
    if valign:
        sub_open = re.sub(r'vertAlign="\w+"', f'vertAlign="{valign}"', sub_open)
    return s[:sub_a] + sub_open + new + s[sub_b:]


def one(t):
    return [(TXT, t)]


def para(pid, runs):
    return f'<hp:p id="0" paraPrIDRef="{pid}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{runs}</hp:p>'


def run(c, t):
    return f'<hp:run charPrIDRef="{c}"><hp:t>{t}</hp:t></hp:run>'


def scenario_paras():
    out = []
    lines = (SRC / "scenario.txt").read_text(encoding="utf-8").splitlines()
    for ln in lines:
        ln = ln.rstrip()
        if not ln:
            out.append(para(P_ACT, f'<hp:run charPrIDRef="{TXT}"/>'))
        elif ln.startswith("= "):
            if out and "<hp:t>" in out[-1]:
                out.append(para(P_ACT, f'<hp:run charPrIDRef="{TXT}"/>'))
            out.append(para(P_ACT, run(BOLD, escape(ln[2:]))))
        elif "\t" in ln:
            n, t = ln.split("\t", 1)
            out.append(para(P_DLG, run(TXT, f'{escape(n)}<hp:tab width="2000" leader="0" type="1"/>{escape(t)}')))
        elif ln == "끝" or ln.startswith("타이틀 —"):
            out.append(para(P_ACT, run(BOLD, escape(ln))))
        else:
            out.append(para(P_ACT, run(TXT, escape(ln))))
    return "".join(out)


def fill_header(h):
    # 대사용 탭 정의(4104 = 대사 내어쓰기 폭)와 문단 모양 99 추가. 글꼴·크기·줄간격·여백은 그대로.
    h = h.replace('<hh:tabProperties itemCnt="3">', '<hh:tabProperties itemCnt="4">')
    h = h.replace('</hh:tabProperties>',
                  '<hh:tabPr id="3" autoTabLeft="0" autoTabRight="0"><hh:tabItem pos="4104" type="LEFT" leader="NONE"/></hh:tabPr></hh:tabProperties>')
    p35 = re.search(r'<hh:paraPr id="35".*?</hh:paraPr>', h, re.S).group()
    p99 = p35.replace('id="35"', f'id="{P_DLG}"', 1).replace('tabPrIDRef="0"', 'tabPrIDRef="3"', 1)
    h = h.replace(p35, p35 + p99, 1)
    n = int(re.search(r'<hh:paraProperties itemCnt="(\d+)"', h).group(1))
    return h.replace(f'<hh:paraProperties itemCnt="{n}"', f'<hh:paraProperties itemCnt="{n + 1}"')


def fill_12(s):
    m = ME
    s = s.replace(" □ 개인         □ 팀 ", " ☑ 개인         □ 팀 ", 1)
    s = s.replace(" □ 장편         □ 단편", " □ 장편         ☑ 단편", 1)
    s = set_cell(s, 3, 1, one("해당 없음 (개인 참가)"))
    s = set_cell(s, 4, 2, one(m["name"]))
    s = set_cell(s, 4, 6, one(m["birth"]))
    s = set_cell(s, 5, 2, one(m["email"]))
    s = set_cell(s, 5, 6, one(m["phone"]))
    s = set_cell(s, 6, 2, one(m["addr"]))
    s = set_cell(s, 7, 1, [(BOLD, TITLE)])
    s = set_cell(s, 9, 1, one(GENRE))
    s = set_cell(s, 10, 1, one(LOGLINE))
    s = set_cell(s, 11, 1, [(TXT, t) for t in INTENT], valign="TOP")
    s = set_cell(s, 12, 1, [(TXT, t) for t in SYNOPSIS], valign="TOP")
    ch = []
    for n, r, d in CHARACTERS:
        ch += [(BOLD, f"■ {n}: {r}"), (TXT, d)]
    s = set_cell(s, 13, 1, ch, valign="TOP")
    s = set_cell(s, 14, 1, [(TXT, t) for t in AI_USE], valign="TOP")
    s = set_cell(s, 15, 1, one(PROGRAMS))
    s = set_cell(s, 16, 1, one(FILE_SCN + " (단편 · 시나리오 본문, 지정양식 규격 준수)"))
    s = s.replace("<hp:t>2026년     월     일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>", 1)
    s = s.replace("<hp:t>참가자 성명                 </hp:t>", f"<hp:t>참가자 성명   {m['name']}   </hp:t>", 1)
    # 시나리오 본문 머리표의 '작품명' 칸 → 작품명
    i = s.find("시나리오 본문")
    s = s[:i] + s[i:].replace("<hp:t>작품명</hp:t>", f"<hp:t>{escape(TITLE)}</hp:t>", 1)
    # 파란 작성 가이드라인 문단을 모두 지우고 본문으로 교체 (쪽 번호 컨트롤은 첫 문단에 보존)
    g = s.find('<hp:p id="0" paraPrIDRef="33"', i)
    end = s.rfind("</hs:sec>")
    ctrl = re.search(r"<hp:ctrl><hp:newNum[^>]*/></hp:ctrl>", s[g:end]).group()
    body = scenario_paras()
    body = body.replace(f'<hp:run charPrIDRef="{TXT}"/>', f'<hp:run charPrIDRef="{TXT}">{ctrl}</hp:run>', 1)
    return s[:g] + body + s[end:]


def fill_2(s):
    m = ME
    t = s.find("성  명")                     # 참가자 정보 표
    s = set_cell(s, 0, 1, [(14, m["name"])], start=t)
    s = set_cell(s, 0, 3, [(14, m["birth"])], start=t)
    s = set_cell(s, 1, 1, [(14, m["addr"])], start=t)
    s = set_cell(s, 2, 1, [(14, m["phone"])], start=t)
    s = set_cell(s, 2, 3, [(14, m["email"])], start=t)
    for k in ("수집·이용에 관한 동의 여부 (예 □, 아니오 □ )", "제3자 제공에 관한 동의 여부 (예 □, 아니오 □ )"):
        s = s.replace(k, k.replace("(예 □", "(예 ☑"), 1)
    s = s.replace("<hp:t>2026년   월    일</hp:t>", f"<hp:t>{m['y']}년  {m['m']}월  {m['d']}일</hp:t>", 1)
    s = s.replace("개인정보 제공 동의자   성명         (서명)", f"개인정보 제공 동의자   성명  {m['name']}  (서명)", 1)
    s = s.replace("보호자(법정대리인)   성명         (서명)", "보호자(법정대리인)   성명  해당 없음  (서명)", 1)
    s = s.replace("예 (       )              아니오 (      )", "예 (   O   )              아니오 (      )", 1)
    s = s.replace("<hp:t>2026년      월      일</hp:t>", f"<hp:t>{m['y']}년   {m['m']}월   {m['d']}일</hp:t>", 1)
    s = s.replace("참가자(대표자) 성명 :                (서명)", f"참가자(대표자) 성명 :  {m['name']}   (서명)", 1)
    return s


def text_of(xml):
    return "\n".join("".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def build(src, out, section, header=None):
    zin = zipfile.ZipFile(src)
    section = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", section, flags=re.S)
    minidom.parseString(section.encode("utf-8"))
    if header:
        minidom.parseString(header.encode("utf-8"))
    with zipfile.ZipFile(out, "w") as z:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = section.encode("utf-8")
            elif info.filename == "Contents/header.xml" and header:
                data = header.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = text_of(section)[:1024].encode("utf-8")
            ct = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            z.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), data, compress_type=ct)
    print(out, out.stat().st_size)


if __name__ == "__main__":
    z = zipfile.ZipFile(F12)
    build(F12, OUT / "참가신청서_시나리오본문_AI시나리오_박용진.hwpx",
          fill_12(z.read("Contents/section0.xml").decode("utf-8")),
          fill_header(z.read("Contents/header.xml").decode("utf-8")))
    z2 = zipfile.ZipFile(F2)
    build(F2, OUT / "개인정보동의서_박용진.hwpx", fill_2(z2.read("Contents/section0.xml").decode("utf-8")))
