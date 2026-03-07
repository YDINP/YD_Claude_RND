/**
 * StageSystem.js
 * 스테이지 관리 및 교단(Cult) 보너스 계산 시스템
 * TASK-E: Stage-Cult Integration
 */
import stagesData from "../data/stages.json";

export class StageSystem {
  static _chapters = null;
  static _stageMap = null;

  /**
   * 챕터 목록 초기화 (lazy init)
   */
  static _init() {
    if (StageSystem._chapters) return;
    StageSystem._chapters = stagesData.chapters || [];
    StageSystem._stageMap = new Map();
    for (const chapter of StageSystem._chapters) {
      for (const stage of chapter.stages || []) {
        StageSystem._stageMap.set(stage.id, { ...stage, chapterId: chapter.id });
      }
    }
  }

  /**
   * 스테이지 ID로 스테이지 정보 반환
   * @param {string} stageId  예: "1-1", "9-5"
   * @returns {object|null}
   */
  static getStageById(stageId) {
    StageSystem._init();
    return StageSystem._stageMap.get(stageId) || null;
  }

  /**
   * 챕터 ID로 챕터 정보 반환
   * @param {string} chapterId  예: "chapter_1"
   * @returns {object|null}
   */
  static getChapterById(chapterId) {
    StageSystem._init();
    return StageSystem._chapters.find((c) => c.id === chapterId) || null;
  }

  /**
   * 모든 챕터 목록 반환
   * @returns {Array}
   */
  static getAllChapters() {
    StageSystem._init();
    return StageSystem._chapters;
  }

  /**
   * 특정 챕터의 모든 스테이지 반환
   * @param {string} chapterId
   * @returns {Array}
   */
  static getStagesByChapter(chapterId) {
    StageSystem._init();
    const chapter = StageSystem.getChapterById(chapterId);
    return chapter ? chapter.stages : [];
  }

  /**
   * 스테이지의 교단 보너스를 파티 영웅 기준으로 계산
   * 파티에 추천 교단(recommendedCult)과 일치하는 영웅이 있을 때 보너스 적용
   *
   * @param {string} stageId
   * @param {Array} partyHeroes  [{ id, cultId, ... }, ...]
   * @returns {{ bonusApplied: boolean, cultId: string|null, bonus: object, multiplier: number }}
   */
  static calculateCultBonus(stageId, partyHeroes = []) {
    StageSystem._init();
    const stage = StageSystem.getStageById(stageId);
    if (!stage) {
      return { bonusApplied: false, cultId: null, bonus: {}, multiplier: 1.0 };
    }

    const recommendedCult = stage.recommendedCult;
    const cultBonus = stage.cultBonus || {};

    if (!recommendedCult) {
      return { bonusApplied: false, cultId: null, bonus: {}, multiplier: 1.0 };
    }

    // 파티 영웅 중 추천 교단 보유 여부 확인
    const hasCultHero = partyHeroes.some(
      (hero) => hero && hero.cultId === recommendedCult
    );

    if (!hasCultHero) {
      return {
        bonusApplied: false,
        cultId: recommendedCult,
        bonus: cultBonus,
        multiplier: 1.0,
      };
    }

    // 교단 일치 영웅 수에 따른 보너스 증폭 (최대 3배)
    const matchCount = partyHeroes.filter(
      (hero) => hero && hero.cultId === recommendedCult
    ).length;
    const stackMultiplier = Math.min(matchCount, 3);

    return {
      bonusApplied: true,
      cultId: recommendedCult,
      bonus: cultBonus,
      multiplier: stackMultiplier,
    };
  }

  /**
   * 특정 스테이지에 특정 교단이 적용될 때의 보너스 정보 반환
   * @param {string} stageId
   * @param {string} cultId
   * @returns {{ matched: boolean, bonus: object }}
   */
  static getActiveBonusForStage(stageId, cultId) {
    StageSystem._init();
    const stage = StageSystem.getStageById(stageId);
    if (!stage) return { matched: false, bonus: {} };

    const matched = stage.recommendedCult === cultId;
    return {
      matched,
      bonus: matched ? (stage.cultBonus || {}) : {},
    };
  }

  /**
   * 스테이지가 보스 스테이지인지 확인
   * @param {string} stageId
   * @returns {boolean}
   */
  static isBossStage(stageId) {
    StageSystem._init();
    const stage = StageSystem.getStageById(stageId);
    return stage ? !!stage.isBoss : false;
  }

  /**
   * 스테이지가 엘리트 스테이지인지 확인
   * @param {string} stageId
   * @returns {boolean}
   */
  static isEliteStage(stageId) {
    StageSystem._init();
    const stage = StageSystem.getStageById(stageId);
    return stage ? !!stage.isElite : false;
  }

  /**
   * 챕터 내에서 해금된 스테이지 목록 반환 (클리어 기록 기반)
   * @param {string} chapterId
   * @param {Set<string>} clearedStageIds  클리어된 스테이지 ID 집합
   * @returns {Array}  해금된 스테이지 목록
   */
  static getUnlockedStages(chapterId, clearedStageIds = new Set()) {
    StageSystem._init();
    const stages = StageSystem.getStagesByChapter(chapterId);
    if (stages.length === 0) return [];

    const unlocked = [];
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      // 첫 번째 스테이지는 항상 해금
      if (i === 0) {
        unlocked.push(stage);
        continue;
      }
      // 이전 스테이지가 클리어된 경우 해금
      const prevStageId = stages[i - 1].id;
      if (clearedStageIds.has(prevStageId)) {
        unlocked.push(stage);
      }
    }
    return unlocked;
  }

  /**
   * 추천 교단 기준으로 챕터 목록 필터링
   * @param {string} cultId
   * @returns {Array}  해당 교단이 추천되는 챕터 목록
   */
  static getChaptersByCult(cultId) {
    StageSystem._init();
    return StageSystem._chapters.filter((chapter) => {
      return chapter.stages && chapter.stages.some(
        (stage) => stage.recommendedCult === cultId
      );
    });
  }

  /**
   * 내부 캐시 초기화 (테스트용)
   */
  static _reset() {
    StageSystem._chapters = null;
    StageSystem._stageMap = null;
  }
}

export default StageSystem;
