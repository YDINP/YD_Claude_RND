/**
 * ReturningPlayerRules — 복귀 유저 티어·보상·요약 판정 (T-Q5 / T-25)
 *
 * SSOT
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §5-3 (티어·보상표·요약 4항목)
 *  - docs/story/UX_ONBOARDING_FLOW.md §5-3 (화면 명세), §7 UXI-03 (오프라인 상한 확정)
 *
 * 이 모듈은 **순수 함수만** 둔다. 세이브를 읽지도 쓰지도 않고, gameConfig/Phaser도 import 하지 않는다
 * (gameConfig가 모든 씬을 import하므로 순환 import TDZ가 난다).
 */
import {
  OFFLINE_REWARD_CAP_HOURS,
  RETURN_TIER,
  RETURN_TIER_DAYS,
  RETURN_GIFTS,
  RETURN_REMINDERS,
  ASCENSION_DEFAULT_COST,
} from '../config/onboardingConfig.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 카드 레이아웃 (base 720×1280, UX §5-3 도해) */
export const CARD_LAYOUT = Object.freeze({
  x: 40, y: 260, width: 640, minHeight: 520, radius: 20,
});

/**
 * 이탈 일수. 마지막 접속 시각이 없거나 미래면 0으로 본다.
 * @param {number|null} lastOnline ms
 * @param {number} [now] ms
 * @returns {number} 소수점 이하 버림한 일수
 */
