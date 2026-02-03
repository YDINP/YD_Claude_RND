#!/usr/bin/env python3
"""
Cloud API Alternatives
======================
로컬 GPU가 없을 경우 사용할 수 있는 클라우드 API 기반 이미지 생성

지원 서비스:
1. Replicate API
2. RunPod (ComfyUI)
3. Civitai Generate API
4. Together AI
5. Stability AI

Usage:
    python cloud_api_alternatives.py --service replicate --character arcana
"""

import os
import json
import time
import base64
import argparse
import requests
from pathlib import Path
from typing import Dict, Optional

SCRIPT_DIR = Path(__file__).parent


def load_prompts() -> Dict:
    """캐릭터 프롬프트 로드"""
    with open(SCRIPT_DIR / "character_prompts.json", "r", encoding="utf-8") as f:
        return json.load(f)


def build_prompt(character_name: str, expression: str, prompts: Dict) -> tuple:
    """프롬프트 구성"""
    common = prompts["common"]
    char = prompts["characters"][character_name]
    expr_prompt = prompts["expressions"].get(expression, "")

    positive = f"{common['positive_base']}, {char['positive']}, {expr_prompt}"
    negative = f"{common['negative_base']}, {char.get('negative', '')}"

    return positive, negative


# =============================================================================
# Replicate API
# =============================================================================

class ReplicateAPI:
    """
    Replicate API를 사용한 이미지 생성

    API Key: https://replicate.com/account/api-tokens
    환경변수: REPLICATE_API_TOKEN
    """

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = api_token or os.environ.get("REPLICATE_API_TOKEN")
        if not self.api_token:
            raise ValueError("REPLICATE_API_TOKEN 환경변수를 설정하세요")

        self.base_url = "https://api.replicate.com/v1"
        self.headers = {
            "Authorization": f"Token {self.api_token}",
            "Content-Type": "application/json"
        }

    def generate(
        self,
        positive_prompt: str,
        negative_prompt: str,
        output_path: str,
        model: str = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"
    ) -> str:
        """이미지 생성"""

        # 모델 실행 요청
        response = requests.post(
            f"{self.base_url}/predictions",
            headers=self.headers,
            json={
                "version": model.split(":")[1] if ":" in model else model,
                "input": {
                    "prompt": positive_prompt,
                    "negative_prompt": negative_prompt,
                    "width": 1024,
                    "height": 1024,
                    "num_inference_steps": 30,
                    "guidance_scale": 7.0,
                    "scheduler": "DPMSolver++",
                }
            }
        )

        if response.status_code != 201:
            raise Exception(f"Failed to create prediction: {response.text}")

        prediction = response.json()
        prediction_id = prediction["id"]

        # 완료 대기
        while True:
            response = requests.get(
                f"{self.base_url}/predictions/{prediction_id}",
                headers=self.headers
            )
            prediction = response.json()

            if prediction["status"] == "succeeded":
                image_url = prediction["output"][0]
                break
            elif prediction["status"] == "failed":
                raise Exception(f"Generation failed: {prediction.get('error')}")

            time.sleep(2)

        # 이미지 다운로드
        img_response = requests.get(image_url)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(img_response.content)

        return output_path


# =============================================================================
# Together AI (SDXL)
# =============================================================================

class TogetherAI:
    """
    Together AI API를 사용한 이미지 생성

    API Key: https://api.together.xyz/settings/api-keys
    환경변수: TOGETHER_API_KEY
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("TOGETHER_API_KEY")
        if not self.api_key:
            raise ValueError("TOGETHER_API_KEY 환경변수를 설정하세요")

        self.base_url = "https://api.together.xyz/v1"

    def generate(
        self,
        positive_prompt: str,
        negative_prompt: str,
        output_path: str,
        model: str = "stabilityai/stable-diffusion-xl-base-1.0"
    ) -> str:
        """이미지 생성"""

        response = requests.post(
            f"{self.base_url}/images/generations",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "prompt": positive_prompt,
                "negative_prompt": negative_prompt,
                "width": 1024,
                "height": 1024,
                "steps": 30,
                "n": 1,
                "response_format": "b64_json"
            }
        )

        if response.status_code != 200:
            raise Exception(f"Generation failed: {response.text}")

        result = response.json()
        image_b64 = result["data"][0]["b64_json"]

        # 이미지 저장
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(image_b64))

        return output_path


# =============================================================================
# Stability AI
# =============================================================================

class StabilityAI:
    """
    Stability AI API를 사용한 이미지 생성

    API Key: https://platform.stability.ai/account/keys
    환경변수: STABILITY_API_KEY
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("STABILITY_API_KEY")
        if not self.api_key:
            raise ValueError("STABILITY_API_KEY 환경변수를 설정하세요")

        self.base_url = "https://api.stability.ai/v1"

    def generate(
        self,
        positive_prompt: str,
        negative_prompt: str,
        output_path: str,
        engine: str = "stable-diffusion-xl-1024-v1-0"
    ) -> str:
        """이미지 생성"""

        response = requests.post(
            f"{self.base_url}/generation/{engine}/text-to-image",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            json={
                "text_prompts": [
                    {"text": positive_prompt, "weight": 1.0},
                    {"text": negative_prompt, "weight": -1.0}
                ],
                "cfg_scale": 7,
                "width": 1024,
                "height": 1024,
                "samples": 1,
                "steps": 30
            }
        )

        if response.status_code != 200:
            raise Exception(f"Generation failed: {response.text}")

        result = response.json()
        image_b64 = result["artifacts"][0]["base64"]

        # 이미지 저장
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(image_b64))

        return output_path


