/**
 * CultMechanicsSystem.test.js
 * MECH-02 — 4그룹 대표 기관(olympus/yomi/avalon/asgard) 시그니처 메커니즘 + 토큰 파서
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    getData: vi.fn(() => ({})),
    setData: vi.fn(),
    save: vi.fn(),
    updateHighestDamage: vi.fn()
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: { emit: vi.fn() },
  GameEvents: { BATTLE_START: 'battle_start', BATTLE_END: 'battle_end' }
}));

vi.mock('../../src/data/index.js', () => ({
  getCharacter: vi.fn(() => null)
}));

import ascendedHeroesData from '../../src/data/ascended-heroes.json';
import {
  CultMechanicsSystem,
  CULT_MECHANICS_CONFIG,
  CULT_EFFECT_HANDLERS,
  IMPLEMENTED_CULTS,
  STATUS_TYPES,
  parseCultEffect,
  getUnimplementedEffects,
  getAllCultEffectTokens,
  createCultState,
  applyStatus,
  hasStatus,
  tickStatuses,
  absorbDamage,
  grantBarrier,
  inscribeRune,
  consumeRuneburst,
  addDoom,
  calcDeathSentence,
  calcLightningDamage,
  getDivinityGain,
  getEffectiveDef,
  getEffectiveSpd,
  getFlatAtkBonus,
  getHealMultiplier,
  getOutgoingDamageMultiplier,
  getIncomingDamageMultiplier,
  getUnderworldLinkMultiplier
} from '../../src/systems/CultMechanicsSystem.js';
import { BattleUnit, BattleSystem } from '../../src/systems/BattleSystem.js';

const OLYMPUS = CULT_MECHANICS_CONFIG.olympus;
const YOMI = CULT_MECHANICS_CONFIG.yomi;
const AVALON = CULT_MECHANICS_CONFIG.avalon;
const ASGARD = CULT_MECHANICS_CONFIG.asgard;

/** 전투 유닛 최소 스텁 (BattleUnit 인터페이스 중 교단 훅이 쓰는 부분만) */
function makeUnit(overrides = {}) {
  const unit = {
    id: 'unit',
    name: 'Unit',
    atk: 100,
    def: 50,
    spd: 100,
    maxHp: 1000,
    currentHp: 1000,
    isAlive: true,
    cult: null,
    cultState: createCultState(),
    ...overrides
  };
  unit.getHpPercent = () => unit.currentHp / unit.maxHp;
  unit.heal = (amount) => {
    const actualHeal = Math.min(amount, unit.maxHp - unit.currentHp);
    unit.currentHp += actualHeal;
    return { actualHeal, currentHp: unit.currentHp };
  };
  return unit;
}

/** 고정 난수 컨텍스트 */
const fixedRng = (value) => () => value;

// ============================================
// 1. cultEffect 토큰 파서
// ============================================

