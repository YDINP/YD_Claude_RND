import { describe, expect, it } from 'vitest'
import { buildGrid, createSeededRng, evaluate, getBetPerLine, spin } from '@tgslot/slot-engine'
import { normalizePosition, reelStripWindow, spinTargetPosition, stopsToGrid, symbolAt, wrapIndex } from './grid.js'
import { loadGameMath } from './testSupport.js'

const math = loadGameMath('classic-777')

function randomStops(seed: number, count: number): number[][] {
  const rng = createSeededRng(seed)
  const all: number[][] = []
  for (let i = 0; i < count; i += 1) {
    const stops: number[] = []
    for (let reel = 0; reel < math.reels; reel += 1) {
      stops.push(rng.nextInt(math.strips[reel]?.length ?? 1))
    }
    all.push(stops)
  }
  return all
}

describe('wrapIndex', () => {
  it('음수 인덱스를 스트립 끝으로 감는다', () => {
    expect(wrapIndex(-1, 8)).toBe(7)
    expect(wrapIndex(-9, 8)).toBe(7)
    expect(wrapIndex(8, 8)).toBe(0)
    expect(wrapIndex(3, 8)).toBe(3)
  })

  it('길이가 0 이하면 던진다', () => {
    expect(() => wrapIndex(0, 0)).toThrow(RangeError)
  })
})

describe('stopsToGrid', () => {
  it('무작위 정지 위치 300개에서 엔진 buildGrid와 완전히 같다', () => {
    const cases = randomStops(0xc0ffee, 300)
    for (const stops of cases) {
      expect(stopsToGrid(math, stops)).toEqual(buildGrid(math, stops))
    }
  })

  it('경계 정지 위치(0, 마지막 칸)에서도 엔진과 같다', () => {
    const lengths = math.strips.map((strip) => strip.length)
    const boundary: number[][] = [
      [0, 0, 0],
      lengths.map((len) => len - 1),
      lengths.map((len) => len - 2),
      [0, lengths[1] === undefined ? 0 : lengths[1] - 1, 1],
    ]
    for (const stops of boundary) {
      expect(stopsToGrid(math, stops)).toEqual(buildGrid(math, stops))
    }
  })

  it('그리드를 evaluate에 넣으면 엔진 스핀 결과와 배당이 일치한다', () => {
    const totalBet = 10
    const betPerLine = getBetPerLine(math, totalBet)
    const rng = createSeededRng(20260902)
    for (let i = 0; i < 200; i += 1) {
      const result = spin(math, { totalBet }, rng)
      const grid = stopsToGrid(math, result.stops)
      expect(grid).toEqual(result.grid)
      const evaluated = evaluate(grid, math, betPerLine)
      expect(evaluated.totalWin).toBe(result.totalWin)
      expect(evaluated.wins).toEqual(result.wins)
    }
  })

  it('stops 개수가 릴 수와 다르면 던진다', () => {
    expect(() => stopsToGrid(math, [0, 0])).toThrow(RangeError)
  })
})

describe('symbolAt / reelStripWindow', () => {
  it('오버스캔 행 -1과 rows도 스트립을 감아서 읽는다', () => {
    const strip = math.strips[0]
    if (strip === undefined) throw new Error('스트립 없음')
    expect(symbolAt(math, 0, 0, -1)).toBe(strip[strip.length - 1])
    expect(symbolAt(math, 0, 0, math.rows)).toBe(strip[math.rows])
  })

  it('윈도는 rows + 2개이고 가운데가 보이는 행과 같다', () => {
    const stop = 17
    const window = reelStripWindow(math, 1, stop)
    expect(window).toHaveLength(math.rows + 2)
    const grid = stopsToGrid(math, [0, stop, 0])
    for (let row = 0; row < math.rows; row += 1) {
      expect(window[row + 1]).toBe(grid[row]?.[1])
    }
  })
})

describe('spinTargetPosition', () => {
  const length = 32

  it('목표 위치는 언제나 stop과 나머지가 같다', () => {
    for (const current of [0, 3.4, 17, 31.99]) {
      for (const stop of [0, 1, 15, 31]) {
        const target = spinTargetPosition(current, stop, length, 3)
        expect(normalizePosition(target, length)).toBeCloseTo(stop, 10)
      }
    }
  })

  it('최소 회전 바퀴 수만큼은 반드시 아래로 흐른다', () => {
    const current = 5
    const revolutions = 4
    const target = spinTargetPosition(current, 5, length, revolutions)
    expect(current - target).toBeGreaterThanOrEqual(revolutions * length)
    expect(current - target).toBeLessThan((revolutions + 1) * length)
  })

  it('바퀴 수가 늘면 이동 거리도 단조증가한다', () => {
    const distances = [1, 2, 3, 4, 5].map((rev) => 9 - spinTargetPosition(9, 2, length, rev))
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i] ?? 0).toBeGreaterThan(distances[i - 1] ?? 0)
    }
  })
})

describe('normalizePosition', () => {
  it('음수와 초과 위치를 스트립 범위 안으로 넣는다', () => {
    expect(normalizePosition(-1, 32)).toBe(31)
    expect(normalizePosition(32, 32)).toBe(0)
    expect(normalizePosition(-0.25, 32)).toBeCloseTo(31.75, 10)
  })
})

describe('spinTargetPosition 0바퀴 (스킵 경로)', () => {
  const length = 32

  it('한 바퀴도 돌지 않고 남은 거리만 간다', () => {
    // 9에서 2로 가는 데 7칸이면 충분하다. 스트립 전체를 다시 돌 이유가 없다.
    expect(9 - spinTargetPosition(9, 2, length, 0)).toBeCloseTo(7, 10)
  })

  it('이동 거리가 스트립 길이보다 짧다', () => {
    for (const [from, stop] of [
      [0, 31],
      [5, 5],
      [17, 3],
      [31.5, 0],
    ]) {
      const distance = (from ?? 0) - spinTargetPosition(from ?? 0, stop ?? 0, length, 0)
      expect(distance).toBeGreaterThanOrEqual(0)
      expect(distance).toBeLessThan(length)
    }
  })

  it('이미 정지 위치면 움직이지 않는다', () => {
    expect(spinTargetPosition(7, 7, length, 0)).toBeCloseTo(7, 10)
  })

  it('그래도 목표는 정확히 정지 위치다', () => {
    for (const stop of [0, 1, 15, 31]) {
      expect(normalizePosition(spinTargetPosition(11.4, stop, length, 0), length)).toBeCloseTo(stop, 10)
    }
  })

  it('한 바퀴짜리보다 언제나 가깝다', () => {
    const zero = 9 - spinTargetPosition(9, 2, length, 0)
    const one = 9 - spinTargetPosition(9, 2, length, 1)
    expect(zero).toBeLessThan(one)
    expect(one - zero).toBeCloseTo(length, 10)
  })
})
