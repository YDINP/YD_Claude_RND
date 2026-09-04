# 게임 카탈로그 — 신작 10종 (#3~#12)

> **구현 메모(2026-09-03, 웨이브 1 엔진 반영)**: 뮤테이션 type은 camelCase(`mystery`/`expandWild`/`upgrade`/`randomWild`). sheriff-sixgun은 확장 와일드가 행별 조건부 분포를 만들어 **monte-carlo**로 산출한다(해석식은 후속). ways 배수 단위는 총베팅/`ways.betDivisor`(기본 25). `upgrade`는 `{from,to,minCount,chance?}`. 검수는 2단계 — CI 게이트(games.test, 40만 스핀): |rtp−target| ≤ max(0.5pp, 3·SE); 정식 검수 리포트(run audit, MC 2천5백만 스핀): |rtp−target| ≤ 0.5pp 이고 ci95 반폭 ≤ 0.2pp.

작성일: 2026-09-03 · 작성자: game-design-director · 상태: 초안(엔진/렌더러/아트 착수 대기)
참조: `TELEGRAM_SLOT_HUB_PLAN.md` §3 §6 §8 · `docs/ART_DIRECTION.md` · `docs/SYMBOL_FX_PLAN.md` · `packages/slot-engine/README.md` · `games/_template/HOWTO.md`

## 0. 전제

| 항목 | 값 |
|---|---|
| 화폐 | 가상 코인 전용, 현금화 없음 (소셜 카지노) |
| RTP | 전 게임 기본 94.5% + 허브 잭팟 1.5% = 체감 96.0% |
| 권위 | 서버 권위. 클라이언트는 이미 받은 결과를 연출만 한다 |
| 아트 상속 | `ART_DIRECTION.md` §2 스타일 가이드를 상속하되, **팔레트 앵커와 무드는 게임별로 이탈 허용**. 심볼은 64px에서 실루엣이 구분되어야 하고 그림자는 굽지 않는다 |
| 프레임 | 버티컬 퍼스트. 릴 창 x 4–96%, y 14–86% (`prompts.json`이 SSOT) |
| 신규 게임 = 데이터 팩 | 코드는 엔진·렌더러에만. 게임은 `manifest.json` + `math.json` + `theme/` + `art/prompts.json` |

**메커닉은 "웨이브당 신규 엔진 프리미티브 2개"로 묶는다.** 게임마다 플레이어가 보는 메커닉은 전부 다르지만, 엔진이 새로 만드는 것은 웨이브당 2개뿐이고 나머지는 그 프리미티브의 파라미터 변형이다. 이것이 10종을 3주 안에 낼 수 있게 하는 유일한 장치다.

| 프리미티브 | 뜻 |
|---|---|
| **P1 `mutations`** | 정지 그리드를 평가 직전에 변형하는 순서 있는 파이프라인. 같은 RNG 스트림에서 재현 |
| **P2 `ways`** | 페이라인 없는 인접 카운트 곱 페이 모델 (243/1024, `bothWays`) |
| **P3 `cascade`** | 당첨 제거 → 리필 → 재평가 + 지속 배수 상태(사다리·오브·미터) |
| **P4 `cluster`** | 직교 인접 flood-fill 그룹 페이 + `pay-anywhere` 변형 |
| **P5 `respin`** | 잠금 셀 리스핀 상태 기계. 코인 값·잭팟 4단·워킹 와일드 공용 |
| **P6 `bonus`** | 서버 권위 인터랙티브 보너스 프레임워크 (`pick-me`, `wheel`) |

## 1. 카탈로그 한눈에

| # | id | 이름 (en / ko) | 스타일 | 그리드 | 페이 | 변동성 | 헤드라인 메커닉 | 프리미티브 | 웨이브 |
|---|---|---|---|---|---|---|---|---|---|
| 3 | `royal-diamond-777` | Royal Diamond 777 / 로열 다이아몬드 777 | 클래식 | 5×3 | 10라인 | 중저 | 미스터리 심볼 일괄 공개 | P1 | 1 |
| 4 | `sheriff-sixgun` | Sheriff's Six-Gun / 보안관의 6연발 | 스타일라이즈드 3D | 5×3 | 20라인 | 중 | 확장 와일드 + 갬블 | P1 | 1 |
| 5 | `shiba-shrine` | Shiba Shrine / 시바 신사 | 큐트 애니멀 | 5×3 | 243 ways | 중 | 랜덤 와일드 드롭 | P2·P1 | 1 |
| 6 | `candy-cluster-pop` | Candy Cluster Pop / 캔디 클러스터 팝 | 캔디 글로스 | 6×5 | 클러스터 5+ | 고 | 클러스터 페이 + 텀블 배수 사다리 | P4·P3 | 2 |
| 7 | `olympus-nectar` | Olympus Nectar / 올림포스의 신주 | 스타일라이즈드 3D | 6×5 | 8+ 아무 위치 | 최고 | 텀블 + 누적 배수 오브 | P3·P4 | 2 |
| 8 | `magi-stella` | Magi Stella / 마기 스텔라 | 애니 셀셰이딩 | 5×4 | 1024 ways | 고 | 프리스핀 스티키 와일드 | P2·P1 | 2 |
| 9 | `kraken-cove` | Kraken Cove / 크라켄 만 | 스타일라이즈드 3D | 5×3 | 20라인 | 고 | 홀드&스핀 코인 + 4단 잭팟 | P5 | 3 |
| 10 | `hanbok-night-market` | Hanbok Night Market / 한복 야시장 | 민화 하이브리드 | 5×3 | 25라인 | 중고 | 휠 보너스 + 심볼 승급 | P6·P1 | 3 |
| 11 | `idol-stage-live` | Idol Stage Live / 아이돌 스테이지 라이브 | 애니 아이돌 | 5×4 | 1024 ways 양방향 | 중고 | 픽미 보너스 + 응원 배수 미터 | P6·P3 | 3 |
| 12 | `mecha-nova` | Mecha Nova / 메카 노바 | 하드서피스 3D | 5×4 | 243 ways | 고 | 워킹 와일드 리스핀 + 바이 피처 | P5·P1 | 3 |

보류 컨셉(v2 후보): 북유럽 신화, 사이버펑크 야경, 이집트. 10종이 이미 스타일 패밀리 6개를 덮으므로 중복을 피해 뺐다.

---

## 2. 게임 명세

### #3 `royal-diamond-777` — Royal Diamond 777 / 로열 다이아몬드 777
> 물음표 타일이 한꺼번에 같은 심볼로 뒤집히는, 브라스 라운지의 정통 후속작.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×3 / 10 페이라인 · 변동성 중저 · 적중률 목표 32% |
| RTP 94.5 구성 | 라인 74.0 + 미스터리 12.5 + 스캐터·프리스핀 8.0 |
| RTP 산출 | **analytic** — 공개 심볼로 조건부화하면 릴 독립이 복원된다 |
| 공수 (엔진/렌더/허브/아트) | 6 / 4 / 2 / 10 h |

**컨셉·아트** — 스타일: 클래식 글로시 3D 토이 렌더(`classic-777` 조형 언어 직계). 팔레트: 네이비 `#0b1220`, 브라스 `#d8a94a`/`#f4d98a`, 다이아 시안 `#8fe3f2`, 벨벳 레드 `#8f1f2e`. 프레임: 아르데코 브라스 베젤, 마퀴에 다이아 컷 각인, 사이드 레일에 작은 시안 젬 3개.
심볼(10): `wild` `mystery` `scatter` `seven` `diamond` `bar3` `bar2` `bar1` `bell` `cherry`

