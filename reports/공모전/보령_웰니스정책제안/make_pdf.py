"""보령시 웰니스 정책 제안 공모 — 신청서(제1·2쪽)+참고자료 PDF, 개인정보 동의서 PDF.
HTML → Chrome headless --print-to-pdf (전용 --user-data-dir). 서명 이미지는 sign() 으로 겹친다.
서식 문구는 공고문.hwpx 붙임1·2 를 그대로 옮겼다. hwpx 미리보기용 PNG 도 함께 만든다."""
import base64
import html
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from content import ME, TITLE, FIELDS, OVERVIEW, PROBLEMS, PLAN, EFFECTS, ACTIONS, SOURCES

HERE = Path(__file__).parent
BUILD = HERE / "_build"
SIG_PATH = Path(r"C:/Users/parkk/AppData/Local/Temp/claude/0658710aec011c66/a87b3668-3db8-47a1-8103-297eed64a583/scratchpad/kit/sig_1_10.png")
SIG = "data:image/png;base64," + base64.b64encode(SIG_PATH.read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
E = html.escape

BASE_CSS = """
@page { size:A4; margin:14mm 15mm; }
* { -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
body { font-family:'Malgun Gothic',sans-serif; font-size:10pt; color:#111; line-height:1.55; margin:0; }
table { width:100%; border-collapse:collapse; }
.pb { page-break-before:always; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:2px; top:50%; height:44px; transform:translateY(-50%); }
"""


def sign(label="(서명 또는 인)"):
    return f'<span class="sw">{label}<img class="sig" src="{SIG}"></span>'


def paras(lines):
    out = []
    for t in lines:
        cls = ' class="ind"' if t.startswith("   ") else ""
        out.append(f"<p{cls}>{E(t.strip())}</p>")
    return "".join(out)


FORM_CSS = """
.f td { border:1px solid #000; padding:5px 7px; vertical-align:middle; }
.f .l { background:#f2f2f2; text-align:center; font-weight:700; }
.f .c { text-align:center; }
.hd td { border:none; padding:2px 0; }
.ttl { text-align:center; font-size:15pt; font-weight:700; padding:8px 0 !important; }
.f p { margin:2px 0; } .f p.ind { margin-left:14px; }
.small { font-size:8.8pt; color:#333; }
.tag { display:inline-block; border:1px solid #000; padding:1px 10px; font-weight:700; margin-bottom:6px; }
"""


def form_html():
    m = ME
    fields = ["신체적 웰니스", "정신적 웰니스", "사회적 웰니스", "경제적 웰니스", "가치증진 웰니스",
              "기타<br><span class='small'>(환경적, 치유적 웰니스 등)</span>"]
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>공모 신청서</title><style>{BASE_CSS}{FORM_CSS}
.p2 td.k {{ width:15%; }} .p2 .body {{ vertical-align:top; font-size:9.6pt; line-height:1.55; }}
</style></head><body>
<div class="tag">붙임1 &nbsp;공모전 신청서</div>
<table class="hd"><tr><td>[별지 제1호서식]</td><td style="text-align:right"></td></tr></table>
<table class="f">
<tr><td colspan="6" class="ttl">보령시 웰니스 정책 제안 공모 신청서(제3조 관련)</td></tr>
<tr><td colspan="6" style="text-align:right;border-left:none;border-right:none" class="small">(제1쪽)</td></tr>
<tr><td class="l" style="width:11%">제안제목</td><td colspan="5"><b>{E(TITLE)}</b></td></tr>
<tr><td class="l" rowspan="4">제안자</td><td class="l" style="width:13%">성명</td><td style="width:30%">{m['name']}</td><td class="l" style="width:12%">생년월일</td><td colspan="2">{m['birth']}</td></tr>
<tr><td class="l">주소<br>또는<br>소속</td><td>{m['addr']}</td><td class="l">직급(직위)</td><td colspan="2">{m['job']}</td></tr>
<tr><td class="l">기여도(%)</td><td>100</td><td class="l">이메일<br>주소</td><td colspan="2">{m['email']}</td></tr>
<tr><td class="l">전화번호</td><td style="white-space:nowrap">(휴대 전화번호 : {m['phone']})</td><td class="l">팩스번호</td><td colspan="2">-</td></tr>
<tr><td class="l" rowspan="2">공동<br>제안자</td><td class="l">성명</td><td class="l">생년월일</td><td class="l">주소 또는<br>소속․직급(직위)</td><td class="l">직급(직위)</td><td class="l">기여도(%)</td></tr>
<tr><td class="c small">해당 없음</td><td></td><td></td><td></td><td></td></tr>
<tr><td colspan="3">※ 제안과 동일내용으로 표창·상금 수여 및 특허 등 출원·등록 여부</td><td colspan="3" class="c">해당 없음</td></tr>
<tr><td colspan="6" class="c" style="padding:14px 0 6px;border-bottom:none"> 「보령시 제안제도 운영 조례 시행규칙」 제3조제1항에 따라 제안서를 제출합니다.</td></tr>
<tr><td colspan="6" style="text-align:right;border-top:none;border-bottom:none;padding-right:30px">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</td></tr>
<tr><td colspan="6" style="text-align:right;border-top:none;padding:12px 40px 16px 0">제안자 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;&nbsp;{sign()}</td></tr>
<tr><td colspan="6" class="small" style="padding:8px">※ 행정기관의 홈페이지 등 제안자의 신원을 확인할 수 있는 전자적 방법으로 제안서를 제출하는 경우에는 제안자의 서명을 생략할 수 있음</td></tr>
<tr><td class="l">첨부서류</td><td colspan="4"> 1. 제안내용 설명서<br> 2. 예산절감 및 지방세·조세수입 증대액 산출내역서<br> 3. 실시제안의 경우 개선아이디어를 담당업무에 적용한 근거자료<br> 4. 기타 참고자료</td><td class="c" style="width:10%">수수료<br>없 음</td></tr>
</table>
<div class="small" style="text-align:right;margin-top:4px">210mm×297mm[일반용지 70g/㎡(재활용품)]</div>

<div class="pb"></div>
<table class="f p2">
<tr><td colspan="7" style="text-align:right;border:none" class="small">(제2쪽)</td></tr>
<tr><td class="l k">① 제안제목</td><td colspan="6"><b>{E(TITLE)}</b></td></tr>
<tr><td class="l k" rowspan="2">② 제안분야</td>{''.join(f'<td class="c small" style="width:14%">{f}</td>' for f in fields)}</tr>
<tr>{''.join(f'<td class="c" style="height:26px;font-weight:700">{x}</td>' for x in FIELDS)}</tr>
<tr><td class="l k">③ 개요</td><td colspan="6" class="body">{paras(OVERVIEW)}</td></tr>
<tr><td class="l k">④ 현황 및<br>문제점</td><td colspan="6" class="body">{paras(PROBLEMS)}</td></tr>
<tr><td class="l k">⑤ 개선방안<br><span class="small">(개선내용)</span></td><td colspan="6" class="body">{paras(PLAN)}</td></tr>
<tr><td class="l k">⑥ 기대효과<br><span class="small">(개선성과)</span></td><td colspan="6" class="body">{paras(EFFECTS)}</td></tr>
<tr><td class="l k">⑦조치사항</td><td colspan="6">{paras(ACTIONS)}</td></tr>
</table>
<p class="small" style="margin-top:6px">※ 첨부: 기타 참고자료(다음 쪽) — 계절 달력·기존 사업 비교·근거 자료</p>

<div class="pb"></div>
{ref_html()}
</body></html>"""


def calendar_svg():
    # 2025 대천해수욕장 월별 방문객(보령시 관광지별 관광객 현황, 1~4월은 자료 공란)
    vis = {5: 1041009, 6: 2458848, 7: 2544078, 8: 3373272, 9: 922447, 10: 1109322, 11: 872179, 12: 706458}
    x0, w = 110, 46  # 월 칸 시작·폭
    out = ['<svg viewBox="0 0 700 262" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic" font-size="11">',
           '<rect width="700" height="262" fill="#fbfcfd"/>']
    for i in range(12):
        x = x0 + i * w
        out.append(f'<text x="{x + w / 2}" y="16" text-anchor="middle" fill="#444">{i + 1}월</text>')
        out.append(f'<line x1="{x}" y1="22" x2="{x}" y2="262" stroke="#e3e6ea"/>')
    out.append(f'<line x1="{x0 + 12 * w}" y1="22" x2="{x0 + 12 * w}" y2="262" stroke="#e3e6ea"/>')
    # 1) 방문객 막대
    out.append('<text x="8" y="70" font-weight="700" fill="#1d4f73">대천해수욕장</text><text x="8" y="85" fill="#555">방문객(2025)</text>')
    top, base, hmax = 36, 108, 3373272
    for mth, v in vis.items():
        h = (v / hmax) * (base - top)
        x = x0 + (mth - 1) * w + 8
        out.append(f'<rect x="{x}" y="{base - h:.1f}" width="{w - 16}" height="{h:.1f}" fill="#7aa6c6"/>')
        out.append(f'<text x="{x + (w - 16) / 2}" y="{base - h - 3:.1f}" text-anchor="middle" font-size="9.5" fill="#1d4f73">{v / 10000:.0f}만</text>')
    out.append(f'<text x="{x0 + 2 * w}" y="{base - 6}" text-anchor="middle" font-size="9.5" fill="#999">1~4월 자료 공란</text>')
    out.append(f'<line x1="{x0}" y1="{base}" x2="{x0 + 12 * w}" y2="{base}" stroke="#999"/>')

    def band(row_y, m_from, d_from, m_to, d_to, color, label, tc="#fff"):
        xa = x0 + (m_from - 1 + (d_from - 1) / 31) * w
        xb = x0 + (m_to - 1 + d_to / 31) * w
        out.append(f'<rect x="{xa:.1f}" y="{row_y}" width="{xb - xa:.1f}" height="22" rx="4" fill="{color}"/>')
        out.append(f'<text x="{(xa + xb) / 2:.1f}" y="{row_y + 15}" text-anchor="middle" fill="{tc}" font-size="10">{label}</text>')

    # 2) 관광 달력
    out.append('<text x="8" y="140" font-weight="700" fill="#8a4b12">지금의</text><text x="8" y="155" font-weight="700" fill="#8a4b12">웰니스 달력</text>')
    band(122, 6, 25, 8, 31, "#d98b3a", "냉풍욕장 6.25.~8.31.")
    band(148, 7, 24, 8, 9, "#b85c1e", "")
    out.append(f'<text x="{x0 + 7.4 * w + 4}" y="163" fill="#8a4b12" font-size="10">← 머드축제 17일</text>')
    band(122, 10, 3, 10, 26, "#e0a96d", "")
    out.append(f'<text x="{x0 + 10 * w + 3}" y="137" fill="#8a4b12" font-size="9">← 해양치유 프로그램</text>')
    out.append(f'<text x="{x0 + 10 * w + 3}" y="151" fill="#8a4b12" font-size="8.5">(2024.10.3.~26.)</text>')
    # 3) 제안
    out.append('<text x="8" y="205" font-weight="700" fill="#1f6b4a">제안: 주민</text><text x="8" y="220" font-weight="700" fill="#1f6b4a">바다 처방 달력</text>')
    band(196, 1, 1, 3, 31, "#1f6b4a", "시범 2027.1.~3.")
    band(196, 11, 1, 12, 31, "#2f8a63", "확대 시 11~12월")
    out.append(f'<text x="{x0 + 6 * w}" y="245" text-anchor="middle" fill="#555" font-size="10.5">여름엔 관광객, 비수기 평일엔 주민 — 같은 바다·머드·인력이 1년을 채웁니다</text>')
    out.append('</svg>')
    return "".join(out)


def ref_html():
    rows = [
        ("2024 보령시 해양치유 프로그램", "기간 한정(10.3.~26.), 원하는 시민이 찾아와 체험", "외로움·우울 위험 어르신을 찾아 <b>모셔 가고</b>, 12주 <b>반복</b>, 전후 <b>효과 측정</b>"),
        ("경로당 건강교실 등", "강사가 경로당으로 찾아감 — 경로당에 나오는 분이 대상", "경로당에도 안 나오는 분을 대상으로, 실내가 아닌 <b>바다·머드</b>로"),
        ("노인맞춤돌봄 특화서비스", "상담·집단활동", "그 대상자에게 보령 바다·머드를 <b>연계처</b>로 더함(기존 사업 위에 얹음)"),
        ("원산도 해양치유센터(계획)", "시설 건립(2024~2027 계획, 340억 원)", "시설보다 먼저 <b>주민 프로그램과 효과 자료</b>를 확보"),
    ]
    trs = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>" for a, b, c in rows)
    src = "".join(f"<li>{E(t)} <span class='u'>{E(u)}</span></li>" for t, u in SOURCES)
    return f"""<style>
.ref h2 {{ font-size:12.5pt; color:#1f6b4a; border-bottom:2px solid #1f6b4a; padding-bottom:3px; margin:10px 0 6px; }}
.ref .cmp td, .ref .cmp th {{ border:1px solid #cfd8d2; padding:5px 7px; font-size:9.2pt; vertical-align:top; }}
.ref .cmp th {{ background:#e8f3ec; }}
.ref ol {{ margin:4px 0 0 18px; padding:0; font-size:7.9pt; line-height:1.35; color:#333; }}
.ref .u {{ color:#666; word-break:break-all; font-size:7.4pt; }}
.ref .key {{ border:1.5px solid #1f6b4a; border-radius:6px; padding:7px 11px; margin:6px 0; font-size:9.8pt; }}
</style>
<div class="ref">
<div class="tag">첨부 &nbsp;기타 참고자료</div>
<h2>1. 핵심 — 보령 웰니스는 ‘관광 달력’에 묶여 있다</h2>
{calendar_svg()}
<div class="key">웰니스의 효과는 <b>반복</b>에서 나오는데, 보령의 웰니스는 반복하지 않는 관광객(평균 체류 12.7시간, 재방문율 24.6%)에 맞춰 여름 한철·1회 체험으로 짜여 있습니다. 매주 올 수 있는 사람은 주민이고, 그중 가장 필요한 분(고령 비율 주산면 58.7%, 청소면 56.4%)은 스스로 바다에 오기 어렵습니다. 그래서 <b>비수기 평일의 빈 바다·머드·인력</b>을 <b>찾아서 모셔 가는 12주 처방</b>으로 주민에게 돌립니다.</div>
<h2>2. 기존 사업과 무엇이 다른가</h2>
<table class="cmp"><tr><th style="width:24%">기존</th><th style="width:34%">방식</th><th>이 제안</th></tr>{trs}</table>
<h2>3. 근거 자료</h2>
<ol>{src}</ol>
</div>"""


def agree_html():
    m = ME
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>개인정보 수집·이용 동의서</title><style>{BASE_CSS}{FORM_CSS}
.box {{ border:1px solid #000; padding:22px 26px; min-height:232mm; font-size:10.5pt; line-height:1.9; }}
.box h1 {{ text-align:center; font-size:15pt; margin:6px 0 22px; }}
.box p {{ margin:6px 0; }}
</style></head><body>
<div class="tag">붙임2 &nbsp;개인정보 수집·이용 동의서</div>
<div class="box">
<h1>개인정보 수집·이용 동의서 [필수]</h1>
<p>보령시는 「2026년 보령시 웰니스 정책 제안 공모전」과 관련하여 개인정보보호법 제17조, 제18조, 제22조에 의거하여 개인정보 수집 및 이용에 대한 동의서를 받고 있습니다. 개인정보 제공자가 동의한 내용 외에 다른 목적으로는 이용하지 않으며, 정보 주체는 개인정보 처리자에게 열람, 정정, 삭제를 요구할 수 있습니다.</p>
<p style="margin-top:18px">▶ 수집·이용 목적: 「2026년 보령시 웰니스 정책 제안 공모전」 참여</p>
<p>▶ 수집 항목: 성명, 생년월일, 주소, 전화번호, 이메일 주소 등</p>
<p>▶ 보유 및 이용 기간: 수집 및 이용에 관한 동의일로부터 3년</p>
<p>▶ 기타 동의를 거부할 권리</p>
<p style="margin-left:14px">귀하는 개인정보 수집 이용에 동의를 거부할 수 있습니다. 단, 수집·이용에 동의하지 않으시는 경우, 제안 심사 및 결과 안내 시 제한될 수 있습니다.</p>
<p style="margin-top:28px;text-align:center"><b>위와 같이 개인정보를 수집 이용하는 데 동의하십니까? &nbsp;■ 동의 &nbsp;□ 미동의</b></p>
<p style="margin-top:60px;text-align:right;padding-right:20px">{m['y']}년 &nbsp;{m['m']}월 &nbsp;{m['d']}일</p>
<p style="margin-top:16px;text-align:right;padding-right:20px">성명 &nbsp;&nbsp;<b>{m['name']}</b> &nbsp;&nbsp;&nbsp;{sign()}</p>
<p style="margin-top:60px;text-align:center;font-size:14pt;font-weight:700">보령시장 귀하</p>
</div>
</body></html>"""


def chrome(args, src):
    prof = Path(tempfile.mkdtemp(prefix="chrome-prof-", dir=BUILD))
    try:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--hide-scrollbars",
                        f"--user-data-dir={prof}", *args, src.as_uri()], capture_output=True, timeout=120)
        time.sleep(1)
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def pdf(doc, name):
    src = BUILD / (name + ".html")
    src.write_text(doc, encoding="utf-8")
    out = HERE / (name + ".pdf")
    chrome([f"--print-to-pdf={out}"], src)
    print(out, out.exists())
    return src


def preview(src, png):
    chrome([f"--screenshot={png}", "--window-size=794,1123"], src)
    print(png, png.exists())


if __name__ == "__main__":
    BUILD.mkdir(exist_ok=True)
    s1 = pdf(form_html(), "박용진-보령 겨울 바다 처방_제안서")
    s2 = pdf(agree_html(), "박용진-개인정보 수집·이용 동의서")
    preview(s1, BUILD / "prv_prop.png")
    preview(s2, BUILD / "prv_agree.png")
