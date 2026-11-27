/**
 * 리더보드 화면 — 내 순위는 50위 밖이어도 «내 순위 카드»가 보여 준다. 위에서 아래로: 제목·남은 시간 / 지난주 보상 띠 / 내 순위 카드 / 보상 안내 / 순위 목록.
 * 목록이 비어도 앞의 넷이 보이므로 빈 화면이 되지 않는다. 보상은 가상 코인이다.
 */
import { useEffect, type ReactNode } from 'react'
import { useHubStore } from '../../store/hub'
import { useT, useEffectiveLocale } from '../../i18n'
import { useCountdown, formatRemainingLong } from '../../lib/countdown'
import { Loading } from '../Loading'
import './LeaderboardScreen.css'

const RANK_CHIP = ['🥇', '🥈', '🥉'] as const

export function LeaderboardScreen(): ReactNode {
  const t = useT()
  const locale = useEffectiveLocale()
  const status = useHubStore((s) => s.status)
  const leaderboard = useHubStore((s) => s.leaderboard)
  const refreshLeaderboard = useHubStore((s) => s.refreshLeaderboard)
  const claimReward = useHubStore((s) => s.claimLeaderboardReward)
  const claiming = useHubStore((s) => s.claimingLeaderboardReward)
  const remaining = useCountdown(leaderboard?.endsAt ?? null)

  // 탭을 열 때마다 새로 받는다 — 앱 시작 때 받은 값만 쓰면 방금 돌린 판이 «아직 순위가 없어요»로 남는다.
  useEffect(() => {
    if (status === 'ready') void refreshLeaderboard()
  }, [status, refreshLeaderboard])

  if (!leaderboard) {
    return <Loading />
  }

  const lastWeek = leaderboard.lastWeek
  const fmt = (n: number): string => n.toLocaleString('en-US')

  return (
    <div className="hub-leaderboard">
      <div className="hub-leaderboard__header">
        <h2 className="hub-leaderboard__title">{t('leaderboardTitleWeek')}</h2>
        <span className="hub-leaderboard__ends">
          {t('leaderboardRemaining', { time: formatRemainingLong(remaining, locale) })}
        </span>
      </div>

      {lastWeek && !lastWeek.claimed && (
        <div className="hub-leaderboard__last-week" data-testid="leaderboard-last-week">
          <span className="hub-leaderboard__last-week-text">
            {t('leaderboardLastWeekBand', { rank: lastWeek.rank, reward: fmt(lastWeek.reward) })}
          </span>
          <button
            type="button"
            className="hub-leaderboard__claim"
            disabled={claiming}
            onClick={() => void claimReward()}
          >
            {t('claim')}
          </button>
        </div>
      )}

      <div className="hub-leaderboard__me-card" data-testid="leaderboard-me-card">
        {leaderboard.me ? (
          <span>
            {t('leaderboardMeCard', {
              rank: leaderboard.me.rank,
              total: fmt(leaderboard.me.totalWin),
              mult: leaderboard.me.bestMultiplier.toFixed(1),
            })}
          </span>
        ) : (
          <span className="hub-leaderboard__me-empty">{t('leaderboardMeEmpty')}</span>
        )}
      </div>

      {leaderboard.rewards && leaderboard.rewards.length > 0 && (
        <div className="hub-leaderboard__rewards" data-testid="leaderboard-rewards">
          <h3 className="hub-leaderboard__rewards-title">{t('leaderboardRewardsTitle')}</h3>
          <ul className="hub-leaderboard__rewards-list">
            {leaderboard.rewards.map((tier) => (
              <li key={tier.fromRank} className="hub-leaderboard__rewards-row">
                <span>
                  {tier.fromRank === tier.toRank
                    ? t('leaderboardRewardRankOne', { rank: tier.fromRank })
                    : t('leaderboardRewardRankRange', { from: tier.fromRank, to: tier.toRank })}
                </span>
                <span className="hub-leaderboard__rewards-coins">🪙 {fmt(tier.coins)}</span>
              </li>
            ))}
          </ul>
          <p className="hub-leaderboard__rewards-note">{t('leaderboardRewardNote')}</p>
        </div>
      )}

      {leaderboard.entries.length === 0 ? (
        <p className="hub-leaderboard__empty" data-testid="leaderboard-empty">
          {t('leaderboardEmptyList')}
        </p>
      ) : (
        <ol className="hub-leaderboard__list">
          {leaderboard.entries.map((entry) => (
            <li
              key={entry.userId}
              className="hub-leaderboard__row"
              data-me={leaderboard.me?.userId === entry.userId}
            >
              <span className="hub-leaderboard__rank">{RANK_CHIP[entry.rank - 1] ?? `#${entry.rank}`}</span>
              <span className="hub-leaderboard__name">{entry.firstName}</span>
              <span className="hub-leaderboard__win">{fmt(entry.totalWin)}</span>
              <span className="hub-leaderboard__mult">×{entry.bestMultiplier.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
