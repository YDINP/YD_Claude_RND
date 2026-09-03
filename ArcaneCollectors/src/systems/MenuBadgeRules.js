/**
 * MenuBadgeRules.js — 메뉴 타일 알림 배지 규칙
 *
 * "받을 보상이나 확인할 것이 있으면 메뉴 버튼에 표시한다"를 한 곳에서 정한다.
 * 규칙이 씬에 흩어지면 화면마다 다른 조건으로 빨간 점이 켜지고, 켜졌는데 눌러 보면
 * 아무것도 없는 상태가 생긴다. 그래서 판정은 전부 여기 순수 함수에 모은다.
 *
 * **이 모듈은 Phaser 도, 게임 시스템도 직접 부르지 않는다.** 세이브와 `ctx`(호출부가
 * 시스템에서 뽑아 넘긴 수치)만 읽는다. 그래서 시스템을 띄우지 않고 규칙을 테스트할 수 있고,
 * 시스템 API 가 바뀌어도 규칙은 그대로 남는다. 시스템 조회가 실패하면 호출부가 그 항목만
 * 빼고 넘기면 되고, 그 메뉴는 조용히 배지 없이 지나간다(잘못된 알림보다 없는 편이 낫다).
 *
 * 배지 종류
 *   reward  받을 것이 있다        골드 글로우 + 숫자. 누르면 바로 얻는다
 *   alert   확인·조작이 필요하다   빨간 점 + 숫자. 눌러야 진행된다
 *   new     새로 생겼다            NEW 리본. `onboarding.lastSeen[key]` 로 해제된다
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

/** 배지 종류 */
export const BADGE_TYPE = Object.freeze({
  REWARD: 'reward',
  ALERT: 'alert',
  NEW: 'new'
});

/** 배지 우선순위 — 한 메뉴에 여러 조건이 맞으면 위쪽이 이긴다 */
export const BADGE_PRIORITY = Object.freeze([BADGE_TYPE.REWARD, BADGE_TYPE.ALERT, BADGE_TYPE.NEW]);

/** 숫자 배지 표기 상한. 넘으면 `9+` */
export const BADGE_COUNT_CAP = 9;

/** 무료 10연에 필요한 소환권 */
const TICKETS_PER_TEN_PULL = 10;

/** 안전한 정수 변환 */
function count(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** 세이브에서 마지막 확인 시각을 읽는다 */
function lastSeenAt(save, popupKey) {
  const seen = save?.onboarding?.lastSeen;
  const at = seen && seen[popupKey];
  return Number.isFinite(at) ? at : 0;
}

/**
 * 목록에서 마지막 확인 이후에 생긴 항목 수를 센다.
 * 타임스탬프 필드가 없는 레거시 항목은 "이미 본 것"으로 취급한다 —
 * 기존 유저의 가방과 영웅 목록에 NEW 가 한꺼번에 켜지는 것을 막는다.
 *
 * @param {Array<object>} items
 * @param {number} since epoch ms
 * @param {string[]} fields 타임스탬프 후보 필드
 * @returns {number}
 */
function countNewer(items, since, fields) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => {
    if (!item) return acc;
    const at = fields.map((f) => item[f]).find((v) => Number.isFinite(v));
    if (!Number.isFinite(at)) return acc;
    return at > since ? acc + 1 : acc;
  }, 0);
}

/** 배지 하나를 만든다. count 가 0 이면 null (= 배지 없음) */
function badge(type, n, options = {}) {
  const c = count(n);
  if (c <= 0 && !options.allowZero) return null;
  return { type, count: c };
}

// ------------------------------------------------------------------
// 메뉴별 규칙
// ------------------------------------------------------------------

/**
 * 메뉴별 배지를 계산한다.
 *
 * @param {object} save SaveManager.load() 결과
 * @param {object} [ctx] 호출부가 시스템에서 뽑아 넘긴 수치. 없으면 그 메뉴는 배지 없음
 * @param {number} [ctx.claimableQuests] 수령 가능한 퀘스트 수 (QuestSystem.getClaimableQuests)
 * @param {number} [ctx.ascendableHeroes] 각인 재료가 찬 영웅 수 (EvolutionSystem.canEvolve)
 * @param {number} [ctx.collectionBonuses] 미수령 도감 완성 보너스 수
 * @param {boolean} [ctx.towerBossReady] 무한탑 도전 가능 / 시즌 기록 미제출
 * @param {number} [ctx.raidRewards] 수령 가능한 레이드 보상 수
 * @param {number} [ctx.friendActions] 수령 가능한 호감도 · 대여 가능 수
 * @param {number} [ctx.eventStages] 진행 중 이벤트의 미클리어 스테이지 수
 * @returns {Object<string, {type:string, count:number}>} popupKey → 배지
 */
