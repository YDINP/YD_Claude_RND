# 개선안 5종 구현 명세 (2026-11-27)

근거: `docs/research/IMMERSION_HOOK_AUDIT.md`(체험판 실측, 스크린샷 `audit-shots/`), `docs/research/SLOT_MARKET_TRENDS.md` §5.1(UKGC: 손실 위장 당첨 금지, 세션 손익·시간 표시).
범위: 사용자가 승인한 5종만. **새 게임·게임 수학(지급표·RTP)·결제는 손대지 않는다.** 기본 베팅(4번)은 이미 있는 베팅 단계 안에서 고르기만 한다.
작성: 개선안 팀장(기획). 이 문서는 코드를 바꾸지 않는다. 코드 근거는 `파일:라인`으로 적었고, 줄 번호는 이 브랜치(`slot/review`) 기준이다.

---

## 0. 한눈에

| # | 개선 | 레인 | 서버(API) 변경 | 핵심 수치 |
|---|---|---|---|---|
| 1 | 당첨 연출을 배수 단계로 | A | 없음(디버그 프리셋 4개만) | 베팅 미만 0.6초·소리 없음 / 1~2배 0.9초 / 2~5배 1.5초 / 5~10배 2.2초 / 10배 이상 기존 그대로 |
| 2 | 첫 레벨업을 첫 세션 안으로 | B | 레벨 곡선·보상·해금표 | 레벨 2 = 800 xp(베팅 20으로 40판, 약 2분). 새 곡선은 모든 레벨에서 옛 곡선 이하 |
| 3 | 미션 알림·게임 안 진행·리더보드 | B | 리더보드 보상 표·지난주 보상 받기 | 미션 탭 배지, 게임 화면 토스트 6초, 당첨 패널 빈 시간 한 줄 |
| 4 | 기본 베팅을 잔액의 0.2~0.5%로 | C | 없음 | 10,000코인 기준 classic·royal 10→20, 나머지 유지, astral 100(단계 최솟값이라 예외) |
| 5 | 책임 설계 묶음 | C | 없음(더블업 만료 규칙은 서버 그대로) | 손실 한도 25%/50%/제한 없음(기본 50%), 큰 당첨(10배) 때 멈춤, 60분 휴식 안내, 연령 안내 1회 |

진행 순서: 레인 A·B 동시 → 리드 병합 → 레인 C. 레인별 소유 파일은 §6.

---

## 1. 당첨 연출을 배수에 맞춰 단계화 (레인 A)

### 1.1 지금 구조 (바꿀 자리)

- 일반 스핀 당첨 연출은 렌더러 `buildPresentation`(`packages/renderer/src/presentation.ts:189`)이 만든 스텝을 `runPresentation`(`presentation.ts:349`)이 돌린다. 허브는 **첫 바퀴**(`firstPass`)가 끝나야 `idle`로 돌아온다(`apps/hub/src/store/game.ts:1223`).
- 첫 바퀴 = A단계(전체 강조, `PHASE_ALL_MS` 1,260ms, 당첨 여럿이면 +1,200ms) + 라인마다 B단계 1,900ms(`packages/renderer/src/constants.ts:198-216`). 줄 하나짜리 5코인 당첨도 3.2초를 쓰는 이유다(감사 §2.2).
- 등급은 10배부터만 있다(`packages/renderer/src/wins.ts:44`, 허브 `apps/hub/src/components/game/winTiers.ts:37`). 10배 미만은 전부 `none`이라 소리(`playWin('none')` → `recipe.winSmall`, `apps/hub/src/lib/audio.ts:1832`)와 길이가 같다.
- 10배 이상은 빅윈 오버레이(`WinCelebrationOverlay`)가 먼저 뜨고(`game.ts:1170-1195` `celebrateIfBig`), 그 뒤 전체 라인 연출이 돈다. **이 경로는 그대로 둔다.**

### 1.2 단계 정의

배수 `m = 이번 판 총 당첨(totalWin, 스캐터·리스핀·주문 상품·말판 포함) ÷ 총 베팅(totalBet)`.

| 단계 id | 경계 | 화면 이름(ko / en) | 당첨 패널(WinStrip) | 릴 위 | 소리 |
|---|---|---|---|---|---|
| `none` | m = 0 | - | 변화 없음 | 없음 | 없음 |
| `under` | 0 < m < 1 | 돌려받음 / Returned | 금액을 **굴리지 않고 바로** 표시, 흐린 색(`--text-muted`), 라벨 "돌려받음" | 이긴 칸에 얇은 테두리만(알파 0.5). 딤·심볼 연출·파티클 없음. 순환 없음 | **없음**(릴 정지음만) |
| `small` | 1 ≤ m < 2 | 당첨 / Win | 기존과 같은 롤업 | 기존 A단계(딤 + 테두리 + 심볼 연출 1회) | `recipe.winSmall` 0.5초 |
| `good` | 2 ≤ m < 5 | 좋은 당첨 ×2.4 / Nice win ×2.4 | 라벨이 단계 이름 + 배수. 라벨 한 번 톡(1→1.06→1, 240ms) | A단계 + 심볼 연출 | `winSmall` 0.9초 + 짧은 3음 오름(`recipe.scale`에서) |
| `great` | 5 ≤ m < 10 | 멋진 당첨 ×6.5 / Great win ×6.5 | 라벨 톡 두 번 | A단계 + 심볼 연출 + 코인 8개 짧게(릴 위 캔버스, 스킨이 있으면 스킨 파티클) | `winSmall` 1.4초 + 5음 오름 + `recipe.tickEnd(c,'none')` |
| `big` 이상 | m ≥ 10 | 기존 큰 당첨·대박 당첨… | 기존 | 기존 | 기존 `playWin(tier)` |

- 배수 표기: 소수 첫째 자리 **내림**(`Math.floor(m*10)/10`). 4.96배가 `×5.0`으로 보여 다음 단계처럼 읽히는 일을 막는다.
- 정확히 1배(본전)는 `small`이다. 손해는 아니지만 이득도 아니라 축하 장치(라벨 톡·음 오름)는 붙이지 않는다.
- **프리스핀 판은 베팅을 내지 않았으므로** `under`를 `small`로 올린다(라벨 "당첨"). 손실 위장 문제는 유료 판에만 있다. 렌더러에 `paid` 옵션으로 알린다(§1.5).
- 총 베팅을 모르면(`totalBet` 없음·0) `small`로 본다(빅윈 판정과 같은 "모르면 올리지 않는다" 원칙, `winTiers.ts:44`).
- 사선 광택·당첨 선 그리기 없음. 경로 표시는 기존처럼 칸 테두리·심볼 연출로만 한다.

### 1.3 시간 표 (A단계 유지 시간, ms)

계산식: `hold = max(floor, round(base × winHoldScale × (brief ? 0.6 : 1)))`, `rollup = round(hold × ratio)`.
`winHoldScale`은 기존 속도 프로파일 값(보통·빠름 1, 터보 0.55, `constants.ts:66-78`). `brief`는 오토스핀·프리스핀 중(`roundFlow.ts:273` 그대로). 모션 줄이기는 기존 `cap`(최대 450ms)을 그대로 씌운다.

| 단계 | base | ratio(롤업) | floor | 보통·빠름 | 터보 | 오토/프리스핀 | 오토+터보 | 모션 줄이기 | 첫 바퀴에 들어가는 것 | 첫 바퀴 뒤 |
|---|---|---|---|---|---|---|---|---|---|---|
| under | 600 | 0 | 300 | **600** | 330 | 360 | 300 | 450 | A단계 | 멈춤(테두리만 남음, 순환 없음) |
| small | 900 | 0.55 | 400 | **900** | 495 | 540 | 400 | 450 | A(+피처·룰렛 스텝) | 기존처럼 A→라인→A 순환 |
| good | 1500 | 0.60 | 400 | **1500** | 825 | 900 | 495 | 450 | A(+피처·룰렛 스텝) | 순환 |
| great | 2200 | 0.65 | 400 | **2200** | 1210 | 1320 | 726 | 450 | A(+피처·룰렛 스텝) | 순환 |
| big 이상 | 기존 | 기존 | - | 기존 | 기존 | 기존 | 기존 | 기존 | 기존(라인 전체 포함) | 기존 |

- `under`~`great`는 **당첨이 여럿이어도 머무름(`PHASE_ALL_MULTI_DWELL_MS`)을 붙이지 않는다.** 라인별 B단계는 첫 바퀴 밖(배경 순환)으로 옮긴다. 허브는 A단계가 끝나면 `idle`이고, 라인 문구는 다음 스핀 전까지 WinStrip 아래 줄에서 계속 돈다(지금과 같은 순환).
- 결과(보통 속도, 5릴, 수동): 한 판 = 릴 1.65초 + 숨 고르기 0.1초 + 위 값.

| 단계 | 지금(감사 실측 중앙값) | 바뀐 뒤 |
|---|---|---|
| under | 4.6~5.0초 | 약 2.4초 |
| small | 4.6~5.0초 | 약 2.7초 |
| good | 4.6~5.0초 | 약 3.3초 |
| great | 5.0~5.6초 | 약 4.0초 |
| big | 기존 | 기존 |

### 1.4 피처·게임 형식별 적용

| 경로 | 어디서 | 적용 |
|---|---|---|
| 줄(classic·fruit·royal·sheriff·kraken·hanbok) | `buildPresentation` 표준 경로 | 위 표 그대로 |
| 웨이즈(shiba·astral·idol) | 같은 경로(`sortWaysWins`) | 같음 |
| 클러스터 연쇄(candy) | `buildCascadePresentation`(`presentation.ts:136`) | 연쇄 중 «히트→딜레이→팝»은 손대지 않는다. 연쇄 뒤 A단계 유지 시간만 단계 표로. 롤업은 기존처럼 연쇄 합(`fromAmount`)에서 시작. `under`면 롤업 0 |
| 코인 리스핀(kraken) | `respinPayoutOf` 합산 총액 | 단계는 리스핀 포함 총액으로. 리스핀 정산 화면 소리(`respinSfx.ts`)는 10배 이상만 내는 지금 규칙 유지 |
| 프리스핀 각 판 | brief | 오토/프리스핀 열의 값. `paid:false`라 `under`는 `small`로 |
| 프리스핀 종료 팝업 | `RoundPopup.tsx:82`(등급 `'none'` 고정) | 총 베팅을 새로 받아 단계를 구한다. 등급(이름·색)은 지금처럼 매기지 않는다. 추가: 금액 아래 한 줄 "베팅의 ×4.9". `under`(세션 합 < 1배)면 코인 샤워 끔(`WinCelebrationFx shower=false`). 나머지는 지금 샤워 그대로 |
| 말판 요약(hanbok) | `board/BoardBonus.tsx:698` 요약 카드, `boardSfx.summary()` | 요약 카드에 "베팅의 ×N" 한 줄. 합계가 `under`면 요약 축하음 대신 조용한 마감음(`playRollupEnd('none')`만) |
| 무대 룰렛 요약(idol) | `StageRoulette.tsx:644` `summary()` | 같은 규칙. `playRouletteCue({kind:'summary', big})`의 `big`은 그대로 두고, `under`면 요약 큐를 내지 않는다 |
| 10배 이상 | `celebrateIfBig`·`WinCelebrationOverlay` | 변경 없음 |

