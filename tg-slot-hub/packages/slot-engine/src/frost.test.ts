import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from './schema.js'
import {
  buildShapeGrid,
  foldFrost,
  frostBonusMultiple,
  frostSpinMath,
  frostSpinsFor,
  initialFrostCarry,
  pickFrostTarget,
  resolveFrostSpin,
} from './frost.js'
import { spin, spinUnchecked } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import { VOID_CELL } from './shape.js'
import type { FrostChainTrigger, FrostCarry, Rng, RoundState, SpinResult, SymbolId } from './types.js'

const AURORA = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../games/aurora-ice-palace/math.json', import.meta.url), 'utf8')),
)
const CONFIG = AURORA.frostRespin!
const BET = 50
const PER_WAY = 1
const CAP = 2500 * BET
const HEIGHTS = [3, 4, 5, 4, 3]
const FILL = ['feather', 'flake', 'gem_violet', 'icicle', 'bead']

function board(columns: SymbolId[][]): SymbolId[][] {
  const grid: SymbolId[][] = []
  for (let row = 0; row < 5; row += 1) {
    grid.push(HEIGHTS.map((height, reel) => (row >= height ? VOID_CELL : (columns[reel]?.[row] ?? FILL[reel] ?? 'bead'))))
  }
  return grid
}

/** 정해 둔 값을 차례로 돌려주는 RNG. 다 쓰면 던진다(호출 수를 정확히 고정하려고). */
function scripted(values: number[]): Rng & { calls: number } {
  let index = 0
  return {
    calls: 0,
    nextInt(max: number): number {
      const value = values[index]
      if (value === undefined) throw new Error(`스크립트 RNG가 바닥났다 (${index}번째 호출)`)
      index += 1
      this.calls += 1
      return value % max
    },
  }
}

/** 호출 수를 세는 시드 RNG. */
function counting(seed: string): Rng & { calls: number } {
  const inner = createSeededRng(seed)
  return {
    calls: 0,
    nextInt(max: number): number {
      this.calls += 1
      return inner.nextInt(max)
    },
  }
}

/** 다시 돌리기 칸 스트립에서 그 그림이 처음 나오는 인덱스. */
function at(reel: number, symbol: SymbolId): number {
  const index = CONFIG.respinStrips[reel]?.indexOf(symbol) ?? -1
  if (index < 0) throw new Error(`릴 ${reel} 다시 돌리기 스트립에 ${symbol}가 없다`)
  return index
}

function freeState(carry: Partial<FrostCarry> = {}, left = 5, total = 8): RoundState {
  return { freeSpinsLeft: left, freeSpinsTotal: total, multiplier: 1, carry: { frost: { ...initialFrostCarry(), ...carry } } }
}

function chainOf(result: SpinResult): FrostChainTrigger | undefined {
  return result.features.find((feature): feature is FrostChainTrigger => feature.type === 'frostChain')
}

/** 판 안 칸을 릴 → 행 순서로. */
const CELLS: [number, number][] = HEIGHTS.flatMap((height, reel) => Array.from({ length: height }, (_, row) => [reel, row] as [number, number]))

describe('얼려 두기 프리스핀 — 표·진입', () => {
  it('구슬 3·4·5개 이상 → 8·10·12회, 그 아래는 0', () => {
    expect([2, 3, 4, 5, 6, 9].map((count) => frostSpinsFor(CONFIG, count))).toEqual([0, 8, 10, 12, 12, 12])
  })

  it('보너스표: 첫 눈금 미만 0, 눈금마다 오른다', () => {
    expect(frostBonusMultiple(CONFIG, 'high', 5)).toBe(0)
    expect(frostBonusMultiple(CONFIG, 'high', 6)).toBe(CONFIG.bonus.high[0])
    expect(frostBonusMultiple(CONFIG, 'low', 14)).toBe(CONFIG.bonus.low[2])
    expect(frostBonusMultiple(CONFIG, 'mid', 19)).toBe(CONFIG.bonus.mid[5])
  })

  it('유료 판 진입: 프리스핀 피처와 오로라 0 carry를 만든다', () => {
    const grid = board([['scatter'], ['scatter'], ['scatter', 'scatter']])
    const result = resolveFrostSpin(AURORA, grid, [0, 0, 0, 0, 0], BET, PER_WAY, undefined, undefined)
    expect(result.features.find((feature) => feature.type === 'freeSpins')).toEqual({
      type: 'freeSpins',
      spins: 10,
      multiplier: 1,
      retrigger: false,
    })
    expect(result.nextState).toEqual({ freeSpinsLeft: 10, freeSpinsTotal: 10, multiplier: 1, carry: { frost: initialFrostCarry() } })
    expect(result.scatterWin).toBe(Math.round((AURORA.scatter?.pays?.[4] ?? 0) * BET))
    expect(chainOf(result)).toBeUndefined()
  })

  it('유료 판은 당첨이 있어도 얼리지 않는다(RNG 0회)', () => {
    const rng = scripted([])
    const result = resolveFrostSpin(AURORA, board([['bear'], ['bear'], ['bear']]), [0, 0, 0, 0, 0], BET, PER_WAY, undefined, rng)
    expect(result.totalWin).toBe(113)
    expect(rng.calls).toBe(0)
    expect(result.frostWin).toBeUndefined()
  })
})

