/**
 * SaveManager - 게임 저장/로드 및 리소스 관리 시스템
 * localStorage를 사용하여 게임 상태를 영구 저장
 */
export class SaveManager {
  static SAVE_KEY = 'arcane_collectors_save';
  static VERSION = 1;

  /**
   * 기본 저장 데이터 구조 반환
   */
  static getDefaultSave() {
    return {
      version: this.VERSION,
      player: {
        name: '모험가',
        level: 1,
        exp: 0
      },
      resources: {
        gold: 10000,
        gems: 1500,
        summonTickets: 5,
        skillBooks: 0,
        characterShards: {}
      },
      characters: [], // 소유한 캐릭터 인스턴스 배열
      inventory: [],
      progress: {
        currentChapter: 'chapter_1',
        clearedStages: {}, // { stageId: stars }
        towerFloor: 1,
        totalBattles: 0
      },
      gacha: {
        pityCounter: 0,
        totalPulls: 0
      },
      quests: {
        daily: {},
        dailyProgress: {},
        lastReset: null
      },
      settings: {
        bgmVolume: 1,
        sfxVolume: 1,
        autoSkip: false,
        battleSpeed: 1
      },
      statistics: {
        totalGoldEarned: 0,
        totalGemsSpent: 0,
        charactersCollected: 0,
        highestDamage: 0
      },
      lastOnline: Date.now(),
      createdAt: Date.now()
    };
  }

  /**
   * 저장 데이터 로드
   * @returns {Object} 저장된 데이터 또는 기본값
   */
  static load() {
    try {
      const saved = localStorage.getItem(this.SAVE_KEY);
      if (!saved) {
        const defaultSave = this.getDefaultSave();
        this.save(defaultSave);
        return defaultSave;
      }

      const data = JSON.parse(saved);

      // 버전 마이그레이션이 필요한 경우 처리
      if (data.version !== this.VERSION) {
        return this.migrate(data);
      }

      return data;
    } catch (error) {
      console.error('SaveManager: 로드 실패', error);
      return this.getDefaultSave();
    }
  }

  /**
   * 데이터 저장
   * @param {Object} data 저장할 데이터
   */
  static save(data) {
    try {
      data.lastOnline = Date.now();
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('SaveManager: 저장 실패', error);
      return false;
    }
  }

  /**
   * 저장 데이터 초기화
   */
  static reset() {
    const defaultSave = this.getDefaultSave();
    this.save(defaultSave);
    return defaultSave;
  }

  /**
   * 데이터 버전 마이그레이션
   * @param {Object} oldData 이전 버전 데이터
   * @returns {Object} 마이그레이션된 데이터
   */
  static migrate(oldData) {
    const newData = { ...this.getDefaultSave(), ...oldData };
    newData.version = this.VERSION;
    this.save(newData);
    return newData;
  }

  // ========== 리소스 관리 ==========

  /**
   * 골드 추가
   * @param {number} amount 추가할 양
   */
  static addGold(amount) {
    const data = this.load();
    data.resources.gold += amount;
    data.statistics.totalGoldEarned += amount;
    this.save(data);
    return data.resources.gold;
  }

  /**
   * 젬 추가
   * @param {number} amount 추가할 양
   */
  static addGems(amount) {
    const data = this.load();
    data.resources.gems += amount;
    this.save(data);
    return data.resources.gems;
  }

  /**
   * 골드 소비
   * @param {number} amount 소비할 양
   * @returns {boolean} 성공 여부
   */
  static spendGold(amount) {
    const data = this.load();
    if (data.resources.gold < amount) {
      return false;
    }
    data.resources.gold -= amount;
    this.save(data);
    return true;
  }

  /**
   * 젬 소비
   * @param {number} amount 소비할 양
   * @returns {boolean} 성공 여부
   */
  static spendGems(amount) {
    const data = this.load();
    if (data.resources.gems < amount) {
      return false;
    }
    data.resources.gems -= amount;
    data.statistics.totalGemsSpent += amount;
    this.save(data);
    return true;
  }

  /**
   * 소환 티켓 추가
   * @param {number} amount 추가할 양
   */
  static addSummonTickets(amount) {
    const data = this.load();
    data.resources.summonTickets += amount;
    this.save(data);
    return data.resources.summonTickets;
  }