**메커닉** — 트리거: 릴 스트립 50칸 중 `mystery` 3칸, `P(화면에 1개 이상) ≈ 0.60`. 상태: `STOP → MYSTERY_SCAN → REVEAL(가중 1회 추첨, 화면 전 미스터리 칸을 같은 심볼로) → EVALUATE`, 캐리 상태 없음. 수학: `revealWeights`만이 손잡이다. 고배당 가중을 올리면 분산이 오르고 RTP도 같이 오른다. 엣지: 공개 풀에서 `wild`·`scatter` 제외(공개 후 스캐터 트리거 금지) · 칸마다 따로 뽑지 않고 **스핀당 1회 추첨**(따로 뽑으면 상관이 사라져 해석식이 깨진다) · `revealWeights` 심볼은 전부 페이테이블에 존재. `RoundState`: 추가 없음. 공개 좌표는 `SpinResult.features.mysteryReveal`.

**UX** — 화면: 물음표 타일 그대로 착지 후 전 타일이 동시에 크로스페이드로 리빌(기존 심볼 슬롯 재사용, 신규 레이어 불필요). 배너: `MYSTERY REVEAL` 소형 팝 + 카드 뒤집기 SFX + medium haptic, 이후 기존 승리 FX로 이어짐. 배경: 전환 없음, 리빌 순간 골드 광선 플래시 300ms만.

```json
"mutations": [
  { "type": "mystery", "symbol": "mystery", "scope": "grid",
    "weights": { "seven": 4, "diamond": 6, "bar3": 8, "bell": 14, "cherry": 26 } }
]
```
아트: 심볼 10 + frame + bg + thumb = 13장.

---

### #4 `sheriff-sixgun` — Sheriff's Six-Gun / 보안관의 6연발
> 보안관 배지가 릴을 통째로 덮고, 딴 돈은 카드 한 장에 두 배가 되거나 사라진다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×3 / 20 페이라인 · 변동성 중 · 적중률 목표 30% |
| RTP 94.5 구성 | 라인 68.0 + 확장 와일드 18.5 + 스캐터·프리스핀 8.0 (갬블은 EV 중립, 기여 0) |
| RTP 산출 | **analytic** — 확장 여부가 그 릴 창에만 의존해 릴 독립이 유지된다 |
| 공수 | 8 / 6 / 5 / 10 h |

**컨셉·아트** — 스타일: 스타일라이즈드 3D 웨스턴(먼지 낀 무광 금속 + 가죽). 팔레트: 사막 황토 `#c9884a`, 세이지 `#7e9a72`, 선셋 오렌지 `#e2683a`, 밤하늘 `#1b2437`. 프레임: 목재 살룬 간판 + 철제 리벳, 상단 마퀴에 밧줄 레터링, 하단에 편자 몰딩.
심볼(10): `wild` `scatter` `sheriff` `bandit` `revolver` `dynamite` `horseshoe` `whiskey` `cactus` `boot`

**메커닉** — 트리거: 릴 1·2·3 창에 `wild` 1개 이상이면 그 릴 전체 확장(릴당 `q ≈ 0.12`, 스핀당 확장 `≈ 0.30`). 갬블은 `totalWin > 0`일 때만 제안. 상태: `STOP → EXPAND_SCAN(reel∈{1,2,3}) → EVALUATE → (win>0) GAMBLE_OFFER → GAMBLE_FLIP(×2 | 0) →(≤5회) COLLECT`. 수학: 갬블은 `p=0.5, payout=2×`로 기대값 중립이라 RTP를 바꾸지 않고 분산만 키운다. 엣지: `gambleSteps ≤ 5` **그리고** `win × 2^steps ≤ maxWinCap`, 먼저 걸리는 쪽에서 강제 수령 · 갬블 결과는 서버가 결정하고 라운드 레코드에 기록, 재전송은 멱등키로 방어 · 확장은 스캐터 칸을 덮지 않는다(덮으면 프리스핀 RTP가 흔들린다). `RoundState`: `gamble?: { pendingWin: number; steps: number; maxSteps: number }`.

**UX** — 화면: 와일드 착지 시 릴 전체 세로 확장 트윈, 당첨 후 카드 뒷면 1장 + 빨강/검정 버튼 시트. 배너: `EXPANDING WILD` + heavy haptic + 금속 슬램음, 갬블 승리 시 배당 재롤업. 배경: 갬블 모달 동안 딤 α0.6, 상시 배경 교체 없음.

```json
"mutations": [
  { "type": "expandWild", "symbol": "wild", "reels": [1, 2, 3], "minCount": 1, "coverScatter": false }
],
"gamble": { "type": "coin-flip", "chance": 0.5, "payout": 2, "maxSteps": 5 }
```
아트: 심볼 10 + frame + bg + bg-freespins + thumb + 갬블 카드 2장 = 16장.

---

### #5 `shiba-shrine` — Shiba Shrine / 시바 신사
> 시바가 경내를 가로지르며 와일드 발자국을 뿌리는, 페이라인 없는 243길 축제.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×3 / 243 ways(배수 기준 = **총 베팅액**) · 변동성 중 · 적중률 목표 34% |
| RTP 94.5 구성 | ways 70.0 + 와일드 드롭 16.0 + 프리스핀 8.5 |
| RTP 산출 | **monte-carlo**, 필요 스핀 수는 팩별 산출(`manifest.auditSpins`, §4 개정 2026-09-03) — 드롭의 배치 배타성이 릴 간 상관을 만든다 |
| 공수 | 12 / 6 / 2 / 11 h |

**컨셉·아트** — 스타일: 큐트 애니멀 치비 토이 렌더(둥근 실루엣, 굵은 외곽, 무광 도자기 질감). 팔레트: 사쿠라 핑크 `#f6c0cf`, 토리이 주홍 `#e05a3c`, 민트 `#8fd6c0`, 밤 남색 `#243252`. 프레임: 붉은 토리이 기둥 두 개 + 시메나와 새끼줄, 상단에 등롱 두 개.
심볼(10): `wild` `scatter` `shiba` `panda` `capy` `tanuki` `cat` `koi` `dango` `charm`

**메커닉** — 트리거: 매 스핀 `chance = 0.20`으로 와일드 낙하, 개수 가중 `{1:60, 2:30, 3:10}` → 스핀당 기대 추가 와일드 0.30. 대상은 릴 1~3. 상태: `STOP → DROP_ROLL(p) → DROP_PLACE(후보칸 균등, 기존 wild/scatter 칸 제외) → WAYS_EVAL`. 수학: `chance`와 `countWeights`가 드롭 몫을 거의 선형으로 지배한다. 엣지: 후보칸이 요구 개수보다 적으면 가능한 만큼만(예외 아님) · 드롭은 스캐터를 덮지 않는다 · ways에서 와일드는 릴 카운트에 합산되므로 드롭 1개가 최대 3⁴배 경로를 만든다 → `maxWinCap` 필수. `RoundState`: 추가 없음, 좌표는 `features.wildDrops`.

**UX** — 화면: 정지 후 마스코트가 상단 20% 영역을 가로지르며 무작위 칸에 와일드 스탬프(릴 위/HUD 아래 임시 레이어). 배너: `SHRINE BLESSING` 소형 배너, 낙하마다 방울음 + light haptic 누적, 확정 후 당첨 재계산 및 FX 재생. 배경: 전환 없음, 연출 중 벚꽃·등롱 파티클 1.5초.

```json
"payModel": { "type": "ways", "ways": 243, "adjacentFrom": 0, "bothWays": false },
"mutations": [
  { "type": "randomWild-drop", "chance": 0.2, "countWeights": { "1": 60, "2": 30, "3": 10 },
    "reels": [1, 2, 3], "coverScatter": false }
]
```
아트: 심볼 10 + frame + bg + bg-freespins + thumb + 마스코트 스윕 스프라이트시트(8프레임) = 15장.

---

