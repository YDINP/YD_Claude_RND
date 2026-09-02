# @tgslot/theme-gen

`games/<id>/art/prompts.json`을 읽어 심볼/프레임/배경/썸네일 이미지를 생성하고
`games/<id>/theme/*.webp`와 `theme.json`을 채워 넣는 CLI.

```bash
pnpm --filter @tgslot/theme-gen gen games/classic-777 --dry-run
pnpm --filter @tgslot/theme-gen gen games/classic-777
pnpm --filter @tgslot/theme-gen gen games/classic-777 --only wild,seven --force
```

## 옵션

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--provider <openai\|gemini\|comfy>` | 자동 선택 | 프로바이더 강제 지정 |
| `--only <id1,id2,...>` | 전체 | 지정한 asset id만 생성 |
| `--dry-run` | off | 실제 호출 없이 계획(프롬프트·경로)만 출력 |
| `--force` | off | 기존 출력 파일이 있어도 다시 생성 |

대상은 게임 폴더(`games/<id>` 절대/상대 경로) 하나만 받는다. `pnpm --filter`로 실행돼 cwd가
패키지 폴더여도 워크스페이스 루트 기준으로 다시 찾는다.

## 프로바이더 자동 선택

1. `--provider` 플래그
2. `THEME_GEN_PROVIDER` 환경변수 (`openai` | `gemini` | `comfy`)
3. `OPENAI_API_KEY`가 있으면 `openai`
4. `GEMINI_API_KEY`가 있으면 `gemini`
5. 로컬 ComfyUI(`COMFY_URL`, 기본 `http://127.0.0.1:8188`)가 `/system_stats`에 응답하면 `comfy`
6. 전부 실패하면 세 가지 옵션을 안내하며 종료

`--dry-run`은 위 자동 선택 로직을 그대로 타지만 ComfyUI 가용성 확인을 포함해 **아무 네트워크
호출도 하지 않는다** (comfy는 "연결 확인 생략"으로 표시된다).

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | - | openai 프로바이더용 |
| `GEMINI_API_KEY` | - | gemini 프로바이더용 |
| `THEME_GEN_PROVIDER` | - | 프로바이더 강제 지정 (`--provider`와 동일 효과) |
| `THEME_GEN_QUALITY` | `medium` | gpt-image-1 품질 (`low`/`medium`/`high`) |
| `COMFY_URL` | `http://127.0.0.1:8188` | ComfyUI 서버 주소 |
| `COMFY_CHECKPOINT` | `sd_xl_base_1.0.safetensors` | ComfyUI 체크포인트 |

## 프로바이더별 동작

- **openai** (`gpt-image-1`, `/v1/images/generations`) — `transparent: true`면 `background:
  "transparent"`를 네이티브로 요청한다. 크로마키가 필요 없다.
- **gemini** (`gemini-2.5-flash-image`) — 투명 배경을 지원하지 않는다. `transparent: true`면
  프롬프트에 "isolated on a flat pure green #00FF00 background"를 덧붙여 요청하고, 응답 이미지를
  **크로마키**(순수 초록 제거, hue 기준 ±30°, 1px 페더링)로 후처리해 투명하게 만든다.
- **comfy** — 로컬 SDXL 워크플로우(CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage
  → KSampler → VAEDecode → SaveImage)를 `/prompt`에 제출하고 `/history/<id>`를 폴링한 뒤
  `/view`로 받는다. gemini와 마찬가지로 `transparent: true`면 크로마키를 적용한다.

세 프로바이더 모두 429/5xx 응답은 지수 백오프로 2회 재시도한다. 로그에는 API 키를 자동으로
가린다(`sk-...`, `AIza...`, `?key=...`).

## 후처리

- **symbol**: 투명 여백 트림 → 8% 마진을 둔 정사각 캔버스에 중앙 배치 → `outSize` 정사각으로
  리사이즈해 webp(품질 90) → `<id>@128.webp` 128px 썸네일도 함께 만든다.
- **frame / bg / thumb**: 트림 없이 폭 기준으로 `outSize`에 맞춰 리사이즈한 webp만 만든다.

원본 프로바이더 출력은 재처리에 쓸 수 있도록 `<gameDir>/art/raw/<id>.png`에 그대로 보관한다.

## theme.json 반영

`kind: "symbol"` 에셋은 `theme.json`의 `symbols[id]`에, `kind: "frame"`은 `frame`에,
`kind: "bg"`는 `background`에 (모두 `theme.json` 파일 기준 상대 경로로) 반영한다.
`kind: "thumb"`는 게임 목록 썸네일이라 `theme.json`이 아니라 게임 폴더에 파일만 쓴다
(로비 카드 소스는 `manifest.json`의 몫).

병합은 항상 **merge, never drop unknown keys**다. `version`, `palette`, `sfx` 등 기존 키는
그대로 두고 심볼만 채워 넣는다(겹치는 id는 새 값으로 덮는다). `theme.json`이 아예 없으면
빈 `palette: {}`로 새로 만든다.

> `frame`은 렌더러의 현재 `theme.json` 스키마(`packages/renderer/src/theme.ts`)에는 없는
> 필드다. 지금 프레임 이미지는 렌더러가 아직 소비하지 않는 새 키로 추가되니, 렌더러 쪽에서
> 프레임 이미지를 쓰기로 하면 스키마에 `frame`을 정식으로 추가해야 한다.
> **consumed by the renderer once its schema supports `frame` image (in progress)** —
> 그 전까지는 `theme.json`에 값만 쌓이고 렌더러는 무시한다(merge 정책이라 안전).

## 재생성 / 부분 재실행

기존 출력 파일이 있으면 건너뛴다(`theme.json` 반영은 idempotent하게 다시 채운다). 특정 자산만
다시 만들고 싶으면:

```bash
pnpm --filter @tgslot/theme-gen gen games/classic-777 --only seven --force
```

## 비용 참고

`gpt-image-1` `quality: medium` 기준 1024² 이미지 1장에 약 $0.04-0.07. `classic-777`처럼
자산 12개(심볼 8 + 프레임 + 배경 + 썸네일)를 전부 생성하면 대략 $0.5-0.8 수준이다. gemini와
로컬 ComfyUI는 API 과금이 없다(ComfyUI는 로컬 GPU 시간만 든다).

## 게이트 테스트

```bash
pnpm --filter @tgslot/theme-gen test
```

- `prompts.json` zod 스키마 검증 (필수 필드, kind/size enum, asset id 중복)
- 프로바이더 자동 선택 로직 (env 목킹)
- 크로마키 픽셀 연산 (합성 16×16 버퍼)
- 후처리 트림/패딩 수학 (합성 PNG, sharp)
- `theme.json` 병합이 모르는 키를 보존하는지
- `--dry-run` 출력 스냅샷 (`fixtures/prompts.json` 기준)
- openai/gemini 프로바이더 happy-path (fetch 목킹)
