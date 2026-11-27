# greenhouse-garden 구현 계획 — 자라는 온실 정원 (가제)

작성일 2026-11-27 · 대상: `tg-slot-hub` 신작 3종 중 하나(5×3 아닌 새 형태)
근거 문서: `docs/research/PRAGMATIC_FORMATS.md`(추천 형태 2 «자라는 격자 4x4에서 8x8»), `docs/research/IMMERSION_HOOK_AUDIT.md`, `docs/research/SLOT_MARKET_TRENDS.md`, `docs/GAME_CATALOG.md` §4(종료 규칙), `docs/WAVE2_DESIGN.md` §3-4·§3-6·§4-4, `docs/FEATURE_RESEARCH.md` 2.3·2.10·2.21, 구성 모범 `docs/PLAN_candy-cluster-pop.md`.

**한 줄.** 4×4 화단에서 같은 꽃 5송이 이상이 상하좌우로 이어지면 터지고 위에서 새 꽃이 떨어진다. 한 스핀에 터진 칸이 10·22·36·52개에 닿을 때마다 판 바깥에 화분이 한 겹씩 붙어 5×5 → 6×6 → 7×7 → 8×8까지 자라고, 덮여 있던 화분이 열리며 꽃과 **씨앗 화분**(×2·×3)이 드러난다. 씨앗은 판이 한 번 더 자랄 때마다 한 단계씩 커진다(×2 → ×3 → ×5 → ×10 → ×20). 물뿌리개 3개면 **정원 프리스핀** — 판 크기와 씨앗이 스핀 사이에 그대로 남는다.

---

## A. 이 게임의 재미 장치 결정

### A-1. 후보 3개 (모두 «자라는 판» 위에 얹는 규칙)

| 후보 | 플레이 경험 | 재미·새로움 | 430px 판독 | 엔진 비용(높을수록 쌈) | 튜닝 용이 | 합계 |
|---|---|---:|---:|---:|---:|---:|
| **1 자라는 씨앗** — 새 화분에서 나온 씨앗이 판이 자랄 때마다 한 단계 커진다. 씨앗이 든 칸이 당첨 클러스터에 끼면 그 클러스터에 씨앗 값만큼 곱한다 | «씨앗이 터지기 전에 판이 한 번 더 자라라»는 두 겹의 기대. 성장이 진행도이면서 배율의 원천이 된다 | 5 | 4 | 4 | 4 | **17** |
| 2 연쇄 사다리 + 성장 | candy와 같은 연쇄 배수 사다리에 판 성장만 얹는다 | 2 (candy와 겹침) | 5 | 5 | 4 | 16 |
| 3 화분 선택 | 판이 자랄 때 새 화분 3개 중 하나를 고르게 한다 | 4 | 3 | 2 (화면 입력 왕복, 서버 권위 다단계) | 2 | 11 |

### A-2. 선택: 후보 1 «자라는 씨앗»

1. **판이 자라는 것 자체에 돈의 의미를 붙인다.** 성장이 «칸이 늘어 클러스터가 쉬워진다»로만 끝나면 체감이 약하다. 씨앗이 성장에 반응해 커지니 성장 순간마다 화면 위 숫자가 실제로 오른다.
2. **candy(연쇄 사다리)·volcano-forge·aurora-ice-palace와 겹치지 않는다.** 배율이 **격자 밖 레일이나 사다리가 아니라 칸(화분) 안**에 있다. `PRAGMATIC_FORMATS.md`의 형태 1(격자 밖 배율 레일)과 형태 3(다이아몬드 격자)은 다른 두 팀 몫으로 보고 피했다.
3. **입력이 결과를 바꾸지 않는다.** 후보 3의 «고르기»는 서버 권위 다단계 왕복이 필요하고 체감상 결과를 바꾸는 것처럼 보인다. 후보 1은 스핀 응답 하나에서 끝난다.
4. **튜닝 손잡이가 분리된다.** 씨앗 등장 확률(씨앗 표)과 등급 값(`seedTiers`)은 클러스터 배당표와 따로 움직인다. 기본 게임 몫과 씨앗 몫을 따로 맞출 수 있다.

### A-3. 손에 땀을 쥐는 순간 (왜 재밌나)

| 순간 | 플레이어가 기대하는 것 | 화면이 보여 주는 것 |
|---|---|---|
| 착지 | 4×4 큰 칸(430px에서 100px)에 5송이가 붙었나 | 꽃 한 번 빛남 → 짧은 정적 → 팝 (사용자 규칙 «히트 → 딜레이 → 팝») |
| 연쇄 | **성장 막대**가 «다음 크기까지 3칸»에서 넘어가나 | 판 위 DOM 막대가 터진 칸만큼 차오르고, 문턱 2칸 안이면 줄기 끝 봉오리가 부푼다(실제 진행도만 표시) |
| 성장 | 덮인 화분 속에 무엇이 있나 — 물뿌리개? 씨앗? | 카메라가 한 겹 물러나며 흙 덮인 화분 9~15개가 차례로 열린다 |
| 씨앗 대기 | 씨앗이 쓰이기 전에 판이 한 번 더 자라나 | 성장마다 남은 씨앗이 새싹 → 봉오리 → 꽃으로 커지고 숫자 배지가 올라간다 |
| 씨앗 개화 | 씨앗 칸이 낀 클러스터가 몇 배가 되나 | 씨앗이 꽃으로 피며 배율이 그 클러스터 금액에 곱해져 WinStrip에 `씨앗 ×5`로 찍힌다 |
| 물뿌리개 2개 | 성장으로 열리는 화분에서 세 번째가 나오나 | **활성 판에 물뿌리개가 이미 2개 이상 보이는 상태에서 성장 공개가 시작되면** 공개가 조금 길어진다. 조건은 지금 보이는 판 상태뿐이고 세 번째가 나오는지와 무관하다(나올 때만 길어지면 길이가 결과를 미리 알려 준다). 꾸며낸 니어미스 없음(AUDIT B5) |
| 정원 프리스핀 | 판이 줄지 않고 계속 자란다. 씨앗이 쌓이고 커진다 | 8×8에 닿은 뒤에도 **햇살**(터진 칸 40개마다, 한 스핀 최대 1회)이 씨앗을 키우고 새 씨앗 2개를 심는다 |

### A-4. 몰입·후킹 점검 지적 사항을 처음부터 반영

| 점검 지적 (`IMMERSION_HOOK_AUDIT.md`) | 이 게임의 설계 |
|---|---|
| 2.5 보너스까지 거리가 길고 그 사이가 비어 있다 | 성장 막대가 **매 스핀** 작은 목표를 준다(성장은 기본 게임 9%). 보너스 진입 1/185, 기본 베팅 20·잔액 10,000에서 500판 안에 못 볼 확률 약 7% |
| 2.1-3 대표 피처 안내가 도움말 안에만 있다 | 판 위 목표 띠에 «물뿌리개 3개 → 정원 프리스핀»을 늘 보인다(kraken 보물 띠 사례, A7) |
| 2.2 베팅 미만 당첨도 5초 축하 (LDW) | 베팅 미만은 팝만 보이고 축하음·빛 없음, 0.6초 숫자만(A3 규칙을 이 팩은 처음부터 따름) |
| 2.4 보너스 결과 팝업이 초라하다 | 결과 팝업에 «베팅의 ×N», 최대 정원 크기, 가장 큰 씨앗, 최고 한 판, 최저 보장 적용 여부를 싣고 테마 스킨을 입힌다 |
| 시장 추세 «슈퍼 스캐터 최저 보장» (`PRAGMATIC_FORMATS.md` 2025~2026 흐름) | 정원 프리스핀 **최저 보장 총 베팅 ×10**. 라운드 합이 그보다 적으면 마지막 스핀에서 채운다 |
| 1.2 기본 베팅 과다로 피처를 못 봄 | manifest 기본 베팅 = 최소 단계 20(A4 방향) |

---

## 0. 지금 코드와 대조한 결과 (설계 전제)

| # | 확인한 것 | 이 계획의 결정 |
|---|---|---|
| O1 | `cluster.ts`의 `evaluateClusters`는 `math.reels/rows`로 이웃표를 만들고 크기별로 캐시한다(`getNeighbors`, 키 `${reels}x${rows}`) | **수정하지 않는다.** 활성 영역을 n×n 부분 격자로 잘라 `{ ...math, reels: n, rows: n }`로 호출하고 좌표를 되돌린다. 4~8 크기 이웃표 5벌이 캐시된다 |
| O2 | `cascade.ts`의 `applyCascadeStep`은 **열 전체**에 중력을 건다. 덮인 화분이 같은 열에 있으면 틀린다 | 정원 전용 `applyGardenStep`(활성 범위 안에서만 중력)을 새 파일에 둔다. 기존 함수는 그대로 |
| O3 | `spin.ts resolveSpin`은 `stageRoulette → cascade → coinRespin` 순으로 팩별 분기한다 | 맨 앞에 `if (math.growBoard) return resolveGardenSpin(...)` 한 줄. 다른 팩은 한 글자도 안 바뀐다 |
| O4 | kraken은 리스핀 전 과정을 `coinRespin` **피처 안에** 싣고 `rounds.features`로 저장·재전송한다 | 정원 결과도 `garden` 피처 하나에 싣는다. **DB 마이그레이션 없음** |
| O5 | candy는 `RoundCarry.orders`를 `FreeSpinsState.carry`로 이어 간다(`game_states.state` jsonb) | `RoundCarry.garden?` 필드 하나를 더한다. 저장 경로는 candy와 같다 |
| O6 | `scatter.freeSpins`는 스캐터 수와 무관한 고정 `count`만 받는다 | 정원 프리스핀은 `growBoard.bonus`에 둔다(3/4/5개 → 8/10/12스핀). `scatter.freeSpins`와 함께 둘 수 없다(`orderRound`와 같은 규칙) |
| O7 | 렌더러 레이아웃은 `math.reels × rows`로 셀 크기를 정한다(`layout.ts`, `gapRatio?` 지원) | 물리 판은 8×8로 두고 **카메라(컨테이너 배율)** 로 활성 n×n을 창에 꽉 채운다. `gapRatio 0.04`(WAVE2 §4-4 6릴 대응과 같은 값) |
| O8 | 효과음·배경음은 게임별 파일로 갈라져 있다(`audioDeepsea.ts`, `audioHanbok.ts`, `bgmDeepsea.ts`) | `audioGarden.ts`, `bgmGarden.ts` 새 파일. `audio.ts`·`bgm.ts`는 프리셋 등록 몇 줄만 |
| O9 | 감사 도구는 피처별 통계 파일로 갈라져 있다(`audit/coinRespinStats.ts`, `boardStats.ts`, `rouletteStats.ts`) | `audit/gardenStats.ts` 새 파일 |
| O10 | 체험판은 `apps/hub/src/demo/server.ts`가 API `createApp`과 팩 raw 파일을 그대로 묶는다 | 엔진·라우트가 동작하면 체험판도 동작한다. 팩 glob 포함 여부만 확인 항목으로 둔다 |
| O11 | 디버그 프리셋은 시드 탐색 최대 20,000회, 기본 5,000회 | 검수 거친 시뮬(§14-1)에서 기본 게임 8×8 도달은 약 1/1,000이다. `gardenGrow8`·`gardenSun`은 탐색 상한 20,000회로 둔다(못 찾을 확률 e^-20). 나머지 정원 프리셋은 기본 5,000회 |
| O12 | candy 실측 σ̂ 2.90(예상 8의 3분의 1), 10M 스핀 4샤드 33.7초 | 이 팩 σ 예상은 보너스 몫이 커서 7~9로 잡는다(§5-4) |

---

## 1. 게임 요약

| 항목 | 값 |
|---|---|
| 형태 | **자라는 판.** 물리 8×8, 활성 영역 4×4에서 시작해 한 스핀 안에서 5×5 → 6×6 → 7×7 → 8×8 |
| 페이 방식 | 직교 인접 클러스터 5송이 이상(와일드 포함), 배당 기준 = 총 베팅액 × 배당표 × 씨앗 배율 |
| 연쇄 | 터진 칸 제거 → 활성 범위 안 중력 → 위에서 리필(스트립 끌어오기, RNG 0회). 연쇄 배수 사다리는 **없다**(candy와 구분, 배율은 씨앗만) |
| 성장 문턱 | 한 스핀 누적 터진 칸 10 / 22 / 36 / 52 → 5×5 / 6×6 / 7×7 / 8×8. 한 단계에 한 겹씩 |
| 덮인 화분 | 활성 영역 밖 칸. 착지할 때 이미 내용(스트립 창)이 정해져 있고, 열릴 때 꽃·나비(와일드)·물뿌리개(스캐터)가 드러난다. 새로 열린 칸마다 씨앗 추첨 1회 |
| 씨앗 화분 | 등급 ×2 / ×3 / ×5 / ×10 / ×20. 판이 자랄 때 남은 씨앗 전부 +1등급. 클러스터 배율 = 그 클러스터 칸의 씨앗 합(상한 ×100). 쓰인 씨앗은 사라진다 |
| 와일드 | 나비. 여러 클러스터에 낀다. 나비만으로 된 그룹은 미지급 |
| 스캐터 | 물뿌리개. 터지지 않고 클러스터를 막는다. 스핀이 끝난 활성 판에서 3개 이상이면 정원 프리스핀 + 소액 지급 |
| 정원 프리스핀 | 3/4/5개 이상 → 8/10/12스핀. 시작 크기 = 진입 스핀의 마지막 크기(최소 5×5). 판 크기·성장 막대·씨앗이 스핀 사이에 남는다. 8×8에서 터진 칸 40개마다 **햇살**(씨앗 +1등급, 새 씨앗 2개, 한 스핀 최대 1회). 리트리거 3개 이상 +4스핀, 최대 2회(최장 20스핀). 최저 보장 ×10. 프리스핀 전용 스트립·문턱은 선택 필드(`bonus.strips`·`bonus.thresholds`) |
| 리셋 | 유료 스핀은 매번 4×4·씨앗 없음·막대 0에서 시작(유료 스핀 사이 이월 금지) |
| 상한 | 연쇄 16단계, 성장 4회, 라운드(진입 스핀 + 프리스핀) 지급 총 베팅 5,000×(`round.maxWinCap`) |
| 목표 RTP | 94.5% = 기본 클러스터 58.0 + 기본 씨앗 추가분 5.5 + 물뿌리개 지급 1.0 + 정원 프리스핀 30.0. 잭팟 1.5% 더해 체감 96.0% |
| 변동성 | high. 적중률 약 30%, 보너스 1/185·평균 약 55×, σ 예상 7~9 |
| 베팅 레벨 | 20 / 40 / 100 / 200 / 500 / 1000 (배당 눈금 0.05, 기본 20) |
| 셀 크기 | 430px: 4×4 100 · 5×5 80 · 6×6 67 · 7×7 57 · 8×8 **50**px / 390px: 91 · 73 · 60 · 52 · **45**px |

