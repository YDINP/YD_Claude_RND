/**
 * PartyManager - 파티 관리 시스템
 * 4인 파티 편성, 저장, 관리
 */

export class PartyManager {
  // 상수
  static MAX_SLOTS = 5;       // 최대 파티 슬롯 수
  static PARTY_SIZE = 4;      // 파티 인원 (5인 -> 4인 변경)
  static MIN_PARTY_SIZE = 1;  // 최소 파티 인원

  /**
   * 파티 생성
   * @param {Array<string>} heroIds 영웅 ID 배열
   * @param {string} name 파티 이름 (선택)
   * @returns {Object} { success, party, error }
   */
  static createParty(heroIds, name = '') {
    // 유효성 검사
    if (!Array.isArray(heroIds)) {
      return { success: false, party: null, error: '유효하지 않은 영웅 목록입니다' };
    }

    if (heroIds.length === 0) {
      return { success: false, party: null, error: '파티에 최소 1명의 영웅이 필요합니다' };
    }

    if (heroIds.length > this.PARTY_SIZE) {
      return { success: false, party: null, error: `파티는 최대 ${this.PARTY_SIZE}명입니다` };
    }

    // 중복 검사
    const uniqueIds = new Set(heroIds);
    if (uniqueIds.size !== heroIds.length) {
      return { success: false, party: null, error: '같은 영웅을 중복 편성할 수 없습니다' };
    }

    const party = {
      heroIds: [...heroIds],
      name: name || `파티`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false
    };

    return { success: true, party };
  }

  /**
   * 파티 저장
   * @param {Array} parties 기존 파티 배열
   * @param {number} slotNumber 슬롯 번호 (1-5)
   * @param {Array<string>} heroIds 영웅 ID 배열
   * @param {string} name 파티 이름
   * @returns {Object} { success, parties, error }
   */
  static saveParty(parties, slotNumber, heroIds, name = '') {
    // 슬롯 번호 검증
    if (slotNumber < 1 || slotNumber > this.MAX_SLOTS) {
      return {
        success: false,
        parties,
        error: `슬롯 번호는 1-${this.MAX_SLOTS} 사이여야 합니다`
      };
    }

    // 파티 생성
    const createResult = this.createParty(heroIds, name || `파티 ${slotNumber}`);
    if (!createResult.success) {
      return {
        success: false,
        parties,
        error: createResult.error
      };
    }

    // 기존 파티 배열 복사 및 초기화
    const newParties = this.ensurePartySlots([...parties]);
    const slotIndex = slotNumber - 1;

    // 기존 활성 상태 유지
    const wasActive = newParties[slotIndex]?.isActive || false;

    newParties[slotIndex] = {
      ...createResult.party,
      name: name || `파티 ${slotNumber}`,
      isActive: wasActive
    };

    return {
      success: true,
      parties: newParties,
      savedSlot: slotNumber
    };
  }

