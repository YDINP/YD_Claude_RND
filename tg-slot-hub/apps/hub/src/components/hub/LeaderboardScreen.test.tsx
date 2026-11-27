import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaderboardEntry } from '@tgslot/shared'

vi.mock('../../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../../sdk/api')>('../../sdk/api')
  return { ...actual, getLeaderboard: vi.fn() }
})

import { getLeaderboard } from '../../sdk/api'
import { useHubStore } from '../../store/hub'
import { useSessionStore } from '../../store/session'
import { useSettingsStore } from '../../store/settings'
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
    useSettingsStore.setState({ locale: 'ko' })
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

  it('shows my rank in the me card, not a duplicate pinned row', () => {
    const me = entry({ rank: 1, userId: 'me', firstName: 'Me', totalWin: 500 })
    useHubStore.setState({
      leaderboard: { week: '2026-W36', entries: [me], me, endsAt: '2026-09-07T00:00:00.000Z' },
    })

    render(<LeaderboardScreen />)

    expect(screen.queryByTestId('leaderboard-me-pinned')).not.toBeInTheDocument()
    expect(screen.getByTestId('leaderboard-me-card')).toHaveTextContent('#1')
  })

  it('shows my rank even when I am outside the visible top entries', () => {
    const top = entry({ rank: 1, userId: 'top1', firstName: 'Top' })
    const me = entry({ rank: 87, userId: 'me', firstName: 'Me', totalWin: 42 })
    useHubStore.setState({
      leaderboard: { week: '2026-W36', entries: [top], me, endsAt: '2026-09-07T00:00:00.000Z' },
    })

    render(<LeaderboardScreen />)

    const card = screen.getByTestId('leaderboard-me-card')
    expect(card).toHaveTextContent('#87')
    expect(card).toHaveTextContent('42')
  })

  describe('빈 화면(새 사용자)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-04T07:00:00Z'))
      useHubStore.setState({
        leaderboard: {
          week: '2026-W36',
          entries: [],
          me: null,
          endsAt: '2026-09-07T00:00:00.000Z',
          rewards: [
            { fromRank: 1, toRank: 1, coins: 10000 },
            { fromRank: 2, toRank: 2, coins: 6000 },
            { fromRank: 4, toRank: 10, coins: 2000 },
          ],
          lastWeek: null,
        },
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('남은 시간 N일 M시간, 내 순위 안내, 보상 표, 빈 목록 문구가 보인다', () => {
      render(<LeaderboardScreen />)

      expect(screen.getByText('2일 17시간 남음')).toBeInTheDocument()
      expect(screen.getByTestId('leaderboard-me-card')).toHaveTextContent('한 판 돌리면 참가')
      const rewards = screen.getByTestId('leaderboard-rewards')
      expect(rewards).toHaveTextContent('1위')
      expect(rewards).toHaveTextContent('10,000')
      expect(rewards).toHaveTextContent('4~10위')
      expect(rewards).toHaveTextContent('가상 코인')
      expect(screen.getByTestId('leaderboard-empty')).toBeInTheDocument()
      expect(screen.queryByTestId('leaderboard-last-week')).not.toBeInTheDocument()
    })
  })

  it('지난주 보상 띠는 안 받았을 때만 보이고 받기를 누르면 API를 부른다', () => {
    const me = entry({ rank: 3, userId: 'me', firstName: 'Me' })
    useHubStore.setState({
      leaderboard: {
        week: '2026-W37',
        entries: [me],
        me,
        endsAt: '2026-09-14T00:00:00.000Z',
        lastWeek: { week: '2026-W36', rank: 12, reward: 800, claimed: false },
      },
    })
    const claim = vi.fn().mockResolvedValue(null)
    useHubStore.setState({ claimLeaderboardReward: claim })

    render(<LeaderboardScreen />)

    const band = screen.getByTestId('leaderboard-last-week')
    expect(band).toHaveTextContent('지난주 12위')
    expect(band).toHaveTextContent('800')
    fireEvent.click(within(band).getByRole('button'))
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('이미 받은 지난주 보상은 띠를 숨긴다', () => {
    const me = entry({ rank: 3, userId: 'me', firstName: 'Me' })
    useHubStore.setState({
      leaderboard: {
        week: '2026-W37',
        entries: [me],
        me,
        endsAt: '2026-09-14T00:00:00.000Z',
        lastWeek: { week: '2026-W36', rank: 12, reward: 800, claimed: true },
      },
    })

    render(<LeaderboardScreen />)

    expect(screen.queryByTestId('leaderboard-last-week')).not.toBeInTheDocument()
  })

  it('탭을 열 때마다 리더보드를 새로 받아 방금 돌린 판을 반영한다', async () => {
    const stale = { week: '2026-W36', entries: [], me: null, endsAt: '2026-09-07T00:00:00.000Z' }
    const me = entry({ rank: 1, userId: 'me', firstName: 'Me', totalWin: 540 })
    vi.mocked(getLeaderboard).mockResolvedValue({ ...stale, entries: [me], me })
    useSessionStore.setState({ token: 'tok' })
    useHubStore.setState({ leaderboard: stale })

    render(<LeaderboardScreen />)

    expect(getLeaderboard).toHaveBeenCalledWith('tok')
    expect(await screen.findByText(/#1/)).toBeInTheDocument()
    useSessionStore.setState({ token: null })
  })
})
