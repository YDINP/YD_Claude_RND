"""원본 양식 hwpx(원본/붙임2)를 zipfile 로 열어 칸을 채운 hwpx 2개를 만든다.
- 구조 보존: mimetype 첫 항목 무압축, 나머지 항목·압축 방식·content.hpf 그대로
- section0.xml: 첫 문단(용지·머리 로고) + 해당 양식 문단만 남기고, 칸 문단을 새 문단으로 교체(linesegarray 없이 → 한글이 다시 줄나눔)
- header.xml: 본문용 글자 모양 4개(맑은 고딕 10pt 보통/굵게/남색 굵게, 8pt)와 줄간격 130% 문단 모양 1개 추가
실행: python build_hwpx.py
"""
import re, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
SRC = HERE / "원본" / "붙임2_국민제안서_양식모음.hwpx"
ME = dict(name="박용진", birth="1997. 5. 29.", phone="010-2576-9278", email="parkkb10@gmail.com")

# 새 글자/문단 모양 id (원본 charPr 0~48, paraPr 0~29)
N, B, H, S = 49, 50, 51, 52        # 보통 10pt, 굵게 10pt, 남색 굵게 10pt, 작은 8pt
PB = 30                            # 줄간격 130% 양쪽정렬


def patch_header(h):
    base = re.search(r'<hh:charPr id="45".*?</hh:charPr>', h, flags=re.S).group(0)  # 맑은 고딕, 굵게, 이탤릭 없음

    def cp(i, size, bold, color="#000000"):
        x = base.replace('id="45"', f'id="{i}"').replace('height="1200"', f'height="{size}"')
        x = x.replace('textColor="#000000"', f'textColor="{color}"', 1)
        x = re.sub(r'<hh:spacing [^>]*/>', '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>', x)
        return x if bold else x.replace("<hh:bold/>", "")

    new = cp(N, 1000, False) + cp(B, 1000, True) + cp(H, 1000, True, "#1C2F5E") + cp(S, 800, False)
    h = h.replace("</hh:charProperties>", new + "</hh:charProperties>")
    h = re.sub(r'<hh:charProperties itemCnt="(\d+)"', lambda m: f'<hh:charProperties itemCnt="{int(m.group(1)) + 4}"', h)
    p3 = re.search(r'<hh:paraPr id="3".*?</hh:paraPr>', h, flags=re.S).group(0)
    p = p3.replace('id="3"', f'id="{PB}"').replace('<hh:lineSpacing type="PERCENT" value="160"', '<hh:lineSpacing type="PERCENT" value="130"')
    h = h.replace("</hh:paraProperties>", p + "</hh:paraProperties>")
    h = re.sub(r'<hh:paraProperties itemCnt="(\d+)"', lambda m: f'<hh:paraProperties itemCnt="{int(m.group(1)) + 1}"', h)
    return h


STY = {"n": N, "b": B, "h": H, "s": S, "t": 32}  # t = 원본 17pt 굵게(맑은 고딕)


def para(runs, pp=PB):
    """runs: str 또는 [(스타일, 글), ...]. 스타일 n/b/h/s. '**굵게**' 표기 지원."""
    if isinstance(runs, str):
        parts = re.split(r"(\*\*.*?\*\*)", runs)
        runs = [("b", x[2:-2]) if x.startswith("**") else ("n", x) for x in parts if x]
    body = "".join(f'<hp:run charPrIDRef="{STY[s]}"><hp:t>{escape(t)}</hp:t></hp:run>' for s, t in runs)
    if not body:
        body = f'<hp:run charPrIDRef="{N}"/>'
    return f'<hp:p id="0" paraPrIDRef="{pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{body}</hp:p>'


def top_paras(sec):
    """section 최상위 <hp:p> 구간 (start, end) 목록."""
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


def fill_cell(tbl, col, row, paras_xml, top=True):
    for m in re.finditer(r"<hp:tc\b.*?</hp:tc>", tbl, flags=re.S):
        tc = m.group(0)
        if f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>' in tc:
            new = re.sub(r"(<hp:subList[^>]*>).*?(</hp:subList>)", lambda k: k.group(1) + paras_xml + k.group(2), tc, count=1, flags=re.S)
            if top:
                new = new.replace('vertAlign="CENTER"', 'vertAlign="TOP"', 1)
            return tbl[:m.start()] + new + tbl[m.end():]
    raise KeyError((col, row))


