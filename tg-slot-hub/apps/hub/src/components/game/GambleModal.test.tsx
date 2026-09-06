/**
 * GambleModal 연출 테스트 — 컴포넌트 단위로 직접 렌더한다(GameScreen을 거치지 않는다).
 * 핵심 계약 두 가지를 지킨다:
 *  1. 최종 면은 **항상** 서버가 준 revealedSide를 따른다(컴포넌트는 승패를 계산하지 않는다).
 *  2. 착지가 끝나기(revealed) 전에는 결과가 시각적으로 드러나지 않는다.
 *
 * 타이밍/금액/파티클 계산은 `gambleToss.ts`의 순수 함수라 아래에서 따로(렌더 없이) 검증한다.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { GambleModal } from './GambleModal'
import {
  ACTIONS_DELAY_MS,
  LAND_MS,
  NEAR_MISS_MS,
  SETTLING_MS,
  TOSS_DECEL_MS,
  burstParticles,
  isAirborne,
  rollupAmount,
  rollupDuration,
  targetAmount,
  tossSchedule,
} from './gambleToss'
import { useSettingsStore } from '../../store/settings'

const baseProps = {
  onClose: () => {},
  onPick: () => {},
  flipping: false,
  revealedSide: null,
  outcome: null,
  pendingWin: 20,
  payout: 2,
  lockedPick: null,
} as const

function amountText(): string {
  return screen.getByTestId('gamble-amount').textContent ?? ''
}

describe('gambleToss (pure)', () => {
  describe('tossSchedule', () => {
    it('is idle before a pick and tossing while the server is deciding', () => {
      expect(tossSchedule({ flipping: false, outcome: null, revealedSide: null, reducedMotion: false })).toEqual({
        initial: 'idle',
        transitions: [],
      })
      expect(tossSchedule({ flipping: true, outcome: null, revealedSide: null, reducedMotion: false })).toEqual({
        initial: 'tossing',
        transitions: [],
      })
    })

    it('walks tossing → nearMiss → settling → revealed once the server answers', () => {
      const schedule = tossSchedule({
        flipping: false,
        outcome: 'win',
        revealedSide: 'heads',
        reducedMotion: false,
      })

      expect(schedule.initial).toBe('tossing')
      expect(schedule.transitions).toEqual([
        { phase: 'nearMiss', delay: TOSS_DECEL_MS },
        { phase: 'settling', delay: TOSS_DECEL_MS + NEAR_MISS_MS },
        { phase: 'revealed', delay: LAND_MS },
      ])
      // 마지막 전이는 언제나 착지 총시간과 같다(= CSS animation-duration).
      expect(TOSS_DECEL_MS + NEAR_MISS_MS + SETTLING_MS).toBe(LAND_MS)
    })

    it('reveals immediately when there is nothing to land — reduced motion, or a judgement-free "collected"', () => {
      expect(
        tossSchedule({ flipping: false, outcome: 'win', revealedSide: 'heads', reducedMotion: true }),
      ).toEqual({ initial: 'revealed', transitions: [] })
      expect(
        tossSchedule({ flipping: false, outcome: 'collected', revealedSide: null, reducedMotion: false }),
      ).toEqual({ initial: 'revealed', transitions: [] })
    })
  })

  it('treats every pre-reveal phase as airborne', () => {
    expect(isAirborne('idle')).toBe(false)
    expect(isAirborne('tossing')).toBe(true)
    expect(isAirborne('nearMiss')).toBe(true)
    expect(isAirborne('settling')).toBe(true)
    expect(isAirborne('revealed')).toBe(false)
  })

  describe('targetAmount', () => {
    it('follows the server amount while the session continues', () => {
      expect(targetAmount({ outcome: 'win', stake: 20, pendingWin: 40, payout: 2 })).toBe(40)
    })

    it('falls back to stake × payout when the win auto-collects and the session amount drops to 0', () => {
      expect(targetAmount({ outcome: 'win', stake: 20, pendingWin: 0, payout: 2 })).toBe(40)
      expect(targetAmount({ outcome: 'win', stake: 20, pendingWin: 0, payout: 2.5 })).toBe(50)
    })

    it('is zero on a loss and unchanged on a judgement-free collect', () => {
      expect(targetAmount({ outcome: 'lose', stake: 20, pendingWin: 0, payout: 2 })).toBe(0)
      expect(targetAmount({ outcome: 'collected', stake: 20, pendingWin: 0, payout: 2 })).toBe(20)
    })
  })

  describe('rollupAmount', () => {
    it('clamps to the endpoints and eases wins out (ahead of linear at the midpoint)', () => {
      expect(rollupAmount(20, 40, -1, 'win')).toBe(20)
      expect(rollupAmount(20, 40, 2, 'win')).toBe(40)
      expect(rollupAmount(20, 40, 0.5, 'win')).toBeGreaterThan(30)
    })

    it('counts losses down linearly', () => {
      expect(rollupAmount(20, 0, 0.5, 'lose')).toBe(10)
      expect(rollupAmount(20, 0, 1, 'lose')).toBe(0)
    })

    it('gives wins a longer roll than losses', () => {
      expect(rollupDuration('win')).toBeGreaterThan(rollupDuration('lose'))
    })
  })

  describe('burstParticles', () => {
    it('reuses one prefix array per step instead of building a new one each call', () => {
      expect(burstParticles(1)).toBe(burstParticles(1))
      expect(burstParticles(2)).toBe(burstParticles(2))
      // 각 단계 배열은 같은 원본의 접두사다 — 앞쪽 파티클이 그대로 재사용된다.
      expect(burstParticles(2)[0]).toBe(burstParticles(1)[0])
    })

    it('gets denser as the win step climbs, and clamps outside the range', () => {
      expect(burstParticles(1)).toHaveLength(12)
      expect(burstParticles(2)).toHaveLength(16)
      expect(burstParticles(3)).toHaveLength(20)
      expect(burstParticles(0)).toHaveLength(12)
      expect(burstParticles(99)).toHaveLength(20)
    })

    it('spreads any prefix around the full circle (golden angle), never bunched on one side', () => {
      for (const step of [1, 2, 3]) {
        const angles = burstParticles(step).map((p) => p.angle)
        expect(new Set(angles).size).toBe(angles.length)
        expect(angles.filter((a) => a < 180).length).toBeGreaterThan(angles.length / 3)
        expect(angles.filter((a) => a >= 180).length).toBeGreaterThan(angles.length / 3)
      }
    })
  })
})

describe('GambleModal', () => {
  beforeEach(() => {
    useSettingsStore.setState({ reducedMotion: false })
  })

  it('shows the stake, the payout chip, and the chance chip only when a chance is supplied', () => {
    const { rerender } = render(<GambleModal {...baseProps} />)

    expect(amountText()).toBe('20')
    expect(screen.getByText('×2 payout')).toBeInTheDocument()
    expect(screen.queryByText('50% chance')).not.toBeInTheDocument()

    rerender(<GambleModal {...baseProps} chancePercent={50} />)
    expect(screen.getByText('50% chance')).toBeInTheDocument()
  })

  it('spins the coin while waiting for the server and shows no landing class yet', () => {
    const { container } = render(<GambleModal {...baseProps} flipping />)

    expect(container.querySelector('.hub-gamble')?.className).toContain('hub-gamble--waiting')
    const coin = container.querySelector('.hub-gamble-coin__inner')
    expect(coin?.className).toContain('hub-gamble-coin__inner--spin')
    expect(coin?.className).not.toMatch(/--land-/)
    expect(screen.getByText('Tossing…')).toBeInTheDocument()
    // 대기 중에는 어느 쪽도 고를 수 없다.
    expect(screen.getByRole('button', { name: 'Heads' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tails' })).toBeDisabled()
  })

  it('lands on the face the server reported, not on the pick (heads)', () => {
    const { container } = render(<GambleModal {...baseProps} revealedSide="heads" outcome="win" />)
    expect(container.querySelector('.hub-gamble-coin__inner')?.className).toContain(
      'hub-gamble-coin__inner--land-heads',
    )
  })

  it('lands on the face the server reported, not on the pick (tails)', () => {
    const { container } = render(<GambleModal {...baseProps} revealedSide="tails" outcome="lose" />)
    expect(container.querySelector('.hub-gamble-coin__inner')?.className).toContain(
      'hub-gamble-coin__inner--land-tails',
    )
  })

  it('steps through tossing → nearMiss → settling → revealed, hiding the outcome and the amount until the end', async () => {
    vi.useFakeTimers()
    try {
      const { container, rerender } = render(<GambleModal {...baseProps} flipping />)
      rerender(<GambleModal {...baseProps} flipping={false} revealedSide="heads" outcome="win" pendingWin={40} />)

      const root = (): string => container.querySelector('.hub-gamble')?.className ?? ''
      const result = (): string => container.querySelector('.hub-gamble__result')?.className ?? ''

      // tossing — 응답은 이미 도착했지만 눈으로는 결과를 알 수 없다.
      expect(root()).toContain('hub-gamble--landing')
      expect(root()).not.toContain('hub-gamble--near-miss')
      expect(result()).toContain('hub-gamble__result--suspense')
      // 판돈이 미리 40으로 바뀌면 결과가 새어나간다 — 착지 전까지는 20이어야 한다.
      expect(amountText()).toBe('20')
      expect(container.querySelector('.hub-gamble-picks')?.className).toContain('hub-gamble-actions--hold')
      expect(screen.getByRole('button', { name: 'Heads' })).toBeDisabled()

      // nearMiss — "쪼는" 구간. 여전히 결과는 감춰져 있다.
      await act(async () => {
        vi.advanceTimersByTime(TOSS_DECEL_MS)
      })
      expect(root()).toContain('hub-gamble--near-miss')
      expect(result()).toContain('hub-gamble__result--suspense')

      // settling — 마지막 반 바퀴.
      await act(async () => {
        vi.advanceTimersByTime(NEAR_MISS_MS)
      })
      expect(root()).not.toContain('hub-gamble--near-miss')
      expect(result()).toContain('hub-gamble__result--suspense')

      // revealed.
      await act(async () => {
        vi.advanceTimersByTime(SETTLING_MS)
      })
      expect(result()).not.toContain('hub-gamble__result--suspense')
      expect(container.querySelector('.hub-gamble-picks')?.className).toContain('hub-gamble-actions--pop')

      // 팝인이 끝나야 버튼이 다시 눌린다.
      expect(screen.getByRole('button', { name: 'Heads' })).toBeDisabled()
      await act(async () => {
        vi.advanceTimersByTime(ACTIONS_DELAY_MS)
      })
      expect(screen.getByRole('button', { name: 'Heads' })).not.toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rolls the amount up to double on a win, bursts particles, and re-enables the actions', async () => {
    const { container, rerender } = render(<GambleModal {...baseProps} flipping />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="heads" outcome="win" pendingWin={40} />)

    expect(await screen.findByText('You called it! Double up.')).toBeInTheDocument()
    await waitFor(() => expect(amountText()).toBe('40'), { timeout: 3000 })

    expect(container.querySelectorAll('.hub-gamble-burst__particle')).toHaveLength(12)
    expect(container.querySelector('.hub-gamble__flash')).toBeInTheDocument()
    expect(container.querySelector('.hub-gamble')?.className).toContain('hub-gamble--win')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Heads' })).not.toBeDisabled())
  })

  it('derives the doubled amount from the stake when the win auto-collects and the session (pendingWin) drops to 0', async () => {
    const { rerender } = render(<GambleModal {...baseProps} flipping />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="heads" outcome="win" pendingWin={0} />)

    await waitFor(() => expect(amountText()).toBe('40'), { timeout: 3000 })
  })

  it('escalates the burst as the win step climbs (more particles on the second win in a row)', async () => {
    const { container, rerender } = render(<GambleModal {...baseProps} flipping />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="heads" outcome="win" pendingWin={40} />)
    await waitFor(() => expect(container.querySelectorAll('.hub-gamble-burst__particle')).toHaveLength(12), {
      timeout: 3000,
    })

    // 모달을 닫지 않고 이어서 한 번 더 성공 — 단계가 올라가면 파티클이 촘촘해진다.
    rerender(<GambleModal {...baseProps} flipping pendingWin={40} />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="tails" outcome="win" pendingWin={80} />)
    await waitFor(() => expect(container.querySelectorAll('.hub-gamble-burst__particle')).toHaveLength(16), {
      timeout: 3000,
    })
    expect(container.querySelector('.hub-gamble')?.className).toContain('hub-gamble--step-2')
    await waitFor(() => expect(amountText()).toBe('80'), { timeout: 3000 })
  })

  it('counts the amount down to zero and drops the coin on a loss', async () => {
    const { container, rerender } = render(<GambleModal {...baseProps} flipping />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="tails" outcome="lose" pendingWin={0} />)

    expect(await screen.findByText('Wrong side — this round is over.')).toBeInTheDocument()
    await waitFor(() => expect(amountText()).toBe('0'), { timeout: 3000 })
    expect(container.querySelector('.hub-gamble-coin__lift')?.className).toContain(
      'hub-gamble-coin__lift--drop',
    )
    // 실패에는 축포가 없다.
    expect(container.querySelector('.hub-gamble-burst__particle')).toBeNull()
  })

  it('never lands the coin for a "collected" response (no server judgement) and reveals immediately', async () => {
    const { container } = render(<GambleModal {...baseProps} outcome="collected" revealedSide={null} />)

    expect(await screen.findByText('Already collected — your win is safe in your wallet.')).toBeInTheDocument()
    const coin = container.querySelector('.hub-gamble-coin__inner')
    expect(coin?.className).not.toMatch(/--land-/)
    expect(container.querySelector('.hub-gamble__result')?.className).not.toContain(
      'hub-gamble__result--suspense',
    )
    expect(amountText()).toBe('20')
  })

  it('renders the result with no animation classes and no particles under reduced motion', () => {
    useSettingsStore.setState({ reducedMotion: true })
    const { container, rerender } = render(<GambleModal {...baseProps} flipping />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="tails" outcome="win" pendingWin={40} />)

    const coin = container.querySelector('.hub-gamble-coin__inner')
    expect(coin?.className).toContain('hub-gamble-coin__inner--no-motion')
    expect(coin?.className).toContain('hub-gamble-coin__inner--land-tails-instant')
    expect(coin?.className).not.toContain('hub-gamble-coin__inner--land-tails ')
    expect(container.querySelector('.hub-gamble')?.className).not.toContain('hub-gamble--landing')
    expect(container.querySelector('.hub-gamble-burst__particle')).toBeNull()
    expect(container.querySelector('.hub-gamble__flash')).toBeNull()
    // 회전 없이 결과 문구와 금액이 곧바로 나온다.
    expect(screen.getByText('You called it! Double up.')).toBeInTheDocument()
    expect(container.querySelector('.hub-gamble__result')?.className).not.toContain(
      'hub-gamble__result--suspense',
    )
    expect(amountText()).toBe('40')
  })

  it('announces the result through a polite live region', () => {
    const { container } = render(<GambleModal {...baseProps} revealedSide="heads" outcome="win" pendingWin={40} />)
    const live = container.querySelector('.hub-gamble__result')

    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('role', 'status')
    // 결과 문구는 이 하나의 라이브 리전에만 존재한다(중복 안내 없음).
    expect(screen.getAllByText('You called it! Double up.')).toHaveLength(1)
  })

  it('keeps the retry pin intact: only the originally picked side is clickable and it reads "Retry"', () => {
    render(<GambleModal {...baseProps} lockedPick="heads" />)

    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tails' })).toBeDisabled()
  })

  it('moves focus to the actions only after the animation settles', async () => {
    const { rerender } = render(<GambleModal {...baseProps} flipping />)
    rerender(<GambleModal {...baseProps} flipping={false} revealedSide="heads" outcome="win" pendingWin={40} />)

    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Heads' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Heads' })), {
      timeout: 4000,
    })
  })
})
