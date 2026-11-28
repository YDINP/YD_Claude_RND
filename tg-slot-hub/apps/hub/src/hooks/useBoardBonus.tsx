/**
 * GameScreen ↔ 말판 보너스 연결 훅.
 *
 * 스토어(`store/game.ts`)는 말판이 있는 판에서 릴·라인 연출이 끝나면 `boardPlay`를 세우고 **재생이 끝날 때까지 그 판을
 * 멈춰 세운다**(오토스핀 재개·잔액 공개·빅윈 모두 그 뒤). 이 훅은 그 신호를 받아 화면을 맡는다:
 *
 *   idle ─(boardPlay)→ entering(진입 커튼) ─덮임→ 말판 장착·캔버스 일시정지 ─걷힘→ playing(말판 재생)
 *        ─([받기])→ exiting(복귀 커튼) ─덮임→ 말판 해제·캔버스 재개·WinStrip 합계 ─끝→ finishBoard()
 *
 * 렌더러 `setMode`는 쓰지 않는다 — 프리스핀 명판·금테까지 바꾸기 때문이다. 커튼은 `BoardCurtain`이 허브 DOM에서
 * 테마의 전환 클립을 틀고, 배경음 덕킹도 이 훅이 같은 시각에 직접 부른다.
 *
 * 새로고침 복원: 응답을 받는 즉시 저장한 스냅숏(localStorage)을 게임 화면이 열릴 때 읽어 `replayBoard`로 검증하고, 맞으면
 * 보던 던지기부터 이어서 재생한다(커튼 없이 곧장). 어긋나면 재생 없이 버리고 진단 로그만 남긴다 — 지갑은 서버 값 그대로다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Theme } from '@tgslot/renderer'
import { useGameStore } from '../store/game'
import { useSettingsStore } from '../store/settings'
import { useSessionStore } from '../store/session'
import { BoardBonus } from '../components/game/board/BoardBonus'
import { BoardCurtain } from '../components/game/board/BoardCurtain'
import { BoardErrorBoundary } from '../components/game/board/BoardErrorBoundary'
import { acquireClip, type ClipLease } from '../components/game/board/curtainClip'
import { boardSfx } from '../components/game/board/boardSfx'
import { boardLayout } from '../components/game/board/yutLayout'
import { bgmModeTransition, setBgmMode } from '../lib/audio'
import { clearBoardSnapshot, loadBoardSnapshot, markBoardProgress, verifyBoardFeature } from '../game/boardPlayback'

interface UseBoardBonusArgs {
  gameId: string
  theme: Theme | null
  /** 테마 로딩이 실패했어도(그래픽 없음) 말판은 코드 그림으로 돌 수 있다. 복원을 시도해도 되는 시점인지. */
  themeSettled: boolean
  /** 말판 진입·종료 때 WinStrip 금액을 올린다(올리기만 한다 — 내려가지 않는다). */
  /** 마지막 인자는 말판 정산(끝남) 때만 온다: 말판 몫 코인. */
  onWinStrip: (value: number, ms: number, boardWin?: number) => void
}

export interface BoardBonusController {
  /** GameScreen이 JSX 끝에 그대로 놓는 오버레이(커튼 + 말판). */
  overlay: ReactNode
  /** 말판이 재생 중이거나 전환 중인가(스핀·베팅 입력을 막는다). */
  active: boolean
}

type Stage = 'idle' | 'entering' | 'playing' | 'exiting'

