"""작품설명서 서식(docx) 채우기 → docx + pdf"""
import subprocess
from pathlib import Path
import docx
from docx.shared import Mm, RGBColor
HERE = Path(__file__).parent; ROOT = HERE.parent
TITLE = "열린 괄호 — 다음 50년을 인용할 자리"
D1 = ("모든 연구는 앞선 연구를 인용하며 시작합니다. 논문 속 인용 괄호 [ ]는 한 사람의 지식이 다음 연구자에게 건너가는 자리입니다. "
      "연구자와 연구를 50년 동안 이어 준 한국연구재단의 역할을 이 괄호로 표현하고, 그 안에 50을 담았습니다.")
D2 = ("왼쪽 괄호는 1977년 한국과학재단에서 시작해 학술과 과학을 하나로 모은 지난 50년입니다. 닫지 않은 오른쪽 괄호는 아직 쓰이지 않은 "
      "다음 50년의 연구입니다. 재단이 지원한 연구는 끝나지 않고 다음 연구로 이어진다는 비전을 담았습니다.")
D3 = ("남색은 과학과 학술을 아우르는 신뢰, 청록은 새로 자라는 연구를 뜻합니다. 오른쪽 괄호는 아래로 갈수록 투명해지며 미래로 열립니다. "
      "괄호와 숫자만으로 된 단순한 형태라 배지부터 현수막까지 크기와 관계없이 잘 보이고, 흑백으로도 뜻이 같습니다.")
for k, v in (("①", D1), ("②", D2), ("③", D3)): print(k, len(v)); assert len(v) <= 150
d = docx.Document(ROOT / "공고" / "desc_form.docx")
def put(cell, text):
    for p in cell.paragraphs[1:]: p._element.getparent().remove(p._element)
    p = cell.paragraphs[0]
    for r in p.runs[1:]: r._element.getparent().remove(r._element)
    if p.runs: p.runs[0].text = text
    else: p.add_run(text)
    p.runs[0].font.color.rgb = RGBColor(0, 0, 0)
t0 = d.tables[0]
put(t0.rows[1].cells[0], TITLE)
img = t0.rows[1].cells[1]; put(img, "")
img.paragraphs[0].runs[0].add_picture(str(ROOT / "제출" / "엠블럼_열린괄호.png"), width=Mm(70))
for ti, txt in ((1, D1), (2, D2), (3, D3)): put(d.tables[ti].rows[1].cells[0], txt)
out = ROOT / "제출" / f"작품정보및설명서_열린괄호.docx"; d.save(out)
subprocess.run([r"D:/tmp/lo/inst/program/soffice.exe", "-env:UserInstallation=file:///D:/tmp/lo/profile", "--headless", "--convert-to", "pdf", "--outdir", str(out.parent), str(out)], capture_output=True)
print(out.with_suffix(".pdf").exists())
