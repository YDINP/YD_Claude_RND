# 「생성형AI 활용내역 및 제작과정」 양식(form4_ai.hwpx)의 항목 구성을 그대로 따라 PDF용 HTML을 만든다.
import html, json, os
B = r"D:/park/YD_Claude_RND/reports/공모전/서울미래인재_캐릭터/작업"
C = json.load(open(B + "/content.json", encoding="utf-8"))
P = {k: open(B + f"/prompt{k}.txt", encoding="utf-8").read().strip() for k in ["1", "2", "2b", "3"]}
e = html.escape
def pre(s): return f'<pre class="prompt">{e(s)}</pre>'
def fig(src, cap, w="31%"):
    return f'<figure style="width:{w}"><img src="ai_pdf/{src}"><figcaption>{cap}</figcaption></figure>'
CB = lambda on: "☑" if on else "☐"
doc = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>생성형AI 활용내역 - 징검이</title>
<style>
@page {{ size: A4; margin: 16mm 15mm; }}
body {{ font-family: 'Malgun Gothic', sans-serif; font-size: 9.6pt; line-height: 1.55; color:#111; }}
h1 {{ text-align:center; font-size:15pt; margin:0 0 2mm; }} .sub {{ text-align:center; font-size:11pt; font-weight:bold; margin:0 0 3mm; }}
.note {{ text-align:center; color:#555; font-size:8.6pt; margin:0 0 5mm; }}
h2 {{ font-size:11pt; margin:5mm 0 2mm; border-bottom:1.5px solid #333; padding-bottom:1mm; }}
table {{ width:100%; border-collapse:collapse; margin:1mm 0 2mm; }} td, th {{ border:1px solid #999; padding:1.6mm 2.2mm; vertical-align:top; }}
th {{ background:#f0f0f0; font-weight:bold; text-align:center; white-space:nowrap; }}
.guide {{ color:#666; font-size:8.6pt; margin:0 0 1.5mm; }}
pre.prompt {{ white-space:pre-wrap; font-family: Consolas, 'Malgun Gothic', monospace; font-size:7pt; line-height:1.3; background:#f7f7f7; border:1px solid #ddd; padding:2mm; margin:1mm 0 2.5mm; }}
h2.ev + .guide + .log {{ }} .log {{  font-family: Consolas, monospace; font-size:7.4pt; background:#1e1e1e; color:#dcdcdc; padding:2.5mm; white-space:pre-wrap; line-height:1.4; }}
.figs {{ display:flex; flex-wrap:wrap; gap:2mm 2.5mm; justify-content:space-around; align-items:flex-end; }} figure {{ margin:0; }} figure img {{ width:100%; border:1px solid #ccc; display:block; }}
figcaption {{ font-size:7.8pt; color:#333; margin-top:0.8mm; line-height:1.35; }}
.pb {{ break-before: page; }} ul {{ margin:1mm 0 2mm 5mm; padding-left:3mm; }} li {{ margin:0.6mm 0; }}
.box {{ border:1px solid #999; padding:2mm 3mm; }}
</style></head><body>
<h1>서울미래인재재단 캐릭터 공모전</h1>
<p class="sub">생성형AI 활용내역 및 제작과정</p>
<p class="note">사용 도구와 활용 내용, 주요 생성 과정과 최종 작품에 반영한 내용을 적었습니다.</p>

<h2>1. 참가자 정보</h2>
<table><tr><th style="width:18%">성명<br>또는 대표자명</th><td style="width:32%">박용진</td><th style="width:12%">팀명</th><td>해당 없음(개인 참가)</td></tr>
<tr><th>작품명</th><td colspan="3">{e(C['title'])}</td></tr></table>

<h2>2. 사용 도구와 활용 범위</h2>
<table><tr><th style="width:24%">서비스명</th><th style="width:26%">모델명</th><th>사용 목적</th></tr>
<tr><td>OpenAI Codex CLI (v0.165.0)<br>내장 이미지 생성 도구 image_gen</td><td>GPT 이미지 생성 모델<br>(도구 안에서 세부 모델명은 표시되지 않음. 에이전트 모델 gpt-5.6-terra)</td><td>캐릭터 이미지 생성: 기본형 2장, 표정·포즈 시트 3장, 활용 예시 목업 1장. 응용 컷 2종은 채택한 기본형 이미지를 참조 이미지로 넣어 생성</td></tr>
<tr><td>Anthropic Claude Code</td><td>Claude Opus 5.5</td><td>공고문·재단 관련 기사 요약, 컨셉 후보 3개 비교·채점, 이름·스토리·활용 아이디어 문장 초안, 이미지 손질용 Python 스크립트 작성, 신청서 양식 입력 보조</td></tr></table>
<p><b>활용 범위</b>&nbsp; {CB(1)} 아이디어 구상 &nbsp; {CB(1)} 캐릭터 이미지 생성 &nbsp; {CB(0)} 색상 또는 구도 제안 &nbsp; {CB(1)} 이미지 수정 &nbsp; {CB(1)} 설명문 작성 &nbsp; {CB(1)} 기타 ( 공모 자료 조사 요약, 양식 입력 보조 )</p>
<p class="guide">색상(회베이지 돌 + 하늘색 물결 띠)과 구도는 AI에게 제안받지 않고 프롬프트에 직접 지정했습니다. '이미지 수정'은 생성형 AI가 아니라 Claude가 작성한 Python(PIL) 스크립트로 처리한 것이며, 내역은 4항에 적었습니다.</p>

<h2>3. 주요 입력 내용</h2>
<p class="guide">최종 작품에 영향을 준 실제 프롬프트 원문입니다(Codex CLI에 그대로 입력). 실행 형식: <code>codex exec --json -s read-only "&lt;프롬프트&gt;" [-i ref_base.png]</code></p>
<p><b>[Codex] 프롬프트 ① 기본형</b> - 2회 실행, 결과 g01a·g01b</p>{pre(P['1'])}
<p><b>[Codex] 프롬프트 ② 표정·포즈 1차</b> - 참조 이미지: g01a, 결과 g02a(미채택). 아래 ③과 같고 두 곳만 달랐습니다: 몸 비율 고정 문장("IMPORTANT: the body must stay a WIDE, flattened oval … never a tall ball or sphere …")이 없었고, 4번 포즈가 "4. Thinking, one hand on its cheek, eyes looking up, small closed mouth, a tiny water droplet near its head."였습니다.</p>
<p><b>[Codex] 프롬프트 ③ 표정·포즈 2차 (②를 고침)</b> - 참조 이미지: g01a, 2회 실행, 결과 g02b·g02c. 바꾼 부분: 몸 비율 고정 문장 추가, 4번 포즈를 '생각하기'에서 '고마워 인사'로 교체</p>{pre(P['2b'])}
<p><b>[Codex] 프롬프트 ④ 활용 예시</b> - 참조 이미지: g01a, 결과 g03a</p>{pre(P['3'])}
<p><b>[Claude] 문장·기획 관련 주요 입력</b></p>
<div class="box">재단 공고문과 기사(서울장학재단에서 2026년 서울미래인재재단으로 출범, 누적 장학생 21만 명, 석박사·박사후연구원까지 지원 확대, 장학생이 후배를 돕는 선순환을 맡을 '동행팀' 신설 계획)를 바탕으로 "새싹·별·부엉이 같은 상투형을 피해 재단 정체성을 꿰뚫는 캐릭터 후보 3개를 만들고 공고 심사 기준(활용성 30·적합성 25·창의성 25·완성도 20)으로 채점해 하나를 고를 것", "이름이 기존 캐릭터·상표와 겹치는지 검색할 것", "설명 글은 담백하게 쓸 것"을 요청했습니다. 후보는 ① 징검돌(징검이) ② 이어달리기 바통 ③ 나이테였고, ①을 채택했습니다.</div>

<p><b>생성 과정 기록</b></p>
<p class="guide">작업 기록 발췌 (Codex 실행 명령, 세션 ID, 생성 파일 회수 위치)</p>
<div class="log">$ codex exec --json -s read-only "$(cat prompt1.txt)"            # ① 기본형, 2회
  thread.started 01a1e206-7e16-7341-9e13-830482faf1d1  → generated_images/…/exec-3ccb0e14….png  (g01a, 채택)
  thread.started 01a1e206-7e16-7293-bc42-81975e0dc8cb  → generated_images/…/exec-129dff24….png  (g01b)
$ codex exec --json -s read-only "$(cat prompt2.txt)" -i ref_base.png   # ② 표정·포즈 1차
  thread.started 01a1e208-391f-7b13-8944-59b2567f9e22  → exec-4a879cf3….png  (g02a)
$ codex exec --json -s read-only "$(cat prompt3.txt)" -i ref_base.png   # ④ 활용 예시
  thread.started 01a1e208-3933-7542-b045-29f551c6b017  → exec-f39ab4a5….png  (g03a, 채택)
$ codex exec --json -s read-only "$(cat prompt2b.txt)" -i ref_base.png  # ③ 표정·포즈 2차, 2회
  thread.started 01a1e20a-a2a4-79c0-8af1-de00bc18e3cb  → (g02b)
  thread.started 01a1e20a-a2e9-7613-b8d5-5ec432e19155  → (g02c, 채택)
$ python scripts/compose.py   # 배경 정리·배치·글자·띠 색 변주·윤곽선 보정 → 출품 이미지 3장</div>

<h2 class="pb">4. 본인의 선택 및 수정 내용</h2>
<p><b>생성 결과 중 채택한 요소</b></p>
<ul>
<li><b>기본형</b>: 같은 프롬프트로 2장(g01a, g01b)을 생성해 g01a를 골랐습니다. 머리 위 조약돌이 몸보다 한 톤 어두워 따로 읽히고, 물결 띠가 굵어 배지처럼 작게 줄여도 알아볼 수 있어서입니다.</li>
<li><b>표정·포즈</b>: 1차 결과(g02a)는 몸이 공처럼 둥글어져 기본형과 비율이 달랐고 '생각하기' 포즈의 손 모양이 어색해 버렸습니다. 프롬프트를 고쳐 2장(g02b, g02c)을 다시 만들고, 옆으로 넓은 기본형 비율에 더 가까운 g02c를 골랐습니다.</li>
<li><b>활용 예시</b>: g03a 1장을 생성해 채택했습니다. 문진·배지·스티커·바닥 징검다리 네 가지를 한 장에 담았습니다.</li>
</ul>
<p><b>직접 수정한 형태·색상·설정</b> (원본은 그대로 두고 사본에 Python PIL 스크립트로 처리)</p>
<ul>
<li>공통: 테두리와 이어진 흰 배경(밝기 242 이상)을 순백(255)으로 정리했습니다. 캐릭터 안쪽 색은 건드리지 않았습니다.</li>
<li>01 기본형: 캐릭터 영역만 잘라 2400×2400 캔버스 가운데에 다시 배치하고, 이름 「징검이」와 소개 문구 「한 걸음 앞에 놓이는 한강 징검돌」을 맑은 고딕으로 넣었습니다. 생성 단계에서는 글자를 모두 금지해 AI가 만든 글자는 없습니다.</li>
<li>02 표정·포즈: 포즈 시트를 3000px 폭으로 다시 배치하고 포즈 이름 4개(다음 돌 건네기, 잘 건넜어!, 디딤돌 자세, 고마워)를 넣었습니다. 아래쪽 '띠 색 변주' 4종은 AI로 생성한 것이 아니라, 기본형 이미지에서 하늘색 띠 픽셀만 골라 초록·보라·주황으로 바꿔 만들었습니다.</li>
<li>03 활용 예시: 3000px 폭으로 키우고, 3번 스티커 오른손의 끊긴 윤곽선을 호(弧) 모양 선으로 이어 그렸습니다. 항목 번호와 아래 설명 글을 넣었습니다.</li>
<li>설정·문장: 이름, 스토리(물결 띠는 건너간 사람들의 흔적, 머리 위 조약돌은 다음 사람에게 놓아 줄 돌), 세계관, 활용 아이디어는 Claude가 쓴 초안을 응모자가 읽고 고쳐 확정했습니다. 사업별 색 구분 예시(장학·해외 인재·AI 연구·동행·멘토)는 재단 사업을 참고해 정한 예시입니다.</li>
</ul>
<p><b>수정하지 않은 부분</b></p>
<ul><li>캐릭터의 선, 색, 표정은 생성 결과 그대로입니다. 표정 시트 1번·4번 손 윤곽이 조금 거친 부분과 활용 예시 배지의 광택도 손대지 않았습니다.</li></ul>
<p><b>최종 작품에 반영한 부분</b></p>
<table><tr><th>제출 파일</th><th>사용한 생성 결과</th><th>직접 처리</th></tr>
<tr><td>01_징검이_기본형.png</td><td>g01a</td><td>배경 정리, 재배치, 이름·소개 글자 입력</td></tr>
<tr><td>02_징검이_표정포즈_색변주.png</td><td>g02c + g01a</td><td>배경 정리, 재배치, 포즈 이름 입력, 띠 색 3종 변환</td></tr>
<tr><td>03_징검이_활용예시.png</td><td>g03a</td><td>확대, 윤곽선 1곳 보정, 번호·설명 입력</td></tr></table>

<h2 class="pb">1. 증빙1 주요 생성 과정</h2>
<p class="guide">사용 도구: OpenAI Codex CLI 이미지 생성. 위 프롬프트 ①~④로 만든 원본 6장입니다(축소본, 원본은 1254×1254 / 1536×1024).</p>
<div class="figs">
{fig('g01a_기본형후보A.jpg','g01a · 프롬프트① · <b>채택</b> (기본형)', '17%')}
{fig('g01b_기본형후보B.jpg','g01b · 프롬프트① · 미채택', '17%')}
{fig('g02a_표정포즈.jpg','g02a · 프롬프트② · 미채택: 몸이 공처럼 둥글어짐', '30%')}
{fig('g02b_표정포즈.jpg','g02b · 프롬프트③ · 미채택', '30%')}
{fig('g02c_표정포즈.jpg','g02c · 프롬프트③ · <b>채택</b>: 기본형 비율에 가장 가까움', '32%')}
{fig('g03a_굿즈목업.jpg','g03a · 프롬프트④ · <b>채택</b> (활용 예시)', '32%')}
</div>

<h2>2. 증빙2 최종 반영 및 수정 과정</h2>
<p class="guide">왼쪽이 생성 원본, 오른쪽이 제출본입니다. 수정 내용은 4항과 같습니다.</p>
<div class="figs">
{fig('g01a_기본형후보A.jpg','수정 전 g01a', '13%')}
{fig('01_징검이_기본형.jpg','수정 후 01 기본형: 배경 정리, 재배치, 이름·소개 입력', '13%')}
{fig('g02c_표정포즈.jpg','수정 전 g02c', '34%')}
{fig('02_징검이_표정포즈_색변주.jpg','수정 후 02: 포즈 이름, 띠 색 변주(픽셀 색 변환)', '34%')}
{fig('g03a_굿즈목업.jpg','수정 전 g03a', '36%')}
{fig('03_징검이_활용예시.jpg','수정 후 03: 3번 스티커 손 윤곽선 보정, 번호·설명', '36%')}
</div>
</body></html>"""
open(B + "/ai_evidence.html", "w", encoding="utf-8").write(doc)
print("ok")