describe('parseCultEffect (토큰 파서)', () => {
  it('데이터의 모든 cultEffect 토큰이 파싱된다', () => {
    const tokens = [];
    ascendedHeroesData.ascendedHeroes.forEach(hero => {
      (hero.skills || []).forEach(skill => {
        if (skill.cultEffect) tokens.push(skill.cultEffect);
      });
    });

    expect(tokens.length).toBeGreaterThanOrEqual(56);
    tokens.forEach(token => {
      const parsed = parseCultEffect(token);
      expect(parsed).not.toBeNull();
      expect(parsed.type.length).toBeGreaterThan(0);
      expect(parsed.raw).toBe(token);
      expect(parsed.cult).toBeTruthy();
    });
    expect(getAllCultEffectTokens().length).toBe(new Set(tokens).size);
  });

  it('숫자 접미사를 value로 분리한다', () => {
    expect(parseCultEffect('thunderstruck_40')).toMatchObject({ type: 'thunderstruck', value: 40 });
    expect(parseCultEffect('thunderstruck_100')).toMatchObject({ type: 'thunderstruck', value: 100 });
    expect(parseCultEffect('armor_pierce_20')).toMatchObject({ type: 'armor_pierce', value: 20 });
    expect(parseCultEffect('rune_stack_1')).toMatchObject({ type: 'rune_stack', value: 1 });
  });

  it('턴 단위 접미사(2turns)를 value + unit으로 분리한다', () => {
    expect(parseCultEffect('stun_2turns')).toMatchObject({ type: 'stun', value: 2, unit: 'turns' });
    expect(parseCultEffect('poison_2turns')).toMatchObject({ type: 'poison', value: 2, unit: 'turns' });
  });

  it('문자 뒤 숫자(doom5)도 분리한다', () => {
    expect(parseCultEffect('execution_doom5')).toMatchObject({ type: 'execution_doom', value: 5 });
  });

  it('숫자가 없는 토큰은 value가 null이다', () => {
    expect(parseCultEffect('shield_all')).toMatchObject({ type: 'shield_all', value: null });
    expect(parseCultEffect('low_hp_bonus')).toMatchObject({ type: 'low_hp_bonus', value: null });
  });

  it('빈 값/비문자열은 null을 반환한다', () => {
    expect(parseCultEffect('')).toBeNull();
    expect(parseCultEffect(null)).toBeNull();
    expect(parseCultEffect(undefined)).toBeNull();
    expect(parseCultEffect(42)).toBeNull();
  });

  it('구현 여부(implemented)를 4기관 기준으로 표시한다', () => {
    expect(parseCultEffect('thunderstruck_40').implemented).toBe(true);
    expect(parseCultEffect('doom_stack_1').implemented).toBe(true);
    expect(parseCultEffect('shield_all').implemented).toBe(true);
    expect(parseCultEffect('rune_burst').implemented).toBe(true);
    expect(parseCultEffect('freeze_20').implemented).toBe(false);
    expect(parseCultEffect('random_multiplier').implemented).toBe(false);
  });

  it('getUnimplementedEffects는 미구현 기관 토큰만 노출한다', () => {
    const unimplemented = getUnimplementedEffects();
    const implementedCount = getAllCultEffectTokens().length - unimplemented.length;

    expect(implementedCount).toBe(20);
    unimplemented.forEach(entry => {
      expect(IMPLEMENTED_CULTS).not.toContain(entry.cult);
      expect(CULT_EFFECT_HANDLERS[entry.type]).toBeUndefined();
    });
    expect(unimplemented.map(e => e.token)).toContain('freeze_20');
    expect(unimplemented.map(e => e.token)).not.toContain('rune_mastery');
  });
});

// ============================================
// 2. Olympus (공세) — Divine Charge / Thunderstruck
// ============================================

