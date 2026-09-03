/**
 * BattleSceneAdapter 테스트
 *
 * 검증 목표: BattleScene의 전투 판정이 BattleSystem 단일 경로를 통과하는지.
 * 어댑터는 순수 함수라 Phaser 없이 그대로 돌린다.
 */
import { describe, it, expect } from 'vitest';
import {
  toBattleUnit,
  createSceneBattleSystem,
  selectSmartTarget,
  decideSceneAction,
  describeMoodAdvantage,
  collectNewDeaths,
  affectedUnitsOf,
  drainBattleLog,
  isHealSkill,
  resolveSkillName,
  withResolvedSkillName,
  looksLikeSkillId,
  UNNAMED_SKILL_LABEL,
  normalizeMood,
  hasMoodMatchup,
  resolveMoodMatchup,
  MATCHUP_MOODS,
  NEUTRAL_MOOD,
  FALLBACK_STATS
} from '../../src/systems/BattleSceneAdapter.js';
import { resolveMoodVfx, hasMoodPreset } from '../../src/systems/SkillAnimationManager.js';
import { MOOD_VFX } from '../../src/config/skillAnimationConfig.js';
import { grantBarrier, CULT_MECHANICS_CONFIG } from '../../src/systems/CultMechanicsSystem.js';

const BASIC = { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeGain: 25 };
const SKILL1 = { id: 'skill1', name: '강타', multiplier: 2.0, gaugeCost: 100, target: 'single' };

/** 테스트용 배틀러 서술자 */
function ally(overrides = {}) {
  return toBattleUnit({
    id: overrides.id || 'ally_1',
    name: overrides.name || '아군',
    isAlly: true,
    position: overrides.position ?? 0,
    mood: overrides.mood || 'neutral',
    stats: { hp: 1000, atk: 200, def: 50, spd: 100, ...(overrides.stats || {}) },
    skills: overrides.skills || [BASIC, SKILL1],
    source: overrides.source || { id: overrides.id || 'ally_1' }
  });
}

function enemy(overrides = {}) {
  return toBattleUnit({
    id: overrides.id || 'enemy_1',
    name: overrides.name || '적',
    isAlly: false,
    position: overrides.position ?? 0,
    mood: overrides.mood || 'neutral',
    stats: { hp: 800, atk: 80, def: 40, spd: 60, ...(overrides.stats || {}) },
    skills: overrides.skills || [BASIC],
    source: overrides.source || { id: overrides.id || 'enemy_1' }
  });
}

describe('BattleSceneAdapter — 배틀러 → 전투 유닛 변환', () => {
  it('씬이 계산한 stats를 그대로 진실로 삼는다 (BattleUnit 성장식으로 덮어쓰지 않음)', () => {
    const unit = ally({ stats: { hp: 1234, atk: 321, def: 55, spd: 77 } });

    expect(unit.maxHp).toBe(1234);
    expect(unit.currentHp).toBe(1234);
    expect(unit.atk).toBe(321);
    expect(unit.def).toBe(55);
    expect(unit.spd).toBe(77);
  });

  it('atk/def/spd는 stats에 위임된다 — 시너지가 stats 객체를 통째로 교체해도 추종한다', () => {
    const unit = ally();

    // SynergySystem.applySynergiesToStats()가 새 객체를 돌려주는 상황 재현
    unit.stats = { hp: 1000, atk: 260, def: 65, spd: 110, bonuses: {} };

    expect(unit.atk).toBe(260);
    expect(unit.def).toBe(65);
    expect(unit.spd).toBe(110);

    // 역방향: 시스템이 평면 스탯에 쓰면 stats에도 반영된다
    unit.atk = 300;
    expect(unit.stats.atk).toBe(300);
  });

  it('씬 표시 계약(isAlly/position)과 BattleSystem 계약(isEnemy/메서드)을 동시에 만족한다', () => {
    const a = ally({ position: 2 });
    const e = enemy({ position: 1 });

    expect(a.isAlly).toBe(true);
    expect(a.isEnemy).toBe(false);
    expect(a.position).toBe(2);
    expect(typeof a.takeDamage).toBe('function');
    expect(typeof a.getHpPercent).toBe('function');
    expect(a.getHpPercent()).toBe(1);

    expect(e.isAlly).toBe(false);
    expect(e.isEnemy).toBe(true);
    expect(e.position).toBe(1);
  });

  it('교단 소속(cult)을 보존하고 교단 런타임 상태를 생성한다', () => {
    const unit = ally({ id: 'asc_iris_olympus', source: { id: 'asc_iris_olympus', cultId: 'olympus' } });

    expect(unit.cult).toBe('olympus');
    expect(unit.cultState).toBeTruthy();
    expect(unit.cultState.divinity).toBe(0);
    expect(unit.cultState.doom).toBe(0);
    expect(unit.cultState.barrier).toBe(0);
    expect(Array.isArray(unit.cultState.statuses)).toBe(true);
  });

  it('스탯이 없으면 폴백 스탯으로 유닛을 만든다 (전투 진입 실패 방지)', () => {
    const unit = toBattleUnit({ id: 'x', isAlly: true, source: { id: 'x' } });

    expect(unit.maxHp).toBe(FALLBACK_STATS.hp);
    expect(unit.atk).toBe(FALLBACK_STATS.atk);
    expect(unit.skills.length).toBeGreaterThan(0);
  });
});

