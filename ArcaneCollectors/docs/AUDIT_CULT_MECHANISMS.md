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