describe('Olympus — Divine Charge & Thunderstruck', () => {
  let attacker;
  let target;

  beforeEach(() => {
    attacker = makeUnit({ id: 'olympus_hero', cult: 'olympus', atk: 200 });
    target = makeUnit({ id: 'enemy', def: 100, isAlive: true });
  });

  it('Divine Charge 충전량은 스킬 종류별로 다르다', () => {
    expect(getDivinityGain({ id: 'basic' })).toBe(OLYMPUS.DIVINITY_GAIN_BASIC);
    expect(getDivinityGain({ id: 'skill1' })).toBe(OLYMPUS.DIVINITY_GAIN_SKILL);
    expect(getDivinityGain({ id: 'awakening' })).toBe(0);
  });

  it('게이지 100 도달 시 Lightning Strike가 발동하고 게이지가 초기화된다', () => {
    const hit = () => CultMechanicsSystem.onHit({
      attacker, target, skill: { id: 'basic' }, allies: [attacker], enemies: [target], rng: fixedRng(0.99)
    });

    let effects = [];
    for (let i = 0; i < 6; i++) effects = hit();
    expect(effects.some(e => e.label === 'lightning_strike')).toBe(false);
    expect(attacker.cultState.divinity).toBe(OLYMPUS.DIVINITY_GAIN_BASIC * 6);

    effects = hit();
    const strike = effects.find(e => e.label === 'lightning_strike');
    expect(strike).toBeDefined();
    expect(strike.amount).toBe(calcLightningDamage(attacker, target));
    expect(attacker.cultState.divinity).toBe(0);
  });

  it('Lightning Strike 피해는 ATK×50%에 방어 15% 관통을 적용한다', () => {
    const raw = Math.min(0.9, target.def / 1000);
    const reduction = raw * (1 - OLYMPUS.LIGHTNING_DEF_PIERCE);
    const expected = Math.floor(attacker.atk * OLYMPUS.LIGHTNING_ATK_RATIO * (1 - reduction));

    expect(calcLightningDamage(attacker, target)).toBe(expected);
  });

  it('thunderstruck_40은 40% 확률로만 상태이상을 부여한다', () => {
    const skill = { id: 'skill1', cultEffect: 'thunderstruck_40' };
    const ctx = { attacker, target, skill, allies: [attacker], enemies: [target] };

    CultMechanicsSystem.onHit({ ...ctx, rng: fixedRng(0.99) });
    expect(hasStatus(target, STATUS_TYPES.THUNDERSTRUCK)).toBe(false);

    CultMechanicsSystem.onHit({ ...ctx, rng: fixedRng(0.1) });
    expect(hasStatus(target, STATUS_TYPES.THUNDERSTRUCK)).toBe(true);
  });

  it('divine_judgment은 확정 Lightning Strike + 확정 Thunderstruck', () => {
    const effects = CultMechanicsSystem.onHit({
      attacker,
      target,
      skill: { id: 'awakening', cultEffect: 'divine_judgment' },
      allies: [attacker],
      enemies: [target],
      rng: fixedRng(0.99)
    });

    expect(effects.some(e => e.label === 'lightning_strike')).toBe(true);
    expect(hasStatus(target, STATUS_TYPES.THUNDERSTRUCK)).toBe(true);
  });

  it('Thunderstruck은 받는 피해를 30% 늘리고 다음 턴 행동을 막는다', () => {
    applyStatus(target, { type: STATUS_TYPES.THUNDERSTRUCK, duration: OLYMPUS.THUNDERSTRUCK_DURATION });
    expect(getIncomingDamageMultiplier(target)).toBeCloseTo(1 + OLYMPUS.THUNDERSTRUCK_AMP);

    const tick = tickStatuses(target);
    expect(tick.blocked).toBe(true);
    expect(tick.blockedBy).toBe(STATUS_TYPES.THUNDERSTRUCK);

    // 1턴 지속 → 만료
    expect(hasStatus(target, STATUS_TYPES.THUNDERSTRUCK)).toBe(false);
    expect(getIncomingDamageMultiplier(target)).toBe(1);
  });

  it('Glory Aura는 턴 시작 시 HP 최고 아군에게 ATK +10%를 준다', () => {
    const healthy = makeUnit({ id: 'healthy' });
    const wounded = makeUnit({ id: 'wounded', currentHp: 100 });
    attacker.currentHp = attacker.maxHp / 2; // 시전자보다 HP가 높은 아군이 대상

    const result = CultMechanicsSystem.onTurnStart({
      unit: attacker, allies: [attacker, healthy, wounded], enemies: []
    });

    expect(result.effects.some(e => e.status === STATUS_TYPES.GLORY_AURA)).toBe(true);
    expect(hasStatus(healthy, STATUS_TYPES.GLORY_AURA)).toBe(true);
    expect(hasStatus(wounded, STATUS_TYPES.GLORY_AURA)).toBe(false);
    expect(getOutgoingDamageMultiplier(healthy)).toBeCloseTo(1 + OLYMPUS.GLORY_AURA_ATK);
  });
});

// ============================================
// 3. Yomi (제어) — Death Gaze / Doom / Curse
// ============================================

