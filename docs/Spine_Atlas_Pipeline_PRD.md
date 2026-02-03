# Spine Atlas Pipeline PRD

> **Version**: 1.0
> **Target**: Arcane Collectors 캐릭터 Spine 애니메이션용 Atlas 생성
> **Style**: 트릭컬 리바이브 SD 치비 (2.5등신)

---

## 목표

Character_prompts_v2.md의 캐릭터들을 **Spine 애니메이션에 활용 가능한 2D Atlas 이미지**로 자동 생성

### 필요 출력물
1. **캐릭터 전신 이미지** (투명 배경)
2. **파츠 분리 이미지** (머리, 몸통, 팔, 다리 등)
3. **Spine Atlas JSON + PNG**
4. **표정 바리에이션** (idle, happy, angry, skill 등)

---

## 아키텍처 개요

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         n8n Orchestration Layer                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐  │
│  │ Trigger │───▶│ ComfyUI API │───▶│ SAM + DINO  │───▶│ Atlas Packer │  │
│  │ (HTTP)  │    │ (Generate)  │    │ (Segment)   │    │ (TexturePkr) │  │
│  └─────────┘    └─────────────┘    └─────────────┘    └──────────────┘  │
│       │               │                  │                   │          │
│       ▼               ▼                  ▼                   ▼          │
│  Character      Full Body PNG      Parts PNGs         Atlas + JSON      │
│  Prompt         (1024x1024)        (각 파츠)           (Spine Ready)     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: ComfyUI 설치 및 설정

### 1.1 ComfyUI 설치

```powershell
# Windows (PowerShell)
cd D:\AI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Python 가상환경 (권장)
python -m venv venv
.\venv\Scripts\Activate.ps1

# 의존성 설치
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# 실행
python main.py --listen 0.0.0.0 --port 8188
```

### 1.2 필수 모델 다운로드

| 모델 | 용도 | 경로 |
|------|------|------|
| **Pony Diffusion V6 XL** | 치비 캐릭터 생성 | `models/checkpoints/` |
| **SAM (Segment Anything)** | 자동 파츠 분리 | `models/sam/` |
| **GroundingDINO** | 텍스트 기반 객체 검출 | `models/grounding-dino/` |

```powershell
# Civitai에서 Pony Diffusion V6 XL 다운로드 후 이동
# https://civitai.com/models/257749/pony-diffusion-v6-xl

# SAM 모델
cd ComfyUI/models
mkdir sam
cd sam
curl -L -o sam_vit_h_4b8939.pth https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth
```

### 1.3 ComfyUI 커스텀 노드 설치

```powershell
cd ComfyUI/custom_nodes

# ComfyUI Manager (필수)
git clone https://github.com/ltdrdata/ComfyUI-Manager.git

# SAM 노드
git clone https://github.com/storyicon/comfyui_segment_anything.git

# GroundingDINO 노드
git clone https://github.com/IDEA-Research/Grounded-Segment-Anything.git

# 배경 제거
git clone https://github.com/Jcd1230/rembg-comfyui-node.git
```

---

## Phase 2: ComfyUI 워크플로우

### 2.1 캐릭터 생성 워크플로우 (`character_gen.json`)

```json
{
  "nodes": [
    {
      "id": 1,
      "type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": "ponyDiffusionV6XL.safetensors"
      }
    },
    {
      "id": 2,
      "type": "CLIPTextEncode",
      "inputs": {
        "text": "{{positive_prompt}}",
        "clip": ["1", 1]
      }
    },
    {
      "id": 3,
      "type": "CLIPTextEncode",
      "inputs": {
        "text": "{{negative_prompt}}",
        "clip": ["1", 1]
      }
    },
    {
      "id": 4,
      "type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["2", 0],
        "negative": ["3", 0],
        "seed": -1,
        "steps": 30,
        "cfg": 7,
        "sampler_name": "dpmpp_2m",
        "scheduler": "karras"
      }
    },
    {
      "id": 5,
      "type": "VAEDecode",
      "inputs": {
        "samples": ["4", 0],
        "vae": ["1", 2]
      }
    },
    {
      "id": 6,
      "type": "ImageRemoveBackground",
      "inputs": {
        "image": ["5", 0]
      }
    },
    {
      "id": 7,
      "type": "SaveImage",
      "inputs": {
        "images": ["6", 0],
        "filename_prefix": "{{character_name}}_{{expression}}"
      }
    }
  ]
}
```

