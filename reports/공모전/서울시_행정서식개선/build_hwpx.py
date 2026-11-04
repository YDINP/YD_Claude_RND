"""원본 제출서식(원본/제출서식.hwpx)의 칸을 채운 hwpx 를 만든다.
- 구조 보존: mimetype 첫 항목 무압축, 나머지 항목·압축 방식 그대로
- header.xml: 본문용 글자 모양 3개(한컴돋움 10.5pt 보통/굵게, 9pt)와 들여쓰기 없는 문단 모양 1개 추가
- 비교표의 '현행' 칸은 서식 원문 항목을 글로 옮겨 적음(캡처 이미지는 PDF 본에 있음)
실행: python build_hwpx.py
"""
import re, sys, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import *  # noqa

SRC = HERE / "원본" / "제출서식.hwpx"
OUT = HERE / "행정서식개선_제출서식_서울광장사용신고서_박용진.hwpx"
N, B, S = 80, 81, 82   # 원본 charPr 0~79
PB, PL = 36, 50        # 36: 원본 내어쓰기 문단, 50: 새 들여쓰기 없는 문단


def patch_header(h):
    base = re.search(r'<hh:charPr id="15".*?</hh:charPr>', h, flags=re.S).group(0)

    def cp(i, size, bold):
        x = base.replace('id="15"', f'id="{i}"', 1).replace('height="1200"', f'height="{size}"', 1)
        if bold:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
        return x

    h = h.replace("</hh:charProperties>", cp(N, 1050, False) + cp(B, 1050, True) + cp(S, 900, False) + "</hh:charProperties>")
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1)) + 3}"', h)
    p36 = re.search(r'<hh:paraPr id="36".*?</hh:paraPr>', h, flags=re.S).group(0)
    p = p36.replace('id="36"', f'id="{PL}"', 1)
    p = re.sub(r'<hc:intent value="-?\d+"', '<hc:intent value="0"', p)
    h = h.replace("</hh:paraProperties>", p + "</hh:paraProperties>")
    h = re.sub(r'<hh:paraProperties itemCnt="(\d+)"', lambda m: f'<hh:paraProperties itemCnt="{int(m.group(1)) + 1}"', h)
    return h


STY = {"n": N, "b": B, "s": S}


def para(text, pp=PL, style="n"):
    parts = re.split(r"(\*\*.*?\*\*)", text)
    runs = [("b", x[2:-2]) if x.startswith("**") else (style, x) for x in parts if x]
    body = "".join(f'<hp:run charPrIDRef="{STY[s]}"><hp:t>{escape(t)}</hp:t></hp:run>' for s, t in runs) or f'<hp:run charPrIDRef="{N}"/>'
    return f'<hp:p id="0" paraPrIDRef="{pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{body}</hp:p>'


def bullets(lines):
    out = []
    for x in lines:
        if x.startswith(" - "):
            out.append(para("   - " + x[3:], PL))
        else:
            out.append(para("ㅇ " + x, PB))
    return "".join(out)


def tables(sec):
    return [(m.start(), m.end()) for m in re.finditer(r"<hp:tbl\b.*?</hp:tbl>", sec, flags=re.S)]


def fill_cell(tbl, col, row, paras_xml, top=True):
    for m in re.finditer(r"<hp:tc\b.*?</hp:tc>", tbl, flags=re.S):
        tc = m.group(0)
        if f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>' in tc:
            new = re.sub(r"(<hp:subList[^>]*>).*?(</hp:subList>)", lambda k: k.group(1) + paras_xml + k.group(2), tc, count=1, flags=re.S)
            if top:
                new = new.replace('vertAlign="CENTER"', 'vertAlign="TOP"', 1)
            return tbl[:m.start()] + new + tbl[m.end():]
    raise KeyError((col, row))


def rep(s, old, new, count=1):
    assert old in s, old
    return s.replace(old, new, count)


CUR_TEXT = [
    "〔별지 서식〕 <개정 2015.1.2.>  서울광장 사용신고서",
    "행사명칭 / 사용목적 / 사용일시: 년 월 일( ) 시 분 ~ 시 분 ( 시간 분)",
    "주최자: 주소 / 전화번호(핸드폰) FAX / 성명(단체명) / 생년월일 / 직업",
    "주최단체의 대표자: 주소 / 전화번호(핸드폰) / 성명(단체명) / 생년월일 / 직업",
    "연락책임: 주소 / 전화번호(핸드폰) / 성명(단체명) / 생년월일 / 직업",
    "사용인원 / 사용면적 ㎡ / 행사내용",
    "「서울특별시 서울광장의 사용 및 관리에 관한 조례」 제5조에 따라 위와 같이 사용을 신고합니다.  년 월 일  신고자 (서명 또는 인)  서울특별시장 귀하",
    "☞ 구비서류 1. 행사계획서 2. 사용 위치도 3. 시설물설치내역 및 원상복구계획서 4. 안전관리계획서",
    "※ 원본 서식 캡처 이미지는 함께 제출한 PDF 본 붙임 2에 실었습니다(국가법령정보센터 서식 이미지). 2026년 7월 누리집 배포본도 같은 서식입니다.",
]

