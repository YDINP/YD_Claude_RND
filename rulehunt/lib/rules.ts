// ── 규칙 풀 ───────────────────────────────────────────────────
//
// 모든 규칙은 "지역 위반(cellViolates)" 기반.
// 대칭 제약(인접 등)은 위반에 관여한 양쪽 칸이 모두 빨강으로 표시된다.
// 모든 규칙은 가득 찬 5x5 보드에서 풀이 가능하도록 설계됨 (engine.solve로 검증).
// difficulty: 스테이지 정렬 및 난이도 곡선용 (작을수록 쉬움).

import { Board, Color, RuleDef, Shape, SIZE } from './types';

// ── 헬퍼 ──────────────────────────────────────────────────────
function orthoNeighbors(r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < SIZE - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < SIZE - 1) out.push([r, c + 1]);
  return out;
}

function diagNeighbors(r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push([nr, nc]);
  }
  return out;
}

function kingNeighbors(r: number, c: number): [number, number][] {
  return [...orthoNeighbors(r, c), ...diagNeighbors(r, c)];
}

function isEdge(r: number, c: number): boolean {
  return r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1;
}

const WARM = new Set<Color>(['red', 'yellow']);
const COOL = new Set<Color>(['blue', 'green']);

/** 색 → 정해진 모양 (g2/x 규칙용) */
const COLOR_SHAPE: Record<Color, Shape> = {
  red: 'circle',
  blue: 'triangle',
  yellow: 'square',
  green: 'star',
};

/** (r,c)를 포함하는 가득 찬 2x2 블록이 모두 같은 색인가 */
function in2x2SameColor(b: Board, r: number, c: number): boolean {
  const corners: [number, number][] = [
    [r - 1, c - 1],
    [r - 1, c],
    [r, c - 1],
    [r, c],
  ];
  const color = b[r][c]!.color;
  for (const [br, bc] of corners) {
    if (br < 0 || bc < 0 || br > SIZE - 2 || bc > SIZE - 2) continue;
    const cells = [b[br][bc], b[br][bc + 1], b[br + 1][bc], b[br + 1][bc + 1]];
    if (cells.every((x) => x != null && x.color === color)) return true;
  }
  return false;
}

/** chessboard(따뜻/차가움) 위반 */
function chessboardViolates(b: Board, r: number, c: number): boolean {
  const color = b[r][c]!.color;
  return (r + c) % 2 === 0 ? !WARM.has(color) : !COOL.has(color);
}

