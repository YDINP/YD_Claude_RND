/**
 * AwakeningSystem.js
 * 교단 각성 시스템 — 방랑자(Wanderer) 상태에서 교단 각성까지의 진행도 관리
 *
 * GDD 기준: docs/AWAKENING_SYSTEM_GDD.md
 * 10개 서브컬쳐 교단 (cults.json v3.0)
 */

// ============================================
// 교단 각성 조건 정의 (GDD §2 기준)
// ============================================

/**
 * 교단별 각성 조건 상수
 * SSR: affinity Lv.30, material 30개, trial 3성
 * SR:  affinity Lv.25, material 25개, trial 2성
 * R:   affinity Lv.20, material 20개, trial 1성
 */
export const AWAKENING_REQUIREMENTS = {
  prism_stars: {
    rarity: 'SSR',
    affinityLevel: 30,
    materialCount: 30,
    materialName: '공명의 별빛 조각',
    trialStars: 3
  },
  neon_crow: {
    rarity: 'SSR',
    affinityLevel: 30,
    materialCount: 30,
    materialName: '암호화된 데이터 코어',
    trialStars: 3
  },
  ink_cyclone: {
    rarity: 'SR',
    affinityLevel: 25,
    materialCount: 25,
    materialName: '잉크 정수',
    trialStars: 2
  },
  stella_club: {
    rarity: 'SSR',
    affinityLevel: 30,
    materialCount: 30,
    materialName: '별자리 파편',
    trialStars: 3
  },
  card_cartel: {
    rarity: 'SR',
    affinityLevel: 25,
    materialCount: 25,
    materialName: '봉인된 황금 카드',
    trialStars: 2
  },
  buddy_garden: {
    rarity: 'SR',
    affinityLevel: 25,
    materialCount: 25,
    materialName: '공생의 씨앗',
    trialStars: 2
  },
  glitch_paradise: {
    rarity: 'SR',
    affinityLevel: 25,
    materialCount: 25,
    materialName: '카오스 오류 데이터',
    trialStars: 2
  },
  cafe_encore: {
    rarity: 'R',
    affinityLevel: 20,
    materialCount: 20,
    materialName: '중립의 커피 원두',
    trialStars: 1
  },
  lunatic_circus: {
    rarity: 'SSR',
    affinityLevel: 30,
    materialCount: 30,
    materialName: '환상의 마술 인장',
    trialStars: 3
  },
  iron_beat: {
    rarity: 'SR',
    affinityLevel: 25,
    materialCount: 25,
    materialName: '언더그라운드 공연 기록',
    trialStars: 2
  }
};

/**
 * 각성 5단계 정의 (GDD §3 기준)
 * 0: 방랑자(Wanderer), 1: 관심(Interest), 2: 입문(Initiation),
 * 3: 수련(Training), 4: 서약(Oath), 5: 각성 완료(Awakened)
 */
export const AWAKENING_STAGES = {
  WANDERER:   0,  // 방랑자 — 교단 무소속
  INTEREST:   1,  // 관심 — 친밀도 50% 이상
  INITIATION: 2,  // 입문 — 친밀도 100%
  TRAINING:   3,  // 수련 — 소재 50% 이상
  OATH:       4,  // 서약 — 소재 100% + 시련 완료
  AWAKENED:   5   // 각성 완료 — 모든 조건 충족
};

export const AWAKENING_STAGE_NAMES = {
  0: '방랑자',
  1: '관심',
  2: '입문',
  3: '수련',
  4: '서약',
  5: '각성 완료'
};

// ============================================
// AwakeningSystem 클래스
// ============================================

export class AwakeningSystem {
  /**
   * @param {object} saveManager - 세이브 데이터 접근 인터페이스
   *   - getHeroData(heroId): 영웅 데이터 반환
   *   - getAwakeningData(heroId, cultId): 각성 데이터 반환
   *   - setAwakeningData(heroId, cultId, data): 각성 데이터 저장
   *   - updateHeroCult(heroId, cultId): 영웅의 cult 필드 갱신
   */
  constructor(saveManager = null) {
    this.saveManager = saveManager;
    /** @type {Map<string, Map<string, object>>} heroId → cultId → awakeningData */
    this._cache = new Map();
  }

  // ============================================
  // 내부 헬퍼
  // ============================================

  /**
   * 각성 데이터 로드 (캐시 우선)
   * @param {string} heroId
   * @param {string} cultId
   * @returns {{ affinity: number, materials: number, trialStars: number, awoken: boolean }}
   */
  _loadData(heroId, cultId) {
    if (!this._cache.has(heroId)) {
      this._cache.set(heroId, new Map());
    }
    const heroCache = this._cache.get(heroId);

    if (!heroCache.has(cultId)) {
      let data = null;
      if (this.saveManager) {
        data = this.saveManager.getAwakeningData?.(heroId, cultId);
      }
      heroCache.set(cultId, data || {
        affinity: 0,
        materials: 0,
        trialStars: 0,
        awoken: false
      });
    }
    return heroCache.get(cultId);
  }

