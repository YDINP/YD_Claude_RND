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
| `fit` | `'window' \| 'width'` | 프레임을 맞추는 방식. 기본 `'window'` |
| `overflowX` | `number` | `'window'`에서 프레임이 폭을 넘어도 되는 비율. 기본 0.30 |

### `SlotRenderer`

| 멤버 | 시그니처 | 하는 일 |
|---|---|---|
| `ready` | `Promise<void>` | 에셋 로딩과 첫 렌더 완료 |
| `spinTo` | `(stops: number[], opts?: { durationMs?: number; stagger?: number }) => Promise<void>` | 릴을 돌려 `stops`에 **정확히** 멈춘다. 모든 릴이 멈추면 resolve |
| `showWins` | `(wins, opts?: { loop?; totalBet?; formatLineLabel? }) => Promise<void>` | 아래 "승리 연출" 참고. 첫 바퀴가 끝나면 resolve |
| `clearWins` | `() => void` | 승리 연출 즉시 정리 |
| `setSpinningIdle` | `(on: boolean) => void` | 대기 중 미세한 유휴 모션 |
| `resize` | `() => void` | 레이아웃 재계산. ResizeObserver가 자동 호출도 한다 |
| `destroy` | `() => void` | 트윈·옵저버·캔버스까지 해제 |

`showWins`에 `loop: true`를 주면 첫 바퀴가 끝난 시점에 resolve하고,
이후로는 `clearWins()`나 다음 `spinTo()`가 멈출 때까지 계속 순환한다.

## 승리 연출

프라그마틱 계열 슬롯의 순서를 따른다. 한 바퀴는 **A단계 → B단계**다.

| 단계 | 조건 | 길이 | 화면 |
|---|---|---|---|
| A "전체" | 승리 1개 이상 | 등급별 900~2200ms | 이긴 심볼이 **동시에** 연출된다. 나머지는 α 0.5로 눌린다. 페이라인은 아직 안 그린다 |
| B "라인별" | 승리 2개 이상 | 라인당 1400ms | 그 라인 심볼만 연출되고 폴리라인과 명판이 뜬다 |

라인이 바뀔 때는 150ms 크로스페이드로 넘긴다. 모션 축소에서는 즉시 전환한다.

승리가 하나뿐이면 B단계 없이 그 라인 하나가 A단계 뒤에 붙어 그대로 반복된다.
라인 순서는 페이라인 인덱스 오름차순이다.

명판 문구는 `formatLineLabel(win)`으로 갈아끼운다. 렌더러는 번역을 모른다.
기본값은 `Line {n} · {배당}`이다.

`spinTo()`는 진행 중인 연출을 **즉시** 끊는다. 트윈을 죽이고 눌러 둔 밝기도 되돌린다.

순서와 길이는 `buildPresentation(wins, math, opts)`가 정하는 순수 데이터라 타이머 없이 검증한다.

## 심볼 연출 (`theme.json`의 `fx`)

심볼마다 승리 연출을 데이터로 지정한다. 코드 수정 없이 게임 팩에서 바꾼다.

```json
"fx": {
  "default": { "win": [{ "type": "pulse", "scale": 1.12, "durationMs": 600 }] },
  "wild":    { "win": [{ "type": "burst", "particles": 24 }, { "type": "glow", "color": "#f4d98a" }] },
  "blank":   { "win": [] }
}
```

| 타입 | 하는 일 | 고유 필드 |
|---|---|---|
| `pulse` | 커졌다 작아진다 | `scale` |
| `shine` | 심볼 모양 안에서 빛줄기가 대각선으로 지나간다 | `angle` (도) |
| `wobble` | 좌우로 갸웃거린다 | `degrees` |
| `bounce` | 위아래로 튄다 | `px` (심볼 높이 대비 비율) |
| `burst` | 파티클이 사방으로 퍼진다 | `particles` |
| `glow` | 뒤에서 광채가 번진다 | `color` |
| `flash` | 밝기가 깜빡인다 | `stagger`, `segments` |
| `spin` | 가로로 뒤집힌다 | 없음 |

공통 필드는 `durationMs`(기본 700), `loop`(기본 true), `intensity`(0~1, 기본 1),
그리고 `repeat`(유한 반복 횟수)다. `repeat`을 주면 그 횟수만 돌고 원래 상태로 멈춘다. `loop`보다 우선한다.

`flash`의 `segments`는 심볼을 가로 띠 N개로 나눠 **위에서 아래로** 차례로 번쩍이게 한다.
3단 BAR에 한 칸씩 불이 들어오는 연출이 이것이다. `stagger`가 켜져 있어야 순차로 흐르고,
꺼져 있으면 띠가 동시에 밝아진다. 상한은 6이다.

**한 심볼의 `win` 배열은 순서가 아니라 조합이다.** 안에 든 스텝이 전부 동시에 재생된다.

