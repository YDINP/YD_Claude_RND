import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from './schema.js'
import type { GameMath } from './schema.js'
import { applyColumnWraps, assignCoinValues, foldRespin, runCoinRespin, toCoinBoard } from './coinRespin.js'
import { resolveSpin, spinUnchecked } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import type { CoinCell, Rng } from './types.js'

const BET = 20
const STRIP = ['coin', 'crab', 'crab', 'crab', 'crab', 'crab', 'crab', 'crab', 'crab', 'crab']
const COIN = 0
const MISS = 1

/** 5x3 손 판 모델. 리스핀 칸 스트립은 0번만 코인(q = 0.1). 금액표 5칸은 가중치가 전부 1이라 `nextInt` 값이 곧 후보 순번이다. */
function makeCoinMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'coin-test',
    reels: 5,
    rows: 3,
    symbols: [
      { id: 'wild', name: { en: 'Wild' }, wild: true },
      { id: 'coin', name: { en: 'Coin' } },
      { id: 'crab', name: { en: 'Crab' } },
      { id: 'shell', name: { en: 'Shell' } },
    ],
    strips: Array.from({ length: 5 }, () => ['crab', 'shell', 'coin', 'crab', 'shell', 'wild']),
    paylines: [[1, 1, 1, 1, 1]],
    paytable: { crab: { 3: 5 }, shell: { 3: 2 } },
    wild: { substitutesFor: 'all', excludes: ['coin'] },
    betLevels: [BET],
    rtpTarget: 0.945,
    volatility: 'high',
    coinRespin: {
      symbol: 'coin',
      trigger: 6,
      respins: 3,
      hardCap: 40,
      respinStrips: Array.from({ length: 5 }, () => STRIP),
      values: [
        { kind: 'bet', value: 1, weight: 1 },
        { kind: 'bet', value: 2, weight: 1 },
        { kind: 'treasure', tier: 'small', weight: 1 },
        { kind: 'treasure', tier: 'medium', weight: 1 },
        { kind: 'treasure', tier: 'large', weight: 1 },
      ],
      treasures: { small: 20, medium: 50, large: 200, top: 1000 },
      columnBonus: { multiplier: 2 },
    },
    ...overrides,
  })
}

/** 정해 둔 값을 차례로 돌려주는 RNG. 범위를 넘거나 값이 모자라면 던진다. */
function scripted(values: number[]): Rng & { calls: number; maxes: number[] } {
  const queue = [...values]
  const rng = {
    calls: 0,
    maxes: [] as number[],
    nextInt(max: number): number {
      const value = queue.shift()
      if (value === undefined) throw new Error(`스크립트 RNG가 비었다 (호출 ${rng.calls + 1})`)
      if (value >= max) throw new Error(`스크립트 값 ${value}이 범위 ${max}를 넘는다`)
      rng.calls += 1
      rng.maxes.push(max)
      return value
    },
  }
  return rng
}

function counting(inner: Rng): Rng & { calls: number } {
  const rng = {
    calls: 0,
    nextInt(max: number): number {
      rng.calls += 1
      return inner.nextInt(max)
    },
  }
  return rng
}

function bet(reel: number, row: number, value: number): CoinCell {
  return { pos: [reel, row], kind: 'bet', value, amount: value * BET }
}

function treasure(reel: number, row: number, tier: 'small' | 'medium' | 'large'): CoinCell {
  const value = { small: 20, medium: 50, large: 200 }[tier]
  return { pos: [reel, row], kind: 'treasure', value, tier, amount: value * BET }
}

/** 빈칸 수만큼 MISS. */
const misses = (count: number): number[] => new Array<number>(count).fill(MISS)

const KRAKEN = parseGameMath(JSON.parse(readFileSync(new URL('../../../games/kraken-cove/math.json', import.meta.url), 'utf8')))

