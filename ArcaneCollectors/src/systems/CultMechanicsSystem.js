/**
 * CultMechanicsSystem - 교단(Cult) 시그니처 메커니즘 (MECH-02)
 *
 * MECH-01 감사(docs/AUDIT_CULT_MECHANISMS.md)에서 `cultEffect` 토큰이 런타임에
 * 전혀 소비되지 않는다는 결론이 나왔다. 본 모듈은 그 토큰을 파싱하고,
 * 4그룹 대표 기관(공세=olympus / 제어=yomi / 지속=avalon / 균형=asgard)의
 * 시그니처 메커니즘을 순수 함수 + 훅 레지스트리로 구현한다.
 *
 * 설계 원칙
 * - BattleSystem은 훅 지점에서 이 모듈을 "호출만" 한다 (12기관 if문 금지).
 * - 모든 수치는 CULT_MECHANICS_CONFIG 상수로 노출한다 (매직 넘버 금지).
 * - cultEffect가 없고 cult가 미구현 기관인 유닛에게는 어떤 값도 바뀌지 않는다.
 *   (배율 계산 함수는 전부 항등원 1 / 0 / 원본 스탯을 반환)
 *
 * 훅 종류 (7종)
 *   onBattleStart / onTurnStart / onSkillUse / beforeDamage / onHit / onDamaged / onDeath
 *
 * 반환 규약: 훅은 "효과 서술자(descriptor)" 배열을 반환하고, 실제 HP 변동이
 * 필요한 항목(kind === 'extraDamage')만 호출부(BattleSystem)가 적용한다.
 */
import ascendedHeroesData from '../data/ascended-heroes.json';

// ============================================
// 설정 상수
// ============================================

/** BattleSystem.calculateDamage와 동일한 방어 감쇠 규약 */
export const DAMAGE_CONFIG = Object.freeze({
  DEF_DIVISOR: 1000,
  DEF_REDUCTION_CAP: 0.9,
});

/** 4그룹 대표 기관 수치 (docs/CULT_SYSTEM_DESIGN.md §2 수치 설계 기준) */
export const CULT_MECHANICS_CONFIG = Object.freeze({
  olympus: Object.freeze({
    DIVINITY_MAX: 100,
    DIVINITY_GAIN_BASIC: 15,
    DIVINITY_GAIN_SKILL: 30,
    LIGHTNING_ATK_RATIO: 0.5,
    LIGHTNING_DEF_PIERCE: 0.15,
    LIGHTNING_STUN_CHANCE: 0.2,
    THUNDERSTRUCK_DURATION: 1,
    THUNDERSTRUCK_AMP: 0.3,
    GLORY_AURA_ATK: 0.1,
    GLORY_AURA_DURATION: 1,
  }),
  yomi: Object.freeze({
    DOOM_PER_HIT: 1,
    DOOM_SENTENCE_THRESHOLD: 10,
    DOOM_EXECUTE_THRESHOLD: 5,
    DEATH_SENTENCE_HP_RATIO: 0.2,
    DOOM_TRANSFER_RATIO: 0.5,
    CURSE_DURATION: 2,
    CURSE_DOT_ATK_RATIO: 0.15,
    UNDERWORLD_LINK_PER_DEAD: 0.1,
    UNDERWORLD_LINK_MAX: 0.3,
  }),
  avalon: Object.freeze({
    WARD_ATK_RATIO: 0.3,
    FORTRESS_ATK_RATIO: 0.5,
    THORNS_REFLECT_RATIO: 0.5,
    ROUND_TABLE_HEAL_PER_MEMBER: 0.1,
    ROUND_TABLE_HEAL_MAX: 0.4,
  }),
  asgard: Object.freeze({
    RUNE_TYPES: Object.freeze(['atk', 'def', 'spd']),
    RUNE_STAT_BONUS: 0.15,
    RUNEBURST_REQUIRED: 3,
    RUNEBURST_DAMAGE_BONUS: 0.4,
    RUNEBURST_SHIELD_HITS: 1,
    BIFROST_DURATION: 1,
  }),
});

/** 시그니처 메커니즘이 런타임 구현된 기관 (MECH-02 범위) */
export const IMPLEMENTED_CULTS = Object.freeze(['olympus', 'yomi', 'avalon', 'asgard']);

