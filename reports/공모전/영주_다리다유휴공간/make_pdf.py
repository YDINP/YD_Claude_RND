"""2026 「다시, 다리다」 유휴공간 활성화 아이디어 공모전 — 제출서류 PDF 생성.

참가신청서 · 붙임1 아이디어 제안서 · 붙임2 AI 활용 확인서 · 붙임3 개인정보 동의서를
원본 docx(신청서류_원본.docx) 문구 그대로 HTML 로 재현 → Chrome headless 로 PDF 출력.
실행: python make_pdf.py   (Chrome 은 전용 --user-data-dir 로 분리 실행, 사용자 크롬과 무관)
"""
import base64, subprocess, time
from pathlib import Path

OUT = Path(__file__).resolve().parent
KIT = Path(r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/kit")
WORK = KIT.parent / "darida" / "build"
WORK.mkdir(parents=True, exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((KIT / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호", birth="1997. 5. 29.", y="2026", m="11", d="4")
TITLE = "맡겨 두고, 찾으러 오는 집 — 옛 한약방의 ‘다시 오게 하는 원리’로 되살리는 다리다"
SUMMARY = ("체험·전시가 한 번 오고 끝나는 이유는 ‘다시 올 날’이 없기 때문입니다. 한약방은 약을 맡기고 며칠 뒤 찾으러 오게 해 "
           "손님이 저절로 다시 왔습니다. 다리다에서 영주 사과·생강으로 청을 담그면 병은 이름표를 달고 광복로 쪽 창가 ‘맡김 선반’에서 1~2주 익고, "
           "손님은 ‘찾는 날’에 다시 와 한 잔 마시고 광복로 가게 쿠폰을 받아 갑니다. 손님이 맡긴 병이 곧 전시가 되고(전시장), "
           "재료·병은 판매(소매점), 찾는 날의 한 잔은 카페(휴게음식점) 매출이 됩니다. 12월 시범운영은 ‘담그는 날’ 2회 + ‘찾는 날’ 1회로, "
           "맡긴 병의 회수율을 바로 측정합니다.")

BOX_ON, BOX_OFF = "☑", "□"

BASE_CSS = """
@page { size:A4; margin:15mm 16mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic','Segoe UI Symbol',sans-serif; font-size:10pt; color:#111; line-height:1.55; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; margin-left:22px; }
.sig { position:absolute; left:50%; top:50%; height:44px; transform:translate(-50%,-50%); }
"""


def sign(label="(서명)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def ck(on):
    return BOX_ON if on else BOX_OFF


# ───────────────────────── 지정서식: 참가신청서 · 붙임2 · 붙임3 ─────────────────────────
FORM_CSS = BASE_CSS + """
.f td { border:1px solid #000; padding:6px 8px; vertical-align:middle; font-size:9.5pt; }
.f .h { background:#f2f2f2; text-align:center; font-weight:700; font-size:10pt; }
.f .hh { background:#e5e5e5; text-align:center; font-weight:700; }
.note { font-size:8.5pt; color:#333; }
.title { text-align:center; font-size:13pt; font-weight:700; margin:4px 0 10px; }
.big { text-align:center; font-size:17pt; font-weight:700; letter-spacing:2px; margin:6px 0 12px; }
.tag { font-weight:700; font-size:11pt; margin-bottom:4px; }
.c { text-align:center; } .r { text-align:right; }
.sec { font-weight:700; margin:12px 0 4px; font-size:10.5pt; }
.ind { margin:2px 0 2px 14px; font-size:10pt; }
.to { text-align:center; font-size:15pt; font-weight:700; margin-top:22px; }
"""


def forms_html():
    m = ME
    date = f"{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일"
    p_apply = f"""
<div class="title">2026 「다시, 다리다」 유휴공간 활성화 아이디어 공모전</div>
<table class="f">
<tr><td class="h" style="width:15%">접수번호</td><td colspan="4"><span class="note">※ 운영사무국 기재란</span></td></tr>
<tr><td class="h">제안분야</td><td colspan="4">{ck(0)} 공연·전시 &nbsp;{ck(0)} 교육·체험 &nbsp;{ck(0)} 문화·관광 &nbsp;{ck(1)} 카페·로컬상품 &nbsp;{ck(0)} 기타 (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
<tr><td class="h">참가구분</td><td style="width:35%">{ck(1)} 개인 &nbsp;&nbsp;&nbsp;{ck(0)} 팀(대표 포함 &nbsp;&nbsp;&nbsp;&nbsp;명)</td>
    <td class="h" style="width:15%">대표자<br>연령구분</td><td colspan="2">{ck(1)} 성인 &nbsp;&nbsp;{ck(0)} 미성년자(만 19세 미만)</td></tr>
<tr><td class="h">대표자 성명</td><td>{m['name']}</td><td class="h">팀명</td><td colspan="2"><span class="note">※ 팀 참가 시 기재</span></td></tr>
<tr><td class="h">연락처</td><td>{m['phone']}</td><td class="h">이메일</td><td colspan="2">{m['email']}</td></tr>
<tr><td class="h">주소</td><td colspan="4">{m['addr']}<br><span class="note">※ 주소는 시상 관련 배송 등이 필요한 경우에 한하여 기재</span></td></tr>
<tr><td class="h" rowspan="4">구 성 원</td><td class="hh" style="width:8%">구분</td><td class="hh">성명</td><td class="hh">소속 / 역할</td><td class="hh">연락처</td></tr>
<tr><td class="c">1</td><td class="c" style="color:#777;font-size:8.5pt">해당 없음(개인)</td><td></td><td></td></tr>
<tr><td class="c">2</td><td></td><td></td><td></td></tr>
<tr><td class="c">3</td><td></td><td></td><td></td></tr>
<tr><td class="h">아이디어명</td><td colspan="4"><b>{TITLE}</b></td></tr>
<tr><td class="h">아이디어 개요</td><td colspan="4" style="font-size:9.3pt;line-height:1.55">{SUMMARY}</td></tr>
<tr><td class="h">사업화 활용</td><td colspan="4" style="font-size:9.3pt">수상 아이디어는 다리다의 프로그램 개발·시범운영 등에 활용될 수 있으며, 구체적인 수정·보완 및 이용범위는 제안자와 사전 협의함을 확인합니다.
 &nbsp;{ck(1)} 확인 및 동의 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ck(0)} 동의하지 않음</td></tr>
<tr><td class="h">참가경로</td><td colspan="4">{ck(0)} SNS &nbsp;{ck(1)} 공모전 플랫폼 &nbsp;{ck(0)} 학교·교육기관 &nbsp;{ck(0)} 기관·단체 &nbsp;{ck(0)} 지인 &nbsp;{ck(0)} 기타 (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
</table>
<p class="c" style="font-size:11pt;margin:16px 0 8px">본인은 공고사항을 숙지하였고, 제출 내용이 사실과 다르지 않으며<br>타인의 권리를 침해하지 않았음을 확인합니다.</p>
<p style="font-size:11pt;margin:6px 0 0 4px;line-height:1.7">붙임 &nbsp;1. 아이디어 제안<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. AI 활용 및 아이디어 권리·활용 확인서<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3. 개인정보 수집·이용 동의서</p>
<p class="r" style="font-size:11pt;margin:10px 30px 10px 0">{date}</p>
<p class="r" style="font-size:11pt;margin:0 30px 0 0">참가자대표 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명)')}</p>
<div class="to">문화정원 귀하</div>
"""
    ai_rows = [
        ("자료 조사·사례 분석", "Claude (Anthropic)", "공고문·공간정보 자료집 내용 정리, 참고사례(HAGISO, 스타벅스 경동1960점) 웹 검색과 기사 원문 확인 보조", "자료 수집·출처 확인"),
        ("기획·아이디어 정리", "Claude (Anthropic)", "후보 아이디어 비교, 제안서·신청서 문안 초안, 예산·수익 추정표 계산", "초안 작성 보조"),
        ("이미지·시각화 자료", "Claude (Anthropic)", "제안서 안의 배치 예시도·일정 도식(코드로 그린 단순 도형)", "도식 작성 보조"),
        ("그 밖의 활용", "Claude (Anthropic)", "지정서식 문구 옮겨 적기와 PDF 편집", "서식 정리"),
    ]
    rows = "".join(f'<tr><td class="hh" style="font-weight:400">{a}</td><td class="c">{b}</td><td>{c}</td><td>{d}</td></tr>' for a, b, c, d in ai_rows)
    p_ai = f"""
<div class="tag">붙임2. AI 활용 및 아이디어 권리·활용 확인서</div>
<div class="note">※ AI를 사용하지 않은 경우 활용 세부 내역은 작성하지 않아도 되며, 하단 권리·활용 확인은 필수입니다.</div>
<div class="big">AI 활용 및 아이디어 권리·활용 확인서</div>
<table class="f">
<tr><td class="h" style="width:18%">아이디어명</td><td colspan="3">{TITLE}</td></tr>
<tr><td class="h">참가자 대표</td><td colspan="2" style="width:50%">{m['name']}</td><td>{sign('(서명)')}</td></tr>
<tr><td class="h">AI 활용 여부</td><td colspan="3">{ck(0)} 사용하지 않음 &nbsp;{ck(1)} 기획·자료작성 등에 사용 &nbsp;{ck(0)} 사용 예정</td></tr>
</table>
<div class="sec">1. AI 활용 세부 내역</div>
<table class="f">
<tr><td class="hh" style="width:20%">활용 단계</td><td class="hh" style="width:18%">AI 프로그램명</td><td class="hh">활용 내용·적용 부분</td><td class="hh" style="width:18%">사용 목적(간략)</td></tr>
{rows}
</table>
<p class="note" style="margin:3px 0 0">※ 아이디어 선정과 최종 내용·수치·출처는 제안자 본인이 검토·결정하였습니다.</p>
<div class="sec">2. 아이디어 독창성 및 권리관계 확인 (필수)</div>
<p class="ind">○ 제출한 제안은 타인의 아이디어·저작물·상표 등을 무단 도용하지 않았으며, 외부 사진·도면·자료의 출처 및 사용조건을 확인하였습니다.</p>
<p class="ind">○ 아이디어의 권리는 원칙적으로 제안자에게 귀속되고, 미선정 제안은 심사 목적을 넘어 무단 활용하지 않음을 확인합니다.</p>
<div class="sec">3. 선정 아이디어의 사업화 활용 확인 (필수)</div>
<p class="ind">○ 수상 아이디어는 문화정원이 다리다 활성화를 위한 운영모델로 분석·개발할 수 있으며, 실제 사업화·시범운영에 필요한 수정·보완·결합과 구체적인 이용범위는 제안자와 사전 협의합니다.</p>
<p class="ind">○ 선정자가 직접 사업을 실행할 의무는 없으며, 시범운영 실시 여부와 방식은 공간 여건 및 사업계획에 따라 결정됩니다.</p>
<p class="c" style="margin:16px 0 6px">위 사항을 확인하였으며, 공모전 운영 및 선정 후 활용 협의 절차에 동의합니다.</p>
<p class="c" style="font-size:11pt">위 내용에 동의하십니까? &nbsp;{ck(1)} 동의합니다. &nbsp;&nbsp;{ck(0)} 동의하지 않습니다.</p>
<p class="r" style="font-size:11pt;margin:16px 30px 10px 0">{date}</p>
<p class="r" style="font-size:11pt;margin:0 30px 0 0">참가자대표 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명/인)')}</p>
<div class="to">문화정원 대표 귀하</div>
"""
    blank_row = f'<tr><td style="height:30px"></td><td class="c">{ck(0)} 성인 &nbsp;{ck(0)} 미성년</td><td></td><td class="c">{ck(0)} 동의 &nbsp;{ck(0)} 거부</td><td></td></tr>'
    p_pi = f"""
<div class="tag">붙임3. 개인정보 수집‧이용 동의서</div>
<div class="big">개인정보 수집‧이용 동의서</div>
<table class="f">
<tr><td class="h" style="width:18%">아 이 디 어 명</td><td>{TITLE}</td></tr>
<tr><td class="h">참가자 대표</td><td>{m['name']}</td></tr>
</table>
<div class="sec">1. 작품 참여자 정보 <span style="font-weight:400;font-size:9pt">※ 참가자 포함 참여인력 전체 (팀일 경우, 반드시 기재)</span></div>
<table class="f">
<tr><td class="hh" style="width:16%">성명</td><td class="hh" style="width:24%">구분</td><td class="hh" style="width:18%">소속(선택)</td><td class="hh" style="width:22%">동의 여부</td><td class="hh">자필서명</td></tr>
<tr><td class="c" style="height:34px">{m['name']}</td><td class="c">{ck(1)} 성인 &nbsp;{ck(0)} 미성년</td><td></td><td class="c">{ck(1)} 동의 &nbsp;{ck(0)} 거부</td><td class="c">{sign('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')}</td></tr>
{blank_row}{blank_row}{blank_row}
</table>
<div class="note" style="margin-top:3px">※ 구성원 4명 초과 시 이 표를 복사하여 추가 작성합니다.</div>
<div class="sec">2. 개인정보 수집·이용 안내</div>
<p class="ind">가. 수집·이용 목적 : 공모전 접수, 참가자 확인, 서류평가, 결과 통보, 시상 및 공모 운영 관리</p>
<p class="ind">나. 수집 항목 : 이름, 연락처, 이메일, 참가구분, 소속(기재 시) 등 / 주소는 시상 관련 배송이 필요한 경우에 한하여 추가 수집</p>
<p class="ind">다. 개인정보 처리자 : 문화정원</p>
<p class="ind">라. 보유·이용기간 : 3년 (관련 법령상 보존이 필요한 자료는 해당 기간 보존)</p>
<p class="ind">마. 동의 거부권 : 개인정보 수집·이용에 동의하지 않을 수 있으나, 필수정보 미동의 시 공모전 접수·심사·시상이 제한될 수 있음</p>
<table class="f" style="margin-top:10px">
<tr><td class="h" rowspan="3" style="width:16%">미성년 참가자</td><td class="hh" style="width:16%">생년월일</td><td></td><td class="hh" style="width:16%">법정대리인</td><td></td></tr>
<tr><td class="hh">관계·연락처</td><td colspan="3"></td></tr>
<tr><td class="hh">동의·서명</td><td colspan="3">{ck(0)} 참가 동의 &nbsp;&nbsp;&nbsp;{ck(0)} 만 14세 미만 개인정보 수집·이용 동의<br>법정대리인 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</td></tr>
</table>
<p class="r" style="font-size:11pt;margin:18px 30px 10px 0">{date}</p>
<p class="r" style="font-size:11pt;margin:0 30px 0 0">참가자대표 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명/인)')}</p>
<div class="to">문화정원 대표 귀하</div>
"""
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지정서식</title><style>{FORM_CSS}</style></head><body>'
            + p_apply + '<div class="pb"></div>' + p_ai + '<div class="pb"></div>' + p_pi + '</body></html>')


# ───────────────────────── 붙임1. 아이디어 제안서 (A4 5쪽 이내) ─────────────────────────
IDEA_CSS = BASE_CSS + """
@page { margin:12mm 13mm; }
:root { --g:#7a3e1d; --gl:#f7efe8; --gd:#e9d9cb; --k:#2f5d50; }
body { font-size:9.1pt; line-height:1.47; }
.tag { font-weight:700; font-size:10pt; } .tag span { color:#555; font-weight:400; font-size:9pt; }
.big { text-align:center; font-size:16pt; font-weight:700; letter-spacing:6px; margin:4px 0 8px; }
.p > tbody > tr > td { border:1px solid #555; padding:5px 8px; vertical-align:top; }
.p > tbody > tr > td.h { width:13%; background:#f2f2f2; text-align:center; vertical-align:middle; font-weight:700; font-size:9.6pt; }
.p > tbody > tr { page-break-inside:auto; }
p { margin:2px 0; } ul { margin:2px 0 2px 16px; padding:0; } li { margin:1px 0; }
b.k { color:var(--g); }
.lead { font-size:10.2pt; font-weight:700; color:var(--g); margin-bottom:3px; }
.in td, .in th { border:1px solid #bba; padding:3px 6px; font-size:8.8pt; vertical-align:top; }
.in th { background:var(--gl); font-weight:700; }
.box { border:1.4px solid var(--g); border-radius:5px; padding:5px 9px; margin:4px 0; background:#fffdfb; }
.src { font-size:7.9pt; color:#444; line-height:1.42; }
.note { font-size:8.2pt; color:#555; }
.num { display:inline-block; background:var(--g); color:#fff; border-radius:3px; padding:0 5px; font-weight:700; font-size:8.6pt; margin-right:4px; }
"""


def idea_html():
    space_svg = """<svg viewBox="0 0 720 210" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="12">
<rect x="0" y="0" width="720" height="210" fill="#fbf8f5"/>
<rect x="10" y="176" width="700" height="26" fill="#e3ddd6"/><text x="360" y="194" text-anchor="middle" fill="#444" font-weight="700">광 복 로  (버스정류장 · 상망동 행정복지센터 방향)</text>
<rect x="430" y="104" width="230" height="64" rx="4" fill="#7a3e1d"/>
<text x="545" y="126" text-anchor="middle" fill="#fff" font-weight="700">① 길가 동 — 카페·판매</text>
<text x="545" y="144" text-anchor="middle" fill="#fff">찾는 날 한 잔 · 재료/병 판매</text>
<text x="545" y="160" text-anchor="middle" fill="#ffd9b8" font-weight="700">창가 = ‘맡김 선반’ (길에서 보임)</text>
<rect x="200" y="104" width="210" height="64" rx="4" fill="#c58b5f"/>
<text x="305" y="128" text-anchor="middle" fill="#fff" font-weight="700">② 작업 동 — 담그는 자리</text>
<text x="305" y="148" text-anchor="middle" fill="#fff">10인 작업대 · 전기 인덕션만</text>
<rect x="430" y="18" width="230" height="70" rx="4" fill="#2f5d50"/>
<text x="545" y="44" text-anchor="middle" fill="#fff" font-weight="700">③ 한옥 동 — 맡김 장부(전시)</text>
<text x="545" y="64" text-anchor="middle" fill="#fff">맡긴 사람 이야기·주민 레시피</text>
<text x="545" y="80" text-anchor="middle" fill="#fff">옛 한약방 시절 기억 모음</text>
<rect x="200" y="18" width="210" height="70" rx="4" fill="#efe4d8" stroke="#c58b5f" stroke-dasharray="4 3"/>
<text x="305" y="48" text-anchor="middle" fill="#7a3e1d" font-weight="700">마당 — 대기·시음·사진</text>
<text x="305" y="68" text-anchor="middle" fill="#7a3e1d">찾는 날 작은 시음대</text>
<rect x="20" y="18" width="160" height="150" rx="4" fill="#f4efe9" stroke="#bbb"/>
<text x="100" y="60" text-anchor="middle" fill="#555" font-weight="700">부속동 2동</text>
<text x="100" y="80" text-anchor="middle" fill="#555">병 소독·재료 보관</text>
<text x="100" y="100" text-anchor="middle" fill="#555">(창고·설거지)</text>
<text x="100" y="140" text-anchor="middle" fill="#888" font-size="11">주차 2대 = 운영·납품용</text>
</svg>"""
    pilot_svg = """<svg viewBox="0 0 720 112" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="12">
<rect width="720" height="112" fill="#fbf8f5"/>
<line x1="30" y1="56" x2="700" y2="56" stroke="#7a3e1d" stroke-width="3"/>
<g font-weight="700"><circle cx="70" cy="56" r="9" fill="#999"/><circle cx="250" cy="56" r="11" fill="#7a3e1d"/><circle cx="430" cy="56" r="11" fill="#7a3e1d"/><circle cx="620" cy="56" r="12" fill="#2f5d50"/></g>
<text x="70" y="30" text-anchor="middle" font-weight="700">12. 1~11</text><text x="70" y="86" text-anchor="middle">준비·예약 오픈</text><text x="70" y="102" text-anchor="middle" fill="#666" font-size="11">재료처·주민 강사 섭외</text>
<text x="250" y="30" text-anchor="middle" font-weight="700" fill="#7a3e1d">12. 12.(토) 1회</text><text x="250" y="86" text-anchor="middle">담그는 날 ① 사과·생강청</text><text x="250" y="102" text-anchor="middle" fill="#666" font-size="11">2회차 × 10명 · 맡김 2주</text>
<text x="430" y="30" text-anchor="middle" font-weight="700" fill="#7a3e1d">12. 19.(토) 2회</text><text x="430" y="86" text-anchor="middle">담그는 날 ② 같은 메뉴</text><text x="430" y="102" text-anchor="middle" fill="#666" font-size="11">2회차 × 10명 · 맡김 1주</text>
<text x="620" y="30" text-anchor="middle" font-weight="700" fill="#2f5d50">12. 26.(토)~27.(일) 3회</text><text x="620" y="86" text-anchor="middle">찾는 날 + 연말 선물 포장</text><text x="620" y="102" text-anchor="middle" fill="#666" font-size="11">회수율·추가구매 측정</text>
</svg>"""
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>아이디어 제안서</title><style>{IDEA_CSS}</style></head><body>
<div class="tag">붙임1. 아이디어 제안서 <span>※ 이미지 포함 최대 5페이지 이내 작성</span></div>
<div class="big">아 이 디 어 제 안 서</div>
<table class="p"><tbody>
<tr><td class="h">아이디어명</td><td><div style="font-size:12pt;font-weight:700;color:#7a3e1d">맡겨 두고, 찾으러 오는 집</div>
<div style="font-size:10pt;font-weight:700">옛 한약방의 ‘다시 오게 하는 원리’로 되살리는 다리다 — 내가 담근 영주 사과청을 다리다 창가에 맡기고, 2주 뒤 찾으러 온다</div></td></tr>

<tr><td class="h">주제 및<br>기획의도</td><td>
<div class="lead">한 줄 통찰: 손님이 다시 오지 않는 건 프로그램이 나빠서가 아니라 ‘다시 올 날’이 없어서다.</div>
<p><b>공간 여건(공간정보 자료집 기준)</b> — 영주시 광복로 85(하망동 140-2), 경상북도 낙후지역발전 전략사업(광복로 장소가치 향상사업)으로 2020~2024년 리모델링·전시공간 조성. 대지 807㎡, 건축면적 264.28㎡, 연면적 255.22㎡, 주건축물 3동·부속건축물 2동, <b>주차 2대</b>, 용도 <b>소매점·전시장·휴게음식점</b>. 위치도상 건물 앞 광복로에 버스정류장이, 바로 동쪽 블록에 상망동 행정복지센터·영주상망작은도서관이 있고, 현황사진상 광복로 모퉁이에 면한 흰 건물의 유리창과 그 뒤 한옥 지붕이 보입니다. 다리다는 <b>옛 한약방 건물</b>을 시가 사들여 고친 문화거점입니다.</p>
<p><b>왜 이런 공간은 잘 안 되는가 — 원인 셋</b></p>
<table class="in"><tr><th style="width:30%">원인</th><th>다리다에서 드러나는 모습</th></tr>
<tr><td>① 차로 오는 손님에 기댈 수 없다</td><td>주차 2대. 대형 행사·축제형으로 사람을 모으면 주변 도로·주민 불편부터 생깁니다.</td></tr>
<tr><td>② 작은 동이 여럿이라 사람이 많이 든다</td><td>연면적 255㎡가 5동으로 나뉘어 있어, 동마다 상주 인력을 두면 인건비가 매출을 넘습니다.</td></tr>
<tr><td>③ 체험·전시는 매번 손님을 새로 모아야 한다</td><td>원데이 클래스·전시·마켓은 ‘한 번 와 본 곳’으로 끝나기 쉽습니다. 홍보비가 매번 처음부터 듭니다.</td></tr></table>
<p style="margin-top:4px"><b>해법의 실마리는 건물의 내력에 있습니다.</b> 한약방은 손님이 약을 지어 맡기면 며칠 뒤 <b>찾으러 다시 오는</b> 가게였습니다. 홍보 없이도 손님이 두 번 오는 구조입니다. 이 제안은 그 구조를 되살려, 다리다에 오는 모든 손님이 <b>스스로 다음 방문 날짜를 정하고 돌아가게</b> 만드는 것이 핵심입니다.</p>
<p><b>목표 이용자</b> — ① 영주 시내·원도심 주민(30~60대, 걸어서·버스로 오는 사람) ② 부석사·소수서원 등을 찾는 주말 외지 방문객(맡긴 병은 택배 회수 선택) ③ 상망동·하망동 어르신(레시피 제공자·주민 강사).</p>
</td></tr>

<tr><td class="h">국내외<br>참고사례</td><td>
<table class="in"><tr><th style="width:23%">사례</th><th>운영 현황(출처 확인 내용만)</th><th style="width:25%">고른 이유</th></tr>
<tr><td><b>HAGISO · hanare</b><br>일본 도쿄 다이토구 야나카</td><td>1955년 지은 목조 아파트 ‘하기소’는 2011년 철거 예정이었으나, 마지막 전시에 1,500명이 몰리며 철거가 취소됐고 2013년 카페·갤러리 복합공간으로 열었습니다. 갤러리는 작지만 매달 새 전시를 엽니다. 2015년 11월부터 1분 거리의 목조 아파트를 숙소 ‘hanare’로 운영하며 “마을 전체가 호텔”이라는 방식으로, 체크인·조식은 HAGISO에서 하고 목욕은 동네 대중목욕탕, 저녁은 인근 식당을 안내합니다.</td><td>작고 오래된 건물이 구도심에서 <b>동네 전체로 손님을 보내는</b> 거점이 된 사례. 다리다처럼 시설을 다 갖출 수 없는 공간에 맞습니다.</td></tr>
<tr><td><b>스타벅스 경동1960점</b><br>서울 동대문구 경동시장</td><td>1960년대 경동시장에 지어진 뒤 운영을 멈춘 경동극장을 고쳐 2022년 12월 17일 열었습니다. 극장 좌석처럼 계단식으로 테이블을 놓았고, 동반성장위원회·경동시장상인연합회·케이디마켓과 4자 상생협약을 맺어 <b>매장의 모든 품목에서 300원씩 적립</b>해 시장 상생기금으로 쓰기로 했습니다.</td><td>전통시장 속 유휴공간이 <b>장소의 옛 쓰임을 경험으로 살리고</b>, 매출 일부를 <b>주변 상권에 돌리는</b> 구조를 처음부터 넣은 사례.</td></tr></table>
</td></tr>

<tr><td class="h">성공요인<br>분석</td><td>
<table class="in"><tr><th style="width:26%">요인</th><th>사례에서 본 모습</th><th style="width:34%">다리다에 옮길 원칙</th></tr>
<tr><td>방문 — 장소의 옛 쓰임을 지우지 않는다</td><td>극장이었던 흔적(계단식 좌석)이 곧 그곳에 갈 이유(경동1960)</td><td><b>한약방 = 맡기고 찾으러 오는 집</b>을 운영 방식으로 되살림</td></tr>
<tr><td>체류 — 건물 하나로 끝내지 않는다</td><td>숙소는 잠만, 목욕·저녁은 동네 가게로(hanare)</td><td>찾는 날 받는 <b>광복로 가게 쿠폰</b>으로 원도심을 걷게 함</td></tr>
<tr><td>재방문 — 늘 바뀌는 무언가가 있다</td><td>매달 바뀌는 작은 전시(HAGISO)</td><td>창가 선반의 병이 <b>매주 바뀌는 살아 있는 진열</b>이 됨</td></tr>
<tr><td>지역 — 매출이 이웃에게도 간다</td><td>품목당 300원 상생 적립(경동1960)</td><td>병·잔당 200원을 <b>원도심 적립</b>으로 주민 강사 사례·공동 홍보에 씀</td></tr></table>
</td></tr>

<tr><td class="h">다리다 적용<br>아이디어</td><td>
<div class="box"><span class="num">핵심 장치</span><b>맡김증과 맡김 선반</b> — 담근 병에 이름·담근 날·찾는 날을 적은 라벨을 붙이고, 손님에게 옛 약봉지 모양의 <b>‘맡김증’</b>을 줍니다. 병은 광복로 쪽 창가 선반에 줄지어 익고, 손님은 맡김증을 들고 정해진 날 찾으러 옵니다. 지나가는 사람에게는 이름표 붙은 병이 늘어 가는 창이 곧 간판입니다.</div>
<p><span class="num">1</span><b>담그는 날(소매점·휴게음식점)</b> — 영주 사과·생강 등 계절 재료를 썰어 설탕과 켜켜이 담는 40분 작업. 혼자 하는 체험이 아니라 <b>‘맡기러 오는 일’</b>로 안내합니다. 1L 병 1개 기준.</p>
<p><span class="num">2</span><b>맡김 선반(전시장)</b> — 창가 선반 3단, 최대 60병. 병이 익어 가는 모습을 사진으로 찍어 맡긴 사람에게 한 번 보내 줍니다(찾는 날 알림 겸).</p>
<p><span class="num">3</span><b>찾는 날(휴게음식점·소매점)</b> — 맡김증을 내면 내 청으로 탄 따뜻한 차 한 잔을 마당·카페에서 마시고, 병을 찾아갑니다. 이때 다음 계절 ‘담그는 날’ 예약, 선물 포장, 추가 병 구매가 일어납니다.</p>
<p><span class="num">4</span><b>맡김 장부(전시장)</b> — 한옥 동에 ‘맡긴 사람들의 이야기’를 모읍니다. 누구에게 주려고 담갔는지 한 줄씩 적은 카드, 주민이 기억하는 겨울 차 레시피, 옛 한약방 시절 기억(주민 동의 후). 계절마다 바꿉니다.</p>
{space_svg}
<p class="note">※ 위 그림은 기능 배치 <b>예시</b>입니다. 자료집에는 동별 면적·설비가 나와 있지 않으므로 실제 배정은 운영주체가 현장 여건으로 정합니다. 목조 한옥이므로 불은 쓰지 않고 전기 인덕션·전기포트만 씁니다. 사용 재료는 식품 원료만이며, 효능·치료 표현은 하지 않습니다(식품 표시·광고 관련 법령 준수).</p>
</td></tr>

<tr><td class="h">이용자 및<br>운영 흐름</td><td>
<p><b>한 사람의 경험</b> — (예약) 이달의 담그는 날 선택 → (1회차 방문, 60분) 웰컴 차 → 재료 고르고 썰어 담기 → 라벨 쓰기·맡김증 받기 → 맡김 장부에 “누구에게 줄 청인지” 한 줄 → (1~2주 뒤 문자 알림) → (2회차 방문, 30분) 내 청으로 탄 차 한 잔 → 병 찾기 → 광복로 가게 쿠폰 → 원도심 산책.</p>
<table class="in"><tr><th style="width:15%">구분</th><th>운영 주기</th></tr>
<tr><td>담그는 날</td><td>매월 1·3째 토요일, 11시·14시 2회차 × 정원 10명 / 평일 저녁 주민반 월 2회(목 19시, 정원 8명)</td></tr>
<tr><td>찾는 날</td><td>카페 운영 시간 중 언제든(별도 인력 없이 카페 근무자가 맡김증 확인) + 월 1회 ‘찾는 날 모임’(시음·선물 포장)</td></tr>
<tr><td>맡김 기간</td><td>1~2주(재료별로 진행 강사가 위생 기준과 함께 확정). 4주 안에 못 오면 택배 회수(실비) 또는 다음 방문까지 보관</td></tr></table>
<table class="in" style="margin-top:4px"><tr><th style="width:15%">계절</th><th>맡기는 것(예시)</th><th style="width:40%">이어 붙이는 계기</th></tr>
<tr><td>겨울 12~2월</td><td>사과·생강청, 대추·생강청</td><td>연말·설 선물 병(포장 판매)</td></tr>
<tr><td>봄 3~5월</td><td>봄 과일청·꽃차 블렌드</td><td>주민 레시피 공모로 메뉴 선정</td></tr>
<tr><td>여름 6~8월</td><td>과일 식초·냉침 차(냉장 쇼케이스 보관)</td><td>방학 가족 회차</td></tr>
<tr><td>가을 9~11월</td><td>햇사과청, 인삼을 넣은 사과청</td><td>풍기인삼축제·사과 수확 철 방문객</td></tr></table>
<p style="margin-top:5px"><b>12월 시범운영안(공고의 현장 실증 2~3회에 맞춤)</b> — 같은 메뉴를 맡김 기간만 달리해(2주 / 1주) <b>회수율 차이</b>를 비교합니다.</p>
{pilot_svg}
</td></tr>

<tr><td class="h">운영 인력·<br>비용</td><td>
<p><b>역할</b> — 운영주체(문화정원): 예약·안내·정산, 카페 근무자가 찾는 날 응대 / 진행 강사 1명: 지역 카페·청 제조 경험이 있는 청년 또는 주민 / 보조 1명: 지역 청년 단기 인력 / 주민 레시피 제공자: 계절당 3~5명(사례금).</p>
<table class="in"><tr><th style="width:36%">1회(담그는 날 하루, 2회차 20명) 예상비용</th><th style="width:14%">금액</th><th style="width:36%">초기 장비(1회성)</th><th>금액</th></tr>
<tr><td>진행 강사 2회차 × 7만</td><td>14만 원</td><td>맡김 선반 3단·라벨 프린터</td><td>50만 원</td></tr>
<tr><td>보조 1일</td><td>8만 원</td><td>작업대 소도구 10인분(도마·칼·저울)</td><td>25만 원</td></tr>
<tr><td>재료(사과·생강·설탕·1L 병) 20명 × 9천</td><td>18만 원</td><td>병 열탕 소독용 냄비·전기 인덕션 2대</td><td>20만 원</td></tr>
<tr><td>맡김증·라벨·웰컴 차</td><td>3만 원</td><td>맡김증·안내물 디자인·인쇄</td><td>20만 원</td></tr>
<tr><td><b>합계</b></td><td><b>43만 원</b></td><td>냉장 쇼케이스(여름 전 구비)</td><td>80만 원</td></tr></table>
<p><b>12월 시범 3회 총비용(추정)</b> — 담그는 날 2회 86만 + 찾는 날 1회(보조·시음·포장재) 16만 + 초기 장비(쇼케이스 제외) 115만 = <b>약 217만 원</b>. 예상 수입은 참가비 25,000원 × 30명(정원의 75% 가정) 75만 + 찾는 날 판매 17만 = 약 92만 원이며, 시범의 목적은 이익보다 <b>회수율·재예약률 검증</b>입니다.</p>
<p class="note">※ 금액은 제안자 추정치이며 실제 단가는 운영주체 견적으로 확정합니다. 공간 사용료·공과금·상주 인건비는 제외했습니다.</p>
</td></tr>

<tr><td class="h">수익·<br>지속가능성</td><td>
<table class="in"><tr><th style="width:44%">연간 수입원(정규 운영 1년, 추정)</th><th style="width:12%">금액</th><th style="width:32%">연간 직접비(추정)</th><th>금액</th></tr>
<tr><td>담그는 날 24일 × 20명 × 75% × 25,000원</td><td>900만</td><td>진행 강사(담그는 날 336·주민반 120)</td><td>456만</td></tr>
<tr><td>주민반 24회 × 8명 × 75% × 15,000원</td><td>216만</td><td>보조 인력 24일</td><td>192만</td></tr>
<tr><td>찾는 날 판매(차·추가 병·선물 포장) 회수 353명 × 8,000원</td><td>282만</td><td>재료(504명 × 9천)·판매 원가</td><td>581만</td></tr>
<tr><td>작업 동 소모임 대관 월 2건 × 10만 원</td><td>240만</td><td>라벨·홍보·전시 교체·원도심 적립</td><td>200만</td></tr>
<tr><td><b>합계</b></td><td><b>1,638만</b></td><td><b>합계</b></td><td><b>1,429만</b></td></tr></table>
<p>→ 직접비 기준 연 <b>약 200만 원 흑자</b>(추정). 재방문이 구조에 들어 있어 <b>홍보비를 매번 처음부터 쓰지 않는 것</b>이 수지의 핵심입니다.</p>
<p><b>재방문 장치</b> — ① 모든 손님이 최소 2번 온다(담그는 날 → 찾는 날) ② 찾는 날에 다음 계절 예약을 받는다(맡김증 뒷면 = 계절 도장 4칸) ③ 4계절 도장을 다 모은 사람의 레시피는 다음 해 ‘주민 이름 붙은 청’으로 소량 판매 검토(포장 판매는 영업신고 범위 확인 후) ④ 주민반 참가자 중 희망자는 주민 강사로 키워 운영 인력을 지역에서 채운다.</p>
</td></tr>

<tr><td class="h">지역 연계·<br>출처</td><td>
<p><b>협업 구상(제안 단계, 모두 협의 필요)</b> — 영주 사과·풍기인삼 농가와 지역 영농조직(재료 납품·못난이 과일 활용) / 광복로 일대 식당·노포와 영주근대역사문화거리(영주동 광복로 일원의 영주제일교회·풍국정미소·영광이발관 등) 가게(찾는 날 쿠폰) / 상망동 행정복지센터·영주상망작은도서관(주민 레시피·주민반 모집 안내) / 지역 사회적경제 조직(라벨·포장 디자인, 택배 회수). 병·잔당 200원 ‘원도심 적립’은 쿠폰 참여 가게 공동 홍보와 주민 강사 사례에 씁니다.</p>
<table class="in"><tr><th style="width:16%">성과지표</th><th>12월 시범 목표</th><th>정규 1년 목표</th></tr>
<tr><td><b>회수율</b>(핵심)</td><td>맡긴 병 중 직접 찾으러 온 비율 70%, 1주·2주 차이 비교</td><td>70% 이상 유지</td></tr>
<tr><td>재예약률</td><td>찾는 날에 다음 담그는 날 예약 25%</td><td>2회 이상 담근 사람 30%</td></tr>
<tr><td>지역 소비</td><td>쿠폰 참여 가게 5곳, 사용 30건</td><td>참여 10곳, 월 사용 40건</td></tr>
<tr><td>수지·참여</td><td>정원 75% 예약, 주민 레시피 3건</td><td>직접비 흑자, 주민 강사 2명</td></tr></table>
<p class="src" style="margin-top:4px"><b>출처</b> · 공간 정보: 문화정원 제공 「광복로 문화거점시설(다리다) 현황」 공간정보 자료집(위치도·현황사진 포함, 이 제안서에는 사진을 옮겨 싣지 않음)<br>
· HAGISO·hanare: The Gate “hanare” — thegate12.com/article/235 / Magical Trip — magical-trip.com/media/hagi-cafe-renovated-from-a-japanese-apartment-building-at-yanaka-ginza/ / Old Tokyo — old-tokyo.info/hagiso-relaxing-living-space-with-coffee/<br>
· 스타벅스 경동1960점: 뉴시스, 2022.12.16. — newsis.com/view/NISX20221216_0002125200 / 아이뉴스24 — inews24.com/view/1549302<br>
· 영주근대역사문화거리: 한국관광공사 정보(ktriptips.com/kor/tourspot/2998487)<br>
· 제안서 안의 그림 2점은 제안자가 직접 그린 도식이며, 수치(비용·수입)는 제안자 추정치입니다.</p>
</td></tr>
</tbody></table>
</body></html>"""


def pdf(html, name):
    src = WORK / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = OUT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--no-first-run",
                    f"--user-data-dir={WORK / 'chrome_prof'}", f"--print-to-pdf={out}", src.as_uri()],
                   capture_output=True, timeout=120)
    time.sleep(1)
    print(out, out.exists())
    return out


def merge(parts, name):
    import fitz  # PyMuPDF
    forms, idea = parts
    f, i = fitz.open(forms), fitz.open(idea)
    doc = fitz.open()
    doc.insert_pdf(f, from_page=0, to_page=0)        # 참가신청서
    doc.insert_pdf(i)                                 # 붙임1 아이디어 제안서
    doc.insert_pdf(f, from_page=1, to_page=len(f) - 1)  # 붙임2, 붙임3
    out = OUT / (name + ".pdf")
    doc.save(out)
    print(out, len(doc), "pages")


if __name__ == "__main__":
    idea = pdf(idea_html(), "붙임1_아이디어제안서_박용진")
    forms = pdf(forms_html(), "지정서식_참가신청서·AI활용확인서·개인정보동의서_박용진")
    merge((forms, idea), "다시다리다_박용진_제출서류")
