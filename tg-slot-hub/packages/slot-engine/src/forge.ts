import type { GameMath } from './schema.js'
import type { ForgeRailConfig } from './forgeSchema.js'
import { evaluateScatter } from './evaluate.js'
import { runCascades } from './cascade.js'
import { pickWeighted } from './random.js'
import type {
  CascadeStep,
  EmberDrop,
  FeatureTrigger,
  ForgeCarry,
  ForgeFullEvent,
  MutationEvent,
  Rng,
  RoundState,
  SpinResult,
  SymbolId,
} from './types.js'

/** 불씨 판정의 분모. 확률은 만분율 정수다. */
export const EMBER_CHANCE_SCALE = 10_000

/** 화로 줄 상태. 합계와 켜진 칸 수. */
export interface RailState {
  heat: number
  filled: number
}

export interface RailOutcome extends RailState {
  fulls: ForgeFullEvent[]
}

/**
 * 불씨 판정. RNG 소비 계약: 단계 0부터 차례로, 단계 안에서는 릴 0→끝, 릴 안에서는 `refill` 배열 순서(위→아래).
 * 리필 칸마다 `nextInt(10000)` 1회, 맞으면 값표 `pickWeighted` 1회. 처음 착지한 판에는 불씨가 없다.
 * 리필 `refill[reel][i]`는 다음 판의 그 릴 `i`행에 떨어지므로 불씨 위치는 `[reel, i]`다.
 */
export function rollEmbers(config: ForgeRailConfig, steps: readonly CascadeStep[], rng: Rng, free: boolean): EmberDrop[] {
  const chance = free ? config.spawn.chanceFree : config.spawn.chanceBase
  const embers: EmberDrop[] = []
  for (const step of steps) {
    step.refill.forEach((column, reel) => {
      for (let row = 0; row < column.length; row += 1) {
        if (rng.nextInt(EMBER_CHANCE_SCALE) >= chance) continue
        const picked = pickWeighted(config.values, rng)
        if (picked === undefined) throw new RangeError('불씨 값표가 비었다')
        embers.push({ step: step.index, position: [reel, row], value: Number(picked) })
      }
    })
  }
  return embers
}

/**
 * 불씨를 생긴 순서대로 줄에 넣는다. 순수 함수 — 허브의 표시 계산도 이 규칙을 그대로 쓴다.
 * 불씨마다: 합계 += 값(상한) → 칸 +1 → 칸이 다 차면 합계 × fullMultiplier(상한), 칸 비움, 사건 기록.
 */
export function heatRail(
  start: RailState,
  embers: readonly { value: number }[],
  config: Pick<ForgeRailConfig, 'slots' | 'fullMultiplier' | 'heatCap'>,
): RailOutcome {
  let heat = start.heat
  let filled = start.filled
  const fulls: ForgeFullEvent[] = []
  embers.forEach((ember, index) => {
    heat = Math.min(config.heatCap, heat + ember.value)
    filled += 1
    if (filled >= config.slots) {
      const before = heat
      heat = Math.min(config.heatCap, heat * config.fullMultiplier)
      filled = 0
      fulls.push({ afterEmber: index, heatBefore: before, heatAfter: heat })
    }
  })
  return { heat, filled, fulls }
}

/** 진입 스캐터 개수에 맞는 프리스핀 시작 합계. 개수 이하에서 가장 큰 키, 없으면 0. */
export function startHeatFor(config: ForgeRailConfig, scatterCount: number): number {
  let best = -1
  let heat = 0
  for (const [raw, value] of Object.entries(config.startHeat)) {
    const key = Number(raw)
    if (key <= scatterCount && key > best) {
      best = key
      heat = value
    }
  }
  return heat
}

/**
 * 화로 배율 줄 팩의 정산. 연쇄(RNG 0회) → 불씨 판정 → 줄 계산 → 배율 → 스캐터 → 프리스핀 진입·추가·종료 → 상한.
 *
 * - 기본 게임: 줄은 0에서 시작하고 불씨가 하나라도 있으면 연쇄 지급 × 합계, 없으면 ×1. 줄은 스핀 끝에 비워진다.
 * - 프리스핀: 줄이 `state.carry.forge`에서 이어지고 연쇄 지급 × max(1, 합계). 지급이 없어도 줄은 남는다.
 * - 스캐터 지급은 배율을 받지 않는다.
 * - 상한: 스핀 지급과 라운드 누적 지급(`carry.forge.paid`, 진입 스핀 포함) 모두 `round.maxWinCap × totalBet`.
 *   라운드 상한에 닿으면 그 스핀에서 잘라 지급하고 라운드를 즉시 끝낸다(`nextState` 없음 = carry 소멸).
 */
