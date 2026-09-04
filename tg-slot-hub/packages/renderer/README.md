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
| `onEvent` | `(e) => void` | 아래 이벤트 목록 참고 |
| `reducedMotion` | `boolean` | 미지정 시 `prefers-reduced-motion`을 따른다 |
| `fit` | `'window' \| 'width'` | 프레임을 맞추는 방식. 기본 `'window'` |
| `overflowX` | `number` | 프레임 폭 넘침 **상한**. 기본 0 = 좌우로 잘리지 않는다 |
| `paylineStyle` | `'effect' \| 'line'` | 당첨 라인 표시 방식. 기본 `'effect'` |
| `showFreeSpinsPlaque` | `boolean` | 프리스핀 명판을 릴 창 위에 띄울지. 기본 true |

### `SlotRenderer`

| 멤버 | 시그니처 | 하는 일 |
|---|---|---|
| `ready` | `Promise<void>` | 에셋 로딩과 첫 렌더 완료 |
| `spinTo` | `(stops, opts?: { speed?; durationMs?; stagger?; fast?; gridBefore?; mutations? }) => SpinHandle` | 릴을 돌려 `stops`에 **정확히** 멈춘다. `speed`는 이번 스핀만 덮어쓴다. `fast`면 회전이 0.8배로 짧아진다. `mutations`를 주면 착지 뒤에 변형 연출을 재생한다 |
| `showWins` | `(wins, opts?: { loop?; totalBet?; formatLineLabel?; features? }) => Promise<void>` | 아래 "승리 연출" 참고. 첫 바퀴가 끝나면 resolve |
| `skipWins` | `() => void` | 보고 있던 바퀴를 접는다. 순환은 계속된다 |
| `clearWins` | `() => void` | 승리 연출 즉시 정리 |
| `setSpinSpeed` | `(speed: 'normal' \| 'quick' \| 'turbo') => void` | 이후 스핀의 속도 프로파일 |
| `setSpinningIdle` | `(on: boolean) => void` | 대기 중 미세한 유휴 모션 |
| `setMode` | `(mode: { freeSpins?: { left, total, multiplier } \| null }) => void` | 프리스핀 표시를 켜고 끈다 |
| `resize` | `() => void` | 레이아웃 재계산. ResizeObserver가 자동 호출도 한다 |
| `destroy` | `() => void` | 트윈·옵저버·캔버스까지 해제 |

`showWins`에 `loop: true`를 주면 첫 바퀴가 끝난 시점에 resolve하고,
이후로는 `clearWins()`나 다음 `spinTo()`가 멈출 때까지 계속 순환한다.

### 스핀 속도

```ts
renderer.setSpinSpeed('turbo')            // 이후 모든 스핀
renderer.spinTo(stops, { speed: 'quick' }) // 이번 스핀만
```

프라그마틱 계열의 빠른 스핀/터보 스핀 관행을 따른다
(`docs/REFERENCE_PRAGMATIC.md` §3: 정지는 좌→우 순차, 릴당 0.1~0.2초 간격).

| 프로파일 | 회전 | 릴 간격 | 당김 | 마무리 | A단계 홀드 | 5릴 총 길이 |
|---|---|---|---|---|---|---|
| `normal` | 900ms | 160ms | 110ms | 90ms | 1.0배 | 약 1.65초 |
| `quick` | 500ms | 88ms | 60ms | 60ms | 1.0배 | 약 0.9초 |
| `turbo` | 380ms | 18ms | 없음 | 40ms | 0.55배 | 약 0.45초 |

터보는 당김을 생략하고 릴이 거의 동시에 선다. 배당 홀드까지 함께 줄이지 않으면 릴만 빨라지고
기다리는 시간은 그대로라 빨라진 느낌이 나지 않는다. 그래서 A단계 홀드에도 배율을 건다.

`durationMs`/`stagger`를 직접 주면 프로파일보다 그쪽이 이긴다. 프리스핀 `fast`(0.8배)는 프로파일
위에 겹쳐 적용된다. 모션 축소 설정은 언제나 이 모두보다 우선해 전체를 300ms 안으로 자른다.

### 스핀 건너뛰기

`spinTo`는 thenable 손잡이를 돌려준다. 기다리는 코드는 그대로 두고, 필요할 때만 접으면 된다.