  /**
   * 각성 데이터 저장
   * @param {string} heroId
   * @param {string} cultId
   * @param {object} data
   */
  _saveData(heroId, cultId, data) {
    if (!this._cache.has(heroId)) {
      this._cache.set(heroId, new Map());
    }
    this._cache.get(heroId).set(cultId, { ...data });

    if (this.saveManager) {
      this.saveManager.setAwakeningData?.(heroId, cultId, data);
    }
  }

  /**
   * 유효한 교단 ID인지 검증
   * @param {string} cultId
   * @returns {boolean}
   */
  _isValidCult(cultId) {
    return cultId != null && Object.prototype.hasOwnProperty.call(AWAKENING_REQUIREMENTS, cultId);
  }

  // ============================================
  // 방랑자 상태 확인
  // ============================================

  /**
   * 영웅이 방랑자(Wanderer) 상태인지 확인
   * cult 필드가 null 또는 undefined인 영웅은 방랑자
   * @param {string} heroId
   * @returns {boolean}
   */
  isWanderer(heroId) {
    if (!heroId) return true;

    if (this.saveManager) {
      const heroData = this.saveManager.getHeroData?.(heroId);
      if (heroData !== undefined) {
        return heroData == null || heroData.cult == null;
      }
    }

    // 데이터 없으면 방랑자로 간주
    return true;
  }

  // ============================================
  // 조건 체크 메서드 (3가지 필수 조건)
  // ============================================

  /**
   * 친밀도 조건 달성 여부
   * @param {string} heroId
   * @param {string} cultId
   * @returns {boolean}
   */
  checkAffinityCondition(heroId, cultId) {
    if (!heroId || !this._isValidCult(cultId)) return false;

    const req = AWAKENING_REQUIREMENTS[cultId];
    const data = this._loadData(heroId, cultId);
    return data.affinity >= req.affinityLevel;
  }

  /**
   * 소재 조건 달성 여부 및 현황
   * @param {string} heroId
   * @param {string} cultId
   * @returns {{ current: number, required: number, fulfilled: boolean }}
   */
  checkMaterialCondition(heroId, cultId) {
    if (!heroId || !this._isValidCult(cultId)) {
      return { current: 0, required: 0, fulfilled: false };
    }

    const req = AWAKENING_REQUIREMENTS[cultId];
    const data = this._loadData(heroId, cultId);
    return {
      current: data.materials,
      required: req.materialCount,
      fulfilled: data.materials >= req.materialCount
    };
  }

  /**
   * 시련 조건 달성 여부
   * @param {string} heroId
   * @param {string} cultId
   * @returns {boolean}
   */
  checkTrialCondition(heroId, cultId) {
    if (!heroId || !this._isValidCult(cultId)) return false;

    const req = AWAKENING_REQUIREMENTS[cultId];
    const data = this._loadData(heroId, cultId);
    return data.trialStars >= req.trialStars;
  }

  // ============================================
  // 진행도 계산
  // ============================================

  /**
   * 각성 진행도 5단계 반환
   * @param {string} heroId
   * @param {string} cultId
   * @returns {{ stage: number, affinity: number, affinityRequired: number,
   *             materials: number, materialsRequired: number,
   *             trialCleared: boolean, trialRequired: number }}
   */
  getAwakeningProgress(heroId, cultId) {
    if (!heroId || !this._isValidCult(cultId)) {
      return {
        stage: AWAKENING_STAGES.WANDERER,
        affinity: 0,
        affinityRequired: 0,
        materials: 0,
        materialsRequired: 0,
        trialCleared: false,
        trialRequired: 0
      };
    }

    const req = AWAKENING_REQUIREMENTS[cultId];
    const data = this._loadData(heroId, cultId);

    const affinityRatio = data.affinity / req.affinityLevel;
    const materialRatio = data.materials / req.materialCount;
    const trialCleared = data.trialStars >= req.trialStars;

    // GDD §3: 5단계 진행도 계산
    let stage = AWAKENING_STAGES.WANDERER;

    if (data.awoken) {
      stage = AWAKENING_STAGES.AWAKENED;
    } else if (affinityRatio >= 1.0 && materialRatio >= 1.0 && trialCleared) {
      // 모든 조건 충족 — 각성 실행 대기 (stage 4까지 표시, executeAwakening 호출 전)
      stage = AWAKENING_STAGES.OATH;
    } else if (materialRatio >= 0.5) {
      stage = AWAKENING_STAGES.TRAINING;
    } else if (affinityRatio >= 1.0) {
      stage = AWAKENING_STAGES.INITIATION;
    } else if (affinityRatio >= 0.5) {
      stage = AWAKENING_STAGES.INTEREST;
    }

    return {
      stage,
      affinity: data.affinity,
      affinityRequired: req.affinityLevel,
      materials: data.materials,
      materialsRequired: req.materialCount,
      trialCleared,
      trialRequired: req.trialStars
    };
  }

