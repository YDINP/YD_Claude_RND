import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameSummary } from '@tgslot/shared'
import { GameCard } from './GameCard'

const baseGame: GameSummary = {
  id: 'classic-777',
  name: { en: 'Classic 777', ko: '클래식 777' },
  thumbnail: '/games/classic-777/thumb.svg',
  status: 'live',
  reels: 3,
  rows: 3,
  lines: 5,
  minBet: 10,
  maxBet: 1000,
  sort: 0,
}

describe('GameCard', () => {
  it('renders the Korean localized name for the ko locale', () => {
    render(<GameCard game={baseGame} locale="ko" />)
    expect(screen.getByText('클래식 777')).toBeInTheDocument()
  })

  it('renders the English name for the en locale', () => {
    render(<GameCard game={baseGame} locale="en" />)
    expect(screen.getByText('Classic 777')).toBeInTheDocument()
  })

  it('falls back to the English name when no Korean name is provided', () => {
    const game: GameSummary = { ...baseGame, name: { en: 'Fruit Fiesta' } }
    render(<GameCard game={game} locale="ko" />)
    expect(screen.getByText('Fruit Fiesta')).toBeInTheDocument()
  })

  it('shows the Coming soon badge and disables Play when status is soon', () => {
    render(<GameCard game={{ ...baseGame, status: 'soon' }} locale="en" />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0)
  })

  it('enables Play and calls onPlay for a live game', () => {
    const onPlay = vi.fn()
    render(<GameCard game={baseGame} locale="en" onPlay={onPlay} />)
    const button = screen.getByRole('button', { name: 'Play' })
    expect(button).not.toBeDisabled()
    button.click()
    expect(onPlay).toHaveBeenCalledWith('classic-777')
  })
})