export function useBoardBonus({ gameId, theme, themeSettled, onWinStrip }: UseBoardBonusArgs): BoardBonusController {
  const math = useGameStore((s) => s.math)
  const boardPlay = useGameStore((s) => s.boardPlay)
  const renderer = useGameStore((s) => s.renderer)
  const phase = useGameStore((s) => s.phase)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  const spinSpeed = useSettingsStore((s) => s.spinSpeed)

  const config = math?.boardBonus
  const layout = useMemo(() => (config === undefined ? null : boardLayout(config.layout)), [config])

  const [stage, setStage] = useState<Stage>('idle')
  const [mounted, setMounted] = useState(false)
  const [started, setStarted] = useState(false)
  const [clipUrls, setClipUrls] = useState<{ enter: string | null; exit: string | null }>({ enter: null, exit: null })
  const leases = useRef<ClipLease[]>([])
  const attemptedResume = useRef(false)
  const onWinStripRef = useRef(onWinStrip)
  onWinStripRef.current = onWinStrip

  // 말판 화면이 붙어 있는 동안에만 spin()이 말판 재생을 열고 기다린다. 좌표표가 없으면 열 수 없으니 붙지 않는다.
  useEffect(() => {
    const ready = config !== undefined && layout !== null
    useGameStore.getState().setBoardPlayerReady(ready)
    if (config !== undefined && layout === null) {
      console.error(`[board] 말판 좌표표(${config.layout})가 없어 말판 화면을 열 수 없다`)
    }
    return () => useGameStore.getState().setBoardPlayerReady(false)
  }, [config, layout])

  // 전환 클립은 게임 화면이 열릴 때 Blob으로 미리 받아 둔다(덮이는 순간에 첫 프레임이 있어야 한다).
  useEffect(() => {
    if (config === undefined || theme === null) return
    const enter = acquireClip(theme.transitions?.freeSpinsEnter?.src)
    const exit = acquireClip(theme.transitions?.freeSpinsExit?.src)
    leases.current = [enter, exit]
    let live = true
    // 못 받았으면(null) 바꿀 것이 없다 — 단색 커튼으로 간다.
    void enter.ready.then((url) => url !== null && live && setClipUrls((prev) => ({ ...prev, enter: url })))
    void exit.ready.then((url) => url !== null && live && setClipUrls((prev) => ({ ...prev, exit: url })))
    return () => {
      live = false
      enter.release()
      exit.release()
      leases.current = []
      setClipUrls({ enter: null, exit: null })
    }
  }, [config, theme])

  // 새 재생 요청 → 진입. 복원이면 커튼 없이 곧장 말판을 올린다.
  useEffect(() => {
    if (boardPlay === null || stage !== 'idle') return
    if (boardPlay.resumeShown !== undefined) {
      renderer?.setPaused?.(true)
      setBgmMode('freeSpins')
      setMounted(true)
      setStarted(true)
      setStage('playing')
      return
    }
    setStarted(false)
    setStage('entering')
  }, [boardPlay, stage, renderer])

  // 재생 요청이 사라졌는데(화면 이탈·reset) 아직 말판이 떠 있으면 거둔다.
  useEffect(() => {
    if (boardPlay !== null || stage === 'idle') return
    renderer?.setPaused?.(false)
    setBgmMode('base')
    setMounted(false)
    setStarted(false)
    setStage('idle')
  }, [boardPlay, stage, renderer])

  // 언마운트: 캔버스를 다시 돌리고 배경음을 평소로 돌려놓는다.
  useEffect(
    () => () => {
      useGameStore.getState().renderer?.setPaused?.(false)
    },
    [],
  )

  // 새로고침 복원 — 게임 화면이 열리고 한 번만, 판이 비어 있을 때.
  useEffect(() => {
    if (attemptedResume.current) return
    if (config === undefined || layout === null || !themeSettled || phase !== 'idle') return
    attemptedResume.current = true
    // 다른 계정이 이 기기에 남긴 판은 버린다(키는 게임별 하나라 계정을 바꾸면 남의 판이 보일 수 있다).
    const snapshot = loadBoardSnapshot(gameId, Date.now(), undefined, useSessionStore.getState().user?.id ?? null)
    if (snapshot === null) return
    const verdict = verifyBoardFeature(config, snapshot.feature, snapshot.totalBet)
    if (!verdict.ok) {
      console.warn('[board] 복원 스냅숏이 서버 규칙과 맞지 않아 버린다', verdict.reasons)
      clearBoardSnapshot(gameId)
      return
    }
    useGameStore.getState().resumeBoard({
      roundId: snapshot.roundId,
      feature: snapshot.feature,
      totalBet: snapshot.totalBet,
      // 라운드 합계(라인 + 초롱 + 말판)를 WinStrip에 올린다. 옛 스냅숏(합계 없음)은 말판 몫만(지갑은 이미 서버 값).
      totalWin: snapshot.totalWin ?? snapshot.feature.win,
      resumeShown: snapshot.shown === 'done' ? snapshot.feature.throws.length : snapshot.shown,
      auto: false,
    })
  }, [config, layout, themeSettled, phase, gameId])

  const resumed = boardPlay?.resumeShown !== undefined

  const handleEnterStart = useCallback(() => {
    boardSfx.feature()
    bgmModeTransition('freeSpins', 'start')
  }, [])

  const handleEnterCovered = useCallback(() => {
    useGameStore.getState().renderer?.setPaused?.(true)
    setMounted(true)
    const play = useGameStore.getState().boardPlay
    // 착지 때 보이던 합계는 라인뿐이다(렌더러가 스캐터 배당은 안 센다) — 지갑에 이미 들어간 초롱 몫까지 올려 둔다.
    if (play !== null && play.totalWin > 0) onWinStripRef.current(Math.max(0, play.totalWin - play.feature.win), 0)
  }, [])

  const handleEnterReveal = useCallback(() => {
    setStarted(true)
    bgmModeTransition('freeSpins', 'end')
  }, [])

  const handleEnterDone = useCallback(() => {
    setStage('playing')
  }, [])

  const handleExit = useCallback(() => {
    setStage('exiting')
  }, [])

  const handleExitStart = useCallback(() => {
    bgmModeTransition('base', 'start')
  }, [])

  const handleExitCovered = useCallback(() => {
    useGameStore.getState().renderer?.setPaused?.(false)
    setMounted(false)
    setStarted(false)
    const play = useGameStore.getState().boardPlay
    // 요약 뒤 WinStrip이 라인 + 초롱 + 말판 합계까지 오른다.
    if (play !== null && play.totalWin > 0) onWinStripRef.current(play.totalWin, 900, play.feature.win)
  }, [])

  const handleExitReveal = useCallback(() => {
    bgmModeTransition('base', 'end')
  }, [])

  const handleExitDone = useCallback(() => {
    setStage('idle')
    useGameStore.getState().finishBoard()
  }, [])

  const handleProgress = useCallback(
    (shown: number | 'done') => {
      const play = useGameStore.getState().boardPlay
      if (play !== null) markBoardProgress(gameId, play.roundId, shown)
    },
    [gameId],
  )

  // 안전장치: 말판·커튼이 그리다 죽으면 화면을 접고 finishBoard()로 spin()의 기다림을 푼다(결과·지갑은 서버가 이미 정했다).
  const handleFail = useCallback(() => {
    const play = useGameStore.getState().boardPlay
    useGameStore.getState().renderer?.setPaused?.(false)
    setBgmMode('base')
    setMounted(false)
    setStarted(false)
    setStage('idle')
    if (play !== null) {
      markBoardProgress(gameId, play.roundId, 'done')
      if (play.totalWin > 0) onWinStripRef.current(play.totalWin, 0, play.feature.win)
    }
    useGameStore.getState().finishBoard()
  }, [gameId])

  const bgUrl = theme?.backgroundFreeSpins
  const clipEnter = theme?.transitions?.freeSpinsEnter
  const clipExit = theme?.transitions?.freeSpinsExit

  const overlay: ReactNode =
    boardPlay === null || config === undefined || layout === null ? null : (
      <BoardErrorBoundary key={boardPlay.roundId} onFail={handleFail}>
        {mounted && (
          <BoardBonus
            key={boardPlay.roundId}
            feature={boardPlay.feature}
            config={config}
            layout={layout}
            totalBet={boardPlay.totalBet}
            symbols={theme?.symbols}
            bgUrl={bgUrl}
            speed={spinSpeed}
            reducedMotion={reducedMotion}
            auto={boardPlay.auto}
            {...(boardPlay.resumeShown === undefined ? {} : { resumeShown: boardPlay.resumeShown })}
            started={started || resumed}
            onProgress={handleProgress}
            onExit={handleExit}
          />
        )}
        {stage === 'entering' && (
          <BoardCurtain
            mode="enter"
            clip={clipEnter}
            clipUrl={clipUrls.enter}
            reducedMotion={reducedMotion}
            speed={spinSpeed}
            onStart={handleEnterStart}
            onCovered={handleEnterCovered}
            onReveal={handleEnterReveal}
            onDone={handleEnterDone}
          />
        )}
        {stage === 'exiting' && (
          <BoardCurtain
            mode="exit"
            clip={clipExit}
            clipUrl={clipUrls.exit}
            reducedMotion={reducedMotion}
            speed={spinSpeed}
            onStart={handleExitStart}
            onCovered={handleExitCovered}
            onReveal={handleExitReveal}
            onDone={handleExitDone}
          />
        )}
      </BoardErrorBoundary>
    )

  return { overlay, active: boardPlay !== null }
}
