# @tgslot/renderer

PixiJS 8 + GSAP 릴 렌더러. **브라우저 전용**이고 React를 쓰지 않는다.
엔진(`@tgslot/slot-engine`)은 **타입으로만** 가져오므로 런타임 의존이 없다.

```ts
import { createSlotRenderer, loadTheme } from '@tgslot/renderer'

const theme = await loadTheme('/games/classic-777', math)
const renderer = createSlotRenderer({ container, math, theme, initialStops: [0, 0, 0] })
await renderer.ready

await renderer.spinTo(result.stops)          // 모든 릴이 멈추면 resolve
await renderer.showWins(result.wins, { loop: true, totalBet })
```

## API

### `createSlotRenderer(options): SlotRenderer`

동기적으로 핸들을 돌려주고 초기화는 `ready`에서 끝난다.
PixiJS는 이 안에서 **동적 import** 되므로 순수 로직만 쓰는 코드에는 번들에 딸려오지 않는다.

| 옵션 | 타입 | 설명 |
|---|---|---|
| `container` | `HTMLElement` | 캔버스를 붙일 요소. 크기의 기준이기도 하다 |
| `math` | `GameMath` | `math.json`을 `parseGameMath`로 통과시킨 값 |
| `theme` | `Theme` | `loadTheme`이 만든 값 또는 직접 조립한 값 |
| `initialStops` | `number[]` | 첫 화면 정지 위치. 없으면 전부 0 |
| `onEvent` | `(e) => void` | `reelStop` / `spinEnd` / `winShown` |
| `reducedMotion` | `boolean` | 미지정 시 `prefers-reduced-motion`을 따른다 |

### `SlotRenderer`

| 멤버 | 시그니처 | 하는 일 |
|---|---|---|
| `ready` | `Promise<void>` | 에셋 로딩과 첫 렌더 완료 |
| `spinTo` | `(stops: number[], opts?: { durationMs?: number; stagger?: number }) => Promise<void>` | 릴을 돌려 `stops`에 **정확히** 멈춘다. 모든 릴이 멈추면 resolve |
| `showWins` | `(wins: WinLine[], opts?: { loop?: boolean; totalBet?: number }) => Promise<void>` | 페이라인 오버레이 + 심볼 펄스 + 배당 라벨. 첫 바퀴가 끝나면 resolve |
| `clearWins` | `() => void` | 승리 연출 즉시 정리 |
| `setSpinningIdle` | `(on: boolean) => void` | 대기 중 미세한 유휴 모션 |
| `resize` | `() => void` | 레이아웃 재계산. ResizeObserver가 자동 호출도 한다 |
| `destroy` | `() => void` | 트윈·옵저버·캔버스까지 해제 |

`showWins`에 `loop: true`를 주면 첫 바퀴가 끝난 시점에 resolve하고,
이후로는 `clearWins()`나 다음 `spinTo()`가 멈출 때까지 라인을 계속 순환한다.

이벤트:

```ts
type RendererEvent =
  | { type: 'reelStop'; reel: number }
  | { type: 'spinEnd' }
  | { type: 'winShown'; line: number }
```

## 좌표 규약

엔진의 규약을 그대로 따른다. **바꾸지 않는다.**

- `grid[row][reel]` — 화면 심볼 격자
- `positions`는 `[reel, row]` 좌표
- 릴 `i`의 화면 행 `r`에 보이는 심볼은 `strips[i][(stop + r) % len]`

렌더러는 릴마다 **연속 위치값**(`position`)을 들고 있다.
정수부는 화면 행 0에 오는 스트립 인덱스이고, 소수부는 칸 사이 스크롤 오프셋이다.
릴은 아래로 흐르므로 스핀 중에는 위치가 **감소**하고, 감아 도는 것은 `normalizePosition`이 맡는다.

착지는 애니메이션이 도달한 값이 아니라 `stop`으로 **다시 확정**한다.
그래서 `spinTo`가 resolve한 뒤 화면에 보이는 심볼은 언제나
`stopsToGrid(math, stops)` = 엔진 `buildGrid(math, stops)`와 같다.

화면에는 위아래로 오버스캔 심볼이 한 칸씩 더 있고(`rows + 2`), 릴 영역 마스크가 잘라낸다.

## 연출 규칙

| 항목 | 값 |
|---|---|
| 스핀 | 가속(`power2.in`) → 감속(`power2.out`) → 오버슛 후 바운스 복귀 |
| 정지 순서 | 왼쪽 → 오른쪽, `stagger` 간격 (기본 160ms) |
| 승리 라인 순환 | 900ms 주기, 심볼 펄스 1 → 1.12 → 1 |
| 빅윈 | 총배당이 베팅액의 **20배 이상**이면 코인 샤워 (스프라이트 60개 상한) |
| 모션 축소 | 전체 스핀 300ms 이하, 오버슛·펄스·파티클 없음 |

`showWins`에 `totalBet`을 주면 빅윈 판정이 정확해진다.
없으면 `sum(multiplier) / paylines.length`로 같은 값을 유도한다
(엔진이 `win = multiplier x betPerLine`, `totalBet = betPerLine x lines`이므로 둘은 항상 같다).

## 반응형

- 세로 폰 우선. 컨테이너 폭에 프레임을 맞추고, 높이가 주어지면 잘리지 않게 더 작은 쪽을 택한다.
- `devicePixelRatio`를 캔버스 해상도로 쓰되 3배까지만 올린다.
- `ResizeObserver`가 컨테이너를 감시하고 크기가 실제로 바뀔 때만 다시 그린다.

## 게임 팩의 `theme.json`

`games/<id>/theme/theme.json`. 경로는 **이 파일 기준 상대 경로**다.