### #6 `candy-cluster-pop` — Candy Cluster Pop / 캔디 클러스터 팝
> 사탕 다섯 개가 붙기만 하면 터지고, 터질 때마다 배수가 올라간다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 6×5 / 클러스터 5+ (직교 인접, 배수 기준 = 총 베팅액) · 변동성 고 |
| RTP 94.5 구성 | 클러스터·텀블 복합 94.5 전부 (별도 라인 RTP 없음). 최초 클러스터 발생률 목표 32%, 평균 연쇄 1.6 |
| RTP 산출 | **monte-carlo**, 필요 스핀 수는 팩별 산출(`manifest.auditSpins`, §4 개정 2026-09-03) — 연쇄가 그리드 전체 상태에 의존해 닫힌 식이 없다 |
| 공수 | 20 / 14 / 3 / 11 h |

**컨셉·아트** — 스타일: 캔디 글로스(반투명 젤리 + 설탕 결정 표면). 팔레트: 하늘 `#8fd8f2`, 딸기 `#ff7aa8`, 라임 `#a8e05f`, 크림 `#fff1d6`. 프레임: 크림 프로스팅 테두리 + 웨이퍼 기둥, 마퀴에 짜낸 생크림 레터링.
심볼(10): `wild` `scatter` `heart` `star` `bean` `drop_red` `drop_blue` `drop_green` `drop_purple` `drop_yellow`

**메커닉** — 트리거: 직교 flood-fill 그룹 크기 ≥ 5. 상태: `DROP → FLOOD_FILL(≥5?) → PAY → REMOVE → REFILL(스트립 pull) → LADDER++ → FLOOD_FILL → …(그룹 없음) END`. 수학: 손잡이는 심볼 밀도, `minCluster`, 배수 사다리 `[1,2,3,5]`. 엣지: 한 셀은 정확히 한 그룹에만 속한다(방문 마킹 필수, 중복 지급 금지) · `maxCascades = 20` 하드 캡 · 리필은 릴별 순환 포인터로 스트립 고갈 방지 · 사다리는 유한 배열이고 마지막 값에서 고정, 스핀 시작 시 리셋. `RoundState`: `cascade?: { step, multiplier, totalCascades }`.

**UX** — 화면: 클러스터 공통 외곽선 하이라이트, HUD 바로 아래 슬림 배수 미터(높이 8~10%) 상시 노출. 배너: 텀블마다 팝 SFX + 파열 파티클, 배수 상승 시 숫자 펀치 스케일 + light haptic, 3연쇄 이상에서 `CHAIN!` 텍스트 스택. 배경: 전환 없음, 미터는 다음 스핀 시작 시 ×1로 축소 리셋.

```json
"payModel": { "type": "cluster", "minCluster": 5, "adjacency": "orthogonal", "wildJoins": true },
"cascade": { "enabled": true, "maxCascades": 20, "refill": "strip-pull",
             "resetOn": "spin", "multiplierLadder": [1, 2, 3, 5] },
"paytable": { "drop_red": { "5": 1, "8": 5, "12": 25, "20": 200 } }
```
아트: 심볼 10 + frame(6×5 전용 와이드 창) + bg + bg-freespins + thumb + 파열 파티클 시트 = 15장.

---

### #7 `olympus-nectar` — Olympus Nectar / 올림포스의 신주
> 같은 심볼 여덟 개면 어디에 있든 터지고, 하늘에서 떨어진 배수 오브가 전부 합쳐진다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 6×5 / `pay-anywhere` 8개 이상 · 변동성 최고 · 적중률 목표 22% |
| RTP 94.5 구성 | pay-anywhere 62.0 + 배수 오브 22.5 + 프리스핀 10.0 |
| RTP 산출 | **monte-carlo**, 필요 스핀 수는 팩별 산출(`manifest.auditSpins`, §4 개정 2026-09-03) — 오브 100× 꼬리 때문에 SE가 다른 게임보다 크다 |
| 공수 | 14 / 12 / 3 / 12 h |

**컨셉·아트** — 스타일: 스타일라이즈드 3D 대리석·금, 극적인 상단 백라이트. 팔레트: 하늘 `#3a5aa8`, 번개 옐로 `#ffe07a`, 대리석 `#eae3d6`, 올리브 `#6f8f4a`. 프레임: 대리석 기둥 두 개 + 올리브 화관 마퀴, 하단은 구름 받침.
심볼(11): `wild` `scatter` `zeus` `crown` `hourglass` `ring` `chalice` `gem_red` `gem_blue` `gem_green` `gem_purple`

**메커닉** — 트리거: 한 심볼이 그리드 어디든 8개 이상. 오브는 셀당 `chance = 0.05`, 값 가중 `{2:50, 3:30, 5:15, 10:5, 100:1}`. 상태: `DROP → COUNT_ANY(≥8?) → PAY → REMOVE(해당 심볼 전부) → REFILL → COUNT_ANY → …(없음) ORB_COLLECT(Σorb × 누적 승리) → END`. 프리스핀에서는 오브 합이 `persistMultiplier`에 누적되어 스핀 간 유지된다. 수학: 오브 몫은 `chance × E[value] × P(승리 스핀)`로 1차 근사한 뒤 몬테카를로로 보정한다. 엣지: 오브는 자체 지급이 없고 승리가 있을 때만 회수, 승리 0인 연쇄에서는 소멸 · `combine: "sum"` 고정(곱하면 꼬리가 발산), 합 상한 `orbCap = 500` · 프리스핀 누적 배수는 종료 시 반드시 1로 리셋 · `maxCascades = 20`. `RoundState`: `cascade`, `persistMultiplier?: number`, `orbSum?: number`.

**UX** — 화면: 배수 오브가 상단에서 낙하해 릴 좌측 여백(폭 10%)에 세로 스택, 개수 초과 시 `+N` 축약 뱃지. 배너: 오브 낙하마다 쨍 SFX + light haptic, 최종 적용 시 `+×N 적용` 골드 텍스트 후 기존 롤업 규칙으로 카운트업. 배경: 전환 없음, 오브 5개 초과 시 앰비언트 톤만 미세하게 밝아진다.

```json
"payModel": { "type": "pay-anywhere", "minCount": 8 },
"cascade": { "enabled": true, "maxCascades": 20, "resetOn": "spin",
  "multiplierSpots": { "chance": 0.05, "valueWeights": { "2": 50, "3": 30, "5": 15, "10": 5, "100": 1 },
                       "combine": "sum", "cap": 500, "persistIn": "freespins" } }
```
아트: 심볼 11 + frame + bg + bg-freespins + thumb + 오브 3종 + 낙하 파티클 = 18장.

---

### #8 `magi-stella` — Magi Stella / 마기 스텔라
> 변신한 순간 화면에 박힌 별 와일드는 프리스핀이 끝날 때까지 사라지지 않는다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×4 / 1024 ways · 변동성 고 · 프리스핀 진입 `p ≈ 0.008` |
| RTP 94.5 구성 | base ways 76.0 + 프리스핀(스티키) 18.5 |
| RTP 산출 | **monte-carlo** 10M 진입 기준, SE ≈ 0.06%p — 프리스핀 내부 상태가 스핀 간 이월된다 |
| 공수 | 10 / 8 / 3 / 12 h |

**컨셉·아트** — 스타일: 애니 셀셰이딩 2D 일러스트 + 소프트 블룸(허브에서 유일하게 3D 토이 렌더를 벗어나는 패밀리, 서브컬처 라인의 기준점). 팔레트: 라벤더 `#b38bd9`, 사쿠라 `#ffb3d1`, 젬 시안 `#4fc3d9`, 밤 보라 `#241a3a`. 프레임: 회전하는 마법진 링 + 리본 매듭, 마퀴에 별 브로치.
심볼(11): `wild` `scatter` `stella` `luna` `noir` `familiar` `heart_gem` `moon_gem` `star_gem` `clover_gem` `ribbon`

