import { describe, expect, it } from 'vitest'
import { createSeededRng, foldRespin, spin, type CoinCell, type GameMath } from '@tgslot/slot-engine'
import {
  buildRespinPlan,
  compressRespin,
  compressRespinStep,
  coinBoardCells,
  emptyCoinBoard,
  foldRespinBoard,
  placeCoin,
  respinCollectTotalMs,
  respinPulseGapMs,
  respinRoundMs,
  respinSkipStepMs,
  respinSkipWrapMs,
  respinSpeedRow,
  respinStepDurations,
  respinWrapDurations,
  type RespinInput,
  type RespinPlan,
} from './respin.js'
import { RESPIN_STEP_MS, type RespinSpeedRow } from './respinConstants.js'
import { loadGameMath } from './testSupport.js'

const ROWS: RespinSpeedRow[] = ['normal', 'quick', 'turbo', 'reduced']
const BET = 100

interface Round {
  input: RespinInput
  /** 기본 판 코인(coinBoard). */
  coins: CoinCell[]
}

/** 실제 팩의 math.json으로 코인 리스핀 라운드를 모은다. 같은 시드면 늘 같은 라운드가 나온다. */
function collectRounds(math: GameMath, want: number, maxSpins = 60000): Round[] {
  const rounds: Round[] = []
  for (let i = 0; i < maxSpins && rounds.length < want; i += 1) {
    const result = spin(math, { totalBet: BET }, createSeededRng(`respin-test:${i}`))
    const feature = result.features.find((f) => f.type === 'coinRespin')
    if (feature === undefined || feature.type !== 'coinRespin') continue
    rounds.push({ input: feature, coins: feature.entry })
  }
  return rounds
}

const math = loadGameMath('kraken-cove')
const rounds = collectRounds(math, 120)

function planOf(round: Round, row: RespinSpeedRow = 'normal'): RespinPlan {
  const speed = row === 'reduced' ? 'normal' : row
  return buildRespinPlan(math.reels, math.rows, round.input, {
    speed,
    reducedMotion: row === 'reduced',
    respins: math.coinRespin?.respins ?? 3,
  })
}

describe('표본', () => {
  it('실제 math.json에서 라운드를 충분히 모았다', () => {
    expect(rounds.length).toBeGreaterThanOrEqual(100)
    // 시간 예산·감기 검증이 비어 돌지 않도록, 표본에 감기·보물·진입 감기가 모두 있어야 한다.
    expect(rounds.some((r) => r.input.entryWraps.length > 0)).toBe(true)
    expect(rounds.some((r) => r.input.steps.some((s) => s.wraps.length > 0))).toBe(true)
    expect(rounds.some((r) => r.input.final.some((c) => c.kind === 'treasure'))).toBe(true)
  })
})

describe('판 접기', () => {
  it('접은 판이 엔진 foldRespin과 같다', () => {
    for (const round of rounds) {
      const ours = foldRespinBoard(math.reels, math.rows, round.input)
      const engine = foldRespin(math, round.input as unknown as Parameters<typeof foldRespin>[1])
      expect(ours).toEqual(engine)
    }
  })

  it('접은 판이 서버 final과 같다', () => {
    for (const round of rounds) {
      expect(foldRespinBoard(math.reels, math.rows, round.input)).toEqual(round.input.final)
    }
  })

  it('입력을 바꾸지 않는다', () => {
    const round = rounds[0]
    if (round === undefined) throw new Error('표본 없음')
    const before = JSON.stringify(round.input)
    planOf(round)
    foldRespinBoard(math.reels, math.rows, round.input)
    expect(JSON.stringify(round.input)).toBe(before)
  })

  it('판 밖 좌표는 던진다', () => {
    const board = emptyCoinBoard(5, 3)
    expect(() => placeCoin(board, { pos: [9, 0], kind: 'bet', value: 1, amount: 1 })).toThrow(RangeError)
    expect(() => placeCoin(board, { pos: [0, 3], kind: 'bet', value: 1, amount: 1 })).toThrow(RangeError)
    placeCoin(board, { pos: [1, 2], kind: 'bet', value: 1, amount: 100 })
    expect(coinBoardCells(board)).toHaveLength(1)
  })
})