NEW_TEXT = [
    "**서울광장 사용신고서 (개선안)**  [★ = 새로 넣거나 바꾼 칸]",
    "**행사**: 행사 이름 / 사용 목적 / 행사 내용(요약)",
    "**신고인**: 단체명(개인은 성명) / 대표자 성명 / 주소 / 전화 / ★전자우편 / ★사업자등록번호(단체·법인) 또는 생년월일(개인만)",
    "**실무 연락 담당**: □ 신고인과 같음 / 다르면 성명·휴대전화·★전자우편",
    "**★사용 장소**: □ 동편 □ 서편 □ 목재-잔디광장 □ 전체 / 면적 ㎡ (위치도에 표시)",
    "**★사용 시간**: 설치 시작 월 일 시 / 행사 시~시 / 철거 끝 월 일 시 / 합계 시간 (□ 18시~06시 야간 포함)",
    "**★상설무대**: □ 쓰지 않음 □ 함께 신청(문화정책과로 전달 — 무대 사용 계획·서약서만 붙임)",
    "**사용 인원**: 최대 명",
    "**★사용료(미리 계산)**: 면적 ㎡ × 시간 × 10원 (+야간분 3할) = 원  ※ 최소 500㎡·2시간, 확정 금액은 받아들임(수리) 통보로 알림",
    "**★받는 곳**: 수리 통보·보완 요구·납부 안내 — 위 전자우편 / 세금계산서 — □ 신고인과 같음 □ 다름(상호·사업자등록번호)",
    "**붙임**: □ 행사계획서 □ 사용 위치도 □ 시설물 설치내역·원상복구계획서 □ 안전관리계획서",
    "★□ 서울광장 사용 준수사항을 읽었고 지키겠습니다.",
    "「서울특별시 서울광장의 사용 및 관리에 관한 조례」 제5조에 따라 위와 같이 신고합니다.  년 월 일  신고인 (서명 또는 인)  서울특별시장 귀하",
    "삭제: 주최단체의 대표자 칸·연락책임 칸의 주소·생년월일·직업, 직업(3곳), FAX",
]

SIDE_TEXT = [
    "**서울광장 사용 준수사항 확인**: (현행) ‘주최자 (인)’·‘신고자 (인)’ 두 번 날인 + 신고서 서명 → (개선) 신고서 맨 아래 확인 칸 하나, 서명 한 번",
    "**행사계획서 [별지 2-1호]**: (현행) 행사개요 — 일시 / 장소 ㎡(서울광장 편) / 참석 인원 / 주최·주관 / 내용 → (개선) 행사개요 삭제, “신고서와 같음”. 시간대별 행사내용·추진대책만 남김",
    "**안전관리계획서 [별지 2-4호]**: (현행) 행사 개최개요 — 참여 예상 인원 / 주요내용·시설물 → (개선) 삭제, “신고서와 같음”",
    "**서울광장 상설무대 대관 신청서(문화정책과)**: (현행) 행사명칭·사용목적·사용일시, 신청자(대표자)·행사책임자·연락책임자 인적사항 17칸, 행사계획서·시설물 설치내역·안전관리계획서·서약서 다시 제출 → (개선) 신고서의 ‘상설무대 함께 신청’ 체크로 갈음, 신고인은 ‘무대 사용 계획’과 서약서만 냄",
    "**광화문광장 사용허가신청서(광화문광장 조례 별지 제1호서식)**: (현행) 서울광장 신고서와 같은 구조 → (개선) 같은 개선안 적용, 두 광장 서식을 한 틀로",
]