```ts
await renderer.spinTo(stops)              // 예전처럼 그대로 된다

const spin = renderer.spinTo(stops)
onTap(() => spin.skip())                  // 남은 회전을 접는다
await spin.done
```

`skip()`은 남은 회전을 **버리고** 릴을 곧장 정지 위치로 스냅한다. 지금 어디에 있든 정지 위치
바로 위에 붙인 뒤 120ms 안에 내려앉기만 한다. 다시 속도를 붙이는 구간이 없다.

예전에는 남은 거리를 260ms에 몰아 지나갔는데, 스트립이 긴 게임에서는 그동안 심볼이 통째로 흘러
"다시 한 바퀴 돌다 멈춘다"로 보였다. 스냅은 남은 거리를 보지 않으므로 그 착시가 없다.
시작 당김 중에 눌러도 같다. 두 번 눌러도 처음 한 번만 듣는다.
왼쪽부터 짧은 간격은 남겨 한꺼번에 툭 서지 않게 한다.
착지 좌표는 원래 경로와 똑같이 `stops`로 확정되고 `reelStop`과 `spinEnd`도 정상적으로 발생한다.
이미 멈춘 뒤에 불러도, 초기화가 끝나기 전에 불러도 안전하다.

## 변형 연출 (`gridBefore` + `mutations`)

엔진은 릴이 그대로 멈춘 그리드(`SpinResult.gridBefore`)와 평가에 쓴 그리드(`SpinResult.grid`),
그 사이에 무엇이 일어났는지(`SpinResult.mutations`)를 함께 준다.
렌더러는 **`gridBefore`에 착지**한 뒤 변형을 순서대로 재생하고, 그 결과가 `grid`와 같아지도록 만든다.

```ts
const spin = renderer.spinTo(result.stops, {
  gridBefore: result.gridBefore,
  mutations: result.mutations,
})
await spin.done          // 착지 + 변형까지 끝난 뒤 resolve
await renderer.showWins(result.wins, { totalBet, features: result.features })
```

`spinEnd`는 변형까지 끝난 **뒤에** 나간다. 승리 연출은 변형이 끝난 그리드 위에서 시작해야 하기 때문이다.
`gridBefore`를 생략하면 `stops`와 스트립에서 되짚는다. 값은 같지만 넘겨주는 쪽이 한 번 덜 계산한다.

| 종류 | 화면 | 길이 | 얼굴이 바뀌는 시점 |
|---|---|---|---|
| `mystery` | 물음표 칸이 **동시에** 가로로 접혔다 펴지며 금빛이 터진다 | 600ms | 한가운데 (300ms) |
| `expandWild` | 브라스 기둥이 릴을 위아래로 덮고 빛줄기가 훑고 내려간다 | 700ms | 55% (385ms) |
| `upgrade` | 얼굴이 녹아 다른 얼굴로 바뀌는 크로스페이드 + 반짝임 | 550ms | 한가운데 (275ms) |
| `randomWild` | 와일드가 위에서 떨어져 튕기고 먼지가 퍼진다 | 650ms | 시작 (0ms) |

낙하만 칸마다 90ms씩 어긋나게 떨어진다. 리빌·승급·확장은 "일괄"로 읽혀야 하므로 동시에 움직인다.
칸이 많아도 어긋남의 총합은 단계 길이의 40%를 넘지 않는다.

모션 축소에서는 어느 종류든 200ms 동안 결과만 보여준다. 반복 애니메이션도 모션이다.
연출이 없어도 **머무는 시간은 그대로 지킨다.** 길이의 기준은 언제나 `buildMutationPlan`이고,
0ms에 닫아 버리면 계획이 말한 길이와 화면이 갈린다.

파티클은 스핀마다 새로 만들지 않고 풀에서 꺼내 쓴다. 리빌 한 번에 칸마다 십여 개가 나므로
매번 만들고 버리면 저사양 기기에서 GC로 끊긴다.

### 화면과 배당은 갈라질 수 없다

변형은 스트립에 **없는** 심볼을 칸에 앉힌다(물음표가 체리가 되는 식).
스트립만 읽고 다시 그리면 원래 심볼로 되돌아가므로, 변형이 끝난 칸은 별도의 층이 정한다.
그 층의 값은 순수 함수 하나가 만든다.

