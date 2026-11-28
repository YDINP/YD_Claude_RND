/**
 * 피처 구매(보너스 바로 사기) — 조작부 윗줄의 작은 버튼과, 누르면 뜨는 확인 시트.
 *
 * - 매번 시트로 확인한다(«다시 묻지 않기» 없음). 시트에는 현재 베팅 기준 비용·잔액·무엇이 바로 시작되는지 한 줄·[구매] [취소].
 * - 오토스핀·프리스핀·스핀 중·더블업·잔액 부족이면 버튼이 흐려지고, 눌러도 시트 대신 이유 한 줄을 보여 준다.
 * - [구매]는 시트를 닫고 store.buyFeature()를 부른다. 그 판은 평소 스핀과 같은 흐름(보너스 진입 연출)을 탄다.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { FeatureBuyTrigger } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import type { FeatureBuyBlock } from '../../lib/featureBuy'
import { Modal } from '../Modal'
import './FeatureBuy.css'

const TITLE_ID = 'hub-feature-buy-title'

const BLOCK_KEY: Record<FeatureBuyBlock, TranslationKey> = {
  autoSpin: 'featureBuyBlockedAutoSpin',
  freeSpins: 'featureBuyBlockedRound',
  spinning: 'featureBuyBlockedSpinning',
  gamble: 'featureBuyBlockedGamble',
  funds: 'featureBuyBlockedFunds',
}

/** 구매 판이 «무엇으로 시작하는지» 한 줄. 도움말도 같은 문구를 쓴다. */
export const FEATURE_BUY_WHAT_KEY: Record<FeatureBuyTrigger, TranslationKey> = {
  freeSpins: 'featureBuyWhatFreeSpins',
  orderRound: 'featureBuyWhatOrderRound',
  coinRespin: 'featureBuyWhatCoinRespin',
  boardBonus: 'featureBuyWhatBoard',
  stageRoulette: 'featureBuyWhatRoulette',
}

export interface FeatureBuyProps {
  price: number
  trigger: FeatureBuyTrigger
  /** 구매 판에 떨어지는 스캐터(코인 리스핀은 코인) 최소 개수 */
  triggerCount: number | null
  bet: number
  cost: number
  balance: number
  block: FeatureBuyBlock | null
  onBuy: () => void
}

const fmt = (n: number): string => n.toLocaleString('en-US')

export function FeatureBuy({ price, trigger, triggerCount, bet, cost, balance, block, onBuy }: FeatureBuyProps): ReactNode {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<FeatureBuyBlock | null>(null)

  // 시트가 열린 사이 스핀·프리스핀이 시작되면(다른 경로) 시트를 닫는다. 잔액 부족은 시트 안에서 보여 준다.
  useEffect(() => {
    if (open && block !== null && block !== 'funds') setOpen(false)
  }, [open, block])

  // 이유 안내는 잠깐만 띄우고, 막힘이 풀리면 바로 지운다.
  useEffect(() => {
    if (notice === null) return
    if (block === null) {
      setNotice(null)
      return
    }
    const timer = setTimeout(() => setNotice(null), 2600)
    return () => clearTimeout(timer)
  }, [notice, block])

  const reasonText = (reason: FeatureBuyBlock): string => t(BLOCK_KEY[reason], { cost: fmt(cost) })

  return (
    <>
      <button
        type="button"
        className="hub-feature-buy__btn"
        aria-disabled={block !== null ? true : undefined}
        aria-haspopup="dialog"
        data-blocked={block !== null ? 'true' : undefined}
        title={block !== null ? reasonText(block) : undefined}
        onClick={() => {
          if (block !== null) {
            setNotice(block)
            return
          }
          setOpen(true)
        }}
      >
        <span className="hub-feature-buy__btn-label">{t('featureBuy')}</span>
        <span className="hub-feature-buy__btn-price">{t('featureBuyPriceShort', { price: fmt(price) })}</span>
      </button>

      {notice !== null && (
        <p className="hub-feature-buy__notice" role="status">
          {reasonText(notice)}
        </p>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)} titleId={TITLE_ID}>
          <h2 id={TITLE_ID} className="hub-sheet__title">
            {t('featureBuy')}
          </h2>
          <p className="hub-feature-buy__what">{t(FEATURE_BUY_WHAT_KEY[trigger], { n: triggerCount ?? '' })}</p>
          <dl className="hub-feature-buy__rows">
            <div className="hub-feature-buy__row hub-feature-buy__row--cost">
              <dt>{t('featureBuyCostLabel')}</dt>
              <dd data-testid="feature-buy-cost">
                {t('featureBuyCostFormula', { bet: fmt(bet), price: fmt(price), cost: fmt(cost) })}
              </dd>
            </div>
            <div className="hub-feature-buy__row">
              <dt>{t('featureBuyBalanceLabel')}</dt>
              <dd>{fmt(balance)}</dd>
            </div>
          </dl>
          {block !== null && (
            <p className="hub-feature-buy__reason" role="alert">
              {reasonText(block)}
            </p>
          )}
          <div className="hub-feature-buy__actions">
            <button type="button" className="hub-sheet__close hub-feature-buy__cancel" onClick={() => setOpen(false)}>
              {t('featureBuyCancel')}
            </button>
            <button
              type="button"
              className="hub-sheet__reveal hub-feature-buy__confirm"
              disabled={block !== null}
              onClick={() => {
                setOpen(false)
                onBuy()
              }}
            >
              {t('featureBuyConfirm')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
