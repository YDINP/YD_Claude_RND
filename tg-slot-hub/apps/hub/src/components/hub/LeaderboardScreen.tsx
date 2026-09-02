/**
 * 리더보드 화면 — 이번 주 상위 50명 + 내 순위(50위 밖이면 하단에 고정).
 */
import { useEffect, type ReactNode } from 'react'
import { useHubStore } from '../../store/hub'
import { useT } from '../../i18n'
import { useCountdown, formatCountdown } from '../../lib/countdown'
import { Loading } from '../Loading'
import './LeaderboardScreen.css'

const RANK_CHIP = ['🥇', '🥈', '🥉'] as const

export function LeaderboardScreen(): ReactNode {
  const t = useT()
  const status = useHubStore((s) => s.status)
  const leaderboard = useHubStore((s) => s.leaderboard)
  const refreshLeaderboard = useHubStore((s) => s.refreshLeaderboard)
  const remaining = useCountdown(leaderboard?.endsAt ?? null)

  useEffect(() => {
    if (status === 'ready' && !leaderboard) void refreshLeaderboard()
  }, [status, leaderboard, refreshLeaderboard])

  if (!leaderboard) {
    return <Loading />
  }

  const meUserId = leaderboard.me?.userId
  const meInTop = meUserId !== undefined && leaderboard.entries.some((e) => e.userId === meUserId)

  return (
    <div className="hub-leaderboard">
      <div className="hub-leaderboard__header">
        <h2 className="hub-leaderboard__title">{t('tabLeaderboard')}</h2>
        <span className="hub-leaderboard__week">{t('leaderboardWeekOf', { week: leaderboard.week })}</span>
        <span className="hub-leaderboard__ends">
          {t('leaderboardEndsIn', { time: formatCountdown(remaining) })}
        </span>
      </div>
      <ol className="hub-leaderboard__list">
        {leaderboard.entries.map((entry) => (
          <li
            key={entry.userId}
            className="hub-leaderboard__row"
            data-me={leaderboard.me?.userId === entry.userId}
          >
            <span className="hub-leaderboard__rank">{RANK_CHIP[entry.rank - 1] ?? `#${entry.rank}`}</span>
            <span className="hub-leaderboard__name">{entry.firstName}</span>
            <span className="hub-leaderboard__win">{entry.totalWin.toLocaleString('en-US')}</span>
            <span className="hub-leaderboard__mult">×{entry.bestMultiplier.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      {leaderboard.me && !meInTop && (
        <div className="hub-leaderboard__me-pinned" data-testid="leaderboard-me-pinned">
          <span className="hub-leaderboard__rank">#{leaderboard.me.rank}</span>
          <span className="hub-leaderboard__name">{leaderboard.me.firstName}</span>
          <span className="hub-leaderboard__win">{leaderboard.me.totalWin.toLocaleString('en-US')}</span>
          <span className="hub-leaderboard__mult">×{leaderboard.me.bestMultiplier.toFixed(1)}</span>
        </div>
      )}
    </div>
  )
}
