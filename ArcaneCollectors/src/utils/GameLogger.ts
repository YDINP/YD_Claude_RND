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
    SCHEMA: { enabled: false, color: '#aaddaa', icon: '📋' },
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
   * 경고 로그 (console.warn 스타일)
   */
  static warn(category: string, message: string, data: any = null): void {
    if (!this._enabled) return;

    const cat = this.categories[category];
    const icon = cat?.icon || '⚠️';
    const color = cat?.color || '#ffaa00';

    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const entry: LogEntry = { timestamp, category, message, data };
    this._history.push(entry);
    if (this._history.length > this._maxHistory) this._history.shift();

    if (data !== null && data !== undefined) {
      console.warn(`%c${icon} [${category}] ${message}`, `color: ${color}; font-weight: bold;`, data);
    } else {
      console.warn(`%c${icon} [${category}] ${message}`, `color: ${color}; font-weight: bold;`);
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
