/**
 * 화로 배율 줄(volcano-forge) 화면 계획 — 순수 함수 모음.
 * 서버 응답의 `forgeRail`(불씨·화로 가득·합계)을 «연쇄 단계마다 무엇이 언제 일어나는지»로 풀어 둔다.
 * 표시용 계산은 엔진 `heatRail`을 그대로 쓰고, 마지막에 서버 `heatAfter`·`filledAfter`로 덮는다(서버가 정본).
 */
import {
  heatRail,
  type FeatureTrigger,
  type ForgeCarry,
  type ForgeRailConfig,
  type ForgeRailTrigger,
  type GridPosition,
  type RailState,
  type SymbolId,
} from '@tgslot/slot-engine'

export type { ForgeRailTrigger }

/** 화로 줄이 화면에 보이는 값. */
export interface RailView {
  heat: number
  filled: number
}

export const EMPTY_RAIL: RailView = { heat: 0, filled: 0 }

/** 불씨 하나가 줄에 들어간 뒤의 모습. */
export interface EmberPlan {
  /** 응답 `embers` 안의 순서(0부터). */
  index: number
  /** 불씨가 솟은 연쇄 단계. */
  step: number
  position: GridPosition
  value: number
  /** 이 불씨가 들어가 칸이 켜진 직후(가득이면 가득 직전: 합계는 더해졌고 칸은 `slots`개). */
  lit: RailView
  /** 이 불씨로 화로가 가득 찼다면 두 배가 되는 사건. 칸은 비고 합계가 `heatAfter`가 된다. */
  full: { heatBefore: number; heatAfter: number } | null
  /** 사건까지 끝난 직후의 줄. 가득이 아니면 `lit`와 같다. */
  after: RailView
}

/** 줄 설정(math.forgeRail)에서 화면이 쓰는 몫. */
export type RailRules = Pick<ForgeRailConfig, 'slots' | 'fullMultiplier' | 'heatCap'>

export function findForgeRail(features: readonly FeatureTrigger[] | undefined): ForgeRailTrigger | null {
  for (const feature of features ?? []) if (feature.type === 'forgeRail') return feature
  return null
}

/** 프리스핀 라운드의 줄 상태(`freeSpins.carry.forge`)를 화면 값으로. 없으면 빈 줄. */
export function railFromCarry(carry: Pick<ForgeCarry, 'heat' | 'filled'> | null | undefined): RailView {
  return carry === undefined || carry === null ? EMPTY_RAIL : { heat: carry.heat, filled: carry.filled }
}

/**
 * 불씨를 생긴 순서대로 줄에 넣은 계획. 마지막 불씨의 `after`는 서버 값(`heatAfter`·`filledAfter`)으로 맞춘다.
 * 서버와 표시 계산이 어긋나도(규칙이 바뀐 옛 응답 등) 화면은 서버 값에서 끝난다.
 */
export function planEmbers(feature: ForgeRailTrigger, rules: RailRules): EmberPlan[] {
  let state: RailState = { heat: feature.heatBefore, filled: feature.filledBefore }
  const plans = feature.embers.map((ember, index): EmberPlan => {
    const result = heatRail(state, [ember], rules)
    const full = result.fulls[0] ?? null
    const lit: RailView = full === null ? { heat: result.heat, filled: result.filled } : { heat: full.heatBefore, filled: rules.slots }
    state = { heat: result.heat, filled: result.filled }
    return {
      index,
      step: ember.step,
      position: ember.position,
      value: ember.value,
      lit,
      full: full === null ? null : { heatBefore: full.heatBefore, heatAfter: full.heatAfter },
      after: { heat: result.heat, filled: result.filled },
    }
  })
  const last = plans[plans.length - 1]
  if (last !== undefined) last.after = { heat: feature.heatAfter, filled: feature.filledAfter }
  return plans
}

/** 연쇄 단계 `step`에서 솟은 불씨들. */
export function embersAtStep(plans: readonly EmberPlan[], step: number): EmberPlan[] {
  return plans.filter((plan) => plan.step === step)
}

