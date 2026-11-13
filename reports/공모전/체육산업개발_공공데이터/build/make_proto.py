"""시제품 데이터(prototype/data.js) 작성 + 화면 캡처(assets/fig/proto_*.png).
실행: python -I build/make_proto.py  (analysis.py 다음)
"""
import json
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
A = json.load(open(HERE / "analysis.json", encoding="utf-8"))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

data = dict(
    collected="2026.11.8.",
    seat={"KSPO DOME": 15000, "티켓링크 라이브 아레나": 5003, "올림픽홀": 2452, "우리금융아트홀": 1184},
    delay=50, window=15, default_run=120,
    upcoming=A["upcoming"], overlap=A["overlap"],
)
(ROOT / "prototype" / "data.js").write_text("window.EXIT_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
print("data.js", len(A["upcoming"]), "days")


def shot(name, url, w, h):
    prof = tempfile.mkdtemp(prefix="chr_proto_")
    out = ROOT / "assets" / "fig" / f"{name}.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                    f"--window-size={w},{h}", "--force-device-scale-factor=2", "--virtual-time-budget=3000",
                    f"--screenshot={out}", url], capture_output=True, timeout=120)
    print(name, out.exists())


uri = (ROOT / "prototype" / "index.html").as_uri()
shot("proto_audience", uri, 980, 800)
shot("proto_operator", uri + "#op", 980, 560)
