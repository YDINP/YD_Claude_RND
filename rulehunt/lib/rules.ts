// ── 규칙 풀 (MVP: 초급 7 + 중급 7 = 14) ───────────────────────────
//
// 모든 규칙은 "지역 위반(cellViolates)" 기반.
// 대칭 제약(인접 등)은 위반에 관여한 양쪽 칸이 모두 빨강으로 표시된다.
// 모든 규칙은 가득 찬 5x5 보드에서 풀이 가능하도록 설계됨 (engine.solve로 검증).

import { Board, RuleDef, SIZE } from './types';

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

function isEdge(r: number, c: number): boolean {
  return r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1;
}

// ── 규칙 정의 ──────────────────────────────────────────────────
export const RULES: RuleDef[] = [
  // ───────── 초급 ─────────
  {
    id: 'e1-red-circle',
    theme: 'combo',
    grade: 'easy',
    description: '빨간 타일은 반드시 원이어야 한다.',
    reveal: '빨간 타일은 모두 원(●) 모양이어야 합니다.',
    hints: ['이 규칙은 색과 모양에 관한 것입니다.', '특정 색의 모양이 정해져 있습니다.', '빨간 타일은 원이어야 합니다.'],
    cellViolates: (b, r, c) => {
      const t = b[r][c]!;
      return t.color === 'red' && t.shape !== 'circle';
    },
  },
  {
    id: 'e2-no-star',
    theme: 'shape',
    grade: 'easy',
    description: '별 모양 타일은 놓을 수 없다.',
    reveal: '별(★) 모양 타일은 보드에 놓을 수 없습니다.',
    hints: ['이 규칙은 모양에 관한 것입니다.', '특정 모양이 금지됩니다.', '별 모양은 금지입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.shape === 'star',
  },
  {
    id: 'e3-green-square',
    theme: 'combo',
    grade: 'easy',
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
    description: '파란 타일은 짝수 열(0,2,4)에만 놓을 수 있다.',
    reveal: '파란 타일은 짝수 번째 열(1·3·5번째)에만 올 수 있습니다.',
    hints: ['이 규칙은 색과 위치에 관한 것입니다.', '특정 색의 열이 제한됩니다.', '파란 타일은 짝수 열에만 놓입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.color === 'blue' && c % 2 !== 0,
  },
  {
    id: 'e5-no-yellow',
    theme: 'color',
    grade: 'easy',
    description: '노란 타일은 놓을 수 없다.',
    reveal: '노란 타일은 보드에 놓을 수 없습니다.',
    hints: ['이 규칙은 색에 관한 것입니다.', '특정 색이 금지됩니다.', '노란색은 금지입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.color === 'yellow',
  },
  {
    id: 'e6-triangle-top-row',
    theme: 'position',
    grade: 'easy',
    description: '삼각형 타일은 맨 윗줄(0행)에만 놓을 수 있다.',
    reveal: '삼각형(▲) 타일은 맨 윗줄에만 올 수 있습니다.',
    hints: ['이 규칙은 모양과 위치에 관한 것입니다.', '특정 모양의 행이 제한됩니다.', '삼각형은 맨 윗줄에만 놓입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.shape === 'triangle' && r !== 0,
  },
  {
    id: 'e7-circle-edge',
    theme: 'position',
    grade: 'easy',
    description: '원 타일은 보드 가장자리에만 놓을 수 있다.',
    reveal: '원(●) 타일은 보드 가장자리(테두리)에만 올 수 있습니다.',
    hints: ['이 규칙은 모양과 위치에 관한 것입니다.', '특정 모양이 가장자리로 제한됩니다.', '원은 가장자리에만 놓입니다.'],
    cellViolates: (b, r, c) => b[r][c]!.shape === 'circle' && !isEdge(r, c),
  },

  // ───────── 중급 ─────────
  {
    id: 'm1-no-adjacent-same-color',
    theme: 'adjacency',
    grade: 'medium',
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
];

export function getRuleById(id: string): RuleDef | undefined {
  return RULES.find((r) => r.id === id);
}