describe('계획', () => {
  it('모든 표본이 어긋나지 않는다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      expect(plan.mismatch).toBe(false)
      expect(plan.steps).toHaveLength(round.input.steps.length)
    }
  })

  it('객체 키 순서가 바뀐 응답(Postgres jsonb 재전송)도 어긋나지 않고 같은 계획을 만든다', () => {
    // jsonb는 배열 순서는 지키지만 객체 키 순서를 바꾼다. 멱등 재전송·이어 보기가 그 응답을 그대로 재생한다.
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder)
      if (value === null || typeof value !== 'object') return value
      const entries = Object.entries(value as Record<string, unknown>).reverse()
      return Object.fromEntries(entries.map(([key, inner]) => [key, reorder(inner)]))
    }
    for (const round of rounds.slice(0, 40)) {
      const shuffled = { ...round, input: reorder(round.input) as typeof round.input }
      const a = planOf(round)
      const b = planOf(shuffled)
      expect(b.mismatch).toBe(false)
      expect(b.coinWin).toBe(a.coinWin)
      expect(b.topWin).toBe(a.topWin)
      expect(b.steps.map((step) => step.newCoins.length)).toEqual(a.steps.map((step) => step.newCoins.length))
    }
  })

  it('리스핀 횟수 카운터가 서버 left와 같고 새 코인이 있으면 리셋된다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      let left = plan.respins
      for (const step of plan.steps) {
        expect(step.leftBefore).toBe(left)
        expect(step.last).toBe(left === 1)
        expect(step.left).toBe(step.newCoins.length > 0 ? plan.respins : left - 1)
        left = step.left
      }
    }
  })

  it('도는 칸은 비어 있던 칸이고 고정 칸은 다시 돌지 않는다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      let filled = plan.entry.length
      for (const step of plan.steps) {
        expect(step.spinning).toHaveLength(plan.reels * plan.rows - filled)
        expect(step.landings.map((l) => l.pos)).toEqual(step.spinning)
        expect(step.landings.filter((l) => l.coin !== null)).toHaveLength(step.newCoins.length)
        filled += step.newCoins.length
        expect(step.empty).toBe(plan.reels * plan.rows - filled)
      }
    }
  })

  it('착지 순서는 0부터 이어진다', () => {
    const plan = planOf(rounds[0] as Round)
    for (const step of plan.steps) expect(step.landings.map((l) => l.order)).toEqual(step.landings.map((_, i) => i))
  })

  it('판 위 합계는 줄지 않고 마지막 값이 종료 판의 합이다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      let previous = plan.entryTotal
      expect(plan.entryTotal).toBeGreaterThanOrEqual(plan.entryTotalBefore)
      for (const step of plan.steps) {
        expect(step.coinTotalBefore).toBe(previous)
        expect(step.coinTotalLanded).toBeGreaterThanOrEqual(step.coinTotalBefore)
        expect(step.coinTotal).toBeGreaterThanOrEqual(step.coinTotalLanded)
        previous = step.coinTotal
      }
      const finalSum = round.input.final.reduce((sum, cell) => sum + cell.amount, 0)
      expect(previous).toBe(finalSum)
    }
  })

  it('감기 계획은 보물 칸을 그대로 두고 숫자 칸만 불린다', () => {
    let seen = 0
    for (const round of rounds) {
      const plan = planOf(round)
      const wraps = [...plan.entryWraps, ...plan.steps.flatMap((s) => s.wraps)]
      for (const wrap of wraps) {
        seen += 1
        expect(wrap.cells).toHaveLength(plan.rows)
        for (const cell of wrap.cells) {
          if (cell.kind === 'treasure') expect(cell.after).toBe(cell.before)
          else expect(cell.after).toBe(cell.before * (math.coinRespin?.columnBonus.multiplier ?? 2))
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('한 줄은 라운드에 한 번만 감긴다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      const reels = [...plan.entryWraps, ...plan.steps.flatMap((s) => s.wraps)].map((w) => w.reel)
      expect(new Set(reels).size).toBe(reels.length)
      expect(plan.wrapCount).toBe(reels.length)
    }
  })

  it('보물 단계는 한 번 나오면 계속 남고 같은 단계가 두 번 나오지 않는다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      let seen = plan.entryTreasures.length
      for (const step of plan.steps) {
        expect(step.treasures.length).toBeGreaterThanOrEqual(seen)
        seen = step.treasures.length
      }
      const tiers = round.input.final.filter((c) => c.kind === 'treasure').map((c) => c.tier)
      expect(new Set(tiers).size).toBe(tiers.length)
    }
  })

  it('정산 누적은 coinWin에서 끝나고 줄지 않는다', () => {
    for (const round of rounds) {
      const plan = planOf(round)
      expect(plan.collect).toHaveLength(round.input.final.length)
      let previous = 0
      for (const item of plan.collect) {
        expect(item.running).toBeGreaterThanOrEqual(previous)
        previous = item.running
      }
      expect(previous).toBe(round.input.coinWin)
      expect(plan.win).toBe(plan.coinWin + plan.topWin)
    }
  })

  it('지급 상한에 잘린 라운드도 누적이 coinWin을 넘지 않는다', () => {
    const round = rounds[0] as Round
    const capped: RespinInput = { ...round.input, coinWin: 100, capped: true }
    const plan = buildRespinPlan(5, 3, capped, { respins: 3 })
    expect(Math.max(...plan.collect.map((i) => i.running))).toBe(100)
  })

  it('어긋난 단계는 던진다', () => {
    const round = rounds.find((r) => r.input.steps.length > 0) as Round
    const first = round.input.steps[0]
    if (first === undefined) throw new Error('표본 없음')
    const broken: RespinInput = {
      ...round.input,
      steps: [{ ...first, grid: first.grid.slice(0, 2) }, ...round.input.steps.slice(1)],
    }
    expect(() => buildRespinPlan(5, 3, broken, { respins: 3 })).toThrow(RangeError)
  })

  it('진입 판에 이미 코인이 있는 칸에 새 코인이 붙으면 던진다', () => {
    const round = rounds.find((r) => r.input.steps.some((s) => s.newCoins.length > 0)) as Round
    const index = round.input.steps.findIndex((s) => s.newCoins.length > 0)
    const step = round.input.steps[index]
    const entry0 = round.input.entry[0]
    if (step === undefined || entry0 === undefined) throw new Error('표본 없음')
    const dup = step.newCoins.map((c, i) => (i === 0 ? { ...c, pos: [entry0.pos[0], entry0.pos[1]] as [number, number] } : c))
    const broken: RespinInput = {
      ...round.input,
      steps: round.input.steps.map((s, i) => (i === index ? { ...s, newCoins: dup } : s)),
    }
    expect(() => buildRespinPlan(5, 3, broken, { respins: 3 })).toThrow(RangeError)
  })
})

