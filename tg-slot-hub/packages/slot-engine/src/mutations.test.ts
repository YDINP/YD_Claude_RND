import { describe, expect, it } from 'vitest'
import { applyMutations, isProbabilistic } from './mutations.js'
import { createSeededRng } from './rng/seeded.js'
import { parseGameMath, safeParseGameMath } from './schema.js'
import { spin } from './spin.js'
import { makeGrid, makeMutationMath } from './testFixtures.js'
import type { Rng } from './types.js'

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

describe('expandWild onlyIfWin', () => {
  const mutation = { type: 'expandWild', symbol: 'w', reels: [1], minCount: 1 }
  const always = mathWith([{ ...mutation, onlyIfWin: false }])
  const onlyIfWin = mathWith([{ ...mutation, onlyIfWin: true }])

  // 릴 0이 전부 b라서 b는 2연속 배당이 없고, 릴 2에는 b가 없다.
  // 릴 1을 와일드로 덮어도 어떤 라인도 지급 길이에 닿지 못한다.
  const noWinGrid = (): string[][] =>
    makeGrid([
      ['b', 'w', 'a'],
      ['b', 'a', 'a'],
      ['b', 'b', 'a'],
    ])

  // 같은 구조인데 릴 2가 b라서 확장하면 b 3연속이 두 줄 생긴다.
  const winGrid = (): string[][] =>
    makeGrid([
      ['b', 'w', 'a'],
      ['b', 'a', 'b'],
      ['b', 'a', 'b'],
    ])

  it('확장해도 지급이 늘지 않으면 되돌린다', () => {
    const before = noWinGrid()
    const { grid, events } = applyMutations(onlyIfWin, before, createSeededRng('x'))
    expect(events).toHaveLength(0)
    expect(grid).toEqual(noWinGrid())
  })

  it('같은 그리드라도 onlyIfWin이 꺼져 있으면 그대로 확장한다', () => {
    const { grid, events } = applyMutations(always, noWinGrid(), createSeededRng('x'))
    expect(events).toHaveLength(1)
    expect([grid[0]?.[1], grid[1]?.[1], grid[2]?.[1]]).toEqual(['w', 'w', 'w'])
  })

  it('확장이 지급을 만들면 확장을 남긴다', () => {
    const { grid, events } = applyMutations(onlyIfWin, winGrid(), createSeededRng('x'))
    expect(events).toHaveLength(1)
    expect([grid[0]?.[1], grid[1]?.[1], grid[2]?.[1]]).toEqual(['w', 'w', 'w'])
  })

  it('이미 있던 승리는 확장의 성과로 치지 않는다', () => {
    // 릴 1의 와일드가 이미 a 3연속을 만들어 두었고, 확장해도 더 늘어나는 줄이 없다.
    const grid = makeGrid([
      ['a', 'w', 'a'],
      ['b', 'a', 'c'],
      ['b', 'a', 'c'],
    ])
    const withFiller = parseGameMath({
      ...JSON.parse(JSON.stringify(BASE)),
      symbols: [...BASE.symbols, { id: 'c', name: { en: 'Filler' } }],
      strips: BASE.strips.map((strip) => [...strip, 'c']),
      mutations: [{ ...mutation, onlyIfWin: true }],
    })
    const result = applyMutations(withFiller, grid, createSeededRng('x'))
    expect(result.events).toHaveLength(0)
    expect(result.grid[1]?.[1]).toBe('a')
  })

  it('되돌리든 말든 RNG는 한 번도 쓰지 않는다', () => {
    let draws = 0
    const counting: Rng = {
      nextInt: (bound: number) => {
        draws += 1
        return bound - 1
      },
    }
    applyMutations(onlyIfWin, noWinGrid(), counting)
    applyMutations(onlyIfWin, winGrid(), counting)
    expect(draws).toBe(0)
  })
})

describe('가중 추첨의 정밀도', () => {
  it('정수 가중치는 반올림 없이 그대로 쓴다', () => {
    // 가중치 {a:1, b:3}이면 눈금은 4칸이다. 마지막 눈금(=3)을 뽑으면 b가 나와야 한다.
    const math = mathWith([{ type: 'mystery', symbol: 'q', weights: { a: 1, b: 3 } }])
    const grid = makeGrid([
      ['q', 'a', 'b'],
      ['a', 'b', 'a'],
      ['b', 'a', 'b'],
    ])
    const bounds: number[] = []
    const probe: Rng = {
      nextInt: (bound: number) => {
        bounds.push(bound)
        return 0
      },
    }
    const { events } = applyMutations(math, grid, probe)
    expect(bounds).toEqual([4])
    expect(events[0]?.symbol).toBe('a')
  })

  it('소수 가중치는 100만 눈금으로 환산한다', () => {
    const math = mathWith([{ type: 'mystery', symbol: 'q', weights: { a: 0.5, b: 1.5 } }])
    const grid = makeGrid([
      ['q', 'a', 'b'],
      ['a', 'b', 'a'],
      ['b', 'a', 'b'],
    ])
    const bounds: number[] = []
    const probe: Rng = {
      nextInt: (bound: number) => {
        bounds.push(bound)
        return 0
      },
    }
    applyMutations(math, grid, probe)
    expect(bounds[0]).toBe(1_000_000)
  })
})

