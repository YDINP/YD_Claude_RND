"""한전KDN 슬로건 공모전 — 붙임1(참가신청서+개인정보 동의서) 원문 문구 재현 PDF."""
import base64, subprocess, time, tempfile
from pathlib import Path
HERE = Path(__file__).parent
SIG = "data:image/png;base64," + base64.b64encode((HERE/"assets"/"sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SLOGAN = "불 켜는 순간마다, 한전KDN은 깨어 있습니다"
MEANING = ("한전KDN의 일은 사람들 눈에 보이지 않습니다. 우리가 스위치를 누르고 휴대폰을 충전하는 그 순간에도, 전력망을 지켜보고 계량하고 제어하는 한전KDN의 전력 ICT는 밤낮없이 깨어 있습니다. "
           "'불 켜는 순간마다'는 누구나 하루에도 수십 번 겪는 평범한 장면이고, '깨어 있습니다'는 멈추지 않는 전력망 운영과 사이버 보안, 국민의 일상을 끝까지 지키는 책임을 뜻합니다. "
           "보이지 않는 곳의 일을 가장 가까운 일상 장면에 붙여, 들으면 바로 떠오르고 기억에 남도록 했습니다.")
def sign(label): return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'
CSS = """@page{size:A4;margin:16mm 16mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact}
body{font-family:'Malgun Gothic',sans-serif;font-size:10.5pt;color:#111;line-height:1.55;margin:0}
h1{text-align:center;font-size:16pt;margin:4px 0 14px}table{width:100%;border-collapse:collapse}
td,th{border:1px solid #444;padding:7px 9px;vertical-align:middle}th{background:#eef1f5;font-weight:700}
.sec{width:13%;text-align:center}.lab{width:15%;text-align:center;background:#f6f7f9;font-weight:700}
.small{font-size:9pt;color:#444}.pb{page-break-before:always}.sw{position:relative;display:inline-block}
.sig{position:absolute;left:-4px;top:50%;height:42px;transform:translateY(-50%)}.c{text-align:center}"""
p1 = f"""<h1>&lt;한전KDN 슬로건 공모전 참가신청서&gt;</h1>
<table>
<tr><th class="sec" rowspan="3">참 가 자</th><td class="lab">성명</td><td>박용진</td></tr>
<tr><td class="lab">사내 공모 여부</td><td>한전KDN 임직원 □ &nbsp; 한전KDN 협력사 임직원 □ &nbsp; 일반국민 ■</td></tr>
<tr><td class="lab">이메일 / 연락처</td><td>parkkb10@gmail.com &nbsp;/&nbsp; 010-2576-9278</td></tr>
<tr><th class="sec" rowspan="2">슬 로 건</th><td class="lab">슬로건</td><td style="font-size:13pt;font-weight:700">{SLOGAN}<div class="small" style="font-weight:400">공백 포함 {len(SLOGAN)}자</div></td></tr>
<tr><td class="lab">의미</td><td>{MEANING}<div class="small">공백 포함 {len(MEANING)}자</div></td></tr>
<tr><th class="sec">동 의 서</th><td class="lab">저작권 귀속 및<br>저작물 이용</td><td class="small" style="color:#111">
1. 본 공모전의 수상작은 별도의 권리 이전 절차 없이 지적재산권 일체 및 공표권, 원저작물을 각색, 변형할 수 있는 지적재산권(2차적저작물작성권 포함)은 별도의 이전 절차 없이 한전KDN에 양도되며, 응모자는 저작인격권을 행사하지 않습니다.<br>
2. 출품작의 표절이나 도용 등과 관련한 분쟁 발생 시 모든 책임은 응모자에게 있으며, 입상 이후라도 수상이 취소되고 상금이 환수될 수 있습니다.<br>
3. 본 공모전은 일부 공개 검증 및 온라인 투표가 포함될 수 있으며, 출품작의 일부 또는 전부가 심사·투표 목적에 한해 공개될 수 있습니다.<br>
4. 수상작은 실제 활용을 위해 디자인, 문구, 표현 등을 수정·보완하여 활용할 수 있으며, 이에 이의를 제기하지 않습니다.<br><br>
저작권 귀속 및 저작물 이용에 대해 동의를 거부할 권리가 있으나, 동의하지 않을 경우 참가가 제한됩니다.<br><br>
<b>위 내용을 숙지하였으며, 저작권 귀속 및 저작물 이용에 동의합니다. &nbsp; ■ 동의함 &nbsp;&nbsp; □ 동의하지 않음</b></td></tr>
</table>
<p class="c" style="margin-top:18px">위 내용을 모두 확인하였으며, 공모전 참가를 신청합니다.</p>
<p class="c" style="font-size:11.5pt">2026년 &nbsp;11월 &nbsp;4일</p>
<p style="text-align:right;margin-right:30px;font-size:11.5pt">신청인 성명 : <b>박용진</b> &nbsp; {sign('(서명 또는 인)')}</p>"""
p2 = f"""<div class="pb"></div><h1 style="font-size:14pt">「한전KDN 슬로건 공모전」 공모 및 포상을 위한<br>개인정보 수집·이용 동의서</h1>
<p>한전KDN(주)는 「한전KDN 슬로건 공모전」공모 및 포상을 위하여 아래와 같이 개인정보를 수집·이용하고자 합니다. 아래 내용을 자세히 읽으신 후 동의 여부를 결정하여 주시기 바랍니다.</p>
<p><b>1. 개인정보 수집 및 이용 동의(필수)</b></p>
<table><tr><td class="lab">수집·이용목적</td><td>공모전 신청 접수 및 본인확인, 공모전 운영 전반(심사, 결과 통보)</td></tr>
<tr><td class="lab">수집하는 개인정보 항목</td><td>성명, 소속, 이메일, 연락처</td></tr>
<tr><td class="lab">보유·이용기간</td><td>공모전 포상으로부터 30일</td></tr>
<tr><td class="lab">개인정보 수집 동의 거부의 권리</td><td>귀하는 위의 개인정보 수집․이용에 대한 동의를 거부할 권리가 있습니다. 그러나 동의를 거부할 경우「한전KDN 슬로건 공모전」 참여 및 심사에서 제한될 수 있습니다.</td></tr></table>
<p>☞ 위와 같이 개인정보의 수집 및 이용에 동의하십니까? &nbsp; 필수항목 &nbsp; <b>동의함 ■</b> &nbsp; 동의하지 않음 □</p>
<p><b>2. 법정대리인 동의</b> (만 14세 미만인 경우에 해당하며, 개인정보보호법 제22조 제5항에 의거 법정대리인의 동의를 받습니다)</p>
<table><tr><td class="lab">법정대리인 성명</td><td class="small">해당 없음</td><td class="lab">연락처</td><td></td><td class="lab">관계</td><td></td><td class="small">(인/서명)</td></tr></table>
<p>☞ 위와 같이 개인정보의 수집 및 이용에 동의하십니까? &nbsp; 동의함 □ &nbsp; 동의하지 않음 □ <span class="small">(해당 없음)</span></p>
<p><b>3. 기타사항</b></p><p>공모 접수 및 심사, 포상처리 과정에서 공모자 본인 확인, 심사 결과 통보, 포상비 지급 등을 위한 연락을 드릴 수 있습니다.</p>
<p class="c" style="margin-top:22px;font-size:11.5pt">2026년 &nbsp;11월 &nbsp;4일</p>
<p style="text-align:right;margin-right:30px;font-size:11.5pt">본 인 &nbsp; 성명 &nbsp; <b>박용진</b> &nbsp; {sign('(서명 또는 인)')}</p>
<p class="c" style="font-size:13pt;font-weight:700;margin-top:30px">한전KDN주식회사 귀중</p>"""
html = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{p1}{p2}</body></html>"
src = HERE/"_build.html"; src.write_text(html, encoding="utf-8")
out = HERE/"박용진_한전KDN슬로건공모전_참가신청서.pdf"
prof = tempfile.mkdtemp(prefix="kdnpdf_")
subprocess.run([CHROME,"--headless=new","--disable-gpu","--no-pdf-header-footer",f"--user-data-dir={prof}",f"--print-to-pdf={out}",src.as_uri()],capture_output=True)
time.sleep(1); src.unlink(); print(out.exists(), len(SLOGAN), len(MEANING))
