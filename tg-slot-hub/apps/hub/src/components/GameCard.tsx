/**
 * 로비 게임 카드 — 썸네일(로드 실패 시 그라데이션 폴백), 이름, 릴 사양, 플레이 버튼.
 * locale을 이미 prop으로 받으므로 t()를 직접 호출한다 (세션 스토어에 의존하지 않아 테스트가 쉽다).
 */
import { useState, type ReactNode } from 'react'
import type { GameSummary, Locale } from '@tgslot/shared'
import { t } from '../i18n'
import './GameCard.css'

interface GameCardProps {
  game: GameSummary
  locale: Locale
  onPlay?: (gameId: string) => void
}

/**
 * 릴 사양 문구. 클러스터(`lines`가 0)는 `Cluster N+`, ways(페이라인이 이렇게 많은 팩은 없다)는 `N ways`.
 * 요약에 `payModel`/`minCluster`가 실려 오면 그 값이 우선이다.
 */
export function specLabel(game: GameSummary & { payModel?: 'lines' | 'ways' | 'cluster'; minCluster?: number }): string {
  const grid = `${game.reels}×${game.rows}`
  const model = game.payModel ?? (game.lines === 0 ? 'cluster' : game.lines >= 100 ? 'ways' : 'lines')
  if (model === 'cluster') return `${grid} · Cluster ${game.minCluster ?? 5}+`
  if (model === 'ways') return `${grid} · ${game.lines} ways`
  return `${grid} · ${game.lines} lines`
}

function localizedName(game: GameSummary, locale: Locale): string {
  if (locale === 'ko' && game.name.ko) return game.name.ko
  return game.name.en
}

export function GameCard({ game, locale, onPlay }: GameCardProps): ReactNode {
  const [thumbFailed, setThumbFailed] = useState(false)
  const isSoon = game.status === 'soon'
  const name = localizedName(game, locale)

  return (
    <div className="hub-game-card" data-status={game.status}>
      <div className="hub-game-card__thumb-wrap">
        {!thumbFailed ? (
          <img
            className="hub-game-card__thumb"
            src={game.thumbnail}
            alt={name}
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="hub-game-card__thumb-fallback" aria-hidden="true">
            <span>{name}</span>
          </div>
        )}
        {isSoon && <span className="hub-game-card__badge">{t(locale, 'comingSoon')}</span>}
      </div>
      <div className="hub-game-card__body">
        <span className="hub-game-card__name">{name}</span>
        <span className="hub-game-card__spec">
          {specLabel(game)}
        </span>
        <button
          type="button"
          className="hub-game-card__play"
          disabled={isSoon}
          onClick={() => onPlay?.(game.id)}
        >
          {isSoon ? t(locale, 'comingSoon') : t(locale, 'play')}
        </button>
      </div>
    </div>
  )
}
