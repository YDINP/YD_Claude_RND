"""서울시 행정서식 개선 공모 — 제출서식(서식1~4)을 원본 문구대로 재현해 채운 PDF.
실행: python build_pdf.py
"""
import base64, re, subprocess, sys, time
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import *  # noqa

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROF = Path(r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/chrome_prof_regidea")


def b64(p):
    return "data:image/png;base64," + base64.b64encode((HERE / p).read_bytes()).decode()


SIG = b64("assets/sig_1_10.png")
CUR = b64("assets/현행_서울광장_사용신고서.png")


def md(s):
    s = escape(s)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)


def items(lines, mark="ㅇ"):
    out = []
    for x in lines:
        if x.startswith(" - "):
            out.append(f'<p class="li2">- {md(x[3:])}</p>')
        else:
            out.append(f'<p class="li"><span class="mk">{mark}</span>{md(x)}</p>')
    return "".join(out)


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


CSS = """
@page { size:A4; margin:14mm 15mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.6pt; color:#111; line-height:1.55; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }
.hdr { display:flex; border:1px solid #000; margin-bottom:8px; }
.hdr .a { background:#1f3d7a; color:#fff; font-weight:700; padding:6px 14px; }
.hdr .b { padding:6px 14px; font-weight:700; font-size:11pt; }
.tag { font-weight:700; margin:6px 0 4px; }
.f td { border:1px solid #000; padding:5px 8px; vertical-align:middle; }
.f .h { background:#eaeef5; font-weight:700; text-align:center; }
.f .t { text-align:center; font-size:14pt; font-weight:700; padding:10px; }
.f .c { vertical-align:top; }
.li { margin:2px 0 5px; padding-left:14px; text-indent:-14px; text-align:justify; }
.li .mk { display:inline-block; width:14px; text-indent:0; }
.li2 { margin:1px 0 3px 18px; padding-left:10px; text-indent:-10px; text-align:justify; }
.note { font-size:8.6pt; color:#333; margin:2px 0; }
.date { text-align:center; margin:12px 0 6px; font-size:10.5pt; }
.signline { text-align:right; margin-right:36px; font-size:10.5pt; padding-bottom:6px; }
h1 { text-align:center; font-size:15pt; margin:8px 0 12px; }
.box { border:1px solid #000; margin-bottom:8px; }
.box .bh { background:#eaeef5; font-weight:700; text-align:center; padding:4px; border-bottom:1px solid #000; }
.box .bb { padding:6px 12px; }
.box p { margin:2px 0; }
/* 비교표 */
.cmp td { border:1px solid #000; vertical-align:top; padding:5px; }
.cmp .h { background:#eaeef5; font-weight:700; text-align:center; vertical-align:middle; }
.cmp img { width:100%; display:block; }
.nf { font-size:7.4pt; line-height:1.35; }
.nf table td { border:1px solid #333; padding:2px 4px; vertical-align:middle; }
.nf .k { background:#f1f3f7; font-weight:700; text-align:center; white-space:nowrap; }
.nf .tt { text-align:center; font-weight:700; font-size:10.5pt; padding:4px; }
.nf .new { background:#fff6d6; }
.nf p { margin:2px 0; }
.legend { font-size:7.6pt; margin-top:3px; }
.legend span { background:#fff6d6; border:1px solid #c9b25a; padding:0 4px; }
.chg p { margin:2px 0 4px; padding-left:14px; text-indent:-14px; }
.src p { margin:1px 0; font-size:8.2pt; color:#333; }
.side td { border:1px solid #000; padding:4px 6px; font-size:8.4pt; vertical-align:top; }
.side .h { background:#eaeef5; font-weight:700; text-align:center; }
"""