describe('뮤테이션 스키마 제약', () => {
  function reject(mutations: unknown[]): void {
    expect(safeParseGameMath({ ...JSON.parse(JSON.stringify(BASE)), mutations }).success).toBe(false)
  }

  it('와일드를 미스터리 심볼로 쓰면 거부한다', () => {
    reject([{ type: 'mystery', symbol: 'w', weights: { a: 1, b: 1 } }])
  })

  it('스캐터를 미스터리 심볼로 쓰면 거부한다', () => {
    reject([{ type: 'mystery', symbol: 's', weights: { a: 1, b: 1 } }])
  })

  it('두 뮤테이션이 같은 심볼을 읽으면 거부한다', () => {
    reject([
      { type: 'mystery', symbol: 'q', weights: { a: 1, b: 1 } },
      { type: 'upgrade', from: 'q', to: 'a', minCount: 2 },
    ])
  })

  it('같은 심볼을 읽는 미스터리 둘도 거부한다', () => {
    reject([
      { type: 'mystery', symbol: 'q', weights: { a: 1 } },
      { type: 'mystery', symbol: 'q', weights: { b: 1 } },
    ])
  })

  it('랜덤 와일드로 뿌린 뒤 확장하는 조합은 허용한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(BASE)),
      mutations: [
        { type: 'randomWild', symbol: 'w', chance: 0.2, countWeights: { 1: 1 }, reels: [1] },
        { type: 'expandWild', symbol: 'w', reels: [1] },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('읽는 심볼이 다르면 여러 단계를 허용한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(BASE)),
      mutations: [
        { type: 'mystery', symbol: 'q', weights: { a: 1, b: 1 } },
        { type: 'upgrade', from: 'b', to: 'a', minCount: 2 },
      ],
    })
    expect(result.success).toBe(true)
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

describe('RNG 소비 순서 계약', () => {
  /** 뽑을 때마다 maxExclusive를 기록하는 래퍼. */
  function tracingRng(seed: string): { rng: Rng; draws: number[] } {
    const inner = createSeededRng(seed)
    const draws: number[] = []
    return {
      draws,
      rng: {
        nextInt(maxExclusive: number): number {
          draws.push(maxExclusive)
          return inner.nextInt(maxExclusive)
        },
      },
    }
  }

  it('릴 정지를 전부 뽑은 뒤에 뮤테이션이 뽑는다', () => {
    const math = mathWith([
      { type: 'randomWild', symbol: 'w', chance: 1, countWeights: { 2: 1 }, reels: [0, 1] },
    ])
    const { rng, draws } = tracingRng('order-contract')
    spin(math, { totalBet: 3 }, rng)

    // 앞 3개는 릴별 스트립 길이로 뽑은 정지 위치다.
    const stripLengths = math.strips.map((strip) => strip.length)
    expect(draws.slice(0, math.reels)).toEqual(stripLengths)
    // 그 뒤가 뮤테이션 몫이다. 확률 판정 1회 + 개수 추첨 1회 + 위치 추첨 2회.
    expect(draws.length).toBe(math.reels + 4)
  })

  it('스캐터 집계와 프리스핀 판정은 RNG를 쓰지 않는다', () => {
    // 뮤테이션이 없는 모델이면 뽑는 것은 릴 정지뿐이다.
    // 스캐터 개수와 프리스핀 트리거는 확정된 그리드의 함수라 추첨이 없다.
    const plain = parseGameMath(JSON.parse(JSON.stringify(BASE)))
    const { rng, draws } = tracingRng('no-extra-draws')
    const result = spin(plain, { totalBet: 3 }, rng)
    expect(draws.length).toBe(plain.reels)
    expect(result.scatterWin).toBeGreaterThanOrEqual(0)
  })

  it('프리스핀 중에도 추첨 순서는 같다', () => {
    const plain = parseGameMath(JSON.parse(JSON.stringify(BASE)))
    const { rng, draws } = tracingRng('free-spin-draws')
    spin(plain, { totalBet: 3 }, rng, { freeSpinsLeft: 5, freeSpinsTotal: 5, multiplier: 2 })
    expect(draws.length).toBe(plain.reels)
  })

  it('확장 와일드는 RNG를 전혀 쓰지 않는다', () => {
    const math = mathWith([{ type: 'expandWild', symbol: 'w', reels: [1], minCount: 1 }])
    const { rng, draws } = tracingRng('expand-no-draw')
    spin(math, { totalBet: 3 }, rng)
    expect(draws.length).toBe(math.reels)
  })
})
