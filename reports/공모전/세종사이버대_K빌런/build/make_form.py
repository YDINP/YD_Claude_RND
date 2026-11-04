"""지원서 원본 서식(hwp) 문구·표 구조 그대로 재현한 PDF 생성."""
import base64, json, subprocess, time, html
from pathlib import Path
HERE = Path(__file__).parent; ROOT = HERE.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SIG = "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "sig_1_10.png").read_bytes()).decode()
P = json.load(open(HERE / "prompts_r3.json", encoding="utf-8"))
A2 = next(i for i in P["images"] if i["id"] == "A2")["en"]
e = html.escape

INTRO = """<p><b>원전:</b> 전래동화 「해와 달이 된 오누이」의 호랑이. 이 호랑이는 어머니를 한 번에 잡아먹지 않았습니다. 고개를 하나 넘을 때마다 “떡 하나 주면 안 잡아먹지” 하며 떡을 하나씩 받아 갔고, 떡이 다 떨어지자 어머니를 삼켰습니다.</p>
<p><b>재해석:</b> 21세기 서울에 상륙한 이 호랑이는 밤마다 휴대전화 화면 너머에서 말합니다. <b>“한 편만 더 보면 안 잡아먹지.”</b> 퇴근길 달동네 계단을 오르는 직장인은 화면만 보느라 호랑이를 보지 못하고, 계단참마다 앉은 호랑이에게 떡(잠·시간·내일 아침)을 하나씩 내줍니다. 호랑이 곁의 떡 더미는 고개를 오를수록 높아지고, 그녀의 가방에는 마지막 한 개만 남았습니다.</p>
<p><b>왜 이 빌런인가:</b> 도깨비·구미호처럼 무섭게 생긴 괴물이 아니라, 후드티를 입고 능청스럽게 웃으며 ‘딱 하나만’ 달라고 손바닥을 내미는 존재가 오늘 서울에서 가장 많은 것을 빼앗아 가는 빌런이라고 보았습니다. 옛이야기의 ‘고개마다 하나씩’이라는 구조가 지금의 ‘한 편만 더’와 똑같이 겹친다는 점이 작품의 핵심입니다.</p>
<p><b>표현:</b> 민화 호랑이 특유의 둥근 눈과 익살스러운 이빨을 살리고, 수작업 리소그래프 인쇄처럼 별색 네 가지(형광 주황·남색·겨자색·먹색)와 망점·판 어긋남·종이 결을 썼습니다. 멀리 갈수록 작아지는 세 마리 호랑이는 세 개의 고개이고, 빈 손바닥은 ‘아직 더 달라’는 요구입니다. 포스터 문구는 이미지 생성 뒤 따로 얹었습니다.</p>"""

TOOLS = f"""<p><b>이미지 생성:</b> OpenAI ChatGPT 이미지 생성 기능(gpt-image, Codex CLI 내장 image_gen 도구). 시안 7장을 만든 뒤 1장 선택(3차 생성물).</p>
<p><b>후반 작업:</b> Python Pillow로 3:4 크롭·1800×2400px 확대, 한글 문구 합성(글꼴: 맑은 고딕 Bold/Regular). 이미지 속 그림 자체는 손으로 고치지 않았습니다.</p>
<p><b>기획 보조:</b> 아이디어 정리·영문 프롬프트 초안에 생성형 AI(Claude) 활용, 소재 선택과 최종 판단은 본인.</p>
<p><b>최종 프롬프트(영문 원문):</b></p>
<p class="pr">{e(A2)}</p>
<p class="pr"><b>공통 화풍 지시:</b> {e(P['style'])}</p>
<p><b>합성 문구:</b> “K-빌런의 21세기 서울 상륙 작전 · 「해와 달이 된 오누이」의 호랑이” / “한 편만 더 보면 / 안 잡아먹지” / “호랑이는 한 번에 잡아먹지 않는다. 고개마다 하나씩 받아 갈 뿐.”</p>"""