/** 상태이상 종류 */
export const STATUS_TYPES = Object.freeze({
  THUNDERSTRUCK: 'thunderstruck',
  CURSE: 'curse',
  GLORY_AURA: 'glory_aura',
  BIFROST: 'bifrost',
});

// ============================================
// cultEffect 토큰 파서
// ============================================

/** `_40`, `_2turns` 처럼 숫자로 시작하는 마지막 세그먼트 */
const NUMERIC_SEGMENT_RE = /^(\d+)([a-z]*)$/;
/** `doom5` 처럼 문자 뒤에 숫자가 붙은 마지막 세그먼트 */
const TRAILING_NUMBER_RE = /^([a-z]+?)(\d+)$/;

/**
 * cultEffect 토큰 → 구조체
 * 예) 'thunderstruck_40'  → { type: 'thunderstruck', value: 40 }
 *     'stun_2turns'       → { type: 'stun', value: 2, unit: 'turns' }
 *     'execution_doom5'   → { type: 'execution_doom', value: 5 }
 *     'shield_all'        → { type: 'shield_all', value: null }
 * @param {string} token cultEffect 토큰
 * @returns {Object|null} { raw, type, value, unit, cult, implemented }
 */
export function parseCultEffect(token) {
  if (typeof token !== 'string' || token.length === 0) return null;

  const parts = token.split('_');
  const last = parts[parts.length - 1];
  let type = token;
  let value = null;
  let unit = null;

  const numeric = NUMERIC_SEGMENT_RE.exec(last);
  const trailing = TRAILING_NUMBER_RE.exec(last);

  if (parts.length > 1 && numeric) {
    value = Number(numeric[1]);
    unit = numeric[2] || null;
    type = parts.slice(0, -1).join('_');
  } else if (trailing) {
    value = Number(trailing[2]);
    type = [...parts.slice(0, -1), trailing[1]].join('_');
  }

  return {
    raw: token,
    type,
    value,
    unit,
    cult: TOKEN_CULT_MAP[token] || null,
    implemented: Object.prototype.hasOwnProperty.call(CULT_EFFECT_HANDLERS, type),
  };
}

/** ascended-heroes.json에서 토큰 → 교단 맵 구축 */
function buildTokenCultMap() {
  const map = {};
  const heroes = ascendedHeroesData?.ascendedHeroes || [];
  heroes.forEach(hero => {
    (hero.skills || []).forEach(skill => {
      if (skill.cultEffect) map[skill.cultEffect] = hero.cultId || null;
    });
  });
  return map;
}

/** 데이터에 존재하는 전체 cultEffect 토큰 → 교단 */
export const TOKEN_CULT_MAP = Object.freeze(buildTokenCultMap());

/** 데이터에 존재하는 전체 cultEffect 토큰 목록 */
export function getAllCultEffectTokens() {
  return Object.keys(TOKEN_CULT_MAP);
}

/**
 * 파싱은 되지만 런타임 동작이 없는(no-op) 토큰 목록
 * @returns {Array<Object>} [{ token, type, value, cult }]
 */
export function getUnimplementedEffects() {
  return getAllCultEffectTokens()
    .map(token => parseCultEffect(token))
    .filter(effect => !effect.implemented)
    .map(({ raw, type, value, cult }) => ({ token: raw, type, value, cult }));
}

// ============================================
// 교단 런타임 상태
// ============================================

/** 유닛별 교단 런타임 상태 초기값 */
export function createCultState() {
  return {
    divinity: 0,      // olympus: Divine Charge 게이지
    doom: 0,          // yomi: Doom 스택 (피격자에 누적)
    barrier: 0,       // avalon: Holy Ward 방어막 잔량
    runes: [],        // asgard: 적층된 룬 ('atk' | 'def' | 'spd')
    runeburst: false, // asgard: 다음 피해 +40%
    runeShield: 0,    // asgard: 완전 흡수 가능 횟수
    statuses: [],     // 상태이상 [{ type, duration, value, sourceId }]
  };
}

/** 유닛에 cultState가 없으면 생성해 반환 */
export function ensureCultState(unit) {
  if (!unit) return null;
  if (!unit.cultState) unit.cultState = createCultState();
  return unit.cultState;
}