---

## 2. 그리드·페이 방식·심볼표·배당표

### 2-1. 성장 순서 (물리 8×8 좌표, `[reel, row]`, 0부터)

판이 한쪽으로 쏠리지 않게 ㄱ자 겹을 오른쪽 위와 왼쪽 아래에 번갈아 붙인다.

| 단계 | 크기 | 활성 열 | 활성 행 | 붙는 칸 | 새 칸 수 | 누적 문턱 |
|---:|---|---|---|---|---:|---:|
| 0 | 4×4 | 2–5 | 2–5 | — | (16) | — |
| 1 | 5×5 | 2–6 | 1–5 | 오른쪽 열 6 + 위쪽 행 1 | 9 | 10 |
| 2 | 6×6 | 1–6 | 1–6 | 왼쪽 열 1 + 아래쪽 행 6 | 11 | 22 |
| 3 | 7×7 | 1–7 | 0–6 | 오른쪽 열 7 + 위쪽 행 0 | 13 | 36 |
| 4 | 8×8 | 0–7 | 0–7 | 왼쪽 열 0 + 아래쪽 행 7 | 15 | 52 |

- 활성 범위는 `GardenBounds { x, y, size }`(첫 열, 첫 행, 한 변)로 적는다. 단계 → 범위는 고정 표라 상태에 단계 번호만 있어도 된다.
- 좌표는 판이 자라도 바뀌지 않는다. 씨앗·승리 칸·렌더러 스프라이트가 성장 중에 자리를 옮기지 않는다.

### 2-2. 착지와 덮인 화분

- 릴 정지는 8개(열마다 `nextInt(strip.length)`), 창은 8×8: `grid[row][reel] = strip[reel][(stop + row) % len]`.
- 활성 범위 밖 칸은 **덮인 화분**이다. 내용은 착지 순간 이미 정해져 있고 화면에는 흙 덮인 화분으로만 보인다(카메라 밖이라 평소엔 보이지도 않는다).
- 리필은 열마다 포인터 `stop − 1`에서 위로 순환하며 읽는다. 덮인 화분 내용(창 안)과 겹치지 않는다. 한 열 리필은 최대 `maxCascades × 8 = 128`칸이므로 **스트립 길이 ≥ 8 + 128 = 136**이면 겹침이 구조적으로 불가능하다. 감사 계측 대신 스키마 정합 검사로 막는다(스트립 초안은 열당 240칸).
- 덮인 화분이 열리면 그 칸의 창 내용이 그대로 드러난다. 그래서 «숨은 심볼»이 꾸며낸 것이 아니라 착지 때 정해진 값이다(시드 공개로 검증 가능).

### 2-3. 심볼표 (빈칸 없음, 9종)

판독 기준: 8×8 @390px에서 셀 45px. 색과 실루엣이 둘 다 달라야 하고, 모든 심볼에 **두꺼운 크림색 스티커 외곽선**을 둔다(흙색 바탕 위 대비).

| id | 이름 (ko / en) | 역할 | 실루엣·색 |
|---|---|---|---|
| `wild` | 나비 / Butterfly | 와일드 | 정면 나비, 하늘·민트 그라데이션 날개(날개 4장 대칭) |
| `scatter` | 물뿌리개 / Watering Can | 스캐터 | 은빛 민트 물뿌리개 옆모습, 물방울 3개(유일한 가로형 실루엣) |
| `sunflower` | 해바라기 / Sunflower | 상위 1 | 노란 꽃잎 원반 + 진갈색 가운데 |
| `rose` | 장미 / Rose | 상위 2 | 진분홍 소용돌이 꽃송이 + 잎 2장 |
| `hydrangea` | 수국 / Hydrangea | 상위 3 | 파란 작은 꽃 뭉치로 된 공 |
| `marigold` | 금잔화 / Marigold | 하위 1 | 주황 폼폼(꽃잎 겹겹, 가운데 없음) |
| `lavender` | 라벤더 / Lavender | 하위 2 | 보라 세로 이삭 3줄기(유일한 세로형) |
| `daisy` | 데이지 / Daisy | 하위 3 | 흰 가는 꽃잎 + 노란 점 가운데(해바라기보다 작고 하얗다) |
| `clover` | 클로버 / Clover | 하위 4 | 연두 하트 잎 3장 |

- 씨앗은 심볼이 아니라 **화분(칸)의 표식**이다. 그 칸에 어떤 꽃이 떨어지든 씨앗은 화분에 남는다.
- 사용자 규칙 «릴에 빈칸 금지»: 덮인 화분은 릴 심볼이 아니라 판 밖 칸이며, 열리면 반드시 위 9종 중 하나다.

### 2-4. 배당표 초안 (총 베팅액 배수, 0.05 눈금)

키 = 클러스터 크기 하한(`payoutForCount`가 이하 최대 키를 고른다). 판이 64칸까지 커지므로 30+까지 둔다.

| 심볼 | 5 | 6 | 7 | 8 | 10 | 12 | 15 | 20 | 30 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sunflower | 1.50 | 2.00 | 3.00 | 4.00 | 6.00 | 10.00 | 20.00 | 50.00 | 150.00 |
| rose | 1.00 | 1.50 | 2.00 | 3.00 | 4.50 | 7.50 | 15.00 | 35.00 | 100.00 |
| hydrangea | 0.75 | 1.00 | 1.50 | 2.00 | 3.00 | 5.00 | 10.00 | 25.00 | 75.00 |
| marigold | 0.40 | 0.50 | 0.75 | 1.00 | 1.50 | 2.50 | 5.00 | 12.00 | 40.00 |
| lavender | 0.30 | 0.40 | 0.60 | 0.80 | 1.20 | 2.00 | 4.00 | 10.00 | 30.00 |
| daisy | 0.25 | 0.35 | 0.50 | 0.70 | 1.00 | 1.60 | 3.00 | 8.00 | 25.00 |
| clover | 0.20 | 0.30 | 0.40 | 0.60 | 0.90 | 1.40 | 2.50 | 6.00 | 20.00 |

| 물뿌리개 개수 | 3 | 4 | 5 | 6+ |
|---|---:|---:|---:|---:|
| 지급(총 베팅 ×) | 1 | 3 | 10 | 50 |
| 정원 프리스핀 | 8 | 10 | 12 | 12 |

- 물뿌리개 지급은 기존 `scatter: { symbol: "scatter", pays: { 3: 1, 4: 3, 5: 10, 6: 50 } }`에 둔다(`scatter.freeSpins`는 두지 않는다). 개수는 정원 엔진이 **스핀이 끝난 활성 범위**에서 센다.
- 스트립 초안(열당 240칸 = 아래 비율 ×2): clover 24 · daisy 21 · lavender 19 · marigold 17 · hydrangea 14 · rose 11 · sunflower 8 · wild 3 · scatter 2~2.4(칸 밀도 약 2.0%). **묶음은 절반 정도만 2칸, 나머지는 1칸**(평균 묶음 1.5). 검수 시뮬(§14-1)에서 평균 묶음 2.5면 적중률 50%를 넘고 기본 게임 성장이 눈덩이처럼 불어난다. 물뿌리개는 터지지 않고 연쇄 리필로 **쌓이므로** 밀도는 정적 계산보다 진입률을 훨씬 크게 올린다(시뮬: 1.25% → 1/555, 1.67% → 1/260).
- 배당표는 §5-2 순서로 선형 배율 한 번에 맞춘다. 위 표는 비율의 초안이다.

---

## 3. 피처 규칙 전문

### 3-1. 한 스핀의 진행 (기본·프리스핀 공통)

```
착지(8×8 창) → [단계 k = 0, 1, …]
  ① 활성 n×n에서 클러스터 평가 (심볼 선언 순서, 와일드 통과, 물뿌리개 막힘)
  ② 당첨이 있으면: 씨앗 배정 → 금액 확정 → 팝 → 활성 범위 안 중력 → 리필
     터진 칸 수를 성장 막대(popped)에 더한다. 쓰인 씨앗은 사라진다
  ③ popped ≥ 다음 문턱이고 크기 < 8이면: 한 겹 성장
     남은 씨앗 +1등급 → 새 칸 공개 → 새 칸마다 씨앗 추첨
  ④ ②도 ③도 일어나지 않았으면 끝
→ 물뿌리개 개수 판정(활성 판) → [프리스핀] 햇살 판정 → 프리스핀 진입·리트리거·종료
```

- ②와 ③은 한 단계 안에서 «팝 → 떨어짐 → 성장» 순서다. 당첨이 없어도 문턱이 남아 있으면 ③만 하는 단계가 생긴다(성장 전용 단계).
- 성장은 한 단계에 한 겹만. 문턱을 두 개 넘었으면 다음 단계에서 또 자란다(화면에서 한 겹씩 보이게).

### 3-2. 씨앗 규칙

| 항목 | 규칙 |
|---|---|
| 등장 | 성장으로 새로 열린 칸마다 씨앗 표 1회 추첨: 기본 게임 `없음 88 / ×2 9 / ×3 3`, 프리스핀 `없음 80 / ×2 14 / ×3 6`(가중치, 튜닝 대상). 4×4 초기 칸에는 씨앗이 없다 |
| 등급 | `seedTiers = [2, 3, 5, 10, 20]`. ×2 = 새싹, ×3 = 봉오리, ×5 = 꽃, ×10 = 큰 꽃, ×20 = 황금 꽃 |
| 자람 | 성장이 일어날 때마다(③의 첫 동작) 판 위의 **이미 있던** 씨앗 전부 +1등급(×20에서 멈춤). 이번 성장으로 새로 나온 씨앗은 그 성장에선 자라지 않는다 |
| 적용 | 당첨 클러스터 하나의 배율 = 그 클러스터 칸(와일드 칸 포함)에 있는 씨앗 값의 합, 씨앗이 없으면 ×1. 합 상한 ×100(`clusterSeedCap`) |
| 겹침 | 와일드 칸은 여러 클러스터에 낄 수 있다. 그 칸의 씨앗은 **기본 금액이 가장 큰 클러스터 하나**에만 배정한다(같으면 심볼 선언 순서가 앞선 쪽) |
| 소비 | 씨앗이 배정된 칸이 터지면 그 씨앗은 피고(사라지고) 화분은 빈 화분이 된다. 터지지 않은 칸의 씨앗은 남는다 |
| 상한 | 판 위 씨앗 최대 16개. 넘는 추첨은 «없음»으로 친다(RNG 호출 수는 그대로) |
| 리셋 | 유료 스핀 끝에 전부 사라진다. 프리스핀 진입 스핀의 남은 씨앗은 프리스핀으로 넘어간다 |

### 3-3. 정원 프리스핀

| 항목 | 규칙 |
|---|---|
| 트리거 | 유료 스핀이 끝난 활성 판에서 물뿌리개 3개 이상(판이 클수록 볼 칸이 늘어난다 → 성장이 보너스 기회도 키운다) |
| 스핀 수 | 3개 8 / 4개 10 / 5개 이상 12 |
| 시작 상태 | 크기 = max(5×5, 진입 스핀 마지막 크기). 성장 막대 = 그 크기의 프리스핀 문턱값(`bonus.thresholds`, 없으면 `thresholds`). 씨앗 = 진입 스핀에서 남은 씨앗. 진입 스핀이 4×4로 끝났을 때 5×5로 올리는 것은 **범위만 바꾸는 것**이고 씨앗 추첨이 없다(RNG 0회, §4-1) |
| 진행 | 매 스핀 새 8×8 창으로 착지하되 **크기·막대·씨앗은 그대로**. 막대는 스핀을 넘어 누적되고 문턱을 넘으면 계속 자란다. 판은 줄지 않는다. 스트립은 `bonus.strips`가 있으면 그것을 쓴다(물뿌리개 밀도를 따로 낮춰 리트리거를 묶는 손잡이) |
| 속도 목표 | 검수 시뮬(§14-1): 기본 문턱을 그대로 쓰면 10스핀 라운드에서 8×8 첫 도달이 평균 6~7번째 스핀, 8×8 스핀 비율 36~60%(스트립 묶음에 민감). «자라는 판»이 보너스 앞쪽에서 끝나 뒤쪽이 같은 판의 반복이 되지 않도록 **8×8 첫 도달 = 라운드 길이의 45~75% 지점, 8×8 스핀 비율 ≤ 50%**를 감사 게이트로 두고 `bonus.thresholds`로 맞춘다 |
| 햇살 | 크기 8×8이 된 뒤 막대가 52 + `sunEvery`·k(k = 1, 2, …, 초안 `sunEvery = 40`)를 넘을 때마다 스핀 끝에 햇살: ① 씨앗 전부 +1등급 ② 씨앗 없는 칸 중 2곳에 ×2 씨앗을 심는다(위치 추첨 2회, 씨앗 16개 상한에 걸려도 추첨은 2회 그대로 하고 버린다). **한 스핀 최대 1회**(`maxSunsPerSpin = 1`, 넘친 막대는 다음 스핀에 이어서 센다). 시뮬상 8×8 한 스핀 평균 터진 칸 약 29개라 초안 16·3회면 8×8 스핀마다 거의 2회 → 4회 만에 모든 씨앗이 ×20에 붙어 «자람»의 긴장이 사라진다(포화). 게이트: 라운드 끝 남은 씨앗 중 ×20 비율 ≤ 30% |
| 리트리거 | 물뿌리개 3개 이상 → +4스핀, 라운드당 최대 2회. 물뿌리개가 연쇄 리필로 쌓이므로 8×8 리트리거율은 정적 추정(17%)보다 높다(시뮬: 밀도 1.25% → 11%, 1.67% → 20%). 게이트: 프리스핀 스핀당 리트리거율 ≤ 10%, 최대 리트리거 도달 라운드 ≤ 15%, 평균 길이 10~12스핀. 넘으면 `bonus.strips`의 물뿌리개 밀도를 낮춘다 |
| 최저 보장 | 프리스핀 합(진입 스핀 제외)이 총 베팅 ×10 미만이면 마지막 스핀에서 차액을 더한다(피처 `gardenTopUp`) |
| 종료 | `freeSpinsLeft`가 0이 되거나 라운드 지급이 5,000×에 닿으면 끝. 크기·씨앗·막대는 함께 사라진다(구조적 리셋, candy와 같은 경로) |
| 배수 | 프리스핀 공통 배수 ×1(배율은 씨앗만) |