describe('BattleSceneAdapter — 스킬 표시명 해석 (키값 노출 방지)', () => {
  it('식별자꼴 문자열을 가려낸다', () => {
    expect(looksLikeSkillId('skill_talon_strike')).toBe(true);
    expect(looksLikeSkillId('slash_01')).toBe(true);
    expect(looksLikeSkillId('발톱 가르기')).toBe(false);
    expect(looksLikeSkillId('Basic Attack')).toBe(false);
    expect(looksLikeSkillId(null)).toBe(false);
  });

  it('id만 주어져도 skills.json에서 한국어 이름을 찾는다 (적 스킬 경로)', () => {
    expect(resolveSkillName(null, 'skill_talon_strike')).toBe('발톱 가르기');
    expect(resolveSkillName(null, 'skill_allfather_wrath')).toBe('만물의 아버지의 분노');
  });

  it('name 자리에 id가 들어와 있으면 무시하고 다시 해석한다', () => {
    const leaked = { id: 'skill_talon_strike', name: 'skill_talon_strike', multiplier: 1.3 };
    expect(resolveSkillName(null, leaked)).toBe('발톱 가르기');
  });

  it('스킬 객체가 제대로 된 이름을 가지면 그대로 쓴다 (아군 인라인 스킬)', () => {
    expect(resolveSkillName(null, { id: 'skill1', name: '뇌신의 일격' })).toBe('뇌신의 일격');
  });

  it('유닛의 스킬 목록에서도 이름을 찾는다', () => {
    const unit = ally({ skills: [BASIC, { id: 'skill1', name: '강타', multiplier: 2 }] });
    expect(resolveSkillName(unit, 'skill1')).toBe('강타');
  });

  it('어디서도 못 찾으면 키값 대신 일반 표시명으로 내려간다', () => {
    expect(resolveSkillName(null, 'skill_does_not_exist')).toBe(UNNAMED_SKILL_LABEL);
    expect(UNNAMED_SKILL_LABEL).not.toMatch(/_/);
  });

  it('withResolvedSkillName은 원본을 건드리지 않고 이름만 채운다', () => {
    const raw = { id: 'skill_screech', name: 'skill_screech', multiplier: 1.1 };
    const fixed = withResolvedSkillName(null, raw);

    expect(fixed.name).toBe('째지는 울음');
    expect(fixed.multiplier).toBe(1.1);
    expect(raw.name).toBe('skill_screech');
  });
});

