# ArcaneCollectors 밸런스 설계 v1.0

- 작성일: 2026-09-02
- 작성자: game-system-designer (team-lead 위임)
- 기준 문서: docs/BALANCE_REPORT.md (BLK-03 SSOT)
- 산출물: 이 문서 + docs/balance/balance-changes-v1.json

---

## 1. 핵심 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| 스테이지 5-5 미달 | **Option A**: 5-4→12,500 / 5-5→13,500 | 파티 상한 14,348 대비 1.06× 달성 가능 |
| 탑 재설계 | 60층(15,100)이 파티 상한 초과 → 전체 재스케일링 (층 100 = 14,260) | 등차 +140/층 |
| 등급 역전 수정 | Omar SR 대폭 하향 + SSR 저전투력 영웅 상향 | DEF 기여가 ATK와 동일해 탱커 BP 과대 계상 |
| 등급 밴드 목표 | SSR 1,000-1,400 / SR 800-1,000 / R 650-850 / N 500-750 | 최대레벨·기본성급 기준 |
| 적 스탯 검증 | 현재 적 베이스 스탯은 스테이지 스케일링 적용 전 값 → 검증 스크립트 필요 | 단독 베이스 HP로는 1턴 킬 발생 |

---

## 2. 전투력 공식 (BLK-03 SSOT)

```
BP = floor(HP/10 + ATK + DEF + SPD + 스킬레벨합×10)
```

**스탯 적용 순서**:

```
기본 = stats + growthStats × (Lv − 1)
성급 = 기본 × (1 + (성급−1) × 0.05)   [SPD는 × (1 + (성급−1) × 0.025)]
최종 = 성급 후 스탯 + 장비 가산 + 컬렉션 곱
```

**기본 성급 (등급별)**: N:1성, R:2성, SR:3성, SSR:4성

---

## 3. 등급 정합 원칙

### 3-1. 목표 BP 밴드 (최대레벨, 기본성급, 스킬Lv0, 장비 없음)

| 등급 | 최대레벨 | 기본성급 | 목표 BP 범위 |
|------|---------|---------|------------|
| SSR | 60 | 4성 (×1.15) | **1,000 – 1,400** |
| SR | 50 | 3성 (×1.10) | **800 – 1,000** |
| R | 40 | 2성 (×1.05) | **650 – 850** |
| Base N | 30 | 1성 (×1.00) | **500 – 750** |

밴드 경계 원칙: 임의 SSR 최하단(1,000) > SR 최상단(1,000) 이상 엄수.

### 3-2. 현황 vs 목표 (전체 34영웅)

#### 기본영웅 (10명) — Base N, Lv30

| 영웅 ID | 계보 | 현재 BP | 목표 BP | 조치 |
|---------|------|--------|--------|------|
| base_iris | 아이리스 | 601 | 500-750 | 유지 |
| base_sera | 세라 | 595 | 500-750 | 유지 |
| base_luca | 루카 | 595 | 500-750 | 유지 |
| base_kai | 카이 | 620 | 500-750 | 유지 |
| base_lin | 린 | 580 | 500-750 | 유지 |
| base_omar | 오마르 | 777 | 500-750 | 유지* |
| base_sol | 솔 | 606 | 500-750 | 유지 |
| base_hana | 하나 | 600 | 500-750 | 유지 |
| base_leon | 레온 | 676 | 500-750 | 유지 |
| base_paolo | 파올로 | 602 | 500-750 | 유지 |

> *base_omar: 777 BP는 탱커 특성상 DEF 기여가 높아 목표 상한 초과. 설계 의도 허용 범위(탱커 예외). 전직 후 Lv30에서 역전 현상은 없음.

#### R 전직영웅 (3명) — Lv40, 2성

| 영웅 ID | 현재 BP | 목표 BP | 조치 |
|---------|--------|--------|------|
| asc_lin_balance | 769 | 650-850 | 유지 |
| asc_hana_helheim | 742 | 650-850 | 유지 |
| asc_paolo_balance | 800 | 650-850 | 유지 |

#### SR 전직영웅 (8명) — Lv50, 3성

| 영웅 ID | 현재 BP | 목표 BP | 조치 | 내용 |
|---------|--------|--------|------|------|
| asc_luca_tartarus | 818 | 800-1,000 | 유지 | — |
| asc_sera_nature | 847 | 800-1,000 | 유지 | — |
| asc_sera_kunlun | 873 | 800-1,000 | 유지 | — |
| asc_kai_helheim | 877 | 800-1,000 | 유지 | — |
| asc_sol_kunlun | 899 | 800-1,000 | 유지 | — |
| asc_leon_asgard | 1,097 | 800-1,000 | **하향** | HP·DEF growth 축소 |
| asc_omar_valhalla | 1,383 | 800-1,000 | **대폭 하향** | DEF·HP 스탯+growth 대폭 축소 |
| asc_omar_avalon | 1,366 | 800-1,000 | **대폭 하향** | DEF·HP 스탯+growth 대폭 축소 |

#### SSR 전직영웅 (13명) — Lv60, 4성

| 영웅 ID | 현재 BP | 목표 BP | 조치 | 내용 |
|---------|--------|--------|------|------|
| asc_sera_avalon | 1,027 | 1,000-1,400 | 유지 | — |
| asc_kai_yomi | 1,029 | 1,000-1,400 | 유지 | — |
| asc_lin_takamagahara | 1,031 | 1,000-1,400 | 유지 | — |
| asc_sol_nature | 1,032 | 1,000-1,400 | 유지 | — |
| asc_leon_olympus | 1,262 | 1,000-1,400 | 유지 | SSR 최강, 정상 범위 |
| asc_luca_asgard | 940 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_iris_chaos | 944 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_hana_chaos | 967 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_iris_olympus | 973 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_iris_valhalla | 975 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_hana_yomi | 985 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_paolo_tartarus | 981 | 1,000-1,400 | **상향** | growthStats 버프 |
| asc_paolo_chaos | 993 | 1,000-1,400 | **상향** | growthStats 버프 |

### 3-3. 구체적 스탯 변경값

#### Omar SR 하향 (주요 원인: growthStats.def 7.6-7.8이 Lv50에서 DEF 500+ 유발)

**asc_omar_valhalla**:

| 필드 | 현재 | 변경 후 |
|------|------|--------|
| stats.hp | 700 | 650 |
| stats.def | 128 | 80 |
| growthStats.hp | 75 | 50 |
| growthStats.def | 7.6 | 3.5 |

예상 Lv50·3성 BP: 1,383 → **970**

**asc_omar_avalon**:

| 필드 | 현재 | 변경 후 |
|------|------|--------|
| stats.hp | 680 | 640 |
| stats.def | 138 | 82 |
| growthStats.hp | 72 | 48 |
| growthStats.def | 7.8 | 3.5 |

예상 Lv50·3성 BP: 1,366 → **940**

#### Leon Asgard SR 중간 하향

**asc_leon_asgard**:

| 필드 | 현재 | 변경 후 |
|------|------|--------|
| stats.hp | 580 | 560 |
| growthStats.hp | 56 | 46 |
| growthStats.def | 4.5 | 3.0 |

예상 Lv50·3성 BP: 1,097 → **958**

#### SSR growthStats 상향 (8영웅 공통 패턴: hp +6, atk +0.4)

| 영웅 ID | growthStats.hp 현→후 | growthStats.atk 현→후 | 예상 BP 현→후 |
|---------|---------------------|----------------------|-------------|
| asc_luca_asgard | 36 → 42 | 4.1 → 4.5 | 940 → **1,008** |
| asc_iris_chaos | 37 → 43 | 3.8 → 4.2 | 944 → **1,012** |
| asc_hana_chaos | 33 → 39 | 4.9 → 5.3 | 967 → **1,035** |
| asc_iris_olympus | 42 → 48 | 3.4 → 3.8 | 973 → **1,041** |
| asc_iris_valhalla | 45 → 51 | 3.1 → 3.5 | 975 → **1,044** |
| asc_paolo_tartarus | 36 → 42 | 4.8 → 5.2 | 981 → **1,050** |
| asc_hana_yomi | 36 → 42 | 4.7 → 5.1 | 985 → **1,053** |
| asc_paolo_chaos | 34 → 40 | 5.2 → 5.6 | 993 → **1,061** |

