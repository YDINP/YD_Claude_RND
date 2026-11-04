"""참가신청서(+개인정보 동의서) — 원본 hwpx 채움본 + 서명 PDF 생성.
실행: python build_forms.py
"""
import base64, re, subprocess, tempfile, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
SRC = HERE / "원본" / "참가신청서.hwpx"
OUT = HERE / "제출"
OUT.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ME = dict(name="박용진", age="20대", phone="010-2576-9278", email="parkkb10@gmail.com", y="2026", m="11", d="4")
SUMMARY = "첫 번째 보안검색대는 오늘 밤, 당신의 방"
AI_LINES = [
    "- ChatGPT 이미지 생성(gpt-image, Codex CLI 내장 image_gen)으로 배경 일러스트 생성",
    "- 프롬프트 요지: \"과슈·색연필 그림책풍, 밤의 방에 잘 꾸려진 열린 여행가방, 뚜껑 안쪽은 새벽 하늘 창(여객기), "
    "보조배터리는 가방 밖 배낭 앞주머니에\" (원본 생성 이미지·전체 프롬프트는 요청 시 제출)",
    "- 한글 문구·AI 고지 문구·AI 워터마크는 응모자가 직접 작성해 합성",
]
CHK = "☑"


def run(t, cp=9):
    return f'<hp:run charPrIDRef="{cp}"><hp:t>{escape(t)}</hp:t></hp:run>'


def build_hwpx():
    z = zipfile.ZipFile(SRC)
    x = z.read("Contents/section0.xml").decode("utf-8")
    x = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", x, flags=re.S)  # 줄배치 캐시 제거 → 한글이 다시 줄나눔

    def fill_empty(tbl_x, col, row, text):
        pat = re.compile(r'(<hp:subList[^>]*>)(<hp:p [^>]*>)<hp:run charPrIDRef="1[12]"/>(<hp:linesegarray>(?:<hp:lineseg [^>]*/>)*</hp:linesegarray>)?(</hp:p></hp:subList><hp:cellAddr colAddr="%d" rowAddr="%d"/>)' % (col, row), re.S)
        new, n = pat.subn(lambda m: m.group(1) + m.group(2) + run(text) + m.group(4), tbl_x, count=1)
        assert n == 1, (col, row)
        return new

    x = fill_empty(x, 1, 2, ME["name"])
    x = fill_empty(x, 3, 2, ME["age"])
    x = fill_empty(x, 1, 3, ME["phone"])
    x = fill_empty(x, 3, 3, ME["email"])
    x = x.replace(run(" - 간단한 작품 개요 작성(국 ·영문 혼용 30자 이내)", 11), run(SUMMARY), 1)
    p_open = '<hp:p id="2147483648" paraPrIDRef="24" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
    ai = (run(AI_LINES[0]) + "</hp:p>" + p_open + run(AI_LINES[1]) + "</hp:p>" + p_open + run(AI_LINES[2]))
    x = x.replace(run(" - ChatGPT, Gemini 등 활용", 11), ai, 1)
    x = re.sub(r'<hp:p [^>]*paraPrIDRef="24"[^>]*><hp:run charPrIDRef="11"><hp:t> - 프롬프트 명령어 등</hp:t></hp:run><hp:run charPrIDRef="13"/></hp:p>', "", x, count=1)
    assert "프롬프트 명령어 등" not in x
    # 체크박스: 동의 4개 + 개인정보 '동의함'
    for k in ["<hp:t>□</hp:t>"]:
        assert x.count(k) == 4, x.count(k)
        x = x.replace(k, f"<hp:t>{CHK}</hp:t>")
    x = x.replace("<hp:t>□ 동의함                 □ 동의하지 않음</hp:t>", f"<hp:t>{CHK} 동의함                 □ 동의하지 않음</hp:t>", 1)
    x = x.replace('<hp:t>2026년  <hp:tab width="1128" leader="0" type="1"/>  월 <hp:tab width="1396" leader="0" type="1"/> 일</hp:t>',
                  f'<hp:t>2026년  <hp:tab width="1128" leader="0" type="1"/>{ME["m"]}월 <hp:tab width="1396" leader="0" type="1"/>{ME["d"]}일</hp:t>', 1)
    x = x.replace('<hp:t>신청인  <hp:tab width="3828" leader="0" type="1"/><hp:tab width="4000" leader="0" type="1"/>(서명 또는 인)</hp:t>',
                  f'<hp:t>신청인  <hp:tab width="3828" leader="0" type="1"/>{ME["name"]}<hp:tab width="4000" leader="0" type="1"/>(서명 또는 인)</hp:t>', 1)
    x = x.replace("<hp:t>2026년       월       일</hp:t>", f"<hp:t>2026년   {ME['m']}  월   {ME['d']}  일</hp:t>", 1)
    x = x.replace("<hp:t>신청인                      (서명 또는 인)</hp:t>", f"<hp:t>신청인          {ME['name']}          (서명 또는 인)</hp:t>", 1)
    # 줄배치 캐시 제거 → 한글이 다시 줄나눔
    x = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", x, flags=re.S)
    dst = OUT / "참가신청서_개인정보동의서_박용진.hwpx"
    with zipfile.ZipFile(dst, "w") as o:
        for info in z.infolist():
            data = x.encode("utf-8") if info.filename == "Contents/section0.xml" else z.read(info.filename)
            o.writestr(info, data, compress_type=info.compress_type)
    assert zipfile.ZipFile(dst).infolist()[0].filename == "mimetype"
    assert zipfile.ZipFile(dst).infolist()[0].compress_type == zipfile.ZIP_STORED
    return dst