describe('Yomi — Death Gaze & Doom', () => {
  let attacker;
  let target;

  beforeEach(() => {
    attacker = makeUnit({ id: 'yomi_hero', cult: 'yomi', atk: 200 });
    target = makeUnit({ id: 'enemy' });
  });

  const hit = (cultEffect, extra = {}) => CultMechanicsSystem.onHit({
    attacker,
    target,
    skill: { id: 'basic', cultEffect },
    allies: [attacker],
    enemies: [target],
    rng: fixedRng(0.5),
    ...extra
  });

  it('Death Gaze 패시브는 적중마다 Doom을 1 누적한다', () => {
    hit(undefined);
    hit(undefined);
    expect(target.cultState.doom).toBe(2);
  });

  it('doom_stack_1 토큰은 패시브와 중복 누적되지 않는다', () => {
    hit('doom_stack_1');
    expect(target.cultState.doom).toBe(1);
  });

  it('mass_doom_3은 한 번에 3스택을 누적한다', () => {
    hit('mass_doom_3');
    expect(target.cultState.doom).toBe(3);
  });

  it('Doom 10 도달 시 Death Sentence로 현재 HP의 20%를 추가 피해로 준다', () => {
    target.cultState.doom = YOMI.DOOM_SENTENCE_THRESHOLD - 1;
    const effects = hit(undefined);

    const execution = effects.find(e => e.label === 'death_sentence');
    expect(execution).toBeDefined();
    expect(execution.amount).toBe(Math.floor(target.currentHp * YOMI.DEATH_SENTENCE_HP_RATIO));
    expect(target.cultState.doom).toBe(0);
  });

  it('execution_doom5는 처형 임계값을 5로 낮춘다', () => {
    target.cultState.doom = 4;
    const effects = hit('execution_doom5');

    expect(effects.some(e => e.label === 'death_sentence')).toBe(true);
    expect(calcDeathSentence(target, YOMI.DOOM_EXECUTE_THRESHOLD)).toBe(0);
  });

  it('curse_dot은 2턴 저주를 걸고 턴마다 ATK×15% 고정 피해를 준다', () => {
    hit('curse_dot');
    expect(hasStatus(target, STATUS_TYPES.CURSE)).toBe(true);

    const expectedDot = Math.floor(attacker.atk * YOMI.CURSE_DOT_ATK_RATIO);
    expect(tickStatuses(target).dotDamage).toBe(expectedDot);
    expect(tickStatuses(target).dotDamage).toBe(expectedDot);
    expect(hasStatus(target, STATUS_TYPES.CURSE)).toBe(false);
    expect(tickStatuses(target).dotDamage).toBe(0);
  });

  it('사망 시 Doom 스택의 절반이 남은 적에게 전이된다', () => {
    const dying = makeUnit({ id: 'dying', cult: 'yomi', isAlive: false });
    const heir = makeUnit({ id: 'heir' });
    addDoom(dying, 7);

    const effects = CultMechanicsSystem.onDeath({ unit: dying, killer: attacker, allies: [dying, heir], enemies: [] });

    expect(effects[0].transferred).toBe(true);
    expect(heir.cultState.doom).toBe(Math.floor(7 * YOMI.DOOM_TRANSFER_RATIO));
    expect(dying.cultState.doom).toBe(0);
  });

  it('Underworld Link는 사망 아군 1명당 +10%, 최대 +30%다', () => {
    const dead = () => makeUnit({ id: `d${Math.random()}`, isAlive: false });

    expect(getUnderworldLinkMultiplier(attacker, [attacker])).toBe(1);
    expect(getUnderworldLinkMultiplier(attacker, [attacker, dead()])).toBeCloseTo(1.1);
    expect(getUnderworldLinkMultiplier(attacker, [attacker, dead(), dead()])).toBeCloseTo(1.2);
    expect(getUnderworldLinkMultiplier(attacker, [attacker, dead(), dead(), dead(), dead()]))
      .toBeCloseTo(1 + YOMI.UNDERWORLD_LINK_MAX);
    expect(getUnderworldLinkMultiplier(makeUnit({ cult: 'olympus' }), [dead(), dead()])).toBe(1);
  });
});

// ============================================
// 4. Avalon (지속) — Holy Ward / Holy Thorns
// ============================================