  // ============================================
  // 각성 실행
  // ============================================

  /**
   * 각성 실행 — 모든 조건 충족 시 영웅의 cult 갱신
   * @param {string} heroId
   * @param {string} cultId
   * @returns {{ success: boolean, error?: string }}
   */
  executeAwakening(heroId, cultId) {
    if (!heroId) {
      return { success: false, error: 'heroId가 필요합니다' };
    }
    if (!this._isValidCult(cultId)) {
      return { success: false, error: `유효하지 않은 교단 ID: ${cultId}` };
    }

    const data = this._loadData(heroId, cultId);

    // 이미 각성 완료 여부 확인
    if (data.awoken) {
      return { success: false, error: '이미 각성을 완료한 영웅입니다' };
    }

    // 3조건 모두 확인
    const affinityOk = this.checkAffinityCondition(heroId, cultId);
    if (!affinityOk) {
      const req = AWAKENING_REQUIREMENTS[cultId];
      return {
        success: false,
        error: `친밀도 부족 (현재: ${data.affinity}, 필요: ${req.affinityLevel})`
      };
    }

    const materialResult = this.checkMaterialCondition(heroId, cultId);
    if (!materialResult.fulfilled) {
      return {
        success: false,
        error: `소재 부족 (현재: ${materialResult.current}, 필요: ${materialResult.required})`
      };
    }

    const trialOk = this.checkTrialCondition(heroId, cultId);
    if (!trialOk) {
      const req = AWAKENING_REQUIREMENTS[cultId];
      return {
        success: false,
        error: `시련 미달성 (현재: ${data.trialStars}성, 필요: ${req.trialStars}성)`
      };
    }

    // 각성 실행
    const updatedData = { ...data, awoken: true };
    this._saveData(heroId, cultId, updatedData);

    if (this.saveManager) {
      this.saveManager.updateHeroCult?.(heroId, cultId);
    }

    return { success: true };
  }

  // ============================================
  // 진행도 갱신 메서드 (외부에서 데이터 업데이트용)
  // ============================================

  /**
   * 친밀도 갱신
   * @param {string} heroId
   * @param {string} cultId
   * @param {number} amount - 증가량 (음수 불가)
   */
  addAffinity(heroId, cultId, amount) {
    if (!heroId || !this._isValidCult(cultId) || amount <= 0) return;
    const req = AWAKENING_REQUIREMENTS[cultId];
    const data = this._loadData(heroId, cultId);
    const updated = { ...data, affinity: Math.min(data.affinity + amount, req.affinityLevel) };
    this._saveData(heroId, cultId, updated);
  }

  /**
   * 소재 갱신
   * @param {string} heroId
   * @param {string} cultId
   * @param {number} amount - 증가량 (음수 불가)
   */
  addMaterials(heroId, cultId, amount) {
    if (!heroId || !this._isValidCult(cultId) || amount <= 0) return;
    const req = AWAKENING_REQUIREMENTS[cultId];
    const data = this._loadData(heroId, cultId);
    const updated = { ...data, materials: Math.min(data.materials + amount, req.materialCount) };
    this._saveData(heroId, cultId, updated);
  }

  /**
   * 시련 별 갱신 (기존 최고 별수보다 높은 경우만 업데이트)
   * @param {string} heroId
   * @param {string} cultId
   * @param {number} stars - 달성 별 수 (1~3)
   */
  recordTrialResult(heroId, cultId, stars) {
    if (!heroId || !this._isValidCult(cultId)) return;
    if (stars < 1 || stars > 3) return;
    const data = this._loadData(heroId, cultId);
    if (stars > data.trialStars) {
      const updated = { ...data, trialStars: stars };
      this._saveData(heroId, cultId, updated);
    }
  }

  /**
   * 캐시 초기화 (테스트 및 세션 전환용)
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * 특정 영웅의 캐시 초기화
   * @param {string} heroId
   */
  clearHeroCache(heroId) {
    this._cache.delete(heroId);
  }
}

// 싱글톤 인스턴스 (saveManager 없이 사용 가능한 기본 인스턴스)
export const awakeningSystem = new AwakeningSystem();

export default AwakeningSystem;