**메커닉** — 트리거: 스캐터 3+ → 프리스핀 12회. 프리스핀 중 등장한 와일드는 잔여 스핀 동안 고정, 리트리거 스캐터 2+ → +5회. 상태: `BASE →(sc≥3) FS_ENTER(12) → FS_SPIN → STICKY_ADD(신규 wild 좌표 병합) → WAYS_EVAL →(left>0) FS_SPIN | (sc≥2) FS_ADD(+5) →(left=0) FS_END(sticky 비움)`. 수학: 스티키가 프리스핀 후반 기대값을 초선형으로 밀어 올리므로 `count × p < 1`만으로는 부족하고 `maxStickyCells`가 실질 상한이다. 엣지: `maxStickyCells = 12`(20칸 중), 포화 시 신규 와일드 무시 · 스티키 셀은 스트립을 돌리지 않으므로 ways 카운트에 항상 포함 · 스캐터는 스티키 셀을 덮어쓸 수 없다 → 스티키가 늘수록 리트리거 확률이 단조 감소해 발산이 자동 억제된다 · 종료 시 `stickyCells` null 강제. `RoundState`: `stickyCells?: [number, number][]`, `maxStickyCells?: number`.

**UX** — 화면: 프리스핀 진입 시 상단에 `남은 스핀 N` 상시 카운터, 스티키 와일드는 고정 칸에 별 프레임 오버레이가 계속 붙는다. 배너: `FREE SPIN GET!` 풀폭 배너 + 강한 haptic, 신규 고정마다 `LOCK` 스탬프 + SFX, 종료 시 총 획득 요약. 배경: 진입 시 크로스페이드 0.6~0.8초, 종료 시 역전환.

```json
"payModel": { "type": "ways", "ways": 1024, "adjacentFrom": 0 },
"scatter": { "symbol": "scatter", "pays": { "3": 2, "4": 8, "5": 40 },
             "freeSpins": { "trigger": 3, "count": 12, "multiplier": 1, "retrigger": true, "retriggerCount": 5 } },
"mutations": [ { "type": "sticky-wild", "symbol": "wild", "phase": "freespins", "maxCells": 12 } ]
```
아트: 심볼 11 + frame + bg + bg-freespins + thumb + 스티키 별 프레임 + 변신 컷인 1장 = 17장.

---

### #9 `kraken-cove` — Kraken Cove / 크라켄 만
> 금화 여섯 개가 떠오르면 릴이 멈추고, 세 번의 리스핀 동안 만을 다 채우면 그랜드다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×3 / 20 페이라인 (스캐터 없음, 코인이 트리거) · 변동성 고 · 진입 `p ≈ 0.0045` (약 220스핀당 1회) |
| RTP 94.5 구성 | 라인 66.0 + 홀드&스핀 28.5 |
| RTP 산출 | **monte-carlo** 5M 진입, SE ≈ 0.07%p — 흡수 마르코프 체인이라 원리상 해석 가능하나 코인값 결합분포까지 닫힌 식으로 풀 실익이 없다 |
| 공수 | 18 / 14 / 8 / 12 h |

**컨셉·아트** — 스타일: 스타일라이즈드 3D 해양(젖은 목재, 산화 놋쇠, 물방울 하이라이트). 팔레트: 딥 티얼 `#12414f`, 러스트 `#c25a3a`, 금 `#e8b64a`, 폭풍 회색 `#5d6b73`. 프레임: 밧줄 감긴 놋쇠 현창 + 닻 몰딩, 상단 마퀴에 크라켄 촉수 두 가닥.
심볼(11): `wild` `coin` `kraken` `mermaid` `chest` `compass` `anchor` `cannon` `rum` `map` `parrot`
잭팟 티어(총 베팅 기준): `mini 20×` / `minor 50×` / `major 200×` / `grand 1000×`

**메커닉** — 트리거: `coin` 6개 이상 동시 등장. 상태: `BASE →(coin≥6) RESPIN_ENTER(left=3, 코인 잠금) → RESPIN(비잠금 칸만) →(신규 잠금) left=3 리셋 | left-- →(left=0 ∨ 15/15) PAYOUT(Σcoin + jackpot) → END`. 수학: 손잡이는 리스핀 중 코인 히트율 `q`, `coinValues` 가중, 잭팟 티어 값. 엣지: 발산 방지 조건 `q × emptyCells < 1`을 리스핀 진입 시점마다 검사, 넘으면 `parseGameMath` 실패 · `respinHardCap = 40` 도달 시 즉시 지급 · 잠긴 셀은 절대 재추첨하지 않는다(재추첨하면 리셋 루프가 발산한다) · `grand`는 15/15 만점에서만 라운드당 1회, `mini`/`minor`/`major`는 코인 심볼에 부착된 티어로만 지급하고 중복을 금지한다. `RoundState`: `respin?: { respinsLeft, respinsMax, totalRespins, lockedCells: { pos, value, jackpot? }[] }`.

**UX** — 화면: 잠긴 코인 칸에 고정 프레임, 상단에 `리스핀 3/3` 카운터와 mini~grand 4단 잭팟 리본(가로형, 390px 대응). 배너: 잠금마다 금속음 + haptic, 리필 시 `RESPIN!`, 만점 시 해당 등급 확대 + 잭팟 배너(`grand`는 EPIC/MAX급으로 취급). 배경: 진입 시 전용 서브 배경(수몰된 보물창고)으로 전환, 종료 시 복귀.

```json
"respin": {
  "trigger": { "symbol": "coin", "minCount": 6 },
  "respins": 3, "resetOnNewLock": true, "hardCap": 40, "lockedNeverRespun": true,
  "coinValues": { "1": 300, "2": 200, "5": 120, "10": 60, "20": 20 },
  "jackpots": { "mini": 20, "minor": 50, "major": 200, "grand": 1000 }, "grandOnFullGrid": true
}
```
아트: 심볼 11 + frame + bg + bg-respin + thumb + 코인 값 라벨 5종 + 잭팟 리본 = 20장.

---

### #10 `hanbok-night-market` — Hanbok Night Market / 한복 야시장
> 청사초롱 세 개가 켜지면 야시장 룰렛이 돌고, 등불이 번질 때마다 심볼이 한 단계 승급한다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×3 / 25 페이라인 · 변동성 중고 · 휠 진입 `p ≈ 0.006` |
| RTP 94.5 구성 | 라인 68.0 + 심볼 승급 14.0 + 휠 12.5 |
| RTP 산출 | **analytic** — 승급은 두 모델의 `0.92/0.08` 가중합, 휠은 독립 이산 분포 |
| 공수 | 12 / 10 / 5 / 12 h |

**컨셉·아트** — 스타일: 민화(民畵) 텍스처 + 3D 하이브리드. 한지 결과 먹선을 살린 평면 채색 위에 얕은 입체 조명만 얹는다. 팔레트: 오방색 — 적 `#d8433c`, 청 `#2f6fb0`, 황 `#e8c34a`, 백 `#f2ece0`, 흑 `#1c1a18` + 야시장 전구 웜 `#ffb765`. 프레임: 처마 기와 + 청사초롱 두 개, 사이드는 단청 문양 기둥.
심볼(11): `wild` `scatter` `bonus` `tiger` `magpie` `hanbok` `norigae` `moon_jar` `hotteok` `tteokbokki` `dalgona`
승급 사다리: `dalgona → tteokbokki → hotteok → moon_jar → norigae → hanbok → magpie → tiger` (와일드·스캐터·보너스 제외)