```ts
applyMutationEventsToGrid(result.gridBefore, result.mutations)  // === result.grid
```

이 등식은 테스트가 실제 엔진 스핀 수백 회로 직접 확인한다. 어긋나면 화면이 배당과 다른 것을 말하게 된다.

### 건너뛰기

`skip()`은 변형 중에도 듣는다. 재생 중인 단계는 곧장 끝나고, 아직 열지 않은 단계는 건너뛴 뒤
화면이 최종 그리드로 확정된다. 어떻게 끝나든 마지막 화면은 언제나 `SpinResult.grid`와 같다.

### 시트와 fx는 그때의 심볼로 찾는다

`fx`와 `sheets`는 심볼 id를 키로 쓴다. 변형으로 심볼이 바뀐 칸은 **바뀐 뒤의** 심볼로 찾는다.
렌더러가 그 자리에 실제로 그려진 심볼(`cell.symbol`)만 보기 때문에 별도 처리가 필요 없다.

## 승리 연출

프라그마틱 계열 슬롯의 순서를 따른다. 한 바퀴는 **A단계 → B단계**다.

| 단계 | 조건 | 길이 | 화면 |
|---|---|---|---|
| A "전체" | 승리 1개 이상 | 등급별 1260~3080ms | 이긴 심볼이 **동시에** 연출되고 전부 브라스 테두리를 두른다. 나머지는 α 0.5로 눌린다. 페이라인 선만 아직 안 그린다 |
| 피처 | 프리스핀 트리거 있음 | 900ms | 스캐터 자리에서 파티클이 창 가운데로 모인다 |
| B "라인별" | 승리 1개 이상 | 라인당 1900ms | 그 라인 심볼만 연출되고 둘레에 같은 테두리가 선다 |

두 단계는 **같은** 테두리를 쓴다(`drawWinGlow`). A단계에만 테두리가 빠져 전체 연출에서 광채가
사라져 보이던 문제를 그렇게 막는다.

스텝이 바뀔 때는 220ms 크로스페이드로 넘긴다. 모션 축소에서는 즉시 전환한다.
A단계 홀드는 스핀 속도를 탄다(터보는 0.55배). B단계는 읽는 시간이라 속도와 무관하다.

승리가 하나뿐이어도 A단계 뒤에 그 라인 하나가 B단계로 붙는다.
라인 순서는 페이라인 인덱스 오름차순이다.

라인 문구는 렌더러가 릴 위에 찍지 않는다. `winLine` 이벤트를 받아 **허브가 릴 밖에** 그린다.
`ShowWinsOptions.formatLineLabel`은 @deprecated이고 지금은 무시된다.

`spinTo()`는 진행 중인 연출을 **즉시** 끊는다. 트윈을 죽이고 눌러 둔 밝기도 되돌린다.

### 연출은 다음 스핀까지 순환한다

`showWins(wins)`는 기본값 `loop: true`로 A→B→A를 계속 반복한다. 승리가 하나뿐이어도
매 바퀴 하이라이트와 심볼 연출을 다시 터뜨리므로 주기적인 루프로 읽힌다.

돌려주는 약속은 **첫 바퀴**(A단계 + B단계 한 바퀴)가 끝나면 resolve한다. 허브 store는 이걸
기다렸다 `showingWin`을 빠져나가고, 화면은 그 뒤로도 계속 돈다. 순환을 끊는 것은 네 가지다 —
다음 `spinTo()`, `clearWins()`, `destroy()`, 그리고 배경이 바뀌는 `setMode()` 전환.

`loop: false`면 한 바퀴만 돌고 멈춘다. 코인과 색종이는 어느 쪽이든 첫 바퀴에서 한 번만 터진다.

```ts
renderer.skipWins()   // 보고 있던 바퀴를 곧장 접는다
```

`skipWins()`는 지금 바퀴를 접고 `showWins()`의 약속을 그 자리에서 resolve한다. 순환은 멈추지
않는다 — 접은 자리에서 다음 바퀴가 A단계부터 다시 시작한다. 접힌 바퀴의 남은 라인은 그리지도
`winLine`을 내지도 않고, 다음 바퀴부터 정상적으로 다시 나온다. 배당 롤업을 접는 것은 허브의
몫이다. 렌더러는 릴 위 타임라인만 접는다.

