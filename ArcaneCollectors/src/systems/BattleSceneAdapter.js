/**
 * BattleSceneAdapter — BattleScene(연출) ↔ BattleSystem(판정) 사이의 순수 어댑터
 *
 * 배경 (docs/AUDIT_CULT_MECHANISMS.md §5)
 *   BattleScene은 자체 턴 루프·데미지식·AI를 들고 있어 BattleSystem의 단일 피해 경로
 *   `resolveDamage()`와 CultMechanicsSystem 훅 7종을 한 번도 통과하지 않았다. 그래서
 *   교단 메커니즘(Divine Charge / Doom / Holy Ward / Rune)이 실플레이에 반영되지 않았다.
 *
 * 이 모듈의 역할
 *   씬의 배틀러 객체를 "BattleSystem이 그대로 쓸 수 있는 BattleUnit"으로 만든다.
 *   평행 객체 두 개를 만들어 동기화하지 않는다 — 하나의 객체가 양쪽 계약을 동시에
 *   만족하게 한다. 그래야 `battler.cultState`가 살아 있어 배지가 실제로 그려진다.
 *
 *   씬 계약:        stats.{hp,atk,def,spd} / isAlly / position / currentHp / maxHp
 *   BattleSystem:   atk,def,spd(평면) / isEnemy / takeDamage() / getHpPercent() / cultState
 *
 *   → atk/def/spd를 `stats`를 가리키는 접근자로 정의해 양쪽이 같은 값을 본다.
 *     (시너지 적용이 `ally.stats = modified`로 객체를 통째로 갈아끼워도 접근자는 유효)
 *
 * Phaser 비의존 — 전부 순수 함수라 vitest에서 그대로 검증된다.
 */
import { BattleUnit, BattleSystem } from './BattleSystem.js';
import { CultMechanicsSystem } from './CultMechanicsSystem.js';

/** 스탯이 전혀 없는 배틀러의 최후 방어값 */
export const FALLBACK_STATS = Object.freeze({ hp: 100, atk: 10, def: 10, spd: 10 });

/** `stats`에 위임하는 평면 스탯 키 (hp는 maxHp/currentHp가 따로 관리) */
const DELEGATED_STAT_KEYS = Object.freeze(['atk', 'def', 'spd']);

/** 스킬이 하나도 없을 때의 기본 공격 (씬/시스템 공통 기본값) */
export const DEFAULT_BASIC_SKILL = Object.freeze({
  id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30
});

/** 궁극기 판정에서 제외되는 스킬 id */
const BASIC_SKILL_ID = 'basic';

/** 전체 공격은 대상당 피해가 줄어든다 (BattleScene._executeAttack 원 규칙) */
export const AOE_DAMAGE_MULTIPLIER = 0.7;

/** 스킬에 gaugeGain이 없을 때의 기본 충전량 */
export const DEFAULT_GAUGE_GAIN = 30;

/**
 * 상성 계산이 성립하는 분위기 9종 (MoodSystem.MOOD_TYPES와 동일 집합).
 * 기본영웅은 `mood`가 null이라 유닛 생성 시 'neutral'이 되는데, MoodSystem은 이 값을
 * 모르는 분위기로 보고 예외를 던진다. 여기서 걸러 배율 1.0으로 내려보낸다.
 */
export const MATCHUP_MOODS = Object.freeze([
  'brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'
]);

/** 분위기가 없거나 알 수 없을 때의 표시값 */
export const NEUTRAL_MOOD = 'neutral';

/** 상성 없음 결과 (씬 표시 계약과 동일 형태) */
const NEUTRAL_MATCHUP = Object.freeze({ multiplier: 1.0, advantage: 'NEUTRAL' });

/**
 * 분위기 문자열을 정규화한다. 상성표에 없는 값은 전부 'neutral'로 모은다.
 * @param {string|null|undefined} mood
 * @returns {string} 상성 분위기 또는 'neutral'
 */
export function normalizeMood(mood) {
  const key = typeof mood === 'string' ? mood.toLowerCase() : '';
  return MATCHUP_MOODS.includes(key) ? key : NEUTRAL_MOOD;
}

/**
 * 두 유닛의 분위기로 상성을 계산할 수 있는지.
 * @param {string} attackerMood
 * @param {string} defenderMood
 * @returns {boolean}
 */
export function hasMoodMatchup(attackerMood, defenderMood) {
  return normalizeMood(attackerMood) !== NEUTRAL_MOOD && normalizeMood(defenderMood) !== NEUTRAL_MOOD;
}