---

## 4. 성장 곡선 (플레이어 마일스톤 × 콘텐츠 요구 전투력)

### 4-1. 플레이어 마일스톤별 추정 파티 전투력

| 마일스톤 | 가정 파티 구성 | 장비 수준 | 추정 파티 BP | 달성 가능 스테이지 | 달성 가능 탑 층 |
|---------|------------|---------|------------|----------------|-------------|
| Day1 | 기본영웅 4×Lv10 | 없음 | ~1,600 | 1-3 | 층 9 |
| Day3 | R×1 + N×3, Lv20 | N장비 +3 | ~4,200 | 2-4 | 층 28 |
| Day7 | SR×2 + R×1 + N×1, Lv35 | R장비 +5 | ~7,500 | 4-4 | 층 52 |
| Day14 | SR×3 + SSR×1, Lv50/60 | SR장비 +8 | ~10,500 | 5-2 | 층 73 |
| Day30 | SSR×2 + SR×2, Lv60/50 | SSR+SR장비 +12 | ~13,000 | 5-5 (13,500) ✓ | 층 93 |
| Max | SSR×4 Lv60 6성 | SSR장비 +15 | 14,348 | 5-5 클리어 ✓ | 층 100 |

### 4-2. 스테이지·탑 요구 전투력 비교 (Option A 적용 후)

```
BP
14,500|                                              Max (14,348)
14,000|                                          탑100(14,260)──────────
13,500|                                      5-5(13,500)─────Day30(13,000)
13,000|
12,500|                               5-4(12,500)
12,000|                          5-3(12,000)
11,000|                     탑80(11,460)
10,000|               5-2(10,000)───────탑70(10,060)──Day14(10,500)
 9,000|          5-1(8,000)
 8,000|     탑50(7,260)──4-5(7,500)────Day7(7,500)
 5,000| 탑30(4,460)──3-5(5,000)
 2,000| 탑10(1,660)──1-5(1,500)──Day3(4,200)
   400| 탑1(400)──1-1(500)──Day1(1,600)
       |────────────────────────────────────────→ 진행도
        1-1  2-3  3-5  4-5  5-3  5-5  탑30  탑60  탑100
```

### 4-3. 5-5 미달 해소 검증 (Option A)

| 항목 | 값 |
|------|---|
| 5-5 요구 (변경 후) | 13,500 |
| 파티 상한 | 14,348 |
| 비율 | 1.063× (6.3% 여유) |
| Day30 추정 파티 | ~13,000 |
| Day30 vs 5-5 | 0.963× (3.7% 부족 → 추가 장비 강화로 해소 가능) |

결론: Option A 적용 시 헌신적 Day30 플레이어가 5-5 클리어 가능하며 Max 기준 충분한 여유 확보.

---

## 5. 탑 정합 (Tower Alignment)

### 5-1. 문제 진단

현행 탑은 층 1(500) → 층 100(~25,000) 선형 스케일. 층 56부터 파티 최대 전투력(14,348) 초과.

| 구간 | 현행 | 파티 달성 가능 여부 |
|------|------|-----------------|
| 층 50 | 12,630 | 가능 (Day14+ 도달) |
| 층 56 | ~14,100 | 경계 |
| 층 60 | 15,100 | **불가** (14,348 초과) |
| 층 70 | 17,580 | 불가 |
| 층 100 | ~25,000 | 불가 |

### 5-2. 새 탑 스케일링 (변경 후)

**공식**: `recommendedPower = 400 + 140 × (floor − 1)`

| 층 | 변경 전 | 변경 후 | 비고 |
|----|--------|--------|------|
| 1 | 500 | 400 | Day1 진입 가능 |
| 10 | 2,730 | 1,660 | Day3 도달 |
| 20 | 5,200 | 3,060 | |
| 30 | 7,680 | 4,460 | Day7 도달 |
| 50 | 12,630 | 7,260 | Day10 |
| 60 | 15,100 | 8,660 | Day14 이전 가능 ✓ |
| 80 | 20,050 | 11,460 | Day25 |
| 90 | ~22,500 | 12,860 | Day28 |
| 100 | ~25,000 | **14,260** | Max 파티(14,348) 이내 ✓ |

이 스케일링으로 층 100이 파티 상한 대비 99.4% (14,260/14,348)가 되어 최강 파티 구성 플레이어가 완주 가능.

---

## 6. 적 스탯 정합 (Enemy Stats Alignment)

### 6-1. 목표 전투 소요 턴수

| 전투 유형 | 목표 턴수 | 근거 |
|---------|---------|------|
| 일반 전투 | 3–8턴 | 게이지 빌드업 사이클 1회 완성 |
| 엘리트 | 5–12턴 | 스킬 2회 사용 |
| 보스 | 10–20턴 | 각성 스킬 최소 2회 |

### 6-2. 예상 플레이어 DPS (파티 합산)

| 마일스톤 | 파티 ATK 합 (추정) | 유효 DPS (vs avg DEF) |
|---------|-----------------|---------------------|
| Day1 | 300 | 270 |
| Day7 | 800 | 720 |
| Day14 | 1,400 | 1,250 |
| Day30 | 2,000 | 1,800 |
| Max | 2,600 | 2,300 |

### 6-3. 요구 적 HP 범위 (목표 3–8턴 달성)

| 챕터 | 플레이어 진입 시점 | 적 1체 목표 HP 범위 | 비고 |
|------|---------------|-----------------|------|
| 1챕터 (1-1~1-5) | Day1-2 | 810 – 2,160 | DPS 270 × 3–8 |
| 2챕터 (2-1~2-5) | Day3-4 | 1,350 – 3,600 | DPS 450 × 3–8 (성장 중) |
| 3챕터 (3-1~3-5) | Day5-7 | 2,160 – 5,760 | |
| 4챕터 (4-1~4-5) | Day7-14 | 2,880 – 7,680 | |
| 5챕터 (5-1~5-5) | Day14-30 | 4,500 – 12,000 | |

### 6-4. 현행 적 기본 스탯 vs 요구값 비교

enemies.json의 베이스 스탯은 스테이지 스케일링 전 원시값. 스케일 공식 미확인 상태에서 계층적 확인 필요.

| 적 종류 | 기본 HP | 챕터1 요구(810-2,160) | 판정 |
|--------|--------|---------------------|-----|
| enemy_slime | 250 | 요구 미달 | 스케일 확인 필요 |
| enemy_goblin | 200 | 요구 미달 | 스케일 확인 필요 |
| enemy_goblin_king (보스) | 600 | 요구 미달 | 스케일 확인 필요 |
| enemy_treant (엘리트) | 600 | 경계 | 스케일 확인 필요 |

> 결론: 기본값만으로는 1챕터에서 1턴 킬이 발생한다. 전투 시스템에 스테이지별 HP 곱 배율이 존재하는지 확인 후, 배율 적용 전 기준값으로 판단하는 것이 맞다. 검증 스크립트 실행 필수.

---

## 7. 경제 정합 (Day1-3)

SYSTEM_ONBOARDING_ECONOMY.md 기준 Day1-3 경제는 Option A 변경 후에도 유효.

| 항목 | 값 | 비고 |
|------|---|------|
| 초기 골드 | 10,000 | 1챕터 클리어 충분 |
| 초기 젬 | 2,700 | R 소환 3-4회 가능 |
| 초기 소환권 | 10장 | 튜토리얼 R 영웅 보장 |
| Day1 챕터 달성 | 1-3 (1,000 BP) | 추정 파티 1,600으로 달성 |
| Day3 챕터 달성 | 2-4 (3,500 BP) | 추정 파티 4,200으로 달성 |

Option A 적용으로 스테이지 요구 전투력이 낮아졌으므로 경제 밸런스는 동일하거나 약간 여유로워짐.

---

## 8. 검증 방법 (tools/simulate/)

### 8-1. 제안 검증 스크립트 목록