### 3-4. 종료·발산 방지 (`GAME_CATALOG.md` §4 규칙 1~3 적용)

| 루프 | 하드 캡 | 단조 감소 척도 | `r < 1` 근거 |
|---|---|---|---|
| 스핀 안 단계 | 팝 단계 `maxCascades = 16`, 성장 4회 | `(16 − 팝 단계) + (4 − 성장 단계)`: 모든 단계가 팝 또는 성장 중 하나를 반드시 한다 | 정적 계산 불가 → 하드 캡이 보장. 기본 게임 `P(지속) ≤ 0.55`·평균 연쇄 ≤ 2.5를 감사 계측(WAVE2 §3-4 텀블 행) |
| 햇살 | 한 스핀 1회, 씨앗 16개 | 스핀 끝 1회 계산이라 루프 아님 | 등급 상한 ×20 |
| 프리스핀 | 리트리거 2회, 최장 12 + 4×2 = 20스핀 | `freeSpinsLeft` + `2 − retriggers` | 물뿌리개가 연쇄로 쌓여 `P(3개 이상)`은 정적으로 못 구한다. 종료는 **횟수 하드 캡**이 보장하고, `4 × p̂ < 1`(p̂ = 감사 실측 스핀당 리트리거율, 게이트 ≤ 10%라 0.4)은 리포트로 확인 |
| 지급 | `round.maxWinCap = 5000` | — | 캡 도달 시 그 자리에서 단계를 끊고 프리스핀도 종료, `winCapped` 피처. **감사에도 같은 캡** |

---

## 4. RNG 소비 순서 · 상태·응답 계약 · API

### 4-1. RNG 소비 계약

```
릴 정지 8회 (열 0→7)
→ 단계 루프: 평가·팝·중력·리필 (0회)
   └ 성장할 때마다: 새 칸마다 씨앗 추첨 1회 (행 오름차순, 같은 행은 열 오름차순)
→ 물뿌리개 판정 (0회)
→ [프리스핀] 햇살마다 심을 자리 추첨 2회 (씨앗 없는 활성 칸 목록에서 nextInt(남은 수), 행·열 오름차순 목록. 씨앗 상한에 걸려도 2회 호출하고 결과만 버린다)
   (프리스핀 시작 때 4×4 → 5×5로 범위만 올리는 것은 0회)
→ [API] 잭팟 판정 1회
```

- 성장 단계는 판 결과로 결정되므로 추첨 횟수도 판 결과로 결정된다. `seed + stateBefore + totalBet`이면 라운드 전체가 재생된다.
- `garden.test.ts`가 호출 수를 고정한다: 성장 없음 8회 / 5×5까지 17회 / 8×8까지 8 + 9 + 11 + 13 + 15 = 56회 / 프리스핀 햇살 1회 +2회.
- 씨앗 추첨은 `random.ts`의 `pickWeighted`를 쓴다(candy가 옮겨 둔 공용 함수, 본문 불변).

### 4-2. 엔진 타입 (`packages/slot-engine/src/types.ts`에 추가)

```ts
export interface GardenBounds { x: number; y: number; size: number }   // 8×8 절대 좌표
export interface GardenSeed { reel: number; row: number; tier: number } // tier: seedTiers 인덱스
export interface GardenGrow {
  from: GardenBounds; to: GardenBounds
  cells: GridPosition[]          // 새로 열린 칸 (RNG 순서와 같은 순서)
  seeds: GardenSeed[]            // 새로 나온 씨앗
  grown: number                  // 등급이 오른 기존 씨앗 수
}
export interface GardenStep {
  index: number
  wins: WinLine[]                // positions 절대 좌표, win은 씨앗 배율 적용 후. WinLine.seed?: number (적용 배율)
  removed: GridPosition[]
  refill: SymbolId[][]           // 활성 열 왼→오른, 각 위→아래
  bloomed: GridPosition[]        // 이번 단계에 쓰인 씨앗 자리
  grow?: GardenGrow
  popped: number                 // 이 단계 뒤 누적 터진 칸 (프리스핀은 라운드 누적)
  stepWin: number
}
export interface GardenSun { seedsGrown: number; planted: GardenSeed[] }
export interface GardenCarry {   // 프리스핀 동안만 존재
  stage: number; popped: number; seeds: GardenSeed[]
  retriggers: number; roundWin: number
  maxStage: number; bestSeed: number; bestSpinWin: number   // 결과 팝업용, 서버가 집계
}
export interface RoundCarry { orders?: OrderRoundCarry; garden?: GardenCarry }

type FeatureTrigger = …
  | { type: 'garden'; start: GardenBounds; startSeeds: GardenSeed[]; startPopped: number
      steps: GardenStep[]; finalGrid: SymbolId[][]; final: GardenBounds; seeds: GardenSeed[]
      sun?: GardenSun[]; capped: boolean; hitMaxCascades: boolean }
  | { type: 'gardenTopUp'; amount: number }
```

- `SpinResult.grid` = 착지한 8×8 창(덮인 화분 내용 포함). `finalGrid`는 `garden` 피처 안에만 둔다(최상위 `finalGrid?`는 candy 전용 뜻 그대로).
- `foldGarden(grid, start, steps) === finalGrid`를 엔진·API·렌더러가 같은 함수로 확인한다.
- 진입 스핀: 기존 `{ type: 'freeSpins', spins, multiplier: 1, retrigger: false }` + `nextState.carry.garden`. 허브의 프리스핀 배관은 그대로 쓴다.
- 기본 게임에서는 `nextState`가 없다 → 유료 스핀 사이 이월이 구조적으로 불가능하다.

### 4-3. shared·API 계약

| 항목 | 변경 |
|---|---|
| shared 새 스키마 | `GardenBoundsSchema`, `GardenSeedSchema`, `GardenStepSchema`(refill 릴별 배열), `GardenFeatureSchema`, `GardenTopUpSchema`, `GardenCarrySchema` → `RoundCarrySchema`에 `garden?` |
| `FeatureTypeSchema` | `garden`, `gardenTopUp` 추가(배열 끝) |
| `freeSpinsSummary` | `garden?: { maxSize, bestSeed, bestSpinWin, topUp }` (candy의 `ordersCompleted?` 자리와 같은 방식) |
| `toSharedFeature` (`engineSpin.ts`) | `garden`·`gardenTopUp` 명시 분기(candy O17의 `never` 검사 유지) |
| 저장 | 새 컬럼 없음. `rounds.features`에 `garden` 피처, `rounds.state_before`에 직전 `RoundState`(0012 마이그레이션 컬럼 재사용) |
| 멱등 재전송 | 저장된 피처로 그대로 조립. 엔진 재실행 없음 → 바이트 동일 |
| 시드 공개 | `RoundSeedResponse.stateBefore` + `replaySpin(math, bet, rng, stateBefore)` → `totalWin`·`garden.steps` 일치 비교(`handleRevealSeed`) |
| 상태 복원 | `GET /games/:id/state`가 `FreeSpinsState.carry.garden`을 그대로 돌려준다. 새로고침하면 크기·씨앗·막대·남은 스핀 복원 |
| 서버 권위 | 성장·씨앗·햇살·최저 보장은 엔진만 계산. 허브의 막대·씨앗 표시는 응답 값의 재생이고, 끝나면 응답 carry로 덮는다 |
| 응답 크기 | 최악 스핀 ≤ 16KB 테스트(16단계 × 단계당 약 0.8KB). 심볼 id 10자 이하 |
| 디버그 | 프리셋 `gardenGrow`(성장 1회 이상), `gardenGrow8`(8×8 도달), `seedBloom`(씨앗 개화 1회 이상), `gardenSun`(프리스핀 중 햇살, 라운드 밖에서는 비활성). 기존 `freeSpins`·`cascade3`·`lose`·`win`·`bigWin`도 매칭 함수에 정원 분기. 정원 아닌 팩은 409 |
| 체험판 | `--mode demo`는 같은 `createApp` + `MemoryRepos`. carry는 메모리 저장소의 `game_states`로 이어진다. 새로고침 복원은 체험판에서는 탭 수명 안에서만(기존과 같음) |

### 4-4. API 경로 (전부 기존 경로)

`POST /games/:id/spin`(멱등 키) · `GET /games/:id/state` · 라운드 시드 공개 경로(`RoundSeedResponse`) · 디버그는 `SpinRequest.debug`. 새 경로 없음.

---

## 5. 수학 목표 · 튜닝 · 감사 게이트

### 5-1. 목표

| 지표 | 목표 |
|---|---|
| RTP | 94.5% ± 0.5%p (잭팟 포함 96.0 ± 0.5) |
| 분해 | 기본 클러스터 58.0 / 기본 씨앗 추가분 5.5 / 물뿌리개 지급 1.0 / 정원 프리스핀 30.0(그중 최저 보장 약 0.6) |
| 적중률 | 약 30% (게이트 10~60%) |
| 성장률(기본) | 5×5 이상 약 9% · 6×6 2~3% · 7×7 0.5~0.9% · 8×8 0.12~0.25%. 검수 시뮬(§14-1)은 문턱 `[10,22,36,52]`에서 9.4 / 1.4 / 0.35 / 0.1%였다 → 6×6 이상을 더 자주 보이려면 뒤 문턱을 낮춰 시작(`[10, 20, 32, 46]`) |
| 프리스핀 | 진입 1/185 (게이트 1/120~1/250), 평균 지급 약 55× (게이트 30~80×), 평균 길이 10~12스핀(리트리거 스핀당 ≤ 10%), 평균 시작 크기 약 5.4, 8×8 첫 도달 라운드의 45~75% 지점·8×8 스핀 비율 ≤ 50%, 라운드 끝 ×20 씨앗 비율 ≤ 30% |
| 최대 당첨 | 5,000× 상한 명시, 감사 최대 관측 ≥ 500× |
| 연쇄(기본) | `P(지속) ≤ 0.55`, 평균 연쇄 ≤ 2.5 |
| 연쇄(프리스핀) | 16단계 도달 < 0.5%(프리스핀 스핀 기준), 리포트에 따로 |

### 5-2. 튜닝 순서 (`tune-cli`)

1. **스트립 밀도** → 4×4 적중률 30%. 적중률은 표준오차가 작아 먼저 맞춘다(HOWTO §3-e).
2. **스트립 묶음 배열** → 기본 성장률 9%, 기본 `P(지속)`.
3. **성장 문턱** `[10, 22, 36, 52]` → 성장률 표. 문턱을 1 올리면 그 단계 이상 비율이 크게 줄어드니 1씩만. 판이 클수록 다음 성장이 쉬워지는 눈덩이 효과가 있어(시뮬 조건부 5→6 0.15, 6→7 0.25, 7→8 0.3) 뒤 문턱부터 만진다.
4. **물뿌리개 밀도**(약 2.0%, 연쇄 누적 때문에 정적 계산보다 진입률이 높다) → 진입 1/185.
4-1. **프리스핀 스트립·문턱**(`bonus.strips`·`bonus.thresholds`) → 리트리거 ≤ 10%, 8×8 도달 지점·비율. 기본 게임 수치는 건드리지 않는다.
5. **배당표 선형 배율** → 기본 클러스터 58.0. 프리스핀 몫도 같이 움직이므로 6·7과 2회 왕복.
6. **씨앗 표·`seedTiers`** → 기본 씨앗 추가분 5.5. 씨앗 몫은 등급 값에 거의 선형이다. 검수 시뮬은 초안 씨앗 표(12%)에서 기본 클러스터 지급의 5.4~6.3%(≈ 3.2~3.7%p)였다. 씨앗 등장률을 20% 넘게 올려야 5.5가 나오면 화면이 씨앗투성이가 되니, 그때는 씨앗 몫 목표를 3.5로 내리고 차이를 기본 클러스터(60.0)로 옮긴다.
7. **프리스핀 씨앗 표·햇살(`sunEvery`, `sunPlant`)** → 프리스핀 30.0, 평균 55×. 최저 보장 몫은 리포트 값으로 확인만.

### 5-3. 감사 게이트 (HOWTO §6 + candy M3 확장)

| 관문 | 기준 |
|---|---|
| CI(40만) | `\|rtp − target\| ≤ max(0.5%p, 3·SE)` + 재현성 + 정밀도 필드 |
| 정식 감사 | `\|rtp − target\| ≤ 0.5%p` **그리고** ci95 반폭 ≤ 0.2%p, `n ≥ n*` |
| 기존 | 레벨별 ±0.5%p + 자기 CI · 적중률 10~60% · 최대 배수 ≥ 50× · 독립 MC 3SE · 분포 합 1 · 잭팟 포함 96.0 ± 0.5 |
| 성장 | 단계별 도달률 표, 성장 전용 단계 비율(리필 겹침은 스트립 ≥ 136 스키마 검사로 구조적으로 0) |
| 씨앗 | 등장 수·개화 수·등급별 개화 분포·씨앗 몫, 클러스터 씨앗 합 상한 도달률, 라운드 끝 ×20 비율 ≤ 30% |
| 프리스핀 | 진입률, 시작 크기 분포, 길이 분포(8~20, 20 초과 0건, 평균 10~12), 스핀당 리트리거율 ≤ 10%·최대 리트리거 라운드 ≤ 15%, 평균·중앙값 지급, ×10 미만 비율(=최저 보장 발동률), 햇살 횟수 분포, 8×8 첫 도달 지점(45~75%)·8×8 스핀 비율(≤ 50%) |
| 연쇄 | 기본 `P(지속) ≤ 0.55`·평균 ≤ 2.5, 프리스핀 16단계 도달 < 0.5% |
| 캡 | 5,000× 도달률, 캡 on/off 차 |
| 회귀 | live 10종 골든 해시 동일 |