### 1.5 구현 설계

**렌더러 (`packages/renderer`)**

1. 새 파일 `src/winBands.ts`(순수):
   - `export type WinBand = 'none' | 'under' | 'small' | 'good' | 'great' | 'big'`
   - `export const WIN_BAND_MULTIPLIERS = { small: 1, good: 2, great: 5, big: 10 } as const` — `big`은 `WIN_TIER_MULTIPLIERS.big`을 import해 같은 값임을 테스트로 묶는다.
   - `winBandFor(totalWin, totalBet?, opts?: { paid?: boolean }): WinBand`
   - `WIN_BAND_TIMING: Record<'under'|'small'|'good'|'great', { baseMs; rollupRatio; floorMs }>`와 `bandHoldMs(band, { speed, brief, reducedMotion })`, `bandRollupMs(...)`.
   - `WIN_BAND_COIN_COUNT = 8`(great만).
   - `floorMultipleLabel(m)` → `"4.9"` (내림).
2. `src/constants.ts`: 위 상수는 `winBands.ts` 안에 두고 constants에는 넣지 않는다(공용 파일 충돌 줄이기).
3. `src/presentation.ts`:
   - `PresentationOptions`에 `paid?: boolean`(기본 true) 추가.
   - `PresentationStep`의 `all`에 `band: WinBand`와 `quiet?: true`(under) 추가.
   - `buildPresentation`/`buildCascadePresentation`: 단계가 `under`~`great`면 홀드·롤업을 `bandHoldMs`/`bandRollupMs`로, 머무름 0. `big`이면 기존 계산 그대로(회귀 없음).
   - 새 함수 `firstPassStepCount(steps)`: `big`이면 `steps.length`, 아니면 «라인이 아닌 스텝 수»(A + 피처 + 룰렛).
   - `runPresentation`의 `deps`에 `firstPassAfter?: number` 추가. 그 수만큼 스텝을 그린 뒤 `firstPass`를 resolve하고, **같은 바퀴의 나머지 스텝은 계속 그린다**(배경). 기본값은 지금처럼 `steps.length`.
   - `shouldLoopPresentation`: `under`면 false.
4. `src/types.ts`: `ShowWinsOptions.paid?: boolean`, `winTotal` 이벤트에 `band: WinBand`(필수로 추가해도 허브만 소비자라 안전. 테스트 픽스처는 같이 고친다).
5. `src/pixi/pixiRenderer.ts`:
   - `showWins`(`:1394`): `first.band === 'great'`이면 코인 8개(`burstCoins(..., WIN_BAND_COIN_COUNT)` 또는 스킨이면 `celebrationParticleCount(skin,'none',8,…)`). `big` 이상은 지금 코드 그대로.
   - `runPresentation` 호출에 `firstPassAfter: firstPassStepCount(steps)` 전달.
   - `renderStep`(`:1464`): `step.quiet`이면 `drawWinGlow(positions)`만(알파 0.5), `dimExcept`·`crossfadeOverlay`·`playFxAt` 생략. `winCycle`/`winTotal` 이벤트는 그대로 내되 `durationMs: 0`.
   - 메모리: 새 텍스처·새 풀 없음. 코인은 기존 `particlePool`을 쓴다.
6. `src/index.ts`: `winBands.ts` 내보내기 한 줄.

**허브 (`apps/hub`)**

1. `store/game.ts:1223` `renderer.showWins` 호출에 `paid: freeSpins === null`만 추가(이 hunk 하나만. 나머지 game.ts는 레인 C 소유).
2. `components/game/GameScreen.tsx`
   - `winTotal` 처리(`:922-975`): `event.band`로 소리를 고른다. `under` → 소리·틱 없음, 즉시 최종값. `small/good/great` → 새 `playWinBand(band, durationMs)`. `big`(event.tier ≠ none) → 기존 `playWin(tier)`.
   - 당첨 패널 라벨 계산(`:1384` `winStripLabel`): 마지막 `winTotal`의 단계를 상태로 들고(`winBand`), `under` → `t('winBandUnder')`, `good` → `t('winBandGood', { x })`, `great` → `t('winBandGreat', { x })`, 그 밖은 기존 라벨. 새 스핀이 시작되면(`:1021` 지우기 effect) `winBand`도 `none`.
   - `<WinStrip band={winBand} …>` 한 줄.
   - `<RoundPopupView … totalBet={…}>` 한 줄(프리스핀 세션 베팅 `freeSpins.totalBet` 또는 마지막 결과의 `totalBet`).
3. `components/game/WinStrip.tsx/.css`: `band?: WinBand` → 루트에 `hub-win-strip--band-<band>` 클래스. CSS만으로 흐린 색(`under`), 라벨 톡(`good` 1회, `great` 2회, `prefers-reduced-motion`·`.reduced-motion`이면 끔). **마크업 줄 수·높이는 바꾸지 않는다**(`WinStrip.tsx:31-40` 높이 고정 주석).
4. `components/game/RoundPopup.tsx`: `totalBet?: number` prop. 있으면 "베팅의 ×N" 줄과 `under` 샤워 끔.
5. `components/game/winTiers.ts`: `winBandFor` 재수출(허브 쪽이 렌더러 상수를 직접 들고 다니지 않게).
6. `lib/audio.ts`: `playWin`(`:1832`) **바로 아래**에 `playWinBand(band, durationMs)`와 내부 `bandSting(c, notes)` 추가. 새 레시피 키를 만들지 않고 기존 `recipe.winSmall`·`recipe.scale`·`recipe.tickEnd`만 조합한다(10개 프리셋 전부 자동 적용, 신작 팀 프리셋도 자동).
7. `components/game/board/BoardBonus.tsx`, `StageRoulette.tsx`: 요약에 "베팅의 ×N" 한 줄, `under` 소리 규칙(§1.4).

**API (디버그 전용)**

- `packages/shared/src/schemas.ts:130` `'lose',`(디버그 enum 안의 것. `:633` outcome enum 아님) 바로 다음 줄에 `'winUnder', 'winSmall', 'winGood', 'winGreat',` 삽입(enum 끝에 붙이지 않는다 — 신작 팀이 끝에 붙인다).
- `apps/api/src/games/debugSpin.ts:66` `matchesDebugPreset`: 피처 없는 판에서 `0<m<1`, `1≤m<2`, `2≤m<5`, `5≤m<10`.
- `apps/hub/src/lib/debugPreset.ts:12` `DEBUG_PRESETS`에 네 개 추가.

### 1.6 서버/클라 경계

- 서버는 아무것도 새로 정하지 않는다. 금액·베팅은 응답 그대로, 단계는 표시 계산일 뿐이다. 수학·RTP 영향 0.
- 디버그 프리셋은 `API_ALLOW_DEBUG_SPIN`일 때만(기존 규칙).

### 1.7 스토리보드

화면 구획(390×844, `audit-shots/06-classic-enter.jpg` 실측): 상단바 0~52 / 릴 무대 52~630 / 당첨 패널 630~730(라벨·금액·라인 줄) / 속도 730~775 / 베팅·스핀 775~844.
430×932는 같은 순서로 무대가 세로로 약 80px 더 길다. 패널·버튼 높이는 같다(고정 높이). 글자 크기 변화 없음.

**A. 베팅 미만 (classic 베팅 20, 당첨 5)**

| t(ms, 마지막 릴 정지 기준) | 릴 무대 | 당첨 패널 | 소리 |
|---|---|---|---|
| 0 | 릴 정지 | 직전 값 지워짐(0) | 릴 정지음 |
| 100 | 이긴 3칸에 얇은 테두리(흐림). 다른 칸은 밝기 그대로 | 라벨 "돌려받음", 금액 **5**가 흐린 색으로 바로 뜸(굴림 없음) | 없음 |
| 700 | 테두리 유지. 순환 없음 | 그대로 | - |
| (언제든) SPIN | 테두리 사라지고 새 판 | 0 | - |

**B. 좋은 당첨 (shiba 베팅 25, 당첨 70 = ×2.8)**

| t | 릴 무대 | 당첨 패널 | 소리 |
|---|---|---|---|
| 100 | 이긴 칸 외 어둡게, 테두리 + 심볼 연출 1회 | 라벨 "좋은 당첨 ×2.8"(톡 1회), 금액 0→70 굴림 900ms | winSmall 0.9초 + 3음 오름 |
| 1,600 | `idle` 진입. 배경 순환 시작: 라인 B단계 1,900ms씩 | 금액 70 고정, 아래 줄에 "벚꽃 ×3 · 243 ways · 40" 같은 라인 문구가 순환 | - |

**C. 멋진 당첨 (fruit 베팅 20, 당첨 130 = ×6.5)**: B와 같고, 100ms에 릴 무대 위로 코인 8개가 0.9초 튀었다 떨어진다. 라벨 "멋진 당첨 ×6.5" 톡 2회, 굴림 1,430ms, 2,300ms에 `idle`.

**D. 오토스핀·터보**: 같은 화면, 위 표의 짧은 값. `under`는 오토+터보에서 0.3초.

**E. 프리스핀 종료(sheriff, 세션 합 98, 베팅 20 = ×4.9)**: 지금 팝업 그대로 + 금액 아래 "베팅의 ×4.9". 세션 합이 15(×0.7)면 코인 샤워 없이 숫자만.

### 1.8 테스트

