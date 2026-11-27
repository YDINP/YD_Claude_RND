import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from './schema.js'
import type { GameMath } from './schema.js'
import {
  applyGardenStep,
  applyGardenSun,
  foldGarden,
  gardenBoundsFor,
  gardenNewCells,
  runGarden,
} from './garden.js'
import { spin, spinUnchecked } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import type { GardenSeed, GardenTrigger } from './gardenTypes.js'
import type { RoundState, Rng, SpinResult } from './types.js'

const BET = 20
/** 칸 문자 → 심볼. 배경은 상하좌우가 늘 다른 4종 바둑판이라 클러스터가 생기지 않는다. */
const CHAR: Record<string, string> = { a: 'a', b: 'b', w: 'w', s: 's', c: 'c', d: 'd', e: 'e', f: 'f' }
const FILL = ['c', 'd', 'e', 'f']
const fill = (reel: number, row: number): string => FILL[(row * 2 + reel) % 4] as string

/** 8줄 문자열 → 8×8. `.`은 배경 바둑판. */
function board(rows: string[]): string[][] {
  return rows.map((line, row) => [...line].map((ch, reel) => (ch === '.' ? fill(reel, row) : (CHAR[ch] as string))))
}

/** 리필이 클러스터를 만들지 않게 열마다 g/h를 번갈아 내는 스트립(길이 24 = 8 + maxCascades 2 × 8). */
function refillStrip(reel: number): string[] {
  // 앞 8칸은 스키마(모든 심볼이 스트립에 있어야 함)용. 리필은 끝에서부터 읽으므로 손 판 테스트는 g/h만 받는다.
  const head = ['a', 'b', 'c', 'd', 'e', 'f', 'w', 's']
  return [...head, ...Array.from({ length: 16 }, (_, i) => ((i + reel) % 2 === 0 ? 'g' : 'h'))]
}

function gardenMathJson(growBoard: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'garden-test',
    reels: 8,
    rows: 8,
    payModel: 'cluster',
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 's', name: { en: 'Scatter' }, scatter: true },
      { id: 'a', name: { en: 'A' } },
      { id: 'b', name: { en: 'B' } },
      { id: 'c', name: { en: 'C' } },
      { id: 'd', name: { en: 'D' } },
      { id: 'e', name: { en: 'E' } },
      { id: 'f', name: { en: 'F' } },
      { id: 'g', name: { en: 'G' } },
      { id: 'h', name: { en: 'H' } },
    ],
    strips: Array.from({ length: 8 }, (_, reel) => refillStrip(reel)),
    cluster: { minCluster: 5, adjacency: 'orthogonal', wildJoins: true },
    round: { maxWinCap: 5000 },
    growBoard: {
      startSize: 4,
      maxSize: 8,
      thresholds: [5, 50, 60, 70],
      maxCascades: 2,
      seedTiers: [2, 3, 5, 10, 20],
      seedTable: [
        { tier: -1, weight: 1 },
        { tier: 0, weight: 1 },
      ],
      clusterSeedCap: 7,
      maxSeeds: 16,
      bonus: {
        trigger: 3,
        spinsByCount: { 3: 10, 4: 11, 5: 12 },
        minStartSize: 5,
        retriggerSpins: 4,
        maxRetriggers: 2,
        seedTable: [{ tier: -1, weight: 1 }],
        sunEvery: 40,
        sunPlant: 2,
        maxSunsPerSpin: 1,
        minRoundPay: 10,
      },
      ...growBoard,
    },
    paytable: {
      a: { 5: 2, 6: 3 },
      b: { 5: 1, 6: 1.5 },
      c: { 5: 0.5 },
      d: { 5: 0.5 },
      e: { 5: 0.5 },
      f: { 5: 0.5 },
      g: { 5: 0.5 },
      h: { 5: 0.5 },
    },
    wild: { substitutesFor: 'all' },
    scatter: { symbol: 's', pays: { 3: 1 } },
    betLevels: [BET],
    rtpTarget: 0.945,
    volatility: 'high',
    ...overrides,
  }
}

function makeGardenMath(growBoard: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath(gardenMathJson(growBoard, overrides))
}

