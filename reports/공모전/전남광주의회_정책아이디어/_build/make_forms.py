"""전남광주통합특별시의회 정책아이디어 공모 — 서식1 신청서 · 서식2 제안서 · 서식3 개인정보 동의서
원본 서식 문구를 HTML로 재현 → Chrome headless 인쇄 → PDF (서명 이미지 겹침)
실행: python make_forms.py
"""
import base64, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
SIG = "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ME = dict(name="박용진", sex="남", birth="1997. 5. 29.", job="회사원",
          addr="경기도 하남시 미사강변한강로158번길 93, 401호 (망월동)", phone="010-2576-9278",
          email="parkkb10@gmail.com", y="2026", m="11", d="13")
FIELD = "자치입법‧제도개선"
TITLE = "같은 시민, 다른 조례 — 통합 전 조례 격차 대조표와 정비 기한제"
SUMMARY = ("통합 후에도 정비되지 않은 자치법규 1,847건은 옛 광주·옛 전남 지역에만 따로 적용돼, 같은 특별시민이 사는 곳에 따라 "
           "다른 지원을 받습니다. 의회가 같은 주제의 두 조례를 짝지은 '격차 대조표'를 공개하고, 시민이 체감하는 격차가 큰 순서대로 "
           "상임위별 정비 기한을 붙여 분기마다 남은 건수를 보고하게 합니다.")

CSS = """
@page { size:A4; margin:18mm 18mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10.5pt; color:#000; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.tag { display:inline-block; border:1px solid #000; padding:2px 10px; font-weight:700; margin-bottom:10px; }
.f td { border:1px solid #000; padding:7px 9px; vertical-align:middle; }
.f .lb { background:#eef1f6; text-align:center; font-weight:700; white-space:nowrap; }
.ttl { text-align:center; font-size:15pt; font-weight:700; margin:6px 0 2px; letter-spacing:1px; }
.ttl2 { text-align:center; font-size:19pt; font-weight:700; letter-spacing:6px; margin:0 0 14px; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:50%; top:50%; height:44px; transform:translate(-50%,-50%); }
.small { font-size:9.5pt; line-height:1.6; }
/* 서식2: 휴먼명조 13pt · 줄간격 180% 지정 → 없는 PC는 바탕 */
.prop { font-family:'휴먼명조','HumanMyeongjo','Batang','바탕',serif; font-size:13pt; line-height:1.8; }
.prop table.f td { font-size:12pt; line-height:1.6; }
.prop .h { background:#eef1f6; font-weight:700; text-align:center; width:19%; font-family:'Malgun Gothic',sans-serif; font-size:11pt !important; }
.prop p { margin:0 0 2px; text-align:justify; }
.prop .b { padding-left:1em; text-indent:-1em; }
.prop .s { font-weight:700; margin-top:4px; }
.prop table.cmp td { border:1px solid #000; padding:3px 6px; font-size:10.5pt; line-height:1.45; }
.prop table.cmp th { border:1px solid #000; padding:3px 6px; font-size:10.5pt; background:#eef1f6; }
.src { font-size:9pt; line-height:1.4; color:#333; margin-top:4px; font-family:'Malgun Gothic',sans-serif; }
"""


