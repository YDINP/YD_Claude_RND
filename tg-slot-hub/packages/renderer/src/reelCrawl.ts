import {
  ACCEL_DISTANCE_RATIO,
  ACCEL_TIME_RATIO,
  ANTICIPATION_CRAWL_ENTRY_SPEED,
  ANTICIPATION_CRAWL_PORTION,
  ANTICIPATION_MAX_EXTRA_TURNS,
  ANTICIPATION_MIN_SPEED_RATIO,
  ANTICIPATION_STEP_MOVE_PORTION,
} from './constants.js'

/**
 * 기대 릴의 «감속 → 크롤» 이동 곡선. 순수 함수만 둔다(렌더러는 매 프레임 `crawlTravel`을 물어본다).
 *
 * 구간: 가속(보통 릴과 같은 길이) → 최고 속도 유지 → 감속(기대 창 앞부분) → 크롤(한 칸씩 «툭, 툭»).
 * 곡선은 **이동 거리만** 정한다. 끝점은 언제나 `distance`라 정지 위치(결과)는 바뀌지 않는다.
 * 거리가 짧아 최고 속도가 크롤보다 느려지면 `valid`가 false고, 렌더러는 예전 감속 트윈으로 물러선다.
 */
export interface CrawlCurveInput {
  /** 이동할 거리(심볼 칸). 당김이 끝난 자리부터 착지 직전 자리까지. */
  distance: number
  /** 회전 구간 길이(ms). 당김·정착은 빼고. */
  spinMs: number
  /** 가속 구간 길이(ms). */
  accelMs: number
  /** 기대 창 길이(ms). 감속 + 크롤. */
  windowMs: number
  /** 크롤 칸 수. */
  steps: number
}

export interface CrawlCurve {
  readonly distance: number
  readonly spinMs: number
  readonly accelMs: number
  readonly cruiseMs: number
  readonly decelMs: number
  readonly crawlMs: number
  readonly stepMs: number
  readonly steps: number
  /** 최고 속도(칸/ms). */
  readonly peakSpeed: number
  /** 감속이 끝나는 속도(칸/ms). */
  readonly crawlSpeed: number
  readonly valid: boolean
}

export function planCrawlCurve(input: CrawlCurveInput): CrawlCurve {
  const spinMs = Math.max(1, input.spinMs)
  const accelMs = Math.min(Math.max(0, input.accelMs), spinMs)
  const steps = Math.max(0, Math.floor(input.steps))
  const windowMs = Math.min(Math.max(0, input.windowMs), spinMs - accelMs)
  const crawlMs = steps > 0 ? windowMs * ANTICIPATION_CRAWL_PORTION : 0
  const decelMs = windowMs - crawlMs
  const cruiseMs = spinMs - accelMs - windowMs
  const stepMs = steps > 0 ? crawlMs / steps : 0
  const crawlSpeed = stepMs > 0 ? ANTICIPATION_CRAWL_ENTRY_SPEED / stepMs : 0
  // 거리 = v·(Ta/2 + Tc + Td/3) + vc·(2Td/3) + 칸 수. 감속 속도는 vc + (v − vc)(1 − s)² 꼴이다.
  const coefficient = accelMs / 2 + cruiseMs + decelMs / 3
  const peakSpeed = coefficient > 0 ? (input.distance - steps - (crawlSpeed * 2 * decelMs) / 3) / coefficient : 0
  const valid = steps > 0 && windowMs > 0 && coefficient > 0 && peakSpeed >= crawlSpeed && Number.isFinite(peakSpeed)
  return { distance: input.distance, spinMs, accelMs, cruiseMs, decelMs, crawlMs, stepMs, steps, peakSpeed, crawlSpeed, valid }
}

/** 크롤 한 칸 안의 진행(0..1). 앞부분에서 감속하며 한 칸을 넘기고 나머지는 머문다. */
export function crawlStepProgress(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction))
  if (f >= ANTICIPATION_STEP_MOVE_PORTION) return 1
  const u = f / ANTICIPATION_STEP_MOVE_PORTION
  return 1 - Math.pow(1 - u, 3)
}

