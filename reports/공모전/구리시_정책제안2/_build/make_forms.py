"""구리시 제2회 정책제안 공모 — 제안서[붙임1]+개인정보 동의서[붙임3] (hwpx 서식 재현) → PDF. 실행: python make_forms.py"""
import subprocess
from pathlib import Path
HERE = Path(__file__).parent; OUT = HERE.parent / "제출"
SIG = Path(r"D:/park/YD_Claude_RND/reports/공모전/전남광주의회_정책아이디어/assets/sig_1_10.png").as_uri()
ME = dict(name="박용진", birth="1997. 5. 29.", addr="경기도 하남시 미사강변한강로158번길 93, 401호", tel="010-2576-9278", email="parkkb10@gmail.com")
TITLE = "엘리베이터가 멈춘 한 달 — 승강기 교체공사 기간 고층 어르신·장애인 이동 지원"
SUMMARY = ["노후 승강기 교체공사는 보통 한 달 안팎 운행을 멈추고, 그동안 고층에 사는 어르신·장애인·임산부는 사실상 집에 갇힙니다.",
           "공동주택이 공사를 정하면 시가 일정을 미리 받아, 해당 동의 이동약자에게 ① 장보기·생수·약 배달 대행 ② 계단 외출 동행 ③ 경로당 임시 쉼터를 공사 기간에만 연결합니다.",
           "새 조직 없이 노인일자리·자원봉사·동 주민센터를 묶는 방식이라 예산이 적게 들고, 공사가 있는 동에만 한시적으로 운영합니다."]
PROBLEM = ["「승강기 안전관리법」 시행(2019) 이후 정밀안전검사와 노후 부품 교체 기준이 강화되어, 준공 20~30년이 지난 아파트에서 승강기 전면 교체공사가 늘고 있습니다. 구리시도 1990년대 전후 지어진 공동주택이 많아 앞으로 교체 수요가 이어질 것으로 보입니다.",
           "교체공사 기간(보통 4~6주) 동안 해당 동 승강기는 완전히 멈춥니다. 10층 이상에 사는 어르신·휠체어 이용자·거동이 불편한 환자는 병원·장보기·쓰레기 배출까지 막혀 고립되고, 무리하게 계단을 오르다 넘어지는 사고 위험도 커집니다.",
           "지금은 관리사무소가 공고문을 붙이는 것 외에 공공의 지원이 없습니다. 공사는 민간(입주자대표회의) 일이고 돌봄은 시의 일이라, 두 정보가 만나지 않는 것이 문제입니다. 시는 어느 동의 승강기가 언제 멈추는지 모르고, 관리사무소는 그 동에 누가 도움이 필요한지 모릅니다.",
           "국가인권위원회도 승강기 공사 기간 장애인·노인·임산부의 이동 불편이 반복되지 않도록 지방자치단체와 지역사회가 연계한 대책을 마련하라고 권고한 바 있습니다. 구리시는 소규모 공동주택 승강기 교체 공사비는 지원하지만, 공사 기간 주민 지원은 아직 없습니다."]
PLAN = ["(일정 공유) 공동주택 관리주체가 승강기 교체공사 일정을 정하면 공사 2주 전까지 시(공동주택 담당 부서)에 알리도록 「공동주택 관리 지원」 안내에 넣고, 관리사무소 협조 공문과 간단한 신고 양식(동·호수 범위, 공사 기간)을 배포합니다.",
        "(대상 확인) 동 주민센터가 해당 동 거주 65세 이상 독거·장애인·등록 돌봄 대상자에게 전화로 지원 희망 여부를 확인하고, 관리사무소 게시판·엘리베이터 앞 안내문에 신청 번호를 함께 붙입니다(개인정보는 본인 동의 신청 방식).",
        "(공사 기간 지원) ① 주 2회 장보기·생수·약 배달 대행(노인일자리 ‘생활지원형’ 활용) ② 병원·외출 시 계단 보행 동행(자원봉사센터 연계) ③ 단지 경로당·주민공동시설을 낮 시간 임시 쉼터로 개방 ④ 대형 폐기물·쓰레기 배출 대행.",
        "(공사 분산 권고) 같은 단지 안에서 여러 동이 동시에 멈추지 않도록 동별 순차 공사를 권고하고, 교체공사 지원금이나 장기수선 관련 안내 때 이 지원 제도를 함께 알립니다.",
        "(시범) 2027년 상반기 교체공사가 예정된 단지 2~3곳에서 시범 운영한 뒤, 이용자 만족도와 비용을 보고 상시 제도로 정합니다."]
