import { describe, expect, it } from 'vitest'
import { applyMutations, isProbabilistic } from './mutations.js'
import { createSeededRng } from './rng/seeded.js'
import { parseGameMath, safeParseGameMath } from './schema.js'
import { spin } from './spin.js'
import { makeGrid, makeMutationMath } from './testFixtures.js'

const BASE = {
  id: 'mut',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'w', name: { en: 'Wild' }, wild: true },
    { id: 'q', name: { en: 'Mystery' } },
    { id: 's', name: { en: 'Star' }, scatter: true },
    { id: 'a', name: { en: 'Alpha' } },
    { id: 'b', name: { en: 'Beta' } },
  ],
  strips: [
    ['w', 'q', 'a', 'b', 's', 'a'],
    ['a', 'w', 'q', 'b', 'a', 's'],
    ['b', 'a', 'w', 'q', 's', 'a'],
  ],
  paylines: [
    [1, 1, 1],
    [0, 0, 0],
    [2, 2, 2],
  ],
  paytable: { w: { 3: 100 }, a: { 3: 10, 2: 2 }, b: { 3: 5 } },
  wild: { substitutesFor: 'all' },
  scatter: { symbol: 's', pays: { 3: 5 } },
  betLevels: [3, 30],
  rtpTarget: 0.9,
  volatility: 'medium',
}

function mathWith(mutations: unknown[]): ReturnType<typeof parseGameMath> {
  return parseGameMath({ ...JSON.parse(JSON.stringify(BASE)), mutations })
}

describe('mystery', () => {
  const math = mathWith([{ type: 'mystery', symbol: 'q', weights: { a: 3, b: 1 } }])

  it('화면의 모든 미스터리 칸이 같은 심볼로 바뀐다', () => {
    const grid = makeGrid([
      ['q', 'a', 'q'],
      ['b', 'q', 'a'],
      ['a', 'b', 'b'],
    ])
    const { grid: after, events } = applyMutations(math, grid, createSeededRng('m1'))
    expect(after.flat()).not.toContain('q')
    const revealed = events[0]?.symbol
    expect(revealed).toBeDefined()
    expect(after[0]?.[0]).toBe(revealed)
    expect(after[0]?.[2]).toBe(revealed)
    expect(after[1]?.[1]).toBe(revealed)
  })

  it('바뀐 칸의 before/after를 그대로 보고한다', () => {
    const grid = makeGrid([
      ['q', 'a', 'a'],
      ['b', 'a', 'a'],
      ['a', 'b', 'b'],
    ])
    const { events } = applyMutations(math, grid, createSeededRng('m2'))
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('mystery')
    expect(events[0]?.cells).toHaveLength(1)
    expect(events[0]?.cells[0]).toMatchObject({ position: [0, 0], from: 'q' })
  })

  it('미스터리가 없으면 이벤트도 없고 그리드도 그대로다', () => {
    const grid = makeGrid([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'b', 'a'],
    ])
    const result = applyMutations(math, grid, createSeededRng('m3'))
    expect(result.events).toEqual([])
    expect(result.grid).toEqual(grid)
  })

  it('같은 시드는 같은 심볼을 공개한다', () => {
    const grid = makeGrid([
      ['q', 'a', 'a'],
      ['b', 'a', 'a'],
      ['a', 'b', 'b'],
    ])
    const first = applyMutations(math, makeGrid(grid), createSeededRng('same'))
    const second = applyMutations(math, makeGrid(grid), createSeededRng('same'))
    expect(second.events[0]?.symbol).toBe(first.events[0]?.symbol)
  })

  it('가중치가 큰 심볼이 더 자주 나온다', () => {
    const grid = makeGrid([
      ['q', 'a', 'a'],
      ['b', 'a', 'a'],
      ['a', 'b', 'b'],
    ])
    const rng = createSeededRng('weights')
    let aCount = 0
    const trials = 4000
    for (let i = 0; i < trials; i += 1) {
      const { events } = applyMutations(math, makeGrid(grid), rng)
      if (events[0]?.symbol === 'a') aCount += 1
    }
    // 가중 3:1이므로 a가 약 75%
    expect(aCount / trials).toBeGreaterThan(0.72)
    expect(aCount / trials).toBeLessThan(0.78)
  })

  it('미스터리 심볼에 페이테이블을 주면 스키마가 거부한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(BASE)),
      paytable: { w: { 3: 100 }, a: { 3: 10 }, b: { 3: 5 }, q: { 3: 7 } },
      mutations: [{ type: 'mystery', symbol: 'q', weights: { a: 3 } }],
    })
    expect(result.success).toBe(false)
  })

  it('공개 풀에 스캐터나 와일드를 넣으면 거부한다', () => {
    for (const bad of ['s', 'w']) {
      const result = safeParseGameMath({
        ...JSON.parse(JSON.stringify(BASE)),
        mutations: [{ type: 'mystery', symbol: 'q', weights: { [bad]: 1, a: 3 } }],
      })
      expect(result.success).toBe(false)
    }
  })
})

