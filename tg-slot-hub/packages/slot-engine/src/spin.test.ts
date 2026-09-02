import { describe, expect, it } from 'vitest'
import type { RoundState, SpinResult } from './types.js'
import { assertBetLevel, buildGrid, resolveSpin, spin } from './spin.js'
import { MAX_FREE_SPINS_PER_ROUND } from './limits.js'
import { createSeededRng } from './rng/seeded.js'
import { makeScatterMath, makeTestMath } from './testFixtures.js'

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

describe('spin - 스캐터와 프리스핀', () => {
  const scatterMath = makeScatterMath()

  /** 원하는 스캐터 개수가 나오는 정지 위치를 찾는다. */
  function findStops(target: number): number[] {
    for (let a = 0; a < 6; a += 1) {
      for (let b = 0; b < 6; b += 1) {
        for (let c = 0; c < 6; c += 1) {
          const grid = buildGrid(scatterMath, [a, b, c])
          const count = grid.flat().filter((symbol) => symbol === 's').length
          if (count === target) return [a, b, c]
        }
      }
    }
    throw new Error(`스캐터 ${target}개가 나오는 조합이 없다`)
  }

  function spinAt(stops: number[], state?: RoundState): SpinResult {
    const grid = buildGrid(scatterMath, stops)
    return resolveSpin(scatterMath, grid, stops, 3, 1, state)
  }

  it('스캐터 3개면 프리스핀이 열린다', () => {
    const result = spinAt(findStops(3))
    const trigger = result.features.find((feature) => feature.type === 'freeSpins')
    expect(trigger).toMatchObject({ type: 'freeSpins', spins: 5, multiplier: 2, retrigger: false })
    expect(result.nextState).toEqual({ freeSpinsLeft: 5, freeSpinsTotal: 5, multiplier: 2 })
  })

  it('스캐터 배당이 feature로도 나오고 scatterWin에도 잡힌다', () => {
    const result = spinAt(findStops(3))
    expect(result.scatterWin).toBe(15) // 3개 = 총 베팅액 3 x 5배
    const scatterFeature = result.features.find((feature) => feature.type === 'scatterWin')
    expect(scatterFeature).toMatchObject({ type: 'scatterWin', symbol: 's', count: 3, win: 15 })
    expect(scatterFeature?.type === 'scatterWin' && scatterFeature.positions).toHaveLength(3)
  })

  it('스캐터가 부족하면 프리스핀이 열리지 않는다', () => {
    const result = spinAt(findStops(1))
    expect(result.features.some((feature) => feature.type === 'freeSpins')).toBe(false)
    expect(result.nextState).toBeUndefined()
    expect(result.scatterWin).toBe(0)
  })

  it('프리스핀 중에는 배수가 곱해진다', () => {
    const stops = findStops(0)
    const base = spinAt(stops)
    const free = spinAt(stops, { freeSpinsLeft: 5, freeSpinsTotal: 5, multiplier: 2 })
    expect(free.lineWin).toBe(base.lineWin)
    expect(free.scatterWin).toBe(base.scatterWin)
    expect(free.totalWin).toBe((base.lineWin + base.scatterWin) * 2)
  })

  it('프리스핀은 1회씩 줄어든다', () => {
    const result = spinAt(findStops(0), { freeSpinsLeft: 5, freeSpinsTotal: 5, multiplier: 2 })
    expect(result.nextState).toEqual({ freeSpinsLeft: 4, freeSpinsTotal: 5, multiplier: 2 })
  })

  it('마지막 프리스핀이면 nextState가 없다', () => {
    const result = spinAt(findStops(0), { freeSpinsLeft: 1, freeSpinsTotal: 5, multiplier: 2 })
    expect(result.nextState).toBeUndefined()
  })

  it('프리스핀 중 재트리거는 횟수를 더한다', () => {
    const result = spinAt(findStops(3), { freeSpinsLeft: 2, freeSpinsTotal: 5, multiplier: 2 })
    expect(result.nextState).toEqual({ freeSpinsLeft: 6, freeSpinsTotal: 10, multiplier: 2 })
    const trigger = result.features.find((feature) => feature.type === 'freeSpins')
    expect(trigger).toMatchObject({ retrigger: true, spins: 5, multiplier: 2 })
  })

  it('retrigger가 꺼져 있으면 프리스핀 중 다시 트리거돼도 늘지 않는다', () => {
    const noRetrigger = makeScatterMath({
      scatter: {
        symbol: 's',
        pays: { 2: 1, 3: 5, 4: 20 },
        freeSpins: { trigger: 3, count: 5, multiplier: 2, retrigger: false },
      },
    })
    const stops = findStops(3)
    const grid = buildGrid(noRetrigger, stops)
    const result = resolveSpin(noRetrigger, grid, stops, 3, 1, {
      freeSpinsLeft: 2,
      freeSpinsTotal: 5,
      multiplier: 2,
    })
    expect(result.nextState).toEqual({ freeSpinsLeft: 1, freeSpinsTotal: 5, multiplier: 2 })
    expect(result.features.some((feature) => feature.type === 'freeSpins')).toBe(false)
  })

  it('와일드는 스캐터를 대체하지 않는다', () => {
    // 와일드가 세 릴에 하나씩 보이는 위치라도 스캐터로는 세지 않는다.
    const result = spinAt([0, 1, 2])
    const grid = buildGrid(scatterMath, [0, 1, 2])
    expect(grid.flat()).toContain('w')
    const scatterCount = grid.flat().filter((symbol) => symbol === 's').length
    const feature = result.features.find((f) => f.type === 'scatterWin')
    expect(feature === undefined ? 0 : feature.type === 'scatterWin' ? feature.count : 0).toBe(
      scatterCount >= 2 ? scatterCount : 0,
    )
  })

  it('스캐터가 없는 모델은 scatterWin이 0이고 features가 비어 있다', () => {
    const result = spin(math, { totalBet: 30 }, createSeededRng('no-scatter'))
    expect(result.scatterWin).toBe(0)
    expect(result.features).toEqual([])
    expect(result.totalWin).toBe(result.lineWin)
  })

  it('4번째 인자는 선택이라 기존 호출이 그대로 동작한다', () => {
    const withoutState = spin(math, { totalBet: 30 }, createSeededRng('compat'))
    const withUndefined = spin(math, { totalBet: 30 }, createSeededRng('compat'), undefined)
    expect(withUndefined).toEqual(withoutState)
  })
})

