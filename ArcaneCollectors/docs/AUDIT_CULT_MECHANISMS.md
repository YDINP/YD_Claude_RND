# MECH-01 — 교단(Cult) 메커니즘 감사 보고서

> **작성일**: 2026-08-25
> **감사 범위**: `src/systems/BattleSystem.js`, `src/systems/BattleSystemV2.js`, `src/systems/SynergySystem.js`, `src/systems/MoodSystem.js`, `src/systems/PersonalitySystem.js`
> **대조 문서**: `docs/CULT_SYSTEM_DESIGN.md` (12기관 시그니처 메커니즘), `src/data/cults.json` v2.1, `src/data/ascended-heroes.json` v2.0
> **결론 요약**: **`cultEffect`(예: `thunderstruck_40`)는 런타임 코드에서 단 한 곳도 읽히지 않는다.** 12기관 시그니처 메커니즘은 전부 미구현이며, 현재 전투에서 교단이 기여하는 것은 "스탯 %" 레이어(SynergySystem 교단 시너지, V2의 교단×성격 보너스)뿐이다.

---

## 1. 추적 결과 — `cultEffect` 데이터 플로우

### 1-1. 데이터에는 존재 (57개 토큰)

`src/data/ascended-heroes.json`의 24명 전직 영웅 스킬에 `cultEffect` 필드가 존재한다:

```json
// ascended-heroes.json L34-L41 (asc_iris_olympus.skill1)
{
  "id": "skill1",
  "name": "뇌신의 일격",
  "multiplier": 2.2,
  "gaugeCost": 100,
  "target": "single",
  "cultEffect": "thunderstruck_40"   // ← 이 필드
}
```

전체 grep 결과, `cultEffect` 문자열은 **데이터 파일(ascended-heroes.json)과 설계 문서(EVOLUTION_SYSTEM_GDD.md)** 에만 등장하고 `src/systems/**`, `src/scenes/**` 어디에서도 읽지 않는다.

### 1-2. 전투 코드에서 소실되는 지점

| 경로 | 파일/위치 | cult 처리 여부 |
|------|----------|--------------|
| 유닛 생성 | `BattleSystem.js:287` `BattleUnit` 생성자 | ❌ `this.cult` 자체를 저장하지 않음 (`mood`, `rarity`만 보존) |
| 스킬 디스패치 | `BattleSystem.js:150-155` `SKILL_STRATEGIES` 맵 | ❌ `skill.id`(basic/skill1/heal/aoe) 키로만 분기. `cultEffect` 미참조 |
| 데미지 계산 | `BattleSystem.js:880` `calculateDamage()` | ❌ 배율 = DEF 감쇠 × **Mood 상성** × 크리 × 분산. 교단 항목 없음 |
| 시너지(내장) | `BattleSystem.js:215` `SynergyCalculator` | ❌ class/mood 카운트만 계산 (교단 없음) |
| 상태이상 | `BattleSystem.js:316-317` `buffs/debuffs` 배열 | ⚠️ 초기화만 되고 소비되지 않음 (`_processExpiredBuffs`:562가 defense 복원 1종만 처리) |
| V2 유닛 | `BattleSystemV2.js:26` | ✅ `this.cult` 저장 — 하지만 이후 **성격 보너스에만 사용** |
| V2 데미지 | `BattleSystemV2.js:281` `calculateDamage()` | ❌ element/personality 상성만 적용, 교단 상성 없음 |

### 1-3. 실제로 구현되어 있는 "교단" 효과 (스탯 레이어)

| 구현 | 위치 | 내용 | 커버리지 |
|------|------|------|---------|
| 교단 파티 시너지 | `SynergySystem.js:56-121` `calculateCultSynergy()` | 동일 교단 2/3/4명 수에 따라 `cults.json`의 `synergy_bonus`(atk/def/hp/spd %) 가산 | ✅ 12기관 전체 (cults.json 기준) |
| 교단×성격 보너스 | `PersonalitySystem.js:81` + `BattleSystemV2.js:76-88` | 선호 성격일 때 **플랫 ×1.15** 를 ATK/DEF에 적용 | ⚠️ 5기관만 (personalities.json `cultPersonalityBonus`) |
| 교단×분위기 보너스 | `MoodSystem.js:69-106` `CULT_MOOD_BONUSES` + `getCultBonus():173` | 교단별 분위기 정합 시 +5~10% | ⚠️ 9기관만, 그리고 **전투 데미지 경로에 연동 안 됨** (BattleScene은 `getMatchupMultiplier`만 import) |