export function computeMenuBadges(save, ctx = {}) {
  const out = {};
  const put = (key, value) => { if (value) out[key] = value; };

  // 퀘스트 — 수령 버튼이 켜져 있는 개수. 가장 흔한 "받을 것"이다
  put('quest', badge(BADGE_TYPE.REWARD, ctx.claimableQuests));

  // 소환 — 무료 10연을 아직 안 썼으면 NEW, 소환권이 10장 이상이면 돌릴 수 있다
  const freeTenUnused = save?.gacha?.freeTenPullUsed !== true;
  const tickets = count(save?.resources?.summonTickets);
  if (freeTenUnused) {
    put('gacha', badge(BADGE_TYPE.NEW, 1));
  } else {
    put('gacha', badge(BADGE_TYPE.REWARD, Math.floor(tickets / TICKETS_PER_TEN_PULL)));
  }

  // 각인 — 재료가 찬 영웅이 있으면 "확인 필요". 보상이 아니라 조작이라 alert 다
  put('ascension', badge(BADGE_TYPE.ALERT, ctx.ascendableHeroes));

  // 도감 — 완성했는데 안 받은 보너스
  put('collection', badge(BADGE_TYPE.REWARD, ctx.collectionBonuses));

  // 무한탑 — 도전 가능 상태 (기록 미제출 포함)
  put('tower', ctx.towerBossReady ? { type: BADGE_TYPE.ALERT, count: 1 } : null);

  // 레이드 · 친구 — 받을 것
  put('raid', badge(BADGE_TYPE.REWARD, ctx.raidRewards));
  put('friends', badge(BADGE_TYPE.REWARD, ctx.friendActions));

  // 이벤트 던전 — 열려 있는데 안 깬 스테이지
  put('eventdungeon', badge(BADGE_TYPE.ALERT, ctx.eventStages));

  // 가방 — 마지막으로 가방을 연 뒤에 들어온 아이템
  const newItems = Number.isFinite(ctx.newItems)
    ? ctx.newItems
    : countNewer(save?.inventory, lastSeenAt(save, 'inventory'), ['acquiredAt', 'obtainedAt', 'createdAt']);
  put('inventory', badge(BADGE_TYPE.NEW, newItems));

  // 영웅 — 마지막으로 목록을 연 뒤에 합류한 영웅
  const newHeroes = Number.isFinite(ctx.newHeroes)
    ? ctx.newHeroes
    : countNewer(save?.characters, lastSeenAt(save, 'herolist'), ['acquiredAt', 'obtainedAt', 'createdAt']);
  put('herolist', badge(BADGE_TYPE.NEW, newHeroes));

  return out;
}

/**
 * 배지 숫자 표기. 상한을 넘으면 `9+`, 1 이면 숫자를 쓰지 않는다(점만 찍는다).
 * @param {number} n
 * @returns {string} 빈 문자열이면 숫자 없이 점만 그린다
 */
export function formatBadgeCount(n) {
  const c = count(n);
  if (c <= 1) return '';
  return c > BADGE_COUNT_CAP ? `${BADGE_COUNT_CAP}+` : String(c);
}

/**
 * 상단바 종합 알림 점에 쓸 요약.
 * @param {Object<string, {type:string, count:number}>} badges
 * @returns {{total:number, menus:number, hasReward:boolean, visible:boolean}}
 */
export function summarizeBadges(badges) {
  const entries = Object.values(badges || {});
  const total = entries.reduce((acc, b) => acc + count(b?.count), 0);
  const hasReward = entries.some((b) => b?.type === BADGE_TYPE.REWARD);
  return { total, menus: entries.length, hasReward, visible: entries.length > 0 };
}

/**
 * 메뉴를 열었다고 기록한다. NEW 배지는 이 시각을 기준으로 꺼진다.
 * 세이브 객체를 그 자리에서 고치고 돌려준다(호출부가 SaveManager.save 한다).
 *
 * @param {object} save
 * @param {string} popupKey
 * @param {number} [now] epoch ms
 * @returns {object} 같은 save 객체
 */
export function markMenuSeen(save, popupKey, now = Date.now()) {
  if (!save || !popupKey) return save;
  if (!save.onboarding || typeof save.onboarding !== 'object') save.onboarding = {};
  if (!save.onboarding.lastSeen || typeof save.onboarding.lastSeen !== 'object') {
    save.onboarding.lastSeen = {};
  }
  save.onboarding.lastSeen[popupKey] = now;
  return save;
}

/**
 * NEW 배지만 쓰는 메뉴인가 (열기만 해도 꺼진다).
 * @param {string} type
 * @returns {boolean}
 */
export function isDismissedByOpening(type) {
  return type === BADGE_TYPE.NEW;
}

export default {
  BADGE_TYPE,
  BADGE_PRIORITY,
  BADGE_COUNT_CAP,
  computeMenuBadges,
  formatBadgeCount,
  summarizeBadges,
  markMenuSeen,
  isDismissedByOpening
};