describe('Avalon — Holy Ward & Holy Thorns', () => {
  let caster;
  let hurt;
  let healthy;

  beforeEach(() => {
    caster = makeUnit({ id: 'avalon_hero', cult: 'avalon', atk: 200 });
    hurt = makeUnit({ id: 'hurt', currentHp: 200, cult: 'avalon' });
    healthy = makeUnit({ id: 'healthy', cult: 'avalon' });
  });

  const cast = (cultEffect) => CultMechanicsSystem.onSkillUse({
    attacker: caster,
    targets: [],
    skill: { id: 'skill1', cultEffect },
    allies: [caster, hurt, healthy],
    enemies: [],
    rng: fixedRng(0.5)
  });

  it('shield_all은 아군 전원에게 ATK×30% 방어막을 준다', () => {
    const effects = cast('shield_all');
    const expected = Math.floor(caster.atk * AVALON.WARD_ATK_RATIO);

    expect(effects).toHaveLength(3);
    expect(hurt.cultState.barrier).toBe(expected);
    expect(healthy.cultState.barrier).toBe(expected);
  });

  it('fortress_shield는 ATK×50% 방어막을 준다', () => {
    cast('fortress_shield');
    expect(healthy.cultState.barrier).toBe(Math.floor(caster.atk * AVALON.FORTRESS_ATK_RATIO));
  });

  it('cover_shield는 HP 비율이 가장 낮은 아군 1명만 보호한다', () => {
    const effects = cast('cover_shield');

    expect(effects).toHaveLength(1);
    expect(hurt.cultState.barrier).toBe(Math.floor(caster.atk * AVALON.WARD_ATK_RATIO));
    expect(healthy.cultState.barrier).toBe(0);
  });

  it('full_heal_reflect는 아군을 전회복시키고 방어막을 준다', () => {
    const effects = cast('full_heal_reflect');

    expect(hurt.currentHp).toBe(hurt.maxHp);
    expect(hurt.cultState.barrier).toBe(Math.floor(caster.atk * AVALON.FORTRESS_ATK_RATIO));
    expect(effects.some(e => e.kind === 'heal')).toBe(true);
  });

  it('방어막은 피해를 흡수하고, 파괴될 때 50%를 반사한다', () => {
    grantBarrier(healthy, 100);

    const partial = absorbDamage(healthy, 40);
    expect(partial.damage).toBe(0);
    expect(partial.absorbed).toBe(40);
    expect(partial.reflect).toBe(0);

    const breaking = absorbDamage(healthy, 200);
    expect(breaking.absorbed).toBe(60);
    expect(breaking.damage).toBe(140);
    expect(breaking.shieldBroken).toBe(true);
    expect(breaking.reflect).toBe(Math.floor(200 * AVALON.THORNS_REFLECT_RATIO));
  });

  it('Holy Ward 패시브는 턴 시작 시 HP 최저 아군에게 방어막을 건다', () => {
    const result = CultMechanicsSystem.onTurnStart({
      unit: caster, allies: [caster, hurt, healthy], enemies: []
    });

    expect(result.effects).toHaveLength(1);
    expect(hurt.cultState.barrier).toBe(Math.floor(caster.atk * AVALON.WARD_ATK_RATIO));
    expect(healthy.cultState.barrier).toBe(0);
  });

  it('Round Table Bond는 아발론 아군 1명당 치유 +10%, 최대 +40%다', () => {
    const other = makeUnit({ cult: 'olympus' });

    expect(getHealMultiplier(caster, [other])).toBe(1);
    expect(getHealMultiplier(caster, [caster, other])).toBeCloseTo(1.1);
    expect(getHealMultiplier(caster, [caster, hurt, healthy])).toBeCloseTo(1.3);
    expect(getHealMultiplier(caster, [caster, hurt, healthy, makeUnit({ cult: 'avalon' }), makeUnit({ cult: 'avalon' })]))
      .toBeCloseTo(1 + AVALON.ROUND_TABLE_HEAL_MAX);
  });
});

// ============================================
// 5. Asgard (균형) — Rune Inscription / Runeburst
// ============================================

