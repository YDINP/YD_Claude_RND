# ArcaneCollectors — 교단(Cult) 시스템 설계 문서

> **작성일**: 2026-03-04
> **상태**: 설계 초안 (game-system-designer)
> **연관 문서**: CHARACTER_SYSTEM_GDD.md, PRD_Unified_v5.md

---

## 목차

1. [설계 철학](#1-설계-철학)
2. [교단별 전투 특성 (12개 교단)](#2-교단별-전투-특성)
3. [교단 간 상성 시스템](#3-교단-간-상성-시스템)
4. [교단 파티 시너지](#4-교단-파티-시너지)
5. [클래스 × 교단 조합 특성](#5-클래스--교단-조합-특성)
6. [미정령 / 일반캐릭터 스탯 설계](#6-미정령--일반캐릭터-스탯-설계)
7. [MVP 4교단 영웅 스탯 초안 (Lv.60 SSR)](#7-mvp-4교단-영웅-스탯-초안)
8. [구현 우선순위](#8-구현-우선순위)

---

## 1. 설계 철학

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **플레이스타일 차별화** | 교단마다 숫자만 다른 게 아니라 전투 "방식" 자체가 다름 |
| **다층 록-페이퍼-시저스** | 단순 삼각관계가 아닌 4~6개 교단 순환 상성 구조 |
| **Pay-to-Progress, Not Pay-to-Win** | SSR이 강하지만, R/SR의 교단 특성 활용으로 전략 역전 가능 |
| **Mood × Cult 이중 상성** | 기존 Mood 상성(Brave/Cunning/Calm/Wild)에 교단 상성 추가 (독립 레이어) |

### 교단 그룹 분류 (전투 철학)

```
[공세 교단] Olympus, Valhalla, Chaos
  → 강타, 버스트 딜, 공격적 메커니즘
  → "빨리 죽이면 나도 안 죽는다"

[제어 교단] Yomi, Tartarus, Helheim
  → 디버프, CC, 필드 장악
  → "상대가 행동 못 하면 이긴다"

[지속 교단] Kunlun, Avalon, Nature
  → 재생/힐링, 장기전, 버프 누적
  → "버티면 내가 이긴다"

[균형 교단] Asgard, Takamagahara, Balance
  → 올라운더, 시너지 촉매, 변칙 전략
  → "상황에 따라 뭐든 된다"
```

---

## 2. 교단별 전투 특성

### 설계 규칙

각 교단은 다음 3가지 요소로 정의된다:

- **핵심 메커니즘 (Signature Mechanic)**: 해당 교단만의 고유 전투 시스템
- **패시브 특성 (Cult Trait)**: 교단 소속 캐릭터에게 항상 적용되는 기본 효과
- **전투 정체성 키워드**: 3개 키워드로 플레이스타일 요약

---

### 2-1. Olympus (올림푸스) — 그리스 신화

> **컨셉**: 신들의 왕 제우스의 위엄. 번개와 심판으로 상대를 압도.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Divine Charge (신성 충전)**: 공격 시 `Divinity` 게이지 쌓임. 게이지 100% 시 다음 스킬에 `Lightning Strike` 추가 (추가 ATK×50% 번개 피해 + 20% 확률 스턴 1턴) |
| **패시브 특성** | `Glory Aura`: 턴 시작 시 아군 중 HP가 가장 높은 1명에게 ATK +10% 버프 1턴 |
| **고유 상태이상** | `Thunderstruck`: 기절 + 다음 피격 피해 30% 증가 |
| **플레이스타일** | 폭딜 → 순간 제압 → 연속 압박 |
| **키워드** | `번개` `권위` `순간폭발` |

**수치 설계**:
- Divine Charge 충전량: 기본 공격 +15 / 스킬 공격 +30 / 궁극기 +0 (궁극기 사용 시 게이지 소모)
- Lightning Strike 추가 피해: ATK × 0.5 (방어 무시 15%)
- Thunderstruck 지속: 1턴

---

### 2-2. Valhalla (발할라) — 북유럽 신화 (전사의 낙원)

> **컨셉**: 죽어도 싸우는 전사들. HP가 낮을수록 더 강해지는 베르세르크.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Berserker Rage (베르세르크 분노)**: HP가 최대 HP의 50% 이하일 때 ATK +25%, HP 30% 이하일 때 ATK +50% 추가. 사망 시 1회 한정 `Last Stand` — HP 1로 부활 + 그 턴 모든 피해 무효화 |
| **패시브 특성** | `Warrior's Pride`: 적에게 받는 치명적 피해(한 방에 HP 40% 이상)를 차단하고 최대 HP의 15%로 환산 (1턴 쿨다운) |
| **고유 상태이상** | `Frenzy Mark`: 해당 적이 Valhalla 캐릭터에게 공격받을 시 피해 +20% |
| **플레이스타일** | 맞으면서 강해짐 → 버텨서 역전 → 자폭형 공격 |
| **키워드** | `베르세르크` `역전` `불굴` |

**수치 설계**:
- HP 50~100%: ATK +0% (기본)
- HP 30~50%: ATK +25%
- HP 1~30%: ATK +50%
- Last Stand: 전투당 1회, HP 1 부활 후 1턴 무적
- Frenzy Mark 지속: 2턴

---

### 2-3. Asgard (아스가르드) — 북유럽 신화 (신들의 요새)

> **컨셉**: 신들의 요새. 룬 문자의 지혜로 파티 전체를 버프하는 지원형 공세.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Rune Inscription (룬 각인)**: 스킬 사용 시 아군 1명에게 무작위 `룬`을 새김 (공격 룬/방어 룬/속도 룬). 같은 캐릭터에 룬 3개 적층 시 `Runeburst` — 해당 턴 모든 스킬 피해 +40% |
| **패시브 특성** | `Bifrost Link`: 아군 캐릭터 중 1명이 사망할 때, 해당 캐릭터의 ATK 수치를 파티 전체에 1턴간 버프 |
| **고유 상태이상** | `Rune Shield`: 피해 1회 완전 흡수 (일종의 방패) |
| **플레이스타일** | 룬 적층 관리 → 폭발 타이밍 조율 → 파티 강화 |
| **키워드** | `룬` `누적` `파티강화` |

**수치 설계**:
- 공격 룬: ATK +15%
- 방어 룬: DEF +15%
- 속도 룬: SPD +15%
- Runeburst 발동: 룬 3개 동시 적용 시 (다음 스킬에만 적용)
- Bifrost Link 발동: 사망 캐릭터 ATK를 파티 ATK 보너스로 1턴 적용

---

### 2-4. Avalon (아발론) — 아서리안 전설

> **컨셉**: 성배의 기사단. 방어와 치유로 아군을 수호하는 철벽 교단.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Holy Ward (성스러운 수호)**: 매 턴 시작 시 HP가 가장 낮은 아군에게 ATK×30%의 `Barrier` 생성 (피해 흡수 방어막). 방어막이 파괴될 때 파괴한 적에게 `Holy Thorns` — 받은 피해의 50% 반사 |
| **패시브 특성** | `Round Table Bond`: 아군 중 Avalon 교단 캐릭터 수만큼 모든 치유량 +10% 누적 (최대 +40%) |
| **고유 상태이상** | `Sacred Wound`: 해당 적이 받는 치유 효과 50% 감소 |
| **플레이스타일** | 방어막 → 반격 유도 → 치유 루프 |
| **키워드** | `방어막` `치유` `반사` |

**수치 설계**:
- Holy Ward 방어막 기본값: 행동 캐릭터 ATK × 0.3
- Holy Thorns 반사: 방어막 파괴 직전 피해량의 50%
- Round Table Bond: Avalon 캐릭터 1명당 치유 +10% (최대 4명 = +40%)
- Sacred Wound 지속: 3턴

---

### 2-5. Takamagahara (타카마가하라) — 일본 신화 (천상)

> **컨셉**: 아마테라스의 빛. 속도와 기선제압으로 선제를 지배.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Kami no Ma (신의 간격)**: 전투 시작 시 SPD가 가장 높은 아군 1명이 `선제 행동` 획득 (상대보다 SPD에 상관없이 무조건 먼저 행동). 전투 3턴 이내 적을 처치 시 `Heaven's Gift` — 해당 캐릭터 스킬 쿨다운 즉시 초기화 |
| **패시브 특성** | `Sunlit Grace`: SPD가 적 파티 평균 SPD보다 높을 경우 크리티컬 확률 +15% |
| **고유 상태이상** | `Dazzle (눈부심)`: 해당 적 명중률 -30%, 스킬 발동 확률 -20% |
| **플레이스타일** | 초반 선제 → 쿨다운 리셋 → 압도적 행동 횟수 |
| **키워드** | `선제` `속도` `기선제압` |

**수치 설계**:
- Kami no Ma: 전투 첫 턴에만 적용, SPD 최고 캐릭터 선제 1회
- Heaven's Gift 조건: 3턴 이내 적 처치
- Sunlit Grace 크리 +15%: 자신 SPD > 적 파티 평균 SPD일 때
- Dazzle 지속: 2턴

---

### 2-6. Kunlun (곤륜) — 중국 신화

> **컨셉**: 선계의 조화. 독과 디버프로 서서히 적을 잠식하는 도교 전략.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Five Poisons (오독 시스템)**: 적에게 5종 상태이상(`독/빙결/침묵/허약/저주`) 각 1개씩 부여 가능. 적에게 동시에 3종 이상 부여 시 `Chaos Bloom` 발동 — 턴 시작 시 최대 HP의 5% 고정 피해 + 모든 디버프 지속 1턴 연장 |
| **패시브 특성** | `Immortal Herb`: 아군 중 1명이 상태이상 걸릴 때마다 해당 캐릭터 HP를 ATK×20% 회복 |
| **고유 상태이상** | `Withering (시들음)`: HP 회복 불가 + 피해를 받을 때마다 방어력 -5% 누적 (최대 3스택 = -15%) |
| **플레이스타일** | 디버프 적층 → Chaos Bloom 지속 → 아군 유지력 확보 |
| **키워드** | `독` `디버프` `장기전` |

**수치 설계**:
- 오독 각 지속: 독(3턴), 빙결(2턴), 침묵(2턴), 허약(ATK-20%, 2턴), 저주(크리피해+30% 수신, 2턴)
- Chaos Bloom 조건: 적 1명에게 동시에 3종 이상
- Chaos Bloom 고정 피해: 적 최대 HP × 0.05 (방어 무시)
- Immortal Herb 회복: 아군 상태이상 1건당 ATK × 0.2

---

### 2-7. Yomi (요미) — 일본 신화 (명계)

> **컨셉**: 이자나미의 저주. 죽음과 소멸로 즉사와 암흑 피해를 다루는 교단.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Death Gaze (사안)**: 피해를 입힐 때마다 적에게 `Doom` 스택 +1 누적. 적의 Doom 스택이 10 이상일 때 `Death Sentence` — 다음 Yomi 스킬 공격 시 적 현재 HP의 20%를 추가 피해로 지급 (보스 등 즉사 면역 적에게도 적용). 적 사망 시 Doom 스택 전이: 사망한 적 인접 적에게 절반 전이 |
| **패시브 특성** | `Underworld Link`: 이미 사망한 아군이 있을 경우 Yomi 캐릭터의 ATK +10% 누적 (최대 3명 = +30%) |
| **고유 상태이상** | `Cursed Soul (저주 영혼)`: 사망 시 부활 불가 (Avalon의 방어막/부활 스킬 무효화) |
| **플레이스타일** | Doom 적층 → 처형 딜 → 아군 희생으로 강화 |
| **키워드** | `처형` `누적` `저승` |

**수치 설계**:
- Doom 1 스택 획득 조건: 모든 피해 적중 시 (스킬/기본공격 무관)
- Death Sentence 발동 기준: Doom ≥ 10
- 현재 HP 기반 추가 피해: 현재 HP × 0.20
- Doom 스택 전이: 사망 적 보유 스택의 50% (소수점 버림)
- Underworld Link: 사망 아군 1명당 +10%

---

### 2-8. Helheim (헬헤임) — 북유럽 신화 (망자의 나라)

> **컨셉**: 헬의 냉기. 얼음과 침묵으로 적의 행동을 완전히 봉쇄하는 CC 전문 교단.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Frost Cage (서리 감옥)**: 적을 기절/빙결/침묵 상태로 만들 때마다 해당 적에게 `Cold Stack` +1. Cold Stack 3 이상인 적은 `Permafrost (영구 결빙)` — 해당 적의 SPD 완전 봉쇄 + 받는 피해 +25% (Cold Stack은 턴마다 -1씩 감소) |
| **패시브 특성** | `Numbing Aura`: 적 파티 전체 SPD -10% (전투 시작 시 적용, 전투 내내 유지) |
| **고유 상태이상** | `Frostbite (동상)`: HP 재생/방어막 불가 + 이동 불가 (SPD 체크 시 SPD = 0으로 처리) |
| **플레이스타일** | CC 중첩 → 행동 봉쇄 → 일방적 공격 |
| **키워드** | `빙결` `침묵` `행동봉쇄` |

**수치 설계**:
- Cold Stack 감소: 매 적 턴마다 -1
- Permafrost 발동: Cold Stack ≥ 3
- Permafrost SPD 봉쇄: 해당 턴 SPD = 0 처리 (행동 불가)
- Permafrost 피해 증가: +25%
- Numbing Aura: 전투 시작 시 적 SPD 10% 감소 (디버프 아닌 고정 수치 감소)

---

### 2-9. Tartarus (타르타로스) — 그리스 신화 (심연)

> **컨셉**: 올림푸스의 반대편. 티탄의 힘으로 방어를 무시하는 깊은 심연의 교단.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Titan Force (티탄의 힘)**: 적의 방어력을 등급화해 무시. 적 DEF가 자신 ATK의 30% 이상이면 초과분 DEF의 50%를 무시. DEF가 ATK의 60% 이상이면 `Titan's Wrath` — DEF 80% 무시 + 피해 +30% |
| **패시브 특성** | `Abyss Gaze`: 적 캐릭터의 방어막/보호막 효과를 공격 시 HP와 방어막 동시 피해로 처리 (방어막 우선 깎는 대신 방어막 × 0.5 + HP × 0.5로 분산) |
| **고유 상태이상** | `Titanfall`: 해당 적의 스킬 배율 -20% (강타할수록 약해짐) |
| **플레이스타일** | 탱커/방어 중심 편성 파괴 → 방패 관통 → 지속 압박 |
| **키워드** | `방어무시` `방패관통` `압박` |

**수치 설계**:
- Titan Force 발동 조건 A: 적 DEF ≥ 자신 ATK × 0.3 → 초과 DEF의 50% 무시
- Titan Force 발동 조건 B: 적 DEF ≥ 자신 ATK × 0.6 → DEF 80% 무시 + 피해 +30%
- Abyss Gaze 방어막 관통: 피해 = 방어막 × 0.5 + HP × 0.5 동시 적용
- Titanfall 지속: 2턴, 스킬 배율 -20%

---

### 2-10. Balance (균형) — 판타지 원리

> **컨셉**: 세계의 균형 수호자. 교단 상성을 무력화하고 중립적 전략의 촉매.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Equilibrium (평형)**: 파티 내 아군의 현재 HP 편차가 클수록 강해짐. 가장 높은 HP 아군과 가장 낮은 HP 아군의 HP 차이를 균형 포인트로 측정. 차이가 최대 HP의 30% 이상이면 모든 Balance 캐릭터 ATK/DEF +15%. 반대로 파티 HP가 균등할수록(차이 10% 이하) 크리 확률 +20% |
| **패시브 특성** | `Neutrality`: Balance 교단 캐릭터는 모든 교단 상성 효과를 50% 감소시킴 (유리한 상성 혜택도, 불리한 상성 피해도 절반으로) |
| **고유 상태이상** | `Imbalance (불균형)`: 해당 적의 교단 시너지 효과 완전 무효화 (아군 시너지는 유지) |
| **플레이스타일** | 상성 구조 초월 → 상황 대응형 → 유연한 파티 구성 |
| **키워드** | `중립` `상성무력화` `균형` |

**수치 설계**:
- Equilibrium HP 차이 30% 이상: ATK/DEF +15%
- Equilibrium HP 차이 10% 이하: 크리 확률 +20%
- Neutrality: 유리 상성 보너스 × 0.5, 불리 상성 페널티 × 0.5
- Imbalance 지속: 3턴

---

### 2-11. Chaos (혼돈) — 원초적 힘

> **컨셉**: 예측 불가의 혼돈. 무작위성을 통해 막대한 이득 또는 손해를 얻는 도박형 교단.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Wild Card (와일드 카드)**: 매 턴 시작 시 Chaos 캐릭터가 무작위 `Chaos Effect` 발동. 효과는 매 턴 다름 (10종 중 무작위). 범주: 대형 버프(2종) / 대형 디버프(2종) / 적 피해(3종) / 아군 회복(2종) / 특수 효과(1종) |
| **패시브 특성** | `Chaotic Energy`: 스킬 사용 시 25% 확률로 해당 스킬 효과가 2회 발동 (코스트/쿨다운 추가 소모 없음). 단 10% 확률로 스킬이 `오발사(Misfire)` — 적 대신 아군 무작위 1명에게 피해 |
| **고유 상태이상** | `Chaos Brand (혼돈 낙인)`: 해당 적이 행동할 때마다 무작위 자가 디버프 발생 (ATK-10% / DEF-10% / SPD-10% 중 1개) |
| **플레이스타일** | 도박형 고분산 플레이 → 운 기반 대역전 → 불안정하지만 잠재력 MAX |
| **키워드** | `무작위` `도박` `고분산` |

**Chaos Effect 10종 목록**:

| 번호 | 효과 | 범주 |
|------|------|------|
| 1 | 파티 전체 ATK +30% (1턴) | 대형 버프 |
| 2 | 파티 전체 피해 무효화 (1턴) | 대형 버프 |
| 3 | 파티 전체 ATK -20% (1턴) | 대형 디버프 |
| 4 | 파티 전체 DEF -20% (1턴) | 대형 디버프 |
| 5 | 적 전체에게 ATK×100% 피해 | 적 피해 |
| 6 | 적 랜덤 1명에게 ATK×300% 피해 | 적 피해 |
| 7 | 적 전체 SPD -30% (2턴) | 적 피해 |
| 8 | 아군 전체 HP 30% 즉시 회복 | 아군 회복 |
| 9 | 아군 전체 방어막 ATK×50% | 아군 회복 |
| 10 | 무작위 적 1명 스킬 쿨다운 최대치로 설정 | 특수 효과 |

---

### 2-12. Nature (자연) — 태초의 힘

> **컨셉**: 대지와 생명의 순환. 시간이 지날수록 강해지는 성장형 교단.

| 항목 | 내용 |
|------|------|
| **핵심 메커니즘** | **Growth Ring (나이테 성장)**: 매 턴 경과마다 파티 내 Nature 캐릭터 전원의 스탯이 점증. 1턴: ATK +2%, 2턴: +4% 누적, 3턴: +6% 누적... 최대 10턴: ATK +20% 고정. DEF도 동일 비율로 성장. 턴이 길어질수록 무조건 강해짐 |
| **패시브 특성** | `Root of Life`: 전투 종료 후 생존한 Nature 캐릭터는 다음 전투 시작 시 HP 20% + 성장 스택 2턴 이월 |
| **고유 상태이상** | `Overgrowth (과성장)`: 해당 적의 이동/회피 불가 + 매 턴 시작 시 최대 HP의 3% 지속 피해 |
| **플레이스타일** | 초반 버팀 → 중후반 지배 → 극장기 무적 성장 |
| **키워드** | `성장` `지속전` `대지` |

**수치 설계**:
- Growth Ring 스택: 턴당 ATK/DEF +2% 누적, 최대 +20% (10턴)
- Root of Life 이월: 다음 전투 시작 시 2턴 분량 스택 적용 (ATK/DEF +4%)
- Overgrowth 고정 피해: 적 최대 HP × 0.03 (방어 무시), 지속 3턴

---

## 3. 교단 간 상성 시스템

### 3-1. 설계 원칙

> 기존 Mood 상성(Brave/Cunning/Calm/Wild)은 유지하되, 교단 상성은 **독립 레이어**로 추가.
> 최종 피해 배율 = 기본 피해 × Mood 상성 배율 × 교단 상성 배율

### 3-2. 교단 상성 구조 — 다층 순환 그래프

```
[공세 트라이앵글]
Olympus → Chaos (번개가 혼돈을 제압)
Chaos → Valhalla (예측불가가 분노를 교란)
Valhalla → Olympus (불굴이 번개의 권위에 도전)

[제어 트라이앵글]
Yomi → Tartarus (저주가 티탄을 갉아먹음)
Tartarus → Helheim (힘이 얼음을 깨부숨)
Helheim → Yomi (냉기가 저주를 봉인)

[지속 트라이앵글]
Kunlun → Nature (독이 자연의 생명력을 저해)
Nature → Avalon (끝없는 성장이 방패를 압도)
Avalon → Kunlun (성배의 정화가 독을 제거)

[균형 트라이앵글]
Asgard → Olympus (룬의 지혜가 번개의 권위를 견제)
Balance → Asgard (균형이 룬의 폭발을 억제)
Takamagahara → Balance (신속이 균형을 흔듦)

[크로스 상성 — 공세 vs 제어]
Olympus → Helheim (번개가 얼음을 녹임)
Yomi → Chaos (죽음이 혼돈을 잠재움)

[크로스 상성 — 제어 vs 지속]
Tartarus → Avalon (방어 무시가 방어막을 파괴)
Kunlun → Helheim (독이 냉기와 결합해 치명적)

[크로스 상성 — 공세 vs 균형]
Valhalla → Balance (분노가 중립을 타격)
Takamagahara → Chaos (선제가 혼돈을 봉쇄)
```

### 3-3. 교단 상성 수치 테이블

| 공격 교단 | 유리 상대 교단 | 불리 상대 교단 | 중립 |
|-----------|-------------|-------------|------|
| Olympus | Chaos, Helheim | Asgard, Valhalla | 나머지 |
| Valhalla | Olympus, Balance | Chaos, Takamagahara | 나머지 |
| Chaos | Valhalla | Olympus, Yomi, Takamagahara | 나머지 |
| Asgard | Olympus, Balance | Valhalla | 나머지 |
| Takamagahara | Balance, Chaos | Olympus | 나머지 |
| Yomi | Tartarus, Chaos | Helheim | 나머지 |
| Helheim | Yomi | Olympus, Kunlun | 나머지 |
| Tartarus | Avalon, Helheim | Yomi | 나머지 |
| Kunlun | Helheim, Avalon | Nature(중립) | 나머지 |
| Avalon | Kunlun, Tartarus | Nature | 나머지 |
| Nature | Avalon, Tartarus | Kunlun | 나머지 |
| Balance | Asgard, Takamagahara | Valhalla, Olympus | 나머지 |

### 3-4. 교단 상성 보너스 수치

| 상성 상태 | 피해 배율 | 설명 |
|----------|---------|------|
| 강세 (Advantage) | × 1.25 | 유리한 교단 공격 시 |
| 중립 (Neutral) | × 1.00 | 상성 없는 교단 간 |
| 약세 (Disadvantage) | × 0.80 | 불리한 교단 공격 시 |

> **중요**: Mood 상성 (×1.2 / ×0.8)과 교단 상성 (×1.25 / ×0.80)은 곱연산
> 최대 버프 시 피해 배율: 1.2 (Mood) × 1.25 (교단) = **× 1.50**
> 최소 배율: 0.8 (Mood) × 0.80 (교단) = **× 0.64**

---

## 4. 교단 파티 시너지

### 4-1. 설계 원칙

- 같은 교단 캐릭터를 많이 편성할수록 파티 전체에 보너스
- 2명 이상부터 활성화, 최대 4명 편성 기준 설계
- 교단 고유 시너지는 기존 `synergies.json`의 `cultSynergies` 와 별도로 교단별 특화 효과 추가

### 4-2. 교단별 파티 시너지 상세표

| 교단 | 2명 시너지 | 3명 시너지 | 4명 시너지 |
|------|----------|----------|----------|
| **Olympus** | Divine Charge 충전량 +30% | Lightning Strike 스턴 확률 50%→70% | 궁극기 사용 시 전체 적에게 번개 피해 ATK×80% |
| **Valhalla** | Last Stand 발동 횟수 +1 (총 2회) | HP 30% 이하 시 전체 파티 ATK +10% 추가 | 사망 시 남은 파티원 ATK +15% 영구 적층 |
| **Asgard** | 룬 무작위 → 원하는 종류 선택 가능 | Runeburst 쿨다운 50% 감소 | 매 3턴마다 파티 전체 자동 룬 1개 부여 |
| **Avalon** | Holy Ward 방어막 값 +50% | Round Table Bond 최대 +60%로 상향 | Sacred Wound 자동 전파: 적 1명에게 Sacred Wound 부여 시 다른 적 1명에게도 전파 |
| **Takamagahara** | 전투 시작 SPD 상위 2명 선제 행동 | Heaven's Gift 발동 조건 5턴 이내로 완화 | Dazzle 지속 +1턴, 부여 확률 +20% |
| **Kunlun** | Chaos Bloom 발동 조건 3종→2종 완화 | Withering 스택 최대 5 (기존 3) | 매 턴 적 파티 전체에 무작위 디버프 1개 자동 부여 |
| **Yomi** | Death Sentence 추가 피해 현재 HP 30%로 증가 | Doom 스택 전이율 50%→80% | 전투 시작 시 적 파티 모두에게 Doom 2 스택 선부여 |
| **Helheim** | Numbing Aura SPD 감소 -10%→-20% | Permafrost 발동 조건 3→2 스택으로 완화 | 매 2턴마다 Cold Stack 최다 적에게 Frostbite 자동 부여 |
| **Tartarus** | Abyss Gaze 방어막 관통 비율 개선 (방어막×0.3+HP×0.7) | Titan's Wrath 발동 조건 ATK×0.6→0.4로 완화 | 전투 시작 시 적 방어막 전부 파괴 |
| **Chaos** | Wild Card 발동 빈도 매 턴→매 턴 2회 | 오발사 확률 10%→5% 감소 | Chaos Effect 풀 10종에서 우호 효과 6종만 사용으로 전환 |
| **Nature** | Growth Ring 성장 속도 ×1.5 | Root of Life 이월 스택 4턴으로 증가 | 전투 시작 시 즉시 5턴 성장 스택 선적용 (ATK/DEF +10%) |
| **Balance** | Neutrality로 교단 불리 상성 완전 무효 | Imbalance 지속 +1턴, 자동 부여 확률 +30% | 전투 내 Balance 캐릭터 사망 불가 (최소 HP 1 유지, 1회 한정) |

---

## 5. 클래스 × 교단 조합 특성

### 5-1. 설계 원칙

> 같은 클래스(warrior 등)라도 교단에 따라 **서브 아이덴티티**가 달라짐.
> 스탯 보정 + 고유 수식어(flavor mechanic)로 차별화.

### 5-2. MVP 4교단 × 3클래스 조합표

#### Warrior (전사) 클래스 조합

| 교단 | 서브 아이덴티티 | 클래스 특성 보정 | 고유 수식어 |
|------|-------------|--------------|----------|
| **Olympus Warrior** | 번개 검사 (Lightning Swordsman) | ATK +10%, HP -5% | 기본 공격마다 Divine Charge +5 추가 |
| **Valhalla Warrior** | 베르세르크 전사 (Berserker) | HP +15%, DEF -10% | Berserker Rage ATK 보너스 +10% 추가 |
| **Kunlun Warrior** | 선인 전사 (Celestial Fighter) | DEF +10%, SPD +5% | 기본 공격마다 독 10% 확률 부여 |
| **Avalon Warrior** | 성기사 (Holy Knight) | HP +10%, DEF +10%, ATK -5% | 자신에게 Holy Ward 방어막 생성량 +50% |

#### Mage (마법사) 클래스 조합

| 교단 | 서브 아이덴티티 | 클래스 특성 보정 | 고유 수식어 |
|------|-------------|--------------|----------|
| **Olympus Mage** | 제우스 마법사 (Zeus Arcanist) | ATK +15%, HP -10%, DEF -10% | Lightning Strike 피해 ATK×70%로 강화 |
| **Valhalla Mage** | 룬 마법사 (Runecaster) | ATK +10%, SPD -5% | 스킬 사용 시 Frenzy Mark 부여 확률 +30% |
| **Kunlun Mage** | 독술사 (Poison Sage) | ATK +5%, SPD +10% | 모든 스킬에 독 부여 효과 자동 추가 (20% 확률) |
| **Avalon Mage** | 성배 마법사 (Grail Mage) | ATK -5%, HP +15% | 스킬 피해의 30%를 HP가 가장 낮은 아군에게 흡수로 전환 |

#### Healer (힐러) 클래스 조합

| 교단 | 서브 아이덴티티 | 클래스 특성 보정 | 고유 수식어 |
|------|-------------|--------------|----------|
| **Olympus Healer** | 신탁 사제 (Oracle Priest) | SPD +10%, ATK +5% | 치유량의 20%를 Divinity 게이지로 전환 |
| **Valhalla Healer** | 발키리 (Valkyrie) | HP +10%, ATK +5% | 아군 부활 시 해당 캐릭터에게 Berserker Rage 즉시 발동 |
| **Kunlun Healer** | 선의 (Celestial Healer) | SPD +15%, DEF +5% | 치유 시 대상 캐릭터의 모든 디버프 제거 (50% 확률) |
| **Avalon Healer** | 원탁 의사제 (Round Table Cleric) | HP +20%, ATK -10% | Holy Ward 방어막을 치유량 1.5배 값으로 생성 가능 |

### 5-3. 클래스별 기본 스탯 배분 비율

| 클래스 | HP | ATK | DEF | SPD |
|-------|-----|-----|-----|-----|
| Warrior | 120% | 90% | 110% | 85% |
| Mage | 75% | 130% | 70% | 100% |
| Archer | 90% | 110% | 80% | 130% |
| Healer | 100% | 70% | 90% | 115% |
| Assassin | 80% | 120% | 75% | 140% |
| Tank | 150% | 70% | 130% | 70% |

> 기준: 해당 등급(R/SR/SSR) 기준 스탯 × 위 배율 적용

---

## 6. 미정령 / 일반캐릭터 스탯 설계

### 6-1. 티어별 스탯 발현율 정의

| 티어 | 최대 레벨 | 스탯 발현율 | 컨셉 |
|------|---------|----------|------|
| 미정령 (Unbound Spirit) | Lv. 20 | 40~50% | 원초적 힘, 미각성 |
| 일반캐릭터 (Common Hero) | Lv. 40 | 60~70% | 교단 지정, 클래스 각성 |
| 전직 영웅 R (Ascended R) | Lv. 40 | 70% | 가벼운 전직 |
| 전직 영웅 SR (Ascended SR) | Lv. 50 | 85% | 중급 전직 |
| 전직 영웅 SSR (Ascended SSR) | Lv. 60 | 100% | 완전 각성 |

### 6-2. 미정령 기준 스탯 (등급 없음, 공통)

미정령은 교단/클래스 미지정 상태이므로 클래스 배분 적용 전 기본값 사용.

| 레벨 | HP | ATK | DEF | SPD |
|------|-----|-----|-----|-----|
| Lv. 1 | 200 | 20 | 15 | 80 |
| Lv. 10 | 380 | 36 | 28 | 88 |
| Lv. 20 (최대) | 580 | 52 | 40 | 95 |

- **성장 공식**: HP = 200 + (레벨-1) × 20 / ATK = 20 + (레벨-1) × 1.7 / DEF = 15 + (레벨-1) × 1.3 / SPD = 80 + (레벨-1) × 0.8
- **교단 특성 미적용**: 미정령은 교단 패시브/메커니즘 발동 안 됨
- **Mood 상성만 적용**: 미정령에도 Mood(Brave/Cunning/Calm/Wild/Mystic)는 배정됨

### 6-3. 일반캐릭터 기준 스탯 (교단/클래스 지정 후)

교단 지정 완료, 클래스 배율 적용. 아래는 Warrior 기준 예시 (R 등급 기준값 기반).

| 레벨 | HP (Warrior) | ATK (Warrior) | DEF (Warrior) | SPD (Warrior) |
|------|------------|-------------|-------------|-------------|
| Lv. 1 | 420 | 42 | 52 | 68 |
| Lv. 20 | 720 | 70 | 88 | 78 |
| Lv. 40 (최대) | 1,050 | 100 | 125 | 90 |

- 발현율 60~70%: 전직 SSR 영웅 최종 스탯 기준 65% 적용
- 교단 패시브 특성 절반만 적용 (60% 수준, 전직 영웅은 100%)
- 핵심 메커니즘은 미발동 (전직 영웅만 발동)

> **전략적 역할**: 일반캐릭터는 초반 파티 채우기 + 시너지 카운트 채우기용. SSR이 없어도 4교단 일반캐릭터로 교단 시너지 4명 달성 가능.

---

## 7. MVP 4교단 영웅 스탯 초안

### 7-1. 설계 기준값 (SSR Lv.60)

| 스탯 | Warrior | Mage | Healer |
|------|---------|------|--------|
| **HP** | 2,800~3,200 | 1,800~2,200 | 2,400~2,800 |
| **ATK** | 220~260 | 320~380 | 160~200 |
| **DEF** | 180~220 | 100~130 | 140~170 |
| **SPD** | 100~115 | 110~125 | 120~135 |

### 7-2. Olympus 교단 SSR 영웅 (Lv.60 목표치)

| 영웅 | 클래스 | HP | ATK | DEF | SPD | 핵심 스킬 |
|------|-------|-----|-----|-----|-----|---------|
| **Zeus (제우스)** | Warrior | 3,000 | 250 | 200 | 105 | Lightning Dominion: 전체 공격 + Thunderstruck 50% 확률 / Divine Charge 배율 ×1.5 |
| **Athena (아테나)** | Mage | 2,100 | 360 | 115 | 120 | Aegis Blast: 단일 ATK×280% + 방어막 동시 생성 / Wisdom Mark: 적 받는 피해 +20% (3턴) |
| **Apollo (아폴론)** | Healer | 2,600 | 185 | 155 | 130 | Solar Hymn: 아군 전체 HP+ATK×150% + SPD +20% / Sun Charge: 치유량의 30%를 Divine Charge로 전환 |

**Olympus 교단 특성 적용**:
- Zeus: Divine Charge 충전 기본 공격 +20 (Warrior 보정)
- Athena: Lightning Strike 피해 ATK×70% (Mage 보정)
- Apollo: 치유→Divinity 게이지 전환 (Healer 보정)

---

### 7-3. Valhalla 교단 SSR 영웅 (Lv.60 목표치)

| 영웅 | 클래스 | HP | ATK | DEF | SPD | 핵심 스킬 |
|------|-------|-----|-----|-----|-----|---------|
| **Thor (토르)** | Warrior | 3,200 | 240 | 190 | 100 | Mjolnir Slam: 단일 ATK×300% + 스턴 / 베르세르크 ATK 보너스 +10% 추가 |
| **Freya (프레이야)** | Mage | 1,900 | 350 | 105 | 115 | Völva's Wrath: 전체 ATK×200% + Frenzy Mark 전체 부여 / HP 50% 이하 시 스킬 배율 +30% |
| **Brynhildr (브륀힐드)** | Healer | 2,700 | 175 | 160 | 125 | Valkyrie's Embrace: 사망 아군 HP 60%로 부활 + 부활 캐릭터 즉시 Berserker Rage 발동 / Last Stand 발동 시 추가 아군 모두 ATK +20% |

**Valhalla 교단 특성 적용**:
- Thor: Last Stand 2회 (Warrior 보정) + HP 체크 단계 단축
- Freya: Frenzy Mark 부여 시 추가 ATK 보너스 적용 (Mage 보정)
- Brynhildr: 부활 후 Berserker Rage 자동 발동 (Healer 보정)

---

### 7-4. Kunlun 교단 SSR 영웅 (Lv.60 목표치)

| 영웅 | 클래스 | HP | ATK | DEF | SPD | 핵심 스킬 |
|------|-------|-----|-----|-----|-----|---------|
| **Sun Wukong (손오공)** | Warrior | 2,900 | 245 | 175 | 110 | 72 Transformations: 3턴간 형태 변환 — 매 턴 다른 교단 캐릭터의 핵심 메커니즘 모방 / 기본 공격 독 부여 30%로 강화 |
| **Xi Wangmu (서왕모)** | Mage | 2,000 | 355 | 110 | 130 | Peach of Immortality: 전체 디버프 + Withering 적용 / 독 상태 적에게 ATK×50% 추가 피해 |
| **Guanyin (관음)** | Healer | 2,700 | 180 | 155 | 135 | Lotus Healing: 아군 전체 HP+ATK×180% + 디버프 제거 75% / 치유 시 독 부여 면역 2턴 부여 |

**Kunlun 교단 특성 적용**:
- Sun Wukong: Warrior 보정으로 기본 공격 독 확률 30% (기본 10% → 30%)
- Xi Wangmu: Poison Sage 보정 — 모든 스킬에 독 자동 추가
- Guanyin: 치유 시 디버프 제거 75% 확률 (기본 50%)

---

### 7-5. Avalon 교단 SSR 영웅 (Lv.60 목표치)

| 영웅 | 클래스 | HP | ATK | DEF | SPD | 핵심 스킬 |
|------|-------|-----|-----|-----|-----|---------|
| **Arthur (아서)** | Warrior | 3,100 | 230 | 215 | 102 | Excalibur: ATK×260% 단일 + Sacred Wound 확정 부여 / Holy Ward 자신 생성량 +75% |
| **Merlin (멀린)** | Mage | 2,200 | 340 | 120 | 118 | Arcane Dominion: 전체 ATK×180% + 방어막 ATK×100% 전체 생성 / 스킬 피해 30% 아군 HP 흡수 |
| **Morgan le Fay (모건)** | Healer | 2,900 | 170 | 165 | 128 | Fae Blessing: 아군 전체 HP+ATK×200% + Holy Ward 방어막 ATK×80% / Round Table Bond 최대 +60%로 상향 (3인 시너지 효과 1인에서 적용) |

**Avalon 교단 특성 적용**:
- Arthur: Holy Knight 보정 — Holy Ward 방어막 생성량 +75% (Warrior 서브 아이덴티티)
- Merlin: 피해의 30% 흡수 → 최저 HP 아군 전달 (Mage 보정)
- Morgan: Holy Ward 방어막을 치유량 1.5배 값으로 생성 (Healer 보정)

---

## 8. 구현 우선순위

### Phase 1 — MVP (즉시 구현 가능)

| 우선순위 | 항목 | 복잡도 | 비고 |
|---------|------|-------|------|
| P0 | 교단 상성 수치 테이블 적용 | 낮음 | 기존 Mood 상성과 곱연산 |
| P0 | 클래스 × 교단 스탯 보정 | 낮음 | 배율 적용만 |
| P0 | 미정령 / 일반캐릭터 기준 스탯 | 낮음 | 수치 입력 |
| P1 | MVP 4교단 SSR 영웅 스탯 데이터 | 낮음 | heroes.json 작성 |
| P1 | 교단 파티 시너지 2명 보너스 | 중간 | 파티 구성 감지 로직 |

### Phase 2 — Core (핵심 메커니즘)

| 우선순위 | 항목 | 복잡도 |
|---------|------|-------|
| P2 | Olympus: Divine Charge 게이지 | 중간 |
| P2 | Valhalla: Berserker Rage + Last Stand | 중간 |
| P2 | Avalon: Holy Ward 방어막 + Holy Thorns | 중간 |
| P2 | Kunlun: Five Poisons + Chaos Bloom | 높음 |
| P2 | 교단 파티 시너지 3~4명 보너스 | 중간 |

### Phase 3 — Full (전체 교단)

| 우선순위 | 항목 | 복잡도 |
|---------|------|-------|
| P3 | Asgard: Rune Inscription 시스템 | 높음 |
| P3 | Takamagahara: 선제 행동 시스템 | 중간 |
| P3 | Yomi: Doom 스택 + Death Sentence | 높음 |
| P3 | Helheim: Cold Stack + Permafrost | 높음 |
| P3 | Tartarus: Titan Force 방어 계산 | 중간 |
| P3 | Chaos: Wild Card 무작위 시스템 | 높음 |
| P3 | Nature: Growth Ring 누적 시스템 | 중간 |
| P3 | Balance: Equilibrium HP 감지 | 높음 |

---

## 부록 — 교단 정체성 요약 카드

```
┌─────────────────────────────────────────────────────────────────┐
│ OLYMPUS     │ 번개 폭딜 │ Divine Charge → Lightning Strike       │
│ VALHALLA    │ 역전 불굴 │ HP↓↓ = ATK↑↑, Last Stand              │
│ ASGARD      │ 룬 강화   │ 룬 적층 → Runeburst 폭발               │
│ AVALON      │ 방어 반격 │ Holy Ward 방어막 → Holy Thorns 반사    │
│ TAKAMAGAHARA│ 선제 속공 │ Kami no Ma 선제 → Heaven's Gift 리셋  │
│ KUNLUN      │ 독 지속딜 │ 5종 디버프 → Chaos Bloom 고정 피해     │
│ YOMI        │ 처형 누적 │ Doom 스택 → Death Sentence 현재HP%피해 │
│ HELHEIM     │ CC 봉쇄   │ Cold Stack → Permafrost 완전 행동불가  │
│ TARTARUS    │ 방어무시  │ Titan Force → 방패/방어막 관통          │
│ CHAOS       │ 도박 분산 │ Wild Card 무작위 → 초고분산 플레이      │
│ NATURE      │ 성장 장기 │ Growth Ring 매턴 성장 → 후반 무적      │
│ BALANCE     │ 중립 유틸 │ 상성 초월 → Imbalance 시너지 무효화    │
└─────────────────────────────────────────────────────────────────┘
```

---

[완료 요약]
작성 문서: CULT_SYSTEM_DESIGN.md
담당 에이전트: game-system-designer
다음 권장 작업:
  1. heroes.json 파일 생성 — 이 문서의 MVP 36명 스탯 데이터 입력 (game-system-designer)
  2. cults.json 업데이트 — 기존 5교단 → 12교단으로 확장, 각 교단 메타데이터 추가 (executor)
  3. BattleSystem.js 수정 — 교단 상성 피해 계산 로직 추가 (Mood 상성과 곱연산) (executor-high)
  4. CULT_CHARACTER_REDESIGN.md 작성 — 교단별 세계관/비주얼 방향 (game-narrative-designer)
  5. 전투 시뮬레이터 단위 테스트 — 교단 메커니즘 수치 검증 (qa-tester)