순서·길이·순환은 `runPresentation(steps, { render, wait, cancelled, loop })`가 정한다.
돌려주는 손잡이는 `{ firstPass, skip }`이다. 타이머를 직접 만들지 않고 `wait`를 받아 쓰는 순수
로직이라 바퀴 수와 이벤트와 스킵 동작을 그대로 검증한다.

### 당첨 라인은 선이 아니라 광채다

기본값(`paylineStyle: 'effect'`)에서는 **선을 긋지 않는다.**
당첨 심볼 둘레에 브라스 광채가 서고 그 심볼이 자기 fx(스케일 맥동 등)를 터뜨린다.
나머지 심볼은 눌린 채로 남는다. 움직이며 훑고 지나가는 빛은 없다 — 시선을 끌고 다니는 대신
"이 자리들이 이겼다"를 한 화면에 정지 상태로 보여준다.

`paylineStyle: 'line'`로 두면 예전 3px 폴리라인을 덧그린다. 좌표를 눈으로 확인할 때만 쓴다.
모션 축소에서는 크로스페이드 없이 다음 스텝으로 곧장 넘어간다. 순환 자체는 그대로 돈다.

### 스캐터와 프리스핀

`showWins(wins, { features })`에 서버가 준 `FeatureTrigger[]`를 그대로 넘긴다.
모양은 `@tgslot/shared`의 `FeatureTriggerSchema`와 같다.

- `scatterWin.positions`의 자리는 **연출 내내 어두워지지 않는다.** 스캐터는 페이라인과 무관하게
  이긴 자리라, 라인 순환 중에 눌리면 근거가 사라진다. 금빛 링이 맥동하고 페이라인은 그리지 않는다.
- `freeSpins`가 있으면 A단계 뒤에 피처 단계가 한 번 끼어 `featureTriggered`를 쏘고
  스캐터 자리에서 창 가운데로 알갱이가 모인다. 코인 샤워가 바깥으로 쏟아지는 것과 반대 방향이다.
- 라인 승리가 없고 스캐터만 이겨도 A단계와 피처 단계는 나온다.

### 프리스핀 진행 표시

```ts
renderer.setMode({ freeSpins: { left: 7, total: 10, multiplier: 2 } })
renderer.setMode({ freeSpins: null })   // 되돌리기
```

릴 창 테두리에 금빛을 두르고 위쪽에 `FREE SPINS 7/10 ×2` 명판을 띄운다.
배수가 1이면 `×1`을 붙이지 않는다. 정보가 없고 시야만 어지럽히기 때문이다.
허브가 자체 카운터를 이미 보여준다면 `showFreeSpinsPlaque: false`로 명판만 끌 수 있다.
`setMode`는 `ready` 전에 불러도 잃지 않는다. 초기화가 끝나면 적용된다.

#### 배경 전환

프리스핀이 **켜지거나 꺼지는 순간에만** 700ms 전환이 돈다.
금빛 섬광이 시선을 한 번 끊고, 그 틈에 방사형 와이프가 배경을 교차시키며,
릴 창 테두리 광채가 함께 차오른다. 끝날 때는 같은 절차를 반대로 재생한다.

남은 횟수나 배수가 바뀌었다고는 **다시 돌지 않는다.** 매 스핀 화면이 번쩍이면 피곤하기 때문이다.
판정은 `modeTransitionTarget(previous, next)`가 맡는 순수 함수다.

배경은 `theme.json`의 `backgroundFreeSpins`를 쓴다. 없으면 기본 배경 위에
금빛 틴트를 덧씌워 **같은 전환**을 낸다. 이미지가 없다고 전환이 사라지지는 않는다.

전환 시작과 끝에 `modeTransition` 이벤트가 온다.

프리스핀 중에는 `spinTo(stops, { fast: true })`로 회전을 0.8배로 당기는 것을 권한다.

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
| `sheet` | 스프라이트 시트를 재생한다 | 없음 (`theme.sheets`가 그림을 정한다) |

