import type { GridPosition, SymbolId } from '@tgslot/slot-engine'
import { VOID_SYMBOL } from './shapeLayout.js'

/**
 * 얼려 두기 프리스핀(얼림) 재생 계획. 순수 함수만 둔다 — 서버가 정한 `frostChain` 기록을 그리기 좋은 단계로 풀 뿐이다.
 *
 * 한 판의 흐름: 대상 그림이 «빛남 → 정적 → 얼음»(intro) → 다시 돌리기 단계들(steps) → 끝(end: 곱셈식·오로라·녹음).
 * 얼린 칸은 단계 사이에 변하지 않고, 얼지 않은 칸만 칸 단위로 다시 돈다.
 */

/** 서버가 준 얼림 기록(`frostChain` 피처에서 `type`만 뺀 모양). */
export interface FrostChainInput {
  target: SymbolId
  tier: 'high' | 'mid' | 'low'
  startFrozen: readonly GridPosition[]
  steps: readonly { cells: readonly SymbolId[]; frozen: readonly GridPosition[] }[]
  finalGrid: readonly (readonly SymbolId[])[]
  count: number
  bonusMultiple: number
  auroraBefore: number
  auroraAfter: number
  auroraMultiplier: number
  bonus: number
}

/** `playFrost`가 받는 입력. 착지 판과 눈금(`math.frostRespin.thresholds`)을 함께 준다. */
export interface FrostPlayInput {
  chain: FrostChainInput
  /** 착지한 판 `grid[row][reel]`(판 밖 칸은 `__void__`). */
  grid: readonly (readonly SymbolId[])[]
  /** 얼린 칸 수 눈금(오름차순). */
  thresholds: readonly number[]
  /** 이 라운드에서 오로라가 오르는 얼린 칸 수(`aurora.threshold`). 기본은 눈금의 마지막에서 두 번째가 아니라 15. */
  auroraThreshold?: number
}

/** 속도 칸. 모션 축소가 켜져 있으면 `reduced`가 이긴다. */
export type FrostSpeed = 'normal' | 'quick' | 'turbo' | 'reduced'

export interface FrostTiming {
  /** 대상이 «빛남 → 정적 → 얼음»으로 갇히는 시간. */
  introGlowMs: number
  introHoldMs: number
  introFreezeMs: number
  /** 다시 돌리기 1~4단계 기본 길이. */
  stepMs: number
  /** 곱셈식을 보여 주는 끝. */
  endMs: number
  /** 보너스 0 또는 베팅 1배 미만(조용한 끝). */
  endQuietMs: number
  auroraMs: number
  palaceMs: number
  meltMs: number
}

export const FROST_TIMING: Record<FrostSpeed, FrostTiming> = {
  normal: { introGlowMs: 120, introHoldMs: 160, introFreezeMs: 240, stepMs: 640, endMs: 900, endQuietMs: 300, auroraMs: 700, palaceMs: 900, meltMs: 350 },
  quick: { introGlowMs: 90, introHoldMs: 120, introFreezeMs: 190, stepMs: 460, endMs: 650, endQuietMs: 250, auroraMs: 500, palaceMs: 600, meltMs: 260 },
  turbo: { introGlowMs: 60, introHoldMs: 80, introFreezeMs: 120, stepMs: 320, endMs: 400, endQuietMs: 200, auroraMs: 300, palaceMs: 400, meltMs: 180 },
  reduced: { introGlowMs: 40, introHoldMs: 50, introFreezeMs: 60, stepMs: 200, endMs: 300, endQuietMs: 150, auroraMs: 0, palaceMs: 0, meltMs: 0 },
}

/** 5단계째부터 단계 시간에 곱하는 비율과 하한(기본의 0.35배). */
export const FROST_STEP_DECAY = 0.85
export const FROST_STEP_FLOOR = 0.35
/** 단계 시간이 줄기 시작하는 단계(1부터, 이 단계 이전까지는 기본 길이). */
export const FROST_STEP_FULL_UNTIL = 4

/** 단계 `index`(0부터)의 길이. */
export function frostStepDurationMs(base: number, index: number): number {
  const over = index + 1 - FROST_STEP_FULL_UNTIL
  if (over <= 0) return base
  return Math.max(Math.round(base * FROST_STEP_FLOOR), Math.round(base * FROST_STEP_DECAY ** over))
}

