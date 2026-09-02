/**
 * 로비 화면 — 잭팟 배너(placeholder) + 게임 카드 그리드(2열).
 */
import type { ReactNode } from 'react'
import type { GameSummary, Locale } from '@tgslot/shared'
import { GameCard } from './GameCard'
import { t } from '../i18n'
import './Lobby.css'

interface LobbyProps {
  games: GameSummary[]
  locale: Locale
  onPlay?: (gameId: string) => void
}

// TODO(Phase 3): 실제 프로그레시브 잭팟 API 연동 전까지 표시하는 정적 placeholder 값.
// UI에는 노출하지 않고 코드 주석으로만 placeholder임을 표시한다.
const JACKPOT_PLACEHOLDER_VALUE = 128_450

export function Lobby({ games, locale, onPlay }: LobbyProps): ReactNode {
  const sorted = [...games].sort((a, b) => a.sort - b.sort)

  return (
    <div className="hub-lobby">
      <div className="hub-lobby__jackpot" role="status">
        <span className="hub-lobby__jackpot-label">{t(locale, 'jackpot')}</span>
        <span className="hub-lobby__jackpot-value">
          {JACKPOT_PLACEHOLDER_VALUE.toLocaleString('en-US')}
        </span>
      </div>
      <h2 className="hub-lobby__title">{t(locale, 'lobbyTitle')}</h2>
      <div className="hub-lobby__grid">
        {sorted.map((game) => (
          <GameCard key={game.id} game={game} locale={locale} onPlay={onPlay} />
        ))}
      </div>
    </div>
  )
}
