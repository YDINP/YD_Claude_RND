/**
 * 앱 루트 — 세션 상태에 따라 화면을 라우팅한다.
 * idle/authing → Loading, outside → OutsideTelegram, error(또는 유저 정보 없음) → ErrorView,
 * ready → 헤더 + 레벨 바 + (로비 | 미션 | 리더보드) + 하단 탭. play 라우트는 게임 화면을 전체 화면으로 띄운다.
 */
import { useEffect, type ReactNode } from 'react'
import { useSessionStore } from './store/session'
import { useGamesStore } from './store/games'
import { useHubStore } from './store/hub'
import { Header } from './components/Header'
import { Lobby } from './components/Lobby'
import { Loading } from './components/Loading'
import { ErrorView } from './components/ErrorView'
import { OutsideTelegram } from './components/OutsideTelegram'
import { GameScreen } from './components/game/GameScreen'
import { LevelBar } from './components/hub/LevelBar'
import { BottomTabs } from './components/hub/BottomTabs'
import { MissionsScreen } from './components/hub/MissionsScreen'
import { LeaderboardScreen } from './components/hub/LeaderboardScreen'
import { useRoute, navigateToGame } from './router'
import { useEffectiveLocale } from './i18n'
import './styles/tokens.css'
import './styles/global.css'

export function App(): ReactNode {
  const status = useSessionStore((s) => s.status)
  const user = useSessionStore((s) => s.user)
  const wallet = useSessionStore((s) => s.wallet)
  const errorMessage = useSessionStore((s) => s.errorMessage)
  const bootstrap = useSessionStore((s) => s.bootstrap)

  const gamesStatus = useGamesStore((s) => s.status)
  const games = useGamesStore((s) => s.games)
  const gamesErrorMessage = useGamesStore((s) => s.errorMessage)
  const loadGames = useGamesStore((s) => s.load)

  const hubStatus = useHubStore((s) => s.status)
  const levelInfo = useHubStore((s) => s.levelInfo)
  const loadHub = useHubStore((s) => s.loadAll)

  const route = useRoute()
  const effectiveLocale = useEffectiveLocale()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (status === 'ready' && gamesStatus === 'idle') {
      void loadGames()
    }
  }, [status, gamesStatus, loadGames])

  useEffect(() => {
    if (status === 'ready' && hubStatus === 'idle') {
      void loadHub()
    }
  }, [status, hubStatus, loadHub])

  if (status === 'idle' || status === 'authing') {
    return <Loading />
  }

  if (status === 'outside') {
    return <OutsideTelegram />
  }

  if (status === 'error' || !user || !wallet) {
    return <ErrorView message={errorMessage ?? undefined} onRetry={() => void bootstrap()} />
  }

  if (route.name === 'play') {
    return (
      <div className="hub-app">
        {/* key={gameId}: 게임을 바꿔 타면(리로드 없이) 완전히 새로 마운트되게 강제한다.
            gameId prop만 바뀌면 같은 인스턴스가 재사용돼 "새 gameId + 이전 게임의 math"로
            렌더러 세팅 effect가 한 틱 잘못 돌거나(테마/수학 불일치 ThemeError), WinStrip 같은
            컴포넌트 로컬 state(승리 금액 등)가 그대로 남는 문제가 있었다 — 리마운트로 둘 다
            한번에 해결한다(store reset도 언마운트 cleanup에서 새 마운트보다 먼저 실행됨). */}
        <GameScreen key={route.gameId} gameId={route.gameId} />
      </div>
    )
  }

  return (
    <div className="hub-app">
      <Header user={user} wallet={wallet} />
      <LevelBar levelInfo={levelInfo} />
      <div className="hub-app__content">
        {route.name === 'missions' ? (
          <MissionsScreen />
        ) : route.name === 'leaderboard' ? (
          <LeaderboardScreen />
        ) : gamesStatus === 'error' ? (
          <ErrorView message={gamesErrorMessage ?? undefined} onRetry={() => void loadGames()} />
        ) : gamesStatus === 'loading' || gamesStatus === 'idle' ? (
          <Loading />
        ) : (
          <Lobby games={games} locale={effectiveLocale} onPlay={navigateToGame} />
        )}
      </div>
      <BottomTabs />
    </div>
  )
}