describe('assignCoinValues', () => {
  it('릴 → 행 순서로 코인마다 1회 뽑고, 판에 이미 있는 보물 단계는 후보에서 뺀다', () => {
    const math = makeCoinMath()
    const grid = [
      ['crab', 'coin', 'crab', 'crab', 'crab'],
      ['coin', 'crab', 'crab', 'crab', 'crab'],
      ['crab', 'coin', 'crab', 'crab', 'crab'],
    ]
    // [0,1] → 3번(medium), [1,0] → 남은 4개 중 2번(small), [1,2] → 남은 3개 중 2번(large)
    const rng = scripted([3, 2, 2])
    const cells = assignCoinValues(math, grid, BET, rng)
    expect(cells).toEqual([treasure(0, 1, 'medium'), treasure(1, 0, 'small'), treasure(1, 2, 'large')])
    expect(rng.maxes).toEqual([5, 4, 3])
  })

  it('보물 세 단계가 다 있으면 숫자 코인만 후보로 남는다', () => {
    const math = makeCoinMath()
    const entry = [treasure(0, 0, 'small'), treasure(0, 1, 'medium'), treasure(0, 2, 'large'), bet(1, 0, 1), bet(2, 0, 1), bet(3, 0, 1)]
    // 첫 리스핀: 빈칸 9칸 중 첫 칸([1,1])만 코인 → 후보 2개(숫자)에서 1번 = x2
    const rng = scripted([COIN, 1, ...misses(8), ...misses(9), ...misses(9), ...misses(9)])
    const outcome = runCoinRespin(math, entry, BET, Infinity, rng)
    expect(outcome.steps[0]?.newCoins).toEqual([bet(1, 1, 2)])
    expect(rng.maxes[1]).toBe(2)
  })
})

describe('runCoinRespin 리셋·종료', () => {
  const entry = [bet(0, 0, 1), bet(1, 0, 1), bet(2, 0, 1), bet(3, 0, 1), bet(4, 0, 1), bet(0, 1, 2)]

  it('새 코인 → 3으로 리셋, 없으면 1씩 줄고 0이면 끝난다', () => {
    const math = makeCoinMath()
    // 빈칸 9: 1회차 꽝(left 2) → 2회차 첫 칸 코인(left 3) → 이후 빈칸 8칸 꽝 3번
    const rng = scripted([...misses(9), COIN, 0, ...misses(8), ...misses(8), ...misses(8), ...misses(8)])
    const outcome = runCoinRespin(math, entry, BET, Infinity, rng)
    expect(outcome.steps.map((step) => step.left)).toEqual([2, 3, 2, 1, 0])
    expect(outcome.steps[1]?.newCoins).toEqual([bet(0, 2, 1)])
    expect(outcome.final).toHaveLength(7)
    expect(outcome.full).toBe(false)
    // [0,2]가 붙어 릴 0이 다 찼다 → 촉수 감기로 릴 0의 x1·x2·x1이 x2·x4·x2
    expect(outcome.steps[1]?.wraps.map((wrap) => wrap.reel)).toEqual([0])
    expect(outcome.coinWin).toBe((2 + 4 + 2 + 1 + 1 + 1 + 1) * BET)
    expect(outcome.win).toBe(outcome.coinWin)
    expect(rng.calls).toBe(9 + (9 + 1) + 8 * 3)
  })

  it('고정된 칸은 다시 뽑지 않는다 (RNG 호출 수 = 리스핀마다 빈칸 수 + 새 코인 수)', () => {
    const math = makeCoinMath()
    const rng = counting(createSeededRng('fixed'))
    const outcome = runCoinRespin(math, entry, BET, Infinity, rng)
    let empties = 15 - entry.length
    let expected = 0
    for (const step of outcome.steps) {
      expected += empties + step.newCoins.length
      empties -= step.newCoins.length
    }
    expect(rng.calls).toBe(expected)
  })

  it('진입 판이 15칸이면 리스핀 없이 다섯 줄을 감고 최고 보물을 준다', () => {
    const math = makeCoinMath()
    const full: CoinCell[] = []
    for (let reel = 0; reel < 5; reel += 1) for (let row = 0; row < 3; row += 1) full.push(bet(reel, row, 1))
    const rng = scripted([])
    const outcome = runCoinRespin(math, full, BET, Infinity, rng)
    expect(outcome.steps).toEqual([])
    expect(outcome.entryWraps.map((wrap) => wrap.reel)).toEqual([0, 1, 2, 3, 4])
    expect(outcome.full).toBe(true)
    expect(outcome.coinWin).toBe(15 * 2 * BET)
    expect(outcome.topWin).toBe(1000 * BET)
    expect(outcome.win).toBe(outcome.coinWin + outcome.topWin)
  })

  it('리스핀 도중 판이 다 차면 남은 횟수와 관계없이 끝나고 최고 보물은 한 번만', () => {
    const math = makeCoinMath()
    // 빈칸 9칸이 첫 리스핀에 전부 코인(값은 전부 x1)
    const rng = scripted(Array.from({ length: 9 }, () => [COIN, 0]).flat())
    const outcome = runCoinRespin(math, entry, BET, Infinity, rng)
    expect(outcome.steps).toHaveLength(1)
    expect(outcome.steps[0]?.left).toBe(3)
    expect(outcome.full).toBe(true)
    expect(outcome.steps[0]?.wraps.map((wrap) => wrap.reel)).toEqual([0, 1, 2, 3, 4])
    expect(outcome.topWin).toBe(1000 * BET)
  })
})

