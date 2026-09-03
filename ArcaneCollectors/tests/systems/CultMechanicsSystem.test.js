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

  it('구현 여부(implemented)를 12기관 전부에 대해 표시한다 (MECH-03)', () => {
    expect(parseCultEffect('thunderstruck_40').implemented).toBe(true);
    expect(parseCultEffect('doom_stack_1').implemented).toBe(true);
    expect(parseCultEffect('shield_all').implemented).toBe(true);
    expect(parseCultEffect('rune_burst').implemented).toBe(true);
    expect(parseCultEffect('freeze_20').implemented).toBe(true);
    expect(parseCultEffect('random_multiplier').implemented).toBe(true);
    expect(parseCultEffect('last_stand').implemented).toBe(true);
    expect(parseCultEffect('balance_field').implemented).toBe(true);
  });

  it('getUnimplementedEffects는 빈 배열이다 — 56토큰 전부 구현 (MECH-03)', () => {
    const unimplemented = getUnimplementedEffects();

    expect(unimplemented).toEqual([]);
    expect(getAllCultEffectTokens().length).toBe(56);
    getAllCultEffectTokens().forEach(token => {
      const parsed = parseCultEffect(token);
      expect(IMPLEMENTED_CULTS).toContain(parsed.cult);
      expect(CULT_EFFECT_HANDLERS[parsed.type]).toBeDefined();
    });
  });

  it('IMPLEMENTED_CULTS는 12기관 전부를 담는다', () => {
    expect(IMPLEMENTED_CULTS).toHaveLength(12);
    ['olympus', 'valhalla', 'asgard', 'avalon', 'takamagahara', 'kunlun',
      'yomi', 'helheim', 'tartarus', 'chaos', 'nature', 'balance']
      .forEach(cult => expect(IMPLEMENTED_CULTS).toContain(cult));
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

// ============================================
// 7. MECH-03 — 나머지 8기관 + 교단 상성 + 피해 경로 통일
// ============================================

import {
  CULT_MATCHUP,
  addCold,
  addGrowth,
  addRage,
  calcEquilibrium,
  cleanseDebuffs,
  countDebuffs,
  getCritBonus,
  getCultAdvantage,
  getCultMatchupMultiplier,
  getDefPierceRatio,
  getGrowthMultiplier,
  getMatchupScale,
  getRageMultiplier,
  getStatus,
  grantExtraAction,
  consumeExtraAction,
  isCultMatchupEnabled,
  isPermafrost,
  setCultMatchupEnabled
} from '../../src/systems/CultMechanicsSystem.js';
import { AttackCommand, SkillCommand } from '../../src/systems/commands/index.js';
import { PvPSystem } from '../../src/systems/PvPSystem.js';

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  isOnline: () => false
}));

vi.mock('../../src/systems/EnergySystem.js', () => ({
  default: { consume: () => ({ success: true }) }
}));

const VALHALLA = CULT_MECHANICS_CONFIG.valhalla;
const TAKAMA = CULT_MECHANICS_CONFIG.takamagahara;
const HELHEIM = CULT_MECHANICS_CONFIG.helheim;
const TARTARUS = CULT_MECHANICS_CONFIG.tartarus;
const KUNLUN = CULT_MECHANICS_CONFIG.kunlun;
const NATURE = CULT_MECHANICS_CONFIG.nature;
const CHAOS = CULT_MECHANICS_CONFIG.chaos;
const BALANCE = CULT_MECHANICS_CONFIG.balance;

/** 토큰 적중 훅 실행 헬퍼 */
const hitWith = (attacker, target, cultEffect, { rng = 0.5, allies, enemies, skill } = {}) =>
  CultMechanicsSystem.onHit({
    attacker,
    target,
    skill: skill || { id: 'basic', cultEffect },
    allies: allies || [attacker],
    enemies: enemies || [target],
    rng: fixedRng(rng)
  });

/** 토큰 시전 훅 실행 헬퍼 */
const castWith = (attacker, targets, cultEffect, { rng = 0.5, allies, enemies } = {}) =>
  CultMechanicsSystem.onSkillUse({
    attacker,
    targets,
    skill: { id: 'skill1', cultEffect },
    allies: allies || [attacker],
    enemies: enemies || targets,
    rng: fixedRng(rng)
  });