def fill_person(tbl):
    for old, new in (("홍길동", ME["name"]), ("YYYY. MM. DD.", ME["birth"]),
                     ("010-0000-0000", ME["phone"]), ("______@______", ME["email"])):
        tbl = re.sub(r'<hp:run charPrIDRef="21">(<hp:t>)' + re.escape(old) + "(</hp:t>)",
                     lambda k: f'<hp:run charPrIDRef="20">{k.group(1)}{new}{k.group(2)}', tbl, count=1)
    return tbl


def P(*lines):
    return "".join(para(x) for x in lines)


# ───────────── 양식3 국민참여예산 ─────────────
TITLE3 = "가짜를 쫓기 전에 진짜를 등록하자 — 공공기관 발송 문자 「진짜 문자 장부」"

FIELD = P("**디지털위협예방 (스미싱·공공기관 사칭 문자 피해 예방)**",
          [("s", "연계 사업: 스미싱 확인 서비스(보호나라 카카오톡 채널), 악성문자 사전차단 체계(엑스레이), 118 상담")])
SUMMARY = (para([("b", TITLE3)]) + P(
    "o **(주요 내용)** 공공기관 사칭 스미싱을 받는 사람이 아니라 **보내는 쪽에서 가려내기** 위한 「진짜 문자 장부」 추진",
    " - 공공기관이 대량 발송하는 문자의 **링크 주소·발신번호·기관명·발송일**을 엑스레이 검사 단계에서 장부에 자동 기록(본문·수신자 정보는 저장 안 함)",
    " - 스미싱 확인 서비스·118에 공공기관 이름 문자가 들어오면 장부와 대조해 **“○○구청이 11월 4일 보낸 진짜 문자” / “공공기관 장부에 없는 문자 — 누르지 마세요”**를 즉시 답변",
    "o **(기대효과)** 공공기관 사칭 문자의 즉시 판별, 진짜 공공 안내 문자의 신뢰 회복",
    " - 국민에게 매번 바뀌는 주의사항 대신 “**공공기관 이름을 단 문자는 장부·안심마크로 확인된 것만 진짜**”라는 한 줄 규칙을 줌"))
BACKGROUND = (para([("h", "왜 피해가 줄지 않는가 — 판별 책임이 ‘받는 사람’에게만 있다")]) + P(
    "o 차단 기술은 강해지고 있지만 스미싱은 줄지 않음: 2024년 상반기 KISA 접수 스미싱 신고 **88만 7,859건**(2020년 이후 최다)①, 2025년 상반기 탐지 **100만 건**, 과태료·국민연금 등 **공공기관 사칭이 상위**②",
    "o 국민이 받는 링크 문자 대부분은 진짜이고, 가짜는 그 사이에 섞여 옴: 한 스팸 알림 앱 이용자가 1주일간 받은 링크 문자 2천만 건 중 ‘위험·의심’ 판정은 **16%**③. “링크를 누르지 말라”는 교육은 매일 오는 진짜 링크 문자와 부딪혀 지켜지기 어려움",
    "o 정부의 “이번 문자에는 링크가 없다” 안내는 **사안마다 따로** 나옴(소비쿠폰 2차·고유가 피해지원금 등)④ → 국민이 외울 상시 규칙이 없음. 반대로 진짜 구청 문자를 스팸으로 알고 지우는 일도 많아 송파구는 KISA 인증 안심마크 문자를 따로 도입⑤",
    "o 스미싱 확인 서비스는 ‘가짜 목록’ 중심이라, 처음 보는 주소는 우선 ‘주의’로 답하고 재검사함. 언론 점검 때는 **KISA 공식 누리집 주소도 ‘주의’**로 안내됨① → 진짜 목록이 없으면 진짜도 확인해 줄 수 없음",
    "**⇒ 가짜는 끝없이 새로 생기지만, 공공기관이 보내는 진짜 문자는 보내는 순간 이미 알 수 있다. 진짜를 먼저 등록하면, 공공기관 이름을 달고 장부에 없는 문자는 곧바로 가짜다.**"))
