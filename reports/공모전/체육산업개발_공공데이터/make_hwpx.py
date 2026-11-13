"""참가신청서·동의서·기획서 HWPX 3개.
공식 양식이 바이너리 HWP라 표 구성·문구를 그대로 옮겨 HWPX 로 새로 짠다(build/docs.py).
실행: python -I make_hwpx.py   (먼저 build/analysis.py → build/make_figs.py → build/make_proto.py)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "build"))
import docs  # noqa: E402

if __name__ == "__main__":
    for k in sys.argv[1:] or ["app", "consent", "plan"]:
        docs.build_hwpx(k)