**발견된 결함 (감사 부수 산출)**:
1. `PersonalitySystem.getCultPersonalityBonus()`는 `personalities.json`의 bonus 객체(`crit_rate`, `skill_dmg`, `hp_def`, `debuff_effect` 등 상이 타입)를 무시하고 무조건 `0.15`를 반환하며, 호출부(`applyCultPersonalityBonus`)는 이를 ATK/DEF에만 곱한다 — 데이터와 동작 불일치.
2. `MoodSystem.CULT_MOOD_BONUSES`에 `chaos`, `nature`, `balance` 누락 (12기관 중 9기관만).
3. `PvPSystem.js:259`는 구형 `BattleSystem`을 사용 → PvP에서는 교단 스탯 시너지조차 미반영.
4. `BattleSystemV2.checkEnergy(currentEnergy, energyCost)`가 `EnergySystem.canEnterStage(stageType)`(문자열 파라미터)를 숫자 2개로 호출 — 시그니처 불일치 (잠재 런타임 오류).

---

## 2. 12기관 × 구현여부 매트릭스

판정 기준:
- **구현됨** = 시그니처 메커니즘이 전투 런타임에서 동작
- **부분** = 일부 요소가 다른 형태로라도 코드에 존재
- **미구현** = 데이터(cultEffect 토큰)만 존재, 런타임 코드 0

| # | 기관 | 시그니처 메커니즘 (CULT_SYSTEM_DESIGN §2) | cultEffect 토큰 (ascended-heroes.json) | 상태 | 비고 |
|---|------|----------------------------------------|----------------------------------------|------|------|
| 1 | **olympus** | Divine Charge 게이지 → Lightning Strike(ATK×50%+스턴), Thunderstruck | `thunderstruck_40/_100/_25`, `lightning_judgment`, `divine_judgment` | ❌ 미구현 | 게이지/스턴/상태이상 시스템 자체가 없음 |
| 2 | **valhalla** | Berserker Rage(HP비례 ATK↑), Last Stand(부활), Frenzy Mark | `berserker_stack`, `berserk_overdrive`, `low_hp_bonus`, `last_stand` | ❌ 미구현 | 사망 차단 훅(`takeDamage` 선개입) 부재 |
| 3 | **asgard** | Rune Inscription(룬 적층→Runeburst), Bifrost Link, Rune Shield | `rune_stack_1`, `rune_burst`, `rune_mastery`, `rune_atk_stack`, `rune_party_buff` | ❌ 미구현 | 스택 컨테이너 없음 |
| 4 | **avalon** | Holy Ward(턴시작 방어막), Holy Thorns(반사), Sacred Wound | `shield_all`, `full_heal_reflect`, `cover_shield`, `fortress_shield` | ❌ 미구현 | 방어막(shield) 리소스 모델 없음 |
| 5 | **takamagahara** | Kami no Ma(선제), Heaven's Gift(쿨 초기화), Dazzle | `spd_up_10`, `extra_action`, `speed_dominance` | ❌ 미구현 | 즉시 추가 행동 메커니즘 없음 |
| 6 | **kunlun** | Five Poisons(5종 디버프)→Chaos Bloom, Immortal Herb, Withering | `cleanse_all`, `poison_2turns`, `multi_poison` | ❌ 미구현 | 디버프 배열은 있으나 소비 로직 0 |
| 7 | **yomi** | Death Gaze(Doom 스택→Death Sentence 처형), 스택 전이, Cursed Soul | `doom_stack_1`, `execution_doom5`, `mass_doom_3`, `curse_dot`, `curse_execute`, `mass_curse` | ❌ 미구현 | DoT/처형 판정 없음 |
| 8 | **helheim** | Frost Cage(Cold Stack→Permafrost), Numbing Aura, Frostbite | `freeze_20/_30`, `stun_2turns`, `terror_all` | ❌ 미구현 | CC(행동불가) 판정 없음 |
| 9 | **tartarus** | Titan Force(DEF 조건부 무시), Abyss Gaze(방패 분산), Titanfall | `armor_pierce_20`, `shield_break`, `armor_shred`, `full_armor_pierce`, `mass_armor_shred` | ❌ 미구현 | DEF 감쇠식(`def/1000`) 고정, 관통 변수 없음 |
| 10 | **chaos** | Wild Card(매턴 무작위 10종), Misfire, Chaos Brand | `random_multiplier`, `chaos_burst`, `chaos_liberation`, `random_debuff`, `chaos_storm`, `madness_liberation`, `random_element`, `unstable_explosion`, `elemental_collapse` | ❌ 미구현 | 턴 시작 훅 없음 |
| 11 | **nature** | Growth Ring(매턴 성장), Root of Life(이월), Overgrowth | `growth_buff`, `growth_atk`, `late_game_bonus`, `earth_liberation` | ❌ 미구현 | 턴 경과 누적 상태 없음 |
| 12 | **balance** | Equilibrium(HP 편차 감지), Neutrality(상성 절반), Imbalance | `neutral_buff`, `mood_neutral_all`, `neutral_damage`, `balance_field` | ❌ 미구현 | Mood 상성 배율 우회 플래그 없음 |