| 파일명 | 역할 | 핵심 assert |
|--------|------|------------|
| `tools/simulate/grade-order.js` | 모든 영웅을 최대레벨·기본성급으로 계산, 등급별 BP 밴드 검증 | `ssrBPs.every(bp => bp >= 1000)`, `srBPs.every(bp => bp < 1000)` |
| `tools/simulate/stage-clearable.js` | 각 스테이지 requirePower vs 파티 최대 전투력 비교 | `maxPartyBP >= requirePower for all stages` |
| `tools/simulate/tower-ceiling.js` | 탑 100층 requirePower vs 파티 상한 비교 | `towerFloor100Power <= 14348` |
| `tools/simulate/combat-turns.js` | 챕터별 적 HP × 플레이어 DPS → 소요 턴수 계산 | `3 <= turns <= 8 for normal fights` |
| `tools/simulate/economy-flow.js` | Day1-3 재화 수급/소모 시뮬레이션 | `goldBalance >= 0 through Day3` |

### 8-2. grade-order.js 핵심 로직

```javascript
// BP 계산 (BLK-03 공식 구현)
function calcMaxBP(hero) {
  const maxLv = hero.maxLevel;
  const hp = hero.stats.hp + hero.growthStats.hp * (maxLv - 1);
  const atk = hero.stats.atk + hero.growthStats.atk * (maxLv - 1);
  const def = hero.stats.def + hero.growthStats.def * (maxLv - 1);
  const spd = hero.stats.spd + hero.growthStats.spd * (maxLv - 1);
  const defaultStars = { N:1, R:2, SR:3, SSR:4 }[hero.rarity];
  const statMult = 1 + (defaultStars - 1) * 0.05;
  const spdMult  = 1 + (defaultStars - 1) * 0.025;
  return Math.floor(
    hp * statMult / 10 +
    atk * statMult +
    def * statMult +
    spd * spdMult
  );
}

// assert: SSR 최소 > SR 최대 (omars 제외 후 기준)
const ssrMin = Math.min(...ssrBPs);
const srMax  = Math.max(...srBPs.filter(/* omar excluded */));
assert(ssrMin >= 1000, `SSR 최소 BP ${ssrMin} < 1000`);
assert(srMax  < 1000,  `SR 최대 BP ${srMax} >= 1000`);
```

### 8-3. tower-ceiling.js 핵심 assert

```javascript
const floor100 = towerFloors.find(f => f.floor === 100);
assert(floor100.recommendedPower <= 14348,
  `탑 100층 ${floor100.recommendedPower} > 파티 최대 14348`);
```

---

## 9. 변경 요약

| 범주 | 변경 항목 수 | 파일 |
|------|------------|------|
| 스테이지 요구 전투력 | 2 (5-4, 5-5) | src/data/stages.json |
| 탑 층별 전투력 | 100 | src/data/tower.json |
| SR 영웅 하향 | 3 영웅 × 2-4 필드 | src/data/ascended-heroes.json |
| SSR 영웅 상향 | 8 영웅 × 2 필드 | src/data/ascended-heroes.json |
| **합계** | **약 130건** | 3개 파일 |

> 변경 기계 적용: docs/balance/balance-changes-v1.json 참조

---

## §9. 적용 결과 (2026-09-02)

> 실행 담당: executor (team-lead 위임) · 적용 도구: `tools/balance/apply-changes.mjs` · 검증 도구: `tools/simulate/{grade-order,stage-clearable,tower-ceiling,combat-turns,economy-flow}.mjs`

### 9-1. 적용 건수

`docs/balance/balance-changes-v1.json`의 JSON 엔트리는 **30건**(스테이지 2 + 탑 벌크 1 + 영웅 필드 27)이며, 탑 벌크 항목이 `floors[*]` 100개 층에 개별 대입되므로 **실제 필드 쓰기는 129건**이다.

| 파일 | JSON 엔트리 | 실제 필드 쓰기 |
|------|:-:|:-:|
| `src/data/stages.json` | 2 | 2 (5-4, 5-5의 `recommendedPower`) |
| `src/data/tower.json` | 1 | 100 (`floors[1..100].recommendedPower`) |
| `src/data/ascended-heroes.json` | 27 | 27 (`asc_omar_valhalla`/`asc_omar_avalon`/`asc_leon_asgard` 하향 + SSR 8명 상향) |
| **합계** | **30** | **129** |

`--dry-run` 검증에서 129건 전부 문서의 `from` 값과 실제 파일 현재값이 100% 일치(경고 0건)함을 확인한 뒤 실적용했다. `stages.json`의 실제 필드명은 `recommendedPower`이며(문서 path 표기 `requirePower`는 오탈자), 스크립트는 항상 실제 필드명을 대상으로 했다.

### 9-2. 검증 5종 결과 요약

| # | 스크립트 | 결과 | 핵심 수치 |
|---|---------|------|----------|
| (a) | `grade-order.mjs` | ✅ **PASS** | SSR 최소 BP 1,003 > SR 최대 BP 967 (둘 다 목표 밴드 안). Lv30 기본영웅 10명 전원 < 대응 전직영웅(만렙) — 역전 0건 |
| (b) | `stage-clearable.mjs` | ❌ **FAIL (1/25)** | 최대 파티 전투력 **13,347** (변경 전 14,348 대비 **-1,001, -7.0%**). 24/25 스테이지 통과, **5-5만 미달**(요구 13,500×1.05=14,175 > 13,347, 0.989×) |
| (c) | `tower-ceiling.mjs` | ❌ **FAIL** | 100층 요구 14,260 > 최대 파티 13,347 (0.936×, 부족 913). 100층 자체 값·단조증가는 설계대로 정확(PASS), **최대 파티로 실제 도달 가능한 최고층은 93층**(94~100층 7개 층 도달 불가) |
| (d) | `combat-turns.mjs` | ⚠️ **참고용 FAIL (12/25 이탈)** | 아래 9-4 상세. 오프라인 근사 시뮬레이션이며 정식 판정보다 데이터 이슈 발견용 |
| (e) | `economy-flow.mjs` | ✅ **PASS** | Day1/Day2/Day3 gems·gold가 `SYSTEM_ONBOARDING_ECONOMY.md` §3 수치와 **완전 일치**(Day1 gems 2,150/gold 13,070, Day2 gems 2,490, Day3(2차 10연 전) gems 2,870) — 이번 밸런스 변경이 온보딩 경제에 회귀를 일으키지 않음을 확인 |

### 9-3. 핵심 발견 — (b)/(c) 실패의 원인과 권장 조정 (데이터 변경 없이 제안만)

**원인**: §3-3의 Omar SR 하향(등급 역전 수정)과 §5-2의 "최대 성장 4인 파티" 상한 산정이 **서로 독립적으로 설계되어 불일치가 발생했다.**

`docs/BALANCE_REPORT.md` §5-2가 산정한 최대 파티 상한 14,348은 만렙·6성·풀장비·풀컬렉션 기준 전체 영웅 중 상위 4인 — `asc_omar_valhalla`(3,733) / `asc_omar_avalon`(3,713) / `asc_leon_olympus`(3,519) / `asc_leon_asgard`(3,383) — 을 채택한 값이었다. 그런데 이번 밸런스 v1이 등급 역전을 해소하려고 **바로 이 네 영웅 중 셋**(omar_valhalla/omar_avalon/leon_asgard)을 하향했다. 하향 후 이 세 영웅은 상위 4인에서 전부 탈락하고, 4인 전원이 SSR로 교체된다(`asc_leon_olympus` 3,519 / `asc_paolo_chaos` 3,284 / `asc_hana_yomi` 3,274 / `asc_paolo_tartarus` 3,270 = **13,347**). 즉 **"등급 역전 수정"에 쓰인 하향 대상이 정확히 "파티 상한"을 떠받치던 영웅들**이었고, 설계 문서는 등급 역전 수정 후 파티 상한을 재계산하지 않은 채 5-4/5-5(12,500/13,500)와 탑 100층(14,260)을 기존 14,348 기준으로 확정했다.

이 사실은 `tools/simulate/_maxParty.mjs`가 `docs/BALANCE_REPORT.md` §5-2와 동일한 방법론(만렙·6성·스킬 3종 Lv10·SSR+15 풀장비·풀컬렉션)으로 **변경 전 데이터에서 14,348을 오차 없이 재현**한 뒤, 같은 방법론을 변경 후 데이터에 적용해 확인했다.

**권장 조정안 (제안만, 데이터 미변경)**:

