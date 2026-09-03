/**
 * MenuBadgeRules.test.js — 메뉴 알림 배지 규칙
 *
 * 배지의 신뢰가 이 규칙에 달려 있다. 켜졌는데 눌러 보면 아무것도 없으면
 * 유저는 그 다음부터 빨간 점을 무시한다. 그래서 "0이면 안 켜진다"를 규칙마다 고정한다.
 */
import { describe, it, expect } from 'vitest';
import {
  BADGE_TYPE,
  BADGE_COUNT_CAP,
  computeMenuBadges,
  formatBadgeCount,
  summarizeBadges,
  markMenuSeen,
  isDismissedByOpening
} from '../../src/systems/MenuBadgeRules.js';

/** 배지가 하나도 켜지지 않는 기준 세이브 */
const quietSave = () => ({
  gacha: { freeTenPullUsed: true },
  resources: { summonTickets: 0 },
  inventory: [],
  characters: [],
  onboarding: { lastSeen: {} }
});

describe('MenuBadgeRules — 켜지지 않아야 할 때', () => {
  it('아무 일도 없으면 배지가 하나도 없다', () => {
    expect(computeMenuBadges(quietSave(), {})).toEqual({});
  });

  it('수치가 0이면 배지를 켜지 않는다', () => {
    const badges = computeMenuBadges(quietSave(), {
      claimableQuests: 0,
      ascendableHeroes: 0,
      collectionBonuses: 0,
      raidRewards: 0,
      friendActions: 0,
      eventStages: 0,
      towerBossReady: false
    });
    expect(badges).toEqual({});
  });

  it('세이브가 없거나 망가져도 던지지 않는다', () => {
    expect(() => computeMenuBadges(null, {})).not.toThrow();
    expect(() => computeMenuBadges(undefined)).not.toThrow();
    // 무료 10연 기록이 없는 계정은 NEW 가 켜진다 (신규 계정의 정상 동작)
    expect(computeMenuBadges({}).gacha).toEqual({ type: BADGE_TYPE.NEW, count: 1 });
  });
});

describe('MenuBadgeRules — 메뉴별 규칙', () => {
  it('퀘스트는 수령 가능한 개수만큼 보상 배지를 켠다', () => {
    const badges = computeMenuBadges(quietSave(), { claimableQuests: 3 });
    expect(badges.quest).toEqual({ type: BADGE_TYPE.REWARD, count: 3 });
  });

  it('무료 10연을 안 썼으면 소환에 NEW 가 붙는다', () => {
    const save = quietSave();
    save.gacha.freeTenPullUsed = false;
    expect(computeMenuBadges(save).gacha).toEqual({ type: BADGE_TYPE.NEW, count: 1 });
  });

  it('무료 10연을 쓴 뒤에는 소환권 10장마다 보상 배지가 붙는다', () => {
    const save = quietSave();
    save.resources.summonTickets = 24;
    expect(computeMenuBadges(save).gacha).toEqual({ type: BADGE_TYPE.REWARD, count: 2 });

    save.resources.summonTickets = 9;   // 10장 미만이면 돌릴 수 없다
    expect(computeMenuBadges(save).gacha).toBeUndefined();
  });

  it('각인은 재료가 찬 영웅 수만큼 alert 다 (보상이 아니라 조작이다)', () => {
    const badges = computeMenuBadges(quietSave(), { ascendableHeroes: 2 });
    expect(badges.ascension).toEqual({ type: BADGE_TYPE.ALERT, count: 2 });
  });

  it('도감·레이드·친구는 받을 것이 있을 때 보상 배지다', () => {
    const badges = computeMenuBadges(quietSave(), {
      collectionBonuses: 1, raidRewards: 2, friendActions: 5
    });
    expect(badges.collection.type).toBe(BADGE_TYPE.REWARD);
    expect(badges.raid.count).toBe(2);
    expect(badges.friends.count).toBe(5);
  });

  it('무한탑은 도전 가능일 때만 alert 1개다', () => {
    expect(computeMenuBadges(quietSave(), { towerBossReady: true }).tower)
      .toEqual({ type: BADGE_TYPE.ALERT, count: 1 });
    expect(computeMenuBadges(quietSave(), { towerBossReady: false }).tower).toBeUndefined();
  });

  it('이벤트 던전은 미클리어 스테이지 수만큼 alert 다', () => {
    expect(computeMenuBadges(quietSave(), { eventStages: 4 }).eventdungeon)
      .toEqual({ type: BADGE_TYPE.ALERT, count: 4 });
  });
});

