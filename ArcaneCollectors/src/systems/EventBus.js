/**
 * EventBus - 게임 전역 이벤트 시스템
 * 게임 내 모듈 간 느슨한 결합을 위한 Pub/Sub 패턴 구현
 */

/**
 * 이벤트 버스 싱글톤
 */
export const EventBus = {
  /**
   * 등록된 이벤트 리스너 저장소
   * @type {Object.<string, Array<Function>>}
   */
  events: {},

  /**
   * 일회성 이벤트 리스너 저장소
   * @type {Object.<string, Array<Function>>}
   */
  onceEvents: {},

  /**
   * 이벤트 리스너 등록
   * @param {string} event 이벤트 이름
   * @param {Function} callback 콜백 함수
   * @returns {Function} 구독 해제 함수
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);

    // 구독 해제 함수 반환
    return () => this.off(event, callback);
  },

  /**
   * 일회성 이벤트 리스너 등록
   * @param {string} event 이벤트 이름
   * @param {Function} callback 콜백 함수
   */
  once(event, callback) {
    if (!this.onceEvents[event]) {
      this.onceEvents[event] = [];
    }
    this.onceEvents[event].push(callback);
  },

  /**
   * 이벤트 리스너 해제
   * @param {string} event 이벤트 이름
   * @param {Function} callback 콜백 함수
   */
  off(event, callback) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
    if (this.onceEvents[event]) {
      this.onceEvents[event] = this.onceEvents[event].filter(cb => cb !== callback);
    }
  },

  /**
   * 특정 이벤트의 모든 리스너 해제
   * @param {string} event 이벤트 이름
   */
  offAll(event) {
    delete this.events[event];
    delete this.onceEvents[event];
  },

  /**
   * 이벤트 발생 (리스너들에게 전달)
   * @param {string} event 이벤트 이름
   * @param {*} data 전달할 데이터
   */
  emit(event, data) {
    // 일반 리스너 실행
    if (this.events[event]) {
      this.events[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus: ${event} 핸들러 오류`, error);
        }
      });
    }

    // 일회성 리스너 실행 후 제거
    if (this.onceEvents[event]) {
      const onceCallbacks = [...this.onceEvents[event]];
      this.onceEvents[event] = [];

      onceCallbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus: ${event} once 핸들러 오류`, error);
        }
      });
    }

    // 디버그 로깅 (개발 모드에서만)
    if (typeof window !== 'undefined' && window.DEBUG_EVENTS) {
      console.log(`[EventBus] ${event}`, data);
    }
  },

  /**
   * 모든 이벤트 리스너 초기화
   */
  clear() {
    this.events = {};
    this.onceEvents = {};
  },

  /**
   * 특정 이벤트의 리스너 수 조회
   * @param {string} event 이벤트 이름
   * @returns {number} 리스너 수
   */
  listenerCount(event) {
    const regular = this.events[event]?.length || 0;
    const once = this.onceEvents[event]?.length || 0;
    return regular + once;
  },

  /**
   * 등록된 모든 이벤트 목록 조회
   * @returns {Array<string>} 이벤트 이름 배열
   */
  getEventNames() {
    const regularEvents = Object.keys(this.events);
    const onceEventNames = Object.keys(this.onceEvents);
    return [...new Set([...regularEvents, ...onceEventNames])];
  },

  /**
   * 디버그 모드 활성화
   */
  enableDebug() {
    if (typeof window !== 'undefined') {
      window.DEBUG_EVENTS = true;
    }
  },

  /**
   * 디버그 모드 비활성화
   */
  disableDebug() {
    if (typeof window !== 'undefined') {
      window.DEBUG_EVENTS = false;
    }
  }
};

/**
 * 게임 이벤트 상수
 * 타입 안전성과 일관성을 위한 이벤트 이름 정의
 */