### 레이어별 구현 현황 (보조)

| 레이어 | 항목 | 상태 |
|--------|------|------|
| 스탯 | 교단 파티 시너지 2/3/4명 (cults.json `synergy_bonus`) | ✅ 구현 (SynergySystem — 단, 구형 BattleSystem/PvP 미연동) |
| 스탯 | 교단×성격 보너스 | ⚠️ 부분/불일치 (§1-3 결함 1) |
| 스탯 | 교단×분위기 보너스 | ⚠️ 부분 — 9기관 한정 + 전투 미연동 |
| 상성 | **교단 간 상성표** (§3-3/3-4: ×1.25/×0.80, Mood와 곱연산) | ❌ 미구현 — 어느 코드에도 테이블 없음 |
| 스킬 | `cultEffect` 토큰 57종 | ❌ 미구현 — 런타임 참조 0건 |
| 스킬 | 각성 스킬(`cooldown` 필드) | ❌ 미구현 — BattleUnit에 쿨다운 추적 없음 |

> 참고: cults.json v2.1에는 14기관이 있으나 `enabled:false` 3개(heliopolis/svarga/tir_na_nog)는 12기관 설계 범위 외. 활성 12기관 모두 `synergy_bonus` 보유 → 시너지 스탯 레이어는 온전.

---

## 3. 미구현분 구현 가이드 (함수 레벨 훅 제안)

### 3-0. 설계 원칙

- `cultEffect`는 **문자열 토큰 → 핸들러 레지스트리**로 처리한다. BattleSystem에 12기관 if문을 넣지 않는다.
- 기존 패턴(BattleSystem의 Strategy/Observer)을 그대로 활용: cult 메커니즘은 전부 "이벤트 훅"으로 표현 가능하다.

### 3-1. 신규 모듈: `src/systems/CultMechanics.js`

```js
// 토큰 → 핸들러 레지스트리 (신규 파일 권장)
export const CultEffectRegistry = {
  // olympus
  thunderstruck_40: {
    onHit(ctx) { /* ctx={battle, attacker, target, dmgResult}
                   Math.random()<0.4 → target에 상태 'thunderstruck'(stun 1턴 + 피해+30%) 부여 */ },
  },
  thunderstruck_100: { onHit(ctx) { /* 확정 부여 */ } },
  // valhalla
  last_stand:      { beforeDamage(ctx) { /* 치명타 시 HP1 생존 + 1턴 무적, 전투당 1회 */ } },
  berserker_stack: { onDamaged(ctx) { /* 피격당 ATK+5% 스택(≤5) */ } },
  // ... 57토큰 전체를 같은 규약으로
};
```

훅 종류는 6개면 충분하다: `onBattleStart / onTurnStart / onHit / onDamaged / beforeDamage / onDeath`.

