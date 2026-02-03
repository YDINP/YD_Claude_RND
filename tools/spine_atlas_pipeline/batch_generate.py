#!/usr/bin/env python3
"""
Batch Character Generator
=========================
전체 캐릭터를 배치로 생성하는 스크립트

Usage:
    python batch_generate.py --character arcana --expressions idle,happy,skill
    python batch_generate.py --all  # 전체 캐릭터 생성
"""

import os
import sys
import json
import time
import random
import argparse
import requests
from pathlib import Path
from typing import List, Dict, Optional

# 기본 설정
DEFAULT_COMFYUI_HOST = "http://localhost:8188"
DEFAULT_OUTPUT_DIR = "D:/AI/SpineAtlas/characters"
SCRIPT_DIR = Path(__file__).parent


def load_prompts() -> Dict:
    """캐릭터 프롬프트 로드"""
    prompts_path = SCRIPT_DIR / "character_prompts.json"
    with open(prompts_path, "r", encoding="utf-8") as f:
        return json.load(f)


def check_comfyui(host: str) -> bool:
    """ComfyUI 서버 상태 확인"""
    try:
        response = requests.get(f"{host}/system_stats", timeout=5)
        return response.status_code == 200
    except:
        return False


def queue_prompt(host: str, prompt: Dict, client_id: str = "batch-generator") -> str:
    """ComfyUI에 프롬프트 큐 등록"""
    payload = {
        "prompt": prompt,
        "client_id": client_id
    }
    response = requests.post(f"{host}/prompt", json=payload)
    return response.json().get("prompt_id")


def wait_for_completion(host: str, prompt_id: str, timeout: int = 120) -> bool:
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


