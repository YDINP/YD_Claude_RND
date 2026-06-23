// ── 로컬 진행 상태: 스트릭 + 일별 결과 (localStorage) ─────────────
//
// 서버 없이 클라이언트에서만 동작. SSR 안전 가드 포함.

import { starRating } from './engine';
import { TOTAL_STAGES } from './stages';

const KEY = 'rulehunt:v1';

export interface DayResult {
  /** 제출 횟수 (증거 추리형 점수) */
  attempts: number;
  cleared: boolean;
}

export interface StageState {
  /** 스테이지번호 -> 최고 별등급(1~3) */
  bestStars: Record<number, number>;
  /** 해금된 최대 스테이지 번호 (1-based) */
  maxUnlocked: number;
}

export interface SaveState {
  /** dateStr -> 결과 */
  results: Record<string, DayResult>;
  currentStreak: number;
  maxStreak: number;
  /** 마지막으로 클리어한 KST 날짜 */
  lastClearedDate: string | null;
  /** 스테이지 모드 진행 */
  stages: StageState;
}

const EMPTY: SaveState = {
  results: {},
  currentStreak: 0,
  maxStreak: 0,
  lastClearedDate: null,
  stages: { bestStars: {}, maxUnlocked: 1 },
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
    return {
      ...EMPTY,
      ...parsed,
      results: parsed.results ?? {},
      stages: {
        bestStars: parsed.stages?.bestStars ?? {},
        maxUnlocked: parsed.stages?.maxUnlocked ?? 1,
      },
    };
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

// ── 스테이지 모드 ──────────────────────────────────────────────

export function getStageState(): StageState {
  return loadState().stages;
}

export function isStageUnlocked(stageNumber: number): boolean {
  return stageNumber <= loadState().stages.maxUnlocked;
}

export function getStageStars(stageNumber: number): number {
  return loadState().stages.bestStars[stageNumber] ?? 0;
}

/** 스테이지 클리어 기록 + 다음 스테이지 해금. 별등급은 제출 횟수 기반 */
export function recordStageClear(stageNumber: number, submits: number): SaveState {
  const state = loadState();
  const stars = starRating(submits);
  const prevStars = state.stages.bestStars[stageNumber] ?? 0;
  state.stages.bestStars[stageNumber] = Math.max(prevStars, stars);
  state.stages.maxUnlocked = Math.min(
    TOTAL_STAGES,
    Math.max(state.stages.maxUnlocked, stageNumber + 1)
  );
  persist(state);
  return state;
}
