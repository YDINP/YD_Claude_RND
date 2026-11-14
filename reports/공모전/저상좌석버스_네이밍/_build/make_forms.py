"""저상 좌석버스 네이밍·아이콘 공모 신청서+동의서 2종(hwp 양식 재현) → PDF. 실행: python make_forms.py"""
import subprocess
from pathlib import Path
HERE = Path(__file__).parent; OUT = HERE.parent / "제출"
SIG = Path(r"D:/park/YD_Claude_RND/reports/공모전/전남광주의회_정책아이디어/assets/sig_1_10.png").as_uri()
ICON = (OUT / "나란히버스_아이콘.png").as_uri()
NAME = "나란히버스"
N_DESC = ("지금까지 휠체어 이용자는 고속도로를 달리는 광역·좌석버스를 사실상 탈 수 없어, 같은 길을 가도 다른 교통수단을 찾아야 했습니다. "
          "저상 좌석버스는 휠체어 이용자, 어르신, 유아차와 함께하는 부모가 다른 승객과 <b>같은 버스에 나란히 앉아 멀리</b> 가게 해 주는 첫 광역버스입니다. "
          "‘나란히’는 누구나 쉽게 발음하고 기억할 수 있는 우리말이며, 특정 이용자를 가리키지 않고 ‘함께 탄다’는 가치만 담아 모든 승객이 거부감 없이 부를 수 있습니다.")
I_DESC = ("버스 창 안에 앉은 승객(파랑)과 휠체어 승객(노랑)을 같은 높이, 같은 줄에 나란히 놓아 이름의 뜻을 그대로 그렸습니다. "
          "바퀴가 차체 아래로 살짝만 보이게 해 바닥이 낮은 버스임을 나타냈고, 넓은 출입문에서 내려온 경사판이 보도선(노랑 가로줄)과 거의 평평하게 이어져 ‘계단 없이 탄다’는 점을 보여 줍니다. "
          "위쪽 긴 화살표는 시내를 넘어 먼 거리를 달리는 좌석버스라는 뜻입니다. 색은 두 가지(파랑·노랑)만 써서 작은 크기의 정류장 표지, 차량 외관 스티커, 노선도 기호로도 알아보기 쉽게 했습니다. "
          "(아이콘은 응모자가 도형(SVG)으로 직접 그렸습니다.)")
