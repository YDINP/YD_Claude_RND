import { describe, expect, it } from 'vitest'
import { createCryptoRng } from './crypto.js'

describe('createCryptoRng', () => {
  it('0 이상 max 미만의 정수를 만든다', () => {
    const rng = createCryptoRng()
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.nextInt(32)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(32)
    }
  })

  it('모든 값이 최소 한 번은 나온다', () => {
    const rng = createCryptoRng()
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i += 1) seen.add(rng.nextInt(8))
    expect(seen.size).toBe(8)
  })

  it('잘못된 max는 예외', () => {
    const rng = createCryptoRng()
    expect(() => rng.nextInt(0)).toThrow(RangeError)
    expect(() => rng.nextInt(1.5)).toThrow(RangeError)
  })
})
