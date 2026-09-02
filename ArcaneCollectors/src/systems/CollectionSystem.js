/**
 * CollectionSystem - 컬렉션 시스템 (COLL-01 / COLL-02)
 *
 * 설계 근거: docs/COLLECTION_DESIGN_NOTE.md (S-1 진행도 / C-4 완성 보너스 / S-2 추가 루트 개방)
 * 상위 문서: docs/EVOLUTION_SYSTEM_GDD.md v2.0 §2-4, §5, §7-4, §8
 *
 * 설계 원칙: tier/rate/bonus 등 파생값은 저장하지 않고 보유 목록에서 항상 재계산한다.
 *            → 티어/보너스 수치 조정이 패치로 자동 반영되고 구세이브 정합성이 깨지지 않는다.
 */
import baseHeroesData from '../data/base-heroes.json';
import ascendedHeroesData from '../data/ascended-heroes.json';
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';

// ==================== 상수 (설계노트 확정값) ====================

/** 티어별 스탯 보너스 (배율, Tier2는 Tier1을 대체하며 합산하지 않는다) */
export const COLLECTION_BONUS_TIERS = {
  0: { hp: 0, atk: 0, def: 0, spd: 0 },
  1: { hp: 0.03, atk: 0.03, def: 0, spd: 0 },
  2: { hp: 0.06, atk: 0.06, def: 0.06, spd: 0.06 },
};

/** 컬렉션 10개 전부 Tier2 달성 시 파티 전원에 적용되는 계정 공용 보너스 */
export const ACCOUNT_COMPLETE_BONUS = { hp: 0, atk: 0.02, def: 0.02, spd: 0 };

/** 티어별 명칭 (설계노트 §1-2) */
export const TIER_NAMES = {
  0: null,
  1: '공명 각인',
  2: '운명 완성',
};

/** collectionId → { 1: Tier1 칭호, 2: Tier2 칭호 } (설계노트 §2-2 확정 목록) */
export const COLLECTION_TITLES = {
  iris_collection: { 1: '번개의 각인', 2: '삼중뇌전의 주인' },
  sera_collection: { 1: '성약의 손길', 2: '생명의 세 가지 길' },
  luca_collection: { 1: '룬의 독자', 2: '마법의 집대성자' },
  kai_collection: { 1: '침묵의 낫', 2: '생사의 경계인' },
  lin_collection: { 1: '하늘의 인도자', 2: '균형의 사제' },
  omar_collection: { 1: '불굴의 방패', 2: '두 개의 성벽' },
  sol_collection: { 1: '대지의 화살', 2: '순환의 사수' },
  hana_collection: { 1: '황천의 그림자', 2: '경계 너머의 자' },
  leon_collection: { 1: '룬의 맹세', 2: '신벌의 용장' },
  paolo_collection: { 1: '분해의 공식', 2: '만물의 조율사' },
};

/** 추가 루트 개방 비용 배수 (설계노트 §3-2: essence = ceil(base × 1.5^n)) */
export const EXTRA_ROUTE_ESSENCE_MULTIPLIER = 1.5;
/** SSR 루트 개방 시 필요한 각성의 불꽃 */
export const AWAKENING_FLAME_SSR = 3;
/** 루트 개방 시 필요한 각인서 (첫 진화와 동일) */
export const INSTITUTION_SEAL_COST = 1;

/** 개방 실패 사유 */
export const COLLECTION_ERRORS = {
  BASE_HERO_NOT_FOUND: 'BASE_HERO_NOT_FOUND',
  NOT_AWAKENED: 'NOT_AWAKENED',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  ALREADY_OPENED: 'ALREADY_OPENED',
  INSUFFICIENT_WORLD_TREE_SEEDS: 'INSUFFICIENT_WORLD_TREE_SEEDS',
  INSUFFICIENT_CULT_ESSENCE: 'INSUFFICIENT_CULT_ESSENCE',
  INSUFFICIENT_INSTITUTION_SEAL: 'INSUFFICIENT_INSTITUTION_SEAL',
  INSUFFICIENT_AWAKENING_FLAME: 'INSUFFICIENT_AWAKENING_FLAME',
};

