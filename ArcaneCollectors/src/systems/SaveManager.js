/**
 * SaveManager - 하이브리드 게임 저장/로드 시스템
 * 온라인: Supabase 우선 + localStorage 백업
 * 오프라인: localStorage 전용 모드
 * 재접속: 타임스탬프 기반 자동 동기화
 */
import { PitySystem } from './PitySystem.js';
import { supabase, isSupabaseConfigured, isOnline } from '../api/supabaseClient.js';
import GameLogger from '../utils/GameLogger.js';
import charactersData from '../data/characters.json';
import baseHeroesData from '../data/base-heroes.json';
import ascendedHeroesData from '../data/ascended-heroes.json';
import cultsData from '../data/cults.json';
import { getRarityStars } from '../utils/rarityUtils.js';
import { DEFAULT_AUDIO_SETTINGS } from '../config/audioAssets.js';

export class SaveManager {
  static SAVE_KEY = 'arcane_collectors_save';
  static VERSION = 2;
  static _syncInProgress = false;
  static _pendingSync = false;
  static _userId = null;

  // ===== T-C1/T-C2: 온보딩 스키마 상수 (SYSTEM_ONBOARDING_ECONOMY §1-4, §4-2, §5-1) =====

  /** 온보딩 지급 정책 버전. 정책 변경 시 증가시켜 소급 지급을 재실행한다 */
  static ONBOARDING_GRANT_VERSION = 2;

  /** 신규 계정 확정 지급 기본영웅 (§1-3) */
  static STARTER_BASE_HERO_ID = 'base_iris';

  /** 두 번째 각성 대상 기본영웅 — 조각 지급 대상 (§1-3) */
  static SECOND_BASE_HERO_ID = 'base_omar';

  /** 폐지된 레거시 스타터 ID. 기존 세이브 태깅 전용 (§1-2) */
  static LEGACY_STARTER_IDS = ['char_1', 'char_2', 'char_3', 'char_4'];

  /** 파티 1개의 슬롯 수 */
  static PARTY_SIZE = 4;

  /** 튜토리얼 스텝 ID 전량 (§5-1) */
  static TUTORIAL_STEP_IDS = [
    'T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06',
    'T-07', 'T-08', 'T-09', 'T-10', 'T-11', 'T-12',
    // 전투 트랙(첫 전투 1-1 안에서만 1회 재생, 계정 진행도와 독립)
    'B-1', 'B-2', 'B-3', 'B-4', 'B-5'
  ];

  /** 점진 해금 대상 메뉴 popupKey 13종 (§4-2). settings는 그리드 밖 상시 노출이라 제외 */
  static ALL_MENU_KEYS = [
    'herolist', 'partyedit', 'ascension', 'quest', 'inventory', 'gacha',
    'collection', 'tower', 'eventdungeon', 'pvp', 'guild', 'friends', 'raid'
  ];

  /** 온보딩 미경험 기존 유저 소급 지급량 (§5-2 마이그레이션 방침) */
  static RETRO_GRANT = {
    secondHeroShards: 30,
    spiritStones: 6,
    institutionSeal: 1
  };

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
      // T-C2: 초기 지급 재화 (SYSTEM_ONBOARDING_ECONOMY §1-4)
      resources: {
        gold: 10000,
        gems: 1500,          // 2700 → 1500 (Day3에 두 번째 10연이 열리도록 조정)
        summonTickets: 10,   // 첫 무료 10연 1회분
        skillBooks: 0,
        spiritStones: 6,     // 정령석 — 각성 2회분
        characterShards: { [this.SECOND_BASE_HERO_ID]: 0 },
        // COLL-02: 진화/컬렉션 재화 (설계노트 §5)
        worldTreeSeeds: 0,   // 세계수의 씨앗 - 추가 루트 개방
        cultEssence: {},     // { [cultId]: number }
        institutionSeal: 1,  // 각인서 - 첫 각인 1회분
        awakeningFlame: 0    // 각성의 불꽃
      },
      characters: [this._createStarterHeroRecord()],       // T-C2: base_iris 1인
      parties: [[this.STARTER_BASE_HERO_ID, null, null, null]], // 1인 파티로 시작 (§1-1)
      inventory: [],
      progress: {
        currentChapter: 'chapter_1',
        clearedStages: {}, // { stageId: stars }
        towerFloor: 1,
        totalBattles: 0
      },
      gacha: {
        pityCounter: 0,
        totalPulls: 0,
        freeTenPullUsed: false, // T-S2/BLK-05: 첫 무료 10연 사용 여부
        banners: {} // 배너별 픽업 천장 카운터 { [bannerId]: { pickupPityCounter, lost5050, totalPulls, totalSSR } }
      },
      pity: {},
      quests: {
        daily: {},
        dailyProgress: {},
        lastReset: null
      },
      settings: {
        bgmVolume: 1,
        sfxVolume: 1,
        autoSkip: false,
        battleSpeed: 1,
        // SND-01/SND-02: 음량·음소거. SoundManager 가 읽고 쓴다
        audio: { ...DEFAULT_AUDIO_SETTINGS }
      },
      statistics: {
        totalGoldEarned: 0,
        totalGemsSpent: 0,
        charactersCollected: 1,
        highestDamage: 0
      },
      // ========== T-C1: 온보딩/튜토리얼/스토리 (스키마 v2) ==========
      tutorial: this._createDefaultTutorial(),
      story: this._createDefaultStory(),
      onboarding: this._createDefaultOnboarding(),
      // ========== 진화 시스템 ==========
      baseHeroes: [{
        baseHeroId: this.STARTER_BASE_HERO_ID,
        fragmentCount: 0,
        openedRoutes: []
      }],                    // [{ baseHeroId, fragmentCount, openedRoutes[] }]
      ascendedHeroes: [],    // [{ ascendedHeroId, baseHeroId, cultId, rarity, obtainedAt }]
      // COLL-01: 컬렉션 (파생값 비저장 - obtained 목록만 저장)
      collections: {},       // { [collectionId]: { obtained[], completedAt, titleClaimed } }
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