describe('얼림 루프', () => {
  it('가장 큰 그림 + 와일드가 언다, 새 칸이 없으면 끝(RNG = 얼지 않은 칸 수의 합)', () => {
    // 곰 왼쪽 3릴(3칸) + 4번 릴 와일드 1칸 → 처음 4칸이 언다. 얼지 않은 칸 15.
    const grid = board([['bear'], ['bear'], ['bear'], ['wild']])
    const frozen0 = new Set(['0,0', '1,0', '2,0', '3,0'])
    const open = CELLS.filter(([reel, row]) => !frozen0.has(`${reel},${row}`))
    expect(open).toHaveLength(15)
    // 1단계: 처음 두 칸만 곰, 나머지는 서리 깃털. 2단계: 13칸 전부 서리 깃털.
    const step1 = open.map(([reel], index) => (index < 2 ? at(reel, 'bear') : at(reel, 'feather')))
    const open2 = open.slice(2)
    const step2 = open2.map(([reel]) => at(reel, 'feather'))
    const rng = scripted([...step1, ...step2])
    const result = resolveFrostSpin(AURORA, grid, [0, 0, 0, 0, 0], BET, PER_WAY, freeState(), rng)
    const chain = chainOf(result)
    expect(chain).toBeDefined()
    expect(rng.calls).toBe(15 + 13)
    expect(chain?.target).toBe('bear')
    expect(chain?.tier).toBe('high')
    expect(chain?.startFrozen).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ])
    expect(chain?.steps.map((step) => step.frozen)).toEqual([[open[0], open[1]], []])
    expect(chain?.steps.map((step) => step.cells.length)).toEqual([15, 13])
    expect(chain?.count).toBe(6)
    expect(chain?.bonusMultiple).toBe(CONFIG.bonus.high[0])
    expect(chain?.auroraBefore).toBe(0)
    expect(chain?.auroraAfter).toBe(0)
    expect(chain?.bonus).toBe(Math.round((CONFIG.bonus.high[0] ?? 0) * BET))
    expect(result.frostWin).toBe(chain?.bonus)
    expect(result.totalWin).toBe(result.lineWin + (chain?.bonus ?? 0))
    expect(foldFrost(grid, chain!)).toEqual(chain?.finalGrid)
    // 다음 판 carry: 오로라 그대로, 누적 지급·최다 칸·보너스 합 갱신.
    expect(result.nextState?.carry?.frost).toEqual({ level: 0, paid: result.totalWin, bestCount: 6, bonusTotal: chain?.bonus })
  })

  it('동점이면 배당표(선언 순서) 위쪽 그림을 얼린다', () => {
    const wins = [
      { line: -1, symbol: 'fox', count: 3, multiplier: 1, win: 100, positions: [] },
      { line: -1, symbol: 'owl', count: 3, multiplier: 1, win: 100, positions: [] },
    ]
    expect(pickFrostTarget(AURORA, wins)).toBe('owl')
    expect(pickFrostTarget(AURORA, [{ ...wins[0]!, win: 101 }, wins[1]!])).toBe('fox')
  })

  it('당첨 없는 프리스핀은 얼림 없음(RNG = 릴 정지 5회)', () => {
    for (let i = 0; i < 300; i += 1) {
      const rng = counting(`nowin-${i}`)
      const result = spinUnchecked(AURORA, BET, rng, freeState())
      if (result.wins.length > 0) continue
      expect(rng.calls).toBe(5)
      expect(chainOf(result)).toBeUndefined()
    }
  })

  it('15칸 이상이면 오로라가 오르고 그 판 보너스부터 오른 배수를 쓴다', () => {
    // 얼음 방울 16칸(+ 판에 다른 그림 3칸), 1단계에 새 칸 0 → 16칸.
    const grid = board([
      ['bead', 'bead', 'bead'],
      ['bead', 'bead', 'bead', 'flake'],
      ['bead', 'bead', 'bead', 'bead', 'bead'],
      ['bead', 'bead', 'bead', 'icicle'],
      ['bead', 'bead', 'owl'],
    ])
    const draws = (): number[] => [at(1, 'feather'), at(3, 'feather'), at(4, 'feather')]
    const up = resolveFrostSpin(AURORA, grid, [0, 0, 0, 0, 0], BET, PER_WAY, freeState(), scripted(draws()))
    const chain = chainOf(up)
    expect(chain?.target).toBe('bead')
    expect(chain?.count).toBe(16)
    expect(chain?.auroraBefore).toBe(0)
    expect(chain?.auroraAfter).toBe(1)
    expect(chain?.auroraMultiplier).toBe(2)
    expect(chain?.bonus).toBe(Math.round((CONFIG.bonus.low[3] ?? 0) * 2 * BET))
    expect(up.nextState?.carry?.frost?.level).toBe(1)

    // 최대 단계(×5)에서는 더 오르지 않는다.
    const top = resolveFrostSpin(AURORA, grid, [0, 0, 0, 0, 0], BET, PER_WAY, freeState({ level: 3 }), scripted(draws()))
    expect(chainOf(top)?.auroraAfter).toBe(3)
    expect(chainOf(top)?.bonus).toBe(Math.round((CONFIG.bonus.low[3] ?? 0) * 5 * BET))
  })

  it('19칸을 다 얼리면 다시 돌리기 없이 끝나고 궁전 완성 값', () => {
    const all = board([
      ['bead', 'bead', 'bead'],
      ['bead', 'bead', 'bead', 'wild'],
      ['bead', 'bead', 'bead', 'bead', 'bead'],
      ['bead', 'bead', 'bead', 'bead'],
      ['bead', 'bead', 'bead'],
    ])
    const rng = scripted([])
    const result = resolveFrostSpin(AURORA, all, [0, 0, 0, 0, 0], BET, PER_WAY, freeState(), rng)
    const chain = chainOf(result)
    expect(chain?.count).toBe(19)
    expect(chain?.steps).toEqual([])
    expect(chain?.bonusMultiple).toBe(CONFIG.bonus.low[5])
    expect(rng.calls).toBe(0)
  })

  it('무작위 1만 판: 단계 ≤ hardCap, RNG 호출 수 = 5 + Σ 단계 칸 수, foldFrost = finalGrid', () => {
    const rng = counting('frost-fuzz')
    let chains = 0
    for (let i = 0; i < 10_000; i += 1) {
      const before = rng.calls
      const result = spinUnchecked(AURORA, BET, rng, freeState({}, 8, 8))
      const chain = chainOf(result)
      if (chain === undefined) {
        expect(rng.calls - before).toBe(5)
        continue
      }
      chains += 1
      expect(chain.steps.length).toBeLessThanOrEqual(CONFIG.hardCap)
      expect(chain.hitHardCap).toBe(false)
      expect(rng.calls - before).toBe(5 + chain.steps.reduce((sum, step) => sum + step.cells.length, 0))
      expect(foldFrost(result.grid, chain)).toEqual(chain.finalGrid)
      // 새로 언 칸이 없으면 끝: 마지막 단계는 비었거나 판이 다 찼다.
      const last = chain.steps[chain.steps.length - 1]
      if (last !== undefined) expect(last.frozen.length === 0 || chain.count === 19).toBe(true)
      // 얼린 칸 수 = 끝난 판에서 target·와일드 칸 수.
      const frozen = chain.finalGrid.flat().filter((cell) => cell === chain.target || cell === 'wild').length
      expect(frozen).toBe(chain.count)
      expect(chain.count).toBe(chain.startFrozen.length + chain.steps.reduce((sum, step) => sum + step.frozen.length, 0))
    }
    expect(chains).toBeGreaterThan(4000)
  })
})