const ZERO_BONUS = { hp: 0, atk: 0, def: 0, spd: 0 };

// ==================== 순수 함수 (테스트 격리용) ====================

/** @returns {Array<Object>} base-heroes.json baseHeroes 배열 */
export function getBaseHeroList() {
  return baseHeroesData.baseHeroes || [];
}

/** @returns {Array<Object>} ascended-heroes.json ascendedHeroes 배열 */
export function getAscendedHeroList() {
  return ascendedHeroesData.ascendedHeroes || [];
}

/** `${baseHeroId}::${cultId}` → route 인덱스 */
function buildRouteIndex() {
  const index = new Map();
  getBaseHeroList().forEach((hero) => {
    (hero.ascensionRoutes || []).forEach((route) => {
      index.set(`${hero.id}::${route.cultId}`, route);
    });
  });
  return index;
}

/**
 * 저장 데이터에서 "실제 보유 중인 전직 영웅 id" 집합 구성.
 * ascendedHeroes / characters / baseHeroes[].openedRoutes / collections[].obtained 를 모두
 * 합집합으로 취급해 구버전 세이브와 신규 스키마가 섞여 있어도 동일한 결과를 낸다.
 * @param {Object} saveData
 * @returns {Set<string>} ascendedHeroId 집합
 */
export function buildOwnedSet(saveData) {
  const owned = new Set();
  if (!saveData) return owned;

  (saveData.ascendedHeroes || []).forEach((rec) => {
    const id = rec && (rec.ascendedHeroId || rec.id);
    if (id) owned.add(id);
  });

  (saveData.characters || []).forEach((char) => {
    const id = char && (char.characterId || char.id);
    if (typeof id === 'string' && id.indexOf('asc_') === 0) owned.add(id);
  });

  const routeIndex = buildRouteIndex();
  (saveData.baseHeroes || []).forEach((entry) => {
    const baseHeroId = entry && (entry.baseHeroId || entry.id);
    ((entry && entry.openedRoutes) || []).forEach((cultId) => {
      const route = routeIndex.get(`${baseHeroId}::${cultId}`);
      if (route) owned.add(route.ascendedHeroId);
    });
  });

  Object.values(saveData.collections || {}).forEach((entry) => {
    ((entry && entry.obtained) || []).forEach((id) => owned.add(id));
  });

  return owned;
}

/**
 * 티어 판정 (설계노트 §1-2)
 * Tier1 = 과반(ceil(total/2)) 이상, Tier2 = 전체 완성
 * @param {number} obtainedCount
 * @param {number} total
 * @returns {number} 0 | 1 | 2
 */
export function tierOf(obtainedCount, total) {
  if (!total || obtainedCount <= 0) return 0;
  if (obtainedCount >= total) return 2;
  if (obtainedCount >= Math.ceil(total / 2)) return 1;
  return 0;
}

/** 기본영웅 → collectionId (ascended-heroes.json의 collectionId 우선, 없으면 규칙 유도) */
export function resolveCollectionId(baseHero) {
  if (!baseHero) return null;
  const firstRoute = (baseHero.ascensionRoutes || [])[0];
  if (firstRoute) {
    const ascended = getAscendedHeroList().find((h) => h.id === firstRoute.ascendedHeroId);
    if (ascended && ascended.collectionId) return ascended.collectionId;
  }
  return `${String(baseHero.id).replace(/^base_/, '')}_collection`;
}

/**
 * 단일 기본영웅 진행도 계산 (순수 함수)
 * @param {Object} baseHero base-heroes.json 항목
 * @param {Set<string>} ownedSet buildOwnedSet 결과
 * @returns {Object} { baseHeroId, baseHeroName, collectionId, total, obtained, routes, rate, tier, tierName, title }
 */
