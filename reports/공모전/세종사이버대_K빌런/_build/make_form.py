"""세종사이버대 AI창작 공모전 지원서(hwp 양식 재현) → PDF. 실행: python make_form.py"""
import subprocess
from pathlib import Path
HERE = Path(__file__).parent; OUT = HERE.parent / "제출"
TITLE = "엄마 목소리로 문을 두드리는 호랑이"
DESC = ("전래동화 「해와 달이 된 오누이」의 호랑이는 떡을 빼앗고 엄마를 해친 뒤, 엄마 옷을 입고 손에 밀가루를 묻혀 엄마인 척 아이들에게 문을 열라고 합니다. "
        "21세기 서울에 온 호랑이는 밀가루 대신 AI 목소리 복제를 씁니다. 짧은 녹음 몇 초면 엄마 목소리를 흉내 내 “엄마야, 문 좀 열어 봐”, “폰이 고장 나서 그러는데 돈 좀 보내 줘”라고 전화합니다. "
        "포스터는 아파트 현관문 안전고리 너머 복도에 후드티를 입은 호랑이가 밀가루 묻은 손으로 휴대전화를 들고 서 있고, 전화기에서 나온 목소리 파형이 엄마 모습으로 문틈에 스며드는 장면입니다. "
        "옛이야기의 ‘손을 내밀어 봐’ 확인법을 오늘의 ‘전화를 끊고 엄마 번호로 다시 걸어 보기’로 바꿔, 가장 오래된 K-빌런이 가장 새로운 범죄 수법과 똑같다는 점을 보여 주려 했습니다.")
AI = ("이미지 생성: ChatGPT 이미지 생성(OpenAI). 주요 프롬프트 요지: “Vertical 3:4 poster, Seoul apartment corridor at night seen through a door opened on a chain lock; "
      "a Korean folk-tale tiger in a dark hoodie holds a glowing smartphone with a flour-whitened paw; a glowing audio waveform shaped like a mother's silhouette drifts into the door gap; "
      "two children in pajamas inside; minhwa-style tiger, navy and amber palette, no text.” "
      "글자(제목·문구) 배치와 편집은 응모자가 직접 했습니다.")
ME = dict(name="박용진", tel="010-2576-9278", email="parkkb10@gmail.com")
CSS = """<style>@page{size:A4;margin:18mm}body{font-family:'Noto Sans KR','Malgun Gothic';font-size:10.5pt;color:#111}
h1{text-align:center;font-size:17pt;margin:0 0 7mm}table{width:100%;border-collapse:collapse;margin-bottom:6mm}
td,th{border:1px solid #333;padding:2.6mm;vertical-align:middle}th{background:#eef1f6;font-weight:700}
td.l{line-height:1.7}</style>"""
body = f"""<h1>2026년 세종사이버대학교 AI창작 공모전</h1>
<table><tr><th rowspan=5 style="width:22mm">인적<br>사항</th><th>이름</th><th>핸드폰</th></tr>
<tr><td style="text-align:center">{ME['name']}</td><td style="text-align:center">{ME['tel']}</td></tr>
<tr><th>이메일</th><th>재학 여부</th></tr>
<tr><td style="text-align:center">{ME['email']}</td><td style="text-align:center">비재학(일반인, 회사원)</td></tr>
<tr><th>개인정보 이용 동의</th><td style="text-align:center">동의 ■ &nbsp; 미동의 □</td></tr></table>
<table><tr><th style="width:30mm">구분</th><th>공모전 개요</th><th style="width:30mm">비고</th></tr>
<tr><th>공모전 명</th><td>AI 창작 공모전, “K-빌런의 21세기 서울 상륙 작전”<br>: 한국 고전 설화 또는 전래동화 캐릭터의 재해석</td><td></td></tr>
<tr><th>공모 분야</th><td>AI 포스터 이미지</td><td style="font-size:8.5pt">AI 포스터 이미지, AI 영상, AI 컷툰(인스타툰) 중 1택</td></tr>
<tr><th>작품 제목</th><td>{TITLE}</td><td></td></tr>
<tr><th>AI 창작물<br>소개 및 설명</th><td class=l>{DESC}</td><td></td></tr>
<tr><th>사용 AI 및<br>프롬프트</th><td class=l style="font-size:9.5pt">{AI}</td><td></td></tr>
<tr><th>기타</th><td>원작: 전래동화 「해와 달이 된 오누이」(공유 저작물). 특정 작가 화풍·기존 캐릭터·상표를 쓰지 않았습니다.</td><td></td></tr></table>"""
h = HERE / "_지원서.html"; h.write_text(f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body>{body}</body></html>", encoding="utf-8")
pdf = OUT / f"AI포스터이미지_{TITLE}_박용진_지원서.pdf"
subprocess.run([r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf}", h.as_uri()], capture_output=True)
print(pdf.exists())