| 안 | 내용 | 예상 효과 |
|---|---|---|
| **A (권장)** | 5-5 요구치를 13,500 → **12,900 이하**로 추가 인하 (13,347×0.97 ≈ 12,946), 탑 100층을 14,260 → **13,300 이하**로 재스케일링 (예: `recommendedPower = 400 + 128×(floor-1)`, 100층=13,072) | 두 상한 모두 새 최대 파티(13,347) 이내로 복귀. §5-1의 "등차 +140/층" 설계 의도는 유지하되 기울기만 하향 |
| B | Omar 두 종을 §3-3 목표(SR 800-1,000)의 **상단**(예: BP 995~999)까지만 하향해 여유를 덜 깎기 | 등급 역전은 여전히 해소되지만 3,700대 최상위권에 남아 파티 상한 하락폭 축소. 단 SR 최대가 SSR 최소(1,003)에 근접해 밴드 여유가 줄어듦 |
| C | 4인 파티 상한 산정 시 "SSR 4인 한정" 기준(§5-2 원문에 이미 존재, 13,261)으로 전환 — 애초에 SR을 최강 파티에 포함하지 않는 원칙으로 명문화 | 향후 SR 밸런스 변경이 파티 상한에 영향을 주지 않도록 구조적으로 분리. 다만 이번 재계산값(13,347)도 이미 SSR 4인이므로 즉각 효과는 없음 |

**A를 권장하는 이유**: 5-4/5-5/탑100 세 값 모두 이번 라운드에서 이미 재조정된 값이라 추가 조정에 정책적 부담이 적고, §5-1의 등차수열 설계(플레이어 마일스톤 곡선과의 정합)를 그대로 유지할 수 있다.

### 9-4. (d) 전투 턴수 시뮬레이션 상세

**방법론 한계(설계 시점에 확인)**: `src/scenes/BattleScene.js`는 전투 로직을 자체 인라인으로 구현하고 `src/systems/BattleSystem.js`(Strategy/Command 패턴의 독립 전투 엔진)를 사용하지 않는다. 순수 `node` 실행 환경에서는 `BattleSystem.js → SaveManager.js → GameLogger.js`로 이어지는 임포트 체인이 확장자 없는 `.ts` 참조를 포함해(Vite/Vitest 리졸버 의존) 직접 import가 불가능하다(`tools/simulate/gacha-sim.mjs`가 동일한 이유로 SSOT 값 이식 방식을 쓴 전례를 따름). 따라서 `combat-turns.mjs`는 `calculateDamage`/`getMoodBonus`/`getAIAction` 등 실제 로직을 파일+라인 인용과 함께 그대로 이식했고, 파티 전투력은 `recommendedPower`가 아니라 `SYSTEM_ONBOARDING_ECONOMY.md`/`BALANCE_DESIGN_v1.md` §4-1의 실측 마일스톤(Day1~Day30)을 로그선형 보간해 추정했다(`recommendedPower` 그 자체는 "그 시점 실제 파티 전투력"이 아님 — 1-1 실측 비율이 이미 4.03×).

**결과**: 25개 중 12개가 목표(중앙값 3~8턴) 이탈.

| 유형 | 스테이지 | 해석 |
|------|---------|------|
| 너무 빠름(<3턴) | 1-3 (중앙값 2턴) | 튜토리얼 구간 의도된 압승(§1-4 근거, 실패 아님) |
| 너무 느림(>8턴) | 2-5(18), 4-2(10), 4-3(15), 4-4(13), 5-2(20), 5-3(26) | **챕터 2 후반부터 챕터5까지 단일/소수 강적(엘리트·보스) 스테이지가 DPS 곡선 대비 HP 과다** — 챕터가 진행될수록 이탈 폭이 커짐(4-4:13턴→5-3:26턴) |
| 승리 없음(전패/시간초과) | 3-5, 4-5, 5-1, 5-4, 5-5 | 마일스톤 파티가 해당 시점에 근소 열세(비율 1.49×~0.94×)일 때 단일 강적(보스) 상대로 패배율이 급증 — 3-5/4-5는 단일 보스 스탯이 특히 가파른 것으로 추정 |

**권장 조정(제안만)**:
1. `enemies.json`의 챕터3 후반~챕터5 엘리트/보스(`enemy_izanami`, `enemy_zeus`, `enemy_odin_allfather` 등)의 `growthStats`를 완만하게 재검토 — 레벨 증가에 따른 HP 성장이 파티 DPS 성장(주로 growthStats.atk)보다 가파른지 별도 확인 필요(enemies.json은 이번 작업 범위 밖).
2. 5-4/5-5의 이탈은 9-3의 파티 상한 부족과 같은 근본 원인일 가능성이 높음 — 9-3 조정안 A 적용 후 재시뮬레이션 권장.
3. 본 시뮬레이션은 아군에 스킬2/궁극기/힐러를 포함하지 않은 보수적 근사이므로, 실측 턴수는 표에 나온 값보다 짧을 가능성이 있음(특히 "너무 느림" 판정들은 재검증 시 완화될 수 있음). "승리 없음" 판정(3-5/4-5/5-1/5-4/5-5)은 파티가 근소 열세인 지점이라 스킬 추가만으로 뒤집힌다는 보장은 없음.

### 9-5. 결론 (v1)

밸런스 v1은 **등급 역전(SR>SSR) 문제를 완전히 해소**했고(9-2 (a) PASS), **Day1~3 온보딩 경제에 회귀가 없음**을 확인했다(9-2 (e) PASS). 다만 등급 역전 수정에 사용한 Omar 하향이 **"최대 파티 전투력" 산정에 쓰인 상위 4인 구성을 바꿔놓아**, 이 설계 문서 자체가 그 기준으로 확정한 5-5(13,500)와 탑 100층(14,260)이 근소하게(각각 0.989×, 0.936×) 미달 상태가 되었다(9-2 (b)/(c) FAIL, 9-3 상세). 9-3의 조정안 A(5-5를 12,900 이하로, 탑 100층을 13,300 이하로 추가 인하)를 다음 라운드에 적용해 재검증할 것을 권장한다. 전투 턴수(9-4)는 챕터4 후반~5의 보스/엘리트 스테이지가 DPS 곡선 대비 과도하게 오래 걸리거나 패배하는 경향을 보여, `enemies.json` 조정 시 참고 자료로 활용할 것을 권장한다(enemies.json은 이번 작업 범위 밖이라 데이터는 미변경).

---

## §9-6. v1.1 적용 결과 (2026-09-02, team-lead 승인 후속)

> 적용: `docs/balance/balance-changes-v1.1.json` + `tools/balance/apply-changes.mjs --file balance-changes-v1.1.json`

### 9-6-1. 적용 내용 (9-3 조정안 A 채택)

| 항목 | v1 | v1.1 | 근거 |
|---|---|---|---|
| 5-5 `recommendedPower` | 13,500 | **12,900** | 파티 상한(13,347) × 0.97 ≈ 12,946 → 12,900. 5-4(12,500) < 5-5(12,900) 단조 유지 |
| 탑 `recommendedPower` 공식 | 400 + 140×(floor−1), 100층=14,260 | **400 + 128×(floor−1), 100층=13,072** | 100층이 파티 상한(13,347) 이내로 복귀(비율 1.021×) |

dry-run 101건(스테이지 1 + 탑 100) 전부 from값 일치(경고 0) 확인 후 실적용. `ascended-heroes.json`은 v1.1에서 변경분 없음(재직렬화만 발생, 값 변화 없음).

### 9-6-2. 재검증 결과

| 스크립트 | 결과 |
|---|---|
| `grade-order.mjs` | ✅ PASS (변동 없음 — 영웅 데이터 미변경) |
| `tower-ceiling.mjs` | ✅ **PASS (100/100)** — 100층 요구 13,072 ≤ 파티 상한 13,347 (여유 275, 1.021×). 단조 증가·100층 값 검증 모두 통과 |
| `stage-clearable.mjs` | ⚠️ **FAIL 1/25 (24/25 PASS)** — 5-5만 미달: 파티 상한 13,347 ÷ 요구 12,900 = **1.035×** < 원 검증 기준(1.05×). 5-4(1.068×) 포함 나머지 24개는 전부 통과 |
| `economy-flow.mjs` | ✅ PASS (변동 없음) |