### 3-2. BattleSystem 훅 포인트 (파일/함수 레벨)

| # | 훅 위치 | 작업 |
|---|---------|------|
| H1 | `BattleUnit` 생성자 (`BattleSystem.js:293`) | `this.cult = characterData.cult \|\| getCharacterOrHero(characterData.id)?.cultId \|\| null;` + 런타임 상태 `this.cultState = {}` (doom/cold/rune/divinity/growth 스택), `this.statusEffects = []`, `this.cooldowns = {}` |
| H2 | `takeDamage()` (`:373`) | 최상단에 `beforeDamage` 훅 호출 — Last Stand/Rune Shield/Warrior's Pride 같은 "피해 차단" 계열은 데미지 확정 전에 개입해야 함 |
| H3 | `executeAction()` 데미지 분기 (`:813-854`) | `takeDamage` 직후 `CultEffectRegistry[skill.cultEffect]?.onHit(...)` 및 공격자/대상의 패시브 `onHit/onDamaged` 디스패치. Strategy 폴백 경로(`:748`)도 동일하게 통과하므로 여기 두면 전 스킬 커버 |
| H4 | `processTurn()` TURN_START (`:708-728`) | (a) 행동 유닛 `statusEffects` 틱 — stun/freeze면 스킵, DoT(독/저주)면 피해, growth/wildcard는 발동. (b) `cooldowns` 감소 |
| H5 | `_processExpiredBuffs()` (`:562`) | defense 전용 복원 → 일반화: `{type, value, duration, appliedAt, stacks}` 규약으로 확장 (ATK/SPD/방어막 값 포함) |
| H6 | `unitDeath` 이벤트 (`:845`) | Doom 스택 전이(yomi), Bifrost Link(asgard) — 사망 후처리 훅 |
| H7 | `initBattle()` (`:606`) | `onBattleStart` 훅 — Numbing Aura(helheim), Kami no Ma 선제(takamagahara), Nature 초기 스택 |
| H8 | `calculateDamage()` (`:880`) | moodBonus 다음 줄에 교단 상성 삽입: `baseDamage *= this.getCultAdvantage(attacker.cult, defender.cult)` — §3-3 테이블(×1.25/×0.80) 신규 메서드. balance의 Neutrality는 양측 배율 ×0.5 |
| H9 | `getAIAction()` (`:966`) | stun/frozen 유닛 행동 스킵 처리 (`processTurn`에서 먼저 걸러도 됨) |

### 3-3. 기관별 최소 구현 난이도/선행요건

| 선행 공통 기능 | 필요 이유 (걸리는 기관) | 난이도 |
|---------------|------------------------|-------|
| 상태이상 매니저 (stun/freeze/silence/weaken/curse + 틱) | olympus, kunlun, helheim, yomi | 상 |
| 방어막(barrier) 리소스 모델 | avalon, asgard(Rune Shield), chaos#9 | 중 |
| 스택 컨테이너 (`cultState.stacks`) | asgard, yomi, helheim, valhalla, nature | 하 |
| 턴 시작/종료 글로벌 훅 | chaos(Wild Card), nature(Growth Ring), avalon(Holy Ward), olympus(Glory Aura) | 중 |
| 교단 상성 테이블 + `getCultAdvantage()` | 전 기관 (CULT_SYSTEM_DESIGN §3-3 그대로 데이터화 권장: `cults.json`에 `advantages/disadvantages` 추가) | 하 |
| 쿨다운 추적 (awakening 스킬) | 전 SSR 각성기 | 하 |

### 3-4. 권장 구현 순서 (CULT_SYSTEM_DESIGN §8 Phase 2 정렬)

1. **P0**: H1(cult/state 저장) + H8(교단 상성 ×1.25/×0.80) + cults.json 상성 데이터화 — 코드량 대비 전투 체감 최대.
2. **P1**: 스택 컨테이너 + `thunderstruck_*`, `berserker_*`, `last_stand` (olympus/valhalla — Phase 2 지정).
3. **P2**: 상태이상 매니저 + `poison_2turns`/`freeze_*`/`doom_stack_1`/`execution_doom5`.
4. **P3**: 방어막 모델 + `shield_all`/`fortress_shield`/`cover_shield`, 턴 훅 기반 `growth_*`/Wild Card.
5. 검증: `tests/`에 기관별 토큰 단위 테스트(데미지 배율 스냅샷) + `tools/simulate/` 배틀 몬테카를로로 기관 간 승률 편차 ±5%p 이내 확인.

