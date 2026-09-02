import { describe, expect, it } from 'vitest'
import { assertBetLevel, buildGrid, spin } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import { makeTestMath } from './testFixtures.js'

const math = makeTestMath()

describe('buildGrid', () => {
  it('정지 위치부터 rows개를 읽어 grid[row][reel]로 만든다', () => {
    const grid = buildGrid(math, [0, 0, 0])
    expect(grid).toEqual([
      ['w', 'a', 'b'],
      ['a', 'w', 'a'],
      ['b', 'b', 'w'],
    ])
  })

  it('스트립 끝을 지나면 처음으로 감긴다', () => {
    const strip = math.strips[0] ?? []
    const grid = buildGrid(math, [strip.length - 1, 0, 0])
    expect(grid[0]?.[0]).toBe(strip[strip.length - 1])
    expect(grid[1]?.[0]).toBe(strip[0])
    expect(grid[2]?.[0]).toBe(strip[1])
  })

  it('정지 위치 개수가 릴 수와 다르면 예외', () => {
    expect(() => buildGrid(math, [0, 0])).toThrow(RangeError)
  })
})

describe('spin', () => {
  it('같은 시드는 항상 같은 결과를 만든다', () => {
    const a = spin(math, { totalBet: 30 }, createSeededRng('seed-1'))
    const b = spin(math, { totalBet: 30 }, createSeededRng('seed-1'))
    expect(b).toEqual(a)
  })

  it('같은 시드의 연속 스핀 수열도 재현된다', () => {
    const run = (): number[][] => {
      const rng = createSeededRng(12345)
      return Array.from({ length: 20 }, () => spin(math, { totalBet: 30 }, rng).stops)
    }
    expect(run()).toEqual(run())
  })

  it('다른 시드는 다른 수열을 만든다', () => {
    const seq = (seed: string): string => {
      const rng = createSeededRng(seed)
      return Array.from({ length: 30 }, () => spin(math, { totalBet: 30 }, rng).stops.join(',')).join('|')
    }
    expect(seq('alpha')).not.toBe(seq('beta'))
  })

  it('정지 위치가 스트립 범위 안에 있고 그리드 크기가 맞는다', () => {
    const rng = createSeededRng('range')
    for (let i = 0; i < 200; i += 1) {
      const result = spin(math, { totalBet: 30 }, rng)
      expect(result.stops).toHaveLength(math.reels)
      result.stops.forEach((stop, reel) => {
        expect(stop).toBeGreaterThanOrEqual(0)
        expect(stop).toBeLessThan(math.strips[reel]?.length ?? 0)
      })
      expect(result.grid).toHaveLength(math.rows)
      expect(result.grid[0]).toHaveLength(math.reels)
      expect(result.features).toEqual([])
    }
  })

  it('선언되지 않은 베팅액은 예외', () => {
    expect(() => spin(math, { totalBet: 10 }, createSeededRng(1))).toThrow(RangeError)
    expect(() => spin(math, { totalBet: 9 }, createSeededRng(1))).toThrow(RangeError)
  })

  it('선언된 베팅 레벨은 모두 받는다', () => {
    for (const level of math.betLevels) {
      expect(() => spin(math, { totalBet: level }, createSeededRng(level))).not.toThrow()
    }
  })
})

describe('assertBetLevel', () => {
  it('betLevels에 있는 값은 통과시킨다', () => {
    expect(() => assertBetLevel(math, 30)).not.toThrow()
  })

  it('나누어떨어져도 betLevels에 없으면 예외', () => {
    // 9는 라인 수 3으로 나누어떨어지지만 선언된 베팅 레벨이 아니다.
    expect(() => assertBetLevel(math, 9)).toThrow(RangeError)
  })

  it('예외 메시지에 가능한 베팅액을 담는다', () => {
    expect(() => assertBetLevel(math, 9)).toThrow(/3, 6, 30/)
  })
})