  /**
   * 소환 티켓 소비
   * @param {number} amount 소비할 양
   * @returns {boolean} 성공 여부
   */
  static spendSummonTickets(amount) {
    const data = this.load();
    if (data.resources.summonTickets < amount) {
      return false;
    }
    data.resources.summonTickets -= amount;
    this.save(data);
    return true;
  }

  /**
   * 현재 리소스 조회
   * @returns {Object} 리소스 상태
   */
  static getResources() {
    const data = this.load();
    return { ...data.resources };
  }

  // ========== 캐릭터 관리 ==========

  /**
   * 캐릭터 추가 (소환 시)
   * @param {string} characterId 캐릭터 ID
   * @param {number} level 초기 레벨
   * @returns {Object} 추가된 캐릭터 인스턴스
   */
  static addCharacter(characterId, level = 1) {
    const data = this.load();

    // 이미 보유 중인 캐릭터인지 확인
    const existing = data.characters.find(c => c.characterId === characterId);

    if (existing) {
      // 중복 소환: 조각으로 변환
      const shardsGained = this.getShardsForDuplicate(existing.stars);
      if (!data.resources.characterShards[characterId]) {
        data.resources.characterShards[characterId] = 0;
      }
      data.resources.characterShards[characterId] += shardsGained;
      this.save(data);
      return { duplicate: true, shardsGained, character: existing };
    }

    // 새 캐릭터 추가
    const newCharacter = {
      instanceId: `${characterId}_${Date.now()}`,
      characterId: characterId,
      level: level,
      exp: 0,
      stars: this.getBaseStars(characterId),
      skillLevels: [1, 1, 1], // 기본/스킬1/스킬2
      equipped: null
    };

    data.characters.push(newCharacter);
    data.statistics.charactersCollected++;
    this.save(data);

    return { duplicate: false, character: newCharacter };
  }

  /**
   * 캐릭터 기본 등급 조회
   * @param {string} characterId 캐릭터 ID
   * @returns {number} 기본 성급
   */
  static getBaseStars(characterId) {
    // 캐릭터 ID 형식: rarity_name (예: ssr_aelara)
    const rarity = characterId.split('_')[0].toUpperCase();
    const starsMap = { N: 1, R: 2, SR: 3, SSR: 4 };
    return starsMap[rarity] || 1;
  }

  /**
   * 중복 소환 시 획득 조각 수
   * @param {number} stars 현재 성급
   * @returns {number} 조각 수
   */
  static getShardsForDuplicate(stars) {
    const shardsMap = { 1: 5, 2: 10, 3: 20, 4: 40, 5: 50, 6: 80 };
    return shardsMap[stars] || 10;
  }

  /**
   * 소유 캐릭터 목록 조회
   * @returns {Array} 캐릭터 인스턴스 배열
   */
  static getOwnedCharacters() {
    const data = this.load();
    return [...data.characters];
  }

  /**
   * 특정 캐릭터 조회
   * @param {string} characterId 캐릭터 ID
   * @returns {Object|null} 캐릭터 인스턴스
   */
  static getCharacter(characterId) {
    const data = this.load();
    return data.characters.find(c => c.characterId === characterId) || null;
  }

  /**
   * 캐릭터 업데이트
   * @param {string} characterId 캐릭터 ID
   * @param {Object} updates 업데이트 내용
   * @returns {Object|null} 업데이트된 캐릭터
   */
  static updateCharacter(characterId, updates) {
    const data = this.load();
    const index = data.characters.findIndex(c => c.characterId === characterId);

    if (index === -1) return null;

    data.characters[index] = { ...data.characters[index], ...updates };
    this.save(data);

    return data.characters[index];
  }

  // ========== 진행도 관리 ==========

  /**
   * 스테이지 클리어 기록
   * @param {string} stageId 스테이지 ID
   * @param {number} stars 획득 별 (1-3)
   */
  static clearStage(stageId, stars) {
    const data = this.load();
    const currentStars = data.progress.clearedStages[stageId] || 0;

    // 기존보다 높은 별 수만 기록
    if (stars > currentStars) {
      data.progress.clearedStages[stageId] = stars;
    }

    data.progress.totalBattles++;
    this.save(data);

    return data.progress.clearedStages[stageId];
  }

  /**
   * 스테이지 별 수 조회
   * @param {string} stageId 스테이지 ID
   * @returns {number} 별 수 (0 = 미클리어)
   */
  static getStageStars(stageId) {
    const data = this.load();
    return data.progress.clearedStages[stageId] || 0;
  }