### 5-4. 예상 σ와 n*

- 보너스 몫 근사: `p × E[X²] = (1/185) × (55² + 70²) ≈ 43` → 보너스 쪽 σ 약 6.6, 기본 게임 쪽 약 2.5~3(candy 실측 2.90) → **σ 7~9**. 다만 보너스 표준편차 70×는 낙관이다(씨앗 합 ×100이 8×8 큰 클러스터에 붙는 꼬리). 표준편차가 150×면 σ ≈ 11.7, n* ≈ 160M(4샤드 약 10~16분)이다. 그래서 아래 꼬리 깎기 규칙을 σ̂ > 10에서 바로 적용한다.
- `n* = ⌈(1.96 · σ̂ · 1.1 / 0.002)²⌉` → σ̂ 7이면 약 57M, 9면 약 95M, 10이면 약 117M. `manifest.auditSpins`는 파일럿 후 1천만 단위 올림(예상 **100,000,000**, σ̂ 10 초과로 꼬리를 깎지 못하면 120,000,000까지 허용하고 그 이상이면 꼬리 깎기가 끝날 때까지 정식 감사 보류).
- σ̂ > 10이면 ×20 등급의 등장을 줄이고(햇살 심기 ×2 고정 유지) `clusterSeedCap`을 100 → 50으로 내린다. 기대값은 프리스핀 씨앗 표로 되돌린다(꼬리만 깎는다, WAVE2 §3-6 대응 2).
- 시간: 4×4 판이 대부분이라 스핀당 평균 비용은 candy와 비슷하거나 작다(candy 10M·4샤드 33.7초). 100M·`--shards 4`면 약 6~10분. 파일럿 5M은 30초 안팎.

---

## 6. 엔진·공용 패키지 변경 목록 (파일 단위)

**원칙.** 고유 로직은 새 파일. 공용 파일은 «분기 한 줄·유니온 끝에 추가·사전 끝에 추가»만. 다른 신작 두 팀·개선안 팀과 병합할 때 충돌 면적을 줄인다.

### 6-1. 새 파일

| 파일 | 내용 |
|---|---|
| `packages/slot-engine/src/garden.ts` | 단계 → 범위 표, `runGarden(math, grid, stops, totalBet, carry, capRemaining, rng)`, `applyGardenStep`, `foldGarden`, 씨앗 배정·등급, `applySun`, `resolveGardenSpin`(진입·프리스핀·리트리거·최저 보장·캡) |
| `packages/slot-engine/src/gardenSchema.ts` | `GrowBoardSchema`와 정합 검사(아래 6-3) — `coinRespinSchema.ts`·`boardSchema.ts`와 같은 패턴 |
| `packages/slot-engine/src/garden.test.ts`, `gardenSchema.test.ts` | §12 엔진 항목 |
| `tools/rtp-sim/src/audit/gardenStats.ts` (+test) | §5-3 정원·씨앗·프리스핀 절 |
| `packages/renderer/src/garden.ts` (+test) | 순수 계획: 카메라 사각형(단계별 배율·중심), 단계 시간 예산, STOP 압축, `buildGardenPlan`(마지막 판 = `finalGrid` 검사) |
| `packages/renderer/src/pixi/gardenFx.ts` | 카메라 트윈, 덮인 화분 덮개 풀, 씨앗 배지(코드로 그린 숫자), 화분 열림 흙 파편·씨앗 개화 꽃잎·햇살 입자(공용 입자 풀 사용) |
| `apps/hub/src/components/game/GardenMeter.tsx` + `.css` | 목표 띠 + 성장 막대(크기 `4×4 → 5×5`, `다음 크기까지 3칸`, 8×8에서는 `햇살까지 5칸`) |
| `apps/hub/src/components/game/GardenHelp.tsx` + `.css` | §11 도움말 그림(CSS 격자, 정사각 칸) |
| `apps/hub/src/store/garden.ts` (+test) | 서버 carry·피처에서 크기·씨앗·막대 표시 상태를 만든다(서버 값만 근거) |
| `apps/hub/src/lib/audioGarden.ts`, `bgmGarden.ts` (+test) | §9 |
| `games/greenhouse-garden/*` | `manifest.json`·`math.json`·`theme/theme.json`·`art/prompts.json`·`art/fx.json`·`README.md`·`CHECKLIST.md`·`thumb.webp` |

### 6-2. 공용 파일 (추가 위주 최소 수정)

| 파일 | 수정 |
|---|---|
| `slot-engine/src/schema.ts` | `growBoard: GrowBoardSchema.optional()` 1필드 + refine에서 `checkGrowBoard(math, issue)` 호출 1줄 |
| `slot-engine/src/spin.ts` | `resolveSpin` 맨 앞 분기 1줄 |
| `slot-engine/src/types.ts` | §4-2 타입, `RoundCarry.garden?`, 유니온 끝 2개, `WinLine.seed?` |
| `slot-engine/src/analytic.ts` | `isAnalytic`: `growBoard`면 false (1줄) |
| `slot-engine/src/evaluate.ts` | `featureTriggerCount`: `growBoard.bonus.trigger` (1줄) |
| `slot-engine/src/index.ts` | export 추가 |
| `shared/src/schemas.ts` | §4-3 스키마, 피처·프리셋 enum 끝 추가 |
| `game-sdk/src/manifest.ts`, `validate.ts` | features enum `growBoard`, `SOUND_PRESETS`에 `'garden'`, 정원 팩이면 `reels = rows = maxSize` 검사. **`theme.ts`는 고치지 않는다** — 화분 덮개·씨앗 그림은 기존 `theme.props`(kraken `coin-small` 선례) 키 `pot`·`seed-0`~`seed-4`로 읽고, 없으면 렌더러가 코드로 그린다 |
| `renderer/src/types.ts` | `SoundPreset`에 `'garden'`, 이벤트 `gardenStep`·`gardenGrow`·`seedBloom`·`gardenSun`, `SpinToOptions.garden?`, `activeReels?`(멈춤 엇갈림을 활성 열만 센다) |
| `renderer/src/pixi/pixiRenderer.ts` | `runSpin`에 정원 단계 위임(respin 위임과 같은 모양, 10줄 안팎), 카메라 컨테이너 1개, `getCellRect`가 카메라 배율 반영 |
| `renderer/src/anticipation.ts` | 기대감 대상 칸을 활성 범위로 제한하는 선택 인자(없으면 덮인 화분 속 물뿌리개를 세어 보이지 않는 칸 때문에 감속하는 오류가 난다). 성장 공개 기대감은 이 파일이 아니라 `renderer/src/garden.ts`에 둔다 |
| `apps/api/src/games/engineSpin.ts`, `debugSpin.ts`, `routes/games.ts` | 피처 분기, 프리셋 매칭 4종, 409 조건 1줄 |
| `apps/hub/src/components/game/GameScreen.tsx` | `math.growBoard`일 때 `GardenMeter`·`GardenHelp` 마운트, WinStrip 라벨(`씨앗 ×5`, `정원 5×5`) |
| `apps/hub/src/components/game/RoundPopup.tsx` | `freeSpinsSummary.garden` 행 4개 |
| `apps/hub/src/components/game/GameCard.tsx` | 로비 문구 «자라는 정원 · 씨앗 배율»(AUDIT A5 방향) |
| `apps/hub/src/lib/audio.ts`, `bgm.ts`, `debugPreset.ts` | 프리셋 등록, `presetsFor(math)` 정원 분기 |
| `apps/hub/src/i18n/ko.ts`, `en.ts` | `garden.*` 키를 사전 끝에 |
| `tools/rtp-sim/src/audit/contributions.ts`, `report.ts`, `tune-cli.ts` | 정원 통계 호출·절 추가 |
| `tools/theme-gen` | **수정 없음.** 화분 덮개·씨앗 5종은 기존 `kind: "thumb"` + `transparent: true` + `out: "theme/props/…"`로 만든다(kraken 코인 3종과 같은 경로). 공용 도구 변경 1건을 줄인다 |

### 6-3. `GrowBoardSchema` (math.json 선택 필드)

```ts
growBoard: z.object({
  startSize: z.literal(4), maxSize: z.literal(8),
  thresholds: z.array(z.number().int().positive()).length(4),     // 오름차순
  maxCascades: z.number().int().min(1).max(20),                   // 16
  seedTiers: z.array(z.number().int().min(2)).min(1).max(8),      // [2,3,5,10,20] 오름차순
  seedTable: z.array(z.object({ tier: z.number().int().min(-1), weight: z.number().int().positive() })), // -1 = 없음
  clusterSeedCap: z.number().int().min(1),                        // 100
  maxSeeds: z.number().int().min(1).max(64),                      // 16
  bonus: z.object({
    trigger: z.number().int().min(1), spinsByCount: z.record(z.coerce.number().int(), z.number().int().min(1)),
    minStartSize: z.number().int().min(4).max(8), retriggerSpins: z.number().int().min(1), maxRetriggers: z.number().int().min(0),
    seedTable: z.array(…), sunEvery: z.number().int().min(1), sunPlant: z.number().int().min(0), maxSunsPerSpin: z.number().int().min(0), // 40 / 2 / 1
    minRoundPay: z.number().min(0),                               // 총 베팅 배수, 10
    thresholds: z.array(z.number().int().positive()).length(4).optional(),  // 프리스핀 전용 문턱, 없으면 위 thresholds
    strips: z.array(z.array(z.string().min(1)).min(1)).optional(),          // 프리스핀 전용 스트립 8개, 없으면 math.strips
  }),
}).optional()
```

정합 검사: `payModel === 'cluster'`·`cluster` 필수, `cascade`·`orderRound`·`scatter.freeSpins`·`paylines`·`ways`와 동시 금지, `reels = rows = maxSize`, 스트립(기본·`bonus.strips` 모두) 8개 각 ≥ `8 + maxCascades × 8`(16이면 136) — 리필이 창 내용과 겹치지 않음을 구조로 보장, 문턱·등급 오름차순, `maxSpins = max(spinsByCount) + retriggerSpins × maxRetriggers ≤ MAX_FREE_SPINS_PER_ROUND`, `retriggerSpins × P_upper < 1`은 리포트 항목(정적으로는 하드 캡이 보장).

---

## 7. 화면 스토리보드 (390×844 / 430×932)

### 7-1. 세로 배치

| 영역 | 430×932 | 390×844 | 비고 |
|---|---:|---:|---|
| 상단 바 | 56 | 56 | 기존 |
| 목표 띠 | 26 | 24 | «[물뿌리개 아이콘] 3개 → 정원 프리스핀», 아이콘은 심볼 이미지(@64) |
| 성장 막대 | 40 | 38 | 줄기 막대 + `4×4` 배지 + `다음 크기까지 3칸` |
| 판(정사각 프레임) | 430 | 390 | 창 x·y 2–98%, 카메라가 활성 n×n을 창에 맞춘다 |
| 당첨 금액 | 48 | 44 | 컨트롤 **위**(사용자 규칙) |
| 컨트롤 | 140 | 132 | 기존 |
| 합계 | 740 | 684 | 남는 세로는 위아래 배경 여백(온실 지붕 아치가 bg에 그려짐) |

### 7-2. 장면별

| 장면 | 화면 | 시간(normal) |
|---|---|---|
| **기본** | 4×4 큰 꽃 칸(100px). 판 밖은 카메라 밖이라 안 보이고, 프레임 안쪽 가장자리에 흙 화분 가장자리가 살짝 비친다(덮인 화분이 있다는 암시, 내용은 안 보임) | 착지 약 1.6s(활성 4열만 엇갈림) |
| 히트 → 팝 | 클러스터 칸이 부드럽게 빛나며 살짝 튐(선 그리지 않음) → 120ms 정적 → 꽃잎 파편과 함께 팝 → 위에서 떨어짐 | 단계 760ms (강조 280 / 정적 포함 팝 180 / 낙하 300) |
| 막대 | 터진 칸 수만큼 줄기가 자람. 문턱 2칸 안이면 봉오리가 부풂(실제 값만) | 팝과 동시 |
| **성장** | 막대 끝 봉오리가 터짐 → 카메라가 새 겹 쪽으로 물러남(350ms, ease-out) → 새 칸 흙 덮개가 바깥에서 안쪽 순서로 톡톡 열림(30ms 간격) → 씨앗 칸은 새싹이 솟고 배지 `×2` → 기존 씨앗 등급 오름(배지 숫자 굴림 200ms) | 650ms (+ 칸 수 × 30ms 공개 간격은 650 안에 포함, 넘으면 간격 축소) |
| 씨앗 개화 | 씨앗 칸이 낀 클러스터 팝 직전, 씨앗이 꽃으로 피며 배율 숫자가 클러스터 중앙 칸으로 모였다가 금액에 곱해짐. WinStrip `수국 ×9 · 씨앗 ×5 · 375` | 팝 단계에 +240ms |
| **피처 진입** | 물뿌리개 강조(물방울 튀김) → 진입 클립(덩굴이 자라 덮음) → 커튼 뒤 `bgFreeSpins` 교체·판 크기 유지 → 카운터 `정원 프리스핀 1/10` | 기존 3단계 커튼(380/700/420) + 클립 3.0s |
| **진행** | 막대가 스핀 사이에 남는다. 8×8 뒤에는 막대 라벨이 `햇살까지 n칸`. 햇살: 판 위로 따뜻한 빛 번짐(사선 광택 아님, 전체 밝기만 300ms) → 씨앗 전부 한 단계 → 새 씨앗 2개가 떨어져 심김 | 햇살 1회 700ms |
| **종료** | 종료 클립(꽃봉오리가 한꺼번에 피며 꽃잎이 날려 걷힘) → 4×4로 카메라 복귀 → 결과 팝업: 총 획득, «베팅의 ×N», 최대 정원 크기, 가장 큰 씨앗, 최고 한 판, `최저 보장 적용` 표시 | 클립 3.0s + 팝업 |
| **빅윈** | 단계·정산이 다 끝난 뒤 한 번만. 공용 셀레브레이션 스킨(꽃잎 `petal`·`spark`, `flutter`) | 기존 등급 규칙 |

### 7-3. 시간 예산 (최악 스핀 게이트)

3단계부터 단계 길이 ×0.78, 하한은 모드 기본의 0.27배(candy R2와 같은 규칙). 성장은 650 → 520 → 420 → 340ms로 줄인다.