export const GameEvents = {
  // ========== 리소스 관련 ==========
  /** 리소스 변경 (골드, 젬 등) */
  RESOURCE_CHANGED: 'resource_changed',

  // ========== 캐릭터 관련 ==========
  /** 새 캐릭터 획득 */
  CHARACTER_ADDED: 'character_added',
  /** 캐릭터 레벨업 */
  LEVEL_UP: 'level_up',
  /** 캐릭터 각성 */
  EVOLVE: 'evolve',
  /** 스킬 강화 */
  SKILL_ENHANCED: 'skill_enhanced',
  /** 캐릭터 장비 변경 */
  EQUIPMENT_CHANGED: 'equipment_changed',

  // ========== 전투 관련 ==========
  /** 전투 시작 */
  BATTLE_START: 'battle_start',
  /** 전투 종료 */
  BATTLE_END: 'battle_end',
  /** 턴 시작 */
  TURN_START: 'turn_start',
  /** 턴 종료 */
  TURN_END: 'turn_end',
  /** 스킬 사용 */
  SKILL_USED: 'skill_used',
  /** 유닛 피해 */
  UNIT_DAMAGED: 'unit_damaged',
  /** 유닛 회복 */
  UNIT_HEALED: 'unit_healed',
  /** 유닛 사망 */
  UNIT_DIED: 'unit_died',

  // ========== 진행 관련 ==========
  /** 스테이지 클리어 */
  STAGE_CLEARED: 'stage_cleared',
  /** 챕터 완료 */
  CHAPTER_COMPLETED: 'chapter_completed',
  /** 업적 달성 */
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',

  // ========== 퀘스트 관련 ==========
  /** 퀘스트 진행도 업데이트 */
  QUEST_PROGRESS: 'quest_progress',
  /** 퀘스트 완료 */
  QUEST_COMPLETE: 'quest_complete',
  /** 퀘스트 보상 수령 */
  QUEST_REWARD_CLAIMED: 'quest_reward_claimed',
  /** 일일 퀘스트 리셋 */
  DAILY_RESET: 'daily_reset',

  // ========== 가챠 관련 ==========
  /** 소환 시작 */
  GACHA_START: 'gacha_start',
  /** 소환 완료 */
  GACHA_COMPLETE: 'gacha_complete',
  /** 천장 도달 */
  PITY_REACHED: 'pity_reached',
  /** SSR 획득 */
  SSR_OBTAINED: 'ssr_obtained',

  // ========== UI 관련 ==========
  /** 화면 전환 */
  SCREEN_CHANGED: 'screen_changed',
  /** 모달 열림 */
  MODAL_OPENED: 'modal_opened',
  /** 모달 닫힘 */
  MODAL_CLOSED: 'modal_closed',
  /** 토스트 메시지 표시 */
  TOAST_SHOW: 'toast_show',
  /** 로딩 시작 */
  LOADING_START: 'loading_start',
  /** 로딩 완료 */
  LOADING_END: 'loading_end',

  // ========== 시스템 관련 ==========
  /** 게임 초기화 완료 */
  GAME_INITIALIZED: 'game_initialized',
  /** 저장 완료 */
  GAME_SAVED: 'game_saved',
  /** 저장 로드 완료 */
  GAME_LOADED: 'game_loaded',
  /** 설정 변경 */
  SETTINGS_CHANGED: 'settings_changed',
  /** 오프라인 보상 수령 */
  OFFLINE_REWARDS_CLAIMED: 'offline_rewards_claimed',
  /** 에러 발생 */
  ERROR_OCCURRED: 'error_occurred'
};

/**
 * 이벤트 데이터 타입 정의 (문서화 용도)
 *
 * RESOURCE_CHANGED: { type: string, amount: number, newTotal: number }
 * CHARACTER_ADDED: { characterId: string, rarity: string, isNew: boolean }
 * LEVEL_UP: { characterId: string, newLevel: number, levelsGained: number }
 * BATTLE_END: { outcome: string, stars: number, rewards: object }
 * QUEST_COMPLETE: { questId: string, questName: string }
 * GACHA_COMPLETE: { results: array, pityInfo: object }
 * TOAST_SHOW: { message: string, type: 'success'|'error'|'info', duration: number }
 */

/**
 * 이벤트 유틸리티 함수들
 */
export const EventUtils = {
  /**
   * 리소스 변경 이벤트 발생
   * @param {string} type 리소스 타입
   * @param {number} amount 변경량
   * @param {number} newTotal 새 총량
   */
  emitResourceChange(type, amount, newTotal) {
    EventBus.emit(GameEvents.RESOURCE_CHANGED, { type, amount, newTotal });
  },

  /**
   * 토스트 메시지 표시
   * @param {string} message 메시지
   * @param {string} type 타입 ('success', 'error', 'info')
   * @param {number} duration 표시 시간 (ms)
   */
  showToast(message, type = 'info', duration = 3000) {
    EventBus.emit(GameEvents.TOAST_SHOW, { message, type, duration });
  },

  /**
   * 에러 이벤트 발생
   * @param {string} source 에러 발생 위치
   * @param {Error|string} error 에러 정보
   */
  emitError(source, error) {
    EventBus.emit(GameEvents.ERROR_OCCURRED, {
      source,
      message: error instanceof Error ? error.message : error,
      timestamp: Date.now()
    });
  },

  /**
   * 로딩 상태 변경
   * @param {boolean} isLoading 로딩 중 여부
   * @param {string} context 컨텍스트 (어디서 로딩 중인지)
   */
  setLoading(isLoading, context = 'default') {
    const event = isLoading ? GameEvents.LOADING_START : GameEvents.LOADING_END;
    EventBus.emit(event, { context });
  }
};

// 전역 접근 (개발/디버깅 용도)
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
  window.GameEvents = GameEvents;
}