describe('expandWild', () => {
  const math = mathWith([{ type: 'expandWild', symbol: 'w', reels: [1], minCount: 1 }])

  it('와일드가 있는 릴을 통째로 덮는다', () => {
    const grid = makeGrid([
      ['a', 'w', 'a'],
      ['b', 'b', 'a'],
      ['a', 'a', 'b'],
    ])
    const { grid: after, events } = applyMutations(math, grid, createSeededRng('e1'))
    expect([after[0]?.[1], after[1]?.[1], after[2]?.[1]]).toEqual(['w', 'w', 'w'])
    expect(events[0]).toMatchObject({ type: 'expandWild', reels: [1] })
    expect(events[0]?.cells).toHaveLength(2)
    // 대상이 아닌 릴은 그대로다
    expect(after[1]?.[0]).toBe('b')
  })

  it('대상 릴이 아니면 확장하지 않는다', () => {
    const grid = makeGrid([
      ['w', 'a', 'a'],
      ['b', 'b', 'a'],
      ['a', 'a', 'b'],
    ])
    const { events } = applyMutations(math, grid, createSeededRng('e2'))
    expect(events).toEqual([])
  })

  it('스캐터는 덮지 않는다', () => {
    const grid = makeGrid([
      ['a', 'w', 'a'],
      ['b', 's', 'a'],
      ['a', 'a', 'b'],
    ])
    const { grid: after } = applyMutations(math, grid, createSeededRng('e3'))
    expect(after[1]?.[1]).toBe('s')
    expect(after[2]?.[1]).toBe('w')
  })

  it('coverScatter를 켜면 스캐터도 덮는다', () => {
    const covering = mathWith([
      { type: 'expandWild', symbol: 'w', reels: [1], minCount: 1, coverScatter: true },
    ])
    const grid = makeGrid([
      ['a', 'w', 'a'],
      ['b', 's', 'a'],
      ['a', 'a', 'b'],
    ])
    const { grid: after } = applyMutations(covering, grid, createSeededRng('e4'))
    expect(after[1]?.[1]).toBe('w')
  })

  it('minCount를 못 채우면 확장하지 않는다', () => {
    const strict = mathWith([{ type: 'expandWild', symbol: 'w', reels: [1], minCount: 2 }])
    const grid = makeGrid([
      ['a', 'w', 'a'],
      ['b', 'b', 'a'],
      ['a', 'a', 'b'],
    ])
    expect(applyMutations(strict, grid, createSeededRng('e5')).events).toEqual([])
  })

  it('RNG를 쓰지 않는다', () => {
    expect(isProbabilistic({ type: 'expandWild', symbol: 'w', minCount: 1, coverScatter: false, onlyIfWin: false })).toBe(
      false,
    )
  })
})

