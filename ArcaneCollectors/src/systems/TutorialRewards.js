/**
 * TutorialRewards - 튜토리얼 스텝 보상 지급 핸들러 (T-C5 배선)
 *
 * SSOT: docs/story/SYSTEM_ONBOARDING_ECONOMY.md §5-1 보상 표
 *   T-02 grant_starter_iris     → base_iris 지급 (스킵해도 지급)
 *   T-05 grant_awakening_guide  → "각성의 인도" 봉투: 오마르 조각 30
 *   T-08 grant_party_bonus      → 골드 500
 *   T-09 grant_first_ascension  → 첫 각인 보증(각인서 1 + 정령석 3), 계정당 1회
 *   T-12 grant_tutorial_complete→ 완주 보상: 젬 300 + 정령석 3
 *
 * 배선 방식
 *  - 이 모듈은 `TutorialManager` 를 import 하지 않는다(순환 방지).
 *    대신 `TutorialManager` 가 `grantTutorialReward` 를 **기본 핸들러로 내장**한다.
 *    "부팅 시 주입" 방식은 주입 코드가 한 줄만 빠져도 보상이 조용히 누락되고,
 *    Vite dev 의 모듈 인스턴스가 갈릴 때 주입 대상이 어긋나는 실패 모드가 있었다.
 *  - 테스트/이벤트 훅이 필요하면 `TutorialManager.rewardHandler` 로 덮어쓸 수 있다.
 *
 * 원자성 규약 (§6-1)
 *  - 핸들러는 `commitStep`이 넘겨준 **save 객체를 직접 변경**한다.
 *    `SaveManager.addGems()` 같은 메서드는 자체적으로 load→save를 수행하므로,
 *    직후 commitStep이 자기 스냅샷을 저장하면서 지급분을 덮어써 **보상이 사라진다**.
 *  - 중복 지급 차단은 `commitStep`의 멱등성(completedSteps 선검사)이 담당한다.
 *    계정 단위 1회 제한이 따로 있는 보상만 onboarding 플래그를 추가로 검사한다.
 *
 * 주의: gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { SaveManager } from './SaveManager.js';
import GameLogger from '../utils/GameLogger.js';

/** 보상 수치 (시스템 문서 §5-1) */
export const TUTORIAL_REWARD_AMOUNTS = {
  awakeningGuideShards: 30,   // T-05 오마르 조각
  partyBonusGold: 500,        // T-08
  firstAscensionSeal: 1,      // T-09 각인서
  firstAscensionStones: 3,    // T-09 정령석
  completeGems: 300,          // T-12
  completeStones: 3,          // T-12
};

/** resources 하위 필드를 안전하게 준비한다 */
function resourcesOf(save) {
  if (!save.resources) save.resources = {};
  const r = save.resources;
  if (!r.characterShards || typeof r.characterShards !== 'object') r.characterShards = {};
  if (typeof r.gold !== 'number') r.gold = 0;
  if (typeof r.gems !== 'number') r.gems = 0;
  if (typeof r.spiritStones !== 'number') r.spiritStones = 0;
  if (typeof r.institutionSeal !== 'number') r.institutionSeal = 0;
  return r;
}

function onboardingOf(save) {
  if (!save.onboarding) save.onboarding = {};
  return save.onboarding;
}

/**
 * rewardId → 지급 함수. 각 함수는 save 를 in-place 변경하고 지급 내역을 반환한다.
 * @type {Object<string, (save: object) => object>}
 */
