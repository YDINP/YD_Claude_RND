"""작성양식(붙임1)·동의서(붙임3)·세부설명자료 PDF 생성. 실행: python make_pdf.py"""
import base64, json, re, statistics as st, subprocess, sys, tempfile, time
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from content import *  # noqa

SIG = "data:image/png;base64," + base64.b64encode((HERE / "assets" / "sig_1_10.png").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DATA = json.loads((HERE / "측정자료" / "공공누리집_첫화면_실측_20261104.json").read_text(encoding="utf-8"))

CSS = """
@page { size:A4; margin:14mm 14mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:9.6pt; color:#000; line-height:1.5; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:4px; top:50%; height:44px; transform:translateY(-50%); }
"""


def md(t):
    t = escape(t)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


def block(lines):
    out = []
    for x in lines:
        if isinstance(x, tuple):
            out.append(f'<div class="hh">{md(x[1])}</div>')
        else:
            cls = "sub" if x.startswith(" -") else "item"
            out.append(f'<div class="{cls}">{md(x.strip())}</div>')
    return "".join(out)


def sign(label):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def form_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>작성양식</title><style>{CSS}
.top td {{ border:1px solid #000; padding:6px; }}
.top .tag {{ width:12%; text-align:center; font-weight:700; background:#e7eef7; }}
.top .ttl {{ text-align:center; font-size:15pt; font-weight:700; }}
.f td {{ border:1px solid #000; padding:5px 8px; vertical-align:middle; }}
.f .th {{ background:#eef1f5; font-weight:700; text-align:center; width:12%; }}
.f .th2 {{ background:#f6f7f9; font-weight:700; text-align:center; width:13%; }}
.c {{ vertical-align:top !important; font-size:9.2pt; line-height:1.48; }}
.hh {{ font-weight:700; color:#1c2f5e; margin:3px 0 1px; }}
.item {{ margin:1px 0 1px 0; padding-left:1.1em; text-indent:-1.1em; }}
.sub {{ margin:0 0 1px 1.1em; padding-left:1.1em; text-indent:-1.1em; }}
.src {{ font-size:7.8pt; color:#333; line-height:1.4; }}
</style></head><body>
<table class="top"><tr><td class="tag">붙임1</td><td class="ttl">2026년 NIA 탄소중립 혁신 아이디어 공모전 작성 양식</td></tr></table>
<div style="height:8px"></div>
<table class="f">
<tr><td class="th">구분</td><td colspan="3" style="text-align:center">□ 내부(임직원) &nbsp;&nbsp; ■ 외부(임직원 외 대국민)</td></tr>
<tr><td class="th">소속</td><td style="text-align:center">{m['job']} (개인 참가)</td><td class="th2">성명/직책</td><td style="text-align:center">{m['name']} / 개인</td></tr>
<tr><td class="th">연락처</td><td style="text-align:center">{m['phone']}<br>{m['email']}</td><td class="th2">작성일</td><td style="text-align:center">{m['date']}</td></tr>
</table>
<div style="height:8px"></div>
<table class="f">
<tr><td class="th">제안명</td><td colspan="5" style="font-weight:700;font-size:10.5pt">{md(TITLE)}</td></tr>
<tr><td class="th">제안분야</td><td colspan="2">■ AI·디지털 탄소중립형</td><td>□ 친환경 생활실천형</td><td>□ 자원순환형</td><td>□ 국민참여형</td></tr>
<tr><td class="th" rowspan="5">제안내용</td><td class="th2">제안 배경</td><td colspan="4" class="c">{block(BACKGROUND)}</td></tr>
<tr><td class="th2">제안 목적</td><td colspan="4" class="c">{block(PURPOSE)}</td></tr>
<tr><td class="th2">제안 내용</td><td colspan="4" class="c">{block(MAIN)}</td></tr>
<tr><td class="th2">기대 효과</td><td colspan="4" class="c">{block(EFFECT)}</td></tr>
<tr><td class="th2">기타</td><td colspan="4" class="c">{block(ETC)}<div class="src" style="margin-top:4px"><b>근거</b><br>{'<br>'.join(md(s) for s in SOURCES)}</div></td></tr>
<tr><td class="th">첨부파일</td><td colspan="5" class="c">{block(ATTACH)}</td></tr>
</table>
</body></html>"""


def consent_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>동의서</title><style>{CSS}
body {{ font-size:10.5pt; line-height:1.7; }}
.top td {{ border:1px solid #000; padding:6px; }}
.top .tag {{ width:12%; text-align:center; font-weight:700; background:#e7eef7; }}
.top .ttl {{ text-align:center; font-size:15pt; font-weight:700; }}
h2 {{ text-align:center; font-size:14pt; margin:18px 0 10px; }}
.box {{ border:1px solid #000; padding:10px 14px; margin:8px 0; }}
.box h3 {{ margin:0 0 4px; font-size:11pt; text-align:center; }}
.sigt td {{ border-bottom:1px dotted #000; padding:12px 6px; }}
</style></head><body>
<table class="top"><tr><td class="tag">붙임3</td><td class="ttl">개인정보 수집·이용·제공 동의서</td></tr></table>
<h2>개인정보 수집ㆍ이용ㆍ제공 동의서</h2>
<p>한국지능정보사회진흥원에서는 고객의 개인정보를 중요시하며,「개인정보보호법」제15조, 제17조, 제22조에 따라 아래와 같이 동의를 받고자 합니다.</p>
<p>&nbsp;&nbsp;&nbsp;아래 사항에 대해 충분히 읽어 보신 후, 동의 여부를 체크ㆍ서명하여 주시기 바랍니다.</p>
<div class="box"><h3>개인정보 수집 및 이용에 대한 동의</h3>
<p>귀하께서 제공한 모든 정보는 다음의 목적을 위해 활용되며, 아래 목적 이외의 용도로는 사용되지 않습니다.</p>
<p>○ 개인정보 수집ㆍ이용 목적<br>&nbsp;✓ 2026년 NIA 탄소중립 혁신 아이디어 공모전 운영<br>&nbsp;✓ 수상자 선정 시 상품 배송</p>
<p>○ 수집하는 개인정보 항목<br>&nbsp;✓ (필수) 소속, 직책, 성명, 연락처</p>
<p>○ 개인정보 보유ㆍ이용 기간 : 1년<br>※ 유의 사항 : 귀하께서는 본 안내에 따른 개인정보 수집, 이용에 대해서 동의를 거부하실 권리가 있습니다.다만, 귀하가 개인정보 수집/이용에 동의를 거부하시는 경우에 “2026년 NIA 탄소중립 혁신 아이디어 공모전” 업무 추진에 불이익이 발생할 수 있음을 알려드립니다.</p></div>
<p style="margin-top:14px">위의 동의서 내용을 충분히 숙지하였으며, 개인정보 수집·이용하는 것에 동의하시겠습니까?</p>
<p style="text-align:center;font-size:11.5pt">■ 동의함 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; □ 동의하지 않음</p>
<p style="text-align:center;font-size:11.5pt;margin:16px 0">2026년 &nbsp;11월 &nbsp;4일</p>
<table class="sigt" style="width:78%;margin:0 auto">
<tr><td style="width:32%">본 &nbsp;&nbsp; 인</td><td style="text-align:right">{m['name']} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {sign('(서명 또는 인)')}</td></tr>
<tr><td>보호자(법정대리인)</td><td style="text-align:right;color:#666">해당 없음 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명 또는 인)</td></tr>
</table>
<p style="font-size:9.5pt;margin-top:10px">※ 만 14세 미만의 아동인 경우 반드시 법적 대리인의 동의가 필요합니다.</p>
<p style="text-align:center;font-size:14pt;font-weight:700;margin-top:40px">한국지능정보사회진흥원 귀중</p>
</body></html>"""


def stats():
    ok = [r for r in DATA if not r["err"] and r["n"] >= 20]
    T = sum(r["text_n"] for r in ok); U = sum(r["text_uncompressed"] for r in ok)
    I = sum(r["img_n"] for r in ok); M = sum(r["img_modern"] for r in ok)
    S = sum(r["static_n"] for r in ok); N = sum(r["static_no_cache_day"] for r in ok)
    tb = sorted((r["total_bytes"] / 1e6 for r in ok), reverse=True)
    sv = [(r["text_uncomp_bytes"] * 0.7 + r["img_bytes"] * 0.25) / 1e6 for r in ok]
    return dict(n=len(ok), T=T, U=U, I=I, M=M, S=S, N=N, tb=tb, mean=st.mean(tb), med=st.median(tb),
                sv_med=st.median(sv), big=sum(r["img_over_300k"] for r in ok),
                excl=[r["site"] for r in DATA if r["err"] or r["n"] < 20])


def bars(tb, med):
    w, h, pad = 700, 150, 30
    bw = (w - pad - 10) / len(tb); mx = 40
    out = [f'<svg viewBox="0 0 {w} {h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="10">']
    for v in (0, 10, 20, 30, 40):
        y = h - 20 - v / mx * (h - 40)
        out.append(f'<line x1="{pad}" y1="{y:.1f}" x2="{w-5}" y2="{y:.1f}" stroke="#e3e6ea"/><text x="{pad-4}" y="{y+3:.1f}" text-anchor="end" fill="#666">{v}</text>')
    for i, v in enumerate(tb):
        x = pad + 2 + i * bw; bh = v / mx * (h - 40)
        out.append(f'<rect x="{x:.1f}" y="{h-20-bh:.1f}" width="{bw-3:.1f}" height="{bh:.1f}" fill="#2f5d8a"/>')
    y = h - 20 - med / mx * (h - 40)
    out.append(f'<line x1="{pad}" y1="{y:.1f}" x2="{w-5}" y2="{y:.1f}" stroke="#d9822b" stroke-dasharray="4 3" stroke-width="1.5"/>')
    out.append(f'<text x="{w-8}" y="{y-4:.1f}" text-anchor="end" fill="#d9822b" font-weight="700">중앙값 {med:.1f}MB</text>')
    out.append(f'<text x="{pad}" y="12" fill="#333">첫 화면 전송량(MB) — 누리집 {len(tb)}곳, 큰 순서(기관명 비공개)</text></svg>')
    return "".join(out)


def detail_html():
    s = stats()
    pct = lambda a, b: f"{a / b * 100:.1f}%"
    gb = s["sv_med"] / 1000 * 1e8  # 1억 회 GB
    kwh = gb * 0.114; t = kwh / 1000 * 0.4173
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>세부 설명자료</title><style>{CSS}
:root {{ --b:#1c2f5e; --bl:#eaf0f7; --o:#d9822b; }}
body {{ font-size:9.4pt; line-height:1.5; }}
.hero {{ background:var(--b); color:#fff; padding:13px 18px; border-radius:6px; }}
.hero .k {{ font-size:9pt; opacity:.85; }} .hero h1 {{ font-size:15.5pt; margin:3px 0 2px; line-height:1.35; }}
.hero .s {{ font-size:9.6pt; opacity:.92; }}
h2 {{ font-size:11.8pt; color:var(--b); border-bottom:2px solid var(--b); padding-bottom:2px; margin:13px 0 6px; }}
p {{ margin:3px 0; }} ul {{ margin:2px 0 2px 18px; padding:0; }} li {{ margin:1px 0; }}
.t td, .t th {{ border:1px solid #c9d2dc; padding:5px 7px; vertical-align:top; }}
.t th {{ background:var(--bl); text-align:left; }}
.num {{ text-align:right; white-space:nowrap; font-weight:700; }}
.kpi {{ display:flex; gap:8px; margin:6px 0; }}
.kpi div {{ flex:1; border:1.5px solid var(--b); border-radius:6px; padding:6px 8px; text-align:center; }}
.kpi b {{ display:block; font-size:16pt; color:var(--b); }}
.t4 td:first-child {{ width:30%; }}
.src {{ font-size:7.9pt; color:#444; line-height:1.42; }}
</style></head><body>
<div class="hero"><div class="k">2026 NIA 탄소중립 혁신 아이디어 공모전 · AI·디지털 탄소중립형 · 세부 설명자료 · 제안자 박용진</div>
<h1>아무도 바꾸지 않는 설정이 탄소를 만든다</h1>
<div class="s">전자정부 표준프레임워크 「저탄소 기본값」 — 공공 정보화사업 3곳 중 2곳이 쓰는 기본값을 바꾸면, 그 위의 시스템이 모두 가벼워집니다</div></div>

<h2>1. 실측 — 공공 누리집 {s['n']}곳의 첫 화면 무게</h2>
<div class="kpi">
<div>첫 화면 평균<b>{s['mean']:.1f}MB</b>중앙값 {s['med']:.1f}MB</div>
<div>압축 없이 보낸 텍스트<b>{pct(s['U'], s['T'])}</b>{s['U']:,} / {s['T']:,}개</div>
<div>WebP·AVIF 이미지<b>{pct(s['M'], s['I'])}</b>{s['M']} / {s['I']:,}개</div>
<div>하루 이상 캐시 지정 없음<b>{pct(s['N'], s['S'])}</b>{s['N']:,} / {s['S']:,}개</div>
</div>
{bars(s['tb'], s['med'])}
<table class="t" style="margin-top:4px">
<tr><th style="width:18%">대상</th><td>중앙부처 18곳·광역지자체 17곳·정부 대표 누리집 3곳·기초지자체 2곳, 모두 40곳 중 첫 화면이 정상 측정된 {s['n']}곳(접속 실패 1곳, 요청 20건 미만의 안내용 첫 화면 3곳 제외). 기관명은 공개하지 않고 집계만 제시</td></tr>
<tr><th>방법</th><td>2026.11.4. Chrome 헤드리스(1366×900), 브라우저 캐시 끔(첫 방문), 페이지 로드 후 4초 대기. 응답마다 전송 바이트, <code>content-encoding</code>(압축), <code>cache-control</code>·<code>expires</code>(보관), 이미지 형식을 기록. 1.4KB 미만 텍스트는 압축 판정에서 제외</td></tr>
<tr><th>한계</th><td>첫 방문 한 번의 표본이며, 외부(CDN·광고) 파일도 포함. 표준프레임워크 적용 여부와 무관한 공공 누리집 전반의 현황. 원자료·측정 스크립트는 요청 시 제공</td></tr>
</table>

<h2>2. 원인 — 왜 이런 무게가 남아 있나</h2>
<table class="t">
<tr><th style="width:24%">누가 정하나</th><th>현재</th><th style="width:36%">저탄소 기본값 이후</th></tr>
<tr><td>개발 시작 때 템플릿</td><td>압축·캐시·이미지 변환은 개발자가 따로 켜야 함 → 일정에 쫓기면 그대로 납품</td><td>켜진 상태로 시작. 끄려면 일부러 바꿔야 함</td></tr>
<tr><td>검수</td><td>기능·보안·접근성은 검수하지만 전송량·전력 항목 없음</td><td>「무게 점검표」 한 쪽을 검수표 옆에 첨부</td></tr>
<tr><td>운영</td><td>개발사는 떠나고 운영 중 무게는 아무도 보지 않음</td><td>OpenTelemetry 지표로 요청당 전송량·전력 추정 상시 확인</td></tr>
</table>

<p class="src" style="margin-top:10px"><b>근거 자료</b><br>{'<br>'.join(md(x) for x in SOURCES)}</p>
<h2 class="pb">3. 제안 구조 — 한 번 바꾸면 전국으로</h2>
<svg viewBox="0 0 700 150" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="11.5">
<defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="#1c2f5e"/></marker></defs>
<rect x="5" y="45" width="150" height="60" rx="8" fill="#1c2f5e"/><text x="80" y="70" text-anchor="middle" fill="#fff" font-weight="700">NIA 표준프레임워크</text><text x="80" y="88" text-anchor="middle" fill="#fff" font-size="10">매년 새 버전·정기 패치</text>
<line x1="155" y1="75" x2="205" y2="75" stroke="#1c2f5e" stroke-width="2" marker-end="url(#a)"/>
<rect x="210" y="8" width="190" height="38" rx="6" fill="#eaf0f7" stroke="#1c2f5e"/><text x="305" y="31" text-anchor="middle">① 저탄소 기본값(압축·캐시·WebP)</text>
<rect x="210" y="56" width="190" height="38" rx="6" fill="#eaf0f7" stroke="#1c2f5e"/><text x="305" y="79" text-anchor="middle">② 무게 점검표(개발·검수)</text>
<rect x="210" y="104" width="190" height="38" rx="6" fill="#eaf0f7" stroke="#1c2f5e"/><text x="305" y="127" text-anchor="middle">③ 운영 계측(전송량·kWh)</text>
<line x1="400" y1="75" x2="450" y2="75" stroke="#1c2f5e" stroke-width="2" marker-end="url(#a)"/>
<rect x="455" y="30" width="240" height="90" rx="8" fill="#fff" stroke="#d9822b" stroke-width="2"/>
<text x="575" y="58" text-anchor="middle" font-weight="700" fill="#d9822b">국내 7,200여 공공정보화사업</text>
<text x="575" y="78" text-anchor="middle">조달청 발주 정보화사업 66.1%</text>
<text x="575" y="98" text-anchor="middle">해외 17개국 33개 사업</text>
</svg>
<table class="t">
<tr><th style="width:22%">구성</th><th>내용</th><th style="width:22%">NIA만 할 수 있는 이유</th></tr>
<tr><td><b>① 저탄소 기본값</b></td><td>응답 압축·정적 파일 1년 캐시를 켠 설정 템플릿 / 공통컴포넌트 게시판·첨부 이미지의 WebP 표시용 사본과 가로 폭 상한(원본 보관) / Spring AI·RAG 예제에 같은 질문 응답 캐시·바뀐 문서만 다시 임베딩</td><td>표준프레임워크 실행환경·공통컴포넌트·AI 예제를 NIA가 직접 개발·배포</td></tr>
<tr><td><b>② 무게 점검표</b></td><td>개발환경 플러그인(이클립스·VS Code 확장)이 빌드·테스트 때 첫 화면 전송량, 압축, 이미지 형식·크기, 캐시 4항목을 측정해 한 쪽 결과표 출력 → 검수 때 첨부(권고)</td><td>5.0에서 VS Code 확장을 새로 제공 — 같은 배포 경로 활용</td></tr>
<tr><td><b>③ 운영 계측</b></td><td>OpenTelemetry 기본 지표에 요청당 전송량·처리 시간 추가, 쿠버네티스 예제에 전력 추정 도구(Kepler, CNCF 오픈소스) 대시보드 예시</td><td>5.0에 Kubernetes·OpenTelemetry가 이미 포함</td></tr>
</table>

<h2>4. 감축량 계산 (추정)</h2>
<table class="t t4">
<tr><th style="width:38%">항목</th><th>값과 근거</th></tr>
<tr><td>첫 화면 1회당 줄일 수 있는 전송량</td><td>중앙값 {s['sv_med']:.2f}MB (약 26%) = 압축 안 된 텍스트 × 70%(통상 압축률, 가정) + 이미지 × 25%(WebP, Google 연구 25~34%의 하한)</td></tr>
<tr><td>첫 화면 방문 1억 회당 전송 감소</td><td>{gb/1000:,.0f}TB</td></tr>
<tr><td>데이터센터·통신망 전력</td><td>{gb:,.0f}GB × 0.114kWh/GB(SWD v4 운영 에너지, 이용자 기기 제외) ≈ <b>{kwh/1000:,.1f}MWh</b></td></tr>
<tr><td>온실가스</td><td>{kwh/1000:,.1f}MWh × 0.4173tCO₂eq/MWh(2023 전력배출계수) ≈ <b>{t:,.1f}tCO₂eq</b> — 이용자 기기 전력(0.080kWh/GB)까지 넣으면 약 {gb*0.194/1000*0.4173:,.1f}tCO₂eq</td></tr>
<tr><td>캐시·AI 응답 캐시 효과</td><td>재방문 전송과 생성형 AI 호출 감소분은 계산에서 뺌(보수적 추정) — 시범에서 실측</td></tr>
</table>
<p style="margin-top:4px">※ 방문 수 1억 회는 계산 단위이며 실제 공공 누리집 전체 방문 수 추정치가 아님. 1개월 시범에서 NIA 운영 누리집의 실제 방문 수·전후 전송량으로 다시 계산</p>

<h2>5. 첫 달 시범과 성과 지표</h2>
<table class="t">
<tr><th style="width:16%">기간</th><th>할 일</th><th style="width:34%">지표</th></tr>
<tr><td>1개월</td><td>NIA 운영 누리집 1~2곳에 압축·캐시·이미지 설정만 적용(코드 변경 최소) / 공공 누리집 기준선 정리</td><td>첫 화면 전송량 전후(%) · 월 전송량(GB) · 로딩 시간</td></tr>
<tr><td>3~6개월</td><td>표준프레임워크 정기 패치·다음 버전에 ①②③ 반영, 연례 발표회 공개</td><td>기본값 포함 여부 · 점검표 내려받기 수</td></tr>
<tr><td>1년</td><td>적용 사업 무게 점검표 집계, '공공 누리집 평균 무게' 연간 공표</td><td>평균 무게(MB) · 추정 감축량(tCO₂eq)</td></tr>
</table>

</body></html>"""


def pdf(html, name):
    src = HERE / "build" / (name + ".html")
    src.parent.mkdir(exist_ok=True)
    src.write_text(html, encoding="utf-8")
    out = HERE / (name + ".pdf")
    prof = tempfile.mkdtemp(prefix="niapdf_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={prof}", f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
    time.sleep(1)
    print(out, out.exists())


if __name__ == "__main__":
    print(stats()["excl"])
    pdf(form_html(), "붙임1_작성양식_저탄소기본값_박용진")
    pdf(consent_html(), "붙임3_개인정보동의서_박용진")
    pdf(detail_html(), "세부설명자료_저탄소기본값_박용진")