export function computeProgress(baseHero, ownedSet) {
  const routes = (baseHero && baseHero.ascensionRoutes) || [];
  const collectionId = resolveCollectionId(baseHero);
  const routeStates = routes.map((route) => ({
    cultId: route.cultId,
    ascendedHeroId: route.ascendedHeroId,
    resultRarity: route.resultRarity,
    resonanceBoost: !!route.resonanceBoost,
    owned: ownedSet.has(route.ascendedHeroId),
  }));
  const obtained = routeStates.filter((r) => r.owned).map((r) => r.ascendedHeroId);
  const total = routes.length;
  const tier = tierOf(obtained.length, total);
  const titleSet = COLLECTION_TITLES[collectionId] || {};

  return {
    baseHeroId: (baseHero && baseHero.id) || null,
    baseHeroName: (baseHero && baseHero.name) || '',
    collectionId,
    total,
    obtained,
    routes: routeStates,
    rate: total > 0 ? obtained.length / total : 0,
    tier,
    tierName: TIER_NAMES[tier],
    title: tier > 0 ? titleSet[tier] || null : null,
  };
}

/**
 * 추가 루트 개방 비용 계산 (설계노트 §3-2, 순수 함수)
 * @param {number} baseEssence 해당 루트의 기본 에센스 비용
 * @param {number} extraIndex 첫 추가 루트 = 1
 * @param {string} resultRarity 'SSR' | 'SR' | 'R'
 * @returns {Object} { worldTreeSeeds, essence, institutionSeal, awakeningFlame }
 */
export function computeExtraRouteCost(baseEssence, extraIndex, resultRarity) {
  const n = Math.max(1, extraIndex);
  return {
    worldTreeSeeds: n,
    essence: Math.ceil((baseEssence || 0) * Math.pow(EXTRA_ROUTE_ESSENCE_MULTIPLIER, n)),
    institutionSeal: INSTITUTION_SEAL_COST,
    awakeningFlame: resultRarity === 'SSR' ? AWAKENING_FLAME_SSR : 0,
  };
}

// ==================== CollectionSystem ====================

export class CollectionSystem {
  static BONUS_TIERS = COLLECTION_BONUS_TIERS;
  static ACCOUNT_COMPLETE_BONUS = ACCOUNT_COMPLETE_BONUS;
  static TITLES = COLLECTION_TITLES;
  static ERRORS = COLLECTION_ERRORS;

  // ---------- 데이터 조회 헬퍼 ----------

  /**
   * @param {string} baseHeroOrCollectionId baseHeroId 또는 collectionId
   * @returns {Object|null} base-heroes.json 항목
   */
  static getBaseHero(baseHeroOrCollectionId) {
    if (!baseHeroOrCollectionId) return null;
    const list = getBaseHeroList();
    return (
      list.find((h) => h.id === baseHeroOrCollectionId) ||
      list.find((h) => resolveCollectionId(h) === baseHeroOrCollectionId) ||
      null
    );
  }

  /**
   * 전직 영웅 id → 기본영웅 id 역참조
   * @param {string} ascendedHeroId
   * @returns {string|null}
   */
  static resolveBaseHeroId(ascendedHeroId) {
    if (!ascendedHeroId) return null;
    const ascended = getAscendedHeroList().find((h) => h.id === ascendedHeroId);
    if (ascended && ascended.baseHeroId) return ascended.baseHeroId;
    const owner = getBaseHeroList().find((h) =>
      (h.ascensionRoutes || []).some((r) => r.ascendedHeroId === ascendedHeroId)
    );
    return (owner && owner.id) || null;
  }

  // ---------- S-1 조회 ----------

  /**
   * 기본영웅 컬렉션 진행도
   * @param {string} baseHeroId baseHeroId 또는 collectionId
   * @param {Object} [saveData]
   * @returns {Object|null} computeProgress 결과
   */
  static getProgress(baseHeroId, saveData = SaveManager.load()) {
    const baseHero = this.getBaseHero(baseHeroId);
    if (!baseHero) return null;
    return computeProgress(baseHero, buildOwnedSet(saveData));
  }

  /**
   * 전체 컬렉션 진행도 (도감 UI용)
   * @param {Object} [saveData]
   * @returns {Array<Object>}
   */
  static getAllProgress(saveData = SaveManager.load()) {
    const ownedSet = buildOwnedSet(saveData);
    return getBaseHeroList().map((hero) => computeProgress(hero, ownedSet));
  }

