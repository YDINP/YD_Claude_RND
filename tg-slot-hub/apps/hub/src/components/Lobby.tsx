/**
 * 로비 화면 — 잭팟 바(실시간) + 보너스 3종 타일 + 게임 카드 그리드(2열).
 * 잭팟 폴링은 이 화면이 마운트돼 있는 동안만 돈다 (언마운트 시 정지).
 */
import { useEffect, type ReactNode } from 'react'
import type { GameSummary, Locale } from '@tgslot/shared'
import { GameCard } from './GameCard'
import { JackpotBar } from './hub/JackpotBar'
import { BonusRow } from './hub/BonusRow'
import { useHubStore } from '../store/hub'
import { t } from '../i18n'
import './Lobby.css'

interface LobbyProps {
  games: GameSummary[]
  locale: Locale
  onPlay?: (gameId: string) => void
}

export function Lobby({ games, locale, onPlay }: LobbyProps): ReactNode {
  const jackpot = useHubStore((s) => s.jackpot)
  const startJackpotPolling = useHubStore((s) => s.startJackpotPolling)
  const stopJackpotPolling = useHubStore((s) => s.stopJackpotPolling)

  useEffect(() => {
    startJackpotPolling()
    return () => stopJackpotPolling()
  }, [startJackpotPolling, stopJackpotPolling])

  const sorted = [...games].sort((a, b) => a.sort - b.sort)

  return (
    <div className="hub-lobby">
      <JackpotBar jackpot={jackpot} />
      <BonusRow />
      <h2 className="hub-lobby__title">{t(locale, 'lobbyTitle')}</h2>
      <div className="hub-lobby__grid">
        {sorted.map((game) => (
          <GameCard key={game.id} game={game} locale={locale} onPlay={onPlay} />
        ))}
      </div>
    </div>
  )
}