### 2.2 파츠 분리 워크플로우 (`parts_segment.json`)

SAM + GroundingDINO를 활용한 자동 파츠 분리:

```json
{
  "nodes": [
    {
      "id": 1,
      "type": "LoadImage",
      "inputs": {
        "image": "{{input_image}}"
      }
    },
    {
      "id": 2,
      "type": "GroundingDinoModelLoader",
      "inputs": {}
    },
    {
      "id": 3,
      "type": "SAMModelLoader",
      "inputs": {
        "model_name": "sam_vit_h_4b8939.pth"
      }
    },
    {
      "id": 4,
      "type": "GroundingDinoSAMSegment",
      "inputs": {
        "image": ["1", 0],
        "grounding_dino_model": ["2", 0],
        "sam_model": ["3", 0],
        "prompt": "head, body, left arm, right arm, left leg, right leg, hair, weapon, accessory",
        "threshold": 0.3
      }
    },
    {
      "id": 5,
      "type": "MaskToImage",
      "inputs": {
        "mask": ["4", 1]
      }
    },
    {
      "id": 6,
      "type": "SaveImage",
      "inputs": {
        "images": ["5", 0],
        "filename_prefix": "{{character_name}}_parts"
      }
    }
  ]
}
```

---

## Phase 3: n8n 자동화 파이프라인

### 3.1 n8n 설치

```powershell
# Docker로 n8n 설치 (권장)
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n

# 또는 npm으로 설치
npm install n8n -g
n8n start
```

### 3.2 n8n 워크플로우 설계

```yaml
# n8n_character_pipeline.yaml
name: "Character to Spine Atlas"
nodes:

  - name: "HTTP Trigger"
    type: "n8n-nodes-base.webhook"
    parameters:
      httpMethod: "POST"
      path: "generate-character"
      responseMode: "responseNode"

  - name: "Parse Character Data"
    type: "n8n-nodes-base.function"
    parameters:
      functionCode: |
        const characterName = $input.body.character_name;
        const expressions = ['idle', 'happy', 'angry', 'skill', 'victory'];

        // character_prompts_v2.md에서 프롬프트 로드
        const prompts = require('./character_prompts.json');
        const charPrompt = prompts[characterName];

        return expressions.map(expr => ({
          character_name: characterName,
          expression: expr,
          positive_prompt: charPrompt.positive + ', ' + prompts.expressions[expr],
          negative_prompt: charPrompt.negative
        }));

  - name: "Generate Images (ComfyUI)"
    type: "n8n-nodes-base.httpRequest"
    parameters:
      method: "POST"
      url: "http://localhost:8188/prompt"
      body:
        prompt: "={{$json.comfyui_workflow}}"
        client_id: "n8n-pipeline"

  - name: "Wait for Generation"
    type: "n8n-nodes-base.wait"
    parameters:
      amount: 30
      unit: "seconds"

  - name: "Download Generated Image"
    type: "n8n-nodes-base.httpRequest"
    parameters:
      method: "GET"
      url: "http://localhost:8188/view"
      qs:
        filename: "={{$json.output_filename}}"

  - name: "Segment Parts (SAM)"
    type: "n8n-nodes-base.httpRequest"
    parameters:
      method: "POST"
      url: "http://localhost:8188/prompt"
      body:
        prompt: "={{$json.segment_workflow}}"

  - name: "Pack Atlas"
    type: "n8n-nodes-base.executeCommand"
    parameters:
      command: |
        python atlas_packer.py \
          --input ./parts/{{$json.character_name}}/ \
          --output ./atlas/{{$json.character_name}}.atlas \
          --format spine

  - name: "Return Result"
    type: "n8n-nodes-base.respondToWebhook"
    parameters:
      responseBody: |
        {
          "status": "success",
          "character": "{{$json.character_name}}",
          "atlas_url": "/atlas/{{$json.character_name}}.atlas",
          "png_url": "/atlas/{{$json.character_name}}.png"
        }
```

### 3.3 n8n 환경 변수

```env
# .env
COMFYUI_HOST=http://localhost:8188
OUTPUT_DIR=D:/AI/SpineAtlas/output
MODELS_DIR=D:/AI/ComfyUI/models
```