  /**
   * 계정 전체 요약
   * @param {Object} [saveData]
   * @returns {Object} { totalCollections, completed, tier1, obtainedRoutes, totalRoutes, rate, accountComplete }
   */
  static getAccountSummary(saveData = SaveManager.load()) {
    const all = this.getAllProgress(saveData);
    const totalRoutes = all.reduce((sum, p) => sum + p.total, 0);
    const obtainedRoutes = all.reduce((sum, p) => sum + p.obtained.length, 0);
    const completed = all.filter((p) => p.tier === 2).length;
    return {
      totalCollections: all.length,
      completed,
      tier1: all.filter((p) => p.tier === 1).length,
      obtainedRoutes,
      totalRoutes,
      rate: totalRoutes > 0 ? obtainedRoutes / totalRoutes : 0,
      accountComplete: all.length > 0 && completed === all.length,
    };
  }

  /**
   * @param {string} baseHeroId
   * @param {Object} [saveData]
   * @returns {boolean} tier === 2
   */
  static isComplete(baseHeroId, saveData = SaveManager.load()) {
    const progress = this.getProgress(baseHeroId, saveData);
    return !!progress && progress.tier === 2;
  }

  // ---------- C-4 보너스 ----------

  /**
   * 해당 기본영웅 계열에 적용될 스탯 배율 (미달 시 전부 0)
   * @param {string} baseHeroId
   * @param {Object} [saveData]
   * @returns {Object} { hp, atk, def, spd }
   */
  static getTierBonus(baseHeroId, saveData = SaveManager.load()) {
    const progress = this.getProgress(baseHeroId, saveData);
    const tier = (progress && progress.tier) || 0;
    return { ...COLLECTION_BONUS_TIERS[tier] };
  }

  /**
   * 계정 공용 보너스 — 컬렉션 10개 모두 Tier2 달성 시에만 적용
   * @param {Object} [saveData]
   * @returns {Object} { hp, atk, def, spd }
   */
  static getAccountWideBonus(saveData = SaveManager.load()) {
    const summary = this.getAccountSummary(saveData);
    return summary.accountComplete ? { ...ACCOUNT_COMPLETE_BONUS } : { ...ZERO_BONUS };
  }

  /**
   * 캐릭터 1체에 적용되는 최종 컬렉션 배율 = 단위 보너스 + 계정 공용 보너스
   * @param {string} characterId 전직 영웅 id(asc_*) 또는 기본영웅 id
   * @param {Object} [saveData]
   * @returns {Object} { hp, atk, def, spd }
   */
  static getStatMultipliers(characterId, saveData = SaveManager.load()) {
    const account = this.getAccountWideBonus(saveData);
    const resolved = this.resolveBaseHeroId(characterId);
    const fallback = this.getBaseHero(characterId);
    const baseHeroId = resolved || (fallback && fallback.id) || null;
    if (!baseHeroId) return { ...account };

    const tier = this.getTierBonus(baseHeroId, saveData);
    return {
      hp: (tier.hp || 0) + (account.hp || 0),
      atk: (tier.atk || 0) + (account.atk || 0),
      def: (tier.def || 0) + (account.def || 0),
      spd: (tier.spd || 0) + (account.spd || 0),
    };
  }

  /**
   * 칭호 반환 (Tier1/Tier2)
   * @param {string} baseHeroId
   * @param {Object} [saveData]
   * @returns {string|null}
   */
  static getTitle(baseHeroId, saveData = SaveManager.load()) {
    const progress = this.getProgress(baseHeroId, saveData);
    return (progress && progress.title) || null;
  }

