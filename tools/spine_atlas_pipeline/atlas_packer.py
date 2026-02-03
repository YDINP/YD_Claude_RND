#!/usr/bin/env python3
"""
Spine Atlas Packer
==================
분리된 파츠 이미지들을 Spine 호환 Atlas로 패킹

Usage:
    python atlas_packer.py --input ./parts/ --output ./atlas/character.atlas

Requirements:
    pip install pillow rectpack
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple, Optional

try:
    from PIL import Image
except ImportError:
    print("Pillow가 필요합니다: pip install pillow")
    sys.exit(1)

try:
    from rectpack import newPacker, PackingMode, MaxRectsBssf
except ImportError:
    print("rectpack이 필요합니다: pip install rectpack")
    sys.exit(1)


class SpineAtlasPacker:
    """Spine Atlas 패커"""

    # 기본 파츠 순서 (Spine에서의 z-order)
    DEFAULT_PART_ORDER = [
        "effect_back",
        "hair_back",
        "body",
        "arm_left",
        "arm_right",
        "leg_left",
        "leg_right",
        "head",
        "hair_front",
        "eyes",
        "mouth",
        "eyebrows",
        "weapon",
        "effect_front",
    ]

    def __init__(
        self,
        atlas_size: int = 2048,
        padding: int = 2,
        allow_rotation: bool = False,
        power_of_two: bool = True,
    ):
        """
        Args:
            atlas_size: 최대 Atlas 크기
            padding: 파츠 간 여백 (bleeding 방지)
            allow_rotation: 회전 허용 여부
            power_of_two: 2의 제곱수 크기 강제
        """
        self.atlas_size = atlas_size
        self.padding = padding
        self.allow_rotation = allow_rotation
        self.power_of_two = power_of_two

    def load_parts(self, input_dir: str) -> List[Dict]:
        """
        폴더에서 파츠 이미지 로드

        Args:
            input_dir: 파츠 이미지 폴더

        Returns:
            파츠 정보 리스트
        """
        parts = []
        input_path = Path(input_dir)

        if not input_path.exists():
            raise FileNotFoundError(f"폴더를 찾을 수 없습니다: {input_dir}")

        # PNG 파일 검색
        for img_path in input_path.glob("*.png"):
            img = Image.open(img_path)

            # RGBA로 변환 (알파 채널 보장)
            if img.mode != "RGBA":
                img = img.convert("RGBA")

            # Trim (투명 영역 제거)
            bbox = img.getbbox()
            if bbox:
                trimmed = img.crop(bbox)
                offset_x, offset_y = bbox[0], bbox[1]
            else:
                trimmed = img
                offset_x, offset_y = 0, 0

            parts.append({
                "name": img_path.stem,
                "image": trimmed,
                "original_image": img,
                "width": trimmed.width + self.padding * 2,
                "height": trimmed.height + self.padding * 2,
                "orig_width": img.width,
                "orig_height": img.height,
                "offset_x": offset_x,
                "offset_y": offset_y,
                "path": str(img_path),
            })

        # 크기 순으로 정렬 (큰 것 먼저 - 패킹 효율)
        parts.sort(key=lambda p: p["width"] * p["height"], reverse=True)

        print(f"로드된 파츠: {len(parts)}개")
        for p in parts:
            print(f"  - {p['name']}: {p['width']-self.padding*2}x{p['height']-self.padding*2}")

        return parts

    def pack(self, parts: List[Dict]) -> Tuple[Image.Image, List[Dict]]:
        """
        Rectangle Packing 수행

        Args:
            parts: 파츠 정보 리스트

        Returns:
            (Atlas 이미지, 패킹된 Region 정보)
        """
        # Packer 초기화
        packer = newPacker(
            mode=PackingMode.Offline,
            pack_algo=MaxRectsBssf,
            rotation=self.allow_rotation,
        )

        # 파츠 추가
        for part in parts:
            packer.add_rect(part["width"], part["height"], part["name"])

        # Bin 추가 (점점 큰 사이즈 시도)
        sizes = [256, 512, 1024, 2048, 4096]
        for size in sizes:
            if size <= self.atlas_size:
                packer.add_bin(size, size)

        # 패킹 수행
        packer.pack()

        # 결과 확인
        if not packer.rect_list():
            raise RuntimeError("패킹 실패: 파츠가 너무 큽니다")

        # 실제 사용된 크기 계산
        max_x, max_y = 0, 0
        for rect in packer.rect_list():
            bid, x, y, w, h, name = rect
            max_x = max(max_x, x + w)
            max_y = max(max_y, y + h)

        # Power of 2로 올림
        if self.power_of_two:
            atlas_width = self._next_power_of_two(max_x)
            atlas_height = self._next_power_of_two(max_y)
        else:
            atlas_width = max_x
            atlas_height = max_y

        print(f"Atlas 크기: {atlas_width}x{atlas_height}")

        # Atlas 이미지 생성
        atlas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
        regions = []

        # 각 파츠 배치
        for rect in packer.rect_list():
            bid, x, y, w, h, name = rect

            # 해당 파츠 찾기
            part = next((p for p in parts if p["name"] == name), None)
            if not part:
                continue

            # 패딩 고려한 실제 위치
            actual_x = x + self.padding
            actual_y = y + self.padding
            actual_w = w - self.padding * 2
            actual_h = h - self.padding * 2

            # Atlas에 붙이기
            atlas.paste(part["image"], (actual_x, actual_y))

            # Region 정보 저장 (Spine 형식)
            regions.append({
                "name": name,
                "x": actual_x,
                "y": actual_y,
                "width": actual_w,
                "height": actual_h,
                "orig_width": part["orig_width"],
                "orig_height": part["orig_height"],
                "offset_x": part["offset_x"],
                "offset_y": part["offset_y"],
                "rotate": False,
                "index": -1,
            })

        return atlas, regions, atlas_width, atlas_height

    def generate_spine_atlas(
        self,
        image_name: str,
        width: int,
        height: int,
        regions: List[Dict],
    ) -> str:
        """
        Spine Atlas 파일 포맷 생성

        Spine Atlas Format:
        ```
        image.png
        size: 1024,1024
        format: RGBA8888
        filter: Linear,Linear
        repeat: none
        part_name
          rotate: false
          xy: 0, 0
          size: 256, 256
          orig: 256, 256
          offset: 0, 0
          index: -1
        ```
        """
        lines = [
            image_name,
            f"size: {width},{height}",
            "format: RGBA8888",
            "filter: Linear,Linear",
            "repeat: none",
        ]

        # 파츠 순서대로 정렬 (선택적)
        sorted_regions = sorted(
            regions,
            key=lambda r: (
                self.DEFAULT_PART_ORDER.index(r["name"])
                if r["name"] in self.DEFAULT_PART_ORDER
                else 999
            ),
        )

        for region in sorted_regions:
            lines.extend([
                region["name"],
                f"  rotate: {'true' if region['rotate'] else 'false'}",
                f"  xy: {region['x']}, {region['y']}",
                f"  size: {region['width']}, {region['height']}",
                f"  orig: {region['orig_width']}, {region['orig_height']}",
                f"  offset: {region['offset_x']}, {region['offset_y']}",
                f"  index: {region['index']}",
            ])

        return "\n".join(lines)

    def generate_json_atlas(
        self,
        image_name: str,
        width: int,
        height: int,
        regions: List[Dict],
    ) -> str:
        """
        JSON 형식 Atlas 메타데이터 생성
        (TexturePacker 호환)
        """
        frames = {}
        for region in regions:
            frames[region["name"]] = {
                "frame": {
                    "x": region["x"],
                    "y": region["y"],
                    "w": region["width"],
                    "h": region["height"],
                },
                "rotated": region["rotate"],
                "trimmed": True,
                "spriteSourceSize": {
                    "x": region["offset_x"],
                    "y": region["offset_y"],
                    "w": region["width"],
                    "h": region["height"],
                },
                "sourceSize": {
                    "w": region["orig_width"],
                    "h": region["orig_height"],
                },
            }

        atlas_json = {
            "frames": frames,
            "meta": {
                "app": "SpineAtlasPacker",
                "version": "1.0",
                "image": image_name,
                "format": "RGBA8888",
                "size": {"w": width, "h": height},
                "scale": 1,
            },
        }

        return json.dumps(atlas_json, indent=2, ensure_ascii=False)

    def save(
        self,
        atlas: Image.Image,
        regions: List[Dict],
        width: int,
        height: int,
        output_path: str,
        format: str = "spine",
    ):
        """
        Atlas 저장

        Args:
            atlas: Atlas 이미지
            regions: Region 정보
            width: Atlas 너비
            height: Atlas 높이
            output_path: 출력 경로 (.atlas 또는 .json)
            format: 출력 형식 (spine/json)
        """
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)

        # PNG 저장
        png_path = output.with_suffix(".png")
        atlas.save(png_path, "PNG", optimize=True)
        print(f"PNG 저장: {png_path}")

        # Atlas 메타데이터 저장
        if format == "spine":
            atlas_content = self.generate_spine_atlas(
                png_path.name, width, height, regions
            )
            atlas_path = output.with_suffix(".atlas")
        else:
            atlas_content = self.generate_json_atlas(
                png_path.name, width, height, regions
            )
            atlas_path = output.with_suffix(".json")

        with open(atlas_path, "w", encoding="utf-8") as f:
            f.write(atlas_content)
        print(f"Atlas 저장: {atlas_path}")

        return str(atlas_path), str(png_path)

    @staticmethod
    def _next_power_of_two(n: int) -> int:
        """다음 2의 제곱수 반환"""
        p = 1
        while p < n:
            p *= 2
        return p


def main():
    parser = argparse.ArgumentParser(
        description="Spine Atlas Packer - 파츠 이미지를 Spine Atlas로 패킹"
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="파츠 이미지 폴더 경로"
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="출력 Atlas 경로 (.atlas 또는 .json)"
    )
    parser.add_argument(
        "--format", "-f",
        choices=["spine", "json"],
        default="spine",
        help="출력 형식 (기본: spine)"
    )
    parser.add_argument(
        "--size", "-s",
        type=int,
        default=2048,
        help="최대 Atlas 크기 (기본: 2048)"
    )
    parser.add_argument(
        "--padding", "-p",
        type=int,
        default=2,
        help="파츠 간 여백 (기본: 2)"
    )
    parser.add_argument(
        "--rotation",
        action="store_true",
        help="회전 허용"
    )

    args = parser.parse_args()

    # 패커 생성
    packer = SpineAtlasPacker(
        atlas_size=args.size,
        padding=args.padding,
        allow_rotation=args.rotation,
    )

    try:
        # 파츠 로드
        parts = packer.load_parts(args.input)

        if not parts:
            print("파츠 이미지를 찾을 수 없습니다.")
            sys.exit(1)

        # 패킹
        atlas, regions, width, height = packer.pack(parts)

        # 저장
        atlas_path, png_path = packer.save(
            atlas, regions, width, height,
            args.output, args.format
        )

        print("\n완료!")
        print(f"  Atlas: {atlas_path}")
        print(f"  PNG: {png_path}")
        print(f"  파츠 수: {len(regions)}")
        print(f"  크기: {width}x{height}")

    except Exception as e:
        print(f"오류: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