describe('시간표', () => {
  it('리스핀 1회 길이가 기획서 §7-4 표와 같다', () => {
    const table: Record<RespinSpeedRow, [number, number]> = {
      normal: [800, 1100],
      quick: [600, 820],
      turbo: [420, 560],
      reduced: [300, 380],
    }
    for (const row of ROWS) {
      const [none, coin] = table[row]
      expect(respinStepDurations(row, { newCoins: false, last: false }).totalMs).toBe(none)
      expect(respinStepDurations(row, { newCoins: true, last: false }).totalMs).toBe(coin)
    }
  })

  it('마지막 리스핀은 normal·quick만 칸 회전이 느려진다', () => {
    expect(respinStepDurations('normal', { newCoins: false, last: true }).spinMs).toBe(900)
    expect(respinStepDurations('quick', { newCoins: false, last: true }).spinMs).toBe(600)
    expect(respinStepDurations('turbo', { newCoins: false, last: true }).spinMs).toBe(
      respinStepDurations('turbo', { newCoins: false, last: false }).spinMs,
    )
    expect(respinStepDurations('reduced', { newCoins: false, last: true }).spinMs).toBe(
      respinStepDurations('reduced', { newCoins: false, last: false }).spinMs,
    )
  })

  it('스태거는 마지막 칸이 회전 길이 안에 서도록 묶인다', () => {
    for (const row of ROWS) {
      for (const cells of [1, 2, 9, 14]) {
        const d = respinStepDurations(row, { newCoins: false, last: false, spinningCells: cells })
        expect(d.staggerMs * Math.max(0, cells - 1)).toBeLessThanOrEqual(d.spinMs * 0.5)
        expect(d.staggerMs).toBeLessThanOrEqual(35)
      }
    }
  })

  it('촉수 감기 1줄 길이가 표와 같다', () => {
    expect(respinWrapDurations('normal').totalMs).toBe(900)
    expect(respinWrapDurations('quick').totalMs).toBe(680)
    expect(respinWrapDurations('turbo').totalMs).toBe(450)
    expect(respinWrapDurations('reduced').totalMs).toBe(200)
  })

  it('정산: 코인 9개가 normal에서 약 1.1초 안에 줄을 선다', () => {
    const nine = Array.from({ length: 9 }, (_, i): CoinCell => ({ pos: [i % 5, i % 3], kind: 'bet', value: 1, amount: 100 }))
    // 간격 120ms × 9 = 1,080ms + 마지막 코인이 날아가는 시간.
    expect(respinCollectTotalMs('normal', nine, false)).toBeLessThan(1500)
    expect(respinCollectTotalMs('normal', nine, false)).toBeGreaterThanOrEqual(1080)
    expect(respinCollectTotalMs('reduced', nine, false)).toBeLessThan(500)
  })

  it('진입 펄스는 코인이 많아도 상한을 넘지 않는다', () => {
    for (const coins of [1, 6, 9, 15]) {
      expect(respinPulseGapMs(coins) * coins).toBeLessThanOrEqual(700)
    }
    expect(respinPulseGapMs(6)).toBe(80)
  })

  it('속도 행은 모션 축소가 우선한다', () => {
    expect(respinSpeedRow('turbo', true)).toBe('reduced')
    expect(respinSpeedRow('quick', false)).toBe('quick')
    expect(respinSpeedRow(undefined, false)).toBe('normal')
  })
})

