// ── 데일리 시스템: KST 기준 오늘의 규칙 선택 ────────────────────────
//
// 전 세계 동일 규칙. KST(UTC+9) 자정에 리셋.
// 규칙 선택은 KST 날짜 인덱스로 결정론적 → 서버 불필요.

import { RULES } from './rules';
import { RuleDef, Theme } from './types';
import { hashSeed } from './examples';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 서비스 시작일의 KST 날짜 인덱스 기준점 (2026-06-23) */
const LAUNCH_DAY_INDEX = Math.floor(Date.UTC(2026, 5, 23) / 86400000);

/** 요일(0=일~6=토) → 테마 */
const WEEKDAY_THEME: Record<number, Theme> = {
  0: 'combo',      // 일: 하드(복합)
  1: 'color',      // 월: 색
  2: 'shape',      // 화: 모양
  3: 'position',   // 수: 위치
  4: 'adjacency',  // 목: 인접
  5: 'combo',      // 금: 복합
  6: 'adjacency',  // 토: 패턴(인접 계열)
};

export interface DailyInfo {
  /** KST 날짜 문자열 YYYY-MM-DD */
  dateStr: string;
  /** 퍼즐 번호 (#1부터) */
  puzzleNumber: number;
  /** 요일 0=일~6=토 */
  weekday: number;
  rule: RuleDef;
  /** 예시 생성용 결정론적 시드 (전 세계 동일) */
  seed: number;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 주어진 시각(기본=현재)에 대한 KST 날짜 인덱스/문자열/요일 */
export function kstDateParts(now: Date = new Date()) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const dayIndex = Math.floor(Date.UTC(y, m, d) / 86400000);
  const weekday = new Date(Date.UTC(y, m, d)).getUTCDay();
  return { dateStr: `${y}-${pad(m + 1)}-${pad(d)}`, dayIndex, weekday };
}

/** 오늘(혹은 지정 시각)의 데일리 규칙 */
export function getDaily(now: Date = new Date()): DailyInfo {
  const { dateStr, dayIndex, weekday } = kstDateParts(now);
  const theme = WEEKDAY_THEME[weekday];
  const pool = RULES.filter((r) => r.theme === theme);
  const candidates = pool.length > 0 ? pool : RULES;
  // 결정론적 선택: 날짜 인덱스로 풀 안에서 회전
  const idx = ((dayIndex % candidates.length) + candidates.length) % candidates.length;
  return {
    dateStr,
    puzzleNumber: dayIndex - LAUNCH_DAY_INDEX + 1,
    weekday,
    rule: candidates[idx],
    seed: hashSeed(`${dateStr}:${candidates[idx].id}`),
  };
}

/** 다음 KST 자정까지 남은 밀리초 */
export function msUntilNextKstMidnight(now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const nextMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1
  );
  const nowShiftedMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds()
  );
  return nextMidnight - nowShiftedMs;
}