def sign(label="(인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def form1():
    return f"""
<div class="tag">【서식 1】 신청서</div>
<div class="ttl">「전남광주통합특별시의회 정책아이디어 공모」</div>
<div class="ttl2">신 청 서</div>
<table class="f">
<colgroup><col style="width:16%"><col style="width:16%"><col style="width:26%"><col style="width:14%"><col style="width:28%"></colgroup>
<tr><td class="lb">공모분야</td><td colspan="2">{FIELD}</td><td class="lb">접수번호</td><td style="color:#888">담당자가 기재</td></tr>
<tr><td class="lb" rowspan="4">1. 인적사항</td><td class="lb">성 명(한글)</td><td>{ME['name']}</td><td class="lb">성 별</td><td>{ME['sex']}</td></tr>
<tr><td class="lb">생년월일</td><td>{ME['birth']}</td><td class="lb">직 업</td><td>{ME['job']}</td></tr>
<tr><td class="lb">주 소</td><td colspan="3">{ME['addr']}</td></tr>
<tr><td class="lb">연락처<br>(본인휴대폰)</td><td>{ME['phone']}</td><td class="lb">전자우편</td><td>{ME['email']}</td></tr>
<tr><td class="lb" rowspan="2">2. 정책<br>아이디어</td><td class="lb">제 목</td><td colspan="3"><b>{TITLE}</b></td></tr>
<tr><td class="lb">내용요약<br><span style="font-weight:400;font-size:9pt">(200자 내외)</span></td><td colspan="3" style="line-height:1.65">{SUMMARY}</td></tr>
<tr><td class="lb">3. 유의사항</td><td colspan="4" class="small">
ㅇ 제출된 제안서는 돌려받을 수 없습니다.<br>
ㅇ 수상자의 수는 응모작품 심사결과에 따라 조정될 수 있습니다.<br>
ㅇ 입상 후 표절 또는 타 공모전에 출품된 사실이 밝혀질 경우, 관련 조례에 따라 수상 결정 취소 등의 조치를 할 수 있습니다.<br>
ㅇ 응모작의 저작권은 응모자에게 귀속되며, 응모자는 타인의 저작권 등 권리를 침해하지 않아야 합니다.<br>
ㅇ 응모자의 귀책사유로 타인의 권리를 침해하여 발생한 분쟁에 대해서는 응모자가 책임을 부담합니다.</td></tr>
<tr><td colspan="5" style="text-align:center;padding:26px 10px 30px;line-height:2">
본인은 전남광주통합특별시의회가 주최하는 「전남광주통합특별시의회 정책아이디어 공모」에<br>위와 같이 참가 신청합니다.<br><br>
{ME['y']}년 &nbsp;{ME['m']}월 &nbsp;{ME['d']}일<br><br>
응 모 자 : &nbsp;<b>{ME['name']}</b> &nbsp;&nbsp;&nbsp;&nbsp;{sign()}<br><br>
<b style="font-size:13pt">전남광주통합특별시의회의장 귀하</b></td></tr>
</table>"""


def form2():
    return f"""
<div class="prop">
<div class="tag" style="font-family:'Malgun Gothic'">【서식 2】 제안서</div>
<table class="f">
<tr><td class="h">제안 제목</td><td><b>{TITLE}</b></td></tr>
<tr><td class="h">개 요</td><td>
<p class="b">○ 통합 전 광주시·전라남도 조례 가운데 아직 하나로 합쳐지지 않은 것을 같은 주제끼리 짝지어, 지원 대상·금액·수수료·절차의 차이를 한 장의 표로 공개한다.</p>
<p class="b">○ 차이마다 '시민 체감 격차 점수'(영향받는 주민 수 × 혜택 차이)를 매겨, 점수가 큰 순서대로 소관 상임위원회에 정비 기한을 붙인다.</p>
<p class="b">○ 의장은 분기마다 남은 정비 건수와 기한 초과 목록을 본회의에 보고하고, 기한을 넘긴 항목은 정책지원관이 초안을 준비해 의원이 발의한다.</p>
<p class="b">○ 근거: 「통합 자치법규 정비 추적에 관한 조례」(가칭) 제정(일몰 조항 포함).</p></td></tr>
<tr><td class="h">현황 및<br>문제점</td><td>
<p class="b">○ <b>정비되지 않은 법규가 시민 생활에 남아 있다.</b> 통합특별시는 7월 1일 출범하며 필수 자치법규를 먼저 제정했지만, 시민 수혜 범위·재정 분담·재난안전 등 1,847건은 단계적으로 정비하기로 했다. 그동안 종전 조례는 특별법 부칙의 경과규정에 따라 종전 적용 지역에 한정해 계속 적용된다.</p>
<p class="b">○ <b>같은 특별시민인데 사는 곳에 따라 기준이 다르다.</b> 출산·청년·어르신 지원, 각종 감면·수수료처럼 시민이 직접 받는 혜택일수록 옛 경계를 따라 금액과 자격이 갈린다. 그러나 어떤 조례가 얼마나 다른지 한눈에 볼 자료가 없다.</p>
<p class="b">○ <b>'단계적 정비'에는 순서와 기한이 없다.</b> 정비 순서가 집행기관 내부 협의에 맡겨져 있어 의회와 시민은 무엇이 언제 정비되는지 알 수 없고, 재정 부담이 큰 항목일수록 뒤로 밀려 격차가 굳어진다.</p>
<p class="b">○ <b>조례 정비는 의회의 고유 권한이다.</b> 자치법규의 제정·개정·폐지는 의회 의결 사항이므로, 정비의 우선순위와 속도를 의회가 직접 관리하는 것이 통합 의회의 역할에 맞다.</p></td></tr>
<tr><td class="h">아이디어<br>내용<br><span style="font-weight:400;font-size:9.5pt">(개선방안<br>및 대책)</span></td><td>
<p class="s">① 조례 격차 대조표 (의회사무처 입법정책 부서 + 정책지원관)</p>
<p class="b">- 정비 대상 가운데 시민에게 직접 효과가 있는 조례부터 옛 광주·옛 전남 조례를 같은 주제 쌍으로 묶고, 지원 대상·금액·자격·수수료·신청 절차를 칸별로 비교한다. 한쪽에만 있는 제도도 별도 행으로 적는다.</p>
<p class="b">- 의회 홈페이지에 공개하고, 시민이 "옛 경계 때문에 못 받은 혜택"을 제보하면 대조표에 행을 추가한다.</p>
<p class="s">② 시민 체감 격차 점수와 정비 순번</p>
<p class="b">- 점수 = 영향받는 주민 수 × 혜택 차이(금액 또는 자격 차이). 상향·하향 통합 시 재정 영향은 집행기관 자료를 요청해 함께 적는다.</p>
<p class="b">- 점수 순으로 소관 상임위원회별 정비 순번과 기한(예: 상위 20%는 6개월, 나머지는 1년)을 정한다.</p>
<p class="s">③ 분기 보고와 기한 초과 시 의원 발의</p>
<p class="b">- 의장은 분기마다 남은 건수, 기한 초과 목록, 정비 완료 항목의 통합 기준(상향·하향·절충)을 본회의에 보고한다.</p>
<p class="b">- 집행기관이 기한 안에 통합 조례안을 내지 않으면, 정책지원관이 대조표를 바탕으로 초안을 준비해 소관 상임위 의원이 발의할 수 있게 한다.</p>
<p class="s">④ 조례 제정 필요성</p>
<p class="b">- 대조표 작성·공개 의무, 격차 점수 기준, 정비 기한과 분기 보고, 시민 제보 절차를 조례로 정해야 의회 임기·담당자가 바뀌어도 정비 추적이 이어진다. 정비가 끝나면 효력을 잃도록 일몰 조항을 둔다.</p>
<table class="cmp" style="margin-top:4px"><tr><th>구분</th><th>현행</th><th>개선</th></tr>
<tr><td>정비 대상 확인</td><td>집행기관 내부 목록</td><td>같은 주제 쌍 대조표를 의회가 공개</td></tr>
<tr><td>정비 순서</td><td>내부 협의, 기한 없음</td><td>시민 체감 격차 점수 순, 상임위별 기한</td></tr>
<tr><td>진행 확인</td><td>수시 보도</td><td>의장 분기 본회의 보고</td></tr>
<tr><td>지연 시</td><td>대안 없음</td><td>정책지원관 초안 → 의원 발의</td></tr></table></td></tr>
<tr><td class="h">기대효과</td><td>
<p class="b">○ <b>격차 해소 속도:</b> 시민이 가장 크게 느끼는 차이부터 정비돼, 통합 효과를 생활에서 먼저 체감한다.</p>
<p class="b">○ <b>의회 역할 강화:</b> 정비의 순서와 속도를 의회가 직접 관리해 통합 의회의 자치입법 기능이 드러난다.</p>
<p class="b">○ <b>예산 예측:</b> 쌍마다 상향·하향 시 재정 영향을 미리 적어 두므로, 예산 심사 때 통합 비용을 한 번에 볼 수 있다.</p>
<p class="b">○ <b>확산:</b> 같은 방식을 통합교육청 조례와 시·군 자치법규 정비, 향후 다른 지역 행정통합에도 그대로 쓸 수 있다.</p></td></tr>
</table>
<div class="src">※ 근거: 전남광주통합특별시 출범 자치법규 공포 관련 보도(헤럴드경제 2026.6.30, MTN 2026.7.1, 뉴시스 2026.7.29) — 필수 법규 우선 제정, 추가 정비 대상 1,847건, 특별법 부칙 경과규정에 따른 종전 지역 한정 적용.</div>
</div>"""


def form3():
    return f"""
<div class="tag">【서식 3】 개인정보 수집·이용 동의서</div>
<div class="ttl2" style="margin-top:6px">개인정보 수집․이용 동의서</div>
<p style="border:1px solid #000;padding:10px 12px;margin:0 0 14px;line-height:1.7">｢개인정보 보호법｣ 제15조에 따라 아래와 같은 내용으로 귀하의 정보를 수집하고자 하오니 내용을 자세히 읽어 보신 후에 동의 여부를 결정해 주시기 바랍니다. 귀하가 제공한 정보는 수집·이용 목적 이외의 용도로는 사용되지 않습니다.</p>
<p style="font-weight:700;margin:0 0 4px">1. 개인정보 수집항목 및 수집·이용 목적</p>
<p style="margin:0 0 2px 14px">가. 수집항목 : 성명, 주소, 생년월일, 이메일, 전화번호, 성별, 직업</p>
<p style="margin:0 0 12px 14px">나. 목&nbsp;&nbsp;&nbsp;&nbsp;적 : 공모 접수에 따른 본인 확인 및 공지사항 전달, 시상 등의 참가자 관리와 수상작 활용 등 안내</p>
<p style="font-weight:700;margin:0 0 4px">2. 개인정보의 보유 및 이용기간</p>
<p style="margin:0 0 2px 14px">가. 개인 정보 수집 및 이용목적이 달성된 후에는 정보를 지체없이 파기합니다.</p>
<p style="margin:0 0 2px 14px">나. 보존사유 : 참가자 및 수상자 관리, 수상작 활용 논의</p>
<p style="margin:0 0 12px 14px">다. 보존기간 : 공모전 최종 결과 발표일부터 1년</p>
<p style="font-weight:700;margin:0 0 4px">3. 권리</p>
<p style="margin:0 0 12px 14px;line-height:1.7">귀하는 개인정보 수집ㆍ이용에 대해서 동의를 거부하실 권리가 있습니다. 다만, 귀하가 개인정보의 수집ㆍ이용에 동의를 하지 않을 경우 참가 신청이 제한될 수 있습니다.</p>
<p style="font-size:9.5pt;margin:0 0 18px">※ 「개인정보 보호법」 제22조의2제1항에 따라 만 14세 미만 아동이 공모전에 참가하는 경우 개인정보 수집ㆍ이용을 위해 법정대리인의 동의를 받아 처리합니다.</p>
<p style="text-align:center;font-weight:700;font-size:11.5pt">귀하의 개인정보를 수집·이용하는 것에 동의하시겠습니까?</p>
<p style="text-align:center;font-size:12pt;margin:6px 0 26px">동의함 ■ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 동의하지 않음 □</p>
<p style="text-align:center;font-size:11.5pt;margin:0 0 22px">{ME['y']}년 &nbsp;&nbsp;{ME['m']}월 &nbsp;&nbsp;{ME['d']}일</p>
<p style="text-align:right;margin:0 40px 14px 0;font-size:11.5pt">개인정보 제공자 &nbsp;&nbsp;<b>{ME['name']}</b> &nbsp;&nbsp;&nbsp;{sign('(서명/인)')}</p>
<p style="text-align:right;margin:0 40px 40px 0;font-size:11.5pt;color:#555">법정대리인 &nbsp;&nbsp;&nbsp;해당 없음 &nbsp;&nbsp;&nbsp;(서명/인)</p>
<p style="text-align:center;font-size:13pt;font-weight:700">전남광주통합특별시의회의장 &nbsp;귀하</p>"""


def pdf(body, title, name):
    html = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body>{body}</body></html>'
    src = HERE / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = ROOT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / '_chrome_prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out.name, out.exists())


if __name__ == "__main__":
    pdf(form1(), "신청서", "서식1_신청서_박용진")
    pdf(form2(), "제안서", "서식2_제안서_박용진")
    pdf(form3(), "개인정보 수집이용 동의서", "서식3_개인정보동의서_박용진")