      // CHAR-3: 진화 시스템 필드 마이그레이션 (구버전 세이브 호환)
      if (!data.baseHeroes) data.baseHeroes = [];
      if (!data.ascendedHeroes) data.ascendedHeroes = [];

      // CHAR-5: 피티 시스템 마이그레이션 (구버전 세이브 호환)
      if (!data.pity) data.pity = {};

      // COLL-01/COLL-02: 컬렉션 필드 마이그레이션 (구버전 세이브 호환)
      this._migrateCollectionSchema(data);

      // SND-01: 오디오 설정 보강
      this._migrateAudioSettingsSchema(data);

      // T-S2/BLK-05: 무료 10연 플래그 마이그레이션 (구버전 세이브 호환)
      this._migrateGachaSchema(data);

      // T-C1: 온보딩/튜토리얼/스토리 섹션 기본값 보장 + 기존 유저 처리
      // 소급 지급·레거시 정리가 발생했다면 즉시 영속화한다 (다음 로드에서 재실행되지 않도록)
      const grantVersionBefore = data.onboarding?.grantVersion ?? -1;
      const legacyMigratedBefore = data.onboarding?.legacyMigratedAt ?? null;
      const partiesBefore = JSON.stringify(data.parties ?? null);
      this._migrateOnboardingSchema(data);
      const changed =
        (data.onboarding?.grantVersion ?? -1) !== grantVersionBefore ||
        (data.onboarding?.legacyMigratedAt ?? null) !== legacyMigratedBefore ||
        JSON.stringify(data.parties ?? null) !== partiesBefore;
      if (changed) {
        this.save(data);
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
   * SND-01: settings.audio 기본값 보장 (구버전 세이브 마이그레이션)
   *
   * migrate() 의 얕은 병합은 구세이브의 settings 객체를 통째로 물려주기 때문에
   * 기본값에만 있던 audio 필드가 사라진다. 여기서 누락 필드를 채워
   * SoundManager 가 항상 완전한 설정을 읽도록 한다.
   * @param {Object} data - 저장 데이터 (in-place)
   * @returns {Object} 동일 객체
   */
  static _migrateAudioSettingsSchema(data) {
    if (!data) return data;
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    const stored = data.settings.audio;
    data.settings.audio = {
      ...DEFAULT_AUDIO_SETTINGS,
      ...(stored && typeof stored === 'object' ? stored : {})
    };
    return data;
  }

  /**
   * COLL-01/COLL-02: 컬렉션 관련 필드 기본값 보장 (구버전 세이브 마이그레이션)
   * 파생값(tier/rate/bonus)은 저장하지 않으므로 보유 목록/재화만 채운다.
   * @param {Object} data - 저장 데이터 (in-place)
   * @returns {Object} 동일 객체
   */
  static _migrateCollectionSchema(data) {
    if (!data) return data;
    if (!data.collections || typeof data.collections !== 'object') data.collections = {};
    if (!data.resources || typeof data.resources !== 'object') data.resources = {};

    const r = data.resources;
    if (r.worldTreeSeeds === undefined) r.worldTreeSeeds = 0;
    if (!r.cultEssence || typeof r.cultEssence !== 'object') r.cultEssence = {};
    if (r.institutionSeal === undefined) r.institutionSeal = 0;
    if (r.awakeningFlame === undefined) r.awakeningFlame = 0;
    // T-C2: 정령석 필드 신설 (구세이브는 0에서 시작, 소급 지급 대상만 별도 보전)
    if (r.spiritStones === undefined) r.spiritStones = 0;
    if (!r.characterShards || typeof r.characterShards !== 'object') r.characterShards = {};

    if (!Array.isArray(data.baseHeroes)) data.baseHeroes = [];
    data.baseHeroes.forEach(entry => {
      if (entry && !Array.isArray(entry.openedRoutes)) entry.openedRoutes = [];
    });

    return data;
  }

  /**
   * T-S2/BLK-05: 가챠 관련 필드 기본값 보장 (구버전 세이브 마이그레이션)
   * @param {Object} data - 저장 데이터 (in-place)
   * @returns {Object} 동일 객체
   */
  static _migrateGachaSchema(data) {
    if (!data) return data;
    if (!data.gacha || typeof data.gacha !== 'object') {
      data.gacha = { pityCounter: 0, totalPulls: 0, freeTenPullUsed: false, banners: {} };
    } else if (data.gacha.freeTenPullUsed === undefined) {
      data.gacha.freeTenPullUsed = false;
    }
    // 배너별 픽업 천장 카운터(BLK-XX) — 구버전 세이브는 이 필드가 없다
    if (!data.gacha.banners || typeof data.gacha.banners !== 'object') {
      data.gacha.banners = {};
    }
    return data;
  }

  /**
   * T-C1: 튜토리얼 섹션 기본값 (SYSTEM_ONBOARDING_ECONOMY §5-2)
   * @returns {Object}
   */
  static _createDefaultTutorial() {
    return {
      currentStep: this.TUTORIAL_STEP_IDS[0],
      completedSteps: [],
      skippedSteps: [],
      skipped: false,
      completed: false,
      startedAt: null,
      completedAt: null
    };
  }

  /**
   * T-C1: 스토리 섹션 기본값 (SYSTEM_ONBOARDING_ECONOMY §5-2)
   * @returns {Object}
   */
  static _createDefaultStory() {
    return {
      viewedCutscenes: [],
      skippedCutscenes: [],
      currentChapterStory: 'chapter_1',
      lastViewedAt: null
    };
  }

  /**
   * T-C1: 온보딩 섹션 기본값 (SYSTEM_ONBOARDING_ECONOMY §5-2)
   * @returns {Object}
   */
  static _createDefaultOnboarding() {
    return {
      grantVersion: this.ONBOARDING_GRANT_VERSION,
      starterHeroGranted: true,
      starterHeroId: this.STARTER_BASE_HERO_ID,
      freeMultiPullUsed: false,
      freeMultiPullAt: null,
      firstAscensionGrantUsed: false,
      firstAscensionCultId: null,
      unlockedMenus: [],
      idleIntroShown: false,
      returningPlayerTier: null,
      lastReturnRewardAt: null,
      // 레거시 스타터(char_1~4) 정리 완료 시각. null이면 아직 정리하지 않았다는 뜻
      legacyMigratedAt: null
    };
  }

  /**
   * T-C1: 온보딩/튜토리얼/스토리 섹션 마이그레이션 (v1 → v2)
   * - 누락 필드를 기본값으로 채운다 (in-place)
   * - 기존 유저(진행 이력 존재)는 튜토리얼 완주 처리 + 메뉴 전량 개방
   * - 온보딩 미경험 기존 유저에게 계정당 1회 소급 지급
   * @param {Object} data - 저장 데이터 (in-place)
   * @returns {Object} 동일 객체
   */
  static _migrateOnboardingSchema(data) {
    if (!data) return data;

    // 스키마 v2 이전 세이브인지 판정한다. 완주 처리·메뉴 개방은 최초 1회만 수행해야 하며,
    // 이미 v2인 세이브(튜토리얼 진행 중인 신규 유저 포함)를 건드려서는 안 된다.
    const hadTutorial = !!(data.tutorial && typeof data.tutorial === 'object');
    const hadOnboarding = !!(data.onboarding && typeof data.onboarding === 'object');

    // --- 1. 섹션 기본값 보장 (부분 손상 세이브도 필드 단위로 복구) ---
    const tutorialDefaults = this._createDefaultTutorial();
    if (!data.tutorial || typeof data.tutorial !== 'object') data.tutorial = tutorialDefaults;
    else this._fillMissingKeys(data.tutorial, tutorialDefaults);
    if (!Array.isArray(data.tutorial.completedSteps)) data.tutorial.completedSteps = [];
    if (!Array.isArray(data.tutorial.skippedSteps)) data.tutorial.skippedSteps = [];

    const storyDefaults = this._createDefaultStory();
    if (!data.story || typeof data.story !== 'object') data.story = storyDefaults;
    else this._fillMissingKeys(data.story, storyDefaults);
    if (!Array.isArray(data.story.viewedCutscenes)) data.story.viewedCutscenes = [];
    if (!Array.isArray(data.story.skippedCutscenes)) data.story.skippedCutscenes = [];

    // 온보딩은 "신규 계정 기본값(지급 완료 상태)"을 그대로 쓰면 안 된다.
    // 구세이브는 미지급 상태에서 출발해 아래 소급 지급 분기를 타야 한다.
    const onboardingDefaults = this._createDefaultOnboarding();
    if (!data.onboarding || typeof data.onboarding !== 'object') {
      data.onboarding = {
        ...onboardingDefaults,
        grantVersion: 0,
        starterHeroGranted: false,
        starterHeroId: null
      };
    } else {
      this._fillMissingKeys(data.onboarding, onboardingDefaults);
    }
    if (!Array.isArray(data.onboarding.unlockedMenus)) data.onboarding.unlockedMenus = [];

    // --- 2. 기존 유저 판정 ---
    const totalBattles = data.progress?.totalBattles || 0;
    const ownedCharacters = Array.isArray(data.characters) ? data.characters : [];
    const isExistingPlayer = totalBattles > 0 || ownedCharacters.length > 0;

    if (!hadTutorial && isExistingPlayer && !data.tutorial.completed) {
      // 완주 유저에게 튜토리얼을 다시 틀지 않는다 (§5-3 재노출 정책)
      data.tutorial.completedSteps = [...this.TUTORIAL_STEP_IDS];
      data.tutorial.skippedSteps = [...this.TUTORIAL_STEP_IDS];
      data.tutorial.skipped = true;
      data.tutorial.completed = true;
      data.tutorial.currentStep = null;
      if (!data.tutorial.startedAt) data.tutorial.startedAt = data.createdAt || Date.now();
      if (!data.tutorial.completedAt) data.tutorial.completedAt = Date.now();
    }

    if (!hadOnboarding && isExistingPlayer) {
      // 메뉴가 사라지는 사고 방지 — 13개 전량 주입
      data.onboarding.unlockedMenus = [...this.ALL_MENU_KEYS];
    }

    // --- 3. 소급 지급 (계정당 1회, grantVersion으로 중복 차단) ---
    if ((data.onboarding.grantVersion || 0) < this.ONBOARDING_GRANT_VERSION) {
      const hasBase = Array.isArray(data.baseHeroes) && data.baseHeroes.length > 0;
      const hasAscended = Array.isArray(data.ascendedHeroes) && data.ascendedHeroes.length > 0;

      if (!hasBase && !hasAscended) {
        this._grantStarterHero(data);

        // 진행 이력이 있는 유저만 소급 재화를 받는다.
        // 이력이 없는 빈 세이브는 튜토리얼 보상 경로로 정상 수급한다 (§1-2).
        if (isExistingPlayer) {
          const r = data.resources;
          const shardId = this.SECOND_BASE_HERO_ID;
          r.characterShards[shardId] = (r.characterShards[shardId] || 0) + this.RETRO_GRANT.secondHeroShards;
          r.spiritStones = (r.spiritStones || 0) + this.RETRO_GRANT.spiritStones;
          r.institutionSeal = (r.institutionSeal || 0) + this.RETRO_GRANT.institutionSeal;
          GameLogger.log('SAVE', '온보딩 소급 지급 적용', { heroId: this.STARTER_BASE_HERO_ID });
        }
      }

      data.onboarding.grantVersion = this.ONBOARDING_GRANT_VERSION;
    }

    // --- 4. 레거시 스타터 정리 (소급 지급 뒤에 실행해야 이관 대상이 확보된다) ---
    this._migrateLegacyStarters(data);

    // --- 5. 현재 파티 보장 (편성이 비어 있으면 보유 영웅으로 채운다) ---
    this.ensureActiveParty(data);

    // 안내 문구의 파티는 자동 편성까지 끝난 최종 편성이어야 한다.
    const notice = data.onboarding?.legacyMigrationNotice;
    if (notice) notice.partyIds = this._readPartySlots(data.parties?.[0]).filter(Boolean);

    return data;
  }

  /**
   * 현재 파티(`parties[0]`)에 보유 영웅이 하나도 없으면 전투력 상위 4명으로 자동 편성한다.
   * 신규 계정과 마이그레이션 계정 모두 파티 편성 화면이 비어 보이지 않도록 보장한다.
   *
   * 배열 형식과 `{ heroIds: [...] }` 형식을 모두 지원하며, 원래 형식을 유지한 채 채운다.
   *
   * @param {Object} data - 저장 데이터 (in-place)
   * @param {number} [slotIndex=0] - 대상 파티 슬롯
   * @returns {boolean} 실제로 편성을 변경했는지 여부
   */
  static ensureActiveParty(data, slotIndex = 0) {
    if (!data || !Array.isArray(data.characters) || data.characters.length === 0) return false;
    if (!Array.isArray(data.parties)) data.parties = [];

    const party = data.parties[slotIndex];
    const ownedIds = new Set(data.characters.map(c => c.characterId || c.id));
    const slots = this._readPartySlots(party);

    // 보유 영웅이 한 명이라도 편성되어 있으면 그대로 둔다
    if (slots.some(id => id && ownedIds.has(id))) return false;

    const top = this._sortByStrength(data.characters)
      .slice(0, this.PARTY_SIZE)
      .map(c => c.characterId || c.id);
    const filled = Array.from({ length: this.PARTY_SIZE }, (_, i) => top[i] || null);

    data.parties[slotIndex] = this._writePartySlots(party, filled);
    GameLogger.log('SAVE', '현재 파티 자동 편성', { party: filled.filter(Boolean) });
    return true;
  }

  /**
   * 파티 슬롯 배열 읽기 (배열 / { heroIds } 두 형식 지원)
   * @param {Array|Object} party
   * @returns {Array}
   */
  static _readPartySlots(party) {
    if (Array.isArray(party)) return party;
    if (party && Array.isArray(party.heroIds)) return party.heroIds;
    return [];
  }

  /**
   * 파티 슬롯 배열 쓰기 — 원본과 같은 형식을 유지한다
   * @param {Array|Object} party - 원본 파티 (형식 판별용)
   * @param {Array} slots
   * @returns {Array|Object}
   */
  static _writePartySlots(party, slots) {
    if (party && !Array.isArray(party) && Array.isArray(party.heroIds)) {
      return { ...party, heroIds: slots };
    }
    return slots;
  }

  /**
   * 레거시 스타터(char_1~4) 정리.
   *
   * char_1~4는 폐지된 플레이스홀더로, 포트레이트가 구버전 카툰 이미지(hero_001~004)다.
   * 보유 자산은 살리고 캐릭터 레코드만 제거한다.
   *   1. characters[]에서 레거시 제거
   *   2. 최고 레벨/누적 경험치를 보유 영웅에게 이관 (보유 영웅이 없으면 base_iris 지급)
   *   3. 장착 장비는 해제해 인벤토리로 반환
   *   4. 파티 슬롯의 레거시 id를 보유 영웅으로 교체, 남는 칸은 null
   *
   * `onboarding.legacyMigratedAt`으로 완료를 표시하며, 레거시가 없으면 아무것도 하지 않는다(멱등).
   *
   * @param {Object} data - 저장 데이터 (in-place)
   * @returns {boolean} 실제로 정리를 수행했는지 여부
   */
  static _migrateLegacyStarters(data) {
    if (!data || !Array.isArray(data.characters)) return false;

    const legacy = data.characters.filter(c => this._isLegacyStarter(c));
    if (legacy.length === 0) return false;

    // 1. 레거시 레코드 제거
    data.characters = data.characters.filter(c => !this._isLegacyStarter(c));

    // 2. 이관 대상 확보 — 남은 영웅이 없으면 base_iris를 지급한다
    if (data.characters.length === 0) {
      this._grantStarterHero(data);
    }

    // 3. 레벨/경험치 이관 — 최고 레벨은 승계하되 대상의 상한을 넘지 않는다
    const heir = this._pickStrongestCharacter(data.characters);
    if (heir) {
      const bestLegacyLevel = legacy.reduce((max, c) => Math.max(max, c.level || 1), 1);
      const maxLevel = this._getMaxLevelFor(heir.characterId || heir.id);
      heir.level = Math.min(maxLevel, Math.max(heir.level || 1, bestLegacyLevel));
      heir.exp = (heir.exp || 0) + legacy.reduce((sum, c) => sum + (c.exp || 0), 0);
    }

    // 4. 장비 해제 → 인벤토리 반환
    const equipmentReturned = this._releaseLegacyEquipment(data, legacy);

    // 5. 파티 슬롯 재구성
    this._rebuildPartiesWithoutLegacy(data);

    if (!data.onboarding || typeof data.onboarding !== 'object') {
      data.onboarding = this._createDefaultOnboarding();
    }
    data.onboarding.legacyMigratedAt = Date.now();

    // 6. 1회성 안내 예약 — 보유 영웅이 예고 없이 줄어든 이유를 한 번은 말해야 한다 (QA P1-5).
    //    표시와 소거는 MainMenuScene 이 consumeLegacyMigrationNotice() 로 한다.
    data.onboarding.legacyMigrationNotice = {
      removedCount: legacy.length,
      removedIds: legacy.map(c => c.characterId || c.id).filter(Boolean),
      heirId: heir ? (heir.characterId || heir.id) : null,
      heirLevel: heir ? (heir.level || 1) : 0,
      equipmentReturned,
      partyIds: this._readPartySlots(data.parties?.[0]).filter(Boolean),
      at: Date.now()
    };
    if (data.statistics) {
      data.statistics.charactersCollected = data.characters.length;
    }

    GameLogger.log('SAVE', '레거시 스타터 정리', {
      removed: legacy.map(c => c.characterId || c.id),
      heir: heir ? (heir.characterId || heir.id) : null
    });

    return true;
  }

  /**
   * 레거시 스타터 판정. id 목록과 과거 마이그레이션이 남긴 태그를 함께 본다.
   * @param {Object} character
   * @returns {boolean}
   */
  static _isLegacyStarter(character) {
    if (!character) return false;
    if (character.legacyStarter === true) return true;
    return this.LEGACY_STARTER_IDS.includes(character.characterId || character.id);
  }

  /**
   * 보유 영웅 중 가장 강한 1명 선택.
   * 전투력 공식(ProgressionSystem)은 SaveManager를 역참조하므로 import할 수 없다.
   * 세이브 레코드만으로 계산 가능한 성급 → 레벨 → 경험치 순 근사를 쓴다.
   * @param {Array} characters
   * @returns {Object|null}
   */
  static _pickStrongestCharacter(characters) {
    return this._sortByStrength(characters)[0] || null;
  }

  /**
   * 보유 영웅을 강한 순으로 정렬한 새 배열 반환
   * @param {Array} characters
   * @returns {Array}
   */
  static _sortByStrength(characters) {
    return (Array.isArray(characters) ? characters : [])
      .filter(Boolean)
      .slice()
      .sort((a, b) =>
        (b.stars || 0) - (a.stars || 0) ||
        (b.level || 0) - (a.level || 0) ||
        (b.exp || 0) - (a.exp || 0)
      );
  }

  /**
   * 캐릭터의 레벨 상한 조회 (기본영웅 30 / 전직영웅 60)
   * @param {string} characterId
   * @returns {number}
   */
  static _getMaxLevelFor(characterId) {
    const ascended = this.getAscendedHeroData(characterId);
    if (ascended && ascended.maxLevel) return ascended.maxLevel;
    const base = this.getBaseHeroData(characterId);
    if (base && base.maxLevel) return base.maxLevel;
    return 60;
  }

  /**
   * 레거시 캐릭터가 장착 중이던 장비를 해제해 인벤토리로 되돌린다.
   * 장비 실체는 이미 `inventory.equipment`에 있으므로 소유 표시만 끊는다.
   * @param {Object} data - 저장 데이터 (in-place)
   * @param {Array} legacyCharacters
   * @returns {number} 가방으로 돌아간 장비 수 (안내 문구가 쓴다)
   */
  static _releaseLegacyEquipment(data, legacyCharacters) {
    const stock = Array.isArray(data.inventory?.equipment) ? data.inventory.equipment : [];
    const legacyIds = new Set(
      legacyCharacters.map(c => c.characterId || c.id).filter(Boolean)
    );
    const returned = new Set();

    legacyCharacters.forEach(character => {
      const slots = character.equipment || {};
      Object.values(slots).forEach(equipId => {
        if (!equipId) return;
        returned.add(equipId);
        const item = stock.find(e => e && e.id === equipId);
        if (item) item.equippedBy = null;
      });
      character.equipment = { weapon: null, armor: null, accessory: null };
      character.equipped = null;
    });

    // 레거시를 가리키는 잔여 소유 표시도 함께 정리한다
    stock.forEach(item => {
      if (item && legacyIds.has(item.equippedBy)) {
        item.equippedBy = null;
        returned.add(item.id);
      }
    });

    return returned.size;
  }

  /**
   * 파티 슬롯에서 레거시/미보유 id를 제거하고 보유 영웅으로 채운다.
   * 배열 형식과 `{ heroIds: [...] }` 형식을 모두 지원한다.
   * @param {Object} data - 저장 데이터 (in-place)
   */
  static _rebuildPartiesWithoutLegacy(data) {
    const ownedIds = new Set(data.characters.map(c => c.characterId || c.id));
    const ranked = this._sortByStrength(data.characters).map(c => c.characterId || c.id);

    const rebuildSlots = slots => {
      const kept = slots.map(id => (id && ownedIds.has(id) ? id : null));
      const used = new Set(kept.filter(Boolean));
      const spare = ranked.filter(id => !used.has(id));
      return kept.map(id => (id ? id : spare.shift() || null));
    };

    if (!Array.isArray(data.parties) || data.parties.length === 0) {
      data.parties = [rebuildSlots([null, null, null, null])];
      return;
    }

    data.parties = data.parties.map(party => {
      if (Array.isArray(party)) return rebuildSlots(party);
      if (party && Array.isArray(party.heroIds)) {
        return { ...party, heroIds: rebuildSlots(party.heroIds) };
      }
      return party;
    });
  }

  /**
   * 대상 객체에 없는 키만 기본값으로 채운다 (기존 값은 보존)
   * @param {Object} target
   * @param {Object} defaults
   */
  static _fillMissingKeys(target, defaults) {
    Object.keys(defaults).forEach(key => {
      if (target[key] === undefined) target[key] = defaults[key];
    });
  }

  /**
   * T-C2: base_iris 확정 지급 (멱등)
   * characters / baseHeroes / parties 세 곳을 동시에 정합화한다.
   * @param {Object} data - 저장 데이터 (in-place)
   * @returns {boolean} 실제로 지급했는지 여부
   */
  static _grantStarterHero(data) {
    const heroId = this.STARTER_BASE_HERO_ID;
    if (!Array.isArray(data.characters)) data.characters = [];
    if (!Array.isArray(data.baseHeroes)) data.baseHeroes = [];

    let granted = false;

    if (!data.characters.some(c => c && (c.characterId || c.id) === heroId)) {
      data.characters.push(this._createStarterHeroRecord());
      if (!data.statistics) data.statistics = {};
      data.statistics.charactersCollected = (data.statistics.charactersCollected || 0) + 1;
      granted = true;
    }

    if (!data.baseHeroes.some(h => h && h.baseHeroId === heroId)) {
      data.baseHeroes.push({ baseHeroId: heroId, fragmentCount: 0, openedRoutes: [] });
    }

    // 편성된 영웅이 하나도 없을 때만 1인 파티를 만든다 (기존 편성은 건드리지 않는다)
    const hasAnyMember = Array.isArray(data.parties) &&
      data.parties.some(p => Array.isArray(p) && p.some(slot => !!slot));
    if (!hasAnyMember) {
      data.parties = [[heroId, null, null, null]];
    }

    // 마이그레이션 밖(파티 화면 폴백)에서도 호출되므로 섹션 존재를 보장한다
    if (!data.onboarding || typeof data.onboarding !== 'object') {
      data.onboarding = this._createDefaultOnboarding();
    }
    data.onboarding.starterHeroGranted = true;
    data.onboarding.starterHeroId = heroId;

    return granted;
  }

  /**
   * COLL-02: 세계수의 씨앗 증감
   * @param {number} amount - 증가량 (음수 불가)
   * @returns {number} 증가 후 보유량
   */
  static addWorldTreeSeeds(amount) {
    const data = this.load();
    const gain = Math.max(0, Math.floor(amount || 0));
    data.resources.worldTreeSeeds = (data.resources.worldTreeSeeds || 0) + gain;
    this.save(data);
    return data.resources.worldTreeSeeds;
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
   * 레거시 통합 1회성 안내를 꺼내고 즉시 소거한다 (QA P1-5).
   *
   * 읽기만 하고 플래그를 남기면 메인 메뉴에 들어올 때마다 같은 안내가 뜬다.
   * 그래서 **꺼내는 순간 지우고 저장**한다. 저장에 실패하면 안내도 하지 않는다
   * (다음 진입에 다시 시도하는 편이, 알린 뒤 플래그가 살아남는 것보다 낫다).
   *
   * @returns {Object|null} 안내 내용. 없으면 null
   */
  static consumeLegacyMigrationNotice() {
    try {
      const data = this.load();
      const notice = data?.onboarding?.legacyMigrationNotice;
      if (!notice) return null;

      delete data.onboarding.legacyMigrationNotice;
      if (!this.save(data)) return null;

      GameLogger.log('SAVE', '레거시 통합 안내 소비', { removed: notice.removedCount });
      return notice;
    } catch (error) {
      console.warn('SaveManager: 레거시 통합 안내 조회 실패', error?.message);
      return null;
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
    // 얕은 병합은 기본값의 onboarding(지급 완료 상태)을 그대로 물려준다.
    // 구세이브가 소급 지급 분기를 타도록, 원본에 없던 섹션은 병합 후 제거한다.
    const hadOnboarding = !!(oldData && oldData.onboarding);
    const newData = { ...this.getDefaultSave(), ...oldData };
    newData.version = this.VERSION;
    if (!hadOnboarding) {
      delete newData.onboarding;
      if (!oldData?.tutorial) delete newData.tutorial;
      if (!oldData?.story) delete newData.story;
      // 신규 계정 확정 지급분(base_iris 레코드/파티/baseHeroes)이 구세이브에 새어들면
      // 소급 지급 판정이 왜곡된다. 원본에 없던 항목은 빈 상태로 되돌린다.
      if (!Array.isArray(oldData?.characters)) newData.characters = [];
      if (!Array.isArray(oldData?.baseHeroes)) newData.baseHeroes = [];
      if (!Array.isArray(oldData?.parties)) newData.parties = [];
    }
    // COLL-01/COLL-02: 얕은 병합으로 덮인 resources/collections 기본값 재보장
    this._migrateCollectionSchema(newData);
    // T-S2/BLK-05: 얕은 병합으로 덮인 gacha.freeTenPullUsed 기본값 재보장
    this._migrateGachaSchema(newData);
    // T-C1: v1 → v2 온보딩/튜토리얼/스토리 섹션 마이그레이션
    this._migrateOnboardingSchema(newData);
    // SND-01: settings.audio 기본값 보강 (구세이브는 얕은 병합으로 settings 를 통째로 덮어쓴다)
    this._migrateAudioSettingsSchema(newData);
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
    // 폐지된 레거시 스타터는 지급하지 않는다.
    // 지급해도 다음 로드에서 정리되므로 조용히 사라지는 레코드가 생긴다.
    if (this.LEGACY_STARTER_IDS.includes(characterId)) {
      GameLogger.log('SAVE', '레거시 스타터 지급 차단', { characterId });
      return { duplicate: false, character: null, blocked: true };
    }

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
   * T-C2: 신규 계정 확정 지급 기본영웅 레코드 생성 (base_iris 1인)
   * 레거시 char_1~4 스타터는 폐지되었다 (SYSTEM_ONBOARDING_ECONOMY §1-1 옵션 B).
   * @returns {Object} 캐릭터 인스턴스
   */
  static _createStarterHeroRecord() {
    const heroId = this.STARTER_BASE_HERO_ID;
    const now = Date.now();
    return {
      id: heroId,
      instanceId: `${heroId}_starter_${now}`,
      characterId: heroId,
      level: 1,
      exp: 0,
      stars: getRarityStars('R'),
      skillLevels: [1, 1, 1],
      equipped: null,
      equipment: { weapon: null, armor: null, accessory: null },
      constellation: 0,
      acquiredAt: now,
      isBaseHero: true
    };
  }

  /**
   * 캐릭터 기본 등급 조회
   * @param {string} characterId 캐릭터 ID
   * @returns {number} 기본 성급
   */
  static getBaseStars(characterId) {
    // characters.json에서 rarity 필드 직접 참조 (레거시 숫자 등급)
    const char = SaveManager._charactersData?.characters?.find(c => c.id === characterId);
    if (char && char.rarity) {
      return typeof char.rarity === 'number' ? char.rarity : getRarityStars(char.rarity);
    }
    // 전직영웅(asc_*)/기본영웅(base_*) 조회 — 문자열 등급을 성급으로 변환
    const ascended = SaveManager.getAscendedHeroData(characterId);
    if (ascended && ascended.rarity) return getRarityStars(ascended.rarity);
    const base = SaveManager.getBaseHeroData(characterId);
    if (base) return getRarityStars(base.rarity || 'R');
    // fallback: 보유 캐릭터 데이터에서 조회
    const data = this.load();
    const owned = data.characters?.find(c => c.id === characterId);
    if (owned && owned.stars) return owned.stars;
    return 1;
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
      data.gacha.pityCounter = (data.gacha.pityCounter || 0) + pulls;
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

  // ========== 피티 시스템 (CHAR-5) ==========

  /**
   * 특정 기본영웅의 현재 피티 카운트 조회
   * @param {string} heroId 기본영웅 ID
   * @returns {number} 현재 피티 카운트 (0 이상)
   */
  static getPityCount(heroId) {
    const data = this.load();
    return data.pity?.[heroId]?.count || 0;
  }

  /**
   * 특정 기본영웅의 피티 카운트 증가
   * @param {string} heroId 기본영웅 ID
   * @param {number} amount 증가량 (기본값: 1)
   */
  static incrementPityCount(heroId, amount = 1) {
    const data = this.load();
    if (!data.pity) data.pity = {};
    if (!data.pity[heroId]) data.pity[heroId] = { count: 0 };
    data.pity[heroId].count += amount;
    this.save(data);
  }

  /**
   * 특정 기본영웅의 피티 카운트 초기화
   * @param {string} heroId 기본영웅 ID
   */
  static resetPityCount(heroId) {
    const data = this.load();
    if (!data.pity) data.pity = {};
    data.pity[heroId] = { count: 0 };
    this.save(data);
  }

  /**
   * 특정 기본영웅의 피티 정보 종합 조회
   * @param {string} heroId 기본영웅 ID
   * @returns {Object} { count, isSoftPity, isHardPity, pullsUntilSoft, pullsUntilHard, currentRate }
   */
  static getPityInfo(heroId) {
    const count = this.getPityCount(heroId);
    return {
      count,
      isSoftPity: PitySystem.isSoftPity(count),
      isHardPity: PitySystem.isHardPity(count),
      pullsUntilSoft: PitySystem.getPullsUntilSoftPity(count),
      pullsUntilHard: PitySystem.getPullsUntilHardPity(count),
      currentRate: PitySystem.calculateDropRate(count)
    };
  }

  // ========== 진화 시스템 (CHAR-3) ==========

  /**
   * 전체 기본영웅 데이터 반환 (JSON 원본)
   * @returns {Array} base-heroes.json baseHeroes 배열
   */
  static getAllBaseHeroes() {
    return baseHeroesData.baseHeroes || [];
  }

  /**
   * 특정 기본영웅 데이터 조회
   * @param {string} baseHeroId
   * @returns {Object|null}
   */
  static getBaseHeroData(baseHeroId) {
    return (baseHeroesData.baseHeroes || []).find(h => h.id === baseHeroId) || null;
  }

  /**
   * 특정 전직영웅 데이터 조회
   * @param {string} ascendedHeroId
   * @returns {Object|null}
   */
  static getAscendedHeroData(ascendedHeroId) {
    const heroes = ascendedHeroesData.ascendedHeroes || ascendedHeroesData;
    if (Array.isArray(heroes)) {
      return heroes.find(h => h.id === ascendedHeroId) || null;
    }
    // 객체형 구조 대비
    return heroes[ascendedHeroId] || null;
  }

  /**
   * 기관 데이터 조회
   * @param {string} cultId
   * @returns {Object|null}
   */
  static getCultData(cultId) {
    return (cultsData.cults || {})[cultId] || null;
  }

  /**
   * 보유 전직영웅 목록 조회
   * @returns {Array} ascendedHeroes 배열
   */
  static getOwnedAscendedHeroes() {
    const data = this.load();
    return data.ascendedHeroes || [];
  }

  /**
   * 특정 전직영웅 보유 여부 확인
   * @param {string} ascendedHeroId
   * @returns {boolean}
   */
  static hasAscendedHero(ascendedHeroId) {
    const owned = this.getOwnedAscendedHeroes();
    return owned.some(h => h.ascendedHeroId === ascendedHeroId);
  }

  /**
   * 각인 가능 여부 확인
   * - 비용: fragmentsRequired 기본영웅 조각 + spiritStonesRequired 정령석(gems로 대체)
   * - 이미 보유한 루트는 불가
   * @param {string} baseHeroId
   * @param {string} cultId
   * @returns {{ canAscend: boolean, reason: string }}
   */
  static canAscend(baseHeroId, cultId) {
    const heroData = this.getBaseHeroData(baseHeroId);
    if (!heroData) {
      return { canAscend: false, reason: '기본영웅 데이터 없음' };
    }

    const route = (heroData.ascensionRoutes || []).find(r => r.cultId === cultId);
    if (!route) {
      return { canAscend: false, reason: '해당 기관 각인 루트 없음' };
    }

    // 이미 보유 중인지 확인
    if (this.hasAscendedHero(route.ascendedHeroId)) {
      return { canAscend: false, reason: '이미 각인된 루트' };
    }

    // 비용 확인: fragmentsRequired 조각 + spiritStonesRequired 정령석 (gems)
    const data = this.load();
    const fragmentCount = (data.resources.characterShards || {})[baseHeroId] || 0;
    const gemsCount = data.resources.gems || 0;
    const fragRequired = heroData.fragmentsRequired || 30;
    const stonesRequired = heroData.spiritStonesRequired || 3;

    if (fragmentCount < fragRequired) {
      return {
        canAscend: false,
        reason: `조각 부족 (보유: ${fragmentCount}/${fragRequired}개)`
      };
    }
    if (gemsCount < stonesRequired) {
      return {
        canAscend: false,
        reason: `정령석(젬) 부족 (보유: ${gemsCount}/${stonesRequired}개)`
      };
    }

    return { canAscend: true, reason: 'OK', route, fragRequired, stonesRequired };
  }

  /**
   * 각인 실행
   * - 재화 차감 후 ascendedHeroes 배열에 추가
   * - characters 배열에도 등록 (기존 HeroListPopup 호환)
   * @param {string} baseHeroId
   * @param {string} cultId
   * @returns {{ success: boolean, ascendedHero?: Object, error?: string }}
   */
  static performAscension(baseHeroId, cultId) {
    const check = this.canAscend(baseHeroId, cultId);
    if (!check.canAscend) {
      return { success: false, error: check.reason };
    }

    const heroData = this.getBaseHeroData(baseHeroId);
    const route = check.route;
    const data = this.load();

    // 재화 차감
    if (!data.resources.characterShards) data.resources.characterShards = {};
    data.resources.characterShards[baseHeroId] = (data.resources.characterShards[baseHeroId] || 0) - check.fragRequired;
    data.resources.gems -= check.stonesRequired;
    data.statistics.totalGemsSpent += check.stonesRequired;

    // 전직영웅 레코드 생성
    const now = Date.now();
    const ascendedHeroRecord = {
      ascendedHeroId: route.ascendedHeroId,
      baseHeroId,
      cultId,
      rarity: route.resultRarity,
      resonanceBoost: route.resonanceBoost || false,
      obtainedAt: now
    };

    // ascendedHeroes 배열이 없으면 초기화
    if (!data.ascendedHeroes) data.ascendedHeroes = [];
    data.ascendedHeroes.push(ascendedHeroRecord);

    // characters 배열에도 등록 (HeroListPopup 호환)
    const existingChar = data.characters.find(c => c.characterId === route.ascendedHeroId);
    if (!existingChar) {
      const ascendedData = this.getAscendedHeroData(route.ascendedHeroId);
      const rarityStars = { 'SSR': 5, 'SR': 4, 'R': 3 };
      data.characters.push({
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
        sourceCultId: cultId
      });
      data.statistics.charactersCollected++;
    }

    // CHAR-5: 각인 성공 시 해당 영웅의 피티 카운터 리셋
    if (!data.pity) data.pity = {};
    data.pity[baseHeroId] = { count: 0 };

    this.save(data);

    GameLogger.log('ASCENSION', `각인 완료: ${baseHeroId} → ${route.ascendedHeroId} (${cultId})`);

    return { success: true, ascendedHero: ascendedHeroRecord };
  }
}

// 캐릭터 데이터 정적 참조
SaveManager._charactersData = charactersData;
