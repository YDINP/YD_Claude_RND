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
| `--provider <openai\|gemini\|comfy\|codex>` | 자동 선택 | 프로바이더 강제 지정 |
| `--only <id1,id2,...>` | 전체 | 지정한 asset id만 생성 |
| `--dry-run` | off | 실제 호출 없이 계획(프롬프트·경로)만 출력 |
| `--force` | off | 기존 출력 파일이 있어도 다시 생성 |

대상은 게임 폴더(`games/<id>` 절대/상대 경로) 하나만 받는다. `pnpm --filter`로 실행돼 cwd가
패키지 폴더여도 워크스페이스 루트 기준으로 다시 찾는다.

## 프로바이더 자동 선택

1. `--provider` 플래그
2. `THEME_GEN_PROVIDER` 환경변수 (`openai` | `gemini` | `comfy` | `codex`)
3. `OPENAI_API_KEY`가 있으면 `openai`
4. `GEMINI_API_KEY`가 있으면 `gemini`
5. `codex login status`가 성공하면(10초 상한) `codex`
6. 로컬 ComfyUI(`COMFY_URL`, 기본 `http://127.0.0.1:8188`)가 `/system_stats`에 응답하면 `comfy`
7. 전부 실패하면 네 가지 옵션을 안내하며 종료

`--dry-run`은 위 자동 선택 로직을 그대로 타지만 codex 로그인 확인과 ComfyUI 가용성 확인을
포함해 **아무 네트워크/서브프로세스 호출도 하지 않는다** (codex/comfy는 "확인 생략"으로 표시된다).

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | - | openai 프로바이더용 |
| `GEMINI_API_KEY` | - | gemini 프로바이더용 |
| `THEME_GEN_PROVIDER` | - | 프로바이더 강제 지정 (`--provider`와 동일 효과) |
| `THEME_GEN_QUALITY` | `medium` | gpt-image-1 품질 (`low`/`medium`/`high`) |
| `COMFY_URL` | `http://127.0.0.1:8188` | ComfyUI 서버 주소 |
| `COMFY_CHECKPOINT` | `sd_xl_base_1.0.safetensors` | ComfyUI 체크포인트 |
| `CODEX_TIMEOUT_MS` | `300000` (5분) | codex 이미지 생성 1건 상한 |
| `CODEX_AVAILABLE` | - | `1`이면 `codex login status` 실행 없이 codex를 가용한 것으로 취급 (테스트/CI용) |

## 프로바이더별 동작

- **openai** (`gpt-image-1`, `/v1/images/generations`) — `transparent: true`면 `background:
  "transparent"`를 네이티브로 요청한다. 크로마키가 필요 없다.
- **gemini** (`gemini-2.5-flash-image`) — 투명 배경을 지원하지 않는다. `transparent: true`면
  프롬프트에 "isolated on a flat pure green #00FF00 background"를 덧붙여 요청하고, 응답 이미지를
  **크로마키**(순수 초록 제거, hue 기준 ±30°, 1px 페더링)로 후처리해 투명하게 만든다.
- **comfy** — 로컬 SDXL 워크플로우(CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage
  → KSampler → VAEDecode → SaveImage)를 `/prompt`에 제출하고 `/history/<id>`를 폴링한 뒤
  `/view`로 받는다. gemini와 마찬가지로 `transparent: true`면 크로마키를 적용한다.
- **codex** — 아래 별도 절 참고.

openai/gemini/comfy는 429/5xx 응답을 지수 백오프로 2회 재시도한다. 로그에는 API 키를 자동으로
가린다(`sk-...`, `AIza...`, `?key=...`).

### codex (로컬 CLI, API 키 불필요)

사용자가 이미 `codex login`으로 ChatGPT에 로그인해 둔 Codex CLI(`codex`, PATH에 있어야 함)를
서브프로세스로 띄워 내장 이미지 생성 도구(`image_gen__imagegen`)를 쓰게 시킨다.
API 키가 필요 없는 대신, **자산 1개에 1~3분** 걸릴 수 있어 (CODEX_TIMEOUT_MS 기본 5분 상한)
`gen` 명령은 codex를 쓸 때 자산을 항상 순차 실행한다(병렬 실행 안 함).

