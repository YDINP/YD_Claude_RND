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

import { Board, Cell, COLORS, RuleDef, SHAPES, SIZE, Tile } from './types';
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

// ── 최소 대조쌍(minimal pair) ──────────────────────────────────
// ✓와 ✗가 "딱 한 칸만 다른" 보드가 되도록 만든다.
// 그 한 칸이 규칙의 트리거를 정확히 드러내므로(예: 빨강 원 vs 빨강 사각형),
// ✓ 예시도 해답의 근거가 된다.

function hamming(a: Tile, b: Tile): number {
  return (a.color !== b.color ? 1 : 0) + (a.shape !== b.shape ? 1 : 0);
}

function kingWindowCoords(r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push([nr, nc]);
    }
  }
  return out;
}

function allCellCoords(): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) out.push([r, c]);
  return out;
}

/**
 * 유효 보드 V에서 "한 칸만 바꾸면 위반이 되는" 자리와 (정답 타일, 위반 타일)을 찾는다.
 * 위반 타일 b의 트리거 속성(색/모양)을 유지한 채 한 속성만 고친 정답 g를 우선 선택
 * → ✓는 g(예: 빨강 원), ✗는 b(예: 빨강 사각형)로 규칙이 또렷이 드러난다.
 */
function findDiscriminatingPair(
  V: Board,
  rule: RuleDef,
  rng: Rng
): { r: number; c: number; good: Tile; bad: Tile } | null {
  const cells = shuffle(allCellCoords(), rng);
  const tiles = shuffle(allTiles(), rng);

  for (const [r, c] of cells) {
    const orig = V[r][c];
    const validAt = (t: Tile): boolean => {
      V[r][c] = t;
      const ok = !hasViolation(V, rule);
      V[r][c] = orig;
      return ok;
    };

    for (const bad of tiles) {
      if (validAt(bad)) continue; // 위반 타일이어야 함
      // 1) bad의 색 유지 + 모양만 바꿔 정답이 되는지 (모양 규칙 트리거)
      let good: Tile | null = null;
      for (const s of SHAPES) {
        if (s === bad.shape) continue;
        const g: Tile = { color: bad.color, shape: s };
        if (validAt(g)) { good = g; break; }
      }
      // 2) 없으면 bad의 모양 유지 + 색만 바꿔 (색 규칙 트리거)
      if (!good) {
        for (const col of COLORS) {
          if (col === bad.color) continue;
          const g: Tile = { color: col, shape: bad.shape };
          if (validAt(g)) { good = g; break; }
        }
      }
      if (good) return { r, c, good, bad };
    }
  }
  return null;
}

/**
 * 규칙에 대한 증거 예시 생성 (최소 대조쌍 기반).
 * valid[i] ↔ invalid[i] 는 딱 한 칸만 다른 쌍.
 * @param seed 결정론적 시드 (같은 시드 → 같은 예시)
 */
export function generateExamples(
  rule: RuleDef,
  seed: number,
  validCount = 3,
  invalidCount = 2
): Examples {
  const rng = mulberry32(seed);
  const need = Math.max(validCount, invalidCount);

  const valid: Board[] = [];
  const invalid: Board[] = [];

  // 1) 최소 대조쌍 생성
  let guard = 0;
  while (valid.length < need && guard < 80) {
    guard++;
    const V = solveVariant(rule, rng);
    if (!V) continue;
    const dp = findDiscriminatingPair(V, rule, rng);
    if (!dp) continue;

    const vGood = cloneBoard(V);
    vGood[dp.r][dp.c] = { ...dp.good };
    const vBad = cloneBoard(V);
    vBad[dp.r][dp.c] = { ...dp.bad };

    const win = new Set<string>([`${dp.r},${dp.c}`]);
    for (const [r, c] of kingWindowCoords(dp.r, dp.c)) win.add(`${r},${c}`);
    // 위반에 실제로 관여한 칸을 모두 포함 → 짝꿍/근거 칸이 항상 보임
    // (좌우 대칭처럼 멀리 떨어진 짝꿍도 화면에 들어오게)
    for (const coord of violatingCoords(vBad, rule)) win.add(coord);
    for (const coord of pickCoords(rng, 5)) win.add(coord);

    const ok = keepSubset(vGood, win);
    const ng = keepSubset(vBad, win);
    if (!hasViolation(ok, rule) && hasViolation(ng, rule)) {
      valid.push(ok);
      invalid.push(ng);
    }
  }

  // 2) 폴백: 부족하면 기존 방식으로 보충 (드묾)
  let pad = 0;
  while (valid.length < validCount && pad < 60) {
    pad++;
    const V = solveVariant(rule, rng);
    if (V) valid.push(keepSubset(V, pickCoords(rng, 10)));
  }
  while (invalid.length < invalidCount && pad < 120) {
    pad++;
    const V = solveVariant(rule, rng);
    if (!V) continue;
    const mut = mutateToViolation(V, rule, rng);
    if (!mut) continue;
    const keep = new Set<string>(mut.violating);
    for (const coord of pickCoords(rng, 8)) keep.add(coord);
    const ex = keepSubset(mut.board, keep);
    if (hasViolation(ex, rule)) invalid.push(ex);
  }

  return { valid: valid.slice(0, validCount), invalid: invalid.slice(0, invalidCount) };
}