/** 상태이상 부여 (같은 종류는 지속시간 갱신) */
export function applyStatus(unit, status) {
  const state = ensureCultState(unit);
  if (!state) return null;

  const existing = state.statuses.find(s => s.type === status.type);
  if (existing) {
    existing.duration = Math.max(existing.duration, status.duration);
    existing.value = status.value;
    existing.sourceId = status.sourceId;
    return existing;
  }
  const entry = { value: null, sourceId: null, ...status };
  state.statuses.push(entry);
  return entry;
}

/** 상태이상 보유 여부 */
export function hasStatus(unit, type) {
  return !!unit?.cultState?.statuses?.some(s => s.type === type);
}

/** 상태이상 조회 */
export function getStatus(unit, type) {
  return unit?.cultState?.statuses?.find(s => s.type === type) || null;
}

/**
 * 턴 시작 처리 — 행동 차단 판정 → DoT 피해 → 지속시간 감소
 * @param {Object} unit 행동 유닛
 * @returns {Object} { blocked, blockedBy, dotDamage, expired }
 */
export function tickStatuses(unit) {
  const state = ensureCultState(unit);
  const result = { blocked: false, blockedBy: null, dotDamage: 0, expired: [] };
  if (!state || state.statuses.length === 0) return result;

  const struck = state.statuses.find(s => s.type === STATUS_TYPES.THUNDERSTRUCK);
  if (struck) {
    result.blocked = true;
    result.blockedBy = STATUS_TYPES.THUNDERSTRUCK;
  }

  const curse = state.statuses.find(s => s.type === STATUS_TYPES.CURSE);
  if (curse) result.dotDamage = Math.max(1, Math.floor(curse.value || 0));

  state.statuses.forEach(s => { s.duration -= 1; });
  result.expired = state.statuses.filter(s => s.duration <= 0).map(s => s.type);
  state.statuses = state.statuses.filter(s => s.duration > 0);

  return result;
}

// ============================================
// 스탯/배율 순수 함수 (교단 상태가 없으면 항등원 반환)
// ============================================

/** 룬 보유 시 스탯 배율 */
function runeMultiplier(unit, runeType) {
  const runes = unit?.cultState?.runes;
  if (!runes || runes.length === 0) return 1;
  const count = runes.filter(r => r === runeType).length;
  return 1 + count * CULT_MECHANICS_CONFIG.asgard.RUNE_STAT_BONUS;
}

/** 룬 방어 보정이 반영된 유효 DEF */
export function getEffectiveDef(unit) {
  if (!unit) return 0;
  return unit.def * runeMultiplier(unit, 'def');
}

/** 룬 속도 보정이 반영된 유효 SPD */
export function getEffectiveSpd(unit) {
  if (!unit) return 0;
  return unit.spd * runeMultiplier(unit, 'spd');
}

/** Bifrost Link 등 플랫 ATK 가산치 */
export function getFlatAtkBonus(unit) {
  const bifrost = getStatus(unit, STATUS_TYPES.BIFROST);
  return bifrost ? Math.floor(bifrost.value || 0) : 0;
}

/** 사망 아군 수 기반 Underworld Link 배율 (yomi 패시브) */
export function getUnderworldLinkMultiplier(unit, allies = []) {
  if (unit?.cult !== 'yomi') return 1;
  const cfg = CULT_MECHANICS_CONFIG.yomi;
  const dead = allies.filter(a => a && a !== unit && !a.isAlive).length;
  return 1 + Math.min(cfg.UNDERWORLD_LINK_MAX, dead * cfg.UNDERWORLD_LINK_PER_DEAD);
}

/**
 * 공격 측 피해 배율 (룬 ATK × Runeburst × Glory Aura × Underworld Link)
 * @param {Object} attacker 공격자
 * @param {Object} [context] { allies }
 * @returns {number} 배율 (교단 상태 없으면 1)
 */
export function getOutgoingDamageMultiplier(attacker, context = {}) {
  if (!attacker) return 1;
  let multiplier = runeMultiplier(attacker, 'atk');

  if (attacker.cultState?.runeburst) {
    multiplier *= 1 + CULT_MECHANICS_CONFIG.asgard.RUNEBURST_DAMAGE_BONUS;
  }
  const glory = getStatus(attacker, STATUS_TYPES.GLORY_AURA);
  if (glory) multiplier *= 1 + (glory.value ?? CULT_MECHANICS_CONFIG.olympus.GLORY_AURA_ATK);

  return multiplier * getUnderworldLinkMultiplier(attacker, context.allies || []);
}

