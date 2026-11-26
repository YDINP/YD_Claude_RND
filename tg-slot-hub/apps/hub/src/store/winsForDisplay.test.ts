import { describe, expect, it } from 'vitest'
import type { FeatureTrigger, WinLine } from '@tgslot/shared'
import { freeSpinMultiplierOf, winsForDisplay } from './game'

const line = (win: number): WinLine => ({ line: 0, symbol: 'grape', count: 3, multiplier: 5, win, positions: [] })
const scatter: FeatureTrigger = { type: 'scatterWin', symbol: 'scatter', count: 3, win: 40, positions: [] }

describe('프리스핀 배수를 당첨 표시에 반영', () => {
  it('배수 2면 라인 금액과 스캐터 배당을 두 배로 보여 준다(서버 totalWin과 같아진다)', () => {
    const result = { wins: [line(30), line(45)], features: [scatter] }
    const shown = winsForDisplay(result, 2)
    expect(shown.wins.map((w) => w.win)).toEqual([60, 90])
    expect(shown.features[0]).toMatchObject({ type: 'scatterWin', win: 80 })
    // 원본은 그대로다.
    expect(result.wins[0]?.win).toBe(30)
  })

  it('배수 1이거나 연쇄 팩이면 원본을 그대로 쓴다', () => {
    const result = { wins: [line(30)], features: [] }
    expect(winsForDisplay(result, 1).wins).toBe(result.wins)
    const cascade = { ...result, cascades: [{ removed: [], wins: [], ladder: 1 }] as never }
    expect(winsForDisplay(cascade, 2).wins).toBe(result.wins)
  })

  it('결과만으로 배수를 되짚는다', () => {
    const base = { wins: [line(75)], features: [], cascades: undefined, orderWin: undefined }
    expect(freeSpinMultiplierOf({ ...base, isFreeSpin: true, totalWin: 150 })).toBe(2)
    expect(freeSpinMultiplierOf({ ...base, isFreeSpin: false, totalWin: 75 })).toBe(1)
    expect(freeSpinMultiplierOf({ ...base, wins: [], isFreeSpin: true, totalWin: 0 })).toBe(1)
  })
})