**중요 — 5-5는 team-lead 승인값(12,900)을 그대로 적용해도 stage-clearable.mjs의 1.05배 마진 기준을 만족하지 못한다.** 파티 상한이 절대적으로 요구치보다는 높으므로(1.035× > 1.0×) 이론상 "클리어 불가능"은 아니지만, 팀리드 원 지시(§작업 명세 "최대 파티 전투력 ≥ 스테이지 요구×1.05")가 요구하는 5% 여유는 확보하지 못했다. 산술적으로 1.05배 기준을 만족하려면 5-5 요구치가 **12,711 이하**여야 한다(13,347 ÷ 1.05 = 12,711.4). 25/25 PASS가 필요하면 5-5를 12,900 대신 **12,700 전후**로 추가 조정하는 결정이 필요하다 — 이번 라운드에서는 승인받은 12,900만 적용했고, 추가 조정은 team-lead 재승인 없이 임의로 수행하지 않았다.

### 9-6-3. 검증

- vitest 3연속 실행: **37 files / 1051 tests 전부 통과** (매 회 동일)
- `npx tsc --noEmit`: 0 errors
- `npm run build`: 성공(기존과 동일한 청크 크기 경고만, 신규 에러 없음)
- `tests/systems/TowerSystem.test.js`의 탑 곡선 기대값을 `400+128×(floor-1)`, 100층=13,072로 갱신

### 9-6-4. 결론

탑 100층은 v1.1로 완전히 해소되었다(100/100). 5-5는 24/25까지 개선되었으나 **1.05배 마진 기준으로는 여전히 0.015× 부족**하다. 전투 턴수 이슈(9-4, `enemies.json` 성장률 관련)는 이번 라운드에서 지시대로 데이터 미변경, 제안만 유지했다.

### 9-7. v1.2 — 5-5 최종 인하 (2026-09-02)

`balance-changes-v1.2.json` 적용: 5-5 `recommendedPower` 12,900 → **12,700**(파티 상한 13,347 ÷ 12,700 = 1.0509× ≥ 1.05× 마진 기준 충족, 5-4 12,500 < 5-5 12,700 단조 유지). `stage-clearable.mjs` 재실행 결과 **25/25 전체 PASS**. 이로써 (b)/(c) 검증이 모두 해소되었다 — 최종 확정치: 5-4 12,500 / 5-5 12,700 / 탑 100층 13,072.

### 9-8. v1.3 — `enemies.json` 성장률 조정 (2026-09-03, team-lead 지시)

> 적용: `docs/balance/balance-changes-v1.3.json` + `tools/balance/apply-changes.mjs --file balance-changes-v1.3.json` (해당 스크립트에 `enemies[id=X].fieldPath` 패턴을 새로 추가 — v1.3부터 `enemies.json`도 손편집 없이 델타로만 적용). 대상은 `enemies.json`뿐이며 `stages.json`/`tower.json`/`ascended-heroes.json`/`src/systems/**`는 미변경.

#### 9-8-1. 문제 재확인

9-4에서 참고용으로만 남겨뒀던 `combat-turns.mjs` 12/25 이탈을 이번 라운드에서 실제로 해소했다. 재확인 결과(적용 전, 60회 시행)는 9-4의 표와 사실상 동일했다 — 1-3(2턴, 하한 이탈), 2-5/4-2/4-3/4-4/5-2/5-3(과다), 3-5/4-5/5-1/5-4/5-5(전패 또는 전무승부).

#### 9-8-2. 근본 원인 — DEF 성장이 데미지감소 90% 캡을 넘기는 설계 결함

`BattleSystem.calculateDamage`(`src/systems/BattleSystem.js:1078-1081`)의 방어력 공식은 `defReduction = min(0.9, DEF/1000)`이다. 챕터4 후반~5의 다수 엘리트/보스(`enemy_zeus`, `enemy_draugr`, `enemy_fenrir_pup`, `enemy_frost_giant_minor`/`enemy_fire_giant`/`enemy_jotun`, `enemy_surtr`/`enemy_hel_servant`, `enemy_nidhogg`, `enemy_jormungandr`, `enemy_odin_allfather`)는 만렙 환산 DEF가 **500~1,502**까지 치솟아 90% 캡 근처이거나 캡을 초과했다. 캡에 걸리면 파티 유효 데미지가 원래 ATK의 10%까지 짓눌려 "전투가 끝나지 않는" 시간초과나, 반대로 파티가 먼저 죽는 전패가 발생했다(4-5/5-4/5-5는 캡 근접으로 인한 장기 교착, 5-1/3-5는 파티 대비 적 ATK도 동시에 과다해 전패). 특히 `enemy_jormungandr`(5-4 보조 적)는 원래 챕터4 최종보스급 스탯(base HP 3,000/growth 390)이 재사용된 것 자체가 과도했다.

#### 9-8-3. 조정 내용 (19개 적, 56개 필드)

| 적 | 등장 스테이지 | 조정 필드 | 비고 |
|---|---|---|---|
| `enemy_mushroom` | 1-3 | HP↑(150→400/30→60) | 2턴 하한 이탈 해소 |
| `enemy_rift_guardian` | 2-5 | HP↓(3200→1120/410→144) | 단일 보스 HP 과다 |
| `enemy_izanami` | 3-5 | HP·ATK·DEF↓ | 전패 해소 |
| `enemy_minotaur`, `enemy_harpy` | 4-2 | HP↓ | 다수 엘리트 누적 과다 |
| `enemy_titan_minor`, `enemy_cyclops_minor` | 4-3 | HP↓ | 〃 |
| `enemy_garden_guardian` | 4-4 | HP↓(마진 좁아 완만하게) | 비율 1.15×라 신중히 하향 |
| `enemy_zeus` | 4-5 | DEF growth 16→5, HP↓ | DEF 캡 근접이 근본원인 |
| `enemy_frost_giant_minor`, `enemy_fire_giant`, `enemy_jotun` | 5-2 | DEF growth→3, HP↓ | DEF 캡 근접 |
| `enemy_draugr`, `enemy_fenrir_pup` | 5-1 | DEF growth↓, HP↓ | DEF 캡 근접 + 전패 해소 |
| `enemy_surtr`, `enemy_hel_servant` | 5-3 | DEF growth→3, HP↓ | 파티 자체가 요구BP 미달(0.94×)인 마일스톤에서도 클리어 가능하도록 |
| `enemy_nidhogg`, `enemy_jormungandr` | 5-4 | HP·ATK·DEF↓ | jormungandr는 챕터4 최종보스급 스탯 재사용이 과도했음 |
| `enemy_odin_allfather` | 5-5 | HP·ATK·DEF↓ (챕터 내 최고 스탯은 유지) | DEF 90% 캡 초과가 근본원인 |

전체 델타는 `docs/balance/balance-changes-v1.3.json` 참조. `--dry-run` 검증에서 56건 전부 `from` 값이 실제 파일과 100% 일치(경고 0건) 확인 후 실적용.

#### 9-8-4. 전후 턴수 비교 (`combat-turns.mjs`, 스테이지당 60회 시행)

| 스테이지 | 적용 전 중앙값 | 판정(전) | 적용 후 중앙값 | 판정(후) |
|---|---:|:---:|---:|:---:|
| 1-1 | 4 | PASS | 4 | PASS |
| 1-2 | 3 | PASS | 3 | PASS |
| 1-3 | 2 | **FAIL(하한)** | 4 | PASS |
| 1-4 | 6 | PASS | 6 | PASS |
| 1-5 | 3 | PASS | 3 | PASS |
| 2-1 | 3 | PASS | 3 | PASS |
| 2-2 | 3 | PASS | 3 | PASS |
| 2-3 | 5 | PASS | 5 | PASS |
| 2-4 | 4 | PASS | 4 | PASS |
| 2-5 | 18~19 | **FAIL(과다)** | 5 | PASS |
| 3-1 | 5 | PASS | 5 | PASS |
| 3-2 | 5 | PASS | 5 | PASS |
| 3-3 | 8 | PASS | 8 | PASS |
| 3-4 | 7 | PASS | 7 | PASS |
| 3-5 | N/A(0승/60패) | **FAIL(전패)** | 6 | PASS |
| 4-1 | 5 | PASS | 5 | PASS |
| 4-2 | 10~11 | **FAIL(과다)** | 6 | PASS |
| 4-3 | 15~17 | **FAIL(과다)** | 6 | PASS |
| 4-4 | 13 | **FAIL(과다)** | 6 | PASS |
| 4-5 | N/A(1패/59초과) | **FAIL(전무승부)** | 5 | PASS |
| 5-1 | N/A(0승/60패) | **FAIL(전패)** | 5 | PASS |
| 5-2 | 20 | **FAIL(과다)** | 5 | PASS |
| 5-3 | 26~30 | **FAIL(과다)** | 5 | PASS |
| 5-4 | N/A(60초과) | **FAIL(전무승부)** | 5 | PASS |
| 5-5 | N/A(60초과) | **FAIL(전무승부)** | 6 | PASS |

