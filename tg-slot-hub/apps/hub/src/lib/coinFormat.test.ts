import { describe, expect, it } from 'vitest'
import { formatCoinAmount } from './coinFormat'

describe('코인 압축 표기', () => {
  it('ko: 1만 미만은 쉼표, 1만 이상은 «만»', () => {
    expect(formatCoinAmount(0, 'ko')).toBe('0')
    expect(formatCoinAmount(40, 'ko')).toBe('40')
    expect(formatCoinAmount(2500, 'ko')).toBe('2,500')
    expect(formatCoinAmount(9999, 'ko')).toBe('9,999')
    expect(formatCoinAmount(10000, 'ko')).toBe('1만')
    expect(formatCoinAmount(20000, 'ko')).toBe('2만')
    expect(formatCoinAmount(15000, 'ko')).toBe('1.5만')
    expect(formatCoinAmount(12500, 'ko')).toBe('1.25만')
    expect(formatCoinAmount(1_000_000, 'ko')).toBe('100만')
    expect(formatCoinAmount(100_000_000, 'ko')).toBe('1억')
  })

  it('en: K/M 표기', () => {
    expect(formatCoinAmount(500, 'en')).toBe('500')
    expect(formatCoinAmount(2500, 'en')).toBe('2.5K')
    expect(formatCoinAmount(1000, 'en')).toBe('1K')
    expect(formatCoinAmount(20000, 'en')).toBe('20K')
    expect(formatCoinAmount(12500, 'en')).toBe('12.5K')
    expect(formatCoinAmount(124000, 'en')).toBe('124K')
    expect(formatCoinAmount(1_000_000, 'en')).toBe('1M')
    expect(formatCoinAmount(1_500_000, 'en')).toBe('1.5M')
  })

  it('베팅 레벨 × 코인 배수 전부가 5글자 안에 든다(코인 폭의 80% 안)', () => {
    const bets = [20, 40, 100, 200, 500, 1000]
    // 숫자 코인 ×1~×10, 감기 ×2, 보물 ×20·×50·×200, 최고 보물 ×1000(띠).
    const values = [1, 2, 3, 5, 10, 2, 4, 6, 10, 20, 20, 50, 200, 1000]
    for (const bet of bets) {
      for (const value of values) {
        for (const locale of ['ko', 'en'] as const) {
          const label = formatCoinAmount(bet * value, locale)
          expect(label.length, `${bet}×${value} ${locale} → ${label}`).toBeLessThanOrEqual(5)
        }
      }
    }
  })

  it('음수·소수는 0 이상 정수로 다듬는다', () => {
    expect(formatCoinAmount(-5, 'ko')).toBe('0')
    expect(formatCoinAmount(40.4, 'en')).toBe('40')
  })
})