찾는 순서는 `fx[심볼id].win` → `fx.default.win` → 내장 pulse다.
**빈 배열은 "연출 없음"**이라 기본값으로 되돌아가지 않는다. `blank`를 조용히 두는 방법이다.

모션 축소에서는 pulse 하나만 남는다. 파티클은 전부 사라진다.

이벤트:

```ts
type RendererEvent =
  | { type: 'reelStop'; reel: number }
  | { type: 'spinEnd' }
  | { type: 'winTotal'; totalWin: number; tier: WinTier; durationMs: number }
  | { type: 'winLine'; line: number; win: number }
```

`winTotal`은 승리 연출 A단계가 **시작할 때** 총배당과 등급과 그 단계의 길이를 함께 준다.
허브는 `durationMs`에 맞춰 배당 카운터를 굴리고 `tier`로 배너를 고르면 된다.
`winLine`은 B단계에서 라인을 하나 짚을 때마다 온다.

### 승리 등급

`docs/REFERENCE_PRAGMATIC.md` §2의 업계 관행 구간을 그대로 쓴다. 기준은 **총 베팅액 대비 배수**다.

| 등급 | 배수 | A단계 길이 | 코인 | 색종이 |
|---|---|---|---|---|
| `none` | 10배 미만 | 900ms | 없음 | 없음 |
| `big` | 10배 이상 | 1600ms | 20개 | 없음 |
| `mega` | 20배 이상 | 2200ms | 35개 | 없음 |
| `epic` | 50배 이상 | 2200ms | 50개 | 없음 |
| `max` | 100배 이상 | 2200ms | 60개 | 36장 |

`winTier(wins, math, totalBet)`가 순수 함수로 등급을 낸다. `totalBet`을 생략하면 라인 배수 합으로 유도한다.

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
| 스핀 시작 | 모든 릴이 함께 위로 0.25칸 반동(110ms, `power2.out`) 후 아래로 튕겨 나간다 |
| 스핀 | 가속(`power2.in`) → 감속(`power2.out`) |
| 정지 순서 | 왼쪽 → 오른쪽, `stagger` 간격 (기본 160ms) |
| 정지 | 튕기지 않는다. 0.04칸(90ms)만 아주 짧게 자리를 잡는다 |
| 승리 연출 | A단계 900/1600/2200ms(등급별) → 라인당 1400ms, 전환 150ms |
| 승리 강조 | 브라스 광채 3겹 + 2px 테두리. 페이라인은 3px, 불투명도 0.6 |
| 은은한 연출 | 배경 반짝임 6~10개. 릴 창 위에는 놓지 않는다 |
| 빅윈 | 총배당이 베팅액의 **20배 이상**이면 코인 샤워 (스프라이트 60개 상한) |
| 모션 축소 | 전체 스핀 300ms 이하. 반동·마무리·파티클·반짝임 없음. 심볼 연출은 pulse만 |

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
| 캔버스로 그린 폴백 심볼·코인·반짝임·연출 텍스처 | **이 렌더러 인스턴스** | GPU 리소스까지 해제한다 |
| 크로마키를 다시 돌려 만든 프레임 텍스처 | **이 렌더러 인스턴스** | GPU 리소스까지 해제한다 |

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

- `frame`이 **있으면** 릴·마스크·페이라인 오버레이가 통째로 `window` 사각형 안으로 들어간다.
  창보다 릴이 작으면 가운데 정렬한다. 벡터 베젤은 그리지 않는다.
- 프레임 스프라이트는 릴 **위에** 얹는다. 창이 알파로 뚫려 있어야 릴이 비쳐 보인다
  (아트 파이프라인의 크로마키 절차가 그 구멍을 만든다). 창이 불투명하면 릴이 가려진다.
- `frame`이 **없으면** 지금까지의 벡터 베젤 경로를 그대로 탄다. 이미지 로딩이 실패해도 같은 경로로 되돌아간다.

### `fit`: 릴을 얼마나 크게 볼 것인가

| 값 | 캔버스 | 배율 기준 | 잘리는 것 |
|---|---|---|---|
| `'window'` (기본) | **언제나 컨테이너 전체** | 릴 창을 키우되 프레임이 세로로 다 들어오게 | 프레임 좌우 기둥 |
| `'width'` | 프레임 표시 크기 | 프레임 **전체**가 폭에 들어오도록 | 없음 |

프레임 전체를 폭에 맞추면 마퀴와 페이라인 레전드가 세로를 다 먹어 릴이 작아진다. 그래서:

```
scale = min(containerW * (1 + overflowX) / frameW,  containerH / frameH)
```

폭으로는 `overflowX`(기본 0.30)만큼 넘치게 두어 좌우 기둥을 잘라낸다.
세로 항이 프레임 전체 높이를 기준으로 하므로, **높이를 잰 컨테이너에서는 프레임이 세로로 절대 넘치지 않는다.**
마퀴와 레전드가 잘리지 않는다는 뜻이다.

