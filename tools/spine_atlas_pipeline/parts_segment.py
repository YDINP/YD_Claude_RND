#!/usr/bin/env python3
"""
Parts Segmentation Script
=========================
SAM + GroundingDINO를 사용한 캐릭터 파츠 분리

Usage:
    python parts_segment.py --image arcana_idle.png --output parts/
"""

import os
import sys
import json
import time
import argparse
import requests
from pathlib import Path


DEFAULT_COMFYUI_HOST = "http://localhost:8188"
DEFAULT_INPUT_DIR = "D:/AI/ComfyUI/output"
DEFAULT_OUTPUT_DIR = "D:/AI/SpineAtlas/parts"

# 파츠 검출용 프롬프트 (각 파츠별로 개별 실행)
PARTS_PROMPTS = {
    "head": "chibi character head, round face",
    "body": "chibi body torso, dress, clothing",
    "hair": "hair, twintails, ponytail",
    "weapon": "magic wand, staff, sword, bow, weapon",
    "accessory": "hat, crown, ribbon, accessory"
}


def check_comfyui(host: str) -> bool:
    """ComfyUI 서버 상태 확인"""
    try:
        response = requests.get(f"{host}/system_stats", timeout=5)
        return response.status_code == 200
    except:
        return False


def queue_prompt(host: str, prompt: dict, client_id: str = "parts-segmenter") -> str:
    """ComfyUI에 프롬프트 큐 등록"""
    payload = {
        "prompt": prompt,
        "client_id": client_id
    }
    response = requests.post(f"{host}/prompt", json=payload)
    return response.json().get("prompt_id")


def wait_for_completion(host: str, prompt_id: str, timeout: int = 180) -> bool:
    """생성 완료 대기"""
    start_time = time.time()

    while time.time() - start_time < timeout:
        response = requests.get(f"{host}/history/{prompt_id}")
        if response.status_code == 200:
            history = response.json()
            if prompt_id in history:
                return True
        time.sleep(2)

    return False


def upload_image(host: str, image_path: str) -> dict:
    """이미지를 ComfyUI에 업로드"""
    with open(image_path, 'rb') as f:
        files = {'image': (os.path.basename(image_path), f, 'image/png')}
        response = requests.post(f"{host}/upload/image", files=files)

    if response.status_code == 200:
        return response.json()
    return None


def build_segmentation_workflow(
    image_name: str,
    part_name: str,
    part_prompt: str,
    output_prefix: str
) -> dict:
    """SAM + GroundingDINO 파츠 분리 워크플로우"""

    return {
        # 이미지 로드
        "1": {
            "inputs": {
                "image": image_name,
                "upload": "image"
            },
            "class_type": "LoadImage"
        },
        # SAM 모델 로드
        "2": {
            "inputs": {
                "model_name": "sam_vit_h (2.56GB)"
            },
            "class_type": "SAMModelLoader (segment anything)"
        },
        # GroundingDINO 모델 로드
        "3": {
            "inputs": {
                "model_name": "GroundingDINO_SwinT_OGC (694MB)"
            },
            "class_type": "GroundingDinoModelLoader (segment anything)"
        },
        # 세그먼테이션 실행
        "4": {
            "inputs": {
                "sam_model": ["2", 0],
                "grounding_dino_model": ["3", 0],
                "image": ["1", 0],
                "prompt": part_prompt,
                "threshold": 0.25
            },
            "class_type": "GroundingDinoSAMSegment (segment anything)"
        },
        # 결과 저장
        "5": {
            "inputs": {
                "filename_prefix": f"{output_prefix}_{part_name}",
                "images": ["4", 0]
            },
            "class_type": "SaveImage"
        }
    }