def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def html():
    m = ME
    ck = f'<span class="ck">{CHK}</span>'
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page {{ size:A4; margin:18mm 18mm; }}
* {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }}
body {{ font-family:'Malgun Gothic',sans-serif; font-size:10.5pt; color:#000; margin:0; line-height:1.55; }}
table {{ width:100%; border-collapse:collapse; }}
td {{ border:1px solid #000; padding:6px 8px; vertical-align:middle; }}
.h {{ background:#e9e9e9; text-align:center; font-weight:700; letter-spacing:1px; width:16%; white-space:nowrap; }}
.title {{ font-size:16pt; font-weight:800; text-align:center; padding:12px; }}
.rn {{ width:13%; text-align:center; font-size:10pt; padding:2px; }}
.sec {{ background:#d9d9d9; text-align:center; font-weight:700; }}
.ck {{ font-family:'Segoe UI Symbol','Malgun Gothic'; font-size:12pt; margin-right:6px; }}
.li {{ display:flex; margin:6px 0 6px 18px; }}
.sw {{ position:relative; display:inline-block; }}
.sig {{ position:absolute; left:-4px; top:50%; height:46px; transform:translateY(-50%); }}
.pb {{ page-break-before:always; }}
.r {{ text-align:right; }}
p {{ margin:4px 0; }}
</style></head><body>
<table>
<tr><td colspan="4" class="title" style="border-right:none">2026 한국공항보안(주) AI 디지털 이미지 공모전</td>
<td class="rn"><b>접수번호</b><br><span style="color:#999">공 란</span></td></tr>
<tr><td class="h">성 명</td><td style="width:30%">{m['name']}</td><td class="h">연 령 대</td><td colspan="2">{m['age']}</td></tr>
<tr><td class="h">연 락 처</td><td>{m['phone']}</td><td class="h">이메일 주소</td><td colspan="2">{m['email']}</td></tr>
<tr><td class="h">작품개요</td><td colspan="4">{SUMMARY}</td></tr>
<tr><td class="h">활용 AI도구<br>및 프롬프트</td><td colspan="4" style="font-size:9.5pt">{'<br>'.join(escape(s) for s in AI_LINES)}</td></tr>
<tr><td colspan="5" class="sec">참가신청 확인 및 저작물 이용 허락 동의서</td></tr>
<tr><td colspan="5" style="padding:18px 26px">
<p>다음 안내사항을 확인 후 동의하는 경우, <span style="color:#d00;font-weight:700">□ 칸에 반드시 체크(√)</span>해주시기 바랍니다.<br>이에 동의하지 않는 경우, 본 공모전에 응모할 수 없음을 알려드립니다.</p>
<div style="margin-top:12px">
<div class="li">{ck}<div>응모자는 출품작이 제3자의 지적재산권 등을 침해하지 않도록 주의 의무를 다하였음</div></div>
<div class="li">{ck}<div>응모와 동시에 추후 입상 시 공모문에 기재되어 있는 활용 방법 및 조건의 범위 안에서 입상작의 이용을 허락한 것으로 보고, 필요 한도 내 2차 가공하여 온/오프라인으로 이용될 수 있음에 동의함</div></div>
<div class="li">{ck}<div>수상작은 참여자의 성명과 응모 내용 등 언론사 및 일반(한국공항보안 공식 홈페이지, 공식 SNS 등)에 공개될 수 있으며, 한국공항보안(주) 홍보자료로 활용될 수 있음에 동의함</div></div>
<div class="li">{ck}<div>본 공모전의 공모문, 접수 유의사항, 심사 관련 사항을 모두 확인하였으며, 공모문 내 유의사항을 숙지하지 않아 발생하는 불이익은 응모자에게 있음.</div></div>
</div>
<p style="margin-top:16px">위와 같이 2026년 한국공항보안(주) AI 디지털 이미지 공모전에 참가를 신청합니다.</p>
<p class="r" style="margin-top:14px">2026년 &nbsp;&nbsp; {m['m']} 월 &nbsp;&nbsp; {m['d']} 일</p>
<p class="r" style="margin-top:14px">신청인 &nbsp;&nbsp;&nbsp; {m['name']} &nbsp;&nbsp;&nbsp;&nbsp; {sign()}</p>
<p class="r" style="margin-top:22px;font-size:13pt;font-weight:800">한국공항보안(주) 대표이사 귀하</p>
</td></tr></table>
<p style="margin-top:10px">* 작품은 이미지 파일로 제출하여야 하며, 참가신청서 서식 및 개인정보 수집·이용 동의서와 함께 zip파일 형태로 압축하여 메일 첨부하여 주십시오.</p>

<div class="pb"></div>
<table><tr><td style="padding:22px 28px">
<p style="text-align:center;font-size:16pt;font-weight:800;margin:6px 0">개인정보 수집·이용 동의서</p>
<p style="text-align:center;margin-bottom:16px">2026 한국공항보안(주) AI 디지털 이미지 공모전</p>
<p>한국공항보안(주)는 본 공모전 운영을 위해 아래와 같이 개인정보를 수집·이용합니다. 내용을 확인한 후 동의 여부를 표시해 주시기 바랍니다.</p>
<p style="margin-top:12px"><b>1. 개인정보의 수집·이용 목적</b><br>&nbsp;&nbsp;&nbsp;참가자 인적사항 확인 및 공모작 평가·시상</p>
<p style="margin-top:10px"><b>2. 수집하는 개인정보의 항목</b><br>&nbsp;&nbsp;&nbsp;성명, 연락처, 연령대, 이메일 주소</p>
<p style="font-size:9.5pt">※ 수상자로 선정된 경우, 상금 지급 및 제세공과금 처리(원천징수·세무 신고)를 위해 주민등록번호와 신분증 사본 등 필요한 자료의 제출을 별도로 요청할 수 있습니다.</p>
<p style="margin-top:10px"><b>3. 개인정보의 보유·이용 기간</b><br>&nbsp;&nbsp;&nbsp;접수 시부터 1년간(2027년 11월 13일까지)</p>
<p style="font-size:9.5pt">※ 수집된 개인정보는 공모전 진행을 위해서만 사용됩니다.</p>
<p style="margin-top:10px"><b>4. 동의 거부에 관한 사항</b><br>&nbsp;&nbsp;&nbsp;개인정보 수집·이용에 동의하지 않을 수 있습니다. 다만, 동의하지 않는 경우 본 공모전에 응모할 수 없습니다.</p>
<p style="margin-top:18px">위 내용을 확인하였으며, 개인정보 수집·이용에 대한 동의 여부를 아래와 같이 표시합니다.</p>
<p style="text-align:center;margin-top:14px;font-size:11.5pt">{ck}동의함 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span class="ck">□</span>동의하지 않음</p>
<p style="text-align:center;margin-top:26px">2026년 &nbsp;&nbsp; {m['m']} 월 &nbsp;&nbsp; {m['d']} 일</p>
<p class="r" style="margin-top:20px;margin-right:30px">신청인 &nbsp;&nbsp;&nbsp; {m['name']} &nbsp;&nbsp;&nbsp;&nbsp; {sign()}</p>
<p class="r" style="margin-top:30px;font-size:13pt;font-weight:800;margin-right:30px">한국공항보안(주) 대표이사 귀하</p>
<div style="height:120px"></div>
</td></tr></table>
</body></html>"""


def build_pdf():
    src = HERE / "build" / "forms.html"
    src.write_text(html(), encoding="utf-8")
    dst = OUT / "참가신청서_개인정보동의서_박용진.pdf"
    with tempfile.TemporaryDirectory() as ud:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={ud}", "--no-pdf-header-footer",
                        f"--print-to-pdf={dst}", src.as_uri()], check=True, capture_output=True, timeout=120)
    return dst


if __name__ == "__main__":
    print(build_hwpx())
    print(build_pdf())
