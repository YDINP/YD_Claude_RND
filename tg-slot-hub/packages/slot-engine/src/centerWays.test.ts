import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from './schema.js'
import { evaluateCenterWays } from './centerWays.js'
import { evaluateWays } from './ways.js'
import { buildGrid, spin } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import { VOID_CELL } from './shape.js'
import type { SymbolId } from './types.js'

const AURORA = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../games/aurora-ice-palace/math.json', import.meta.url), 'utf8')),
)
/** 총 베팅 50 → 길당 베팅 1. */
const PER_WAY = 1
/** 릴마다 다른 채움 그림. 어느 둘도 이웃 릴에 함께 없어 우연한 당첨이 없다. */
const FILL = ['feather', 'flake', 'gem_violet', 'icicle', 'bead']
const HEIGHTS = [3, 4, 5, 4, 3]

/** 릴별 칸 목록(위→아래) → `grid[row][reel]`. 모자란 칸은 그 릴 채움 그림, 판 밖은 VOID. */
function board(columns: SymbolId[][]): SymbolId[][] {
  const grid: SymbolId[][] = []
  for (let row = 0; row < 5; row += 1) {
    grid.push(
      HEIGHTS.map((height, reel) => (row >= height ? VOID_CELL : (columns[reel]?.[row] ?? FILL[reel] ?? 'bead'))),
    )
  }
  return grid
}