/**
 * 분위기 상성 조회 — 상성이 성립하지 않으면 MoodSystem을 부르지 않고 1.0을 돌려준다.
 * MoodSystem은 모르는 분위기에 예외를 던지므로(BattleScene이 매 타격마다 경고를 찍던 원인)
 * 호출 전에 여기서 걸러 낸다. MoodSystem/BattleSystem은 건드리지 않는다.
 *
 * @param {string} attackerMood
 * @param {string} defenderMood
 * @param {(a:string,d:string)=>{multiplier:number,advantage:string}} lookup MoodSystem 조회 함수
 * @returns {{multiplier:number, advantage:string}}
 */
export function resolveMoodMatchup(attackerMood, defenderMood, lookup) {
  if (!hasMoodMatchup(attackerMood, defenderMood) || typeof lookup !== 'function') {
    return { ...NEUTRAL_MATCHUP };
  }
  try {
    return lookup(normalizeMood(attackerMood), normalizeMood(defenderMood)) || { ...NEUTRAL_MATCHUP };
  } catch {
    return { ...NEUTRAL_MATCHUP };
  }
}

/**
 * atk/def/spd를 `unit.stats`에 위임하는 접근자로 재정의한다.
 * BattleUnit 생성자가 자체 계산해 넣은 값은 버리고 씬이 계산한 스탯을 진실로 삼는다.
 * @param {object} unit
 */
function delegateStatsToScene(unit) {
  DELEGATED_STAT_KEYS.forEach(key => {
    Object.defineProperty(unit, key, {
      get() { return Number(this.stats?.[key]) || 0; },
      set(value) {
        if (!this.stats) this.stats = {};
        this.stats[key] = value;
      },
      enumerable: true,
      configurable: true
    });
  });
}

/**
 * 씬 배틀러 서술자 → BattleUnit (씬 표시 계약 유지)
 *
 * @param {object} descriptor
 * @param {object} [descriptor.source] 원본 캐릭터/적 데이터 (cult 해석·AI role 판정에 사용)
 * @param {string} [descriptor.id]
 * @param {string} [descriptor.name]
 * @param {{hp:number,atk:number,def:number,spd:number}} [descriptor.stats] 씬이 계산한 최종 스탯
 * @param {boolean} descriptor.isAlly
 * @param {number} [descriptor.position] 스프라이트 슬롯 인덱스
 * @param {Array<object>} [descriptor.skills]
 * @returns {BattleUnit} 씬 배틀러 겸 전투 유닛
 */
export function toBattleUnit(descriptor = {}) {
  const source = descriptor.source || {};
  const id = descriptor.id ?? source.id ?? source.characterId ?? 'unknown';
  const stats = { ...FALLBACK_STATS, ...(descriptor.stats || source.stats || {}) };
  const isAlly = descriptor.isAlly === true;
  const skills = (descriptor.skills && descriptor.skills.length > 0)
    ? descriptor.skills
    : (source.skills && source.skills.length > 0 ? source.skills : [{ ...DEFAULT_BASIC_SKILL }]);

  const characterData = {
    ...source,
    id,
    name: descriptor.name ?? source.name ?? id,
    mood: normalizeMood(descriptor.mood ?? source.mood),
    stats,
    skills
  };

  const level = descriptor.level ?? source.level ?? 1;
  const unit = new BattleUnit(characterData, level, !isAlly);

  // ── 씬이 계산한 스탯을 진실로 삼는다 (BattleUnit 자체 성장식은 여기서 쓰지 않는다) ──
  unit.stats = stats;
  delegateStatsToScene(unit);
  unit.maxHp = Math.max(1, Math.floor(stats.hp));
  unit.currentHp = unit.maxHp;

  // ── 씬 표시 계약 ──
  unit.isAlly = isAlly;
  unit.isEnemy = !isAlly;
  unit.position = descriptor.position ?? 0;
  unit.class = descriptor.class ?? source.class ?? 'warrior';
  unit.role = descriptor.role ?? source.role ?? null;
  unit.characterId = source.characterId ?? id;
  unit.level = level;
  unit.isBoss = !!(descriptor.isBoss ?? source.isBoss);
  unit.expReward = descriptor.expReward ?? source.expReward ?? 0;
  unit.goldReward = descriptor.goldReward ?? source.goldReward ?? 0;
  unit.skillGauge = 0;
  unit.maxSkillGauge = 100;
  unit.isAlive = true;

  // 사망 연출 1회 보장 플래그 (반사·도트·추가피해로도 죽으므로 스윕으로 감지한다)
  unit.deathShown = false;

  return unit;
}

