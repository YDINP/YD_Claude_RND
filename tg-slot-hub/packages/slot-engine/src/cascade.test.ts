import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyCascadeStep, foldCascades, runCascades } from './cascade.js'
import { parseGameMath } from './schema.js'
import { createSeededRng } from './rng/seeded.js'
import { buildGrid, resolveSpin, spin, spinUnchecked } from './spin.js'
import { makeClusterMath } from './testFixtures.js'
import type { CascadeStep, GridPosition, OrderCard, Rng, RoundState, SymbolId } from './types.js'

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

// ---- runCascades ----

const BET = 20
const rows = (...lines: string[]): SymbolId[][] => lines.map((line) => line.split(''))
const filler = (...symbols: string[]): string[] => symbols

/** 스트립을 바꿔 끼운 4x3 클러스터 모델. 리필이 스캐터면 새 클러스터가 생기지 않는다. */
function cascadeMath(strips: string[][], extra: Record<string, unknown> = {}) {
  return makeClusterMath({ strips, paytable: { a: { 4: 0.5, 6: 1, 8: 2 }, b: { 4: 0.4, 6: 0.8 } }, ...extra })
}

/** 사실상 스캐터만 나오는 스트립. 페이테이블 검사를 통과하려고 a를 안 닿는 자리(idx 3)에 둔다. */
const SCATTER_ONLY = filler('s', 's', 's', 'a', 's', 's')
const BASE_STRIPS = [
  filler('s', 'b', 'c', 's', 's', 's'),
  filler('s', 's', 'b', 's', 's', 's'),
  SCATTER_ONLY,
  SCATTER_ONLY,
]
const GRID_AB = ['aacs', 'aabb', 'scbc']

describe('runCascades', () => {
  it('2x2 a 블록을 지우고 stops-1에서 위로 끌어와 리필한다', () => {
    const math = cascadeMath(BASE_STRIPS)
    const outcome = runCascades(math, rows(...GRID_AB), [3, 3, 0, 0], BET, Infinity)
    const first = outcome.steps[0] as CascadeStep
    expect(first.removed).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ])
    // 릴0: idx2 'c' 다음 idx1 'b' → 위에서 아래로 [b, c]. 릴1: idx2 'b' 다음 idx1 's' → [s, b]
    expect(first.refill).toEqual([['b', 'c'], ['s', 'b'], [], []])
  })

  it('사다리가 단계마다 오르고 지급은 단계별로 사다리가 곱해진다', () => {
    const math = cascadeMath([SCATTER_ONLY, BASE_STRIPS[1] as string[], SCATTER_ONLY, SCATTER_ONLY])
    const outcome = runCascades(math, rows(...GRID_AB), [0, 3, 0, 0], BET, Infinity)
    expect(outcome.steps.map((step) => step.multiplier)).toEqual([1, 2])
    expect(outcome.steps.map((step) => step.stepWin)).toEqual([10, 16])
    expect(outcome.win).toBe(26)
    expect(outcome.steps[1]?.wins[0]).toMatchObject({ symbol: 'b', count: 4, win: 16, ladder: 2, cascade: 1 })
    expect(outcome.removedBySymbol).toEqual({ a: 4, b: 4 })
    expect(outcome.maxClusterSize).toBe(4)
    expect(outcome.capped).toBe(false)
    expect(outcome.hitMaxCascades).toBe(false)
    expect(foldCascades(rows(...GRID_AB), outcome.steps)).toEqual(outcome.finalGrid)
  })

  it('포인터는 스트립 처음을 지나 끝으로 순환한다', () => {
    const math = cascadeMath([filler('s', 's', 's', 's', 'b', 'c'), BASE_STRIPS[1] as string[], SCATTER_ONLY, SCATTER_ONLY])
    const outcome = runCascades(math, rows(...GRID_AB), [0, 3, 0, 0], BET, Infinity)
    expect(outcome.steps[0]?.refill[0]).toEqual(['b', 'c'])
  })

  it('지급 상한에 닿으면 그 단계를 잘라 마지막으로 삼는다', () => {
    const math = cascadeMath([SCATTER_ONLY, BASE_STRIPS[1] as string[], SCATTER_ONLY, SCATTER_ONLY])
    const grid = rows(...GRID_AB)
    const mid = runCascades(math, grid, [0, 3, 0, 0], BET, 12)
    expect(mid.capped).toBe(true)
    expect(mid.win).toBe(12)
    expect(mid.steps.map((step) => step.stepWin)).toEqual([10, 2])
    expect(mid.steps[1]?.wins.reduce((acc, line) => acc + line.win, 0)).toBe(2)
    const first = runCascades(math, grid, [0, 3, 0, 0], BET, 5)
    expect(first.capped).toBe(true)
    expect(first.steps).toHaveLength(1)
    expect(first.win).toBe(5)
  })

  it('maxCascades에서 멈추고 남은 클러스터는 지급하지 않는다', () => {
    const math = cascadeMath([SCATTER_ONLY, BASE_STRIPS[1] as string[], SCATTER_ONLY, SCATTER_ONLY], {
      cascade: { enabled: true, maxCascades: 1, refill: 'gravity', source: 'strip-pull', multiplierLadder: [1, 2, 3] },
      orderRound: {
        ...(makeClusterMath().orderRound as object),
        pool: [
          { id: 'pop-a', kind: 'popSymbol', symbol: 'a', target: 10, prize: 5, weight: 3 },
          { id: 'big-6', kind: 'clusterSize', target: 6, prize: 8, weight: 2 },
          { id: 'pop-b', kind: 'popSymbol', symbol: 'b', target: 12, prize: 5, weight: 3 },
        ],
      },
    })
    const outcome = runCascades(math, rows(...GRID_AB), [0, 3, 0, 0], BET, Infinity)
    expect(outcome.steps).toHaveLength(1)
    expect(outcome.hitMaxCascades).toBe(true)
    expect(outcome.win).toBe(10)
  })

  it('승리가 없으면 단계 0개, 판 그대로', () => {
    const math = cascadeMath(BASE_STRIPS)
    const grid = rows('abca', 'bcab', 'cabc')
    const outcome = runCascades(math, grid, [0, 0, 0, 0], BET, Infinity)
    expect(outcome.steps).toEqual([])
    expect(outcome.finalGrid).toEqual(grid)
    expect(outcome.maxClusterSize).toBe(0)
  })
})

