/**
 * 보너스 3종 타일 로우 — 데일리 / 4시간 / 구제. 구제는 수령 가능할 때만 보인다.
 * 수령에 성공하면 짧은 보상 토스트를 띄운다.
 */
import { useState, type ReactNode } from 'react'
import type { BonusClaimResponse } from '@tgslot/shared'
import { useHubStore } from '../../store/hub'
import { useT } from '../../i18n'
import { BonusTile } from './BonusTile'
import { RewardToast } from './RewardToast'
import './BonusRow.css'

export function BonusRow(): ReactNode {
  const t = useT()
  const bonusStatus = useHubStore((s) => s.bonusStatus)
  const claimingBonus = useHubStore((s) => s.claimingBonus)
  const claimDaily = useHubStore((s) => s.claimDaily)
  const claimTimed = useHubStore((s) => s.claimTimed)
  const claimRescue = useHubStore((s) => s.claimRescue)
  const [toastAmount, setToastAmount] = useState<number | null>(null)

  if (!bonusStatus) return null

  const handleClaim = async (
    action: () => Promise<BonusClaimResponse | null>,
  ): Promise<void> => {
    const result = await action()
    if (result) setToastAmount(result.amount)
  }

  return (
    <div className="hub-bonus-row">
      <BonusTile
        label={t('dailyBonus')}
        amount={bonusStatus.daily.nextAmount}
        claimable={bonusStatus.daily.claimable}
        nextAvailableAt={bonusStatus.daily.nextAvailableAt}
        claiming={claimingBonus === 'daily'}
        onClaim={() => void handleClaim(claimDaily)}
        streakDay={bonusStatus.daily.streakDay}
      />
      <BonusTile
        label={t('timedBonus')}
        amount={bonusStatus.timed.amount}
        claimable={bonusStatus.timed.claimable}
        nextAvailableAt={bonusStatus.timed.nextAvailableAt}
        claiming={claimingBonus === 'timed'}
        onClaim={() => void handleClaim(claimTimed)}
      />
      {bonusStatus.rescue.claimable && (
        <BonusTile
          label={t('rescueBonus')}
          amount={bonusStatus.rescue.amount}
          claimable={bonusStatus.rescue.claimable}
          nextAvailableAt={null}
          claiming={claimingBonus === 'rescue'}
          onClaim={() => void handleClaim(claimRescue)}
        />
      )}
      {toastAmount !== null && (
        <RewardToast amount={toastAmount} onDone={() => setToastAmount(null)} />
      )}
    </div>
  )
}
