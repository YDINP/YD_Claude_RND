/**
 * CultMechanicsSystem - 교단(Cult) 시그니처 메커니즘 (MECH-02 / MECH-03)
 *
 * MECH-01 감사(docs/AUDIT_CULT_MECHANISMS.md)에서 `cultEffect` 토큰이 런타임에
 * 전혀 소비되지 않는다는 결론이 나왔다. 본 모듈은 그 토큰을 파싱하고,
 * 12기관 전부의 시그니처 메커니즘을 순수 함수 + 훅 레지스트리로 구현한다.
 *
 * - MECH-02: 4그룹 대표 기관 (공세=olympus / 제어=yomi / 지속=avalon / 균형=asgard)
 * - MECH-03: 나머지 8기관 (valhalla / takamagahara / helheim / tartarus /
 *            kunlun / nature / chaos / balance) + 교단 간 상성 테이블
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

/** 12기관 수치 (docs/CULT_SYSTEM_DESIGN.md §2 수치 설계 기준) */
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

  // ---------- MECH-03 ----------
  valhalla: Object.freeze({
    RAGE_MID_HP: 0.5,            // HP 50% 이하
    RAGE_MID_ATK: 0.25,
    RAGE_LOW_HP: 0.3,            // HP 30% 이하
    RAGE_LOW_ATK: 0.5,
    BERSERK_STACK_ATK: 0.05,     // 스택당 ATK +5%
    BERSERK_STACK_MAX: 5,
    FRENZY_MARK_DURATION: 2,
    FRENZY_MARK_BONUS: 0.2,      // 발할라 공격자에게만 +20%
    LAST_STAND_HP: 1,            // 전투당 1회 HP 1로 생존
    LAST_STAND_DURATION: 1,      // 생존 후 1턴 무적
    PRIDE_DAMAGE_RATIO: 0.4,     // 한 방 피해가 maxHP 40% 이상이면
    PRIDE_CONVERT_RATIO: 0.15,   // maxHP 15%로 환산
    PRIDE_COOLDOWN: 1,
  }),
  takamagahara: Object.freeze({
    KAMI_NO_MA_SPD_BONUS: 9999,  // 첫 턴 선제 보장용 유효 SPD 가산
    KAMI_NO_MA_DURATION: 1,
    HASTE_DEFAULT: 0.1,
    HASTE_DURATION: 2,
    EXTRA_ACTION_MAX: 1,         // 한 턴에 허용되는 추가 행동 상한
    DAZZLE_DURATION: 2,
    DAZZLE_DAMAGE_PENALTY: 0.3,  // 명중률 -30%를 기대 피해 -30%로 환산
    SUNLIT_CRIT_BONUS: 0.15,
  }),
  helheim: Object.freeze({
    COLD_PER_CC: 1,              // CC 부여 1회당 Cold Stack +1
    COLD_DECAY_PER_TURN: 1,
    PERMAFROST_THRESHOLD: 3,
    PERMAFROST_AMP: 0.25,        // 받는 피해 +25%
    FREEZE_DURATION: 1,
    STUN_DEFAULT_DURATION: 2,
    TERROR_DURATION: 2,
    TERROR_ATK_PENALTY: 0.2,
    NUMBING_AURA_SPD: 0.1,       // 적 파티 SPD -10%
    NUMBING_DURATION: 999,       // 전투 내내 유지
  }),
  tartarus: Object.freeze({
    TITAN_DEF_RATIO_A: 0.3,      // 적 DEF >= 자신 ATK×0.3
    TITAN_PIERCE_A: 0.5,
    TITAN_DEF_RATIO_B: 0.6,      // 적 DEF >= 자신 ATK×0.6 (Titan Wrath)
    TITAN_PIERCE_B: 0.8,
    TITAN_WRATH_DAMAGE: 0.3,
    PIERCE_DURATION: 1,
    SHRED_PER_STACK: 0.1,        // DEF -10%/스택
    SHRED_MAX_STACKS: 3,
    SHRED_DURATION: 2,
    SHIELD_BREAK_RATIO: 0.5,     // 파괴한 방어막의 50%를 피해로
    ABYSS_GAZE_SPLIT: 0.5,       // 방어막×0.5 + HP×0.5 동시 적용
    TITANFALL_DURATION: 2,
    TITANFALL_PENALTY: 0.2,
  }),
  kunlun: Object.freeze({
    POISON_DURATION: 2,
    POISON_ATK_RATIO: 0.12,
    WEAKEN_DURATION: 2,
    WEAKEN_ATK_PENALTY: 0.2,
    WITHERING_DURATION: 2,
    WITHERING_DEF_PER_STACK: 0.05,
    WITHERING_MAX_STACKS: 3,
    CHAOS_BLOOM_THRESHOLD: 3,    // 동시 디버프 3종 이상
    CHAOS_BLOOM_HP_RATIO: 0.05,  // 최대 HP 5% 고정 피해
    CHAOS_BLOOM_EXTEND: 1,       // 디버프 지속 1턴 연장
    IMMORTAL_HERB_ATK_RATIO: 0.2,
  }),
  nature: Object.freeze({
    GROWTH_PER_TURN: 1,
    GROWTH_MAX: 10,
    GROWTH_STAT_PER_STACK: 0.02, // 스택당 ATK/DEF +2% (최대 +20%)
    GROWTH_BUFF_STACKS: 2,
    GROWTH_ATK_STACKS: 3,
    LATE_GAME_ATK_RATIO: 0.05,   // 스택당 ATK×5% 추가 피해
    OVERGROWTH_DURATION: 3,
    OVERGROWTH_HP_RATIO: 0.03,
    OVERGROWTH_SPD_PENALTY: 0.5,
    ROOT_OF_LIFE_STACKS: 2,      // 전투 시작 이월 스택
  }),
  chaos: Object.freeze({
    RANDOM_MULTIPLIER_MIN: 0.5,
    RANDOM_MULTIPLIER_MAX: 2,
    BURST_MIN_HITS: 1,
    BURST_MAX_HITS: 3,
    BURST_ATK_RATIO: 0.4,
    STORM_ATK_RATIO: 0.5,
    COLLAPSE_ATK_RATIO: 0.8,
    EXPLOSION_ATK_RATIO: 0.6,
    EXPLOSION_SELF_CHANCE: 0.1,  // Misfire — 자신도 피해
    EXPLOSION_SELF_RATIO: 0.3,
    ELEMENT_MULTIPLIERS: Object.freeze([0.8, 1, 1.25]),
    ELEMENT_ATK_RATIO: 0.7,
    BRAND_DURATION: 2,
    BRAND_PENALTY: 0.1,          // ATK/SPD -10%
    MADNESS_DURATION: 2,
    MADNESS_ATK_BONUS: 0.5,
    LIBERATION_ROLLS: 2,         // Wild Card 즉시 2회
    WILD_ATK_BUFF: 0.3,
    WILD_ATK_DEBUFF: 0.2,
    WILD_DEF_DEBUFF: 0.2,
    WILD_AOE_RATIO: 1,
    WILD_SINGLE_RATIO: 3,
    WILD_SLOW: 0.3,
    WILD_HEAL_RATIO: 0.3,
    WILD_BARRIER_RATIO: 0.5,
    WILD_BUFF_DURATION: 1,
    WILD_DEBUFF_DURATION: 2,
  }),
  balance: Object.freeze({
    EQUILIBRIUM_HIGH_GAP: 0.3,   // HP 편차 30% 이상 → ATK/DEF +15%
    EQUILIBRIUM_STAT_BONUS: 0.15,
    EQUILIBRIUM_LOW_GAP: 0.1,    // HP 편차 10% 이하 → 크리 +20%
    EQUILIBRIUM_CRIT_BONUS: 0.2,
    NEUTRALITY_SCALE: 0.5,       // 상성 효과 절반
    NEUTRAL_FIELD_DURATION: 1,
    IMBALANCE_DURATION: 3,
    NEUTRAL_DAMAGE_ATK_RATIO: 0.5,
  }),

  /** 교단 간 상성 (docs/CULT_SYSTEM_DESIGN.md §3-4) — 밸런스 검산 전까지 기본 OFF */
  matchup: Object.freeze({
    enabled: false,
    ADVANTAGE: 1.25,
    DISADVANTAGE: 0.8,
    NEUTRAL: 1,
  }),
});

/** 시그니처 메커니즘이 런타임 구현된 기관 (MECH-02 + MECH-03 = 12/12) */
export const IMPLEMENTED_CULTS = Object.freeze([
  'olympus', 'yomi', 'avalon', 'asgard',
  'valhalla', 'takamagahara', 'helheim', 'tartarus',
  'kunlun', 'nature', 'chaos', 'balance',
]);

