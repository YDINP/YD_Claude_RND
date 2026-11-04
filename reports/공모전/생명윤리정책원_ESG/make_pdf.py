"""국가생명윤리정책원 2026 ESG 대국민 아이디어 공모전 — 참가신청서·제안서·개인정보동의서 PDF."""
import base64, subprocess, time, tempfile
from pathlib import Path

HERE = Path(__file__).parent
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BUILD = HERE / "build"
BUILD.mkdir(exist_ok=True)

ME = dict(name="박용진", birth="1997년 5월 29일", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호")
TITLE = "대신 말해줄 가족이 없는 사람부터 — 사전연명의료의향서 ‘우선 대상’을 다시 정하기"

CSS = """
@page { size:A4; margin:16mm 17mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:11pt; color:#000; line-height:1.6; margin:0; }
table { width:100%; border-collapse:collapse; }
td, th { border:1px solid #000; padding:6px 8px; vertical-align:middle; }
th { background:#e8e8e8; font-weight:700; text-align:center; }
.pb { page-break-before:always; }
.tag { font-size:10.5pt; font-weight:700; margin-bottom:6px; }
h1 { text-align:center; font-size:17pt; margin:6px 0 16px; letter-spacing:1px; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:42px; transform:translateY(-50%); }
.c { text-align:center; }
"""


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


# ---------------- 붙임 2 참가신청서 ----------------
def apply_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참가신청서</title><style>{CSS}
td,th {{ padding:9px 10px; }}
</style></head><body>
<div class="tag">붙임 2</div>
<h1>국가생명윤리정책원 대국민 아이디어 공모전 참가신청서</h1>
<table>
<tr><th style="width:25%">공모분야</th><td colspan="4">&nbsp;[ &nbsp;] E(환경) &nbsp;&nbsp; [■] S(사회) &nbsp;&nbsp;[ &nbsp;] G(환경)</td></tr>
<tr><th>세부주제</th><td colspan="4">&nbsp;사회통합</td></tr>
<tr><th>동일ㆍ유사제안의<br>다른 기관 제출 여부</th><td colspan="4">[■] 없음 &nbsp;[ &nbsp;] 있음(제출 기관: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;, 제출일시: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
<tr><th>접수구분</th><td colspan="4">[■] 개인 &nbsp;&nbsp;[ &nbsp;] 팀별</td></tr>
<tr><th rowspan="4">제안자</th><th style="width:26%">성 명</th><th colspan="3">생년월일</th></tr>
<tr><td class="c">{m['name']}(대표)</td><td colspan="3" class="c">{m['birth']}</td></tr>
<tr><td class="c">&nbsp;</td><td colspan="3" class="c">&nbsp;</td></tr>
<tr><td class="c">&nbsp;</td><td colspan="3" class="c">&nbsp;</td></tr>
<tr><th rowspan="3">처리 결과<br>수신처</th><td>SMS(문자 메시지)</td><td colspan="3">휴대전화번호: {m['phone']}</td></tr>
<tr><td>전자우편</td><td colspan="3">전자우편주소: {m['email']}</td></tr>
<tr><td>우편</td><td colspan="3">주소: {m['addr']}</td></tr>
<tr><td colspan="5" style="padding:26px 16px 22px; border-bottom:none">
<p class="c" style="margin:0 0 26px">위와 같이 국가생명윤리정책원 ESG 대국민 아이디어 공모전에 응모합니다.</p>
<p class="c" style="margin:0 0 26px">2026년 &nbsp;11월 &nbsp;4일</p>
<p style="text-align:right;margin:0 30px 10px 0">제안자(대표) &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;{sign('(서명 또는 인)')}</p>
</td></tr>
<tr><td colspan="5" style="border-top:none;padding:10px 16px 20px;font-size:13pt"><b>국가생명윤리정책원 &nbsp;귀하</b></td></tr>
</table>
</body></html>"""


# ---------------- 붙임 4 개인정보동의서 ----------------
def consent_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보동의서</title><style>{CSS}
td,th {{ padding:10px 12px; }}
p {{ margin:6px 0; }}
</style></head><body>
<div class="tag">붙임 4</div>
<h1>개인정보 수집 및 이용 동의서</h1>
<p style="font-weight:700">[ 개인정보 수집·이용에 대한 동의 ]</p>
<table>
<tr><th style="width:24%">수집하는<br>개인정보 항목</th><td>‧ 성명, 생년월일, 주소, 휴대전화번호, 전자우편주소</td></tr>
<tr><th>개인정보의<br>수집 및<br>이용목적</th><td>‧ 제공하신 정보는 국가생명윤리정책원에서 실시하는 국가생명윤리정책원 국민제안 참여를 위한 본인 확인 및 채택심사, 관련 일정 알림, 정보 전달 등 제안제도의 원활한 운영을 위하여 사용됩니다.</td></tr>
<tr><th>개인정보의<br>보유 및<br>이용기간</th><td>‧ 원칙적으로 개인정보 보존기간이 경과하거나, 처리목적이 달성된 경우에는 지체 없이 개인정보를 파기합니다. 다만, 다른 법령에 따라 보존하여야 하는 경우에는 그러하지 않을 수 있습니다.<br>‧ 이용기간 : 10년</td></tr>
</table>
<p style="margin-top:10px">※ 귀하는 위의 개인정보 수집ㆍ이용에 대한 동의를 거부할 수 있습니다. 다만, 동의하지 않을 경우 국가생명윤리정책원 공모전 채택에 제한을 받을 수 있습니다.</p>
<p class="c" style="margin:18px 0;font-size:12pt">개인정보 수집 및 이용에 동의함 ■ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 개인정보 수집 및 이용에 동의하지 않음 □</p>
<p>※ 개인정보 제공자가 동의한 내용외의 다른 목적으로 활용하지 않으며, 제공된 개인정보의 이용을 거부하고자 할 때에는 개인정보 관리책임자를 통해 열람, 정정, 삭제를 요구할 수 있음</p>
<p class="c" style="margin-top:30px">｢개인정보보호법｣ 등 관련 법규에 의거하여 상기 본인은<br>위와 같이 개인정보 수집 및 활용에 동의합니다.</p>
<p class="c" style="margin:30px 0">2026년 &nbsp;&nbsp;11월 &nbsp;&nbsp;4일</p>
<p style="text-align:right;margin-right:120px">성명 : <b>{m['name']}</b> &nbsp;&nbsp;{sign('(인)')}</p>
<p style="margin-top:50px;font-size:13pt"><b>(재)국가생명윤리정책원 원장 귀하</b></p>
</body></html>"""


# ---------------- 붙임 3 제안서 (A4 2쪽, 휴먼명조 13pt, 줄간격 160%) ----------------
def proposal_html():
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>아이디어 제안서</title><style>{CSS}
@page {{ size:A4; margin:13mm 14mm 12mm; }}
body {{ font-family:'휴먼명조','HYSinMyeongJo-Medium','HY신명조','Batang',serif; font-size:13pt; line-height:160%; }}
td, th {{ padding:3px 7px; vertical-align:top; }}
th {{ width:13%; vertical-align:middle; background:#ececec; font-size:13pt; }}
h1 {{ font-size:16pt; margin:0 0 6px; }}
p {{ margin:0; }}
.o {{ font-weight:700; }}
.i {{ padding-left:1em; text-indent:-1em; }}
.ii {{ padding-left:2em; text-indent:-1em; }}
.src {{ font-size:8.5pt; line-height:1.35; color:#222; }}
</style></head><body>
<h1>대국민 혁신 아이디어 공모 아이디어 제안서</h1>
<table>
<tr><th>제안분야</th><td>(공모분야) [ &nbsp;] E(환경) &nbsp;[■] S(사회) &nbsp;[ &nbsp;] G(환경)<br>(세부주제) 사회통합</td></tr>
<tr><th>제안명</th><td><b>{TITLE}</b></td></tr>
<tr><th>제안<br>소개</th><td>연명의료 중단 결정의 절반은 가족이 대신 내리지만, 가족이 없거나 연락이 끊긴 사람에게는 의향서가 유일한 길입니다. 등록 상담의 첫 질문, 연결 창구, 성과 지표를 ‘대신 말해줄 사람이 있는가’ 기준으로 바꿉니다.</td></tr>
<tr><th>추진<br>배경</th><td>
<p class="o">○ 현황 및 문제점</p>
<p class="i">- 2025년 연명의료중단등결정 이행 81,220건 중 본인 문서(의향서 21.4%·계획서 30.8%)는 52.2%, 나머지 <b>47.8%는 가족 진술(27.9%)·가족 전원 합의(19.9%)</b>로 결정됐습니다.<sup>①</sup></p>
<p class="i">- 본인 뜻을 확인할 수 없고 가족도 없으면 결정할 길이 없고<sup>②</sup>, 가족이 있어도 연락이 끊기면 진술·합의가 어렵습니다. 2025년 무연고 사망자 7,171명 중 74.9%는 연고자가 있었지만 시신 인수를 거부·기피했습니다.<sup>③</sup></p>
<p class="i">- 그런데 등록은 반대쪽으로 쏠려 있습니다. 의향서 누적 등록자 중 <b>남성은 33.7%</b>인데, 실제로 연명의료 중단을 이행한 환자는 <b>남성이 58.5%</b>입니다(2018~2025 누적).<sup>①</sup> 고독사 사망자는 81.7%가 남성, 63%가 50·60대입니다.<sup>④</sup></p>
<p class="i">- 원인은 창구입니다. 등록은 공공기관·보건소·노인복지관 등 ‘찾아오는 사람’을 받는 구조이고, 대신 말해줄 사람이 없는 중장년 1인가구는 이 창구에 오지 않습니다.</p>
<p class="o">○ 추진목표 및 ESG 경영 관련성</p>
<p class="i">- S(사회통합): 자기결정 제도의 혜택이 ‘가족이 있는 사람’에게 쏠리는 사각지대 해소. G: 등록 ‘건수’에 더해 ‘누가 빠져 있는가’를 성과 지표로 공개.</p>
</td></tr>
<tr><th>주요<br>내용</th><td>
<p class="o">○ 세부 추진과제 및 개선방안</p>
<p class="i"><b>① 상담 첫 질문 추가</b>(정책원 단독, 1개월) — 등록기관 표준 상담 절차에 “임종 때 대신 말해줄 가족과 연락이 되십니까?”를 넣습니다. ‘아니오’면 의향서가 사실상 유일한 경로임을 설명하고, 입원 시 담당의에게 연명의료계획서를 요청하는 방법을 적은 지갑 카드를 드립니다. 응답은 선택 항목으로 익명 집계합니다.</p>
<p class="i"><b>② 위험군이 있는 곳에 창구 연결</b>(지자체 협약, 시범 3개월) — 지자체가 「고독사 예방법」에 따라 발굴·관리하는 고독사 위험군의 안부 확인·상담 때 ‘연명의료 의향 안내문’을 전하고, 원하는 사람만 관할 보건소(등록기관) 방문 예약이나 온라인 작성(도입 예정)으로 연결합니다. 명단은 주고받지 않고 안내만 하므로 개인정보 이전이 없습니다. 시범지는 정책원 소재지 광진구 등 1개 자치구를 제안하며, 안내 인원·등록 인원·‘가족 없음’ 응답 비율로 효과를 잽니다.</p>
<p class="i"><b>③ 지표 바꾸기</b>(정책원, 즉시) — 연보·통계에 ‘시군구별 50~69세 남성 인구 대비 등록률’과 ①의 ‘대신 말해줄 가족 없음’ 응답 등록자 수를 추가 공개하고, 등록기관 운영지원사업 평가에 반영합니다.</p>
<p class="i"><b>④ 근거 축적</b> — 시범 중 ‘가족이 없어 결정하지 못한’ 사례를 모아 국가호스피스연명의료위원회의 무연고 환자 결정 경로 논의 자료로 제출합니다.</p>
<p class="o">○ 기존 사업 및 정책과의 차별성</p>
<p class="i">- 찾아가는 상담, 노인일자리 상담사, 등록기관 확충은 ‘등록 건수’를 늘리는 방식이라 이미 오는 사람(여성 62.7%, 60~70대 68.5%, 2025년 신규 기준) 위주로 늘어납니다. 이 제안은 우선순위를 ‘나이’가 아니라 ‘대신 말해줄 사람의 유무’로 바꿉니다. 새 시설·앱 없이 기존 문항·창구·통계만 고칩니다.</p>
</td></tr>
<tr><th>기대<br>효과</th><td>
<p class="o">○ 경제적·사회적 효과 및 파급효과</p>
<p class="i">- 인력: 신규 인력 없음. 기존 상담사·지자체 안부확인 인력이 문항 1개·안내문 1장 추가(상담당 1~2분, 추정).</p>
<p class="i">- 시간: ①·③은 1개월 안, ②는 시범 3개월 뒤 확대 여부 결정. 효과가 확인되면 다음 해 등록기관 운영지원사업 지침에 넣어 전국에 적용합니다.</p>
<p class="i">- 비용: 지갑 카드·안내문 인쇄비(1만 장 기준 수십만 원, 추정). 교육은 기존 필수교육에 포함.</p>
<p class="o">○ 그 외 기대효과</p>
<p class="i">- 고독사 위험군(152.5만 명 추정)<sup>⑤</sup>의 1%만 등록해도 약 1.5만 명으로, 2025년 남성 신규 등록자(186,391명)의 8%에 해당합니다(추정). 의료 현장에서 결정할 사람이 없어 생기는 지연과 가족의 대리결정 부담이 줄고, 정책원은 ‘가족이 없어도 자기 뜻이 지켜지는 제도’라는 사회적 신뢰를 얻습니다.</p>
<p class="src" style="margin-top:3px">① 국립연명의료관리기관, 2025 연명의료결정제도 연보(7호) 통합테이블(lst.go.kr, 2026.8.26.) ② 「연명의료결정법에서 무연고자 규정미비 등에 관한 법적 고찰」(koreascience.kr/article/JAKO202315638736415) ③ 보건복지부 국회 제출자료, 머니투데이 2026.9.16. ④ 보건복지부 2024년 고독사 실태조사, 뉴시스 2025.11.27. ⑤ 제1차 고독사 예방 기본계획(2023~2027), 서울신문 2023.5.19.</p>
</td></tr>
</table>
</body></html>"""


def pdf(html, name):
    src = BUILD / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = HERE / (name + ".pdf")
    prof = tempfile.mkdtemp(prefix="chrome_nibp_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={prof}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    pdf(apply_html(), "1_참가신청서_박용진")
    pdf(proposal_html(), "2_제안서_대신말해줄가족이없는사람부터_박용진")
    pdf(consent_html(), "3_개인정보동의서_박용진")
