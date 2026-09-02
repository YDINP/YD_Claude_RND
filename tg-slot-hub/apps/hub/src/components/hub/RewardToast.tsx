/**
 * 짧은 보상 토스트 — 보너스/미션 수령 금액을 잠깐 보여주고 자동으로 사라진다.
 */
import { useEffect, type ReactNode } from 'react'
import { useT } from '../../i18n'
import './RewardToast.css'

interface RewardToastProps {
  amount: number
  onDone: () => void
  durationMs?: number
}

const DEFAULT_DURATION_MS = 1800

export function RewardToast({ amount, onDone, durationMs = DEFAULT_DURATION_MS }: RewardToastProps): ReactNode {
  const t = useT()

  useEffect(() => {
    const id = setTimeout(onDone, durationMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, durationMs])

  return (
    <div className="hub-reward-toast" role="status">
      🪙 +{amount.toLocaleString('en-US')} {t('coins')}
    </div>
  )
}