씨앗 개화 +240ms는 **1·2단계에서만 더하고**, 3단계부터는 강조 280ms 안에서 개화로 바꿔 시간을 더하지 않는다. 기대감 공개 지연은 성장당 1회 +300ms(turbo·모션 축소 0). 햇살은 스핀당 최대 1회라 프리스핀 행에만 더한다. 착지(약 1.6s)는 기존 릴 정지 예산이라 아래 표 밖이다.

| 모드 | 팝 단계 | 성장 | 최악 기본(16단계 + 성장 4 + 개화 2 + 기대감 1) | 게이트 | 프리스핀 최악(+햇살 1) | 게이트 |
|---|---:|---:|---:|---:|---:|---:|
| normal | 760ms | 650ms | 약 8.0s (7.2 + 0.48 + 0.3) | ≤ 8.2s | 약 8.7s (+700) | ≤ 8.9s |
| quick | 530ms | 450ms | 약 5.6s (5.0 + 0.34 + 0.2) | ≤ 5.8s | 약 6.1s (+500) | ≤ 6.3s |
| turbo | 400ms | 300ms | 약 3.85s (3.6 + 0.25) | ≤ 4.0s | 약 4.2s (+350) | ≤ 4.4s |
| 모션 축소 | 180ms | 200ms(카메라 즉시, 덮개 페이드) | 약 2.4s | ≤ 2.6s | 약 2.6s (+200) | ≤ 2.8s |

### 7-4. 스킵 / STOP

- 릴이 도는 중 STOP: 기존 스냅 착지 → 정원 단계를 압축 재생.
- 정원 단계 중 STOP: 남은 단계를 `max(90, min(220, 1200 / 남은 단계 수))`ms로 압축. 성장은 카메라 150ms 즉시 이동 + 덮개 한꺼번에 사라짐, 배지 숫자는 즉시 최종값. 연쇄 단계에 제자리 텍스처 교체 경로 없음(낙하는 항상 위치 트윈).
- 두 번째 탭 무시. 셀레브레이션은 기존 스킵 규칙.
- 끼어들기(화면 이탈 등): `finalGrid`·최종 범위·씨앗을 즉시 확정하고 `end` 이벤트.

### 7-5. 메모리·풀 설계 (처음부터)

| 자원 | 상한 | 수명 |
|---|---|---|
| 심볼 텍스처 | 9종 × 256² (최대 표시 100px × DPR 2 = 200px) ≈ 2.4MB | 게임 진입 ~ 이탈 |
| 승리 시트 | `wild-win`·`scatter-win` 2장 × 768² ≈ 4.7MB | 동일 |
| 화분 덮개·씨앗 5종 | 256² 1장 + 128² 5장 ≈ 0.6MB | 동일 |
| `bgFreeSpins` | 1080×1620 1장 | **프리스핀 진입 때 로드, 종료 후 해제** |
| 심볼 스프라이트 | 8×8 = 64 + 릴 회전 버퍼(기존 풀) — 판 크기와 무관하게 한 번 할당 | 재사용 |
| 덮개 스프라이트 | 최대 48(64 − 16) | 풀, 열리면 반납 |
| 씨앗 배지 | 최대 16(`maxSeeds`) | 풀 |
| 입자 | 공용 입자 풀 상한 160 공유 | 단계 끝에 GSAP 트윈 kill |
| 카메라 | 컨테이너 배율 1개, 텍스처 재생성 없음 | — |
| 그리기 범위 | 활성 n×n + 바깥 1겹만 `visible = true`(4×4면 64칸 중 36칸), 나머지는 `visible = false`로 그리기 호출에서 뺀다. 릴 마스크는 카메라 컨테이너 **밖**(화면 좌표의 프레임 창 사각형)에 둬서 배율과 무관하게 창 밖이 잘린다 | 성장 때 갱신 |

`memory-smoke`(기존 검증 세트)에 정원 50스핀 + 프리스핀 1회 후 텍스처 수·스프라이트 수가 시작값으로 돌아오는지 항목을 더한다.

---

## 8. 아트 목록

### 8-1. 컨셉

**유리 온실 속 스티커풍 보태니컬 3D.** 매트한 도자기처럼 매끈한 꽃잎, 은은한 속빛, **모든 물체에 두꺼운 크림색 스티커 외곽선**(45px 판독용). 맑은 초록과 파스텔 꽃색. candy(설탕 매트 젤리)·fruit(캔디 글라스)와 재질이 다르다.

- 팔레트: 잎 초록 `#6cc08b`, 민트 유리 `#cdeee0`, 크림 철제 `#fbf7ee`, 꽃분홍 `#f6a6c1`, 라벤더 `#b9a3e3`, 버터 노랑 `#ffd66b`, 테라코타 `#d98a5f`.
- `stylePrefix` 초안: `Soft stylized 3D botanical game art, porcelain-smooth matte petals and leaves with a gentle inner glow, thick clean cream sticker outline around the whole object, soft top-left window light, fresh greenhouse greens with pastel flower colors, leaf green #6cc08b, mint glass #cdeee0, cream iron #fbf7ee, petal pink #f6a6c1, lavender #b9a3e3, butter yellow #ffd66b, terracotta #d98a5f, not glossy, not glass-like, centered single object, premium mobile game art`
- `negative` 초안: `photorealistic photography, text, letters, numbers, logo, watermark, people, faces, hands, harsh black outlines, cluttered background, diagonal light streaks, cropped edges`

### 8-2. 자산표 (생성 19장 + 시트 2장 + 클립 2편)

| id | kind | 생성 → 출력 | 프롬프트 초안 (stylePrefix 뒤에 붙음) |
|---|---|---|---|
| `wild` | symbol | 1024² → 256 | `a front-facing butterfly with four symmetrical wings in sky blue to mint gradient, small cream dots on the wings` |
| `scatter` | symbol | 1024² → 256 | `a silver-mint watering can in side view with three round water droplets falling from the spout` |
| `sunflower` | symbol | 1024² → 256 | `a single sunflower head seen from the front, bright yellow petals around a dark brown seed center` |
| `rose` | symbol | 1024² → 256 | `a single deep pink rose bloom with a tight spiral center and two small green leaves` |
| `hydrangea` | symbol | 1024² → 256 | `a round ball of tiny blue hydrangea florets` |
| `marigold` | symbol | 1024² → 256 | `a fluffy orange marigold pompom bloom with layered ruffled petals and no visible center` |
| `lavender` | symbol | 1024² → 256 | `three upright purple lavender sprigs tied together, tall vertical silhouette` |
| `daisy` | symbol | 1024² → 256 | `a small white daisy with thin petals and a round yellow center` |
| `clover` | symbol | 1024² → 256 | `a light green clover with three heart-shaped leaves` |
| `pot` | thumb(투명, `theme/props/`) | 1024² → 256 | `a top-down view of a round terracotta flower pot rim filled with a smooth dome of dark soil, square-friendly composition` |
| `seed-0`~`seed-4` | thumb(투명, `theme/props/`) | 1024² → 128 ×5 | 0 `a tiny green sprout with two round leaves` / 1 `a closed pink flower bud on a short stem` / 2 `a half-open pastel pink flower` / 3 `a fully open large pastel pink flower` / 4 `a fully open golden flower with warm soft glow`. **숫자 배지는 코드가 그린다**(kraken K2 선례: 피처 핵심 금액은 코드가 그린 얼굴) |
| `frame` | frame | 1024² → 1080 | `a thin square greenhouse bed frame made of cream-painted iron with small rivets and tiny ivy leaves at the four corners, the frame band is very thin`. 창 x 2–98%, **y 2–98%(정사각)**, «창 안은 순수 #00FF00, 아무것도 그리지 않는다» 문장 고정 |
| `bg` | bg | 1024×1536 → 1080 | 유리 온실 안, 위쪽에 흰 철제 아치 지붕, 아래쪽 나무 화단, 채도 낮춤. 가운데 정사각 영역은 흙색 화단으로 비워 `reelBackdrop` |
| `bgFreeSpins` | bg | 1024×1536 → 1080 | 같은 온실이 꽃으로 가득 찬 만개 장면, 지붕 유리로 들어오는 부드러운 빛(사선 광선 금지) |
| `thumb` | thumb | 1536×1024 → 640 | 판이 바깥으로 한 겹 자라며 흙 화분이 열리고 씨앗 하나가 황금 꽃으로 피는 순간 |
| `wild-win` | sheet 3×3 @12fps | 1024² → 768 | 나비 날갯짓 9프레임 |
| `scatter-win` | sheet 3×3 @12fps | 1024² → 768 | 물뿌리개 기울며 물방울 9프레임 |
| `fs-enter` / `fs-exit` | 전환 클립 | 360×640, 3.0s | §10 |
| `celebration` | theme.json | — | `{ shapes: ['petal','spark','confetti','star'], motion: 'flutter', ray: 'halo', wave: 'ring', font: 'rounded' }` |
| `sound` | theme.json | — | `{ "preset": "garden" }` |

**코드 드로잉이 나은 것.** 씨앗 숫자 배지, 칸 받침(활성 칸 18% 크림 판), 성장 막대·목표 띠(DOM), 흙 파편·꽃잎·햇살 입자, 셀레브레이션 모양, 도움말 격자 그림. 이미지 생성 없음.

### 8-3. 프레임 창 비율과 검수

- 이 팩의 판은 정사각이라 **정사각 캔버스 + 정사각 창**이다. ART_DIRECTION v3의 «5릴 = 정사각 캔버스 + 가로형 창»에서 창 모양만 판 모양을 따른 것이고, 캔버스 규격(1024²)과 좌우 잘림 금지(v4)는 그대로다.
- 창 감지는 **알파 투명 영역 실측**(`detectAlphaWindow`)으로 `frameLayout.window`를 정한다. 색 감지와 1.5% 넘게 다르면 경고(candy §7 교훈).
- 생성은 한 번에 1~2장, 매번 `contact` 시트를 Read로 열어 id ↔ 그림 1:1 확인(codex 회수 오류). 씨앗 5종은 서로 닮아 회수 오류를 놓치기 쉬우니 128/45/20px 타일로 따로 본다.
- 중단된 gen 뒤 `theme.json` 키 누락 확인 → `--reprocess`.
- Codex 한도 소진 시 로컬 SDXL로 대체하지 않고 멈추고 남은 목록을 보고한다.

---

## 9. 효과음·배경음 프리셋 `garden`

### 9-1. 성격

나무 칼림바 + 부드러운 피리 + 레인스틱·셰이커. 기존 9종(bell 종·fruit 마림바·western 기타·shrine 고토·clockwork 톱니·candy 신스 플럭·deepsea·hanbok·idol)과 겹치지 않는 «자연 소리·손으로 뜯는 금속 혀» 쪽이다.

### 9-2. 효과음 (`audioGarden.ts`)

| 함수 | 쓰임 | 레시피 초안 |
|---|---|---|
| `playGardenPop(step)` | 팝 | 칼림바 뜯음(감쇠 0.25s) + 짧은 잎 바스락(대역 잡음 2~6kHz 40ms). 단계마다 F 장조 펜타토닉 한 칸 위 |
| `playGardenDrop()` | 낙하 | 흙에 닿는 낮은 톡(80Hz 사인 + 잡음 20ms), 아주 작게 |
| `playGardenGrow(stage)` | 성장 | 나무 윈드차임 상행 4음 + 흙 터짐 저역 쿵. 단계마다 시작음 한 칸 위 |
| `playPotOpen(i)` | 덮개 열림 | 아주 짧은 나무 톡, 칸 수만큼이 아니라 **한 성장당 최대 6회로 묶음** |
| `playSeedBloom(tier)` | 씨앗 개화 | 하프 글리산도 + 맑은 종 1음(등급이 높을수록 음역 위·길이 김) |
| `playSeedGrow()` | 씨앗 등급 오름 | 칼림바 2음 상행, 성장당 1회 |
| `playGardenSun()` | 햇살 | 따뜻한 패드 스웰 0.6s + 높은 칼림바 트릴 |
| `playCanLand()` | 물뿌리개 착지·공개 | 물방울 «퐁» 2겹(피치 하강 사인) |
| 공통 6종 | spin·reelstop·winsmall·winbig·feature·rollup | `GARDEN_RECIPE`로 음색만 바꿈 |

### 9-3. 배경음 (`bgmGarden.ts`)

- 기본: 92 bpm, F 장조, 셔플 8분(통통 튀는 걸음), 칼림바 아르페지오 + 부드러운 피리 선율 + 브러시 셰이커 + 손으로 뜯는 낮은 베이스. 목표 LUFS −30~−32.
- 프리스핀 변주: +2반음(G), 윈드차임 층, 높은 피리 대선율, 셰이커 16분.
- 구별 목표: earshot `ab`로 기존 9곡과 CLAP 코사인 **≤ 0.90**(같은 이벤트 효과음도 ≤ 0.90). 특히 fruit(마림바)·shrine(고토)·candy와 비교 수치를 `docs/SOUND_CHECK.md`에 남긴다. 병합 시 volcano-forge·aurora-ice-palace 프리셋과도 한 번 더 잰다.
- 스템 검사: 클릭(꼬리 10ms)·클리핑 0, true peak ≤ −1 dBTP, 30초 장면 믹스(BGM 40%).
- **수치는 참고값이고 최종 귀 판정은 사용자 몫**이라고 SOUND_CHECK에 적는다.

---

## 10. 전환 클립 2편 (`docs/TRANSITION_DESIGN.md` 규칙)

예산: 2편 + 재시도 1편 = 최대 3편($2.79). 스크립트 `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`(없으면 candy와 같은 방식으로 t2v 변형 생성), 키는 `--env-file`로만. 13초 9:16 발주 → 3.0초 컷 → 16fps/q60/360×640/`loop 1` webp → `check:clips`.

### 10-1. 진입 — 덩굴이 자라 덮는다

> 싱그러운 덩굴이 화면 아래와 양옆에서 뻗어 올라와 잎을 펼치며 빽빽해지고, **자라는 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 잎이 계속 흔들리고 펼쳐진다.

