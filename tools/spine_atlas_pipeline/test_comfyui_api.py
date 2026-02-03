#!/usr/bin/env python3
"""
ComfyUI API 테스트 스크립트
n8n 워크플로우에서 사용하는 ComfyUI API 호출을 직접 테스트
"""

import json
import requests
import random
import time
import sys

COMFYUI_URL = "http://localhost:8188"

def build_workflow(character: str, expression: str, seed: int = None) -> dict:
    """ComfyUI 워크플로우 생성"""
    if seed is None:
        seed = random.randint(0, 2**32 - 1)

    # 캐릭터 프롬프트
    chars = {
        "arcana": "1girl, purple twintails, witch hat, purple dress",
        "leonhardt": "1boy, blonde, knight armor",
        "selene": "1girl, silver hair, archer"
    }

    # 표정 프롬프트
    expr_prompts = {
        "idle": "relaxed pose",
        "happy": "happy smile",
        "skill": "action pose, magic aura"
    }

    base_positive = "score_9, score_8_up, source_anime, masterpiece, chibi, 2.5 head ratio, cute, full body, solid white background, game character, korean gacha style"
    base_negative = "realistic, photorealistic, 3d, lowres, bad anatomy, worst quality, complex background"

    positive = f"{base_positive}, {chars.get(character, chars['arcana'])}, {expr_prompts.get(expression, '')}"
    filename = f"{character}_{expression}"

    return {
        "prompt": {
            "3": {
                "inputs": {
                    "seed": seed,
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
                "inputs": {"ckpt_name": "ponyDiffusionV6XL.safetensors"},
                "class_type": "CheckpointLoaderSimple"
            },
            "5": {
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
                "class_type": "EmptyLatentImage"
            },
            "6": {
                "inputs": {"text": positive, "clip": ["4", 1]},
                "class_type": "CLIPTextEncode"
            },
            "7": {
                "inputs": {"text": base_negative, "clip": ["4", 1]},
                "class_type": "CLIPTextEncode"
            },
            "8": {
                "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
                "class_type": "VAEDecode"
            },
            "10": {
                "inputs": {"image": ["8", 0]},
                "class_type": "Image Remove Background (rembg)"
            },
            "9": {
                "inputs": {"filename_prefix": filename, "images": ["10", 0]},
                "class_type": "SaveImage"
            }
        },
        "client_id": "test_api"
    }


def queue_prompt(workflow: dict) -> dict:
    """ComfyUI에 프롬프트 큐잉"""
    response = requests.post(
        f"{COMFYUI_URL}/prompt",
        json=workflow,
        headers={"Content-Type": "application/json"}
    )
    return response.json()


def get_history(prompt_id: str) -> dict:
    """실행 히스토리 조회"""
    response = requests.get(f"{COMFYUI_URL}/history/{prompt_id}")
    return response.json()


def wait_for_completion(prompt_id: str, timeout: int = 120) -> bool:
    """실행 완료 대기"""
    start = time.time()
    while time.time() - start < timeout:
        history = get_history(prompt_id)
        if prompt_id in history:
            return True
        time.sleep(2)
        print(".", end="", flush=True)
    return False


def main():
    character = sys.argv[1] if len(sys.argv) > 1 else "arcana"
    expression = sys.argv[2] if len(sys.argv) > 2 else "idle"

    print(f"\n=== ComfyUI API 테스트 ===")
    print(f"캐릭터: {character}")
    print(f"표정: {expression}")

    # 워크플로우 생성
    workflow = build_workflow(character, expression)
    print(f"\n프롬프트: {workflow['prompt']['6']['inputs']['text'][:80]}...")

    # 큐잉
    print("\n큐잉 중...")
    try:
        result = queue_prompt(workflow)
        print(f"결과: {json.dumps(result, indent=2)}")

        if "prompt_id" in result:
            prompt_id = result["prompt_id"]
            print(f"\n생성 대기 중 (prompt_id: {prompt_id})")

            if wait_for_completion(prompt_id):
                print("\n\n완료!")
                history = get_history(prompt_id)
                if prompt_id in history:
                    outputs = history[prompt_id].get("outputs", {})
                    print(f"출력: {json.dumps(outputs, indent=2)[:500]}")
            else:
                print("\n\n타임아웃!")
        elif "error" in result:
            print(f"오류: {result['error']}")

    except requests.exceptions.ConnectionError:
        print("오류: ComfyUI에 연결할 수 없습니다. (http://localhost:8188)")
        print("ComfyUI를 먼저 실행하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