export const TUTORIAL_REWARD_HANDLERS = {
  /** T-02 — 스타터 영웅. 신규 세이브는 SaveManager가 이미 지급했으므로 플래그로 중복을 막는다. */
  grant_starter_iris(save) {
    const onboarding = onboardingOf(save);
    if (onboarding.starterHeroGranted) return { skipped: 'already_granted' };
    SaveManager._grantStarterHero(save);
    return { heroId: SaveManager.STARTER_BASE_HERO_ID };
  },

  /** T-05 — 각성의 인도 봉투 */
  grant_awakening_guide(save) {
    const r = resourcesOf(save);
    const shardId = SaveManager.SECOND_BASE_HERO_ID;
    const amount = TUTORIAL_REWARD_AMOUNTS.awakeningGuideShards;
    r.characterShards[shardId] = (r.characterShards[shardId] || 0) + amount;
    return { shards: { [shardId]: amount } };
  },

  /** T-08 — 파티 편성 보너스 */
  grant_party_bonus(save) {
    const r = resourcesOf(save);
    const amount = TUTORIAL_REWARD_AMOUNTS.partyBonusGold;
    r.gold += amount;
    if (!save.statistics) save.statistics = {};
    save.statistics.totalGoldEarned = (save.statistics.totalGoldEarned || 0) + amount;
    return { gold: amount };
  },

  /**
   * T-09 — 첫 각인 보증. 계정당 1회(firstAscensionGrantUsed).
   * "보증"이므로 각인 재료(아이리스 조각)를 필요량까지 채워준다.
   * 채우지 않으면 강제 스텝인 T-09에서 재료 부족으로 진행이 막힌다
   * (`SaveManager.canAscend`: characterShards[baseHeroId] >= fragmentsRequired).
   */
  grant_first_ascension(save) {
    const onboarding = onboardingOf(save);
    const r = resourcesOf(save);
    const heroId = SaveManager.STARTER_BASE_HERO_ID;

    // 재료 보증은 플래그로 잠그지 않는다. 이미 채워져 있으면 topUp 이 0이라 그 자체로 멱등이고,
    // 세이브가 다른 경로로 덮여도 강제 스텝(T-09)이 재료 부족으로 막히지 않는다.
    const required = SaveManager.getBaseHeroData?.(heroId)?.fragmentsRequired || 30;
    const owned = r.characterShards[heroId] || 0;
    const topUp = Math.max(required - owned, 0);
    if (topUp > 0) r.characterShards[heroId] = owned + topUp;

    // 재화(각인서·정령석)는 계정당 1회
    if (onboarding.firstAscensionGrantUsed) {
      return topUp > 0 ? { shards: { [heroId]: topUp } } : { skipped: 'already_used' };
    }

    r.institutionSeal += TUTORIAL_REWARD_AMOUNTS.firstAscensionSeal;
    r.spiritStones += TUTORIAL_REWARD_AMOUNTS.firstAscensionStones;
    onboarding.firstAscensionGrantUsed = true;
    return {
      institutionSeal: TUTORIAL_REWARD_AMOUNTS.firstAscensionSeal,
      spiritStones: TUTORIAL_REWARD_AMOUNTS.firstAscensionStones,
      shards: { [heroId]: topUp },
    };
  },

  /** T-12 — 완주 보상 */
  grant_tutorial_complete(save) {
    const r = resourcesOf(save);
    r.gems += TUTORIAL_REWARD_AMOUNTS.completeGems;
    r.spiritStones += TUTORIAL_REWARD_AMOUNTS.completeStones;
    return {
      gems: TUTORIAL_REWARD_AMOUNTS.completeGems,
      spiritStones: TUTORIAL_REWARD_AMOUNTS.completeStones,
    };
  },
};

/**
 * 스텝 **시작 시점**에 미리 지급해야 하는 보상.
 * T-09(첫 각인)는 보상이 곧 각인 재료라서, 커밋 시점에 주면 그 스텝을 끝낼 수 없다
 * ("첫 각인 보증 자동 지급 후 즉시 소모" — 시스템 문서 §5-1).
 */
export const PRE_GRANT_STEPS = {
  'T-09': 'grant_first_ascension',
};

/** 최근 지급 내역 (E2E·디버그 확인용, 최대 20건) */
export const tutorialRewardLog = [];

/**
 * rewardId 를 처리한다. 정의되지 않은 id 는 조용히 무시하되 로그를 남긴다.
 * @returns {object|null} 지급 내역
 */
export function grantTutorialReward(rewardId, save, stepId = null) {
  const handler = TUTORIAL_REWARD_HANDLERS[rewardId];
  if (!handler) {
    console.warn('[TutorialRewards] 정의되지 않은 rewardId:', rewardId, stepId);
    return null;
  }

  const granted = handler(save) || {};
  const entry = { rewardId, stepId, granted, at: Date.now() };
  tutorialRewardLog.push(entry);
  if (tutorialRewardLog.length > 20) tutorialRewardLog.shift();
  GameLogger.log('SAVE', '튜토리얼 보상 지급', entry);
  return granted;
}

/**
 * 스텝 진입 시 선지급이 필요한 보상을 1회 지급한다.
 * 계정 플래그(firstAscensionGrantUsed 등)로 멱등성을 유지하므로 반복 호출해도 안전하다.
 * @returns {object|null} 지급 내역 (이미 지급됐으면 null)
 */
export function grantStepEntryReward(stepId) {
  const rewardId = PRE_GRANT_STEPS[stepId];
  if (!rewardId) return null;

  const save = SaveManager.load();
  const granted = grantTutorialReward(rewardId, save, stepId);
  if (!granted || granted.skipped) return null;

  SaveManager.save(save);
  return granted;
}

export default grantTutorialReward;
