import { describe, expect, it } from 'vitest'
import { createSeededRng } from './seeded.js'

function draw(seed: number | string, count: number, max: number): number[] {
  const rng = createSeededRng(seed)
  return Array.from({ length: count }, () => rng.nextInt(max))
}

describe('createSeededRng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    expect(draw('abc', 50, 32)).toEqual(draw('abc', 50, 32))
    expect(draw(7, 50, 32)).toEqual(draw(7, 50, 32))
  })

  it('다른 시드는 다른 수열을 만든다', () => {
    expect(draw('abc', 50, 1000)).not.toEqual(draw('abd', 50, 1000))
    expect(draw(1, 50, 1000)).not.toEqual(draw(2, 50, 1000))
  })

  it('숫자 시드와 같은 값의 문자열 시드를 구분한다', () => {
    expect(draw(7, 20, 1000)).not.toEqual(draw('7', 20, 1000))
  })

  it('항상 0 이상 max 미만의 정수를 만든다', () => {
    const rng = createSeededRng('range')
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.nextInt(37)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(37)
    }
  })

  it('max가 1이면 항상 0', () => {
    const rng = createSeededRng('one')
    expect(Array.from({ length: 20 }, () => rng.nextInt(1))).toEqual(new Array(20).fill(0))
  })

  it('편향 없이 고르게 분포한다', () => {
    const buckets = new Array<number>(10).fill(0)
    const rng = createSeededRng('uniform')
    const draws = 200_000
    for (let i = 0; i < draws; i += 1) {
      const index = rng.nextInt(10)
      buckets[index] = (buckets[index] ?? 0) + 1
    }
    const expected = draws / 10
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.03)
    }
  })

  it('잘못된 max는 예외', () => {
    const rng = createSeededRng('bad')
    expect(() => rng.nextInt(0)).toThrow(RangeError)
    expect(() => rng.nextInt(-1)).toThrow(RangeError)
    expect(() => rng.nextInt(2.5)).toThrow(RangeError)
  })
})
