// ── 오늘의 규칙 (Rule Hunt) 도메인 타입 ──────────────────────────

export type Color = 'red' | 'blue' | 'yellow' | 'green';
export type Shape = 'circle' | 'triangle' | 'square' | 'star';

export interface Tile {
  color: Color;
  shape: Shape;
}

/** 빈 칸은 null */
export type Cell = Tile | null;

/** 5x5 보드. board[row][col] */
export type Board = Cell[][];

export const SIZE = 5;

export const COLORS: Color[] = ['red', 'blue', 'yellow', 'green'];
export const SHAPES: Shape[] = ['circle', 'triangle', 'square', 'star'];

export type Theme = 'color' | 'shape' | 'position' | 'adjacency' | 'combo';
export type Grade = 'easy' | 'medium' | 'hard';

/**
 * 규칙 정의.
 *
 * 핵심 모델: 모든 규칙은 "지역 위반(cellViolates)" 단위로 표현된다.
 * - cellViolates(board, r, c): 현재 보드 상태에서 (r,c) 타일이 규칙을 깨고 있으면 true
 *   → UI 피드백에서 빨강. 빈 칸이나 위반 없으면 초록.
 * - satisfied(board): 보드가 가득 찼고 어떤 칸도 위반하지 않으면 true → 클리어.
 *
 * 이 구조 덕분에 "보드가 규칙을 만족 ⟹ 모든 채워진 칸이 초록" 불변식이 자동 보장된다.
 */
export interface RuleDef {
  id: string;
  /** 요일 테마 분류 */
  theme: Theme;
  grade: Grade;
  /** 내부용 자연어 설명 (플레이어에게는 클리어 전까지 숨김) */
  description: string;
  /** 클리어 후 공개되는 규칙 문구 */
  reveal: string;
  /** 3단계 힌트: [범주, 범위, 직접 서술] */
  hints: [string, string, string];
  /** (r,c)의 채워진 타일이 지금 규칙을 위반하는가 */
  cellViolates: (board: Board, r: number, c: number) => boolean;
}