describe('Valhalla — Berserker Rage / Last Stand / Warrior Pride', () => {
  let attacker;
  let target;

  beforeEach(() => {
    attacker = makeUnit({ id: 'valhalla_hero', cult: 'valhalla' });
    target = makeUnit({ id: 'target', isEnemy: true });
  });

  it('Berserker Rage는 HP 구간에 따라 ATK 배율을 올린다', () => {
    expect(getRageMultiplier(attacker)).toBe(1);

    attacker.currentHp = attacker.maxHp * VALHALLA.RAGE_MID_HP;
    expect(getRageMultiplier(attacker)).toBeCloseTo(1 + VALHALLA.RAGE_MID_ATK);

    attacker.currentHp = attacker.maxHp * VALHALLA.RAGE_LOW_HP;
    expect(getRageMultiplier(attacker)).toBeCloseTo(1 + VALHALLA.RAGE_LOW_ATK);
  });

  it('berserker_stack은 분노 스택을 1 쌓고 스택당 ATK +5%가 붙는다', () => {
    castWith(attacker, [attacker], 'berserker_stack');

    expect(attacker.cultState.rage).toBe(1);
    expect(getOutgoingDamageMultiplier(attacker)).toBeCloseTo(1 + VALHALLA.BERSERK_STACK_ATK);
  });

  it('berserk_overdrive는 분노 스택을 즉시 최대치로 채운다', () => {
    castWith(attacker, [attacker], 'berserk_overdrive');

    expect(attacker.cultState.rage).toBe(VALHALLA.BERSERK_STACK_MAX);
    addRage(attacker, 3);
    expect(attacker.cultState.rage).toBe(VALHALLA.BERSERK_STACK_MAX);
  });

  it('low_hp_bonus는 Frenzy Mark를 남기고 발할라 공격자에게만 피해가 증폭된다', () => {
    attacker.currentHp = attacker.maxHp * 0.4;
    const effects = hitWith(attacker, target, 'low_hp_bonus');

    expect(hasStatus(target, STATUS_TYPES.FRENZY_MARK)).toBe(true);
    expect(effects.some(e => e.label === 'berserker_rage')).toBe(true);
    expect(getIncomingDamageMultiplier(target, attacker)).toBeCloseTo(1 + VALHALLA.FRENZY_MARK_BONUS);
    expect(getIncomingDamageMultiplier(target, makeUnit({ cult: 'olympus' }))).toBe(1);
  });

  it('Last Stand는 전투당 1회 HP 1로 생존시키고 1턴 무적을 남긴다', () => {
    // Warrior's Pride 환산치(최대 HP 15%)로도 치명적인 HP에서만 Last Stand가 필요하다
    attacker.currentHp = 100;
    const survived = absorbDamage(attacker, 9999);

    expect(survived.lastStand).toBe(true);
    expect(survived.damage).toBe(100 - VALHALLA.LAST_STAND_HP);
    expect(hasStatus(attacker, STATUS_TYPES.INVULNERABLE)).toBe(true);
    expect(absorbDamage(attacker, 500).damage).toBe(0);
  });

  it("Warrior's Pride는 최대 HP 40% 이상 한 방을 15%로 환산하고 1턴 쿨다운을 갖는다", () => {
    const heavy = absorbDamage(attacker, attacker.maxHp * VALHALLA.PRIDE_DAMAGE_RATIO);

    expect(heavy.pride).toBe(true);
    expect(heavy.damage).toBe(Math.floor(attacker.maxHp * VALHALLA.PRIDE_CONVERT_RATIO));

    const again = absorbDamage(attacker, attacker.maxHp * VALHALLA.PRIDE_DAMAGE_RATIO);
    expect(again.pride).toBe(false);

    tickStatuses(attacker);
    expect(attacker.cultState.prideCooldown).toBe(0);
  });

  it('last_stand 토큰은 소진된 Last Stand를 다시 무장한다', () => {
    attacker.cultState.lastStandUsed = true;
    castWith(attacker, [attacker], 'last_stand');

    expect(attacker.cultState.lastStandUsed).toBe(false);
    expect(hasStatus(attacker, STATUS_TYPES.LAST_STAND)).toBe(true);
  });
});

