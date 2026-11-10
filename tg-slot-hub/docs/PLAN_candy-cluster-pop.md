# candy-cluster-pop (#6) 구현 계획 (보너스를 주문 카드 라운드로 바꾼 개정판)

작성일 2026-11-10 · 대상: `tg-slot-hub` 웨이브 2 첫 게임
정본 문서: `docs/WAVE2_DESIGN.md`(§2 #6, §3~§10), `docs/GAME_CATALOG.md` §2 #6, `docs/ROADMAP_NEXT.md` §1-2

**개정 요약.** 사용자 요구는 "일반적인 프리스핀 피쳐보단 먼가 재밌는 피쳐스핀"이다. 그래서 보너스를 일반 프리스핀에서 **주문 카드 라운드**로 바꿨다(§A). 아래 모든 절은 이 결정에 맞춰 다시 썼다. 앞선 초안의 "프리스핀 중 사다리 이월"은 없앴고, 그 자리에 들어가던 스핀 간 상태 장치는 주문 진행도를 저장하는 데 쓴다.

---

## A. 보너스 라운드 결정

### A-1. 후보 3개

모두 연쇄와 클러스터 위에 얹는 규칙이다. 특정 상용 슬롯을 그대로 옮긴 것은 없다.

**후보 1 — 주문 카드 라운드**

출발점은 WAVE2 §9의 진행 미터(리서치 5.5)와 트레일 보드(#15)다. 이것을 "라운드 안의 목표"로 바꿨다.

- **플레이 경험.** 스캐터 4개로 라운드가 열리면 릴 위에 주문 카드 3장이 깔린다(예: "빨간 물방울 30개 터뜨리기", "한 번에 10개 이상 클러스터", "한 스핀에 연쇄 4번"). 카드마다 상품(총 베팅 ×5 등)이 적혀 있다. 8스핀 동안 터뜨린 사탕이 해당 카드로 날아가 진행 막대를 채운다. 카드를 채우면 도장이 찍히고 상품이 바로 지급된다. 스핀이 2회 늘고, 빈자리에는 새 카드가 들어온다.
- **다르게 느껴지는 점.** 승리를 기다리는 대신 **목표를 쫓는다.** 어떤 사탕이 터지는지가 매 연쇄마다 의미를 가진다. 퍼즐 게임 레벨 같은 감각이 캔디 테마와 맞는다.
- **비용.** 엔진은 중간이다. 주문 풀 추첨, 스핀 끝 진행 집계, 상품 지급, carry 저장이 필요하다. 렌더러는 작다. 칸 화면 좌표만 내주면 되고, 카드와 토큰 애니메이션은 허브 DOM이 맡는다.
- **RTP·변동성 위험.** 낮음~중간. 상품이 유한 고정 배수라 꼬리가 짧다. 상품 표가 **선형 손잡이**다(상품을 2배로 올리면 상품 몫도 정확히 2배). 라운드 길이는 `8 + 2 × maxOrders`로 묶여 있다.
- **#7·#13으로의 연결.** 진행 집계는 `CascadeOutcome`만 읽는 순수 함수(`tallyOrders`)다. #7(아무 위치 개수), #13(ways·가변 행)에도 그대로 붙는다. `RoundCarry`, 서버 저장, 카드 UI(`OrderBoard`)는 범용 목표 카드라 이후 게임이 재사용한다.

**후보 2 — 색깔 항아리 승급 라운드**

출발점은 WAVE2 §10 I2(운명 릴의 특정 심볼 우대)와 §9 심볼 업그레이드 미터다.

- **플레이 경험.** 라운드 동안 하위 사탕 5색마다 항아리가 있다. 그 색이 터질 때마다 항아리가 찬다. 항아리가 가득 차면 그 색 사탕이 판과 스트립 전체에서 한 등급 위 사탕으로 바뀐다. 라운드가 진행될수록 판이 고급 사탕으로 물든다.
- **다르게 느껴지는 점.** 판 자체가 점점 비싸진다. 눈에 보이는 성장이다.
- **비용.** 엔진은 중간~큼이다. 스트립과 리필에 심볼 치환 층이 필요하고, 해석식이 전혀 없다. 렌더러는 중간이다. 판 전체 치환 연출과 스트립 렌더 치환이 필요하다.
- **RTP·변동성 위험.** **높음.** 치환이 클러스터 발생률과 연쇄 길이를 동시에 바꿔 감도가 극단적으로 비선형이다. 승급이 겹치면 상위 심볼 밀도가 폭증해 꼬리가 길어진다.
- **#7·#13으로의 연결.** 심볼 치환 층은 #13의 프리스핀 초기 그리드 미스터리와 일부 겹친다. #7에는 쓸 곳이 적다.

**후보 3 — 폭탄 사탕 라운드**

출발점은 WAVE2 §2 #7의 "리필 칸에서만 오브 스폰" 규칙이다. 스폰 대상을 오브 대신 폭탄으로 바꿨다.

- **플레이 경험.** 라운드 동안 리필 칸에 폭탄 사탕이 확률로 섞여 떨어진다. 폭탄이 클러스터에 끼어 터지면 주변 3×3을 함께 지우고, 그 자리를 다시 채운다. 연쇄가 길어진다.
- **다르게 느껴지는 점.** 큰 폭발과 판 정리가 보는 맛이다. 다만 흔한 연출이라 새로움은 낮다.
- **비용.** 엔진은 중간이다. 리필 스폰 RNG와 범위 제거가 필요하다. 렌더러는 중간이다. 폭발 이펙트와 범위 강조가 필요하다.
- **RTP·변동성 위험.** 중간~높음. 폭탄이 연쇄를 다시 일으켜 `P(지속)`이 오른다. `maxCascades` 도달률 관리가 필요하다.
- **#7·#13으로의 연결.** 리필 스폰 RNG 경로가 #7 오브와 **똑같다.** #7 엔진을 먼저 만드는 효과가 있다.

### A-2. 점수 (5점 만점)

| 후보 | 재미·새로움 | 430px 판독성 | 엔진 비용(높을수록 쌈) | 수학 튜닝 용이 | 합계 |
|---|---:|---:|---:|---:|---:|
| 1 주문 카드 라운드 | 5 | 4 | 4 | **5** | **18** |
| 2 색깔 항아리 승급 라운드 | 4 | 4 | 2 | 1 | 11 |
| 3 폭탄 사탕 라운드 | 3 | 3 | 3 | 3 | 12 |

### A-3. 선택: 주문 카드 라운드

1. **가장 덜 "프리스핀 같다".** 승리에 배수만 곱해 주는 라운드가 아니다. 목표·진행·완료 도장이라는 다른 동사를 준다. 캔디 테마와 퍼즐 감각이 정확히 맞는다.
2. **튜닝이 가장 쉽다.** 상품 몫은 상품 표에 선형이다. 클러스터 RTP를 먼저 맞춘 뒤 상품 표를 한 번 비례 조정하면 라운드 몫(8.5%p)이 맞는다. 꼬리가 유한해서 n*도 앞선 초안(프리스핀 사다리 이월)보다 작게 예상된다.
3. **430px에서 읽힌다.** 카드 3장은 폭에 묶이는 6×5 격자 위의 남는 세로 공간에 들어간다. 글자는 릴 밖(DOM)에만 둔다(UX 4차 규칙).
4. **재사용성이 좋다.** 집계 함수, carry, 카드 UI가 #7·#13에 그대로 간다. 후보 3의 장점(오브 경로 선행)은 #7에서 어차피 만든다.

---

## 0. WAVE2_DESIGN을 지금 코드와 대조한 결과 (낡은 부분)

| # | WAVE2 원문 | 지금 코드 | 이 계획의 결정 |
|---|---|---|---|
| O1 | "웨이브 1 5종", "웨이브 2 다섯 종 전부 1024×1024" | live는 **6종**이다. astral-clocktower(4×5, 625 ways) 프레임은 **1024×1536 세로**다 | 비트 동일 회귀 대상은 6종이다. candy는 1024×1024를 쓴다. |
| O2 | §3-1 "0나눗셈 4곳" | `spinner.ts`와 `audit-cli.ts`는 이미 `getBetUnit`에 위임한다. 남은 곳은 `spin.ts getBetUnit`, `analytic.ts:216`, `compute.ts:98·381`(`totalBet/lines` → Infinity), `mutations.ts probeGain`(안전), **`schema.ts:271-333`**, `renderer/src/ways.ts:19`, `hub GameScreen.tsx:842·1674`, `hub GameCard.tsx:47`이다. `schema.ts`에서는 `unitCount = 0`이면 `level % 0 = NaN`이라 **정수 지급 검사가 조용히 건너뛰어진다** | E1에서 8곳을 고친다. |
| O3 | RNG 계약은 엔진에만 둔다 | **`spinner.ts drawSpin`이 `spinUnchecked`의 순서를 복제한다.** 주석은 "export 안 됨"이라 하지만 `index.ts`가 이미 export한다. 연쇄와 주문 추첨을 엔진에만 넣으면 감사 도구는 다른 게임을 잰다 | T1의 첫 작업은 `drawSpin`을 `spinUnchecked` 호출로 바꾸는 것이다. |
| O4 | §3-3 `RoundState.cascade?`, `persistMultiplier?` 등 필드를 평평하게 나열 | 스핀 안의 값은 `RoundState`에 들어갈 이유가 없다. 저장 형태는 shared `FreeSpinsState`이고, `game_states.state` jsonb 컨테이너는 이미 있다 | `RoundState.carry?: RoundCarry` 하나를 둔다. #6은 `carry.orders`를 쓰고, 저장은 `FreeSpinsState.carry`로 한다. 새 컬럼은 없다. |
| O5 | §3-4 `round.maxWinCap` 5000× 전 게임 공통 | "live 6종 비트 동일"과 충돌한다 | **팩별 opt-in**이다. |
| O6 | §3-5 `cascades`를 항상 둔다, `grid` = 마지막 연쇄 그리드 | 기존 계약은 `applyMutationEventsToGrid(gridBefore, mutations) === grid`다 | `cascades?`와 `finalGrid?`는 선택 필드로 연쇄 팩에만 싣는다. `grid`의 뜻은 유지한다. |
| O7 | §4-6 B단계가 중간 그리드를 되짚어 그린다 | 착지한 판에서 심볼이 바뀌어 보인다(사용자 불만) | 강조는 연쇄 재생 중에 한다. 끝난 뒤 `showWins`는 A단계와 피처만 보여 준다. |
| O8 | §4-1 `skip()`은 즉시 확정 | 지금 규칙은 압축 재생(`SKIP_MUTATION_MS = 260`)이다 | 연쇄도 압축 재생한다. |
| O9 | §4-1 예산 모드 3개 | `normal / quick / turbo` + 모션 축소로 4행이다 | quick 행을 추가한다. |
| O10 | §4-3 미터를 캔버스에 그린다 | UX 4차에서 릴 위 텍스트를 전부 없앴다 | 사다리 미터와 주문 카드는 **허브 DOM**이다. |
| O11 | §5-3 디버그 탐색이 락을 막을 것이라 우려 | 락은 15s다. 스핀 1회 약 20~30µs × 5,000이면 약 0.15s다 | 기본 5,000을 유지한다. 지연 테스트만 둔다. |
| O12 | §6 멱등 재전송은 결정론 재실행 | 지금은 저장된 `gridBefore`/`mutations`로 다시 조립한다 | `rounds.cascades`와 `rounds.state_before` jsonb를 저장해 조립한다. |
| O13 | §6 응답 약 6KB | 최악 단계는 약 1.5KB, 12단계면 약 18KB다 | refill을 릴별 배열 `SymbolId[][]`로 압축한다. 상한 테스트는 12KB다. |
| O14 | 카탈로그 `maxCascades 20`, 사다리 `[1,2,3,5]`, WAVE2 "사다리가 프리스핀 간 유지" | WAVE2는 12와 `[1,2,3,5,8,12,20]`이다 | 12와 7단 사다리로 간다. 사다리는 **매 스핀 리셋**한다(라운드 포함). 이월 피처는 주문 카드가 대신한다. 카탈로그 §2 #6은 같은 커밋에서 고친다. |
| O15 | §7 "Candy Glass" | fruit-fiesta가 이미 candy-glass 과일이다 | **슈가 프로스트 젤리(소프트 매트·새틴)**로 바꾼다. |
| O16 | — | `SoundPreset`이 두 곳에 있다(`renderer/types.ts:12`, `game-sdk/theme.ts:36`) | 계약 커밋에서 두 곳 모두 `'candy'`를 더한다. |
| O17 | — | `engineSpin.ts toSharedFeature`는 미지의 피처를 전부 `scatterWin`으로 떨어뜨린다 | `orderRound`, `orderComplete`, `winCapped` 분기를 명시하고 `never` 검사로 바꾼다. |
| O18 | §3-5 `payKind` preprocess | shared `WinLineSchema` refine이 여전히 `(line===-1)===(ways!==undefined)`다 | 그대로 진행한다(첫 블로커). |
| O19 | — | `renderer/anticipation.ts`와 `evaluate.ts triggersFreeSpins`가 `math.scatter.freeSpins.trigger`만 본다 | 주문 라운드 트리거도 읽도록 `featureTriggerCount(math)` 헬퍼를 둔다. |

---

## 1. 게임 요약

| 항목 | 값 |
|---|---|
| 한 줄 | 같은 사탕 5개 이상이 상하좌우로 붙으면 터진다. 위에서 새 사탕이 떨어지고, 다시 터질 때마다 배수가 ×1 → ×2 → ×3 → ×5 → ×8 → ×12 → ×20으로 오른다. 스캐터 4개면 **주문 카드 라운드**가 열린다. |
| 그리드 | 6릴 × 5행(30칸), 직교 인접 클러스터 5+ |
| 배당 기준 | 총 베팅액 × 페이테이블 배수 × 그 연쇄의 사다리 배수(매 스핀 ×1부터) |
| 와일드 | 무지개 롤리팝. 여러 심볼의 클러스터에 동시에 낀다. 와일드만으로 된 그룹은 미지급이다. |
| 스캐터 | 막대사탕. 터지지 않는다. 연쇄가 끝난 판에서 4개 이상이면 라운드가 열린다. 3~4개 지급 배당은 소액이다. |
| 주문 카드 라운드 | 8스핀, 카드 3장. 카드를 완료하면 상품(총 베팅 배수)을 즉시 받고 스핀 +2, 새 카드가 들어온다. 한 라운드 최대 6장 완료, 최장 20스핀이다. 라운드 안에서 스캐터 리트리거는 없다. 사다리는 스핀마다 리셋된다. |
| 주문 종류 | ① "○○ N개 터뜨리기"(스핀 사이 누적, 와일드는 세지 않음) ② "한 번에 N개 이상 클러스터"(한 스핀 안 판정) ③ "한 스핀에 연쇄 N번"(한 스핀 안 판정) |
| 상한 | 연쇄 12회, 라운드 지급 5,000×(`round.maxWinCap`) |
| 목표 RTP | 94.5%(1차 클러스터 62.0 + 2차 이상 연쇄 24.0 + 주문 카드 라운드 8.5, 이 중 상품 몫 약 4~5). 잭팟 1.5%를 더해 체감 96.0% |
| 변동성 | high. 적중률 약 32%, 평균 연쇄 1.6, 3연쇄 이상 6%, 예상 σ 약 8 |
| 베팅 레벨 | 20 / 40 / 100 / 200 / 500 / 1000(배당 눈금 0.05) |
| 셀 크기 | 430px에서 65.5px, 390px에서 59.4px(6릴 판독 기준 58px) |

---

## 2. 엔진 (`packages/slot-engine`)

### E0. 회귀 기준점 (리드, 착수 전)

- `src/golden.test.ts`: live 6팩마다 시드 `golden-<id>`로 유료 2,000라운드를 돈다(프리스핀 포함). `JSON.stringify(SpinResult[])`의 sha256을 `src/__golden__/hashes.json`과 비교한다.
- 해시는 HEAD에서 먼저 커밋한다.
- `rtp-sim sim <id> --spins 2000000 --seed 42`로 6팩 수치를 기록한다.

### E1. 스키마와 배당 단위 (`schema.ts`, `spin.ts`, `analytic.ts`)

```ts
payModel: z.enum(['lines', 'ways', 'cluster']).default('lines')
cluster: z.object({ minCluster: z.number().int().min(3), adjacency: z.literal('orthogonal'),
                    wildJoins: z.boolean().default(true) }).optional()
cascade: z.object({ enabled: z.literal(true), maxCascades: z.number().int().min(1).max(20),
  refill: z.literal('gravity'), source: z.literal('strip-pull'),
  multiplierLadder: z.array(z.number().int().min(1)).min(1) }).optional()
round: z.object({ maxWinCap: z.number().gt(0) }).optional()
orderRound: z.object({
  trigger: z.number().int().min(1),          // 스캐터 개수 (finalGrid 기준)
  spins: z.number().int().min(1),            // 8
  slots: z.number().int().min(1).max(4),     // 3
  maxOrders: z.number().int().min(1),        // 한 라운드 최대 완료 장수 6
  extraSpinsPerOrder: z.number().int().min(0),  // 2
  pool: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(['popSymbol', 'clusterSize', 'chainLength']),
    symbol: z.string().min(1).optional(),    // popSymbol 전용
    target: z.number().int().min(1),
    prize: z.number().gt(0),                 // 총 베팅 배수, 0.05 눈금
    weight: z.number().int().positive(),
  })).min(1),
}).optional()
```

refine에 더할 것:
- cluster이면 `cluster`와 `cascade`가 필수이고 `paylines`와 `ways`는 금지한다.
- 페이룰 키 상한은 `reels*rows`다.
- 정수 검사 단위는 1(총 베팅액)이다(O2).
- `orderRound`와 `scatter.freeSpins`는 동시에 둘 수 없다.
- pool 검사: `popSymbol`은 비와일드·비스캐터 심볼이어야 하고, `clusterSize.target ≤ reels*rows`, `chainLength.target ≤ maxCascades`, 서로 다른 id가 `slots` 이상, `prize × betLevel`이 정수, `spins + extraSpinsPerOrder × maxOrders ≤ MAX_FREE_SPINS_PER_ROUND`.

배당 단위와 해석 경로:
- `getBetUnit`: cluster이면 `totalBet`.
- `isAnalytic`: cluster, cascade, orderRound 중 하나라도 있으면 false.
- `evaluate.ts`에 `featureTriggerCount(math)`를 둔다. `orderRound.trigger ?? scatter.freeSpins.trigger`를 돌려준다(O19).

### E2. 클러스터 평가기 (`src/cluster.ts`, 새 파일)

```ts
export function evaluateClusters(grid: SymbolId[][], math: GameMath, totalBet: number, ladder: number):
  { wins: WinLine[]; removed: GridPosition[] }
```

- 이웃 표는 `Int16Array`로 만들어 `WeakMap`에 캐시한다.
- 심볼은 선언 순서로 BFS한다. 심볼마다 방문 배열을 새로 두고, 시작점은 비와일드 칸이다. 와일드는 통과할 수 있고, 스캐터는 막힌 칸이다.
- 크기는 와일드를 포함해 세고, `payoutForCount`로 티어를 고른다.
- 비와일드 칸은 정확히 한 그룹에만 속한다. 와일드는 여러 그룹에 낄 수 있다.
- 승리 하나의 모양: `{ line: -1, payKind: 'cluster', symbol, count, multiplier, ladder, cascade, win: Math.round(m*totalBet*ladder), positions }`.
- `removed`는 승리 그룹 좌표의 합집합(중복 제거, 정렬)이다.

### E3. 연쇄 루프 (`src/cascade.ts`, 새 파일)

```ts
export interface CascadeStep { index: number; wins: WinLine[]; removed: GridPosition[]
  refill: SymbolId[][]; multiplier: number; stepWin: number }
export interface CascadeOutcome { steps: CascadeStep[]; finalGrid: SymbolId[][]; win: number
  removedBySymbol: Record<SymbolId, number>; maxClusterSize: number; capped: boolean; hitMaxCascades: boolean }
export function runCascades(math, grid, stops, totalBet, capRemaining: number): CascadeOutcome
export function applyCascadeStep(grid, step): SymbolId[][]
export function foldCascades(grid, steps): SymbolId[][]
```

`runCascades`의 동작:
- 릴별 포인터를 `stops[r]-1`에 두고 위로 순환하며 리필한다(strip-pull). RNG는 0회다.
- 단계 k의 사다리 배수는 `L[min(k, L.length-1)]`다. 매 스핀 0부터 시작한다.
- 승리가 없거나 `maxCascades`에 닿으면 끝낸다. 캡에 닿아 남은 클러스터는 미지급이다.
- 누적 지급이 `capRemaining`을 넘으면 자르고 `capped`로 표시한다.
- `removedBySymbol`은 제거된 칸 중 비와일드 심볼별 개수이고, `maxClusterSize`는 이번 스핀 최대 그룹 크기다. 둘 다 주문 집계 입력이다.

`spin.ts`는 `math.cascade`가 없으면 기존 경로를 한 글자도 바꾸지 않는다. 있으면 다음 순서로 진행한다.
1. `applyMutations`
2. `runCascades`
3. `resolveSpin(…, cascade)`
   - 스캐터는 `finalGrid`에서 센다.
   - `wins = steps.flatMap(s => s.wins)`.
   - 주문 처리(E4).
   - `totalWin = round(lineWin + scatterWin + orderWin)`. 라운드 배수는 1로 고정이라 곱하지 않는다.

### E4. 스핀 간 상태와 주문 카드 라운드 (`src/types.ts`, `src/orders.ts` 새 파일, `src/spin.ts`)

```ts
export interface OrderCard { id: string; kind: 'popSymbol'|'clusterSize'|'chainLength'
  symbol?: SymbolId; target: number; progress: number; prize: number }
export interface OrderRoundCarry { cards: OrderCard[]; drawn: number; completed: number; prizeTotal: number }
export interface RoundCarry { orders?: OrderRoundCarry }            // #7·#8이 필드를 더한다
export interface RoundState { freeSpinsLeft: number; freeSpinsTotal: number; multiplier: number; carry?: RoundCarry }

export function drawOrderCards(math, active: readonly OrderCard[], count: number, rng: Rng): OrderCard[]
export function tallyOrders(cards: readonly OrderCard[], outcome: CascadeOutcome):
  { cards: OrderCard[]; completed: OrderCard[] }     // 순수 함수, RNG 없음
```

- **진입(유료 스핀).** `finalGrid` 스캐터 수가 `trigger` 이상이면 다음을 남긴다.
  - 피처 `{ type:'freeSpins', spins: 8, multiplier: 1, retrigger: false }`. 세션 배관은 기존 그대로 재사용한다.
  - 피처 `{ type:'orderRound', cards }`. `cards = drawOrderCards(math, [], slots, rng)`.
  - `nextState = { freeSpinsLeft: 8, freeSpinsTotal: 8, multiplier: 1, carry: { orders: { cards, drawn: 3, completed: 0, prizeTotal: 0 } } }`.
- **라운드 스핀**(`state.carry.orders` 있음):
  1. `tallyOrders`로 진행을 갱신한다.
     - `popSymbol`: `progress += removedBySymbol[symbol]`(스핀 사이 누적).
     - `clusterSize`: `maxClusterSize ≥ target`이면 완료.
     - `chainLength`: `steps.length ≥ target`이면 완료.
  2. 완료 카드마다 `orderWin += round(prize × totalBet)`(캡 안에서), 피처 `{ type:'orderComplete', id, prize: coins }`, `left += extraSpinsPerOrder`.
     - 왼쪽 칸부터 처리하고, `completed < maxOrders`일 때만 인정한다.
     - 상한을 넘은 완료는 상품만 주고 스핀은 주지 않는다.
  3. 완료된 칸은 `drawn < maxOrders + slots - 1`이면 새 카드로 채운다(`drawOrderCards`, 활성 카드 id는 제외). 아니면 칸을 비운다.
  4. `left = state.freeSpinsLeft - 1 + 추가분`. 0이면 `nextState`가 없어 carry도 함께 사라진다(구조적 리셋, 만료와 같은 경로).
- **종료 척도.** `freeSpinsLeft`는 매 스핀 1씩 줄고, 늘어나는 것은 `completed ≤ maxOrders`로 묶인다. 최장 `8 + 2×6 = 20`스핀이다. 리트리거가 없으므로 `count × p` 검사는 해당 없다.
- live 6팩은 `carry` 키가 생기지 않는다(비트 동일).

### E5. RNG 소비 계약

```
릴 정지 (6회) → 뮤테이션 (#6: 0회) → 연쇄 0..n (0회) → 스캐터 판정 (0회)
→ [진입 스핀] 주문 카드 추첨: slots회 (pickWeighted, 이미 뽑힌 id 제외)
→ [라운드 스핀] 진행 집계 (0회) → 완료로 비운 칸마다 새 카드 추첨 1회 (왼쪽 칸부터)
→ [API] 잭팟 판정 1회
```

- 추첨 횟수는 판 결과로 결정된다. `seedInput + stateBefore + totalBet`이면 라운드 전체가 재생된다.
- `pickWeighted`는 `mutations.ts`에서 `src/random.ts`로 옮겨 공유한다. 함수 본문이 같으니 live 팩 결과는 그대로다(골든 게이트로 확인).
- `cascade.test.ts`: 진입하지 않는 스핀은 `nextInt` 6회, 진입 스핀은 6 + slots회, 라운드 스핀은 6 + 완료 칸 수 회.

### E6. `SpinResult` 확장 (`types.ts`)

```ts
interface WinLine { …; payKind?: 'line'|'ways'|'cluster'; cascade?: number; ladder?: number }
interface SpinResult { …; cascades?: CascadeStep[]; finalGrid?: SymbolId[][]; orderWin?: number }
type FeatureTrigger = … | { type: 'orderRound'; cards: OrderCard[] }
  | { type: 'orderComplete'; id: string; prize: number } | { type: 'winCapped'; requested: number; granted: number; cap: number }
```

`WinLine.win`은 사다리 적용 후 값이다. 렌더러 등급, 감사 기여도, 허브 롤업이 그대로 맞는다. 주문 상품은 `orderWin`으로 따로 둔다.

### E7. 테스트 (`cluster.test.ts`, `cascade.test.ts`, `orders.test.ts`, `schema.test.ts`, `golden.test.ts`)

| 테스트 | 고정하는 것 |
|---|---|
| 클러스터 손 그리드 8개 | L·T자, 와일드 브리지, 크기 4 미지급, 7 → 5 티어, 스캐터 비통과, 와일드만 그룹, 30칸 전부 |
| 중력·리필 | 포인터 순환 포함 손 그리드 3개 |
| `foldCascades === finalGrid` | 실제 스핀 2,000회 |
| 주문 | 세 종류의 완료 판정. `popSymbol` 누적이 스핀을 넘어 이어진다. 완료 시 +2 스핀, 같은 id 재추첨 금지, `maxOrders` 이후 스핀 미추가, 세션 종료 시 carry 없음, 최장 20스핀 |
| RNG 호출 수 | E5 |
| 캡 | `maxCascades` 12, `round.maxWinCap`에 상품 포함 |
| 골든 | live 6팩 해시 동일 |

---

## 3. 수학과 감사 (`tools/rtp-sim`, `games/candy-cluster-pop/math.json`)

### T1. 도구

1. `drawSpin`을 `spinUnchecked` 호출로 바꾼다(O3). 바꾼 뒤 두 함수 결과가 같은지 테스트한다.
2. 클러스터는 "총 베팅액 기준"으로 표기한다(`compute.ts`, `report.ts`).
3. `contributions.ts`: 클러스터 크기 버킷, 연쇄 깊이 버킷, `orderWin`을 담는다. 분해를 `lines / scatter / orderPrize / roundClusters`로 나눈다. 라운드 중 클러스터 지급은 `roundClusters`로 따로 센다.
4. 리포트에 새 절을 더한다.
   - 연쇄 깊이 0~12, 사다리 단계별 지급, 클러스터 크기 분포
   - `P(지속)`, 평균 연쇄, `maxCascades`·`winCapped` 도달률
   - 주문 카드: 종류별·id별 등장률과 완료율, 라운드당 완료 장수 분포, 라운드 길이 분포(8~20), 상품 몫, 라운드 클러스터 몫
   - 파일럿 σ, `n*`, 실제 `n`
5. 시드 샤딩(`src/audit/shards.ts`, `worker_threads`, 시드 `${seed}:shard-${i}`)을 만들고 기존 `mergeSimulations`로 합친다. 옵션은 `--shards K`다.
6. `readManifestExtras.auditSpins`를 감사 기본 스핀 수로 쓴다.
7. `src/tune-cli.ts`: RTP 분해, 적중률, 최초 클러스터율, 평균 연쇄, 라운드 진입률, 주문 완료율, σ, n*를 한 화면에 낸다. `--strips densities.json --strip-seed N`으로 스트립을 생성한다.

### M1. 튜닝 순서

1. 릴별 밀도 → 최초 클러스터율 32%.
2. 스트립 배열 → 평균 연쇄 1.6, `P(지속) ≤ 0.55`.
3. 기본 페이테이블 선형 배율 → 기본 게임 몫 86.0.
4. 스캐터 밀도 → 라운드 진입률(목표 약 1/180).
5. **주문 target**(완료율 목표: 카드당 약 45%, 라운드당 평균 완료 1.6장) → 라운드 길이 평균 약 11스핀.
6. **주문 prize 표 선형 배율** → 라운드 몫 8.5에 맞춘다. 상품 몫은 prize에 정확히 비례하므로 이 단계는 1~2회 반복으로 끝난다.

스트립은 릴마다 100 이상으로 둔다. `pack:check`에 `rows*(maxCascades+1)` 경고를 넣는다.

### M2. 파일럿 σ → n*

- 파일럿 5M으로 `n* = ⌈(1.96·σ̂·1.1/0.002)²⌉`를 구한다. σ̂ = 8이면 약 74M이다.
- `manifest.auditSpins`에는 1천만 단위로 올림한 값을 적는다.
- σ̂ > 11이면 큰 상품(clusterSize 20+, chainLength 6+)의 prize를 낮추고 weight를 올린다. 기대값은 유지하고 꼬리만 깎는다.

### M3. 게이트

| 관문 | 기준 |
|---|---|
| CI(40만) | `\|rtp−target\| ≤ max(0.5%p, 3·SE)` + 재현성 + 정밀도 필드 |
| 정식 감사 | `\|rtp−target\| ≤ 0.5%p` **그리고** ci95 반폭 ≤ 0.2%p, `n ≥ n*` |
| 기존 | 레벨별 ±0.5%p + 자기 CI · 적중률 10~60% · 최대 배수 ≥ 50x · 독립 MC 3SE · 분포 합 1 · 잭팟 포함 96.0 ± 0.5 |
| 연쇄 | `P(지속) ≤ 0.55`, 평균 연쇄 ≤ 2.5, `maxCascades` 도달 < 0.01% |
| 주문 카드 | 라운드 길이 ≤ 20(위반 0건), 종류별 완료율이 리포트에 있음, 상품 몫 + 라운드 클러스터 몫 = 라운드 몫 |
| 캡 | 도달률과 캡 on/off 차를 명시 |
| 회귀 | live 6팩 골든과 2M 수치 동일 |

### M4. 감사 시간 (추정, 파일럿에서 갱신)

스핀당 약 20~30µs로 본다(astral은 8.4µs). n = 74M 기준으로 단일 스레드는 약 60~80분, **`--shards 8`이면 약 9~12분**이다. 파일럿 5M은 약 2분, CI는 팩당 약 10s다.

---

## 4. 렌더러 (`packages/renderer`)

### R1. 순수 계획 (`src/cascade.ts`, 새 파일)

`buildCascadePlan(grid, steps, opts)`, `cascadeStepDurations`, `compressCascadeStep`를 만든다. `gridAfter`는 엔진의 `applyCascadeStep`으로 계산하고, 마지막 값은 반드시 `finalGrid`와 같아야 한다.

### R2. 시간 예산

강조 → 팝 → 낙하(중력과 리필 동시, 릴별 30ms 스태거)다. 3단계부터 ×0.78씩 줄이고, 하한은 그 모드 기본의 0.27배다.

| 모드 | 강조/팝/낙하 | 단계 | 12연쇄 합 | 게이트 |
|---|---|---:|---:|---:|
| normal | 280/180/300 | 760ms | 4.46s | ≤ 4.5s |
| quick | 200/120/210 | 530ms | 3.11s | ≤ 3.4s |
| turbo | 120/100/180 | 400ms | 2.35s | ≤ 2.6s |
| 모션 축소 | 100/0/80 | 180ms | 1.06s | ≤ 2.4s |

### R3. STOP

- 남은 단계는 압축 재생한다. 단계 길이는 `max(90, min(220, 1200/남은 수))`ms이고 낙하는 항상 위치 트윈이다. 연쇄 단계에는 제자리 텍스처 교체 경로가 없다.
- 릴이 돌 때 STOP을 누르면 기존 스냅 착지 뒤 압축 연쇄로 이어진다.
- 두 번째 탭은 무시한다.
- 끼어들기가 생기면 `gridAfter`를 확정하고 `end` 이벤트를 낸다.

### R4. Pixi (`src/pixi/cascadeFx.ts`, `src/pixi/clusterOutline.ts`, `src/pixi/pixiRenderer.ts`)

- 순서: 착지 → 변형 → `runCascadePhase` → `spinEnd`.
- 단계 시작 시 스프라이트 풀로 교체하고, 끝나면 `applyGridOverride(gridAfter)`로 커밋한다. 교체와 커밋은 같은 tick에서 한다.
- 클러스터 외곽선은 그룹 밖과 맞닿은 셀 경계 선분이다.
- 팝 파편은 코드 입자다.
- `Theme.frameLayout.gapRatio?`를 추가한다(candy는 0.04, live는 기존 값).
- **주문 토큰용 좌표**: `SlotRenderer.getCellRect(reel, row): { x, y, w, h }`(CSS px, 캔버스 기준)를 노출한다. 토큰 비행은 허브 DOM이 그린다.

### R5. 이벤트와 `showWins`

```ts
| { type: 'cascadeStep'; index: number; total: number; phase: 'start'|'end'; stepWin: number
    cumulativeWin: number; multiplier: number; removed: GridPosition[]; removedSymbols: SymbolId[] }
SpinToOptions += { cascades?; finalGrid? }   ShowWinsOptions += { mode?: 'standard'|'cascade' }
winLine 이벤트 += payKind?, cascade?, ladder?   winTotal += fromAmount?
```

- `mode: 'cascade'`는 A단계와 피처만 보여 주고 순환하지 않는다.
- 롤업은 `cumulativeWin`에서 `totalWin`까지만 굴린다(스캐터와 주문 상품분).
- 다중 당첨 1.2s 머무름은 연쇄 2단계 이상일 때만 붙인다.
- 등급, 코인, 셀레브레이션은 연쇄와 주문 정산이 끝난 뒤 한 번만 나간다.
- 피처 단계: `freeSpins` 피처가 기존처럼 스캐터 강조와 `featureTriggered`를 낸다. `orderRound` 피처는 허브가 읽는다.
- 기대감: `anticipatedReels`는 `featureTriggerCount(math)`를 쓴다(O19). 연쇄 중 리필로 스캐터가 3개가 되면 허브가 긴장음만 낸다(시간은 불변).
- `betUnitCount`는 cluster일 때 1이다.

---

## 5. 허브 (`apps/hub`)

| 작업 | 파일 | 내용 |
|---|---|---|
| H1 스핀 옵션 | `store/game.ts` | `cascades`, `finalGrid`, `mode: 'cascade'`. store에 `orderRound: OrderRoundCarry \| null`을 두고 **서버 값**(`SpinResponse.freeSpins.carry.orders`, `GET /state`)으로만 갱신한다 |
| H2 WinStrip | `GameScreen.tsx handleRendererEvent`, `WinStrip.tsx` | 연쇄 2단계부터 라벨을 `연쇄 n`(en `CHAIN n`)으로 바꾸고, 금액은 `cumulativeWin`까지 250ms 틱으로 올린다. lineRow는 `[아이콘 ×개수] · ×배수 · 금액`. 주문 완료 시 라벨 `주문 완료`, lineRow `[카드 아이콘] 빨간 물방울 30개 · +500`. 롤업은 단조 증가다 |
| H3 사다리 미터 | `components/game/LadderMeter.tsx`(새 파일) | `×1 … ×20`에 활성 칸을 표시한다. 스핀마다 ×1로 리셋하고, 오를 때 펀치 + light haptic을 준다 |
| H4 주문 카드판 | `components/game/OrderBoard.tsx`(새 파일, +css) | 라운드 중 스테이지 위에 카드 3장(430px 카드당 약 132×56px)을 둔다. 카드 내용: 심볼 아이콘(@128), 문구("30개 터뜨리기" / "10개 이상 한 번에" / "연쇄 4번"), 진행 막대 `23/30`, 상품 `×5`. 연쇄 중 `cascadeStep end`의 `removedSymbols`로 **표시용** 진행을 올리고, `getCellRect`에서 카드로 토큰을 날린다(단계당 최대 8개, 모션 축소 시 생략). 스핀 응답의 서버 값으로 최종 확정한다. 화면 값이 서버 값과 다르면 서버 값으로 덮고 진단 로그를 남긴다. 완료 연출은 도장 + 카드 뒤집힘 → 새 카드 등장(180ms)이다. STOP 압축 중에는 토큰 없이 숫자만 갱신한다 |
| H5 라운드 진입·종료 | `GameScreen.tsx`, `RoundPopup.tsx` | 진입: 스캐터 강조 → 전환 커튼(클립) → 카드 3장을 한 장씩 깐다(서버가 준 카드 그대로) → 자동 진행(기존 프리스핀 흐름). 프리스핀 카운터 문구는 `주문 카드 라운드 5/10`. 종료 팝업: 완료한 카드 목록 + 상품 합 + 라운드 총합. 셀레브레이션 스킨은 등급이 맞을 때 기존대로 |
| H6 도움말 | `GameScreen.tsx HelpPage`, `ClusterHelp.tsx`(새 파일), `i18n/*` | 2번 탭은 "클러스터"(인접 그림 2장, 티어 표, 사다리 표). `features` 탭은 "주문 카드 라운드"(진입 조건, 카드 세 종류 예시, 완료 시 상품 즉시 + 2스핀, 최대 6장, 최장 20스핀, 미완료 카드는 상품 없음). 배당 기준 문구는 "총 베팅액" |
| H7 디버그 프리셋 | shared `SpinDebugPresetSchema`, `lib/debugPreset.ts`, `DebugPanel.tsx`, API `debugSpin.ts` | `cascade3`(`cascades.length ≥ 3`), `orderRound`(유료 스핀에 `orderRound` 피처), `orderComplete`(라운드 중 `orderComplete` 1건 이상. 라운드 밖에서는 버튼 비활성과 "먼저 주문 카드 라운드로 진입" 안내). `presetsFor(math)`로 candy에서만 노출하고, 서버는 해당 피처가 없는 게임에 409 |
| H8 공정성 검증 | `handleRevealSeed` | `replaySpin(math, bet, rng, stateBefore)` + `totalWin` 일치 비교 |
| H9 로비 카드 | `GameCard.tsx:47` | `6×5 · Cluster 5+`, astral은 `625 ways` |
| H10 사운드 `candy` | `lib/audio.ts` | `playCascadePop(step)`: 연쇄마다 음계 한 칸씩 상승(장조 펜타토닉). `playLadderUp(index)`, `playCascadeDrop()`. `playOrderTick()`: 토큰이 카드에 닿을 때, 아주 짧은 고역 틱, 단계당 1회로 묶음. `playOrderComplete()`: 도장 쿵 + 글로켄 3음 상행. `playOrderDeal()`: 카드 등장 스윽. fruit 프리셋과 음색을 구분한다 |
| H11 BGM `candy` | `lib/bgm.ts`, `bgmVoices.ts` | 기본 116bpm 장조, 통통 베이스 + 글로켄 리드. 라운드에는 기존 `freeSpins` 모드 변주를 쓴다(+1 키, 하이햇 16분, 마림바 대선율). earshot으로 LUFS -30~-32, fruit와 구분되는지 판정 |

`lib/audio.ts`의 미커밋 변경은 D0에 리드가 정리한다.

---

## 6. API (`apps/api`, `packages/shared`)

| 항목 | 변경 |
|---|---|
| WinLine | `payKind` optional + preprocess, refine `(line === -1) === (payKind !== 'line')`. `cascade?`, `ladder?` |
| 새 스키마 | `CascadeStepSchema`, `OrderCardSchema`, `OrderRoundCarrySchema`, `RoundCarrySchema = { orders?: OrderRoundCarry }` |
| SpinResponse | `cascades?`, `finalGrid?`, `orderWin?`. `freeSpinsSummary`에 `ordersCompleted?`와 `orderPrizeTotal?` |
| 상태 | `FreeSpinsStateSchema.carry?`. `GET /games/:id/state`가 그대로 돌려준다(새로고침하면 카드와 진행 복원) |
| 피처 | `orderRound`, `orderComplete`, `winCapped` 추가. `toSharedFeature`에 명시 분기를 넣는다(O17) |
| manifest | `lines .min(0)`, `payModel?`, game-sdk `auditSpins?`. `validate.ts`는 cluster이면 0과 비교한다 |
| 엔진 연결 | `toRoundState`·`wrapFreeSpinsState`가 `carry`를 옮긴다. 만료와 소진이 같은 경로를 탄다 |
| 라운드 저장 | `rounds.cascades jsonb`, `rounds.state_before jsonb`(`drizzle/0009_cascade_rounds.sql`, drizzle·memory 두 레포 모두) |
| 멱등 재전송 | 저장값으로 조립하고 `finalGrid = foldCascades(grid, cascades)`. 재실행하지 않는다 |
| 공개 | `RoundSeedResponse.stateBefore` |
| 서버 권위 | 카드 추첨, 진행, 완료, 상품은 엔진만 계산한다. 클라이언트 계산은 표시용이고 응답 값으로 덮인다 |
| 응답 크기 | 최악 스핀 ≤ 12KB(카드 3장은 약 0.3KB 추가) |

---

## 7. 아트

### 컨셉

**슈가 프로스트 젤리**(소프트 매트·새틴 설탕 코팅)다.
- 팔레트: 하늘 `#8fd8f2`, 딸기 `#ff7aa8`, 라임 `#a8e05f`, 크림 `#fff1d6`, 그레이프 `#9d7ae0`.
- 좌상단 소프트박스 조명, 6릴 58px 실루엣 기준.
- 라운드 배경은 "사탕 가게 주문 카운터"다.

### 에셋 목록 (생성 18장 + 클립 2편, 주문 카드는 CSS)

| id | kind | size → out | 메모 |
|---|---|---|---|
| `wild` | symbol | 1024² → 512 | 무지개 소용돌이 롤리팝 원반 |
| `scatter` | symbol | 1024² → 512 | 리본 달린 막대사탕(유일한 세로형) |
| `heart` `star` `bean` | symbol | 1024² → 512 | 하트 젤리 / 별 쿠키 / 큰 젤리빈 |
| `drop_red` `drop_blue` `drop_green` `drop_purple` `drop_yellow` | symbol | 1024² → 512 | 물방울 / 각설탕 / 구슬 / 젤리빈 캡슐 / 별사탕. 형태로 구분한다. 주문 카드 아이콘으로도 쓰이므로(@128) 28px에서도 구분되어야 한다 |
| `frame` | frame | 1024² → 1080 | 크림 프로스팅 + 웨이퍼 기둥, 창 x 2–98%, y 10–90%. "창 안은 순수 #00FF00, 아무것도 그리지 않는다" 문장을 고정한다 |
| `bg` | bg | 1024×1536 → 1080 | 파스텔 캔디 랜드(채도를 낮춰 심볼이 묻히지 않게, `reelBackdrop` 포함) |
| `bgFreeSpins` | bg | 1024×1536 → 1080 | 사탕 가게 주문 카운터와 벽에 붙은 주문 쪽지. theme 키 이름은 기존대로 둔다 |
| `thumb` | thumb | 1536×1024 → 640 | 클러스터가 터지고 주문 카드 한 장에 도장이 찍히는 순간 |
| `wild-win` `scatter-win` `heart-win` | sheet 3×3 @12fps | 1024² → 768 | 팝 파편은 코드 입자 |
| `fs-enter` / `fs-exit` | 전환 클립(SeeDance) | 360×640, 3.0s, loop=1 | 진입: 주문 쪽지가 화면 가득 휘날리며 덮는다. 종료: 쪽지에 도장이 찍히며 걷힌다. `check:clips` 통과 |
| 주문 카드 | CSS | — | 크림 카드, 딸기색 테두리, 완료 도장(CSS 원형 + 체크). 이미지 생성 없음 |
| `celebration` | theme.json | — | `['confetti','star','spark','gem']`, motion `flip`. 선택 과제로 새 모양 `wrapper` 추가 |
| `sound` | theme.json | — | `{ "preset": "candy" }` |

### 지난 실패에서 나온 체크

| 교훈 | 코드 대책 (`tools/theme-gen`) | 검수 |
|---|---|---|
| 창 안을 칠하면 감지가 실패한다 | `frameWindow.ts detectAlphaWindow`: 펀칭 뒤 알파 구멍 바운딩 박스를 기준값으로 쓴다. 색 감지와 1.5% 넘게 다르면 경고 | `frameLayout.window`가 알파 실측과 ±1% 안 · 430px에서 6열이 창에 맞음 |
| codex 회수가 엉뚱한 이미지를 집는다 | `src/contactSheetCli.ts`: 512 / 58 / 28px 타일에 id 라벨을 넣은 `art/contact.png`를 만든다. dHash 해밍 거리 < 8이면 실패 | 리드가 contact.png로 id와 그림 1:1 확인. 회수 로그가 찍힌 에셋은 재확인 |
| 중단된 실행이 theme.json을 반쯤 비운다 | `applyThemeUpdate`를 에셋마다 호출한다. `--reprocess`로 다시 채운다 | `validate.ts` 필수 키(심볼 전부·frame·background·backgroundFreeSpins·frameLayout·palette·celebration·sound) 누락 시 error, `pack:check` 0/0 |

---

## 8. 팀 레인

### 8-1. 레인과 파일 소유

| 레인 | 모델 | 소유 파일 |
|---|---|---|
| L 리드 | opus | 계약 커밋, `docs/*`, `__golden__/*`, 통합, 이미지 검수 |
| E 엔진 | sonnet | `slot-engine/src/{cluster,cascade,orders,random,schema,spin,types,analytic,evaluate,index}.ts` + 테스트 |
| S 공유·API | sonnet | `shared/src/schemas.ts`, `game-sdk/src/{manifest,validate}.ts`, `apps/api/src/**`, `drizzle/0009_*` |
| T 감사·수학 | sonnet | `tools/rtp-sim/src/**`, `games/candy-cluster-pop/{math,manifest}.json`, `README.md`, `CHECKLIST.md`, `docs/RTP_AUDIT_candy-cluster-pop.md` |
| R 렌더러 | sonnet | `packages/renderer/src/**` |
| H 허브 | sonnet | `apps/hub/src/{components,store,i18n}/**`, `lib/debugPreset.ts`(i18n 문자열 추가는 haiku 보조 가능) |
| A 사운드 | sonnet | `apps/hub/src/lib/{audio,bgm,bgmVoices}.ts` |
| G 아트 | sonnet(theme-gen 코드·프롬프트), haiku(생성 실행·파일 점검) | `tools/theme-gen/src/**`, `games/candy-cluster-pop/{art,theme}/**`, `thumb.webp` |

### 8-2. 먼저 동결할 계약 (D0, 리드 커밋 1개)

| 계약 | 내용 |
|---|---|
| C1 엔진 타입 | `RoundCarry`, `OrderCard`, `OrderRoundCarry`, `CascadeStep`, `SpinResult` 확장, 피처 3종, `cluster`/`cascade`/`orderRound` 스키마 모양. **`applyCascadeStep`·`foldCascades`·`tallyOrders`는 리드가 직접 구현**한다(순수 함수이고, API·렌더러·허브가 이 셋에 기대므로) |
| C2 shared | §6 shared 행 전부 + 디버그 프리셋 3종 + 레거시 shiba 라운드 파싱 테스트 |
| C3 렌더러 API | `cascadeStep`(removedSymbols 포함), `winLine`·`winTotal` 확장, `getCellRect`, `SpinToOptions`·`ShowWinsOptions` |
| C4 사운드 API | `SoundPreset 'candy'`(두 곳), `playCascadePop/playLadderUp/playCascadeDrop/playOrderTick/playOrderComplete/playOrderDeal` 스텁 |
| C5 픽스처 | `math.json v0`(스키마 통과 초안, 주문 풀 9종), `manifest.json`(`status: hidden`) |

### 8-3. 의존 순서

```
D0  L: 골든 → 계약 C1~C5 → typecheck 10/10
D1  E: E1·E2           S: 스키마·마이그레이션·저장        R: R1·R2
    H: H6 도움말·H3·H9·H7 배선   A: 레시피 초안   G: theme-gen 3건 → 스타일 락 → 심볼
D2  E: E3·E4·E5·E7·골든    S: 라우트·재전송·공개·debug    R: R4·R5·getCellRect
    T: T1(drawSpin 1순위)     H: H1·H2·H4(픽스처 응답으로)     G: frame·bg 2·thumb·시트
D3  T: 파일럿 → M1 1~4     R: R3 STOP     H: H5·H8·사운드 연결     A: earshot     G: 클립·celebration
D4  T: M1 5~6 → 정식 감사(샤드)      L: 통합 e2e(430/390) + 기능별 QA
D5  여유분 → status live → QA_LOG → 커밋
```

임계 경로: **E1 → E3 → E4 → T1 → M1 → 정식 감사**.

### 8-4. 페이즈 게이트

| 게이트 | 조건 |
|---|---|
| G0 | typecheck 10/10, 기존 테스트 통과, 골든 커밋 |
| G1 엔진 | E7 전부, 골든 6/6, live 2M 수치 동일, slot-engine 8회 연속 통과 |
| G2 API | 레거시 파싱, 재전송 바이트 동일, `stateBefore`, carry(카드·진행) 이월·소진·만료 리셋, 응답 ≤ 12KB, 디버그 탐색 < 1s |
| G3 렌더러 | 예산 4행, STOP 압축, `finalGrid` 등식, purity, live layout 고정값 유지 |
| G4 수학 | M3 전부 |
| G5 아트 | §7 체크 3종, `pack:check` 0/0, `check:clips` |
| G6 통합 | 아래 QA 전부 |

### 8-5. 기능별 QA 체크리스트

디버그 프리셋으로 상황을 만든 뒤 한 번씩 확인한다.

**클러스터**
- [ ] 외곽선이 그룹 경계와 일치
- [ ] `×개수`가 칸 수와 같음
- [ ] 크기 7이 5 티어 금액

**연쇄 연출**
- [ ] 팝·낙하·리필이 위치 트윈
- [ ] 마지막 판 = `finalGrid`

**STOP**
- [ ] 회전 중이든 연쇄 중이든 착지한 판에서 제자리로 바뀌는 심볼 0개(CDP 스크린캐스트)
- [ ] 압축 ≤ 1.2s, 금액 동일

**사다리 미터**
- [ ] 단계마다 오름, 매 스핀 ×1(라운드 포함)

**주문 카드 라운드 진입** (`orderRound`)
- [ ] 스캐터 강조 → 커튼 → 카드 3장이 서버 응답과 같은 순서·내용
- [ ] 카운터 `주문 카드 라운드 1/8`

**주문 진행** (라운드 중 `cascade3`)
- [ ] 토큰이 해당 카드로 날아감
- [ ] 스핀 끝 표시값 = 서버 `progress`
- [ ] `popSymbol` 진행이 다음 스핀으로 이어짐

**주문 완료** (`orderComplete`)
- [ ] 도장 → 상품이 WinStrip에 `주문 완료` → 스핀 +2 → 새 카드
- [ ] 6장 완료 뒤에는 스핀이 늘지 않음

**라운드 종료**
- [ ] 팝업의 완료 목록·상품 합·총합이 서버 `freeSpinsSummary`와 일치
- [ ] 종료 후 카드판이 사라지고 ×1

**상태 복원**
- [ ] 라운드 도중 새로고침 → 남은 스핀·카드·진행이 동일하게 복원
- [ ] 만료된 세션은 기본 게임으로

**멱등·공개**
- [ ] 같은 키 재전송 → 바이트 동일, 원장 1건
- [ ] 라운드 스핀 공정성 검증에서 stops·승리 일치

**당첨 연출**
- [ ] 연쇄·주문 정산 뒤에만 빅윈·코인·셀레브레이션
- [ ] 2연쇄 이상에서 1.2s 머무름
- [ ] 롤업 되돌아감 0

**기대감**
- [ ] 스캐터 3개 착지 시 남은 릴 감속(normal·quick), turbo·모션 축소에서는 꺼짐
- [ ] 연쇄 중 3개가 되면 긴장음만

**도움말**
- [ ] 클러스터 탭·주문 카드 라운드 설명이 math.json과 일치
- [ ] en/ko 키, 390px에서 잘림 없음

**디버그**
- [ ] candy에서만 3종 노출
- [ ] `orderComplete`는 라운드 밖에서 비활성
- [ ] 다른 게임은 409

**사운드**
- [ ] 연쇄 1→5 팝 음 상승
- [ ] 주문 틱이 단계당 1회로 묶임
- [ ] 완료음, 사용자 귀 판정 1회

**BGM**
- [ ] 기본과 라운드 변주
- [ ] 커튼 덕킹
- [ ] fruit와 구분

**레이아웃**
- [ ] 430px 셀 ≥ 64, 390px 셀 ≥ 58
- [ ] 카드판 진입·이탈 때 캔버스 리사이즈 0
- [ ] 카드 문구 390px에서 잘림 없음

**로비**
- [ ] `6×5 · Cluster 5+`, astral `625 ways`

**회귀**
- [ ] live 6종 스핀·프리스핀·변형 STOP 정상

---

## 9. 리스크와 일정

| # | 리스크 | 완화 |
|---|---|---|
| K1 | 연쇄 튜닝이 수렴하지 않는다 | 손잡이 순서 고정, `tune-cli`, 샤드 2M 약 1분, D5 여유 |
| K2 | 주문 완료율이 체감과 어긋난다(너무 쉽거나 어려움) | 목표 완료율 카드당 약 45%를 리포트로 고정. target은 완료율로, prize는 몫으로 따로 맞춘다 |
| K3 | 감사 도구가 연쇄와 주문을 빼고 잰다(O3) | T1 첫 작업 + 동일 결과 테스트 |
| K4 | live 6종 결과 변화(`pickWeighted` 이동 포함) | 골든 해시, 선택 필드만, opt-in 캡 |
| K5 | STOP 때 심볼이 바뀌어 보인다 | 압축 재생만 허용, 텍스처 교체 경로 없음, 스크린캐스트 QA |
| K6 | 표시용 진행과 서버 진행이 어긋난다 | 표시 계산은 `tallyOrders`와 같은 규칙(`removedSymbols`, 와일드 제외). 응답 값으로 덮고, 불일치 진단 로그와 테스트 |
| K7 | 화면 과밀(카드판 + 미터 + WinStrip) | 6×5는 폭에 묶여 셀 손실 0. 카드판 높이 56px 고정. 390px 실측 |
| K8 | 아트: 창 감지·회수·theme.json | §7 대책 3종 |
| K9 | fruit-fiesta와 시청각이 겹친다 | 매트 젤리 재질, earshot 비교 |
| K10 | `audio.ts` 미커밋 변경 | D0에 정리 |
| K11 | 한글 경로에서 `pnpm install` 실패 | 워커 작업 트리는 ASCII 경로 |

| 날 | 내용 | 레인 공수(h) |
|---|---|---|
| D0(반나절) | 골든 + 계약(fold·tally 포함) | L 6 |
| D1 | 스키마·클러스터, shared·마이그레이션, 렌더러 계획, 허브 정적, 사운드, theme-gen·심볼 | E 8 · S 6 · R 6 · H 6 · A 3 · G 6 |
| D2 | 연쇄·주문·골든, API, Pixi·좌표, T1, 카드판 | E 12 · S 6 · R 8 · T 6 · H 6 · G 4 |
| D3 | 파일럿·튜닝, STOP, 진입·종료·검증, 사운드 연결, 클립 | T 8 · R 4 · H 5 · A 4 · G 3 |
| D4 | 주문 튜닝·정식 감사, 통합 e2e·QA | T 6 · L 6 |
| D5 | 여유분·live·QA_LOG·커밋 | L 4 + 필요 레인 |

합계는 엔진 약 28h, 공유·API 약 13h, 감사·수학 약 22h, 렌더러 약 20h, 허브 약 17h, 사운드 약 7h, 아트 약 13h다. 달력 기준 **약 5~5.5일**이다.

---

## 10. 다음 두 게임 메모

### #7 olympus-nectar (6×5, 아무 위치 8+ + 배수 오브)

- **재사용**: `cascade.ts` 전체, `RoundCarry`, `tallyOrders` 형태의 스핀 끝 집계 훅, 서버 carry 저장, 렌더러 연쇄·STOP·`getCellRect`, `LadderMeter`(합계 미터로 변형), 감사 샤드·n*·`tune-cli`, `cascade3` 프리셋.
- **새로 할 것**:
  - `payModel: 'anywhere'`(`src/anywhere.ts`).
  - **리필 칸 오브 스폰 RNG**(리필 칸마다 1회 + 값 추첨). 연쇄가 처음으로 RNG를 쓰므로 E5 계약 표에 한 줄이 늘어난다.
  - `CascadeStep.orbs?`, `RoundCarry.orbMultiplier?`, 오브 상한 50×, 합 상한.
  - 강조는 광채 + 개수 뱃지다.
- **보너스 선택**: #6처럼 "일반 프리스핀이 아닌" 원칙을 적용한다. 주문 카드판을 재사용한 변형(예: "오브를 모아 카드 채우기")이 가장 싸다. 착수 전에 후보를 다시 비교한다.

### #8 magi-stella (5×4, 1024 ways + 스티키 와일드)

- **재사용**: `RoundCarry`(→ `stickyCells?`), `FreeSpinsState.carry` 저장·만료 경로, `rounds.state_before`와 공개, 공정성 재생, 샤드 감사. 연쇄와 클러스터는 쓰지 않는다.
- **새로 할 것**:
  - `stickyWild` 뮤테이션. 스티키 칸에는 스캐터가 착지하지 않아 리트리거 확률이 단조 감소한다. 최대 12칸이다.
  - 렌더러 overlay에 스핀 중에도 고정되는 `pinned` 종류를 더한다.
  - `stickyWild` 디버그 프리셋, 셀셰이딩 아트.
- **보너스 선택**: 사용자 원칙에 맞게 "스티키가 쌓이는 프리스핀"을 그대로 둘지 착수 전에 확인한다.

### 참고: #13 origami-realm

`cascade.ts`, `RoundCarry`, `tallyOrders` 집계 훅을 그대로 쓴다. O6의 `grid`/`finalGrid` 분리가 "초기 그리드 미스터리 + 연쇄"의 전제다.
