import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { foldCascades } from './cascade.js'
import { EMBER_CHANCE_SCALE, heatRail, resolveForgeSpin, rollEmbers, startHeatFor } from './forge.js'
import { parseGameMath } from './schema.js'
import type { GameMath } from './schema.js'
import { isAnalytic } from './analytic.js'
import { getBetUnit, spin, spinUnchecked } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import type { CascadeStep, ForgeRailTrigger, Rng, RoundState, SpinResult } from './types.js'

const raw = JSON.parse(readFileSync(new URL('../../../games/volcano-forge/math.json', import.meta.url), 'utf8')) as Record<string, unknown>
const math: GameMath = parseGameMath(raw)
const config = math.forgeRail!
const BET = 100
const CAP = 5000 * BET

/** 호출한 max를 순서대로 남기는 RNG. */
function recording(inner: Rng): Rng & { calls: number[] } {
  const calls: number[] = []
  return {
    calls,
    nextInt(max) {
      calls.push(max)
      return inner.nextInt(max)
    },
  }
}

/** 늘 0을 주는 RNG — 불씨 판정이 전부 맞고 값은 정렬 첫 키(문자열 정렬 '10')가 나온다. */
const zeroRng: Rng = { nextInt: () => 0 }
/** 늘 max-1을 주는 RNG — 불씨가 하나도 나지 않는다. */
const neverRng: Rng = { nextInt: (max) => max - 1 }

/** 9종을 3~4개씩 섞은 30칸 판(당첨 없음, 모루 없음). */
function quietGrid(): string[][] {
  const fill = ['sword', 'hammer', 'shield', 'helmet', 'ruby', 'crystal', 'horseshoe', 'ingot', 'coal']
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 6 }, (_, reel) => fill[(row * 6 + reel) % 9] as string))
}

/** 0행부터 릴 순서로 n칸을 symbol로 덮는다. */
function withSymbol(symbol: string, n: number, grid = quietGrid()): string[][] {
  const next = grid.map((row) => [...row])
  for (let i = 0; i < n; i += 1) (next[Math.floor(i / 6)] as string[])[i % 6] = symbol
  return next
}

/** 모루 n개(마지막 행부터)를 깐 당첨 없는 판. */
function withAnvils(n: number, grid = quietGrid()): string[][] {
  const next = grid.map((row) => [...row])
  for (let i = 0; i < n; i += 1) (next[4 - Math.floor(i / 6)] as string[])[i % 6] = 'anvil'
  return next
}

function forgeOf(result: SpinResult): ForgeRailTrigger | undefined {
  return result.features.find((feature): feature is ForgeRailTrigger => feature.type === 'forgeRail')
}

const STOPS = [0, 0, 0, 0, 0, 0]

function freeState(patch: Partial<RoundState> = {}, forge: Partial<NonNullable<RoundState['carry']>['forge']> = {}): RoundState {
  return {
    freeSpinsLeft: 5,
    freeSpinsTotal: 10,
    multiplier: 1,
    ...patch,
    carry: { forge: { heat: 0, filled: 0, paid: 0, fulls: 0, bestSpin: 0, ...forge } },
  }
}

describe('volcano-forge 수학 팩', () => {
  it('파싱되고 몬테카를로 전용이며 배당 단위는 총 베팅액이다', () => {
    expect(math.payModel).toBe('anywhere')
    expect(isAnalytic(math)).toBe(false)
    expect(getBetUnit(math, 20)).toBe(20)
    expect(config.slots).toBe(4)
    expect(Object.values(config.values).reduce((a, b) => a + b, 0)).toBe(1000)
  })
})

describe('heatRail (화로 배율 줄, 순수)', () => {
  it('칸 3개까지는 더하기만, 4번째 불씨에서 합계 ×2 후 칸이 빈다', () => {
    const three = heatRail({ heat: 0, filled: 0 }, [{ value: 2 }, { value: 3 }, { value: 5 }], config)
    expect(three).toEqual({ heat: 10, filled: 3, fulls: [] })
    const four = heatRail({ heat: 10, filled: 3 }, [{ value: 4 }], config)
    expect(four).toEqual({ heat: 28, filled: 0, fulls: [{ afterEmber: 0, heatBefore: 14, heatAfter: 28 }] })
  })

  it('한 스핀에 가득이 두 번 날 수 있고 사건 위치를 남긴다', () => {
    const embers = new Array(8).fill({ value: 2 })
    const out = heatRail({ heat: 0, filled: 0 }, embers, config)
    // 2,4,6,8→16 / 18,20,22,24→48
    expect(out.heat).toBe(48)
    expect(out.filled).toBe(0)
    expect(out.fulls).toEqual([
      { afterEmber: 3, heatBefore: 8, heatAfter: 16 },
      { afterEmber: 7, heatBefore: 24, heatAfter: 48 },
    ])
  })

  it('합계는 heatCap(300)에서 멈추고, 칸이 차도 300을 유지한다', () => {
    const out = heatRail({ heat: 290, filled: 2 }, [{ value: 50 }, { value: 2 }], config)
    expect(out.heat).toBe(300)
    expect(out.fulls).toEqual([{ afterEmber: 1, heatBefore: 300, heatAfter: 300 }])
  })

  it('startHeatFor: 모루 4 → 0, 5 → 5, 6+ → 10', () => {
    expect(startHeatFor(config, 4)).toBe(0)
    expect(startHeatFor(config, 5)).toBe(5)
    expect(startHeatFor(config, 6)).toBe(10)
    expect(startHeatFor(config, 9)).toBe(10)
  })
})

