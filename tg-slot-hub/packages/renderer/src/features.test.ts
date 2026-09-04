import { describe, expect, it } from 'vitest'
import type { FeatureTrigger } from '@tgslot/shared'
import { findFreeSpins, isFreeSpinsTrigger, isScatterWinTrigger, scatterPositions } from './features.js'

const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }
const scatterWin: FeatureTrigger = {
  type: 'scatterWin',
  symbol: 'scatter',
  count: 3,
  win: 200,
  positions: [
    [0, 0],
    [2, 1],
    [4, 2],
  ],
}

describe('피처 구분', () => {
  it('종류를 정확히 가른다', () => {
    expect(isFreeSpinsTrigger(freeSpins)).toBe(true)
    expect(isFreeSpinsTrigger(scatterWin)).toBe(false)
    expect(isScatterWinTrigger(scatterWin)).toBe(true)
    expect(isScatterWinTrigger(freeSpins)).toBe(false)
  })

  it('프리스핀 트리거를 찾아낸다', () => {
    expect(findFreeSpins([scatterWin, freeSpins])).toBe(freeSpins)
  })

  it('없으면 null이다', () => {
    expect(findFreeSpins([scatterWin])).toBeNull()
    expect(findFreeSpins([])).toBeNull()
    expect(findFreeSpins()).toBeNull()
  })
})

describe('scatterPositions', () => {
  it('스캐터 좌표를 모두 모은다', () => {
    expect(scatterPositions([scatterWin])).toEqual([
      [0, 0],
      [2, 1],
      [4, 2],
    ])
  })

  it('프리스핀만 있으면 좌표가 없다', () => {
    expect(scatterPositions([freeSpins])).toEqual([])
  })

  it('피처가 없으면 빈 배열이다', () => {
    expect(scatterPositions()).toEqual([])
    expect(scatterPositions([])).toEqual([])
  })

  it('스캐터 트리거가 여러 개면 전부 합친다', () => {
    const second: FeatureTrigger = { ...scatterWin, positions: [[1, 1]] }
    expect(scatterPositions([scatterWin, second])).toHaveLength(4)
  })
})
