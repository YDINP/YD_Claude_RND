import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../../sdk/api')>('../../sdk/api')
  return { ...actual, getBonusStatus: vi.fn() }
})

import { getBonusStatus } from '../../sdk/api'
import { useSessionStore } from '../../store/session'
import { BonusTile } from './BonusTile'

const mockedGetBonusStatus = vi.mocked(getBonusStatus)

describe('BonusTile', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))
    vi.clearAllMocks()
    useSessionStore.setState({ token: 'test-token' })
    mockedGetBonusStatus.mockResolvedValue({
      daily: { claimable: true, streakDay: 1, nextAmount: 100, nextAvailableAt: null },
      timed: { claimable: false, amount: 50, nextAvailableAt: null },
      rescue: { claimable: false, amount: 200 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a Claim button when claimable', () => {
    render(
      <BonusTile
        label="Daily bonus"
        amount={100}
        claimable
        nextAvailableAt={null}
        claiming={false}
        onClaim={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument()
  })

  it('shows an m:ss countdown when locked and under an hour remains', () => {
    render(
      <BonusTile
        label="4h bonus"
        amount={50}
        claimable={false}
        nextAvailableAt="2026-09-02T00:05:03.000Z"
        claiming={false}
        onClaim={() => {}}
      />,
    )

    expect(screen.getByText('5:03')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
  })

  it('shows an h:mm countdown when locked and an hour or more remains', () => {
    render(
      <BonusTile
        label="4h bonus"
        amount={50}
        claimable={false}
        nextAvailableAt="2026-09-02T03:05:00.000Z"
        claiming={false}
        onClaim={() => {}}
      />,
    )

    expect(screen.getByText('3:05')).toBeInTheDocument()
  })

  it('refreshes bonus status exactly once when the countdown reaches zero', async () => {
    render(
      <BonusTile
        label="4h bonus"
        amount={50}
        claimable={false}
        nextAvailableAt="2026-09-02T00:00:05.000Z"
        claiming={false}
        onClaim={() => {}}
      />,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(mockedGetBonusStatus).toHaveBeenCalledTimes(1)

    // 만료 이후에도 초 단위로 계속 리렌더되지만 다시 호출되면 안 된다 (debounced once).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(mockedGetBonusStatus).toHaveBeenCalledTimes(1)
  })

  it('does not refresh bonus status while already claimable', async () => {
    render(
      <BonusTile
        label="Daily bonus"
        amount={100}
        claimable
        nextAvailableAt={null}
        claiming={false}
        onClaim={() => {}}
      />,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(mockedGetBonusStatus).not.toHaveBeenCalled()
  })
})
