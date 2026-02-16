/**
 * SaveManager - 하이브리드 게임 저장/로드 시스템
 * 온라인: Supabase 우선 + localStorage 백업
 * 오프라인: localStorage 전용 모드
 * 재접속: 타임스탬프 기반 자동 동기화
 */
import { supabase, isSupabaseConfigured, isOnline } from '../api/supabaseClient.js';
import GameLogger from '../utils/GameLogger.js';

export class SaveManager {
  static SAVE_KEY = 'arcane_collectors_save';
  static VERSION = 1;
  static _syncInProgress = false;
  static _pendingSync = false;
  static _userId = null;

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
        gems: 2700,
        summonTickets: 10,
        skillBooks: 0,
        characterShards: {}
      },
      characters: this._createStarterCharacters(), // 스타터 캐릭터 4명
      parties: [['hero_055', 'hero_065', 'hero_046', 'hero_081']], // 스타터 파티
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
      lastLogoutTime: Date.now(), // 오프라인 보상 계산용
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
      GameLogger.log('SAVE', '데이터 로드', { version: data.version, chars: data.characters?.length });

      // 버전 마이그레이션이 필요한 경우 처리
      if (data.version !== this.VERSION) {
        return this.migrate(data);
      }

      // COMPAT-1.3: 구버전 ownedHeroes 데이터 마이그레이션
      if (data.characters && Array.isArray(data.characters)) {
        data.characters = this._migrateHeroesSchema(data.characters);
      }

      // 기존 빈 세이브에 스타터 캐릭터 제공 (신규 계정 마이그레이션)
      if ((!data.characters || data.characters.length === 0) && data.progress?.totalBattles === 0) {
        data.characters = this._createStarterCharacters();
        if (!data.parties || data.parties.length === 0) {
          data.parties = [['hero_055', 'hero_065', 'hero_046', 'hero_081']];
        }
        data.statistics.charactersCollected = 4;
        this.save(data);
        GameLogger.log('SAVE', '스타터 캐릭터 4명 마이그레이션 적용');
      }

      return data;
    } catch (error) {
      console.error('SaveManager: 로드 실패', error);
      return this.getDefaultSave();
    }
  }

  /**
   * COMPAT-1.3: 구버전 영웅 데이터를 표준 스키마로 마이그레이션
   * @param {Array} heroes - 영웅 배열
   * @returns {Array} 마이그레이션된 영웅 배열
   */
  static _migrateHeroesSchema(heroes) {
    return heroes.map(hero => {
      // constellation, equipment, acquiredAt 필드가 없으면 추가
      if (hero.constellation === undefined) {
        hero.constellation = 0;
      }
      if (!hero.equipment) {
        hero.equipment = {
          weapon: hero.equipped?.weapon || null,
          armor: hero.equipped?.armor || null,
          accessory: hero.equipped?.accessory || null
        };
      }
      if (!hero.acquiredAt) {
        hero.acquiredAt = Date.now();
      }
      return hero;
    });
  }

  /**
   * 데이터 저장 (하이브리드: localStorage + Supabase)
   * @param {Object} data 저장할 데이터
   */
  static save(data) {
    try {
      data.lastOnline = Date.now();
      // lastLogoutTime은 명시적으로 설정하지 않는 한 유지 (오프라인 보상 중복 방지)
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
      GameLogger.log('SAVE', '데이터 저장', { gold: data.resources?.gold, chars: data.characters?.length });

      // 온라인이면 Supabase에도 비동기 저장 (UI 블로킹 방지)
      if (isOnline() && this._userId) {
        this._syncToCloudDebounced();
      }

      return true;
    } catch (error) {
      console.error('SaveManager: 저장 실패', error);
      return false;
    }
  }

  /**
   * 파티 데이터만 저장
   * @param {Array} parties 파티 배열 (5슬롯)
   * @returns {boolean} 저장 성공 여부
   */
  static saveParties(parties) {
    try {
      const data = this.load();
      data.parties = parties;
      return this.save(data);
    } catch (error) {
      console.error('SaveManager: 파티 저장 실패', error);
      return false;
    }
  }

  /**
   * Supabase 동기화 디바운스 (짧은 시간 내 여러 save 호출 시 마지막만 실행)
   */
  static _syncToCloudDebounced() {
    this._pendingSync = true;
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      if (this._pendingSync) {
        this._pendingSync = false;
        this.syncToCloud().catch(err =>
          console.warn('SaveManager: 클라우드 동기화 실패 (다음 기회에 재시도)', err)
        );
      }
    }, 2000); // 2초 디바운스
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

    // 새 캐릭터 추가 (COMPAT-1.3: 표준 스키마 필드 포함)
    const newCharacter = {
      id: characterId,
      instanceId: `${characterId}_${Date.now()}`,
      characterId: characterId,
      level: level,
      exp: 0,
      stars: this.getBaseStars(characterId),
      skillLevels: [1, 1, 1], // 기본/스킬1/스킬2
      equipped: null,
      equipment: {
        weapon: null,
        armor: null,
        accessory: null
      },
      constellation: 0,
      acquiredAt: Date.now()
    };

    data.characters.push(newCharacter);
    data.statistics.charactersCollected++;
    this.save(data);

    return { duplicate: false, character: newCharacter };
  }

  /**
   * 신규 계정용 스타터 캐릭터 4명 생성
   * 4개 클래스 × 1명 (R등급): warrior, mage, archer, healer
   */
  static _createStarterCharacters() {
    const starters = [
      { id: 'hero_055', stars: 2 }, // 요정기사 (warrior, avalon)
      { id: 'hero_065', stars: 2 }, // 스베르탈프 (mage, helheim)
      { id: 'hero_046', stars: 2 }, // 하피 (archer, tartarus)
      { id: 'hero_081', stars: 2 }, // 님프 (healer, olympus)
    ];
    const now = Date.now();
    return starters.map((s, i) => ({
      id: s.id,
      instanceId: `${s.id}_starter_${now + i}`,
      characterId: s.id,
      level: 1,
      exp: 0,
      stars: s.stars,
      skillLevels: [1, 1, 1],
      equipped: null,
      equipment: { weapon: null, armor: null, accessory: null },
      constellation: 0,
      acquiredAt: now
    }));
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
    const chapter = parseInt(parts[1]) || 1;
    const stageNum = parseInt(parts[2]) || 1;

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

    // 플레이어 경험치 추가 + lastOnline 갱신 (중복 수령 방지)
    const data = this.load();
    if (rewards.exp > 0) {
      data.player.exp += rewards.exp;
    }
    data.lastOnline = Date.now();
    data.lastLogoutTime = Date.now(); // 오프라인 보상 중복 방지
    this.save(data);

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
  static saveGachaInfo(gachaData) {
    const data = this.load();
    data.gacha = { ...data.gacha, ...gachaData };
    this.save(data);
  }

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
    const data = this.load();

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

  // ========== C-4: 하이브리드 저장 시스템 ==========

  /**
   * C-4.1: 온라인/오프라인 상태 확인
   * @returns {boolean} Supabase 연결 가능 여부
   */
  static isCloudAvailable() {
    return isOnline() && !!this._userId;
  }

  /**
   * 현재 인증된 사용자 ID 설정 (AuthService에서 호출)
   * @param {string} userId Supabase auth.uid()
   */
  static setUserId(userId) {
    this._userId = userId;
    if (userId) {
      // 재접속 시 자동 동기화 시작
      this._setupReconnectSync();
    }
  }

  /**
   * C-4.2: 로컬 → 클라우드 동기화
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async syncToCloud() {
    if (!isOnline() || !this._userId || !supabase) {
      return { success: false, error: 'offline' };
    }
    if (this._syncInProgress) {
      return { success: false, error: 'sync_in_progress' };
    }

    this._syncInProgress = true;
    try {
      const localData = this.load();
      const { data: cloudRow, error: fetchErr } = await supabase
        .from('game_saves')
        .select('updated_at')
        .eq('user_id', this._userId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      // upsert: 신규면 insert, 기존이면 update
      const { error: upsertErr } = await supabase
        .from('game_saves')
        .upsert({
          user_id: this._userId,
          save_data: localData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (upsertErr) throw upsertErr;

      console.log('SaveManager: 클라우드 동기화 성공');
      return { success: true };
    } catch (error) {
      console.warn('SaveManager: 클라우드 동기화 실패', error);
      return { success: false, error: error.message };
    } finally {
      this._syncInProgress = false;
    }
  }

  /**
   * C-4.4: 클라우드 → 로컬 동기화 (재접속 시)
   * @returns {Promise<{success: boolean, source?: string, conflict?: boolean}>}
   */
  static async loadFromCloud() {
    if (!isOnline() || !this._userId || !supabase) {
      return { success: false, source: 'local' };
    }

    try {
      const { data: cloudRow, error } = await supabase
        .from('game_saves')
        .select('save_data, updated_at')
        .eq('user_id', this._userId)
        .maybeSingle();

      if (error) throw error;

      // 클라우드에 데이터 없음 → 로컬 데이터를 클라우드에 업로드
      if (!cloudRow) {
        await this.syncToCloud();
        return { success: true, source: 'local_uploaded' };
      }

      const localData = this.load();
      const cloudData = cloudRow.save_data;
      const cloudTime = new Date(cloudRow.updated_at).getTime();
      const localTime = localData.lastOnline || 0;

      // C-4.4: 타임스탬프 비교 → 최신 데이터 우선
      if (cloudTime > localTime + 5000) {
        // 클라우드가 5초 이상 더 최신 → 클라우드 데이터 적용
        console.log('SaveManager: 클라우드 데이터가 더 최신 → 클라우드 데이터 적용');
        this._applyCloudData(cloudData);
        return { success: true, source: 'cloud', conflict: false };
      } else if (localTime > cloudTime + 5000) {
        // 로컬이 5초 이상 더 최신 → 로컬 데이터를 클라우드에 업로드
        console.log('SaveManager: 로컬 데이터가 더 최신 → 클라우드 업데이트');
        await this.syncToCloud();
        return { success: true, source: 'local', conflict: false };
      } else {
        // C-4.5: 시간차가 5초 이내 → 충돌 가능
        // 진행도가 더 높은 쪽 선택 (자동 해결)
        const cloudProgress = this._calculateProgressScore(cloudData);
        const localProgress = this._calculateProgressScore(localData);

        if (cloudProgress > localProgress) {
          this._applyCloudData(cloudData);
          return { success: true, source: 'cloud', conflict: true };
        } else {
          await this.syncToCloud();
          return { success: true, source: 'local', conflict: true };
        }
      }
    } catch (error) {
      console.warn('SaveManager: 클라우드 로드 실패, 로컬 사용', error);
      return { success: false, source: 'local' };
    }
  }

  /**
   * 클라우드 데이터를 로컬에 적용
   * @param {Object} cloudData 클라우드 세이브 데이터
   */
  static _applyCloudData(cloudData) {
    // 버전 마이그레이션 필요 시 처리
    if (cloudData.version !== this.VERSION) {
      const migrated = this.migrate(cloudData);
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(migrated));
    } else {
      cloudData.lastOnline = Date.now();
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(cloudData));
    }
  }

  /**
   * 진행도 점수 계산 (충돌 해결용)
   * @param {Object} data 세이브 데이터
   * @returns {number} 진행도 점수
   */
  static _calculateProgressScore(data) {
    if (!data) return 0;
    let score = 0;
    score += (data.player?.level || 1) * 100;
    score += (data.characters?.length || 0) * 50;
    score += Object.keys(data.progress?.clearedStages || {}).length * 30;
    score += (data.resources?.gold || 0) * 0.01;
    score += (data.resources?.gems || 0) * 0.1;
    score += (data.statistics?.totalGoldEarned || 0) * 0.001;
    return score;
  }

  /**
   * C-4.4: 재접속 자동 동기화 설정
   */
  static _setupReconnectSync() {
    // 이전 리스너 제거
    if (this._onlineListener) {
      window.removeEventListener('online', this._onlineListener);
    }

    this._onlineListener = async () => {
      console.log('SaveManager: 네트워크 복구 감지 → 클라우드 동기화 시작');
      const result = await this.loadFromCloud();
      console.log('SaveManager: 재접속 동기화 결과:', result);
    };

    window.addEventListener('online', this._onlineListener);
  }

  /**
   * 클라우드 연결 상태 정보
   * @returns {Object} { isOnline, userId, lastSync }
   */
  static getCloudStatus() {
    return {
      isOnline: isOnline(),
      isConfigured: isSupabaseConfigured,
      userId: this._userId,
      hasPendingSync: this._pendingSync
    };
  }
}