적용 전 12/25 이탈 → 적용 후 **25/25 전체 PASS**, 전 스테이지 60/60 승리(전패·시간초과 0건). 참고: `combat-turns.mjs`는 크리티컬/데미지 분산에 시드 없는 `Math.random()`을 쓰는 근사 시뮬레이션이라 경계값(예: 1-5는 이번에 미변경이지만 2턴/3턴 사이에서 근소하게 흔들림)에서 실행마다 ±1턴 편차가 있을 수 있다. 200회 시행 재확인 시 25/25 안정적으로 PASS.

#### 9-8-5. 재검산 결과

| 검증 | 결과 |
|---|---|
| `grade-order.mjs` | ✅ PASS (변동 없음 — 영웅 데이터 미변경) |
| `stage-clearable.mjs` | ✅ PASS 25/25 (변동 없음 — 스테이지 요구치 미변경, enemies.json은 파티 상한 계산에 관여하지 않음) |
| `tower-ceiling.mjs` | ✅ PASS 100/100 (변동 없음) |
| `combat-turns.mjs` | ✅ **PASS 25/25** (9-8-4 표) |
| `economy-flow.mjs` | ✅ PASS (변동 없음) |
| `tests/data/stagesEnemies.test.js` | ✅ 4/4 통과 |
| vitest 전체 | 1560개 중 1558~1560개 통과 — 나머지 0~2건은 `src/systems/CultMechanicsSystem.js` 등을 동시에 수정 중인 다른 병렬 작업자(mech-02 등)로 인한 일시적 충돌이며 `enemies.json`/전투 턴수와 무관 (재실행 시 통과) |
| `npx tsc --noEmit` | 0 errors |

#### 9-8-6. 결론

`enemies.json`의 DEF 성장률이 90% 데미지감소 캡을 넘기던 설계 결함(챕터4 후반~5 다수 적)과, 1-3/2-5/4-2~4-4의 HP 과다를 동시에 해소해 `combat-turns.mjs` 25/25 전체 PASS를 달성했다. 조정은 문제가 확인된 19개 적(56개 필드)에 한정했고, `stages.json`/`tower.json`/`ascended-heroes.json`/`src/systems/**`는 손대지 않아 9-2~9-7의 기존 검증(등급 역전 해소, 파티 상한, 탑 100층, 온보딩 경제) 결과에 회귀가 없음을 확인했다.

### 9-9. v1.4 — 온보딩 실파티 모드 신설 + 챕터1 재조정 (2026-09-03, team-lead 지시)

> 적용: `docs/balance/balance-changes-v1.4.json` + `tools/balance/apply-changes.mjs --file balance-changes-v1.4.json`. `tools/simulate/combat-turns.mjs`에 `--onboarding` 플래그를 새로 추가(스크립트 수정, 데이터 아님). 대상은 `enemies.json`뿐이며 `stages.json`/`tower.json`/`ascended-heroes.json`/`src/systems/**`는 미변경.

#### 9-9-1. 배경 — "1-3인데 지는 게 이해가 안 간다"

9-8의 4인 마일스톤 시뮬레이션은 Day1~Day30 마일스톤 파티 전투력을 로그선형 보간한 **가상 파티**를 쓴다. 실제 신규 유저가 1-1~1-5에서 들고 있는 파티는 이것과 전혀 다르다 — `docs/story/SYSTEM_ONBOARDING_ECONOMY.md` §1-1/§1-5 실측: **1-1~1-3은 `base_iris` 1인**, **1-4~1-5는 `base_omar` 각성 후 2인**이다. 사용자가 "1-3에서 지는 게 이해가 안 간다"고 피드백한 근본 원인은 9-8(v1.3)에서 4인 마일스톤의 1-3 "2턴 하한 이탈"을 막으려 `enemy_mushroom` HP를 150→400(+167%)까지 올린 것이, 실제로 1-3을 치르는 **1인 파티에는 지나치게 과했던 것**이다.

#### 9-9-2. 온보딩 실파티 모드 (`--onboarding`) — 방법론

`combat-turns.mjs`에 새 플래그를 추가해 1-1~1-5만 실제 온보딩 파티로 재시뮬레이션한다(4인 마일스톤 모드는 그대로 유지, 상호 배타적 실행 경로).

- **아군 스탯**: `src/systems/ProgressionSystem.js`(calculatePower와 동일 SSOT)를 SSR로 그대로 불러 계산 — 하드코딩 근사가 아니라 실제 게임 공식.
- **아군 스킬킷 — 중요한 발견**: `src/data/base-heroes.json`에는 **`skills` 필드가 전혀 없다**(파일 전체 grep 확인). `HeroFactory.normalize()` → `BattleScene.js:403-422` → `BattleSceneAdapter.toBattleUnit()`(L139-141) 체인을 그대로 추적한 결과, 기본영웅은 실전에서 **`DEFAULT_BASIC_SKILL`(기본 공격만)로 폴백되어 스킬1을 전혀 쓰지 못한다**. 이는 이 스크립트의 수정 범위 밖인 실제 코드 동작(잠재적 버그 소지가 있으나 `enemies.json` 외 수정 금지 지시 범위 밖)이라 코드는 건드리지 않고, 시뮬레이션이 이 동작을 그대로 반영하도록 아군 스킬킷을 기본 공격 1개로 맞췄다.
- **파티 레벨 — 두 번째 중요한 발견**: `SYSTEM_ONBOARDING_ECONOMY.md` §1-5는 "1-1 Lv1 / 1-2 Lv2 / 1-3 Lv3"로 스테이지 클리어마다 +1레벨을 가정하지만, 이는 문서 작성 시점의 근사치였다. 실제 레벨업은 `ProgressionSystem.addExp`(`getExpForLevel(level) = level² × 100`)가 `BattleScene.js:2654-2676`에서 스테이지 클리어 시 `stage.rewards.exp`를 파티 인원수로 나눠 지급하는 방식이다. `stages.json`의 실제 rewards.exp(1-1:50, 1-2:60, 1-3:75, 1-4:150)로 직접 계산하면:

  | 스테이지 클리어 | 계산 | 결과 |
  |---|---|---|
  | 1-1 | 아이리스(1인) 0+50=50exp < 100(Lv1 필요치) | 레벨업 없음 |
  | 1-2 | 50+60=110 ≥ 100 | **Lv2**(잔여10exp) |
  | 1-3 | 10+75=85 < 400(Lv2 필요치) | 레벨업 없음, **Lv2 유지** |
  | 1-4 | 아이리스 160(85+75)<400 유지 / 오마르(1-3 직후 합류) 0+75=75<100 유지 | 둘 다 레벨업 없음 |

  즉 실제로는 **1-1/1-2 둘 다 아이리스 Lv1**이고 **1-3에서 처음 Lv2**가 되며, **1-4~1-5는 아이리스 Lv2 + 오마르 Lv1**로 동일하다. 문서의 "Lv3/Lv4~6" 가정보다 실제 파티가 상당히 약했다 — 이번 사용자 피드백의 진짜 근본 원인은 "v1.3의 mushroom HP 상향"과 "설계 문서보다 느린 실제 레벨업 곡선"이 겹친 것이다.
