"""붙임2 공모전 신청서(참고용 양식)를 원문 문구대로 재현해 채운 검토용 PDF."""
import base64, html, subprocess, tempfile, time
from pathlib import Path
import content as C

HERE = Path(__file__).parent
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def e(s):
    return html.escape(s).replace("\n", "<br>")


def box(on):
    return "■" if on else "□"


THEATERS = ["소극장(300석 미만)", "중극장(300~500석)", "중극장(500~1,000석)", "대극장(1,000석 이상)", "기타(야외 등)"]
theater = " &nbsp; ".join(f"{box(t in C.THEATER)} {t}" for t in THEATERS)

CSS = """
@page { size:A4; margin:13mm 14mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.4pt; color:#111; line-height:1.55; margin:0; }
h1 { text-align:center; font-size:15pt; margin:2px 0 4px; letter-spacing:2px; }
.note { font-size:8.3pt; color:#444; margin:0 0 6px; }
table { width:100%; border-collapse:collapse; }
td, th { border:1px solid #000; padding:5px 8px; vertical-align:top; }
th { background:#eceff3; font-weight:700; text-align:center; vertical-align:middle; }
.sec { width:11%; }
.lab { width:15%; background:#f5f6f8; font-weight:700; text-align:center; vertical-align:middle; }
.hint { color:#555; font-size:8.3pt; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:40px; transform:translateY(-50%); }
.agree p { margin:2px 0; }
"""


def doc():
    m = C.ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>공모전 신청서</title><style>{CSS}</style></head><body>
<div style="font-weight:700">붙임2</div>
<h1>공모전 신청서</h1>
<p class="note">※ 본 양식은 참고용입니다. 실제 신청서 제출은 소통24를 통해 네이버 폼으로 제출 (본 한글 파일 제출 불요) * 본 한글 파일을 이메일 등으로 제출하는 경우, 접수하지 않음 (제출 미인정).</p>
<table>
<tr><th class="sec" rowspan="4">신청자<br>정보</th><td class="lab">지원 구분</td><td colspan="3">■ 개인 &nbsp;&nbsp;&nbsp; □ 단체</td></tr>
<tr><td class="lab" rowspan="2">개인</td><td class="lab" style="width:12%">성명</td><td colspan="2">{m['name']}</td></tr>
<tr><td class="lab">연락처</td><td>{m['phone']}</td></tr>
<tr><td class="lab">이메일</td><td colspan="3">{m['email']}</td></tr>
</table>
<table style="margin-top:-1px">
<tr><th class="sec" rowspan="10">제안서<br>개요</th><td class="lab">제 목</td><td><span class="hint">-아이디어명 또는 작품명</span><br><b>{e(C.TITLE)}</b></td></tr>
<tr><td class="lab">기획의도</td><td><span class="hint">-목적, 제안 배경, 차별점 등 기획의도에 대한 설명</span><br>{e(C.INTENT)}</td></tr>
<tr><td class="lab">소요시간</td><td>{e(C.RUNTIME)}</td></tr>
<tr><td class="lab">극장규모</td><td>{theater}<br><span class="hint">* 중복 선택 가능</span></td></tr>
<tr><td class="lab">예상 출연인원</td><td>{e(C.CAST)}</td></tr>
<tr><td class="lab">주 관객층</td><td>{e(C.AUDIENCE)}</td></tr>
<tr><td class="lab">줄 거 리<br><span class="hint">(500자 이하)</span></td><td><span class="hint">-서사(스토리)의 핵심내용에 대한 설명</span><br>{e(C.SYNOPSIS)}</td></tr>
<tr><td class="lab">국가무형유산<br>종목</td><td>{e(C.ITEMS)}</td></tr>
<tr><td class="lab">상세 내용<br><span class="hint">(1,500자 이하)</span></td><td><span class="hint">-서사(스토리), 전개 방식 등 상세 내용 기재</span><br>{e(C.DETAIL)}</td></tr>
<tr><td class="lab">기타 사항<br><span class="hint">(해당 시)</span></td><td><span class="hint">-기존 발표(공연) 프로그램을 재구성하여 제출하는 경우, 기존 발표(공연) 이력 및 재구성 방식 설명 반드시 기재</span><br>{e(C.ETC)}</td></tr>
</table>
<table style="margin-top:-1px">
<tr><th class="sec">출처<br><span style="font-weight:400;font-size:8pt">(해당 시)</span></th><td><span class="hint">-웹사이트, 유튜브, 관련 문서 등 출처 작성</span><br>{e(C.SOURCES)}</td></tr>
</table>

