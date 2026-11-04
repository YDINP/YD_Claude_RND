"""지정 서식(참가신청서·제안서 + 자가점검표)을 원문 그대로 재현해 채운 PDF + 별첨(0원 영수증 시안)."""
import base64, subprocess, time
from pathlib import Path
from html import escape as e

from content import ME, TITLE, TOPIC, TYPE, TARGET, RECEIPT, DUP, TOTAL, REVENUE, FUTURE, \
    BACKGROUND, MESSAGE, PLAN, DATA, DIFF

HERE = Path(__file__).parent
BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)
SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = HERE / "박용진_대국민재정교육아이디어_참가신청서(0원 영수증).pdf"

CK, UN = "☑", "□"


def box(on):
    return CK if on else UN


def lines(items):
    out = []
    for t in items:
        if t.startswith("【"):
            out.append(f'<p class="hd">{e(t)}</p>')
        elif t[0] in "①②③④⑤⑥⑦":
            out.append(f'<p class="st">{e(t)}</p>')
        else:
            k = t.find(")")
            if t.startswith("○ (") and k > 0:
                out.append(f'<p class="o">○ <b>{e(t[2:k + 1])}</b>{e(t[k + 1:])}</p>')
            else:
                out.append(f'<p class="o">{e(t)}</p>')
    return "".join(out)


CSS = """
@page { size:A4; margin:14mm 15mm 12mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.6pt; color:#111; line-height:1.45; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.top { display:flex; gap:10px; align-items:stretch; margin-bottom:8px; }
.top .tag { background:#1565d8; color:#fff; font-weight:700; font-size:14pt; padding:4px 14px; display:flex; align-items:center; }
.top .ttl { flex:1; border:1px solid #000; font-size:14pt; font-weight:700; padding:4px 12px; }
.bar { background:#3a3a3a; color:#fff; text-align:center; font-weight:700; font-size:13pt; padding:4px; letter-spacing:1px; }
.notice { border:1px solid #000; border-top:0; background:#f2f2f2; padding:5px 10px; font-size:9.6pt; }
h2 { font-size:11.5pt; margin:10px 0 4px; }
.f td { border:1px solid #000; padding:3px 7px; vertical-align:middle; }
.f .h { background:#e8e8e8; font-weight:700; text-align:center; }
.c { text-align:center; }
.p td.h { width:15%; }
.p td { font-size:9.4pt; }
.p p { margin:1px 0; }
.p p.o { padding-left:1.1em; text-indent:-1.1em; }
.p p.hd { font-weight:700; margin-top:3px; }
.p p.st { padding-left:2.1em; text-indent:-1.1em; }
.chk span { margin-right:14px; white-space:nowrap; }
.sig-row { text-align:center; font-size:11.5pt; margin:10px 0 0; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:-4px; top:50%; height:40px; transform:translateY(-50%); }
.small { font-size:8.6pt; color:#444; }
/* receipt */
.rc-wrap { display:flex; gap:18px; align-items:flex-start; margin-top:8px; }
.rc { width:330px; background:#fffef8; border:1px solid #bbb; padding:14px 16px 18px; font-family:'D2Coding','Consolas','Malgun Gothic',monospace; font-size:9.4pt; line-height:1.55;
      box-shadow:0 2px 6px rgba(0,0,0,.12); }
.rc .c1 { text-align:center; font-weight:700; font-size:13pt; letter-spacing:2px; }
.rc .dash { border-top:1px dashed #555; margin:6px 0; }
.rc table td { padding:0; font-family:inherit; font-size:9.3pt; }
.rc td.r { text-align:right; }
.rc .big td { font-weight:700; font-size:10.5pt; }
.side { flex:1; font-size:9.6pt; }
.side h3 { font-size:10.5pt; margin:4px 0 4px; }
.side p { margin:3px 0; }
.side table td, .side table th { border:1px solid #999; padding:3px 6px; font-size:9.2pt; }
.side table th { background:#eee; }
"""