공통 필드는 `durationMs`(기본 700), `loop`(기본 true), `intensity`(0~1, 기본 1),
그리고 `repeat`(유한 반복 횟수)다. `repeat`을 주면 그 횟수만 돌고 원래 상태로 멈춘다. `loop`보다 우선한다.

`flash`의 `segments`는 심볼을 가로 띠 N개로 나눠 **위에서 아래로** 차례로 번쩍이게 한다.
3단 BAR에 한 칸씩 불이 들어오는 연출이 이것이다. `stagger`가 켜져 있어야 순차로 흐르고,
꺼져 있으면 띠가 동시에 밝아진다. 상한은 6이다.

**한 심볼의 `win` 배열은 순서가 아니라 조합이다.** 안에 든 스텝이 전부 동시에 재생된다.

## 스프라이트 시트 (`theme.json`의 `sheets`)

정지 이미지 대신 프레임 애니메이션을 재생한다. 절차적 연출로는 못 만드는 움직임에 쓴다.

```json
"sheets": { "seven": { "win": "sheets/seven.json" } }
```

값은 **사이드카 JSON 경로**다. 아틀라스 이미지는 같은 이름의 `.webp`라 따로 적지 않는다.

```json
{ "frameW": 256, "frameH": 256, "cols": 4, "rows": 2,
  "count": 8, "fps": 24, "symbol": "seven",
  "frames": [{ "x": 0, "y": 0, "w": 256, "h": 256 }] }
```

`parseSpriteSheet`가 `count`와 `frames` 개수가 맞는지, 격자 용량을 넘지 않는지,
프레임이 아틀라스 밖을 가리키지 않는지 검사한다. 하나라도 어긋나면 시트를 쓰지 않는다.

동작:

- 승리 연출 동안 정지 스프라이트를 **숨기고** `AnimatedSprite`를 그 자리에 올린다.
  원본 텍스처는 건드리지 않으므로 연출이 끝나면 그대로 돌아온다.
- 크기는 `frameW`를 심볼의 실제 폭에 맞춰 유지한다. 프레임마다 폭이 달라도 흔들리지 않는다.
- `fx`에 적어 둔 절차적 연출은 시트 **위에 겹쳐** 재생된다.
  겹치기가 싫으면 `"fx": { "seven": { "win": [{ "type": "sheet" }] } }`처럼 시트만 선언한다.
- 아틀라스가 없거나 검증에 실패하면 조용히 절차적 연출로 돌아간다.
  시트만 선언한 심볼도 내장 pulse를 받아 아무 반응 없는 상태가 되지 않는다.
- 모션 축소에서는 재생하지 않는다. 반복 애니메이션도 모션이다.

시트는 **처음 쓸 때** 불러온다. 아직 준비되지 않았으면 그 판은 절차적 연출로 보여주고,
도착하는 즉시 갈아 끼운다. 같은 URL은 한 번만 받아 renderer 인스턴스끼리 나눠 쓴다.

프레임 텍스처는 아틀라스 원본을 잘라 본 것이라 `TextureRegistry`에 넣지 않는다.
등록해서 함께 파괴하면 `Assets` 캐시에 남은 원본까지 죽는다.

### 그룹 배당과 연출 조회

연출은 **그 자리에 실제로 보이는 심볼**로 찾는다. `WinLine.symbol`로 찾지 않는다.

Any BAR 같은 그룹 배당에서 `win.symbol`은 그룹 id(`anybar`)라 테마에 그런 심볼이 없다.
그것으로 찾으면 라인 전체가 `default` 하나로 뭉개진다.
격자를 보고 찾으면 한 라인 안에서 BAR 1·2·3이 각자의 연출을 낸다.

```ts
resolveFxForPositions(theme.fx, grid, win.positions, reducedMotion)
// -> [{ position, symbol: 'bar1', effects }, { symbol: 'bar2', ... }, ...]
```

문구만은 그룹 이름을 쓴다. `winLine` 이벤트가 `symbol`/`group`/`count`/`ways`를 id 그대로 실어
보내고, 사람이 읽을 이름과 번역은 허브가 붙인다. 렌더러는 번역을 모른다.

찾는 순서는 `fx[심볼id].win` → `fx.default.win` → 내장 pulse다.
**빈 배열은 "연출 없음"**이라 기본값으로 되돌아가지 않는다. `blank`를 조용히 두는 방법이다.