  /**
   * 파티 슬롯 초기화 보장
   * @param {Array} parties 파티 배열
   * @returns {Array} 초기화된 파티 배열
   */
  static ensurePartySlots(parties) {
    const result = [...parties];
    while (result.length < this.MAX_SLOTS) {
      result.push({
        heroIds: [],
        name: `파티 ${result.length + 1}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: false
      });
    }
    return result;
  }

  /**
   * 활성 파티 설정
   * @param {Array} parties 파티 배열
   * @param {number} slotNumber 활성화할 슬롯 번호 (1-5)
   * @returns {Object} { success, parties, activeSlot, error }
   */
  static setActiveParty(parties, slotNumber) {
    if (slotNumber < 1 || slotNumber > this.MAX_SLOTS) {
      return {
        success: false,
        parties,
        error: '유효하지 않은 슬롯 번호입니다'
      };
    }

    const slotIndex = slotNumber - 1;
    const targetParty = parties[slotIndex];

    if (!targetParty || targetParty.heroIds.length === 0) {
      return {
        success: false,
        parties,
        error: '빈 파티는 활성화할 수 없습니다'
      };
    }

    const newParties = parties.map((party, idx) => ({
      ...party,
      isActive: idx === slotIndex
    }));

    return {
      success: true,
      parties: newParties,
      activeSlot: slotNumber
    };
  }

  /**
   * 활성 파티 가져오기
   * @param {Array} parties 파티 배열
   * @returns {Object|null} 활성 파티 또는 첫 번째 유효한 파티
   */
  static getActiveParty(parties) {
    // 활성 파티 찾기
    const active = parties.find(p => p.isActive && p.heroIds.length > 0);
    if (active) return active;

    // 활성 파티가 없으면 첫 번째 유효한 파티 반환
    return parties.find(p => p.heroIds.length > 0) || null;
  }

  /**
   * 파티에 영웅 추가
   * @param {Object} party 파티 객체
   * @param {string} heroId 추가할 영웅 ID
   * @param {number} position 위치 (0-3, 선택)
   * @returns {Object} { success, party, error }
   */
  static addHeroToParty(party, heroId, position = -1) {
    if (!party) {
      return { success: false, party: null, error: '파티가 없습니다' };
    }

    if (party.heroIds.length >= this.PARTY_SIZE) {
      return { success: false, party, error: '파티가 이미 가득 찼습니다' };
    }

    if (party.heroIds.includes(heroId)) {
      return { success: false, party, error: '이미 파티에 있는 영웅입니다' };
    }

    const newHeroIds = [...party.heroIds];

    if (position >= 0 && position < this.PARTY_SIZE) {
      // 특정 위치에 삽입
      newHeroIds.splice(position, 0, heroId);
      // 최대 인원 초과 시 마지막 제거
      if (newHeroIds.length > this.PARTY_SIZE) {
        newHeroIds.pop();
      }
    } else {
      // 끝에 추가
      newHeroIds.push(heroId);
    }

    return {
      success: true,
      party: {
        ...party,
        heroIds: newHeroIds,
        updatedAt: Date.now()
      }
    };
  }

  /**
   * 파티에서 영웅 제거
   * @param {Object} party 파티 객체
   * @param {string} heroId 제거할 영웅 ID
   * @returns {Object} { success, party, error }
   */
  static removeHeroFromParty(party, heroId) {
    if (!party) {
      return { success: false, party: null, error: '파티가 없습니다' };
    }

    const index = party.heroIds.indexOf(heroId);
    if (index === -1) {
      return { success: false, party, error: '파티에 없는 영웅입니다' };
    }

    const newHeroIds = party.heroIds.filter(id => id !== heroId);

    return {
      success: true,
      party: {
        ...party,
        heroIds: newHeroIds,
        updatedAt: Date.now()
      },
      removedHeroId: heroId
    };
  }

  /**
   * 파티 내 영웅 위치 교환
   * @param {Object} party 파티 객체
   * @param {number} position1 첫 번째 위치 (0-3)
   * @param {number} position2 두 번째 위치 (0-3)
   * @returns {Object} { success, party, error }
   */
  static swapPositions(party, position1, position2) {
    if (!party || !party.heroIds) {
      return { success: false, party: null, error: '파티가 없습니다' };
    }

    if (position1 < 0 || position1 >= party.heroIds.length ||
        position2 < 0 || position2 >= party.heroIds.length) {
      return { success: false, party, error: '유효하지 않은 위치입니다' };
    }

    if (position1 === position2) {
      return { success: true, party };
    }

    const newHeroIds = [...party.heroIds];
    [newHeroIds[position1], newHeroIds[position2]] = [newHeroIds[position2], newHeroIds[position1]];

    return {
      success: true,
      party: {
        ...party,
        heroIds: newHeroIds,
        updatedAt: Date.now()
      }
    };
  }

  /**
   * 파티 영웅 교체
   * @param {Object} party 파티 객체
   * @param {string} oldHeroId 기존 영웅 ID
   * @param {string} newHeroId 새 영웅 ID
   * @returns {Object} { success, party, error }
   */
  static replaceHero(party, oldHeroId, newHeroId) {
    if (!party) {
      return { success: false, party: null, error: '파티가 없습니다' };
    }

    const index = party.heroIds.indexOf(oldHeroId);
    if (index === -1) {
      return { success: false, party, error: '교체할 영웅이 파티에 없습니다' };
    }

    if (party.heroIds.includes(newHeroId)) {
      return { success: false, party, error: '새 영웅이 이미 파티에 있습니다' };
    }

    const newHeroIds = [...party.heroIds];
    newHeroIds[index] = newHeroId;

    return {
      success: true,
      party: {
        ...party,
        heroIds: newHeroIds,
        updatedAt: Date.now()
      }
    };
  }

  /**
   * 파티 삭제 (슬롯 비우기)
   * @param {Array} parties 파티 배열
   * @param {number} slotNumber 슬롯 번호 (1-5)
   * @returns {Object} { success, parties, error }
   */
  static clearPartySlot(parties, slotNumber) {
    if (slotNumber < 1 || slotNumber > this.MAX_SLOTS) {
      return {
        success: false,
        parties,
        error: '유효하지 않은 슬롯 번호입니다'
      };
    }

    const slotIndex = slotNumber - 1;
    const newParties = [...parties];

    newParties[slotIndex] = {
      heroIds: [],
      name: `파티 ${slotNumber}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false
    };

    return {
      success: true,
      parties: newParties
    };
  }

  /**
   * 파티 복사
   * @param {Array} parties 파티 배열
   * @param {number} sourceSlot 원본 슬롯 번호
   * @param {number} targetSlot 대상 슬롯 번호
   * @returns {Object} { success, parties, error }
   */
  static copyParty(parties, sourceSlot, targetSlot) {
    if (sourceSlot < 1 || sourceSlot > this.MAX_SLOTS ||
        targetSlot < 1 || targetSlot > this.MAX_SLOTS) {
      return {
        success: false,
        parties,
        error: '유효하지 않은 슬롯 번호입니다'
      };
    }

    const sourceParty = parties[sourceSlot - 1];
    if (!sourceParty || sourceParty.heroIds.length === 0) {
      return {
        success: false,
        parties,
        error: '복사할 파티가 비어있습니다'
      };
    }

    const newParties = [...parties];
    newParties[targetSlot - 1] = {
      ...sourceParty,
      name: `${sourceParty.name} (복사)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false
    };

    return {
      success: true,
      parties: newParties
    };
  }

  /**
   * 파티 전투력 계산
   * @param {Object} party 파티 객체
   * @param {Array} heroData 영웅 데이터 배열
   * @returns {number} 총 전투력
   */
  static calculatePartyPower(party, heroData) {
    if (!party || !party.heroIds || party.heroIds.length === 0) {
      return 0;
    }

    return party.heroIds.reduce((total, heroId) => {
      const hero = heroData.find(h => h.id === heroId);
      if (!hero) return total;

      // 간단한 전투력 공식
      const stats = hero.stats || {};
      const power = (stats.hp || 0) / 10 +
                   (stats.atk || 0) +
                   (stats.def || 0) +
                   (stats.spd || 0);
      return total + power;
    }, 0);
  }

  /**
   * 파티 유효성 검사
   * @param {Object} party 파티 객체
   * @param {Array} ownedHeroIds 소유한 영웅 ID 배열
   * @returns {Object} { isValid, invalidHeroes }
   */
  static validateParty(party, ownedHeroIds) {
    if (!party || !party.heroIds) {
      return { isValid: false, invalidHeroes: [], error: '파티가 없습니다' };
    }

    const invalidHeroes = party.heroIds.filter(id => !ownedHeroIds.includes(id));

    return {
      isValid: invalidHeroes.length === 0,
      invalidHeroes
    };
  }

  /**
   * 파티 정보 요약
   * @param {Object} party 파티 객체
   * @param {Array} heroData 영웅 데이터 배열
   * @returns {Object} 파티 요약 정보
   */
  static getPartySummary(party, heroData) {
    if (!party || !party.heroIds) {
      return {
        name: '',
        size: 0,
        heroes: [],
        power: 0,
        elements: {},
        classes: {}
      };
    }

    const heroes = party.heroIds.map(id => {
      const hero = heroData.find(h => h.id === id);
      return hero ? {
        id: hero.id,
        name: hero.name,
        mood: hero.mood,
        class: hero.class,
        rarity: hero.rarity
      } : null;
    }).filter(h => h !== null);

    // 분위기/클래스 카운트
    const moods = {};
    const classes = {};

    heroes.forEach(hero => {
      moods[hero.mood] = (moods[hero.mood] || 0) + 1;
      classes[hero.class] = (classes[hero.class] || 0) + 1;
    });

    return {
      name: party.name,
      size: heroes.length,
      maxSize: this.PARTY_SIZE,
      heroes,
      power: this.calculatePartyPower(party, heroData),
      moods,
      classes,
      isActive: party.isActive,
      updatedAt: party.updatedAt
    };
  }

  /**
   * 자동 파티 편성 (추천)
   * @param {Array} ownedHeroes 소유한 영웅 배열
   * @param {Object} options 옵션 { preferMood, preferClass, excludeIds }
   * @returns {Array} 추천 영웅 ID 배열
   */
  static autoFormParty(ownedHeroes, options = {}) {
    const {
      preferMood = null,
      preferClass = null,
      excludeIds = []
    } = options;

    // 제외 영웅 필터링
    let candidates = ownedHeroes.filter(h => !excludeIds.includes(h.id));

    // 전투력 기준 정렬
    candidates.sort((a, b) => {
      const powerA = (a.stats?.hp || 0) / 10 + (a.stats?.atk || 0) + (a.stats?.def || 0) + (a.stats?.spd || 0);
      const powerB = (b.stats?.hp || 0) / 10 + (b.stats?.atk || 0) + (b.stats?.def || 0) + (b.stats?.spd || 0);
      return powerB - powerA;
    });

    // 선호 분위기/클래스 우선
    if (preferMood) {
      const preferred = candidates.filter(h => h.mood === preferMood);
      const others = candidates.filter(h => h.mood !== preferMood);
      candidates = [...preferred, ...others];
    }

    if (preferClass) {
      const preferred = candidates.filter(h => h.class === preferClass);
      const others = candidates.filter(h => h.class !== preferClass);
      candidates = [...preferred, ...others];
    }

    // 상위 4명 선택
    return candidates.slice(0, this.PARTY_SIZE).map(h => h.id);
  }
}