  /**
   * 전투 유닛 배열에 컬렉션 보너스 일괄 반영 (in-place)
   * @param {Array<Object>} units BattleUnit 배열
   * @param {Object} [saveData]
   * @returns {Array<Object>} 동일 배열
   */
  static applyCollectionBonuses(units, saveData = SaveManager.load()) {
    if (!Array.isArray(units)) return units;

    units.forEach((unit) => {
      if (!unit || unit.isEnemy) return;
      const unitId = (unit.data && unit.data.id) || unit.id;
      const heroId = (unit.data && unit.data.baseHeroId) || this.resolveBaseHeroId(unitId);
      if (!heroId) return;

      const mult = this.getStatMultipliers(unitId || heroId, saveData);
      if (!mult.hp && !mult.atk && !mult.def && !mult.spd) return;

      if (typeof unit.maxHp === 'number') {
        const before = unit.maxHp;
        unit.maxHp = Math.floor(unit.maxHp * (1 + mult.hp));
        if (typeof unit.currentHp === 'number') {
          unit.currentHp = before > 0
            ? Math.floor(unit.maxHp * (unit.currentHp / before))
            : unit.maxHp;
        }
      }
      if (typeof unit.atk === 'number') unit.atk = Math.floor(unit.atk * (1 + mult.atk));
      if (typeof unit.def === 'number') unit.def = Math.floor(unit.def * (1 + mult.def));
      if (typeof unit.spd === 'number') unit.spd = Math.floor(unit.spd * (1 + mult.spd));
      unit.collectionBonus = mult;
    });

    return units;
  }

  // ---------- S-1 등록 ----------

  /**
   * 전직 영웅 획득 직후 호출 — collections.obtained 등록 + 이벤트 발행
   * @param {Object} saveData 변형 대상 (in-place)
   * @param {string} ascendedHeroId
   * @returns {Object} { added, tier, collectionId, title }
   * @fires COLLECTION_UPDATED
   * @fires COLLECTION_COMPLETED
   */
  static registerAscension(saveData, ascendedHeroId) {
    const empty = { added: false, tier: 0, collectionId: null, title: null };
    if (!saveData || !ascendedHeroId) return empty;

    const baseHero = this.getBaseHero(this.resolveBaseHeroId(ascendedHeroId));
    if (!baseHero) return empty;

    const collectionId = resolveCollectionId(baseHero);
    if (!saveData.collections) saveData.collections = {};
    if (!saveData.collections[collectionId]) {
      saveData.collections[collectionId] = { obtained: [], completedAt: null, titleClaimed: false };
    }
    const entry = saveData.collections[collectionId];
    if (!Array.isArray(entry.obtained)) entry.obtained = [];

    const previousTier = computeProgress(baseHero, buildOwnedSet(saveData)).tier;

    let added = false;
    if (!entry.obtained.includes(ascendedHeroId)) {
      entry.obtained.push(ascendedHeroId);
      added = true;
    }

    const progress = computeProgress(baseHero, buildOwnedSet(saveData));
    if (progress.tier === 2 && !entry.completedAt) entry.completedAt = Date.now();

    if (added || progress.tier !== previousTier) {
      EventBus.emit(GameEvents.COLLECTION_UPDATED, {
        collectionId,
        baseHeroId: baseHero.id,
        tier: progress.tier,
      });
    }
    if (progress.tier === 2 && previousTier !== 2) {
      EventBus.emit(GameEvents.COLLECTION_COMPLETED, {
        collectionId,
        baseHeroId: baseHero.id,
        title: progress.title,
      });
    }

    return { added, tier: progress.tier, collectionId, title: progress.title };
  }

  // ---------- S-2 추가 루트 개방 (COLL-02) ----------

  /**
   * 추가 루트 개방 비용 미리보기 (설계노트 §3-2/§3-3)
   * @param {string} baseHeroId
   * @param {string} cultId
   * @param {Object} [saveData] 개방 순번(extraIndex) 계산용
   * @returns {Object|null} { worldTreeSeeds, cultEssence, institutionSeal, awakeningFlame, extraIndex }
   */
  static getExtraRouteCost(baseHeroId, cultId, saveData = SaveManager.load()) {
    const baseHero = this.getBaseHero(baseHeroId);
    if (!baseHero) return null;
    const route = (baseHero.ascensionRoutes || []).find((r) => r.cultId === cultId);
    if (!route) return null;

    const ownedSet = buildOwnedSet(saveData);
    const obtainedCount = (baseHero.ascensionRoutes || [])
      .filter((r) => ownedSet.has(r.ascendedHeroId)).length;
    const extraIndex = Math.max(1, obtainedCount);

    const ascended = getAscendedHeroList().find((h) => h.id === route.ascendedHeroId);
    const essenceTable = (ascended && ascended.acquisitionCost && ascended.acquisitionCost.cultEssence) || {};
    const cost = computeExtraRouteCost(essenceTable[cultId] || 0, extraIndex, route.resultRarity);

    return {
      worldTreeSeeds: cost.worldTreeSeeds,
      cultEssence: { [cultId]: cost.essence },
      institutionSeal: cost.institutionSeal,
      awakeningFlame: cost.awakeningFlame,
      extraIndex,
    };
  }

