# Spine Atlas Pipeline

> Arcane Collectors 캐릭터를 Spine 애니메이션용 2D Atlas로 자동 생성하는 파이프라인

## 개요

이 파이프라인은 AI 이미지 생성 → 파츠 분리 → Atlas 패킹까지의 전체 과정을 자동화합니다.

```
┌──────────────────────────────────────────────────────────────┐
│                    Spine Atlas Pipeline                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [프롬프트] → [ComfyUI/Cloud] → [SAM 분리] → [Atlas 패킹]    │
│                                                              │
│  character_prompts.json                                       │
│       ↓                                                      │
│  Pony Diffusion V6 XL (치비 스타일)                          │
│       ↓                                                      │
│  투명 배경 캐릭터 PNG (1024x1024)                            │
│       ↓                                                      │
│  SAM + GroundingDINO (파츠 자동 분리)                        │
│       ↓                                                      │
│  atlas_packer.py (Spine .atlas + .png)                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 빠른 시작

### 1. 설치

```powershell
# PowerShell에서 실행
cd D:\park\YD_Claude_RND\tools\spine_atlas_pipeline
.\setup.ps1
```

### 2. 모델 다운로드 (수동)

| 모델 | 다운로드 | 저장 경로 |
|------|----------|-----------|
| Pony Diffusion V6 XL | [Civitai](https://civitai.com/models/257749) | `ComfyUI/models/checkpoints/` |
| SAM ViT-H | [Meta](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth) | `ComfyUI/models/sam/` |
| GroundingDINO | [GitHub](https://github.com/IDEA-Research/GroundingDINO/releases) | `ComfyUI/models/grounding-dino/` |

### 3. 이미지 생성

```bash
# ComfyUI 시작
cd D:\AI\ComfyUI
.\venv\Scripts\Activate.ps1
python main.py --listen --port 8188

# 다른 터미널에서 생성 실행
cd D:\park\YD_Claude_RND\tools\spine_atlas_pipeline
python batch_generate.py --character arcana --expressions idle,happy,skill
```

### 4. Atlas 패킹

```bash
python atlas_packer.py --input ./parts/arcana/ --output ./atlas/arcana.atlas
```

## 파일 구조

```
spine_atlas_pipeline/
├── README.md                      # 이 문서
├── setup.ps1                      # Windows 설치 스크립트
├── .env                           # 환경 변수
│
├── character_prompts.json         # 캐릭터별 프롬프트 데이터
├── atlas_packer.py                # Spine Atlas 패커
├── batch_generate.py              # 배치 이미지 생성
├── cloud_api_alternatives.py      # 클라우드 API 대안
│
├── comfyui_workflows/
│   ├── character_generation.json  # 캐릭터 생성 워크플로우
│   └── parts_segmentation.json    # 파츠 분리 워크플로우
│
└── n8n_workflow.json              # n8n 자동화 워크플로우
```

## 사용 방법

### 방법 1: 로컬 ComfyUI (권장)

GPU가 있는 경우 로컬에서 실행:

```bash
# 단일 캐릭터
python batch_generate.py -c arcana -e idle,happy,angry,skill,victory

# 전체 SSR 캐릭터
python batch_generate.py --all --rarity SSR

# 전체 캐릭터
python batch_generate.py --all
```

### 방법 2: 클라우드 API

GPU가 없는 경우 클라우드 API 사용:

```bash
# Replicate API
export REPLICATE_API_TOKEN=your_token
python cloud_api_alternatives.py -s replicate -c arcana

# Together AI
export TOGETHER_API_KEY=your_key
python cloud_api_alternatives.py -s together -c arcana

# Stability AI
export STABILITY_API_KEY=your_key
python cloud_api_alternatives.py -s stability -c arcana
```

### 방법 3: n8n 자동화

1. n8n 설치 및 실행
2. `n8n_workflow.json` 가져오기
3. HTTP 엔드포인트로 요청:

```bash
curl -X POST http://localhost:5678/webhook/generate-character \
  -H "Content-Type: application/json" \
  -d '{"character_name": "arcana", "expressions": ["idle", "happy"]}'
