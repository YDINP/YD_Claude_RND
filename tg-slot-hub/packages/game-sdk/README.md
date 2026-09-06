# @tgslot/game-sdk

게임 팩과 허브 사이의 계약. **새 게임은 코드가 아니라 데이터 팩**이고, 그 팩이 무엇으로
이루어지는지에 대한 정의가 전부 여기 있다.

## 게임 팩 계약

팩 하나는 정확히 이 다섯 파일이다 (`PACK_FILES`).

| 파일 | 필수 | 성격 | 스키마 | 소비자 |
|---|---|---|---|---|
| `manifest.json` | 필수 | 원본 | `GameManifestSchema` | `apps/api` 로비·게임 목록 |
| `math.json` | 필수 | 원본 | `GameMathSchema` (`@tgslot/slot-engine`) | 스핀 엔진, `tools/rtp-sim` |
| `art/prompts.json` | 선택 | 원본 | `PromptsFileSchema` | `tools/theme-gen` |
| `art/fx.json` | 선택 | 원본 | `ArtFxFileSchema` | `tools/theme-gen` → `theme.json.fx` |
| `theme/theme.json` | 선택 | **생성물** | `ThemeFileSchema` | `packages/renderer` |

- **원본은 손으로 쓰고, 생성물은 도구가 쓴다.** `theme.json`의 `symbols`/`frame`/`frameLayout`/
  `background`/`backgroundFreeSpins`/`sheets`/`fx`는 `theme-gen`이 매번 다시 채우므로 손으로
  고치지 않는다. 나머지 키(`palette`, `version`, `sfx`, `transitions`)는 손으로 쓰고, 병합이
  중첩 단계까지 보존한다.
- `theme.json` 안의 경로는 **`theme.json` 파일 기준 상대 경로**다. `manifest.thumbnail`만
  `/games/<id>/thumb.webp` 형태의 URL이고, 실제 파일은 팩 폴더 안에 있다.
- 없어도 되는 파일은 **널 오브젝트**로 채운다 — `theme`은 `emptyTheme()`, `fx`는 `{}`.
  소비자가 "아트가 있나?"를 매번 분기하지 않게 하려는 것이다.

## 주요 export

| export | 하는 일 |
|---|---|
| `PACK_FILES` | 팩 파일 이름의 단일 출처 |
| `inspectGamePack(source, id)` | 읽고 **스키마만** 검증. 던지지 않고 문제를 모아 돌려준다 |
| `validateGamePack(pack, source)` | 파일 사이 관계 검사 (끊어진 참조·git 추적·심볼 대응·고아 파일) |
| `checkGamePack(source, id)` | 위 둘을 한 번에. `pack:check` CLI가 쓴다 |
| `parseGamePack(source, id)` | 전부 검증하고 `error`가 있으면 던진다. 부팅 경로용 |
| `themeAssetRefs(theme)` | 테마가 참조하는 **모든** 자산 경로를 한 곳에서 열거 |
| `scaffoldGamePack(id, template)` | `_template`에서 새 팩 파일 맵을 만든다 (순수 함수) |
| `GameManifestSchema` / `ThemeFileSchema` / `PromptsFileSchema` / `ArtFxFileSchema` | 각 파일의 스키마 |
| `GameContext` / `GameClient` / `Signal<T>` | 허브가 게임에 주입하는 실행 컨텍스트 |

기본 진입점은 `node:*`를 쓰지 않아 브라우저에서도 import할 수 있다.
디스크를 읽는 어댑터는 서브패스에 따로 있다.

```ts
import { loadGamePack, createDirSource, listGamePackDirs } from '@tgslot/game-sdk/node'

const pack = loadGamePack('games/classic-777') // 검증 실패하면 GamePackError
```

## 명령

```bash
pnpm pack:check              # games/* 전체 검사 (오류가 있으면 exit 1)
pnpm pack:check classic-777  # 팩 하나만
pnpm pack:check --strict     # 경고도 실패로
pnpm new:game <id>           # games/_template에서 새 팩 생성
```

검사 항목과 등급은 `games/_template/HOWTO.md`의 "게이트 확인" 절에 표로 있다.

## git 추적 검사

로비와 렌더러가 받아가는 자산(`manifest.thumbnail` + `theme.json`이 가리키는 모든 것)은
**디스크에 있는 것만으로 부족하고 git에도 들어가 있어야 한다.** untracked 파일을 가리키는
`theme.json`을 커밋하면 배포본에는 그 파일이 없고 렌더러는 에러 없이 폴백한다 — 아무도 모른 채
연출만 사라진다. 그래서 추적 여부는 경고가 아니라 **오류**다.

추적 정보는 `PackSource.listTracked?()`로 주입한다. 순수 로직은 git을 모르고,
`@tgslot/game-sdk/node`의 `createDirSource`가 `git ls-files`를 한 번 돌려 채운다
(자산마다 `--error-unmatch`를 부르면 프로세스가 자산 수만큼 뜬다).
`listTracked`가 없거나 undefined를 주면 — git 미설치, 저장소 밖, 메모리 픽스처 —
**이 검사만 조용히 건너뛰고** 나머지는 그대로 돈다. `.gitignore`가 일부러 빼는 `art/raw/`는 제외한다.

게임은 **지갑을 직접 만지지 않는다**. 잔액은 읽기 전용이고 스핀 결과는 서버가 준 것만 쓴다.