  /**
   * 개방 가능 여부 검증 (설계노트 §3-4)
   * @param {string} baseHeroId
   * @param {string} cultId
   * @param {Object} [saveData]
   * @returns {Object} { ok, reason?, cost?, route? }
   */
  static canOpenExtraRoute(baseHeroId, cultId, saveData = SaveManager.load()) {
    const baseHero = this.getBaseHero(baseHeroId);
    if (!baseHero) return { ok: false, reason: COLLECTION_ERRORS.BASE_HERO_NOT_FOUND };

    const route = (baseHero.ascensionRoutes || []).find((r) => r.cultId === cultId);
    if (!route) return { ok: false, reason: COLLECTION_ERRORS.ROUTE_NOT_FOUND };

    const ownedSet = buildOwnedSet(saveData);
    if (ownedSet.has(route.ascendedHeroId)) {
      return { ok: false, reason: COLLECTION_ERRORS.ALREADY_OPENED };
    }

    // 각성 완료 판정 = awakened 플래그 또는 첫 진화 완료(루트 1개 이상 보유)
    const entry = ((saveData && saveData.baseHeroes) || []).find(
      (b) => b && (b.baseHeroId || b.id) === baseHero.id
    );
    const obtainedCount = (baseHero.ascensionRoutes || [])
      .filter((r) => ownedSet.has(r.ascendedHeroId)).length;
    if (!(entry && entry.awakened === true) && obtainedCount === 0) {
      return { ok: false, reason: COLLECTION_ERRORS.NOT_AWAKENED };
    }

    const cost = this.getExtraRouteCost(baseHero.id, cultId, saveData);
    const resources = (saveData && saveData.resources) || {};

    if ((resources.worldTreeSeeds || 0) < cost.worldTreeSeeds) {
      return { ok: false, reason: COLLECTION_ERRORS.INSUFFICIENT_WORLD_TREE_SEEDS, cost, route };
    }
    const essenceHeld = (resources.cultEssence || {})[cultId] || 0;
    if (essenceHeld < cost.cultEssence[cultId]) {
      return { ok: false, reason: COLLECTION_ERRORS.INSUFFICIENT_CULT_ESSENCE, cost, route };
    }
    if ((resources.institutionSeal || 0) < cost.institutionSeal) {
      return { ok: false, reason: COLLECTION_ERRORS.INSUFFICIENT_INSTITUTION_SEAL, cost, route };
    }
    if ((resources.awakeningFlame || 0) < cost.awakeningFlame) {
      return { ok: false, reason: COLLECTION_ERRORS.INSUFFICIENT_AWAKENING_FLAME, cost, route };
    }

    return { ok: true, cost, route };
  }