<div class="pb"></div>
<table class="agree">
<tr><th class="sec" rowspan="2">공모 참여<br>및<br>개인정보<br>동의 사항</th><td>
<p><b>1. 공모 참여 동의</b></p>
<p>- 본인(단체)은 공모 공고의 세부내용(참가대상, 공모내용, 유의사항, 심사 및 포상 기준 등)을 충분히 숙지하였음을 확인하고, 공모 참여에 동의합니다.</p>
<p>- 제출한 아이디어는 본인(단체)이 직접 창작한 것으로 타인의 저작권 등 지적재산권을 침해하지 않았으며, 제3자의 저작물을 일부 이용한 경우 저작재산권을 양도받거나 이용허락을 받았음을 확인합니다. 향후 분쟁 발생 시 모든 책임은 응모자에게 있습니다.</p>
<p>- 2차 심사 대상으로 선정될 경우, 제출 아이디어가 대국민 공개투표를 위해 온라인상에 공개되는 것에 동의합니다.</p>
<p>- 수상 시 아이디어 제안서의 지적재산권과 2차적 저작물 작성권을 국가유산청이 상설공연 제작 등에 사용하는 것에 동의합니다.</p>
<p>- 출처·경위가 불명확하거나 표절로 밝혀질 경우 입상이 취소될 수 있으며, 제출 신청서는 반환되지 않음을 확인합니다.</p>
<p style="margin-top:6px">※ 공모 참여에 동의하십니까? &nbsp;&nbsp;&nbsp; ■ 동의함 &nbsp;&nbsp;&nbsp; □ 동의하지 않음</p>
</td></tr>
<tr><td>
<p><b>2. 개인정보 수집·이용 동의</b></p>
<p>- 수집 항목: (개인) 성명, 연락처, 이메일 / (단체) 단체명, 대표자 성명, 연락처, 이메일 ※ 주민등록번호, 계좌정보 등 추가 수집</p>
<p>- 수집·이용 목적: 공모 접수 및 심사, 대국민 공개투표 진행, 결과 안내, 시상 및 상금 지급(제세공과금 처리 포함) 등 공모전 운영</p>
<p>- 보유·이용 기간: 공모전 종료일로부터 5년</p>
<p>- 신청자는 개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 다만, 동의하지 않을 경우 공모 접수 및 심사·시상이 제한될 수 있습니다.</p>
<p style="margin-top:6px">※ 개인정보 수집·이용에 동의하십니까? &nbsp;&nbsp;&nbsp; ■ 동의함 &nbsp;&nbsp;&nbsp; □ 동의하지 않음</p>
</td></tr>
</table>
<p style="margin:26px 6px 0;font-size:10.5pt;line-height:1.9">본인은 “국가유산 상설공연 콘텐츠 대국민 아이디어 공모전” 신청서를 제출합니다. 제출한 내용이 허위사실일 경우 선정 취소 등의 조치가 취해질 수 있음을 확약하며, 심사 및 선정 이후 공연 제작, 홍보 등 공모전 관련 진행사항 전반에 대하여 적극 협조하겠습니다.</p>
<p style="text-align:center;font-size:11pt;margin:26px 0 18px">2026년 &nbsp;11월 &nbsp;4일</p>
<p style="text-align:right;margin-right:40px;font-size:11pt">제출자 : &nbsp;<b>{m['name']}</b> &nbsp;&nbsp;<span class="sw">(서명)<img class="sig" src="{SIG}"></span></p>
<p style="text-align:right;margin-right:40px;font-size:8.5pt;color:#555">단체의 경우, 대표자</p>
<p style="text-align:center;font-size:13pt;font-weight:700;margin-top:40px">국가유산청장 귀하</p>
</body></html>"""


def main():
    src = HERE / "신청서_검토용.html"
    src.write_text(doc(), encoding="utf-8")
    out = HERE / "신청서_웃으며보내는밤_박용진(검토용).pdf"
    prof = tempfile.mkdtemp(prefix="chrome-pdf-")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={prof}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    src.unlink()
    print(out, out.exists())


if __name__ == "__main__":
    main()