---

## 4. 결론

- **12기관 × 시그니처 메커니즘: 0/12 구현** (부분 판정도 없음 — 데이터 토큰만 존재).
- 구현된 것은 **스탯 레이어 3종**(교단 시너지/교단×성격/교단×분위기)이며, 이마저 ①구형 BattleSystem·PvP 미연동, ②9기관 커버리지, ③데이터-동작 불일치 3건의 결함을 포함한다.
- `cultEffect` 57개 토큰은 **레지스트리 패턴 + 6종 라이프사이클 훅**으로 §3-2의 H1~H9 지점에 붙이면 BattleSystem 코어 수정을 최소화하며 단계적 구현이 가능하다.

---

## 5. MECH-02 구현 내역 (2026-09-02)

> **범위**: `docs/PLAN_COMPLETION_STAGE.md` MECH-02 — 4그룹 대표 기관.
> **신규 모듈**: `src/systems/CultMechanicsSystem.js` (토큰 파서 + 훅 레지스트리 + 순수 계산 함수)
> **테스트**: `tests/systems/CultMechanicsSystem.test.js` (44개, 파서 8 / olympus 7 / yomi 8 / avalon 7 / asgard 8 / BattleSystem 통합 6)

### 5-1. 12기관 × 구현여부 매트릭스 (갱신)

| # | 기관 | 그룹 | 시그니처 메커니즘 | 상태 | 구현된 토큰 |
|---|------|------|------------------|------|------------|
| 1 | **olympus** | 공세 | Divine Charge → Lightning Strike, Thunderstruck, Glory Aura | ✅ **구현** | `thunderstruck_25/_40/_100`, `lightning_judgment`, `divine_judgment` (5) |
| 2 | valhalla | 공세 | Berserker Rage / Last Stand | ❌ 미구현 | — (4 토큰 no-op) |
| 3 | **asgard** | 균형 | Rune Inscription → Runeburst, Rune Shield, Bifrost Link | ✅ **구현** | `rune_stack_1`, `rune_burst`, `rune_mastery`, `rune_atk_stack`, `rune_party_buff` (5) |
| 4 | **avalon** | 지속 | Holy Ward 방어막, Holy Thorns 반사, Round Table Bond | ✅ **구현** | `shield_all`, `fortress_shield`, `cover_shield`, `full_heal_reflect` (4) |
| 5 | takamagahara | 균형 | Kami no Ma 선제 / Extra Action | ❌ 미구현 | — (3) |
| 6 | kunlun | 지속 | Five Poisons → Chaos Bloom | ❌ 미구현 | — (3) |
| 7 | **yomi** | 제어 | Death Gaze(Doom) → Death Sentence, Doom 전이, Underworld Link | ✅ **구현** | `doom_stack_1`, `execution_doom5`, `mass_doom_3`, `curse_dot`, `curse_execute`, `mass_curse` (6) |
| 8 | helheim | 제어 | Frost Cage / Permafrost | ❌ 미구현 | — (4) |
| 9 | tartarus | 제어 | Titan Force 방어 관통 | ❌ 미구현 | — (5) |
| 10 | chaos | 공세 | Wild Card 무작위 | ❌ 미구현 | — (9) |
| 11 | nature | 지속 | Growth Ring 누적 | ❌ 미구현 | — (4) |
| 12 | balance | 균형 | Equilibrium / Neutrality | ❌ 미구현 | — (4) |

- **구현 4/12** (4그룹 각 1기관), 토큰 기준 **20/56 구현 · 36 미구현**.
- 미구현 토큰은 파싱만 되고 동작 없음(no-op). 목록은 `getUnimplementedEffects()`로 조회한다.
- 참고: 감사 §1-1의 "57개 토큰"은 실측 결과 **56개**(ascended-heroes.json v2.0 기준, 중복 없음)다.

