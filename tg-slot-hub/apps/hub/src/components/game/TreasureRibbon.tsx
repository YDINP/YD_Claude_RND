/**
 * 보물 띠 — 이 게임의 고정 상금 4단(작은·중간·큰·최고 보물)을 판 위에 늘 보여 준다.
 * 금액은 «지금 베팅 × 배수»다(math.json 값을 읽는다 — 하드코딩 없음). 코인 얼굴과 같은 압축 표기를 쓴다.
 *
 * - `seen`: 이번 라운드에 판에 나온 단계(은은히 맥동). - `paid`: 정산에서 지급이 확인된 단계(밝게 켜진다).
 * 허브 잭팟(상단바 알약)과 섞이지 않도록 머리표를 «보물»로 둔다. 규칙 설명은 여기 쓰지 않는다(도움말 페이지 몫).
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { formatCoinAmount } from '../../lib/coinFormat'
import type { RespinView, TreasureTier } from '../../store/coinRespin'

type RibbonTier = TreasureTier | 'top'

interface TreasureRibbonProps {
  math: GameMath
  /** 지금 베팅(총 베팅액). 프리스핀이 없는 게임이라 늘 셀렉터 값이다. */
  bet: number
  /** `theme.props`. 그림이 없으면 색 점으로 대신한다. */
  props?: Record<string, string> | undefined
  view: Pick<RespinView, 'seen' | 'paid' | 'topPaid'> & Partial<Pick<RespinView, 'topShowing'>>
  locale: Locale
}

const ICON_KEY: Record<RibbonTier, string> = {
  small: 'coin-small',
  medium: 'coin-medium',
  large: 'coin-large',
  top: 'treasure-top',
}

export function TreasureRibbon({ math, bet, props, view, locale }: TreasureRibbonProps): ReactNode {
  const t = useT()
  const config = math.coinRespin
  if (config === undefined) return null

  const names: Record<RibbonTier, string> = {
    small: t('coinRespinTreasureSmall'),
    medium: t('coinRespinTreasureMedium'),
    large: t('coinRespinTreasureLarge'),
    top: t('coinRespinTreasureTop'),
  }
  const fullNames: Record<RibbonTier, string> = {
    small: t('coinRespinTreasureSmallFull'),
    medium: t('coinRespinTreasureMediumFull'),
    large: t('coinRespinTreasureLargeFull'),
    top: t('coinRespinTreasureTopFull'),
  }
  const tiers: readonly RibbonTier[] = ['small', 'medium', 'large', 'top']

  return (
    <div
      className="hub-treasure"
      role="list"
      aria-label={t('coinRespinTreasureTitle')}
      data-top={view.topShowing === true ? 'true' : undefined}
    >
      <span className="hub-treasure__title" aria-hidden="true">
        {t('coinRespinTreasureTitle')}
      </span>
      {tiers.map((tier) => {
        const amount = Math.round(config.treasures[tier] * bet)
        const paid = tier === 'top' ? view.topPaid : view.paid.includes(tier)
        const seen = tier !== 'top' && view.seen.includes(tier)
        const showing = tier === 'top' && view.topShowing === true
        const state = showing ? 'showing' : paid ? 'paid' : seen ? 'seen' : 'idle'
        const icon = props?.[ICON_KEY[tier]]
        return (
          <span
            key={tier}
            role="listitem"
            className={`hub-treasure__chip hub-treasure__chip--${tier}`}
            data-state={state}
            aria-label={`${fullNames[tier]} ${amount.toLocaleString('en-US')}`}
          >
            {icon ? (
              <img className="hub-treasure__icon" src={icon} alt="" width={22} height={22} />
            ) : (
              <span className="hub-treasure__dot" aria-hidden="true" />
            )}
            <span className="hub-treasure__text">
              <span className="hub-treasure__name">{names[tier]}</span>
              <span className="hub-treasure__amount">
                {showing ? '+' : ''}
                {formatCoinAmount(amount, locale)}
              </span>
            </span>
          </span>
        )
      })}
    </div>
  )
}