/** 상태이상 종류 */
export const STATUS_TYPES = Object.freeze({
  // olympus / yomi / avalon / asgard (MECH-02)
  THUNDERSTRUCK: 'thunderstruck',
  CURSE: 'curse',
  GLORY_AURA: 'glory_aura',
  BIFROST: 'bifrost',
  // valhalla
  FRENZY_MARK: 'frenzy_mark',
  LAST_STAND: 'last_stand',
  // takamagahara
  KAMI_NO_MA: 'kami_no_ma',
  HASTE: 'haste',
  DAZZLE: 'dazzle',
  // helheim
  FREEZE: 'freeze',
  STUN: 'stun',
  TERROR: 'terror',
  NUMBING: 'numbing',
  // tartarus
  ARMOR_PIERCE: 'armor_pierce',
  ARMOR_SHRED: 'armor_shred',
  TITANFALL: 'titanfall',
  // kunlun
  POISON: 'poison',
  WEAKEN: 'weaken',
  WITHERING: 'withering',
  // nature
  OVERGROWTH: 'overgrowth',
  // chaos
  CHAOS_BRAND: 'chaos_brand',
  MADNESS: 'madness',
  SLOW: 'slow',
  INVULNERABLE: 'invulnerable',
  // balance
  NEUTRAL_FIELD: 'neutral_field',
  IMBALANCE: 'imbalance',
});

/** 행동을 막는 상태 (턴 시작 판정에서 스킵) */
export const BLOCKING_STATUSES = Object.freeze([
  STATUS_TYPES.THUNDERSTRUCK,
  STATUS_TYPES.FREEZE,
  STATUS_TYPES.STUN,
]);

/** Chaos Bloom(kunlun) 카운트 대상 디버프 */
export const DEBUFF_STATUSES = Object.freeze([
  STATUS_TYPES.POISON,
  STATUS_TYPES.FREEZE,
  STATUS_TYPES.STUN,
  STATUS_TYPES.WEAKEN,
  STATUS_TYPES.CURSE,
  STATUS_TYPES.WITHERING,
  STATUS_TYPES.TERROR,
  STATUS_TYPES.ARMOR_SHRED,
  STATUS_TYPES.TITANFALL,
  STATUS_TYPES.OVERGROWTH,
  STATUS_TYPES.CHAOS_BRAND,
  STATUS_TYPES.DAZZLE,
  STATUS_TYPES.SLOW,
  STATUS_TYPES.IMBALANCE,
]);

// ============================================
// 교단 간 상성 (CULT_SYSTEM_DESIGN §3-3)
// ============================================

/** 공격 교단 → { strong: 유리 상대, weak: 불리 상대 } */
export const CULT_MATCHUP = Object.freeze({
  olympus:      Object.freeze({ strong: ['chaos', 'helheim'],       weak: ['asgard', 'valhalla'] }),
  valhalla:     Object.freeze({ strong: ['olympus', 'balance'],     weak: ['chaos', 'takamagahara'] }),
  chaos:        Object.freeze({ strong: ['valhalla'],               weak: ['olympus', 'yomi', 'takamagahara'] }),
  asgard:       Object.freeze({ strong: ['olympus', 'balance'],     weak: ['valhalla'] }),
  takamagahara: Object.freeze({ strong: ['balance', 'chaos'],       weak: ['olympus'] }),
  yomi:         Object.freeze({ strong: ['tartarus', 'chaos'],      weak: ['helheim'] }),
  helheim:      Object.freeze({ strong: ['yomi'],                   weak: ['olympus', 'kunlun'] }),
  tartarus:     Object.freeze({ strong: ['avalon', 'helheim'],      weak: ['yomi'] }),
  kunlun:       Object.freeze({ strong: ['helheim', 'avalon'],      weak: [] }),
  avalon:       Object.freeze({ strong: ['kunlun', 'tartarus'],     weak: ['nature'] }),
  nature:       Object.freeze({ strong: ['avalon', 'tartarus'],     weak: ['kunlun'] }),
  balance:      Object.freeze({ strong: ['asgard', 'takamagahara'], weak: ['valhalla', 'olympus'] }),
});

/** 상성 적용 여부 (기본값은 CULT_MECHANICS_CONFIG.matchup.enabled) */
let matchupEnabled = CULT_MECHANICS_CONFIG.matchup.enabled;

/**
 * 교단 상성 on/off — 밸런스 검산 후 켠다.
 * @param {boolean} enabled
 * @returns {boolean} 적용된 값
 */
export function setCultMatchupEnabled(enabled) {
  matchupEnabled = !!enabled;
  return matchupEnabled;
}

/** 교단 상성 적용 여부 */
export function isCultMatchupEnabled() {
  return matchupEnabled;
}

/**
 * 교단 상성 판정 (상성 OFF여도 판정 자체는 조회 가능)
 * @param {string|null} attackerCult
 * @param {string|null} defenderCult
 * @returns {'ADVANTAGE'|'DISADVANTAGE'|'NEUTRAL'}
 */
export function getCultAdvantage(attackerCult, defenderCult) {
  const row = CULT_MATCHUP[attackerCult];
  if (!row || !defenderCult) return 'NEUTRAL';
  if (row.strong.includes(defenderCult)) return 'ADVANTAGE';
  if (row.weak.includes(defenderCult)) return 'DISADVANTAGE';
  return 'NEUTRAL';
}

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
    divinity: 0,       // olympus: Divine Charge 게이지
    doom: 0,           // yomi: Doom 스택 (피격자에 누적)
    barrier: 0,        // avalon: Holy Ward 방어막 잔량
    runes: [],         // asgard: 적층된 룬 ('atk' | 'def' | 'spd')
    runeburst: false,  // asgard: 다음 피해 +40%
    runeShield: 0,     // asgard: 완전 흡수 가능 횟수
    rage: 0,           // valhalla: Berserker 스택
    lastStandUsed: false, // valhalla: Last Stand 소진 여부 (전투당 1회)
    prideCooldown: 0,  // valhalla: Warrior's Pride 재사용 대기
    cold: 0,           // helheim: Cold Stack (3 이상 → Permafrost)
    growth: 0,         // nature: Growth Ring 스택
    extraActions: 0,   // takamagahara: 남은 추가 행동 횟수
    extraActionTurn: -1, // takamagahara: 추가 행동을 쓴 라운드 (라운드당 1회 제한)
    equilibrium: null, // balance: { atk, def, crit } (턴 시작에 산출)
    statuses: [],      // 상태이상 [{ type, duration, value, stacks, sourceId }]
  };
}

/** 유닛에 cultState가 없으면 생성해 반환 */
export function ensureCultState(unit) {
  if (!unit) return null;
  if (!unit.cultState) unit.cultState = createCultState();
  return unit.cultState;
}

/**
 * 상태이상 부여 (같은 종류는 지속시간 갱신, stacks가 있으면 누적)
 * @param {Object} unit 대상
 * @param {Object} status { type, duration, value, stacks, maxStacks, sourceId }
 * @returns {Object|null} 부여된 상태 엔트리
 */
