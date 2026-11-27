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

/** 이번 레벨 구간에서 채운 xp와 구간 길이. */
export function levelSectionProgress(levelInfo: Level): { done: number; span: number } {
  const start = levelInfo.levelStartXp ?? 0
  const span = Math.max(0, levelInfo.nextLevelXp - start)
  const done = Math.min(span, Math.max(0, levelInfo.xp - start))
  return { done, span }
}

export function LevelBar({ levelInfo }: LevelBarProps): ReactNode {
  const t = useT()
  if (!levelInfo) return null

  // 구간 진행률: 현재 레벨 문턱에서 다음 문턱까지. 서버가 levelStartXp를 안 주면 예전 계산(0부터)으로 폴백한다.
  const { done, span } = levelSectionProgress(levelInfo)
  const progress = span > 0 ? Math.min(1, done / span) : 1
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
        {done.toLocaleString('en-US')} / {span.toLocaleString('en-US')}
      </span>
      <span className="hub-level-bar__maxbet">
        {t('maxBetHint', { amount: levelInfo.maxBet.toLocaleString('en-US') })}
      </span>
    </div>
  )
}
