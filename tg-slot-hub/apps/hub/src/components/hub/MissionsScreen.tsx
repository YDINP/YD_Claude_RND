/**
 * 미션 화면 — 오늘의 미션 목록, 진행률 바, 완료 시 수령 버튼, 자정 리셋 카운트다운.
 */
import { useEffect, type ReactNode } from 'react'
import { useHubStore } from '../../store/hub'
import { useSessionStore } from '../../store/session'
import { useT } from '../../i18n'
import { useCountdown, formatCountdown, nextUtcMidnightIso } from '../../lib/countdown'
import { Loading } from '../Loading'
import './MissionsScreen.css'

export function MissionsScreen(): ReactNode {
  const t = useT()
  const locale = useSessionStore((s) => s.user?.locale ?? 'en')
  const status = useHubStore((s) => s.status)
  const missions = useHubStore((s) => s.missions)
  const claimingMissionId = useHubStore((s) => s.claimingMissionId)
  const claimMission = useHubStore((s) => s.claimMission)
  const refreshMissions = useHubStore((s) => s.refreshMissions)

  const remaining = useCountdown(nextUtcMidnightIso())

  useEffect(() => {
    if (status === 'ready' && !missions) void refreshMissions()
  }, [status, missions, refreshMissions])

  if (!missions) {
    return <Loading />
  }

  return (
    <div className="hub-missions">
      <div className="hub-missions__header">
        <h2 className="hub-missions__title">{t('tabMissions')}</h2>
        <span className="hub-missions__reset">
          {t('missionsResetIn', { time: formatCountdown(remaining) })}
        </span>
      </div>
      <ul className="hub-missions__list">
        {missions.missions.map((mission) => {
          const progressPct =
            mission.target > 0 ? Math.min(100, Math.round((mission.progress / mission.target) * 100)) : 100
          const canClaim = mission.completed && !mission.claimed
          const name = locale === 'ko' && mission.name.ko ? mission.name.ko : mission.name.en

          return (
            <li key={mission.id} className="hub-mission" data-claimed={mission.claimed}>
              <div className="hub-mission__info">
                <span className="hub-mission__name">{name}</span>
                <div
                  className="hub-mission__track"
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="hub-mission__fill" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="hub-mission__progress">
                  {Math.min(mission.progress, mission.target)} / {mission.target} · 🪙{' '}
                  {mission.reward.toLocaleString('en-US')}
                </span>
              </div>
              {mission.claimed ? (
                <span className="hub-mission__done" aria-label={t('claim')}>
                  ✓
                </span>
              ) : (
                <button
                  type="button"
                  className="hub-mission__claim"
                  disabled={!canClaim || claimingMissionId === mission.id}
                  onClick={() => void claimMission(mission.id)}
                >
                  {t('claim')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
