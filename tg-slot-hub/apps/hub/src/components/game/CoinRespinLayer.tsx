/**
 * 코인 리스핀 화면 층 — 보물 띠와 리스핀 HUD를 한 묶음으로 배치한다(릴 캔버스 바로 위, 높이 고정).
 *
 * 값은 전부 `store/coinRespin.ts`(렌더러 이벤트를 접은 표시용 진행)에서 읽는다. 공용 `GameScreen.tsx`에는 이 컴포넌트를
 * 마운트하는 몇 줄만 두고 로직은 여기와 새 파일에 모았다(세 팀이 함께 고치는 파일이라 충돌을 줄이려는 것이다).
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useCoinRespinStore } from '../../store/coinRespin'
import { RespinHud } from './RespinHud'
import { TreasureRibbon } from './TreasureRibbon'
import './CoinRespinHud.css'

interface CoinRespinLayerProps {
  math: GameMath
  bet: number
  props?: Record<string, string> | undefined
  locale: Locale
}

export function CoinRespinLayer({ math, bet, props, locale }: CoinRespinLayerProps): ReactNode {
  const view = useCoinRespinStore((state) => state.view)
  if (math.coinRespin === undefined) return null
  return (
    <div className="hub-coin-hud">
      <TreasureRibbon math={math} bet={bet} props={props} view={view} locale={locale} />
      <RespinHud view={view} locale={locale} />
    </div>
  )
}
