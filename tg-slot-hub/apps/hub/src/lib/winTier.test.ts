import { describe, expect, it } from 'vitest'
import { resolveWinTier, winTierLabelKey, WIN_HOLD_MS } from './winTier'

describe('winTierLabelKey', () => {
  it('maps "none" to the plain WIN label', () => {
    expect(winTierLabelKey('none')).toBe('winPlain')
  })

  it('maps "big" to the BIG WIN label', () => {
    expect(winTierLabelKey('big')).toBe('winBig')
  })

  it('maps "mega" to the MEGA WIN label', () => {
    expect(winTierLabelKey('mega')).toBe('winMega')
  })

  it('maps "epic" to the EPIC WIN label', () => {
    expect(winTierLabelKey('epic')).toBe('winEpic')
  })

  it('maps "max" to the MAX WIN label', () => {
    expect(winTierLabelKey('max')).toBe('winMax')
  })
})

describe('resolveWinTier', () => {
  it('trusts a valid tier from the renderer event over the local multiple', () => {
    // 렌더러 값이 우선 — 로컬 계산과 안 맞아도 이벤트 쪽을 믿는다.
    expect(resolveWinTier('epic', 1)).toBe('epic')
  })

  it('falls back to a local calculation when the event tier is missing', () => {
    expect(resolveWinTier(undefined, 15)).toBe('big')
  })

  it('falls back to a local calculation when the event tier is not a known value', () => {
    expect(resolveWinTier('not-a-tier', 15)).toBe('big')
  })

  describe('fallback thresholds', () => {
    it('is "none" just under the big threshold (9x)', () => {
      expect(resolveWinTier(null, 9)).toBe('none')
    })

    it('is "big" at exactly 10x', () => {
      expect(resolveWinTier(null, 10)).toBe('big')
    })

    it('is "mega" at exactly 20x', () => {
      expect(resolveWinTier(null, 20)).toBe('mega')
    })

    it('is "epic" at exactly 50x', () => {
      expect(resolveWinTier(null, 50)).toBe('epic')
    })

    it('is "max" at exactly 100x', () => {
      expect(resolveWinTier(null, 100)).toBe('max')
    })

    it('stays "max" well above the threshold', () => {
      expect(resolveWinTier(null, 500)).toBe('max')
    })
  })
})

describe('WIN_HOLD_MS', () => {
  it('escalates with tier: big < mega < epic < max', () => {
    expect(WIN_HOLD_MS.big).toBe(2000)
    expect(WIN_HOLD_MS.mega).toBe(3000)
    expect(WIN_HOLD_MS.epic).toBe(4500)
    expect(WIN_HOLD_MS.max).toBe(6500)
    expect(WIN_HOLD_MS.big).toBeLessThan(WIN_HOLD_MS.mega)
    expect(WIN_HOLD_MS.mega).toBeLessThan(WIN_HOLD_MS.epic)
    expect(WIN_HOLD_MS.epic).toBeLessThan(WIN_HOLD_MS.max)
  })
})