- **목표**: 1-1~1-3(1인) 승률 ≥95% · 중앙값 턴수 3~6, 1-4~1-5(2인) 승률 ≥90%(턴수 제약 없음). 시행 횟수 기본 300회(`--trials`로 조정 가능).

#### 9-9-3. 조정 내용과 4인 마일스톤 사이의 구조적 트레이드오프

| 적 | 등장 스테이지 | 조정 필드 | 비고 |
|---|---|---|---|
| `enemy_goblin` | 1-2(lv2) | growthStats.hp 40→15 | lv1(1-1)은 growth가 적용 안 돼 영향 없음 |
| `enemy_wolf` | 1-2 전용 | stats.hp 180→120 | |
| `enemy_mushroom` | 1-3 전용 | stats.hp 400→130, growthStats.hp 60→45 | v1.3 이전 원본(150/30)보다는 높지만 v1.3(400/60)보다 훨씬 낮음 |
| `enemy_golem` | 1-4 전용 | stats.hp 800→300, growthStats.hp 160→60, stats.atk 35→25, growthStats.atk 8→5 | 1-4 승률 40.5%→100% |

`enemy_mushroom`은 **4인 마일스톤과 온보딩 1인 파티를 동시에 만족시킬 수 없는 구조적 충돌**이 있다. 1-3의 4인 마일스톤 파티 전투력(1,600)은 권장 전투력(200)의 8배에 달하는 극단적 오버킬 구간이라, `selectSmartTarget`의 "빈사 대상 확정타 우선"(BattleSceneAdapter.js:299-330) 로직상 4인이 몰아치면 mushroom HP를 웬만큼 올려도(테스트: 130→4인 2턴, 220→4인 3턴이지만 그때 온보딩은 9턴으로 초과) 2~3턴 경계에서 벗어나지 않는 반면, 온보딩 1인 파티는 같은 HP에서 이미 6턴을 넘겨버린다(3개체를 1인이 순차 처치해야 하는 구조적 하한 때문에 반응 폭이 좁다). 여러 HP 값으로 실측한 결과(130/45→4인2턴·온보딩6턴, 170/40→4인2턴·온보딩7턴, 220/48→4인3턴·온보딩9턴, 230/50→4인3턴·온보딩9턴) 두 목표를 동시에 만족하는 값이 존재하지 않음을 확인했다. **이번 라운드는 실제 사용자 피드백(온보딩 승률)을 우선**해 130/45를 채택했고, 그 결과 4인 마일스톤 1-3만 다시 2턴(<3)으로 돌아간다. 원래 `BALANCE_DESIGN_v1.md` §9-4(v1.3 이전)도 이 결과를 "튜토리얼 구간 의도된 압승 — 실패 아님"으로 명시했던 사례라, 되돌아간 것이 새로운 문제라기보다는 v1.3에서 임시로 덮었던 원래 상태로 복귀한 것에 가깝다. `enemy_golem`은 1-4 전용(다른 스테이지 재사용 없음)이라 이런 충돌 없이 순수 개선이었다.

#### 9-9-4. 결과 (온보딩 모드, 300회 시행)

| 스테이지 | 파티 | 조정 전 승률/중앙값 | 조정 후 승률/중앙값 | 판정 |
|---|---|---|---|---|
| 1-1 | 아이리스 Lv1 | 100%/4턴 | 100%/4턴(변경 없음) | PASS |
| 1-2 | 아이리스 Lv1 | 100%/6턴 | 100%/6턴(변경 없음) | PASS |
| 1-3 | 아이리스 Lv2 | 100%/13턴 | **100%/6턴** | PASS(조정 전 FAIL) |
| 1-4 | 아이리스Lv2+오마르Lv1 | **27.5%**/29턴 | **100%/7턴** | PASS(조정 전 FAIL — 실질 패배) |
| 1-5 | 아이리스Lv2+오마르Lv1 | 100%/9턴 | 100%/9턴(변경 없음) | PASS |

5/5 전체 PASS. 조정 전 1-4의 27.5% 승률이 이번 피드백에서 실제로 체감됐을 "지는" 경험의 핵심 원인으로 보인다(1-3은 조정 전에도 승률 100%였으나 13턴으로 지나치게 길어 체감상 "막힌다"는 인상을 줬을 가능성이 크다).

#### 9-9-5. 4인 마일스톤 재검증 (`combat-turns.mjs`, 기본 60회 시행)

24/25 PASS(1-3만 FAIL, 9-9-3의 트레이드오프). 200회 시행으로 재확인 시 1-5(goblin_king, 이번에 미변경)는 시드 없는 RNG로 인한 경계값 흔들림(중앙값 2~3턴)일 뿐 안정적으로 PASS이며, 1-3만 안정적으로 FAIL(2턴)임을 확인했다.

#### 9-9-6. 나머지 검증

| 검증 | 결과 |
|---|---|
| `grade-order.mjs` | ✅ PASS (변동 없음) |
| `stage-clearable.mjs` | ✅ PASS 25/25 (변동 없음) |
| `tower-ceiling.mjs` | ✅ PASS 100/100 (변동 없음) |
| `economy-flow.mjs` | ✅ PASS (변동 없음) |
| `tests/data/stagesEnemies.test.js` | ✅ 7/7 통과 |
| `npx tsc --noEmit` | 0 errors |

#### 9-9-7. 결론과 team-lead 확인 필요 사항

온보딩 실파티 관점에서 챕터1의 진짜 문제(1-4 승률 27.5%, 1-3 v1.3발 13턴 장기전)를 해소했다. 다만 **`enemy_mushroom`은 4인 마일스톤(1-3 2턴 하한)과 온보딩 1인 파티(1-3 승률/턴수)를 동시에 만족시킬 수 없는 구조적 충돌**이 있었고, 이번 라운드는 사용자 피드백을 우선해 4인 마일스톤 1-3의 재실패를 감수했다. 원 설계 문서(§9-4)가 이 결과를 "실패 아님"으로 이미 명시했던 전례가 있어 회귀로 보진 않지만, team-lead가 이 트레이드오프에 동의하지 않는다면 (a) 4인 마일스톤 1-3의 3턴 하한 요건을 공식적으로 면제하거나 (b) 온보딩 1-3의 턴수 목표를 6턴보다 완화하는 두 옵션 중 하나를 재승인해야 한다.

### 9-10. 시뮬레이터 ↔ 실전투 괴리 (2026-09-04, `battle-cult-live` 회귀 조사)

> `SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/battle-cult-live.mjs` 가 28/3 로 떨어진 원인을 실측으로 추적한 기록. **결론: 밸런스 데이터 문제가 아니라 아군 스탯 산출 경로의 결함이었다.** `enemies.json`/`stages.json`/`tower.json`/`ascended-heroes.json` 은 이번 라운드에서 한 줄도 바뀌지 않았고, v1.5 델타도 만들지 않았다.

#### 9-10-1. 실측 — 아군은 레벨·성급이 붙지 않은 원본 스탯으로 싸우고 있었다

스모크는 Lv60·4성 전직영웅 3인을 지급하고 2-3에 출격한다. 실제 `BattleScene` 배틀러를 그대로 덤프한 값(수정 전):

| 유닛 | 세이브 레벨 | 실제 전투 스탯 | 있어야 할 값(레벨·성급 반영) |
|---|---|---|---|
| `asc_leon_olympus` | 60 | hp **580** / atk 94 / def 74 | hp 4,251 / atk 496 / def 354 |
| `asc_iris_olympus` | 60 | hp **450** / atk 63 / def 46 | hp 3,774 / atk 368 / def 246 |
| `asc_sol_nature` | 60 | hp **460** / atk 78 / def 46 | hp 3,549 / atk 420 / def 238 |
| `base_iris` | 1 | hp 900 / atk 103 | hp 990 / atk 113 |

hp 가 JSON 원본 `stats.hp` 와 정확히 일치한다 — **`growthStats × (level-1)` 도, 성급 보너스도 전혀 적용되지 않았다.** Lv60 SSR 전직영웅이 Lv1 기본영웅보다 약했다. 2-3 의 적 3체 합계 ATK 666 에 아군 총 HP 2,390 이면 4라운드에 전멸하고, 실제로 5턴에 전멸했다(Divine Charge 60/100 에서 중단 → Lightning Strike 미발동 → 실패 2건).

