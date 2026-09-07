/**
 * 승리 축하 연출 테스트 — 일반 스핀의 빅윈 오버레이와 프리스핀 종료 팝업이 **같은 표**를
 * 쓴다는 것이 이 파일의 요지다.
 *
 * 세 갈래로 나눠 본다:
 *  1. `winTiers.ts` — 등급 경계, 타임라인(롤업/체류/서두름), 파티클 배열. 렌더 없이 순수하게.
 *  2. `WinCelebrationFx` / `WinCelebration` — 등급별 강도와 라벨 오버라이드.
 *  3. `WinCelebrationOverlay` — 10× 미만은 뜨지 않는다, 체류 시간이 지나면 스스로 닫힌다,
 *     굴러가는 중의 탭은 감기 · 그 뒤의 탭은 닫기.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { WinCelebration, WinCelebrationFx, useWinRollup } from './WinCelebration'
import { WinCelebrationOverlay } from './WinCelebrationOverlay'
import {
  BIG_WIN_EMPHASIS_MS,
  BIG_WIN_HURRIED_HOLD_MS,
  BIG_WIN_ROLLUP_MAX_MS,
  BIG_WIN_ROLLUP_MIN_MS,
  CELEBRATION_TIER_MULTIPLIERS,
  COUNT_UP_MS,
  ENTRY_SPARKLES,
  HURRIED_SCALE,
  NAMED_TIERS,
  REDUCED_ROLLUP_MS,
  ROLLUP_MS_BY_TIER,
  SHOCKWAVE_COUNT_BY_TIER,
  SHOWER_COUNT_BY_TIER,
  SPARKLE_COUNT,
  bigWinRollupMs,
  bigWinTimeline,
  celebrationTier,
  celebrationTiming,
  countUpMs,
  digitCount,
  overrideLabel,
  rollupValue,
  shockwaveDelays,
  showerCoins,
} from './winTiers'
import { ROUND_POPUP_AUTO_CLOSE_MS } from '../../game/roundFlow'
import { useSettingsStore } from '../../store/settings'

function amountText(): string {
  return screen.getByTestId('win-amount').textContent ?? ''
}

describe('winTiers (pure)', () => {
  describe('celebrationTier', () => {
    it('lands exactly on each documented boundary (10/20/50/100× total bet)', () => {
      const bet = 100
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.surge * bet, bet)).toBe('surge')
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.blast * bet, bet)).toBe('blast')
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.storm * bet, bet)).toBe('storm')
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.cataclysm * bet, bet)).toBe('cataclysm')
    })

    it('stays one tier lower just under each boundary', () => {
      const bet = 100
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.surge * bet - 1, bet)).toBe('none')
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.blast * bet - 1, bet)).toBe('surge')
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.storm * bet - 1, bet)).toBe('blast')
      expect(celebrationTier(CELEBRATION_TIER_MULTIPLIERS.cataclysm * bet - 1, bet)).toBe('storm')
    })

    it('never guesses a denominator — no bet, zero bet, or no win stays none', () => {
      expect(celebrationTier(999_999, undefined)).toBe('none')
      expect(celebrationTier(999_999, 0)).toBe('none')
      expect(celebrationTier(999_999, -20)).toBe('none')
      expect(celebrationTier(0, 10)).toBe('none')
    })
  })

  describe('celebrationTiming (프리스핀 종료 팝업 — 등급이 길이를 정한다)', () => {
    it('climbs the roll-up with the tier — 1.2s → 2.0s', () => {
      const lengths = NAMED_TIERS.map((tier) => ROLLUP_MS_BY_TIER[tier])
      expect(lengths).toEqual([1400, 1600, 1800, 2000])
      expect([...lengths].sort((a, b) => a - b)).toEqual(lengths)
      expect(ROLLUP_MS_BY_TIER.none).toBe(1200)
      expect(NAMED_TIERS.map((tier) => celebrationTiming(tier).rollupMs)).toEqual(lengths)
    })

    it('halves the roll-up while autospin or free spins are running', () => {
      for (const tier of NAMED_TIERS) {
        expect(celebrationTiming(tier, { hurried: true }).rollupMs).toBe(
          Math.round(celebrationTiming(tier).rollupMs * HURRIED_SCALE),
        )
      }
    })

    it('shortens the roll-up under reduced motion', () => {
      expect(celebrationTiming('cataclysm', { reducedMotion: true }).rollupMs).toBe(REDUCED_ROLLUP_MS)
    })

    it('gives the entry count-up a fixed length', () => {
      expect(countUpMs(false)).toBe(COUNT_UP_MS)
      expect(countUpMs(true)).toBe(REDUCED_ROLLUP_MS)
    })
  })

  describe('bigWinTimeline (빅윈 오버레이 — 금액이 길이를 정한다)', () => {
    const bet = 100

    it('makes a 10× and a 200× win take visibly different lengths — the whole point of the change', () => {
      const small = bigWinTimeline(10 * bet, bet).rollupMs
      const large = bigWinTimeline(200 * bet, bet).rollupMs
      expect(small).toBe(BIG_WIN_ROLLUP_MIN_MS)
      expect(large).toBeGreaterThan(small * 2)
      // 등급이 아니라 «금액»이 길이를 정한다 — 같은 CATACLYSM(≥100×) 안에서도 갈린다.
      expect(celebrationTier(200 * bet, bet)).toBe(celebrationTier(400 * bet, bet))
      expect(bigWinTimeline(400 * bet, bet).rollupMs).toBeGreaterThan(large)
    })

    it('rises monotonically with the multiple and is bounded at both ends', () => {
      const multiples = [10, 20, 50, 100, 200, 500, 1000, 5000]
      const lengths = multiples.map((m) => bigWinTimeline(m * bet, bet).rollupMs)
      expect([...lengths].sort((a, b) => a - b)).toEqual(lengths)
      expect(lengths[0]).toBe(BIG_WIN_ROLLUP_MIN_MS)
      // 500× 이상은 전부 상한을 나눠 갖는다 — 한 판이 오버레이만 1분 붙드는 일은 없다.
      expect(bigWinTimeline(500 * bet, bet).rollupMs).toBe(BIG_WIN_ROLLUP_MAX_MS)
      expect(bigWinTimeline(5000 * bet, bet).rollupMs).toBe(BIG_WIN_ROLLUP_MAX_MS)
    })

    it('never guesses a denominator — an unknown or zero bet falls back to the shortest roll-up', () => {
      expect(bigWinTimeline(999_999, 0).rollupMs).toBe(BIG_WIN_ROLLUP_MIN_MS)
      expect(bigWinRollupMs(999_999, -1)).toBe(BIG_WIN_ROLLUP_MIN_MS)
    })

    it('holds the result for the same 10s the free-spins ceremony popup uses', () => {
      expect(bigWinTimeline(50 * bet, bet)).toEqual({
        rollupMs: bigWinRollupMs(50 * bet, bet),
        emphasisMs: BIG_WIN_EMPHASIS_MS,
        holdMs: ROUND_POPUP_AUTO_CLOSE_MS,
      })
      // 강조는 사용자가 요구한 "2~3초" 안에 있다.
      expect(BIG_WIN_EMPHASIS_MS).toBeGreaterThanOrEqual(2000)
      expect(BIG_WIN_EMPHASIS_MS).toBeLessThanOrEqual(3000)
    })

    it('never stalls an autospin run — hurried shrinks the roll-up/emphasis and swaps the 10s hold for a short one', () => {
      const normal = bigWinTimeline(500 * bet, bet)
      const hurried = bigWinTimeline(500 * bet, bet, { hurried: true })
      expect(hurried.rollupMs).toBe(Math.round(normal.rollupMs * HURRIED_SCALE))
      expect(hurried.emphasisMs).toBe(Math.round(normal.emphasisMs * HURRIED_SCALE))
      expect(hurried.holdMs).toBe(BIG_WIN_HURRIED_HOLD_MS)
      // 최악의 경우(500× + 서두름)에도 한 판이 오버레이에 붙들리는 시간은 6초를 넘지 않는다 —
      // "판 간격이 20초를 넘겨 멈춘 것처럼 보인다"는 예전 결함으로 되돌아가지 않는다.
      expect(hurried.rollupMs + hurried.emphasisMs + hurried.holdMs).toBeLessThan(6000)
    })

    it('collapses the roll-up under reduced motion — length can no longer carry the amount', () => {
      expect(bigWinTimeline(500 * bet, bet, { reducedMotion: true }).rollupMs).toBe(REDUCED_ROLLUP_MS)
    })
  })

  describe('rollupValue / digitCount', () => {
    it('starts at zero, ends exactly on the target, and clamps outside 0..1', () => {
      expect(rollupValue(4820, 0)).toBe(0)
      expect(rollupValue(4820, 1)).toBe(4820)
      expect(rollupValue(4820, -0.5)).toBe(0)
      expect(rollupValue(4820, 3)).toBe(4820)
    })

    it('eases out — past halfway by the time half the clock is gone', () => {
      // 1 - (1 - 0.5)^3 = 0.875
      expect(rollupValue(1000, 0.5)).toBe(875)
      expect(rollupValue(1000, 0.25)).toBe(578)
      expect(rollupValue(1000, 0.9)).toBe(999)
    })

    it('counts digits so the pulse fires on 9→10, not on every frame', () => {
      expect(digitCount(0)).toBe(1)
      expect(digitCount(9)).toBe(1)
      expect(digitCount(10)).toBe(2)
      expect(digitCount(1000)).toBe(4)
    })
  })

  describe('particles', () => {
    it('thickens the shower with the tier (12 → 28)', () => {
      expect(Object.values(SHOWER_COUNT_BY_TIER)).toEqual([12, 16, 20, 24, 28])
      expect(showerCoins('none')).toHaveLength(12)
      expect(showerCoins('cataclysm')).toHaveLength(28)
    })

    it('hands back the same array (and the same coins) every call — built once at module load', () => {
      expect(showerCoins('blast')).toBe(showerCoins('blast'))
      // 낮은 등급은 높은 등급의 접두사다 — 같은 객체를 잘라 쓰기 때문이다.
      expect(showerCoins('none')[0]).toBe(showerCoins('cataclysm')[0])
      expect(showerCoins('none')[11]).toBe(showerCoins('cataclysm')[11])
    })

    it('spreads any prefix across the width instead of bunching on one side', () => {
      for (const tier of ['none', 'blast', 'cataclysm'] as const) {
        const lefts = showerCoins(tier).map((c) => c.left)
        expect(new Set(lefts).size).toBe(lefts.length)
        expect(lefts.filter((l) => l < 50).length).toBeGreaterThan(lefts.length / 3)
        expect(lefts.filter((l) => l >= 50).length).toBeGreaterThan(lefts.length / 3)
      }
    })

    it('starts the shockwaves at BLAST — SURGE rises instead of bursting', () => {
      expect(shockwaveDelays('none')).toHaveLength(0)
      expect(shockwaveDelays('surge')).toHaveLength(0)
      expect(shockwaveDelays('blast')).toHaveLength(SHOCKWAVE_COUNT_BY_TIER.blast)
      expect(shockwaveDelays('cataclysm')).toHaveLength(3)
      expect(shockwaveDelays('storm')).toBe(shockwaveDelays('storm'))
    })

    it('builds the entry sparkles once, spread around the full circle', () => {
      expect(ENTRY_SPARKLES).toHaveLength(SPARKLE_COUNT)
      const angles = ENTRY_SPARKLES.map((s) => s.angle)
      expect(new Set(angles).size).toBe(angles.length)
      expect(angles.filter((a) => a < 180).length).toBeGreaterThan(2)
      expect(angles.filter((a) => a >= 180).length).toBeGreaterThan(2)
    })
  })

  describe('overrideLabel', () => {
    it('prefers the game pack label and falls back to null so the hub default wins', () => {
      const labels = { storm: 'STAMPEDE' }
      expect(overrideLabel('storm', labels)).toBe('STAMPEDE')
      expect(overrideLabel('blast', labels)).toBeNull()
      expect(overrideLabel('storm', undefined)).toBeNull()
      expect(overrideLabel('none', labels)).toBeNull()
      // 빈 문자열은 "이름 없음"이지 이름이 아니다.
      expect(overrideLabel('surge', { surge: '  ' })).toBeNull()
    })
  })
})

describe('WinCelebrationFx', () => {
  it('renders rays for every tier and scales the shower and shockwaves with it', () => {
    const { container, rerender } = render(<WinCelebrationFx tier="surge" reducedMotion={false} />)

    expect(container.querySelector('.hub-win-fx__rays')).toBeInTheDocument()
    expect(container.querySelectorAll('.hub-win-fx__coin')).toHaveLength(SHOWER_COUNT_BY_TIER.surge)
    // SURGE는 터지지 않고 밀려 올라온다 — 고리가 없다.
    expect(container.querySelector('.hub-win-fx__wave')).toBeNull()

    rerender(<WinCelebrationFx tier="cataclysm" reducedMotion={false} />)
    expect(container.querySelectorAll('.hub-win-fx__coin')).toHaveLength(SHOWER_COUNT_BY_TIER.cataclysm)
    expect(container.querySelectorAll('.hub-win-fx__wave')).toHaveLength(3)
    expect(container.querySelector('.hub-win-fx')?.className).toContain('hub-tier--cataclysm')
  })

  it('drops the shower when the caller asks for none (entry popup uses sparkles instead)', () => {
    const { container } = render(<WinCelebrationFx tier="none" reducedMotion={false} shower={false} />)
    expect(container.querySelector('.hub-win-fx__rays')).toBeInTheDocument()
    expect(container.querySelector('.hub-win-fx__coin')).toBeNull()
  })

  it('renders nothing at all under reduced motion', () => {
    const { container } = render(<WinCelebrationFx tier="cataclysm" reducedMotion />)
    expect(container.innerHTML).toBe('')
  })
})

describe('WinCelebration', () => {
  it('uses the hub tier name by default and the game pack override when given', () => {
    const { rerender } = render(<WinCelebration tier="storm" value={0} reducedMotion={false} />)
    expect(screen.getByText('STORM')).toBeInTheDocument()

    rerender(
      <WinCelebration
        tier="storm"
        value={0}
        reducedMotion={false}
        labels={{ storm: 'STAMPEDE', cataclysm: 'OUTLAW LEGEND' }}
      />,
    )
    expect(screen.getByText('STAMPEDE')).toBeInTheDocument()
    expect(screen.queryByText('STORM')).not.toBeInTheDocument()
  })

  it('falls back to the plain title when there is no tier, and omits the title if none is given', () => {
    const { container, rerender } = render(
      <WinCelebration tier="none" value={12} plainTitle="FREE SPINS!" unit="SPINS" reducedMotion={false} />,
    )
    expect(screen.getByText('FREE SPINS!')).toBeInTheDocument()
    expect(screen.getByText('SPINS')).toBeInTheDocument()
    expect(amountText()).toBe('12')

    rerender(<WinCelebration tier="none" value={12} reducedMotion={false} />)
    expect(container.querySelector('.hub-win__title')).toBeNull()
  })

  it('carries the tier in both the motion class and the palette class', () => {
    const { container } = render(<WinCelebration tier="blast" value={0} reducedMotion={false} />)
    const root = container.querySelector('.hub-win')?.className ?? ''
    expect(root).toContain('hub-win--blast')
    expect(root).toContain('hub-tier--blast')
    expect(root).not.toContain('hub-win--still')
  })
})

describe('WinCelebrationOverlay', () => {
  const baseProps = { totalWin: 4820, totalBet: 100, onDismiss: () => {} }

  beforeEach(() => {
    useSettingsStore.setState({ reducedMotion: false })
  })

  it('shows nothing below 10× — small wins belong to the WinStrip, not to a banner', () => {
    const { container } = render(<WinCelebrationOverlay totalWin={999} totalBet={100} onDismiss={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows nothing when the total bet is unknown — it never guesses a denominator', () => {
    const { container } = render(<WinCelebrationOverlay totalWin={999_999} onDismiss={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('rolls the amount up, names the tier, and announces the final amount once', async () => {
    const { container } = render(<WinCelebrationOverlay {...baseProps} />)

    // 4820 / 100 = 48.2× → BLAST
    expect(screen.getByText('BLAST')).toBeInTheDocument()
    expect(container.querySelectorAll('.hub-win-fx__coin')).toHaveLength(SHOWER_COUNT_BY_TIER.blast)

    const regions = container.querySelectorAll('[aria-live]')
    expect(regions).toHaveLength(1)
    expect(regions[0]?.textContent).toBe('')

    await waitFor(() => expect(amountText()).toBe('4,820'), { timeout: 4000 })
    await waitFor(() => expect(regions[0]?.textContent).toBe('Total win 4,820'), { timeout: 4000 })
  })

  it('jumps to the result on a tap while rolling — it does not close — and closes on the next tap', async () => {
    const onDismiss = vi.fn()
    const { container } = render(<WinCelebrationOverlay {...baseProps} onDismiss={onDismiss} />)

    expect(amountText()).not.toBe('4,820')
    expect(container.querySelector('.hub-win-overlay')).toHaveAttribute('data-beat', 'rolling')

    fireEvent.click(screen.getByRole('button'))
    expect(amountText()).toBe('4,820')
    // 사용자 요구: "빅윈연출 중 터치 시 팝업 결과로 바로 스킵. 닫기 아님."
    expect(onDismiss).not.toHaveBeenCalled()
    expect(container.querySelector('.hub-win-overlay')).toHaveAttribute('data-beat', 'emphasis')

    fireEvent.click(screen.getByRole('button'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(amountText()).toBe('4,820'))
  })

  it('runs the emphasis beat and only then starts the 10s hold', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      // 12000 / 100 = 120× → CATACLYSM. 롤업은 금액이 정하고, 그 뒤가 강조 → 유지다.
      const timing = bigWinTimeline(12_000, 100)
      const { container } = render(
        <WinCelebrationOverlay totalWin={12_000} totalBet={100} onDismiss={onDismiss} />,
      )

      // rAF가 없는 환경이면 백스톱 타이머가 롤업을 끝낸다 — 어느 쪽이든 목표에 닿는다.
      act(() => {
        vi.advanceTimersByTime(timing.rollupMs + 200)
      })
      expect(container.querySelector('.hub-win-overlay')).toHaveAttribute('data-beat', 'emphasis')
      expect(onDismiss).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(timing.emphasisMs)
      })
      expect(container.querySelector('.hub-win-overlay')).toHaveAttribute('data-beat', 'hold')

      act(() => {
        vi.advanceTimersByTime(ROUND_POPUP_AUTO_CLOSE_MS - 1)
      })
      expect(onDismiss).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts the auto-close window from the skip, not from mount — a skipped roll-up still gets the full read', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      // 500× — 그냥 두면 6초를 굴러야 하는 판을 곧장 감는다.
      render(<WinCelebrationOverlay totalWin={50_000} totalBet={100} onDismiss={onDismiss} />)

      act(() => {
        fireEvent.click(screen.getByRole('button'))
      })
      expect(amountText()).toBe('50,000')

      act(() => {
        vi.advanceTimersByTime(BIG_WIN_EMPHASIS_MS)
      })
      // 마운트에서 한 번 걸어 둔 시계였다면 여기(마운트 + 12.4초)서 이미 닫혔을 것이다(예전 결함).
      act(() => {
        vi.advanceTimersByTime(ROUND_POPUP_AUTO_CLOSE_MS - 1)
      })
      expect(onDismiss).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not stall an autospin run — the whole overlay is done in seconds while hurried', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      render(<WinCelebrationOverlay {...baseProps} hurried onDismiss={onDismiss} />)
      const timing = bigWinTimeline(baseProps.totalWin, baseProps.totalBet, { hurried: true })

      // 박자마다 한 번씩 — 각 단계의 시계는 앞 단계가 화면에 반영된 뒤에야 걸린다.
      act(() => {
        vi.advanceTimersByTime(timing.rollupMs + 200)
      })
      act(() => {
        vi.advanceTimersByTime(timing.emphasisMs)
      })
      act(() => {
        vi.advanceTimersByTime(BIG_WIN_HURRIED_HOLD_MS)
      })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('puts the tap hint outside the card, at the bottom of the takeover — not under the number on the game art', () => {
    const { container } = render(<WinCelebrationOverlay {...baseProps} />)

    const hint = container.querySelector('.hub-win-overlay__hint')
    expect(hint).toHaveTextContent('Tap to reveal')
    // 카드 안에 남아 있으면(예전 자리) 게임 프레임 아트와 겹쳐 읽히지 않는다.
    expect(container.querySelector('.hub-win .hub-win__hint')).toBeNull()
    expect(hint?.parentElement).toHaveClass('hub-win-overlay__tap')

    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('.hub-win-overlay__hint')).toHaveTextContent('Tap to close')
  })

  it('is a labelled modal dialog with a keyboard-reachable tap surface', () => {
    const { container } = render(<WinCelebrationOverlay {...baseProps} />)
    const dialog = container.querySelector('.hub-win-overlay')

    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog?.getAttribute('aria-labelledby')).toBe(
      container.querySelector('.hub-win__title')?.id,
    )
    expect(screen.getByRole('button')).toHaveFocus()
  })

  it('drops every particle and shortens the roll-up under reduced motion', async () => {
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<WinCelebrationOverlay {...baseProps} />)

    expect(container.querySelector('.hub-win-fx__coin')).toBeNull()
    expect(container.querySelector('.hub-win-fx__rays')).toBeNull()
    expect(container.querySelector('.hub-win')?.className).toContain('hub-win--still')
    await waitFor(() => expect(amountText()).toBe('4,820'), { timeout: 3000 })
  })
})

describe('useWinRollup', () => {
  function Probe({ target, duration }: { target: number; duration: number }): ReactNode {
    const roll = useWinRollup(target, duration)
    return (
      <button type="button" onClick={roll.complete} data-testid="probe">
        {roll.phase}:{roll.value}
      </button>
    )
  }

  it('settles immediately when there is nothing to roll', () => {
    render(<Probe target={0} duration={1000} />)
    expect(screen.getByTestId('probe').textContent).toBe('settled:0')
  })

  it('jumps to the target and settles when completed early', () => {
    render(<Probe target={500} duration={5000} />)
    expect(screen.getByTestId('probe').textContent).toBe('rolling:0')

    fireEvent.click(screen.getByTestId('probe'))
    expect(screen.getByTestId('probe').textContent).toBe('settled:500')
  })

  it('restarts from zero when the target changes', async () => {
    const { rerender } = render(<Probe target={500} duration={40} />)
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('settled:500'))

    rerender(<Probe target={900} duration={40} />)
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('settled:900'))
  })
})