ME = dict(name="박용진", birth="1997. 5. 29.", tel="010-2576-9278", email="parkkb10@gmail.com")
DATE = "2026년 11월 14일"
CSS = """<style>@page{size:A4;margin:16mm}body{font-family:'Noto Sans KR','Malgun Gothic';font-size:10.5pt;color:#111}
.hd{background:#dfe9f5;border-top:3px solid #1f3b70;text-align:center;font-weight:800;font-size:14pt;padding:3mm;margin-bottom:5mm}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:2.6mm;vertical-align:middle}
th{background:#f1f3f6;width:28mm;font-weight:700}.l{line-height:1.7}.pb{page-break-before:always}
.sig{position:relative;display:inline-block;width:34mm}.sig img{position:absolute;left:2mm;top:-8mm;height:14mm}
.r{text-align:right;margin-top:6mm}.c{text-align:center}.to{text-align:center;font-size:14pt;font-weight:800;margin-top:10mm}p{line-height:1.7}</style>"""
sig = f'<span class="sig">&nbsp;<img src="{SIG}"></span>'
p1 = f"""<div class=hd>[붙임1] 저상 좌석버스 네이밍 · 아이콘 공모전 참가신청서</div><table>
<tr><th>접수번호</th><td colspan=3 class=c style="color:#888">※ 주최 측 기재</td></tr>
<tr><th>성 명</th><td>{ME['name']}</td><th>생년월일</th><td>{ME['birth']}</td></tr>
<tr><th>연락처</th><td>{ME['tel']}</td><th>이메일</th><td>{ME['email']}</td></tr>
<tr><th>제안명칭</th><td colspan=3 style="font-size:14pt;font-weight:800">{NAME}</td></tr>
<tr><th>제안개요<br>(요지)</th><td colspan=3 class=l>{N_DESC}</td></tr>
<tr><th>제안<br>아이콘<br>(작품요약)</th><td colspan=3 class=c><img src="{ICON}" style="width:62mm"></td></tr>
<tr><th>제안개요<br>(요지)</th><td colspan=3 class=l style="font-size:9.8pt">{I_DESC}</td></tr>
<tr><th>첨부서류</th><td colspan=3>1. 개인정보 수집‧이용 및 제공 동의서 1부<br>2. 제출물 활용 및 저작권 동의서 1부</td></tr></table>"""
p2 = f"""<div class=pb></div><div class=hd>저상 좌석버스 네이밍 · 아이콘 공모전 응모를 위한<br>개인정보 수집‧이용 및 제공 동의서</div>
<p>본 협회는 「저상 좌석버스 네이밍 · 아이콘 공모전」 접수를 위하여 아래와 같이 개인정보 수집·이용 및 제공하고자 합니다. 내용을 자세히 읽으신 후 동의 여부를 결정하여 주십시오.</p>
<p><b>■ 개인정보 수집‧이용 내역</b></p><table><tr><th style="width:auto">항 목</th><th style="width:auto">수집목적</th><th style="width:auto">보유기간</th></tr>
<tr><td class=c>성명, 생년월일, 연락처, 이메일 등</td><td class=c>공모전 참가확인 및 심사 결과 안내</td><td class=c>공모 절차 종료 시까지</td></tr></table>
<p>※ 위의 개인정보 수집‧이용에 대한 동의를 거부할 권리가 있습니다. 그러나 동의를 거부할 경우 원활한 작품응모에 제한을 받을 수 있습니다.</p>
<p>☞ 위와 같이 개인정보를 수집·이용하는데 동의하십니까? &nbsp; (<b>■ 예</b>, □ 아니오)</p>
<p class=c style="margin-top:12mm">{DATE}</p><p class=r>참가자 &nbsp; 성명 &nbsp; {ME['name']} {sig} (서명 또는 인)</p><div class=to>한국지체장애인협회 귀중</div>"""
p3 = f"""<div class=pb></div><div class=hd>저상 좌석버스 네이밍 · 아이콘 공모전 응모를 위한<br>제출물 활용 및 저작권 동의</div>
<p>본인은 「저상 좌석버스 네이밍 · 아이콘 공모전」에 제출하는 제출물의 활용 및 저작권에 대하여 아래와 같이 동의합니다.</p>
<p><b>1. 제출물의 권리 귀속</b><br>출품된 제출물의 모든 권리는 참가자에게 있습니다. 다만, 참가자는 주최/주관기관이 제출물을 아래 조항 목적으로 사용할 경우, 저작재산권의 독점적 이용을 공모전 주최 측에 허락하며 저작인격권을 행사하지 않습니다.</p>
<p><b>2. 제출물의 저작물로서 활용</b><br>본 공모전은 제출물을 아래 목적에 한하여 참가자의 사전협의 없이 공개 및 활용할 수 있으며, 2차적 저작물(사업 및 서비스 기획, 편집저작물, 번역/동영상/인쇄물 등)로 수정·변경·재가공할 수 있습니다.<br>2-1) 사용 목적: 언론보도, 홈페이지/SNS/블로그 등 온라인 공개, 서비스 활용, 전시회 및 각종 행사에서의 제출물 전시, 기념품 제작 및 배포/판매, 출판물 작성 및 배포 등<br>2-2) 사용 기한: 제출물 및 2차적 저작물 모두 저작권 동의일로부터 10년간 유지</p>
<p><b>3. 참가자 의무 및 책임</b><br>참가자는 제출물과 유사/동일한 저작물을 공모전 기간 중에 본 공모전과 사전 합의 없이 타 공모전에 출품하거나 제3자에게 이용을 허락하거나 권리를 양도할 수 없습니다. 참가자는 제출물이 제3자의 초상권, 저작권, 지적재산권, 소유권 등을 침해하지 않도록 주의해야 하며, 기존 저작물과 유사/동일한 산출물이 생성되지 않도록 해야 합니다. 이와 관련된 분쟁이 발생할 경우, 제출물에 대한 모든 법적 책임은 참가자에게 있으며, 본 공모전에 발생한 모든 유형·무형의 손해에 대하여 참가자에게 배상을 청구할 수 있습니다.</p>
<p>귀하는 제출물 활용 및 저작권 동의를 거부할 권리가 있습니다. 단, 이는 「저상 좌석버스 네이밍 · 아이콘 공모전」 참여를 위한 필수 사항이므로, 위 사항에 동의한 경우에만 참여가 가능합니다.</p>
<p><b>☞ 위와 같이 귀하의 제출물 활용 및 저작권 활용에 동의하십니까?</b> &nbsp; (<b>■ 예</b>, □ 아니오)</p>
<p class=c style="margin-top:8mm">{DATE}</p><p class=r>참가자 &nbsp; 성명 &nbsp; {ME['name']} {sig} (서명 또는 인)</p><div class=to>한국지체장애인협회 귀중</div>"""
h = HERE / "_forms.html"; h.write_text(f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body>{p1}{p2}{p3}</body></html>", encoding="utf-8")
pdf = OUT / "박용진_저상좌석버스_네이밍아이콘_참가신청서및동의서.pdf"
subprocess.run([r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", f"--print-to-pdf={pdf}", h.as_uri()], capture_output=True)
print(pdf.exists())