MAIN = (para([("h", "① 진짜 문자 장부 (등록)")]) + P(
    " · 중앙부처·지자체·공공기관의 대량 문자 발송 계정을 문자 중계사에 ‘공공 발신’으로 지정",
    " · 이미 모든 중계사 문자의 링크를 검사하는 엑스레이 체계②에 기록 기능만 더해, 공공 발신 문자의 **링크 주소·발신번호·기관명·발송일시**를 자동 저장 — 기관이 따로 할 일 없음, 본문·수신자 저장 안 함")
    + para([("h", "② 즉시 확인 (조회)")]) + P(
    " · 스미싱 확인 서비스·118·KISA와 협약한 은행 앱 확인 기능에서 장부 대조 결과를 바로 답변: **진짜**(기관·발송일 표시) / **장부에 없는 공공기관 이름 문자**(가짜로 즉시 안내)",
    " · 처음 보는 주소라도 ‘주의’ 대기 없이 답할 수 있어 확인 서비스의 답변 품질이 올라감")
    + para([("h", "③ 사칭 경보 (역방향 통보)")]) + P(
    " · 장부에 없는 ‘○○구청’, ‘국민연금’ 이름의 문자가 엑스레이·확인 서비스에 잡히면 **해당 기관에 바로 통보** → 기관이 누리집·공식 채널로 “지금 우리 이름의 가짜 문자가 돌고 있다”를 알림")
    + para([("h", "④ 한 줄 규칙 홍보")]) + P(
    " · “공공기관 이름을 단 문자, **방패(안심마크)가 없으면 확인부터**” — KISA 인증 안심마크 문자(RCS)⑤와 장부를 묶어, 안심마크가 안 보이는 휴대폰도 확인 서비스로 같은 답을 받게 함")
    + para([("h", "⑤ 단계 추진")]) + P(
    " · **1년차(시범)**: 과기정통부·KISA, 지자체 10곳, 국민연금 등 사칭 상위 공공기관 — 확인 지표: 장부 대조 답변 비율, ‘주의’ 답변 감소, 사칭 통보 건수",
    " · **2년차(확대)**: 전 중앙부처·지자체·공공기관 발송 계정 — 확인 지표: 공공기관 사칭 문자 신고·피해 상담 변화"))
BUDGET = P(
    "**1년차 시범 약 2억 6천만 원** (제안자 추정. 기존 엑스레이·스미싱 확인 서비스를 재사용해 새 장비 없이 구축)",
    " · 장부 기록·조회 기능 개발(엑스레이 연계 API, 저장소): **1억 5천만 원** — 개발 인력 5명 × 6개월 수준(추정)",
    " · 스미싱 확인 서비스·118 상담 화면 장부 대조 연계: **5천만 원** — 기존 서비스 기능 추가(추정)",
    " · 시범 기관·중계사 연동 지원, 담당자 안내: **3천만 원** — 시범 기관 약 15곳 연동 점검(추정)",
    " · 한 줄 규칙 홍보, 효과 분석: **3천만 원** — 홍보물·온라인 홍보 2천 + 분석 1천(추정)")
SOURCES = "".join(para([("s", x)]) for x in (
    "근거 자료",
    "① 바이라인네트워크, 「스미싱 예방 어딜 의지해야 하나…KISA 대국민 서비스도 글쎄」, 2024.10.11. byline.network/2024/10/241011_002/",
    "② 바이라인네트워크, 「스미싱 문자 사전 차단…KISA ‘엑스레이’ 체계 가동」, 2025.8. byline.network/2025/08/29-390/",
    "③ 아시아경제, 「URL 포함 문자 16%가 스미싱 위험」(후후 이용자 1주일 2천만 건 분석), 2023.5.31. asiae.co.kr/en/article/2023053109315266011",
    "④ 아시아경제, 소비쿠폰 2차 URL 문자 미발송, 2025.9.14. asiae.co.kr/en/article/2025091411501244630 · 헤럴드경제, 「URL 링크가 포함된 고유가 피해지원금 문자와 알림은 100% 사기」, 2026.4. heraldk.com/article/2026041521362549780",
    "⑤ 헤럴드경제, 「송파구, 공공기관 사칭 막는 ‘RCS 안심문자 서비스’ 도입」, 2026.3.19. heraldk.com/article/2026031914302535907"))