EFFECT = ["공사 기간 고층 이동약자의 고립·낙상 사고 예방, 병원 진료 중단 방지",
          "새 인력·시설 없이 노인일자리·자원봉사·경로당을 활용하므로 비용이 적음. 예를 들어 1개 동(지원 대상 10명 내외)에 노인일자리 참여자 2명이 5주간 주 2회 배달·동행을 맡으면 기존 일자리 예산 안에서 운영할 수 있음",
          "공사를 앞둔 단지의 민원과 입주민 갈등(공사 반대·일정 지연)이 줄어 노후 승강기 교체가 제때 이루어짐 → 승강기 안전 수준 향상",
          "시가 공동주택 공사 일정을 미리 알게 되어, 같은 정보로 이사·택배·방문간호 등 다른 생활 서비스도 미리 안내할 수 있음"]
def li(xs): return "".join(f"- {x}<br>" for x in xs)
CSS = """<style>@page{size:A4;margin:15mm}body{font-family:'Noto Sans KR','Malgun Gothic';font-size:10.2pt;color:#111}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:2.2mm 2.6mm;vertical-align:middle}
th{background:#f2f2f2;font-weight:700}.t{text-align:center;font-size:17pt;font-weight:800;letter-spacing:8px}.l{line-height:1.65}
.pb{page-break-before:always}.sig{position:relative;display:inline-block;width:32mm}.sig img{position:absolute;left:1mm;top:-8mm;height:14mm}
.c{text-align:center}.r{text-align:right}.sm{font-size:8.6pt;color:#333}p{line-height:1.7}</style>"""
sig = f'<span class="sig">&nbsp;<img src="{SIG}"></span>'
p1 = f"""<p style="margin:0"><b>[붙임 1]</b></p><p class=r style="margin:0" >(제1쪽)</p><table>
<tr><td colspan=6 class=t>제안서</td></tr>
<tr><th style="width:30mm">① 제안제목</th><td colspan=5><b>{TITLE}</b></td></tr>
<tr><th>② 제출기관</th><td colspan=5>구리시</td></tr>
<tr><th>③ 동일ㆍ유사<br>제안의 다른<br>기관 제출여부</th><td colspan=5>[✔] 없음 &nbsp; [ ] 있음(제출기관: &nbsp; , 제출일시: &nbsp; )</td></tr>
<tr><th rowspan=3>④ 주제안자</th><th style="width:22mm">성 명</th><td colspan=2>{ME['name']}</td><th style="width:22mm">생년월일</th><td>{ME['birth']}</td></tr>
<tr><th>주소</th><td colspan=4>{ME['addr']}</td></tr>
<tr><th>휴대폰 번호</th><td colspan=2>{ME['tel']}</td><th>기여도(%)</th><td>100</td></tr>
<tr><th rowspan=3>⑤ 공동제안자</th><th>성 명</th><td colspan=2></td><th>생년월일</th><td></td></tr>
<tr><th>주소</th><td colspan=4></td></tr>
<tr><th>휴대폰 번호</th><td colspan=2></td><th>기여도(%)</th><td></td></tr>
<tr><th rowspan=3>⑥ 처리 결과<br>통보방식</th><td>[✔] SMS<br>(문자 메시지)</td><td colspan=4>휴대전화 번호: {ME['tel']}</td></tr>
<tr><td>[✔] 전자우편</td><td colspan=4>이메일 주소: {ME['email']}</td></tr>
<tr><td>[ ] 우편</td><td colspan=4>주소:</td></tr>
<tr><td colspan=3>* 제안과 동일한 내용으로 표창ㆍ상금 수여 및 특허 등 출원ㆍ등록 여부</td><td colspan=3>없음 ( &nbsp; 년)</td></tr>
<tr><td colspan=6>「구리시 제안제도 운영 조례 시행규칙」 제3조제1항에 따라 제안서를 제출합니다.</td></tr>
<tr><td colspan=6 class=c>2026년 11월 14일</td></tr>
<tr><td colspan=4 class=r>주제안자 &nbsp; {ME['name']}</td><td colspan=2>{sig} (서명 또는 인)</td></tr>
<tr><td colspan=4 class=r><b>구리시장</b></td><td colspan=2>귀하</td></tr>
<tr><td colspan=6 class=sm>※ 행정기관의 홈페이지 등 제안자의 신원을 확인할 수 있는 전자적 방법으로 제출하는 경우에는 제안자의 서명을 생략할 수 있습니다.</td></tr></table>"""
p2 = f"""<div class=pb></div><p class=r style="margin:0">(제2쪽)</p><table>
<tr><th style="width:30mm">제안 개요</th><td class=l>{li(SUMMARY)}</td></tr>
<tr><th>⑦ 현황과<br>문제점</th><td class=l>{li(PROBLEM)}</td></tr>
<tr><th>⑧ 개선방안</th><td class=l>{li(PLAN)}</td></tr>
<tr><th>⑨ 기대효과</th><td class=l>{li(EFFECT)}</td></tr></table>"""
p3 = f"""<div class=pb></div><p><b>[붙임 3]</b></p><p class=c style="font-size:16pt;font-weight:800">개인정보 수집·활용 동의서</p>
<p>[구리시 총무과]는 「2026년 제2회 구리시 정책제안 공모전」을 위해 아래와 같이 개인정보를 수집·이용 및 제공에 관한 내용을 관계 법령에 따라 알려드리오니, 동의하여 주시기 바랍니다.</p>
<p><b>1. 수집하는 개인정보의 항목 및 구분</b><br>- 수집항목 : 성명, 주소, 전화번호, 휴대전화번호, 이메일 등 개인정보<br>- 수집 및 이용목적 : 신청자 본인확인 및 제안 공모전 운영<br>- 보유 및 이용기간 : 3년</p>
<p><b>2. 개인정보의 제3자 제공</b><br>- 제공받는 자 : 구리시<br>- 제공받는 자의 개인정보 이용목적 : 당해 공모사업 추진<br>- 제공하는 항목 : 성명, 주소, 휴대전화, 이메일 등 개인정보</p>
<p><b>3. 거부권 및 거부 시 불이익</b><br>위 개인정보의 수집·이용·제공과 관련하여 개인정보 동의를 거부할 수 있습니다. 다만, 위 개인정보는 구리시 총무과에서 공모전 운영 등을 위하여 필요한 정보이므로 동의하지 않을 경우 공모에 참여하지 못합니다. 이 외의 다른 목적으로 사용하지 않습니다.</p>
<p class=c><b>&lt;개인정보 수집·이용·제공 동의&gt;</b></p><p>■ 개인정보 수집 및 제3자에 개인정보 제공 : (동의함 <b>■</b> &nbsp; 동의하지 않음 □)</p>
<p class=sm>※ 개인정보 제공자가 동의한 내용 외의 다른 목적으로 활용하지 않으며, 제공된 개인정보의 이용을 거부하고자 할 때에는 개인정보 관리책임자를 통해 열람, 정정, 삭제를 요구할 수 있음.</p>
<p>「개인정보보호법」제15조(개인정보의 수집·이용)와 제17조(개인정보의 제공)의 관련 법률에 따라 본인은 위와 같이 개인정보의 수집 및 제3자 제공에 동의함.</p>
<p class=c style="margin-top:10mm">2026년 11월 14일</p><p class=r>성명 : {ME['name']} {sig} (서명 또는 날인)</p>"""
h = HERE / "_forms.html"; h.write_text(f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body>{p1}{p2}{p3}</body></html>", encoding="utf-8")
pdf = OUT / "2026년 제2회 구리시 정책제안 공모전_박용진.pdf"
subprocess.run([r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", f"--print-to-pdf={pdf}", h.as_uri()], capture_output=True)
print(pdf.exists())