- 왜 이 팩인가: 게임의 동사가 «자란다»다. 전환이 곧 규칙 예고다. 잎은 겹치면 구조적으로 불투명하고(R1), 계속 펼쳐져 단색 정지가 안 된다(R11).
- 규칙: R1·R2(3초 사이클 ×4)·R3(본문 카메라 고정 문구)·R4(손·사람·글자·동물 금지 — 나비도 빼서 «동물» 금지와 충돌 없게)·R8(자람 = 덮임 한 동작)·R9(주어 «vines» 첫 문단)·R11·R12(stylePrefix 재질·hex, negative의 photorealistic)·R13.

```
Vertical full-screen game transition effect, soft stylized 3D botanical render, porcelain-smooth matte leaves and petals with a gentle inner glow, not glossy, not glass, not photorealistic, premium mobile game art. Lush fresh green vines with round leaves and small pastel flower buds grow up from the bottom edge and in from both sides of the frame in front of a bright glass greenhouse with cream iron frames. One continuous motion repeats: the vines shoot up and spread, branching and unfurling new leaves thicker and thicker, and that same growing motion fills the whole frame until it is completely opaque edge to edge, corner to corner, a dense seamless wall of overlapping leaves and buds, every leaf crisp and in focus, holding fully covered for a beat while the leaves keep rustling, swaying and unfurling so the covered frame is never a flat still color, then the vines pull back down and the greenhouse shows through before they grow again. The vines growing and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Leaf green #6cc08b, mint #cdeee0, cream #fbf7ee, petal pink #f6a6c1, lavender #b9a3e3 and butter yellow #ffd66b accents, soft top-left window light. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the plants move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

### 10-2. 복귀 — 봉오리가 한꺼번에 피며 걷힌다

> 잎 벽에 박힌 봉오리가 **한꺼번에 피어나고, 그 개화의 힘으로** 꽃잎과 잎이 위로 날려 흩어지며 맑은 온실이 드러난다.

- 왜 이 팩인가: 라운드 동안 키운 씨앗이 «핀다». 끝을 개화 한 번으로 읽힌다. 진입이 «뻗어 덮음»이니 복귀는 «피어 걷힘»(R6, 역재생 아님).
- candy 2차 재발주의 교훈(R14 후보): 드러나는 장면을 길게 묘사하면 처음부터 깔린다 → «a calm clear pastel greenhouse scene» 한 마디만 쓴다. 첫 문장에 «사이클 시작엔 하늘·배경이 없다»를 둔다.
- 덮인 채 시작하므로 `opaqueMs: 0` 후보.

```
Vertical full-screen game transition effect, soft stylized 3D botanical render, porcelain-smooth matte leaves and petals with a gentle inner glow, not glossy, not glass, not photorealistic, premium mobile game art. A dense wall of overlapping green leaves dotted with closed pastel flower buds fills the whole frame completely, edge to edge, corner to corner, with nothing behind it visible at the start of each cycle. One continuous motion repeats: every bud bursts open into a big soft pink, lavender and butter-yellow bloom at the same moment, and that same blooming burst sends a storm of petals and loose leaves swirling up and away off the top and sides of the frame, revealing a calm clear pastel greenhouse scene, then fresh vines and buds grow back in and cover the whole frame corner to corner in complete opacity for a beat while the leaves keep rustling, before the buds burst again. The buds blooming and the petals blowing away are one single motion, never separate steps. While the frame is covered the leaves keep moving, never a flat still color. Each full cycle lasts about three seconds and repeats about four times across the clip. Leaf green #6cc08b, mint #cdeee0, cream #fbf7ee, petal pink #f6a6c1, lavender #b9a3e3 and butter yellow #ffd66b accents, soft top-left window light. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the plants and petals move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

- 재시도 1편은 실패한 쪽에만 쓴다. 진입이 덮지 못하면 «extreme close-up wall of leaves»를, 복귀가 처음부터 배경을 깔면 드러나는 장면 문구를 더 줄인다.
- 채택 기록(소스·컷 구간·스왑 오프셋·용량)을 TRANSITION_DESIGN에 `2-9. greenhouse-garden` 절로 추가하고, 소스 mp4는 `D:/park/tgslot-wt/_qa/`에 보존한다(candy처럼 재편집 불능 사고 방지).

---

## 11. 도움말 페이지

탭 순서와 그림. 모든 격자 그림은 CSS `aspect-ratio: 1`인 정사각 칸으로 그린다(페이라인 그림 찌그러짐 재발 방지). 심볼은 실제 아이콘(@128).

| 탭 | 내용 |
|---|---|
| 1 꽃 모으기 | 4×4 그림 2장: 「같은 꽃 5송이가 상하좌우로 이어지면 터져요」(L자 5칸 빛남), 「나비는 어떤 꽃도 대신해요」. 터지면 위에서 새 꽃이 떨어진다는 3컷 그림. 배당 기준 «총 베팅액» |
| 2 정원이 자라요 | 4×4 → 5×5 → 6×6 → 7×7 → 8×8 그림 한 줄(새 겹 칸만 연두 테두리), 칸 아래 «터진 칸 10 / 22 / 36 / 52». 「덮인 화분에는 착지할 때 이미 꽃이 들어 있어요」 「스핀이 끝나면 4×4로 돌아가요」 |
| 3 씨앗 화분 | 등급 5칸 그림(새싹 ×2 → 봉오리 ×3 → 꽃 ×5 → 큰 꽃 ×10 → 황금 꽃 ×20). 「새로 열린 화분에서 씨앗이 나와요」 「정원이 자랄 때마다 남은 씨앗이 한 단계 자라요」 「씨앗 칸이 낀 클러스터는 씨앗 값만큼 곱해져요(여러 개면 더해요, 최대 ×100)」 |
| 4 정원 프리스핀 | 물뿌리개 3/4/5개 → 8/10/12스핀 표. 「정원 크기·씨앗이 스핀 사이에 남아요」 「8×8에서 터진 칸 40개마다 햇살(한 스핀 최대 1번): 씨앗이 자라고 새 씨앗 2개」(숫자는 math.json `sunEvery`에서 읽는다) 「물뿌리개 3개 다시 → +4스핀(최대 2번)」 「최저 보장: 총 베팅의 10배」 |
| 5 배당표 | §2-4 표를 심볼 아이콘으로. 물뿌리개 지급 표. 「최대 당첨 총 베팅의 5,000배」 |
| 6 공정성 | 기존 공통 탭 |

i18n: `garden.help.*`, `garden.meter.*`, `garden.ribbon`, `garden.round.*`, `garden.win.seed`, `garden.win.grow`를 ko/en 사전 끝에 덧붙인다. 용어: 성장 막대(Growth bar), 씨앗 화분(Seed pot), 햇살(Sunshine), 정원 프리스핀(Garden Free Spins), 최저 보장(Minimum win).

---

## 12. 기능별 QA 확인표 (기능마다 한 번씩, 시간 경과 QA 없음)

디버그 프리셋으로 상황을 만든 뒤 390×844·430×932(DPR 2) 헤드리스 크롬으로 찍고 PNG를 직접 연다.

| 기능 | 확인 (프리셋) | 통과 기준 |
|---|---|---|
| 엔진 클러스터 | 손 격자 8개(L·T자, 나비 다리, 4칸 미지급, 물뿌리개 막힘, 나비만 그룹) | 단위 테스트 |
| 엔진 중력 | 활성 범위 밖 칸 불변, 리필 포인터 순환 | 손 격자 3개 + `foldGarden === finalGrid` 실스핀 2,000회 |
| 엔진 성장 | 문턱 정확·한 단계 한 겹·성장 전용 단계·8×8에서 멈춤 | 테스트 |
| 엔진 씨앗 | 등급 오름 순서(새 씨앗 제외)·합 상한·와일드 칸 배정 규칙·16개 상한 | 테스트 |
| RNG 호출 수 | §4-1 표 | 테스트 |
| 골든 | live 10종 해시 | 동일 |
| 클러스터 연출 | `win` | 빛남 → 정적 → 팝, 선 없음, 사선 광택 없음 |
| 연쇄 | `cascade3` | 낙하가 위치 트윈, 마지막 판 = `finalGrid` |
| 성장 | `gardenGrow` | 카메라 물러남, 덮개가 새 겹에서만 열림, 막대가 다음 문턱으로 |
| 8×8 | `gardenGrow8` | 390px 셀 ≥ 45px, 심볼 9종 구분, 씨앗 배지 숫자 판독 |
| 씨앗 | `seedBloom` | 배지 등급이 서버 `seeds`와 같음, WinStrip `씨앗 ×N`, 금액 = 기본 × 씨앗 합 |
| 기대감 | 물뿌리개 2개 상태의 `gardenGrow` 2건(세 번째 나옴 / 안 나옴) | 두 경우 공개 지연이 같다(판 상태만 조건), 덮인 화분 속 물뿌리개로는 착지 감속 안 함, turbo·모션 축소에선 꺼짐 |
| 프리스핀 진입 | `freeSpins` | 진입 클립 → 판 크기 유지(최소 5×5) → `정원 프리스핀 1/N` |
| 프리스핀 진행 | 프리스핀 중 `gardenGrow` | 막대·씨앗이 다음 스핀으로 이어짐 |
| 햇살 | `gardenSun` | 씨앗 전부 +1등급, 새 씨앗 2개, 라운드 밖에서는 버튼 비활성 |
| 리트리거 | 프리스핀 중 `freeSpins` | +4, 2회 뒤에는 추가 없음, `bonus.strips`가 있으면 프리스핀 착지가 그 스트립에서 나옴(시드 공개 재생 일치) |
| 종료 | 마지막 스핀 | 종료 클립 → 4×4 복귀 → 팝업 값 = 서버 `freeSpinsSummary.garden` |
| 최저 보장 | 프리스핀 저지급 시드 | 마지막 스핀에 `gardenTopUp`, 팝업 `최저 보장 적용` |
| 상태 복원 | 프리스핀 도중 새로고침 | 크기·씨앗·막대·남은 스핀 동일 |
| 멱등·공개 | 같은 키 재전송, 시드 공개 | 바이트 동일·원장 1건, 재생 `totalWin`·단계 일치 |
| 체험판 | `build:demo` 후 기본 스핀·`freeSpins` 흐름 | 서버 없이 동작 |
| 당첨 체감 | 베팅 미만 당첨 | 0.6초 숫자만, 축하음 없음. 빅윈은 정산 뒤 1회 |
| STOP | 회전 중·단계 중 | 압축 ≤ 1.2s(성장 포함), 금액 동일, 제자리 교체 0(CDP 스크린캐스트) |
| 시간 예산 | `gardenGrow8` normal·quick·turbo | §7-3 게이트 |
| 메모리 | 50스핀 + 프리스핀 1회 | 텍스처·스프라이트 수 복귀, `bgFreeSpins` 해제 |
| 도움말 | 6탭 | math.json 값과 일치, 칸 정사각, 390px 잘림 없음, ko/en |
| 사운드 | 팝 1→5 음 상승, 덮개 묶음, 개화 등급별 | earshot 수치 기록 + 사용자 귀 판정 1회 |
| 배경음 | 기본·프리스핀 변주·커튼 덕킹 | 기존 9곡과 CLAP ≤ 0.90 |
| 로비 | 카드 문구 | «자라는 정원 · 씨앗 배율» |
| 회귀 | live 10종 스핀·피처 | 정상 |

---

## 13. 위험과 대안

| # | 위험 | 대안 |
|---|---|---|
| K1 | (검수 시뮬로 방향이 바뀜) 4×4에서 5송이 적중률은 평균 묶음 1.5에서 이미 33~35%다. 위험은 반대쪽 — 묶음이 길면 적중률 50%+·성장 눈덩이·물뿌리개 누적으로 진입률이 1/20대까지 뛴다 | 묶음 평균 1.5에서 시작해 적중률을 먼저 맞추고(§5-2 1단계), 묶음을 늘리는 쪽 조정은 성장률·진입률을 같이 다시 잰다. `minClusterBySize` 같은 새 필드는 만들지 않는다 |
| K2 | 프리스핀 8×8에서 연쇄가 너무 길어 16단계 도달이 잦다(시뮬: 8×8 평균 2.5단계, 16단계 도달 0.01% 안팎이라 낮음) | `bonus.strips`(처음부터 스키마에 있음)로 심볼 분산을 늘린다 |
| K3 | 45px에서 심볼·씨앗 숫자가 안 읽힌다 | 스티커 외곽선 두께 상향, 씨앗 등급을 화분 테두리 색으로도 표시(숫자 없이 등급 식별), 배지 글꼴 최소 11px 굵게 + 어두운 외곽 |
| K4 | 카메라 확대에서 텍스처가 흐리거나 프레임이 떨어진다 | 원본 256px(최대 200 물리 px), 밉맵, 카메라 트윈 중 입자 수 상한 절반 |
| K5 | 보너스 분산이 커서 감사 n*가 1억을 크게 넘는다 | §5-4 꼬리 깎기(×20 빈도·씨앗 합 상한 ×50) |
| K6 | 씨앗·햇살·최저 보장이 한 팀 범위를 넘는다 | 잘라낼 순서: 햇살의 «새 씨앗 심기» → 햇살 전체(프리스핀 씨앗 표로 대체) → 최저 보장. 핵심(성장·씨앗 자람)은 유지 |
| K7 | 공용 파일 병렬 수정 충돌(스키마 유니온, `spin.ts` 분기, i18n, GameScreen, audio 프리셋, 당첨 연출) | 새 파일 위주, 공용 파일은 끝에 추가·분기 한 줄. 병합 순서표를 리드에게 남긴다 |
| K8 | `pixiRenderer.ts`(2,772줄) 수정이 다른 팩을 깬다 | 위임 훅만 추가, 정원 로직은 `gardenFx.ts`. live layout 고정값 테스트 유지 |
| K9 | 응답 크기 16KB 초과 | refill 릴별 배열, 승리 positions를 칸 번호 배열로 압축하는 선택 직렬화 |
| K10 | 프레임 창 감지가 창 안 흰 칠에 속는다 | 알파 실측 기준, ±1% 검수 |
| K11 | Codex 한도 소진 | 심볼 9 → 프레임·bg → 씨앗 5 → 시트 순으로 생성, 소진 시 멈추고 남은 목록 보고(SDXL 대체 금지) |
| K12 | 클립이 덮지 못한다(candy exit 사례) | 재시도 1편, 그래도 실패면 불투명 DOM 오버레이 근거로 `opaqueMs: 0` 채택 판단(candy 2차 근거와 같음) |
| K13 | 성장이 «베팅 미만 당첨인데 화려한» LDW가 된다 | 성장·덮개 연출은 소리·빛을 금액과 무관한 중립 톤으로, 축하음은 실제 금액 등급에만 |
| K14 | 다른 신작과 겹침 | 배율이 칸 안(씨앗)에만, 격자 밖 레일 없음, 다이아몬드 격자 아님, 테마 식물(불·얼음 아님). volcano-forge(6×5 위치 무관 지불 + 판 밖 화로 줄)는 대조 완료 — 인접 개념·판 성장 모두 없다. aurora-ice-palace 기획서는 검수 시점에 없어 병합 전 대조 |
| K15 | «칸에 붙는 배율이 프리스핀 동안 남는다»는 장르 메커닉이 상용 «배율 칸»류(터질 때마다 그 자리 배율이 ×2→×4→×8로 두 배씩 오르고 칸 테두리가 빛나는 연출)를 닮아 보인다 | 장르 메커닉은 허용이지만 겉모습은 피한다: 씨앗은 **터짐이 아니라 판 성장·햇살로** 자라고, 값은 두 배수열이 아닌 2·3·5·10·20, 여러 개면 **더하고**, 쓰이면 **사라진다**. 칸 테두리 강조나 «×2→×4» 숫자 판은 쓰지 않고 새싹→봉오리→꽃 그림으로 등급을 보인다 |