/** 피격 측 피해 배율 (Thunderstruck 피해 증폭) */
export function getIncomingDamageMultiplier(target) {
  if (!hasStatus(target, STATUS_TYPES.THUNDERSTRUCK)) return 1;
  return 1 + CULT_MECHANICS_CONFIG.olympus.THUNDERSTRUCK_AMP;
}

/** Round Table Bond — 아발론 아군 수만큼 치유량 증가 */
export function getHealMultiplier(healer, allies = []) {
  const cfg = CULT_MECHANICS_CONFIG.avalon;
  const count = allies.filter(a => a && a.cult === 'avalon').length;
  if (count === 0) return 1;
  return 1 + Math.min(cfg.ROUND_TABLE_HEAL_MAX, count * cfg.ROUND_TABLE_HEAL_PER_MEMBER);
}

// ============================================
// 방어막 / 룬 실드 흡수
// ============================================

/**
 * 피해 확정 전 흡수 처리 (Holy Ward 방어막 + Rune Shield)
 * @param {Object} target 피격 유닛
 * @param {number} damage 원 피해량
 * @returns {Object} { damage, absorbed, reflect, shieldBroken }
 */
export function absorbDamage(target, damage) {
  const state = target?.cultState;
  const result = { damage, absorbed: 0, reflect: 0, shieldBroken: false };
  if (!state) return result;

  if (state.runeShield > 0) {
    state.runeShield -= 1;
    return { damage: 0, absorbed: damage, reflect: 0, shieldBroken: true };
  }
  if (state.barrier > 0) {
    const absorbed = Math.min(state.barrier, damage);
    state.barrier -= absorbed;
    result.absorbed = absorbed;
    result.damage = damage - absorbed;
    if (state.barrier === 0) {
      result.shieldBroken = true;
      result.reflect = Math.floor(damage * CULT_MECHANICS_CONFIG.avalon.THORNS_REFLECT_RATIO);
    }
  }
  return result;
}

/** 방어막 부여 */
export function grantBarrier(unit, amount) {
  const state = ensureCultState(unit);
  if (!state) return 0;
  state.barrier += Math.max(0, Math.floor(amount));
  return state.barrier;
}

// ============================================
// 기관별 핵심 연산 (순수 함수)
// ============================================

/** Divine Charge 충전량 (스킬 종류별) */
export function getDivinityGain(skill) {
  const cfg = CULT_MECHANICS_CONFIG.olympus;
  const id = skill?.id || 'basic';
  if (id === 'awakening') return 0;
  if (id === 'basic') return cfg.DIVINITY_GAIN_BASIC;
  return cfg.DIVINITY_GAIN_SKILL;
}

/**
 * Lightning Strike 추가 피해량 (방어 15% 관통)
 * @returns {number} 추가 피해
 */
export function calcLightningDamage(attacker, target) {
  const cfg = CULT_MECHANICS_CONFIG.olympus;
  const effectiveDef = getEffectiveDef(target);
  const raw = Math.min(DAMAGE_CONFIG.DEF_REDUCTION_CAP, effectiveDef / DAMAGE_CONFIG.DEF_DIVISOR);
  const reduction = raw * (1 - cfg.LIGHTNING_DEF_PIERCE);
  return Math.max(1, Math.floor(attacker.atk * cfg.LIGHTNING_ATK_RATIO * (1 - reduction)));
}

/** Doom 스택 누적 */
export function addDoom(target, stacks) {
  const state = ensureCultState(target);
  if (!state) return 0;
  state.doom += Math.max(0, Math.floor(stacks));
  return state.doom;
}

/**
 * Death Sentence 판정 — Doom 임계 도달 시 현재 HP 비례 추가 피해
 * @returns {number} 추가 피해 (미발동 시 0)
 */
export function calcDeathSentence(target, threshold) {
  const cfg = CULT_MECHANICS_CONFIG.yomi;
  const state = ensureCultState(target);
  if (!state || state.doom < threshold) return 0;
  state.doom = 0;
  return Math.max(1, Math.floor(target.currentHp * cfg.DEATH_SENTENCE_HP_RATIO));
}

/**
 * 룬 각인 — 3개 도달 시 Runeburst 활성 + Rune Shield 부여
 * @returns {Object} { rune, runes, runeburst }
 */