### 5-2. 메커니즘별 수치 공식

모든 상수는 `CULT_MECHANICS_CONFIG`(CultMechanicsSystem.js)에 노출된다.

**Olympus (공세)**

| 항목 | 공식 |
|------|------|
| Divine Charge 충전 | 기본공격 `+15`, 스킬 `+30`, 각성기 `0`(사용 시 게이지 리셋) |
| Lightning Strike 발동 | `divinity ≥ 100` → 발동 후 `divinity = 0` |
| Lightning Strike 피해 | `floor(ATK × 0.5 × (1 − min(0.9, DEF_eff/1000) × (1 − 0.15)))` (방어 15% 관통) |
| Lightning Strike 스턴 | 확률 20% → Thunderstruck |
| Thunderstruck | 지속 1턴, 해당 턴 행동 불가 + 받는 피해 `×1.30` |
| `thunderstruck_N` | 확률 `N/100`으로 Thunderstruck 부여 |
| `lightning_judgment` | 게이지와 무관하게 Lightning Strike 확정 발동 |
| `divine_judgment` | Lightning Strike 확정 + Thunderstruck 확정 |
| Glory Aura(패시브) | 턴 시작 시 HP 비율 최고 아군에게 ATK `×1.10` 1턴 |

**Yomi (제어)**

| 항목 | 공식 |
|------|------|
| Death Gaze(패시브) | 피해 적중 1회당 대상 Doom `+1` (토큰이 Doom을 다루면 중복 누적 없음) |
| Death Sentence | `Doom ≥ 10` → 추가 피해 `floor(대상 현재HP × 0.20)`, Doom `= 0` |
| `doom_stack_1` / `mass_doom_3` | Doom `+1` / `+3` (임계 10) |
| `execution_doom5` / `curse_execute` | Doom `+1`, 처형 임계 `5`로 인하 |
| `curse_dot` / `mass_curse` | 저주 2턴 + Doom `+1`. 저주 DoT = `floor(시전자 ATK × 0.15)` / 턴 |
| Doom 전이(사망 시) | `floor(사망자 Doom × 0.5)`를 같은 진영 생존자 1명에게 이관 |
| Underworld Link(패시브) | 사망 아군 1명당 피해 `+10%`, 상한 `+30%` |

**Avalon (지속)**

| 항목 | 공식 |
|------|------|
| Holy Ward(패시브) | 턴 시작 시 HP 비율 최저 아군에게 방어막 `floor(ATK × 0.3)` |
| `shield_all` / `cover_shield` | 아군 전체 / 최저 HP 1명에게 `floor(ATK × 0.3)` |
| `fortress_shield` / `full_heal_reflect` | 아군 전체에 `floor(ATK × 0.5)` (후자는 전회복 동반) |
| 방어막 흡수 | 피해를 방어막 잔량만큼 차감, 잔량 0이 되면 파괴 |
| Holy Thorns | 방어막 파괴 시 **파괴한 원 피해량**의 `50%`를 공격자에게 반사 |
| Round Table Bond | 아발론 아군 1명당 치유 `+10%`, 상한 `+40%` |

**Asgard (균형)**

| 항목 | 공식 |
|------|------|
| 룬 효과 | `atk`/`def`/`spd` 룬 1개당 해당 스탯 `+15%` (중첩 가산) |
| Runeburst | 룬 3개 적층 → 룬 소모, 다음 피해 `+40%`(1회) + Rune Shield 1회분 |
| `rune_stack_1` | 무작위 아군 1명에게 무작위 룬 1개 |
| `rune_burst` / `rune_mastery` | 시전자에게 룬 1개 / 3종 전부(즉시 Runeburst) |
| `rune_atk_stack` / `rune_party_buff` | 아군 전체에 공격 룬 / 시전자 룬을 아군에게 복사 |
| Rune Shield | 피해 1회를 전량 흡수 (방어막보다 우선) |
| Bifrost Link(사망 시) | 사망 아군의 ATK를 생존 아군 전체에 플랫 가산 1턴 |

### 5-3. 훅 지점 (file:line)