describe('라운드: 리트리거·상한·재현', () => {
  const threeOrbs = board([['scatter'], [], ['scatter'], [], ['scatter']])

  it('착지 판 구슬 3개 → +4회', () => {
    const result = resolveFrostSpin(AURORA, threeOrbs, [0, 0, 0, 0, 0], BET, PER_WAY, freeState({}, 5, 10), scripted([]))
    expect(result.features.find((feature) => feature.type === 'freeSpins')).toEqual({
      type: 'freeSpins',
      spins: 4,
      multiplier: 1,
      retrigger: true,
    })
    expect(result.nextState?.freeSpinsLeft).toBe(8)
    expect(result.nextState?.freeSpinsTotal).toBe(14)
  })

  it('총 20회를 넘는 리트리거는 잘라 freeSpinsCapped를 남긴다', () => {
    const result = resolveFrostSpin(AURORA, threeOrbs, [0, 0, 0, 0, 0], BET, PER_WAY, freeState({}, 3, 18), scripted([]))
    expect(result.features.filter((feature) => feature.type === 'freeSpins')).toEqual([
      { type: 'freeSpins', spins: 2, multiplier: 1, retrigger: true },
    ])
    expect(result.features.find((feature) => feature.type === 'freeSpinsCapped')).toEqual({
      type: 'freeSpinsCapped',
      requested: 4,
      granted: 2,
      cap: 20,
    })
    expect(result.nextState?.freeSpinsTotal).toBe(20)
  })

  it('프리스핀 누적이 상한에 닿으면 잘리고 라운드가 끝난다', () => {
    const grid = board([['bear'], ['bear'], ['bear'], ['wild']])
    const open = CELLS.filter(([reel, row]) => !(row === 0 && reel <= 3))
    const draws = open.map(([reel]) => at(reel, 'feather'))
    const result = resolveFrostSpin(AURORA, grid, [0, 0, 0, 0, 0], BET, PER_WAY, freeState({ paid: CAP - 10 }, 6, 8), scripted(draws))
    expect(result.totalWin).toBe(10)
    expect(chainOf(result)?.bonus).toBe(0)
    expect(result.features.find((feature) => feature.type === 'winCapped')).toMatchObject({ granted: 10, cap: CAP })
    expect(result.nextState).toBeUndefined()
  })

  it('유료 판은 판 단위 상한이다(진입 판은 라운드 누적에서 빠진다)', () => {
    const full = board([
      ['bear', 'bear', 'bear'],
      ['bear', 'bear', 'bear', 'bear'],
      ['bear', 'bear', 'bear', 'bear', 'bear'],
      ['bear', 'bear', 'bear', 'bear'],
      ['bear', 'bear', 'bear'],
    ])
    const result = resolveFrostSpin(AURORA, full, [0, 0, 0, 0, 0], BET, PER_WAY, undefined, undefined)
    expect(result.totalWin).toBe(CAP)
    expect(result.features.find((feature) => feature.type === 'winCapped')).toMatchObject({ requested: 720 * 678, granted: CAP })
  })

  it('같은 시드 + 같은 stateBefore → 같은 결과(재현), 프리스핀 stops는 freeStrips 인덱스', () => {
    let state: RoundState | undefined
    const rng = createSeededRng('frost-round')
    let found = 0
    for (let i = 0; i < 2_000 && found < 20; i += 1) {
      const paid = spin(AURORA, { totalBet: BET }, rng)
      state = paid.nextState
      while (state !== undefined) {
        const seed = `replay-${i}-${state.freeSpinsLeft}`
        const a = spin(AURORA, { totalBet: BET }, createSeededRng(seed), state)
        const b = spin(AURORA, { totalBet: BET }, createSeededRng(seed), structuredClone(state))
        expect(b).toEqual(a)
        expect(a.grid).toEqual(buildShapeGrid(AURORA, CONFIG.freeStrips, a.stops))
        state = a.nextState
        found += 1
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('frostSpinMath는 프리스핀에서만 스트립을 바꿔 낀다', () => {
    expect(frostSpinMath(AURORA, false)).toBe(AURORA)
    expect(frostSpinMath(AURORA, true).strips).toBe(CONFIG.freeStrips)
    expect(frostSpinMath(AURORA, true)).toBe(frostSpinMath(AURORA, true))
  })

  it('응답 크기: 최악 얼림 피처도 8KB 안', () => {
    const rng = createSeededRng('frost-size')
    let largest = 0
    for (let i = 0; i < 5_000; i += 1) {
      const chain = chainOf(spinUnchecked(AURORA, BET, rng, freeState()))
      if (chain !== undefined) largest = Math.max(largest, JSON.stringify(chain).length)
    }
    expect(largest).toBeGreaterThan(0)
    expect(largest).toBeLessThan(8 * 1024)
  })
})
