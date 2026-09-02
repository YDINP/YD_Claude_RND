/**
 * 앱 루트 — 세션 상태에 따라 화면을 라우팅한다.
 * idle/authing → Loading, outside → OutsideTelegram, error(또는 유저 정보 없음) → ErrorView,
 * ready → 헤더 + 로비(게임 목록은 별도 로딩 상태를 갖는다).
 */
import { useEffect, type ReactNode } from 'react'
import { useSessionStore } from './store/session'
import { useGamesStore } from './store/games'
import { Header } from './components/Header'
import { Lobby } from './components/Lobby'
import { Loading } from './components/Loading'
import { ErrorView } from './components/ErrorView'
import { OutsideTelegram } from './components/OutsideTelegram'
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

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (status === 'ready' && gamesStatus === 'idle') {
      void loadGames()
    }
  }, [status, gamesStatus, loadGames])

  if (status === 'idle' || status === 'authing') {
    return <Loading />
  }

  if (status === 'outside') {
    return <OutsideTelegram />
  }

  if (status === 'error' || !user || !wallet) {
    return <ErrorView message={errorMessage ?? undefined} onRetry={() => void bootstrap()} />
  }

  return (
    <div className="hub-app">
      <Header user={user} wallet={wallet} />
      {gamesStatus === 'error' ? (
        <ErrorView message={gamesErrorMessage ?? undefined} onRetry={() => void loadGames()} />
      ) : gamesStatus === 'loading' || gamesStatus === 'idle' ? (
        <Loading />
      ) : (
        <Lobby games={games} locale={user.locale} />
      )}
    </div>
  )
}
