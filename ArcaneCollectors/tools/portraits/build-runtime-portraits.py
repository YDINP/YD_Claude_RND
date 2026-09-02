#!/usr/bin/env python
"""
build-runtime-portraits.py — 런타임 포트레이트 빌드 (T-29)

무엇을 하는가
  1) 원본 PNG 를 public/assets/characters/portraits@2x/ 로 모은다 (최초 1회 이동).
  2) 원본에서 런타임용 WebP 를 public/assets/characters/portraits/ 로 굽는다.
     - 긴 변 512 상한. 512 이하 원본은 업스케일하지 않는다.
     - quality 82, method 6.

왜 필요한가
  포트레이트 38장이 전부 1024 PNG(장당 약 1.4MB)라 첫 로드에 48MB 가 블로킹으로 내려온다.
  512 WebP 로 바꾸면 총량이 한 자릿수 MB 로 떨어지고, 영웅 상세의 큰 표시에만
  portraits@2x/ 의 원본 PNG 를 지연 로드한다.

멱등성
  재실행하면 portraits@2x/ 를 원본으로 삼아 WebP 만 다시 굽는다.
  원본은 저장소에 정확히 1벌, 런타임본이 1벌. 같은 이미지가 3벌 이상 남지 않는다.

실행
  python tools/portraits/build-runtime-portraits.py [--quality 82] [--max-edge 512] [--dry-run]
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow 가 필요합니다: pip install Pillow")

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_DIR = ROOT / "public" / "assets" / "characters" / "portraits"
SOURCE_DIR = ROOT / "public" / "assets" / "characters" / "portraits@2x"


def human(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB"


def collect_sources(dry_run: bool) -> list[Path]:
    """원본 PNG 를 portraits@2x/ 로 모으고 목록을 돌려준다."""
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)

    moved = 0
    for png in sorted(RUNTIME_DIR.glob("*.png")):
        target = SOURCE_DIR / png.name
        if target.exists():
            # 이미 옮겨진 원본이 있다. 런타임 폴더의 PNG 는 중복이므로 제거한다.
            if not dry_run:
                png.unlink()
            continue
        if not dry_run:
            shutil.move(str(png), str(target))
        moved += 1

    if moved:
        print(f"  원본 {moved}장을 portraits@2x/ 로 이동")

    return sorted(SOURCE_DIR.glob("*.png"))


def build(sources: list[Path], max_edge: int, quality: int, dry_run: bool) -> tuple[int, int]:
    src_bytes = 0
    out_bytes = 0

    for src in sources:
        src_bytes += src.stat().st_size
        out = RUNTIME_DIR / (src.stem + ".webp")

        with Image.open(src) as im:
            im.load()
            w, h = im.size
            longest = max(w, h)

            if longest > max_edge:
                scale = max_edge / longest
                size = (max(1, round(w * scale)), max(1, round(h * scale)))
                resized = im.resize(size, Image.LANCZOS)
            else:
                # 업스케일하지 않는다. 256px 플레이스홀더는 그대로 WebP 로만 바꾼다.
                size = (w, h)
                resized = im.copy()

            if resized.mode not in ("RGB", "RGBA"):
                resized = resized.convert("RGBA" if "A" in resized.getbands() else "RGB")

            if not dry_run:
                resized.save(out, "WEBP", quality=quality, method=6)
            resized.close()

        if not dry_run and out.exists():
            out_bytes += out.stat().st_size
            print(f"  {src.name:>16}  {w}x{h} -> {size[0]}x{size[1]}  "
                  f"{src.stat().st_size / 1024:7.0f} KB -> {out.stat().st_size / 1024:6.0f} KB")

    return src_bytes, out_bytes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-edge", type=int, default=512)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not RUNTIME_DIR.exists():
        sys.exit(f"런타임 디렉터리가 없습니다: {RUNTIME_DIR}")

    print(f"원본  {SOURCE_DIR}")
    print(f"런타임 {RUNTIME_DIR}")
    print(f"설정  긴 변 {args.max_edge}px 상한, WebP q{args.quality}"
          f"{' (dry-run)' if args.dry_run else ''}\n")

    sources = collect_sources(args.dry_run)
    if not sources:
        sys.exit("원본 PNG 를 찾지 못했습니다.")

    src_bytes, out_bytes = build(sources, args.max_edge, args.quality, args.dry_run)

    webps = sorted(RUNTIME_DIR.glob("*.webp"))
    leftover = sorted(RUNTIME_DIR.glob("*.png"))

    print(f"\n원본   {len(sources):3d}장  {human(src_bytes)}")
    print(f"런타임 {len(webps):3d}장  {human(out_bytes)}")
    if src_bytes and out_bytes:
        print(f"절감   {human(src_bytes - out_bytes)}  ({out_bytes / src_bytes * 100:.1f}% 로 축소)")
    if leftover:
        print(f"경고: 런타임 폴더에 PNG {len(leftover)}장이 남아 있습니다.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