모션 축소에서는 pulse 하나만 남는다. 파티클은 전부 사라진다.

이벤트:

```ts
type RendererEvent =
  | { type: 'reelStop'; reel: number }
  | { type: 'spinEnd' }
  | { type: 'winTotal'; totalWin: number; tier: WinTier; durationMs: number }
  | { type: 'winCycle'; cycle: number; totalWin: number }
  | {
      type: 'winLine'
      line: number
      win: number
      symbol: string
      count: number
      ways?: number
      group?: string
      direction?: 'ltr' | 'rtl'
      index: number
      total: number
      cycle: number
    }
  | { type: 'featureTriggered'; feature: FeatureTrigger }
  | { type: 'modeTransition'; to: 'freeSpins' | 'base'; phase: 'start' | 'end' }
  | { type: 'mutation'; mutation: MutationEvent; symbol?: SymbolId; phase: 'start' | 'end' }
```

`winTotal`은 승리 연출 A단계가 **시작할 때** 총배당과 등급과 그 단계의 길이를 함께 준다.
허브는 `durationMs`에 맞춰 배당 카운터를 굴리고 `tier`로 배너를 고르면 된다.
`winCycle`은 A단계가 시작할 때마다 온다. `cycle`은 0부터 늘어나는 바퀴 번호다.
`winLine`은 B단계의 매 스텝 **시작**에 온다. 허브가 릴 밖에 문구를 그리는 데 필요한 것을 전부
싣는다 — 심볼/그룹은 id 그대로이고, `index`/`total`은 이번 바퀴에서의 자리, `cycle`은 바퀴 번호다.
`featureTriggered`는 프리스핀에 걸렸을 때 A단계가 끝나고 스캐터 연출이 시작하며 온다.
인트로 배너는 허브가 띄운다. 렌더러는 릴 위 연출만 맡는다.
`modeTransition`은 배경 전환의 시작과 끝에 **정확히 한 번씩** 온다.
전환이 중간에 끊겨도 `end`는 반드시 나가므로, 이 신호를 기다리는 쪽이 매달릴 일이 없다.
`mutation`은 변형 한 단계의 시작과 끝에 **정확히 한 번씩** 온다.
아직 시작하지 않은 단계를 `skip()`으로 건너뛰면 그 단계는 `start`도 `end`도 내지 않는다.
`symbol`은 `mutation.symbol`과 같은 값을 맨 위로 올려 둔 것이다.
배너가 "무엇으로 바뀌었는지"를 한 단계 더 들어가지 않고 읽으라고 있다.

### ways 게임 (`math.payModel === 'ways'`)

페이라인이 없으므로 선을 그릴 좌표 자체가 없다. 렌더러는 선 대신 광채만 쓴다.

- B단계가 **라인 하나씩**이 아니라 **이긴 심볼 하나씩**이다. 배당이 큰 심볼부터 보여준다.
- 강조 범위는 그 심볼이 걸린 릴별 칸 **전부**다 (엔진이 `positions`에 그대로 담아 준다).
- 기본 문구(`defaultLineLabel`)는 `{심볼} × {경로 수} ways · {배당}`이다. 실제 표시는 허브가 맡는다.
- 경로 수는 `WinLine.ways`를 쓰고, 없으면 좌표에서 릴별 칸 수의 곱으로 되짚는다.
- `bothWays` 게임에서 오른쪽으로 읽은 승리는 `winLine` 이벤트의 `direction: 'rtl'`로 나간다.
- A단계는 겹친 좌표를 하나로 줄인 뒤 연출을 건다. ways에서는 여러 심볼이 같은 칸을 겹쳐 짚는다.