def proposal():
    m = ME
    topics = ["① 알기 쉽게 배우는 나라살림", "② 내 삶에서 배우는 나라살림", "③ 체험하며 배우는 나라살림",
              "④ 재정을 배우는 새로운 방법", "⑤ 기타 주제"]
    tb = lambda i: f"{box(TOPIC == i + 1)} {topics[i]}"
    types = ["숏폼(영상)", "웹툰·만화", "카드뉴스·인포그래픽", "교육 프로그램·체험활동", "게임·교구"]
    ty = lambda i: f"{box(TYPE == types[i])} {types[i]}"
    tg = ["초등학생", "중·고등학생", "대학생·청년", "일반 성인", "어르신"]
    ta = lambda i: f"{box(TARGET == tg[i])} {tg[i]}"
    return f"""
<div class="top"><div class="tag">붙임</div><div class="ttl">대국민 재정교육 아이디어 제안서</div></div>
<div class="bar">대국민 재정교육 아이디어 제안서</div>
<div class="notice">○ (주제) 국민 눈높이에서 알기 쉬운 재정교육<b>(아래 ①~④ 세부 주제 중 택1)</b><br>
○ (접수) ’26.10.30.~11.27. 18:00, 온라인 업로드(<b>HWP·PDF, 3쪽 이내</b>, 참고 이미지 별첨)</div>
<h2>1. 제안자 정보</h2>
<table class="f">
<tr><td class="h" style="width:17%">참가 구분</td><td class="c" style="width:33%">☑ 개인 &nbsp; □ 팀(&nbsp;&nbsp;&nbsp; 명)</td><td class="h" style="width:17%">팀명</td><td class="c">-</td></tr>
<tr><td class="h">대표자 성명</td><td class="c">{m['name']}</td><td class="h">생년월일</td><td class="c">{m['birth']}</td></tr>
<tr><td class="h">소속(학교·직장)</td><td class="c">{m['org']}</td><td class="h">연락처</td><td class="c">{m['phone']}</td></tr>
<tr><td class="h">이메일</td><td class="c">{m['email']}</td><td class="h">팀원 성명·소속</td><td class="c">-</td></tr>
</table>
<h2>2. 제안 내용 &nbsp;※ 성명·학교 등 개인정보를 적지 마세요(블라인드 심사)</h2>
<table class="f p">
<tr><td class="h">세부 주제</td><td class="chk">
<div><span style="display:inline-block;width:48%">{tb(0)}</span><span>{tb(1)}</span></div>
<div><span style="display:inline-block;width:48%">{tb(2)}</span><span>{tb(3)}</span></div>
<div><span>{tb(4)}</span></div></td></tr>
<tr><td class="h">아이디어명</td><td><b>{e(TITLE)}</b></td></tr>
<tr><td class="h">콘텐츠 유형</td><td class="chk"><div><span>{ty(0)}</span><span>{ty(1)}</span><span>{ty(2)}</span></div>
<div><span>{ty(3)}</span><span>{ty(4)}</span><span>□ 기타(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></div></td></tr>
<tr><td class="h">교육 대상</td><td class="chk"><div><span>{ta(0)}</span><span>{ta(1)}</span><span>{ta(2)}</span><span>{ta(3)}</span></div>
<div><span>{ta(4)}</span><span>□ 기타(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></div></td></tr>
<tr><td class="h">기획 배경</td><td>{lines(BACKGROUND)}</td></tr>
<tr><td class="h">핵심 메시지<br>·학습 목표</td><td>{lines(MESSAGE)}</td></tr>
<tr><td class="h">구성안</td><td>{lines(PLAN)}<p class="o small">※ 영수증 실물 시안은 별첨 참고 이미지</p></td></tr>
<tr><td class="h">활용 재정 자료</td><td>{lines(DATA)}</td></tr>
<tr><td class="h">차별성·<br>활용 방안</td><td>{lines(DIFF)}</td></tr>
</table>
<p class="sig-row">위와 같이 「대국민 재정교육 아이디어 공모전」에 응모합니다.</p>
<p class="sig-row">{m['y']}년 &nbsp;&nbsp;{m['m']}월 &nbsp;&nbsp;{m['d']}일 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 제안자(대표) &nbsp;&nbsp; {m['name']} &nbsp;&nbsp;&nbsp;&nbsp; <span class="sw">(서명)<img class="sig" src="{SIG}"></span></p>
"""


CHECKS = [
    ("참가 자격", ["1인(팀) 1건만 제출하였으며, 다른 팀에 중복 참여하지 않았다."]),
    ("제안서 작성", ["지정 양식의 필수 항목(주제·유형·대상·핵심 메시지·구성안 등)을 모두 작성했다.",
                "분량(A4 3쪽 이내)과 제출 파일 형식(HWP 또는 PDF)을 지켰다.",
                "제안 내용(2.)에 성명·학교·소속 등 개인정보를 넣지 않았다."]),
    ("내용·근거", ["활용한 재정 자료의 출처를 적었다.", "특정 정당·정치인·기업의 홍보나 비방이 담기지 않았다."]),
    ("권리·윤리", ["다른 공모전에 제출했거나 이미 공개된 아이디어가 아니다.", "타인의 아이디어·저작물을 무단으로 사용하지 않았다.",
              "생성형 AI를 활용한 경우 활용 내용을 적었다.", "개인정보 수집·이용 및 응모 유의사항에 동의했다."]),
]


