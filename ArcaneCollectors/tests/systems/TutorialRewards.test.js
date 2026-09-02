/**
 * TutorialRewards.test.js
 * 튜토리얼 스텝 보상 (SYSTEM_ONBOARDING_ECONOMY §5-1) — 지급액, 원자성, 중복 차단
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TutorialManager, COMPLETION_MODE } from '../../src/systems/TutorialManager.js';
import {
  grantTutorialReward,
  TUTORIAL_REWARD_AMOUNTS,
  TUTORIAL_REWARD_HANDLERS,
} from '../../src/systems/TutorialRewards.js';
import { SaveManager } from '../../src/systems/SaveManager.js';

function putSave(partial = {}) {
  const save = { ...SaveManager.getDefaultSave(), ...partial };
  localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(save));
  return save;
}

const loadSave = () => JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));

describe('TutorialRewards', () => {
  let mockLocalStorage;

  beforeEach(() => {
    mockLocalStorage = {
      data: {},
      getItem(key) { return this.data[key] ?? null; },
      setItem(key, value) { this.data[key] = value; },
      removeItem(key) { delete this.data[key]; },
      clear() { this.data = {}; },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    TutorialManager.rewardHandler = null;
    TutorialManager.detachEvents();
  });

  afterEach(() => {
    TutorialManager.detachEvents();
    TutorialManager.rewardHandler = null;
    vi.unstubAllGlobals();
  });

  it('주입이 없어도 기본 핸들러가 동작한다 (P1 회귀 방지)', () => {
    expect(TutorialManager.rewardHandler).toBeNull();
    expect(TutorialManager.getRewardHandler()).toBe(grantTutorialReward);
  });

  it('tutorial.json 의 모든 rewardId 에 지급 함수가 있다', () => {
    const rewardIds = TutorialManager.getSteps().map((s) => s.rewardId).filter(Boolean);
    expect(rewardIds.length).toBe(5);
    rewardIds.forEach((id) => {
      expect(TUTORIAL_REWARD_HANDLERS[id], id).toBeTypeOf('function');
    });
  });

  it('T-05 각성의 인도 — 오마르 조각 30을 같은 save 스냅샷에 기록한다', () => {
    putSave();
    ['T-01', 'T-02', 'T-03', 'T-04'].forEach((id) => TutorialManager.commitStep(id));

    const before = loadSave().resources.characterShards?.base_omar || 0;
    TutorialManager.commitStep('T-05');
    const after = loadSave();

    expect(after.resources.characterShards.base_omar).toBe(
      before + TUTORIAL_REWARD_AMOUNTS.awakeningGuideShards
    );
    // 원자성: 보상과 완료 플래그가 같은 저장에 함께 남는다
    expect(after.tutorial.completedSteps).toContain('T-05');
  });

  it('T-08 파티 보너스 골드 500', () => {
    putSave();
    ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07'].forEach((id) => TutorialManager.commitStep(id));

    const before = loadSave().resources.gold;
    TutorialManager.commitStep('T-08');

    expect(loadSave().resources.gold).toBe(before + TUTORIAL_REWARD_AMOUNTS.partyBonusGold);
  });

  it('T-09 첫 각인 보증은 계정당 1회만 지급된다', () => {
    const save = putSave();
    const r0 = { ...save.resources };

    const granted = grantTutorialReward('grant_first_ascension', save, 'T-09');
    expect(granted.institutionSeal).toBe(TUTORIAL_REWARD_AMOUNTS.firstAscensionSeal);
    expect(save.onboarding.firstAscensionGrantUsed).toBe(true);

    // 보증이므로 각인 재료(아이리스 조각)가 필요량까지 채워진다 — 강제 스텝이 막히면 안 된다
    const heroId = SaveManager.STARTER_BASE_HERO_ID;
    const required = SaveManager.getBaseHeroData(heroId)?.fragmentsRequired || 30;
    expect(save.resources.characterShards[heroId]).toBeGreaterThanOrEqual(required);
    expect(SaveManager.canAscend(heroId, SaveManager.getBaseHeroData(heroId).ascensionRoutes[0].cultId).canAscend)
      .toBe(false); // 아직 저장 전이므로 세이브 기준 판정은 실패한다(원자성 확인)
    expect(save.resources.spiritStones).toBe(r0.spiritStones + TUTORIAL_REWARD_AMOUNTS.firstAscensionStones);

    // 재호출: 재화는 다시 주지 않는다
    const again = grantTutorialReward('grant_first_ascension', save, 'T-09');
    expect(again.skipped).toBe('already_used');
    expect(save.resources.spiritStones).toBe(r0.spiritStones + TUTORIAL_REWARD_AMOUNTS.firstAscensionStones);

    // 재료가 다른 경로로 소모돼도 보증은 다시 채워 준다 (강제 스텝이 막히면 안 된다)
    save.resources.characterShards[heroId] = 0;
    const refill = grantTutorialReward('grant_first_ascension', save, 'T-09');
    expect(refill.shards[heroId]).toBe(required);
    expect(save.resources.characterShards[heroId]).toBe(required);
    expect(save.resources.spiritStones).toBe(r0.spiritStones + TUTORIAL_REWARD_AMOUNTS.firstAscensionStones);
  });

  it('T-12 완주 보상 — 젬 300 + 정령석 3', () => {
    putSave();
    TutorialManager.getStepIds().slice(0, 11).forEach((id) => TutorialManager.commitStep(id));

    const before = loadSave().resources;
    TutorialManager.commitStep('T-12');
    const after = loadSave();

    expect(after.resources.gems).toBe(before.gems + TUTORIAL_REWARD_AMOUNTS.completeGems);
    expect(after.resources.spiritStones).toBe(before.spiritStones + TUTORIAL_REWARD_AMOUNTS.completeStones);
    expect(after.tutorial.completed).toBe(true);
  });

  it('스텝 재커밋은 멱등이라 보상이 두 번 지급되지 않는다', () => {
    putSave();
    ['T-01', 'T-02', 'T-03', 'T-04'].forEach((id) => TutorialManager.commitStep(id));
    TutorialManager.commitStep('T-05');

    const shards = loadSave().resources.characterShards.base_omar;
    const retry = TutorialManager.commitStep('T-05');

    expect(retry.ok).toBe(false);
    expect(loadSave().resources.characterShards.base_omar).toBe(shards);
  });

  it('스킵 커밋도 보상을 그대로 지급한다 (스킵 무손실)', () => {
    putSave();
    TutorialManager.commitStep('T-01', COMPLETION_MODE.SKIPPED);
    const granted = TutorialManager.commitStep('T-02', COMPLETION_MODE.SKIPPED);

    expect(granted.ok).toBe(true);
    // T-02 의 보상은 스타터 영웅 — 신규 세이브는 이미 지급 상태라 플래그가 유지된다
    expect(loadSave().onboarding.starterHeroGranted).toBe(true);
    expect(loadSave().tutorial.skippedSteps).toContain('T-02');
  });

  it('정의되지 않은 rewardId 는 세이브를 건드리지 않는다', () => {
    const save = putSave();
    const snapshot = JSON.stringify(save.resources);

    expect(grantTutorialReward('grant_unknown_thing', save, 'T-XX')).toBeNull();
    expect(JSON.stringify(save.resources)).toBe(snapshot);
  });

  it('rewardHandler 오버라이드가 기본 핸들러보다 우선한다', () => {
    putSave();
    const spy = vi.fn();
    TutorialManager.rewardHandler = spy;

    TutorialManager.commitStep('T-01');
    TutorialManager.commitStep('T-02');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('grant_starter_iris');
    expect(TutorialManager.getRewardHandler()).toBe(spy);
  });
});