/** 속도 모드별 연출 길이(ms). 기획서 §7-3 표. */
export interface ForgeTiming {
  flightMs: number
  fullMs: number
  settleMs: number
  igniteMs: number
}

export type ForgeSpeed = 'normal' | 'quick' | 'turbo'

export function forgeTiming(speed: ForgeSpeed, reducedMotion: boolean, compressed: boolean): ForgeTiming {
  if (reducedMotion) return { flightMs: 0, fullMs: 250, settleMs: 250, igniteMs: 0 }
  if (compressed) return { flightMs: 0, fullMs: 250, settleMs: 250, igniteMs: 0 }
  if (speed === 'turbo') return { flightMs: 180, fullMs: 400, settleMs: 300, igniteMs: 80 }
  if (speed === 'quick') return { flightMs: 260, fullMs: 600, settleMs: 400, igniteMs: 100 }
  return { flightMs: 380, fullMs: 900, settleMs: 600, igniteMs: 120 }
}

/**
 * 연쇄 단계 `step`이 끝난 뒤 연쇄를 세워 둘 시간. 화로 가득이 난 단계는 비행 + 가득 연출,
 * 마지막 단계는 마지막 불씨가 줄에 닿을 때까지(+비행), 그 밖에는 0(비행이 다음 단계와 겹친다).
 */
export function cascadeHoldFor(plans: readonly EmberPlan[], step: number, lastStep: number, timing: ForgeTiming): number {
  const here = embersAtStep(plans, step)
  if (here.length === 0) return 0
  const hasFull = here.some((plan) => plan.full !== null)
  if (hasFull) return timing.flightMs + here.filter((plan) => plan.full !== null).length * timing.fullMs
  return step >= lastStep ? timing.flightMs : 0
}

/** 정산(망치가 합계 상자를 내려침) 계획. 보이지 않으면 null. */
export interface SettlePlan {
  base: number
  multiplier: number
  boosted: number
  /** 곱한 금액이 베팅 미만이면 숫자만 보인다(망치 연출 없음). */
  numbersOnly: boolean
}

/**
 * 기본 게임은 `forgeRail`이 있을 때, 프리스핀은 배율이 1보다 크고 연쇄 당첨이 있을 때 정산한다.
 * 연쇄 당첨이 없으면(baseWin 0) 곱할 것이 없으니 정산도 없다.
 */
export function planSettle(feature: ForgeRailTrigger | null, totalBet: number, isFreeSpin: boolean): SettlePlan | null {
  if (feature === null || feature.baseWin <= 0) return null
  if (isFreeSpin ? feature.multiplier <= 1 : feature.embers.length === 0) return null
  return {
    base: feature.baseWin,
    multiplier: feature.multiplier,
    boosted: feature.boostedWin,
    numbersOnly: feature.boostedWin < totalBet,
  }
}

/** `grid[row][reel]`에서 특정 심볼 개수. */
export function countSymbol(grid: readonly (readonly SymbolId[])[] | undefined, symbol: SymbolId | undefined): number {
  if (grid === undefined || symbol === undefined) return 0
  let count = 0
  for (const line of grid) for (const cell of line) if (cell === symbol) count += 1
  return count
}

/** 단계에서 지워진 칸 중 가장 많은 그림과 그 개수(WinStrip 한 줄용). 모루는 지워지지 않는다. */
export function dominantRemoved(symbols: readonly SymbolId[]): { symbol: SymbolId; count: number } | null {
  const counts = new Map<SymbolId, number>()
  for (const symbol of symbols) counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  let best: { symbol: SymbolId; count: number } | null = null
  for (const [symbol, count] of counts) if (best === null || count > best.count) best = { symbol, count }
  return best
}

/** 합계 상자 글자 단계(자릿수가 늘면 줄인다). */
export function heatFontStep(heat: number): 'lg' | 'md' | 'sm' {
  if (heat >= 100) return 'sm'
  if (heat >= 10) return 'md'
  return 'lg'
}