승리 등급도 그대로 동작한다. `totalBet`을 생략했을 때만 계산식이 다르다:
라인 게임은 배수 합을 라인 수로 나누지만, ways 게임은 `경로 수 × 배수`의 합을 `ways.betDivisor`로 나눈다.
ways에는 페이라인이 없어 라인 수로 나누면 0으로 나누게 된다.

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
| 승리 연출 | A단계 1260/2240/3080ms(등급별) → 라인당 1900ms, 전환 220ms |
| 당첨 라인 | 선 없음. 이긴 자리에 고정 광채 + 심볼 fx. 승리 연출은 다음 스핀까지 순환한다 |
| 스킵 | 남은 회전 없이 정지 위치로 스냅. 120ms 안에 내려앉고 왼쪽부터 순서대로 |
| 승리 강조 | 브라스 광채 3겹 + 2px 테두리. 페이라인은 3px, 불투명도 0.6 |
| 은은한 연출 | 배경 반짝임 6~10개. 릴 창 위에는 놓지 않는다 |
| 빅윈 | 총배당이 베팅액의 **10배 이상**이면 등급이 붙고 코인 샤워 (60개 상한) |
| 모션 축소 | 전체 스핀 300ms 이하. 반동·마무리·파티클·반짝임·크로스페이드 없음. 심볼 연출은 pulse만 |

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
| `backgroundFreeSpins` | 프리스핀 중 배경. 없으면 금빛 틴트로 대신 | 없음 |
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
| `'window'` (기본) | **언제나 컨테이너 전체** | 릴 **창**을 키우되 프레임이 가로·세로로 다 들어오게 | 없음 (`overflowX: 0` 기준) |
| `'width'` | 프레임 표시 크기 | 프레임 **전체**가 폭에 들어오도록 | 없음 |

```
sideMargin = max(window.x, 1 - window.x - window.w)
footprint  = window.w + 2 * sideMargin
scale = min(
  containerW / (window.w * frameW),                  // 창이 컨테이너 폭을 채우는 배율
  containerW * (1 + overflowX) / (frameW * footprint), // 프레임이 좌우로 잘리지 않는 배율
  containerH / frameH,                                // 프레임이 세로로 잘리지 않는 배율
)
```

기본값 `overflowX: 0`에서는 둘째 항이 상한이라 **프레임이 좌우로 잘리지 않는다.**
예전 기본값 0.4는 창을 컨테이너 폭까지 키우는 대신 기둥과 레일을 밖으로 밀어냈고,
실제 화면에서 양옆이 잘려 보였다. 지금은 창이 조금 좁아지는 쪽을 택한다.

`footprint`는 **창을 가로 가운데에 두었을 때** 프레임이 실제로 요구하는 폭이다.
창이 아트 정중앙이면 프레임 폭 그대로이고, 한쪽으로 치우쳐 있으면 넓은 쪽 여백이 두 번 들어가
그만큼 배율이 더 줄어든다. 이걸 빼면 치우친 아트가 한쪽만 잘린다.

세로 항이 프레임 전체 높이를 기준으로 하므로, **높이를 잰 컨테이너에서는 프레임이 세로로도 넘치지 않는다.**

캔버스는 언제나 컨테이너 전체다. 프레임은 창을 가로 가운데에 두고, 세로로는 프레임 전체를
가운데 맞춘다. 높이를 아직 못 잰 동안에만 프레임이 컨테이너보다 커질 수 있고, 그때는
**창**을 가운데로 맞춘다.

`overflowX`를 0보다 크게 주면 예전처럼 좌우를 잘라내며 릴을 키울 수 있다. 그 경우를 위해
렌더러가 컨테이너의 `overflow`를 `hidden`으로 바꾼다. 원래 값은 기억해 두었다가
`destroy()`에서 되돌린다.

### 심볼 크기는 창 비율이 정한다

릴 크기는 창 비율과 격자 비율 중 더 빡빡한 쪽이 정한다. 좌우를 자르지 않기로 하면서
창 폭은 "컨테이너 폭 x `window.w`"가 되었고, 심볼도 그만큼 작아졌다.

classic-777 프레임(1080x1620, 창 `w 0.762, h 0.422`) 기준:

| 컨테이너 | 배율 | 프레임 | 창 | 심볼 | 예전(잘림 허용) |
|---|---|---|---|---|---|
| 390x760 | 0.361 | 390.0x585.0 | 297.2x246.9 | 79.2px | 102.8px |
| 360x640 | 0.333 | 360.0x540.0 | 274.4x228.0 | 73.1px | 94.9px |
| 430x932 | 0.398 | 430.0x645.0 | 327.7x272.3 | 87.3px | 113.4px |