export function inscribeRune(unit, runeType) {
  const cfg = CULT_MECHANICS_CONFIG.asgard;
  const state = ensureCultState(unit);
  if (!state) return { rune: null, runes: [], runeburst: false };

  state.runes.push(runeType);
  let burst = false;
  if (state.runes.length >= cfg.RUNEBURST_REQUIRED) {
    state.runes = [];
    state.runeburst = true;
    state.runeShield += cfg.RUNEBURST_SHIELD_HITS;
    burst = true;
  }
  return { rune: runeType, runes: [...state.runes], runeburst: burst };
}

/** Runeburst 소비 (피해 적용 후 1회성) */
export function consumeRuneburst(unit) {
  const state = unit?.cultState;
  if (!state?.runeburst) return false;
  state.runeburst = false;
  return true;
}

// ============================================
// 내부 헬퍼
// ============================================

const descriptor = (kind, target, extra = {}) => ({
  kind,
  targetId: target?.instanceId || target?.id || null,
  target,
  ...extra,
});

const roll = (ctx, chance) => (ctx.rng ? ctx.rng() : Math.random()) < chance;

const pick = (ctx, list) => list[Math.floor((ctx.rng ? ctx.rng() : Math.random()) * list.length) % list.length];

const lowestHp = (units) => units
  .filter(u => u?.isAlive)
  .reduce((min, cur) => (!min || cur.getHpPercent?.() < min.getHpPercent?.() ? cur : min), null);

const highestHp = (units) => units
  .filter(u => u?.isAlive)
  .reduce((max, cur) => (!max || cur.getHpPercent?.() > max.getHpPercent?.() ? cur : max), null);

/** Thunderstruck 부여 서술자 */
function applyThunderstruck(ctx, target) {
  const cfg = CULT_MECHANICS_CONFIG.olympus;
  applyStatus(target, {
    type: STATUS_TYPES.THUNDERSTRUCK,
    duration: cfg.THUNDERSTRUCK_DURATION,
    sourceId: ctx.attacker?.id || null,
  });
  return descriptor('status', target, { status: STATUS_TYPES.THUNDERSTRUCK });
}

/** Lightning Strike 발동 서술자 (스턴 확률 포함) */
function fireLightningStrike(ctx, target, { forceStun = false } = {}) {
  const cfg = CULT_MECHANICS_CONFIG.olympus;
  const out = [descriptor('extraDamage', target, {
    amount: calcLightningDamage(ctx.attacker, target),
    label: 'lightning_strike',
  })];
  if (forceStun || roll(ctx, cfg.LIGHTNING_STUN_CHANCE)) out.push(applyThunderstruck(ctx, target));
  return out;
}

/** Doom 누적 + Death Sentence 판정 */
function resolveDoom(ctx, target, stacks, threshold) {
  const out = [descriptor('doom', target, { stacks: addDoom(target, stacks) })];
  const execution = calcDeathSentence(target, threshold);
  if (execution > 0) {
    out.push(descriptor('extraDamage', target, { amount: execution, label: 'death_sentence' }));
  }
  return out;
}

/** 저주 부여 */
function applyCurse(ctx, target) {
  const cfg = CULT_MECHANICS_CONFIG.yomi;
  applyStatus(target, {
    type: STATUS_TYPES.CURSE,
    duration: cfg.CURSE_DURATION,
    value: Math.floor((ctx.attacker?.atk || 0) * cfg.CURSE_DOT_ATK_RATIO),
    sourceId: ctx.attacker?.id || null,
  });
  return descriptor('status', target, { status: STATUS_TYPES.CURSE });
}

/** 방어막 부여 서술자 */
function wardTargets(ctx, targets, ratio) {
  const amount = Math.floor((ctx.attacker?.atk || 0) * ratio);
  return targets.filter(u => u?.isAlive).map(u => {
    grantBarrier(u, amount);
    return descriptor('barrier', u, { amount });
  });
}

/** 룬 각인 서술자 */
function inscribeTargets(ctx, targets, runeType) {
  const types = CULT_MECHANICS_CONFIG.asgard.RUNE_TYPES;
  return targets.filter(u => u?.isAlive).map(u => {
    const res = inscribeRune(u, runeType || pick(ctx, types));
    return descriptor('rune', u, { rune: res.rune, runeburst: res.runeburst });
  });
}

/** 아군 목록 (없으면 빈 배열) */
const alliesOf = (ctx) => ctx.allies || [];

// ============================================
// cultEffect 토큰 핸들러 레지스트리
// ============================================