def checklist():
    rows = []
    for g, items in CHECKS:
        for i, t in enumerate(items):
            head = f'<td class="h" rowspan="{len(items)}">{g}</td>' if i == 0 else ""
            rows.append(f"<tr>{head}<td>{t}</td><td class='c'>☑</td></tr>")
    return f"""<h2 style="font-size:12pt;margin-top:22px">□ 제출 전 자가점검표</h2>
<table class="f" style="font-size:9.4pt"><tr><td class="h" style="width:16%">구분</td><td class="h">점검 항목</td><td class="h" style="width:9%">확인</td></tr>
{''.join(rows)}</table>"""


def receipt():
    items = "".join(f"<tr><td>{n}</td><td class='r'>{v:,}</td></tr>" for n, _, v in RECEIPT)
    calc = "".join(f"<tr><td>{n}</td><td class='c'>{b}</td><td class='c'>{v:,}원</td></tr>" for n, b, v in RECEIPT)
    return f"""<div class="pb"></div>
<h2 style="font-size:13pt">별첨 &nbsp;참고 이미지 — 「0원 영수증」 시안(1차시 ④에서 나눠 주는 실물)</h2>
<div class="rc-wrap">
<div class="rc">
<div class="c1">0 원 영 수 증</div>
<div style="text-align:center">대한민국 나라살림 · 2026년 예산</div>
<div class="dash"></div>
<div>일시 : 2026.__.__.(하루 24시간)</div>
<div>손님 : 국민 1명(평균 몫)</div>
<div class="dash"></div>
<table><tr><td><b>품목(12대 분야)</b></td><td class="r"><b>금액(원)</b></td></tr>{items}
<tr><td>분야 간 중복 조정</td><td class="r">△{-DUP:,}</td></tr></table>
<div class="dash"></div>
<table class="big"><tr><td>합계</td><td class="r">{TOTAL:,}</td></tr>
<tr><td>받은 금액(내 지갑)</td><td class="r">0</td></tr></table>
<div class="dash"></div>
<table><tr><td>[결제] 세금 등 총수입</td><td class="r">{REVENUE:,}</td></tr>
<tr><td>[결제] 미래 몫(국채 등)</td><td class="r">{FUTURE:,}</td></tr></table>
<div class="dash"></div>
<div>이 수업 45분 몫 ........ 약 1,220원</div>
<div>우리 집(4인) 하루 ...... {TOTAL * 4:,}원</div>
<div class="dash"></div>
<div style="text-align:center">공짜인 줄 알았던 오늘,<br>우리가 함께 낸 값입니다.</div>
<div style="text-align:center;margin-top:6px">가족 확인 서명 : ____________</div>
</div>
<div class="side">
<h3>영수증 숫자는 이렇게 나왔습니다</h3>
<p>분야 확정 예산(조 원) ÷ 주민등록 인구 51,117,378명 ÷ 365일, 원 미만 반올림.</p>
<table><tr><th>12대 분야</th><th>2026 확정(조 원)</th><th>1인·1일</th></tr>{calc}
<tr><td>12대 분야 단순합</td><td class="c">737.1</td><td class="c">39,507원</td></tr>
<tr><td><b>총지출</b></td><td class="c"><b>727.9</b></td><td class="c"><b>{TOTAL:,}원</b></td></tr>
<tr><td>총수입</td><td class="c">675.2</td><td class="c">{REVENUE:,}원</td></tr></table>
<p class="small">출처: 정책브리핑 「2026년 예산 국회 확정」(2025.12.2.) 붙임 ‘12대 분야별 재원 배분’ / 행정안전부 주민등록 인구(2025.12.31.). 분야별 금액은 R&amp;D 등 분야 간 중복 계상이 있어 단순합이 총지출보다 크므로 ‘중복 조정’ 줄로 합계를 맞춤.</p>
<h3 style="margin-top:10px">2차시 ⑥ 학생이 덧붙이는 한 줄(예)</h3>
<p>“열린재정에서 찾은 ○○ 사업 예산 ÷ 이용 인원 = 1회 몫 ____원(추정)”을 영수증 빈칸에 손으로 적어 넣어, 나라살림 숫자를 직접 ‘내 생활 단위’로 바꿔 보게 합니다.</p>
</div></div>"""


def main():
    html = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>대국민 재정교육 아이디어 제안서</title><style>{CSS}</style></head>
<body>{proposal()}{checklist()}{receipt()}</body></html>"""
    src = BUILD / "proposal.html"
    src.write_text(html, encoding="utf-8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={BUILD / 'chrome-prof'}", f"--print-to-pdf={OUT}", src.as_uri()],
                   capture_output=True)
    time.sleep(1)
    print(OUT, OUT.exists())


if __name__ == "__main__":
    main()