describe('evaluateCenterWays: 가운데부터 양쪽', () => {
  it('왼쪽 3릴(1·2·3번 릴): 길 수 = 릴별 칸 수 곱', () => {
    const { wins } = evaluateCenterWays(board([['bear'], ['bear', 'bear'], ['bear']]), AURORA, PER_WAY)
    expect(wins).toHaveLength(1)
    expect(wins[0]).toMatchObject({ symbol: 'bear', count: 3, ways: 2, multiplier: 113, win: 226, direction: 'center', line: -1 })
  })

  it('가운데 3릴과 오른쪽 3릴', () => {
    const middle = evaluateCenterWays(board([[], ['owl'], ['owl', 'owl'], ['owl']]), AURORA, PER_WAY).wins
    expect(middle[0]).toMatchObject({ symbol: 'owl', count: 3, ways: 2, win: 180 })
    const right = evaluateCenterWays(board([[], [], ['fox'], ['fox'], ['fox', 'fox', 'fox']]), AURORA, PER_WAY).wins
    expect(right[0]).toMatchObject({ symbol: 'fox', count: 3, ways: 3, win: 204 })
  })

  it('4릴(두 가지)과 5릴', () => {
    const leftFour = evaluateCenterWays(board([['bear'], ['bear'], ['bear'], ['bear']]), AURORA, PER_WAY).wins
    expect(leftFour[0]).toMatchObject({ count: 4, ways: 1, win: 271 })
    const rightFour = evaluateCenterWays(board([[], ['bear'], ['bear'], ['bear'], ['bear']]), AURORA, PER_WAY).wins
    expect(rightFour[0]).toMatchObject({ count: 4, ways: 1, win: 271 })
    const five = evaluateCenterWays(
      board([['bear', 'bear'], ['bear'], ['bear', 'bear', 'bear'], ['bear'], ['bear']]),
      AURORA,
      PER_WAY,
    ).wins
    expect(five[0]).toMatchObject({ count: 5, ways: 6, win: 6 * 678 })
  })

  it('가운데 릴에 없으면 양쪽이 다 맞아도 지급 없음', () => {
    const { wins, totalWin } = evaluateCenterWays(
      board([['bear'], ['bear'], [], ['bear'], ['bear']]),
      AURORA,
      PER_WAY,
    )
    expect(wins).toEqual([])
    expect(totalWin).toBe(0)
  })

  it('끊긴 쪽은 거기서 멈춘다: 왼쪽 0·오른쪽 2면 오른쪽 3릴', () => {
    const { wins } = evaluateCenterWays(board([['bear'], [], ['bear'], ['bear'], ['bear']]), AURORA, PER_WAY)
    expect(wins[0]).toMatchObject({ count: 3, ways: 1 })
    expect(wins[0]?.positions.map(([reel]) => reel)).toEqual([2, 3, 4])
  })

  it('좌표는 가운데 → 왼쪽1 → 오른쪽1 → 왼쪽2 → 오른쪽2 순서', () => {
    const { wins } = evaluateCenterWays(
      board([['owl'], ['owl'], ['owl', 'owl'], ['owl'], ['owl']]),
      AURORA,
      PER_WAY,
    )
    expect(wins[0]?.positions).toEqual([
      [2, 0],
      [2, 1],
      [1, 0],
      [3, 0],
      [0, 0],
      [4, 0],
    ])
  })

  it('와일드만으로 된 길은 챔피언(곰) 하나로만 지급한다', () => {
    const { wins } = evaluateCenterWays(board([[], ['wild'], ['wild'], ['wild']]), AURORA, PER_WAY)
    // 순수 와일드 경로 1개는 곰만 받는다. 가운데 릴 보라 보석(4칸)은 와일드가 낀 4경로만 받는다.
    expect(wins.find((win) => win.symbol === 'bear')).toMatchObject({ count: 3, ways: 1, win: 113 })
    expect(wins.find((win) => win.symbol === 'gem_violet')).toMatchObject({ count: 3, ways: 4 })
    expect(wins.filter((win) => win.symbol === 'owl' || win.symbol === 'fox')).toEqual([])
  })

  it('와일드와 그림이 섞이면 그림 길 + 순수 와일드 길은 챔피언에서만', () => {
    // 곰이 아닌 여우 줄: 순수 와일드 경로(1)는 빠지고 여우 칸이 낀 경로만 남는다.
    const { wins } = evaluateCenterWays(board([[], ['wild', 'fox'], ['wild'], ['wild']]), AURORA, PER_WAY)
    const fox = wins.find((win) => win.symbol === 'fox')
    const bear = wins.find((win) => win.symbol === 'bear')
    expect(fox).toMatchObject({ count: 3, ways: 1 })
    expect(bear).toMatchObject({ count: 3, ways: 1 })
  })

  it('판 밖 칸(VOID)은 어떤 후보에도 맞지 않는다', () => {
    const grid = board([['bear'], ['bear'], ['bear']])
    // 바깥 릴 3번째 행 아래는 VOID다. 그 칸이 있어도 길 수는 그대로.
    expect(grid[3]?.[0]).toBe(VOID_CELL)
    expect(evaluateCenterWays(grid, AURORA, PER_WAY).wins[0]?.ways).toBe(1)
  })

  it('evaluateWays는 from: center 팩에서 같은 결과를 낸다', () => {
    const rng = createSeededRng('center-dispatch')
    for (let i = 0; i < 200; i += 1) {
      const stops = AURORA.strips.map((strip) => rng.nextInt(strip.length))
      const grid = buildGrid(AURORA, stops)
      expect(evaluateWays(grid, AURORA, PER_WAY)).toEqual(evaluateCenterWays(grid, AURORA, PER_WAY))
    }
  })

  it('buildGrid는 릴별 높이 밖을 VOID로 채운다', () => {
    const grid = buildGrid(AURORA, [0, 0, 0, 0, 0])
    expect(grid.map((row) => row.map((cell) => cell === VOID_CELL))).toEqual([
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
      [true, false, false, false, true],
      [true, true, false, true, true],
    ])
  })

  it('유료 스핀 판에 VOID가 아닌 칸은 정확히 19칸', () => {
    const rng = createSeededRng('aurora-cells')
    for (let i = 0; i < 50; i += 1) {
      const result = spin(AURORA, { totalBet: 50 }, rng)
      expect(result.grid.flat().filter((cell) => cell !== VOID_CELL)).toHaveLength(19)
    }
  })
})