```

## 캐릭터 목록

| 등급 | 캐릭터 | 성격 | 교단 | 클래스 |
|------|--------|------|------|--------|
| SSR | arcana | 신비 | 올림푸스 | 마법사 |
| SSR | leonhardt | 용감 | 타카마가하라 | 전사 |
| SSR | selene | 교활 | 요미 | 궁수 |
| SR | rose | 침착 | 아스가르드 | 힐러 |
| SR | kai | 야성 | 발할라 | 전사 |
| SR | luna | 교활 | 올림푸스 | 궁수 |
| SR | noir | 신비 | 요미 | 마법사 |
| SR | aria | 용감 | 타카마가하라 | 힐러 |
| R | finn | 용감 | 아스가르드 | 전사 |
| R | mira | 야성 | 발할라 | 궁수 |
| R | theo | 야성 | 올림푸스 | 마법사 |
| R | eva | 침착 | 타카마가하라 | 힐러 |
| R | rex | 교활 | 요미 | 전사 |
| R | ivy | 침착 | 아스가르드 | 마법사 |
| R | max | 야성 | 발할라 | 전사 |

## 표정 종류

| 표정 | 설명 | 프롬프트 |
|------|------|----------|
| idle | 기본 | default expression, relaxed pose |
| happy | 기쁨 | eyes closed happy, wide bright smile |
| excited | 흥분 | sparkling eyes, open mouth excited |
| angry | 화남 | puffed cheeks pouting, furrowed brows |
| sad | 슬픔 | teary eyes, sad frown |
| skill | 스킬 | concentrated expression, glowing eyes |
| victory | 승리 | triumphant smile, peace sign, winking |

## 파츠 분리 가이드

### Spine용 표준 파츠

```
- head          # 머리 (얼굴 포함)
- body          # 몸통
- arm_left      # 왼팔
- arm_right     # 오른팔
- leg_left      # 왼다리
- leg_right     # 오른다리
- hair_front    # 앞머리
- hair_back     # 뒷머리
- eyes          # 눈 (표정용)
- mouth         # 입 (표정용)
- weapon        # 무기/소품
- effect_front  # 전면 이펙트
- effect_back   # 후면 이펙트
```

### 수동 분리 대안

AI 자동 분리가 만족스럽지 않을 경우:

1. **Photoshop**: 레이어로 파츠 분리 → 개별 PNG 내보내기
2. **Figma**: 프레임으로 분리 → Export
3. **TexturePacker**: 파츠들을 Atlas로 패킹

## 출력 구조

```
D:/AI/SpineAtlas/
├── characters/
│   ├── arcana/
│   │   ├── full/
│   │   │   ├── arcana_idle.png
│   │   │   ├── arcana_happy.png
│   │   │   └── arcana_skill.png
│   │   └── parts/
│   │       ├── head.png
│   │       ├── body.png
│   │       └── ...
│   └── leonhardt/
│       └── ...
└── atlas/
    ├── arcana.atlas
    ├── arcana.png
    └── ...
```

## 트러블슈팅

### ComfyUI 연결 실패

```bash
# ComfyUI가 실행 중인지 확인
curl http://localhost:8188/system_stats

# 실행되지 않았다면
cd D:\AI\ComfyUI
python main.py --listen --port 8188
```

### 모델 로드 실패

- `models/checkpoints/` 폴더에 `.safetensors` 파일 확인
- 파일명이 `ponyDiffusionV6XL.safetensors`인지 확인

### CUDA 메모리 부족

```python
# ComfyUI 실행 시 low VRAM 모드
python main.py --lowvram --listen --port 8188
```

### 파츠 분리 품질 개선

GroundingDINO 프롬프트 수정:

```json
"prompt": "chibi anime head with big eyes, round body, left arm, right arm,
          left leg, right leg, fluffy hair bangs, long back hair,
          magic staff weapon, glowing effect particles"
```

## 라이선스

내부 사용 전용

---

**버전**: 1.0
**최종 수정**: 2026-01-31