훅은 7종이다: `onBattleStart / onTurnStart / onSkillUse / beforeDamage / onHit / onDamaged / onDeath`.
(감사 §3-1의 6종 안 대비 `onSkillUse`를 추가 — 아발론/아스가르드의 아군 대상 효과가 피해 확정 전에 적용돼야 하기 때문)

| # | 훅 | 위치 | 내용 |
|---|-----|------|------|
| H1 | 유닛 상태 보존 | `src/systems/BattleSystem.js:295` `resolveCultId()`, `:327-328` `BattleUnit` 생성자 | `this.cult` + `this.cultState`(divinity/doom/barrier/runes/statuses) 저장 |
| H2 | `beforeDamage` | `src/systems/BattleSystem.js:404` `BattleUnit.takeDamage()` | 방어막/Rune Shield 흡수, 반사량 산출 (`context.attacker` 선택 인자) |
| H3 | `onBattleStart` | `src/systems/BattleSystem.js:657` `initBattle()` | 전 유닛 `cultState` 초기화 |
| H4 | 유효 SPD | `src/systems/BattleSystem.js:703` `calculateTurnOrder()` | 속도 룬 반영 턴 순서 |
| H5 | `onTurnStart` | `src/systems/BattleSystem.js:771` `processTurn()` → `:951` `applyCultTurnStart()` | 상태이상 틱(DoT/행동불가) + Holy Ward/Glory Aura. 행동 불가 시 턴 스킵 |
| H6 | `onSkillUse` | `src/systems/BattleSystem.js:793`(processTurn), `:847`(executeAction) → `:978` `applyCultSkillUse()` | 아군 방어막/룬 계열 |
| H7 | 피해 단일 경로 | `src/systems/BattleSystem.js:995` `resolveDamage()` | 계산 → 적용 → `onHit` → 반사 → 사망. 전 스킬 전략(`:40`, `:70`, `:131`)과 `executeAction`이 공유 |
| H8 | `onHit` | `src/systems/BattleSystem.js:1021` `applyCultHits()` | 토큰 효과 + 공격자 교단 패시브. `kind==='extraDamage'`만 실제 HP에 적용 |
| H9 | `onDeath` | `src/systems/BattleSystem.js:1048` `handleUnitDeath()` | Doom 전이(yomi) / Bifrost Link(asgard) + `unitDeath` 이벤트 일원화 |
| H10 | 데미지식 | `src/systems/BattleSystem.js:1073`(플랫 ATK), `:1079`(유효 DEF), `:1095-1096`(교단 배율) | 룬/Runeburst/Glory Aura/Underworld Link × Thunderstruck 증폭 |
| H11 | 치유 보정 | `src/systems/BattleSystem.js:942` `getCultHealMultiplier()` | Round Table Bond (HealStrategy + executeAction 힐 분기) |

### 5-4. 회귀 안전성

- `cult`가 없거나 미구현 기관인 유닛은 `getOutgoingDamageMultiplier`/`getIncomingDamageMultiplier` = `1`,
  `getEffectiveDef/Spd` = 원본 스탯, `getFlatAtkBonus` = `0`, 흡수량 `0` → **기존 전투 수치가 그대로 유지**된다.
- 검증(2026-09-02): `vitest 884 passed (29 files)` · `tsc --noEmit` 0 errors · `vite build` 성공.

### 5-5. 남은 작업 (MECH-03 후보)

1. 미구현 8기관(36 토큰) — 특히 상태이상 매니저를 공유하는 helheim/kunlun은 본 모듈의 `statuses` 규약을 그대로 확장하면 된다.
2. 교단 상성 테이블(`×1.25/×0.80`, 감사 §3-3) — 본 작업 범위 밖. 전 기관 수치에 영향을 주므로 별도 밸런스 검증 필요.
3. `PersonalitySystem.getCultPersonalityBonus()` 데이터-동작 불일치(감사 §1-3 결함 1) 미해소.
4. `PvPSystem`/`commands/*`는 `resolveDamage()`를 거치지 않아 반사(Holy Thorns)가 적용되지 않는다. 흡수는 `takeDamage` 내부라 정상 동작.