- 매 자산마다 `os.tmpdir()` 아래 임시 폴더를 만들고
  `spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-o', 'last.txt'], { cwd: 임시폴더 })`를
  띄운 뒤, codex가 그 폴더에 `out.png`를 저장하도록 하는 자연어 지시문을 **stdin으로 써서 보낸다**
  (PROMPT를 CLI 인자로 주지 않음 — 이유는 아래 참고). codex는 PROMPT 인자가 없으면 stdin에서 읽는다
  (`codex exec --help`).
- 성공(=`out.png`가 생김)하면 임시 폴더를 지운다. 실패하면 **임시 폴더를 남기고 경로를 로그로
  남긴다** — `last.txt`(codex 실행 로그)와 stdout/stderr 꼬리를 보고 원인을 확인할 수 있다.
- **PROMPT는 왜 stdin인가**: Windows에서 `.cmd`를 실행하려면 `shell: true`가 필요한데, Node는 이
  경우 인자를 이스케이프 없이 그냥 이어 붙이기만 한다(공식 문서에 명시된 동작이자 지금 나오는
  `DEP0190` 경고의 이유). 그래서 지시문을 CLI 인자로 주면 cmd.exe가 공백/`%`/`&`/`()` 등에서
  단어를 쪼개 codex가 `unexpected argument 'your' found`로 죽는 걸 실제 스모크 테스트로 확인했다.
  stdin 경로는 cmd.exe 파싱을 아예 타지 않아 특수문자·긴 텍스트에도 안전하다.
- codex는 보통 `transparent: true` 요청을 알아서 지키지만, 응답에 알파 채널이 없거나 네 모서리가
  전부 불투명하면 실패로 보고 **gemini처럼 폴백 크로마키**를 적용한다(다만 초록을 가정하지 않고
  실제 좌상단 픽셀 색을 배경색으로 추정한다). 폴백이 걸리면 경고 로그를 남긴다.
- Windows에서는 npm 글로벌 설치가 만드는 `.cmd` 래퍼(`codex.cmd`, 보통
  `%APPDATA%\npm\codex.cmd`)를 `shell: true`로 실행한다. macOS/Linux는 `codex`를 `shell: false`로
  직접 실행한다.
- 가용성 확인: `codex login status`를 10초 상한으로 실행해 종료 코드 0이면 로그인된 것으로 본다.
  로그인 여부를 직접 확인하려면:

  ```bash
  codex login status
  ```

- 재시도는 하지 않는다(HTTP 429/5xx 개념이 없다). 실행 자체가 실패하거나(codex 미설치 등)
  시간 초과되면 즉시 에러를 던진다.

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
로컬 ComfyUI는 API 과금이 없다(ComfyUI는 로컬 GPU 시간만 든다). codex는 별도 API 과금이 없고
기존 ChatGPT 구독/사용량에 걸리지만, 자산당 1~3분이 걸려 자산이 많을수록 벽시계 시간이 크다.

## 게이트 테스트

```bash
pnpm --filter @tgslot/theme-gen test
```

- `prompts.json` zod 스키마 검증 (필수 필드, kind/size enum, asset id 중복)
- 프로바이더 자동 선택 로직 (env 목킹, codex 포함 순서)
- 크로마키 픽셀 연산 (합성 16×16 버퍼)
- 후처리 트림/패딩 수학 (합성 PNG, sharp)
- `theme.json` 병합이 모르는 키를 보존하는지
- `--dry-run` 출력 스냅샷 (`fixtures/prompts.json` 기준)
- openai/gemini 프로바이더 happy-path (fetch 목킹)
- codex 지시문 생성기(크기/투명 변형 스냅샷), spawn 래퍼(가짜 프로세스로 happy path/누락 파일/시간
  초과/spawn 실패), 투명 폴백 크로마키 적용 여부, `codex login status` 가용성 확인 — **실제
  codex는 테스트에서 절대 호출하지 않는다**
