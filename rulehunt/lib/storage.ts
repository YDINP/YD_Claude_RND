// ── 로컬 진행 상태: 스트릭 + 일별 결과 (localStorage) ─────────────
//
// 서버 없이 클라이언트에서만 동작. SSR 안전 가드 포함.

const KEY = 'rulehunt:v1';

export interface DayResult {
  attempts: number;
  cleared: boolean;
}

export interface SaveState {
  /** dateStr -> 결과 */
  results: Record<string, DayResult>;
  currentStreak: number;
  maxStreak: number;
  /** 마지막으로 클리어한 KST 날짜 */
  lastClearedDate: string | null;
}

const EMPTY: SaveState = {
  results: {},
  currentStreak: 0,
  maxStreak: 0,
  lastClearedDate: null,
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadState(): SaveState {
  if (!isBrowser()) return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    return { ...EMPTY, ...parsed, results: parsed.results ?? {} };
  } catch {
    return { ...EMPTY };
  }
}

function persist(state: SaveState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 용량 초과 등 무시 */
  }
}

/** dateStr 기준 어제 날짜 문자열 */
function prevDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d) - 86400000);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

export function getDayResult(dateStr: string): DayResult | null {
  return loadState().results[dateStr] ?? null;
}

/**
 * 결과 저장 + 스트릭 갱신.
 * 같은 날 이미 클리어했으면 스트릭은 그대로(중복 가산 방지).
 */
export function recordResult(dateStr: string, attempts: number, cleared: boolean): SaveState {
  const state = loadState();
  const already = state.results[dateStr];
  state.results[dateStr] = { attempts, cleared };

  if (cleared && (!already || !already.cleared)) {
    if (state.lastClearedDate === prevDateStr(dateStr)) {
      state.currentStreak += 1;
    } else if (state.lastClearedDate === dateStr) {
      // 같은 날 재기록 — 변화 없음
    } else {
      state.currentStreak = 1;
    }
    state.lastClearedDate = dateStr;
    state.maxStreak = Math.max(state.maxStreak, state.currentStreak);
  }

  persist(state);
  return state;
}

/** 오늘 기준 유효 스트릭 (어제/오늘 클리어가 아니면 0으로 간주) */
export function effectiveStreak(todayStr: string): number {
  const state = loadState();
  if (!state.lastClearedDate) return 0;
  if (state.lastClearedDate === todayStr || state.lastClearedDate === prevDateStr(todayStr)) {
    return state.currentStreak;
  }
  return 0;
}
