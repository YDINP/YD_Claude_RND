import type { GridPosition } from '@tgslot/slot-engine'
import type { StageRouletteTrigger } from './features.js'
import type { SpinSpeed } from './timing.js'

/**
 * 무대 룰렛 진입 때 릴 위에서 보이는 강조 단계(순수 계획).
 *
 * - `pass`: 초대권 칸이 금빛으로 빛난다(진입음 + `featureTriggered`).
 * - `cheer`: 응원봉 칸이 분홍으로 빛난다. 허브가 이 시점(`rouletteCheer`)에 칸마다 불빛 토큰을 날려
 *   프레임 위 칩 «응원봉 ×N»으로 모은다. 응원봉이 없으면 이 단계는 없다.
 *
 * 룰렛 화면 자체(판·돌리기)는 허브 DOM 오버레이다. 렌더러는 여기까지만 맡는다.
 */
export type RouletteHighlightStage = 'pass' | 'cheer'

export interface RouletteHighlightStep {
  stage: RouletteHighlightStage
  /** 이 단계에서 밝게 남길 칸. */
  positions: GridPosition[]
  durationMs: number
}

/** 단계별 길이(ms). 기획 §7-2: E2 초대권 900/700/450, E3 응원봉 700/500/300. 모션 축소는 초대권 300 + 칩만. */
const PASS_MS: Record<SpinSpeed, number> = { normal: 900, quick: 700, turbo: 450 }
const CHEER_MS: Record<SpinSpeed, number> = { normal: 700, quick: 500, turbo: 300 }
const REDUCED_PASS_MS = 300
const REDUCED_CHEER_MS = 0

export interface RouletteHighlightOptions {
  speed?: SpinSpeed
  reducedMotion?: boolean
}

function copyPositions(positions: readonly (readonly [number, number])[]): GridPosition[] {
  return positions.map(([reel, row]) => [reel, row] as GridPosition)
}

/** 진입 피처 → 강조 단계 목록. 같은 입력이면 같은 계획이다. */
export function planRouletteHighlight(
  feature: Pick<StageRouletteTrigger, 'positions' | 'cheerPositions'>,
  options: RouletteHighlightOptions = {},
): RouletteHighlightStep[] {
  const reduced = options.reducedMotion === true
  const speed = options.speed ?? 'normal'
  const steps: RouletteHighlightStep[] = [
    {
      stage: 'pass',
      positions: copyPositions(feature.positions),
      durationMs: reduced ? REDUCED_PASS_MS : PASS_MS[speed],
    },
  ]
  if (feature.cheerPositions.length > 0) {
    steps.push({
      stage: 'cheer',
      positions: copyPositions(feature.cheerPositions),
      durationMs: reduced ? REDUCED_CHEER_MS : CHEER_MS[speed],
    })
  }
  return steps
}

/** 강조 단계 전체 길이(ms). */
export function rouletteHighlightMs(steps: readonly RouletteHighlightStep[]): number {
  return steps.reduce((sum, step) => sum + step.durationMs, 0)
}
