import { describe, expect, it } from 'vitest'
import { planLightSweep, planSparkles } from './ambient.js'
import {
  SPARKLE_MAX_COUNT,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_MAX_SCALE,
  SPARKLE_MIN_COUNT,
  SPARKLE_MIN_SCALE,
  SWEEP_ANGLE_DEG,
  SWEEP_TRAVEL_MS,
  SWEEP_WIDTH_RATIO,
} from './constants.js'
import type { Rect } from './layout.js'

const area: Rect = { x: 10, y: 20, width: 300, height: 500 }

/** 0, 0.5, 1을 돌아가며 내놓는 결정론 난수. 경계값을 함께 밟는다. */
function cyclingRandom(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index % values.length] ?? 0
    index += 1
    return value
  }
}

describe('planSparkles', () => {
  it('개수를 하한과 상한 사이로 묶는다', () => {
    expect(planSparkles(area, 0, () => 0.5)).toHaveLength(SPARKLE_MIN_COUNT)
    expect(planSparkles(area, 1000, () => 0.5)).toHaveLength(SPARKLE_MAX_COUNT)
    expect(planSparkles(area, 15, () => 0.5)).toHaveLength(15)
  })

  it('모든 반짝임이 영역 안에 있다', () => {
    const random = cyclingRandom([0, 0.25, 0.5, 0.75, 0.999])
    for (const sparkle of planSparkles(area, SPARKLE_MAX_COUNT, random)) {
      expect(sparkle.x).toBeGreaterThanOrEqual(area.x)
      expect(sparkle.x).toBeLessThanOrEqual(area.x + area.width)
      expect(sparkle.y).toBeGreaterThanOrEqual(area.y)
      expect(sparkle.y).toBeLessThanOrEqual(area.y + area.height)
    }
  })

  it('배율과 대기가 정해진 범위 안이다', () => {
    const random = cyclingRandom([0, 0.33, 0.66, 1])
    for (const sparkle of planSparkles(area, SPARKLE_MAX_COUNT, random)) {
      expect(sparkle.scale).toBeGreaterThanOrEqual(SPARKLE_MIN_SCALE)
      expect(sparkle.scale).toBeLessThanOrEqual(SPARKLE_MAX_SCALE)
      expect(sparkle.delayMs).toBeGreaterThanOrEqual(0)
      expect(sparkle.delayMs).toBeLessThanOrEqual(SPARKLE_MAX_DELAY_MS)
    }
  })

  it('난수 0이면 왼쪽 위 모서리에 가장 작게 놓인다', () => {
    const first = planSparkles(area, SPARKLE_MIN_COUNT, () => 0)[0]
    expect(first).toEqual({ x: area.x, y: area.y, scale: SPARKLE_MIN_SCALE, delayMs: 0 })
  })

  it('같은 난수를 주면 같은 배치가 나온다', () => {
    const a = planSparkles(area, 14, cyclingRandom([0.1, 0.7, 0.3, 0.9]))
    const b = planSparkles(area, 14, cyclingRandom([0.1, 0.7, 0.3, 0.9]))
    expect(a).toEqual(b)
  })
})

describe('planLightSweep', () => {
  const plan = planLightSweep(area)

  it('영역 밖에서 시작해 밖에서 끝난다', () => {
    expect(plan.fromX).toBeLessThan(area.x)
    expect(plan.toX).toBeGreaterThan(area.x + area.width)
  })

  it('띠 폭은 영역 폭에 비례한다', () => {
    expect(plan.width).toBeCloseTo(area.width * SWEEP_WIDTH_RATIO, 9)
  })

  it('띠 길이가 대각선보다 길어 모서리까지 훑는다', () => {
    expect(plan.height).toBeGreaterThan(Math.hypot(area.width, area.height))
  })

  it('영역 세로 한가운데를 지난다', () => {
    expect(plan.y).toBeCloseTo(area.y + area.height / 2, 9)
  })

  it('기울기를 라디안으로 바꿔 준다', () => {
    expect(plan.rotation).toBeCloseTo((SWEEP_ANGLE_DEG * Math.PI) / 180, 9)
  })

  it('기본 이동 시간을 쓰고 바꿀 수도 있다', () => {
    expect(plan.travelMs).toBe(SWEEP_TRAVEL_MS)
    expect(planLightSweep(area, 500).travelMs).toBe(500)
  })

  it('폭이 0인 영역에서도 띠 폭은 양수다', () => {
    expect(planLightSweep({ x: 0, y: 0, width: 0, height: 0 }).width).toBeGreaterThan(0)
  })
})