#### 9-10-2. 원인 — `hero.stats` 가 레벨 이전 값이었다

- 전투력·스탯 표시의 SSOT 는 `ProgressionSystem.getFinalStats()`(레벨 → 성급 → 장비 → 컬렉션 순 적용)이고, `combat-turns.mjs` 는 아군을 만들 때 이 함수를 쓴다(`--onboarding` 은 L349, 4인 마일스톤은 `finalStatsAtMax`).
- 그런데 실제 게임의 아군은 `HeroFactory.createFromCharacterData()` → `registry.ownedHeroes` → `StageSelectScene.startBattle()` → `BattleScene.initializeBattlers()` → `toBattleUnit({ stats: hero.stats })` 경로를 탄다. 이 체인의 출발점이 `stats: options?.stats || { ...charData.stats }` 로 **JSON 원본을 그대로 실어 보냈다.** `toBattleUnit` 은 "씬이 계산한 스탯을 진실로 삼는다"(BattleSceneAdapter.js L155-156)라서 원본이 그대로 전투 스탯이 됐다.
- 적은 무관했다 — `calculateEnemyStats()` 가 `stats + growth × (level-1)` 을 제대로 적용하고 있어 시뮬레이터와 동일하다. **괴리는 아군 쪽에만 있었다.**

수정: `HeroFactory.createFromCharacterData()` 가 `ProgressionSystem.getFinalStats()` 로 스탯을 산출하도록 바꾸고(`HeroFactory.resolveFinalStats()`), 결과 객체에 `statsResolved: true` 표식을 달았다. `ProgressionSystem.resolveCharacterData()` 는 이 표식을 보면 원본 JSON 을 다시 조회해, 이미 최종치인 스탯에 성장분이 두 번 곱해지는 것을 막는다.

같은 뿌리의 표시 결함도 함께 고쳤다 — `stageSelectLayout.estimateHeroPower()` 가 `HP + ATK×5 + DEF×3 + SPD×2` 라는 별도 눈금을 써서 `stages.json` 의 `recommendedPower` 와 5배 가까이 어긋나 있었다(1인 파티로도 모든 스테이지가 "압승"으로 표시돼 벽 경고가 뜨지 않았다). 전투력 SSOT 와 같은 `HP/10 + ATK + DEF + SPD` 로 맞췄다.

#### 9-10-3. 온보딩 실파티를 실제 BattleScene 에서 돌린 결과

사용자 피드백("1-3인데 지는 게 이해가 안 간다") 확인을 위해 `tests/e2e/onboarding-realbattle.mjs` 를 새로 만들어, `--onboarding` 과 **같은 파티 스펙**으로 진짜 씬을 10회씩 돌렸다.

| 스테이지 | 파티 | 시뮬레이터(중앙값 턴) | 실전투 수정 전 | 실전투 수정 후 |
|---|---|---|---|---|
| 1-1 | 아이리스 Lv1 | 4 | 100% / 7턴 | 100% / 7턴 |
| 1-2 | 아이리스 Lv1 | 6 | 100% / 10턴 | 100% / 9턴 |
| 1-3 | 아이리스 Lv2 | 6 | 100% / 11턴 | 100% / 10턴 |
| 1-4 | 아이리스Lv2+오마르Lv1 | 7 | 100% / 9턴 | 100% / 7턴 |
| 1-5 | 아이리스Lv2+오마르Lv1 | 9 | 100% / 11턴 | 100% / 9턴 |

두 가지가 드러났다.

1. **챕터 1 승률은 수정 전에도 100%** 였다. v1.4 의 조정(§9-9)이 유효하다는 뜻이고, 이번 사용자 피드백의 잔여 불만은 "져서"가 아니라 **"레벨을 올려도 아무것도 달라지지 않아서"** 일 가능성이 크다. 수정 전 로그에서 `base_iris` 는 **Lv1 과 Lv2 의 스탯이 완전히 동일**(hp900/atk90)했다 — 레벨업·성급·장비·컬렉션 보너스가 전투에 전혀 반영되지 않았다.
2. **턴수는 실전투가 시뮬레이터보다 1.2~1.5배 길다**(예: 1-3 시뮬 6턴 vs 실전투 10턴). 턴 계수 단위는 동일하다(양쪽 모두 "라운드 1바퀴 = 1턴": `BattleScene.processTurn()` L1944 ↔ `combat-turns.mjs simulateBattle()` L271). 남은 후보는 (a) 시뮬의 온보딩 모드가 기본영웅 스킬킷을 아직 `DEFAULT_BASIC_SKILL` 한 개로 고정해 두고 있는 점 — §9-9-2 작성 시점에는 맞았으나 `base-heroes.json` 에 `skills` 가 부여된 뒤로는 낡았다 — 과 (b) 씬 전용 경로(`applySynergyBuffs`, 지연 호출 기반 행동 순서)의 차이다. 둘 다 실전투를 **더 빠르게** 만들 요인이라 부호가 반대이므로, 원인 규명은 후속 과제로 남긴다. **턴수 밴드(3~8턴)를 실제 플레이 기준으로 재확인하려면 이 격차부터 좁혀야 한다.**

#### 9-10-4. 검증

| 검증 | 결과 |
|---|---|
| `npx vitest run` | 71 파일 / 1,904 테스트 통과 |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | ✅ built |
| `boot-smoke` | 6 passed / 0 failed |
| `battle-cult-live` | **32 passed / 0 failed** (조사 전 28~30/2~3) |
| `onboarding-realbattle`(신규) | 5/5 스테이지 승률 100% |
| `npm run test:e2e:story` | boot 6 · cutscene 21 · ascension 21 · skip-parity 17 · onboarding-full 63 — 전부 0 failed |
| `combat-turns.mjs` | 24/25 (1-3 만 §9-9-3 트레이드오프 — 변동 없음) |
| `combat-turns.mjs --onboarding` | 5/5 PASS (변동 없음) |
| `stage-clearable.mjs` | 25/25 PASS (변동 없음) |
| `tower-ceiling.mjs` | 100/100 PASS (변동 없음) |
| `grade-order.mjs` | PASS (변동 없음) |
| `economy-flow.mjs` | PASS (변동 없음) |

검산 5종이 전부 "변동 없음"인 이유는 시뮬레이터가 처음부터 `getFinalStats()` 를 쓰고 있었기 때문이다 — 이번 수정은 **실전투를 시뮬레이터 쪽으로 맞춘 것**이지 그 반대가 아니다.

#### 9-10-5. 부수 영향 — `onboarding-full.mjs` 전투 안내 구간

이 수정으로 `onboarding-full.mjs` 의 `boostParty()`(모든 캐릭터 Lv60 + 상위 4인 편성)가 **비로소 실제로 동작하게 되면서**, 첫 전투 1-1(고블린 2마리, 합계 HP 400)이 1라운드에 끝나 전투 안내 B-1~B-5 가 재생될 시간이 없어졌다(B-2~B-5 실패 5건). 수정 전에는 "Lv60 보강"이 스탯에 반영되지 않아 우연히 전투가 길게 유지되던 것이다.

테스트 쪽을 고쳤다 — 첫 전투는 **스타터 1인(Lv1)** 으로 치르고(라운드마다 한 마리씩 잡으므로 자동전투가 꺼진 동안 안내 5스텝이 다 뜬다), 전투 안내를 마친 직후 `boostPartyFull()` 로 Lv60 4인을 편성해 남은 스테이지를 진행한다. `npm run test:e2e:story` 연속 2회 전부 0 failed.

다만 근본 취약점은 남아 있다: **첫 전투가 짧게 끝나면 B-1~B-5 가 영구히 미완료로 남아 이후 모든 전투에서 다시 뜬다**(테스트의 "두 번째 전투에서는 다시 뜨지 않는다" 항목이 이 상태를 잡는다). `tutorial.json` 의 `fallbackPolicy.autoCommitAfterSec: 25` 가 씬 종료 시에는 발동하지 않기 때문으로, 실제 유저(강한 파티로 1-1 을 즉시 클리어하는 복귀 유저 등)에게도 재현될 수 있다. 전투 종료 시 미완료 전투 스텝을 정리하는 처리는 튜토리얼 담당 후속 과제로 남긴다.
