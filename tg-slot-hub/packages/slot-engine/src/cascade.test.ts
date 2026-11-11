import { describe, expect, it } from 'vitest'
import { applyCascadeStep, foldCascades } from './cascade.js'
import type { CascadeStep, GridPosition, SymbolId } from './types.js'

function step(index: number, removed: GridPosition[], refill: SymbolId[][]): CascadeStep {
  return { index, wins: [], removed, refill, multiplier: 1, stepWin: 0 }
}

// grid[row][reel], 4릴 x 3행
const GRID: SymbolId[][] = [
  ['a', 'b', 'c', 'a'],
  ['a', 'a', 'b', 'c'],
  ['b', 'a', 'c', 'b'],
]

describe('applyCascadeStep', () => {
  it('지운 칸 위의 심볼이 아래로 내려오고 위 빈자리를 refill이 위→아래로 채운다', () => {
    // 릴 1의 아래 두 칸(row 1, 2)을 지운다 → b가 맨 아래로, 위 두 칸이 x, y
    const next = applyCascadeStep(GRID, step(0, [[1, 1], [1, 2]], [[], ['x', 'y'], [], []]))
    expect(next.map((row) => row[1])).toEqual(['x', 'y', 'b'])
    // 다른 릴은 그대로
    expect(next.map((row) => row[0])).toEqual(['a', 'a', 'b'])
    expect(next.map((row) => row[3])).toEqual(['a', 'c', 'b'])
  })

  it('L자 그룹처럼 여러 릴에 걸친 제거를 릴마다 따로 내린다', () => {
    // a 그룹: [0,0] [0,1] [1,1] [1,2]
    const next = applyCascadeStep(
      GRID,
      step(0, [[0, 0], [0, 1], [1, 1], [1, 2]], [['p', 'q'], ['r', 's'], [], []]),
    )
    expect(next).toEqual([
      ['p', 'r', 'c', 'a'],
      ['q', 's', 'b', 'c'],
      ['b', 'b', 'c', 'b'],
    ])
  })

  it('가운데 칸을 지우면 위 칸만 한 칸 내려온다', () => {
    const next = applyCascadeStep(GRID, step(0, [[2, 1]], [[], [], ['z'], []]))
    expect(next.map((row) => row[2])).toEqual(['z', 'c', 'c'])
  })

  it('릴 전체를 지우면 refill만 남는다', () => {
    const next = applyCascadeStep(GRID, step(0, [[3, 0], [3, 1], [3, 2]], [[], [], [], ['u', 'v', 'w']]))
    expect(next.map((row) => row[3])).toEqual(['u', 'v', 'w'])
  })

  it('입력 그리드를 바꾸지 않는다', () => {
    const before = JSON.stringify(GRID)
    applyCascadeStep(GRID, step(0, [[0, 0]], [['x'], [], [], []]))
    expect(JSON.stringify(GRID)).toBe(before)
  })

  it('중복 좌표는 한 번만 지운다', () => {
    const next = applyCascadeStep(GRID, step(0, [[0, 2], [0, 2]], [['x'], [], [], []]))
    expect(next.map((row) => row[0])).toEqual(['x', 'a', 'a'])
  })

  it('refill 길이가 지운 칸 수와 다르면 던진다', () => {
    expect(() => applyCascadeStep(GRID, step(0, [[0, 0]], [[], [], [], []]))).toThrow(RangeError)
    expect(() => applyCascadeStep(GRID, step(0, [], [['x'], [], [], []]))).toThrow(RangeError)
  })

  it('그리드 밖 좌표나 릴 수가 다른 refill은 던진다', () => {
    expect(() => applyCascadeStep(GRID, step(0, [[4, 0]], [[], [], [], []]))).toThrow(RangeError)
    expect(() => applyCascadeStep(GRID, step(0, [[0, 3]], [['x'], [], [], []]))).toThrow(RangeError)
    expect(() => applyCascadeStep(GRID, step(0, [], [[], [], []]))).toThrow(RangeError)
  })
})

describe('foldCascades', () => {
  it('단계를 순서대로 접는다', () => {
    const steps = [
      step(0, [[1, 1], [1, 2]], [[], ['x', 'y'], [], []]),
      // 앞 단계 결과의 릴 1은 [x, y, b]. 맨 위 x를 지운다
      step(1, [[1, 0]], [[], ['k'], [], []]),
    ]
    const final = foldCascades(GRID, steps)
    expect(final.map((row) => row[1])).toEqual(['k', 'y', 'b'])
    expect(final).toEqual(applyCascadeStep(applyCascadeStep(GRID, steps[0] as CascadeStep), steps[1] as CascadeStep))
  })

  it('단계가 없으면 같은 내용의 복사본이다', () => {
    const final = foldCascades(GRID, [])
    expect(final).toEqual(GRID)
    expect(final).not.toBe(GRID)
  })
})