describe('BattleSceneAdapter — 분위기 정규화 (mood=null 유닛 방어)', () => {
  it('상성표에 없는 분위기는 전부 neutral로 모은다', () => {
    expect(normalizeMood('brave')).toBe('brave');
    expect(normalizeMood('BRAVE')).toBe('brave');
    expect(normalizeMood(null)).toBe(NEUTRAL_MOOD);
    expect(normalizeMood(undefined)).toBe(NEUTRAL_MOOD);
    expect(normalizeMood('neutral')).toBe(NEUTRAL_MOOD);
    expect(normalizeMood('made_up')).toBe(NEUTRAL_MOOD);
  });

  it('mood가 없는 배틀러도 neutral로 정규화되어 유닛이 만들어진다 (기본영웅 경로)', () => {
    const unit = toBattleUnit({ id: 'base_iris', isAlly: true, mood: null, source: { id: 'base_iris', mood: null } });
    expect(unit.mood).toBe(NEUTRAL_MOOD);
  });

  it('한쪽이라도 neutral이면 상성이 성립하지 않는다', () => {
    expect(hasMoodMatchup('brave', 'wild')).toBe(true);
    expect(hasMoodMatchup(NEUTRAL_MOOD, 'wild')).toBe(false);
    expect(hasMoodMatchup('brave', null)).toBe(false);
  });

  it('상성이 없으면 MoodSystem을 호출하지 않고 배율 1.0을 돌려준다', () => {
    let calls = 0;
    const lookup = () => { calls += 1; return { multiplier: 1.2, advantage: 'ADVANTAGE' }; };

    expect(resolveMoodMatchup(NEUTRAL_MOOD, 'wild', lookup)).toEqual({ multiplier: 1.0, advantage: 'NEUTRAL' });
    expect(calls).toBe(0);

    expect(resolveMoodMatchup('brave', 'wild', lookup)).toEqual({ multiplier: 1.2, advantage: 'ADVANTAGE' });
    expect(calls).toBe(1);
  });

  it('MoodSystem이 예외를 던져도 상성 계산은 1.0으로 내려간다', () => {
    const throwing = () => { throw new Error('알 수 없는 공격자 분위기'); };
    expect(resolveMoodMatchup('brave', 'wild', throwing)).toEqual({ multiplier: 1.0, advantage: 'NEUTRAL' });
  });

  it('neutral 분위기도 VFX 프리셋을 얻는다 (windup의 trail 참조가 터지지 않도록)', () => {
    expect(MOOD_VFX[NEUTRAL_MOOD]).toBeUndefined();

    const vfx = resolveMoodVfx(NEUTRAL_MOOD);
    expect(vfx).toBeTruthy();
    expect(vfx.trail).toBe(false);
    expect(typeof vfx.color).toBe('number');

    expect(resolveMoodVfx('brave')).toBe(MOOD_VFX.brave);
  });

  it('전용 연출 자산 유무 판정이 상성 분위기 집합과 일치한다', () => {
    // 프리셋 있음 → 분위기 파티클·상성 이펙트 실행, 없음 → 건너뜀 (ParticleManager 경고 방지)
    MATCHUP_MOODS.forEach(mood => expect(hasMoodPreset(mood)).toBe(true));

    expect(hasMoodPreset(NEUTRAL_MOOD)).toBe(false);
    expect(hasMoodPreset(null)).toBe(false);
    expect(hasMoodPreset(undefined)).toBe(false);
  });
});

describe('BattleSceneAdapter — 씬 전용 전투 초기화', () => {
  it('시너지를 다시 적용하지 않는다 (씬이 이미 적용한 값에 이중 가산 금지)', () => {
    // 같은 클래스 4명 = BattleSystem.SynergyCalculator라면 ATK +20% 가산되는 구성
    const allies = [0, 1, 2, 3].map(i => ally({ id: `a${i}`, position: i }));
    const before = allies.map(a => a.atk);

    createSceneBattleSystem(allies, [enemy()]);

    expect(allies.map(a => a.atk)).toEqual(before);
  });

  it('현재 HP를 초기화하지 않고 턴 순서를 SPD 내림차순으로 만든다', () => {
    const fast = ally({ id: 'fast', stats: { spd: 200 } });
    const slow = enemy({ id: 'slow', stats: { spd: 10 } });
    fast.currentHp = 500;

    const battleSystem = createSceneBattleSystem([fast], [slow]);

    expect(fast.currentHp).toBe(500);
    expect(battleSystem.turnOrder[0]).toBe(fast);
    expect(battleSystem.turnOrder[1]).toBe(slow);
  });
});