export function resolveForgeSpin(
  math: GameMath,
  grid: SymbolId[][],
  stops: number[],
  totalBet: number,
  state: RoundState | undefined,
  gridBefore: SymbolId[][],
  mutations: MutationEvent[],
  rng: Rng | undefined,
): SpinResult {
  const config = math.forgeRail
  if (config === undefined) throw new RangeError('forgeRail 설정이 없는 게임에 resolveForgeSpin을 호출했다')
  if (rng === undefined) throw new RangeError('불씨 판정에는 rng가 필요하다')
  const free = state !== undefined
  const cap = math.round === undefined ? Infinity : Math.round(math.round.maxWinCap * totalBet)
  const carry: ForgeCarry = state?.carry?.forge ?? { heat: 0, filled: 0, paid: 0, fulls: 0, bestSpin: 0 }

  // 연쇄는 상한 없이 끝까지 푼다. 상한은 배율을 곱한 뒤 한 번에 건다(불씨 RNG 소비가 상한과 무관해진다).
  const outcome = runCascades(math, grid, stops, totalBet, Infinity)
  const wins = outcome.steps.flatMap((step) => step.wins)
  const baseWin = outcome.win
  const embers = rollEmbers(config, outcome.steps, rng, free)
  const before: RailState = free ? { heat: carry.heat, filled: carry.filled } : { heat: 0, filled: 0 }
  const rail = heatRail(before, embers, config)
  const multiplier = free ? Math.max(1, rail.heat) : embers.length > 0 ? rail.heat : 1
  const boosted = baseWin * multiplier

  const scatter = evaluateScatter(outcome.finalGrid, math, totalBet)
  const paidBefore = free ? carry.paid : 0
  const room = Math.max(0, Math.min(cap, cap - paidBefore))
  const boostedWin = Math.min(boosted, room)
  const scatterWin = Math.min(scatter.win, room - boostedWin)
  const totalWin = boostedWin + scatterWin
  const requested = boosted + scatter.win
  const trimmed = totalWin < requested
  const paidAfter = paidBefore + totalWin
  const roundCapped = Number.isFinite(cap) && paidAfter >= cap

  const features: FeatureTrigger[] = []
  if (free || embers.length > 0) {
    features.push({
      type: 'forgeRail',
      embers,
      heatBefore: before.heat,
      filledBefore: before.filled,
      heatAfter: rail.heat,
      filledAfter: rail.filled,
      fulls: rail.fulls,
      multiplier,
      baseWin,
      boostedWin,
    })
  }
  if (scatter.win > 0) {
    features.push({
      type: 'scatterWin',
      symbol: math.scatter?.symbol ?? '',
      count: scatter.count,
      win: scatterWin,
      positions: scatter.positions,
    })
  }

  let nextState: RoundState | undefined
  const entry = math.scatter?.freeSpins
  if (!free) {
    if (entry !== undefined && scatter.count >= entry.trigger && !roundCapped) {
      const granted = Math.min(entry.count, config.maxRoundSpins)
      features.push({ type: 'freeSpins', spins: granted, multiplier: 1, retrigger: false })
      if (granted < entry.count) {
        features.push({ type: 'freeSpinsCapped', requested: entry.count, granted, cap: config.maxRoundSpins })
      }
      nextState = {
        freeSpinsLeft: granted,
        freeSpinsTotal: granted,
        multiplier: 1,
        carry: {
          forge: { heat: startHeatFor(config, scatter.count), filled: 0, paid: totalWin, fulls: 0, bestSpin: 0 },
        },
      }
    }
  } else {
    let left = Math.max(0, state.freeSpinsLeft - 1)
    let total = state.freeSpinsTotal
    const retrigger = config.retrigger
    if (retrigger !== undefined && scatter.count >= retrigger.trigger && !roundCapped) {
      const granted = Math.min(retrigger.spins, Math.max(0, config.maxRoundSpins - total))
      if (granted > 0) {
        features.push({ type: 'freeSpins', spins: granted, multiplier: 1, retrigger: true })
        left += granted
        total += granted
      }
      if (granted < retrigger.spins) {
        features.push({ type: 'freeSpinsCapped', requested: retrigger.spins, granted, cap: config.maxRoundSpins })
      }
    }
    if (left > 0 && !roundCapped) {
      nextState = {
        freeSpinsLeft: left,
        freeSpinsTotal: total,
        multiplier: 1,
        carry: {
          forge: {
            heat: rail.heat,
            filled: rail.filled,
            paid: paidAfter,
            fulls: carry.fulls + rail.fulls.length,
            bestSpin: Math.max(carry.bestSpin, totalWin),
          },
        },
      }
    }
  }

  if (trimmed) features.push({ type: 'winCapped', requested, granted: totalWin, cap })

  const result: SpinResult = {
    stops,
    gridBefore,
    grid,
    mutations,
    wins,
    lineWin: baseWin,
    scatterWin,
    totalWin,
    features,
    cascades: outcome.steps,
    finalGrid: outcome.finalGrid,
  }
  if (nextState !== undefined) result.nextState = nextState
  return result
}