심볼을 다시 키우려면 두 가지 길뿐이다. `overflowX`를 올려 좌우를 다시 자르거나,
**아트에서 창을 넓히는** 것이다. 후자가 잘림 없이 릴을 키우는 유일한 방법이다.

### 격자 비율과 창 비율

심볼 크기는 창 비율과 격자 비율 중 **더 빡빡한 쪽**이 정한다.

| 격자 | 격자 비율 | 묶이는 축 |
|---|---|---|
| 3x3 | 1.0 | 창이 세로로 길면 폭, 가로로 넓으면 세로 |
| 5x3 | 약 1.68 | 비율 1.68 미만인 창에서는 언제나 폭 |

5x3은 격자 자체가 가로로 길어, 기획된 넓은 창(x 6~94%, y 22~70%, 비율 1.22)에서도
**폭이 먼저 찬다.** 세로가 기준이 되려면 창 비율이 1.68을 넘어야 한다.
심볼은 어느 쪽이든 정사각형이다. 한 변 하나로 가로세로를 모두 잡기 때문이다.

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
| `dedupePositions` | 겹친 좌표를 하나로. ways 승리가 같은 칸을 겹쳐 짚을 때 쓴다 |
| `normalizePosition`, `spinTargetPosition` | 릴 위치 계산 |
| `computeLayout`, `symbolCenter`, `paylinePoints`, `positionRects` | 기하 계산 |
| `frameWindowRect`, `computeFrameLayout`, `computeWindowFitLayout` | 프레임 아트 안의 릴 창 배치 |
| `buildSpinPlan` | 릴별 타이밍 계획. 반동 시간과 마무리 시간을 포함한다 |
| `isChromaGreen`, `keyOutGreen` | 잔여 크로마키 판정과 제거 |
| `planSparkles` | 배경 반짝임 배치. 릴 창을 피한다 |
| `buildPresentation`, `defaultLineLabel` | 승리 연출 순서와 길이 |
| `runPresentation`, `lineStepCount`, `winLineEvent` | 순환 재생과 `winLine` 이벤트 조립 |
| `resolveSymbolFx`, `resolveFxEffect` | 심볼 연출 조회와 기본값 |
| `resolveFxForPositions`, `symbolsAtPositions` | 승리 좌표별 심볼과 연출 (그룹 배당 대응) |
| `parseSpriteSheet`, `sheetFrameIndexAt`, `planSheetFx` | 시트 검증, 프레임 타이밍, 시트/절차 혼합 규칙 |
| `winTier`, `phaseAllDurationMs` | 승리 등급과 등급별 연출 길이 |
| `buildSkipPlan` | 스킵했을 때 릴별 착지(정착) 시간 |
| `spinSpeedProfile` | 속도 프로파일별 타이밍 표 |
| `applyMutationEventsToGrid` | 착지 그리드에 변형을 얹는다. 엔진 `SpinResult.grid`와 같아야 한다 |
| `buildMutationPlan` | 변형 재생 순서·길이·단계별 그리드 |
| `mutationDurationMs`, `mutationCommitMs`, `mutationCellDelayMs` | 변형 타이밍 규칙 |
| `mutationReels` | 확장 와일드가 덮은 릴 |
| `isWaysGame`, `isBothWays`, `betUnitCount` | ways 게임 판정과 배당 단위 |
| `waysCountOf`, `waysDirectionOf`, `isWaysWin` | ways 승리의 경로 수·방향·판별 |
| `defaultWaysLabel`, `sortWaysWins` | ways 명판 문구와 재생 순서 |
| `scatterPositions`, `findFreeSpins` | 피처 트리거에서 좌표와 프리스핀 뽑기 |
| `formatFreeSpinsPlaque`, `shouldShowFreeSpinsPlaque` | 프리스핀 명판 문구와 표시 판정 |
| `modeTransitionTarget`, `buildModeTransition` | 배경 전환 여부와 구간 타이밍 |
| `isBigWin`, `winBetMultiple`, `paylineColor`, `buildWinCycle`, `formatWinLabel` | 승리 연출 규칙 |
| `parseTheme`, `loadTheme`, `resolveSymbolSource`, `resolveFrameWindow` | 테마 검증·로딩 |

`src/pixi/*`만 `pixi.js`와 `gsap`을 import한다. 이 규칙은 테스트가 지킨다.
