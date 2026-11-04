"""도심 쓰레기 처방전 공모 — 아이디어 제안서 PDF + 제출서류(서식1~3) PDF."""
import base64, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
OUT = Path(r"D:/park/YD_Claude_RND/reports/공모전/서울_도심쓰레기처방전")
SIG = "data:image/png;base64," + base64.b64encode((HERE / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ME = dict(name="박용진", phone="010-2576-9278", email="parkkb10@gmail.com",
          addr="경기도 하남시 망월동 839-3 401호", birth="1997. 5. 29.", y="2026", m="11", d="4")
TITLE = "쓰레기는 ‘나가는 길’에 버려진다 — 번화가·행사장 「퇴장 동선 수거 거점」 처방"
SUMMARY = ("번화가와 대형 행사의 쓰레기는 사람들이 ‘떠나는 순간’ 한꺼번에 나오지만, 쓰레기통은 거리 간격과 행사장 안쪽 위주로 놓여 있습니다. "
           "① 쓰레기통 배치 기준에 ‘퇴장 동선(지하철역 출입구·버스정류장·택시승강장 앞)’ 우선 원칙을 넣고, "
           "② 금·토 심야와 대형 행사 종료 직후에만 역 출입구 앞에 이동식 분리배출 거점을 여는 ‘시간제 거점’을 운영하며, "
           "③ 한강공원 등 시 소관 장소의 대형 행사는 사용허가 조건으로 주최자가 퇴장 동선 거점과 돗자리 회수함을 운영하게 합니다. "
           "홍대입구·합정·상수역 일대와 한강공원 대형 행사에서 먼저 시범 운영하고, 거점 반경의 쓰레기량과 민원을 비교해 확대합니다.")

BASE_CSS = """
@page { size:A4; margin:15mm 16mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.6; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-6px; top:50%; height:44px; transform:translateY(-50%); }
"""


def sign(label="(인 또는 서명)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def forms_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제출서류</title><style>{BASE_CSS}
.tag {{ font-weight:700; font-size:10.5pt; margin-bottom:6px; }}
h1 {{ text-align:center; font-size:16pt; margin:10px 0 14px; }}
.f td, .f th {{ border:1px solid #000; padding:7px 9px; vertical-align:middle; }}
.f th {{ background:#eef2ee; width:16%; }}
.f .sub {{ width:14%; background:#f6f8f6; font-weight:700; text-align:center; }}
.box {{ border:1px solid #000; padding:10px 14px; margin-bottom:8px; }}
.box h3 {{ margin:0 0 4px; font-size:10.5pt; }}
.box p {{ margin:2px 0; }}
.date {{ text-align:center; margin:16px 0 8px; font-size:11pt; letter-spacing:1px; }}
.signline {{ text-align:right; margin-right:40px; font-size:11pt; }}
</style></head><body>
<div class="tag">&lt;서식 1&gt; 참가신청서</div>
<h1>도심 쓰레기 처방전 공모 참가신청서</h1>
<table class="f">
<tr><th rowspan="4">제 안 자</th><td class="sub">성 명</td><td>{m['name']}</td></tr>
<tr><td class="sub">연락처<br>(휴대폰)</td><td>{m['phone']}</td></tr>
<tr><td class="sub">이메일</td><td>{m['email']}</td></tr>
<tr><td class="sub">주 소</td><td>{m['addr']}</td></tr>
<tr><th rowspan="4">제 안 자 2<br><span style="font-weight:400;font-size:9pt">(2인 이상일 경우 작성)</span></th><td class="sub">성 명</td><td style="color:#888">해당 없음 (개인 참여)</td></tr>
<tr><td class="sub">연락처<br>(휴대폰)</td><td></td></tr>
<tr><td class="sub">이메일</td><td></td></tr>
<tr><td class="sub">주 소</td><td></td></tr>
<tr><th>제 목</th><td colspan="2"><b>{TITLE}</b></td></tr>
<tr><th>아이디어<br>개요</th><td colspan="2" style="height:250px;vertical-align:top">{SUMMARY}<br><br>※ 상세 내용: 첨부 「아이디어 제안서」(PDF 2쪽)</td></tr>
</table>
<div class="date">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</div>
<div class="signline">제안자 : <b>{m['name']}</b> &nbsp;{sign('(서명)')}</div>

<div class="pb"></div>
<div class="tag">&lt;서식 2&gt; 개인정보 수집·이용 동의서</div>
<h1>개인정보의 수집·이용 동의서</h1>
<p>서울특별시에서는 「개인정보보호법」에 따라 ‘도심 쓰레기 처방전 공모’ 참가자에 대하여, 아래와 같이 개인정보 수집 동의를 얻고자 합니다. 아래 사항에 대해 충분히 읽어보신 후, 동의 여부를 체크·서명하여 주시기 바랍니다.</p>
<p style="text-align:center;font-weight:700">【 개인정보의 수집 및 이용 동의 】</p>
<div class="box"><h3>개인정보 수집 및 이용에 대한 동의</h3>
<p>○ 개인정보 수집·이용 목적 : 대시민 홍보 등 후속(공모전, 홍보물·자료 제작 등) 활용</p>
<p>○ 수집하는 개인 정보 항목 : 성명, 주민등록번호, 계좌번호, 주소, 소속, 휴대전화, 이메일</p>
<p>○ 개인정보 보유·이용 기간 : 동의서 제출일로부터 3년</p></div>
<div class="box"><h3>고유 식별 정보 처리 동의</h3>
<p>○ 고유식별정보 처리 목적 : 공모전 시상금 지급을 위한 개인정보 활용</p>
<p>○ 처리하는 고유식별정보 항목 : 성명, 주민등록번호, 계좌번호, 주소, 휴대전화, 이메일</p>
<p>○ 고유식별정보 보유·이용 기간 : 수상결과 발표일로부터 3년</p></div>
<div class="box"><h3>개인정보의 제3자 제공에 대한 동의</h3>
<p>○ 개인정보의 제3자 제공 목적 : 국세청(세무서) 세무신고에 대한 적법성 확인</p>
<p>○ 개인정보를 제공받는 자 : 국세청(세무서), 서울시 기후환경정책과</p>
<p>○ 개인정보를 제공받는 자의 이용목적 : 세무신고에 대한 적법성 확인</p>
<p>○ 제공하는 개인정보 항목 : 성명, 주민등록번호, 계좌번호, 주소, 휴대전화, 이메일</p>
<p>○ 개인정보를 제공받는 자의 개인정보 보유·이용 기간 : 이용목적 달성 시 개인정보 파기</p></div>
<p>상기 개인정보 수집·이용과 관련하여 동의를 거부할 수 있습니다. 단, 동의하지 않을 경우 공모전에 작품을 접수하실 수 없으며, 심사대상에서 제외됩니다.</p>
<p style="text-align:center;font-size:11pt;margin:12px 0">■ 동의 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 동의하지 않음</p>
<div class="date">{m['y']}. &nbsp;{m['m']}. &nbsp;{m['d']}.</div>
<div class="signline">본인 &nbsp;&nbsp;성명 &nbsp;<b>{m['name']}</b> &nbsp;{sign()}</div>

<div class="pb"></div>
<div class="tag">&lt;서식 3&gt; 청렴서약서</div>
<h1 style="letter-spacing:8px;margin-top:40px">청 렴 서 약 서</h1>
<p style="font-size:11pt;line-height:2;margin:30px 10px">본인은 귀 기관에서 시행하는 「도심 쓰레기 처방전 공모」에 응모함에 있어 귀 기관의 제반규정을 충분히 숙지하고 성실히 준수할 것이며, 허위 기재, 표절, 중복응모, 도용 등 일체의 부정행위를 하지 않겠습니다. 만약 부정행위가 적발될 시, 수상취소, 부상반환, 향후 공모전 참여 제한 등 불이익 조치를 감수하겠으며, 이에 서약서를 제출합니다.</p>
<div class="date" style="margin:40px 0 30px">{m['y']}. &nbsp;{m['m']}. &nbsp;{m['d']}.</div>
<div style="margin-left:52%;font-size:11pt;line-height:2.4">
성 &nbsp;&nbsp;&nbsp;명 : <b>{m['name']}</b> &nbsp;{sign('(인)')}<br>생년월일 : {m['birth']}<br>연 락 처 : {m['phone']}</div>
<p style="text-align:center;font-size:13pt;font-weight:700;margin-top:60px">서울특별시장 귀하</p>
</body></html>"""


def idea_html():
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>아이디어 제안서</title><style>{BASE_CSS}
:root {{ --g:#1f6b4a; --gl:#e8f3ec; --o:#d9822b; }}
body {{ font-size:9.6pt; line-height:1.5; }} @page {{ margin:12mm 14mm; }}
.hero {{ background:var(--g); color:#fff; padding:16px 20px; border-radius:6px; }}
.hero .k {{ font-size:9.5pt; opacity:.85; }} .hero h1 {{ font-size:17pt; margin:4px 0 2px; line-height:1.35; }}
.hero .s {{ font-size:10pt; opacity:.9; }}
h2 {{ font-size:12.5pt; color:var(--g); border-bottom:2px solid var(--g); padding-bottom:3px; margin:16px 0 8px; }}
h3 {{ font-size:10.8pt; margin:10px 0 4px; }}
p {{ margin:3px 0; }} ul {{ margin:3px 0 3px 18px; padding:0; }} li {{ margin:2px 0; }}
.facts td {{ border:1px solid #cfd8d2; padding:6px 8px; vertical-align:top; font-size:9.5pt; }}
.facts td:first-child {{ width:24%; background:var(--gl); font-weight:700; }}
.rx {{ border:1.5px solid var(--g); border-radius:6px; padding:8px 12px; margin:8px 0; }}
.rx .n {{ display:inline-block; background:var(--g); color:#fff; border-radius:3px; padding:0 7px; font-weight:700; margin-right:6px; }}
.cmp td, .cmp th {{ border:1px solid #cfd8d2; padding:6px 8px; font-size:9.5pt; vertical-align:top; }}
.cmp th {{ background:var(--gl); }}
.src {{ font-size:8.3pt; color:#555; line-height:1.45; }}
.diag {{ margin:6px 0 2px; }}
</style></head><body>
<div class="hero"><div class="k">도심 쓰레기 처방전 공모 · 처방 1 아이디어 공모전 · 제안자 박용진</div>
<h1>쓰레기는 ‘나가는 길’에 버려진다</h1>
<div class="s">번화가·행사장 「퇴장 동선 수거 거점」 처방 — 쓰레기통을 ‘거리 간격’이 아니라 ‘사람이 떠나는 길’에 둡니다</div></div>

<h2>1. 진단 — 쓰레기는 ‘떠나는 순간’ 한꺼번에 나온다</h2>
<table class="facts">
<tr><td>대형 행사</td><td>2026 서울세계불꽃축제(9.5.) 뒤 여의도 지구에서만 8t 트럭 10대 넘는 쓰레기가 나왔고, “일회용 돗자리와 배달 음식 용기, 페트병, 비닐봉지”가 잔디밭에 남았습니다. 대형 수거함은 “행사가 본격적으로 시작하기 전부터 상당 부분 차 있었”습니다. (아시아경제, 2026.9.7.)</td></tr>
<tr><td>번화가</td><td>마포구는 홍대 관광특구 수거를 주 5일 야간에서 주 7일 주야간으로 늘리고 레드로드에 수거함 75개를 두었지만, 기사도 원인을 “늘어난 유동 인구로 인해” 쌓이는 생활쓰레기와 담배꽁초로 봅니다. (헤럴드경제, 2026.4.21.)</td></tr>
<tr><td>기존 대책의 축</td><td>서울시는 1,000명 이상 모이는 행사의 일회용품을 제한하고 다회용기를 지원해 왔습니다(서울시 환경분야 누리집). 즉 지금까지의 처방은 <b>‘덜 만들기’(다회용기)</b>와 <b>‘더 자주 치우기’(수거 확대)</b>에 집중돼 있습니다.</td></tr>
</table>
<p style="margin-top:6px"><b>빈칸:</b> 사람들은 공연이 끝나거나 귀가할 때 손에 든 컵·용기·돗자리를 한꺼번에 처리하려 하지만, 그 순간 지나가는 길(역 출입구, 정류장, 행사장 출구)에는 쓰레기통이 없거나 이미 가득 차 있습니다. 그러면 계단 옆, 화단, 가게 앞 쓰레기 더미에 놓고 가고, 한 번 쌓인 자리는 다른 사람도 따라 버리는 ‘투기 명소’가 됩니다.</p>

<div class="diag"><svg viewBox="0 0 700 150" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="12">
<rect x="0" y="0" width="700" height="150" fill="#fafcfa"/>
<text x="12" y="20" font-weight="700" fill="#555">지금</text>
<rect x="12" y="32" width="150" height="40" rx="6" fill="#e9ecea"/><text x="87" y="57" text-anchor="middle">행사장·가게 안</text>
<line x1="162" y1="52" x2="520" y2="52" stroke="#999" stroke-width="2" marker-end="url(#a)"/>
<text x="300" y="44" text-anchor="middle" fill="#777">컵·용기·돗자리를 들고 퇴장 →</text>
<rect x="520" y="32" width="160" height="40" rx="6" fill="#e9ecea"/><text x="600" y="57" text-anchor="middle">역 출입구 (쓰레기통 없음)</text>
<text x="350" y="72" text-anchor="middle" fill="#c0392b">▲ 계단 옆·화단·가게 앞에 놓고 감</text>
<text x="12" y="100" font-weight="700" fill="#1f6b4a">처방 뒤</text>
<rect x="12" y="110" width="150" height="34" rx="6" fill="#e8f3ec"/><text x="87" y="132" text-anchor="middle">행사장·가게 안</text>
<line x1="162" y1="127" x2="430" y2="127" stroke="#1f6b4a" stroke-width="2"/>
<rect x="430" y="110" width="110" height="34" rx="6" fill="#1f6b4a"/><text x="485" y="132" text-anchor="middle" fill="#fff" font-weight="700">퇴장 거점</text>
<line x1="540" y1="127" x2="680" y2="127" stroke="#1f6b4a" stroke-width="2" marker-end="url(#b)"/>
<text x="610" y="120" text-anchor="middle" fill="#1f6b4a">빈손으로 귀가</text>
<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#999"/></marker>
<marker id="b" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#1f6b4a"/></marker></defs>
</svg></div>

<h2>2. 처방 — 세 가지 약</h2>
<div class="rx"><span class="n">처방 ①</span><b>쓰레기통 배치 기준에 ‘퇴장 동선 우선’ 원칙 추가</b>
<ul><li>서울시가 자치구와 가로쓰레기통 설치 위치를 정할 때 <b>지하철역 출입구 앞 50m, 버스정류장, 택시승강장</b>을 우선 위치로 명시합니다.</li>
<li>위치는 서울 열린데이터광장의 <b>지하철 시간대별 승하차 인원</b>과 <b>생활인구</b> 자료로 고릅니다. 심야(22~02시)에 승차가 몰리는 역 출입구가 1순위입니다.</li>
<li>새로 설치하기보다 기존 쓰레기통의 <b>재배치</b>부터 해 예산 부담을 줄입니다.</li></ul></div>
<div class="rx"><span class="n">처방 ②</span><b>‘시간제 퇴장 거점’ — 필요한 시간에만 여는 이동식 분리배출대</b>
<ul><li><b>번화가:</b> 금·토 21~02시에 홍대입구·합정·상수역 출입구 앞에 이동식 분리배출대(컵·캔 / 페트 / 일반쓰레기 / 꽁초)를 둡니다. 영업시간에만 있으므로 낮에는 보행에 방해되지 않고 악취 민원도 줄입니다.</li>
<li><b>안내 인력:</b> 서울시 공공일자리나 자원봉사로 거점 1곳에 1명을 두어 분리배출을 안내하고, 가득 차면 바로 교체합니다.</li>
<li><b>수거 연계:</b> 거점 위치와 시간을 자치구 야간 수거 노선에 고정 정류지로 넣어, 거점이 ‘또 하나의 쓰레기 더미’가 되지 않게 합니다.</li></ul></div>
<div class="rx"><span class="n">처방 ③</span><b>시 소관 장소 대형 행사는 ‘퇴장 거점 운영’을 사용허가 조건으로</b>
<ul><li>한강공원·서울광장 등 시가 사용을 허가하는 장소에서 대규모 관람객이 예상되는 행사는 주최자가 <b>퇴장 동선 계획</b>(관람객이 빠져나가는 출구·역 방향별 거점 위치와 운영 인원)을 내도록 합니다.</li>
<li>잔디밭 행사에는 <b>‘돗자리 회수함’</b>을 출구에 따로 두어, 가장 많이 버려지는 일회용 돗자리를 따로 모읍니다.</li>
<li>시 주관 행사의 일회용품 제한(만드는 쪽)을 민간 주최 대형 행사의 <b>치우는 쪽</b>까지 넓히는 보완책입니다.</li></ul></div>

<h2>3. 시범 운영안 (6개월)</h2>
<table class="cmp">
<tr><th style="width:18%">구분</th><th>번화가 시범</th><th>행사장 시범</th></tr>
<tr><td><b>대상</b></td><td>홍대입구·합정·상수역 출입구 주변 (마포구 협업)</td><td>한강공원 대형 행사 1~2건 (미래한강본부 협업)</td></tr>
<tr><td><b>운영</b></td><td>금·토 21~02시 시간제 거점 + 기존 쓰레기통 일부 출입구 앞 재배치</td><td>사용허가 시 퇴장 동선 계획 제출, 출구별 거점·돗자리 회수함 운영</td></tr>
<tr><td><b>측정</b></td><td colspan="2">① 거점 반경 100m 안 길바닥 쓰레기 수거량(시범 전후, 같은 요일 비교) ② 무단투기·악취 민원 건수 ③ 거점 분리배출 비율(재활용품 비중) ④ 행사 다음 날 정리 인력·시간</td></tr>
<tr><td><b>확대</b></td><td colspan="2">효과가 확인되면 성수·강남역·이태원 등 다른 번화가와 시 소관 장소 대형 행사로 넓히고, 처방 ①을 가로쓰레기통 설치 기준에 반영</td></tr>
</table>

<h2>4. 기존 대책과 무엇이 다른가</h2>
<table class="cmp">
<tr><th style="width:22%">기존</th><th>이 처방</th></tr>
<tr><td>다회용기·일회용품 제한 (덜 만들기)</td><td>이미 나온 쓰레기가 <b>어디서 손을 떠나는지</b>를 다룸. 다회용기 반납함도 같은 거점에 둘 수 있어 기존 정책과 함께 작동</td></tr>
<tr><td>수거 횟수·청소 인력 확대 (더 자주 치우기)</td><td>쓰레기가 길에 떨어지기 <b>전에</b> 받는 위치를 바꿈. 같은 인력으로 치울 범위를 줄임</td></tr>
<tr><td>쓰레기통 수 늘리기</td><td>수가 아니라 <b>위치와 시간</b>. 기존 통 재배치와 시간제 운영이라 상시 설치에 따른 악취·생활쓰레기 투입 민원이 적음</td></tr>
</table>

<h2>5. 기대 효과</h2>
<ul><li><b>거리 청결:</b> 역 출입구·계단 옆 같은 ‘투기 명소’가 생기기 전에 쓰레기를 받아, 다음 날 아침 거리 상태가 나아집니다.</li>
<li><b>분리배출:</b> 거점에서 컵·캔·페트를 따로 받으면 재활용품이 일반쓰레기와 섞이지 않아, 직매립 금지 이후 늘어난 소각·처리 부담을 덜 수 있습니다.</li>
<li><b>행사 뒤처리:</b> 대형 행사 다음 날 밤샘 정리에 들던 인력과 시간을 줄이고, 주최자 책임을 분명히 합니다.</li>
<li><b>저비용·빠른 실행:</b> 재배치·이동식 거점·허가 조건 추가 위주라 조례 제정이나 대규모 예산 없이 다음 행사 시즌부터 시범 운영할 수 있습니다.</li></ul>

<p class="src" style="margin-top:12px"><b>근거 자료</b><br>
· 아시아경제, 「돗자리·음식물 그대로 두고 귀가」, 2026.9.7. (view.asiae.co.kr/article/2026090714162006276)<br>
· 헤럴드경제, 「홍대 레드로드 쓰레기 ‘마포 365일 청결관리’로 잡는다」, 2026.4.21. (heraldk.com/article/2026042113400052188)<br>
· 서울시 환경분야 누리집, 「서울시가 만든 새로운 기준, 일회용 대신 다회용으로!」 (news.seoul.go.kr/env/archives/569515)<br>
· 서울 열린데이터광장: 지하철 호선별 역별 시간대별 승하차 인원, 서울 생활인구 (data.seoul.go.kr)</p>
</body></html>"""


def pdf(html, name):
    src = HERE / (name + ".html")
    src.write_text(html, encoding="utf-8")
    out = OUT / (name + ".pdf")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={HERE / 'prof'}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


pdf(idea_html(), "아이디어제안서_퇴장동선수거거점_박용진")
pdf(forms_html(), "제출서류_참가신청서·동의서·청렴서약서_박용진")
