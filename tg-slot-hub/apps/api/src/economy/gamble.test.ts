import { describe, expect, it } from 'vitest'
import { isGambleEligible } from './gamble.js'

const config = { type: 'coin-flip' as const, chance: 0.5, payout: 2, maxSteps: 5 }

describe('isGambleEligible', () => {
  it('유료 스핀 당첨에만 열린다', () => {
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 40, totalBet: 40, config })).toBe(true)
    expect(isGambleEligible({ isFreeSpin: true, totalWin: 40, totalBet: 40, config })).toBe(false)
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 0, totalBet: 40, config })).toBe(false)
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 40, totalBet: 40 })).toBe(false)
  })

  it('프리스핀을 여는 유료 스핀은 열지 않는다(진입 팝업 뒤 받기/더블 방지)', () => {
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 40, totalBet: 40, config, opensFreeSpins: true })).toBe(false)
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 40, totalBet: 40, config, opensFreeSpins: false })).toBe(true)
  })

  it('베팅보다 적은 당첨(순손실 판)에는 열지 않는다', () => {
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 20, totalBet: 40, config })).toBe(false)
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 39, totalBet: 40, config })).toBe(false)
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 40, totalBet: 40, config })).toBe(true)
    expect(isGambleEligible({ isFreeSpin: false, totalWin: 80, totalBet: 40, config })).toBe(true)
  })
})