**메커닉** — 트리거: 승급은 매 스핀 `chance = 0.08`로 화면의 최저 티어 심볼 전부가 1단계 승격. 휠은 `bonus` 심볼이 릴 0·2·4에 각 1개. 상태: `STOP → UPGRADE_ROLL(p) → EVALUATE →(bonus 3) WHEEL_SPIN(t1) →(segment=upgrade) WHEEL_SPIN(t2) → AWARD(배수 | 프리스핀) → END`. 수학: 휠 기대값은 `Σwᵢvᵢ / Σwᵢ`. 엣지: 승급 사다리는 유한 배열이고 최상단에서 고정 · 휠 티어 승급은 단방향 1회(`maxUpgrades = 1`), 순환 세그먼트 금지 · 클라이언트에 세그먼트 라벨은 미리 보내되 **당첨 인덱스는 스핀 응답에서만** 전달 · 승급이 스캐터 카운트를 바꾸면 안 된다. `RoundState`: `bonus?: { kind: 'wheel'; tier; spinsUsed; awarded }`.

**UX** — 화면: 트리거 시 중앙 원형 휠 모달, 승급은 심볼이 상위 심볼로 바뀌는 모프 애니메이션. 배너: 휠 정지 시 핀 클릭음 누적 + 결과 하이라이트 + haptic 펄스, 승급 시 `UPGRADE!` 스탬프. 배경: 모달 동안 딤 + 야시장 등불 파티클, 상시 배경 교체 없음.

```json
"mutations": [ { "type": "symbol-upgrade", "chance": 0.08, "steps": 1,
  "ladder": ["dalgona","tteokbokki","hotteok","moon_jar","norigae","hanbok","magpie","tiger"] } ],
"bonus": { "type": "wheel", "trigger": { "symbol": "bonus", "minCount": 3 }, "maxUpgrades": 1,
  "tiers": [ { "id": "t1", "segments": [ { "kind": "multiplier", "value": 5, "weight": 40 },
                                          { "kind": "upgrade", "to": "t2", "weight": 6 } ] },
             { "id": "t2", "segments": [ { "kind": "multiplier", "value": 50, "weight": 10 },
                                          { "kind": "freespins", "value": 15, "weight": 8 } ] } ] }
```
아트: 심볼 11 + frame + bg + thumb + 휠 2티어(판 2장 + 포인터) = 18장.

---

### #11 `idol-stage-live` — Idol Stage Live / 아이돌 스테이지 라이브
> 응원봉 미터가 차오르면 배수가 오르고, 백스테이지 패스 세 장이면 카드 세 장을 직접 고른다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×4 / 1024 ways **양방향**(`bothWays`) · 변동성 중고 · 픽미 진입 `p ≈ 0.007` |
| RTP 94.5 구성 | 양방향 ways 68.0 + 응원 미터 14.0 + 픽미 12.5 |
| RTP 산출 | **monte-carlo**, 필요 스핀 수는 팩별 산출(`manifest.auditSpins`, §4 개정 2026-09-03) — 양방향 자체는 해석 가능하지만 미터가 스핀 간 상태를 만들어 정상분포가 필요하다 |
| 공수 | 12 / 10 / 6 / 13 h |

**컨셉·아트** — 스타일: 애니 아이돌(셀셰이딩 캐릭터 + 무대 조명 렌즈 플레어). `magi-stella`와 같은 셀셰이딩 패밀리이되 채도와 조명 대비를 더 세게 잡아 구분한다. 팔레트: 네온 핑크 `#ff5fa2`, 일렉 블루 `#4aa8ff`, 스포트 골드 `#ffd166`, 무대 암전 `#14101f`. 프레임: 스테이지 트러스 + 조명 리그, 하단은 관객석 실루엣.
심볼(11): `wild` `scatter` `bonus` `mira` `yuni` `sera` `lightstick` `mic` `heart_bomb` `ticket` `crown_a`

**메커닉** — 트리거: 픽미는 `bonus` 3+. 응원 미터는 승리 스핀마다 +1, `[10, 25, 50]` 도달 시 배수 `[2, 3, 5]`. 상태: `BASE → WAYS_EVAL(L→R + R→L 합산) → METER_TICK(win>0) →(bonus≥3) PICK_ENTER(숨긴 풀 N=12) → PICK(가중, reveal-and-continue) →(end 아이템 ∨ picks=6) PICK_END → EXIT`. 엣지: 5릴 전체 매칭은 양방향 중복 지급 금지, L→R 하나로만 계산 · 미터 리셋 정책을 반드시 명시(최고 단계 도달 후 소진), 무기한 누적은 RTP를 발산시킨다 · 픽 풀은 서버가 셔플해 보관하고 클라이언트는 **인덱스만** 전송, 풀 프리뷰 API 금지 · `maxPicks = 6` 하드 캡, 풀에 `end: true` 아이템이 최소 1개 있어야 종료가 보장된다. `RoundState`: `meter?: { points, tier, multiplier }`, `bonus?: { kind: 'pick-me'; poolId; picked; picksLeft; accumulated }`.

**UX** — 화면: 스핀바 위에 응원봉 게이지 상시 노출, 픽미는 무대 → 백스테이지 전환 후 2열 카드 그리드. 배너: 게이지 최대 시 `ENCORE!` + 강한 haptic, 카드 선택마다 반짝임 + 짧은 보이스, 종료 시 합산 배너. 배경: 픽미 진입 시 크로스페이드, 게이지 최대는 배경 교체 없이 조명색만 변경.

```json
"payModel": { "type": "ways", "ways": 1024, "adjacentFrom": 0, "bothWays": true },
"cascade": { "trailMeter": { "steps": [10, 25, 50], "values": [2, 3, 5], "resetOn": "tier-max" } },
"bonus": { "type": "pick-me", "trigger": { "symbol": "bonus", "minCount": 3 },
  "poolSize": 12, "maxPicks": 6, "revealPolicy": "server-only",
  "items": [ { "kind": "multiplier", "value": 5, "weight": 40, "end": false },
             { "kind": "freespins", "value": 8, "weight": 12, "end": false },
             { "kind": "collect", "value": 0, "weight": 18, "end": true } ] }
```
아트: 심볼 11 + frame + bg + bg-backstage + thumb + 픽 카드 앞/뒤 + 응원봉 게이지 = 19장.

---

### #12 `mecha-nova` — Mecha Nova / 메카 노바
> 노바 기체가 릴을 한 칸씩 가로지르는 동안 리스핀은 공짜다. 기다리기 싫으면 사면 된다.

| 항목 | 값 |
|---|---|
| 그리드 / 페이 | 5×4 / 243 ways · 변동성 고 · 워킹 진입 `P ≈ 0.11` |
| RTP 94.5 구성 | ways 72.0 + 워킹 와일드 리스핀 22.5 |
| RTP 산출 | **monte-carlo** 10M 진입, SE ≈ 0.06%p — 리스핀 상태가 이월된다 |
| 공수 | 10 / 8 / 6 / 12 h |

**컨셉·아트** — 스타일: 하드서피스 3D + 애니 메카 라인. 무광 장갑판, 발광 코어, 얇은 HUD 라인. 팔레트: 우주 네이비 `#0b1220`(허브 앵커 그대로), 이온 시안 `#37e6ff`, 경고 오렌지 `#ff8a3d`, 강철 `#8993a3`. 프레임: 격납고 해치 + 상단 HUD 스트립, 사이드에 유압 실린더.
심볼(11): `wild` `scatter` `pilot` `mech_red` `mech_blue` `core` `thruster` `missile` `shield` `wrench` `chip`

**메커닉** — 트리거: 릴 4에 `wild` 등장. 바이 피처는 총 베팅 80× 지불로 즉시 활성. 상태: `BASE →(wild@reel4) WALK_ENTER(walkers=[{reel:4}]) → RESPIN(워커 셀 고정, 나머지 리스핀) → WAYS_EVAL → WALK_STEP(reel--) →(신규 wild@reel4, walkers<3) WALK_ADD →(walkers 전부 reel<0) END`. 수학: 바이 피처 가격은 `E[피처 조건부 총승리] / 0.945`로 역산해 **바이 경로 RTP도 정확히 94.5%**로 맞춘다. 엣지: `maxWalkers = 3`, 포화 시 신규 워커 무시 · 이동은 단방향(`direction: -1`)이라 워커 1개당 최대 5리스핀으로 종료가 구조적으로 보장된다, 역방향·정지 옵션 금지 · 바이 피처도 `betLevels` 검사를 우회하지 못하며 `buyPrice × betLevel`이 정수 코인이어야 한다 · **바이 RTP > 기본 RTP면 게이트 실패**(바이만 반복하는 차익 금지). `RoundState`: `walkers?: { reel, rows }[]`, `respin?`(공용), `buyFeature?: { price, featureId }`.