캔버스는 언제나 컨테이너 전체다. 무언가를 자르는 것은 컨테이너의 `overflow`뿐이고 캔버스는 아니다.
프레임은 가로 가운데에 놓고, 세로로는 프레임 전체를 가운데 맞춘다.
높이를 아직 못 잰 동안에만 프레임이 컨테이너보다 커질 수 있고, 그때는 **창**을 가운데로 맞춘다.

넘친 프레임을 잘라내야 하므로 렌더러가 컨테이너의 `overflow`를 `hidden`으로 바꾼다.
원래 값은 기억해 두었다가 `destroy()`에서 되돌린다.

### 심볼 크기는 창 비율이 정한다

`overflowX`를 키워도 릴이 무한정 커지지는 않는다. 창보다 격자가 먼저 묶이기 때문이다.
classic-777 창은 가로가 세로보다 넓은데(386x321) 3x3 격자는 정사각형이라 **세로에 묶인다**.

현재 배포된 classic-777 프레임(창 `w 0.723, h 0.628`) 기준:

| 컨테이너 | 배율 | 프레임 | 창 | 심볼 |
|---|---|---|---|---|
| 390x760 | 0.469 | 506.7x760.0 | 366.4x477.2 | 117.4px |
| 390x844 | 0.469 | 507.0x760.5 | 366.6x477.5 | 117.5px |
| 430x932 | 0.518 | 559.0x838.5 | 404.2x526.5 | 129.6px |

창이 세로로 길어 격자가 **폭에 묶인다**. 이 상태가 심볼이 가장 커지는 배치다.
창이 다시 납작해지면(`h`가 작아지면) 격자가 세로에 묶여 심볼이 줄어든다.
그때는 `overflowX`가 아니라 **아트의 창 세로 비율**을 손봐야 한다.

순수 계산은 `frameWindowRect(frameW, frameH, window)`, `computeFrameLayout(...)`,
`computeWindowFitLayout(...)`이 맡고 셋 다 단위 테스트가 있다.

### 잔여 크로마키 제거

프레임 텍스처를 올리기 전에 CPU에서 초록 키잉을 한 번 더 돌린다.
아트 파이프라인의 디스필이 놓친 가장자리 초록이 릴 창 둘레에 남는 것을 막기 위해서다.

판정식은 `g > 140 && g > r + 50 && g > b + 50`(`isChromaGreen`)이다.
브라스(빨강 ≈ 초록)와 청록(파랑이 큼)은 걸리지 않는다.
**대신 채도 높은 초록은 무엇이든 뚫린다.** 프레임 아트에 초록 잎이나 보석을 넣으면 안 된다.

지울 초록이 없으면 텍스처를 새로 만들지 않고 원본을 그대로 쓴다.
크로스오리진 이미지라 픽셀을 못 읽는 경우에도 원본으로 되돌아가므로 프레임이 사라지지 않는다.

## 순수 로직 export

Pixi 없이도 쓸 수 있는 부분은 따로 내보낸다. 허브의 테스트와 레이아웃 계산에 쓰라고 열어 둔 것이다.

| export | 하는 일 |
|---|---|
| `stopsToGrid(math, stops)` | 엔진 `buildGrid`와 같은 값. 렌더 결과 검증용 |
| `symbolAt`, `reelStripWindow`, `wrapIndex` | 스트립 조회 |
| `normalizePosition`, `spinTargetPosition` | 릴 위치 계산 |
| `computeLayout`, `symbolCenter`, `paylinePoints`, `positionRects` | 기하 계산 |
| `frameWindowRect`, `computeFrameLayout`, `computeWindowFitLayout` | 프레임 아트 안의 릴 창 배치 |
| `buildSpinPlan` | 릴별 타이밍 계획. 반동 시간과 마무리 시간을 포함한다 |
| `isChromaGreen`, `keyOutGreen` | 잔여 크로마키 판정과 제거 |
| `planSparkles` | 배경 반짝임 배치. 릴 창을 피한다 |
| `buildPresentation`, `defaultLineLabel` | 승리 연출 순서와 길이 |
| `resolveSymbolFx`, `resolveFxEffect` | 심볼 연출 조회와 기본값 |
| `winTier`, `phaseAllDurationMs` | 승리 등급과 등급별 연출 길이 |
| `isBigWin`, `winBetMultiple`, `paylineColor`, `buildWinCycle`, `formatWinLabel` | 승리 연출 규칙 |
| `parseTheme`, `loadTheme`, `resolveSymbolSource`, `resolveFrameWindow` | 테마 검증·로딩 |

`src/pixi/*`만 `pixi.js`와 `gsap`을 import한다. 이 규칙은 테스트가 지킨다.