export function applyStatus(unit, status) {
  const state = ensureCultState(unit);
  if (!state) return null;

  const existing = state.statuses.find(s => s.type === status.type);
  if (existing) {
    existing.duration = Math.max(existing.duration, status.duration);
    if (status.stacks) {
      const max = status.maxStacks ?? existing.maxStacks ?? Number.MAX_SAFE_INTEGER;
      existing.stacks = Math.min(max, (existing.stacks || 0) + status.stacks);
    }
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

/** 상태이상 제거 */
export function removeStatus(unit, type) {
  const state = unit?.cultState;
  if (!state) return false;
  const before = state.statuses.length;
  state.statuses = state.statuses.filter(s => s.type !== type);
  return state.statuses.length !== before;
}

/** 대상이 보유한 디버프 종류 수 (Chaos Bloom 판정용) */
export function countDebuffs(unit) {
  const statuses = unit?.cultState?.statuses || [];
  return statuses.filter(s => DEBUFF_STATUSES.includes(s.type)).length;
}

/**
 * 디버프 전량 해제 (kunlun cleanse_all)
 * @returns {number} 제거된 디버프 수
 */
export function cleanseDebuffs(unit) {
  const state = unit?.cultState;
  if (!state) return 0;
  const before = state.statuses.length;
  state.statuses = state.statuses.filter(s => !DEBUFF_STATUSES.includes(s.type));
  state.cold = 0;
  return before - state.statuses.length;
}

/** 스택 수 (없으면 0) */
function stackCount(unit, type) {
  const status = getStatus(unit, type);
  return status ? (status.stacks || 1) : 0;
}

/** DoT를 발생시키는 상태 (value = 턴당 고정 피해) */
const DOT_STATUSES = Object.freeze([
  STATUS_TYPES.CURSE,
  STATUS_TYPES.POISON,
  STATUS_TYPES.OVERGROWTH,
]);

/**
 * 턴 시작 처리 — 행동 차단 판정 → DoT 피해 → Chaos Bloom → 지속시간 감소
 * @param {Object} unit 행동 유닛
 * @returns {Object} { blocked, blockedBy, dotDamage, expired, chaosBloom }
 */
export function tickStatuses(unit) {
  const state = ensureCultState(unit);
  const result = { blocked: false, blockedBy: null, dotDamage: 0, expired: [], chaosBloom: false };
  if (!state) return result;

  // 1) 행동 차단 (thunderstruck > freeze > stun > permafrost)
  for (const type of BLOCKING_STATUSES) {
    if (state.statuses.some(s => s.type === type)) {
      result.blocked = true;
      result.blockedBy = type;
      break;
    }
  }
  if (!result.blocked && state.cold >= CULT_MECHANICS_CONFIG.helheim.PERMAFROST_THRESHOLD) {
    result.blocked = true;
    result.blockedBy = 'permafrost';
  }

  // 2) 지속 피해
  state.statuses.forEach(s => {
    if (DOT_STATUSES.includes(s.type)) result.dotDamage += Math.max(1, Math.floor(s.value || 0));
  });

  // 3) Chaos Bloom (kunlun) — 디버프 3종 이상이면 고정 피해 + 디버프 연장
  const bloomCfg = CULT_MECHANICS_CONFIG.kunlun;
  if (countDebuffs(unit) >= bloomCfg.CHAOS_BLOOM_THRESHOLD) {
    result.chaosBloom = true;
    result.dotDamage += Math.max(1, Math.floor((unit.maxHp || 0) * bloomCfg.CHAOS_BLOOM_HP_RATIO));
    state.statuses.forEach(s => {
      if (DEBUFF_STATUSES.includes(s.type)) s.duration += bloomCfg.CHAOS_BLOOM_EXTEND;
    });
  }

  // 4) 지속시간 감소 / 만료
  state.statuses.forEach(s => { s.duration -= 1; });
  result.expired = state.statuses.filter(s => s.duration <= 0).map(s => s.type);
  state.statuses = state.statuses.filter(s => s.duration > 0);

  // 5) 스택 감쇠 (Cold Stack / Warrior's Pride 쿨다운)
  state.cold = Math.max(0, state.cold - CULT_MECHANICS_CONFIG.helheim.COLD_DECAY_PER_TURN);
  state.prideCooldown = Math.max(0, state.prideCooldown - 1);

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

/** Growth Ring 스택 배율 (nature) */
export function getGrowthMultiplier(unit) {
  const cfg = CULT_MECHANICS_CONFIG.nature;
  const stacks = unit?.cultState?.growth || 0;
  if (stacks <= 0) return 1;
  return 1 + Math.min(cfg.GROWTH_MAX, stacks) * cfg.GROWTH_STAT_PER_STACK;
}

/** Berserker Rage 배율 (valhalla) — HP 비례 + 누적 스택 */
export function getRageMultiplier(unit) {
  if (unit?.cult !== 'valhalla') return 1;
  const cfg = CULT_MECHANICS_CONFIG.valhalla;
  const state = unit.cultState;
  const ratio = unit.maxHp > 0 ? unit.currentHp / unit.maxHp : 1;

  let bonus = 0;
  if (ratio <= cfg.RAGE_LOW_HP) bonus = cfg.RAGE_LOW_ATK;
  else if (ratio <= cfg.RAGE_MID_HP) bonus = cfg.RAGE_MID_ATK;

  const stacks = Math.min(cfg.BERSERK_STACK_MAX, state?.rage || 0);
  return (1 + bonus) * (1 + stacks * cfg.BERSERK_STACK_ATK);
}

/** Permafrost 상태 여부 (helheim) */
export function isPermafrost(unit) {
  return (unit?.cultState?.cold || 0) >= CULT_MECHANICS_CONFIG.helheim.PERMAFROST_THRESHOLD;
}

/** 룬/성장/삭제(방어 감소) 보정이 반영된 유효 DEF */
export function getEffectiveDef(unit) {
  if (!unit) return 0;
  const tartarusCfg = CULT_MECHANICS_CONFIG.tartarus;
  const kunlunCfg = CULT_MECHANICS_CONFIG.kunlun;

  const shred = Math.min(tartarusCfg.SHRED_MAX_STACKS, stackCount(unit, STATUS_TYPES.ARMOR_SHRED))
    * tartarusCfg.SHRED_PER_STACK;
  const wither = Math.min(kunlunCfg.WITHERING_MAX_STACKS, stackCount(unit, STATUS_TYPES.WITHERING))
    * kunlunCfg.WITHERING_DEF_PER_STACK;
  const equilibrium = 1 + (unit.cultState?.equilibrium?.def || 0);

  const value = unit.def * runeMultiplier(unit, 'def') * getGrowthMultiplier(unit)
    * (1 - shred) * (1 - wither) * equilibrium;
  return Math.max(0, value);
}

/** 룬/가속/둔화 보정이 반영된 유효 SPD */
export function getEffectiveSpd(unit) {
  if (!unit) return 0;
  if (isPermafrost(unit)) return 0;

  const takamaCfg = CULT_MECHANICS_CONFIG.takamagahara;
  const helheimCfg = CULT_MECHANICS_CONFIG.helheim;
  const natureCfg = CULT_MECHANICS_CONFIG.nature;
  const chaosCfg = CULT_MECHANICS_CONFIG.chaos;

  const haste = getStatus(unit, STATUS_TYPES.HASTE);
  const slow = getStatus(unit, STATUS_TYPES.SLOW);

  let value = unit.spd * runeMultiplier(unit, 'spd');
  if (haste) value *= 1 + (haste.value ?? takamaCfg.HASTE_DEFAULT);
  if (slow) value *= 1 - (slow.value ?? chaosCfg.WILD_SLOW);
  if (hasStatus(unit, STATUS_TYPES.OVERGROWTH)) value *= 1 - natureCfg.OVERGROWTH_SPD_PENALTY;
  if (hasStatus(unit, STATUS_TYPES.NUMBING)) value *= 1 - helheimCfg.NUMBING_AURA_SPD;
  if (hasStatus(unit, STATUS_TYPES.CHAOS_BRAND)) value *= 1 - chaosCfg.BRAND_PENALTY;
  if (hasStatus(unit, STATUS_TYPES.KAMI_NO_MA)) value += takamaCfg.KAMI_NO_MA_SPD_BONUS;

  return Math.max(0, value);
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
 * 공격 측 피해 배율
 * (룬 ATK × Runeburst × Glory Aura × Underworld Link × Berserker Rage × Growth Ring
 *  × Madness ÷ Dazzle/Terror/Weaken/Titanfall/Chaos Brand)
 * @param {Object} attacker 공격자
 * @param {Object} [context] { allies }
 * @returns {number} 배율 (교단 상태 없으면 1)
 */
export function getOutgoingDamageMultiplier(attacker, context = {}) {
  if (!attacker) return 1;
  // Imbalance(balance) — 대상의 교단 효과를 완전 무효화
  if (hasStatus(attacker, STATUS_TYPES.IMBALANCE)) return 1;

  const chaosCfg = CULT_MECHANICS_CONFIG.chaos;
  const takamaCfg = CULT_MECHANICS_CONFIG.takamagahara;
  const helheimCfg = CULT_MECHANICS_CONFIG.helheim;
  const kunlunCfg = CULT_MECHANICS_CONFIG.kunlun;
  const tartarusCfg = CULT_MECHANICS_CONFIG.tartarus;

  let multiplier = runeMultiplier(attacker, 'atk');

  if (attacker.cultState?.runeburst) {
    multiplier *= 1 + CULT_MECHANICS_CONFIG.asgard.RUNEBURST_DAMAGE_BONUS;
  }
  const glory = getStatus(attacker, STATUS_TYPES.GLORY_AURA);
  if (glory) multiplier *= 1 + (glory.value ?? CULT_MECHANICS_CONFIG.olympus.GLORY_AURA_ATK);

  const madness = getStatus(attacker, STATUS_TYPES.MADNESS);
  if (madness) multiplier *= 1 + (madness.value ?? chaosCfg.MADNESS_ATK_BONUS);

  multiplier *= getRageMultiplier(attacker) * getGrowthMultiplier(attacker);
  multiplier *= 1 + (attacker.cultState?.equilibrium?.atk || 0);

  if (hasStatus(attacker, STATUS_TYPES.DAZZLE)) multiplier *= 1 - takamaCfg.DAZZLE_DAMAGE_PENALTY;
  if (hasStatus(attacker, STATUS_TYPES.TERROR)) multiplier *= 1 - helheimCfg.TERROR_ATK_PENALTY;
  if (hasStatus(attacker, STATUS_TYPES.WEAKEN)) multiplier *= 1 - kunlunCfg.WEAKEN_ATK_PENALTY;
  if (hasStatus(attacker, STATUS_TYPES.TITANFALL)) multiplier *= 1 - tartarusCfg.TITANFALL_PENALTY;
  if (hasStatus(attacker, STATUS_TYPES.CHAOS_BRAND)) multiplier *= 1 - chaosCfg.BRAND_PENALTY;

  return multiplier * getUnderworldLinkMultiplier(attacker, context.allies || []);
}

/**
 * 피격 측 피해 배율 (Thunderstruck / Permafrost 증폭 + Frenzy Mark / Titan Wrath)
 * @param {Object} target 피격자
 * @param {Object} [attacker] 공격자 (공격자 의존 효과에만 사용)
 * @returns {number} 배율
 */
export function getIncomingDamageMultiplier(target, attacker = null) {
  if (!target) return 1;
  let multiplier = 1;

  if (hasStatus(target, STATUS_TYPES.THUNDERSTRUCK)) {
    multiplier *= 1 + CULT_MECHANICS_CONFIG.olympus.THUNDERSTRUCK_AMP;
  }
  if (isPermafrost(target)) {
    multiplier *= 1 + CULT_MECHANICS_CONFIG.helheim.PERMAFROST_AMP;
  }
  if (attacker?.cult === 'valhalla' && hasStatus(target, STATUS_TYPES.FRENZY_MARK)) {
    multiplier *= 1 + CULT_MECHANICS_CONFIG.valhalla.FRENZY_MARK_BONUS;
  }
  if (attacker?.cult === 'tartarus' && isTitanWrath(attacker, target)) {
    multiplier *= 1 + CULT_MECHANICS_CONFIG.tartarus.TITAN_WRATH_DAMAGE;
  }
  return multiplier;
}

/** Titan Wrath 조건 — 적 DEF가 자신 ATK의 60% 이상 */
function isTitanWrath(attacker, target) {
  const cfg = CULT_MECHANICS_CONFIG.tartarus;
  const atk = attacker?.atk || 0;
  if (atk <= 0) return false;
  return getEffectiveDef(target) >= atk * cfg.TITAN_DEF_RATIO_B;
}

/**
 * 방어 관통률 (Titan Force 패시브 + armor_pierce 상태)
 * @param {Object} attacker 공격자
 * @param {Object} target 대상
 * @returns {number} 0~1
 */
export function getDefPierceRatio(attacker, target) {
  const cfg = CULT_MECHANICS_CONFIG.tartarus;
  let titan = 0;

  if (attacker?.cult === 'tartarus' && target) {
    const atk = attacker.atk || 0;
    const def = getEffectiveDef(target);
    if (atk > 0) {
      if (def >= atk * cfg.TITAN_DEF_RATIO_B) titan = cfg.TITAN_PIERCE_B;
      else if (def >= atk * cfg.TITAN_DEF_RATIO_A) titan = cfg.TITAN_PIERCE_A;
    }
  }

  const status = getStatus(attacker, STATUS_TYPES.ARMOR_PIERCE);
  const granted = status ? Math.min(1, Math.max(0, status.value || 0)) : 0;

  return Math.min(1, 1 - (1 - titan) * (1 - granted));
}

/**
 * 크리티컬 확률 가산 (Sunlit Grace / Equilibrium)
 * @param {Object} attacker 공격자
 * @param {Object} [context] { enemies }
 * @returns {number} 가산 확률
 */
export function getCritBonus(attacker, context = {}) {
  if (!attacker) return 0;
  let bonus = attacker.cultState?.equilibrium?.crit || 0;

  if (attacker.cult === 'takamagahara') {
    const enemies = (context.enemies || []).filter(u => u?.isAlive);
    if (enemies.length > 0) {
      const avg = enemies.reduce((sum, u) => sum + getEffectiveSpd(u), 0) / enemies.length;
      if (getEffectiveSpd(attacker) > avg) {
        bonus += CULT_MECHANICS_CONFIG.takamagahara.SUNLIT_CRIT_BONUS;
      }
    }
  }
  return bonus;
}

/**
 * 상성(분위기/교단) 효과 배율 스케일 — Neutrality(balance) / Neutral Field / Imbalance
 * @returns {number} 0 = 상성 무효, 0.5 = 절반, 1 = 그대로
 */
export function getMatchupScale(attacker, defender) {
  if (hasStatus(attacker, STATUS_TYPES.NEUTRAL_FIELD) || hasStatus(defender, STATUS_TYPES.NEUTRAL_FIELD)) return 0;
  if (hasStatus(attacker, STATUS_TYPES.IMBALANCE) || hasStatus(defender, STATUS_TYPES.IMBALANCE)) return 0;
  if (attacker?.cult === 'balance' || defender?.cult === 'balance') {
    return CULT_MECHANICS_CONFIG.balance.NEUTRALITY_SCALE;
  }
  return 1;
}

/**
 * 교단 상성 피해 배율 (기본 OFF — setCultMatchupEnabled로 켠다)
 * @param {Object} attacker 공격자
 * @param {Object} defender 방어자
 * @returns {number} 배율 (OFF거나 중립이면 1)
 */
export function getCultMatchupMultiplier(attacker, defender) {
  if (!matchupEnabled) return 1;
  const cfg = CULT_MECHANICS_CONFIG.matchup;
  const advantage = getCultAdvantage(attacker?.cult, defender?.cult);
  const base = advantage === 'ADVANTAGE' ? cfg.ADVANTAGE
    : advantage === 'DISADVANTAGE' ? cfg.DISADVANTAGE
      : cfg.NEUTRAL;
  if (base === cfg.NEUTRAL) return cfg.NEUTRAL;
  return 1 + (base - 1) * getMatchupScale(attacker, defender);
}

/** Round Table Bond — 아발론 아군 수만큼 치유량 증가 */
export function getHealMultiplier(healer, allies = []) {
  const cfg = CULT_MECHANICS_CONFIG.avalon;
  const count = allies.filter(a => a && a.cult === 'avalon').length;
  if (count === 0) return 1;
  return 1 + Math.min(cfg.ROUND_TABLE_HEAL_MAX, count * cfg.ROUND_TABLE_HEAL_PER_MEMBER);
}

// ============================================
// 방어막 / 룬 실드 / 피해 차단
// ============================================

/**
 * 피해 확정 전 흡수 처리
 * (무적 → Warrior's Pride → Rune Shield → Abyss Gaze/Holy Ward → Last Stand)
 * @param {Object} target 피격 유닛
 * @param {number} damage 원 피해량
 * @param {Object} [attacker] 공격자 (Abyss Gaze 판정)
 * @returns {Object} { damage, absorbed, reflect, shieldBroken, pride, lastStand }
 */
export function absorbDamage(target, damage, attacker = null) {
  const state = target?.cultState;
  const result = { damage, absorbed: 0, reflect: 0, shieldBroken: false, pride: false, lastStand: false };
  if (!state) return result;

  const valhallaCfg = CULT_MECHANICS_CONFIG.valhalla;
  const tartarusCfg = CULT_MECHANICS_CONFIG.tartarus;
  const avalonCfg = CULT_MECHANICS_CONFIG.avalon;

  // 0) 무적 (Last Stand 직후 / Wild Card 피해 무효화)
  if (hasStatus(target, STATUS_TYPES.INVULNERABLE)) {
    return { ...result, damage: 0, absorbed: damage };
  }

  let incoming = damage;

  // 1) Warrior's Pride — 한 방에 최대 HP 40% 이상이면 15%로 환산 (1턴 쿨다운)
  if (target.cult === 'valhalla' && state.prideCooldown <= 0
    && incoming >= (target.maxHp || 0) * valhallaCfg.PRIDE_DAMAGE_RATIO) {
    incoming = Math.floor((target.maxHp || 0) * valhallaCfg.PRIDE_CONVERT_RATIO);
    state.prideCooldown = valhallaCfg.PRIDE_COOLDOWN;
    result.pride = true;
  }

  // 2) Rune Shield — 1회 완전 흡수 (방어막보다 우선)
  if (state.runeShield > 0) {
    state.runeShield -= 1;
    return { ...result, damage: 0, absorbed: incoming, shieldBroken: true };
  }

  // 3) 방어막 흡수 (tartarus Abyss Gaze는 방어막/HP 동시 피해로 분산)
  if (state.barrier > 0) {
    const share = attacker?.cult === 'tartarus' ? tartarusCfg.ABYSS_GAZE_SPLIT : 1;
    const attempt = Math.floor(incoming * share);
    const absorbed = Math.min(state.barrier, attempt);
    state.barrier -= absorbed;
    result.absorbed = absorbed;
    incoming -= absorbed;
    if (state.barrier === 0) {
      result.shieldBroken = true;
      result.reflect = Math.floor(damage * avalonCfg.THORNS_REFLECT_RATIO);
    }
  }

  // 4) Last Stand — 전투당 1회, HP 1로 생존 + 1턴 무적
  const lastStandArmed = target.cult === 'valhalla' || hasStatus(target, STATUS_TYPES.LAST_STAND);
  if (lastStandArmed && !state.lastStandUsed && incoming >= target.currentHp) {
    incoming = Math.max(0, target.currentHp - valhallaCfg.LAST_STAND_HP);
    state.lastStandUsed = true;
    result.lastStand = true;
    applyStatus(target, {
      type: STATUS_TYPES.INVULNERABLE,
      duration: valhallaCfg.LAST_STAND_DURATION + 1,
    });
  }

  result.damage = Math.max(0, incoming);
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

/** Berserker 스택 누적 (valhalla, 상한 적용) */
export function addRage(unit, stacks = 1) {
  const cfg = CULT_MECHANICS_CONFIG.valhalla;
  const state = ensureCultState(unit);
  if (!state) return 0;
  state.rage = Math.min(cfg.BERSERK_STACK_MAX, state.rage + Math.max(0, Math.floor(stacks)));
  return state.rage;
}

/** Cold Stack 누적 (helheim) */
export function addCold(unit, stacks = 1) {
  const state = ensureCultState(unit);
  if (!state) return 0;
  state.cold += Math.max(0, Math.floor(stacks));
  return state.cold;
}

/** Growth Ring 스택 누적 (nature, 상한 적용) */
export function addGrowth(unit, stacks = 1) {
  const cfg = CULT_MECHANICS_CONFIG.nature;
  const state = ensureCultState(unit);
  if (!state) return 0;
  state.growth = Math.min(cfg.GROWTH_MAX, state.growth + Math.max(0, Math.floor(stacks)));
  return state.growth;
}

/** 추가 행동 부여 (takamagahara, 상한 적용) */
export function grantExtraAction(unit) {
  const cfg = CULT_MECHANICS_CONFIG.takamagahara;
  const state = ensureCultState(unit);
  if (!state) return 0;
  state.extraActions = Math.min(cfg.EXTRA_ACTION_MAX, state.extraActions + 1);
  return state.extraActions;
}

/** 추가 행동 소비 — 남아 있으면 true */
export function consumeExtraAction(unit) {
  const state = unit?.cultState;
  if (!state || state.extraActions <= 0) return false;
  state.extraActions -= 1;
  return true;
}

/**
 * Equilibrium 산출 — 파티 HP 편차로 ATK/DEF 또는 크리 보너스 결정 (balance)
 * @param {Object} unit 기준 유닛
 * @param {Array<Object>} allies 아군
 * @returns {{atk:number, def:number, crit:number}}
 */
export function calcEquilibrium(unit, allies = []) {
  const cfg = CULT_MECHANICS_CONFIG.balance;
  const none = { atk: 0, def: 0, crit: 0 };
  if (unit?.cult !== 'balance') return none;

  const ratios = allies.filter(a => a?.isAlive && a.maxHp > 0).map(a => a.currentHp / a.maxHp);
  if (ratios.length === 0) return none;

  const gap = Math.max(...ratios) - Math.min(...ratios);
  if (gap >= cfg.EQUILIBRIUM_HIGH_GAP) {
    return { atk: cfg.EQUILIBRIUM_STAT_BONUS, def: cfg.EQUILIBRIUM_STAT_BONUS, crit: 0 };
  }
  if (gap <= cfg.EQUILIBRIUM_LOW_GAP) {
    return { atk: 0, def: 0, crit: cfg.EQUILIBRIUM_CRIT_BONUS };
  }
  return none;
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

const random = (ctx) => (ctx?.rng ? ctx.rng() : Math.random());

const roll = (ctx, chance) => random(ctx) < chance;

const pick = (ctx, list) => (list && list.length > 0
  ? list[Math.floor(random(ctx) * list.length) % list.length]
  : null);

/** min~max 정수 (양끝 포함) */
const rollInt = (ctx, min, max) => min + Math.floor(random(ctx) * (max - min + 1));

/** min~max 실수 */
const rollRange = (ctx, min, max) => min + random(ctx) * (max - min);

const lowestHp = (units) => units
  .filter(u => u?.isAlive)
  .reduce((min, cur) => (!min || cur.getHpPercent?.() < min.getHpPercent?.() ? cur : min), null);

const highestHp = (units) => units
  .filter(u => u?.isAlive)
  .reduce((max, cur) => (!max || cur.getHpPercent?.() > max.getHpPercent?.() ? cur : max), null);

/** 아군 목록 (없으면 빈 배열) */
const alliesOf = (ctx) => (ctx.allies || []).filter(u => u?.isAlive);

/** 적 목록 (없으면 빈 배열) */
const enemiesOf = (ctx) => (ctx.enemies || []).filter(u => u?.isAlive);

/** 훅 컨텍스트의 행동 주체 (onHit=attacker / onTurnStart=unit) */
const actorOf = (ctx) => ctx.attacker || ctx.unit || null;

/** 추가 피해 서술자 */
const hit = (target, amount, label) => descriptor('extraDamage', target, {
  amount: Math.max(1, Math.floor(amount)),
  label,
});

/**
 * 상태이상 부여 + 서술자
 * @param {Object} target 대상
 * @param {string} type STATUS_TYPES 값
 * @param {Object} options { duration, value, stacks, maxStacks, sourceId }
 */
function inflict(target, type, options = {}) {
  applyStatus(target, { type, ...options });
  return descriptor('status', target, { status: type, duration: options.duration });
}

/** Thunderstruck 부여 서술자 */
function applyThunderstruck(ctx, target) {
  const cfg = CULT_MECHANICS_CONFIG.olympus;
  return inflict(target, STATUS_TYPES.THUNDERSTRUCK, {
    duration: cfg.THUNDERSTRUCK_DURATION,
    sourceId: actorOf(ctx)?.id || null,
  });
}

/** Lightning Strike 발동 서술자 (스턴 확률 포함) */
function fireLightningStrike(ctx, target, { forceStun = false } = {}) {
  const cfg = CULT_MECHANICS_CONFIG.olympus;
  const out = [hit(target, calcLightningDamage(ctx.attacker, target), 'lightning_strike')];
  if (forceStun || roll(ctx, cfg.LIGHTNING_STUN_CHANCE)) out.push(applyThunderstruck(ctx, target));
  return out;
}

/** Doom 누적 + Death Sentence 판정 */
function resolveDoom(ctx, target, stacks, threshold) {
  const out = [descriptor('doom', target, { stacks: addDoom(target, stacks) })];
  const execution = calcDeathSentence(target, threshold);
  if (execution > 0) out.push(hit(target, execution, 'death_sentence'));
  return out;
}

/** 저주 부여 */
function applyCurse(ctx, target) {
  const cfg = CULT_MECHANICS_CONFIG.yomi;
  return inflict(target, STATUS_TYPES.CURSE, {
    duration: cfg.CURSE_DURATION,
    value: Math.floor((ctx.attacker?.atk || 0) * cfg.CURSE_DOT_ATK_RATIO),
    sourceId: ctx.attacker?.id || null,
  });
}

/** 방어막 부여 서술자 */
function wardTargets(ctx, targets, ratio) {
  const amount = Math.floor((actorOf(ctx)?.atk || 0) * ratio);
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

/** CC 부여 + Frost Cage(Cold Stack) 누적 (helheim) */
function freezeTarget(ctx, target, type, duration) {
  const cfg = CULT_MECHANICS_CONFIG.helheim;
  const out = [inflict(target, type, { duration, sourceId: actorOf(ctx)?.id || null })];
  out.push(descriptor('cold', target, { stacks: addCold(target, cfg.COLD_PER_CC) }));
  return out;
}

/** 독 부여 (kunlun) */
function poisonTarget(ctx, target, duration) {
  const cfg = CULT_MECHANICS_CONFIG.kunlun;
  return inflict(target, STATUS_TYPES.POISON, {
    duration,
    value: Math.floor((actorOf(ctx)?.atk || 0) * cfg.POISON_ATK_RATIO),
    sourceId: actorOf(ctx)?.id || null,
  });
}

/** 방어 파쇄 스택 (tartarus) */
function shredTarget(target) {
  const cfg = CULT_MECHANICS_CONFIG.tartarus;
  return inflict(target, STATUS_TYPES.ARMOR_SHRED, {
    duration: cfg.SHRED_DURATION,
    stacks: 1,
    maxStacks: cfg.SHRED_MAX_STACKS,
  });
}

/** 무작위 디버프 1종 (chaos) */
const RANDOM_DEBUFFS = Object.freeze([
  STATUS_TYPES.WEAKEN,
  STATUS_TYPES.SLOW,
  STATUS_TYPES.POISON,
  STATUS_TYPES.CHAOS_BRAND,
]);

function randomDebuff(ctx, target) {
  const chaosCfg = CULT_MECHANICS_CONFIG.chaos;
  const type = pick(ctx, RANDOM_DEBUFFS);
  if (type === STATUS_TYPES.POISON) return poisonTarget(ctx, target, CULT_MECHANICS_CONFIG.kunlun.POISON_DURATION);
  if (type === STATUS_TYPES.SLOW) {
    return inflict(target, STATUS_TYPES.SLOW, { duration: chaosCfg.WILD_DEBUFF_DURATION, value: chaosCfg.WILD_SLOW });
  }
  return inflict(target, type, { duration: chaosCfg.BRAND_DURATION });
}

/**
 * Wild Card — 매 턴 무작위 Chaos Effect 1종 (CULT_SYSTEM_DESIGN §2-11 10종)
 * @param {Object} ctx { unit|attacker, allies, enemies, rng }
 * @returns {Array<Object>} 서술자
 */
function wildCard(ctx) {
  const cfg = CULT_MECHANICS_CONFIG.chaos;
  const actor = actorOf(ctx);
  const allies = alliesOf(ctx);
  const enemies = enemiesOf(ctx);
  const atk = actor?.atk || 0;
  const index = rollInt(ctx, 0, 9);

  switch (index) {
    case 0: // 파티 전체 ATK +30% (1턴)
      return allies.map(u => inflict(u, STATUS_TYPES.MADNESS, {
        duration: cfg.WILD_BUFF_DURATION + 1, value: cfg.WILD_ATK_BUFF,
      }));
    case 1: // 파티 전체 피해 무효화 (1턴)
      return allies.map(u => inflict(u, STATUS_TYPES.INVULNERABLE, { duration: cfg.WILD_BUFF_DURATION + 1 }));
    case 2: // 파티 전체 ATK -20% (1턴)
      return allies.map(u => inflict(u, STATUS_TYPES.WEAKEN, { duration: cfg.WILD_BUFF_DURATION + 1 }));
    case 3: // 파티 전체 DEF -20% (1턴)
      return allies.map(u => inflict(u, STATUS_TYPES.ARMOR_SHRED, {
        duration: cfg.WILD_BUFF_DURATION + 1, stacks: 2, maxStacks: CULT_MECHANICS_CONFIG.tartarus.SHRED_MAX_STACKS,
      }));
    case 4: // 적 전체에게 ATK×100% 피해
      return enemies.map(u => hit(u, atk * cfg.WILD_AOE_RATIO, 'chaos_wildcard'));
    case 5: { // 적 랜덤 1명에게 ATK×300% 피해
      const victim = pick(ctx, enemies);
      return victim ? [hit(victim, atk * cfg.WILD_SINGLE_RATIO, 'chaos_wildcard')] : [];
    }
    case 6: // 적 전체 SPD -30% (2턴)
      return enemies.map(u => inflict(u, STATUS_TYPES.SLOW, {
        duration: cfg.WILD_DEBUFF_DURATION, value: cfg.WILD_SLOW,
      }));
    case 7: // 아군 전체 HP 30% 즉시 회복
      return allies.map(u => descriptor('heal', u, {
        amount: u.heal?.(Math.floor(u.maxHp * cfg.WILD_HEAL_RATIO))?.actualHeal || 0,
      }));
    case 8: // 아군 전체 방어막 ATK×50%
      return wardTargets({ ...ctx, attacker: actor }, allies, cfg.WILD_BARRIER_RATIO);
    default: { // 무작위 적 1명 스킬 게이지 초기화
      const victim = pick(ctx, enemies);
      if (!victim) return [];
      victim.skillGauge = 0;
      return [descriptor('gaugeReset', victim, {})];
    }
  }
}

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
      const targets = alliesOf(ctx);
      const heals = targets.map(u => descriptor('heal', u, { amount: u.heal(u.maxHp).actualHeal }));
      return [...heals, ...wardTargets(ctx, targets, CULT_MECHANICS_CONFIG.avalon.FORTRESS_ATK_RATIO)];
    },
  },

  // ---------- asgard (균형) ----------
  rune_stack: {
    cult: 'asgard',
    onSkillUse: (ctx) => {
      const ally = pick(ctx, alliesOf(ctx));
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
      const others = alliesOf(ctx).filter(u => u !== ctx.attacker);
      return source.flatMap(runeType => inscribeTargets(ctx, others, runeType));
    },
  },

  // ---------- valhalla (공세) ----------
  berserker_stack: {
    cult: 'valhalla',
    handlesRage: true,
    onSkillUse: (ctx) => [descriptor('rage', ctx.attacker, { stacks: addRage(ctx.attacker, 1) })],
  },
  berserk_overdrive: {
    cult: 'valhalla',
    handlesRage: true,
    onSkillUse: (ctx) => [descriptor('rage', ctx.attacker, {
      stacks: addRage(ctx.attacker, CULT_MECHANICS_CONFIG.valhalla.BERSERK_STACK_MAX),
      overdrive: true,
    })],
  },
  low_hp_bonus: {
    cult: 'valhalla',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.valhalla;
      const out = [inflict(ctx.target, STATUS_TYPES.FRENZY_MARK, {
        duration: cfg.FRENZY_MARK_DURATION,
        sourceId: ctx.attacker?.id || null,
      })];
      const ratio = ctx.attacker?.maxHp > 0 ? ctx.attacker.currentHp / ctx.attacker.maxHp : 1;
      if (ratio <= cfg.RAGE_MID_HP) {
        out.push(hit(ctx.target, (ctx.attacker.atk || 0) * cfg.RAGE_MID_ATK, 'berserker_rage'));
      }
      return out;
    },
  },
  last_stand: {
    cult: 'valhalla',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.valhalla;
      const state = ensureCultState(ctx.attacker);
      if (!state) return [];
      state.lastStandUsed = false;
      return [inflict(ctx.attacker, STATUS_TYPES.LAST_STAND, { duration: cfg.FRENZY_MARK_DURATION })];
    },
  },

  // ---------- takamagahara (균형) ----------
  spd_up: {
    cult: 'takamagahara',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.takamagahara;
      const value = (ctx.effect.value ?? cfg.HASTE_DEFAULT * 100) / 100;
      return alliesOf(ctx).map(u => inflict(u, STATUS_TYPES.HASTE, {
        duration: cfg.HASTE_DURATION, value,
      }));
    },
  },
  extra_action: {
    cult: 'takamagahara',
    onSkillUse: (ctx) => [descriptor('extraAction', ctx.attacker, {
      remaining: grantExtraAction(ctx.attacker),
    })],
  },
  speed_dominance: {
    cult: 'takamagahara',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.takamagahara;
      const dazzles = enemiesOf(ctx).map(u => inflict(u, STATUS_TYPES.DAZZLE, {
        duration: cfg.DAZZLE_DURATION, sourceId: ctx.attacker?.id || null,
      }));
      return [...dazzles, inflict(ctx.attacker, STATUS_TYPES.HASTE, {
        duration: cfg.HASTE_DURATION, value: cfg.HASTE_DEFAULT,
      })];
    },
  },

  // ---------- helheim (제어) ----------
  freeze: {
    cult: 'helheim',
    handlesCold: true,
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.helheim;
      if (!roll(ctx, (ctx.effect.value ?? 0) / 100)) return [];
      return freezeTarget(ctx, ctx.target, STATUS_TYPES.FREEZE, cfg.FREEZE_DURATION);
    },
  },
  stun: {
    cult: 'helheim',
    handlesCold: true,
    onHit: (ctx) => freezeTarget(ctx, ctx.target, STATUS_TYPES.STUN,
      ctx.effect.value ?? CULT_MECHANICS_CONFIG.helheim.STUN_DEFAULT_DURATION),
  },
  terror_all: {
    cult: 'helheim',
    handlesCold: true,
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.helheim;
      return enemiesOf(ctx).flatMap(u => freezeTarget(ctx, u, STATUS_TYPES.TERROR, cfg.TERROR_DURATION));
    },
  },

  // ---------- tartarus (제어) ----------
  armor_pierce: {
    cult: 'tartarus',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.tartarus;
      return [inflict(ctx.attacker, STATUS_TYPES.ARMOR_PIERCE, {
        duration: cfg.PIERCE_DURATION,
        value: (ctx.effect.value ?? 0) / 100,
      })];
    },
  },
  full_armor_pierce: {
    cult: 'tartarus',
    onSkillUse: (ctx) => [inflict(ctx.attacker, STATUS_TYPES.ARMOR_PIERCE, {
      duration: CULT_MECHANICS_CONFIG.tartarus.PIERCE_DURATION, value: 1,
    })],
  },
  armor_shred: {
    cult: 'tartarus',
    onHit: (ctx) => [shredTarget(ctx.target)],
  },
  mass_armor_shred: {
    cult: 'tartarus',
    onHit: (ctx) => enemiesOf(ctx).map(u => shredTarget(u)),
  },
  shield_break: {
    cult: 'tartarus',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.tartarus;
      const state = ensureCultState(ctx.target);
      const broken = state.barrier;
      state.barrier = 0;
      state.runeShield = 0;
      const out = [descriptor('shieldBreak', ctx.target, { broken })];
      if (broken > 0) out.push(hit(ctx.target, broken * cfg.SHIELD_BREAK_RATIO, 'shield_break'));
      out.push(inflict(ctx.target, STATUS_TYPES.TITANFALL, { duration: cfg.TITANFALL_DURATION }));
      return out;
    },
  },

  // ---------- kunlun (지속) ----------
  poison: {
    cult: 'kunlun',
    onHit: (ctx) => [poisonTarget(ctx, ctx.target,
      ctx.effect.value ?? CULT_MECHANICS_CONFIG.kunlun.POISON_DURATION)],
  },
  multi_poison: {
    cult: 'kunlun',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.kunlun;
      return [
        poisonTarget(ctx, ctx.target, cfg.POISON_DURATION),
        inflict(ctx.target, STATUS_TYPES.WEAKEN, { duration: cfg.WEAKEN_DURATION }),
        inflict(ctx.target, STATUS_TYPES.WITHERING, {
          duration: cfg.WITHERING_DURATION, stacks: 1, maxStacks: cfg.WITHERING_MAX_STACKS,
        }),
      ];
    },
  },
  cleanse_all: {
    cult: 'kunlun',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.kunlun;
      const heal = Math.floor((ctx.attacker?.atk || 0) * cfg.IMMORTAL_HERB_ATK_RATIO);
      return alliesOf(ctx).flatMap(u => {
        const removed = cleanseDebuffs(u);
        if (removed === 0) return [];
        return [
          descriptor('cleanse', u, { removed }),
          descriptor('heal', u, { amount: u.heal?.(heal * removed)?.actualHeal || 0 }),
        ];
      });
    },
  },

  // ---------- nature (지속) ----------
  growth_buff: {
    cult: 'nature',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.nature;
      return alliesOf(ctx).map(u => descriptor('growth', u, {
        stacks: addGrowth(u, cfg.GROWTH_BUFF_STACKS),
      }));
    },
  },
  growth_atk: {
    cult: 'nature',
    onSkillUse: (ctx) => [descriptor('growth', ctx.attacker, {
      stacks: addGrowth(ctx.attacker, CULT_MECHANICS_CONFIG.nature.GROWTH_ATK_STACKS),
    })],
  },
  late_game_bonus: {
    cult: 'nature',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.nature;
      const stacks = ctx.attacker?.cultState?.growth || 0;
      if (stacks <= 0) return [];
      return [hit(ctx.target, (ctx.attacker.atk || 0) * cfg.LATE_GAME_ATK_RATIO * stacks, 'growth_ring')];
    },
  },
  earth_liberation: {
    cult: 'nature',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.nature;
      const overgrowth = enemiesOf(ctx).map(u => inflict(u, STATUS_TYPES.OVERGROWTH, {
        duration: cfg.OVERGROWTH_DURATION,
        value: Math.floor((u.maxHp || 0) * cfg.OVERGROWTH_HP_RATIO),
        sourceId: ctx.attacker?.id || null,
      }));
      return [...overgrowth, descriptor('growth', ctx.attacker, {
        stacks: addGrowth(ctx.attacker, cfg.GROWTH_PER_TURN),
      })];
    },
  },

  // ---------- chaos (공세) ----------
  random_multiplier: {
    cult: 'chaos',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      const ratio = rollRange(ctx, cfg.RANDOM_MULTIPLIER_MIN, cfg.RANDOM_MULTIPLIER_MAX);
      return [hit(ctx.target, (ctx.attacker.atk || 0) * ratio, 'chaos_roll')];
    },
  },
  chaos_burst: {
    cult: 'chaos',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      const hits = rollInt(ctx, cfg.BURST_MIN_HITS, cfg.BURST_MAX_HITS);
      return Array.from({ length: hits }, () =>
        hit(ctx.target, (ctx.attacker.atk || 0) * cfg.BURST_ATK_RATIO, 'chaos_burst'));
    },
  },
  chaos_liberation: {
    cult: 'chaos',
    onSkillUse: (ctx) => Array.from({ length: CULT_MECHANICS_CONFIG.chaos.LIBERATION_ROLLS })
      .flatMap(() => wildCard(ctx)),
  },
  random_debuff: {
    cult: 'chaos',
    onHit: (ctx) => [randomDebuff(ctx, ctx.target)],
  },
  chaos_storm: {
    cult: 'chaos',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      return enemiesOf(ctx).flatMap(u => [
        hit(u, (ctx.attacker.atk || 0) * cfg.STORM_ATK_RATIO, 'chaos_storm'),
        randomDebuff(ctx, u),
      ]);
    },
  },
  madness_liberation: {
    cult: 'chaos',
    onSkillUse: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      const out = [inflict(ctx.attacker, STATUS_TYPES.MADNESS, {
        duration: cfg.MADNESS_DURATION, value: cfg.MADNESS_ATK_BONUS,
      })];
      // Misfire — 낮은 확률로 아군 1명이 혼돈 낙인을 뒤집어쓴다
      if (roll(ctx, cfg.EXPLOSION_SELF_CHANCE)) {
        const victim = pick(ctx, alliesOf(ctx).filter(u => u !== ctx.attacker));
        if (victim) out.push(inflict(victim, STATUS_TYPES.CHAOS_BRAND, { duration: cfg.BRAND_DURATION }));
      }
      return out;
    },
  },
  random_element: {
    cult: 'chaos',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      const elemental = pick(ctx, cfg.ELEMENT_MULTIPLIERS);
      return [hit(ctx.target, (ctx.attacker.atk || 0) * cfg.ELEMENT_ATK_RATIO * elemental, 'chaos_element')];
    },
  },
  unstable_explosion: {
    cult: 'chaos',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      const out = enemiesOf(ctx).map(u => hit(u, (ctx.attacker.atk || 0) * cfg.EXPLOSION_ATK_RATIO, 'chaos_explosion'));
      if (roll(ctx, cfg.EXPLOSION_SELF_CHANCE)) {
        out.push(hit(ctx.attacker, (ctx.attacker.atk || 0) * cfg.EXPLOSION_SELF_RATIO, 'chaos_misfire'));
      }
      return out;
    },
  },
  elemental_collapse: {
    cult: 'chaos',
    onHit: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.chaos;
      return enemiesOf(ctx).flatMap(u => [
        hit(u, (ctx.attacker.atk || 0) * cfg.COLLAPSE_ATK_RATIO, 'chaos_collapse'),
        randomDebuff(ctx, u),
      ]);
    },
  },

  // ---------- balance (균형) ----------
  neutral_buff: {
    cult: 'balance',
    onSkillUse: (ctx) => alliesOf(ctx).map(u => inflict(u, STATUS_TYPES.NEUTRAL_FIELD, {
      duration: CULT_MECHANICS_CONFIG.balance.NEUTRAL_FIELD_DURATION + 1,
    })),
  },
  mood_neutral_all: {
    cult: 'balance',
    onSkillUse: (ctx) => enemiesOf(ctx).map(u => inflict(u, STATUS_TYPES.IMBALANCE, {
      duration: CULT_MECHANICS_CONFIG.balance.IMBALANCE_DURATION,
      sourceId: ctx.attacker?.id || null,
    })),
  },
  neutral_damage: {
    cult: 'balance',
    onHit: (ctx) => [hit(ctx.target,
      (ctx.attacker.atk || 0) * CULT_MECHANICS_CONFIG.balance.NEUTRAL_DAMAGE_ATK_RATIO, 'equilibrium')],
  },
  balance_field: {
    cult: 'balance',
    onSkillUse: (ctx) => {
      const allies = alliesOf(ctx).filter(u => u.maxHp > 0);
      if (allies.length === 0) return [];
      const average = allies.reduce((sum, u) => sum + u.currentHp / u.maxHp, 0) / allies.length;
      return allies.flatMap(u => {
        const target = Math.floor(u.maxHp * average);
        if (target <= u.currentHp) return [];
        return [descriptor('heal', u, { amount: u.heal?.(target - u.currentHp)?.actualHeal || 0 })];
      });
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

  valhalla: {
    /** Berserker Rage — 공격할 때마다 분노 스택 (배율은 getRageMultiplier) */
    onHit: (ctx) => {
      if (ctx.rageHandled) return [];
      return [descriptor('rage', ctx.attacker, { stacks: addRage(ctx.attacker, 1) })];
    },
  },
  takamagahara: {
    /** Kami no Ma — 전투 시작 시 SPD 최고 아군이 선제 행동 */
    onBattleStart: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.takamagahara;
      const allies = alliesOf(ctx);
      if (allies.length === 0) return [];
      const fastest = allies.reduce((best, cur) =>
        (!best || getEffectiveSpd(cur) > getEffectiveSpd(best) ? cur : best), null);
      if (!fastest) return [];
      return [inflict(fastest, STATUS_TYPES.KAMI_NO_MA, { duration: cfg.KAMI_NO_MA_DURATION + 1 })];
    },
    /** Heaven's Gift — 처치에 성공하면 추가 행동 1회 */
    onDeath: (ctx) => {
      const killer = ctx.killer;
      if (!killer?.isAlive) return [];
      return [descriptor('extraAction', killer, { remaining: grantExtraAction(killer) })];
    },
  },
  helheim: {
    /** Numbing Aura — 전투 시작 시 적 파티 SPD -10% (전투 내내) */
    onBattleStart: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.helheim;
      return enemiesOf(ctx).map(u => inflict(u, STATUS_TYPES.NUMBING, { duration: cfg.NUMBING_DURATION }));
    },
    /** Frost Cage — CC 상태의 적을 때리면 Cold Stack 유지 */
    onHit: (ctx) => {
      if (ctx.coldHandled) return [];
      const frozen = BLOCKING_STATUSES.some(type => hasStatus(ctx.target, type));
      if (!frozen) return [];
      return [descriptor('cold', ctx.target, {
        stacks: addCold(ctx.target, CULT_MECHANICS_CONFIG.helheim.COLD_PER_CC),
      })];
    },
  },
  kunlun: {
    /** Immortal Herb — 턴 시작 시 아군 디버프 1건당 ATK×20% 자가 회복 */
    onTurnStart: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.kunlun;
      const debuffs = alliesOf(ctx).reduce((sum, u) => sum + countDebuffs(u), 0);
      if (debuffs === 0) return [];
      const amount = Math.floor((ctx.unit?.atk || 0) * cfg.IMMORTAL_HERB_ATK_RATIO * debuffs);
      return [descriptor('heal', ctx.unit, { amount: ctx.unit.heal?.(amount)?.actualHeal || 0 })];
    },
  },
  nature: {
    /** Root of Life — 전투 시작 시 성장 스택 이월 */
    onBattleStart: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.nature;
      return [descriptor('growth', ctx.unit, { stacks: addGrowth(ctx.unit, cfg.ROOT_OF_LIFE_STACKS) })];
    },
    /** Growth Ring — 매 턴 성장 스택 +1 (최대 10) */
    onTurnStart: (ctx) => {
      const cfg = CULT_MECHANICS_CONFIG.nature;
      return [descriptor('growth', ctx.unit, { stacks: addGrowth(ctx.unit, cfg.GROWTH_PER_TURN) })];
    },
  },
  chaos: {
    /** Wild Card — 매 턴 시작 시 무작위 Chaos Effect 1종 */
    onTurnStart: (ctx) => wildCard(ctx),
  },
  balance: {
    /** Equilibrium — 파티 HP 편차로 ATK/DEF 또는 크리 보너스 갱신 */
    onTurnStart: (ctx) => {
      const state = ensureCultState(ctx.unit);
      if (!state) return [];
      state.equilibrium = calcEquilibrium(ctx.unit, alliesOf(ctx));
      return [descriptor('equilibrium', ctx.unit, { ...state.equilibrium })];
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

/** 유닛 배열을 진영별로 나눈다 (BattleUnit.isEnemy 기준) */
function splitSides(units) {
  const allies = units.filter(u => u && !u.isEnemy);
  const enemies = units.filter(u => u && u.isEnemy);
  return { allies, enemies };
}

// ============================================
// 파사드 — BattleSystem이 호출하는 훅 진입점
// ============================================

export class CultMechanicsSystem {
  /**
   * 전투 시작 — 교단 상태 초기화 + 전투 시작 패시브
   * (Kami no Ma 선제 / Numbing Aura / Root of Life)
   * @param {Array<Object>} units 전체 유닛
   * @returns {Array<Object>} 효과 서술자
   */
  static onBattleStart(units = []) {
    const alive = units.filter(Boolean);
    alive.forEach(unit => { unit.cultState = createCultState(); });

    const { allies, enemies } = splitSides(alive);
    return alive.flatMap(unit => {
      const side = unit.isEnemy
        ? { allies: enemies, enemies: allies }
        : { allies, enemies };
      return runPassive('onBattleStart', unit.cult, { unit, ...side });
    });
  }

  /**
   * 턴 시작 — 상태이상 틱 + 교단 턴 시작 패시브
   * @param {Object} ctx { unit, allies, enemies, rng }
   * @returns {Object} { blocked, blockedBy, dotDamage, expired, chaosBloom, effects }
   */
  static onTurnStart(ctx) {
    const tick = tickStatuses(ctx.unit);
    const effects = runPassive('onTurnStart', ctx.unit?.cult, ctx);
    return { ...tick, effects };
  }

  /**
   * 스킬 사용(피해 확정 전) — 아군 대상 방어막/룬/버프 계열
   * @param {Object} ctx { attacker, targets, skill, allies, enemies, rng }
   * @returns {Array<Object>} 효과 서술자
   */
  static onSkillUse(ctx) {
    return runToken('onSkillUse', ctx, ctx.skill).results;
  }

  /**
   * 피해 확정 전 — 무적/Warrior's Pride/방어막/룬 실드/Last Stand
   * @returns {Object} { damage, absorbed, reflect, shieldBroken, pride, lastStand }
   */
  static beforeDamage(ctx) {
    return absorbDamage(ctx.target, ctx.damage, ctx.attacker);
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
      rageHandled: !!token.handlerDef?.handlesRage,
      coldHandled: !!token.handlerDef?.handlesCold,
    });
    return [...token.results, ...passive];
  }

  /** 피격 후 — 확장 지점 (현재 피해 차단 계열은 beforeDamage가 담당) */
  static onDamaged() {
    return [];
  }

  /**
   * 사망 후 — Doom 전이(yomi) / Bifrost Link(asgard) / Heaven's Gift(takamagahara)
   * @param {Object} ctx { unit, killer, allies, enemies }
   */
  static onDeath(ctx) {
    const own = runPassive('onDeath', ctx.unit?.cult, ctx);
    const killerHook = ctx.killer && ctx.killer.cult !== ctx.unit?.cult
      ? runPassive('onDeath', ctx.killer.cult, ctx)
      : [];
    return [...own, ...killerHook];
  }

  // ---- 순수 계산 위임 (BattleSystem 데미지식에서 사용) ----
  static getOutgoingDamageMultiplier = getOutgoingDamageMultiplier;
  static getIncomingDamageMultiplier = getIncomingDamageMultiplier;
  static getCultMatchupMultiplier = getCultMatchupMultiplier;
  static getDefPierceRatio = getDefPierceRatio;
  static getCritBonus = getCritBonus;
  static getMatchupScale = getMatchupScale;
  static getEffectiveDef = getEffectiveDef;
  static getEffectiveSpd = getEffectiveSpd;
  static getFlatAtkBonus = getFlatAtkBonus;
  static getHealMultiplier = getHealMultiplier;
  static consumeRuneburst = consumeRuneburst;
  static consumeExtraAction = consumeExtraAction;
  static createCultState = createCultState;
  static parseCultEffect = parseCultEffect;
  static getUnimplementedEffects = getUnimplementedEffects;
  static getAllCultEffectTokens = getAllCultEffectTokens;
  static setCultMatchupEnabled = setCultMatchupEnabled;
  static isCultMatchupEnabled = isCultMatchupEnabled;
  static getCultAdvantage = getCultAdvantage;
}

export default CultMechanicsSystem;