**UX** — 화면: 와일드가 리스핀마다 한 칸 슬라이드(정지 후 0.4초), 스핀바 옆에 보너스 구매 버튼. 배너: 이동 시 발소리 + 경량 화면 흔들림 + haptic, `리스핀 N/M` 카운터, 구매 시 가격과 확률을 고지하는 확인 모달. 배경: 워킹 시퀀스 진입 시 격납고 → 전장으로 전환, 종료 시 복귀.

```json
"mutations": [ { "type": "walking-wild", "symbol": "wild", "startReel": 4,
                 "direction": -1, "maxWalkers": 3 } ],
"buyFeature": { "featureId": "walking-wild", "price": 80, "rtpMustNotExceedBase": true }
```
아트: 심볼 11 + frame + bg + bg-battle + thumb + 워킹 트레일 이펙트 + 구매 버튼 아이콘 = 18장.

---

## 3. 통합 `RoundState`

10종 전부가 이 하나의 인터페이스를 공유한다. 모든 신규 필드는 선택적이고, 게임은 자기 것만 채운다.

```ts
export interface RoundState {
  freeSpinsLeft?: number
  multiplier?: number
  cascade?: { step: number; multiplier: number; totalCascades: number }
  persistMultiplier?: number
  orbSum?: number
  meter?: { points: number; tier: number; multiplier: number }
  stickyCells?: [number, number][]
  maxStickyCells?: number
  walkers?: { reel: number; rows: number[] }[]
  respin?: {
    respinsLeft: number; respinsMax: number; totalRespins: number
    lockedCells: { pos: [number, number]; value: number; jackpot?: 'mini'|'minor'|'major'|'grand' }[]
  }
  bonus?: { kind: 'pick-me'|'wheel'; poolId?: string; tier?: string
            picked?: number[]; picksLeft?: number; spinsUsed?: number; accumulated: number }
  gamble?: { pendingWin: number; steps: number; maxSteps: number }
  buyFeature?: { price: number; featureId: string }
}
```

## 4. 엔진 피처 백로그 (재사용 순)

재사용도가 높은 것부터 짓는다. 앞 항목을 건너뛰면 뒤 항목이 두 번 구현된다.

| 순 | 항목 | 해금하는 게임 | 선행 | 공수 |
|---|---|---|---|---|
| 1 | **RTP 감사 게이트에 `method: 'monte-carlo'` 수용** | 10종 중 7종 | 없음 | 8h |
| 2 | **P1 `mutations` 파이프라인**(무상태 3종: mystery·expand·upgrade) | #3 #4 #10 | 1 | 14h |
| 3 | **P2 `ways` 평가기**(243/1024 + `bothWays`) | #5 #8 #11 #12 | 없음 | 12h |
| 4 | **P1 확장: 확률형 배치**(randomWild-drop) | #5 | 2·3 | 6h |
| 5 | **`RoundState` 캐리 상태 일반화**(스핀 간 상태 저장·복원·서버 세션) | #8 #9 #11 #12 | 없음 | 10h |
| 6 | **P3 `cascade` 엔진**(제거·리필·재평가 + 배수 사다리) | #6 #7 | 5 | 18h |
| 7 | **P4 `cluster` 평가기**(flood-fill) + `pay-anywhere` 변형 | #6 #7 | 6 | 14h |
| 8 | **P3 확장: 배수 오브 / 트레일 미터** | #7 #11 | 6 | 8h |
| 9 | **P1 확장: 캐리형 와일드**(sticky·walking) | #8 #12 | 2·5 | 10h |
| 10 | **P5 `respin` 상태 기계** + 코인 값 + 잭팟 4단 | #9 #12 | 5·9 | 20h |
| 11 | **P6 `bonus` 프레임워크**(pick-me·wheel, 서버 권위 다단 인터랙션) | #10 #11 | 5 | 18h |
| 12 | **부가: 갬블 / 바이 피처**(엔진은 얇고 대부분 API 계층) | #4 #12 | 5·10 | 10h |
| 13 | **공통 안전장치**: `maxWinCap`, 종료 척도 검증, 발산 정적 검사 | 전 게임 | 6·10 | 8h |

프리미티브별 RTP 산출 방식:

| 프리미티브 | 방식 | 이유 |
|---|---|---|
| P1 mutations | `analytic`(mystery·expand·upgrade) / `monte-carlo`(drop·sticky·walking) | 앞 3종은 조건부화하면 릴 독립이 복원되어 기존 닫힌 식의 가중합이 된다. 뒤 3종은 배치 배타성과 스핀 간 이월이 독립성을 깬다 |
| P2 ways | `analytic` 단독 / 뮤테이션 결합 시 `monte-carlo` | 릴별 카운트의 곱은 인수분해된다. `bothWays`도 두 방향 기대값의 합 |
| P3 cascade | **`monte-carlo`, 필요 스핀 수는 팩마다 산출** | 연쇄 길이와 배수가 그리드 전체 상태에 의존한다. 고정 스핀 수를 적지 않는 이유는 분산이 팩마다 3배 넘게 차이 나기 때문이다 — 오브 꼬리 하나로 필요 표본이 69M에서 188M으로 뛴다. 파일럿 100만 스핀으로 σ를 재고 `n* = (1.96σ / 0.002)²`로 정한다. 팩의 `manifest.auditSpins`가 SSOT다 |
| P4 cluster / pay-anywhere | **`monte-carlo`, 위와 동일 규칙** | flood-fill 그룹 크기 분포가 강한 공간 상관을 갖는다. 6×5 클러스터의 예상 σ는 9.0으로 shiba-shrine(4.41)의 두 배이고, 같은 정밀도에 4배의 표본이 든다 |
| P5 respin | **`monte-carlo`** SE ≤ 0.07%p (5M 진입) | 흡수 마르코프 체인이나 코인값·잭팟 결합분포까지 닫는 실익이 없다 |
| P6 bonus | `analytic` | 가중 이산 분포. pick-me는 비복원 추출 + 흡수 확률, wheel은 티어 전이 행렬 |

> **[감사 도구 메모 — 2026-09-03]** 이 규칙은 **1차 관문(CI, 40만 스핀)** 기준으로 채택했다.
> `max(0.5%p, 3×SE)`는 표본이 부실할수록 허용 오차가 넓어지므로 그것만으로 "목표를 맞췄다"고
> 결론지을 수 없다. 최종 판정은 정식 감사(`run audit`, 2천5백만 스핀)가 내리며 기준은
> `|rtp−target| ≤ 0.5%p` **그리고** `95% CI 반폭 ≤ 0.2%p`, 못 미치면 `표본 부족` FAIL이다.
> 자세한 내용은 `tools/rtp-sim/README.md`.

**감사 게이트 확장 요구** — `tools/rtp-sim/src/games.test.ts`가 지금은 전수 조사와 해석 경로만 통과시킨다. `method: 'monte-carlo'`를 1급으로 받아야 하고, 수용 조건은 (1) `CI 게이트 |rtp − rtpTarget| ≤ max(0.5%p, 3×SE) / 정식 검수 리포트 |rtp − rtpTarget| ≤ 0.5%p **이고** ci95 반폭 ≤ 0.2%p (MC 2천5백만 스핀, 표본 부족이면 FAIL)`, (2) 고정 시드로 CI 재현 가능, (3) 리포트에 `spins`·`stderr`·`seed`·`ci95` 필수 기록이다. SE는 스핀당 지급액 표본표준편차 ÷ √n.

