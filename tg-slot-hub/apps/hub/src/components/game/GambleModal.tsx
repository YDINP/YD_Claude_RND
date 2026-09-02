/**
 * 더블업(갬블) 코인 던지기 팝업 — 화면 중앙에 뜨는 작은 모달(Modal 재사용). 앞면/뒷면을 고르면
 * GameScreen이 store를 통해 서버에 판정을 묻고, 그 결과(side/outcome)를 다시 이 컴포넌트에
 * 넘겨준다 — 이 컴포넌트는 절대 스스로 승패를 계산하지 않는다. 동전 뒤집기는 순수 CSS 애니메이션.
 */
import type { ReactNode } from 'react'
import type { GambleSide } from '@tgslot/shared'
import { Modal } from '../Modal'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import './GambleModal.css'

interface GambleModalProps {
  onClose: () => void
  onPick: (pick: GambleSide) => void
  /** 서버 응답을 기다리는 동안(코인이 도는 동안) 픽 버튼을 잠그고 닫기를 막는다. */
  flipping: boolean
  /**
   * 서버가 실제로 알려준 면. 결과가 아직 없거나(대기) 판정 자체가 없었으면(collected) null이다 —
   * 추측한 면을 보여주지 않는다(동전은 앞면을 보여준 채 가만히 있는다, 즉 "안 뒤집힘").
   */
  revealedSide: GambleSide | null
  /**
   * 'collected'는 서버가 판정 없이(만료 등으로) 이미 회수해버렸거나, 이겼지만 상한(단계/금액)에
   * 닿아 즉시 회수된 경우다 — 두 경우 다 코인은 뒤집히지 않은 것으로 보여준다.
   */
  outcome: 'win' | 'lose' | 'collected' | null
  pendingWin: number
  /** 성공하면 판돈이 몇 배가 되는지(코인 던지기는 보통 2) — 모달 제목에 보여준다. */
  payout: number
  /**
   * 재시도 가능한 실패 뒤에는 처음 고른 면으로만 다시 시도할 수 있다(서버가 같은 idempotencyKey로
   * 재전송을 판별하므로 다른 면을 고르면 원래 픽 기준 결과를 그대로 돌려받을 수 있다) — null이면
   * 아무 제약이 없다.
   */
  lockedPick: GambleSide | null
}

export function GambleModal({
  onClose,
  onPick,
  flipping,
  revealedSide,
  outcome,
  pendingWin,
  payout,
  lockedPick,
}: GambleModalProps): ReactNode {
  const t = useT()
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

  const coinClass = [
    'hub-gamble-coin__inner',
    reducedMotion ? 'hub-gamble-coin__inner--no-motion' : '',
    !reducedMotion && revealedSide === 'heads' ? 'hub-gamble-coin__inner--land-heads' : '',
    !reducedMotion && revealedSide === 'tails' ? 'hub-gamble-coin__inner--land-tails' : '',
    reducedMotion && revealedSide === 'tails' ? 'hub-gamble-coin__inner--land-tails-instant' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Modal onClose={flipping ? () => {} : onClose}>
      <h2 className="hub-sheet__title">{t('gambleTitle', { payout })}</h2>
      <p className="hub-sheet__message">{t('gamblePendingWin', { amount: pendingWin.toLocaleString('en-US') })}</p>

      <div className="hub-gamble-coin" aria-hidden="true">
        <div className={coinClass}>
          <div className="hub-gamble-coin__face hub-gamble-coin__face--heads">{t('gambleHeads')}</div>
          <div className="hub-gamble-coin__face hub-gamble-coin__face--tails">{t('gambleTails')}</div>
        </div>
      </div>

      {outcome && (
        <p
          className={
            outcome === 'win'
              ? 'hub-sheet__verify-status hub-sheet__verify-status--ok'
              : outcome === 'lose'
                ? 'hub-sheet__verify-status hub-sheet__verify-status--fail'
                : 'hub-sheet__verify-status'
          }
          role="status"
        >
          {outcome === 'win' ? t('gambleWin') : outcome === 'lose' ? t('gambleLose') : t('gambleCollected')}
        </p>
      )}

      <div className="hub-gamble-picks" aria-busy={flipping}>
        <button
          type="button"
          className="hub-sheet__reveal"
          onClick={() => onPick('heads')}
          disabled={flipping || (lockedPick !== null && lockedPick !== 'heads')}
        >
          {lockedPick === 'heads' ? t('gambleRetry') : t('gambleHeads')}
        </button>
        <button
          type="button"
          className="hub-sheet__reveal"
          onClick={() => onPick('tails')}
          disabled={flipping || (lockedPick !== null && lockedPick !== 'tails')}
        >
          {lockedPick === 'tails' ? t('gambleRetry') : t('gambleTails')}
        </button>
      </div>

      <button type="button" className="hub-sheet__close" onClick={onClose} disabled={flipping}>
        {t('close')}
      </button>
    </Modal>
  )
}
