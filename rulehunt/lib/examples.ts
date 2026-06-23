// ── 증거 예시 생성기 ──────────────────────────────────────────
//
// 증거 추리형의 핵심: 시작 시 ✓통과/✗실패 "예시 보드"를 전제로 제공.
// 플레이어는 예시를 보고 규칙을 추론한다.
//
// 예시는 부분 보드(일부 칸만 채움)다:
//  - 전체 정답을 그대로 보여주면 베껴서 풀 수 있으므로 부분만 노출
//  - 단, 5x5 절대 좌표는 유지 (위치 기반 규칙도 추론 가능)
//  - ✓ = 채워진 칸들 사이에 위반 없음 (유효 보드의 부분집합)
//  - ✗ = 채워진 칸들 안에 명확한 위반 포함
//
// 모든 출력은 시드로 결정론적 → 데일리는 전 세계 동일 예시.

import { Board, Cell, RuleDef, SIZE, Tile } from './types';
import { allTiles, cloneBoard, createBoard, hasViolation, solve } from './engine';

export interface Examples {
  valid: Board[];
  invalid: Board[];
}

// ── 시드 PRNG (mulberry32) ─────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 → 32bit 시드 */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 셔플된 타일 순서로 유효 보드 생성 (다양성). 실패 시 정규 해로 폴백 */
function solveVariant(rule: RuleDef, rng: Rng): Board | null {
  return solve(rule, shuffle(allTiles(), rng)) ?? solve(rule);
}

function randCoord(rng: Rng): [number, number] {
  return [Math.floor(rng() * SIZE), Math.floor(rng() * SIZE)];
}

/** count개의 서로 다른 좌표 */
function pickCoords(rng: Rng, count: number): Set<string> {
  const set = new Set<string>();
  let guard = 0;
  while (set.size < count && guard < 500) {
    guard++;
    const [r, c] = randCoord(rng);
    set.add(`${r},${c}`);
  }
  return set;
}

/** 전체 보드에서 keep 좌표만 남긴 부분 보드 */
function keepSubset(board: Board, keep: Set<string>): Board {
  const out = createBoard();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (keep.has(`${r},${c}`)) out[r][c] = board[r][c] ? { ...(board[r][c] as Tile) } : null;
    }
  }
  return out;
}

/** 위반 중인 셀 좌표 목록 */
function violatingCoords(board: Board, rule: RuleDef): string[] {
  const out: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] && rule.cellViolates(board, r, c)) out.push(`${r},${c}`);
    }
  }
  return out;
}

function sameTile(a: Cell, b: Tile): boolean {
  return a != null && a.color === b.color && a.shape === b.shape;
}

/** 유효 보드의 한 칸을 바꿔 위반을 만들고, 위반 셀 목록과 함께 반환 */
function mutateToViolation(
  base: Board,
  rule: RuleDef,
  rng: Rng
): { board: Board; violating: string[] } | null {
  const tiles = allTiles();
  for (let attempt = 0; attempt < 60; attempt++) {
    const [r, c] = randCoord(rng);
    const t = tiles[Math.floor(rng() * tiles.length)];
    if (sameTile(base[r][c], t)) continue;
    const nb = cloneBoard(base);
    nb[r][c] = { ...t };
    if (hasViolation(nb, rule)) {
      return { board: nb, violating: violatingCoords(nb, rule) };
    }
  }
  return null;
}

/**
 * 규칙에 대한 증거 예시 생성.
 * @param seed 결정론적 시드 (같은 시드 → 같은 예시)
 * @param validCount ✓ 예시 수 (기본 3)
 * @param invalidCount ✗ 예시 수 (기본 2)
 */
export function generateExamples(
  rule: RuleDef,
  seed: number,
  validCount = 3,
  invalidCount = 2
): Examples {
  const rng = mulberry32(seed);

  // 서로 다른 유효 전체 보드 몇 개 확보
  const fulls: Board[] = [];
  for (let i = 0; i < validCount + 1; i++) {
    const v = solveVariant(rule, rng);
    if (v) fulls.push(v);
  }
  if (fulls.length === 0) return { valid: [], invalid: [] };

  // ✓ 예시: 유효 보드의 부분집합 (위반 없음 보장)
  const valid: Board[] = [];
  for (let k = 0; k < validCount; k++) {
    const base = fulls[k % fulls.length];
    const n = 9 + Math.floor(rng() * 4); // 9~12칸
    valid.push(keepSubset(base, pickCoords(rng, n)));
  }

  // ✗ 예시: 위반 셀 + 주변 일부를 남겨 위반이 보이도록
  const invalid: Board[] = [];
  let guard = 0;
  while (invalid.length < invalidCount && guard < 80) {
    guard++;
    const base = fulls[Math.floor(rng() * fulls.length)];
    const mut = mutateToViolation(base, rule, rng);
    if (!mut) continue;
    const keep = new Set<string>(mut.violating);
    const extra = 7 + Math.floor(rng() * 4); // 위반셀 + 추가 맥락
    for (const coord of pickCoords(rng, extra)) keep.add(coord);
    const ex = keepSubset(mut.board, keep);
    if (hasViolation(ex, rule)) invalid.push(ex);
  }

  return { valid, invalid };
}