  /**
   * 추가 루트 개방 — 비용 검증/차감/openedRoutes 갱신/캐릭터 등록을 원자적으로 수행
   * @param {Object} saveData 변형 대상 (in-place)
   * @param {string} baseHeroId
   * @param {string} cultId
   * @returns {Object} { success, error?, ascendedHeroId?, cost?, tier? }
   */
  static openExtraRoute(saveData, baseHeroId, cultId) {
    const check = this.canOpenExtraRoute(baseHeroId, cultId, saveData);
    if (!check.ok) return { success: false, error: check.reason };

    const baseHero = this.getBaseHero(baseHeroId);
    const route = check.route;
    const cost = check.cost;

    // 1) 재화 차감
    const resources = saveData.resources;
    resources.worldTreeSeeds = (resources.worldTreeSeeds || 0) - cost.worldTreeSeeds;
    if (!resources.cultEssence) resources.cultEssence = {};
    resources.cultEssence[cultId] = (resources.cultEssence[cultId] || 0) - cost.cultEssence[cultId];
    resources.institutionSeal = (resources.institutionSeal || 0) - cost.institutionSeal;
    resources.awakeningFlame = (resources.awakeningFlame || 0) - cost.awakeningFlame;

    // 2) openedRoutes 갱신
    if (!Array.isArray(saveData.baseHeroes)) saveData.baseHeroes = [];
    let entry = saveData.baseHeroes.find((b) => b && (b.baseHeroId || b.id) === baseHero.id);
    if (!entry) {
      entry = { baseHeroId: baseHero.id, fragmentCount: 0, openedRoutes: [], awakened: true };
      saveData.baseHeroes.push(entry);
    }
    if (!Array.isArray(entry.openedRoutes)) entry.openedRoutes = [];
    if (!entry.openedRoutes.includes(cultId)) entry.openedRoutes.push(cultId);

    // 3) 전직 영웅 보유 레코드 + 캐릭터 등록
    const now = Date.now();
    if (!Array.isArray(saveData.ascendedHeroes)) saveData.ascendedHeroes = [];
    if (!saveData.ascendedHeroes.some((h) => h && h.ascendedHeroId === route.ascendedHeroId)) {
      saveData.ascendedHeroes.push({
        ascendedHeroId: route.ascendedHeroId,
        baseHeroId: baseHero.id,
        cultId,
        rarity: route.resultRarity,
        resonanceBoost: !!route.resonanceBoost,
        obtainedAt: now,
      });
    }
    this._appendCharacterRecord(saveData, baseHero.id, cultId, route, now);

    // 4) 컬렉션 등록 + 이벤트 발행
    const registered = this.registerAscension(saveData, route.ascendedHeroId);
    EventBus.emit(GameEvents.CHARACTER_ADDED, {
      characterId: route.ascendedHeroId,
      rarity: route.resultRarity,
      isNew: true,
    });

    this._persist(saveData);

    return {
      success: true,
      ascendedHeroId: route.ascendedHeroId,
      cost,
      tier: registered.tier,
    };
  }

  /** characters 배열 등록 (SaveManager.performAscension과 동일 스키마) */
  static _appendCharacterRecord(saveData, baseHeroId, cultId, route, now) {
    if (!Array.isArray(saveData.characters)) saveData.characters = [];
    const exists = saveData.characters.some(
      (c) => c && (c.characterId === route.ascendedHeroId || c.id === route.ascendedHeroId)
    );
    if (exists) return;

    const rarityStars = { SSR: 5, SR: 4, R: 3 };
    saveData.characters.push({
      id: route.ascendedHeroId,
      instanceId: `${route.ascendedHeroId}_asc_${now}`,
      characterId: route.ascendedHeroId,
      level: 1,
      exp: 0,
      stars: rarityStars[route.resultRarity] || 3,
      skillLevels: [1, 1, 1],
      equipped: null,
      equipment: { weapon: null, armor: null, accessory: null },
      constellation: 0,
      acquiredAt: now,
      isAscended: true,
      sourceBaseHeroId: baseHeroId,
      sourceCultId: cultId,
    });
    if (saveData.statistics) {
      saveData.statistics.charactersCollected = (saveData.statistics.charactersCollected || 0) + 1;
    }
  }

  /** 저장 (localStorage 부재 등 저장 실패는 개방 결과에 영향을 주지 않는다) */
  static _persist(saveData) {
    try {
      SaveManager.save(saveData);
    } catch {
      /* noop */
    }
  }

  // ---------- 파티 제약 (GDD: 같은 기본영웅 중복 편성 불가) ----------

  /**
   * 파티에 같은 기본영웅 계열 전직 영웅이 2체 이상인지 검사
   * @param {Array<string>} heroIds 편성된 캐릭터 id 배열
   * @returns {Object} { ok, duplicates } duplicates = 중복된 baseHeroId 목록
   */
  static checkPartyBaseHeroUnique(heroIds) {
    const seen = new Set();
    const duplicates = new Set();
    (heroIds || []).filter(Boolean).forEach((heroId) => {
      const baseHeroId = this.resolveBaseHeroId(heroId);
      if (!baseHeroId) return;
      if (seen.has(baseHeroId)) duplicates.add(baseHeroId);
      else seen.add(baseHeroId);
    });
    return { ok: duplicates.size === 0, duplicates: [...duplicates] };
  }
}

export default CollectionSystem;
