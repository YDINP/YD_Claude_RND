import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  navigate,
  navigateToGame,
  navigateToLeaderboard,
  navigateToLobby,
  navigateToMissions,
  parseHash,
  useRoute,
} from './router'

function resetHash(): void {
  window.location.hash = ''
}

describe('parseHash', () => {
  it('parses the empty hash as lobby', () => {
    expect(parseHash('')).toEqual({ name: 'lobby' })
  })

  it('parses "#/" as lobby', () => {
    expect(parseHash('#/')).toEqual({ name: 'lobby' })
  })

  it('parses "#/play/:gameId" as a play route', () => {
    expect(parseHash('#/play/classic-777')).toEqual({ name: 'play', gameId: 'classic-777' })
  })

  it('decodes an encoded gameId', () => {
    expect(parseHash('#/play/fruit%20fiesta')).toEqual({ name: 'play', gameId: 'fruit fiesta' })
  })

  it('falls back to lobby for an unrecognized path', () => {
    expect(parseHash('#/unknown')).toEqual({ name: 'lobby' })
  })

  it('falls back to lobby when the gameId segment is empty', () => {
    expect(parseHash('#/play/')).toEqual({ name: 'lobby' })
  })

  it('strips a trailing query string (e.g. "?debug=1") before matching the path', () => {
    expect(parseHash('#/play/shiba-shrine?debug=1')).toEqual({ name: 'play', gameId: 'shiba-shrine' })
  })

  it('strips a query string from the lobby/missions/leaderboard paths too', () => {
    expect(parseHash('#/?debug=1')).toEqual({ name: 'lobby' })
    expect(parseHash('#/missions?debug=1')).toEqual({ name: 'missions' })
    expect(parseHash('#/leaderboard?debug=1')).toEqual({ name: 'leaderboard' })
  })

  it('parses "#/missions" as the missions route', () => {
    expect(parseHash('#/missions')).toEqual({ name: 'missions' })
  })

  it('parses "#/leaderboard" as the leaderboard route', () => {
    expect(parseHash('#/leaderboard')).toEqual({ name: 'leaderboard' })
  })
})

describe('navigate helpers', () => {
  afterEach(() => {
    resetHash()
  })

  it('navigate() sets window.location.hash', () => {
    navigate('/play/classic-777')
    expect(window.location.hash).toBe('#/play/classic-777')
  })

  it('navigateToLobby() sets the hash to root', () => {
    navigate('/play/classic-777')
    navigateToLobby()
    expect(window.location.hash).toBe('#/')
  })

  it('navigateToGame() encodes the gameId', () => {
    navigateToGame('fruit fiesta')
    expect(window.location.hash).toBe('#/play/fruit%20fiesta')
  })

  it('navigateToMissions() sets the hash to /missions', () => {
    navigateToMissions()
    expect(window.location.hash).toBe('#/missions')
  })

  it('navigateToLeaderboard() sets the hash to /leaderboard', () => {
    navigateToLeaderboard()
    expect(window.location.hash).toBe('#/leaderboard')
  })
})

describe('useRoute', () => {
  afterEach(() => {
    resetHash()
  })

  it('returns the current route and updates on hashchange', async () => {
    resetHash()
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'lobby' })

    // jsdom은 hashchange를 다음 태스크로 비동기 디스패치한다 — waitFor로 반영을 기다린다.
    act(() => {
      navigateToGame('classic-777')
    })

    await waitFor(() => {
      expect(result.current).toEqual({ name: 'play', gameId: 'classic-777' })
    })
  })
})