describe('Takamagahara — Kami no Ma / Extra Action / Dazzle', () => {
  let hero;
  let ally;
  let enemy;

  beforeEach(() => {
    hero = makeUnit({ id: 'taka', cult: 'takamagahara', spd: 150 });
    ally = makeUnit({ id: 'ally', spd: 100 });
    enemy = makeUnit({ id: 'enemy', spd: 120, isEnemy: true });
  });

  it('Kami no Ma는 전투 시작 시 SPD 최고 아군에게 선제를 준다', () => {
    CultMechanicsSystem.onBattleStart([hero, ally, enemy]);

    expect(hasStatus(hero, STATUS_TYPES.KAMI_NO_MA)).toBe(true);
    expect(getEffectiveSpd(hero)).toBeGreaterThan(getEffectiveSpd(enemy));
    expect(getEffectiveSpd(hero)).toBe(hero.spd + TAKAMA.KAMI_NO_MA_SPD_BONUS);
  });

  it('spd_up_10은 아군 전체에 SPD +10% 가속을 건다', () => {
    castWith(hero, [hero], 'spd_up_10', { allies: [hero, ally] });

    expect(getStatus(ally, STATUS_TYPES.HASTE).value).toBeCloseTo(0.1);
    expect(getEffectiveSpd(ally)).toBeCloseTo(ally.spd * 1.1);
  });

  it('extra_action은 추가 행동 1회를 부여하고 소비하면 사라진다', () => {
    castWith(hero, [hero], 'extra_action');

    expect(hero.cultState.extraActions).toBe(TAKAMA.EXTRA_ACTION_MAX);
    expect(consumeExtraAction(hero)).toBe(true);
    expect(consumeExtraAction(hero)).toBe(false);
  });

  it('speed_dominance는 적 전체에 Dazzle을 걸어 기대 피해를 30% 낮춘다', () => {
    castWith(hero, [enemy], 'speed_dominance', { enemies: [enemy] });

    expect(hasStatus(enemy, STATUS_TYPES.DAZZLE)).toBe(true);
    expect(getOutgoingDamageMultiplier(enemy)).toBeCloseTo(1 - TAKAMA.DAZZLE_DAMAGE_PENALTY);
    expect(hasStatus(hero, STATUS_TYPES.HASTE)).toBe(true);
  });

  it('Sunlit Grace는 적 평균보다 빠를 때만 크리 확률을 올린다', () => {
    expect(getCritBonus(hero, { enemies: [enemy] })).toBeCloseTo(TAKAMA.SUNLIT_CRIT_BONUS);

    hero.spd = 10;
    expect(getCritBonus(hero, { enemies: [enemy] })).toBe(0);
  });

  it("Heaven's Gift는 처치에 성공한 유닛에게 추가 행동을 준다", () => {
    const fallen = makeUnit({ id: 'fallen', isAlive: false });
    CultMechanicsSystem.onDeath({ unit: fallen, killer: hero, allies: [fallen], enemies: [hero] });

    expect(hero.cultState.extraActions).toBe(1);
  });
});

describe('Helheim — Frost Cage / Permafrost / Numbing Aura', () => {
  let hero;
  let enemy;
  let enemy2;

  beforeEach(() => {
    hero = makeUnit({ id: 'hel', cult: 'helheim' });
    enemy = makeUnit({ id: 'enemy', isEnemy: true });
    enemy2 = makeUnit({ id: 'enemy2', isEnemy: true });
  });

  it('freeze_20은 확률 판정에 성공할 때만 빙결과 Cold Stack을 남긴다', () => {
    hitWith(hero, enemy, 'freeze_20', { rng: 0.9 });
    expect(hasStatus(enemy, STATUS_TYPES.FREEZE)).toBe(false);

    hitWith(hero, enemy, 'freeze_20', { rng: 0.1 });
    expect(hasStatus(enemy, STATUS_TYPES.FREEZE)).toBe(true);
    expect(enemy.cultState.cold).toBe(HELHEIM.COLD_PER_CC);
  });

  it('stun_2turns는 2턴 기절과 Cold Stack을 확정 부여한다', () => {
    hitWith(hero, enemy, 'stun_2turns');

    expect(getStatus(enemy, STATUS_TYPES.STUN).duration).toBe(2);
    expect(enemy.cultState.cold).toBeGreaterThan(0);
    expect(tickStatuses(enemy).blockedBy).toBe(STATUS_TYPES.STUN);
  });

  it('Cold Stack 3이면 Permafrost — SPD 0 + 받는 피해 +25% + 행동 불가', () => {
    addCold(enemy, HELHEIM.PERMAFROST_THRESHOLD);

    expect(isPermafrost(enemy)).toBe(true);
    expect(getEffectiveSpd(enemy)).toBe(0);
    expect(getIncomingDamageMultiplier(enemy)).toBeCloseTo(1 + HELHEIM.PERMAFROST_AMP);
    expect(tickStatuses(enemy).blockedBy).toBe('permafrost');
  });

  it('Cold Stack은 턴마다 1씩 녹는다', () => {
    addCold(enemy, 2);
    tickStatuses(enemy);
    expect(enemy.cultState.cold).toBe(1);
    tickStatuses(enemy);
    expect(enemy.cultState.cold).toBe(0);
  });

  it('terror_all은 적 전체 공격력을 20% 깎는다', () => {
    hitWith(hero, enemy, 'terror_all', { enemies: [enemy, enemy2] });

    expect(hasStatus(enemy, STATUS_TYPES.TERROR)).toBe(true);
    expect(hasStatus(enemy2, STATUS_TYPES.TERROR)).toBe(true);
    expect(getOutgoingDamageMultiplier(enemy)).toBeCloseTo(1 - HELHEIM.TERROR_ATK_PENALTY);
  });

  it('Numbing Aura는 전투 시작 시 적 파티 SPD를 10% 낮춘다', () => {
    CultMechanicsSystem.onBattleStart([hero, enemy]);

    expect(hasStatus(enemy, STATUS_TYPES.NUMBING)).toBe(true);
    expect(getEffectiveSpd(enemy)).toBeCloseTo(enemy.spd * (1 - HELHEIM.NUMBING_AURA_SPD));
  });
});