describe('BattleSceneAdapter — 피해 경로가 BattleSystem.resolveDamage를 지난다', () => {
  it('resolveDamage가 실제 HP를 깎고 데미지 계약을 돌려준다', () => {
    const a = ally();
    const e = enemy();
    const battleSystem = createSceneBattleSystem([a], [e]);

    const { damage, damageResult } = battleSystem.resolveDamage(a, e, BASIC);

    expect(damage.finalDamage).toBeGreaterThan(0);
    expect(damageResult.actualDamage).toBeGreaterThan(0);
    expect(e.currentHp).toBe(e.maxHp - damageResult.actualDamage);
    expect(typeof damage.isCrit).toBe('boolean');
    expect(typeof damage.moodBonus).toBe('number');
  });

  it('올림푸스 공격자는 적중마다 Divine Charge 게이지가 쌓인다', () => {
    const a = ally({ id: 'asc_iris_olympus', source: { id: 'asc_iris_olympus', cultId: 'olympus' } });
    const e = enemy({ stats: { hp: 999999 } });
    const battleSystem = createSceneBattleSystem([a], [e]);

    battleSystem.resolveDamage(a, e, BASIC);
    expect(a.cultState.divinity).toBe(CULT_MECHANICS_CONFIG.olympus.DIVINITY_GAIN_BASIC);

    battleSystem.resolveDamage(a, e, SKILL1);
    expect(a.cultState.divinity).toBe(
      CULT_MECHANICS_CONFIG.olympus.DIVINITY_GAIN_BASIC + CULT_MECHANICS_CONFIG.olympus.DIVINITY_GAIN_SKILL
    );
  });

  it('Divine Charge 만충 시 Lightning Strike 추가 피해가 적용되고 게이지가 비워진다', () => {
    const a = ally({ id: 'asc_iris_olympus', source: { id: 'asc_iris_olympus', cultId: 'olympus' } });
    const e = enemy({ stats: { hp: 999999 } });
    const battleSystem = createSceneBattleSystem([a], [e]);

    const cfg = CULT_MECHANICS_CONFIG.olympus;
    const hitsToFull = Math.ceil(cfg.DIVINITY_MAX / cfg.DIVINITY_GAIN_BASIC);

    let lightning = null;
    for (let i = 0; i < hitsToFull; i += 1) {
      const { cultEffects } = battleSystem.resolveDamage(a, e, BASIC);
      const found = cultEffects.find(fx => fx.label === 'lightning_strike');
      if (found) lightning = found;
    }

    expect(lightning).toBeTruthy();
    expect(lightning.applied).toBeGreaterThan(0);
    expect(a.cultState.divinity).toBe(0);
    expect(battleSystem.getLog().some(entry => entry.message.includes('lightning_strike'))).toBe(true);
  });

  it('요미 공격자는 적중마다 Doom을 적층한다', () => {
    const a = ally({ id: 'yomi_hero', source: { id: 'yomi_hero', cultId: 'yomi' } });
    const e = enemy({ stats: { hp: 999999 } });
    const battleSystem = createSceneBattleSystem([a], [e]);

    battleSystem.resolveDamage(a, e, BASIC);
    battleSystem.resolveDamage(a, e, BASIC);
    battleSystem.resolveDamage(a, e, BASIC);

    expect(e.cultState.doom).toBe(3 * CULT_MECHANICS_CONFIG.yomi.DOOM_PER_HIT);
  });

  it('아발론 방어막(Holy Ward)이 피해를 흡수한다', () => {
    const a = ally();
    const e = enemy({ stats: { hp: 999999, def: 0 } });
    const battleSystem = createSceneBattleSystem([a], [e]);

    grantBarrier(e, 100000);
    const hpBefore = e.currentHp;

    const { damageResult } = battleSystem.resolveDamage(a, e, BASIC);

    expect(damageResult.absorbed).toBeGreaterThan(0);
    expect(damageResult.actualDamage).toBe(0);
    expect(e.currentHp).toBe(hpBefore);
    expect(e.cultState.barrier).toBeLessThan(100000);
  });

  it('치명타로 유닛이 죽으면 unitDeath 이벤트가 발행된다', () => {
    const a = ally({ stats: { atk: 100000 } });
    const e = enemy({ stats: { hp: 10 } });
    const battleSystem = createSceneBattleSystem([a], [e]);

    const deaths = [];
    battleSystem.on('unitDeath', data => deaths.push(data));

    battleSystem.resolveDamage(a, e, BASIC);

    expect(e.isAlive).toBe(false);
    expect(deaths).toHaveLength(1);
    expect(deaths[0].unit).toBe(e.id);
  });
});