**종료·발산 방지 규칙 (엔진이 강제, 위반 시 `parseGameMath` 예외)**

1. **기대 반복 수렴** — 자기 재진입이 있는 모든 피처는 `E[반복] = 1/(1−r)`, `r < 1`이 정적으로 검증돼야 한다. 기존 리트리거의 `count × P(trigger) < 1`을 일반화한 것이다. 프리스핀은 `count × p`, 홀드&스핀은 `q_lock × emptyCells`, 텀블은 `P(연쇄 지속)`. 스티키·워커처럼 `r`이 변하는 피처는 `r`이 단조 비증가임을 보이거나 상한 `r_max < 1`을 명시해야 한다.
2. **모든 루프에 정수 하드 캡 + 지급 캡** — `maxCascades`·`respin.hardCap`·`maxWalkers`·`maxPicks`·`maxUpgrades`·`gamble.maxSteps`는 필수 필드다. 전 게임 공통 `maxWinCap`(총 베팅 5,000×)에 도달하면 진행 중 피처를 즉시 종료하고 캡 금액으로 지급한다. **캡은 RTP 계산에도 똑같이 적용해야 한다** — 캡 없이 튜닝하고 캡 있게 서비스하면 실 RTP가 목표보다 낮아진다.
3. **단조 감소 변이 척도** — 모든 루프는 반복마다 엄격히 감소하는 음이 아닌 정수 척도를 하나 지정한다. 리스핀 `respinsLeft`, 워킹 `Σ(walker.reel+1)`, 픽미 `picksLeft`, 텀블 `maxCascades − totalCascades`, 휠 `maxUpgrades − upgradesUsed`. 척도를 되돌리는 전이(리셋·리트리거·워커 추가)는 캡 미만일 때만 허용하고 그 횟수 자체가 별도 카운터로 상한된다. 0이 되면 무조건 종료로 전이한다.

> **정식 감사의 스핀 수는 고정값이 아니다(2026-09-03 개정, 근거 `docs/WAVE2_DESIGN.md` §3-6).** 기준은 언제나 `|rtp − target| ≤ 0.5%p` **그리고**
> `95% CI 반폭 ≤ 0.2%p`이고, 반폭은 `1.96σ/√n`이므로 **필요한 n은 팩의 분산이 정한다.**
> 감사 리포트는 파일럿에서 잰 σ와 그것으로 유도한 `n*`, 실제로 쓴 `n`을 함께 남기고 `n ≥ n*`를 만족해야
> 한다. 정밀도 기준을 완화해 통과시키는 길은 없다 — 반폭은 1/√n로만 줄어들므로 기준을 늘리는 순간
> "목표를 맞췄다"는 문장이 근거를 잃는다.
>
> 표본이 클 때는 시드를 K개로 쪼개 병렬로 돌리고 `mergeSimulations`로 합친다. 합산 결과는 한 번에
> 돌린 것과 `rtp`·`stdDev`까지 같고, 리포트에는 샤드별 시드를 전부 남긴다.

**Wave 1 엔진 재검수(2026-09-03, APPROVED)에서 넘긴 엔진 백로그**

- 와일드 전용 줄 접기를 **창 단위**에서 **릴별 와일드 칸 수의 곱** 단위로 정밀화. 지금은 와일드+심볼이 섞인 창에서 순수 와일드 경로가 비챔피언 후보와 챔피언에 이중 계상된다(RTP는 그 규칙대로 측정돼 정확하나 배당표 정합성 문제). 해석식의 `headWildOnly`도 `Π E[와일드 칸 수]`로 함께 수정 → shiba-shrine 재튜닝 필요.
- 와일드 심볼 복수 선언 시 챔피언 표가 "같은 대체 규칙" 전제라 all-wild 창 미지급 가능 → 스키마에서 와일드 1종만 허용하거나 와일드 id별 챔피언 계산.
- `expandWild.onlyIfWin`이 스핀당 `probeWin` 2회 호출(라인/ways + 스캐터) → 한 번에 합산하도록 최적화. 현재 팩엔 `onlyIfWin: true`가 없어 실측 영향 없음.
- 정식 감사 25M MC의 ci95 반폭 여유가 5~14%라 분산이 커지는 재튜닝은 스핀 수 증액 필요. CI 게이트는 400k 느슨 규칙, 정식 감사만 엄격 규칙(두 단계) 유지.

## 5. 신규 공용 UI 컴포넌트

렌더러·허브가 한 번 만들고 10종이 나눠 쓴다. 게임별로 다시 짓지 않는다.

| 컴포넌트 | 쓰는 게임 | 설명 |
|---|---|---|
| `PersistentMeterBar` | #6 #7 #8 #9 #11 | 상·하단 슬림 바의 숫자·게이지 표시와 리셋 애니메이션 |
| `BonusOverlaySheet` | #4 #10 #11 #12 | 배경 딤 + 중앙 콘텐츠 슬롯, 상단에 잔액·베팅 미니바 고정 |
| `JackpotLadderStrip` | #9 (공용화 대비) | mini/minor/major/grand 4단 리본과 등급별 확대 |
| `SymbolMorphFX` | #3 #10 | 심볼 A→B 크로스페이드 + 스케일 펀치 공용 트윈 |
| `MascotSweepLayer` | #5 #12 | 릴 위 임시 오버레이 레이어, z-order 고정 + 자동 정리 |
| `BackgroundCrossfader` | #8 #9 #11 #12 | 진입·이탈 0.6~0.8초 전환, `reducedMotion`이면 즉시 컷 |
| `WildPositionTracker` | #8 #12 | 와일드 좌표 상태 유지 + 프레임 오버레이 렌더 |
| `ResultRevealPrimitive` | #4 #10 | 정지 후 결과 강조 공용 인터랙션(카드·휠) |
| `BuyFeatureConfirm` | #12 | 가격·확률 고지 표준 문구 슬롯 |

## 6. 웨이브 계획

병렬 팀 4개(엔진 / 렌더러 / 허브 / 아트)를 전제한다. 아트는 Codex 생성 이미지 1장당 2~3분이고, 재생성·키잉·QA를 감안하면 **게임 1종(14~20장)당 실질 2.5~3시간**이다.

| 웨이브 | 신규 엔진 프리미티브 (2개) | 게임 | 아트 장수 | 기간 |
|---|---|---|---|---|
| **1** | P1 `mutations`(무상태) · P2 `ways` | #3 #4 #5 | 44 | 3일 |
| **2** | P3 `cascade` · P4 `cluster` | #6 #7 #8 | 50 | 4일 |
| **3** | P5 `respin` · P6 `bonus` | #9 #10 #11 #12 | 75 | 5일 |

```
D1        엔진: 감사 게이트 MC 수용(항목 1) + P1 무상태 3종 ┐
          렌더러: SymbolMorphFX + MascotSweepLayer          ├ 병렬
          아트: #3 #4 심볼·프레임 생성                        ┘
D2        엔진: P2 ways 평가기 + randomWild-drop
          아트: #5 심볼·프레임 + 3종 배경/썸네일
D3        3종 math.json 튜닝 → 감사 통과 → 허브 로비 등록 → 웨이브 1 커밋
D4–D5     엔진: RoundState 캐리 일반화 → P3 cascade
          렌더러: PersistentMeterBar + 텀블 연출
          아트: #6 #7 #8
D6        엔진: P4 cluster + pay-anywhere, 배수 오브
D7        6×5 두 종 몬테카를로 20M 튜닝(가장 오래 걸리는 구간) → 웨이브 2 커밋
D8–D9     엔진: 캐리형 와일드 → P5 respin + 잭팟 4단
          허브: 잭팟 티어 원장·바이 피처 결제 경로
          아트: #9 #10 (잭팟 리본·휠 포함)
D10–D11   엔진: P6 bonus(pick-me·wheel) + 갬블/바이
          아트: #11 #12 (픽 카드·백스테이지·전장 배경)
D12       4종 감사 + 상태 복원 e2e(새로고침) → 웨이브 3 커밋
```