/** 정해 둔 값을 차례로 내고 호출 수를 센다(값이 떨어지면 0). */
function scripted(values: number[] = []): Rng & { calls: number } {
  const queue = [...values]
  const rng = {
    calls: 0,
    nextInt(max: number): number {
      rng.calls += 1
      return Math.min(queue.shift() ?? 0, max - 1)
    },
  }
  return rng
}

function counting(rng: Rng): Rng & { calls: number } {
  const wrapped = {
    calls: 0,
    nextInt(max: number): number {
      wrapped.calls += 1
      return rng.nextInt(max)
    },
  }
  return wrapped
}

function run(math: GameMath, grid: string[][], start = { stage: 0, popped: 0, seeds: [] as GardenSeed[] }, rng: Rng = scripted()) {
  const config = math.growBoard
  if (config === undefined) throw new Error('growBoard 없음')
  return runGarden(math, grid, new Array(8).fill(0), math.strips, BET, start, config.thresholds, config.seedTable, Infinity, rng)
}

const pack = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../games/greenhouse-garden/math.json', import.meta.url), 'utf8')),
)

function gardenOf(result: SpinResult): GardenTrigger {
  const feature = result.features.find((f) => f.type === 'garden')
  if (feature?.type !== 'garden') throw new Error('garden 피처 없음')
  return feature
}