describe('rollEmbers (RNG 소비 계약)', () => {
  const steps: CascadeStep[] = [
    { index: 0, wins: [], removed: [], refill: [['a', 'b'], [], ['c'], [], [], ['d']], multiplier: 1, stepWin: 0 },
    { index: 1, wins: [], removed: [], refill: [[], ['e'], [], [], ['f', 'g'], []], multiplier: 1, stepWin: 0 },
  ]

  it('리필 칸마다 nextInt(10000) 1회, 맞으면 값 추첨 1회. 순서는 단계 → 릴 → 위→아래', () => {
    const never = recording(neverRng)
    expect(rollEmbers(config, steps, never, true)).toEqual([])
    expect(never.calls).toEqual(new Array(7).fill(EMBER_CHANCE_SCALE))

    const always = recording(zeroRng)
    const embers = rollEmbers(config, steps, always, false)
    expect(embers.map((ember) => [ember.step, ...ember.position])).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 2, 0],
      [0, 5, 0],
      [1, 1, 0],
      [1, 4, 0],
      [1, 4, 1],
    ])
    expect(embers.every((ember) => ember.value === 10)).toBe(true)
    expect(always.calls).toEqual(new Array(7).fill([EMBER_CHANCE_SCALE, 1000]).flat())
  })

  it('확률 0이면 불씨가 없고 리필 수만큼만 소비한다', () => {
    const rng = recording(zeroRng)
    expect(rollEmbers({ ...config, spawn: { chanceBase: 0, chanceFree: 0 } }, steps, rng, false)).toEqual([])
    expect(rng.calls).toHaveLength(7)
  })
})

describe('spin 경로 (실제 수학)', () => {
  it('RNG 호출 수 = 6 + 리필 칸 + 불씨 수, 첫 6회는 릴 정지다', () => {
    const rng = recording(createSeededRng('forge-calls'))
    let quiet = 0
    let cascaded = 0
    for (let i = 0; i < 3000; i += 1) {
      const before = rng.calls.length
      const result = spinUnchecked(math, BET, rng)
      const used = rng.calls.slice(before)
      const refills = (result.cascades ?? []).reduce((sum, step) => sum + step.refill.reduce((s, c) => s + c.length, 0), 0)
      const embers = forgeOf(result)?.embers.length ?? 0
      expect(used.length).toBe(6 + refills + embers)
      expect(used.slice(0, 6)).toEqual(math.strips.map((strip) => strip.length))
      if (refills === 0) quiet += 1
      else cascaded += 1
    }
    expect(quiet).toBeGreaterThan(0)
    expect(cascaded).toBeGreaterThan(0)
  })

  it('불변식 2,000판: foldCascades = finalGrid, 정산식, 불씨 위치는 리필 칸', () => {
    const rng = createSeededRng('forge-invariants')
    let withEmbers = 0
    for (let i = 0; i < 2000; i += 1) {
      const result = spin(math, { totalBet: BET }, rng)
      expect(foldCascades(result.grid, result.cascades ?? [])).toEqual(result.finalGrid)
      const rail = forgeOf(result)
      const baseWin = (result.cascades ?? []).reduce((sum, step) => sum + step.stepWin, 0)
      expect(result.lineWin).toBe(baseWin)
      if (rail === undefined) {
        expect(result.totalWin).toBe(baseWin + result.scatterWin)
        continue
      }
      withEmbers += 1
      expect(rail.embers.length).toBeGreaterThan(0)
      expect(rail.heatBefore).toBe(0)
      expect(rail.multiplier).toBe(rail.heatAfter)
      expect(rail.boostedWin).toBe(Math.min(baseWin * rail.multiplier, CAP))
      expect(result.totalWin).toBe(rail.boostedWin + result.scatterWin)
      for (const ember of rail.embers) {
        const step = result.cascades?.[ember.step]
        expect(ember.position[1]).toBeLessThan(step?.refill[ember.position[0]]?.length ?? 0)
        expect(config.values[ember.value]).toBeGreaterThan(0)
      }
    }
    expect(withEmbers).toBeGreaterThan(0)
  })

  it('기존 결정론: 같은 시드는 같은 결과', () => {
    const a = spin(math, { totalBet: BET }, createSeededRng('same'))
    const b = spin(math, { totalBet: BET }, createSeededRng('same'))
    expect(a).toEqual(b)
  })
})

