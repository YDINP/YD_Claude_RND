/**
 * 잭팟 바 — 허브 스토어의 실시간 풀 금액(오도미터 애니메이션) + 마지막 당첨 캡션.
 */
import type { ReactNode } from 'react'
import type { Jackpot } from '@tgslot/shared'
import { Odometer } from '../Odometer'
import { useT } from '../../i18n'
import './JackpotBar.css'

interface JackpotBarProps {
  jackpot: Jackpot | null
}

/** userId는 익명 식별자이므로 그대로 노출하지 않고 짧은 태그로만 보여준다 */
function shortPlayerTag(userId: string): string {
  return `#${userId.slice(-4)}`
}

export function JackpotBar({ jackpot }: JackpotBarProps): ReactNode {
  const t = useT()
  const pool = jackpot?.pool ?? 0
  const lastWin = jackpot?.lastWin

  return (
    <div className="hub-jackpot-bar" role="status">
      <div className="hub-jackpot-bar__row">
        <span className="hub-jackpot-bar__label">{t('jackpot')}</span>
        <Odometer className="hub-jackpot-bar__value" value={pool} />
      </div>
      {lastWin && (
        <span className="hub-jackpot-bar__last-win">
          {t('jackpotLastWin', {
            player: shortPlayerTag(lastWin.userId),
            amount: lastWin.amount.toLocaleString('en-US'),
          })}
        </span>
      )}
    </div>
  )
}