describe('upgrade', () => {
  it('from이 minCount 이상이면 to로 바꾼다', () => {
    const math = mathWith([{ type: 'upgrade', from: 'b', to: 'a', minCount: 3 }])
    const grid = makeGrid([
      ['b', 'b', 'a'],
      ['b', 'a', 'a'],
      ['a', 'a', 'a'],
    ])
    const { grid: after, events } = applyMutations(math, grid, createSeededRng('u1'))
    expect(after.flat()).not.toContain('b')
    expect(events[0]).toMatchObject({ type: 'upgrade', symbol: 'a' })
    expect(events[0]?.cells).toHaveLength(3)
  })

  it('minCount 미만이면 그대로 둔다', () => {
    const math = mathWith([{ type: 'upgrade', from: 'b', to: 'a', minCount: 4 }])
    const grid = makeGrid([
      ['b', 'b', 'a'],
      ['b', 'a', 'a'],
      ['a', 'a', 'a'],
    ])
    expect(applyMutations(math, grid, createSeededRng('u2')).events).toEqual([])
  })

  it('chance를 주면 확률형이 된다', () => {
    const math = mathWith([{ type: 'upgrade', from: 'b', to: 'a', minCount: 1, chance: 0.5 }])
    const grid = makeGrid([
      ['b', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ])
    const rng = createSeededRng('u3')
    let fired = 0
    const trials = 3000
    for (let i = 0; i < trials; i += 1) {
      if (applyMutations(math, makeGrid(grid), rng).events.length > 0) fired += 1
    }
    expect(fired / trials).toBeGreaterThan(0.47)
    expect(fired / trials).toBeLessThan(0.53)
  })

  it('from과 to가 같으면 스키마가 거부한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(BASE)),
      mutations: [{ type: 'upgrade', from: 'a', to: 'a', minCount: 2 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('randomWild', () => {
  const math = mathWith([
    { type: 'randomWild', symbol: 'w', chance: 1, countWeights: { 2: 1 }, reels: [0, 1] },
  ])

  it('지정 릴에만 와일드를 떨어뜨린다', () => {
    const grid = makeGrid([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'b', 'a'],
    ])
    const { grid: after, events } = applyMutations(math, grid, createSeededRng('r1'))
    expect(events[0]).toMatchObject({ type: 'randomWild', symbol: 'w' })
    expect(events[0]?.cells).toHaveLength(2)
    for (const cell of events[0]?.cells ?? []) {
      expect(cell.position[0]).toBeLessThan(2)
      expect(after[cell.position[1]]?.[cell.position[0]]).toBe('w')
    }
  })

  it('스캐터 칸은 후보에서 뺀다', () => {
    const all = mathWith([
      { type: 'randomWild', symbol: 'w', chance: 1, countWeights: { 9: 1 } },
    ])
    const grid = makeGrid([
      ['s', 'a', 'a'],
      ['b', 's', 'b'],
      ['a', 'b', 's'],
    ])
    const { grid: after } = applyMutations(all, grid, createSeededRng('r2'))
    expect(after[0]?.[0]).toBe('s')
    expect(after[1]?.[1]).toBe('s')
    expect(after[2]?.[2]).toBe('s')
    expect(after.flat().filter((symbol) => symbol === 'w')).toHaveLength(6)
  })

  it('후보가 요구 개수보다 적으면 가능한 만큼만 놓는다', () => {
    const greedy = mathWith([
      { type: 'randomWild', symbol: 'w', chance: 1, countWeights: { 9: 1 }, reels: [0] },
    ])
    const grid = makeGrid([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'b', 'a'],
    ])
    const { events } = applyMutations(greedy, grid, createSeededRng('r3'))
    expect(events[0]?.cells).toHaveLength(3)
  })

  it('이미 와일드인 칸은 후보가 아니다', () => {
    const one = mathWith([
      { type: 'randomWild', symbol: 'w', chance: 1, countWeights: { 3: 1 }, reels: [0] },
    ])
    const grid = makeGrid([
      ['w', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'b', 'a'],
    ])
    const { events } = applyMutations(one, grid, createSeededRng('r4'))
    expect(events[0]?.cells).toHaveLength(2)
  })

  it('chance가 낮으면 대부분의 스핀에서 일어나지 않는다', () => {
    const rare = mathWith([
      { type: 'randomWild', symbol: 'w', chance: 0.2, countWeights: { 1: 1 } },
    ])
    const grid = makeGrid([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['a', 'b', 'a'],
    ])
    const rng = createSeededRng('r5')
    let fired = 0
    const trials = 5000
    for (let i = 0; i < trials; i += 1) {
      if (applyMutations(rare, makeGrid(grid), rng).events.length > 0) fired += 1
    }
    expect(fired / trials).toBeGreaterThan(0.185)
    expect(fired / trials).toBeLessThan(0.215)
  })
})

describe('파이프라인 순서와 재현성', () => {
  it('선언 순서대로 적용되고 뒤 단계가 앞 결과 위에서 동작한다', () => {
    const math = mathWith([
      { type: 'mystery', symbol: 'q', weights: { b: 1 } },
      { type: 'upgrade', from: 'b', to: 'a', minCount: 1 },
    ])
    const grid = makeGrid([
      ['q', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ])
    const { grid: after, events } = applyMutations(math, grid, createSeededRng('order'))
    expect(events.map((event) => event.type)).toEqual(['mystery', 'upgrade'])
    // q -> b(공개) -> a(승급)
    expect(after[0]?.[0]).toBe('a')
  })

  it('spin은 gridBefore와 mutations를 함께 돌려준다', () => {
    const math = makeMutationMath()
    const result = spin(math, { totalBet: 3 }, createSeededRng('spin-mut'))
    expect(result.gridBefore).toHaveLength(math.rows)
    expect(Array.isArray(result.mutations)).toBe(true)
    if (result.mutations.length > 0) {
      expect(result.gridBefore.flat()).toContain('q')
      expect(result.grid.flat()).not.toContain('q')
    } else {
      expect(result.grid).toEqual(result.gridBefore)
    }
  })

  it('같은 시드는 정지 위치와 변형을 모두 재현한다', () => {
    const math = makeMutationMath()
    const run = (): string =>
      JSON.stringify(
        Array.from({ length: 30 }, () => {
          const rng = createSeededRng('replay')
          return spin(math, { totalBet: 3 }, rng)
        }),
      )
    expect(run()).toBe(run())
  })

  it('뮤테이션이 없는 모델은 grid와 gridBefore가 같다', () => {
    const plain = parseGameMath(JSON.parse(JSON.stringify(BASE)))
    const result = spin(plain, { totalBet: 3 }, createSeededRng('plain'))
    expect(result.grid).toEqual(result.gridBefore)
    expect(result.mutations).toEqual([])
  })
})