임계 경로는 **D7의 6×5 몬테카를로 튜닝**과 **D8~D9의 P5 respin**이다. 둘 다 반복 측정이 필요해 압축이 어렵다. 아트는 언제나 엔진보다 앞서 끝나므로 병목이 아니고, 대신 아트 팀은 웨이브 사이 여유 시간에 허브 공용 에셋(로비 배경·잭팟 배너)을 처리한다.

## 7. 리스크

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | **텀블·클러스터 RTP 튜닝이 가장 어렵다.** 심볼 밀도를 1개 바꾸면 연쇄 길이 분포가 통째로 움직여 선형 직관이 통하지 않는다 | #6 #7 일정 지연 | 20M 스핀 튜닝 루프를 워커 병렬로 돌리고, 밀도 → 발생률 → RTP 3단 감도표를 먼저 만들어 이분 탐색한다 |
| R2 | **해석적 RTP가 불가능한 게임이 7종.** 감사 게이트가 전수·해석만 받으면 7종이 통과 자체를 못 한다 | 전 웨이브 차단 | 백로그 1번을 최우선. `method: 'monte-carlo'` + `CI: |rtp−target| ≤ max(0.5%p, 3×SE) / 정식 검수: |rtp−target| ≤ 0.5%p 이고 ci95 반폭 ≤ 0.2%p` + 고정 시드로 CI 재현 |
| R3 | **잭팟 이중 계상.** #9의 게임 내 4단 잭팟과 허브 프로그레시브 잭팟(1.5%)이 별개인데 섞이면 실효 RTP가 96%를 넘는다 | 경제 붕괴 | 게임 내 잭팟은 `math.json`의 94.5% 안에 포함되는 고정 배수, 허브 잭팟은 모델 밖. 원장 `reason`을 분리해 매시간 불변식 검사에 포함 |
| R4 | **바이 피처 차익.** 바이 경로 RTP가 기본보다 높으면 유저가 바이만 반복해 하우스 엣지가 사라진다 | #12 수익성 | 가격을 `E[피처 총승리]/0.945`로 역산하고, 게이트가 `바이 RTP ≤ 기본 RTP`를 검사 |
| R5 | **스핀 간 상태의 서버 복원.** 프리스핀·홀드&스핀·픽미 도중 앱이 죽으면 상태를 잃거나 중복 지급될 수 있다 | 원장 정합성 | `game_states`에 `RoundState` 전체를 저장하고 재개는 서버 재조회만 인정. 클라 로컬 복원 금지, 멱등키 필수 |
| R6 | **인터랙티브 보너스의 결과 선노출.** 픽미·휠 응답에 결과 풀이 실려 오면 클라이언트가 정답을 안다 | 공정성 신뢰 | 서버가 풀을 셔플해 보관, 클라는 인덱스만 전송, `revealPolicy: "server-only"`를 스키마로 강제하고 QA에서 네트워크 응답 점검 |
| R7 | **390px 화면 과밀.** 6×5 그리드 + 상시 미터 + 오브 스택이면 셀이 너무 작아진다 | #6 #7 체감 품질 | 릴 셀 최소 크기를 먼저 확보하고 미터는 8~10% 높이 리본으로 상한, 라벨은 숫자만 상시·문구는 롱프레스 툴팁 |
| R8 | **애니 셀셰이딩 2종의 스타일 이탈.** #8 #11이 허브의 3D 토이 렌더 브랜드에서 벗어난다 | 브랜드 일관성 | 셀셰이딩을 "서브컬처 라인"이라는 **공식 2번째 패밀리**로 선언하고 두 게임이 `stylePrefix`를 공유. 팔레트 앵커(네이비·브라스)는 프레임과 HUD에 유지 |
| R9 | **아트 프레임 일관성.** 게임 10종의 프레임 창 좌표가 어긋나면 심볼이 베젤에 가리거나 삐져나온다 | 전 게임 | `prompts.json`의 창 좌표를 SSOT로 고정(x 4–96%, y 14–86%)하고 `--reprocess`로 재후처리, 렌더러 담당과 게임별 교차 확인 |

## 8. 게임별 체크리스트 템플릿

새 게임 폴더를 만들 때 이 표를 `games/<id>/CHECKLIST.md`로 복사해 쓴다. 1~5번은 `_template/HOWTO.md`의 5단계고, 나머지가 신규 메커닉 때문에 추가된 항목이다.

```
[ ] 1. 템플릿 복사, 게임 id(kebab-case)가 폴더 / manifest.json / math.json 3곳 일치
[ ] 2. manifest의 reels·rows·lines·betLevels가 math.json과 일치 (게이트가 강제)
[ ] 3. 신규 심볼(mystery·coin·bonus 등) 페이테이블·매치배수가 스키마 통과
[ ] 4. rtp-sim으로 RTP가 rtpTarget(94.5%) ±0.5%p 이내, 적중률·최대배수 목표 충족
[ ] 5. pnpm --filter @tgslot/rtp-sim test 게이트 통과
[ ] 6. 몬테카를로 채택 시 리포트에 spins·seed·stderr·ci95 기록, CI: |rtp−target| ≤ max(0.5%p, 3×SE) / 정식 검수: |rtp−target| ≤ 0.5%p 이고 ci95 반폭 ≤ 0.2%p
[ ] 7. 루프 하드 캡 필드가 전부 존재하고 maxWinCap이 RTP 계산에도 적용됨
[ ] 8. 발산 검사 통과 (r < 1 정적 검증, 단조 감소 척도 지정)
[ ] 9. 신규 메커닉 상태가 SpinResult.nextState / RoundState에 빠짐없이 실림
[ ] 10. 새로고침·앱 재시작 후 진행 중 피처가 서버 재조회로 동일 복원 (클라 로컬 복원 금지)
[ ] 11. 스핀 재전송이 멱등, 중복 지급 없음 (원장 2건 확인)
[ ] 12. 서버 권위: 클라가 결과·보너스 당첨·잭팟 등급을 자체 계산/추정하지 않음 (코드 리뷰)
[ ] 13. 픽미·휠·갬블 응답에 결과 풀·정답 필드가 선노출되지 않음 (네트워크 응답 점검)
[ ] 14. reducedMotion에서 마스코트 스윕·배경 크로스페이드·워킹 이동이 즉시 컷으로 대체
[ ] 15. 신규 haptic이 지원·미지원 기기 양쪽에서 크래시 없이 동작
[ ] 16. 신규 배너·카운터·보너스 문구의 i18n 키가 en/ko 모두 등록, 폴백 확인
[ ] 17. 한국어 텍스트가 390px 배너·미터에서 줄바꿈·잘림 없음
[ ] 18. 아트 자산 전량 존재(심볼·frame·bg·모드 bg·thumb·스프라이트시트)하고 theme.json 경로 일치
[ ] 19. 심볼 id가 math.json과 1:1, 64px 축소 시 실루엣이 서로 구분됨
[ ] 20. theme.json fx가 SYMBOL_FX_PLAN의 default 폴백 규칙을 위반하지 않음
[ ] 21. BIG/MEGA/EPIC/MAX 배너가 신규 배당원(오브 합·잭팟·픽미 누적)에도 정확한 배율로 트리거
[ ] 22. 피처 종료 후 상시 UI(미터·카운터·사다리)가 정확히 리셋
[ ] 23. README.md에 페이테이블·실측 RTP·적중률·최대배수·신규 메커닉 요약 기록
[ ] 24. manifest status를 hidden → live로 전환하고 로비 정렬(sort) 지정
```