| 파일 | 항목 |
|---|---|
| `packages/renderer/src/winBands.test.ts`(새) | 경계값 0, 0.99, 1, 1.99, 2, 4.99, 5, 9.99, 10 / `paid:false`에서 under→small / totalBet 없음·0 → small / `big` 경계가 `WIN_TIER_MULTIPLIERS.big`과 같음 / 시간 표 16칸(4단계×4속도조합) 정확값 / 모션 줄이기 450 상한 / 내림 표기 4.96→"4.9" |
| `presentation.test.ts` | under: 스텝 1개, `quiet`, loop false, 롤업 0 / small~great: 머무름 0, `firstPassStepCount`가 라인 수를 빼고 셈 / 피처 걸린 small: 첫 바퀴에 피처 스텝 포함 / big: **기존 테스트 그대로 통과**(회귀 확인) / 연쇄 모드 band 반영 |
| `presentation.test.ts`(runPresentation) | `firstPassAfter=1`이면 A 뒤 resolve, 라인 스텝은 계속 렌더, 취소되면 멈춤 |
| `apps/hub/.../WinStrip.test.tsx` | band 클래스, 높이 관련 마크업 불변 |
| `apps/hub/.../RoundPopup.test.tsx` | totalBet 있을 때 ×N 줄, under 샤워 끔 |
| `apps/hub/.../GameScreen.winBands.test.tsx`(새 파일, 큰 `GameScreen.test.tsx`에 섞지 않는다) | under 이벤트 → `playWin`·`playWinBand` 미호출, 금액 즉시 / good 라벨 문구 / 새 스핀에 라벨 초기화 |
| `apps/hub/src/lib/audio.test.ts` | `playWinBand('under')`가 소리 노드를 만들지 않음 |
| `apps/api/src/routes/spinDebug.test.ts` | 새 프리셋 4개가 classic에서 맞춰지고 m 범위가 맞음 |

### 1.9 QA 확인표 (기능별 1회, 디버그 프리셋으로)

주소 `http://localhost:<레인 포트>/#/play/<id>?debug=1`, 뷰포트 390×844·430×932, 판정은 스크린샷을 직접 보고.

| # | 게임 | 조건 | 확인할 것 | 결과 |
|---|---|---|---|---|
| A1 | classic-777 | winUnder, 보통 | "돌려받음"·흐린 금액·굴림 없음·순환 없음, `idle`까지 0.8초 이내(디버그 패널 firstPassMs) | |
| A2 | classic-777 | winSmall | 라벨 "당첨", 0.9초 | |
| A3 | shiba-shrine | winGood | "좋은 당첨 ×N", 첫 바퀴 1.5초, 이후 라인 순환 | |
| A4 | fruit-fiesta | winGreat | 코인 8개, "멋진 당첨 ×N", 2.2초 | |
| A5 | kraken-cove | bigWin | 기존 빅윈 오버레이 그대로(회귀) | |
| A6 | candy-cluster-pop | cascade3 | 연쇄 «히트→딜레이→팝» 그대로, 마지막 A단계만 단계 시간 | |
| A7 | kraken-cove | coinRespin | 리스핀 합 포함 단계 | |
| A8 | hanbok-night-market | boardBonus | 요약에 ×N, under면 조용 | |
| A9 | idol-stage-live | roulette | 룰렛 요약 ×N | |
| A10 | sheriff-sixgun | freeSpins 후 종료 | 종료 팝업 ×N, 프리스핀 판의 소액 당첨이 "돌려받음"이 아님 | |
| A11 | astral-clocktower | win(오토 10회) | 오토 짧은 값 | |
| A12 | classic-777 | winUnder, 터보 | 0.33초 | |
| A13 | 아무 게임 | 모션 줄이기 켬 | 450ms 상한, 라벨 톡 없음 | |
| A14 | 소리 | earshot | under 무음, small/good/great 길이가 커지는 순서. `docs/SOUND_CHECK.md`에 수치 기록, 최종 귀 판정은 사용자 몫 | |

---

## 2. 첫 레벨업을 첫 세션 안으로 (레인 B)

### 2.1 지금

- xp = 누적 유료 베팅. 레벨 n 문턱 `round(2000 × n^1.6)`(`apps/api/src/economy/level.ts:11`, `config.ts:76-78`). 레벨 2 = 6,063 xp → 베팅 10으로 607판(감사 §1.3).
- 레벨업 보너스 `200 × 도달 레벨`(`config.ts:80`), 최대 베팅 해금 L3=200, L6=500(`config.ts:82-86`).
- 레벨은 저장값이 아니라 xp에서 다시 계산한다(`level.ts:39`, `repos/drizzle.ts:371`). 그래서 곡선만 바꿔도 즉시 반영된다.

### 2.2 새 곡선 (서버 권위)

```
legacy(n) = round(2000 × n^1.6)
fresh(n)  = round(800 × (n−1)^1.7)
xpForLevel(n) = n ≤ 1 ? 0 : min(legacy(n), fresh(n))
```

- `fresh`는 n ≤ 999 전 구간에서 `legacy` 이하다(직접 계산 확인). 그래도 `min`을 남겨 **어떤 xp에서도 새 레벨 ≥ 옛 레벨**을 식 자체로 보장한다. → 기존 사용자 레벨은 절대 내려가지 않는다.
- 레벨업 보너스: `max(300, 100 × 도달 레벨)`. 곡선이 빨라진 만큼 레벨당 보상을 줄여 «보너스 ÷ 누적 베팅» 비율을 옛 곡선 수준(L10 기준 옛 13.6% → 새 16.4%)으로 맞춘다. 게임 RTP 밖의 허브 보상이다(데일리·미션과 같은 층).
- 최대 베팅 해금: `{minLevel 10: 500}, {5: 200}, {1: 100}`. 해금 xp가 옛것보다 늦어지지 않게 고른 값이다(옛 200 해금 11,599 → 새 8,445 / 옛 500 해금 35,162 → 새 33,520). 0~200만 xp를 50 간격으로 훑어 «새 최대 베팅 < 옛 최대 베팅»인 xp가 0건임을 확인했다.

| 레벨 | 누적 xp | 이번 구간 xp | 베팅 20으로 누적 판 수 | 평균 3.5초/판 누적 시간 | 보상 | 누적 보상 | 최대 베팅 | (같은 xp의 옛 레벨) |
|---|---|---|---|---|---|---|---|---|
| 2 | **800** | 800 | **40** | 약 2분 | 300 | 300 | 100 | 1 |
| 3 | 2,599 | 1,799 | 130 | 8분 | 300 | 600 | 100 | 1 |
| 4 | 5,178 | 2,579 | 259 | 15분 | 400 | 1,000 | 100 | 1 |
| 5 | 8,445 | 3,267 | 423 | 25분 | 500 | 1,500 | **200** | 2 |
| 6 | 12,341 | 3,896 | 618 | 36분 | 600 | 2,100 | 200 | 3 |
| 7 | 16,825 | 4,484 | 842 | 49분 | 700 | 2,800 | 200 | 3 |
| 8 | 21,865 | 5,040 | 1,094 | 64분 | 800 | 3,600 | 200 | 4 |
| 9 | 27,437 | 5,572 | 1,372 | 80분 | 900 | 4,500 | 200 | 5 |
| 10 | 33,520 | 6,083 | 1,676 | 98분 | 1,000 | 5,500 | **500** | 5 |
| 11 | 40,095 | 6,575 | 2,005 | 117분 | 1,100 | 6,600 | 500 | 6 |
| 12 | 47,147 | 7,052 | 2,358 | 138분 | 1,200 | 7,800 | 500 | 7 |
| 15 | 71,041 | - | 3,553 | 207분 | 1,500 | 12,000 | 500 | 9 |

- 기본 베팅(§4)이 20~50이라 레벨 2는 16~40판 안이다(astral은 베팅 100이라 8판).
- **기존 사용자**: 배포 뒤 첫 스핀에서 `users.level`이 새 값으로 갱신된다. 건너뛴 레벨의 보너스는 소급하지 않는다(`previousLevel`도 새 곡선으로 계산하므로 이벤트가 생기지 않는다, `drizzle.ts:371`·`memory.ts:341`). 마이그레이션 없음.

### 2.3 응답 계약 (추가만)

`packages/shared/src/schemas.ts:15` `LevelSchema` 객체 안, `maxBet` 다음에 선택 필드:
- `levelStartXp?: int` — 현재 레벨 문턱(바 진행률 분모용).
- `nextLevelBonus?: int` — 다음 레벨 도달 보상.
- `nextUnlock?: { level: int, maxBet: int } | null` — 다음 최대 베팅 해금(없으면 null).
`toLevelState`(`level.ts:39`)가 채운다. `/me`·`/hub` 응답 그대로 흘러간다. 체험판(`apps/hub/src/demo/server.ts`)은 API 코드를 그대로 돌리므로 자동 반영.

### 2.4 화면

**레벨 바**(`components/hub/LevelBar.tsx`): 진행률을 `(xp − levelStartXp) ÷ (nextLevelXp − levelStartXp)`로. 오른쪽 글자 `"312 / 1,799"`(이번 구간). `levelStartXp`가 없으면 지금 계산으로 폴백.

**레벨업 카드**(새 `components/game/LevelUpCard.tsx`): 지금의 레벨업 배너(`GameScreen.tsx:1935-1946`)를 대체.
- 뜨는 시점: 스핀 응답에 `levelUp`이 있고, 그 판의 연출이 끝나 `phase === 'idle'`이며 빅윈 오버레이·세리머니 팝업이 없을 때. 연출과 겹치지 않는다.
- 390×844: 릴 무대 위쪽 1/3(상단바 아래 72px부터), 폭 300px 카드. 430은 폭 320px. 배경 딤 없음, 카드만 입력을 받는다(아래 SPIN은 그대로 눌린다 — 누르면 카드 닫힘).
- 내용(ko): "레벨 업!" / "Lv.1 → Lv.2" / "+300 코인"(0→300 굴림 600ms) / 진행 바가 100%→0%로 비워졌다 다시 채워질 준비(400ms) / "다음 레벨 보상 +300" / `nextUnlock`이 있으면 "Lv.5에 최대 베팅 200".
- 3.0초 뒤 자동 닫힘, 탭으로 즉시 닫힘. 소리: 기존 `playUiSound('up')`(audio.ts는 레인 A 소유라 새 소리는 만들지 않는다).
- 오토스핀 중: 카드 대신 상단 한 줄 토스트 "Lv.2 달성 · +300" 1.6초.

### 2.5 테스트·QA

| 파일 | 항목 |
|---|---|
| `apps/api/src/economy/economy.test.ts` | 표의 L2~L12 xp 정확값 / n=1..999 전부 `xpForLevel_new ≤ legacy` / 0~2,000,000 xp(1,000 간격)에서 새 레벨 ≥ 옛 레벨, 새 maxBet ≥ 옛 maxBet / 보너스 L2=300, L4=400, L10=1,000 / `toLevelState`의 새 필드 |
| `apps/api/src/routes/hub.test.ts:528,591` | 6,063 기준 주석·값을 800 기준으로 갱신 |
| `apps/hub/.../LevelBar` 테스트(새) | 구간 진행률, 폴백 |
| `apps/hub/.../LevelUpCard.test.tsx`(새) | 연출 중 안 뜸, idle에 뜸, 3초 닫힘, 오토 토스트 |

