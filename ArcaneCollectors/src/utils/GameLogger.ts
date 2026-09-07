/**
 * GameLogger - 카테고리별 구조화된 디버그 로그
 * 각 카테고리를 개별적으로 on/off 가능
 */

interface CategoryConfig {
  enabled: boolean;
  color: string;
  icon: string;
}

interface LogEntry {
  timestamp: string;
  category: string;
  message: string;
  data: any;
}

class GameLogger {
  static categories: Record<string, CategoryConfig> = {
    BATTLE: { enabled: true, color: '#ff4444', icon: '⚔️' },
    GACHA: { enabled: true, color: '#ffaa00', icon: '🎲' },
    PARTY: { enabled: true, color: '#44aaff', icon: '👥' },
    SAVE: { enabled: true, color: '#44ff44', icon: '💾' },
    ENERGY: { enabled: true, color: '#ffff44', icon: '⚡' },
    SCENE: { enabled: true, color: '#ff88ff', icon: '🎬' },
    SKILL: { enabled: true, color: '#ff6644', icon: '✨' },
    SYNERGY: { enabled: true, color: '#88ffaa', icon: '🔗' },
    UI: { enabled: false, color: '#aaaaaa', icon: '🖥️' },
    DATA: { enabled: false, color: '#8888ff', icon: '📊' },
  };

  static _history: LogEntry[] = [];
  static _maxHistory: number = 500;
  static _enabled: boolean = true; // master switch

  /**
   * 로그 출력
   * @param category - 카테고리 키 (BATTLE, GACHA, etc.)
   * @param message - 로그 메시지
   * @param data - 추가 데이터
   */
  static log(category: string, message: string, data: any = null): void {
    if (!this._enabled) return;
    const cat = this.categories[category];
    if (!cat || !cat.enabled) return;

    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const prefix = `${cat.icon} [${category}]`;

    const entry: LogEntry = { timestamp, category, message, data };
    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    if (data !== null && data !== undefined) {
      console.log(`%c${prefix} ${message}`, `color: ${cat.color}; font-weight: bold;`, data);
    } else {
      console.log(`%c${prefix} ${message}`, `color: ${cat.color}; font-weight: bold;`);
    }
  }

  /**
   * 경고 로그 출력
   *
   * 두 가지 호출 규약을 모두 지원한다(기존 호출부 24곳이 섞어 쓰고 있었음):
   *   1) `GameLogger.warn('PVP', '상대 조회 실패', error)` — log()와 동일한 (category, message, data)
   *   2) `GameLogger.warn('[FriendSystem] state save failed')` — 카테고리 생략, 메시지 하나만
   *
   * `log()`와 달리 `categories[category].enabled` 토글은 보지 않는다. PVP/SCHEMA처럼
   * `categories`에 등록되지 않은 카테고리로 호출되는 경우가 많고, 경고/에러는 카테고리를
   * 꺼뒀다고 조용히 묻히면 안 되는 신호이기 때문이다. 마스터 스위치(`_enabled`)만 존중한다.
   *
   * @param categoryOrMessage - 카테고리 키, 또는 (message 생략 시) 경고 메시지 자체
   * @param message - 경고 메시지 (category를 넘긴 경우)
   * @param data - 추가 데이터
   */
  static warn(categoryOrMessage: string, message?: string, data: any = null): void {
    this._logAtLevel('warn', '⚠️', categoryOrMessage, message, data);
  }

  /**
   * 에러 로그 출력. 규약은 {@link warn}과 동일.
   */
  static error(categoryOrMessage: string, message?: string, data: any = null): void {
    this._logAtLevel('error', '❌', categoryOrMessage, message, data);
  }

  /**
   * warn()/error() 공통 구현
   */
  private static _logAtLevel(
    level: 'warn' | 'error',
    icon: string,
    categoryOrMessage: string,
    message: string | undefined,
    data: any
  ): void {
    if (!this._enabled) return;

    const hasCategory = message !== undefined;
    const category = hasCategory ? categoryOrMessage : level.toUpperCase();
    const msg = hasCategory ? message : categoryOrMessage;

    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const entry: LogEntry = { timestamp, category, message: msg, data };
    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    const prefix = `${icon} [${category}]`;
    if (data !== null && data !== undefined) {
      console[level](prefix, msg, data);
    } else {
      console[level](prefix, msg);
    }
  }

  /**
   * 카테고리 활성/비활성
   */
  static enable(category: string): void {
    if (this.categories[category]) this.categories[category].enabled = true;
  }

  static disable(category: string): void {
    if (this.categories[category]) this.categories[category].enabled = false;
  }

  static enableAll(): void {
    Object.keys(this.categories).forEach(k => this.categories[k].enabled = true);
  }

  static disableAll(): void {
    Object.keys(this.categories).forEach(k => this.categories[k].enabled = false);
  }

  /**
   * 마스터 스위치
   */
  static setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * 최근 로그 이력 조회
   * @param category - 필터할 카테고리
   * @param count - 조회할 개수
   */
  static getHistory(category: string | null = null, count: number = 20): LogEntry[] {
    let history = this._history;
    if (category) {
      history = history.filter(h => h.category === category);
    }
    return history.slice(-count);
  }

  /**
   * 이력 콘솔 출력
   */
  static printHistory(category: string | null = null, count: number = 20): void {
    const entries = this.getHistory(category, count);
    console.group(`📋 Log History (${entries.length} entries)`);
    entries.forEach(e => {
      const cat = this.categories[e.category];
      console.log(`%c[${e.timestamp}] ${cat?.icon || ''} [${e.category}] ${e.message}`,
        `color: ${cat?.color || '#fff'};`, e.data || '');
    });
    console.groupEnd();
  }

  /**
   * 현재 카테고리 상태 표시
   */
  static status(): void {
    console.group('📊 GameLogger Status');
    console.log(`Master: ${this._enabled ? '✅ ON' : '❌ OFF'}`);
    console.log(`History: ${this._history.length}/${this._maxHistory}`);
    Object.entries(this.categories).forEach(([key, val]) => {
      console.log(`  ${val.icon} ${key}: ${val.enabled ? '✅' : '❌'}`);
    });
    console.groupEnd();
  }
}

// 글로벌 접근 (디버그 콘솔에서 사용)
if (typeof window !== 'undefined') {
  (window as any).GameLogger = GameLogger;
}

export default GameLogger;