/** 단계 길이 목록. */
export function frostStepDurations(base: number, total: number): number[] {
  return Array.from({ length: total }, (_, index) => frostStepDurationMs(base, index))
}

/** 얼림 도중 STOP: 남은 단계를 한 단계씩 압축 재생하는 길이(ms). */
export function compressFrostStepMs(remaining: number): number {
  return Math.max(90, Math.min(220, Math.round(1200 / Math.max(1, remaining))))
}

export interface FrostPlanStep {
  index: number
  total: number
  /** 이 단계에서 다시 도는 칸(= 단계 시작 때 얼지 않은 칸). 릴 0→끝, 행 0→h−1. */
  spinning: GridPosition[]
  /** `spinning`과 같은 순서의 새 심볼. */
  symbols: SymbolId[]
  /** 이 단계에 새로 언 칸. */
  newlyFrozen: GridPosition[]
  frozenBefore: number
  frozenAfter: number
  /** 이 단계에서 넘은 눈금. */
  crossed: number[]
  /** 이 단계 뒤 아직 못 넘은 가장 가까운 눈금. 없으면 null. */
  nextThreshold: number | null
  durationMs: number
  /** 이 단계가 끝난 판(얼린 칸은 그대로, 나머지는 새 심볼). */
  gridAfter: SymbolId[][]
}

export interface FrostPlanEnd {
  count: number
  bonusMultiple: number
  auroraMultiplier: number
  auroraBefore: number
  auroraAfter: number
  auroraUp: boolean
  bonus: number
  /** 판 전체를 얼렸나(궁전 완성). */
  palace: boolean
  /** 보너스 0 또는 베팅 1배 미만 — 곱셈식 없이 짧게 끝낸다. */
  quiet: boolean
  durationMs: number
  auroraMs: number
  palaceMs: number
  meltMs: number
}

export interface FrostPlan {
  target: SymbolId
  tier: 'high' | 'mid' | 'low'
  /** 착지한 판. */
  grid: SymbolId[][]
  startFrozen: GridPosition[]
  introMs: number
  introGlowMs: number
  introHoldMs: number
  introFreezeMs: number
  steps: FrostPlanStep[]
  /** 얼림이 끝난 판. 서버 `finalGrid`와 같다(어긋나면 서버 값을 쓴다). */
  finalGrid: SymbolId[][]
  /** 판 안 칸 수. */
  cellCount: number
  end: FrostPlanEnd
  /** 계획이 접은 판이 서버 `finalGrid`와 같은가. 다르면 화면은 서버 판으로 확정한다. */
  consistent: boolean
  totalMs: number
}

function key(position: GridPosition): string {
  return `${position[0]}:${position[1]}`
}

function cloneGrid(grid: readonly (readonly SymbolId[])[]): SymbolId[][] {
  return grid.map((line) => [...line])
}

function countCells(grid: readonly (readonly SymbolId[])[]): number {
  let count = 0
  for (const line of grid) for (const symbol of line) if (symbol !== VOID_SYMBOL) count += 1
  return count
}

function sameGrid(a: readonly (readonly SymbolId[])[], b: readonly (readonly SymbolId[])[]): boolean {
  if (a.length !== b.length) return false
  return a.every((line, row) => line.length === (b[row]?.length ?? -1) && line.every((symbol, reel) => symbol === b[row]?.[reel]))
}