describe('Asgard — Rune Inscription & Runeburst', () => {
  let caster;
  let ally;

  beforeEach(() => {
    caster = makeUnit({ id: 'asgard_hero', cult: 'asgard', atk: 150 });
    ally = makeUnit({ id: 'ally', cult: 'asgard' });
  });

  const cast = (cultEffect, rngValue = 0) => CultMechanicsSystem.onSkillUse({
    attacker: caster,
    targets: [],
    skill: { id: 'skill1', cultEffect },
    allies: [caster, ally],
    enemies: [],
    rng: fixedRng(rngValue)
  });

  it('룬 3개 적층 시 Runeburst가 발동하고 룬이 소모된다', () => {
    inscribeRune(caster, 'atk');
    inscribeRune(caster, 'def');
    expect(caster.cultState.runeburst).toBe(false);

    const third = inscribeRune(caster, 'spd');
    expect(third.runeburst).toBe(true);
    expect(caster.cultState.runes).toHaveLength(0);
    expect(caster.cultState.runeShield).toBe(ASGARD.RUNEBURST_SHIELD_HITS);
  });

  it('Runeburst는 다음 피해를 40% 늘리고 1회만 소비된다', () => {
    caster.cultState.runeburst = true;
    expect(getOutgoingDamageMultiplier(caster)).toBeCloseTo(1 + ASGARD.RUNEBURST_DAMAGE_BONUS);

    expect(consumeRuneburst(caster)).toBe(true);
    expect(consumeRuneburst(caster)).toBe(false);
    expect(getOutgoingDamageMultiplier(caster)).toBe(1);
  });

  it('룬 종류별로 ATK/DEF/SPD가 15%씩 오른다', () => {
    inscribeRune(caster, 'atk');
    expect(getOutgoingDamageMultiplier(caster)).toBeCloseTo(1 + ASGARD.RUNE_STAT_BONUS);

    const defender = makeUnit({ def: 100, spd: 100 });
    inscribeRune(defender, 'def');
    expect(getEffectiveDef(defender)).toBeCloseTo(100 * (1 + ASGARD.RUNE_STAT_BONUS));

    const runner = makeUnit({ spd: 100 });
    inscribeRune(runner, 'spd');
    expect(getEffectiveSpd(runner)).toBeCloseTo(100 * (1 + ASGARD.RUNE_STAT_BONUS));
  });

  it('rune_atk_stack은 아군 전원에게 공격 룬을 새긴다', () => {
    const effects = cast('rune_atk_stack');

    expect(effects).toHaveLength(2);
    expect(caster.cultState.runes).toEqual(['atk']);
    expect(ally.cultState.runes).toEqual(['atk']);
  });

  it('rune_mastery는 3종 룬을 한 번에 새겨 즉시 Runeburst를 낸다', () => {
    const effects = cast('rune_mastery');

    expect(effects).toHaveLength(ASGARD.RUNE_TYPES.length);
    expect(effects[effects.length - 1].runeburst).toBe(true);
    expect(caster.cultState.runeburst).toBe(true);
  });

  it('rune_party_buff는 시전자의 룬을 다른 아군에게 복사한다', () => {
    inscribeRune(caster, 'atk');
    inscribeRune(caster, 'def');

    cast('rune_party_buff');

    expect(ally.cultState.runes).toEqual(['atk', 'def']);
  });

  it('Rune Shield는 피해 1회를 완전히 흡수한다', () => {
    caster.cultState.runeShield = 1;

    const absorbed = absorbDamage(caster, 9999);
    expect(absorbed.damage).toBe(0);
    expect(absorbed.absorbed).toBe(9999);
    expect(caster.cultState.runeShield).toBe(0);

    expect(absorbDamage(caster, 100).damage).toBe(100);
  });

  it('Bifrost Link는 사망 아군의 ATK를 생존 아군에게 1턴 부여한다', () => {
    const fallen = makeUnit({ id: 'fallen', cult: 'asgard', atk: 300, isAlive: false });

    CultMechanicsSystem.onDeath({ unit: fallen, killer: null, allies: [fallen, caster, ally], enemies: [] });

    expect(getFlatAtkBonus(caster)).toBe(300);
    expect(getFlatAtkBonus(ally)).toBe(300);

    tickStatuses(caster);
    tickStatuses(caster);
    expect(getFlatAtkBonus(caster)).toBe(0);
  });
});

