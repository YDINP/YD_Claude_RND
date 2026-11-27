import { describe, expect, it } from 'vitest'
import {
  createSeededRng,
  foldFrost,
  frostSpinMath,
  spin,
  type FrostChainTrigger,
  type GameMath,
  type RoundState,
} from '@tgslot/slot-engine'
import {
  FROST_TIMING,
  buildFrostPlan,
  compressFrost,
  compressFrostStepMs,
  frostStepDurationMs,
  frostStepDurations,
  reachedThreshold,
  type FrostChainInput,
} from './frost.js'
import { VOID_SYMBOL } from './shapeLayout.js'
import { loadGameMath } from './testSupport.js'

const MATH: GameMath = loadGameMath('aurora-ice-palace')
const THRESHOLDS = MATH.frostRespin?.thresholds ?? []

interface Sample {
  chain: FrostChainTrigger
  grid: string[][]
}

/** 엔진이 만든 진짜 얼림 판을 모은다. */
function collectChains(want: number): Sample[] {
  const found: Sample[] = []
  for (let seed = 1; seed < 4000 && found.length < want; seed += 1) {
    const rng = createSeededRng(`frost-plan-${seed}`)
    const state: RoundState = {
      freeSpinsLeft: 5,
      freeSpinsTotal: 8,
      multiplier: 1,
      carry: { frost: { level: 0, paid: 0, bestCount: 0, bonusTotal: 0 } },
    }
    const result = spin(MATH, { totalBet: 100 }, rng, state)
    const chain = result.features.find((f): f is FrostChainTrigger => f.type === 'frostChain')
    if (chain !== undefined) found.push({ chain, grid: result.gridBefore ?? result.grid })
  }
  return found
}

describe('frost 시간표', () => {
  it('17단계 합이 normal 약 6.4초(게이트 6.5초 이하)', () => {
    const total = frostStepDurations(FROST_TIMING.normal.stepMs, 17).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(6300)
    expect(total).toBeLessThanOrEqual(6500)
  })

  it('1~4단계는 기본 길이, 5단계부터 0.85배씩, 하한 0.35배', () => {
    expect(frostStepDurationMs(640, 0)).toBe(640)
    expect(frostStepDurationMs(640, 3)).toBe(640)
    expect(frostStepDurationMs(640, 4)).toBe(544)
    expect(frostStepDurationMs(640, 5)).toBe(462)
    expect(frostStepDurationMs(640, 16)).toBe(224)
    expect(frostStepDurationMs(640, 10)).toBeGreaterThanOrEqual(224)
  })

  it('STOP 압축은 90~220ms', () => {
    expect(compressFrostStepMs(1)).toBe(220)
    expect(compressFrostStepMs(20)).toBe(90)
    expect(compressFrostStepMs(8)).toBe(150)
  })

  it('속도 칸마다 길이가 줄어든다', () => {
    expect(FROST_TIMING.quick.stepMs).toBeLessThan(FROST_TIMING.normal.stepMs)
    expect(FROST_TIMING.turbo.stepMs).toBeLessThan(FROST_TIMING.quick.stepMs)
    expect(FROST_TIMING.reduced.stepMs).toBeLessThan(FROST_TIMING.turbo.stepMs)
    expect(FROST_TIMING.reduced.auroraMs).toBe(0)
    expect(FROST_TIMING.reduced.meltMs).toBe(0)
  })

  it('눈금 헬퍼', () => {
    expect(reachedThreshold([6, 9, 12], 5)).toBe(0)
    expect(reachedThreshold([6, 9, 12], 9)).toBe(9)
    expect(reachedThreshold([6, 9, 12], 13)).toBe(12)
  })
})

