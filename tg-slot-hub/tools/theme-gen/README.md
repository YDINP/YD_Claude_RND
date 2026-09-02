# @tgslot/theme-gen

`games/<id>/art/prompts.json`을 읽어 심볼/프레임/배경/썸네일 이미지를 생성하고
`games/<id>/theme/*.webp`와 `theme.json`을 채워 넣는 CLI.

```bash
pnpm --filter @tgslot/theme-gen gen games/classic-777 --dry-run
pnpm --filter @tgslot/theme-gen gen games/classic-777
pnpm --filter @tgslot/theme-gen gen games/classic-777 --only wild,seven --force
pnpm --filter @tgslot/theme-gen gen games/classic-777 --reprocess --only frame
```

모든 asset의 `out`은 게임 폴더 기준 상대 경로여야 한다 — 절대경로나 `..` 세그먼트로 게임
폴더 밖을 가리키면 `prompts.json` 파싱 단계에서 거부한다. `kind: "sheet"`의 `out`은 추가로
`.webp`로 끝나야 한다(JSON 사이드카가 같은 이름·폴더에 `.json`으로 쓰이므로, 다른 확장자를
허용하면 사이드카가 원본 이미지를 덮어쓸 수 있다).

## 옵션

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--provider <openai\|gemini\|comfy\|codex>` | 자동 선택 | 프로바이더 강제 지정 |
| `--only <id1,id2,...>` | 전체 | 지정한 asset id만 생성 |
| `--dry-run` | off | 실제 호출 없이 계획(프롬프트·경로)만 출력 |
| `--force` | off | 기존 출력 파일이 있어도 다시 생성 |
| `--reprocess` | off | 프로바이더를 아예 호출하지 않고 `art/raw/<id>.png`에서 후처리만 다시 돌린다 |

`--reprocess`는 이미지 생성 없이 후처리 로직(트림/패딩/릴 창 감지 등)만 고쳤을 때 쓴다.
프로바이더 선택 로직 자체를 안 타므로 API 키도, codex 로그인도 필요 없다. 대상 asset의
`art/raw/<id>.png`가 미리 있어야 한다(없으면 명확한 에러로 실패). `frame` 외 kind(symbol/bg/thumb)도
재처리는 되지만, 원본이 아직 초록/흰색 배경을 갖고 있다면(gemini/comfy가 만들고 그때 크로마키를
안 돌린 raw라면) 재처리로는 못 고친다 — 그럴 땐 `--force`로 프로바이더를 다시 불러야 한다.

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

- **spawn 자체가 실패하면**(codex 미설치 등) 다른 프로바이더와 같은 정책으로 지수 백오프
  2회 재시도한다. **시간 초과는 재시도하지 않는다** — codex가 1~3분씩 걸릴 수 있는데 시간
  초과를 재시도하면 최악의 경우 대기 시간이 3배가 되기 때문이다.
- 시간 초과되면 프로세스를 정리한다. Windows에서는 `shell: true`로 띄운 cmd.exe만
  `kill()`하면 그 아래 codex.cmd → node.exe(→ codex가 또 띄웠을 수 있는 프로세스)가 고아로
  남으므로, `taskkill /pid <pid> /T /F`로 트리 전체를 죽인다. POSIX는 새 프로세스 그룹으로
  띄운 뒤 음수 pid로 그룹 전체를 죽인다. 둘 다 안 되면 최소한 직계 자식은 정리한다.

## 후처리

- **symbol**: 투명 여백 트림 → 8% 마진을 둔 정사각 캔버스에 중앙 배치 → `outSize` 정사각으로
  리사이즈해 webp(품질 90) → `<id>@128.webp` 128px 썸네일도 함께 만든다.
- **bg / thumb**: 트림 없이 폭 기준으로 `outSize`에 맞춰 리사이즈한 webp만 만든다.
- **frame**: 위 둘과 달리 릴 창까지 손본다. 아래 별도 절 참고.
- **sheet**: 콘택트시트 1장을 슬라이싱해 타이트한 애니메이션 아틀라스로 재조립한다. 아래 별도
  절 참고.

원본 프로바이더 출력은 재처리에 쓸 수 있도록 `<gameDir>/art/raw/<id>.png`에 그대로 보관한다
(`--reprocess`가 이걸 읽는다).

### frame 전용: 릴 창 감지 & 펀칭

`kind: "frame"` 프롬프트는 보통 릴이 들어갈 자리에 순수 초록(또는 흰색) placeholder 사각형을
그리게 시킨다. 문제는 openai/codex의 "네이티브 투명 배경"이 이미지 **바깥** 배경만 투명하게
만들 뿐, 모델이 의도적으로 그린 그 placeholder 사각형은 "배경"으로 인식하지 않아 그대로
남는다는 것 — 렌더러가 프레임을 릴 위에 덧그리므로, 이 사각형이 안 뚫리면 릴이 안 보인다.
`processFrame`(`src/postProcess.ts`, 탐지/펀칭 로직은 `src/frameWindow.ts`)이 이걸 고친다:

1. **탐지**: 이미지 중앙 영역(x 5-95%, y 10-80% — 바깥 여백과 상단 마퀴/하단 몰딩을 피한다)에서
   초록(`g > 140 && g > r+50 && g > b+50`) 또는 흰색(`r,g,b 모두 > 235`)이면서 이미 투명하지
   않은(`alpha > 10`) 픽셀을 표시하고, 다운샘플 그리드(4px당 1칸) 위에서 BFS로 가장 큰 연결
   덩어리를 찾아 바운딩 박스를 구한다. 안티에일리어싱된 초록 테두리까지 포함하도록 폭의 1%만큼
   사방으로 넓힌다.
2. **펀칭**: 찾은 박스 안쪽 알파를 0으로 만든다. 모서리를 폭의 2%만큼 둥글리고 경계를 2px
   페더링해 딱딱한 사각형 윤곽이 남지 않게 한다. 박스 바깥 픽셀의 알파는 건드리지 않는다.
3. **마무리 크로마키**: 그러고도 남을 수 있는 초록 번짐(창 밖 가장자리 등)을 잡기 위해 이미지
   전체에 일반 크로마키를 한 번 더 돌린다.

창을 못 찾으면(placeholder가 없거나 색이 안 맞으면) 예외 없이 그냥 리사이즈만 하고 경고 로그를
남긴다 — `frameLayout`은 갱신되지 않고 렌더러 기본값(`DEFAULT_FRAME_WINDOW`)이 쓰인다.
탐지된 좌표는 `[theme-gen] frame: <id> 릴 창 감지 x=... y=... w=... h=...`로 로그에 남는다.

### sheet 전용: 심볼 승리 애니메이션 콘택트시트 슬라이싱

심볼 승리 연출 같은 짧은 루프 애니메이션은 프레임마다 따로 생성하지 않고, **콘택트시트
한 장**(격자에 여러 프레임을 나눠 그린 이미지)을 한 번에 생성한 뒤 잘라서 쓴다.

`prompts.json` 항목 예시:

```json
{
  "id": "seven-win",
  "kind": "sheet",
  "symbol": "seven",
  "grid": { "cols": 3, "rows": 3 },
  "fps": 12,
  "size": "1536x1536",
  "transparent": true,
  "prompt": "a glossy red seven symbol pulsing with a golden sparkle burst, looping smoothly",
  "out": "theme/sheets/seven-win.webp",
  "outSize": 1536
}
```

| 필드 | 의미 |
|---|---|
| `symbol` | 어느 심볼의 애니메이션인지 (`theme.json.sheets`의 1단계 키가 된다) |
| `grid.cols` / `grid.rows` | 콘택트시트 격자 칸 수 |
| `fps` | 재생 속도. 아틀라스 JSON에 그대로 실린다 |

`id`는 `<symbol>-<애니메이션 이름>` 컨벤션을 쓴다(예: `seven-win` → symbol `seven` +
애니메이션 `win`). 이 컨벤션을 따르면 `theme.json.sheets.seven.win`처럼 이름이 정해지고,
안 따르면(예: `-`가 없는 id) id 전체를 애니메이션 이름으로 쓴다.

**프롬프트에 격자 지시문 자동 추가** — `resolveAssetPrompt`가 `kind: "sheet"`일 때 끝에 이
문장을 덧붙인다(`{loopDescription}`은 asset의 `prompt` 본문을 그대로 재사용한다 — prompts.json에
따로 필드가 없어서, asset이 이미 서술한 "무엇을 반복하는가"가 가장 자연스러운 소스이기 때문이다):

> Render exactly `{cols}`×`{rows}` equal cells in a grid, each cell one animation frame of the
> SAME object, identical camera/scale/position, frame N shows the pose at time N/`{count}` of a
> `{loopDescription}`; no borders, no labels, transparent background.

**슬라이싱 (`src/spriteSheet.ts`의 `processSheet`)**:

1. 이미지를 `cols x rows` 셀로 등분한다(칸 크기 = `floor(width/cols) x floor(height/rows)`).
2. 각 셀의 콘텐츠(alpha > 10) 바운딩 박스를 셀 로컬 좌표로 구하고, **전부 하나로 합친다**
   (합집합 — 모든 셀에 있는 콘텐츠를 다 포함하는 최소 사각형). 프레임마다 따로 트림하면
   애니메이션 재생 중 물체가 흔들려 보이므로, 반드시 같은 박스로 모든 프레임을 자른다.
3. 그 박스만큼만 각 셀에서 잘라 여백 없는 `frameW x frameH` 격자(`cols x rows` 그대로, 칸
   사이 간격 없음)로 다시 합성한다.
4. `outSize` 폭에 맞춰 리사이즈하고, `frameW`/`frameH`/프레임 좌표도 같은 비율로 스케일한다.

**출력**: 아틀라스 이미지(`out`에 지정한 webp 경로)와 그 옆에 같은 이름의 `.json`
(TexturePacker류 미니멀 스키마):

```json
{
  "frameW": 480, "frameH": 480, "cols": 3, "rows": 3, "count": 9, "fps": 12,
  "frames": [{ "x": 0, "y": 0, "w": 480, "h": 480 }, "... 9개 ..."],
  "symbol": "seven"
}
```

투명 배경 처리(gemini/comfy 크로마키, codex 폴백 크로마키)는 symbol/bg와 똑같이 슬라이싱 전에
적용된다. `--reprocess`도 그대로 지원한다(`art/raw/<id>.png`의 콘택트시트에서 슬라이싱만
다시 돌린다).

> gpt-image-1(openai)은 `1536x1536` 정사각 크기를 지원하지 않는다(공식 지원 크기는
> `1024x1024`/`1024x1536`/`1536x1024`뿐). 콘택트시트에 `1536x1536`을 쓰려면 codex나 comfy를
> 쓸 것 — openai로 요청하면 API가 그 자리에서 거부한다.

## theme.json 반영

`kind: "symbol"` 에셋은 `theme.json`의 `symbols[id]`에, `kind: "frame"`은 `frame`에 반영한다
(모두 `theme.json` 파일 기준 상대 경로). `frame` 에셋에서 릴 창을 찾았으면
`frameLayout: { window: { x, y, w, h } }`(이미지 크기 대비 분수)도 함께 쓴다 — 렌더러의
`FrameWindowSchema`(`packages/renderer/src/theme.ts`)가 읽는 필드다.
`kind: "thumb"`는 게임 목록 썸네일이라 `theme.json`이 아니라 게임 폴더에 파일만 쓴다
(로비 카드 소스는 `manifest.json`의 몫).

`kind: "bg"`는 **asset id로** 어느 키에 쓸지 정한다:

| asset id | theme.json 키 |
|---|---|
| `bg` | `background` |
| `bgFreeSpins` | `backgroundFreeSpins` |
| 그 외 | `background` (기존 게임 팩과의 하위 호환) |

`kind: "sheet"`는 `sheets[symbol][animation] = "<아틀라스 json 상대경로>"`에 쓴다
(예: `sheets.seven.win = "sheets/seven-win.json"`). 같은 symbol의 다른 애니메이션이나 다른
symbol의 시트는 서로 안 건드리고 나란히 쌓인다(중첩 merge — symbol 단위, 애니메이션 단위 둘 다
겹치는 키만 덮어쓴다).

병합은 항상 **merge, never drop unknown keys**다. `version`, `palette`, `sfx` 등 기존 키는
그대로 두고 심볼/frame/frameLayout/background(FreeSpins)/sheets만 채워 넣는다(겹치면 새
값이 이긴다).

`theme.json`이 아예 없거나(또는 `palette`/`version` 키 자체가 없으면) 허브 공통 기본값으로
채운다 — 빈 `palette: {}`를 남기면 렌더러의 `ThemePaletteSchema`가 네 필드를 전부 요구해서
검증에 실패한다:

```json
{
  "version": "1.0.0",
  "palette": {
    "frame": "#d8a94a",
    "reelBg": "#0b1220",
    "winLine": ["#f4d98a", "#4fc3d9", "#3fae6a", "#e0605c", "#5b9dff"],
    "text": "#f2f4f8"
  }
}
```

이미 `palette`/`version`이 있는 파일은 건드리지 않는다(기본값은 새로 만들 때만 채워 넣는
자리 표시자다).

## 재생성 / 부분 재실행

기존 출력 파일이 있으면 건너뛴다(`theme.json` 반영은 idempotent하게 다시 채운다). 특정 자산만
다시 만들고 싶으면:

```bash
pnpm --filter @tgslot/theme-gen gen games/classic-777 --only seven --force
```

## 실행 요약 로그

`gen`(프로바이더 호출)과 `--reprocess` 둘 다 마지막에 요약 한 줄을 찍는다:

```
요약: 자산 3개 (생성 2, skip 1), 총 1.2s, 총 2.34MB
```

시간/바이트는 **생성된** 자산만 합산한다(skip은 실제로 아무 작업도 안 했으니 0으로 친다).

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
- 프레임 릴 창 탐지(합성 200×300 이미지, 바운딩 박스 ±2px, 중앙 영역 밖은 무시)와 펀칭(창
  안쪽 alpha 0 / 바깥은 원래 알파 보존, 둥근 모서리, 페더링)
- `--reprocess`: 픽스처 raw png로 프로바이더 호출 없이 웹프를 만드는지(스파이 미호출로 확인),
  원본이 없으면 명확히 실패하는지, 기존 출력을 덮어쓰는지
- `bg` asset id → `background`/`backgroundFreeSpins` 매핑(그 외 id는 하위 호환으로 `background`)
- 새 `theme.json`에 허브 기본 palette/version을 채우는지, 이미 있으면 안 건드리는지, 기본
  palette가 호출마다 독립된 복사본인지(공유 상수 오염 방지)
- sprite sheet 슬라이싱(합성 3×3 콘택트시트, 셀마다 다른 콘텐츠 bbox → 합집합으로 전 프레임
  동일 크기, row-major 배치, outSize 스케일, 콘텐츠 없는 시트는 셀 전체 크기로 대체), 아틀라스
  JSON 모양, `resolveAssetPrompt`의 격자 지시문 추가, `theme.json.sheets`의 symbol/애니메이션
  중첩 병합, `--reprocess`로 시트도 재슬라이싱되는지(프로바이더 미호출 확인 포함)
- 아틀라스 픽셀 크기 == JSON `frameW*cols x frameH*rows` 항상 일치(리뷰에서 지적된 반올림
  불일치 재현 케이스 포함, 여러 홀수/소수 크기 조합에 대한 반복 검증)
- `out` 경로 안전성: 절대경로/`..` 탈출 거부, `kind: "sheet"`는 `.webp` 확장자 강제
- codex: spawn 실패는 다른 프로바이더처럼 2회 재시도(정확한 시도 횟수 확인), 시간 초과는
  재시도하지 않는지(정확히 1회만 실행)
- 실행 요약 로그(`formatRunSummary`): 생성/skip 개수, 시간 ms/s 단위 전환, 바이트 B/KB/MB
  단위 전환, skip된 자산은 합계에서 제외되는지, 결과가 비어 있어도 안 던지는지