// ============================================
// 6. BattleSystem 통합 — 회귀 안전성 + 훅 연결
// ============================================

describe('BattleSystem 통합', () => {
  const makeData = (id, cult) => ({
    id,
    name: id,
    mood: 'neutral',
    rarity: 'SR',
    class: 'warrior',
    cult,
    baseStats: { hp: 1000, atk: 100, def: 50, spd: 100 },
    growth: { hp: 100, atk: 10, def: 5, spd: 2 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeGain: 20 }]
  });

  it('교단이 없는 유닛은 배율이 전부 항등원이라 기존 수치가 유지된다', () => {
    const unit = new BattleUnit(makeData('plain', undefined), 1);

    expect(unit.cult).toBeNull();
    expect(getOutgoingDamageMultiplier(unit)).toBe(1);
    expect(getIncomingDamageMultiplier(unit)).toBe(1);
    expect(getEffectiveDef(unit)).toBe(unit.def);
    expect(getFlatAtkBonus(unit)).toBe(0);
    expect(unit.takeDamage(100).actualDamage).toBe(100);
  });

  it('BattleUnit이 cult와 cultState를 보존한다', () => {
    const unit = new BattleUnit(makeData('olympian', 'olympus'), 1);

    expect(unit.cult).toBe('olympus');
    expect(unit.cultState).toMatchObject({ divinity: 0, doom: 0, barrier: 0, runes: [] });
  });

  it('아발론 유닛의 턴 시작에 아군 방어막이 생성된다', () => {
    const ally = new BattleUnit(makeData('avalon_hero', 'avalon'), 1);
    const enemy = new BattleUnit(makeData('enemy', undefined), 1, true);
    const system = new BattleSystem([ally], [enemy]);
    system.initBattle();

    system.applyCultTurnStart(ally);

    const expected = Math.floor(ally.atk * AVALON.WARD_ATK_RATIO);
    expect(ally.cultState.barrier).toBe(expected);
  });

  it('방어막이 피해를 흡수해 HP 손실이 줄어든다', () => {
    const ally = new BattleUnit(makeData('avalon_hero', 'avalon'), 1);
    grantBarrier(ally, 50);

    const result = ally.takeDamage(80);

    expect(result.absorbed).toBe(50);
    expect(result.actualDamage).toBe(30);
    expect(ally.currentHp).toBe(ally.maxHp - 30);
  });

  it('요미 유닛의 공격이 Doom을 누적하고 처형 피해를 적용한다', () => {
    const ally = new BattleUnit(makeData('yomi_hero', 'yomi'), 1);
    const enemy = new BattleUnit(makeData('enemy', undefined), 1, true);
    const system = new BattleSystem([ally], [enemy]);
    system.initBattle();

    enemy.cultState.doom = YOMI.DOOM_SENTENCE_THRESHOLD - 1;
    const effects = system.applyCultHits(ally, enemy, { id: 'basic' });
    const execution = effects.find(e => e.label === 'death_sentence');

    expect(execution).toBeDefined();
    expect(execution.applied).toBeGreaterThan(0);
    expect(enemy.currentHp).toBeLessThan(enemy.maxHp);
  });

  it('행동 불가 상태의 유닛은 턴이 스킵된다', () => {
    const ally = new BattleUnit(makeData('hero', 'olympus'), 1);
    const enemy = new BattleUnit(makeData('enemy', undefined), 1, true);
    const system = new BattleSystem([ally], [enemy]);
    system.initBattle();

    applyStatus(ally, { type: STATUS_TYPES.THUNDERSTRUCK, duration: 1 });
    ally.spd = 999;
    system.calculateTurnOrder();

    const result = system.processTurn();

    expect(result.turnResult.blockedBy).toBe(STATUS_TYPES.THUNDERSTRUCK);
    expect(result.turnResult.results).toHaveLength(0);
    expect(enemy.currentHp).toBe(enemy.maxHp);
  });
});
