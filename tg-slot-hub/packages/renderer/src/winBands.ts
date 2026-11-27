import { BRIEF_PHASE_ALL_SCALE, REDUCED_WIN_CYCLE_MS, WIN_TIER_MULTIPLIERS } from './constants.js'
import { spinSpeedProfile, type SpinSpeed } from './timing.js'

/**
 * 당첨 연출 단계. 베팅 대비 총 당첨 배수로 정한다.
 *
 * - `none`: 당첨 0
 * - `under`: 0 초과 1 미만 — 낸 돈보다 적게 돌려받은 판. 축하하지 않는다(손실을 당첨처럼 꾸미지 않는다)
 * - `small`: 1 이상 2 미만 / `good`: 2 이상 5 미만 / `great`: 5 이상 10 미만
 * - `big`: 10 이상 — 기존 큰 당첨 연출(`WinTier`)이 이어받는다
 */
export type WinBand = 'none' | 'under' | 'small' | 'good' | 'great' | 'big'

/** 단계 경계(베팅 배수). `big`은 기존 빅윈 문턱과 같은 값이다. */
export const WIN_BAND_MULTIPLIERS = { small: 1, good: 2, great: 5, big: WIN_TIER_MULTIPLIERS.big } as const

/** 멋진 당첨(great)에서 릴 위로 튀는 코인 수. */
export const WIN_BAND_COIN_COUNT = 8

export interface WinBandOptions {
  /**
   * 베팅을 내고 얻은 판인지. 기본 true. 프리스핀 판은 베팅을 내지 않았으므로 false이고,
   * 그때 `under`는 `small`로 올린다 — 손실 위장 문제는 유료 판에만 있다.
   */
  paid?: boolean
}

/** 총 당첨과 총 베팅으로 단계를 구한다. 베팅을 모르면(없음·0) 올리지 않고 `small`로 본다. */
export function winBandFor(totalWin: number, totalBet?: number, opts: WinBandOptions = {}): WinBand {
  if (!(totalWin > 0)) return 'none'
  if (typeof totalBet !== 'number' || !(totalBet > 0)) return 'small'
  const multiple = totalWin / totalBet
  if (multiple >= WIN_BAND_MULTIPLIERS.big) return 'big'
  if (multiple >= WIN_BAND_MULTIPLIERS.great) return 'great'
  if (multiple >= WIN_BAND_MULTIPLIERS.good) return 'good'
  if (multiple >= WIN_BAND_MULTIPLIERS.small) return 'small'
  return opts.paid === false ? 'small' : 'under'
}

/** 연출 시간을 가진 단계. `big`·`none`은 기존 계산을 그대로 쓴다. */
export type TimedWinBand = 'under' | 'small' | 'good' | 'great'

/** A단계 유지 시간 기준값(ms), 롤업이 차지하는 비율, 바닥(ms). */
export const WIN_BAND_TIMING: Record<TimedWinBand, { baseMs: number; rollupRatio: number; floorMs: number }> = {
  under: { baseMs: 600, rollupRatio: 0, floorMs: 300 },
  small: { baseMs: 900, rollupRatio: 0.55, floorMs: 400 },
  good: { baseMs: 1500, rollupRatio: 0.6, floorMs: 400 },
  great: { baseMs: 2200, rollupRatio: 0.65, floorMs: 400 },
}

export interface WinBandTimingInput {
  speed?: SpinSpeed
  /** 오토스핀·프리스핀처럼 다음 판으로 곧장 넘어가는 흐름. */
  brief?: boolean
  reducedMotion?: boolean
}

/** `under`~`great`가 아니면 null — 호출 측이 기존 계산으로 간다. */
export function isTimedWinBand(band: WinBand): band is TimedWinBand {
  return band === 'under' || band === 'small' || band === 'good' || band === 'great'
}

/** A단계 유지 시간(ms). 모션 줄이기는 450ms 상한을 씌운다. */
export function bandHoldMs(band: TimedWinBand, input: WinBandTimingInput = {}): number {
  const timing = WIN_BAND_TIMING[band]
  const scaled = Math.round(
    timing.baseMs * spinSpeedProfile(input.speed).winHoldScale * (input.brief === true ? BRIEF_PHASE_ALL_SCALE : 1),
  )
  const hold = Math.max(timing.floorMs, scaled)
  return input.reducedMotion === true ? Math.min(hold, REDUCED_WIN_CYCLE_MS) : hold
}

/** 총합 롤업 길이(ms). `under`는 0이라 숫자를 굴리지 않고 곧장 보인다. */
export function bandRollupMs(band: TimedWinBand, input: WinBandTimingInput = {}): number {
  const timing = WIN_BAND_TIMING[band]
  const hold = bandHoldMs(band, { ...input, reducedMotion: false })
  const rollup = Math.round(hold * timing.rollupRatio)
  return input.reducedMotion === true ? Math.min(rollup, REDUCED_WIN_CYCLE_MS) : rollup
}

/** 배수 표기용 문자열. 소수 첫째 자리 내림이라 4.96배가 `5.0`으로 보이지 않는다. */
export function floorMultipleLabel(multiple: number): string {
  const floored = Math.floor((Number.isFinite(multiple) ? multiple : 0) * 10 + 1e-9) / 10
  return floored.toFixed(1)
}
