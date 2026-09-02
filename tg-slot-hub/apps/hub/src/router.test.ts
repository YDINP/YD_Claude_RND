import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { navigate, navigateToGame, navigateToLobby, parseHash, useRoute } from './router'

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