| # | QA | 결과 |
|---|---|---|
| B1 | 새 사용자로 classic 베팅 20 수동 40판 → 레벨 2 카드, +300, 잔액 반영 | |
| B2 | 카드가 빅윈 오버레이·프리스핀 팝업과 겹치지 않음(bigWin 프리셋 판에서 레벨업) | |
| B3 | 로비 레벨 바 구간 진행률·숫자 | |
| B4 | 오토스핀 중 레벨업 → 한 줄 토스트, 오토 계속 | |

---

## 3. 미션 완료 알림·게임 안 진행·리더보드 (레인 B)

### 3.1 지금

- 스핀 응답에 오늘 미션 진행도가 이미 온다(`SpinResponse.missions`, `schemas.ts:319`), 허브가 `setMissions`로 반영한다(`store/game.ts:1063`). 알림·배지가 없을 뿐이다.
- 미션 받기 API·스토어 액션은 있다(`routes/missions.ts:36`, `store/hub.ts` `claimMission`).
- 리더보드는 이번 주 상위 50·내 순위·종료 시각만 준다(`routes/leaderboard.ts`). 보상 지급은 **없다**. 그래서 «보상 안내»를 보여 주려면 실제 지급을 함께 만든다(안내만 하고 안 주면 거짓 약속).

### 3.2 미션 알림

- `store/hub.ts` `setMissions(missions)`: 같은 날(`day`) 이전 상태에서 `completed:false`였다가 `completed:true && !claimed`가 된 미션을 `missionNotices` 큐에 넣는다. 날이 바뀌면 큐를 비운다. 선택자 `unclaimedMissionCount`.
- **미션 탭 배지**(`BottomTabs.tsx`): 미션 아이콘 오른쪽 위 지름 16px 빨간 원 + 숫자(1~9, 10 이상 "9+"). 0이면 없음.
- **게임 화면 토스트**(새 `components/game/MissionToast.tsx`):
  - 위치: 상단바 바로 아래, 릴 무대 위에 겹쳐 가운데 정렬, 폭 `min(340px, 100vw − 32px)`, 높이 52px. 390·430 같은 높이.
  - 내용: "✓ 미션 완료 · 50회 스핀하기" + 오른쪽 버튼 "받기 +1,000".
  - 6초 뒤 사라짐(받지 않아도 미션 탭에 남는다). 여러 개면 차례로.
  - 받기 버튼은 `phase === 'idle'`이고 오토스핀이 꺼져 있을 때만 누를 수 있다. 오토 중에는 버튼 없이 "미션 탭에서 받기" 문구로 3초.
  - 받기 성공: 버튼 자리에 "+1,000" 1초, 지갑 반영. **지갑 경합 방지**: 받기 요청 시점의 `useGameStore.getState().lastResult?.roundId`를 기억하고, 응답이 왔을 때 그 값이 바뀌었으면(그 사이 스핀 응답이 왔으면) 받기 응답의 `wallet`을 쓰지 않는다(스핀 응답이 더 새롭다).
- **당첨 패널 빈 시간 진행 한 줄**(새 순수 함수 `lib/progressLine.ts`):
  - 보이는 조건: 렌더러 라인 문구(`lineLabelSource`)가 없고, 당첨 패널 금액이 0이며, 더블업·프리스핀·룰렛이 없을 때. 즉 꽝 판 뒤와 게임 진입 직후.
  - 우선순위: ① 받을 미션이 있으면 "미션 완료! 미션 탭에서 받기" ② 미완료 미션 중 진행률이 가장 높은 것(이 게임 전용 미션이 있으면 그것 먼저) "미션 · 50회 스핀 32/50" ③ 미션을 다 했으면 "Lv.3까지 1,240" ④ 없으면 빈 줄.
  - 연결: `GameScreen.tsx:1432` `lineLabel` 계산 끝에 `?? progressLineLabel` 폴백만 붙인다. **WinStrip 파일은 고치지 않는다**(레인 A 소유). 같은 `line-label` 모양으로 그려진다.

### 3.3 리더보드

**서버**
- `config.ts` 리더보드 구역(`LEADERBOARD_TOP_N` 아래)에 보상 표:

| 순위 | 보상(가상 코인) |
|---|---|
| 1위 | 10,000 |
| 2위 | 6,000 |
| 3위 | 4,000 |
| 4~10위 | 2,000 |
| 11~50위 | 800 |

- 순위 기준은 지금 그대로 «이번 주 당첨 코인 합계»(`memory.ts:800`).
- `GET /leaderboard` 응답에 선택 필드 추가: `rewards: [{ fromRank, toRank, coins }]`, `lastWeek: { week, rank, reward, claimed } | null`(지난 ISO 주에 50위 안이었을 때만).
- `POST /leaderboard/claim`: 지난 주 보상만 받을 수 있다(그 전 주는 소멸). 원장 사유 `leaderboard_reward`, `refId = "<week>:<userId>"`. 원장 `(reason, ref_id)` 유니크(`db/schema.ts:76-92`)가 이중 지급을 DB에서 막으므로 **테이블·마이그레이션이 필요 없다**. 이미 받았거나 대상이 아니면 `409 NOT_CLAIMABLE`. 응답은 기존 `BonusClaimResponse`.
- 저장소: `repos/types.ts`에 `getLeaderboardRewardClaimed(userId, week)`, `claimLeaderboardReward({userId, week, amount, reason})` 추가, `memory.ts`·`drizzle.ts` 구현. 지난주 순위는 기존 `getLeaderboard(prevWeek, TOP_N, userId).me.rank`로 구한다.
- `economy/time.ts`에 `previousIsoWeekKey(now)` 추가.

**화면**(`components/hub/LeaderboardScreen.tsx`), 위에서 아래로:
1. 제목 "이번 주 순위" + "2일 17시간 남음"(새 `formatRemainingLong` — 1일 이상 "N일 M시간", 1시간 이상 "H시간 M분", 그 밑 "M분". 지금의 "65:50" 표기를 대체. `lib/countdown.ts`에 **새 함수를 추가**하고 기존 `formatCountdown`은 그대로 둔다).
2. 지난주 보상 띠(`lastWeek`가 있고 안 받았을 때만): "지난주 12위 · 보상 800" + [받기].
3. 내 순위 카드(항상): 있으면 "#12 · 당첨 합계 3,420 · 최고 ×18.5", 없으면 "아직 순위가 없어요. 아무 게임이나 한 판 돌리면 참가해요."
4. 보상 안내 카드: 위 표 5줄 + "순위는 이번 주 당첨 코인 합계로 정해요. 보상은 다음 주에 이 화면에서 받아요. 가상 코인이며 현금 가치가 없어요."
5. 순위 목록. 비었으면 "이번 주 첫 순위의 주인공이 되어 보세요."

390×844에서 1~4가 첫 화면 안(약 520px)에 들어가고 목록은 아래로 스크롤. 430도 같은 순서.

### 3.4 테스트·QA

| 파일 | 항목 |
|---|---|
| `apps/hub/src/store/hub.test.ts` | 미완료→완료 전환만 큐에 / 이미 완료였던 건 다시 안 넣음 / 날 바뀌면 비움 / 배지 수 |
| `apps/hub/src/lib/progressLine.test.ts`(새) | 우선순위 ①~④, 게임 전용 미션 우선 |
| `apps/hub/.../MissionToast.test.tsx`(새) | 6초 사라짐, idle에서만 받기, roundId 바뀌면 지갑 무시 |
| `apps/hub/.../GameScreen.progress.test.tsx`(새 파일) | 꽝 뒤 진행 한 줄, 당첨 중에는 라인 문구 |
| `apps/api/src/routes/leaderboard.test.ts`(새) | 보상 표, 시계 주입으로 지난주 50위 안 → lastWeek, claim 200 → 두 번째 409, 51위 409, 2주 전 409, 원장 1행 |
| `repos/drizzle.integration.test.ts` | claim 유니크(가능하면) |
| `LeaderboardScreen.test.tsx` | 빈 화면에 내 순위 안내·보상 표·"N일 M시간" |
| `lib/countdown.test.ts` | `formatRemainingLong` 경계(59분, 1시간, 23시간 59분, 1일) |

| # | QA | 결과 |
|---|---|---|
| B5 | classic `win` 프리셋 3번 → 3회 당첨 미션 완료 토스트, 받기 → +500, 미션 탭 배지 사라짐 | |
| B6 | 토스트 무시 → 로비 미션 탭 배지 1 | |
| B7 | 꽝 판 뒤 당첨 패널 아래 진행 한 줄, 당첨 판에는 라인 문구 | |
| B8 | 리더보드 빈 상태(새 사용자): 남은 시간 "N일 M시간", 내 순위 안내, 보상 표 | |
| B9 | 한 판 뒤 리더보드: 내 순위 카드 | |
| B10 | 지난주 보상 받기는 API 테스트(시계 주입)로 확인. 브라우저는 띠가 안 뜨는 것만 | |

---

## 4. 기본 베팅을 잔액의 0.2~0.5%로 (레인 C)

### 4.1 지금

- 진입 시 기본 베팅 = 저장된 인덱스(`tgslot.bet.<id>`) 또는 `betLevels[0]`(`store/game.ts:777-785`). 저장은 사용자가 바꿀 때와 `BET_LOCKED` 보정 때 모두 일어난다(`game.ts:823, 932`).
- 시작 잔액 10,000(`packages/shared/src/constants.ts:2`).

### 4.2 규칙 (클라이언트, 순수 함수 `apps/hub/src/lib/defaultBet.ts`)

```
입력: betLevels, balance(지갑 coins), maxBet(레벨 해금 상한)
lo = 0.002 × balance, hi = 0.005 × balance, target = 0.003 × balance
pool = betLevels 중 ≤ maxBet (비면 [최소 단계])
1) pool ∩ [lo, hi]가 있으면 target에 가장 가까운 단계(같으면 작은 쪽)
2) 없으면 lo보다 작은 단계 중 가장 큰 것
3) 그것도 없으면 pool의 최소 단계
```

**잔액 10,000·레벨 1(최대 100) 결과 — 10종 표**

