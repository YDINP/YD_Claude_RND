import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateAnywhere } from './anywhere.js'
import { parseGameMath } from './schema.js'
import type { GameMath } from './schema.js'

const math: GameMath = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../games/volcano-forge/math.json', import.meta.url), 'utf8')),
)

/** 9종을 7개 이하로 돌려 채운 30칸 판(당첨 없음). 필요한 칸만 덮어쓴다. */
function quietGrid(): string[][] {
  const fill = ['sword', 'hammer', 'shield', 'helmet', 'ruby', 'crystal', 'horseshoe', 'ingot', 'coal']
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 6 }, (_, reel) => fill[(row * 6 + reel) % 9] as string))
}

function place(grid: string[][], symbol: string, cells: [number, number][]): string[][] {
  const next = grid.map((row) => [...row])
  for (const [reel, row] of cells) (next[row] as string[])[reel] = symbol
  return next
}

/** 판 전체에서 symbol 개수를 정확히 n개로 만든다(나머지는 겹치지 않는 채움 그림으로). */
function exactly(symbol: string, n: number): string[][] {
  const others = ['hammer', 'shield', 'helmet', 'ruby', 'crystal', 'horseshoe', 'ingot', 'anvil']
  let k = 0
  return Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 6 }, (_, reel) => {
      const index = row * 6 + reel
      if (index < n) return symbol
      const other = others[k % others.length] as string
      k += 1
      return other
    }),
  )
}

describe('evaluateAnywhere (위치 무관 지불)', () => {
  it('당첨 없는 채움 판은 지급이 없다', () => {
    const grid = quietGrid()
    expect(evaluateAnywhere(grid, math, 100, 1)).toEqual({ wins: [], removed: [] })
  })

  it('7개는 미지급, 8개는 8–9 구간을 판 어디에 있든 지급한다', () => {
    const seven = evaluateAnywhere(exactly('coal', 7), math, 100, 1)
    expect(seven.wins).toEqual([])
    const grid = exactly('sword', 8)
    const result = evaluateAnywhere(grid, math, 100, 1)
    expect(result.wins).toHaveLength(1)
    const [win] = result.wins
    expect(win?.symbol).toBe('sword')
    expect(win?.count).toBe(8)
    expect(win?.multiplier).toBe(math.paytable.sword?.[8])
    expect(win?.win).toBe(Math.round((math.paytable.sword?.[8] ?? 0) * 100))
    expect(win?.payKind).toBe('anywhere')
    expect(win?.line).toBe(-1)
    // 위치는 reel, row 오름차순이고 removed와 같다.
    const sorted = [...(win?.positions ?? [])].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(win?.positions).toEqual(sorted)
    expect(result.removed).toEqual(sorted)
  })

  it('개수 구간: 10–11 / 12–14 / 15+ 를 고른다', () => {
    for (const [count, key] of [
      [10, 10],
      [11, 10],
      [12, 12],
      [14, 12],
      [15, 15],
      [22, 15],
    ] as const) {
      const [win] = evaluateAnywhere(exactly('coal', count), math, 100, 1).wins
      expect(win?.count).toBe(count)
      expect(win?.multiplier).toBe(math.paytable.coal?.[key])
    }
  })

  it('두 그림이 동시에 8개 이상이면 둘 다 지급하고 함께 지운다', () => {
    let grid = quietGrid()
    const swords: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [0, 1], [1, 1]]
    const coals: [number, number][] = [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [0, 3], [1, 3], [2, 3]]
    grid = place(grid, 'sword', swords)
    grid = place(grid, 'coal', coals)
    const result = evaluateAnywhere(grid, math, 100, 1)
    const bySymbol = new Map(result.wins.map((win) => [win.symbol, win]))
    expect(bySymbol.get('sword')?.count).toBeGreaterThanOrEqual(8)
    expect(bySymbol.get('coal')?.count).toBeGreaterThanOrEqual(9)
    // 선언 순서(sword 먼저)
    expect(result.wins[0]?.symbol).toBe('sword')
    const union = new Set(result.wins.flatMap((win) => win.positions.map(([reel, row]) => `${reel},${row}`)))
    expect(result.removed.length).toBe(union.size)
  })

  it('스캐터(모루)는 개수가 많아도 지급·제거하지 않는다', () => {
    const grid = exactly('anvil', 12)
    const result = evaluateAnywhere(grid, math, 100, 1)
    expect(result.wins.every((win) => win.symbol !== 'anvil')).toBe(true)
    expect(result.removed.some(([reel, row]) => grid[row]?.[reel] === 'anvil')).toBe(false)
  })

  it('30칸이 한 그림이면 15+ 구간 하나, 30칸 전부 지운다', () => {
    const grid = Array.from({ length: 5 }, () => new Array<string>(6).fill('ruby'))
    const result = evaluateAnywhere(grid, math, 20, 1)
    expect(result.wins).toHaveLength(1)
    expect(result.wins[0]?.count).toBe(30)
    expect(result.wins[0]?.win).toBe(Math.round((math.paytable.ruby?.[15] ?? 0) * 20))
    expect(result.removed).toHaveLength(30)
  })
})