describe('Tartarus — Titan Force / Armor Shred / Abyss Gaze', () => {
  let hero;
  let target;

  beforeEach(() => {
    hero = makeUnit({ id: 'tartarus_hero', cult: 'tartarus', atk: 100 });
    target = makeUnit({ id: 'target', def: 0, isEnemy: true });
  });

  it('armor_pierce_20은 방어 관통 20%를 1턴 부여한다', () => {
    castWith(hero, [target], 'armor_pierce_20');

    expect(getDefPierceRatio(hero, target)).toBeCloseTo(0.2);
  });

  it('full_armor_pierce는 방어를 완전히 무시한다', () => {
    castWith(hero, [target], 'full_armor_pierce');

    expect(getDefPierceRatio(hero, target)).toBe(1);
  });

  it("Titan Force는 적 DEF 비율에 따라 관통률을 올리고 Titan's Wrath 피해를 더한다", () => {
    const bulky = makeUnit({ id: 'bulky', def: 40, isEnemy: true });
    expect(getDefPierceRatio(hero, bulky)).toBeCloseTo(TARTARUS.TITAN_PIERCE_A);

    const wall = makeUnit({ id: 'wall', def: 60, isEnemy: true });
    expect(getDefPierceRatio(hero, wall)).toBeCloseTo(TARTARUS.TITAN_PIERCE_B);
    expect(getIncomingDamageMultiplier(wall, hero)).toBeCloseTo(1 + TARTARUS.TITAN_WRATH_DAMAGE);
  });

  it('armor_shred는 스택당 DEF를 10% 깎고 3스택에서 멈춘다', () => {
    const wall = makeUnit({ id: 'wall', def: 100, isEnemy: true });

    hitWith(hero, wall, 'armor_shred');
    expect(getEffectiveDef(wall)).toBeCloseTo(100 * (1 - TARTARUS.SHRED_PER_STACK));

    for (let i = 0; i < 5; i += 1) hitWith(hero, wall, 'armor_shred');
    expect(getStatus(wall, STATUS_TYPES.ARMOR_SHRED).stacks).toBe(TARTARUS.SHRED_MAX_STACKS);
    expect(getEffectiveDef(wall)).toBeCloseTo(100 * (1 - TARTARUS.SHRED_MAX_STACKS * TARTARUS.SHRED_PER_STACK));
  });

  it('mass_armor_shred는 적 전체에 파쇄를 건다', () => {
    const other = makeUnit({ id: 'other', def: 100, isEnemy: true });
    hitWith(hero, target, 'mass_armor_shred', { enemies: [target, other] });

    expect(hasStatus(target, STATUS_TYPES.ARMOR_SHRED)).toBe(true);
    expect(hasStatus(other, STATUS_TYPES.ARMOR_SHRED)).toBe(true);
  });

  it('shield_break는 방어막을 부수고 그 절반을 추가 피해로 돌린다', () => {
    grantBarrier(target, 200);
    const effects = hitWith(hero, target, 'shield_break');

    expect(target.cultState.barrier).toBe(0);
    const extra = effects.find(e => e.label === 'shield_break');
    expect(extra.amount).toBe(Math.floor(200 * TARTARUS.SHIELD_BREAK_RATIO));
    expect(hasStatus(target, STATUS_TYPES.TITANFALL)).toBe(true);
    expect(getOutgoingDamageMultiplier(target)).toBeCloseTo(1 - TARTARUS.TITANFALL_PENALTY);
  });

  it('Abyss Gaze는 방어막을 절반만 소모시키고 나머지를 HP로 흘린다', () => {
    grantBarrier(target, 500);
    const absorbed = absorbDamage(target, 100, hero);

    expect(absorbed.absorbed).toBe(Math.floor(100 * TARTARUS.ABYSS_GAZE_SPLIT));
    expect(absorbed.damage).toBe(100 - Math.floor(100 * TARTARUS.ABYSS_GAZE_SPLIT));
  });
});