  /**
   * 스테이지 해금 여부 확인
   * @param {string} stageId 스테이지 ID
   * @returns {boolean} 해금 여부
   */
  static isStageUnlocked(stageId) {
    const data = this.load();

    // 첫 스테이지는 항상 해금
    if (stageId === 'stage_1_1') return true;

    // 스테이지 ID 파싱: stage_chapter_number
    const parts = stageId.split('_');
    const chapter = parseInt(parts[1]);
    const stageNum = parseInt(parts[2]);

    if (stageNum === 1) {
      // 챕터 첫 스테이지: 이전 챕터 마지막 스테이지 클리어 필요
      const prevChapterLastStage = `stage_${chapter - 1}_10`;
      return this.getStageStars(prevChapterLastStage) > 0;
    } else {
      // 이전 스테이지 클리어 필요
      const prevStage = `stage_${chapter}_${stageNum - 1}`;
      return this.getStageStars(prevStage) > 0;
    }
  }

  /**
   * 현재 진행도 조회
   * @returns {Object} 진행도 정보
   */
  static getProgress() {
    const data = this.load();
    return { ...data.progress };
  }

  // ========== 오프라인 보상 ==========

  /**
   * 오프라인 보상 계산
   * @returns {Object} { gold, exp, duration }
   */
  static calculateOfflineRewards() {
    const data = this.load();
    const now = Date.now();
    const lastOnline = data.lastOnline;

    // 경과 시간 (밀리초 -> 분)
    let minutesAway = Math.floor((now - lastOnline) / (1000 * 60));

    // 최대 24시간 (1440분)
    minutesAway = Math.min(minutesAway, 1440);

    // 최소 5분 이상 접속 안 해야 보상 제공
    if (minutesAway < 5) {
      return { gold: 0, exp: 0, duration: 0 };
    }

    // 보상 계산 (분당 골드 10, 경험치 5)
    const playerLevel = data.player.level;
    const gold = Math.floor(minutesAway * 10 * (1 + playerLevel * 0.1));
    const exp = Math.floor(minutesAway * 5 * (1 + playerLevel * 0.05));

    return {
      gold,
      exp,
      duration: minutesAway,
      formattedDuration: this.formatDuration(minutesAway)
    };
  }

  /**
   * 오프라인 보상 수령
   * @returns {Object} 수령한 보상
   */
  static claimOfflineRewards() {
    const rewards = this.calculateOfflineRewards();

    if (rewards.gold > 0) {
      this.addGold(rewards.gold);
    }

    // 플레이어 경험치 추가
    if (rewards.exp > 0) {
      const data = this.load();
      data.player.exp += rewards.exp;
      // 레벨업 체크는 ProgressionSystem에서 처리
      this.save(data);
    }

    return rewards;
  }

