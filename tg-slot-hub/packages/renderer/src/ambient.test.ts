import { describe, expect, it } from 'vitest'
import { planSparkles } from './ambient.js'
import {
  SPARKLE_MAX_COUNT,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_MAX_SCALE,
  SPARKLE_MIN_COUNT,
  SPARKLE_MIN_SCALE,
} from './constants.js'
import type { Rect } from './layout.js'

const area: Rect = { x: 10, y: 20, width: 300, height: 500 }

/** 값을 돌아가며 내놓는 결정론 난수. 경계값을 함께 밟는다. */
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
    expect(planSparkles(area, 8, () => 0.5)).toHaveLength(8)
  })

  it('상한이 10을 넘지 않는다', () => {
    expect(SPARKLE_MAX_COUNT).toBeLessThanOrEqual(10)
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

  it('같은 난수를 주면 같은 배치가 나온다', () => {
    const a = planSparkles(area, 8, cyclingRandom([0.1, 0.7, 0.3, 0.9]))
    const b = planSparkles(area, 8, cyclingRandom([0.1, 0.7, 0.3, 0.9]))
    expect(a).toEqual(b)
  })
})

describe('planSparkles 릴 창 회피', () => {
  const window: Rect = { x: 60, y: 120, width: 200, height: 200 }

  function inside(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  }

  it('릴 창 안에는 하나도 놓지 않는다', () => {
    const random = cyclingRandom([0.5, 0.5, 0.05, 0.05, 0.95, 0.95, 0.2, 0.8])
    const placements = planSparkles(area, SPARKLE_MAX_COUNT, random, { exclude: window })
    for (const sparkle of placements) {
      expect(inside(window, sparkle.x, sparkle.y)).toBe(false)
    }
  })

  it('창 가장자리에도 여유를 둔다', () => {
    // 창 정중앙만 나오는 난수라면 자리를 못 찾아 전부 버려진다.
    const placements = planSparkles(area, SPARKLE_MAX_COUNT, () => 0.5, { exclude: area })
    expect(placements).toHaveLength(0)
  })

  it('빈자리를 못 찾으면 무한히 돌지 않고 버린다', () => {
    const start = Date.now()
    const placements = planSparkles(area, SPARKLE_MAX_COUNT, () => 0.5, { exclude: area })
    expect(placements).toEqual([])
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('exclude가 없으면 전부 배치된다', () => {
    expect(planSparkles(area, SPARKLE_MAX_COUNT, () => 0.5)).toHaveLength(SPARKLE_MAX_COUNT)
  })
})