describe('Kunlun — Five Poisons / Chaos Bloom / Immortal Herb', () => {
  let hero;
  let target;

  beforeEach(() => {
    hero = makeUnit({ id: 'kunlun_hero', cult: 'kunlun' });
    target = makeUnit({ id: 'target', isEnemy: true });
  });

  it('poison_2turns는 2턴 독을 걸고 턴마다 ATK×12% 피해를 준다', () => {
    hitWith(hero, target, 'poison_2turns');

    const expected = Math.floor(hero.atk * KUNLUN.POISON_ATK_RATIO);
    expect(getStatus(target, STATUS_TYPES.POISON).duration).toBe(2);
    expect(tickStatuses(target).dotDamage).toBe(expected);
  });

  it('multi_poison은 오독 3종을 동시에 걸어 Chaos Bloom 조건을 채운다', () => {
    hitWith(hero, target, 'multi_poison');

    expect(hasStatus(target, STATUS_TYPES.POISON)).toBe(true);
    expect(hasStatus(target, STATUS_TYPES.WEAKEN)).toBe(true);
    expect(hasStatus(target, STATUS_TYPES.WITHERING)).toBe(true);
    expect(countDebuffs(target)).toBeGreaterThanOrEqual(KUNLUN.CHAOS_BLOOM_THRESHOLD);
  });

  it('Chaos Bloom은 최대 HP 5% 고정 피해를 더하고 디버프를 1턴 연장한다', () => {
    hitWith(hero, target, 'multi_poison');
    const tick = tickStatuses(target);

    expect(tick.chaosBloom).toBe(true);
    const poisonDot = Math.floor(hero.atk * KUNLUN.POISON_ATK_RATIO);
    const bloom = Math.floor(target.maxHp * KUNLUN.CHAOS_BLOOM_HP_RATIO);
    expect(tick.dotDamage).toBe(poisonDot + bloom);
    expect(getStatus(target, STATUS_TYPES.POISON).duration).toBe(KUNLUN.POISON_DURATION);
  });

  it('Withering 스택은 DEF를 5%씩 깎는다', () => {
    const wall = makeUnit({ id: 'wall', def: 100, isEnemy: true });
    hitWith(hero, wall, 'multi_poison');

    expect(getEffectiveDef(wall)).toBeCloseTo(100 * (1 - KUNLUN.WITHERING_DEF_PER_STACK));
  });

  it('cleanse_all은 아군 디버프를 전부 걷어내고 그만큼 회복시킨다', () => {
    const ally = makeUnit({ id: 'ally', currentHp: 500 });
    applyStatus(ally, { type: STATUS_TYPES.POISON, duration: 2, value: 10 });
    applyStatus(ally, { type: STATUS_TYPES.WEAKEN, duration: 2 });

    castWith(hero, [ally], 'cleanse_all', { allies: [hero, ally] });

    expect(countDebuffs(ally)).toBe(0);
    expect(ally.currentHp).toBeGreaterThan(500);
  });

  it('Immortal Herb는 아군 디버프 수만큼 턴 시작에 자가 회복한다', () => {
    hero.currentHp = 500;
    const ally = makeUnit({ id: 'ally' });
    applyStatus(ally, { type: STATUS_TYPES.POISON, duration: 2, value: 5 });

    CultMechanicsSystem.onTurnStart({ unit: hero, allies: [hero, ally], enemies: [target] });

    expect(hero.currentHp).toBe(500 + Math.floor(hero.atk * KUNLUN.IMMORTAL_HERB_ATK_RATIO));
  });
});

describe('Nature — Growth Ring / Overgrowth', () => {
  let hero;
  let target;

  beforeEach(() => {
    hero = makeUnit({ id: 'nature_hero', cult: 'nature' });
    target = makeUnit({ id: 'target', isEnemy: true });
  });

  it('Growth Ring은 턴마다 스택을 쌓고 스택당 ATK/DEF를 2% 올린다', () => {
    CultMechanicsSystem.onTurnStart({ unit: hero, allies: [hero], enemies: [target] });

    expect(hero.cultState.growth).toBe(NATURE.GROWTH_PER_TURN);
    expect(getGrowthMultiplier(hero)).toBeCloseTo(1 + NATURE.GROWTH_STAT_PER_STACK);
    expect(getEffectiveDef(hero)).toBeCloseTo(hero.def * (1 + NATURE.GROWTH_STAT_PER_STACK));
  });

  it('성장 스택은 상한(10)에서 멈춘다', () => {
    addGrowth(hero, 50);

    expect(hero.cultState.growth).toBe(NATURE.GROWTH_MAX);
    expect(getOutgoingDamageMultiplier(hero)).toBeCloseTo(1 + NATURE.GROWTH_MAX * NATURE.GROWTH_STAT_PER_STACK);
  });

  it('growth_buff는 아군 전체, growth_atk은 자신을 성장시킨다', () => {
    const ally = makeUnit({ id: 'ally' });
    castWith(hero, [hero], 'growth_buff', { allies: [hero, ally] });
    expect(ally.cultState.growth).toBe(NATURE.GROWTH_BUFF_STACKS);

    castWith(hero, [hero], 'growth_atk');
    expect(hero.cultState.growth).toBe(NATURE.GROWTH_BUFF_STACKS + NATURE.GROWTH_ATK_STACKS);
  });

  it('late_game_bonus는 성장 스택에 비례한 추가 피해를 준다', () => {
    addGrowth(hero, 5);
    const effects = hitWith(hero, target, 'late_game_bonus');

    const growthHit = effects.find(e => e.label === 'growth_ring');
    expect(growthHit.amount).toBe(Math.floor(hero.atk * NATURE.LATE_GAME_ATK_RATIO * 5));
  });

  it('earth_liberation은 적 전체에 과성장(도트 + 이동 저하)을 남긴다', () => {
    const other = makeUnit({ id: 'other', isEnemy: true });
    hitWith(hero, target, 'earth_liberation', { enemies: [target, other] });

    expect(hasStatus(target, STATUS_TYPES.OVERGROWTH)).toBe(true);
    expect(hasStatus(other, STATUS_TYPES.OVERGROWTH)).toBe(true);
    expect(getEffectiveSpd(target)).toBeCloseTo(target.spd * (1 - NATURE.OVERGROWTH_SPD_PENALTY));
    expect(tickStatuses(target).dotDamage).toBe(Math.floor(target.maxHp * NATURE.OVERGROWTH_HP_RATIO));
  });

  it('Root of Life는 전투 시작 시 성장 스택을 이월한다', () => {
    CultMechanicsSystem.onBattleStart([hero, target]);

    expect(hero.cultState.growth).toBe(NATURE.ROOT_OF_LIFE_STACKS);
  });
});