describe('resolveForgeSpin (진입·이월·추가·상한)', () => {
  it('유료 스핀 모루 4/5/6 → 프리스핀 10회, 시작 합계 0/5/10, carry.paid = 이 스핀 지급', () => {
    for (const [anvils, heat] of [
      [4, 0],
      [5, 5],
      [6, 10],
    ] as const) {
      const grid = withAnvils(anvils)
      const result = resolveForgeSpin(math, grid, STOPS, BET, undefined, grid, [], neverRng)
      expect(result.cascades).toEqual([])
      expect(result.features.find((f) => f.type === 'freeSpins')).toEqual({ type: 'freeSpins', spins: 10, multiplier: 1, retrigger: false })
      expect(forgeOf(result)).toBeUndefined()
      expect(result.nextState).toEqual({
        freeSpinsLeft: 10,
        freeSpinsTotal: 10,
        multiplier: 1,
        carry: { forge: { heat, filled: 0, paid: result.totalWin, fulls: 0, bestSpin: 0 } },
      })
      expect(result.totalWin).toBe(Math.round((math.scatter?.pays?.[anvils] ?? 0) * BET))
    }
  })

  it('모루 3개 유료 스핀은 진입하지 않는다', () => {
    const grid = withAnvils(3)
    expect(resolveForgeSpin(math, grid, STOPS, BET, undefined, grid, [], neverRng).nextState).toBeUndefined()
  })

  it('불씨 없는 기본 당첨은 ×1, 불씨가 있으면 그 합계를 곱한다', () => {
    const grid = withSymbol('coal', 8)
    const plain = resolveForgeSpin(math, grid, STOPS, BET, undefined, grid, [], neverRng)
    expect(plain.totalWin).toBe(plain.lineWin + plain.scatterWin)
    expect(forgeOf(plain)).toBeUndefined()
    const hot = resolveForgeSpin(math, grid, STOPS, BET, undefined, grid, [], zeroRng)
    const rail = forgeOf(hot)!
    expect(rail.embers.length).toBeGreaterThan(0)
    expect(hot.lineWin).toBe(plain.lineWin)
    expect(rail.multiplier).toBe(rail.heatAfter)
    expect(hot.totalWin).toBe(Math.min(CAP, hot.lineWin * rail.heatAfter) + hot.scatterWin)
    // 기본 게임 줄은 다음 스핀으로 넘어가지 않는다.
    expect(hot.nextState).toBeUndefined()
  })

  it('프리스핀: 줄이 carry에서 이어지고 꽝이어도 남는다, 남은 횟수 −1, bestSpin·paid 누적', () => {
    const grid = quietGrid()
    const state = freeState({ freeSpinsLeft: 4 }, { heat: 7, filled: 3, paid: 1200, fulls: 1, bestSpin: 900 })
    const result = resolveForgeSpin(math, grid, STOPS, BET, state, grid, [], zeroRng)
    const rail = forgeOf(result)!
    expect(rail).toMatchObject({ embers: [], heatBefore: 7, filledBefore: 3, heatAfter: 7, filledAfter: 3, multiplier: 7, baseWin: 0, boostedWin: 0 })
    expect(result.totalWin).toBe(0)
    expect(result.nextState).toEqual({
      freeSpinsLeft: 3,
      freeSpinsTotal: 10,
      multiplier: 1,
      carry: { forge: { heat: 7, filled: 3, paid: 1200, fulls: 1, bestSpin: 900 } },
    })
  })

  it('프리스핀 당첨: 이번 스핀 불씨까지 더한 합계를 곱하고 가득 횟수를 carry에 더한다', () => {
    const grid = withSymbol('coal', 8)
    const state = freeState({}, { heat: 6, filled: 3, paid: 0, fulls: 2, bestSpin: 0 })
    const result = resolveForgeSpin(math, grid, STOPS, BET, state, grid, [], zeroRng)
    const rail = forgeOf(result)!
    expect(rail.embers.length).toBeGreaterThan(0)
    // 첫 불씨(×10)로 6+10=16, 칸 4개 → ×2 = 32 …
    expect(rail.fulls[0]).toEqual({ afterEmber: 0, heatBefore: 16, heatAfter: 32 })
    expect(rail.multiplier).toBe(Math.max(1, rail.heatAfter))
    expect(result.totalWin).toBe(Math.min(CAP, result.lineWin * rail.multiplier) + result.scatterWin)
    expect(result.nextState?.carry?.forge).toEqual({
      heat: rail.heatAfter,
      filled: rail.filledAfter,
      paid: result.totalWin,
      fulls: 2 + rail.fulls.length,
      bestSpin: result.totalWin,
    })
  })

  it('프리스핀 안 모루 3개 → +5, 4개 이상이면 모루 지급도(배율 없음), 시작 합계 재지급 없음', () => {
    const three = withAnvils(3)
    const r3 = resolveForgeSpin(math, three, STOPS, BET, freeState({ freeSpinsLeft: 2 }, { heat: 4 }), three, [], neverRng)
    expect(r3.features).toContainEqual({ type: 'freeSpins', spins: 5, multiplier: 1, retrigger: true })
    expect(r3.nextState?.freeSpinsLeft).toBe(1 + 5)
    expect(r3.nextState?.freeSpinsTotal).toBe(15)
    expect(r3.totalWin).toBe(0)

    const six = withAnvils(6)
    const r6 = resolveForgeSpin(math, six, STOPS, BET, freeState({ freeSpinsLeft: 2 }, { heat: 4 }), six, [], neverRng)
    expect(r6.scatterWin).toBe(Math.round((math.scatter?.pays?.[6] ?? 0) * BET))
    expect(r6.totalWin).toBe(r6.scatterWin)
    expect(r6.nextState?.carry?.forge?.heat).toBe(4)
  })

  it('라운드 총 30회 상한: 넘는 추가 스핀은 잘리고 freeSpinsCapped를 남긴다', () => {
    const grid = withAnvils(3)
    const result = resolveForgeSpin(math, grid, STOPS, BET, freeState({ freeSpinsLeft: 3, freeSpinsTotal: 28 }), grid, [], neverRng)
    expect(result.features).toContainEqual({ type: 'freeSpins', spins: 2, multiplier: 1, retrigger: true })
    expect(result.features).toContainEqual({ type: 'freeSpinsCapped', requested: 5, granted: 2, cap: 30 })
    expect(result.nextState?.freeSpinsTotal).toBe(30)
    const full = resolveForgeSpin(math, grid, STOPS, BET, freeState({ freeSpinsLeft: 3, freeSpinsTotal: 30 }), grid, [], neverRng)
    expect(full.features.some((f) => f.type === 'freeSpins')).toBe(false)
    expect(full.features).toContainEqual({ type: 'freeSpinsCapped', requested: 5, granted: 0, cap: 30 })
    expect(full.nextState?.freeSpinsLeft).toBe(2)
  })

  it('마지막 프리스핀 뒤에는 nextState가 없다(carry 소멸)', () => {
    const grid = quietGrid()
    const result = resolveForgeSpin(math, grid, STOPS, BET, freeState({ freeSpinsLeft: 1 }, { heat: 40 }), grid, [], neverRng)
    expect(result.nextState).toBeUndefined()
    expect(forgeOf(result)?.heatAfter).toBe(40)
  })

  it('라운드 누적 상한: 남은 몫만 주고 winCapped, 남은 스핀이 있어도 즉시 끝낸다', () => {
    const grid = withSymbol('sword', 8)
    const state = freeState({ freeSpinsLeft: 6 }, { heat: 50, paid: CAP - 100 })
    const result = resolveForgeSpin(math, grid, STOPS, BET, state, grid, [], neverRng)
    expect(result.totalWin).toBe(100)
    const capped = result.features.find((f) => f.type === 'winCapped')
    expect(capped).toMatchObject({ type: 'winCapped', granted: 100, cap: CAP })
    expect(result.nextState).toBeUndefined()
    expect(forgeOf(result)?.boostedWin).toBe(100)
  })

  it('스핀 상한: 한 스핀 지급은 5,000배를 넘지 않는다', () => {
    const grid = withSymbol('sword', 15)
    const result = resolveForgeSpin(math, grid, STOPS, BET, freeState({}, { heat: 300 }), grid, [], neverRng)
    expect(result.totalWin).toBe(CAP)
    expect(result.features.some((f) => f.type === 'winCapped')).toBe(true)
    expect(result.nextState).toBeUndefined()
  })
})