/** 얼림 기록을 단계로 푼다. 순수 함수 — 엔진 `foldFrost`와 같은 규칙으로 칸 순서(릴 → 행)를 따른다. */
export function buildFrostPlan(input: FrostPlayInput, speed: FrostSpeed): FrostPlan {
  const { chain, grid, thresholds } = input
  const timing = FROST_TIMING[speed]
  const reels = grid[0]?.length ?? 0
  const rows = grid.length
  const frozen = new Set<string>(chain.startFrozen.map(key))
  const current = cloneGrid(grid)
  const total = chain.steps.length
  const durations = frostStepDurations(timing.stepMs, total)

  const steps: FrostPlanStep[] = []
  let count = chain.startFrozen.length
  chain.steps.forEach((step, index) => {
    const spinning: GridPosition[] = []
    const symbols: SymbolId[] = []
    let cursor = 0
    for (let reel = 0; reel < reels; reel += 1) {
      for (let row = 0; row < rows; row += 1) {
        const line = current[row]
        if (line === undefined || line[reel] === VOID_SYMBOL || frozen.has(`${reel}:${row}`)) continue
        const symbol = step.cells[cursor]
        cursor += 1
        if (symbol === undefined) continue
        spinning.push([reel, row])
        symbols.push(symbol)
        line[reel] = symbol
      }
    }
    const frozenBefore = count
    for (const position of step.frozen) frozen.add(key(position))
    count += step.frozen.length
    steps.push({
      index,
      total,
      spinning,
      symbols,
      newlyFrozen: step.frozen.map((p): GridPosition => [p[0], p[1]]),
      frozenBefore,
      frozenAfter: count,
      crossed: thresholds.filter((t) => frozenBefore < t && t <= count),
      nextThreshold: thresholds.find((t) => t > count) ?? null,
      durationMs: durations[index] ?? timing.stepMs,
      gridAfter: cloneGrid(current),
    })
  })

  const cellCount = countCells(grid)
  const palace = chain.count >= cellCount && cellCount > 0
  const auroraUp = chain.auroraAfter > chain.auroraBefore
  const quiet = chain.bonus <= 0 || chain.bonusMultiple * chain.auroraMultiplier < 1
  const end: FrostPlanEnd = {
    count: chain.count,
    bonusMultiple: chain.bonusMultiple,
    auroraMultiplier: chain.auroraMultiplier,
    auroraBefore: chain.auroraBefore,
    auroraAfter: chain.auroraAfter,
    auroraUp,
    bonus: chain.bonus,
    palace,
    quiet,
    durationMs: quiet ? timing.endQuietMs : timing.endMs,
    auroraMs: auroraUp ? timing.auroraMs : 0,
    palaceMs: palace ? timing.palaceMs : 0,
    meltMs: timing.meltMs,
  }

  const introMs = timing.introGlowMs + timing.introHoldMs + timing.introFreezeMs
  const stepsMs = steps.reduce((sum, step) => sum + step.durationMs, 0)
  return {
    target: chain.target,
    tier: chain.tier,
    grid: cloneGrid(grid),
    startFrozen: chain.startFrozen.map((p): GridPosition => [p[0], p[1]]),
    introMs,
    introGlowMs: timing.introGlowMs,
    introHoldMs: timing.introHoldMs,
    introFreezeMs: timing.introFreezeMs,
    steps,
    finalGrid: cloneGrid(chain.finalGrid),
    cellCount,
    end,
    consistent: sameGrid(current, chain.finalGrid),
    totalMs: introMs + stepsMs + end.durationMs + end.auroraMs + end.palaceMs + end.meltMs,
  }
}

/** 이 단계가 끝났을 때 `count`칸을 어느 눈금 구간까지 채웠는지(띠 표시용). 눈금보다 적으면 0. */
export function reachedThreshold(thresholds: readonly number[], count: number): number {
  let reached = 0
  for (const t of thresholds) if (count >= t) reached = t
  return reached
}

/**
 * 단계를 압축한 사본. 칸 회전을 하지 않고 착지만 보여 주는 길이로 줄인다(STOP). 결과·순서는 그대로다.
 * `from`번째 단계(0부터)부터 남은 단계가 대상이다.
 */
export function compressFrost(plan: FrostPlan, from: number): FrostPlan {
  const remaining = Math.max(1, plan.steps.length - from)
  const ms = compressFrostStepMs(remaining)
  const steps = plan.steps.map((step, index) => (index < from ? step : { ...step, durationMs: Math.min(step.durationMs, ms) }))
  const stepsMs = steps.reduce((sum, step) => sum + step.durationMs, 0)
  return {
    ...plan,
    steps,
    totalMs: plan.introMs + stepsMs + plan.end.durationMs + plan.end.auroraMs + plan.end.palaceMs + plan.end.meltMs,
  }
}