---

## Phase 4: Atlas Packer

### 4.1 Python Atlas Packer 스크립트

```python
# atlas_packer.py
"""
Spine Atlas Packer
- 분리된 파츠 이미지들을 Spine 호환 Atlas로 패킹
"""

import os
import json
from PIL import Image
from rectpack import newPacker
import argparse


def pack_atlas(input_dir: str, output_path: str, atlas_size: int = 2048):
    """
    파츠 이미지들을 하나의 Atlas로 패킹

    Args:
        input_dir: 파츠 이미지 폴더
        output_path: 출력 Atlas 경로 (.atlas)
        atlas_size: Atlas 크기 (기본 2048x2048)
    """
    # 이미지 로드
    parts = []
    for filename in os.listdir(input_dir):
        if filename.endswith(('.png', '.PNG')):
            path = os.path.join(input_dir, filename)
            img = Image.open(path)
            parts.append({
                'name': os.path.splitext(filename)[0],
                'image': img,
                'width': img.width,
                'height': img.height
            })

    # Rectangle Packing
    packer = newPacker(rotation=False)

    for part in parts:
        packer.add_rect(part['width'], part['height'], part['name'])

    packer.add_bin(atlas_size, atlas_size)
    packer.pack()

    # Atlas 이미지 생성
    atlas = Image.new('RGBA', (atlas_size, atlas_size), (0, 0, 0, 0))
    regions = []

    for rect in packer.rect_list():
        bid, x, y, w, h, name = rect

        # 해당 파츠 찾기
        part = next(p for p in parts if p['name'] == name)

        # Atlas에 붙이기
        atlas.paste(part['image'], (x, y))

        # Region 정보 저장
        regions.append({
            'name': name,
            'x': x,
            'y': y,
            'width': w,
            'height': h,
            'rotate': False
        })

    # Atlas PNG 저장
    atlas_png = output_path.replace('.atlas', '.png')
    atlas.save(atlas_png)

    # Spine Atlas 파일 생성
    atlas_content = generate_spine_atlas(
        os.path.basename(atlas_png),
        atlas_size,
        atlas_size,
        regions
    )

    with open(output_path, 'w') as f:
        f.write(atlas_content)

    print(f"Atlas 생성 완료: {output_path}")
    return output_path


def generate_spine_atlas(image_name: str, width: int, height: int, regions: list) -> str:
    """
    Spine Atlas 포맷 문자열 생성

    Spine Atlas 포맷 예시:
    ```
    character.png
    size: 2048,2048
    format: RGBA8888
    filter: Linear,Linear
    repeat: none
    head
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
        "repeat: none"
    ]

    for region in regions:
        lines.extend([
            region['name'],
            f"  rotate: {'true' if region['rotate'] else 'false'}",
            f"  xy: {region['x']}, {region['y']}",
            f"  size: {region['width']}, {region['height']}",
            f"  orig: {region['width']}, {region['height']}",
            f"  offset: 0, 0",
            f"  index: -1"
        ])

    return '\n'.join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Spine Atlas Packer')
    parser.add_argument('--input', required=True, help='Input parts directory')
    parser.add_argument('--output', required=True, help='Output atlas path')
    parser.add_argument('--format', default='spine', help='Output format (spine/json)')
    parser.add_argument('--size', type=int, default=2048, help='Atlas size')

    args = parser.parse_args()
    pack_atlas(args.input, args.output, args.size)
```

### 4.2 의존성 설치

```powershell
pip install pillow rectpack
```

---

## Phase 5: 파츠 분리 가이드

### 5.1 Spine용 표준 파츠 목록

치비 캐릭터 기준 권장 파츠:

| 파츠 | 영문명 | 설명 |
|------|--------|------|
| 머리 | head | 얼굴 포함 |
| 머리카락 (앞) | hair_front | 앞머리 |
| 머리카락 (뒤) | hair_back | 뒷머리 |
| 몸통 | body | 상체 |
| 왼팔 | arm_left | 왼쪽 팔 전체 |
| 오른팔 | arm_right | 오른쪽 팔 전체 |
| 왼다리 | leg_left | 왼쪽 다리 |
| 오른다리 | leg_right | 오른쪽 다리 |
| 눈 | eyes | 눈 (표정용) |
| 입 | mouth | 입 (표정용) |
| 무기/소품 | weapon | 들고 있는 아이템 |
| 이펙트 | effect | 오라, 파티클 등 |

### 5.2 GroundingDINO 프롬프트

```
"chibi character head, chibi body torso, left arm, right arm,
 left leg, right leg, hair bangs, back hair,
 weapon magic staff, floating effect particles"