describe('라운드 프리스핀 상한', () => {
  const scatterMath = makeScatterMath()
  const TOTAL_BET = 3
  const BET_UNIT = 1
  // 스캐터 3개 = 트리거. 나머지 칸은 지급되지 않는 조합으로 채운다.
  const triggerGrid = (): string[][] => [
    ['s', 'b', 'a'],
    ['a', 's', 'b'],
    ['b', 'a', 's'],
  ]

  function retriggerAt(freeSpinsTotal: number): SpinResult {
    const state: RoundState = { freeSpinsLeft: 1, freeSpinsTotal, multiplier: 2 }
    return resolveSpin(scatterMath, triggerGrid(), [0, 0, 0], TOTAL_BET, BET_UNIT, state)
  }

  it('여유가 있으면 규칙대로 다 얹고 캡 기록을 남기지 않는다', () => {
    const result = retriggerAt(5)
    expect(result.features).toContainEqual({ type: 'freeSpins', spins: 5, multiplier: 2, retrigger: true })
    expect(result.features.some((feature) => feature.type === 'freeSpinsCapped')).toBe(false)
    expect(result.nextState).toMatchObject({ freeSpinsLeft: 5, freeSpinsTotal: 10 })
  })

  it('상한을 넘기는 리트리거는 남은 만큼만 얹고 사실을 기록한다', () => {
    const result = retriggerAt(MAX_FREE_SPINS_PER_ROUND - 2)
    expect(result.features).toContainEqual({ type: 'freeSpins', spins: 2, multiplier: 2, retrigger: true })
    expect(result.features).toContainEqual({
      type: 'freeSpinsCapped',
      requested: 5,
      granted: 2,
      cap: MAX_FREE_SPINS_PER_ROUND,
    })
    expect(result.nextState?.freeSpinsTotal).toBe(MAX_FREE_SPINS_PER_ROUND)
  })

  it('상한에 닿으면 한 회도 얹지 않고 라운드를 끝낸다', () => {
    const result = retriggerAt(MAX_FREE_SPINS_PER_ROUND)
    expect(result.features.some((feature) => feature.type === 'freeSpins')).toBe(false)
    expect(result.features).toContainEqual({
      type: 'freeSpinsCapped',
      requested: 5,
      granted: 0,
      cap: MAX_FREE_SPINS_PER_ROUND,
    })
    // 남은 1회를 이 스핀이 소진했으므로 라운드가 여기서 끝난다.
    expect(result.nextState).toBeUndefined()
  })

  it('예외를 던지지 않는다. 라운드는 반드시 끝나야 한다', () => {
    expect(() => retriggerAt(MAX_FREE_SPINS_PER_ROUND)).not.toThrow()
  })
})
