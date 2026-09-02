import { describe, expect, it } from 'vitest'
import { createSeededRng, getBetPerLine, spin, type WinLine } from '@tgslot/slot-engine'
import { BIG_WIN_BET_MULTIPLIER, WIN_CYCLE_MS } from './constants.js'
import { buildWinCycle, formatWinLabel, isBigWin, paylineColor, totalWinOf, winBetMultiple } from './wins.js'
import { loadGameMath } from './testSupport.js'

const math = loadGameMath('classic-777')

function makeWin(line: number, win: number, multiplier: number): WinLine {
  return {
    line,
    symbol: 'seven',
    count: 3,
    multiplier,
    win,
    positions: [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  }
}

describe('totalWinOf', () => {
  it('라인 배당을 모두 더한다', () => {
    expect(totalWinOf([makeWin(0, 20, 10), makeWin(1, 6, 3)])).toBe(26)
  })

  it('승리가 없으면 0이다', () => {
    expect(totalWinOf([])).toBe(0)
  })
})

describe('winBetMultiple', () => {
  it('totalBet을 주면 총배당 / 베팅액이다', () => {
    expect(winBetMultiple([makeWin(0, 240, 120)], math, 10)).toBe(24)
  })

  it('totalBet이 없으면 라인 배수 합 / 라인 수로 같은 값을 낸다', () => {
    expect(winBetMultiple([makeWin(0, 240, 120)], math)).toBe(24)
  })

  it('엔진이 만든 실제 스핀에서 두 계산이 일치한다', () => {
    const totalBet = 50
    const betPerLine = getBetPerLine(math, totalBet)
    const rng = createSeededRng(7777)
    let checked = 0
    for (let i = 0; i < 3000 && checked < 60; i += 1) {
      const result = spin(math, { totalBet }, rng)
      if (result.wins.length === 0) continue
      checked += 1
      expect(totalWinOf(result.wins)).toBe(result.totalWin)
      expect(winBetMultiple(result.wins, math)).toBeCloseTo(winBetMultiple(result.wins, math, totalBet), 9)
      expect(result.totalWin).toBe(
        result.wins.reduce((sum, win) => sum + win.multiplier * betPerLine, 0),
      )
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('isBigWin', () => {
  it('기준 배수 이상이면 빅윈이다', () => {
    const atThreshold = makeWin(0, 10 * BIG_WIN_BET_MULTIPLIER, 100)
    expect(isBigWin([atThreshold], math, 10)).toBe(true)
  })

  it('기준 바로 아래면 빅윈이 아니다', () => {
    expect(isBigWin([makeWin(0, 10 * BIG_WIN_BET_MULTIPLIER - 1, 99.9)], math, 10)).toBe(false)
  })

  it('승리가 없으면 빅윈이 아니다', () => {
    expect(isBigWin([], math, 10)).toBe(false)
  })

  it('기준을 직접 넘길 수 있다', () => {
    expect(isBigWin([makeWin(0, 50, 25)], math, 10, 5)).toBe(true)
    expect(isBigWin([makeWin(0, 50, 25)], math, 10, 6)).toBe(false)
  })
})

describe('paylineColor', () => {
  const palette = ['#a', '#b', '#c']

  it('라인 인덱스를 팔레트 길이로 감아 고른다', () => {
    expect(paylineColor(palette, 0)).toBe('#a')
    expect(paylineColor(palette, 4)).toBe('#b')
    expect(paylineColor(palette, -1)).toBe('#c')
  })

  it('팔레트가 비면 던진다', () => {
    expect(() => paylineColor([], 0)).toThrow(RangeError)
  })
})

describe('buildWinCycle', () => {
  it('라인마다 한 스텝을 만들고 시각이 주기만큼 벌어진다', () => {
    const wins = [makeWin(0, 10, 5), makeWin(2, 20, 10), makeWin(4, 30, 15)]
    const cycle = buildWinCycle(wins)
    expect(cycle).toHaveLength(3)
    expect(cycle.map((step) => step.atMs)).toEqual([0, WIN_CYCLE_MS, WIN_CYCLE_MS * 2])
    expect(cycle.map((step) => step.win.line)).toEqual([0, 2, 4])
  })

  it('주기를 바꿀 수 있다', () => {
    expect(buildWinCycle([makeWin(0, 1, 1), makeWin(1, 1, 1)], 400)[1]?.atMs).toBe(400)
  })
})

describe('formatWinLabel', () => {
  it('부호와 천 단위 구분을 붙인다', () => {
    expect(formatWinLabel(makeWin(0, 1234, 617))).toBe('+1,234')
    expect(formatWinLabel(makeWin(0, 7, 7))).toBe('+7')
  })
})
