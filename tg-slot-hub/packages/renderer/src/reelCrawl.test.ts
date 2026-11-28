import { describe, expect, it } from 'vitest'
import { anticipatedReels, anticipationOutcome, scatterCountsByReel, type AnticipationMath } from './anticipation.js'
import {
  ACCEL_TIME_RATIO,
  ANTICIPATION_REEL_CAP_MS,
  ANTICIPATION_TOTAL_CAP_MS,
} from './constants.js'
import { normalizePosition, spinTargetPosition } from './grid.js'
import { crawlStepAt, crawlTravel, normalPeakSpeed, planCrawl, planCrawlCurve } from './reelCrawl.js'
import { buildOrderedSpinPlan, centerStopOrder, shapeScatterCounts } from './stopOrder.js'
import { anticipationExtrasMs, buildSpinPlan, crawlStepsFor } from './timing.js'

describe('anticipationExtrasMs (기대 릴 추가 시간)', () => {
  it('뒤 릴일수록 길고, 릴 하나 상한과 판 합계 상한을 지킨다', () => {
    for (let n = 1; n <= 8; n += 1) {
      const extras = anticipationExtrasMs(n, 'normal')
      expect(extras).toHaveLength(n)
      for (let i = 1; i < n; i += 1) expect(extras[i]).toBeGreaterThanOrEqual(extras[i - 1] ?? 0)
      for (const ms of extras) expect(ms).toBeLessThanOrEqual(ANTICIPATION_REEL_CAP_MS)
      expect(extras.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ANTICIPATION_TOTAL_CAP_MS)
    }
  })

  it('normal 한 릴은 1.6초 안팎(기대 창 = 추가 시간 + 릴 간격)', () => {
    const plan = buildSpinPlan({ reels: 5, anticipation: [2] })
    const window = plan.reels[2]?.anticipationWindowMs ?? 0
    expect(window).toBeGreaterThanOrEqual(1300)
    expect(window).toBeLessThanOrEqual(1800)
  })

  it('quick은 줄이고 turbo·모션 축소는 끈다', () => {
    const normal = anticipationExtrasMs(3, 'normal')
    const quick = anticipationExtrasMs(3, 'quick')
    quick.forEach((ms, i) => {
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThan(normal[i] ?? 0)
    })
    expect(anticipationExtrasMs(3, 'turbo')).toEqual([0, 0, 0])
    const turbo = buildSpinPlan({ reels: 5, anticipation: [2, 3, 4], speed: 'turbo' })
    expect(turbo.reels.every((r) => r.anticipationMs === 0 && (r.crawlSteps ?? 0) === 0)).toBe(true)
    const reduced = buildSpinPlan({ reels: 5, anticipation: [2, 3, 4], reducedMotion: true })
    expect(reduced.reels.every((r) => r.anticipationMs === 0 && (r.anticipationWindowMs ?? 0) === 0)).toBe(true)
  })

  it('세 릴 연속 기대 — 합 4초 이하, 뒤 릴 창이 더 길다', () => {
    const base = buildSpinPlan({ reels: 5 })
    const plan = buildSpinPlan({ reels: 5, anticipation: [2, 3, 4] })
    expect(plan.totalMs - base.totalMs).toBeLessThanOrEqual(ANTICIPATION_TOTAL_CAP_MS)
    const windows = [2, 3, 4].map((r) => plan.reels[r]?.anticipationWindowMs ?? 0)
    expect(windows[1]).toBeGreaterThan(windows[0] ?? 0)
    expect(windows[2]).toBeGreaterThan(windows[1] ?? 0)
    for (const r of [2, 3, 4]) expect(plan.reels[r]?.crawlSteps).toBeGreaterThan(0)
  })

  it('가운데부터 서는 판(마름모)도 같은 규칙에 판 배율만 곱한다', () => {
    const plan = buildOrderedSpinPlan(centerStopOrder(5), { reels: 5, anticipationGroups: [2] })
    expect(plan.reels[0]?.anticipationMs).toBe(plan.reels[4]?.anticipationMs)
    expect(plan.reels[0]?.anticipationMs).toBeGreaterThan(0)
    expect(plan.reels[0]?.anticipationMs).toBeLessThan(anticipationExtrasMs(1, 'normal')[0] ?? 0)
  })

  it('크롤 칸 수는 창이 길수록 많고 1~3칸', () => {
    expect(crawlStepsFor(0)).toBe(0)
    expect(crawlStepsFor(300)).toBe(1)
    expect(crawlStepsFor(1500)).toBe(3)
    expect(crawlStepsFor(9000)).toBe(3)
  })
})