### 팀 레인과 일정 (코어·연출·아트·사운드 각 1명 + 팀장)

| 날 | 코어(엔진·API·감사) | 연출(렌더러·허브) | 아트 | 사운드 |
|---|---|---|---|---|
| D0 | 계약 커밋: 타입·스키마·피처·프리셋 모양, `applyGardenStep`·`foldGarden` (팀장 검토) | 픽스처 응답으로 순수 계획 `garden.ts` | 스타일 락(심볼 2장) | 레시피 초안 |
| D1 | `garden.ts` 루프·씨앗·테스트, 골든 | 카메라·덮개·배지 `gardenFx.ts` | 심볼 9 | 효과음 8종 |
| D2 | 프리스핀·햇살·최저 보장, shared·API·디버그 | 막대·목표 띠·WinStrip·도움말 | 프레임·bg 2·덮개·씨앗 5 | BGM 2변주 |
| D3 | `gardenStats`·파일럿·튜닝 1~5 | STOP·시간 예산·진입/종료·팝업·복원 | 시트 2·썸네일·클립 2(+1) | earshot 비교·SOUND_CHECK |
| D4 | 튜닝 6~7·정식 감사(4샤드) | 통합 e2e 390/430·메모리 | contact 검수·`pack:check` | 연결·덕킹 |
| D5 | 여유분 → QA 확인표 → QA_LOG → 리드 커밋 | | | |

임계 경로: **계약 → `garden.ts` → 프리스핀 → `gardenStats` → 튜닝 → 정식 감사.**

---

## 14. 검수 반영 (2026-11-27, 기획서 비평가)

판정: **고쳐서 진행(revised).** 형태·재미 장치(«자라는 씨앗»)·서버 권위 경로·골든 불변 설계는 그대로 둔다. 바꾼 것은 수치 가정이 틀렸던 곳, 보너스 뒤쪽이 지루해질 구조, 공용 파일 수정 면적이다.

### 14-1. 근거 — 거친 시뮬

배당 없이 판 동작만 흉내 낸 스크립트(`D:/park/tgslot-wt/_qa/new-b-critic/sim.mjs`, 저장소 밖, 30만 스핀, mulberry32)로 이 기획서의 규칙(8×8 창·활성 범위 중력·리필 포인터·문턱 `[10,22,36,52]`·5송이·나비 통과·물뿌리개 막힘·16단계)을 돌렸다. 스트립은 §2-4 비율 ×2(240칸), 묶음 평균 1.5.

| 지표 | 기획서 가정 | 시뮬 |
|---|---|---|
| 기본 적중률 | 30% | 33~35% (묶음 2.5면 53%) |
| 성장 5×5 / 6×6 / 7×7 / 8×8 | 9 / 3 / 0.9 / 0.25% | 9.4 / 1.4 / 0.35 / 0.08~0.11% |
| 진입률(물뿌리개 밀도) | 2.0~2.4% → 1/185 | 1.25% → 1/555, 1.67% → 1/260 (연쇄 누적 때문에 정적 계산보다 높다) |
| 8×8 스핀당 리트리거 | 17% (정적) | 1.25% → 11%, 1.67% → 20% (밀도 2%면 더 높음) |
| 8×8 한 스핀 터진 칸 | — | 평균 약 29, 16단계 도달 ≈ 0.01% |
| 보너스 8×8 첫 도달(10스핀) | — | 평균 6~7번째, 8×8 스핀 비율 36~60%(묶음에 민감, 묶음 2.5면 3번째·82%) |
| 기본 씨앗 몫 | 5.5%p | 기본 클러스터의 5.4~6.3% ≈ 3.2~3.7%p |

### 14-2. 바꾼 것과 이유

| # | 바꾼 곳 | 무엇을 | 왜 |
|---|---|---|---|
| R1 | §3-3·§3-4·§6-3·§11·A-3·§1 | 햇살 `sunEvery 16 → 40`, `maxSunsPerSpin 3 → 1`, 상한에 걸린 심기도 RNG 2회 고정 | 8×8 한 스핀 평균 29칸이라 초안이면 스핀마다 거의 2회 → 4회 만에 모든 씨앗이 ×20에 붙어 «다음 성장에 씨앗이 커질까» 긴장이 사라지고 꼬리만 커진다(재미·σ 둘 다). ×20 비율 ≤ 30% 게이트 추가 |
| R2 | §3-3·§5-1·§5-2·§5-3·§6-3 | 선택 필드 `bonus.thresholds`·`bonus.strips` 추가, 8×8 첫 도달 45~75% 지점·8×8 스핀 비율 ≤ 50% 게이트 | 보너스에서 판이 앞쪽에 다 자라 버리면 뒤쪽 6~14스핀이 같은 8×8의 반복이다(«지루한 반복»). 그리고 기본 게임과 같은 배당표·스트립 하나로는 보너스 몫을 **줄이는** 손잡이가 없다(씨앗 표·햇살은 올리기만 한다). 둘 다 배열 하나라 엔진 비용이 작다 |
| R3 | §3-3·§3-4·§5-3·§12 | 리트리거 `r` 근거를 정적 0.17에서 «하드 캡 + 감사 실측 ≤ 10%»로, 평균 길이 10~12 게이트 | 물뿌리개는 터지지 않아 리필로 쌓인다. 정적 확률로 `r < 1`을 주장할 수 없고, 그대로면 거의 모든 보너스가 최대 리트리거(20스핀)로 늘어 평균 지급·σ가 틀어진다 |
| R4 | §2-2·§6-3·§5-3 | 스트립 ≥ 120 → ≥ 136(`8 + maxCascades × 8`) 스키마 검사, 감사 «겹침 0건» 항목 삭제 | 리필이 창 내용과 겹치지 않음을 계측이 아니라 구조로 보장한다(provably fair 재생에서 «숨은 화분 내용»이 리필과 같은 칸을 읽는 경우 자체를 없앤다) |
| R5 | §2-4·§5-2·K1 | 스트립 묶음 평균 1.5로 시작, 물뿌리개 누적 설명, K1 방향 반대로 | 적중률이 모자랄 위험(K1 원안)은 없고, 묶음이 길면 적중률·성장·진입률이 한꺼번에 폭주한다 |
| R6 | §5-1·§5-2·O11 | 성장률 목표를 범위로(6×6 2~3% 등), 뒤 문턱부터 낮춰 시작하는 대안 `[10,20,32,46]`, `gardenGrow8`·`gardenSun` 탐색 상한 20,000 | 기본 8×8은 약 1/1,000이라 기본 탐색 5,000회로는 프리셋이 가끔 실패한다 |
| R7 | §5-2 6단계 | 기본 씨앗 몫이 3.5 근처에서 멈추면 목표를 3.5로 내리고 기본 클러스터 60.0으로 | 씨앗 등장률을 20%+로 올려 억지로 맞추면 화면이 씨앗투성이가 되어 씨앗의 특별함이 사라진다 |
| R8 | §5-4 | 보너스 표준편차 70×는 낙관, σ̂ > 10이면 즉시 꼬리 깎기, `auditSpins` 상한 1.2억 | 씨앗 합 ×100 × 8×8 큰 클러스터 꼬리. n*가 1.6억까지 커질 수 있어 4샤드 시간 예산을 넘기지 않게 기준을 미리 정한다 |
| R9 | A-3·§6-2·§12 | 성장 공개 기대감 조건을 «물뿌리개 2개가 보이는 판 상태»로 못 박고, 세 번째가 나오든 안 나오든 같은 지연. 덮인 화분 속 물뿌리개로 착지 감속 금지 | 원문 «실제 결과일 때만 길어진다»는 «나올 때만 길어진다»로 읽혀 지연 자체가 결과를 미리 알려 준다. 기대감은 보이는 상태만 조건이어야 정직하다(AUDIT B5) |
| R10 | §7-3 | 시간 예산에 개화 +240(1·2단계만)·기대감 +300·햇살 1회 반영, 게이트 normal 8.2s / 프리스핀 8.9s | 원안 7.2s에는 개화·기대감·햇살이 빠져 있어 실제 최악이 게이트를 넘는다 |
| R11 | §6-2·§8-2 | theme-gen `overlay` kind 추가와 game-sdk `theme.garden` 블록 삭제 → 기존 `kind: "thumb"` 투명 + `theme.props`(kraken 코인 선례) | 공용 도구·스키마 수정 2건을 0건으로. 다른 팀과 병합 충돌 면적을 줄이고 범위를 한 팀 몫으로 맞춘다 |
| R12 | §7-5 | 활성 n×n + 1겹만 그리기, 릴 마스크는 카메라 밖 화면 좌표 | 물리 8×8을 늘 다 그리면 4×4 화면에서도 64칸 + 덮개를 그린다. 마스크가 카메라 안에 있으면 배율에 따라 창 밖 칸이 새어 보인다 |
| R13 | §2-4 | 물뿌리개 지급은 기존 `scatter.pays`(freeSpins 없이)에 두고 개수는 스핀 끝 활성 범위에서 센다고 명시 | 원문에 지급표 위치가 없어 기존 스캐터 경로(8×8 전체를 세는)와 섞일 여지가 있었다 |
| R14 | §3-3·§4-1 | 프리스핀 시작 때 4×4 → 5×5는 범위만 올리고 씨앗 추첨 0회 | RNG 소비 계약에 빠져 있던 경우. 재생·시드 공개가 어긋나지 않게 고정 |
| R15 | K14·K15 | volcano-forge 대조 결과 기록, 상용 «배율 칸»류와 겉모습 구분 규칙 | 장르 메커닉(칸에 남는 배율)은 허용이지만 «×2→×4 두 배 칸 + 테두리 강조» 연출은 피해야 복제로 안 보인다 |

### 14-3. 바꾸지 않은 것 (검토 후 유지)

- 재미 장치 «자라는 씨앗»: 성장 순간마다 화면 숫자가 실제로 오르고, «씨앗이 쓰이기 전에 한 번 더 자라라»가 결과를 바꾼다. 입력이 없어 서버 권위와 충돌하지 않는다.
- 유료 스핀 사이 이월 없음(기본 게임에 `nextState` 자체가 없음), `garden` 피처 하나에 싣는 저장·멱등·시드 공개 경로, `resolveSpin` 맨 앞 분기 한 줄로 레거시 골든 불변.
- 430px 판독: 8×8 @390 셀 약 45~47px, 씨앗 숫자 배지는 코드 드로잉 + 등급 그림 이중 표시. 세로 합계 684/740px로 여유 있음.
- 사용자 취향: 선 그리기·사선 광택 없음, 당첨 금액 컨트롤 위, 히트 → 정적 → 팝, 빈칸 심볼 없음(덮인 화분은 판 밖 칸), 쉬운 용어(성장 막대·씨앗 화분·햇살·최저 보장), 한국어 기본 + 영어 사전. 목표 띠 상시 표시는 kraken 선례(AUDIT A7)라 «규칙은 도움말로»와 충돌하지 않는다(규칙 설명이 아니라 목표 한 줄).
- 범위: 4레인 + 팀장 D0~D5는 빠듯하지만 가능. 넘치면 K6 순서(햇살 심기 → 햇살 → 최저 보장)로 자른다.

---

## 구현 계약 (코어 레인 완료, 2026-11-27)

엔진·수학·공용 계약·API·감사·체험판 응답까지 구현했다. 화면(렌더러·허브 UI)·아트·사운드는 이 절만 보고 붙이면 된다. 기획서와 달라진 값은 C-7에 모았다.

### C-1. 엔진 (`packages/slot-engine`)

| 파일 | 내용 |
|---|---|
| `src/gardenTypes.ts` (새) | `GardenBounds`·`GardenSeed`·`GardenGrow`·`GardenStep`·`GardenSun`·`GardenRoundStats`·`GardenCarry`·`GardenTrigger`·`GardenTopUpTrigger` |
| `src/gardenSchema.ts` (새) | `GrowBoardSchema`·`GardenSeedEntrySchema`·`checkGrowBoard`·`gardenMinStripLength`·`gardenMaxSpins` |
| `src/garden.ts` (새) | 순수: `gardenBoundsFor(stage)`·`gardenStageForSize`·`gardenNewCells(from, to)`·`inGardenBounds`·`applyGardenStep(grid, bounds, step)`·`foldGarden(grid, start, steps, startSeeds, maxTier)`·`gardenScatterPositions`·`buildGardenGrid`·`gardenSpinsFor`·`gardenBonusThresholds`. RNG를 쓰는 것: `runGarden`·`applyGardenSun`·`resolveGardenSpin` |
| `src/schema.ts` | `growBoard: GrowBoardSchema.optional()` 1필드, superRefine 끝 `checkGrowBoard` 1줄, «cluster면 cascade 필수»를 `growBoard`면 면제(조건 1곳) |
| `src/spin.ts` | `resolveSpin` 맨 앞 `if (math.growBoard) return resolveGardenSpin(...)` 1줄 → live 골든 해시 동일 |
| `src/types.ts` | `WinLine.seed?`, `RoundCarry.garden?`, `FeatureTrigger` 유니온 끝 `GardenTrigger | GardenTopUpTrigger` |
| 테스트 | `garden.test.ts`(21) · `gardenSchema.test.ts`(6). `analytic.ts`는 고치지 않았다(`payModel: 'cluster'`라 이미 몬테카를로 전용) |

