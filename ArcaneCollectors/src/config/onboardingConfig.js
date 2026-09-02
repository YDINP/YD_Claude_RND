/**
 * onboardingConfig - 온보딩/복귀 유저 경제 상수 (SSOT)
 *
 * 설계 근거
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §4-3(오프라인 보상), §5-3(복귀 유저)
 *  - docs/story/UX_ONBOARDING_FLOW.md §5-3(복귀 카드), §7 UXI-03(ISS-01 확정)
 *
 * 주의
 *  - 이 파일은 **아무것도 import 하지 않는다.** gameConfig/designSystem을 참조하면
 *    씬 그래프보다 먼저 평가되어 순환 import TDZ 부팅 실패를 만든다.
 *  - 좌표/크기 상수는 여기 두지 않는다. 여기는 경제·정책 수치 전용이다.
 */

// ============================================
// ISS-01 확정 — 오프라인 보상 상한
// ============================================

/**
 * 오프라인 보상 상한 시간 (ISS-01 정본).
 *
 * **확정 근거**: 실제로 재화를 지급하는 경로는 단 하나다.
 *   MainMenuScene 오프라인 보상 모달 [받기] → `SaveManager.claimOfflineRewards()`
 *   → `SaveManager.calculateOfflineRewards()` → `minutesAway = min(minutesAway, 1440)`
 * `IdleProgressSystem.calculateOfflineRewards()`는 같은 모달의 **표시값 병합**과
 * 보스 누적 데미지 계산에만 쓰이고 재화를 지급하지 않는다.
 * 따라서 유저가 실제로 받는 상한은 **24시간**이며 이 값을 정본으로 고정한다.
 *
 * `SaveManager.js`는 수정 금지 파일이므로 그쪽 리터럴(1440분)을 이 상수로 치환하지 않는다.
 * 대신 `OFFLINE_REWARD_CAP_MINUTES`가 그 리터럴과 동일함을 테스트로 고정한다.
 */
export const OFFLINE_REWARD_CAP_HOURS = 24;

/** `SaveManager.calculateOfflineRewards()`의 분 단위 상한(1440)과 반드시 같아야 한다. */
export const OFFLINE_REWARD_CAP_MINUTES = OFFLINE_REWARD_CAP_HOURS * 60;

// ============================================
// 복귀 유저 (SYSTEM §5-3 / UX §5-3)
// ============================================

/** 복귀 티어 식별자. 세이브 `onboarding.returningPlayerTier`에 그대로 저장된다. */
export const RETURN_TIER = Object.freeze({
  NONE: null,
  SHORT: '7d',
  LONG: '30d',
});

/**
 * 티어 경계 (이탈 일수, 하한 포함).
 *  ~3일  → 카드 없음(오프라인 보상 팝업만)
 *  3~7   → '7d' 기본
 *  7~30  → '7d' + 에너지 만충
 *  30일+ → '30d'
 */
export const RETURN_TIER_DAYS = Object.freeze({
  CARD_MIN: 3,
  ENERGY_FULL: 7,
  LONG: 30,
});

/**
 * 복귀 보상표 (SYSTEM §5-3). 키는 이탈 구간이다.
 * `energyFull`은 에너지 만충, `instantCharge`는 즉시충전권 수량.
 */
export const RETURN_GIFTS = Object.freeze({
  short: Object.freeze({
    gems: 100, gold: 3000, summonTickets: 1, spiritStones: 0,
    energyFull: false, instantCharge: 0,
  }),
  mid: Object.freeze({
    gems: 300, gold: 10000, summonTickets: 3, spiritStones: 3,
    energyFull: true, instantCharge: 0,
  }),
  long: Object.freeze({
    gems: 600, gold: 25000, summonTickets: 10, spiritStones: 6,
    energyFull: true, instantCharge: 1,
  }),
});

/** 30일+ 복귀 시스템 리마인더 3줄 (UX §5-3). 위치가 아니라 목적을 말한다. */
export const RETURN_REMINDERS = Object.freeze([
  '소환: 지금 티켓 10장으로 10연 1회가 가능합니다',
  '각인: 기관을 고르면 영웅이 다른 존재가 됩니다',
  '무한탑: 각인서와 각성의 불꽃이 나오는 곳입니다',
]);

/** 각인 비용 기본값 — `SaveManager.canAscend()`의 폴백과 동일해야 한다. */
export const ASCENSION_DEFAULT_COST = Object.freeze({
  fragments: 30,
  spiritStones: 3,
});

export default {
  OFFLINE_REWARD_CAP_HOURS,
  OFFLINE_REWARD_CAP_MINUTES,
  RETURN_TIER,
  RETURN_TIER_DAYS,
  RETURN_GIFTS,
  RETURN_REMINDERS,
  ASCENSION_DEFAULT_COST,
};