NEW_FORM = """
<div class="nf"><table>
<tr><td colspan="4" class="tt">서울광장 사용신고서 (개선안)</td></tr>
<tr><td class="k" rowspan="3">행사</td><td class="k">행사 이름</td><td colspan="2"></td></tr>
<tr><td class="k">사용 목적</td><td colspan="2"></td></tr>
<tr><td class="k">행사 내용<br>(요약)</td><td colspan="2" style="height:22px"></td></tr>
<tr><td class="k" rowspan="4">신고인</td><td class="k">단체명<br>(개인은 성명)</td><td colspan="2">　　　　　　　대표자 성명 :</td></tr>
<tr><td class="k">주소</td><td colspan="2"></td></tr>
<tr><td class="k">전화</td><td colspan="2" class="new">　　　　　　　　 전자우편 :</td></tr>
<tr><td class="k new">사업자등록번호</td><td colspan="2" class="new">(단체·법인)　　　　　 / 생년월일(개인만)</td></tr>
<tr><td class="k" colspan="2">실무 연락 담당</td><td colspan="2">□ 신고인과 같음　/ 다르면 성명·휴대전화·<span class="new">전자우편</span></td></tr>
<tr><td class="k" rowspan="3">사용<br>장소·시간</td><td class="k new">구획·면적</td><td colspan="2" class="new">□ 동편 □ 서편 □ 목재-잔디광장 □ 전체 / 면적　　　㎡ (위치도에 표시)</td></tr>
<tr><td class="k new">시간</td><td colspan="2" class="new">설치 시작 　월 　일 　시 ／ 행사 　시~　시 ／ 철거 끝 　월 　일 　시<br>합계 　　시간 (□ 18시~06시 야간 포함)</td></tr>
<tr><td class="k new">상설무대</td><td colspan="2" class="new">□ 쓰지 않음 □ 함께 신청(문화정책과로 전달 — 무대 사용 계획·서약서만 붙임)</td></tr>
<tr><td class="k" colspan="2">사용 인원</td><td colspan="2">최대 　　　명</td></tr>
<tr><td class="k new" colspan="2">사용료<br>(미리 계산)</td><td colspan="2" class="new">면적 　㎡ × 　시간 × 10원 (+야간분 3할) = 　　　원<br><span style="font-size:6.8pt">최소 500㎡·2시간. 확정 금액은 받아들임(수리) 통보로 알림</span></td></tr>
<tr><td class="k new" colspan="2">받는 곳</td><td colspan="2" class="new">수리 통보·보완 요구·납부 안내: 위 전자우편<br>세금계산서: □ 신고인과 같음 □ 다름(상호·사업자등록번호 : 　　　)</td></tr>
<tr><td class="k" colspan="2">붙임</td><td colspan="2">□ 행사계획서 □ 사용 위치도 □ 시설물 설치내역·원상복구계획서 □ 안전관리계획서</td></tr>
<tr><td colspan="4"><p class="new" style="display:inline-block">□ 서울광장 사용 준수사항을 읽었고 지키겠습니다.</p>
<p>「서울특별시 서울광장의 사용 및 관리에 관한 조례」 제5조에 따라 위와 같이 신고합니다.</p>
<p style="text-align:right">년　 월　 일　　신고인　　　　(서명 또는 인)</p><p>서울특별시장 귀하</p></td></tr>
</table>
<div class="legend"><span>노란 칸</span> = 새로 넣거나 바꾼 칸 · 삭제: 주최단체의 대표자 칸·연락책임 칸의 주소·생년월일·직업, 직업(3곳), FAX</div>
</div>
"""

SIDE = """
<table class="side">
<tr><td class="h" style="width:22%">대상</td><td class="h" style="width:39%">현행</td><td class="h">개선(안)</td></tr>
<tr><td>서울광장 사용 준수사항 확인(신고서 묶음 첫 쪽)</td><td>‘주최자 (인)’, ‘신고자 (인)’ 두 번 날인 + 신고서 서명</td><td>신고서 맨 아래 확인 칸 하나, 서명 한 번</td></tr>
<tr><td>행사계획서 [별지 2-1호]</td><td>행사개요: 일시 / 장소 ㎡(서울광장 　편) / 참석 인원 / 주최·주관 / 내용 — 신고서와 같은 값</td><td>행사개요 삭제 → “신고서와 같음”. 시간대별 행사내용·추진대책만 남김</td></tr>
<tr><td>안전관리계획서 [별지 2-4호]</td><td>행사 개최개요: 참여 예상 인원 / 주요내용·시설물</td><td>개최개요 삭제 → “신고서와 같음”. 안전요원 배치·비상조치부터 시작</td></tr>
<tr><td>서울광장 상설무대 대관 신청서(문화정책과)</td><td>행사명칭·사용목적·사용일시, 신청자(대표자)·행사책임자·연락책임자 인적사항 17칸, 행사계획서·시설물 설치내역·안전관리계획서·서약서 다시 제출</td><td>신고서의 ‘상설무대 함께 신청’ 체크로 갈음. 수리 뒤 총무과가 신고서를 넘기고, 신고인은 ‘무대 사용 계획’과 서약서만 냄</td></tr>
<tr><td>광화문광장 사용허가신청서(광화문광장 조례 별지 제1호서식)</td><td>서울광장 신고서와 같은 구조(신청자·신청단체의 대표자·연락책임 × 5칸, FAX·직업)</td><td>같은 개선안을 적용해 두 광장 서식을 한 틀로</td></tr>
</table>
"""