describe('MenuBadgeRules — NEW 판정', () => {
  it('마지막으로 연 뒤에 들어온 것만 NEW 로 센다', () => {
    const save = quietSave();
    save.onboarding.lastSeen = { inventory: 1000, herolist: 1000 };
    save.inventory = [{ id: 'a', acquiredAt: 900 }, { id: 'b', acquiredAt: 1500 }];
    save.characters = [{ id: 'h1', obtainedAt: 2000 }];

    const badges = computeMenuBadges(save);
    expect(badges.inventory).toEqual({ type: BADGE_TYPE.NEW, count: 1 });
    expect(badges.herolist).toEqual({ type: BADGE_TYPE.NEW, count: 1 });
  });

  it('타임스탬프가 없는 레거시 항목은 NEW 로 켜지 않는다', () => {
    const save = quietSave();
    save.inventory = [{ id: 'old' }, { id: 'older' }];
    save.characters = [{ id: 'h1' }];
    const badges = computeMenuBadges(save);
    expect(badges.inventory).toBeUndefined();
    expect(badges.herolist).toBeUndefined();
  });

  it('메뉴를 열면 lastSeen 이 갱신돼 NEW 가 꺼진다', () => {
    const save = quietSave();
    save.inventory = [{ id: 'a', acquiredAt: 5000 }];
    expect(computeMenuBadges(save).inventory).toEqual({ type: BADGE_TYPE.NEW, count: 1 });

    markMenuSeen(save, 'inventory', 6000);
    expect(save.onboarding.lastSeen.inventory).toBe(6000);
    expect(computeMenuBadges(save).inventory).toBeUndefined();
  });

  it('markMenuSeen 은 onboarding 구조가 없어도 만든다', () => {
    const save = {};
    markMenuSeen(save, 'quest', 42);
    expect(save.onboarding.lastSeen.quest).toBe(42);
    expect(markMenuSeen(null, 'quest')).toBeNull();
  });

  it('NEW 만 열기로 해제된다 — 보상·확인 배지는 실제로 처리해야 꺼진다', () => {
    expect(isDismissedByOpening(BADGE_TYPE.NEW)).toBe(true);
    expect(isDismissedByOpening(BADGE_TYPE.REWARD)).toBe(false);
    expect(isDismissedByOpening(BADGE_TYPE.ALERT)).toBe(false);
  });
});

describe('MenuBadgeRules — 표기와 요약', () => {
  it('1개는 점만 찍고, 상한을 넘으면 9+ 로 접는다', () => {
    expect(formatBadgeCount(0)).toBe('');
    expect(formatBadgeCount(1)).toBe('');
    expect(formatBadgeCount(3)).toBe('3');
    expect(formatBadgeCount(BADGE_COUNT_CAP)).toBe('9');
    expect(formatBadgeCount(BADGE_COUNT_CAP + 1)).toBe('9+');
    expect(formatBadgeCount(999)).toBe('9+');
  });

  it('상단바 종합 점은 배지가 하나라도 있을 때만 켜진다', () => {
    expect(summarizeBadges({})).toMatchObject({ total: 0, menus: 0, visible: false, hasReward: false });

    const badges = computeMenuBadges(quietSave(), { claimableQuests: 2, ascendableHeroes: 1 });
    const summary = summarizeBadges(badges);
    expect(summary.visible).toBe(true);
    expect(summary.menus).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.hasReward).toBe(true);
  });

  it('확인 배지만 있으면 보상 강조는 켜지 않는다', () => {
    const summary = summarizeBadges(computeMenuBadges(quietSave(), { ascendableHeroes: 1 }));
    expect(summary.visible).toBe(true);
    expect(summary.hasReward).toBe(false);
  });
});
