"""영암왕인축제 서식 1~3 HTML 재현 → 서명 PDF. 실행: python make_forms.py"""
import subprocess
from pathlib import Path
HERE = Path(__file__).parent; OUT = HERE.parent / "제출"
SIG = Path(r"D:/park/YD_Claude_RND/reports/공모전/전남광주의회_정책아이디어/assets/sig_1_10.png").as_uri()
ME = dict(name="박용진", birth="1997. 5. 29.", addr="경기도 하남시 미사강변한강로158번길 93, 401호", job="회사원", email="parkkb10@gmail.com", tel="010-2576-9278")
DATE = "2026년 11월 13일"
DESC = """<b>작품명</b> : 연결된 두 세계 — 하늘 天, 땅 地<br>
<b>제작 의도·주제 해석</b> : 왕인박사가 일본에 전한 『천자문』은 ‘天地玄黃’, 곧 하늘(天)과 땅(地)으로 시작합니다. 「연결된 두 세계」를 이 첫 두 글자로 풀었습니다. 상대포를 떠나는 돛배의 돛에는 하늘 天이, 바다에 비친 돛에는 땅 地가 새겨져 하나의 돛이 하늘과 바다, 과거와 미래, 한국과 일본을 함께 잇습니다. 배가 지나간 자리는 벚꽃잎 물길이 되어 영암의 봄(축제 시기)과 ‘다시 떠나는 항해(The Odyssey 3.0)’를 보여 줍니다.<br>
<b>주요 디자인 요소</b> : 돛배와 항해, 월출산 능선, 벚꽃 물길, 천자문 첫 글자 天·地, 30주년 표기, 원거리 식별용 대형 명조 타이틀과 남색·크림·금색의 대비 배색. 일정·로고는 가변 영역으로 확보(2027. 4. ○○.~○○., 영암군·영암문화관광재단 로고 자리).<br>
<b>확장 적용 시안</b> : ① 가로형 현수막(4:1, 돛의 天과 양쪽 해안을 잇는 꽃잎 물길) ② SNS 카드뉴스(4:5, ‘왕인박사가 싣고 간 첫 글자 — 하늘 天, 땅 地’).<br>
<b>사용 서체·이미지 출처</b> : 서체 Noto Serif KR·Noto Sans KR(SIL Open Font License, 상업적 이용 가능). 이미지는 아래 생성형 AI 배경 외 외부 이미지 없음.<br>
<b>생성형 AI 활용 여부 및 범위</b> : <u>활용함</u> — 도구 ChatGPT(OpenAI) 이미지 생성(gpt-image, 이용약관상 산출물 권리 이용자 귀속·상업적 이용 가능). 범위: 글자 없는 배경 일러스트(바다·돛배·월출산·벚꽃잎) 2종 생성. 응모자 작업: 天地 돛·반사 콘셉트 기획과 장면 구성 지시, 배경 크롭·확대 보정, 天·地 한자 합성(돛 원근·수면 반사 표현), 타이틀 레터링·정보 배치 등 전체 타이포그래피와 레이아웃, 현수막·카드뉴스 확장 시안 편집. AI 결과물을 그대로 출품하지 않았습니다."""
CSS = """<style>@page{size:A4;margin:16mm 17mm}body{font-family:'Noto Sans KR','Malgun Gothic';font-size:10.5pt;color:#111}
h1{text-align:center;font-size:17pt;margin:3mm 0 7mm}.tag{font-size:10pt;font-weight:700}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:2.6mm 3mm;vertical-align:middle}
th{background:#f1f1f1;font-weight:700;width:27mm}.c{text-align:center}.sig{position:relative;display:inline-block;width:40mm}
.sig img{position:absolute;left:3mm;top:-9mm;height:15mm}.r{text-align:right;margin-top:9mm;font-size:11.5pt}.to{margin-top:10mm;font-size:13pt;font-weight:700;text-align:center}
p,li{line-height:1.75}.d{font-size:9.3pt;line-height:1.62}</style>"""
def sig(): return f'<span class="sig">&nbsp;<img src="{SIG}"></span>'
def page(b): return f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body>{b}</body></html>"
F = {}
F["서식1_참가신청서"] = page(f"""<div class=tag>[서식 1]</div><h1>2027 영암왕인문화축제 홍보물 디자인 공모전 참가신청서</h1><table>
<tr><th>성명(팀명)</th><td>{ME['name']}</td><th>생년월일</th><td>{ME['birth']}</td></tr>
<tr><th>주 소</th><td colspan=3>{ME['addr']}</td></tr><tr><th>소속(직업)</th><td>{ME['job']}</td><th>연락처(휴대폰)</th><td>{ME['tel']}</td></tr>
<tr><th>이 메 일</th><td colspan=3>{ME['email']}</td></tr><tr><th>팀원 명단</th><td colspan=3>해당 없음(개인)</td></tr><tr><th>관련 경력</th><td colspan=3>없음</td></tr>
<tr><th>작품 설명</th><td colspan=3 class=d>{DESC}</td></tr></table>
<p class=c style="margin-top:7mm">2027 영암왕인문화축제 홍보물 디자인 공모전에 위와 같이 응모합니다.</p><p class=c>{DATE}</p>
<p class=r>응 모 자 : {ME['name']} {sig()} (서명)</p><div class=to>(재)영암문화관광재단 귀중</div>""")
F["서식2_저작권양도및응모서약서"] = page(f"""<div class=tag>[서식 2]</div><h1>2027 영암왕인문화축제 홍보물 디자인 공모전<br>저작권 양도 및 응모 서약서</h1><ul>
<li>출품작은 본인(팀)이 직접 창작한 순수 창작물이며, 국내외 공모전 수상작 또는 기발표작이 아님을 서약한다.</li>
<li>출품작에 사용한 서체·이미지·일러스트 등은 상업적 이용이 허용된 자료로서 제3자의 권리를 침해하지 않음을 확인한다.</li>
<li>생성형 AI를 활용한 경우 사용 도구와 활용 범위를 참가신청서에 사실대로 기재하였음을 확인한다.</li>
<li>수상작의 저작재산권(2차적저작물작성권 포함) 일체를 (재)영암문화관광재단에 양도하며, 상금 지급으로 그 대가를 갈음하는 데 동의한다.</li>
<li>재단이 수상작을 축제 홍보 목적에 맞게 수정·변형·확장하여 활용하는 것에 동의하며, 수정 요청 시 성실히 협조한다.</li>
<li>수상 시 편집 가능한 원본 파일(AI·PSD 등)을 재단이 지정한 기한 내에 제출한다.</li>
<li>다음 사항에 해당하는 경우 수상 취소 및 상금 환수 조치에 이의를 제기하지 않는다.<br>- 표절·모방 또는 타인의 저작권·초상권 등 권리를 침해한 것으로 확인된 경우<br>- 타 공모전 수상작, 중복 응모작 또는 이미 공개·발표된 작품으로 확인된 경우<br>- 제출 서류의 허위 기재 또는 생성형 AI 활용 사실을 기재하지 않은 경우</li></ul>
<p>본인(팀)은 위 사항을 성실하게 이행하고 위반 시 조치에 어떠한 이의도 제기하지 않을 것임을 서약합니다.</p>
<p class=c style="margin-top:10mm">{DATE}</p><p class=r>응모자 : {ME['name']} {sig()} (서명)</p><div class=to>(재)영암문화관광재단 귀중</div>""")
F["서식3_개인정보동의서"] = page(f"""<div class=tag>[서식 3]</div><h1>개인정보 수집･이용･제공 동의서</h1>
<p>2027 영암왕인문화축제 홍보물 디자인 공모전의 응모와 관련하여 아래와 같이 본인의 개인정보의 수집･이용･제공에 동의합니다.</p>
<p><b>가. 수집･이용･제공 목적</b><br>- (재)영암문화관광재단에서 수행하는 2027 영암왕인문화축제 홍보물 디자인 공모전 응모 접수, 심사, 결과 통보 및 시상을 위한 최소정보 수집</p>
<p><b>나. 수집･이용･제공하는 개인정보의 항목</b><br>- 신청자 성명(팀명), 생년월일, 주소, 연락처, 이메일 등</p>
<p><b>다. 개인정보의 보유 및 이용･제공기간</b><br>- 본 동의서가 작성된 때로부터 서류 관리를 위한 보유기간까지(1년)</p>
<p><b>라. 동의를 거부할 권리와 거부에 따른 불이익</b><br>- 응모자(팀원 포함)는 개인정보의 수집에 대하여 거부할 권리를 보유하고 있음을 인지하고 있음<br>- 거부에 따른 불이익 : 공모전 응모 및 시상 불가</p>
<p class=c style="font-size:12pt;margin-top:8mm"><b>동의여부</b> &nbsp; ■ 동의 / □ 거부</p><p class=c style="margin-top:8mm">{DATE}</p>
<p class=r style="line-height:2.4">신청인 성명 : {ME['name']}<br>주 소 : {ME['addr']}</p><p class=r style="margin-top:8mm">대표자 : {ME['name']} {sig()} (인)</p><div class=to>(재)영암문화관광재단 귀중</div>""")
CH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
for k, v in F.items():
    h = HERE / f"_{k}.html"; h.write_text(v, encoding="utf-8")
    subprocess.run([CH, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", f"--print-to-pdf={OUT / (k + '.pdf')}", h.as_uri()], capture_output=True)