/**
 * 씬 전용 전투 초기화.
 *
 * `BattleSystem.initBattle()`을 쓰지 않는 이유:
 *   1) SynergyCalculator를 다시 돌려 씬이 이미 적용한 SynergySystem 버프에 이중 가산된다.
 *   2) currentHp를 maxHp로 되돌려 웨이브/이어하기 상태를 덮어쓴다.
 * 필요한 것(교단 상태 초기화 + 턴 순서)만 골라 수행한다.
 *
 * @param {Array<BattleUnit>} allies
 * @param {Array<BattleUnit>} enemies
 * @param {object} [options]
 * @param {{atk:number,def:number,spd:number}} [options.synergyBuffs] 표시용 시너지 요약
 * @returns {BattleSystem}
 */
export function createSceneBattleSystem(allies, enemies, options = {}) {
  const battleSystem = new BattleSystem(allies, enemies);

  CultMechanicsSystem.onBattleStart([...allies, ...enemies]);

  battleSystem.synergyBuffs = { atk: 0, def: 0, spd: 0, ...(options.synergyBuffs || {}) };
  battleSystem.turnCount = 0;
  battleSystem.isFinished = false;
  battleSystem.result = null;
  battleSystem.battleLog = [];
  battleSystem.calculateTurnOrder();

  return battleSystem;
}

/**
 * 힐 스킬 판정 (씬·시스템 공통 규칙)
 * @param {object} skill
 * @returns {boolean}
 */
export function isHealSkill(skill) {
  if (!skill) return false;
  if (skill.isHeal) return true;
  if (skill.target === 'ally' || skill.target === 'all_allies') return true;
  const name = skill.name || '';
  return name.includes('힐') || name.includes('치유') || name.includes('회복');
}

/**
 * 스마트 타겟 선택 (기존 BattleScene.selectSmartTarget 이식 — 연출/체감용 휴리스틱).
 * BattleSystem.selectTarget(최소 HP)보다 풍부하지만 피해 판정에는 영향이 없다.
 *
 * @param {BattleUnit} attacker
 * @param {Array<BattleUnit>} targets 대상 후보
 * @param {(a:string,d:string)=>{advantage:string}} [getMoodMatchup] 분위기 상성 조회
 * @returns {BattleUnit|null}
 */
