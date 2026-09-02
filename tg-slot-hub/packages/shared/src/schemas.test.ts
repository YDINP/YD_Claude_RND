import { describe, expect, it } from 'vitest'
import { WinLineSchema } from './schemas.js'

describe('WinLineSchema', () => {
  it('ways 당첨(line: -1, ways 포함)을 파싱한다', () => {
    const result = WinLineSchema.safeParse({
      line: -1,
      symbol: 'charm',
      count: 5,
      multiplier: 13,
      win: 52,
      positions: [
        [0, 0],
        [1, 1],
      ],
      ways: 4,
      direction: 'ltr',
    })
    expect(result.success).toBe(true)
  })

  it('line: -1인데 ways가 없으면 거부한다', () => {
    const result = WinLineSchema.safeParse({
      line: -1,
      symbol: 'charm',
      count: 5,
      multiplier: 13,
      win: 52,
      positions: [[0, 0]],
    })
    expect(result.success).toBe(false)
  })

  it('line: 0인데 ways가 있으면 거부한다', () => {
    const result = WinLineSchema.safeParse({
      line: 0,
      symbol: 'charm',
      count: 5,
      multiplier: 13,
      win: 52,
      positions: [[0, 0]],
      ways: 4,
    })
    expect(result.success).toBe(false)
  })

  it('일반 페이라인 당첨(line >= 0, ways 없음)은 그대로 통과한다', () => {
    const result = WinLineSchema.safeParse({
      line: 0,
      symbol: 'charm',
      count: 3,
      multiplier: 5,
      win: 15,
      positions: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    })
    expect(result.success).toBe(true)
  })
})
