/**
 * 해시 기반 라우터 — 별도 라이브러리 없이 최소 구현.
 * `#/` = 로비, `#/play/:gameId` = 게임 화면.
 */
import { useEffect, useState } from 'react'

export type Route = { name: 'lobby' } | { name: 'play'; gameId: string }

const PLAY_PATH_RE = /^\/play\/([^/]+)\/?$/

/** 순수 함수로 분리 — 테스트하기 쉽고 useRoute()와 currentRoute()가 공유한다. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  const match = PLAY_PATH_RE.exec(path)
  if (match) {
    const gameId = decodeURIComponent(match[1] ?? '')
    if (gameId) return { name: 'play', gameId }
  }
  return { name: 'lobby' }
}

function currentRoute(): Route {
  if (typeof window === 'undefined') return { name: 'lobby' }
  return parseHash(window.location.hash)
}

/** 임의 경로(예: '/', '/play/classic-777')로 이동한다. */
export function navigate(path: string): void {
  if (typeof window === 'undefined') return
  window.location.hash = path
}

export function navigateToLobby(): void {
  navigate('/')
}

export function navigateToGame(gameId: string): void {
  navigate(`/play/${encodeURIComponent(gameId)}`)
}

/** 현재 해시 라우트를 구독하는 훅. hashchange 이벤트에 반응해 리렌더한다. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => currentRoute())

  useEffect(() => {
    const onHashChange = (): void => setRoute(currentRoute())
    // 마운트 시점에 이미 해시가 초기 상태와 달라졌을 수 있으므로 한 번 동기화한다.
    onHashChange()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}