export function selectSmartTarget(attacker, targets, getMoodMatchup = null) {
  const alive = (targets || []).filter(t => t && t.isAlive);
  if (alive.length === 0) return null;
  if (alive.length === 1) return alive[0];

  const scored = alive.map(target => {
    let score = 0;

    const hpRatio = target.maxHp > 0 ? target.currentHp / target.maxHp : 1;
    score += (1 - hpRatio) * 30;

    if (getMoodMatchup) {
      const advantage = getMoodMatchup(attacker?.mood, target.mood)?.advantage;
      if (advantage === 'ADVANTAGE') score += 25;
      else if (advantage === 'DISADVANTAGE') score -= 15;
    }

    const role = target.role || target.class || '';
    if (role === 'healer') score += 20;
    else if (role === 'mage') score += 10;

    score += (target.atk || 0) / 20;

    const estimatedDamage = (attacker?.atk || 100) * 0.5;
    if (target.currentHp <= estimatedDamage) score += 40;

    return { target, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].target;
}

/**
 * 행동 결정 — BattleSystem.getAIAction()을 단일 진실로 쓰고,
 * 단일 대상 공격 스킬에 한해 연출용 스마트 타겟으로 대상만 바꾼다.
 *
 * @param {BattleSystem} battleSystem
 * @param {BattleUnit} unit
 * @param {object} [options]
 * @param {Function} [options.getMoodMatchup]
 * @returns {{skill:object, targets:Array<BattleUnit>, isUltimate:boolean}|null}
 */
export function decideSceneAction(battleSystem, unit, options = {}) {
  if (!battleSystem || !unit?.isAlive) return null;

  const action = battleSystem.getAIAction(unit);
  if (!action?.skill) return null;

  const targets = (action.targets || []).filter(t => t && t.isAlive);
  if (targets.length === 0) return null;

  if (targets.length === 1 && !isHealSkill(action.skill)) {
    const pool = unit.isEnemy ? battleSystem.getAliveAllies() : battleSystem.getAliveEnemies();
    const smart = selectSmartTarget(unit, pool, options.getMoodMatchup);
    if (smart) targets[0] = smart;
  }

  return {
    skill: action.skill,
    targets,
    isUltimate: action.skill.id !== BASIC_SKILL_ID
  };
}

/**
 * 행동의 실제 타격 대상과 대상당 배율을 펼친다.
 * 전체 공격(target: 'all')은 살아 있는 상대 진영 전원을 0.7배로 때린다.
 * 씬(연출 루프)과 시뮬레이터(턴수 검증)가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 *
 * @param {BattleSystem} battleSystem
 * @param {BattleUnit} unit 행동 유닛
 * @param {{skill:object, targets:Array<BattleUnit>, isUltimate:boolean}} action
 * @returns {{targets: Array<BattleUnit>, multiplier: number, isAoe: boolean}}
 */
export function expandActionTargets(battleSystem, unit, action) {
  const isAoe = !!action?.isUltimate && action?.skill?.target === 'all';
  const targets = isAoe
    ? (unit.isEnemy ? battleSystem.getAliveAllies() : battleSystem.getAliveEnemies())
    : [action.targets[0]].filter(Boolean);

  return {
    targets,
    multiplier: (action?.skill?.multiplier || 1) * (isAoe ? AOE_DAMAGE_MULTIPLIER : 1),
    isAoe
  };
}

/**
 * 행동 후 스킬 게이지 처리 — 궁극기는 비우고 기본 공격은 충전한다.
 * @param {BattleUnit} unit
 * @param {{skill:object, isUltimate:boolean}} action
 * @returns {number} 처리 후 게이지
 */
export function applyGaugeAfterAction(unit, action) {
  if (!unit) return 0;
  if (action?.isUltimate) {
    unit.skillGauge = 0;
  } else {
    unit.chargeSkill(action?.skill?.gaugeGain || DEFAULT_GAUGE_GAIN);
  }
  return unit.skillGauge;
}

/**
 * 데미지 결과의 분위기 보너스(%)를 씬 표시용 상성 라벨로 바꾼다.
 * BattleSystem.getMoodBonus가 단일 진실이므로 표시 라벨도 여기서 파생시킨다.
 * @param {number} moodBonusPercent
 * @returns {'ADVANTAGE'|'DISADVANTAGE'|'NEUTRAL'}
 */
export function describeMoodAdvantage(moodBonusPercent) {
  const bonus = Number(moodBonusPercent) || 0;
  if (bonus > 0) return 'ADVANTAGE';
  if (bonus < 0) return 'DISADVANTAGE';
  return 'NEUTRAL';
}

/**
 * 아직 사망 연출을 재생하지 않은 죽은 유닛을 모아 플래그를 세운다.
 * 반사·도트·추가 피해로 죽는 경로가 여러 개라 호출부에서 개별 처리하지 않고 스윕한다.
 *
 * @param {Array<BattleUnit>} units
 * @returns {Array<BattleUnit>} 이번에 새로 죽은 유닛
 */
export function collectNewDeaths(units) {
  const fresh = [];
  (units || []).forEach(unit => {
    if (!unit || unit.isAlive || unit.deathShown) return;
    unit.deathShown = true;
    fresh.push(unit);
  });
  return fresh;
}

/**
 * 교단 효과 서술자에서 화면 갱신이 필요한 유닛을 뽑는다 (중복 제거).
 * @param {Array<object>} effects
 * @returns {Array<BattleUnit>}
 */
export function affectedUnitsOf(effects) {
  const seen = new Set();
  const units = [];
  (effects || []).forEach(effect => {
    const unit = effect?.target;
    if (!unit || seen.has(unit)) return;
    seen.add(unit);
    units.push(unit);
  });
  return units;
}

/**
 * 교단 효과 라벨의 한국어 표기.
 * BattleSystem은 효과 서술자의 내부 토큰(`lightning_strike`)을 그대로 로그에 넣는다.
 * 판정 코드를 건드리지 않고 화면에 올릴 때만 사람이 읽는 이름으로 바꾼다.
 */
export const CULT_EFFECT_LABELS = Object.freeze({
  lightning_strike: '뇌격 심판',
  death_sentence: '사형 선고'
});

/**
 * 전투 로그 한 줄의 내부 토큰을 한국어 표기로 치환한다.
 * @param {string} message
 * @returns {string}
 */
export function localizeBattleMessage(message) {
  if (typeof message !== 'string') return '';
  return Object.entries(CULT_EFFECT_LABELS).reduce(
    (text, [token, label]) => text.split(token).join(label),
    message
  );
}

/**
 * BattleSystem 내부 로그에서 아직 씬에 옮기지 않은 줄을 가져온다.
 * 교단 효과(Lightning Strike / 반사 / 저주 / 사망)는 BattleSystem이 기록하므로
 * 씬은 이 배출구를 통해서만 그 문구를 화면 로그 대역에 올린다.
 *
 * @param {BattleSystem} battleSystem
 * @param {number} [cursor] 마지막으로 옮긴 인덱스
 * @returns {{messages: string[], cursor: number}}
 */
export function drainBattleLog(battleSystem, cursor = 0) {
  const log = battleSystem?.battleLog || [];
  const from = Math.max(0, Math.min(cursor, log.length));
  return {
    messages: log.slice(from)
      .map(entry => localizeBattleMessage(entry?.message))
      .filter(Boolean),
    cursor: log.length
  };
}
