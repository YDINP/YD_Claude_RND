import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaderboardEntry } from '@tgslot/shared'

vi.mock('../../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../../sdk/api')>('../../sdk/api')
  return { ...actual, getLeaderboard: vi.fn() }
})

import { useHubStore } from '../../store/hub'
import { LeaderboardScreen } from './LeaderboardScreen'

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    rank: 1,
    userId: 'u1',
    firstName: 'Player',
    totalWin: 1000,
    bestMultiplier: 10,
    spins: 5,
    ...overrides,
  }
}

describe('LeaderboardScreen', () => {
  beforeEach(() => {
    useHubStore.setState({
      status: 'ready',
      errorMessage: null,
      bonusStatus: null,
      jackpot: null,
      missions: null,
      leaderboard: null,
      levelInfo: null,
      claimingBonus: null,
      claimingMissionId: null,
      bonusClaimError: null,
    })
  })

  it('does not render a pinned row when my rank is already in the visible list', () => {
    const me = entry({ rank: 1, userId: 'me', firstName: 'Me', totalWin: 500 })
    useHubStore.setState({
      leaderboard: {
        week: '2026-W36',
        entries: [me],
        me,
        endsAt: '2026-09-07T00:00:00.000Z',
      },
    })

    render(<LeaderboardScreen />)

    expect(screen.queryByTestId('leaderboard-me-pinned')).not.toBeInTheDocument()
  })

  it('pins my row at the bottom when I am not in the top entries', () => {
    const top = entry({ rank: 1, userId: 'top1', firstName: 'Top' })
    const me = entry({ rank: 87, userId: 'me', firstName: 'Me', totalWin: 42 })
    useHubStore.setState({
      leaderboard: {
        week: '2026-W36',
        entries: [top],
        me,
        endsAt: '2026-09-07T00:00:00.000Z',
      },
    })

    render(<LeaderboardScreen />)

    const pinned = screen.getByTestId('leaderboard-me-pinned')
    expect(pinned).toHaveTextContent('#87')
    expect(pinned).toHaveTextContent('Me')
  })

  it('pins my row by userId even when another entry happens to share my rank number', () => {
    // 회귀 테스트: rank 숫자만 비교하면 이 케이스에서 잘못 "이미 목록에 있음"으로 판단해
    // 고정 행을 숨겨버린다 — userId로 비교해야 실제 동일인인지 구분할 수 있다.
    const other = entry({ rank: 5, userId: 'someone-else', firstName: 'Other' })
    const me = entry({ rank: 5, userId: 'me', firstName: 'Me', totalWin: 42 })
    useHubStore.setState({
      leaderboard: {
        week: '2026-W36',
        entries: [other],
        me,
        endsAt: '2026-09-07T00:00:00.000Z',
      },
    })

    render(<LeaderboardScreen />)

    const pinned = screen.getByTestId('leaderboard-me-pinned')
    expect(pinned).toHaveTextContent('Me')
  })

  it('renders nothing extra when I have not played this week (me is null)', () => {
    const top = entry({ rank: 1, userId: 'top1', firstName: 'Top' })
    useHubStore.setState({
      leaderboard: { week: '2026-W36', entries: [top], me: null, endsAt: '2026-09-07T00:00:00.000Z' },
    })

    render(<LeaderboardScreen />)

    expect(screen.queryByTestId('leaderboard-me-pinned')).not.toBeInTheDocument()
  })
})
