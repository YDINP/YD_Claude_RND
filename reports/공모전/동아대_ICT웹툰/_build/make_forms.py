"""동아대 ICT 공공언어 웹툰 신청서+개인정보 동의서 HTML 재현 → 서명 PDF 1부(2쪽). 실행: python make_forms.py"""
import subprocess
from pathlib import Path
HERE = Path(__file__).parent; OUT = HERE.parent / "제출"
SIG = Path(r"D:/park/YD_Claude_RND/reports/공모전/전남광주의회_정책아이디어/assets/sig_1_10.png").as_uri()
ME = dict(name="박용진", addr="경기도 하남시 미사강변한강로158번길 93, 401호", email="parkkb10@gmail.com", tel="010-2576-9278")
TITLE = "할머니는 ‘할루시네이션’을 못 알아들었다"
DESC = ("혈압약을 먹는 할머니가 AI에게 자몽을 같이 먹어도 되는지 묻고, AI는 “문제없다”고 거짓 정보를 답합니다. "
        "손자는 “그거 할루시네이션이야”라고 말하지만 할머니는 ‘영화 이름’인 줄 알고 자몽을 자릅니다. "
        "손자가 다시 “AI가 없는 사실을 진짜처럼 말하는 ‘정보 왜곡 현상’이에요”라고 하자 할머니는 곧바로 “거짓말을 했다는 거구먼!” 하고 알아듣고 약사에게 확인합니다. "
        "같은 경고라도 어려운 외래어로 하면 전해지지 않고, 쉬운 우리말로 하면 사람을 지킨다는 것을 보여 주려 했습니다. "
        "※ AI 사용 여부: 사용함. 8컷 그림(인물·배경)은 생성형 AI(ChatGPT 이미지 생성)로 만들었고, 이야기·대사·컷 구성·말풍선과 글자 배치·편집은 응모자가 직접 했습니다. "
        "(참고: 일부 혈압약은 자몽과 함께 먹으면 약 성분이 몸에 많이 남을 수 있어 약사·의사 확인이 필요합니다.)")
CSS = """<style>@page{size:A4;margin:18mm}body{font-family:'Noto Sans KR','Malgun Gothic';font-size:11pt;color:#111}
h1{text-align:center;font-size:18pt;margin:2mm 0 8mm;line-height:1.4}table{width:100%;border-collapse:collapse}
td,th{border:1px solid #333;padding:3mm;vertical-align:middle}th{background:#f1f1f1;width:26mm;font-weight:700}
.c{text-align:center}.sig{position:relative;display:inline-block;width:36mm}.sig img{position:absolute;left:2mm;top:-8mm;height:15mm}
.r{text-align:right;margin-top:8mm;font-size:12pt}p{line-height:1.7}.pb{page-break-before:always}.to{text-align:center;font-size:15pt;font-weight:700;margin-top:12mm}</style>"""
def sig(): return f'<span class="sig">&nbsp;<img src="{SIG}"></span>'
body = f"""<h1>‘쉽고 바른 정보통신기술(ICT)<br>공공언어 웹툰 공모전’ 신청서</h1><table>
<tr><th>제 목</th><td colspan=3>{TITLE}</td></tr>
<tr><th>참가 단위</th><td>개인</td><th>소 속</th><td>회사원(개인 참가)</td></tr>
<tr><th>성 명</th><td colspan=3>{ME['name']}</td></tr>
<tr><th>주 소</th><td colspan=3>{ME['addr']}</td></tr>
<tr><th>연락처</th><td style="white-space:nowrap">휴대폰 {ME['tel']}</td><th>E-Mail</th><td>{ME['email']}</td></tr>
<tr><th>작품 설명</th><td colspan=3 style="font-size:10pt;line-height:1.75">{DESC}</td></tr></table>
<p class=r><b>지원일자</b> 2026년 11월 13일</p><p class=r><b>신 청 자</b> {ME['name']} {sig()} (인)</p>
<div class="pb"></div><div class=to style="margin-top:0">동아대학교 국어문화원</div><h1>개인정보 수집·이용 동의서</h1>
<p>동아대학교 국어문화원 주관 프로그램 참여와 관련하여 본인의 개인정보를 수집·이용하는 경우에는 「개인정보보호법」에 따라 본인의 동의를 얻어야 합니다. 이에 본인은 귀 기관이 아래의 내용과 같이 본인의 개인정보를 수집 · 이용하는 것에 동의합니다.</p>
<table><tr><th>목적</th><td>국어문화원 주관 프로그램의 신청 및 운영 · 진행 · 관리</td></tr>
<tr><th>수집 항목</th><td>1. 필수 항목: 성명, 참가 단위, 소속, 휴대폰, 제목, 작품 설명(수상 시 주민등록증사본 및 통장사본)<br>2. 선택 항목: 주소, E-Mail</td></tr>
<tr><th>보유 이용 기간</th><td>위 개인정보는 수집·이용에 관한 동의일로부터 2년 동안 위 이용목적을 위하여 보유·이용됩니다.</td></tr>
<tr><th>동의를 거부할 권리 및 불이익</th><td>위 개인정보 중 필수항목의 수집·이용에 관한 동의는 공모전 신청을 위하여 필수적이므로, 위 사항에 동의하셔야만 공모전 응모가 가능합니다. 동의하지 않으실 경우 공모전 신청 및 상금 지급에 제한을 받으실 수 있습니다. 선택 항목 수집·이용에 동의하지 않으실 경우 별다른 불이익은 없습니다.</td></tr>
<tr><th>수집·이용 동의 여부</th><td>▪ 본인은 위와 같이 개인정보 필수항목을 수집·이용하는 것에 동의합니다. &nbsp; 동의함 ■ &nbsp; 동의하지 않음 □<br>▪ 본인은 위와 같이 개인정보 선택항목을 수집·이용하는 것에 동의합니다. &nbsp; 동의함 ■ &nbsp; 동의하지 않음 □</td></tr></table>
<p class=c style="margin-top:8mm">위의 내용을 이해하였으며, 위와 같은 개인정보 수집·이용에 동의합니다.</p>
<p class=r><b>날 짜</b> 2026년 11월 13일 &nbsp;&nbsp; <b>이 름</b> {ME['name']} {sig()} (인)</p><div class=to>동아대학교 국어문화원장</div>"""
html = f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body>{body}</body></html>"
h = HERE / "_신청서.html"; h.write_text(html, encoding="utf-8")
pdf = OUT / "박용진_웹툰공모전_신청서.pdf"
subprocess.run([r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", f"--print-to-pdf={pdf}", h.as_uri()], capture_output=True)
print(pdf.exists())
