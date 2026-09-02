/**
 * ReturningPlayerRules.test.js
 * T-Q5 / T-25 — 복귀 티어·보상·요약 4항목 판정. Phaser 렌더는 다루지 않는다.
 *
 * SSOT: docs/story/SYSTEM_ONBOARDING_ECONOMY.md §5-3 / docs/story/UX_ONBOARDING_FLOW.md §5-3
 */
import { describe, it, expect } from 'vitest';
import {
  getDaysAway,
  resolveReturningTier,
  getReturnGift,
  getLastClearedStageId,
  countAscendableHeroes,
  countUnclaimedQuests,
  buildReturnSummary,
  buildCardLines,
  formatGift,
} from '../../src/systems/ReturningPlayerRules.js';
import { OFFLINE_REWARD_CAP_HOURS } from '../../src/config/onboardingConfig.js';

const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);
const daysAgo = (n) => NOW - n * 24 * 60 * 60 * 1000;

function makeSave(overrides = {}) {
  return {
    lastOnline: daysAgo(10),
    resources: { gems: 1500, characterShards: {} },
    baseHeroes: [{ baseHeroId: 'base_iris', fragmentCount: 0, openedRoutes: [] }],
    ascendedHeroes: [],
    progress: { clearedStages: {} },
    story: { viewedCutscenes: [], skippedCutscenes: [] },
    quests: { daily: {}, weekly: {} },
    ...overrides,
  };
}

describe('복귀 티어 판정 (SYSTEM §5-3)', () => {
  it('3일 미만은 카드를 띄우지 않는다 — 오프라인 보상 팝업만 뜬다', () => {
    expect(resolveReturningTier(getDaysAway(daysAgo(2), NOW))).toBeNull();
    expect(getReturnGift(2)).toBeNull();
    expect(buildReturnSummary(makeSave({ lastOnline: daysAgo(2) }), { now: NOW }).visible).toBe(false);
  });

  it('3~30일은 7d, 30일 이상은 30d 다', () => {
    expect(resolveReturningTier(3)).toBe('7d');
    expect(resolveReturningTier(29)).toBe('7d');
    expect(resolveReturningTier(30)).toBe('30d');
    expect(resolveReturningTier(365)).toBe('30d');
  });

  it('보상은 티어가 아니라 3/7/30일 3구간으로 갈린다', () => {
    // 7d 티어 안에서도 7일을 넘으면 에너지 만충이 붙는다(SYSTEM §5-3 표)
    expect(getReturnGift(4)).toMatchObject({ gems: 100, summonTickets: 1, energyFull: false });
    expect(getReturnGift(10)).toMatchObject({ gems: 300, summonTickets: 3, energyFull: true });
    expect(getReturnGift(40)).toMatchObject({ gems: 600, summonTickets: 10, spiritStones: 6 });
    // 30일+ 는 돌아오자마자 10연이 가능해야 한다
    expect(getReturnGift(40).summonTickets).toBeGreaterThanOrEqual(10);
  });

  it('이탈 기간의 기준은 lastLogoutTime 이다 — lastOnline 은 저장할 때마다 갱신된다', () => {
    // SaveManager.save() 가 매 저장마다 lastOnline 을 now 로 덮어쓰므로
    // lastOnline 으로 판정하면 복귀 카드가 영원히 뜨지 않는다.
    const save = makeSave({ lastOnline: NOW, lastLogoutTime: daysAgo(23) });
    const summary = buildReturnSummary(save, { now: NOW });
    expect(summary.daysAway).toBe(23);
    expect(summary.tier).toBe('7d');
  });

  it('미래 시각이나 결측 시각은 0일로 처리한다', () => {
    expect(getDaysAway(NOW + 100000, NOW)).toBe(0);
    expect(getDaysAway(null, NOW)).toBe(0);
    expect(getDaysAway(undefined, NOW)).toBe(0);
  });

  it('30일+ 에만 시스템 리마인더 3줄이 붙는다', () => {
    expect(buildReturnSummary(makeSave({ lastOnline: daysAgo(40) }), { now: NOW }).reminders).toHaveLength(3);
    expect(buildReturnSummary(makeSave({ lastOnline: daysAgo(10) }), { now: NOW }).reminders).toHaveLength(0);
  });
});

describe('요약 4항목', () => {
  it('마지막 클리어와 다음 목표를 뽑는다 (챕터 경계 포함)', () => {
    expect(getLastClearedStageId({ '1-1': 3, '1-3': 2, '1-2': 1 })).toBe('1-3');
    expect(getLastClearedStageId({ '2-1': 1, '10-2': 1 })).toBe('10-2');
    expect(getLastClearedStageId({})).toBeNull();

    const summary = buildReturnSummary(
      makeSave({ progress: { clearedStages: { '1-5': 3 } } }),
      { now: NOW, stageName: (id) => ({ '1-5': '숲의 지배자', '2-1': '무너진 성문' }[id] || null) }
    );
    expect(summary.lastCleared.stageId).toBe('1-5');
    expect(summary.lastCleared.nextStageId).toBe('2-1');
    expect(summary.lastCleared.nextStageName).toBe('무너진 성문');
  });

  it('각인 가능 영웅은 조각과 정령석을 동시에 만족해야 센다', () => {
    const enough = makeSave({
      resources: { gems: 1500, characterShards: { base_iris: 30 } },
    });
    expect(countAscendableHeroes(enough)).toBe(1);

    // 조각은 충분한데 정령석(젬)이 모자란 경우
    const noGems = makeSave({ resources: { gems: 1, characterShards: { base_iris: 30 } } });
    expect(countAscendableHeroes(noGems)).toBe(0);

    // 조각 부족
    expect(countAscendableHeroes(makeSave({ resources: { gems: 1500, characterShards: { base_iris: 29 } } }))).toBe(0);
  });

  it('미수령 퀘스트는 완료했지만 안 받은 것만 센다', () => {
    const save = makeSave({
      quests: {
        daily: { a: { completed: true, claimed: false }, b: { completed: true, claimed: true }, c: { completed: false, claimed: false } },
        weekly: { w: { completed: true, claimed: false } },
      },
    });
    expect(countUnclaimedQuests(save)).toBe(2);
  });

  it('놓친 이야기가 없으면 그 줄 자체를 만들지 않는다', () => {
    const none = buildReturnSummary(makeSave(), { now: NOW });
    expect(buildCardLines(none).some((l) => l.key === 'story')).toBe(false);

    const missed = buildReturnSummary(
      makeSave({ story: { viewedCutscenes: ['a', 'b'], skippedCutscenes: ['a', 'b'] } }),
      { now: NOW }
    );
    const storyLine = buildCardLines(missed).find((l) => l.key === 'story');
    expect(storyLine.value).toBe('놓친 이야기 2편');
    expect(storyLine.ctaKey).toBe('collection');
  });

  it('오프라인 상한은 ISS-01 확정값을 그대로 싣는다', () => {
    const summary = buildReturnSummary(makeSave(), { now: NOW });
    expect(summary.offlineCapHours).toBe(OFFLINE_REWARD_CAP_HOURS);
  });
});

describe('보상 표시 문자열', () => {
  it('0인 항목은 표기하지 않고 에너지 만충은 뒤에 붙인다', () => {
    expect(formatGift(getReturnGift(4))).toBe('💎100  💰3,000  🎫1');
    expect(formatGift(getReturnGift(10))).toContain('⚡만충');
    expect(formatGift(null)).toBe('');
  });
});
