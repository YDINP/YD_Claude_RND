"""충남 자경위 서식 1~4 HTML 재현 → 서명 PDF. 실행: python make_forms.py"""
import subprocess
from pathlib import Path
HERE = Path(__file__).parent; OUT = HERE.parent / "제출"
SIG = Path(r"D:/park/YD_Claude_RND/reports/공모전/전남광주의회_정책아이디어/assets/sig_1_10.png").as_uri()
POSTER = (OUT / "작품_초록불은1초에1m.jpg").as_uri()
ME = dict(name="박용진", birth="1997. 5. 29.", addr="경기도 하남시 미사강변한강로158번길 93, 401호", email="parkkb10@gmail.com", tel="010-2576-9278")
DATE = "2026년 11월 13일"
TITLE = "초록불은 1초에 1m 걷는 걸음에 맞춰져 있습니다"
DESC = ("일반 도로의 보행신호는 1초에 1m를 걷는 걸음을 기준으로 시간이 정해집니다. 그런데 지팡이·보행보조기를 쓰는 어르신은 "
        "1초에 약 0.7m를 걷습니다(하위 15% 0.73m/s). 같은 18초 동안 한 사람은 18m 횡단보도를 다 건너고, 어르신 앞에는 약 5m가 남습니다. "
        "포스터는 이 차이를 위에서 내려다본 횡단보도와 두 줄의 발자국으로 보여 줍니다. 운전자가 '초록불이 끝났으니 출발'이 아니라 "
        "'횡단보도 끝까지 비었는지 보고 출발'하도록 행동 한 가지를 요구합니다. 수치 출처를 하단에 표기했습니다. "
        "제작: 직접 디자인(HTML·SVG 벡터, 글꼴 Noto Sans KR·OFL). 생성형 AI 이미지는 사용하지 않았습니다.")
