/**
 * StageWallRules.test.js
 * T-Q3 — 1-4 벽 경고 판정과 보스 재도전 규칙. Phaser 렌더는 다루지 않는다.
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §2-5 / docs/story/LEVEL_STORY_PLACEMENT.md §2-3, §4-3
 */
import { describe, it, expect } from 'vitest';
import {
  shouldShowWallWarning,
  buildWallWarning,
  getDifficultyBand,
  getPowerRatio,
  isBossStage,
  getRetryPolicy,
  getDefeatEnergyRefund,
  getRepeatFailStep,
  buildDefeatGuidance,
  BOSS_RETRY_POLICY,
} from '../../src/systems/StageWallRules.js';

describe('1-4 벽 경고 판정', () => {
  it('1인 파티(430) 대 1-4 권장(500) 은 경고 대상이다', () => {
    // 시스템 D-03 이 확정한 의도된 벽: 0.86×
    expect(shouldShowWallWarning(430, 500)).toBe(true);
    expect(getPowerRatio(430, 500)).toBeCloseTo(0.86, 2);
  });

  it('10연 이후 파티(1389) 는 경고하지 않는다', () => {
    // 정상 온보딩 경로에서는 2.78× 로 진입하므로 벽에 부딪히지 않는다
    expect(shouldShowWallWarning(1389, 500)).toBe(false);
    expect(getDifficultyBand(getPowerRatio(1389, 500)).key).toBe('easy');
  });

  it('권장 전투력을 모르면 경고하지 않는다 — 근거 없는 겁주기를 만들지 않는다', () => {
    expect(shouldShowWallWarning(430, 0)).toBe(false);
    expect(shouldShowWallWarning(430, undefined)).toBe(false);
    expect(shouldShowWallWarning(430, NaN)).toBe(false);
  });

  it('빈 편성(전투력 0)은 판정 불가가 아니라 경고 대상이다', () => {
    expect(shouldShowWallWarning(0, 500)).toBe(true);
    expect(buildWallWarning(0, 500).text).toContain('0.00×');
  });

  it('경고 배너는 비율·난이도 라벨을 함께 노출한다 (시스템 B-4 표시 의무)', () => {
    const warning = buildWallWarning(430, 500);
    expect(warning.visible).toBe(true);
    expect(warning.text).toContain('430');
    expect(warning.text).toContain('500');
    expect(warning.text).toContain('어려움');
    expect(warning.text).toContain('0.86×');
  });

  it('각인 가능한 영웅이 있으면 각인으로, 없으면 소환으로 보낸다', () => {
    expect(buildWallWarning(430, 500, { ascendableCount: 2 }).ctaKey).toBe('ascension');
    expect(buildWallWarning(430, 500, { ascendableCount: 0 }).ctaKey).toBe('gacha');
    // 경고가 없으면 CTA 도 없다 — 멀쩡한 편성에 강화를 권하지 않는다
    expect(buildWallWarning(1389, 500, { ascendableCount: 2 }).ctaKey).toBe('');
  });
});

describe('보스 재도전 규칙 (LEVEL §4-3 / LV-01)', () => {
  it('X-5 는 isBoss 없이도 보스로 판정한다', () => {
    expect(isBossStage({ id: '1-5' })).toBe(true);
    expect(isBossStage({ id: '1-4' })).toBe(false);
    // 명시적 isBoss 가 규칙보다 우선한다
    expect(isBossStage({ id: '1-4', isBoss: true })).toBe(true);
  });

  it('보스 패배는 에너지 50% 를 환급하고 일반 스테이지는 환급하지 않는다', () => {
    expect(getDefeatEnergyRefund({ id: '1-5' }, 20)).toBe(10);
    expect(getDefeatEnergyRefund({ id: '1-4' }, 6)).toBe(0);
    expect(BOSS_RETRY_POLICY.energyRefundOnDefeat).toBe(0.5);
  });

  it('stages.json 의 retryPolicy 가 기본 정책보다 우선한다', () => {
    const stage = { id: '2-5', retryPolicy: { energyRefundOnDefeat: 0.25 } };
    expect(getRetryPolicy(stage).energyRefundOnDefeat).toBe(0.25);
    // 지정하지 않은 필드는 보스 기본값을 유지한다
    expect(getRetryPolicy(stage).replayCutsceneOnRetry).toBe(false);
  });

  it('R4: 재도전 시 boss_before 를 다시 재생하지 않는다', () => {
    expect(getRetryPolicy({ id: '1-5' }).replayCutsceneOnRetry).toBe(false);
  });
});

describe('반복 실패 유도 단계 (UX §2-5)', () => {
  it('3/5/7회 임계에서 유도 대상이 바뀐다', () => {
    expect(getRepeatFailStep(2)).toBeNull();
    expect(getRepeatFailStep(3).action).toBe('gacha');
    expect(getRepeatFailStep(5).action).toBe('autoparty');
    expect(getRepeatFailStep(9).action).toBe('idle');
  });

  it('첫 패배에도 보완 방법을 말한다 — T-05 로 가는 다리', () => {
    const g = buildDefeatGuidance({
      stage: { id: '1-4', recommendedPower: 500, energyCost: 6 },
      power: 430,
      failCount: 1,
      enemyHpRemainRatio: 0.38,
    });
    expect(g.hint).toBe('동료를 늘리면 넘을 수 있습니다');
    expect(g.repeatStep).toBeNull();
    expect(g.progressText).toBe('적 체력 38% 남음');
    expect(g.diagnosis).toContain('0.86×');
  });

  it('보스 패배 안내는 환급량을 함께 고지한다', () => {
    const g = buildDefeatGuidance({
      stage: { id: '2-5', recommendedPower: 2500, energyCost: 20 },
      power: 1819,
      failCount: 3,
      spentEnergy: 20,
    });
    expect(g.energyRefund).toBe(10);
    expect(g.retryWarning).toContain('환급 10');
    expect(g.repeatStep.action).toBe('gacha');
    expect(g.diagnosis).toContain('0.73×');
  });
});