/**
 * 토큰 type → 훅 핸들러.
 * 여기에 없는 type은 파싱만 되고 no-op (getUnimplementedEffects로 노출).
 */
export const CULT_EFFECT_HANDLERS = Object.freeze({
  // ---------- olympus (공세) ----------
  thunderstruck: {
    cult: 'olympus',
    onHit: (ctx) => (roll(ctx, (ctx.effect.value ?? 0) / 100) ? [applyThunderstruck(ctx, ctx.target)] : []),
  },
  lightning_judgment: {
    cult: 'olympus',
    onHit: (ctx) => fireLightningStrike(ctx, ctx.target),
  },
  divine_judgment: {
    cult: 'olympus',
    onHit: (ctx) => fireLightningStrike(ctx, ctx.target, { forceStun: true }),
  },

  // ---------- yomi (제어) ----------
  doom_stack: {
    cult: 'yomi',
    handlesDoom: true,
    onHit: (ctx) => resolveDoom(ctx, ctx.target, ctx.effect.value ?? 1,
      CULT_MECHANICS_CONFIG.yomi.DOOM_SENTENCE_THRESHOLD),
  },
  mass_doom: {
    cult: 'yomi',
    handlesDoom: true,
    onHit: (ctx) => resolveDoom(ctx, ctx.target, ctx.effect.value ?? 1,
      CULT_MECHANICS_CONFIG.yomi.DOOM_SENTENCE_THRESHOLD),
  },
  execution_doom: {
    cult: 'yomi',
    handlesDoom: true,
    onHit: (ctx) => resolveDoom(ctx, ctx.target, CULT_MECHANICS_CONFIG.yomi.DOOM_PER_HIT,
      ctx.effect.value ?? CULT_MECHANICS_CONFIG.yomi.DOOM_EXECUTE_THRESHOLD),
  },
  curse_dot: {
    cult: 'yomi',
    handlesDoom: true,
    onHit: (ctx) => [
      applyCurse(ctx, ctx.target),
      ...resolveDoom(ctx, ctx.target, CULT_MECHANICS_CONFIG.yomi.DOOM_PER_HIT,
        CULT_MECHANICS_CONFIG.yomi.DOOM_SENTENCE_THRESHOLD),
    ],
  },
  curse_execute: {
    cult: 'yomi',
    handlesDoom: true,
    onHit: (ctx) => [
      applyCurse(ctx, ctx.target),
      ...resolveDoom(ctx, ctx.target, CULT_MECHANICS_CONFIG.yomi.DOOM_PER_HIT,
        CULT_MECHANICS_CONFIG.yomi.DOOM_EXECUTE_THRESHOLD),
    ],
  },
  mass_curse: {
    cult: 'yomi',
    handlesDoom: true,
    onHit: (ctx) => [
      applyCurse(ctx, ctx.target),
      ...resolveDoom(ctx, ctx.target, CULT_MECHANICS_CONFIG.yomi.DOOM_PER_HIT,
        CULT_MECHANICS_CONFIG.yomi.DOOM_SENTENCE_THRESHOLD),
    ],
  },

  // ---------- avalon (지속) ----------
  shield_all: {
    cult: 'avalon',
    onSkillUse: (ctx) => wardTargets(ctx, alliesOf(ctx), CULT_MECHANICS_CONFIG.avalon.WARD_ATK_RATIO),
  },
  fortress_shield: {
    cult: 'avalon',
    onSkillUse: (ctx) => wardTargets(ctx, alliesOf(ctx), CULT_MECHANICS_CONFIG.avalon.FORTRESS_ATK_RATIO),
  },
  cover_shield: {
    cult: 'avalon',
    onSkillUse: (ctx) => {
      const weakest = lowestHp(alliesOf(ctx));
      return weakest ? wardTargets(ctx, [weakest], CULT_MECHANICS_CONFIG.avalon.WARD_ATK_RATIO) : [];
    },
  },
  full_heal_reflect: {
    cult: 'avalon',
    onSkillUse: (ctx) => {
      const targets = alliesOf(ctx).filter(u => u?.isAlive);
      const heals = targets.map(u => descriptor('heal', u, { amount: u.heal(u.maxHp).actualHeal }));
      return [...heals, ...wardTargets(ctx, targets, CULT_MECHANICS_CONFIG.avalon.FORTRESS_ATK_RATIO)];
    },
  },

  // ---------- asgard (균형) ----------
  rune_stack: {
    cult: 'asgard',
    onSkillUse: (ctx) => {
      const ally = pick(ctx, alliesOf(ctx).filter(u => u?.isAlive));
      return ally ? inscribeTargets(ctx, [ally]) : [];
    },
  },
  rune_burst: {
    cult: 'asgard',
    onSkillUse: (ctx) => inscribeTargets(ctx, [ctx.attacker]),
  },
  rune_mastery: {
    cult: 'asgard',
    onSkillUse: (ctx) => CULT_MECHANICS_CONFIG.asgard.RUNE_TYPES
      .flatMap(runeType => inscribeTargets(ctx, [ctx.attacker], runeType)),
  },
  rune_atk_stack: {
    cult: 'asgard',
    onSkillUse: (ctx) => inscribeTargets(ctx, alliesOf(ctx), 'atk'),
  },
  rune_party_buff: {
    cult: 'asgard',
    onSkillUse: (ctx) => {
      const source = ctx.attacker?.cultState?.runes || [];
      if (source.length === 0) return [];
      const others = alliesOf(ctx).filter(u => u?.isAlive && u !== ctx.attacker);
      return source.flatMap(runeType => inscribeTargets(ctx, others, runeType));
    },
  },
});