CSS = """<style>@page{size:A4;margin:18mm 18mm}body{font-family:'Noto Sans KR','Malgun Gothic';font-size:11pt;color:#111}
h1{text-align:center;font-size:20pt;letter-spacing:6px;margin:4mm 0 8mm}.tag{font-size:10pt;font-weight:700}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:3mm 3mm;vertical-align:middle}
th{background:#f1f1f1;font-weight:700;width:28mm}.c{text-align:center}.sig{position:relative;display:inline-block;width:42mm}
.sig img{position:absolute;left:4mm;top:-9mm;height:16mm}.r{text-align:right;margin-top:10mm;font-size:12pt}.to{margin-top:12mm;font-size:14pt;font-weight:700;text-align:center}
p,li{line-height:1.75}</style>"""
def sig(): return f'<span class="sig">&nbsp;<img src="{SIG}"></span>'
def page(body): return f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body>{body}</body></html>"
F = {}
F["서식1_응모신청서"] = page(f"""<div class=tag>【서식 1】</div><h1>응모신청서</h1><table>
<tr><th>접수번호</th><td colspan=3>미기재</td></tr><tr><th>응모부문</th><td>광고 포스터</td><th>참가구분</th><td>개인( ○ )  팀(   )</td></tr>
<tr><th rowspan=3>응모자</th><td colspan=1><b>성명</b> {ME['name']}</td><td colspan=2><b>생년월일</b> {ME['birth']}</td></tr>
<tr><td colspan=3><b>주소</b> {ME['addr']}</td></tr><tr><td colspan=2><b>이메일</b> {ME['email']}</td><td><b>연락처</b> {ME['tel']}</td></tr>
<tr><th>공동참가자</th><td colspan=3>해당 없음</td></tr>
<tr><th>필수서류</th><td colspan=3>응모신청서, 개인정보 수집·이용 동의서, 응모서약서(자필서명 PDF) / 작품응모서 / 작품 파일</td></tr></table>
<p class=c style="margin-top:12mm">위와 같이 충청남도자치경찰위원회 교통안전 콘텐츠 공모에 응모합니다.</p><p class=c>{DATE}</p>
<p class=r>응 모 자 : {ME['name']} {sig()} (서명)</p><div class=to>충청남도자치경찰위원회 위원장 귀하</div>""")
F["서식2_개인정보동의서"] = page(f"""<div class=tag>【서식 2】</div><h1>개인정보 수집·이용 동의서</h1>
<p>충청남도자치경찰위원회는 「충청남도자치경찰위원회 교통안전 콘텐츠 공모전」과 관련한 개인정보 수집·이용을 위하여 「개인정보보호법」 제15조에 따라 귀하의 동의를 얻고자 합니다.</p>
<ol><li>수집‧이용 목적: 공모전 참가자 본인 확인 및 연락, 응모작 심사 등 공모전 절차 진행, 공모전 입상작 이용</li><li>수집 항목: 성명, 생년월일, 주소, 이메일, 연락처</li>
<li>보유 및 이용기간: 수집·이용 목적 완료 시까지</li><li>동의 거부권 및 불이익: 동의를 거부할 수 있으나, 동의하지 않는 경우 본 공모전 참여가 불가합니다.</li></ol>
<p>□ 위와 같이 개인정보를 수집․이용하는데 동의하십니까?</p><table><tr><th class=c>구분</th><th class=c>성명</th><th class=c>생년월일</th><th class=c>동의여부</th><th class=c>서명</th></tr>
<tr><td class=c>응모자</td><td class=c>{ME['name']}</td><td class=c>{ME['birth']}</td><td class=c>■ 동의 / □ 거부</td><td class=c style="height:14mm">{sig()}</td></tr></table>
<p class=c style="margin-top:12mm">{DATE}</p><div class=to>충청남도자치경찰위원회 위원장 귀하</div>""")
F["서식3_응모서약서"] = page(f"""<div class=tag>【서식 3】</div><h1>서 약 서</h1>
<p>본인은 충청남도가 주최하는 「충청남도자치경찰위원회 교통안전 콘텐츠 공모전」에 작품을 응모함에 따라 다음 사항을 확인하고 이의 없음을 서약합니다.</p><ul>
<li>공모전에 출품된 작품에 대한 저작권(저작재산권, 저작인격권)은 저작자인 응모자에게 있으며, 수상 후에도 입상자에게 귀속됨을 원칙으로 함</li>
<li>공모전에 제출한 작품은 지금까지 어떤 공모전에 제출, 시상된 내역이 없는 순수 창작물임을 확인함</li>
<li>응모 시 기재착오, 오류, 누락, 연락불능, 제작작품 훼손 등으로 인한 불이익은 응모자의 책임으로 간주함</li>
<li>응모자는 응모작이 제3자의 저작권, 초상권 등을 침해하지 않도록 주의의무를 다해야 함. 이로 인한 법적 문제가 발생한 경우 응모자의 책임으로 간주함</li>
<li>응모자는 응모와 동시에 추후 입상 시 입상작에 대한 이용을 허락한 것으로 봄<br>- 위원회는 비영리·공익적 목적으로 독점적으로 복제, 배포, 전시, 전송 등 할 수 있음<br>- 위원회는 위원회·충청남도·유관기관 등이 관리하는 누리집, SNS 채널 등에 게재하고 홍보물 및 정책·홍보자료로 활용할 수 있음</li>
<li>타공모전 수상이력이 있거나 타인의 작품 표절, 응모작 가이드에 적합하지 않은 경우, 응모작은 심사대상에서 제외되며, 수상했을 경우라도 해당 수상이 자동 취소되며 상금이 회수됨</li>
<li>위원회는 수상자와 협의하여 추가 공동작업을 통해 작품의 완성도를 높일 수 있음</li><li>공고문 미숙지로 인하여 발생하는 모든 문제는 응모자의 책임으로 간주함</li></ul>
<p class=c style="margin-top:10mm">{DATE}</p><p class=r>서약자 생년월일 : {ME['birth']}  성명 : {ME['name']} {sig()} (서명)</p><div class=to>충청남도자치경찰위원회 위원장 귀하</div>""")
F["서식4_작품응모서"] = page(f"""<div class=tag>【서식 4】</div><h1>작품응모서</h1><table>
<tr><th>접수번호</th><td>미기재</td></tr><tr><th>도안</th><td class=c><img src="{POSTER}" style="height:120mm"></td></tr>
<tr><th>작품명</th><td>{TITLE}</td></tr><tr><th>작품설명</th><td style="font-size:10pt;line-height:1.7">{DESC}</td></tr></table>""")
CH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
for k, v in F.items():
    h = HERE / f"_{k}.html"; h.write_text(v, encoding="utf-8")
    subprocess.run([CH, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", f"--print-to-pdf={OUT / (k + '.pdf')}", h.as_uri()], capture_output=True)
    print(k, (OUT / (k + ".pdf")).exists())