describe('Chaos — Wild Card / 무작위 폭발', () => {
  let hero;
  let target;
  let other;

  beforeEach(() => {
    hero = makeUnit({ id: 'chaos_hero', cult: 'chaos' });
    target = makeUnit({ id: 'target', isEnemy: true });
    other = makeUnit({ id: 'other', isEnemy: true });
  });

  it('random_multiplier는 0.5~2.0 사이 배율의 추가 피해를 만든다', () => {
    const effects = hitWith(hero, target, 'random_multiplier', { rng: 0.5 });
    const extra = effects.find(e => e.label === 'chaos_roll');

    expect(extra.amount).toBe(Math.floor(hero.atk * 1.25));
    expect(extra.amount).toBeGreaterThanOrEqual(hero.atk * CHAOS.RANDOM_MULTIPLIER_MIN);
    expect(extra.amount).toBeLessThanOrEqual(hero.atk * CHAOS.RANDOM_MULTIPLIER_MAX);
  });

  it('chaos_burst는 1~3회 연타로 나뉜다', () => {
    const effects = hitWith(hero, target, 'chaos_burst', { rng: 0.5 })
      .filter(e => e.label === 'chaos_burst');

    expect(effects.length).toBeGreaterThanOrEqual(CHAOS.BURST_MIN_HITS);
    expect(effects.length).toBeLessThanOrEqual(CHAOS.BURST_MAX_HITS);
    effects.forEach(e => expect(e.amount).toBe(Math.floor(hero.atk * CHAOS.BURST_ATK_RATIO)));
  });

  it('random_debuff는 무작위 디버프 1종을 남긴다', () => {
    hitWith(hero, target, 'random_debuff', { rng: 0.1 });

    expect(countDebuffs(target)).toBe(1);
  });

  it('chaos_storm과 elemental_collapse는 적 전체를 때린다', () => {
    const storm = hitWith(hero, target, 'chaos_storm', { enemies: [target, other] });
    expect(storm.filter(e => e.label === 'chaos_storm')).toHaveLength(2);

    const collapse = hitWith(hero, target, 'elemental_collapse', { enemies: [target, other] });
    expect(collapse.filter(e => e.label === 'chaos_collapse')).toHaveLength(2);
  });

  it('Wild Card는 매 턴 무작위 효과 1종을 발동한다 (버프 / 전체 피해)', () => {
    const buffTurn = CultMechanicsSystem.onTurnStart({
      unit: hero, allies: [hero], enemies: [target, other], rng: fixedRng(0.05)
    });
    expect(hasStatus(hero, STATUS_TYPES.MADNESS)).toBe(true);
    expect(buffTurn.effects).toHaveLength(1);

    const damageTurn = CultMechanicsSystem.onTurnStart({
      unit: hero, allies: [hero], enemies: [target, other], rng: fixedRng(0.45)
    });
    expect(damageTurn.effects.filter(e => e.kind === 'extraDamage')).toHaveLength(2);
  });

  it('madness_liberation은 자신에게 광기(ATK +50%)를 건다', () => {
    castWith(hero, [hero], 'madness_liberation', { rng: 0.9 });

    expect(getOutgoingDamageMultiplier(hero)).toBeCloseTo(1 + CHAOS.MADNESS_ATK_BONUS);
  });

  it('unstable_explosion은 적 전체를 폭발시키고 낮은 확률로 자신도 다친다', () => {
    const safe = hitWith(hero, target, 'unstable_explosion', { rng: 0.9, enemies: [target, other] });
    expect(safe.filter(e => e.label === 'chaos_explosion')).toHaveLength(2);
    expect(safe.some(e => e.label === 'chaos_misfire')).toBe(false);

    const misfire = hitWith(hero, target, 'unstable_explosion', { rng: 0.05, enemies: [target] });
    expect(misfire.some(e => e.label === 'chaos_misfire')).toBe(true);
  });

  it('random_element와 chaos_liberation도 동작한다', () => {
    const element = hitWith(hero, target, 'random_element', { rng: 0.5 });
    expect(element.find(e => e.label === 'chaos_element').amount).toBeGreaterThan(0);

    const liberation = castWith(hero, [target], 'chaos_liberation', {
      rng: 0.45, allies: [hero], enemies: [target, other]
    });
    expect(liberation.filter(e => e.kind === 'extraDamage')).toHaveLength(4);
  });
});