describe('buildFrostPlan — 엔진 실제 결과', () => {
  const samples = collectChains(60)

  it('시료를 모았다', () => {
    expect(samples.length).toBeGreaterThan(20)
  })

  it('계획이 접은 판이 서버 finalGrid·엔진 foldFrost와 같다', () => {
    for (const { chain, grid } of samples) {
      const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
      expect(plan.consistent).toBe(true)
      expect(plan.steps.at(-1)?.gridAfter ?? grid).toEqual(chain.finalGrid)
      expect(foldFrost(grid, chain)).toEqual(chain.finalGrid)
      expect(plan.cellCount).toBe(19)
    }
  })

  it('얼린 칸 수는 단계마다 늘고 마지막 count와 맞는다', () => {
    for (const { chain, grid } of samples) {
      const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
      let prev = chain.startFrozen.length
      for (const step of plan.steps) {
        expect(step.frozenBefore).toBe(prev)
        expect(step.frozenAfter - step.frozenBefore).toBe(step.newlyFrozen.length)
        prev = step.frozenAfter
      }
      expect(prev).toBe(chain.count)
      const last = plan.steps.at(-1)
      if (last !== undefined && chain.count < 19) expect(last.newlyFrozen).toHaveLength(0)
    }
  })

  it('다시 도는 칸 수 = 얼지 않은 칸 수, 얼린 칸은 다시 돌지 않는다', () => {
    for (const { chain, grid } of samples) {
      const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
      const frozen = new Set(chain.startFrozen.map(([r, w]) => `${r}:${w}`))
      for (const step of plan.steps) {
        expect(step.spinning).toHaveLength(19 - frozen.size)
        for (const [reel, row] of step.spinning) expect(frozen.has(`${reel}:${row}`)).toBe(false)
        for (const [reel, row] of step.newlyFrozen) frozen.add(`${reel}:${row}`)
      }
    }
  })

  it('얼린 칸의 그림은 단계마다 같고 판 밖 칸은 건드리지 않는다', () => {
    for (const { chain, grid } of samples.slice(0, 15)) {
      const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
      for (const step of plan.steps) {
        for (const [reel, row] of chain.startFrozen) expect(step.gridAfter[row]?.[reel]).toBe(grid[row]?.[reel])
        for (let row = 0; row < 5; row += 1) {
          for (let reel = 0; reel < 5; reel += 1) {
            if (grid[row]?.[reel] === VOID_SYMBOL) expect(step.gridAfter[row]?.[reel]).toBe(VOID_SYMBOL)
          }
        }
      }
    }
  })

  it('끝: 곱셈식 재료와 조용한 끝 판정', () => {
    for (const { chain, grid } of samples) {
      const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
      expect(plan.end.count).toBe(chain.count)
      expect(plan.end.auroraUp).toBe(chain.auroraAfter > chain.auroraBefore)
      expect(plan.end.quiet).toBe(chain.bonus <= 0 || chain.bonusMultiple * chain.auroraMultiplier < 1)
      expect(plan.end.durationMs).toBe(plan.end.quiet ? FROST_TIMING.normal.endQuietMs : FROST_TIMING.normal.endMs)
      expect(plan.end.palace).toBe(chain.count >= 19)
    }
  })

  it('눈금 통과는 이전 칸 수 초과 ~ 이후 칸 수 이하다', () => {
    for (const { chain, grid } of samples) {
      const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
      for (const step of plan.steps) {
        for (const t of step.crossed) {
          expect(step.frozenBefore).toBeLessThan(t)
          expect(step.frozenAfter).toBeGreaterThanOrEqual(t)
        }
        if (step.nextThreshold !== null) expect(step.nextThreshold).toBeGreaterThan(step.frozenAfter)
      }
    }
  })

  it('압축은 순서·결과를 바꾸지 않고 시간만 줄인다', () => {
    const { chain, grid } = samples.find((s) => s.chain.steps.length >= 4) ?? (samples[0] as Sample)
    const plan = buildFrostPlan({ chain, grid, thresholds: THRESHOLDS }, 'normal')
    const squeezed = compressFrost(plan, 1)
    expect(squeezed.steps.map((s) => s.symbols)).toEqual(plan.steps.map((s) => s.symbols))
    expect(squeezed.steps[0]?.durationMs).toBe(plan.steps[0]?.durationMs)
    for (const step of squeezed.steps.slice(1)) expect(step.durationMs).toBeLessThanOrEqual(220)
    expect(squeezed.totalMs).toBeLessThan(plan.totalMs)
    expect(squeezed.finalGrid).toEqual(plan.finalGrid)
  })

  it('서버 판과 어긋나면 consistent=false', () => {
    const { chain, grid } = samples[0] as Sample
    const broken: FrostChainInput = { ...chain, finalGrid: chain.finalGrid.map((line) => line.map(() => 'x')) }
    expect(buildFrostPlan({ chain: broken, grid, thresholds: THRESHOLDS }, 'normal').consistent).toBe(false)
  })

  it('프리스핀 math 사본은 스트립만 바꾼다', () => {
    const free = frostSpinMath(MATH, true)
    expect(free.strips).toBe(MATH.frostRespin?.freeStrips)
    expect(frostSpinMath(MATH, false)).toBe(MATH)
  })
})
