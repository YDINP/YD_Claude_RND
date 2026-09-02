import type { GridPosition, SymbolId } from '@tgslot/slot-engine'
import { symbolsAtPositions } from './grid.js'
import {
  BUILTIN_PULSE_MS,
  FX_DEFAULT_BOUNCE_PX,
  FX_DEFAULT_BURST_PARTICLES,
  FX_DEFAULT_DURATION_MS,
  FX_DEFAULT_GLOW_COLOR,
  FX_DEFAULT_PULSE_SCALE,
  FX_DEFAULT_SHINE_ANGLE,
  FX_DEFAULT_SEGMENTS,
  FX_DEFAULT_WOBBLE_DEGREES,
  FX_MAX_BURST_PARTICLES,
  FX_MAX_SEGMENTS,
  FX_SEGMENT_DELAY_MS,
  FX_STAGGER_STEP_MS,
} from './constants.js'
import type { FxEffect, FxMap } from './theme.js'

/** `fx` 맵에서 심볼별 항목이 없을 때 쓰는 키. */
export const FX_DEFAULT_KEY = 'default'

export type FxType = FxEffect['type']

/**
 * 기본값이 모두 채워진 효과 1개.
 * 각 타입이 쓰는 필드만 의미가 있고 나머지는 무시된다.
 * 렌더러가 분기 없이 바로 읽을 수 있도록 평평하게 편다.
 */
export interface ResolvedFxEffect {
  type: FxType
  durationMs: number
  loop: boolean
  /** 0~1. 진폭에 곱한다. */
  intensity: number
  scale: number
  angle: number
  degrees: number
  px: number
  particles: number
  color: string
  stagger: boolean
  /** `flash`가 심볼을 나누는 가로 띠 수. 1이면 통째로 깜빡인다. */
  segments: number
  /**
   * 유한 반복 횟수. `null`이면 `loop`에 맡긴다(무한 또는 1회).
   * 다 돌면 원래 상태로 돌아가 멈춘다.
   */
  repeat: number | null
}

/** 항목이 아예 없는 심볼이 받는 최소 연출. 아무것도 안 하는 것보다는 낫다. */
export const BUILTIN_FX: FxEffect[] = [
  { type: 'pulse', scale: FX_DEFAULT_PULSE_SCALE, durationMs: BUILTIN_PULSE_MS },
]

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function positive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return value
}

/** 효과 1개에 기본값을 채운다. */
export function resolveFxEffect(effect: FxEffect): ResolvedFxEffect {
  return {
    type: effect.type,
    durationMs: positive(effect.durationMs, FX_DEFAULT_DURATION_MS),
    loop: effect.loop ?? true,
    intensity: clamp01(effect.intensity, 1),
    scale: positive(effect.scale, FX_DEFAULT_PULSE_SCALE),
    angle: effect.angle ?? FX_DEFAULT_SHINE_ANGLE,
    degrees: positive(effect.degrees, FX_DEFAULT_WOBBLE_DEGREES),
    px: positive(effect.px, FX_DEFAULT_BOUNCE_PX),
    particles: Math.min(
      FX_MAX_BURST_PARTICLES,
      Math.max(1, Math.floor(positive(effect.particles, FX_DEFAULT_BURST_PARTICLES))),
    ),
    color: effect.color ?? FX_DEFAULT_GLOW_COLOR,
    stagger: effect.stagger ?? false,
    segments: Math.min(
      FX_MAX_SEGMENTS,
      Math.max(1, Math.floor(positive(effect.segments, FX_DEFAULT_SEGMENTS))),
    ),
    repeat: effect.repeat ?? null,
  }
}

/** 구획 하나가 기다릴 시간(ms). 위에서 아래로 차례로 훑게 만든다. */
export function fxSegmentDelayMs(effect: ResolvedFxEffect, segment: number): number {
  if (!effect.stagger || effect.segments <= 1) return 0
  return Math.max(0, segment) * FX_SEGMENT_DELAY_MS
}

/**
 * 심볼 하나가 승리했을 때 재생할 효과 목록.
 *
 * 찾는 순서는 `fx[symbolId].win` → `fx.default.win` → 내장 pulse다.
 * 심볼 항목이 **빈 배열**이면 "연출 없음"이라는 뜻이라 기본값으로 되돌리지 않는다
 * (blank 같은 심볼을 조용히 두기 위해서다).
 *
 * 모션 축소에서는 pulse만 남긴다. 파티클과 회전은 전부 버린다.
 */
export function resolveSymbolFx(
  fx: FxMap | undefined,
  symbolId: SymbolId,
  reducedMotion = false,
): ResolvedFxEffect[] {
  const own = fx?.[symbolId]?.win
  const fallback = fx?.[FX_DEFAULT_KEY]?.win
  const chosen = own ?? fallback ?? BUILTIN_FX
  const resolved = chosen.map(resolveFxEffect)

  if (!reducedMotion) return resolved

  const pulses = resolved.filter((effect) => effect.type === 'pulse')
  if (pulses.length > 0) return [pulses[0] as ResolvedFxEffect]
  // pulse가 없던 심볼도 모션 축소에서는 pulse 하나로 대신한다. 단, 연출 없음은 없음 그대로다.
  return resolved.length === 0 ? [] : [resolveFxEffect(BUILTIN_FX[0] as FxEffect)]
}

/**
 * `stagger`가 켜진 효과에서 심볼 하나가 기다릴 시간(ms).
 * 승리 라인의 왼쪽부터 차례로 번쩍이게 만든다.
 */
export function fxStaggerDelayMs(effect: ResolvedFxEffect, index: number): number {
  return effect.stagger ? Math.max(0, index) * FX_STAGGER_STEP_MS : 0
}

/** 진폭에 강도를 반영한 값. `intensity`가 1이면 그대로다. */
export function fxAmplitude(base: number, intensity: number): number {
  return base * clamp01(intensity, 1)
}

/** `pulse`의 최종 배율. 강도가 낮으면 1에 가까워진다. */
export function fxPulseScale(effect: ResolvedFxEffect): number {
  return 1 + (effect.scale - 1) * effect.intensity
}

/** 승리 좌표 하나와 거기에 걸릴 연출. */
export interface PositionFx {
  position: GridPosition
  /** 그 자리에 실제로 보이는 심볼. 그룹 배당이어도 그룹 id가 아니다. */
  symbol: SymbolId
  effects: ResolvedFxEffect[]
}

/**
 * 승리 좌표별 연출을 뽑는다.
 *
 * **`win.symbol`로 찾지 않는다.** 그룹 배당(Any BAR 등)에서 그 값은 그룹 id라
 * 테마의 심볼 연출과 맞지 않는다. 언제나 격자에 실제로 놓인 심볼로 찾는다.
 * 그래서 같은 라인 안에서 BAR 1·2·3이 각자 다른 연출을 낸다.
 */
export function resolveFxForPositions(
  fx: FxMap | undefined,
  grid: readonly (readonly SymbolId[])[],
  positions: readonly GridPosition[],
  reducedMotion = false,
): PositionFx[] {
  return symbolsAtPositions(grid, positions).map((symbol, index) => ({
    position: positions[index] as GridPosition,
    symbol,
    effects: resolveSymbolFx(fx, symbol, reducedMotion),
  }))
}