// ---- 실제 스핀 ----

describe('연쇄 스핀 불변식', () => {
  it('foldCascades(grid, cascades) === finalGrid, 지급 합계가 맞다 (2,000회)', () => {
    const math = makeClusterMath()
    const rng = createSeededRng('fold-check')
    let cascaded = 0
    for (let i = 0; i < 2000; i += 1) {
      const result = spinUnchecked(math, 20, rng)
      const steps = result.cascades ?? []
      expect(result.finalGrid).toEqual(foldCascades(result.grid, steps))
      expect(result.grid).toEqual(result.gridBefore)
      expect(result.wins).toEqual(steps.flatMap((step) => step.wins))
      expect(result.lineWin).toBe(steps.reduce((acc, step) => acc + step.stepWin, 0))
      expect(steps.length).toBeLessThanOrEqual(5)
      steps.forEach((step, index) => expect(step.index).toBe(index))
      if (steps.length > 1) cascaded += 1
      expect(result.totalWin).toBeGreaterThanOrEqual(result.lineWin)
    }
    expect(cascaded).toBeGreaterThan(0)
  })

  it('연쇄 팩이 아니면 cascades/finalGrid 키가 없다', () => {
    const plain = parseGameMath(
      JSON.parse(readFileSync(new URL('../../../games/classic-777/math.json', import.meta.url), 'utf8')),
    )
    const result = spin(plain, { totalBet: plain.betLevels[0] as number }, createSeededRng('plain'))
    expect('cascades' in result).toBe(false)
    expect('finalGrid' in result).toBe(false)
  })
})

// ---- RNG 소비 계약 ----

class CountingRng implements Rng {
  calls = 0
  constructor(private readonly inner: Rng) {}
  nextInt(maxExclusive: number): number {
    this.calls += 1
    return this.inner.nextInt(maxExclusive)
  }
}

/** 항상 0을 돌려주는 RNG. stops가 전부 0이 된다. */
class ZeroRng implements Rng {
  calls = 0
  nextInt(): number {
    this.calls += 1
    return 0
  }
}

/** stops 0이면 4x3 전체가 a(한 그룹 12칸). 리필은 전부 스캐터라 연쇄가 한 단계로 끝난다. */
const ALL_A_STRIPS = Array.from({ length: 4 }, () => filler('a', 'a', 'a', 's', 's', 's'))
const ALL_A_PAYTABLE = { a: { 4: 0.5, 6: 1, 8: 2 } }