ETC = """<p>· 특정 작가 화풍·기존 캐릭터·상표·실존 인물을 지시하지 않았고, 프롬프트에 “특정 작가 화풍 금지”를 명시했습니다. 호랑이는 저작권이 없는 전통 민화 양식을 참고한 오리지널 디자인입니다.</p>
<p>· 제출 파일: AI이미지_한편만더보면안잡아먹지_박용진.png (1800×2400px, 3:4, 300dpi, PNG). 고해상도 원본·생성 기록 요청 시 제출 가능합니다.</p>"""

CSS = """@page{size:A4;margin:15mm 15mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Malgun Gothic',sans-serif;font-size:9.6pt;line-height:1.55;color:#111;margin:0}
h1{text-align:center;font-size:17pt;margin:4px 0 14px;letter-spacing:1px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}td{border:1px solid #000;padding:6px 8px;vertical-align:middle}
.h{background:#e9e9e9;font-weight:700;text-align:center}.c{text-align:center}
.t2 td{vertical-align:top}.t2 .h{vertical-align:middle}
p{margin:0 0 5px}.pr{font-size:7.6pt;line-height:1.45;color:#222;word-break:normal;overflow-wrap:break-word}
.sw{position:relative;display:inline-block}.sig{position:absolute;left:-4px;top:50%;height:40px;transform:translateY(-50%)}
.foot{text-align:right;margin-top:14px;padding-right:46px;font-size:10.5pt}"""

def page():
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지원서</title><style>{CSS}</style></head><body>
<h1>2026년 세종사이버대학교 AI창작 공모전</h1>
<table><colgroup><col style="width:16%"><col style="width:39%"><col style="width:45%"></colgroup>
<tr><td class="h" rowspan="5">인적 사항</td><td class="h">이름</td><td class="h">핸드폰</td></tr>
<tr><td class="c">박용진</td><td class="c">010-2576-9278</td></tr>
<tr><td class="h">이메일</td><td class="h">재학 여부</td></tr>
<tr><td class="c">parkkb10@gmail.com</td><td class="c">미재학 (일반인)</td></tr>
<tr><td class="h">개인정보 이용 동의</td><td class="c">동의 &nbsp;■ &nbsp;&nbsp; 미동의 &nbsp;□</td></tr>
</table>
<table class="t2"><colgroup><col style="width:16%"><col style="width:66%"><col style="width:18%"></colgroup>
<tr><td class="h">구분</td><td class="h">공모전 개요</td><td class="h">비고</td></tr>
<tr><td class="h">공모전 명</td><td>AI 창작 공모전, “K-빌런의 21세기 서울 상륙 작전”<br>: 한국 고전 설화 또는 전래동화 캐릭터의 재해석</td><td></td></tr>
<tr><td class="h">공모 분야</td><td><b>AI 포스터 이미지</b></td><td style="font-size:8.5pt">AI 포스터 이미지, AI 영상, AI 컷툰(인스타툰) 중 1택</td></tr>
<tr><td class="h">작품 제목</td><td><b>한 편만 더 보면 안 잡아먹지</b></td><td></td></tr>
<tr><td class="h">AI 창작물 소개 및 설명</td><td>{INTRO}</td><td style="font-size:8.5pt">원전: 「해와 달이 된 오누이」</td></tr>
<tr><td class="h">사용 AI 및 프롬프트</td><td>{TOOLS}</td><td style="font-size:8.5pt">전체 생성 기록 보관</td></tr>
<tr><td class="h">기타</td><td>{ETC}</td><td></td></tr>
</table>
<div class="foot">2026. 11. 4. &nbsp;&nbsp; 지원자 &nbsp;<b>박용진</b> &nbsp;<span class="sw">(서명)<img class="sig" src="{SIG}"></span></div>
</body></html>"""

src = HERE / "지원서.html"; src.write_text(page(), encoding="utf-8")
out = ROOT / "지원서_AI이미지_한편만더보면안잡아먹지_박용진.pdf"
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--user-data-dir={HERE / 'prof'}",
                f"--print-to-pdf={out}", src.as_uri()], capture_output=True)
time.sleep(1); print(out.exists())