describe('정원 범위·성장 순서', () => {
  it('4×4 → 8×8 범위와 새 칸 수가 기획서 §2-1과 같다', () => {
    expect([0, 1, 2, 3, 4].map(gardenBoundsFor)).toEqual([
      { x: 2, y: 2, size: 4 },
      { x: 2, y: 1, size: 5 },
      { x: 1, y: 1, size: 6 },
      { x: 1, y: 0, size: 7 },
      { x: 0, y: 0, size: 8 },
    ])
    const counts = [0, 1, 2, 3].map((k) => gardenNewCells(gardenBoundsFor(k), gardenBoundsFor(k + 1)).length)
    expect(counts).toEqual([9, 11, 13, 15])
  })

  it('새 칸은 행 오름차순, 같은 행은 열 오름차순이다(씨앗 추첨 순서)', () => {
    const cells = gardenNewCells(gardenBoundsFor(0), gardenBoundsFor(1))
    expect(cells).toEqual([
      [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
      [6, 2], [6, 3], [6, 4], [6, 5],
    ])
  })
})

describe('applyGardenStep — 활성 범위 안 중력', () => {
  const grid = board(['........', '........', '..aa....', '........', '........', '........', '........', '........'])

  it('활성 범위 밖 칸은 그대로고, 지운 칸 위가 내려온 뒤 refill이 위에 들어간다', () => {
    const bounds = gardenBoundsFor(0)
    const next = applyGardenStep(grid, bounds, {
      index: 0,
      removed: [[2, 4]],
      refill: [['x'], [], [], []],
    })
    // 열 2: 행 2..5 중 행 4 제거 → [x, (2), (3), (5)]
    expect([2, 3, 4, 5].map((row) => next[row]?.[2])).toEqual(['x', grid[2]?.[2], grid[3]?.[2], grid[5]?.[2]])
    for (let row = 0; row < 8; row += 1) {
      for (let reel = 0; reel < 8; reel += 1) {
        if (reel >= 2 && reel <= 5 && row >= 2 && row <= 5) continue
        expect(next[row]?.[reel]).toBe(grid[row]?.[reel])
      }
    }
  })

  it('범위 밖 칸을 지우거나 refill 수가 어긋나면 던진다', () => {
    const bounds = gardenBoundsFor(0)
    expect(() => applyGardenStep(grid, bounds, { index: 0, removed: [[0, 0]], refill: [[], [], [], []] })).toThrow(/활성 범위 밖/)
    expect(() => applyGardenStep(grid, bounds, { index: 0, removed: [[2, 2]], refill: [[], [], [], []] })).toThrow(/refill/)
    expect(() => applyGardenStep(grid, bounds, { index: 0, removed: [[2, 2]], refill: [['x'], []] })).toThrow(/열 수/)
  })
})

describe('runGarden — 클러스터', () => {
  const math = makeGardenMath({ thresholds: [60, 61, 62, 63] })

  it('L자 5송이는 터지고, 활성 범위 밖의 같은 꽃은 세지 않는다', () => {
    // 활성 4×4는 열 2..5, 행 2..5. 행 2의 열 0·1 a는 범위 밖이라 클러스터에 못 낀다.
    const grid = board(['........', '........', 'aaaaa...', '..a.....', '..a.....', '........', '........', '........'])
    const out = run(math, grid)
    const first = out.steps[0]
    expect(first?.wins).toHaveLength(1)
    expect(first?.wins[0]?.count).toBe(5)
    expect(first?.wins[0]?.positions).toEqual([[2, 2], [2, 3], [2, 4], [3, 2], [4, 2]])
    expect(first?.wins[0]?.win).toBe(2 * BET)
    expect(first?.removed).toEqual([[2, 2], [2, 3], [2, 4], [3, 2], [4, 2]])
  })

  it('나비가 다리를 놓고, 4송이는 미지급, 물뿌리개는 막고, 나비만 모인 판은 미지급', () => {
    const bridged = run(math, board(['........', '........', '..aawa..', '..a.....', '........', '........', '........', '........']))
    expect(bridged.steps[0]?.wins[0]?.count).toBe(5)

    const four = run(math, board(['........', '........', '..aaa...', '..a.....', '........', '........', '........', '........']))
    expect(four.steps).toHaveLength(0)

    const blocked = run(math, board(['........', '........', '..aasa..', '..a.....', '........', '........', '........', '........']))
    expect(blocked.steps).toHaveLength(0)

    const wildOnly = run(math, board(['........', '........', '..wwww..', '..w.....', '........', '........', '........', '........']))
    // 나비는 이웃 꽃 클러스터에 끼어도 나비 자신의 그룹으로는 지급되지 않는다.
    expect(wildOnly.steps.flatMap((step) => step.wins).every((w) => w.symbol !== 'w')).toBe(true)
  })
})

describe('runGarden — 성장', () => {
  it('문턱을 넘은 단계에서 팝 뒤 한 겹 자라고 새 칸마다 씨앗을 한 번씩 뽑는다', () => {
    const math = makeGardenMath({ thresholds: [5, 50, 60, 70] })
    const grid = board(['........', '........', '..aaaaa.', '........', '........', '........', '........', '........'])
    // 활성 열 2..5만 보이므로 a 4칸 + 행 3의 ... → 4칸이면 미지급. 행 3에 a 하나 더.
    grid[3]![2] = 'a'
    const rng = scripted([0, 1, 0, 1, 0, 0, 0, 0, 0])
    const out = run(math, grid, undefined, rng)
    const step = out.steps[0]
    expect(step?.wins).toHaveLength(1)
    expect(step?.grow?.from).toEqual(gardenBoundsFor(0))
    expect(step?.grow?.to).toEqual(gardenBoundsFor(1))
    expect(step?.grow?.cells).toHaveLength(9)
    expect(rng.calls).toBe(9)
    expect(out.stage).toBe(1)
    // 가중치 정렬 키 "-1"(없음) < "0"(×2). nextInt 값 1이 ×2 씨앗이다.
    expect(step?.grow?.seeds).toEqual([
      { reel: 3, row: 1, tier: 0 },
      { reel: 5, row: 1, tier: 0 },
    ])
  })

  it('당첨이 없어도 문턱이 남아 있으면 성장만 하는 단계가 생기고, 8×8에서 멈춘다', () => {
    const math = makeGardenMath({ thresholds: [1, 2, 3, 4] })
    const grid = board(['........', '........', '..aaa...', '..aa....', '........', '........', '........', '........'])
    const out = run(math, grid)
    expect(out.stage).toBe(4)
    const growOnly = out.steps.filter((step) => step.wins.length === 0)
    expect(growOnly.length).toBeGreaterThanOrEqual(3)
    expect(out.steps.filter((step) => step.grow !== undefined)).toHaveLength(4)
    for (const step of out.steps) expect(step.grow === undefined || step.grow.to.size === step.grow.from.size + 1).toBe(true)
  })

  it('팝 단계는 maxCascades에서 멈추고 남은 클러스터는 지급하지 않는다', () => {
    const math = makeGardenMath({ thresholds: [60, 61, 62, 63], maxCascades: 1 }, {
      strips: Array.from({ length: 8 }, () => [...['b', 'c', 'd', 'e', 'f', 'w', 's', 'g', 'h'], ...new Array(7).fill('a')]),
    })
    const grid = board(['........', '........', '..aaa...', '..aa....', '........', '........', '........', '........'])
    const out = run(math, grid)
    expect(out.steps.filter((step) => step.wins.length > 0)).toHaveLength(1)
    expect(out.hitMaxCascades).toBe(true)
  })
})

describe('runGarden — 씨앗', () => {
  const grid = board(['........', '........', '..aaa...', '..aa....', '........', '........', '........', '........'])

  it('씨앗 칸이 낀 클러스터에 씨앗 값의 합(상한 clusterSeedCap)을 곱하고, 쓰인 씨앗은 사라진다', () => {
    const math = makeGardenMath({ thresholds: [60, 61, 62, 63] })
    const seeds: GardenSeed[] = [
      { reel: 2, row: 2, tier: 1 }, // ×3
      { reel: 3, row: 2, tier: 2 }, // ×5 → 합 8, 상한 7
      { reel: 5, row: 5, tier: 0 }, // 클러스터 밖: 남는다
    ]
    const out = run(math, grid, { stage: 0, popped: 0, seeds })
    const win = out.steps[0]?.wins[0]
    expect(win?.seed).toBe(7)
    expect(win?.win).toBe(2 * BET * 7)
    expect(out.steps[0]?.bloomed).toEqual([[2, 2], [3, 2]])
    expect(out.seeds).toEqual([{ reel: 5, row: 5, tier: 0 }])
  })

  it('나비 칸 씨앗은 기본 배수가 가장 큰 클러스터 하나에만 붙는다', () => {
    const math = makeGardenMath({ thresholds: [60, 61, 62, 63] })
    // 열 2..5 / 행 2..5. 왼쪽 a 4칸 + 나비 + 오른쪽 b 4칸. 나비(4,3)가 a(2배)와 b(1배) 양쪽에 낀다.
    const two = board(['........', '........', '..aa.bb.', '..awbb..', '........', '........', '........', '........'])
    two[2]![4] = 'a'
    two[2]![5] = 'b'
    two[3]![5] = 'b'
    two[4]![5] = 'b'
    two[4]![4] = 'b'
    const out = run(math, two, { stage: 0, popped: 0, seeds: [{ reel: 3, row: 3, tier: 0 }] })
    const wins = out.steps[0]?.wins ?? []
    const a = wins.find((w) => w.symbol === 'a')
    const b = wins.find((w) => w.symbol === 'b')
    expect(a?.seed).toBe(2)
    expect(b?.seed).toBeUndefined()
  })

  it('성장 때 기존 씨앗만 한 등급 오르고(최고 등급에서 멈춤), 새 씨앗은 그 성장에서 자라지 않는다', () => {
    const math = makeGardenMath({ thresholds: [5, 50, 60, 70] })
    const seeds: GardenSeed[] = [
      { reel: 5, row: 5, tier: 0 },
      { reel: 5, row: 4, tier: 4 },
    ]
    const rng = scripted([1])
    const out = run(math, grid, { stage: 0, popped: 0, seeds }, rng)
    expect(out.steps[0]?.grow?.grown).toBe(1)
    expect(out.seeds).toEqual([
      { reel: 2, row: 1, tier: 0 },
      { reel: 5, row: 4, tier: 4 },
      { reel: 5, row: 5, tier: 1 },
    ])
  })

  it('씨앗이 maxSeeds면 추첨은 그대로 하고 결과를 버린다', () => {
    const math = makeGardenMath({ thresholds: [5, 50, 60, 70], maxSeeds: 1 })
    const rng = scripted([1, 1, 1, 1, 1, 1, 1, 1, 1])
    const out = run(math, grid, { stage: 0, popped: 0, seeds: [{ reel: 5, row: 5, tier: 0 }] }, rng)
    expect(rng.calls).toBe(9)
    expect(out.seeds).toHaveLength(1)
  })
})

describe('햇살', () => {
  it('씨앗 전부 +1등급, 빈 화분 2곳에 ×2 씨앗, 최대 씨앗 수에 걸려도 추첨 2회', () => {
    const config = makeGardenMath().growBoard!
    const seeds: GardenSeed[] = [{ reel: 0, row: 0, tier: 0 }]
    const rng = scripted([0, 0])
    const sun = applyGardenSun(config, seeds, gardenBoundsFor(4), rng)
    expect(rng.calls).toBe(2)
    expect(sun.grown).toBe(1)
    // 첫 추첨: 빈 칸 목록 0번 = (1,0). 두 번째: (2,0).
    expect(sun.planted).toEqual([
      { reel: 1, row: 0, tier: 0 },
      { reel: 2, row: 0, tier: 0 },
    ])
    expect(sun.seeds.map((s) => s.tier)).toEqual([1, 0, 0])

    const full = makeGardenMath({ maxSeeds: 1 }).growBoard!
    const rng2 = scripted([0, 0])
    const capped = applyGardenSun(full, [{ reel: 0, row: 0, tier: 0 }], gardenBoundsFor(4), rng2)
    expect(rng2.calls).toBe(2)
    expect(capped.planted).toEqual([])
  })
})

describe('greenhouse-garden 팩 실스핀', () => {
  it('RNG 호출 수 = 릴 정지 8 + 성장 새 칸 수 + 햇살 심기 2회씩', () => {
    const base = createSeededRng('garden-rng-count')
    let grownSpins = 0
    let state: RoundState | undefined
    for (let i = 0; i < 3000; i += 1) {
      const rng = counting(base)
      const result = spinUnchecked(pack, BET, rng, state)
      const garden = gardenOf(result)
      const newCells = garden.steps.reduce((sum, step) => sum + (step.grow?.cells.length ?? 0), 0)
      const sunDraws = (garden.sun?.length ?? 0) * (pack.growBoard?.bonus.sunPlant ?? 0)
      expect(rng.calls).toBe(8 + newCells + sunDraws)
      if (newCells > 0) grownSpins += 1
      state = result.nextState
    }
    expect(grownSpins).toBeGreaterThan(50)
  })

  it('foldGarden(grid, start, steps)가 finalGrid·씨앗과 같고, 유료 스핀은 4×4·씨앗 없음에서 시작한다', () => {
    const rng = createSeededRng('garden-fold')
    const maxTier = (pack.growBoard?.seedTiers.length ?? 1) - 1
    let free = 0
    for (let i = 0; i < 2000; i += 1) {
      const paid = spin(pack, { totalBet: BET }, rng)
      const g = gardenOf(paid)
      expect(g.start).toEqual(gardenBoundsFor(0))
      expect(g.startSeeds).toEqual([])
      expect(g.startPopped).toBe(0)
      const fold = foldGarden(paid.grid, g.start, g.steps, g.startSeeds, maxTier)
      expect(fold.grid).toEqual(g.finalGrid)
      expect(fold.bounds).toEqual(g.final)
      expect(fold.seeds).toEqual(g.seeds)
      let state = paid.nextState
      while (state !== undefined) {
        const next = spin(pack, { totalBet: BET }, rng, state)
        const fg = gardenOf(next)
        const fs = foldGarden(next.grid, fg.start, fg.steps, fg.startSeeds, maxTier)
        expect(fs.grid).toEqual(fg.finalGrid)
        expect(fs.bounds).toEqual(fg.final)
        if (fg.sun === undefined) expect(fs.seeds).toEqual(fg.seeds)
        else expect(fg.sun[fg.sun.length - 1]?.seeds).toEqual(fg.seeds)
        free += 1
        state = next.nextState
      }
    }
    expect(free).toBeGreaterThan(0)
  })

  it('프리스핀 진입은 최소 5×5·막대 = 그 크기 프리스핀 문턱·남은 씨앗을 넘기고, 다음 스핀이 거기서 이어진다', () => {
    const rng = createSeededRng('garden-entry')
    const config = pack.growBoard!
    const bonusThresholds = config.bonus.thresholds ?? config.thresholds
    let checked = 0
    for (let i = 0; i < 20000 && checked < 5; i += 1) {
      const paid = spin(pack, { totalBet: BET }, rng)
      const state = paid.nextState
      if (state === undefined) continue
      const g = gardenOf(paid)
      const carry = state.carry?.garden
      expect(carry).toBeDefined()
      const startStage = Math.max(1, ['4', '5', '6', '7', '8'].indexOf(String(g.final.size)))
      expect(carry?.stage).toBe(startStage)
      expect(carry?.popped).toBe(bonusThresholds[startStage - 1])
      expect(carry?.seeds).toEqual(g.seeds)
      expect(carry?.roundWin).toBe(paid.totalWin)
      expect(paid.features.some((f) => f.type === 'freeSpins' && !f.retrigger)).toBe(true)
      const next = spin(pack, { totalBet: BET }, rng, state)
      const fg = gardenOf(next)
      expect(fg.start).toEqual(gardenBoundsFor(startStage))
      expect(fg.startSeeds).toEqual(carry?.seeds)
      expect(fg.startPopped).toBe(carry?.popped)
      expect(fg.round).toBeDefined()
      checked += 1
    }
    expect(checked).toBe(5)
  })

  it('라운드는 리트리거 최대 2회로 끝나고, 마지막 스핀은 최저 보장으로 프리스핀 합을 ×10 이상으로 채운다', () => {
    const rng = createSeededRng('garden-round')
    const config = pack.growBoard!
    const maxSpins = 12 + config.bonus.retriggerSpins * config.bonus.maxRetriggers
    let rounds = 0
    let topUps = 0
    for (let i = 0; i < 40000 && rounds < 60; i += 1) {
      const paid = spin(pack, { totalBet: BET }, rng)
      let state = paid.nextState
      if (state === undefined) continue
      rounds += 1
      let spins = 0
      let freeWin = 0
      let retriggers = 0
      let last: SpinResult | undefined
      while (state !== undefined) {
        const next = spin(pack, { totalBet: BET }, rng, state)
        spins += 1
        freeWin += next.totalWin
        retriggers += next.features.filter((f) => f.type === 'freeSpins' && f.retrigger).length
        last = next
        state = next.nextState
      }
      expect(spins).toBeLessThanOrEqual(maxSpins)
      expect(retriggers).toBeLessThanOrEqual(config.bonus.maxRetriggers)
      expect(freeWin).toBeGreaterThanOrEqual(config.bonus.minRoundPay * BET)
      const g = gardenOf(last!)
      expect(g.round?.freeWin).toBe(freeWin)
      const top = last!.features.find((f) => f.type === 'gardenTopUp')
      if (top?.type === 'gardenTopUp') {
        topUps += 1
        expect(g.round?.topUp).toBe(top.amount)
        expect(freeWin).toBe(config.bonus.minRoundPay * BET)
        // 최저 보장으로 채운 금액은 «최고 한 판»에 들어가지 않는다.
        expect(g.round?.bestSpinWin).toBeLessThanOrEqual(freeWin - top.amount)
      }
    }
    expect(rounds).toBe(60)
    expect(topUps).toBeGreaterThan(0)
  })

  it('라운드 지급 상한에 닿으면 winCapped를 남기고 프리스핀을 열지 않는다', () => {
    const tiny = parseGameMath({ ...JSON.parse(readFileSync(new URL('../../../games/greenhouse-garden/math.json', import.meta.url), 'utf8')), round: { maxWinCap: 0.5 } })
    const rng = createSeededRng('garden-cap')
    let capped = 0
    for (let i = 0; i < 3000; i += 1) {
      const paid = spin(tiny, { totalBet: BET }, rng)
      expect(paid.totalWin).toBeLessThanOrEqual(10)
      if (paid.features.some((f) => f.type === 'winCapped')) {
        capped += 1
        expect(gardenOf(paid).capped).toBe(true)
        expect(paid.nextState).toBeUndefined()
      }
    }
    expect(capped).toBeGreaterThan(0)
  })

  it('최악 스핀 응답(정원 피처 JSON)이 16KB 안이다', () => {
    const rng = createSeededRng('garden-size')
    let biggest = 0
    let state: RoundState | undefined
    for (let i = 0; i < 20000; i += 1) {
      const result = spin(pack, { totalBet: BET }, rng, state)
      biggest = Math.max(biggest, JSON.stringify(result.features).length + JSON.stringify(result.wins).length)
      state = result.nextState
    }
    expect(biggest).toBeLessThan(16 * 1024)
  })

  it('같은 시드·같은 상태면 결과가 비트 단위로 같다', () => {
    const a = spin(pack, { totalBet: BET }, createSeededRng('same'))
    const b = spin(pack, { totalBet: BET }, createSeededRng('same'))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