// ============================================
// 교단 패시브 (토큰과 무관하게 소속만으로 발동)
// ============================================

const CULT_PASSIVES = Object.freeze({
  olympus: {
    /** Glory Aura — 턴 시작 시 HP 최고 아군에게 ATK +10% 1턴 */
    onTurnStart: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.olympus;
      const ally = highestHp(alliesOf(ctx));
      if (!ally) return [];
      applyStatus(ally, {
        type: STATUS_TYPES.GLORY_AURA,
        duration: cfg.GLORY_AURA_DURATION + 1, // 부여 턴의 tick 감소분 보정
        value: cfg.GLORY_AURA_ATK,
        sourceId: ctx.unit?.id || null,
      });
      return [descriptor('status', ally, { status: STATUS_TYPES.GLORY_AURA })];
    },
    /** Divine Charge — 공격 시 충전, 만충 시 Lightning Strike */
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.olympus;
      const state = ensureCultState(ctx.attacker);
      if (ctx.skill?.id === 'awakening') {
        state.divinity = 0;
        return [];
      }
      state.divinity += getDivinityGain(ctx.skill);
      if (state.divinity < cfg.DIVINITY_MAX) return [];
      state.divinity = 0;
      return fireLightningStrike(ctx, ctx.target);
    },
  },
  yomi: {
    /** Death Gaze — 적중 시 Doom +1, 임계 도달 시 처형 */
    onHit: (ctx) => {
      if (ctx.doomHandled) return [];
      const cfg = CULT_MECHANICS_CONFIG.yomi;
      return resolveDoom(ctx, ctx.target, cfg.DOOM_PER_HIT, cfg.DOOM_SENTENCE_THRESHOLD);
    },
    /** Doom 전이 — 사망한 적의 Doom 절반을 남은 적에게 이관 */
    onDeath: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.yomi;
      const stacks = Math.floor((ctx.unit?.cultState?.doom || 0) * cfg.DOOM_TRANSFER_RATIO);
      if (stacks <= 0) return [];
      const heir = (ctx.allies || []).find(u => u?.isAlive && u !== ctx.unit);
      if (!heir) return [];
      ctx.unit.cultState.doom = 0;
      return [descriptor('doom', heir, { stacks: addDoom(heir, stacks), transferred: true })];
    },
  },
  avalon: {
    /** Holy Ward — 턴 시작 시 HP 최저 아군에게 ATK×30% 방어막 */
    onTurnStart: (ctx) => {
      const weakest = lowestHp(alliesOf(ctx));
      if (!weakest) return [];
      return wardTargets({ ...ctx, attacker: ctx.unit }, [weakest],
        CULT_MECHANICS_CONFIG.avalon.WARD_ATK_RATIO);
    },
  },
  asgard: {
    /** Bifrost Link — 아군 사망 시 그 ATK를 파티에 1턴 부여 */
    onDeath: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.asgard;
      const survivors = (ctx.allies || []).filter(u => u?.isAlive && u !== ctx.unit);
      if (survivors.length === 0) return [];
      return survivors.map(u => {
        applyStatus(u, {
          type: STATUS_TYPES.BIFROST,
          duration: cfg.BIFROST_DURATION + 1,
          value: ctx.unit?.atk || 0,
          sourceId: ctx.unit?.id || null,
        });
        return descriptor('status', u, { status: STATUS_TYPES.BIFROST });
      });
    },
  },
});