def main_html():
    m = ME
    chk = lambda on, label: ("■ " if on else "□ ") + label
    tasks = " ".join([chk(True, "서식간소화"), chk(True, "우리말 서식"), chk(True, "이용방식 개선(디지털 전환 등)"), chk(False, "기타")])
    law = "<br>".join(escape(x) for x in LAW)
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>행정서식 개선 아이디어 제안서</title><style>{CSS}</style></head><body>
<div class="hdr"><div class="a">붙 임 1</div><div class="b">행정서식 개선 아이디어 공모 제출서류</div></div>
<div class="tag">&lt;서식 1&gt; 행정서식 개선 아이디어 제안서</div>
<table class="f">
<tr><td colspan="6" class="t">서울시 행정서식 개선 아이디어 공모 신청서</td></tr>
<tr><td class="h" rowspan="3" style="width:11%">기본정보</td><td class="h" style="width:13%">성  명<br>(생년월일)</td><td style="width:24%">{m['name']}<br>({m['birth_short']})</td><td class="h" style="width:11%">연락처</td><td colspan="2">{m['phone']}</td></tr>
<tr><td class="h">이메일</td><td colspan="4">{m['email']}</td></tr>
<tr><td class="h">주  소</td><td colspan="4">{m['addr']}</td></tr>
<tr><td class="h" colspan="2">응모과제</td><td colspan="4">{tasks}<br><span class="note">(※ 해당되는 분야에 ■ 체크)</span></td></tr>
<tr><td class="h" colspan="2">제    목</td><td colspan="4"><b>{escape(TITLE)}</b></td></tr>
<tr><td class="h" colspan="2">현행 서식명</td><td colspan="4">{escape(FORM_NAME)}</td></tr>
<tr><td class="h" colspan="2">관계법령</td><td colspan="4">{law}</td></tr>
<tr><td class="h" colspan="2">소관기관</td><td colspan="4">{escape(DEPT)}</td></tr>
<tr><td class="h" rowspan="3">제안<br>내용</td><td class="h">현황 및<br>문제점</td><td colspan="4" class="c">{items(PROBLEM)}</td></tr>
<tr><td class="h">개선 방안</td><td colspan="4" class="c">{items(PLAN)}<p class="note">※ 전․후(신․구) 비교표: 붙임 2</p></td></tr>
<tr><td class="h">기대<br>효과</td><td colspan="4" class="c">{items(EFFECT)}</td></tr>
<tr><td colspan="6"><div class="date">2026년 11월 4일</div><div class="signline">제안자 : <b>{m['name']}</b>　{sign('(서명)')}</div></td></tr>
</table>

<div class="pb"></div>
<div class="hdr"><div class="a">붙 임 2</div><div class="b">전․후(신․구) 비교표</div></div>
<div class="tag">&lt;서식 2&gt; 전․후 비교표</div>
<p class="note">※ 응모 대상 서식의 종류(통계표, 신고서, 확인서 등)에 따라 개선(안)을 알아볼 수 있게 작성하여 주시기 바랍니다.</p>
<p class="note">※ 서식이 여러 페이지인 경우, 아래 표를 필요한 만큼 복사하여 이어서 작성할 수 있습니다.</p>
<table class="cmp">
<tr><td class="h" style="width:50%">현행</td><td class="h">개선(안)</td></tr>
<tr><td><img src="{CUR}"><p class="note">서울광장 사용신고서(조례 별지 서식, 2015. 1. 2. 개정) — 국가법령정보센터 서식 이미지. 2026년 7월 누리집 배포본도 같은 서식</p></td>
<td>{NEW_FORM}</td></tr>
</table>
<div class="chg" style="margin-top:8px"><b>□ 주요 변경사항</b>{''.join(f'<p>ㅇ {escape(x)}</p>' for x in CHANGES)}</div>