describe('Balance — Equilibrium / Neutrality / Imbalance', () => {
  let hero;
  let ally;
  let enemy;

  beforeEach(() => {
    hero = makeUnit({ id: 'balance_hero', cult: 'balance' });
    ally = makeUnit({ id: 'ally' });
    enemy = makeUnit({ id: 'enemy', isEnemy: true });
  });

  it('HP 편차가 30% 이상이면 ATK/DEF가 15% 오른다', () => {
    ally.currentHp = ally.maxHp * 0.5;
    const equilibrium = calcEquilibrium(hero, [hero, ally]);

    expect(equilibrium.atk).toBeCloseTo(BALANCE.EQUILIBRIUM_STAT_BONUS);
    expect(equilibrium.def).toBeCloseTo(BALANCE.EQUILIBRIUM_STAT_BONUS);
  });

  it('HP가 균등하면 크리 확률이 20% 오른다', () => {
    CultMechanicsSystem.onTurnStart({ unit: hero, allies: [hero, ally], enemies: [enemy] });

    expect(hero.cultState.equilibrium.crit).toBeCloseTo(BALANCE.EQUILIBRIUM_CRIT_BONUS);
    expect(getCritBonus(hero)).toBeCloseTo(BALANCE.EQUILIBRIUM_CRIT_BONUS);
  });

  it('Neutrality는 상성 효과를 절반으로 줄인다', () => {
    expect(getMatchupScale(hero, enemy)).toBeCloseTo(BALANCE.NEUTRALITY_SCALE);
    expect(getMatchupScale(ally, enemy)).toBe(1);
  });

  it('neutral_buff의 중립장은 상성 효과를 완전히 없앤다', () => {
    castWith(hero, [hero], 'neutral_buff', { allies: [hero, ally] });

    expect(hasStatus(ally, STATUS_TYPES.NEUTRAL_FIELD)).toBe(true);
    expect(getMatchupScale(ally, enemy)).toBe(0);
  });

  it('mood_neutral_all의 Imbalance는 대상의 교단 효과를 무효화한다', () => {
    castWith(hero, [enemy], 'mood_neutral_all', { enemies: [enemy] });
    inscribeRune(enemy, 'atk');

    expect(hasStatus(enemy, STATUS_TYPES.IMBALANCE)).toBe(true);
    expect(getOutgoingDamageMultiplier(enemy)).toBe(1);
    expect(getMatchupScale(enemy, hero)).toBe(0);
  });

  it('neutral_damage는 상성과 무관한 고정 추가 피해를 준다', () => {
    const effects = hitWith(hero, enemy, 'neutral_damage');
    const extra = effects.find(e => e.label === 'equilibrium');

    expect(extra.amount).toBe(Math.floor(hero.atk * BALANCE.NEUTRAL_DAMAGE_ATK_RATIO));
  });

  it('balance_field는 아군 HP를 평균으로 끌어올린다', () => {
    ally.currentHp = ally.maxHp * 0.2;
    castWith(hero, [hero], 'balance_field', { allies: [hero, ally] });

    expect(ally.currentHp).toBeGreaterThan(ally.maxHp * 0.2);
    expect(ally.currentHp / ally.maxHp).toBeCloseTo(0.6, 1);
  });
});