const CARDS_ROUND: OrderCard[] = [
  { id: 'big-6', kind: 'clusterSize', target: 6, progress: 0, prize: 8 },
  { id: 'pop-b', kind: 'popSymbol', symbol: 'b', target: 12, progress: 0, prize: 5 },
  { id: 'chain-3', kind: 'chainLength', target: 3, progress: 0, prize: 10 },
]

function roundState(cards: OrderCard[], drawn = 3): RoundState {
  return {
    freeSpinsLeft: 8,
    freeSpinsTotal: 8,
    multiplier: 1,
    carry: { orders: { cards, drawn, completed: 0, prizeTotal: 0 } },
  }
}

describe('RNG 소비 계약 (E5)', () => {
  it('진입하지 않는 스핀은 릴 수만큼만 뽑는다', () => {
    const quiet = [
      filler('a', 'b', 'c', 'a', 'b', 's'),
      filler('b', 'c', 'a', 'b', 'c', 'a'),
      filler('c', 'a', 'b', 'c', 'a', 'b'),
      filler('a', 'b', 'c', 'a', 'b', 'c'),
    ]
    const math = cascadeMath(quiet)
    const rng = new ZeroRng()
    const result = spinUnchecked(math, 20, rng)
    expect(rng.calls).toBe(4)
    expect(result.nextState).toBeUndefined()
  })

  it('진입 스핀은 릴 수 + slots회', () => {
    const math = cascadeMath(ALL_A_STRIPS, { paytable: ALL_A_PAYTABLE })
    const rng = new ZeroRng()
    const result = spinUnchecked(math, 20, rng)
    expect(rng.calls).toBe(4 + 3)
    expect(result.features.map((feature) => feature.type)).toEqual(['scatterWin', 'freeSpins', 'orderRound'])
    expect(result.nextState?.carry?.orders?.cards).toHaveLength(3)
    expect(result.orderWin).toBeUndefined()
  })

  it('라운드 스핀은 릴 수 + 완료로 비운 칸 수', () => {
    const math = cascadeMath(ALL_A_STRIPS, { paytable: ALL_A_PAYTABLE })
    const rng = new ZeroRng()
    const result = spinUnchecked(math, 20, rng, roundState(CARDS_ROUND))
    expect(result.features.filter((feature) => feature.type === 'orderComplete')).toHaveLength(1)
    expect(rng.calls).toBe(4 + 1)
    const rng2 = new ZeroRng()
    spinUnchecked(math, 20, rng2, roundState([CARDS_ROUND[1] as OrderCard]))
    expect(rng2.calls).toBe(4)
  })

  it('실제 candy 팩: 일반 6회, 진입 6+slots, 라운드 6+추첨 수', () => {
    const math = parseGameMath(
      JSON.parse(readFileSync(new URL('../../../games/candy-cluster-pop/math.json', import.meta.url), 'utf8')),
    )
    const orders = math.orderRound
    expect(orders).toBeDefined()
    const bet = math.betLevels[0] as number
    const rng = new CountingRng(createSeededRng('rng-contract'))
    const limit = (orders?.maxOrders ?? 0) + (orders?.slots ?? 0) - 1
    let entries = 0
    for (let i = 0; i < 100_000 && entries < 5; i += 1) {
      rng.calls = 0
      const paid = spinUnchecked(math, bet, rng)
      const entered = paid.features.some((feature) => feature.type === 'orderRound')
      expect(rng.calls).toBe(entered ? 6 + (orders?.slots ?? 0) : 6)
      if (!entered) continue
      entries += 1
      let state: RoundState | undefined = paid.nextState
      while (state !== undefined) {
        const before = state.carry?.orders?.drawn ?? 0
        rng.calls = 0
        const round = spinUnchecked(math, bet, rng, state)
        const completes = round.features.filter((feature) => feature.type === 'orderComplete').length
        expect(rng.calls).toBe(6 + Math.min(completes, Math.max(0, limit - before)))
        state = round.nextState
      }
    }
    expect(entries).toBeGreaterThan(0)
  }, 120_000)
})

describe('resolveSpin 직접 호출', () => {
  it('주문 라운드 팩인데 rng 없이 진입하려 하면 던진다', () => {
    const math = cascadeMath(ALL_A_STRIPS, { paytable: ALL_A_PAYTABLE })
    const stops = [0, 0, 0, 0]
    expect(() => resolveSpin(math, buildGrid(math, stops), stops, 20, 20)).toThrow(RangeError)
  })
})
