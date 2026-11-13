"""참가신청서·동의서·기획서 PDF 3개(HWPX 와 같은 블록) + 시제품 zip.
실행: python -I make_pdf.py
"""
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE / "build"))
import docs  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BUILD = HERE / "_build"
BUILD.mkdir(exist_ok=True)


def pdf(kind):
    name = docs.NAMES[kind]
    src = BUILD / f"{name}.html"
    src.write_text(docs.html_doc(kind), encoding="utf-8")
    out = HERE / f"{name}.pdf"
    prof = tempfile.mkdtemp(prefix="chr_pdf_")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--user-data-dir={prof}",
                    "--allow-file-access-from-files", f"--print-to-pdf={out}", src.as_uri()], capture_output=True, timeout=180)
    n = len(re.findall(rb"/Type\s*/Page[^s]", out.read_bytes()))
    print("pdf", out.name, n, "쪽")


def proto_zip():
    out = HERE / "퇴장겹침예보_시제품.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in ("index.html", "data.js"):
            z.write(HERE / "prototype" / f, f"퇴장겹침예보_시제품/{f}")
        z.writestr("퇴장겹침예보_시제품/읽어보기.txt",
                   "index.html 을 크롬·엣지 등 웹 브라우저로 여세요. 설치·인터넷 연결이 필요 없습니다.\r\n"
                   "자료: 한국체육산업개발 올림픽공원 공연정보(2026.11.8. 수집), 올림픽공원 입출차 정보(2024.7).\r\n"
                   "제작: 박용진 (2026년도 공공데이터 활용 경진대회 응모작 「퇴장 겹침 예보」 시제품)\r\n")
    print("zip", out.name, out.stat().st_size)


if __name__ == "__main__":
    for k in sys.argv[1:] or ["app", "consent", "plan"]:
        pdf(k)
    proto_zip()