// ── 규칙 정의 ──────────────────────────────────────────────────
export const RULES: RuleDef[] = [
  // ───────── 초급 (단일 속성) ─────────
  {
    id: 'e2-no-star',
    theme: 'shape',
    grade: 'easy',
    difficulty: 1,
    description: '별 모양 타일은 놓을 수 없다.',
    reveal: '별(★) 모양 타일은 보드에 놓을 수 없습니다.',
    hints: ['이 규칙은 모양에 관한 것입니다.', '특정 모양이 금지됩니다.', '별 모양은 금지입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.shape === 'star',
  },
  {
    id: 'e5-no-yellow',
    theme: 'color',
    grade: 'easy',
    difficulty: 1,
    description: '노란 타일은 놓을 수 없다.',
    reveal: '노란 타일은 보드에 놓을 수 없습니다.',
    hints: ['이 규칙은 색에 관한 것입니다.', '특정 색이 금지됩니다.', '노란색은 금지입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.color === 'yellow',
  },
  {
    id: 'e1-red-circle',
    theme: 'combo',
    grade: 'easy',
    difficulty: 2,
    description: '빨간 타일은 반드시 원이어야 한다.',
    reveal: '빨간 타일은 모두 원(●) 모양이어야 합니다.',
    hints: ['이 규칙은 색과 모양에 관한 것입니다.', '특정 색의 모양이 정해져 있습니다.', '빨간 타일은 원이어야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return t.color === 'red' && t.shape !== 'circle';
    },
  },
  {
    id: 'e3-green-square',
    theme: 'combo',
    grade: 'easy',
    difficulty: 2,
    description: '초록 타일은 반드시 사각형이어야 한다.',
    reveal: '초록 타일은 모두 사각형(■) 모양이어야 합니다.',
    hints: ['이 규칙은 색과 모양에 관한 것입니다.', '특정 색의 모양이 정해져 있습니다.', '초록 타일은 사각형이어야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return t.color === 'green' && t.shape !== 'square';
    },
  },
  {
    id: 'e4-blue-even-col',
    theme: 'position',
    grade: 'easy',
    difficulty: 3,
    description: '파란 타일은 짝수 열(0,2,4)에만 놓을 수 있다.',
    reveal: '파란 타일은 짝수 번째 열(1·3·5번째)에만 올 수 있습니다.',
    hints: ['이 규칙은 색과 위치에 관한 것입니다.', '특정 색의 열이 제한됩니다.', '파란 타일은 짝수 열에만 놓입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.color === 'blue' && c % 2 !== 0,
  },
  {
    id: 'e6-triangle-top-row',
    theme: 'position',
    grade: 'easy',
    difficulty: 3,
    description: '삼각형 타일은 맨 윗줄(0행)에만 놓을 수 있다.',
    reveal: '삼각형(▲) 타일은 맨 윗줄에만 올 수 있습니다.',
    hints: ['이 규칙은 모양과 위치에 관한 것입니다.', '특정 모양의 행이 제한됩니다.', '삼각형은 맨 윗줄에만 놓입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.shape === 'triangle' && r !== 0,
  },
  {
    id: 'e7-circle-edge',
    theme: 'position',
    grade: 'easy',
    difficulty: 3,
    description: '원 타일은 보드 가장자리에만 놓을 수 있다.',
    reveal: '원(●) 타일은 보드 가장자리(테두리)에만 올 수 있습니다.',
    hints: ['이 규칙은 모양과 위치에 관한 것입니다.', '특정 모양이 가장자리로 제한됩니다.', '원은 가장자리에만 놓입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.shape === 'circle' && !isEdge(r, c),
  },

  // ───────── 중급 (단일 관계) ─────────
  {
    id: 'm1-no-adjacent-same-color',
    theme: 'adjacency',
    grade: 'medium',
    difficulty: 4,
    description: '상하좌우로 인접한 두 타일은 같은 색일 수 없다.',
    reveal: '상하좌우로 맞닿은 타일은 서로 다른 색이어야 합니다.',
    hints: ['이 규칙은 색과 인접에 관한 것입니다.', '이웃한 타일끼리의 관계입니다.', '맞닿은 타일은 색이 달라야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return orthoNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.color === t.color;
      });
    },
  },
  {
    id: 'm2-no-horizontal-same-shape',
    theme: 'shape',
    grade: 'medium',
    difficulty: 4,
    description: '가로로 인접한 두 타일은 같은 모양일 수 없다.',
    reveal: '좌우로 맞닿은 타일은 서로 다른 모양이어야 합니다.',
    hints: ['이 규칙은 모양과 인접에 관한 것입니다.', '가로 이웃끼리의 관계입니다.', '좌우로 맞닿으면 모양이 달라야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      for (const cc of [c - 1, c + 1]) {
        if (cc >= 0 && cc < SIZE) {
          const n = b[r][cc];
          if (n != null && n.shape === t.shape) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'm3-no-vertical-same-color',
    theme: 'color',
    grade: 'medium',
    difficulty: 4,
    description: '세로로 인접한 두 타일은 같은 색일 수 없다.',
    reveal: '위아래로 맞닿은 타일은 서로 다른 색이어야 합니다.',
    hints: ['이 규칙은 색과 인접에 관한 것입니다.', '세로 이웃끼리의 관계입니다.', '위아래로 맞닿으면 색이 달라야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      for (const rr of [r - 1, r + 1]) {
        if (rr >= 0 && rr < SIZE) {
          const n = b[rr][c];
          if (n != null && n.color === t.color) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'm4-blue-not-adjacent-red',
    theme: 'adjacency',
    grade: 'medium',
    difficulty: 5,
    description: '파란 타일과 빨간 타일은 상하좌우로 인접할 수 없다.',
    reveal: '파란 타일과 빨간 타일은 상하좌우로 맞닿을 수 없습니다.',
    hints: ['이 규칙은 색과 인접에 관한 것입니다.', '두 가지 색의 관계입니다.', '파랑과 빨강은 이웃할 수 없습니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      const other = t.color === 'blue' ? 'red' : t.color === 'red' ? 'blue' : null;
      if (!other) return false;
      return orthoNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.color === other;
      });
    },
  },
  {
    id: 'm5-no-diagonal-same-shape',
    theme: 'adjacency',
    grade: 'medium',
    difficulty: 5,
    description: '대각선으로 인접한 두 타일은 같은 모양일 수 없다.',
    reveal: '대각선으로 맞닿은 타일은 서로 다른 모양이어야 합니다.',
    hints: ['이 규칙은 모양과 대각선에 관한 것입니다.', '대각선 이웃끼리의 관계입니다.', '대각선으로 맞닿으면 모양이 달라야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return diagNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.shape === t.shape;
      });
    },
  },
  {
    id: 'm6-red-circle-blue-square',
    theme: 'combo',
    grade: 'medium',
    difficulty: 5,
    description: '빨간 타일은 원이어야 하고, 파란 타일은 사각형이어야 한다.',
    reveal: '빨간 타일은 원(●), 파란 타일은 사각형(■)이어야 합니다.',
    hints: ['이 규칙은 두 색의 모양에 관한 것입니다.', '색마다 정해진 모양이 있습니다.', '빨강은 원, 파랑은 사각형입니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      if (t.color === 'red' && t.shape !== 'circle') return true;
      if (t.color === 'blue' && t.shape !== 'square') return true;
      return false;
    },
  },
  {
    id: 'm7-strong-adjacency',
    theme: 'adjacency',
    grade: 'medium',
    difficulty: 6,
    description: '상하좌우로 인접한 두 타일은 색과 모양이 모두 달라야 한다.',
    reveal: '맞닿은 타일끼리는 색도 모양도 모두 달라야 합니다.',
    hints: ['이 규칙은 인접에 관한 것입니다.', '맞닿은 타일끼리의 관계입니다.', '이웃은 색과 모양이 모두 달라야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return orthoNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && (n.color === t.color || n.shape === t.shape);
      });
    },
  },

  // ───────── 고급 (조합·패턴) ─────────
  {
    id: 'g4-no-3h-same-color',
    theme: 'color',
    grade: 'hard',
    difficulty: 6,
    description: '같은 색 타일이 가로로 3개 연속될 수 없다.',
    reveal: '같은 색 타일이 가로로 세 칸 연속될 수 없습니다.',
    hints: ['이 규칙은 색과 연속에 관한 것입니다.', '가로 방향의 연속이 제한됩니다.', '같은 색 3연속(가로)은 금지입니다.'],
    cellViolates: (b, r, c) => {
      const col = b[r][c]!.color;
      const same = (cc: number) => cc >= 0 && cc < SIZE && b[r][cc] != null && b[r][cc]!.color === col;
      return (
        (same(c - 1) && same(c - 2)) ||
        (same(c - 1) && same(c + 1)) ||
        (same(c + 1) && same(c + 2))
      );
    },
  },
  {
    id: 'g5-no-2x2-same-color',
    theme: 'color',
    grade: 'hard',
    difficulty: 7,
    description: '2x2 정사각 영역이 모두 같은 색일 수 없다.',
    reveal: '인접한 2×2 네 칸이 모두 같은 색일 수 없습니다.',
    hints: ['이 규칙은 색과 영역에 관한 것입니다.', '정사각 덩어리를 보세요.', '2×2가 한 색으로 채워지면 안 됩니다.'],
    cellViolates: (b, r, c) => in2x2SameColor(b, r, c),
  },
  {
    id: 'g6-shape-zones',
    theme: 'position',
    grade: 'hard',
    difficulty: 7,
    description: '왼쪽 두 열은 원/사각만, 오른쪽 두 열은 삼각/별만 놓을 수 있다.',
    reveal: '왼쪽 두 열은 원·사각형만, 오른쪽 두 열은 삼각형·별만 올 수 있습니다. (가운데 열 자유)',
    hints: ['이 규칙은 모양과 위치에 관한 것입니다.', '보드를 좌/우 구역으로 나눠 보세요.', '좌측은 원·사각, 우측은 삼각·별입니다.'],
    cellViolates: (b, r, c) => {
      const s = b[r][c]!.shape;
      if (c <= 1) return !(s === 'circle' || s === 'square');
      if (c >= 3) return !(s === 'triangle' || s === 'star');
      return false;
    },
  },
  {
    id: 'g1-chessboard-warm-cool',
    theme: 'combo',
    grade: 'hard',
    difficulty: 8,
    description: '체스판처럼 한 칸 걸러 따뜻한 색(빨/노)과 차가운 색(파/초)이 번갈아야 한다.',
    reveal: '체스판 패턴: (행+열)이 짝수인 칸은 따뜻한 색(빨강·노랑), 홀수인 칸은 차가운 색(파랑·초록)이어야 합니다.',
    hints: ['이 규칙은 색과 위치에 관한 것입니다.', '체스판처럼 번갈아 보세요.', '짝수 칸=따뜻한 색, 홀수 칸=차가운 색입니다.'],
    cellViolates: (b, r, c) => chessboardViolates(b, r, c),
  },
  {
    id: 'g3-ortho-color-diag-shape',
    theme: 'adjacency',
    grade: 'hard',
    difficulty: 8,
    description: '상하좌우 이웃과는 색이 다르고, 대각선 이웃과는 모양이 달라야 한다.',
    reveal: '상하좌우 이웃과는 색이, 대각선 이웃과는 모양이 서로 달라야 합니다.',
    hints: ['이 규칙은 두 종류의 이웃 관계입니다.', '상하좌우와 대각선을 따로 보세요.', '상하좌우=색 다름, 대각선=모양 다름.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      const orthoBad = orthoNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.color === t.color;
      });
      if (orthoBad) return true;
      return diagNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.shape === t.shape;
      });
    },
  },
  {
    id: 'g2-color-shape-pairing',
    theme: 'combo',
    grade: 'hard',
    difficulty: 9,
    description: '색마다 정해진 짝 모양이 있다 (빨강=원, 파랑=삼각, 노랑=사각, 초록=별).',
    reveal: '각 색은 정해진 모양과 짝입니다 — 빨강=원, 파랑=삼각형, 노랑=사각형, 초록=별.',
    hints: ['이 규칙은 색과 모양의 짝에 관한 것입니다.', '색을 보면 모양이 정해집니다.', '빨강=원, 파랑=삼각, 노랑=사각, 초록=별.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return t.shape !== COLOR_SHAPE[t.color];
    },
  },

  // ───────── 전문가 (다중 조건) ─────────
  {
    id: 'x1-chessboard-red-circle',
    theme: 'combo',
    grade: 'expert',
    difficulty: 10,
    description: '체스판 색 배치 + 빨간 타일은 원이어야 한다.',
    reveal: '체스판 패턴(짝수 칸=따뜻한 색, 홀수 칸=차가운 색)이면서, 빨간 타일은 원(●)이어야 합니다.',
    hints: ['두 개의 규칙이 동시에 적용됩니다.', '색은 체스판, 그리고 빨강은 모양 제약이 있습니다.', '체스판 색 + 빨강은 원.'],
    cellViolates: (b, r, c) => {
      if (chessboardViolates(b, r, c)) return true;
      const t = b[r][c]!;
      return t.color === 'red' && t.shape !== 'circle';
    },
  },
  {
    id: 'x2-king-color-ortho-shape',
    theme: 'adjacency',
    grade: 'expert',
    difficulty: 11,
    description: '여덟 방향 이웃과 색이 모두 다르고, 상하좌우 이웃과는 모양도 달라야 한다.',
    reveal: '여덟 방향(상하좌우+대각선) 이웃과 색이 모두 다르고, 상하좌우 이웃과는 모양도 달라야 합니다.',
    hints: ['이 규칙은 강한 이웃 제약입니다.', '주변 여덟 칸을 모두 보세요.', '8방향 색 다름 + 상하좌우 모양 다름.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      const colorBad = kingNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.color === t.color;
      });
      if (colorBad) return true;
      return orthoNeighbors(r, c).some(([nr, nc]) => {
        const n = b[nr][nc];
        return n != null && n.shape === t.shape;
      });
    },
  },
];

export function getRuleById(id: string): RuleDef | undefined {
  return RULES.find((r) => r.id === id);
}