```json
{
  "version": "1.0.0",
  "symbols": { "seven": "symbols/seven.svg", "bar3": "symbols/bar3.svg" },
  "background": "bg.svg",
  "frame": "frame.webp",
  "frameLayout": { "window": { "x": 0.08, "y": 0.22, "w": 0.84, "h": 0.46 } },
  "palette": {
    "frame": "#d8a94a",
    "reelBg": "#0b1220",
    "winLine": ["#f4d98a", "#4fc3d9", "#3fae6a", "#e0605c", "#5b9dff"],
    "text": "#f2f4f8"
  }
}
```

- `symbols`는 `math.json`의 심볼 id를 **하나도 빠짐없이** 덮어야 한다
  (`loadTheme(baseUrl, math)`에 math를 넘기면 강제된다).
- `winLine`은 페이라인 인덱스를 배열 길이로 감아서 고른다. 라인 수만큼 두는 것이 보기 좋다.
- 색은 `#RGB` / `#RRGGBB` / `#RRGGBBAA`만 받는다.
- 효과음 파일이 없으면 `sfx` 키 자체를 **넣지 않는다**. 빈 문자열은 검증에서 막는다.
  렌더러는 소리를 재생하지 않는다. URL을 허브의 `AudioBus`에 넘기는 것은 게임 셸의 몫이다.

```ts
const theme = await loadTheme('/games/classic-777', math)
// -> symbols.seven === '/games/classic-777/theme/symbols/seven.svg'
```

이미지 로딩이 실패하거나 URL이 비어 있으면 심볼 id를 찍은 **폴백 텍스처**로 대체한다.
에셋 하나 때문에 렌더러가 멈추는 일은 없다.

### 텍스처 소유권

| 출처 | 소유자 | `destroy()` 때 |
|---|---|---|
| `Assets.load` (심볼·배경·프레임 이미지) | Pixi 전역 에셋 캐시 | 건드리지 않는다 (다음 진입에서 재사용) |
| 캔버스로 그린 폴백 심볼·코인 텍스처 | **이 렌더러 인스턴스** | GPU 리소스까지 해제한다 |

캔버스 텍스처는 캐시가 소유하지 않으므로 렌더러가 직접 정리하지 않으면
로비 → 게임 → 로비를 오갈 때마다 GPU에 쌓인다. `destroy()`는 앱을 내린 뒤
이 인스턴스가 만든 것만 골라 파괴한다. 그래서 **게임 화면을 떠날 때 `destroy()`를 반드시 불러야 한다.**

## 프레임 아트 (`frame` / `frameLayout`)

`frame`은 릴을 감싸는 **베젤 이미지 1장**이다. `palette.frame`(벡터 베젤 테두리 **색**)과는 다른 것이다.

| 필드 | 타입 | 기본값 |
|---|---|---|
| `frame` | 경로 문자열 (`background`와 같은 규칙으로 풀린다) | 없음 |
| `frameLayout.window` | `{ x, y, w, h }` — 프레임 이미지 크기에 대한 **분수** | `x 0.08, y 0.22, w 0.84, h 0.46` |

기본 창 분수는 `docs/ART_DIRECTION.md` §5의 릴 창(x 8~92%, y 22~68%)과 같은 값이고,
상수 `DEFAULT_FRAME_WINDOW`로 노출된다. `theme-gen`은 `frame`만 기록하고 `frameLayout`은 쓰지 않으므로
`parseTheme`이 `frame`을 보면 기본 창을 **자동으로 채워** 넣는다. 손으로 조립한 `Theme`이라면
`resolveFrameWindow(theme)`가 같은 폴백을 준다.

동작:

- `frame`이 **있으면** 캔버스 크기가 프레임 이미지 크기(컨테이너 폭에 맞춘 배율)가 되고,
  릴·마스크·페이라인 오버레이가 통째로 `window` 사각형 안으로 들어간다.
  창보다 릴이 작으면 가운데 정렬한다. 벡터 베젤은 그리지 않는다.
- 프레임 스프라이트는 릴 **위에** 얹는다. 창이 알파로 뚫려 있어야 릴이 비쳐 보인다
  (아트 파이프라인의 크로마키 절차가 그 구멍을 만든다). 창이 불투명하면 릴이 가려진다.
- `frame`이 **없으면** 지금까지의 벡터 베젤 경로를 그대로 탄다. 이미지 로딩이 실패해도 같은 경로로 되돌아간다.

순수 계산은 `frameWindowRect(frameW, frameH, window)`와 `computeFrameLayout(...)`이 맡고 둘 다 단위 테스트가 있다.

## 순수 로직 export

Pixi 없이도 쓸 수 있는 부분은 따로 내보낸다. 허브의 테스트와 레이아웃 계산에 쓰라고 열어 둔 것이다.

| export | 하는 일 |
|---|---|
| `stopsToGrid(math, stops)` | 엔진 `buildGrid`와 같은 값. 렌더 결과 검증용 |
| `symbolAt`, `reelStripWindow`, `wrapIndex` | 스트립 조회 |
| `normalizePosition`, `spinTargetPosition` | 릴 위치 계산 |
| `computeLayout`, `symbolCenter`, `paylinePoints`, `positionRects` | 기하 계산 |
| `frameWindowRect`, `computeFrameLayout` | 프레임 아트 안의 릴 창 배치 |
| `buildSpinPlan` | 릴별 타이밍 계획 |
| `isBigWin`, `winBetMultiple`, `paylineColor`, `buildWinCycle`, `formatWinLabel` | 승리 연출 규칙 |
| `parseTheme`, `loadTheme`, `resolveSymbolSource`, `resolveFrameWindow` | 테마 검증·로딩 |

`src/pixi/*`만 `pixi.js`와 `gsap`을 import한다. 이 규칙은 테스트가 지킨다.