# ───────────── 양식1 슬로건 ─────────────
SLOGAN = "진짜와 가짜 사이, KISA가 있습니다"
REASON = ("KISA가 하는 일을 한 문장으로 줄이면 ‘진짜와 가짜를 가려 주는 일’입니다. 택배 문자와 사칭 문자, 진짜 누리집과 피싱 사이트, "
          "정상 앱과 악성 앱 사이에서 국민은 매일 판단을 강요받고, 그 판단이 틀리는 순간 피해가 생깁니다. KISA는 바로 그 사이에서 "
          "스미싱을 판별하고, 악성 주소를 막고, 118로 답해 줍니다. ‘보안’, ‘안전’ 같은 넓은 말 대신 국민이 실제로 겪는 장면인 "
          "‘진짜와 가짜 사이’를 넣어, 듣는 순간 수상한 문자를 받았던 기억과 KISA가 연결되도록 했습니다. 어려운 말 없이 누구나 바로 "
          "이해하도록 일상어로만 지었습니다.")
EFFECT = ("수상한 문자 앞에서 ‘진짜와 가짜 사이에 KISA가 있다’가 떠올라 118·스미싱 확인 서비스 이용이 늘고, "
          "사칭 경보·안내문 어디에 붙여도 KISA의 역할이 한 줄로 전달됩니다.")


def build(keep, fill, out):
    zin = zipfile.ZipFile(SRC)
    sec = zin.read("Contents/section0.xml").decode("utf-8")
    spans = top_paras(sec)
    head, tail = sec[:spans[0][0]], sec[spans[-1][1]:]
    parts = [sec[a:b] for a, b in spans]
    kept = [parts[i] for i in keep]
    kept[1] = re.sub(r'pageBreak="1"', 'pageBreak="0"', kept[1], count=1)  # 양식 제목 문단: 앞 쪽나눔 제거
    kept = fill(kept)
    new_sec = head + "".join(kept) + tail
    header = patch_header(zin.read("Contents/header.xml").decode("utf-8"))
    prv = re.sub(r"<[^>]+>", "", new_sec.replace("</hp:p>", "\r\n"))
    with zipfile.ZipFile(out, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename == "Contents/section0.xml":
                data = new_sec.encode("utf-8")
            elif info.filename == "Contents/header.xml":
                data = header.encode("utf-8")
            elif info.filename == "Preview/PrvText.txt":
                data = prv[:1024].encode("utf-8")
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    print(out, out.exists())


def fill3(kept):
    t = kept[2]
    t = fill_cell(t, 1, 2, FIELD, top=False)
    t = t.replace("□ 국민애로 해소", "■ 국민애로 해소", 1).replace("□ 수행사업 효과 제고", "■ 수행사업 효과 제고", 1)
    t = t.replace('<hp:t>□ </hp:t></hp:run><hp:run charPrIDRef="27"><hp:t>행정서비스 개선', '<hp:t>■ </hp:t></hp:run><hp:run charPrIDRef="27"><hp:t>행정서비스 개선', 1)
    t = fill_person(t)
    t = fill_cell(t, 2, 6, SUMMARY)
    t = fill_cell(t, 2, 7, BACKGROUND)
    t = fill_cell(t, 2, 8, MAIN)
    t = fill_cell(t, 2, 9, BUDGET)
    kept[2] = t
    kept.append(SOURCES)
    return kept


def fill1(kept):
    t = fill_person(kept[2])
    t = fill_cell(t, 2, 4, para([("t", SLOGAN)], pp=21), top=False)
    t = fill_cell(t, 2, 5, para(REASON), top=False)
    t = fill_cell(t, 2, 6, para(EFFECT), top=False)
    kept[2] = t
    return kept


if __name__ == "__main__":
    build([0, 7, 8, 9], fill3, HERE / "국민제안서_국민참여예산_진짜문자장부_박용진.hwpx")
    build([0, 1, 2, 3], fill1, HERE / "국민제안서_슬로건_박용진.hwpx")