describe('촉수 감기', () => {
  it('진입 판에서 이미 찬 줄을 먼저 감는다. 숫자 코인만 x2, 보물 코인은 그대로', () => {
    const math = makeCoinMath()
    const entry = [bet(0, 0, 1), treasure(0, 1, 'small'), bet(0, 2, 2), bet(1, 0, 1), bet(2, 0, 1), bet(3, 0, 1)]
    const rng = scripted([...misses(9), ...misses(9), ...misses(9)])
    const outcome = runCoinRespin(math, entry, BET, Infinity, rng)
    expect(outcome.entry).toEqual(entry)
    expect(outcome.entryWraps).toEqual([{ reel: 0, before: [20, 400, 40], after: [40, 400, 80] }])
    expect(outcome.final.slice(0, 3)).toEqual([
      { ...bet(0, 0, 2) },
      treasure(0, 1, 'small'),
      { ...bet(0, 2, 4) },
    ])
    expect(outcome.coinWin).toBe(40 + 400 + 80 + 20 * 3)
  })

  it('리스핀 도중 같은 리스핀에 두 줄이 차면 왼쪽부터 감고, 감긴 줄은 다시 감지 않는다', () => {
    const math = makeCoinMath()
    const entry = [bet(1, 0, 1), bet(1, 1, 1), bet(3, 0, 1), bet(3, 1, 1), bet(0, 0, 1), bet(4, 0, 1)]
    // 빈칸(릴→행): [0,1] [0,2] [1,2] [2,0] [2,1] [2,2] [3,2] [4,1] [4,2]
    // 1회차: [1,2]·[3,2]만 코인(x1) → 릴 1·3 완성
    const first = [MISS, MISS, COIN, 0, MISS, MISS, MISS, COIN, 0, MISS, MISS]
    const rng = scripted([...first, ...misses(7), ...misses(7), ...misses(7)])
    const outcome = runCoinRespin(math, entry, BET, Infinity, rng)
    expect(outcome.steps[0]?.newCoins).toEqual([bet(1, 2, 1), bet(3, 2, 1)])
    expect(outcome.steps[0]?.wraps).toEqual([
      { reel: 1, before: [20, 20, 20], after: [40, 40, 40] },
      { reel: 3, before: [20, 20, 20], after: [40, 40, 40] },
    ])
    expect(outcome.steps.slice(1).every((step) => step.wraps.length === 0)).toBe(true)
    expect(outcome.coinWin).toBe(6 * 40 + 2 * 20)
  })

  it('applyColumnWraps는 입력을 바꾸지 않는 순수 함수다', () => {
    const math = makeCoinMath()
    const board = toCoinBoard(math, [bet(2, 0, 1), bet(2, 1, 3), bet(2, 2, 5)])
    const snapshot = JSON.stringify(board)
    const result = applyColumnWraps(board, [], 2, BET)
    expect(JSON.stringify(board)).toBe(snapshot)
    expect(result.wraps).toEqual([{ reel: 2, before: [20, 60, 100], after: [40, 120, 200] }])
    expect(result.wrapped).toEqual([false, false, true, false, false])
    expect(applyColumnWraps(result.board, result.wrapped, 2, BET).wraps).toEqual([])
  })
})