describe('STOP 압축', () => {
  it('리스핀 1회는 [90, 220]ms로 묶인다', () => {
    for (let remaining = 1; remaining <= 30; remaining += 1) {
      const ms = respinSkipStepMs(remaining)
      expect(ms).toBeGreaterThanOrEqual(90)
      expect(ms).toBeLessThanOrEqual(220)
    }
  })

  it('남은 리스핀이 16회 이하면 합이 1.5초 안이다', () => {
    for (let remaining = 1; remaining <= 16; remaining += 1) {
      expect(respinSkipStepMs(remaining) * remaining).toBeLessThanOrEqual(1500)
    }
  })

  it('STOP 뒤 촉수 점멸은 남은 줄이 300ms를 나눠 쓰고 줄마다 90ms는 남긴다', () => {
    expect(respinSkipWrapMs(1)).toBe(300)
    expect(respinSkipWrapMs(2)).toBe(150)
    expect(respinSkipWrapMs(5)).toBe(90)
    expect(respinSkipWrapMs(0)).toBe(300)
    for (let n = 1; n <= 5; n += 1) expect(respinSkipWrapMs(n) * n).toBeLessThanOrEqual(450)
  })

  it('촉수는 300ms 점멸, 정산은 600ms 일괄이다', () => {
    const c = compressRespin(10)
    expect(c.wrapMs).toBe(300)
    expect(c.collectMs).toBe(600)
  })

  it('압축한 리스핀도 칸 회전을 위치 트윈으로 남긴다(길이가 0이 아니다)', () => {
    for (const ms of [90, 150, 220]) {
      for (const newCoins of [false, true]) {
        const d = compressRespinStep(ms, { newCoins })
        expect(d.totalMs).toBe(ms)
        expect(d.spinMs).toBeGreaterThan(0)
        expect(d.spinMs + d.pinMs + d.settleMs).toBe(ms)
        expect(d.pinMs > 0).toBe(newCoins)
      }
    }
  })
})

describe('시간 예산 게이트', () => {
  // 기획서 §7-4: 일반 라운드(평균 리스핀 7.2회·감기 1줄·클립 2편) 합이 속도 행마다 이 값 안이어야 한다.
  const typicalGate: Record<RespinSpeedRow, number> = { normal: 18000, quick: 15000, turbo: 12500, reduced: 10500 }
  // 최악(리스핀 30회·감기 5줄·15칸)의 상한.
  const worstGate: Record<RespinSpeedRow, number> = { normal: 46000, quick: 36000, turbo: 27000, reduced: 19000 }
  /** 모션 축소는 클립 대신 단색 커튼이라 전환 두 번이 짧다. */
  const clipMsFor = (row: RespinSpeedRow): number => (row === 'reduced' ? 800 : 6000)

  it('실제 라운드 평균이 일반 게이트 안이다', () => {
    for (const row of ROWS) {
      const totals = rounds.map((r) => respinRoundMs(planOf(r, row), { clipMs: clipMsFor(row) }))
      const mean = totals.reduce((a, b) => a + b, 0) / totals.length
      expect(mean).toBeLessThanOrEqual(typicalGate[row])
    }
  })

  it('실제 라운드 중 가장 긴 것도 최악 게이트 안이다', () => {
    for (const row of ROWS) {
      const longest = Math.max(...rounds.map((r) => respinRoundMs(planOf(r, row), { clipMs: clipMsFor(row) })))
      expect(longest).toBeLessThanOrEqual(worstGate[row])
    }
  })

  it('구조상 최악(30회 · 감기 5줄 · 15칸)도 최악 게이트 안이다', () => {
    const coin = (reel: number, row: number): CoinCell => ({ pos: [reel, row], kind: 'bet', value: 2, amount: 200 })
    const fifteen = Array.from({ length: 15 }, (_, i): CoinCell => coin(Math.floor(i / 3), i % 3))
    for (const row of ROWS) {
      const base = RESPIN_STEP_MS[row]
      // 리스핀 30회 중 새 코인이 붙는 것은 9번(빈칸 9개), 나머지 21번은 헛돈다.
      const stepsMs = 21 * (base.spinMs + base.settleMs) + 9 * (base.spinMs + base.pinMs + base.settleMs)
      const wrapMs = 5 * respinWrapDurations(row).totalMs
      const collect = respinCollectTotalMs(row, fifteen, true)
      const intro = respinPulseGapMs(6) * 6 + (row === 'reduced' ? 0 : 400)
      expect(intro + clipMsFor(row) + stepsMs + wrapMs + collect).toBeLessThanOrEqual(worstGate[row])
    }
  })
})