/** `t`ms(회전 구간 시작 기준) 시점까지 이동한 거리. 0에서 시작해 `spinMs`에 정확히 `distance`다. 줄지 않는다. */
export function crawlTravel(curve: CrawlCurve, t: number): number {
  const { accelMs, cruiseMs, decelMs, stepMs, steps, peakSpeed: v, crawlSpeed: vc, distance } = curve
  if (t <= 0) return 0
  if (t >= curve.spinMs) return distance
  if (t < accelMs) return (v * t * t) / (2 * accelMs)
  const accelD = (v * accelMs) / 2
  if (t < accelMs + cruiseMs) return accelD + v * (t - accelMs)
  const cruiseD = accelD + v * cruiseMs
  const decelEnd = accelMs + cruiseMs + decelMs
  if (t < decelEnd) {
    const s = (t - accelMs - cruiseMs) / decelMs
    return cruiseD + decelMs * (vc * s + ((v - vc) * (1 - Math.pow(1 - s, 3))) / 3)
  }
  const crawlStart = distance - steps
  const u = (t - decelEnd) / stepMs
  const k = Math.min(steps - 1, Math.floor(u))
  return Math.min(distance, crawlStart + k + crawlStepProgress(u - k))
}

/** `t`에 진행 중인 크롤 칸 번호(0부터). 크롤 전이면 -1. 칸이 넘어가는 순간마다 틱 소리를 내는 데 쓴다. */
export function crawlStepAt(curve: CrawlCurve, t: number): number {
  const start = curve.accelMs + curve.cruiseMs + curve.decelMs
  if (curve.steps <= 0 || t < start) return -1
  return Math.min(curve.steps - 1, Math.floor((t - start) / curve.stepMs))
}

/** 보통 릴이 같은 거리·시간에 내는 최고 속도(칸/ms) — 가속 끝 속도다. */
export function normalPeakSpeed(distance: number, spinMs: number): number {
  return spinMs > 0 ? (2 * ACCEL_DISTANCE_RATIO * distance) / (ACCEL_TIME_RATIO * spinMs) : 0
}

export interface CrawlPlanInput {
  /** 더한 바퀴 수 → 이동 거리. 렌더러가 정지 위치로 계산해 준다(결과는 늘 같은 칸에 선다). */
  distanceFor: (extraTurns: number) => number
  spinMs: number
  /** 기대감이 없었을 때의 회전 길이(ms). 가속 길이와 기준 속도가 여기서 나온다. */
  baseSpinMs: number
  windowMs: number
  steps: number
}

/**
 * 기대 릴의 곡선을 고른다. 기대 릴은 더 오래 돌므로 같은 바퀴 수면 느리게 보인다 — 최고 속도가 보통 릴의
 * `ANTICIPATION_MIN_SPEED_RATIO` 이상이 될 때까지 바퀴를 더한다. 끝점은 늘 같은 정지 칸이다.
 */
export function planCrawl(input: CrawlPlanInput): { extraTurns: number; curve: CrawlCurve } {
  const accelMs = input.baseSpinMs * ACCEL_TIME_RATIO
  const reference = normalPeakSpeed(input.distanceFor(0), input.baseSpinMs) * ANTICIPATION_MIN_SPEED_RATIO
  let best = { extraTurns: 0, curve: planCrawlCurve({ distance: input.distanceFor(0), spinMs: input.spinMs, accelMs, windowMs: input.windowMs, steps: input.steps }) }
  for (let extra = 0; extra <= ANTICIPATION_MAX_EXTRA_TURNS; extra += 1) {
    const curve = planCrawlCurve({ distance: input.distanceFor(extra), spinMs: input.spinMs, accelMs, windowMs: input.windowMs, steps: input.steps })
    best = { extraTurns: extra, curve }
    if (curve.valid && curve.peakSpeed >= reference) break
  }
  return best
}