**활성 범위 표** stage 0..4 = `{x:2,y:2,size:4}` `{2,1,5}` `{1,1,6}` `{1,0,7}` `{0,0,8}`. 좌표는 늘 물리 8×8 절대 좌표 `[reel, row]`.

**RNG 소비 계약** (`seed:nonce` + `stateBefore`로 라운드 전체 재생)

```
① 릴 정지 8회     nextInt(math.strips[reel].length), 열 0→7
                  (프리스핀도 기본 스트립 길이로 뽑고 창은 bonus.strips에서 읽는다 — 스키마가 길이 같음을 강제)
② 단계 루프       평가·씨앗 배정·팝·중력·리필 0회
                  성장마다 새 칸마다 씨앗 추첨 1회(행 오름차순, 같은 행은 열 오름차순, pickWeighted, 16개 상한에 걸려도 호출)
③ 물뿌리개 판정 0회
④ [프리스핀] 햇살마다 심기 sunPlant(2)회: 씨앗 없는 활성 칸 목록(행·열 오름차순)에서 nextInt(남은 수)
⑤ [API] 잭팟 1회  (항상 마지막)
```

호출 수 = `8 + Σ 성장 새 칸(9·11·13·15) + 2 × 햇살` (테스트 고정). 프리스핀 시작 때 5×5로 올리는 것은 0회.

**한 단계** = 평가(활성 n×n, `evaluateClusters`를 n×n 모델로 호출) → 씨앗 배정(씨앗 칸이 낀 클러스터 중 기본 배수 최대, 같으면 앞선 쪽) → 금액 `round(배수 × 총베팅 × min(씨앗 합, 100))` → 팝(쓰인 씨앗 사라짐) → 활성 범위 안 중력 → 리필 → 문턱을 넘었으면 성장(기존 씨앗 +1등급 → 새 칸 공개 → 씨앗 추첨). 당첨이 없어도 문턱이 남으면 «성장 전용 단계»(`wins/removed/refill/bloomed`가 빈 배열). 팝 단계 16회 뒤 남은 클러스터는 미지급(`hitMaxCascades`). 캡에 닿은 단계는 잘라 마지막으로 삼고 성장하지 않는다.

### C-2. 응답 계약 (`packages/shared` → `SpinResponse`, 새 파일 `src/garden.ts`)

- `grid` = 착지한 **8×8 창 전체**(덮인 화분 내용 포함). 최상위 `cascades`·`finalGrid`는 **없다** — 정원 결과는 전부 `garden` 피처 안.
- `wins` = 모든 단계 당첨을 단계 순서로 펼친 것(절대 좌표, `cascade` = 단계 인덱스, 씨앗이 붙으면 `seed` = 적용 배율).
- `totalWin = Σ wins.win + scatterWin 피처의 win + gardenTopUp.amount`.
- `features[]` 순서: `garden`(매 스핀) → (`scatterWin`) → (`freeSpins` 진입·리트리거) → (`gardenTopUp`) → (`winCapped`).

| `garden` 필드 | 뜻 |
|---|---|
| `start` / `final` | 이 스핀 시작·끝 활성 범위 `{x, y, size}` |
| `startSeeds` / `startPopped` | 시작 씨앗·성장 막대(유료 스핀은 `[]`·0) |
| `steps[]` | `{ index, wins, removed, refill, bloomed, grow?, popped, stepWin }`. `refill[c]`는 그 단계 시작 범위의 활성 열 `x + c`에 위→아래로 떨어지는 심볼(성장 전용 단계는 `[]`). `bloomed` = 이 단계에 쓰인 씨앗 자리. `popped` = 이 단계 뒤 막대 값 |
| `steps[].grow` | `{ from, to, cells(새 칸, RNG 순서), seeds(새 씨앗), grown(등급 오른 기존 씨앗 수) }` |
| `finalGrid` | 단계가 끝난 8×8. `foldGarden(grid, start, steps, startSeeds, seedTiers.length - 1)`의 `grid`와 같고 `bounds = final` |
| `seeds` | 단계·햇살이 다 끝난 뒤 씨앗 `{reel, row, tier}`(행·열 오름차순, `tier` = `seedTiers` 인덱스) |
| `sun?[]` | 프리스핀 8×8 햇살(스핀당 최대 1). `{ grown, planted, seeds(이 햇살 뒤 전부) }`. 햇살 전 씨앗 = `foldGarden(...).seeds` |
| `round?` | **프리스핀만**. 이 스핀까지 반영한 라운드 집계 `{ maxSize, bestSeed(값, 없으면 0), bestSpinWin, freeWin, topUp }` |
| `capped` / `hitMaxCascades` | 라운드 상한에 잘림 / 팝 단계 상한 도달 |

- `gardenTopUp { amount }` — 마지막 프리스핀의 최저 보장 코인(프리스핀 합이 `minRoundPay × 총베팅`이 되게).
- `freeSpinsSummary.garden?` = `{ maxSize, bestSeed, bestSpinWin, topUp }` — 마지막 스핀 `garden.round`에서 옮긴 값(결과 팝업 4행).
- 키 순서는 shared 스키마 순서와 같다(엔진 객체 · API 응답 · `SpinResponseSchema.parse` 결과가 바이트로 같다).

### C-3. 상태·복원·재전송·시드 공개

| 항목 | 방식 |
|---|---|
| 이월 | 진입 스핀 `nextState.carry.garden` = `{ stage, popped, seeds, retriggers, suns, roundWin, freeWin, maxStage, bestTier, bestSpinWin }` → `FreeSpinsState.carry.garden`(`game_states.state` jsonb, 새 컬럼·마이그레이션 없음). 진입 `stage = max(마지막 단계, minStartSize 단계)`, `popped = bonusThresholds[stage - 1]` |
| 새로고침 | `GET /games/:id/state`의 `freeSpins.carry.garden`으로 크기(`4 + stage`)·씨앗·막대·남은 스핀 복원 |
| 멱등 재전송 | 저장된 `rounds.features`로 조립, 엔진 재실행 없음 → 바이트 동일(테스트·개발 스택 확인) |
| 시드 공개 | `RoundSeedResponse.stateBefore`(carry.garden 포함) + `spin(math, {totalBet}, createSeededRng(seedInput), stateBefore)` → `totalWin`·`garden.steps` 일치, 잭팟 판정이 마지막 1회(테스트) |
| 유료 스핀 | 매번 4×4·씨앗 없음·막대 0. 진입이 아니면 `nextState`가 없다(구조적으로 이월 불가) |
| 체험판 | 같은 `createApp` + `MemoryRepos`. hidden이라 로비에 안 뜬다 — 임시 live 빌드로 확인(자연 진입 1회·프리스핀 끝까지·새로고침 뒤 기록 유지) |

### C-4. 디버그 프리셋 (`SpinDebugPreset` 끝에 추가, 정원 팩이 아니면 409)

| 이름 | 조건 | 비고 |
|---|---|---|
| `gardenGrow` | 성장 1회 이상 | 8×8 프리스핀 중에는 맞출 수 없다(409) |
| `gardenGrow8` | 이번 스핀에 8×8 도달 | 서버 내부 탐색 상한 50,000(기본 게임 약 1/440, 실측 수십~수백 회) |
| `seedBloom` | 씨앗 개화 1회 이상 | |
| `gardenSun` | 햇살(프리스핀 중만) | 유료 스핀이면 탐색 없이 409. 8×8 프리스핀에서 쓸 것. 상한 50,000 |
| `gardenBig` | 총 베팅 50배 이상 | 상한 50,000(실측 수천 회, 0.1초 안팎) |
| `gardenTopUp` | 최저 보장(마지막 프리스핀만) | 유료 스핀이면 409. 남은 스핀 1에서 쓸 것 |
| 기존 `win`·`lose` | 성장·개화·햇살 없는 `garden`은 «피처 아님»으로 친다 | |
| 기존 `cascade3` | 당첨 단계 3개 이상 | |
| 기존 `freeSpins` | 정원 프리스핀 진입(프리스핀 중이면 리트리거) | |

허브 `lib/debugPreset.ts`의 `presetsFor`는 정원 팩이면 `freeSpins` + 유료 5종(`cascade3`·`gardenGrow`·`gardenGrow8`·`seedBloom`·`gardenBig`), 라운드 중이면 `gardenSun`·`gardenTopUp`까지 보여 준다. 라벨 키 `gardenDebug*`(ko/en 사전 끝).

### C-5. 렌더러·허브·사운드가 할 일 (코어가 건드리지 않은 것)

- 렌더러 레이아웃은 `math.reels × rows` = 8×8로 셀을 잡는다 → 카메라로 활성 n×n을 채울 것(§O7). `garden` 단계는 엔진 export `applyGardenStep`/`foldGarden`으로 재생하면 서버와 같은 판이 나온다.
- 기대감: 엔진 `featureTriggerCount`는 **바꾸지 않았다**(정원 팩이면 undefined). 렌더러 `anticipation.ts`에 `growBoard.bonus.trigger` + **활성 범위만 세는** 인자를 함께 넣을 것(덮인 화분 속 물뿌리개로 감속하면 안 된다). 렌더러 테스트가 엔진 값과 비교하니 엔진 쪽 같은 줄도 그때 같이.
- 사운드 프리셋 `'garden'`은 `game-sdk/theme.ts SOUND_PRESETS`·renderer `SoundPreset`에 아직 없다.
- 지금 허브는 테마가 없어 «그래픽을 불러올 수 없어요»로 내려가지만 스핀·프리스핀·요약 응답은 정상이다(개발 스택·체험판 확인).
- `pnpm pack:check`의 이 팩 오류 1건은 썸네일(`thumb.webp`) 없음 — 아트 레인 몫.

### C-6. 수치 결과 (정식 감사 5천만 스핀 · 4샤드 · 18/18 통과, `docs/RTP_AUDIT_greenhouse-garden.md`)

| 지표 | 목표 | 결과 |
|---|---|---|
| RTP | 94.5 ± 0.5 | **94.426%** (CI ±0.170%p), 잭팟 포함 95.926% |
| 분해 | 58.0 / 5.5 / 1.0 / 30.0 | 기본 클러스터 58.33 / 씨앗 5.29 / 물뿌리개 1.12 / 프리스핀 29.66(최저 보장 0.63) |
| 적중률 | 약 30 (10~60) | 33.60% |
| 성장 ≥5/6/7/8 | 9 / 2~3 / 0.5~0.9 / 0.12~0.25 | 8.83 / 1.98 / 0.57 / 0.23% |
| 연쇄 | P(지속) ≤ 0.55, 평균 ≤ 2.5 | 0.279, 1.39 |
| 진입 | 1/120~1/250 | 1/177.6 |
| 프리스핀 평균 | 30~80× | 59.3× (중앙값 ≈42.5×, 최대 649×) |
| 길이 | 10~12, 최장 20 | 11.77, 20 |
| 리트리거 | ≤10%/스핀, 최대 리트리거 라운드 ≤15% | 3.5%, 12.0% |
| 8×8 | 첫 도달 45~75% 지점, 스핀 ≤50% | 49.9%, 48.4% |
| ×20 끝 비율 | ≤30% | 7.0% |
| 최저 보장 발동 | — | 21.4% 라운드 |
| 팝 상한(프리스핀) | <0.5% | 0.0007% |
| σ̂ / n* | 7~9 예상 | 6.13 / 43.7M → `auditSpins` 50,000,000 |
| 최악 응답 | ≤16KB | 실스핀 2만 회 최대 < 16KB(테스트), `gardenGrow8` 응답 약 9KB |

### C-7. 기획서와 달라진 값

| 항목 | 기획서 | 구현 | 이유 |
|---|---|---|---|
| 물뿌리개 → 스핀 | 8/10/12 | **10/11/12** | 리트리거를 ≤10%로 누르면 평균 길이 10~12 게이트에 못 닿는다. 최장은 그대로 20 |
| 기본 문턱 | [10,22,36,52] | **[10,19,30,42]** | 6×6 이상을 자주 보이게(§5-1 대안 방향) |
| 프리스핀 문턱 | 없음 | **[13,28,45,64]** | 8×8 첫 도달 지점·8×8 스핀 비율 게이트 |
| 프리스핀 스트립 | 없음 | 물뿌리개 3/240, 같은 꽃 묶음을 떼어 놓음 | 리트리거·프리스핀 몫 조절 |
| 씨앗 표 | 기본 88/9/3, 프리스핀 80/14/6 | **84/11/5**, **82/13/5** | 기본 씨앗 몫 5.3%p(원 목표 5.5 근처), 프리스핀 몫 30% |
| 햇살 `sunEvery` | 40 | **48** | 꼬리·×20 비율 |
| 물뿌리개 지급 | 1/3/10/50 | **1.5/4/12/50** | 물뿌리개 몫 1.0%p |
| 배당표 | §2-4 초안 | 초안 × 2.33 | 기본 클러스터 58% |
| `GardenCarry` | stage·popped·seeds·retriggers·roundWin·maxStage·bestSeed·bestSpinWin | + `suns`·`freeWin`, `bestSeed` → `bestTier`(인덱스) | 햇살 이어 세기·최저 보장·팝업 집계 |
| 결과 팝업 값 | API 집계 | 엔진이 `garden.round`로 계산, API는 옮기기만 | 서버 권위 한 곳 |
| 디버그 | 4종 | + `gardenBig`·`gardenTopUp` | 큰 결과·최저 보장 QA |
| `maxSeeds` 스키마 상한 | 64 | 48 | 햇살 심을 빈 칸이 늘 남게 |

감사·튜닝 도구: `tools/rtp-sim/src/audit/gardenStats.ts`(통계·게이트·리포트 절), `tune-cli` 정원 요약. 튜닝 스크립트·설정은 저장소 밖 `D:/park/tgslot-wt/_qa/new-b-core/gg/`(`gen-math.mts` + `final.json`, `sim.mts`).