| 게임 | 베팅 단계 | 지금 기본 | 새 기본 | 잔액 대비 |
|---|---|---|---|---|
| classic-777 | 10/20/50/100/200/500 | 10 | **20** | 0.20% |
| fruit-fiesta | 20/40/100/200/400/1000 | 20 | 20 | 0.20% |
| royal-diamond-777 | 10/20/50/100/200/500 | 10 | **20** | 0.20% |
| sheriff-sixgun | 20/40/100/200/400/1000 | 20 | 20 | 0.20% |
| shiba-shrine | 25/50/100/250/500/1000 | 25 | 25 | 0.25% |
| astral-clocktower | 100/200/400/1000/2000/4000 | 100 | 100 | **1.00% (예외)** |
| candy-cluster-pop | 20/40/100/200/500/1000 | 20 | 20 | 0.20% |
| kraken-cove | 20/40/100/200/500/1000 | 20 | 20 | 0.20% |
| hanbok-night-market | 25/50/100/250/500/1000 | 25 | 25 | 0.25% |
| idol-stage-live | 50/100/250/500/1000/2500 | 50 | 50 | 0.50% |

- **astral 예외**: 웨이즈 베팅 단위 `betDivisor 100`(`games/astral-clocktower/math.json` `ways.betDivisor`)이라 100 밑으로는 웨이당 베팅이 정수가 안 된다. 낮추려면 수학 변경(나눗수·지급표 재조정 + RTP 재감사)이 필요해 이번 범위 밖이다. 후속 과제로 남긴다. 감사의 "astral 기본 20~25" 제안은 이 제약 때문에 지금은 불가능하다.
- 잔액에 따른 예(같은 규칙): 3,000 → classic·royal 10, 나머지 최소 단계 / 30,000 → 전 게임 100 / 50,000·레벨 5 → 전 게임 100 / 200,000·레벨 10 → fruit·sheriff·astral 400, 나머지 500.
- 게임 팩(`games/*/manifest.json`·`math.json`)은 **고치지 않는다.** 규칙이 표를 만들고, 테스트가 10개 manifest를 읽어 이 표를 고정한다. 신작 3종도 자동 적용된다. manifest 스키마(`packages/game-sdk/src/manifest.ts`)는 신작 팀이 병렬로 고치는 파일이라 필드를 늘리지 않는다.

### 4.3 «사용자가 고른 베팅은 존중»

- 저장 형식 변경: `tgslot.bet.<id>` 값을 `{"v":2,"bet":<금액>}`(금액 저장)으로. **사용자가 베팅 −/+를 눌렀을 때만** 쓴다. `BET_LOCKED` 보정은 상태만 바꾸고 저장하지 않는다.
- 옛 형식(숫자 인덱스)은 사용자가 고른 것으로 보고 그 인덱스의 금액으로 읽는다.
- 진입 시: 저장된 금액이 있고 `≤ maxBet`이며 `≤ 현재 잔액`이면 그대로. 아니면 규칙 값(저장된 선택은 지우지 않는다 — 잔액이 회복되면 다시 쓴다).
- 잔액 출처: `useSessionStore.getState().wallet.coins`. 레벨 상한: `useHubStore.getState().levelInfo?.maxBet`(없으면 100).

### 4.4 테스트·QA

| 파일 | 항목 |
|---|---|
| `apps/hub/src/lib/defaultBet.test.ts`(새) | 위 10종 표(실제 `games/*/manifest.json` 읽기), 잔액 3,000/30,000/50,000/200,000 예, maxBet 클램프, 동점 작은 쪽 |
| `apps/hub/src/store/game.test.ts` | 저장 없음 → 규칙 값 / v2 저장 존중 / 옛 인덱스 존중 / 저장 금액 > 잔액 → 규칙 값(저장 유지) / BET_LOCKED는 저장 안 함 |

| # | QA | 결과 |
|---|---|---|
| C1 | 새 사용자 classic 진입 → 베팅 20 | |
| C2 | idol 진입 50, astral 100 | |
| C3 | classic에서 50으로 바꾸고 나갔다 들어옴 → 50 유지 | |
| C4 | 잔액을 3,000 근처로 만든 뒤(로컬 메모리 저장소) 새 게임 진입 → 규칙 값 | |

---

## 5. 책임 설계 묶음 (레인 C)

### 5.1 (a) 오토스핀 손실 한도·큰 당첨 때 멈춤

- «무제한»은 유지(`store/game.ts:80` `AUTO_SPIN_COUNTS`).
- 시트 구성(중앙 모달, `GameScreen.tsx:2210`). 지금은 횟수 버튼을 누르면 바로 시작한다 → **고르고 [시작]** 으로 바꾼다.
  1. 제목 "오토스핀" + 안내 한 줄(기존 문구 키 유지).
  2. 횟수: 10 / 25 / 50 / 100 / 무제한 (선택형 칩, 기본 25).
  3. 손실 한도: 25% / **50%(기본)** / 제한 없음 — 아래 작은 글씨 "시작 잔액 10,000 기준 5,000까지".
  4. 큰 당첨 때 멈춤: 토글(기본 꺼짐), 설명 "베팅의 10배 이상 당첨되면 멈춰요".
  5. [오토스핀 시작](주 버튼), [닫기].
  - 390×844에서 모달 높이 약 520px로 스크롤 없이 들어간다. 430은 같은 구성.
  - 마지막 선택(한도·토글)은 `localStorage tgslot.autospin.v1`에 기억(접근 실패 시 기본값).
- 상태: `autoSpin: { remaining, startCoins, lossLimit: number | null, stopOnBigWin: boolean }`.
- 판정(다음 **유료** 판을 걸기 직전, 기존 잔액 부족 판정 자리):
  - `lossLimit`이 있으면 `손실 = startCoins − 현재 coins`, `손실 + 다음 베팅 > floor(startCoins × lossLimit)`이면 멈춤(한도를 넘기 전에 멈춘다).
  - `stopOnBigWin`이고 방금 판 `totalWin ≥ 10 × totalBet`(빅윈 오버레이 기준과 같다)이면 멈춤. 프리스핀 자동 진행은 서버 라운드라 그대로 끝까지 돈다(`autoSpinTimeoutOwner` 구분 유지).
- 멈춘 이유 알림: 당첨 패널 바로 위 가운데 토스트 3초. 문구: "손실 한도(5,000)에 닿아 오토스핀을 멈췄어요" / "큰 당첨이 나와 오토스핀을 멈췄어요" / "휴식 안내로 오토스핀을 멈췄어요"(§5.2). 횟수 소진·잔액 부족은 지금 동작 그대로.

### 5.2 (b) 세션 시간·세션 손익·60분 휴식 안내

- 새 스토어 `apps/hub/src/store/playSession.ts`(sessionStorage 백업, 접근 실패 시 메모리):
  - 세션 시작: 앱 부팅. 탭이 30분 이상 숨겨졌다 돌아오면 새 세션.
  - `visibleMs`: 화면이 보이는 동안만 센다(`visibilitychange`).
  - `spinNet`: 스핀마다 `totalWin + (jackpotWin ?? 0) − (isFreeSpin ? 0 : totalBet)`. 더블업은 «요청 직전 지갑 → 응답 지갑» 차이를 더한다. 데일리·4시간·구제·미션·레벨업·리더보드 보상은 **넣지 않는다**(게임 손익만).
  - 기록 자리: `store/game.ts`의 결과 공개(`reveal`)와 더블업 응답 처리.
- 설정 팝업(`components/SettingsModal.tsx`) 맨 위 «이번 세션» 칸: "플레이 시간 1시간 5분" · "게임 손익 −340"(부호 표기, 색은 중립. 빨강·초록으로 감정을 싣지 않는다). 1분 단위 갱신. 그 아래 기존 «언어»부터.
- 휴식 안내(새 `components/BreakReminder.tsx`, `App.tsx`에 마운트): `visibleMs`가 60분, 120분, …을 넘는 순간 중앙 작은 카드. "60분째 플레이 중이에요 · 이번 세션 게임 손익 −340 · 잠깐 쉬어 가도 좋아요" + [계속하기](주) [로비로]. 오토스핀이 돌고 있으면 멈춘다(§5.1 토스트). 판이 도는 중이면 그 판이 끝난 뒤(`phase === 'idle'`)에 띄운다.

### 5.3 (c) 보안관 두 배 도전(더블업)

- 서버 만료 규칙(`apps/api/src/economy/gamble.ts:20` `GAMBLE_TTL_MS` 10분)은 그대로 둔다. **화면에서만** 타이머를 없앤다.
- 당첨 패널 버튼 줄(`WinStrip.tsx` 더블업 패널, `audit-shots/sheriff-end.jpg`): 지금 «받기» 작은 회색 / «두 배 도전(50%)» 큰 금색 → **«받기» 주 버튼(금색, 폭 비율 1.4)** / «두 배 도전(50%)» 보조 버튼(외곽선). 순서는 받기가 왼쪽.
- `GameScreen.tsx:2013` `expiresInLabel` 전달 삭제, `WinStrip`의 카운트다운 칸 삭제. 패널 라벨 "두 배 도전 대기 중" → "받거나 두 배 도전을 할 수 있어요".
- `GambleModal.tsx`: 받기를 주 버튼·첫 순서로, 남은 시간 표기가 있으면 삭제. 로컬 시계로 만료를 알면 지금처럼 «두 배 도전»만 숨긴다(`hideDouble`, 문구 없음).

### 5.4 (d) 첫 실행 연령·가상 코인 안내

- 새 `components/AgeNotice.tsx`, `App.tsx`에서 세션 `ready` 직후 1회. 중앙 모달, 바깥 탭·Esc로 닫히지 않음(버튼으로만).
- 문구(ko): 제목 "시작하기 전에" / "이 앱의 코인은 게임 안에서만 쓰는 가상 코인이에요." / "현금 가치가 없고, 현금이나 상품으로 바꿀 수 없어요." / "성인 이용자를 위한 오락 앱이에요(한국 만 19세 이상)." / 버튼 "확인했어요". 영어 사전도 같이.
- 저장: `localStorage tgslot.notice.age.v1 = "1"`. 저장소 접근이 막히면 그 탭에서만 1회.
- 설정 팝업 «공정성 검증» 아래 한 줄 고정 문구: "가상 코인 전용 · 현금 가치 없음 · 성인용".

### 5.5 테스트·QA

| 파일 | 항목 |
|---|---|
| `apps/hub/src/store/gameAutoSpin.test.ts`(새) | 손실 한도: 시작 10,000·50%·베팅 20 → 손실 4,990에서 다음 판 막힘 / 제한 없음이면 계속 / 큰 당첨 멈춤(유료·프리스핀 판 둘 다) / 프리스핀 자동 진행은 안 끊김 / 멈춘 이유 값 |
| `apps/hub/src/store/playSession.test.ts`(새) | spinNet 식(유료·프리·잭팟·더블업), 보너스 제외, 30분 숨김 → 새 세션, 60분 알림 1회씩 |
| `GameScreen.responsible.test.tsx`(새 파일) | 시트가 고르고 [시작], 기본값 25회·50%·꺼짐, 더블업 패널에 카운트다운 없음, 받기가 주 버튼 |
| `GambleModal.test.tsx` | 받기 주 버튼·첫 순서, 타이머 없음 |
| `SettingsModal.test.tsx` | 세션 칸 표시 |
| `AgeNotice.test.tsx`(새) | 첫 실행 1회, 저장 뒤 안 뜸, 저장소 예외에도 렌더 |