```

### 5.3 수동 분리 대안 (Photoshop/Figma)

자동 분리가 불만족스러울 경우:

1. **Photoshop** - 레이어로 파츠 분리 후 개별 PNG 내보내기
2. **Figma** - 프레임으로 파츠 분리 후 Export
3. **TexturePacker** - 파츠들을 Atlas로 패킹

---

## Phase 6: 전체 파이프라인 실행

### 6.1 단일 캐릭터 생성

```bash
# 1. ComfyUI 서버 시작
cd D:/AI/ComfyUI
python main.py --listen --port 8188

# 2. n8n 서버 시작
n8n start

# 3. API 호출로 캐릭터 생성
curl -X POST http://localhost:5678/webhook/generate-character \
  -H "Content-Type: application/json" \
  -d '{"character_name": "arcana", "expressions": ["idle", "happy", "skill"]}'
```

### 6.2 배치 생성 (전체 캐릭터)

```python
# batch_generate.py
import requests
import time

CHARACTERS = [
    "arcana", "leonhardt", "selene",  # SSR
    "rose", "kai", "luna", "noir", "aria",  # SR
    "finn", "mira", "theo", "eva", "rex", "ivy", "max"  # R
]

EXPRESSIONS = ["idle", "happy", "angry", "skill", "victory"]

for char in CHARACTERS:
    print(f"Generating {char}...")
    response = requests.post(
        "http://localhost:5678/webhook/generate-character",
        json={
            "character_name": char,
            "expressions": EXPRESSIONS
        }
    )
    print(f"  Result: {response.json()}")
    time.sleep(5)  # Rate limiting
```

---

## 대안: 클라우드 API 사용

로컬 GPU가 없거나 부족한 경우:

### Option A: RunPod + ComfyUI

```bash
# RunPod에서 ComfyUI 템플릿 사용
# https://www.runpod.io/console/gpu-cloud

# API Endpoint 설정 후 n8n에서 연결
COMFYUI_HOST=https://xxx-xxx.runpod.net
```

### Option B: Replicate API

```python
# replicate 사용
import replicate

output = replicate.run(
    "stability-ai/sdxl:xxx",
    input={
        "prompt": "chibi character, ...",
        "negative_prompt": "...",
        "width": 1024,
        "height": 1024
    }
)
```

### Option C: Civitai Generate API

```python
import requests

response = requests.post(
    "https://civitai.com/api/v1/images",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "ponyDiffusionV6XL",
        "prompt": "...",
        "negativePrompt": "...",
        "width": 1024,
        "height": 1024
    }
)
```

---

## 출력 폴더 구조

```
D:/AI/SpineAtlas/
├── characters/
│   ├── arcana/
│   │   ├── full/
│   │   │   ├── arcana_idle.png
│   │   │   ├── arcana_happy.png
│   │   │   └── arcana_skill.png
│   │   ├── parts/
│   │   │   ├── head.png
│   │   │   ├── body.png
│   │   │   ├── arm_left.png
│   │   │   └── ...
│   │   └── atlas/
│   │       ├── arcana.atlas
│   │       └── arcana.png
│   └── leonhardt/
│       └── ...
├── workflows/
│   ├── character_gen.json
│   └── parts_segment.json
└── scripts/
    ├── atlas_packer.py
    └── batch_generate.py
```

---

## 다음 단계

1. **ComfyUI 설치** - 로컬 또는 RunPod
2. **n8n 워크플로우 구축** - HTTP → ComfyUI → SAM → Atlas
3. **테스트 생성** - Arcana 캐릭터로 파일럿 테스트
4. **파츠 분리 튜닝** - SAM 프롬프트 최적화
5. **배치 생성** - 전체 15캐릭터 × 5표정 = 75장

---

**문서 버전**: 1.0
**최종 수정**: 2026-01-31