  /**
   * 시간 포맷팅
   * @param {number} minutes 분
   * @returns {string} 포맷된 문자열
   */
  static formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}시간 ${mins}분`;
    }
    return `${mins}분`;
  }

  // ========== 가챠 관련 ==========

  /**
   * 가챠 정보 조회
   * @returns {Object} 가챠 상태
   */
  static getGachaInfo() {
    const data = this.load();
    return { ...data.gacha };
  }

  /**
   * 가챠 카운터 업데이트
   * @param {number} pulls 뽑은 횟수
   * @param {boolean} gotSSR SSR 획득 여부
   */
  static updateGachaCounter(pulls, gotSSR) {
    const data = this.load();
    data.gacha.totalPulls += pulls;

    if (gotSSR) {
      data.gacha.pityCounter = 0;
    } else {
      data.gacha.pityCounter += pulls;
    }

    this.save(data);
  }

  // ========== 설정 ==========

  /**
   * 설정 조회
   * @returns {Object} 설정 값
   */
  static getSettings() {
    const data = this.load();
    return { ...data.settings };
  }

  /**
   * 설정 업데이트
   * @param {Object} newSettings 새 설정값
   */
  static updateSettings(newSettings) {
    const data = this.load();
    data.settings = { ...data.settings, ...newSettings };
    this.save(data);
    return data.settings;
  }

  // ========== 통계 ==========

  /**
   * 통계 조회
   * @returns {Object} 통계 정보
   */
  static getStatistics() {
    const data = this.load();
    return { ...data.statistics };
  }

  /**
   * 최고 데미지 업데이트
   * @param {number} damage 데미지 값
   */
  static updateHighestDamage(damage) {
    const data = this.load();
    if (damage > data.statistics.highestDamage) {
      data.statistics.highestDamage = damage;
      this.save(data);
    }
  }

  // ========== 저장 슬롯 시스템 ==========

  static SAVE_SLOTS = 3;

  /**
   * 특정 슬롯에 저장
   * @param {number} slot 슬롯 번호 (0-2)
   * @param {Object} data 저장할 데이터
   */
  static saveToSlot(slot, data = null) {
    if (slot < 0 || slot >= this.SAVE_SLOTS) {
      console.error('Invalid save slot:', slot);
      return false;
    }

    const saveData = data || this.load();
    const slotKey = `${this.SAVE_KEY}_slot_${slot}`;

    try {
      saveData.lastOnline = Date.now();
      saveData.slotNumber = slot;
      localStorage.setItem(slotKey, JSON.stringify(saveData));
      return true;
    } catch (error) {
      console.error('SaveManager: 슬롯 저장 실패', error);
      return false;
    }
  }

  /**
   * 특정 슬롯에서 로드
   * @param {number} slot 슬롯 번호 (0-2)
   * @returns {Object|null} 저장된 데이터 또는 null
   */
  static loadFromSlot(slot) {
    if (slot < 0 || slot >= this.SAVE_SLOTS) {
      console.error('Invalid save slot:', slot);
      return null;
    }

    const slotKey = `${this.SAVE_KEY}_slot_${slot}`;

    try {
      const saved = localStorage.getItem(slotKey);
      if (!saved) return null;

      const data = JSON.parse(saved);
      return data;
    } catch (error) {
      console.error('SaveManager: 슬롯 로드 실패', error);
      return null;
    }
  }

  /**
   * 슬롯 정보 조회
   * @param {number} slot 슬롯 번호
   * @returns {Object|null} 슬롯 정보
   */
  static getSlotInfo(slot) {
    const data = this.loadFromSlot(slot);
    if (!data) return null;

    return {
      slot,
      playerName: data.player.name,
      level: data.player.level,
      lastOnline: data.lastOnline,
      createdAt: data.createdAt,
      characterCount: data.characters.length,
      currentChapter: data.progress.currentChapter
    };
  }

  /**
   * 모든 슬롯 정보 조회
   * @returns {Array} 슬롯 정보 배열
   */
  static getAllSlotInfo() {
    const slots = [];
    for (let i = 0; i < this.SAVE_SLOTS; i++) {
      slots.push(this.getSlotInfo(i));
    }
    return slots;
  }

  /**
   * 슬롯 삭제
   * @param {number} slot 슬롯 번호
   */
  static deleteSlot(slot) {
    if (slot < 0 || slot >= this.SAVE_SLOTS) {
      console.error('Invalid save slot:', slot);
      return false;
    }

    const slotKey = `${this.SAVE_KEY}_slot_${slot}`;
    localStorage.removeItem(slotKey);
    return true;
  }

  // ========== 데이터 내보내기/가져오기 ==========

  /**
   * 저장 데이터 내보내기 (Base64 인코딩)
   * @returns {string} 인코딩된 저장 데이터
   */
  static exportSaveData() {
    const data = this.load();
    const jsonString = JSON.stringify(data);
    return btoa(jsonString); // Base64 인코딩
  }

  /**
   * 저장 데이터 가져오기 (Base64 디코딩)
   * @param {string} encoded 인코딩된 데이터
   * @returns {Object} { success: boolean, error?: string }
   */
  static importSaveData(encoded) {
    try {
      const jsonString = atob(encoded); // Base64 디코딩
      const data = JSON.parse(jsonString);

      // 기본 검증
      if (!data.version || !data.player || !data.resources) {
        throw new Error('Invalid save data format');
      }

      // 버전 마이그레이션 처리
      const migratedData = data.version !== this.VERSION
        ? this.migrate(data)
        : data;

      this.save(migratedData);

      return { success: true };
    } catch (error) {
      console.error('SaveManager: 데이터 가져오기 실패', error);
      return {
        success: false,
        error: '잘못된 저장 데이터입니다'
      };
    }
  }

  // ========== 계정 시스템 ==========

  /**
   * 계정 ID 생성 또는 조회
   * @returns {string} 계정 ID
   */
  static getAccountId() {
    let data = this.load();

    if (!data.accountId) {
      // UUID 생성 (간단한 버전)
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substr(2, 6).toUpperCase();
      data.accountId = `AC${timestamp}${random}`;
      this.save(data);
    }

    return data.accountId;
  }

  /**
   * 계정 정보 조회
   * @returns {Object} 계정 정보
   */
  static getAccountInfo() {
    const data = this.load();
    return {
      accountId: this.getAccountId(),
      playerName: data.player.name,
      level: data.player.level,
      createdAt: data.createdAt,
      lastOnline: data.lastOnline,
      totalPlayTime: this.calculatePlayTime()
    };
  }

  /**
   * 플레이 시간 계산 (근사값)
   * @returns {number} 플레이 시간 (분)
   */
  static calculatePlayTime() {
    const data = this.load();
    const totalTime = Date.now() - data.createdAt;
    return Math.floor(totalTime / (1000 * 60)); // 밀리초 -> 분
  }

  // ========== 사운드 설정 ==========

  /**
   * 사운드 설정 업데이트
   * @param {number} bgmVolume BGM 볼륨 (0-1)
   * @param {number} sfxVolume SFX 볼륨 (0-1)
   */
  static updateSoundSettings(bgmVolume, sfxVolume) {
    const data = this.load();
    data.settings.bgmVolume = Math.max(0, Math.min(1, bgmVolume));
    data.settings.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this.save(data);
    return data.settings;
  }

  /**
   * 사운드 설정 조회
   * @returns {Object} { bgmVolume, sfxVolume }
   */
  static getSoundSettings() {
    const data = this.load();
    return {
      bgmVolume: data.settings.bgmVolume,
      sfxVolume: data.settings.sfxVolume
    };
  }

  // ========== 장비 관리 ==========

  /**
   * 캐릭터 장비 저장
   * @param {string} heroId 캐릭터 ID
   * @param {Object} equipment 장비 정보
   */
  static saveEquipment(heroId, equipment) {
    const data = this.load();
    const character = data.characters.find(c => c.characterId === heroId);

    if (!character) {
      console.error('Character not found:', heroId);
      return false;
    }

    character.equipped = equipment;
    this.save(data);
    return true;
  }

  /**
   * 캐릭터 장비 조회
   * @param {string} heroId 캐릭터 ID
   * @returns {Object|null} 장비 정보
   */
  static getEquipment(heroId) {
    const data = this.load();
    const character = data.characters.find(c => c.characterId === heroId);

    if (!character) {
      return null;
    }

    return character.equipped || null;
  }

  // ========== 인벤토리 ==========

  /**
   * 인벤토리에 아이템 추가
   * @param {Object} item 아이템 정보
   */
  static addToInventory(item) {
    const data = this.load();

    if (!data.inventory) {
      data.inventory = [];
    }

    // 스택 가능 아이템인 경우 기존 아이템 찾기
    if (item.stackable) {
      const existing = data.inventory.find(
        i => i.itemId === item.itemId && i.stackable
      );

      if (existing) {
        existing.count = (existing.count || 1) + (item.count || 1);
      } else {
        data.inventory.push({ ...item, count: item.count || 1 });
      }
    } else {
      // 스택 불가능 아이템은 개별 추가
      data.inventory.push({ ...item, instanceId: Date.now() });
    }

    this.save(data);
    return true;
  }

  /**
   * 인벤토리에서 아이템 제거
   * @param {string} itemId 아이템 ID
   * @param {number} count 제거할 수량
   * @returns {boolean} 성공 여부
   */
  static removeFromInventory(itemId, count = 1) {
    const data = this.load();

    if (!data.inventory) {
      return false;
    }

    const item = data.inventory.find(i => i.itemId === itemId);
    if (!item) {
      return false;
    }

    if (item.stackable && item.count > count) {
      item.count -= count;
    } else {
      // 아이템 완전 제거
      data.inventory = data.inventory.filter(i => i.itemId !== itemId);
    }

    this.save(data);
    return true;
  }

  /**
   * 인벤토리 조회
   * @returns {Array} 아이템 배열
   */
  static getInventory() {
    const data = this.load();
    return data.inventory || [];
  }
}