/** 유닛 소속 기관의 패시브 훅 실행 */
function runPassive(hook, cult, ctx) {
  const handler = CULT_PASSIVES[cult]?.[hook];
  return handler ? (handler(ctx) || []) : [];
}

/** 스킬 토큰 핸들러 실행 */
function runToken(hook, ctx, skill) {
  const effect = parseCultEffect(skill?.cultEffect);
  if (!effect?.implemented) return { results: [], effect };
  const handler = CULT_EFFECT_HANDLERS[effect.type][hook];
  if (!handler) return { results: [], effect, handlerDef: CULT_EFFECT_HANDLERS[effect.type] };
  return {
    results: handler({ ...ctx, effect }) || [],
    effect,
    handlerDef: CULT_EFFECT_HANDLERS[effect.type],
  };
}

// ============================================
// 파사드 — BattleSystem이 호출하는 훅 진입점
// ============================================

export class CultMechanicsSystem {
  /** 전투 시작 — 교단 상태 초기화 */
  static onBattleStart(units = []) {
    units.forEach(unit => {
      if (!unit) return;
      unit.cultState = createCultState();
    });
    return [];
  }

  /**
   * 턴 시작 — 상태이상 틱 + 교단 턴 시작 패시브
   * @param {Object} ctx { unit, allies, enemies, rng }
   * @returns {Object} { blocked, dotDamage, effects }
   */
  static onTurnStart(ctx) {
    const tick = tickStatuses(ctx.unit);
    const effects = runPassive('onTurnStart', ctx.unit?.cult, ctx);
    return { ...tick, effects };
  }

  /**
   * 스킬 사용(피해 확정 전) — 아군 대상 방어막/룬 계열
   * @param {Object} ctx { attacker, targets, skill, allies, enemies, rng }
   * @returns {Array<Object>} 효과 서술자
   */
  static onSkillUse(ctx) {
    return runToken('onSkillUse', ctx, ctx.skill).results;
  }

  /**
   * 피해 확정 전 — 방어막/룬 실드 흡수
   * @returns {Object} { damage, absorbed, reflect, shieldBroken }
   */
  static beforeDamage(ctx) {
    return absorbDamage(ctx.target, ctx.damage);
  }

  /**
   * 적중 후 — 토큰 효과 + 공격자 교단 패시브
   * @param {Object} ctx { attacker, target, skill, damage, allies, enemies, rng }
   * @returns {Array<Object>} 효과 서술자 (kind==='extraDamage'는 호출부가 적용)
   */
  static onHit(ctx) {
    const token = runToken('onHit', ctx, ctx.skill);
    const passive = runPassive('onHit', ctx.attacker?.cult, {
      ...ctx,
      doomHandled: !!token.handlerDef?.handlesDoom,
    });
    return [...token.results, ...passive];
  }

  /** 피격 후 — 현재 4기관은 사용처 없음 (확장 지점) */
  static onDamaged() {
    return [];
  }

  /**
   * 사망 후 — Doom 전이(yomi) / Bifrost Link(asgard)
   * @param {Object} ctx { unit, killer, allies, enemies }
   */
  static onDeath(ctx) {
    return runPassive('onDeath', ctx.unit?.cult, ctx);
  }

  // ---- 순수 계산 위임 (BattleSystem 데미지식에서 사용) ----
  static getOutgoingDamageMultiplier = getOutgoingDamageMultiplier;
  static getIncomingDamageMultiplier = getIncomingDamageMultiplier;
  static getEffectiveDef = getEffectiveDef;
  static getEffectiveSpd = getEffectiveSpd;
  static getFlatAtkBonus = getFlatAtkBonus;
  static getHealMultiplier = getHealMultiplier;
  static consumeRuneburst = consumeRuneburst;
  static createCultState = createCultState;
  static parseCultEffect = parseCultEffect;
  static getUnimplementedEffects = getUnimplementedEffects;
  static getAllCultEffectTokens = getAllCultEffectTokens;
}

export default CultMechanicsSystem;