# =============================================================================
# RunPod (ComfyUI Serverless)
# =============================================================================

class RunPodAPI:
    """
    RunPod Serverless API를 사용한 ComfyUI 실행

    API Key: https://www.runpod.io/console/serverless
    환경변수: RUNPOD_API_KEY
    """

    def __init__(self, api_key: Optional[str] = None, endpoint_id: Optional[str] = None):
        self.api_key = api_key or os.environ.get("RUNPOD_API_KEY")
        self.endpoint_id = endpoint_id or os.environ.get("RUNPOD_ENDPOINT_ID")

        if not self.api_key:
            raise ValueError("RUNPOD_API_KEY 환경변수를 설정하세요")
        if not self.endpoint_id:
            raise ValueError("RUNPOD_ENDPOINT_ID 환경변수를 설정하세요")

        self.base_url = f"https://api.runpod.ai/v2/{self.endpoint_id}"

    def generate(
        self,
        positive_prompt: str,
        negative_prompt: str,
        output_path: str
    ) -> str:
        """이미지 생성 (ComfyUI 워크플로우 사용)"""

        # ComfyUI 워크플로우 구성
        workflow = {
            "3": {
                "inputs": {
                    "seed": -1,
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
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
                "class_type": "EmptyLatentImage"
            },
            "6": {
                "inputs": {"text": positive_prompt, "clip": ["4", 1]},
                "class_type": "CLIPTextEncode"
            },
            "7": {
                "inputs": {"text": negative_prompt, "clip": ["4", 1]},
                "class_type": "CLIPTextEncode"
            },
            "8": {
                "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
                "class_type": "VAEDecode"
            },
            "9": {
                "inputs": {"filename_prefix": "output", "images": ["8", 0]},
                "class_type": "SaveImage"
            }
        }

        # RunPod 실행 요청
        response = requests.post(
            f"{self.base_url}/run",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            json={"input": {"workflow": workflow}}
        )

        if response.status_code != 200:
            raise Exception(f"Failed to start job: {response.text}")

        job_id = response.json()["id"]

        # 완료 대기
        while True:
            status_response = requests.get(
                f"{self.base_url}/status/{job_id}",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            status = status_response.json()

            if status["status"] == "COMPLETED":
                # 결과 이미지 URL 가져오기
                image_url = status["output"]["images"][0]
                break
            elif status["status"] == "FAILED":
                raise Exception(f"Job failed: {status.get('error')}")

            time.sleep(3)

        # 이미지 다운로드
        img_response = requests.get(image_url)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(img_response.content)

        return output_path


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Cloud API Character Generator")

    parser.add_argument(
        "--service", "-s",
        choices=["replicate", "together", "stability", "runpod"],
        default="replicate",
        help="사용할 클라우드 서비스"
    )
    parser.add_argument(
        "--character", "-c",
        required=True,
        help="캐릭터 이름"
    )
    parser.add_argument(
        "--expression", "-e",
        default="idle",
        help="표정 (기본: idle)"
    )
    parser.add_argument(
        "--output", "-o",
        default="D:/AI/SpineAtlas/characters",
        help="출력 디렉토리"
    )

    args = parser.parse_args()

    # 프롬프트 로드
    prompts = load_prompts()

    if args.character not in prompts["characters"]:
        print(f"Error: Unknown character '{args.character}'")
        print(f"Available: {', '.join(prompts['characters'].keys())}")
        return

    # 프롬프트 구성
    positive, negative = build_prompt(args.character, args.expression, prompts)

    # 출력 경로
    output_path = f"{args.output}/{args.character}/full/{args.character}_{args.expression}.png"

    print(f"Service: {args.service}")
    print(f"Character: {args.character}")
    print(f"Expression: {args.expression}")
    print(f"Output: {output_path}")
    print()

    # API 초기화 및 생성
    try:
        if args.service == "replicate":
            api = ReplicateAPI()
        elif args.service == "together":
            api = TogetherAI()
        elif args.service == "stability":
            api = StabilityAI()
        elif args.service == "runpod":
            api = RunPodAPI()

        print("Generating...")
        result_path = api.generate(positive, negative, output_path)
        print(f"✓ Saved to: {result_path}")

    except ValueError as e:
        print(f"Error: {e}")
        print("\nAPI Key 설정 방법:")
        print("  Windows: set REPLICATE_API_TOKEN=your_token")
        print("  PowerShell: $env:REPLICATE_API_TOKEN='your_token'")
        print("  Linux/Mac: export REPLICATE_API_TOKEN=your_token")

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
