/**
 * 레벨 바 — 헤더 바로 아래. 현재 레벨, 다음 레벨까지 XP 진행률, 해금된 베팅 상한.
 * levelInfo가 아직 없으면(허브 로딩 전) 아무것도 그리지 않는다.
 */
import type { ReactNode } from 'react'
import type { Level } from '@tgslot/shared'
import { useT } from '../../i18n'
import './LevelBar.css'

interface LevelBarProps {
  levelInfo: Level | null
}

export function LevelBar({ levelInfo }: LevelBarProps): ReactNode {
  const t = useT()
  if (!levelInfo) return null

  const progress =
    levelInfo.nextLevelXp > 0 ? Math.min(1, levelInfo.xp / levelInfo.nextLevelXp) : 1
  const progressPct = Math.round(progress * 100)

  return (
    <div className="hub-level-bar">
      <span className="hub-level-bar__label">{t('level', { level: levelInfo.level })}</span>
      <div
        className="hub-level-bar__track"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="hub-level-bar__fill" style={{ width: `${progressPct}%` }} />
      </div>
      <span className="hub-level-bar__xp">
        {levelInfo.xp.toLocaleString('en-US')} / {levelInfo.nextLevelXp.toLocaleString('en-US')}
      </span>
      <span className="hub-level-bar__maxbet">
        {t('maxBetHint', { amount: levelInfo.maxBet.toLocaleString('en-US') })}
      </span>
    </div>
  )
}