describe('교단 간 상성 테이블 (기본 OFF)', () => {
  afterEach(() => setCultMatchupEnabled(false));

  it('기본값은 꺼져 있어 기존 수치가 그대로다', () => {
    expect(isCultMatchupEnabled()).toBe(false);
    expect(CULT_MECHANICS_CONFIG.matchup.enabled).toBe(false);
    expect(getCultMatchupMultiplier({ cult: 'olympus' }, { cult: 'chaos' })).toBe(1);
  });

  it('켜면 유리 상성 ×1.25 / 불리 상성 ×0.80이 적용된다', () => {
    setCultMatchupEnabled(true);

    expect(getCultMatchupMultiplier({ cult: 'olympus' }, { cult: 'chaos' }))
      .toBeCloseTo(CULT_MECHANICS_CONFIG.matchup.ADVANTAGE);
    expect(getCultMatchupMultiplier({ cult: 'olympus' }, { cult: 'valhalla' }))
      .toBeCloseTo(CULT_MECHANICS_CONFIG.matchup.DISADVANTAGE);
  });

  it('상성 관계가 없으면 중립 배율이다', () => {
    setCultMatchupEnabled(true);

    expect(getCultMatchupMultiplier({ cult: 'olympus' }, { cult: 'kunlun' })).toBe(1);
    expect(getCultMatchupMultiplier({ cult: null }, { cult: 'kunlun' })).toBe(1);
  });

  it('balance가 끼면 Neutrality로 상성 폭이 절반이 된다', () => {
    setCultMatchupEnabled(true);
    const full = CULT_MECHANICS_CONFIG.matchup.ADVANTAGE;

    expect(getCultMatchupMultiplier({ cult: 'balance' }, { cult: 'asgard' }))
      .toBeCloseTo(1 + (full - 1) * BALANCE.NEUTRALITY_SCALE);
  });

  it('상성표는 설계 문서 §3-3의 12기관을 모두 담는다', () => {
    expect(Object.keys(CULT_MATCHUP)).toHaveLength(12);
    expect(getCultAdvantage('yomi', 'tartarus')).toBe('ADVANTAGE');
    expect(getCultAdvantage('yomi', 'helheim')).toBe('DISADVANTAGE');
    expect(getCultAdvantage('yomi', 'nature')).toBe('NEUTRAL');
  });
});

describe('피해 경로 통일 — 커맨드 / PvP에서도 Holy Thorns 반사가 적용된다', () => {
  const makeData = (id, cult) => ({
    id,
    name: id,
    mood: 'brave',
    rarity: 'SR',
    cult,
    baseStats: { hp: 2000, atk: 200, def: 50, spd: 100 },
    growth: { hp: 100, atk: 10, def: 5, spd: 2 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeGain: 20 }]
  });

  const makePvPChar = (id, cult) => ({
    id,
    name: id,
    level: 10,
    mood: 'brave',
    rarity: 'SR',
    cult,
    stats: { hp: 2000, atk: 200, def: 100, spd: 120 },
    growth: { hp: 100, atk: 10, def: 5, spd: 2 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }]
  });

  it('AttackCommand가 resolveDamage를 지나 반사 피해를 되돌려받는다', () => {
    const attacker = new BattleUnit(makeData('striker', undefined), 1);
    const defender = new BattleUnit(makeData('warden', 'avalon'), 1, true);
    const system = new BattleSystem([attacker], [defender]);
    system.initBattle();
    grantBarrier(defender, 1);

    new AttackCommand(attacker, [defender], system).execute();

    expect(defender.cultState.barrier).toBe(0);
    expect(attacker.currentHp).toBeLessThan(attacker.maxHp);
  });

  it('SkillCommand도 같은 경로를 지나 반사를 받는다', () => {
    const attacker = new BattleUnit(makeData('caster', undefined), 1);
    const defender = new BattleUnit(makeData('warden', 'avalon'), 1, true);
    const system = new BattleSystem([attacker], [defender]);
    system.initBattle();
    grantBarrier(defender, 1);

    new SkillCommand(attacker, [defender], system, {
      id: 'skill1', name: '강타', multiplier: 2, gaugeCost: 0
    }).execute();

    expect(defender.cultState.barrier).toBe(0);
    expect(attacker.currentHp).toBeLessThan(attacker.maxHp);
  });

  it('PvPSystem.simulateBattle이 resolveDamage 단일 경로를 지난다', () => {
    const spy = vi.spyOn(BattleSystem.prototype, 'resolveDamage');

    const result = PvPSystem.simulateBattle(
      [makePvPChar('atk_1', 'olympus'), makePvPChar('atk_2', undefined)],
      [makePvPChar('def_1', 'avalon'), makePvPChar('def_2', 'avalon')]
    );

    expect(['win', 'lose', 'draw']).toContain(result.result);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('PvP 전투에서 아발론 방어막이 생기고 파괴 시 반사 로그가 남는다', () => {
    const messages = [];
    const spy = vi.spyOn(BattleSystem.prototype, 'log')
      .mockImplementation(function log(message) {
        messages.push(message);
        this.battleLog.push({ turn: this.turnCount, message });
      });

    PvPSystem.simulateBattle(
      [makePvPChar('atk_1', 'olympus'), makePvPChar('atk_2', undefined)],
      [makePvPChar('def_1', 'avalon'), makePvPChar('def_2', 'avalon')]
    );

    expect(messages.some(m => m.includes('성스러운 가시'))).toBe(true);
    spy.mockRestore();
  });
});