def build_generation_prompt(
    character_name: str,
    expression: str,
    prompts: Dict,
    output_filename: str,
    use_rembg: bool = True
) -> Dict:
    """ComfyUI 생성 프롬프트 구축"""
    common = prompts["common"]
    char = prompts["characters"][character_name]
    expr_prompt = prompts["expressions"].get(expression, "")

    positive = f"{common['positive_base']}, {char['positive']}, {expr_prompt}"
    negative = f"{common['negative_base']}, {char.get('negative', '')}"

    # ComfyUI 워크플로우 프롬프트
    workflow = {
        "3": {
            "inputs": {
                "seed": random.randint(0, 2**32 - 1),
                "steps": 30,
                "cfg": 7,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            },
            "class_type": "KSampler"
        },
        "4": {
            "inputs": {
                "ckpt_name": "ponyDiffusionV6XL.safetensors"
            },
            "class_type": "CheckpointLoaderSimple"
        },
        "5": {
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage"
        },
        "6": {
            "inputs": {
                "text": positive,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "7": {
            "inputs": {
                "text": negative,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "8": {
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            },
            "class_type": "VAEDecode"
        }
    }

    if use_rembg:
        # rembg로 배경 제거 (투명 배경 PNG 출력)
        workflow["10"] = {
            "inputs": {
                "image": ["8", 0]
            },
            "class_type": "Image Remove Background (rembg)"
        }
        workflow["9"] = {
            "inputs": {
                "filename_prefix": output_filename,
                "images": ["10", 0]
            },
            "class_type": "SaveImage"
        }
    else:
        workflow["9"] = {
            "inputs": {
                "filename_prefix": output_filename,
                "images": ["8", 0]
            },
            "class_type": "SaveImage"
        }

    return workflow


def generate_character(
    character_name: str,
    expressions: List[str],
    host: str,
    output_dir: str,
    prompts: Dict,
    use_rembg: bool = True
) -> Dict:
    """단일 캐릭터의 모든 표정 생성"""

    results = {
        "character": character_name,
        "expressions": {},
        "errors": []
    }

    char_output_dir = Path(output_dir) / character_name / "full"
    char_output_dir.mkdir(parents=True, exist_ok=True)

    for expr in expressions:
        print(f"  Generating {character_name}_{expr}...")

        output_filename = f"{character_name}_{expr}"
        prompt = build_generation_prompt(
            character_name, expr, prompts, output_filename, use_rembg
        )

        try:
            # 큐에 등록
            prompt_id = queue_prompt(host, prompt)

            if not prompt_id:
                results["errors"].append(f"{expr}: Failed to queue")
                continue

            # 완료 대기
            if wait_for_completion(host, prompt_id, timeout=120):
                results["expressions"][expr] = "success"
                print(f"    [OK] {expr} completed")
            else:
                results["expressions"][expr] = "timeout"
                results["errors"].append(f"{expr}: Timeout")
                print(f"    [FAIL] {expr} timeout")

        except Exception as e:
            results["expressions"][expr] = "error"
            results["errors"].append(f"{expr}: {str(e)}")
            print(f"    [FAIL] {expr} error: {e}")

        # Rate limiting
        time.sleep(2)

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Batch Character Generator for Arcane Collectors"
    )
    parser.add_argument(
        "--character", "-c",
        help="캐릭터 이름 (예: arcana, leonhardt)"
    )
    parser.add_argument(
        "--expressions", "-e",
        default="idle,happy,angry,skill,victory",
        help="생성할 표정 (콤마 구분, 기본: idle,happy,angry,skill,victory)"
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="모든 캐릭터 생성"
    )
    parser.add_argument(
        "--host",
        default=DEFAULT_COMFYUI_HOST,
        help=f"ComfyUI 호스트 (기본: {DEFAULT_COMFYUI_HOST})"
    )
    parser.add_argument(
        "--output", "-o",
        default=DEFAULT_OUTPUT_DIR,
        help=f"출력 디렉토리 (기본: {DEFAULT_OUTPUT_DIR})"
    )
    parser.add_argument(
        "--rarity", "-r",
        choices=["SSR", "SR", "R", "all"],
        default="all",
        help="등급으로 필터링 (기본: all)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 생성 없이 테스트"
    )
    parser.add_argument(
        "--no-rembg",
        action="store_true",
        help="rembg 배경 제거 비활성화"
    )

    args = parser.parse_args()

    # 프롬프트 로드
    prompts = load_prompts()
    characters = prompts["characters"]

    # ComfyUI 연결 확인
    if not args.dry_run:
        print(f"Connecting to ComfyUI at {args.host}...")
        if not check_comfyui(args.host):
            print("Error: ComfyUI is not running!")
            print(f"Please start ComfyUI: python main.py --listen --port 8188")
            sys.exit(1)
        print("  [OK] Connected\n")

    # 표정 리스트
    expressions = [e.strip() for e in args.expressions.split(",")]

    # 캐릭터 리스트 결정
    if args.all:
        # 등급 필터링
        if args.rarity == "all":
            char_list = list(characters.keys())
        else:
            char_list = [
                name for name, data in characters.items()
                if data["rarity"] == args.rarity
            ]
    elif args.character:
        if args.character not in characters:
            print(f"Error: Unknown character '{args.character}'")
            print(f"Available: {', '.join(characters.keys())}")
            sys.exit(1)
        char_list = [args.character]
    else:
        print("Error: Specify --character or --all")
        parser.print_help()
        sys.exit(1)

    # 생성 계획 출력
    total_images = len(char_list) * len(expressions)
    print("=" * 50)
    print("  Batch Generation Plan")
    print("=" * 50)
    print(f"  Characters: {len(char_list)}")
    print(f"  Expressions: {', '.join(expressions)}")
    print(f"  Total Images: {total_images}")
    print(f"  Output: {args.output}")
    print("=" * 50)
    print()

    if args.dry_run:
        print("[DRY RUN] Would generate:")
        for char in char_list:
            for expr in expressions:
                print(f"  - {char}_{expr}.png")
        return

    # 생성 실행
    all_results = []
    start_time = time.time()

    for i, char_name in enumerate(char_list, 1):
        print(f"\n[{i}/{len(char_list)}] {char_name.upper()}")
        print("-" * 30)

        result = generate_character(
            char_name,
            expressions,
            args.host,
            args.output,
            prompts,
            use_rembg=not args.no_rembg
        )
        all_results.append(result)

        # 캐릭터 간 대기
        if i < len(char_list):
            time.sleep(3)

    # 결과 요약
    elapsed = time.time() - start_time
    success_count = sum(
        1 for r in all_results
        for e in r["expressions"].values()
        if e == "success"
    )

    print("\n" + "=" * 50)
    print("  Generation Complete")
    print("=" * 50)
    print(f"  Total Time: {elapsed:.1f}s")
    print(f"  Success: {success_count}/{total_images}")
    print(f"  Output: {args.output}")

    # 에러 출력
    errors = [e for r in all_results for e in r["errors"]]
    if errors:
        print(f"\n  Errors ({len(errors)}):")
        for err in errors[:10]:  # 최대 10개만 표시
            print(f"    - {err}")

    print("=" * 50)


if __name__ == "__main__":
    main()
