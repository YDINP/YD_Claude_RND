/**
 * 보너스 타일 1개 — 수령 가능하면 브라스 Claim 버튼, 아니면 카운트다운.
 * 데일리 타일만 7일 연속 출석 트랙(streakDay)을 함께 보여준다.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { useHubStore } from '../../store/hub'
import { useCountdown, formatCountdown } from '../../lib/countdown'
import './BonusTile.css'

interface BonusTileProps {
  label: string
  amount: number
  claimable: boolean
  nextAvailableAt: string | null
  claiming: boolean
  onClaim: () => void
  /** 데일리 보너스일 때만 전달 — 1 이상, 7 초과 시 7주기로 순환 표시 */
  streakDay?: number
}

function StreakTrack({ currentDay }: { currentDay: number }): ReactNode {
  const t = useT()
  const dayInWeek = ((currentDay - 1) % 7) + 1
  const days = [1, 2, 3, 4, 5, 6, 7]

  return (
    <div className="hub-bonus-tile__streak">
      <span className="hub-bonus-tile__streak-label">{t('streakLabel', { day: dayInWeek })}</span>
      <div className="hub-bonus-tile__streak-track" aria-hidden="true">
        {days.map((day) => (
          <span
            key={day}
            className="hub-bonus-tile__streak-dot"
            data-state={day < dayInWeek ? 'done' : day === dayInWeek ? 'current' : 'pending'}
          />
        ))}
      </div>
    </div>
  )
}

export function BonusTile({
  label,
  amount,
  claimable,
  nextAvailableAt,
  claiming,
  onClaim,
  streakDay,
}: BonusTileProps): ReactNode {
  const t = useT()
  const refreshBonusStatus = useHubStore((s) => s.refreshBonusStatus)
  const remaining = useCountdown(claimable ? null : nextAvailableAt)
  const hasRefreshedRef = useRef(false)

  // 목표 시각이 바뀌면(새 쿨다운) 다시 한 번 트리거할 수 있게 가드를 푼다.
  useEffect(() => {
    hasRefreshedRef.current = false
  }, [nextAvailableAt])

  // 카운트다운이 0에 도달하면(서버가 이미 수령 가능으로 판단했을 시점) 딱 한 번만
  // GET /bonus를 다시 불러 화면을 새로고침 없이 Claim 상태로 전환한다.
  useEffect(() => {
    if (claimable || !nextAvailableAt) return
    if (remaining > 0 || hasRefreshedRef.current) return
    hasRefreshedRef.current = true
    void refreshBonusStatus()
  }, [claimable, nextAvailableAt, remaining, refreshBonusStatus])

  return (
    <div className="hub-bonus-tile" data-claimable={claimable}>
      <span className="hub-bonus-tile__label">{label}</span>
      <span className="hub-bonus-tile__amount">
        🪙 {amount.toLocaleString('en-US')}
      </span>
      {streakDay !== undefined && <StreakTrack currentDay={streakDay} />}
      {claimable ? (
        <button type="button" className="hub-bonus-tile__claim" onClick={onClaim} disabled={claiming}>
          {t('claim')}
        </button>
      ) : (
        <span className="hub-bonus-tile__countdown">
          {nextAvailableAt ? formatCountdown(remaining) : '—'}
        </span>
      )}
    </div>
  )
}