| # | QA | 결과 |
|---|---|---|
| C5 | 오토스핀 시트 390·430 스크린샷: 횟수·한도·토글·시작 | |
| C6 | 손실 한도 25% + 무제한으로 돌려 한도 멈춤 토스트(체험판 잔액 10,000, 베팅을 높여 빠르게) | |
| C7 | 큰 당첨 멈춤 켬 + 디버그 bigWin → 그 판 뒤 멈춤 | |
| C8 | sheriff `gamble` 프리셋: 받기 주 버튼, 카운트다운 없음 | |
| C9 | 설정 팝업 세션 칸(몇 판 뒤 손익 숫자 맞음) | |
| C10 | 휴식 안내: 테스트 훅으로 visibleMs를 60분으로 당겨 1회 확인(실시간 60분 대기 금지) | |
| C11 | 새 브라우저 프로필 첫 실행 연령 안내 → 확인 → 새로고침에 다시 안 뜸 | |

---

## 6. 레인 분할

### 6.1 공통 규칙 (세 레인 모두)

- 작업 폴더·git 금지 규칙은 공통 브리핑 그대로. 리드가 커밋·병합한다.
- **공용 파일은 추가 위주, 정해진 자리에만 삽입한다.** 신작 3팀이 `GameScreen.tsx`·`i18n`·`schemas.ts`를 병렬로 고친다.
  - i18n(`apps/hub/src/i18n/en.ts`·`ko.ts`): 파일 끝에 붙이지 않는다. 레인 A는 `winTierCataclysm` 줄 바로 다음, 레인 B는 `levelUp` 줄 바로 다음, 레인 C는 `autoSpinInfinite` 줄 바로 다음에 자기 키 묶음을 넣는다.
  - `packages/shared/src/schemas.ts`: 레인 A는 `'lose',` 다음 줄(디버그 enum), 레인 B는 `LevelSchema` 객체 안과 `LeaderboardResponseSchema` 바로 아래. 파일 끝에 새 블록을 만들지 않는다.
  - `GameScreen.tsx`: 각 레인은 §1.5·§3.2·§5의 지정 hunk만. 테스트는 큰 `GameScreen.test.tsx`에 섞지 말고 레인별 새 테스트 파일.
- 브라우저 확인 포트(동시 실행 충돌 방지): 레인 A API 9011·허브 5411 / 레인 B 9012·5412 / 레인 C 9013·5413. 스크린샷·스크립트는 `D:/park/tgslot-wt/_qa/improve-<lane>/`. dev 서버·브라우저는 레인당 한 벌, PID로만 종료.
- 게임 수학·RTP 불변이므로 RTP 감사는 돌리지 않는다. 대신 `pnpm pack:check`가 그대로 통과해야 한다.
- 검증: `pnpm -r typecheck`, `pnpm -r --no-bail test`, `pnpm pack:check`, `pnpm --filter @tgslot/hub build:demo`.

### 6.2 파일 소유 표

| 파일 | A | B | C |
|---|---|---|---|
| `packages/renderer/src/winBands.ts`(새)·`presentation.ts`·`types.ts`·`index.ts`·`pixi/pixiRenderer.ts`(showWins·renderStep) | 소유 | - | - |
| `apps/hub/src/components/game/WinStrip.tsx/.css` | 소유(band) | 금지 | 더블업 패널만(A 병합 뒤) |
| `RoundPopup.tsx`·`winTiers.ts`·`board/BoardBonus.tsx`·`StageRoulette.tsx` | 소유 | - | - |
| `apps/hub/src/lib/audio.ts` | 소유(`playWin` 아래 추가) | 금지 | 금지 |
| `apps/api/src/games/debugSpin.ts`·`apps/hub/src/lib/debugPreset.ts` | 소유 | - | - |
| `apps/api/src/economy/level.ts`·`config.ts`(레벨·리더보드 구역)·`time.ts`·`routes/leaderboard.ts`·`repos/*` | - | 소유 | 금지 |
| `apps/hub/src/store/hub.ts`·`sdk/api.ts`·`components/hub/*`·`lib/countdown.ts`(추가만)·`lib/progressLine.ts`(새)·`components/game/MissionToast.tsx`(새)·`LevelUpCard.tsx`(새) | - | 소유 | - |
| `apps/hub/src/store/game.ts` | showWins 호출 hunk(`paid`)만 | 금지 | 소유 |
| `apps/hub/src/lib/defaultBet.ts`(새)·`store/playSession.ts`(새)·`GambleModal.*`·`SettingsModal.*`·`App.tsx`·`components/AgeNotice.tsx`(새)·`BreakReminder.tsx`(새) | - | - | 소유 |
| `games/*/manifest.json`·`math.json`·`packages/slot-engine`·`packages/game-sdk` | 금지 | 금지 | 금지 |

### 6.3 병합 순서와 겹침

1. A·B 동시. 둘이 함께 건드리는 파일은 `GameScreen.tsx`(서로 다른 hunk: A는 winTotal 처리 `:922-975`·라벨 `:1384`·`<WinStrip>`·`<RoundPopupView>` prop, B는 import·레벨업 배너 `:1935-1946` 교체·토스트 마운트·`:1432` lineLabel 폴백), i18n(다른 앵커), `schemas.ts`(다른 자리). 리드가 A → B 순으로 병합.
2. C는 병합된 상태에서 시작한다(WinStrip 더블업 패널·game.ts를 A 변경 위에서 고친다).

---

## 7. 범위 밖·후속

- astral 기본 베팅을 0.5% 밑으로: 베팅 나눗수 변경 = 수학 변경. RTP 재감사와 함께 별도 과제.
- royal 미스터리 공개(8.6초)를 금액에 따라 줄이기(감사 E): 릴 착지 단계라 이번 «당첨 연출» 범위 밖.
- 레벨업 전용 효과음: 이번에는 `playUiSound('up')` 재사용. 전용음은 `audio.ts` 소유 레인 정리 뒤.
- 감사 C1(보너스 진행 미터), C2(종료 팝업 재디자인 — 이번에는 ×N 한 줄만), A5·A7(로비 문구·코치마크)은 이번 5종에 없다.

---

## 8. 구현 결과 (2026-11-27, 통합·QA 팀장)

레인 A·B·C가 같은 폴더(`slot/review`)에서 구현을 마쳤고, 통합 상태에서 검증 명령과 기능별 확인표를 한 번씩 다시 돌렸다. 커밋은 아직 하지 않았다.

### 8.1 검증 명령

| 명령 | 결과 |
|---|---|
| `pnpm -r typecheck` | 전부 통과 |
| `pnpm -r --no-bail test` | 전부 통과. hub 1,023(통합 뒤 1건 추가), renderer 961, api 338, slot-engine 436, theme-gen 237, rtp-sim 313(+5 건너뜀), game-sdk 147, sim 32, shared 18, bot 15 |
| `pnpm pack:check` | 10팩 오류 0, 경고 0(수학·지급표 무변경이라 RTP 감사는 돌리지 않음) |
| `pnpm --filter @tgslot/hub build:demo` | 성공(청크 크기 경고만, 기존과 같음) |

### 8.2 개선별 결과

| # | 개선 | 결과 | 근거 |
|---|---|---|---|
| 1 | 당첨 연출 단계화 | 됨. 베팅 미만 «돌려받음»(흐림·굴림 없음·소리 없음), 1~2배 «당첨», 2~5배 «좋은 당첨 ×N», 5~10배 «멋진 당첨 ×N», 10배 이상은 기존 빅윈 그대로. 프리스핀 종료·말판·룰렛 요약에 «베팅의 ×N». 터보·오토·모션 줄이기는 짧은 값 | 레인 A 확인표 A1~A14, 통합 재확인(classic 4단계+빅윈, sheriff 프리스핀 종료 «베팅의 ×77.3») |
| 2 | 첫 레벨업을 첫 세션 안으로 | 됨. 레벨 2 = 800xp(베팅 20으로 40판), 새 곡선은 모든 레벨에서 옛 곡선 이하. 레벨업 카드(다음 보상·해금), 오토 중에는 한 줄 토스트 | 레인 B B1~B4, 통합: 베팅 100 오토 10회 중 8판째 «Lv.2 달성 · +300» 토스트, 오토 계속 |
| 3 | 미션 알림·진행 한 줄·리더보드 | 됨. 미션 탭 배지, 게임 화면 완료 토스트(받기), 꽝 판 뒤 진행 한 줄, 리더보드 남은 시간·내 순위 카드·보상 안내(가상 코인) | 레인 B B5~B10, 통합: 토스트 받기 +500 지갑 반영, 리더보드 갱신(아래 고친 것) |
| 4 | 기본 베팅 0.2~0.5% | 됨. 10,000 기준 classic·royal 20, astral 100(예외, §7). 사용자가 고른 베팅은 v2 저장으로 존중 | 레인 C C1~C4, 통합 스모크에서 10종 진입 베팅 확인 |
| 5 | 책임 설계 | 됨. 오토 «무제한» 유지 + 손실 한도 25/50(기본)/제한 없음 + 큰 당첨 때 멈춤 + 멈춘 이유 토스트, 설정 팝업 «이번 세션»(시간·게임 손익), 60분 휴식 안내, 더블업 받기 주 버튼·카운트다운 제거(서버 만료 규칙 유지), 첫 실행 연령 안내 1회 | 레인 C C5~C11, 통합: 손실 한도 2,945에서 멈춤, 큰 당첨 멈춤, 휴식 카드, 연령 안내 |

### 8.3 통합 QA (기능별 1회)

- 개발 스택(API 9014·허브 5414, 디버그 프리셋은 `/spin` 요청에 끼워 넣음), 390×844·430×932, 스크린샷은 `D:/park/tgslot-wt/_qa/review-qa1/`(저장소 밖)에서 직접 열어 판단했다.
- 10종 로비→진입→스핀: 390·430 각 1회, 체험판 미리보기 390 1회. 모두 `idle` 복귀, 콘솔 오류 0.
- 세션 «게임 손익»과 지갑 차이가 어긋나 보인 경우(−2,300 대 −2,000)는 레벨업 보너스(+300) 때문이었다. 명세대로 보너스는 게임 손익에서 뺀다. 지갑 차이와 손익 탐침으로 한 판씩 대조해 맞음을 확인했다.