describe('정산·상한', () => {
  it('상한은 숫자 → 보물 → 최고 보물 순으로 채우고 winCapped를 남긴다', () => {
    const math = makeCoinMath({ round: { maxWinCap: 10 } })
    // 기본 판: 코인 6개(전부 x1). 라인 당첨 없음(가운데 줄이 crab/shell 섞임)
    const grid = [
      ['coin', 'coin', 'coin', 'coin', 'coin'],
      ['crab', 'shell', 'crab', 'shell', 'crab'],
      ['coin', 'crab', 'shell', 'crab', 'shell'],
    ]
    // 금액 6회(x1, 보물 large, x1, x1, x1, x1) → 리스핀 3번 꽝
    const rng = scripted([0, 4, 0, 0, 0, 0, ...misses(9), ...misses(9), ...misses(9)])
    const result = resolveSpin(math, grid, [0, 0, 0, 0, 0], BET, BET, undefined, grid, [], rng)
    const respin = result.features.find((feature) => feature.type === 'coinRespin')
    expect(respin?.type).toBe('coinRespin')
    if (respin?.type !== 'coinRespin') return
    expect(respin.capped).toBe(true)
    expect(respin.win).toBe(10 * BET)
    expect(result.respinWin).toBe(10 * BET)
    expect(result.totalWin).toBe(10 * BET)
    const capped = result.features.find((feature) => feature.type === 'winCapped')
    expect(capped).toEqual({ type: 'winCapped', requested: 5 * BET + 200 * BET, granted: 10 * BET, cap: 10 * BET })
  })

  it('비진입 스핀은 coinBoard만 싣고 코인은 지급하지 않는다', () => {
    const math = makeCoinMath()
    const grid = [
      ['crab', 'crab', 'crab', 'coin', 'shell'],
      ['coin', 'shell', 'crab', 'shell', 'crab'],
      ['shell', 'crab', 'shell', 'crab', 'shell'],
    ]
    const rng = scripted([1, 0])
    const result = resolveSpin(math, grid, [0, 0, 0, 0, 0], BET, BET, undefined, grid, [], rng)
    expect(result.features).toEqual([{ type: 'coinBoard', cells: [bet(0, 1, 2), bet(3, 0, 1)] }])
    expect(result.respinWin).toBeUndefined()
    expect(result.totalWin).toBe(result.lineWin)
  })
})

describe('kraken-cove 팩', () => {
  it('RNG 호출 수: 비진입 = 5 + 코인 수, 진입 = 5 + 코인 수 + Σ(빈칸 + 새 코인)', () => {
    let entries = 0
    for (let i = 0; i < 4000 && entries < 5; i += 1) {
      const rng = counting(createSeededRng(`count-${i}`))
      const result = spinUnchecked(KRAKEN, 100, rng)
      const board = result.features.find((feature) => feature.type === 'coinBoard')
      const coins = board?.type === 'coinBoard' ? board.cells.length : 0
      const respin = result.features.find((feature) => feature.type === 'coinRespin')
      let expected = 5 + coins
      if (respin?.type === 'coinRespin') {
        entries += 1
        let empties = 15 - coins
        for (const step of respin.steps) {
          expected += empties + step.newCoins.length
          empties -= step.newCoins.length
        }
      }
      expect(rng.calls).toBe(expected)
    }
  })

  it('무작위 50,000라운드: 리스핀 ≤ 30, 하드캡 0, foldRespin = final, win = coinWin + topWin', () => {
    const rng = createSeededRng('rounds')
    let maxSteps = 0
    for (let i = 0; i < 50_000; i += 1) {
      const entry: CoinCell[] = []
      const cells = 6 + rng.nextInt(4)
      const taken = new Set<number>()
      while (entry.length < cells) {
        const at = rng.nextInt(15)
        if (taken.has(at)) continue
        taken.add(at)
        entry.push({ pos: [Math.floor(at / 3), at % 3], kind: 'bet', value: 1, amount: 100 })
      }
      entry.sort((a, b) => a.pos[0] * 3 + a.pos[1] - (b.pos[0] * 3 + b.pos[1]))
      const outcome = runCoinRespin(KRAKEN, entry, 100, Infinity, rng)
      maxSteps = Math.max(maxSteps, outcome.steps.length)
      expect(outcome.hitHardCap).toBe(false)
      expect(outcome.win).toBe(outcome.coinWin + outcome.topWin)
      if (i % 50 === 0) expect(foldRespin(KRAKEN, outcome)).toEqual(outcome.final)
    }
    expect(maxSteps).toBeLessThanOrEqual(30)
  })

  it('진입 스핀의 totalWin = lineWin + respinWin, 응답 피처 JSON이 12KB 이하', () => {
    let found = 0
    let largest = 0
    for (let i = 0; i < 20_000 && found < 40; i += 1) {
      const result = spinUnchecked(KRAKEN, 1000, createSeededRng(`entry-${i}`))
      if (result.respinWin === undefined) continue
      found += 1
      expect(result.totalWin).toBe(result.lineWin + result.respinWin)
      largest = Math.max(largest, JSON.stringify(result.features).length)
    }
    expect(found).toBeGreaterThan(0)
    expect(largest).toBeLessThan(12_000)
  })
})
