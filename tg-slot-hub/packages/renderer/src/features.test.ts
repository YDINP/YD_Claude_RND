import { describe, expect, it } from 'vitest'
import type { FeatureTrigger } from '@tgslot/shared'
import {
  findFreeSpins,
  formatFreeSpinsPlaque,
  isFreeSpinsTrigger,
  isScatterWinTrigger,
  scatterPositions,
  shouldShowFreeSpinsPlaque,
} from './features.js'

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

describe('formatFreeSpinsPlaque', () => {
  it('남은 횟수와 전체를 보여준다', () => {
    expect(formatFreeSpinsPlaque({ left: 7, total: 10, multiplier: 1 })).toBe('FREE SPINS 7/10')
  })

  it('배수가 1보다 크면 붙인다', () => {
    expect(formatFreeSpinsPlaque({ left: 3, total: 10, multiplier: 2 })).toBe('FREE SPINS 3/10 ×2')
  })

  it('배수 1은 붙이지 않는다', () => {
    // ×1은 정보가 없고 시야만 어지럽힌다.
    expect(formatFreeSpinsPlaque({ left: 1, total: 1, multiplier: 1 })).not.toContain('×')
  })

  it('마지막 한 번도 정상 표기다', () => {
    expect(formatFreeSpinsPlaque({ left: 0, total: 10, multiplier: 3 })).toBe('FREE SPINS 0/10 ×3')
  })
})

describe('shouldShowFreeSpinsPlaque', () => {
  const mode = { freeSpins: { left: 5, total: 10, multiplier: 2 } }

  it('프리스핀 중이고 옵션이 켜져 있으면 띄운다', () => {
    expect(shouldShowFreeSpinsPlaque(mode, true)).toBe(true)
  })

  it('옵션을 끄면 띄우지 않는다', () => {
    expect(shouldShowFreeSpinsPlaque(mode, false)).toBe(false)
  })

  it('프리스핀이 아니면 띄우지 않는다', () => {
    expect(shouldShowFreeSpinsPlaque({ freeSpins: null }, true)).toBe(false)
    expect(shouldShowFreeSpinsPlaque({}, true)).toBe(false)
  })
})