export function getDaysAway(lastOnline, now = Date.now()) {
  const last = Number(lastOnline);
  const at = Number(now);
  if (!Number.isFinite(last) || !Number.isFinite(at) || last <= 0) return 0;
  const diff = at - last;
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * 복귀 티어 판정 (SYSTEM §5-3).
 *  0~2일 → null (카드 없음)  /  3~29일 → '7d'  /  30일+ → '30d'
 * @param {number} daysAway
 * @returns {null|'7d'|'30d'}
 */
export function resolveReturningTier(daysAway) {
  const days = Number(daysAway);
  if (!Number.isFinite(days) || days < RETURN_TIER_DAYS.CARD_MIN) return RETURN_TIER.NONE;
  if (days >= RETURN_TIER_DAYS.LONG) return RETURN_TIER.LONG;
  return RETURN_TIER.SHORT;
}

/**
 * 이탈 일수 → 복귀 선물. 티어는 2종('7d'/'30d')이지만 보상은 3구간이다.
 * 7~30일 구간이 '7d' 티어이면서 에너지 만충을 받는다(SYSTEM §5-3 표).
 * @param {number} daysAway
 * @returns {object|null} RETURN_GIFTS 항목, 카드 미표시 구간이면 null
 */
export function getReturnGift(daysAway) {
  const days = Number(daysAway);
  if (!Number.isFinite(days) || days < RETURN_TIER_DAYS.CARD_MIN) return null;
  if (days >= RETURN_TIER_DAYS.LONG) return RETURN_GIFTS.long;
  if (days >= RETURN_TIER_DAYS.ENERGY_FULL) return RETURN_GIFTS.mid;
  return RETURN_GIFTS.short;
}

/** 스테이지 id 문자열의 다음 스테이지. `1-5` 다음은 `2-1`이다. */
function nextStageId(stageId, stagesPerChapter = 5) {
  const match = /^(\d+)-(\d+)$/.exec(stageId || '');
  if (!match) return null;
  const chapter = Number(match[1]);
  const stage = Number(match[2]);
  return stage >= stagesPerChapter ? `${chapter + 1}-1` : `${chapter}-${stage + 1}`;
}

/**
 * clearedStages 맵에서 가장 앞선 스테이지 id
 * @param {object} clearedStages
 * @returns {string|null}
 */
export function getLastClearedStageId(clearedStages) {
  const ids = Object.keys(clearedStages || {}).filter((id) => /^\d+-\d+$/.test(id));
  if (ids.length === 0) return null;
  return ids.sort((a, b) => {
    const [ac, as] = a.split('-').map(Number);
    const [bc, bs] = b.split('-').map(Number);
    return ac === bc ? as - bs : ac - bc;
  })[ids.length - 1];
}

/**
 * 각인 가능한 기본영웅 수. 조각과 정령석(젬)을 동시에 만족해야 한다.
 * 영웅별 비용을 주입하지 않으면 `SaveManager.canAscend()`의 폴백값을 쓴다.
 * @param {object} save
 * @param {((heroId: string) => {fragments: number, spiritStones: number})|null} [costResolver]
 * @returns {number}
 */
export function countAscendableHeroes(save, costResolver = null) {
  const baseHeroes = Array.isArray(save?.baseHeroes) ? save.baseHeroes : [];
  const shards = save?.resources?.characterShards || {};
  const gems = Number(save?.resources?.gems) || 0;

  return baseHeroes.filter((hero) => {
    const id = hero?.baseHeroId;
    if (!id) return false;
    const cost = (typeof costResolver === 'function' && costResolver(id)) || ASCENSION_DEFAULT_COST;
    const owned = Number(shards[id]) || 0;
    return owned >= cost.fragments && gems >= cost.spiritStones;
  }).length;
}

/**
 * 미수령(완료했지만 안 받은) 일일/주간 퀘스트 보상 개수
 * @param {object} save
 * @returns {number}
 */
export function countUnclaimedQuests(save) {
  const buckets = [save?.quests?.daily, save?.quests?.weekly];
  return buckets.reduce((sum, bucket) => {
    if (!bucket || typeof bucket !== 'object') return sum;
    return sum + Object.values(bucket).filter((q) => q && q.completed && !q.claimed).length;
  }, 0);
}

/**
 * 복귀 요약 카드 4항목 + 보상 (SYSTEM §5-3 인계 사양).
 *
 * @param {object} save SaveManager.load() 결과
 * @param {object} [options]
 * @param {number} [options.now]
 * @param {number} [options.totalScenes]
 * @param {(stageId: string) => string|null} [options.stageName]
 * @param {(heroId: string) => {fragments: number, spiritStones: number}} [options.ascensionCost]
 * @returns {{visible: boolean, tier: null|'7d'|'30d', daysAway: number, gift: object|null,
 *            lastCleared: object, ascension: object, story: object, quests: object,
 *            reminders: string[], offlineCapHours: number}}
 */
export function buildReturnSummary(save, options = {}) {
  const now = options.now ?? Date.now();
  // `lastOnline`은 `SaveManager.save()`가 저장할 때마다 현재 시각으로 덮어쓴다.
  // 즉 "마지막 저장 시각"이지 "마지막 플레이 시각"이 아니다.
  // 이탈 기간의 기준은 오프라인 보상 수령 시에만 갱신되는 `lastLogoutTime`이다.
  const lastPlayedAt = save?.lastLogoutTime ?? save?.lastOnline ?? null;
  const daysAway = getDaysAway(lastPlayedAt, now);
  const tier = resolveReturningTier(daysAway);
  const gift = getReturnGift(daysAway);

  const lastClearedId = getLastClearedStageId(save?.progress?.clearedStages);
  const nextId = lastClearedId ? nextStageId(lastClearedId) : '1-1';
  const nameOf = (id) => (typeof options.stageName === 'function' && id ? options.stageName(id) : null);

  const totalScenes = Number(options.totalScenes) || 0;
  const viewed = Array.isArray(save?.story?.viewedCutscenes) ? save.story.viewedCutscenes.length : 0;
  const skipped = Array.isArray(save?.story?.skippedCutscenes) ? save.story.skippedCutscenes.length : 0;

  return {
    visible: tier !== RETURN_TIER.NONE,
    tier,
    daysAway,
    gift,
    lastCleared: {
      stageId: lastClearedId,
      stageName: nameOf(lastClearedId),
      nextStageId: nextId,
      nextStageName: nameOf(nextId),
    },
    ascension: {
      ascendedCount: Array.isArray(save?.ascendedHeroes) ? save.ascendedHeroes.length : 0,
      ascendableCount: countAscendableHeroes(save, options.ascensionCost),
    },
    // "놓친 이야기" = 스킵한 편수. 미도달 컷씬은 놓친 것이 아니라 아직 오지 않은 것이다.
    story: { missedStories: skipped, viewedCount: viewed, totalScenes },
    quests: { unclaimed: countUnclaimedQuests(save) },
    reminders: tier === RETURN_TIER.LONG ? [...RETURN_REMINDERS] : [],
    offlineCapHours: OFFLINE_REWARD_CAP_HOURS,
  };
}

/** 카드에 그릴 줄 목록. 값이 없는 줄은 만들지 않는다(UX §5-3 "없으면 이 줄 자체를 숨김"). */
export function buildCardLines(summary) {
  const lines = [];
  const last = summary?.lastCleared || {};
  lines.push({
    key: 'progress',
    label: '마지막 클리어',
    value: last.stageId ? `${last.stageId} ${last.stageName || ''}`.trim() : '아직 없음',
    sub: last.nextStageId ? `다음 목표  ${last.nextStageId} ${last.nextStageName || ''}`.trim() : '',
  });

  const asc = summary?.ascension || {};
  lines.push({
    key: 'ascension',
    label: '',
    value: `전직영웅 ${asc.ascendedCount || 0}명 · 지금 각인 가능 ${asc.ascendableCount || 0}명`,
    sub: '',
    ctaLabel: (asc.ascendableCount || 0) > 0 ? '각인하러 가기' : '',
    ctaKey: 'ascension',
  });

  if ((summary?.story?.missedStories || 0) > 0) {
    lines.push({
      key: 'story',
      label: '',
      value: `놓친 이야기 ${summary.story.missedStories}편`,
      sub: '',
      ctaLabel: '도감에서 보기',
      ctaKey: 'collection',
    });
  }

  if ((summary?.quests?.unclaimed || 0) > 0) {
    lines.push({
      key: 'quests',
      label: '',
      value: `받지 않은 보상 ${summary.quests.unclaimed}개`,
      sub: '',
    });
  }

  return lines;
}

/** 보상 줄 문자열. 표시 순서는 SYSTEM §5-3 표와 같다. */
export function formatGift(gift) {
  if (!gift) return '';
  const parts = [
    gift.gems > 0 ? `💎${gift.gems}` : '',
    gift.gold > 0 ? `💰${gift.gold.toLocaleString()}` : '',
    gift.summonTickets > 0 ? `🎫${gift.summonTickets}` : '',
    gift.spiritStones > 0 ? `🔮${gift.spiritStones}` : '',
  ].filter(Boolean);
  if (gift.energyFull) parts.push('⚡만충');
  return parts.join('  ');
}

export default {
  CARD_LAYOUT,
  getDaysAway,
  resolveReturningTier,
  getReturnGift,
  getLastClearedStageId,
  countAscendableHeroes,
  countUnclaimedQuests,
  buildReturnSummary,
  buildCardLines,
  formatGift,
};