### 8.4 통합 중 고친 것

- 리더보드 탭이 앱 시작 때 받은 값만 써서, 방금 돌린 판이 있어도 «아직 순위가 없어요»가 남았다(기존 동작이지만 내 순위 카드가 생기면서 눈에 띔). 탭을 열 때마다 새로 받게 바꿨다(`apps/hub/src/components/hub/LeaderboardScreen.tsx`, 테스트 `LeaderboardScreen.test.tsx`에 1건). 체험판에서 «아직 순위가 없어요» → 3판 뒤 «#1 · 당첨 합계 36»을 확인했다.

### 8.5 남은 것·후속

- 기본 베팅은 잔액 10,000 경계에서 갈린다. 예: fruit은 10,000이면 20, 10,004면 40이다(0.2% 하한이 20.008이 되어 20이 빠짐). 규칙 범위(0.2~0.5%) 안이라 그대로 두었다.
- 레벨업 보너스 비중: 레벨 5까지 보너스 합 1,500이 누적 베팅 8,445의 약 18%다(옛 곡선은 같은 구간 약 11%). 높은 레벨로 가면 옛 곡선보다 적다. 허브 경제(RTP 모델 밖) 검토 후보로 남긴다.
- 레인 A: kraken 코인 리스핀의 최종 단계 라벨은 단위 테스트로만 확인했다. 소리 small·good 길이가 같은 게임(western·shrine·clockwork·royal·deepsea·hanbok)의 구별은 사용자 귀 판정 몫이다.
- 레인 B: 리더보드 보상 중복 수령 막기는 메모리 저장소 API 테스트로만 확인했다(실DB 통합 테스트 미추가).
- 레인 C: 디버그 버튼(🐞)이 더블업 패널 오른쪽과 겹친다(`?debug=1`에서만).
- 쓰지 않게 된 옛 레벨업 배너 CSS·i18n `levelUp` 키는 공용 파일이라 남겨 두었다.

### 8.6 2차 통합 QA — 플레이 검수 반영 (2026-11-27)

플레이 검수(`_qa/review-player1/`)와 코드 리뷰에서 나온 필수 1건과, 싸고 확실한 권고를 고쳤다. 커밋은 하지 않았다.

**필수: 보안관 더블업이 손실 판을 당첨처럼 꾸밈.** sheriff는 금액과 상관없이 당첨이면 더블업 패널로 넘어가서, 베팅 40에 20인 손실 판이 금색 금액과 «받거나 두 배 도전을 할 수 있어요»로 보였다(개선 1·5c 위반). 화면만 고치지 않고 서버 규칙을 바꿨다. 베팅 미만 당첨에는 더블업을 제안하지 않는다(`apps/api/src/economy/gamble.ts` `isGambleEligible`에 `totalWin ≥ totalBet`, 메모리·drizzle 저장소가 같이 씀, 디버그 `gamble` 프리셋도 같은 조건). 더블업은 공정 50%×2배라 RTP는 변하지 않는다. 체험판도 같은 API 코드를 쓰므로 같이 바뀐다. `docs/GAME_CATALOG.md`의 sheriff 갬블 조건도 고쳤다.

**함께 고친 것**

| 항목 | 고친 내용 | 파일 |
|---|---|---|
| 오토 손실 한도 | 지갑 차이(`startCoins − coins`) 대신 오토를 켠 뒤의 게임 손익(`autoSpin.net`, 당첨+잭팟−베팅, 더블업 증감 포함)으로 판정. 레벨업 보너스가 손실을 깎거나, 더블업 대기금이 손실을 부풀리던 문제가 없어졌다 | `lib/autoSpinRules.ts`, `store/game.ts` |
| 레벨업 카드 × 프리스핀 | 받은 levelUp을 카드가 따로 들고 있다가, 프리스핀 라운드·종료 팝업이 다 끝난 뒤에 띄운다(`blocked`에 `freeSpins !== null` 추가) | `LevelUpCard.tsx`, `GameScreen.tsx` |
| 휴식 안내 × 프리스핀 | 프리스핀 사이의 짧은 idle에는 띄우지 않는다 | `BreakReminder.tsx` |
| 리더보드 보상 조건 | 지난 주 당첨 합계가 0이면 순위가 있어도 보상 대상이 아니다(초기에 꽝 한 판만 돌려도 받는 구멍) | `apps/api/src/routes/leaderboard.ts` |
| 로그인 응답 레벨 | 저장 값 대신 `toLevelState(xp).level`(`/me`와 같은 계산 값) | `apps/api/src/routes/auth.ts` |
| 미션 받기 지갑 경합 | 응답 지갑을 버린 경우 그 판이 끝나 idle이 되면 `/me`로 한 번 맞춘다 | `MissionToast.tsx` |
| 꽝 «0» | 금액이 0이면 라벨·금액을 흐리게(`hub-win-strip--zero`) | `WinStrip.tsx`·`.css` |
| 베팅 미만 라벨 | «돌려받음» → «베팅보다 적음»(영어 «Less than bet»). 돌려받은 것처럼 읽히지 않게 | `i18n/ko.ts`·`en.ts` |
| 병합 대비 | 렌더러 `winTotal.band`를 선택 필드로(허브는 없으면 단계 없는 평소 당첨) | `packages/renderer/src/types.ts` |
| 기본 베팅 테스트 | 10종 고정 목록 외에 `games/*`를 훑어 새 게임도 0.5% 이하(또는 최소 단계) 검사 | `lib/defaultBet.test.ts` |
| 더블업 틱 | 카운트다운 표시가 없어졌으니 1초마다 화면을 다시 그리지 않고 만료 시각에 한 번만 | `GameScreen.tsx` |
| 잔재 | 안 쓰는 i18n 키 `levelUp`·`gambleExpiresIn`·`leaderboardWeekOf`·`leaderboardEndsIn`, 옛 레벨업 배너 CSS 삭제 | `i18n/*`, `GameScreen.css` |