def segment_parts(
    host: str,
    image_path: str,
    output_dir: str,
    parts: list = None
) -> dict:
    """이미지에서 파츠 분리"""

    results = {
        "image": image_path,
        "parts": {},
        "errors": []
    }

    # 사용할 파츠 결정
    if parts is None:
        parts = list(PARTS_PROMPTS.keys())

    # 이미지 업로드
    print(f"Uploading image: {image_path}")
    upload_result = upload_image(host, image_path)

    if not upload_result:
        results["errors"].append("Failed to upload image")
        return results

    image_name = upload_result.get("name", os.path.basename(image_path))
    output_prefix = Path(image_path).stem

    # 출력 디렉토리 생성
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # 각 파츠별로 세그먼테이션 실행
    for part_name in parts:
        if part_name not in PARTS_PROMPTS:
            print(f"  [SKIP] Unknown part: {part_name}")
            continue

        part_prompt = PARTS_PROMPTS[part_name]
        print(f"  Segmenting {part_name}... (prompt: {part_prompt})")

        workflow = build_segmentation_workflow(
            image_name, part_name, part_prompt, output_prefix
        )

        try:
            prompt_id = queue_prompt(host, workflow)

            if not prompt_id:
                results["errors"].append(f"{part_name}: Failed to queue")
                continue

            if wait_for_completion(host, prompt_id, timeout=180):
                results["parts"][part_name] = "success"
                print(f"    [OK] {part_name} completed")
            else:
                results["parts"][part_name] = "timeout"
                results["errors"].append(f"{part_name}: Timeout")
                print(f"    [FAIL] {part_name} timeout")

        except Exception as e:
            results["parts"][part_name] = "error"
            results["errors"].append(f"{part_name}: {str(e)}")
            print(f"    [FAIL] {part_name} error: {e}")

        time.sleep(1)

    return results


def main():
    parser = argparse.ArgumentParser(
        description="SAM + GroundingDINO Parts Segmentation"
    )
    parser.add_argument(
        "--image", "-i",
        required=True,
        help="입력 이미지 경로 또는 파일명"
    )
    parser.add_argument(
        "--output", "-o",
        default=DEFAULT_OUTPUT_DIR,
        help=f"출력 디렉토리 (기본: {DEFAULT_OUTPUT_DIR})"
    )
    parser.add_argument(
        "--host",
        default=DEFAULT_COMFYUI_HOST,
        help=f"ComfyUI 호스트 (기본: {DEFAULT_COMFYUI_HOST})"
    )
    parser.add_argument(
        "--parts", "-p",
        default="head,body,hair,weapon,accessory",
        help="분리할 파츠 (콤마 구분)"
    )
    parser.add_argument(
        "--threshold", "-t",
        type=float,
        default=0.25,
        help="검출 threshold (기본: 0.25)"
    )

    args = parser.parse_args()

    # ComfyUI 연결 확인
    print(f"Connecting to ComfyUI at {args.host}...")
    if not check_comfyui(args.host):
        print("Error: ComfyUI is not running!")
        sys.exit(1)
    print("  [OK] Connected\n")

    # 이미지 경로 확인
    image_path = args.image
    if not os.path.isabs(image_path):
        # 상대 경로면 기본 입력 디렉토리에서 찾기
        possible_path = os.path.join(DEFAULT_INPUT_DIR, image_path)
        if os.path.exists(possible_path):
            image_path = possible_path

    if not os.path.exists(image_path):
        print(f"Error: Image not found: {image_path}")
        sys.exit(1)

    # 파츠 리스트
    parts = [p.strip() for p in args.parts.split(",")]

    print("=" * 50)
    print("  Parts Segmentation")
    print("=" * 50)
    print(f"  Image: {image_path}")
    print(f"  Parts: {', '.join(parts)}")
    print(f"  Output: {args.output}")
    print("=" * 50)
    print()

    # 세그먼테이션 실행
    result = segment_parts(args.host, image_path, args.output, parts)

    # 결과 출력
    print("\n" + "=" * 50)
    print("  Segmentation Complete")
    print("=" * 50)

    success_count = sum(1 for v in result["parts"].values() if v == "success")
    print(f"  Success: {success_count}/{len(parts)}")

    if result["errors"]:
        print(f"\n  Errors ({len(result['errors'])}):")
        for err in result["errors"]:
            print(f"    - {err}")

    print("=" * 50)


if __name__ == "__main__":
    main()