def build():
    zin = zipfile.ZipFile(SRC)
    sec = zin.read("Contents/section0.xml").decode("utf-8")
    sp = tables(sec)

    # ── 서식 1 (표 1) ──
    a, b = sp[1]
    t = sec[a:b]
    t = rep(t, "<hp:t>○ ○ ○</hp:t>", f"<hp:t>{ME['name']}</hp:t>")
    t = rep(t, "<hp:t>○○.○○.○○)</hp:t>", f"<hp:t>{ME['birth_short']})</hp:t>")
    t = rep(t, "<hp:t>010-0000-0000</hp:t>", f"<hp:t>{ME['phone']}</hp:t>")
    t = fill_cell(t, 3, 2, para(ME["email"]), top=False)
    t = fill_cell(t, 3, 3, para(ME["addr"]), top=False)
    t = rep(t, "<hp:t>□ 서식간소화</hp:t>", "<hp:t>■ 서식간소화</hp:t>")
    t = rep(t, "<hp:t>□ 우리말 서식  □ 이용방식 개선(디지털 전환 등) □ 기타</hp:t>", "<hp:t>■ 우리말 서식  ■ 이용방식 개선(디지털 전환 등) □ 기타</hp:t>")
    t = fill_cell(t, 2, 5, para("**" + TITLE + "**"), top=False)
    t = fill_cell(t, 2, 6, para(FORM_NAME), top=False)
    t = fill_cell(t, 2, 7, "".join(para(x) for x in LAW), top=False)
    t = fill_cell(t, 2, 8, para(DEPT), top=False)
    t = fill_cell(t, 2, 9, bullets(PROBLEM))
    t = fill_cell(t, 2, 10, bullets(PLAN) + para("※ 전․후(신․구) 비교표: 붙임 2", PL, "s"))
    t = fill_cell(t, 2, 11, bullets(EFFECT))
    t = rep(t, "<hp:t>2026년  월    일</hp:t>", "<hp:t>2026년 11월  4일</hp:t>")
    t = rep(t, "<hp:t>                제안자 :             </hp:t>", f"<hp:t>                제안자 :  {ME['name']}  (서명)</hp:t>")
    sec = sec[:a] + t + sec[b:]

    # ── 서식 2 비교표 (표 3) ──
    sp = tables(sec)
    a, b = sp[3]
    t = sec[a:b]
    t = fill_cell(t, 0, 1, "".join(para(x, PL, "s") for x in CUR_TEXT))
    t = fill_cell(t, 1, 1, "".join(para(x, PL, "s") for x in NEW_TEXT))
    sec = sec[:a] + t + sec[b:]

    # 주요 변경사항: 예시 두 문단을 실제 변경사항으로 교체
    paras = [(m.start(), m.end()) for m in re.finditer(r'<hp:p [^>]*>(?:(?!<hp:p ).)*?\(예\) ‘(?:(?!<hp:p ).)*?</hp:p>', sec, flags=re.S)]
    assert len(paras) == 2, paras
    new = ("".join(para("ㅇ " + x, PB) for x in CHANGES)
           + para("") + para("**□ 함께 내는 양식 — 전․후 비교 (이어서)**")
           + "".join(para("ㅇ " + x, PB) for x in SIDE_TEXT)
           + para("") + para("근거 자료", PL, "s")
           + "".join(para("· " + x, PL, "s") for x in SOURCES)
           + para("· 이 제안서는 자료 조사와 초안 작성에 생성형 AI(Claude)를 활용했으며, 서식 원문 대조와 최종 판단은 제안자가 했습니다.", PL, "s"))
    sec = sec[:paras[0][0]] + new + sec[paras[1][1]:]

    # ── 서식 3 ──
    sec = rep(sec, "<hp:t>    □ 동의 ", "<hp:t>    ■ 동의 ")
    sec = rep(sec, "<hp:t>2026.   00.   00.</hp:t>", "<hp:t>2026.   11.   04.</hp:t>")
    sec = rep(sec, "<hp:t>본인      성명                               (인 또는 서명)</hp:t>",
              f"<hp:t>본인      성명   {ME['name']}                        (인 또는 서명)</hp:t>")
    # ── 서식 4 ──
    sec = rep(sec, "<hp:t>2026.   00.   00.</hp:t>", "<hp:t>2026.   11.   04.</hp:t>")
    sec = rep(sec, "<hp:t>                               성    명 :                           (인)</hp:t>",
              f"<hp:t>                               성    명 :  {ME['name']}                     (인)</hp:t>")
    sec = rep(sec, "<hp:t>                               생년월일 :</hp:t>", f"<hp:t>                               생년월일 :  {ME['birth']}</hp:t>")
    sec = rep(sec, "<hp:t>                               연 락 처 :</hp:t>", f"<hp:t>                               연 락 처 :  {ME['phone']}</hp:t>")

    header = patch_header(zin.read("Contents/header.xml").decode("utf-8"))
    prv = re.sub(r"<[^>]+>", "", sec.replace("</hp:p>", "\r\n"))
    with zipfile.ZipFile(OUT, "w") as zout:
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
    print(OUT, OUT.exists())


if __name__ == "__main__":
    build()