describe('감속 → 크롤 곡선', () => {
  const plan = buildSpinPlan({ reels: 5, anticipation: [2] })
  const reel = plan.reels[2]!
  const stripLength = 40
  const start = 17.3
  const stop = 29
  const pullUpTo = start + 0.25
  const settle = 0.04
  const targetFor = (extra: number): number => spinTargetPosition(start, stop, stripLength, reel.revolutions + extra)
  const picked = planCrawl({
    distanceFor: (extra) => pullUpTo - (targetFor(extra) - settle),
    spinMs: reel.spinMs,
    baseSpinMs: reel.spinMs - reel.anticipationMs,
    windowMs: reel.anticipationWindowMs ?? 0,
    steps: reel.crawlSteps ?? 0,
  })
  const curve = picked.curve

  it('정지 위치는 바뀌지 않는다 — 바퀴를 더해도 같은 칸에 선다', () => {
    expect(curve.valid).toBe(true)
    const target = targetFor(picked.extraTurns)
    expect(normalizePosition(target, stripLength)).toBeCloseTo(normalizePosition(stop, stripLength), 9)
    expect(crawlTravel(curve, curve.spinMs)).toBe(curve.distance)
    expect(crawlTravel(curve, 0)).toBe(0)
  })

  it('이동 거리는 줄지 않는다(뒤로 가지 않는다)', () => {
    let prev = 0
    for (let t = 0; t <= curve.spinMs; t += 4) {
      const d = crawlTravel(curve, t)
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = d
    }
  })

  it('최고 속도는 보통 릴 수준이고 크롤 구간은 칸마다 한 칸씩 넘어간다', () => {
    const reference = normalPeakSpeed(pullUpTo - (targetFor(0) - settle), reel.spinMs - reel.anticipationMs)
    expect(curve.peakSpeed).toBeGreaterThanOrEqual(reference * 0.9)
    const crawlStart = curve.accelMs + curve.cruiseMs + curve.decelMs
    expect(crawlStepAt(curve, crawlStart - 1)).toBe(-1)
    for (let k = 0; k < curve.steps; k += 1) {
      const atStepEnd = crawlStart + (k + 1) * curve.stepMs - 1
      expect(crawlStepAt(curve, atStepEnd)).toBe(k)
      // 칸이 끝날 무렵엔 정수 칸에 머문다(«툭» 넘어간 뒤 멈춤).
      expect(crawlTravel(curve, atStepEnd)).toBeCloseTo(curve.distance - curve.steps + k + 1, 6)
    }
  })

  it('가속 길이는 기대감이 없을 때와 같다', () => {
    expect(curve.accelMs).toBeCloseTo((reel.spinMs - reel.anticipationMs) * ACCEL_TIME_RATIO, 6)
  })

  it('뒤 기대 릴의 크롤 한 칸이 더 길다(더 느리다)', () => {
    const three = buildSpinPlan({ reels: 5, anticipation: [2, 3, 4] })
    const stepMs = [2, 4].map((r) => {
      const p = three.reels[r]!
      return planCrawlCurve({
        distance: 200,
        spinMs: p.spinMs,
        accelMs: (p.spinMs - p.anticipationMs) * ACCEL_TIME_RATIO,
        windowMs: p.anticipationWindowMs ?? 0,
        steps: p.crawlSteps ?? 0,
      }).stepMs
    })
    expect(stepMs[1]).toBeGreaterThan(stepMs[0] ?? 0)
  })

  it('거리가 너무 짧으면 곡선을 포기한다(렌더러는 예전 트윈)', () => {
    expect(planCrawlCurve({ distance: 2, spinMs: 2000, accelMs: 400, windowMs: 1400, steps: 3 }).valid).toBe(false)
  })
})

describe('기대감 결과(터짐/꺼짐)', () => {
  it('그 릴이 서는 시각까지 선 개수로 판정한다', () => {
    const counts = [1, 1, 1, 0, 0]
    const end = [100, 200, 300, 400, 500]
    expect(anticipationOutcome(counts, end, 2, 3)).toBe('hit')
    expect(anticipationOutcome([1, 1, 0, 0, 1], end, 2, 3)).toBe('miss')
    expect(anticipationOutcome([1, 1, 0, 0, 1], end, 4, 3)).toBe('hit')
  })

  it('같은 시각에 서는 묶음은 함께 센다', () => {
    // 가운데부터: [2] → [1,3] → [0,4]
    const end = [300, 200, 100, 200, 300]
    expect(anticipationOutcome([0, 0, 2, 1, 0], end, 1, 3)).toBe('hit')
    expect(anticipationOutcome([0, 0, 2, 0, 0], end, 1, 3)).toBe('miss')
  })
})

describe('릴마다 높이가 다른 판(3-4-5-4-3 마름모)', () => {
  const strip = ['S', 'a', 'b', 'c', 'd', 'e', 'f']
  const math = { reels: 5, rows: 5, reelHeights: [3, 4, 5, 4, 3], strips: [strip, strip, strip, strip, strip] }

  it('스캐터는 그 릴 높이까지만 센다(판 밖 칸은 세지 않는다)', () => {
    // stop 3 → 창 c,d,e,f,S: 높이 5 릴만 S가 보인다.
    expect(shapeScatterCounts(math, [3, 3, 3, 3, 3], 'S')).toEqual([0, 0, 1, 0, 0])
    // math.rows 하나로 세면 다섯 릴 전부 1이 된다 — 그 잘못을 막는다.
    const rect: AnticipationMath = { reels: 5, rows: 5, strips: math.strips, scatter: { symbol: 'S', freeSpins: { trigger: 3, count: 8, multiplier: 1, retrigger: false } } }
    expect(scatterCountsByReel(rect, [3, 3, 3, 3, 3])).toEqual([1, 1, 1, 1, 1])
  })

  it('직사각 6×5 위치 무관 판은 math.rows로 세도 맞다', () => {
    const s6 = ['A', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const forge: AnticipationMath = {
      reels: 6,
      rows: 5,
      strips: [s6, s6, s6, s6, s6, s6],
      scatter: { symbol: 'A', freeSpins: { trigger: 4, count: 10, multiplier: 1, retrigger: false } },
    }
    // 앞 세 릴에 A가 하나씩 → 4번째부터 기대.
    expect(anticipatedReels(forge, [0, 0, 0, 1, 1, 1])).toEqual([3, 4, 5])
  })
})