describe('BattleSceneAdapter — 행동 결정 / 표시 파생', () => {
  it('게이지가 부족하면 기본 공격, 충분하면 스킬1을 고른다', () => {
    const a = ally();
    const e = enemy();
    const battleSystem = createSceneBattleSystem([a], [e]);

    expect(decideSceneAction(battleSystem, a).skill.id).toBe('basic');
    expect(decideSceneAction(battleSystem, a).isUltimate).toBe(false);

    a.skillGauge = 100;
    const ultimate = decideSceneAction(battleSystem, a);
    expect(ultimate.skill.id).toBe('skill1');
    expect(ultimate.isUltimate).toBe(true);
    expect(ultimate.targets).toEqual([e]);
  });

  it('죽은 유닛이나 대상 없는 상황에서는 행동을 만들지 않는다', () => {
    const a = ally();
    const e = enemy();
    const battleSystem = createSceneBattleSystem([a], [e]);

    e.isAlive = false;
    expect(decideSceneAction(battleSystem, a)).toBeNull();

    a.isAlive = false;
    expect(decideSceneAction(battleSystem, a)).toBeNull();
  });

  it('스마트 타겟은 HP가 낮고 처치 가능한 대상을 우선한다', () => {
    const attacker = ally({ stats: { atk: 400 } });
    const healthy = enemy({ id: 'healthy', stats: { hp: 1000 } });
    const wounded = enemy({ id: 'wounded', stats: { hp: 1000 } });
    wounded.currentHp = 50;

    expect(selectSmartTarget(attacker, [healthy, wounded])).toBe(wounded);
    expect(selectSmartTarget(attacker, [])).toBeNull();
  });

  it('분위기 보너스를 표시용 상성 라벨로 파생한다', () => {
    expect(describeMoodAdvantage(20)).toBe('ADVANTAGE');
    expect(describeMoodAdvantage(-20)).toBe('DISADVANTAGE');
    expect(describeMoodAdvantage(0)).toBe('NEUTRAL');
    expect(describeMoodAdvantage(undefined)).toBe('NEUTRAL');
  });

  it('힐 스킬을 이름/타깃/플래그 어느 쪽으로도 판정한다', () => {
    expect(isHealSkill({ id: 'skill1', isHeal: true })).toBe(true);
    expect(isHealSkill({ id: 'skill1', target: 'all_allies' })).toBe(true);
    expect(isHealSkill({ id: 'skill1', name: '치유의 빛' })).toBe(true);
    expect(isHealSkill({ id: 'skill1', name: '강타', target: 'single' })).toBe(false);
    expect(isHealSkill(null)).toBe(false);
  });
});

describe('BattleSceneAdapter — 연출 동기화 도우미', () => {
  it('사망 연출은 유닛당 한 번만 수집된다', () => {
    const a = ally();
    const e = enemy();
    e.isAlive = false;

    expect(collectNewDeaths([a, e])).toEqual([e]);
    expect(collectNewDeaths([a, e])).toEqual([]);
  });

  it('교단 효과에서 갱신 대상 유닛을 중복 없이 추린다', () => {
    const e = enemy();
    const effects = [
      { kind: 'doom', target: e },
      { kind: 'extraDamage', target: e },
      { kind: 'status', target: null }
    ];

    expect(affectedUnitsOf(effects)).toEqual([e]);
    expect(affectedUnitsOf(null)).toEqual([]);
  });

  it('교단 효과 내부 토큰을 한국어 표기로 치환해 배출한다', () => {
    const battleSystem = createSceneBattleSystem([ally()], [enemy()]);
    battleSystem.log('아이리스의 lightning_strike! 골렘에게 43 추가 피해!');
    battleSystem.log('요미의 death_sentence!');

    const { messages } = drainBattleLog(battleSystem, 0);

    expect(messages[0]).toBe('아이리스의 뇌격 심판! 골렘에게 43 추가 피해!');
    expect(messages[1]).toBe('요미의 사형 선고!');
    // 판정 측 원본 로그는 그대로 둔다 (BattleSystem 계약 불변)
    expect(battleSystem.getLog()[0].message).toContain('lightning_strike');
  });

  it('BattleSystem 로그를 커서 기준으로 한 번씩만 배출한다', () => {
    const battleSystem = createSceneBattleSystem([ally()], [enemy()]);
    battleSystem.log('첫 줄');
    battleSystem.log('둘째 줄');

    const first = drainBattleLog(battleSystem, 0);
    expect(first.messages).toEqual(['첫 줄', '둘째 줄']);
    expect(first.cursor).toBe(2);

    battleSystem.log('셋째 줄');
    const second = drainBattleLog(battleSystem, first.cursor);
    expect(second.messages).toEqual(['셋째 줄']);
    expect(second.cursor).toBe(3);
  });
});