테스트 추가: 더블업 자격(베팅 미만 거절) 1, 리더보드 당첨 0 보상 없음 1, 손실 한도 게임 손익 1, 레벨업 카드 프리스핀 뒤 1, 휴식 안내 프리스핀 1, 미션 지갑 /me 보정 1, 기본 베팅 games/* 스캔 11.

**검증**: `pnpm -r typecheck` 통과 · `pnpm -r --no-bail test` 통과(hub 1,038, renderer 961, api 340, slot-engine 436, theme-gen 237, rtp-sim 313+5 건너뜀, game-sdk 147, sim 32, shared 18, bot 15) · `pnpm pack:check` 10팩 오류 0·경고 0 · `build:demo` 성공(청크 크기 경고만 기존과 같음). 수학·지급표는 바꾸지 않았다.

**확인표 재실행(기능별 1회, 스크린샷 `D:/park/tgslot-wt/_qa/review-qa2/`)**

| 확인 | 390 | 430 | 결과 |
|---|---|---|---|
| 당첨 단계 라벨(베팅보다 적음·당첨·좋은 당첨·멋진 당첨·빅윈) | ✓ | ✓ | 라벨 정상 |
| sheriff 베팅 미만 3회 | ✓ | ✓ | 더블업 패널 0회, 흐린 «베팅보다 적음». 베팅 이상(48/40)에서만 더블업 |
| 꽝 판 | ✓ | ✓ | «당첨 0» 흐림 |
| 레벨업(오토 중 토스트, 오토 계속) | ✓ | | «Lv.2 달성 · +300», 오토 계속 |
| 레벨업 판이 프리스핀을 염 | ✓ | | 진입 팝업→프리스핀 16회→종료 팝업 뒤 카드 3초(«Lv.1 → Lv.2 +300 · 다음 레벨 보상 +300 · Lv.5에 최대 베팅 200») |
| 미션 토스트 받기 | ✓ | | 지갑 +500 |
| 리더보드 | ✓ | | 남은 시간·내 순위·보상표·가상 코인 안내 |
| 오토 손실 한도 25% | ✓ | ✓ | 390: 한도 2,825에 닿아 멈춤. 지갑 차이는 2,499(레벨업 보너스 +300 포함)였다. 예전 판정이면 3판을 더 돌았을 경우다 |
| 큰 당첨 멈춤·세션 칸·휴식 안내 | ✓ | ✓ | 정상 |
| 연령 안내 1회 | ✓ | | 새로고침 뒤 다시 안 뜸 |
| 더블업 받기 주 버튼·카운트다운 없음 | ✓ | ✓ | 정상 |
| 프리스핀 종료 «베팅의 ×N» | ✓ | | 정상 |
| 10종 로비→진입→스핀 | ✓ | ✓ | 전부 idle, 콘솔 오류 0 |
| 체험판 미리보기 | ✓(10종) | ✓(sheriff 30판) | 10종 idle·오류 0. sheriff 베팅 미만 8회 더블업 0, 더블업 5회 전부 베팅 이상 |

**남은 것(이번에 안 고침)**

- 미션 «3회 당첨되기»가 베팅 미만 당첨도 당첨으로 센다(체험판에서 확인). 손실을 당첨처럼 세는 셈이라 미션 정의(`totalWin ≥ totalBet`)를 검토할 후보다.
- 레벨업 보너스 경제(보너스 누계 ÷ 누적 베팅이 L2 37.5%, L5 17.8%, 레벨이 오를수록 다시 커짐)는 허브 경제 결정이라 `config.ts` 값을 따로 검토해야 한다.
- 리더보드 순위 기준(이번 주 당첨 합계 = 베팅량에 비례)은 최고 배수 같은 기준을 같이 검토할 후보로 남긴다.
- 기본 베팅이 잔액 경계에서 두 배로 갈린다(예: fruit 10,000→20, 10,004→40). 완충 규칙은 설계 결정이라 남긴다.
- 레벨업 카드·미션 토스트가 릴 윗줄을 가린다. 레벨업 보너스가 굴러 올라가는 첫 프레임에 작은 값이 보인다.
- drizzle 경로의 리더보드 보상 이중·동시 수령 통합 테스트(실DB)는 아직 없다.
- 디버그 버튼(🐞)이 더블업 패널과 겹친다(`?debug=1`에서만).
- 병합 메모: new-a의 RoundPopup forge 블록(`forgeExitBetMultiple`)과 «베팅의 ×N» 줄이 겹치므로 병합 때 하나로 줄여야 한다. new-c는 `store/game.ts`의 `buildSpinToOptions` 근처에서 충돌이 예상된다.

### 8.7 3차 통합 QA — 리뷰 반영 (2026-11-27)

3차 리뷰의 필수 1건을 고쳤다. 권고는 싸고 확실한 것만 골라 고쳤다. 고친 뒤 게이트 4개와 확인표를 다시 돌렸다. 커밋은 하지 않았다.

**필수: 연쇄 게임의 베팅 미만 당첨이 엉뚱한 칸에 테두리를 그림.** 문제는 두 코드가 맞물려 생겼다. `buildCascadePresentation`은 band가 `under`이면 `quiet`를 붙인다. 그런데 `renderStep`은 `quiet` 분기를 연쇄 분기보다 먼저 검사해서, 이미 터지고 새 심볼로 채워진 칸에 테두리를 그렸다. 그 결과 candy-cluster-pop(베팅 20)에서 작은 클러스터로 당첨되면, 이기지 않은 칸이 이긴 것처럼 보였다. 이제는 `quiet` 분기도 `step.cascade === true`이면 테두리를 그리지 않고 딤만 걷는다(`packages/renderer/src/pixi/pixiRenderer.ts`). 줄·웨이즈 게임의 베팅 미만 당첨은 전과 같이 흐린 테두리(알파 0.5)를 그린다. 테스트(`purity.test.ts`, 기존 소스 검사 방식)도 4개 더했다.
- quiet 분기가 연쇄 분기보다 먼저 온다.
- 연쇄 판에서는 테두리 호출이 `cascade !== true` 안에만 있다.
- quiet 분기에는 딤·심볼 연출·코인이 없다.
- 멋진 당첨은 코인 8개를 큰 당첨 등급이 아닐 때만 낸다.

**함께 고친 것**

| 항목 | 고친 내용 | 파일 |
|---|---|---|
| 미션 «3회 당첨되기» | 베팅 이상 당첨(`win ≥ totalBet`)만 센다. 프리스핀은 그 라운드를 연 베팅과 비교한다. 더블업 제안과 같은 기준이다. 베팅 미만 당첨이 «미션 완료» 토스트까지 띄우던 문제가 없어졌다 | `apps/api/src/economy/missions.ts`·`config.ts`, `repos/memory.ts`·`drizzle.ts` |
| 꽝 판 라벨 | 이번 판에 당첨이 없으면(대기·스핀 중 포함) «당첨» 글자를 띄우지 않는다. 줄 높이는 그대로 두고, 흐린 0과 진행 한 줄만 남는다 | `GameScreen.tsx` |
| 단계 라벨 색 | «좋은 당첨»은 금색, «멋진 당첨»은 밝은 금색으로 1px 크게 해서, «베팅보다 적음»(흐린 회색)과 라벨만 봐도 구분된다 | `WinStrip.css` |
| 오토 시트 문구 | «시작 잔액 X 기준 Y까지» → «Y코인을 잃으면 멈춰요»(영어 «Stops after losing Y coins») | `i18n/*`, `GameScreen.tsx` |
| 오토 시작 불가 | 첫 판부터 한도를 넘으면 «베팅이 손실 한도(Y)보다 커서 오토스핀을 시작할 수 없어요»로 알린다. 새 사유 `lossLimitStart`를 쓴다(예전에는 «멈췄어요»였다) | `lib/autoSpinRules.ts`, `store/game.ts`, `i18n/*` |
| 진행 한 줄 | 다른 게임 전용 미션(예: kraken에서 «클래식 777에서 20회 0/20»)은 고르지 않는다. 지금 게임 전용 미션을 먼저 고르고, 없으면 공용 미션(`spin_*`·`win_*`)을 고른다. 둘 다 없으면 «Lv.N까지» 줄을 보인다 | `lib/progressLine.ts` |
| 레벨업 카드 보상 | 굴러 올라가는 값을 없애고 처음부터 최종 값을 보인다. 첫 프레임의 «+40»이 다음 판 베팅처럼 읽히던 문제를 고쳤다. 카드 팝 모션은 그대로다 | `LevelUpCard.tsx` |
| 레벨업 판 지갑 | `refreshLevelInfo()`가 `/me` 지갑으로 세션 지갑을 덮지 않는다(`user`·`levelInfo`만 반영). 스핀 응답 지갑에 레벨업 보너스가 이미 들어 있다. 이 수정으로 두 문제가 없어졌다. 하나는 오토·터보에서 늦게 온 `/me`가 잔액을 되돌리던 것이고, 다른 하나는 말판에서 숨겨 둔 당첨이 상단 잔액에 미리 드러나던 것이다 | `store/hub.ts` |
| 미션 받기 /me 보정 구독 | idle을 기다리는 구독은 다음 셋 중 하나로 끝난다. 게임을 나가면(로딩·오류·다른 게임) 그때 한 번 맞추고 푼다. 60초가 지나면 맞추지 않고 푼다. 새 받기가 오면 이전 구독을 정리한다 | `MissionToast.tsx` |
| 표시 | `GameScreen.tsx` JSX 주석 0열 들여쓰기 | `GameScreen.tsx` |

테스트를 더했다. renderer에 4개, api에 1개(미션 베팅 미만·같음·프리스핀), hub에 MissionToast 2개와 진행 한 줄 2개를 넣었다. 문구가 바뀐 기존 테스트 5개(꽝 라벨, 오토 시트 문구, 시작 불가 사유, 레벨업 보상, 진행 한 줄 미션 id)는 새 동작에 맞췄다.

**문서로 남기는 판단**

- **큰 당첨 홀드 시간(kraken 리스핀):** `buildPresentation`의 10배 이상 경로는 홀드와 step `tier`를 `allTier`로 계산한다. `allTier`는 라인과 리스핀을 합친 총액의 등급이다. 단계(band)도 같은 총액으로 매기고, 허브 빅윈 오버레이도 `result.totalWin`(리스핀 포함) 기준이다. 그래서 세 값을 맞춘 의도한 변경으로 둔다. 리스핀이 없는 판에서는 `allTier === tier`라 이전과 같다.
- **첫 레벨업 시점:** 문턱은 800 xp다. 기본 베팅 20인 게임이면 유료 판 40판째에 첫 레벨업이 온다. 프리스핀 판은 xp에 들어가지 않아서, 전체 판 수로 세면 50~60판이 된다. 명세의 «약 50판»은 «유료 판 기준 약 40판»으로 읽는다. 문턱을 더 낮추면 레벨업 보너스 비율(이미 L2 37.5%)이 커지므로 손대지 않았다.
- **오토 중 설정 팝업:** 오토가 도는 동안 «자동» 버튼은 꺼져 있고, 스핀 버튼이 «중지 (N)»이다. 설정 팝업을 열어도 오토는 계속 돈다. 이 동작은 그대로 두었다.

**검증**
- `pnpm -r typecheck`: 통과.
- `pnpm -r --no-bail test`: 통과. hub 1,042, renderer 965, api 341, slot-engine 436, theme-gen 237, rtp-sim 313+5 건너뜀, game-sdk 147, sim 32, shared 18, bot 15.
  - 전체를 한꺼번에 돌렸을 때 slot-engine 무작위 2만 공연 테스트 1건과 rtp-sim kraken 리스핀 감사 테스트 1건이 부하로 시간 초과됐다. 두 패키지 모두 이번에 손대지 않았고, 패키지 단독으로 다시 돌리면 전부 통과한다.
- `pnpm pack:check`: 10팩 오류 0·경고 0.
- `build:demo`: 성공. 청크 크기 경고는 기존과 같다.
- 수학·지급표는 바꾸지 않았다.

**확인표(기능별 1회, 스크린샷 `D:/park/tgslot-wt/_qa/review-qa3/`)**

| 확인 | 결과 |
|---|---|
| candy 베팅 미만 연쇄 당첨 2회(390) | 판 위 테두리 0, 흐린 «베팅보다 적음 16 / 합계 16»(`F-390-cascade-under-0.png`) |
| 당첨 단계 라벨(430) | «베팅보다 적음», «당첨», 금색 «좋은 당첨 ×2.8», 밝은 금색 «멋진 당첨 ×5.2»(`F-430-band-winGreat.png`) |
| 꽝 판(430 sheriff) | 라벨 없음, 흐린 0, 진행 한 줄(`F-430-lose-zero.png`) |
| 오토 시트(430) | «5,371코인을 잃으면 멈춰요», 손실 한도 25% 멈춤 토스트, 큰 당첨 멈춤, 세션 칸, 60분 휴식 안내 |
| 미션 규칙(390 fruit) | 베팅 미만 당첨 3회: 미션 토스트 0. 베팅 이상 당첨에서만 «3회 당첨되기» 완료 |
| 진행 한 줄 | 개발 스택에서 미션을 다 받은 뒤: kraken·classic «Lv.6까지 3,531». 체험판: classic «클래식 777에서 20회 스핀 1/20», kraken 등 다른 게임은 «50회 스핀하기» |
| 레벨업 | 오토 중 «Lv.4 달성 · +400» 한 줄, 오토 계속. 수동 판에서는 카드 «Lv.4 → Lv.5 🪙 +500» 첫 프레임부터 최종 값(`F-390-levelup-card.png`) |
| sheriff 더블업(390·430) | 베팅 미만 3회 패널 0, 베팅 이상(51/20)만 «받기 / 두 배 도전», 카운트다운 0 |
| 프리스핀 종료·연령 안내(390) | «베팅의 ×2.0», 연령 안내 1회 |
| 10종 로비→진입→스핀 | 개발 스택 390 10종 idle·콘솔 오류 0. 체험판 미리보기 390 10종 idle·오류 0. 체험판 sheriff 30판에서 베팅 미만 4회 더블업 0, 더블업 4회 전부 베팅 이상 |

**남은 것**
- 레벨업 보너스 경제와 리더보드 순위 기준은 경제 결정으로 남긴다.
- 기본 베팅 경계 완충과 잔액 대비 저장 베팅 상한(책임 설계 후보)도 남긴다.
- 레벨업 카드가 3초 동안 릴 윗줄을 반투명하게 가린다. 탭하거나 스핀하면 바로 닫힌다.
- 세션 시간은 탭 단위로 잰다.
- drizzle 리더보드 보상의 실DB 통합 테스트는 아직 없다.
- 디버그 버튼이 겹치는 문제는 `?debug=1`에서만 생긴다.
- 공용 미션 접두사(`spin`·`win`)는 허브 `progressLine.ts`에 따로 적혀 있다. API `MISSION_DEFS`에 공용 미션을 더하면 이 접두사도 같이 더해야 한다.
- 병합 메모는 8.6과 같다. 이번에 `AutoSpinStopReason`에 `lossLimitStart`를 더했다. 병합한 뒤 `pnpm -r typecheck`로 지운 i18n 키의 참조가 남지 않았는지 확인한다.