<div class="pb"></div>
<div class="tag">&lt;서식 2&gt; 전․후 비교표 (이어서) — 함께 내는 양식</div>
{SIDE}
<div class="src" style="margin-top:10px"><b style="font-size:8.6pt">근거 자료</b>{''.join(f'<p>· {escape(x)}</p>' for x in SOURCES)}
<p>· 이 제안서는 자료 조사와 초안 작성에 생성형 AI(Claude)를 활용했으며, 서식 원문 대조와 최종 판단은 제안자가 했습니다.</p></div>

<div class="pb"></div>
<div class="tag">&lt;서식 3&gt; 개인정보 수집·이용 동의서</div>
<h1>개인정보의 수집·이용 동의서</h1>
<p>서울특별시에서는 「개인정보보호법」에 따라 서울특별시 행정서식 개선 아이디어 공모전 참가자에 대하여, 아래와 같이 개인정보 수집 동의를 얻고자 합니다. 아래 사항에 대해 충분히 읽어보신 후, 동의 여부를 체크·서명하여 주시기 바랍니다.</p>
<p style="text-align:center;font-weight:700">【 개인정보의 수집 및 이용 동의 】</p>
<div class="box"><div class="bh">개인정보 수집 및 이용에 대한 동의</div><div class="bb">
<p>○ 개인정보 수집·이용 목적 : 개인 식별 및 연락 경로 확보</p>
<p>○ 수집하는 개인 정보 항목 : 성명, 생년월일, 주소, 연락처, 이메일</p>
<p>○ 개인정보 보유·이용 기간 : 동의서 제출일로부터 3년</p></div></div>
<div class="box"><div class="bh">고유 식별 정보 처리 동의</div><div class="bb">
<p>○ 고유식별정보 처리 목적 :  공모전 심사·시상을 위한 개인정보 활용</p>
<p>○ 처리하는 고유식별정보 항목 : 성명, 생년월일, 주소, 연락처, 이메일</p>
<p>○ 고유식별정보 보유·이용 기간 : 수상결과 발표일로부터 3년</p></div></div>
<p>상기 개인정보 수집·이용과 관련하여 동의를 거부할 수 있습니다. 단, 동의하지 않을 경우 공모전에 작품을 접수하실 수 없으며, 심사대상에서 제외됩니다.</p>
<p style="text-align:center;font-size:11pt;margin:14px 0">■ 동의　　　　　　　　　　　　　□ 동의하지 않음</p>
<div class="date">2026.　11.　04.</div>
<div class="signline">본인　　성명　<b>{m['name']}</b>　　　{sign('(인 또는 서명)')}</div>

<div class="pb"></div>
<div class="tag">&lt;서식 4&gt; 청렴서약서</div>
<h1 style="letter-spacing:8px;margin-top:30px">청 렴 서 약 서</h1>
<p style="font-size:11pt;line-height:2;text-align:justify;margin:24px 6px">본인은 귀 기관에서 시행하는 「서울특별시 행정서식 개선 아이디어 공모」에 응모함에 있어 귀 기관의 제반규정을 충분히 숙지하고 성실히 준수할 것이며, 허위 기재, 표절, 중복응모, 도용 등 일체의 부정행위를 하지 않겠습니다. 만약 부정행위가 적발될 시, 수상취소, 부상반환, 향후 공모전 참여 제한 등 불이익 조치를 감수하겠으며, 이에 서약서를 제출합니다.</p>
<div class="date" style="margin:40px 0 30px">2026.　11.　04.</div>
<div style="margin-left:52%;font-size:11pt;line-height:2.3">
성　　명 : <b>{m['name']}</b>　　{sign('(인)')}<br>
생년월일 : {m['birth']}<br>
연 락 처 : {m['phone']}</div>
<p style="text-align:center;font-size:14pt;font-weight:700;margin-top:50px">서울특별시장 귀하</p>
</body></html>"""


def pdf(html, name):
    src = HERE / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = HERE / (name + ".pdf")
    PROF.mkdir(parents=True, exist_ok=True)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={PROF}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    src.unlink()
    print(out, out.exists())


if __name__ == "__main__":
    pdf(main_html(), "행정서식개선_제안서·동의서·청렴서약서_서울광장사용신고서_박용진")
