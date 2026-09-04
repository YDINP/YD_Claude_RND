/**
 * 해시 기반 라우터 — 별도 라이브러리 없이 최소 구현.
 * `#/` = 로비, `#/play/:gameId` = 게임 화면, `#/missions` = 미션, `#/leaderboard` = 리더보드.
 */
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'lobby' }
  | { name: 'play'; gameId: string }
  | { name: 'missions' }
  | { name: 'leaderboard' }

const PLAY_PATH_RE = /^\/play\/([^/]+)\/?$/

/** 순수 함수로 분리 — 테스트하기 쉽고 useRoute()와 currentRoute()가 공유한다. */
export function parseHash(hash: string): Route {
  const full = hash.replace(/^#/, '') || '/'
  // 해시에 쿼리스트링이 붙을 수 있다(예: "#/play/shiba-shrine?debug=1" — 디버그 패널 진입).
  // 경로 매칭은 항상 '?' 앞부분만 본다. 쿼리 자체는 이 라우터의 관심사가 아니다 —
  // 필요한 화면(GameScreen)이 window.location.hash를 직접 다시 읽어 쓴다.
  const path = full.split('?')[0] || '/'
  const match = PLAY_PATH_RE.exec(path)
  if (match) {
    const gameId = decodeURIComponent(match[1] ?? '')
    if (gameId) return { name: 'play', gameId }
  }
  if (/^\/missions\/?$/.exec(path)) return { name: 'missions' }
  if (/^\/leaderboard\/?$/.exec(path)) return { name: 'leaderboard' }
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

export function navigateToMissions(): void {
  navigate('/missions')
}

export function navigateToLeaderboard(): void {
  navigate('/leaderboard')
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
