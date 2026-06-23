// ── 보드 엔진: 생성/조작/평가/판정/솔버 ──────────────────────────

import { Board, Cell, RuleDef, SIZE, Tile, COLORS, SHAPES } from './types';

/** 빈 5x5 보드 생성 */
export function createBoard(): Board {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => null as Cell)
  );
}

/** 깊은 복제 */
export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** 불변 방식 타일 배치 (새 보드 반환) */
export function placeTile(board: Board, r: number, c: number, tile: Tile | null): Board {
  const next = cloneBoard(board);
  next[r][c] = tile;
  return next;
}

/** 채워진 칸 수 */
export function filledCount(board: Board): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell) n++;
  return n;
}

/** 보드가 가득 찼는가 */
export function isFull(board: Board): boolean {
  return filledCount(board) === SIZE * SIZE;
}

/**
 * 셀별 피드백 그리드.
 * - null  : 빈 칸 (피드백 없음)
 * - true  : 규칙 준수 (초록)
 * - false : 규칙 위반 (빨강)
 */
export type Feedback = (boolean | null)[][];

export function evaluate(board: Board, rule: RuleDef): Feedback {
  return board.map((row, r) =>
    row.map((cell, c) => (cell ? !rule.cellViolates(board, r, c) : null))
  );
}

/** 위반 셀이 하나라도 있는가 */
export function hasViolation(board: Board, rule: RuleDef): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] && rule.cellViolates(board, r, c)) return true;
    }
  }
  return false;
}

/** 클리어 판정: 가득 찼고, 어떤 칸도 위반하지 않음 */
export function isClear(board: Board, rule: RuleDef): boolean {
  return isFull(board) && !hasViolation(board, rule);
}

/**
 * 별 등급 (1~3성).
 * 제출 횟수가 적을수록 높은 등급 (증거 추리형: 적은 제출 = 명확한 추론).
 */
export function starRating(submits: number): 1 | 2 | 3 {
  if (submits <= 2) return 3;
  if (submits <= 5) return 2;
  return 1;
}

/** 16종 타일 전체 (색×모양) */
export function allTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of COLORS) for (const shape of SHAPES) tiles.push({ color, shape });
  return tiles;
}

/** 폭주 방지용 백트래킹 스텝 상한 */
const SOLVE_STEP_CAP = 5_000_000;

/**
 * 백트래킹 솔버.
 * 규칙이 풀이 가능한지 검증하고, 검증/예시용 샘플 정답을 생성한다.
 * 모든 규칙이 지역 위반 기반이므로 가지치기가 효과적이다.
 * @param tileOrder 시도할 타일 순서 (예시 다양성을 위해 셔플 가능). 기본 = allTiles()
 * @returns 가득 찬 클리어 보드, 없으면 null (불가능하거나 스텝 상한 초과)
 */
export function solve(rule: RuleDef, tileOrder?: Tile[]): Board | null {
  const board = createBoard();
  const tiles = tileOrder ?? allTiles();
  let steps = 0;

  function backtrack(idx: number): boolean {
    if (idx === SIZE * SIZE) return true;
    if (++steps > SOLVE_STEP_CAP) return false;
    const r = Math.floor(idx / SIZE);
    const c = idx % SIZE;
    for (const tile of tiles) {
      board[r][c] = tile;
      if (!rule.cellViolates(board, r, c)) {
        // 새 타일이 기존 채워진 이웃의 위반을 유발하지 않는지도 확인
        if (!introducesViolation(board, rule, r, c) && backtrack(idx + 1)) {
          return true;
        }
      }
      board[r][c] = null;
    }
    return false;
  }

  return backtrack(0) ? board : null;
}

/**
 * (r,c)에 막 놓은 타일이, 이미 채워진 인접/관련 칸들의 위반을 새로 만드는지 검사.
 * 보드를 좌상→우하 순으로 채우므로 "이전에 채워진 칸들"만 영향받는다.
 */
function introducesViolation(board: Board, rule: RuleDef, r: number, c: number): boolean {
  for (let rr = 0; rr <= r; rr++) {
    for (let cc = 0; cc < SIZE; cc++) {
      if (rr === r && cc > c) continue;
      if (board[rr][cc] && rule.cellViolates(board, rr, cc)) return true;
    }
  }
  return false;
}
