/**
 * 게임 화면 — 상단바(뒤로/게임명/지갑) + 릴 캔버스 + 등급 배너(단어만) + WinStrip(실제 금액) +
 * 베팅 셀렉터(+베팅 목록 시트) + 스핀 버튼 + 도움말 시트(배당표/페이라인/피처/공정성 탭) +
 * 코인 소진 시트.
 * 스핀 결과와 잔액은 항상 서버 값(store/game.ts의 spin())을 그대로 반영한다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  createSlotRenderer,
  loadTheme,
  type SlotRenderer,
  type Theme,
  type WinTier,
  type RendererEvent,
} from '@tgslot/renderer'
import { createSeededRng, spin as replaySpin } from '@tgslot/slot-engine'
import type { GambleSide } from '@tgslot/shared'
import { useGameStore, toRendererFreeSpinsMode } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { navigateToLobby } from '../../router'
import { showBackButton, hideBackButton, haptic } from '../../sdk/tma'
import { getRoundSeed } from '../../sdk/api'
import { Odometer } from '../Odometer'
import { useT, useEffectiveLocale } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { winTierLabelKey, resolveWinTier, WIN_HOLD_MS } from '../../lib/winTier'
import { groupLabel, groupMembers, symbolLabel } from '../../game/labels'
import { useDialog } from '../../hooks/useDialog'
import { WinStrip } from './WinStrip'
import { GambleModal } from './GambleModal'
import './GameScreen.css'

interface GameScreenProps {
  gameId: string
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

type VerifyState = 'idle' | 'checking' | 'done' | 'error'

interface VerifyResult {
  hashMatch: boolean
  stopsMatch: boolean
}

function stopsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/** 남은 시간(ms)을 "M:SS"로 짧게 보여준다 — 더블업 제안 만료 카운트다운용. */
function formatGambleCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type HelpPage = 'paytable' | 'paylines' | 'features' | 'fairness'

const HELP_PAGE_KEY_PREFIX = 'tgslot.helpPage.'

function readStoredHelpPage(gameId: string): HelpPage | null {
  try {
    const raw = localStorage.getItem(`${HELP_PAGE_KEY_PREFIX}${gameId}`)
    return raw === 'paytable' || raw === 'paylines' || raw === 'features' || raw === 'fairness' ? raw : null
  } catch {
    return null
  }
}

function writeStoredHelpPage(gameId: string, page: HelpPage): void {
  try {
    localStorage.setItem(`${HELP_PAGE_KEY_PREFIX}${gameId}`, page)
  } catch {
    /* localStorage 접근 불가 — 기억 없이 계속 진행 */
  }
}

export function GameScreen({ gameId }: GameScreenProps): ReactNode {
  const t = useT()
  const token = useSessionStore((s) => s.token)
  const wallet = useSessionStore((s) => s.wallet)
  const locale = useEffectiveLocale()
  const gameSummary = useGamesStore((s) => s.games.find((g) => g.id === gameId))

  const jackpotPool = useHubStore((s) => s.jackpot?.pool ?? 0)
  const hubLevelInfo = useHubStore((s) => s.levelInfo)
  const bonusStatus = useHubStore((s) => s.bonusStatus)
  const claimingBonus = useHubStore((s) => s.claimingBonus)
  const claimRescue = useHubStore((s) => s.claimRescue)

  const math = useGameStore((s) => s.math)
  const phase = useGameStore((s) => s.phase)
  const betIndex = useGameStore((s) => s.betIndex)
  const lastResult = useGameStore((s) => s.lastResult)
  const error = useGameStore((s) => s.error)
  const errorCode = useGameStore((s) => s.errorCode)
  const freeSpins = useGameStore((s) => s.freeSpins)
  const gambleSession = useGameStore((s) => s.gambleSession)
  const rendererInstance = useGameStore((s) => s.renderer)
  const load = useGameStore((s) => s.load)
  const setBet = useGameStore((s) => s.setBet)
  const setRenderer = useGameStore((s) => s.setRenderer)
  const spinAction = useGameStore((s) => s.spin)
  const gambleAction = useGameStore((s) => s.gamble)
  const collectGambleAction = useGameStore((s) => s.collectGamble)
  const syncGambleExpiryAction = useGameStore((s) => s.syncGambleExpiry)
  const dismissError = useGameStore((s) => s.dismissError)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [betSheetOpen, setBetSheetOpen] = useState(false)
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [helpPage, setHelpPage] = useState<HelpPage>(() => readStoredHelpPage(gameId) ?? 'paytable')
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [rendererError, setRendererError] = useState(false)
  /** 배당표에 심볼 이미지를 보여주기 위해 로드된 테마를 들고 있는다. 렌더러 생성 성공 여부와 무관하다. */
  const [theme, setTheme] = useState<Theme | null>(null)

  // 더블업(Wave 1) — WinStrip의 "더블" 버튼이 이 모달을 연다. flipping은 서버 응답을 기다리는 동안,
  // side/outcome은 방금 판정 결과를 잠깐 보여주는 용도(둘 다 서버가 알려준 값 그대로).
  // outcome이 'collected'면(만료 등으로 판정 없이 회수됐거나, 이겼지만 상한에 닿아 즉시 회수된
  // 경우) side는 항상 null이고 코인은 뒤집히지 않은 채로 보여준다 — 추측하지 않는다.
  const [gambleModalOpen, setGambleModalOpen] = useState(false)
  const [gambleFlip, setGambleFlip] = useState<{
    flipping: boolean
    side: GambleSide | null
    outcome: 'win' | 'lose' | 'collected' | null
  }>({ flipping: false, side: null, outcome: null })
  const gambleResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** "받기" 요청이 날아가 있는 동안 WinStrip의 받기/더블 버튼을 잠깐 잠근다. */
  const [gambleCollecting, setGambleCollecting] = useState(false)
  /** 만료 카운트다운을 1초마다 다시 그리기 위한 틱 — 실제 만료 판정은 store의 expiresAt이 한다. */
  const [gambleNowTick, setGambleNowTick] = useState(() => Date.now())
  /**
   * 재시도 가능한 실패(store가 idempotencyKey를 그대로 들고 있는 경우) 뒤에는 원래 고른 면으로만
   * 다시 시도할 수 있게 잠근다 — 다른 면으로 재시도하면 서버가 같은 키의 저장된 결과(원래 픽
   * 기준 판정)를 그대로 돌려줄 수 있어, 사용자가 지금 고른 면과 다른 결과가 나올 수 있다.
   */
  const [gambleLockedPick, setGambleLockedPick] = useState<GambleSide | null>(null)

  // 하단 시트 3개(도움말/베팅 목록/코인 소진) 모두 포커스 트랩 + Esc로 닫기 + 배경 스크롤 잠금을
  // 공유한다(useDialog) — 각 시트가 실제로 열려 있을 때만(enabled) 동작한다.
  const helpSheetRef = useDialog<HTMLDivElement>(() => setHelpSheetOpen(false), helpSheetOpen)
  const betSheetRef = useDialog<HTMLDivElement>(() => setBetSheetOpen(false), betSheetOpen)
  const outOfCoinsSheetRef = useDialog<HTMLDivElement>(dismissError, errorCode === 'INSUFFICIENT_FUNDS')

  // 승리 배너(릴 위 오버레이) — 렌더러의 winTotal 이벤트가 시작 신호. tier는 렌더러가 계산해
  // 보내주는 값을 우선 신뢰하고(없으면 로컬 폴백), winBannerValue는 durationMs에 걸쳐 롤업한다.
  // 배너 자체는 등급 단어만 짧게(WIN_HOLD_MS, 1.2~2s) 보여주고 사라진다 — 실제 금액은 항상
  // WinStrip(컨트롤 위 고정줄)이 보여준다. winBannerValue는 배너가 사라진 뒤에도 다음 스핀이
  // 시작되기 전까지 그대로 남아 WinStrip에 최종 당첨액을 계속 보여준다.
  const [winBanner, setWinBanner] = useState<{ tier: WinTier } | null>(null)
  const [winBannerValue, setWinBannerValue] = useState(0)
  const winRafRef = useRef<number | null>(null)
  const winHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 탭으로 현재 단계(롤업 → 홀드)를 건너뛰는 플래그. 릴 연출 자체는 건드리지 않는다. */
  const winSkipRef = useRef(false)
  /** onEvent 콜백은 렌더러 생성 시점에 한 번만 캡처되므로, 폴백 등급 계산에 쓸 최신 베팅액은 ref로 읽는다. */
  const lastResultRef = useRef(lastResult)
  useEffect(() => {
    lastResultRef.current = lastResult
  }, [lastResult])

  // 새 라운드가 되면(roundId가 바뀌면) 이전 라운드의 공정성 검증 결과를 들고 있으면 안 된다 —
  // 안 그러면 다음 스핀 뒤 공정성 탭을 다시 열었을 때 예전 라운드의 ✓/✗가 잠깐 그대로 보인다.
  useEffect(() => {
    setVerifyState('idle')
    setVerifyResult(null)
  }, [lastResult?.roundId])

  /** 스페이스바를 누르고 있는 동안(오토리핏) 반복 발동을 막는 플래그. keyup에서 풀린다. */
  const spaceHeldRef = useRef(false)

  // 프리스핀 진입/재발동 배너 — 렌더러의 featureTriggered 이벤트가 신호. 최초 진입은 전체화면
  // 인트로(1.6s), 재발동은 짧은 토스트. 둘 다 지나면 스핀 연출은 평소처럼 이어진다.
  const [freeSpinsIntro, setFreeSpinsIntro] = useState<{ spins: number; multiplier: number } | null>(null)
  const [freeSpinsRetrigger, setFreeSpinsRetrigger] = useState<{ spins: number } | null>(null)
  const introTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 프리스핀 종료 배너 — 렌더러의 modeTransition(to:'base', phase:'start')이 신호다(전환 연출
  // 위에 얹힌다). 렌더러가 아직 그 이벤트를 못 보내면(구버전) 플레이어는 그냥 다음 스핀으로
  // 넘어간다 — 배너 없이도 게임 진행 자체는 막히지 않는다.
  const [freeSpinsComplete, setFreeSpinsComplete] = useState(false)
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showFreeSpinsCompleteBanner(): void {
    if (completeTimeoutRef.current !== null) clearTimeout(completeTimeoutRef.current)
    setFreeSpinsComplete(true)
    completeTimeoutRef.current = setTimeout(() => {
      completeTimeoutRef.current = null
      setFreeSpinsComplete(false)
    }, 2500)
  }

  // 언마운트 시 프리스핀 배너/더블업 결과 타이머 정리.
  useEffect(() => {
    return () => {
      if (introTimeoutRef.current !== null) clearTimeout(introTimeoutRef.current)
      if (retriggerTimeoutRef.current !== null) clearTimeout(retriggerTimeoutRef.current)
      if (completeTimeoutRef.current !== null) clearTimeout(completeTimeoutRef.current)
      if (gambleResultTimeoutRef.current !== null) clearTimeout(gambleResultTimeoutRef.current)
    }
  }, [])

  // 렌더러가 준비되면(또는 프리스핀 상태가 바뀌면) 시각 모드를 서버 권위 상태에 맞춰 둔다 —
  // 화면을 나갔다 돌아와 프리스핀을 재개한 경우에도 렌더러가 새로 생성되자마자 반영된다.
  useEffect(() => {
    rendererInstance?.setMode?.({ freeSpins: toRendererFreeSpinsMode(freeSpins) })
  }, [rendererInstance, freeSpins])

  // 게임 진입 시 math.json 로드, 이탈 시 store 초기화.
  useEffect(() => {
    void load(gameId)
    return () => {
      useGameStore.getState().reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // 텔레그램 네이티브 뒤로가기 버튼 — 로비로 복귀.
  useEffect(() => {
    showBackButton(navigateToLobby)
    return () => hideBackButton()
  }, [])

  // 도움말 시트에서 마지막으로 본 탭을 게임별로 기억해 둔다.
  useEffect(() => {
    writeStoredHelpPage(gameId, helpPage)
  }, [gameId, helpPage])

  const hasFeaturesPage = Boolean(math?.wild || math?.scatter)
  // 저장돼 있던 탭이 피처인데 이 게임엔 와일드/스캐터가 없으면 배당표로 되돌린다 — 있지도 않은
  // 탭에 머물러 있을 수 없다. math가 아직 안 왔을 때는 판단을 미룬다(로딩 중 잠깐의 false를
  // "피처 없음"으로 오판해 막 로드된 진짜 값을 보기도 전에 탭을 되돌려버리면 안 된다).
  useEffect(() => {
    if (!math) return
    if (helpPage === 'features' && !hasFeaturesPage) setHelpPage('paytable')
  }, [math, helpPage, hasFeaturesPage])

  /** 롤업이 끝나면(자연 종료든 탭 스킵이든) 등급별 시간만큼 배너(단어만)를 붙잡아 둔다. */
  function startWinHold(tier: WinTier): void {
    if (winHoldTimeoutRef.current !== null) clearTimeout(winHoldTimeoutRef.current)
    winHoldTimeoutRef.current = setTimeout(() => {
      winHoldTimeoutRef.current = null
      setWinBanner(null)
    }, WIN_HOLD_MS[tier])
  }

  /** 프리스핀 최초 진입 — 전체화면 인트로를 1.6초 띄운다. */
  function showFreeSpinsIntro(spins: number, multiplier: number): void {
    if (introTimeoutRef.current !== null) clearTimeout(introTimeoutRef.current)
    setFreeSpinsIntro({ spins, multiplier })
    introTimeoutRef.current = setTimeout(() => {
      introTimeoutRef.current = null
      setFreeSpinsIntro(null)
    }, 1600)
  }

  /** 프리스핀 재발동 — 짧은 토스트만 띄운다(전체화면 인트로는 최초 진입 때만). */
  function showFreeSpinsRetrigger(spins: number): void {
    if (retriggerTimeoutRef.current !== null) clearTimeout(retriggerTimeoutRef.current)
    setFreeSpinsRetrigger({ spins })
    retriggerTimeoutRef.current = setTimeout(() => {
      retriggerTimeoutRef.current = null
      setFreeSpinsRetrigger(null)
    }, 1600)
  }

  // 렌더러 이벤트:
  // - modeTransition: 프리스핀 진입 연출이 끝나면(to:freeSpins, phase:end) 첫 자동 스핀을 풀어주고,
  //   종료 연출이 시작되면(to:base, phase:start) 그 위에 COMPLETE 배너를 띄운다.
  // - winTotal이 승리 배너를 시작시키고 durationMs에 걸쳐 롤업한다. 등급(tier)은 렌더러가
  //   계산해 함께 보내주는 값을 우선 쓰고, 없으면 로컬로 폴백 계산한다.
  // - featureTriggered는 프리스핀 진입/재발동을 알린다 — 최초 진입이면 전체화면 인트로,
  //   재발동(retrigger)이면 짧은 토스트.
  // ref/setState만 사용하므로 렌더러 생성 시점에 캡처돼도 값이 오래돼(stale) 문제되지 않는다.
  function handleRendererEvent(event: RendererEvent): void {
    if (event.type === 'modeTransition') {
      if (event.to === 'freeSpins' && event.phase === 'end') {
        useGameStore.getState().releaseFreeSpinsEntryGate()
      } else if (event.to === 'base' && event.phase === 'start') {
        showFreeSpinsCompleteBanner()
      }
      return
    }

    if (event.type === 'featureTriggered') {
      const feature = event.feature
      if (feature.type === 'freeSpins') {
        if (feature.retrigger) {
          showFreeSpinsRetrigger(feature.spins)
        } else {
          showFreeSpinsIntro(feature.spins, feature.multiplier)
        }
      }
      return
    }

    if (event.type !== 'winTotal') return

    const target = event.totalWin
    const duration = event.durationMs > 0 ? event.durationMs : 1
    const bet = lastResultRef.current?.totalBet ?? 0
    const multiple = bet > 0 ? target / bet : 0
    const tier = resolveWinTier(event.tier, multiple)

    winSkipRef.current = false
    if (winRafRef.current !== null) cancelAnimationFrame(winRafRef.current)
    if (winHoldTimeoutRef.current !== null) {
      clearTimeout(winHoldTimeoutRef.current)
      winHoldTimeoutRef.current = null
    }
    setWinBanner({ tier })
    setWinBannerValue(0)

    // 첫 rAF 틱의 timestamp 자체를 기준점으로 삼는다 (Odometer.tsx와 동일한 패턴) —
    // 별도로 `performance.now()`를 부르면 환경에 따라 rAF의 timestamp와 기준이 어긋날 수 있다.
    let startTs: number | null = null
    const step = (ts: number): void => {
      if (winSkipRef.current) {
        setWinBannerValue(target)
        winRafRef.current = null
        startWinHold(tier)
        return
      }
      if (startTs === null) startTs = ts
      const progress = Math.min(1, (ts - startTs) / duration)
      setWinBannerValue(Math.round(target * progress))
      if (progress < 1) {
        winRafRef.current = requestAnimationFrame(step)
      } else {
        winRafRef.current = null
        startWinHold(tier)
      }
    }
    winRafRef.current = requestAnimationFrame(step)
  }

  // 새 스핀이 시작되면 이전 승리 배너/금액을 지운다.
  useEffect(() => {
    if (phase !== 'spinning') return
    setWinBanner(null)
    setWinBannerValue(0)
    winSkipRef.current = false
    if (winRafRef.current !== null) {
      cancelAnimationFrame(winRafRef.current)
      winRafRef.current = null
    }
    if (winHoldTimeoutRef.current !== null) {
      clearTimeout(winHoldTimeoutRef.current)
      winHoldTimeoutRef.current = null
    }
  }, [phase])

  // 언마운트 시 진행 중인 롤업 애니메이션/홀드 타이머를 정리한다.
  useEffect(() => {
    return () => {
      if (winRafRef.current !== null) cancelAnimationFrame(winRafRef.current)
      if (winHoldTimeoutRef.current !== null) clearTimeout(winHoldTimeoutRef.current)
    }
  }, [])

  /**
   * 승리 연출 중 탭하면(스테이지든 WinStrip이든) 현재 단계를 한 번에 하나씩 건너뛴다 — 릴 라인
   * 순환은 렌더러의 clearWins()로 즉시 멈추고, 카운터/배너는 지금까지처럼 롤업 중이면 목표값으로
   * 점프(그 뒤 홀드로 넘어간다), 홀드 중이면 배너를 바로 닫는다.
   */
  const handleWinPresentationTap = (): void => {
    rendererInstance?.clearWins?.()
    if (winRafRef.current !== null) {
      winSkipRef.current = true
      return
    }
    if (winHoldTimeoutRef.current !== null) {
      clearTimeout(winHoldTimeoutRef.current)
      winHoldTimeoutRef.current = null
      setWinBanner(null)
    }
  }

  /**
   * 스테이지 탭 — 단계에 따라 다르게 동작한다:
   * - phase === 'spinning'이면 "결과로 건너뛰기"(릴 회전을 접고 곧장 정지 위치로 붙인다). 서버
   *   결과가 아직 안 왔으면 store가 알아서 spinTo 시작 시점에 즉시 건너뛴다(requestSkip 참고).
   * - 그 외(승리 연출 중)에는 WinStrip 탭과 동일하게 처리한다(handleWinPresentationTap).
   */
  const handleStageTap = (): void => {
    if (phase === 'spinning') {
      useGameStore.getState().requestSkip()
      haptic('light')
      return
    }
    handleWinPresentationTap()
  }

  // math가 준비되면 테마를 읽고 렌더러를 만든다. 실패해도 서버 스핀 자체는 막지 않는다.
  useEffect(() => {
    if (!math || !containerRef.current) return
    // 로비를 거치지 않고 게임→게임으로 바로 전환하면(App.tsx의 key={gameId} 리마운트) 이 컴포넌트의
    // "첫 렌더"는 store가 아직 이전 게임의 math를 들고 있을 때 계산된다(위의 load(gameId) effect가
    // store를 리셋하는 건 커밋 이후다) — 그 결과 이 effect의 클로저는 "새 gameId + 이전 게임의
    // math" 조합으로 고정될 수 있다. 지금 store의 실제 값과 다르면(=곧 다시 실행될 낡은 조합이면)
    // 조용히 건너뛴다 — 그대로 진행하면 다른 게임의 심볼로 ThemeError가 난다.
    const live = useGameStore.getState()
    if (live.gameId !== gameId || live.math !== math) return
    let cancelled = false
    let renderer: SlotRenderer | null = null
    setRendererError(false)
    setTheme(null)

    async function setup(): Promise<void> {
      try {
        const loadedTheme = await loadTheme(`/games/${gameId}`, math ?? undefined)
        if (cancelled || !containerRef.current || !math) return
        // 배당표 시트는 렌더러 생성 성공 여부와 무관하게 심볼 이미지가 필요하므로 먼저 반영한다.
        setTheme(loadedTheme)
        renderer = createSlotRenderer({
          container: containerRef.current,
          math,
          theme: loadedTheme,
          fit: 'window',
          // 마운트 시점 값만 읽는다(구독 아님) — 설정을 바꿔도 이 화면에 있는 동안은 재생성하지
          // 않고, 게임을 나갔다 다시 들어올 때 반영된다. 설정 시트 안내 문구에도 그렇게 적혀 있다.
          reducedMotion: useSettingsStore.getState().reducedMotion,
          onEvent: handleRendererEvent,
        })
        await renderer.ready
        if (cancelled) {
          renderer.destroy()
          return
        }
        setRenderer(renderer)
      } catch (err) {
        // 연출 로딩 실패 — 릴 그래픽 없이도 서버 권위 스핀 버튼은 계속 동작해야 한다.
        // 다만 원인을 콘솔에 남기고 화면에도 비차단 안내를 띄워 다음에 이런 문제가 조용히 묻히지 않게 한다.
        console.error('[game] renderer setup failed', err)
        if (!cancelled) setRendererError(true)
      }
    }

    void setup()

    return () => {
      cancelled = true
      renderer?.destroy()
      setRenderer(null)
    }
  }, [math, gameId, setRenderer])

  useEffect(() => {
    if (lastResult && lastResult.wins.length > 0) haptic('success')
  }, [lastResult])

  const betLevels = math?.betLevels ?? []
  // 프리스핀 중에는 진입 시 서버가 고정한 베팅액을 보여준다 — 셀렉터로 바꿀 수 없다.
  const currentBet = freeSpins ? freeSpins.totalBet : (betLevels[betIndex] ?? 0)
  // ways 게임(payModel === 'ways')은 페이라인이 없다 — "라인당 베팅" 대신 "웨이당 베팅"을
  // 보여주고, 나누는 단위도 paylines.length가 아니라 ways.betDivisor(관례상 25)다.
  const isWays = math?.payModel === 'ways'
  const betPerLine = math
    ? isWays
      ? currentBet / (math.ways?.betDivisor ?? 25)
      : math.paylines.length > 0
        ? currentBet / math.paylines.length
        : 0
    : 0
  const isBusy = phase === 'spinning' || phase === 'showingWin'
  // 프리스핀이 끝난 직후에도 종료 배너가 떠 있는 동안은 셀렉터를 계속 잠가 둔다(배너와 함께 풀린다).
  const betLocked = freeSpins !== null || freeSpinsComplete
  // 페이테이블에 1개짜리 배당이 하나라도 있으면(단일 심볼이 1번 릴에 있을 때만 인정) 각주를 보여준다.
  const hasSingleCountPay = math ? Object.values(math.paytable).some((rule) => 1 in rule) : false

  // 베팅이 잠기는 동안(스핀 중/프리스핀 중) 베팅 목록 시트가 열려 있으면 안 된다.
  useEffect(() => {
    if (betLocked) setBetSheetOpen(false)
  }, [betLocked])

  // 더블업 제안은 서버가 expiresAt(만료 시각)이 지나면 알아서 회수한다 — GET /games/:id/state를
  // "읽기만 해도" 그 자리에서 회수되므로, syncGambleExpiry()가 POST 없이 그 상태 조회로 화면을
  // 맞춘다("결과 표시" 없이 조용히 사라진다 — 이미 서버가 회수했으므로 새로 뭘 판정하는 게
  // 아니라 세션/잔액을 동기화하는 것뿐이다).
  useEffect(() => {
    const expiresAt = gambleSession?.expiresAt
    if (!expiresAt) return
    const expiresAtMs = new Date(expiresAt).getTime()
    // setTimeout의 지연은 32비트 부호 있는 정수라 ~24.8일을 넘기면 오버플로해 거의 즉시 발동해
    // 버린다(만료 전인데 회수된 것처럼 보이는 버그) — 남은 시간이 그보다 길면 상한만큼만 자고
    // 다시 재보는 식으로 안전하게 스스로 재예약한다.
    const MAX_DELAY_MS = 2_000_000_000
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const tick = (): void => {
      if (cancelled) return
      const remainingMs = expiresAtMs - Date.now()
      if (remainingMs <= 0) {
        void syncGambleExpiryAction()
        return
      }
      timeoutId = setTimeout(tick, Math.min(remainingMs, MAX_DELAY_MS))
    }
    tick()
    return () => {
      cancelled = true
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [gambleSession?.roundId, gambleSession?.expiresAt, syncGambleExpiryAction])

  // 카운트다운 텍스트를 부드럽게 갱신하기 위한 1초 틱 — 위 effect(만료 동기화)와는 별개다.
  // 실제 만료 판정/서버 동기화는 항상 expiresAt 값 자체가 하고, 이 틱은 화면 표시만 건드린다.
  useEffect(() => {
    if (!gambleSession?.expiresAt) return
    const id = setInterval(() => setGambleNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [gambleSession?.roundId, gambleSession?.expiresAt])

  const gambleExpiresAtMs = gambleSession?.expiresAt ? new Date(gambleSession.expiresAt).getTime() : null
  const gambleRemainingMs = gambleExpiresAtMs !== null ? Math.max(0, gambleExpiresAtMs - gambleNowTick) : null
  // 남은 시간이 0이 되면(로컬 시계 기준) "더블"부터 바로 숨긴다 — 실제 회수 동기화(위 effect)가
  // 끝나길 기다리지 않고 즉시 반응하게 한다. "받기"는 서버가 회수를 마칠 때까지 계속 눌러도 된다.
  const gambleExpired = gambleRemainingMs !== null && gambleRemainingMs <= 0
  // "더블" 버튼에 실제 확률을 보여준다 — math.gamble이 없을 리 없다(showGambleActions가 이미
  // 그 존재를 전제한다), 그래도 방어적으로 50%를 기본값으로 둔다.
  const gambleChancePercent = math?.gamble ? Math.round(math.gamble.chance * 100) : 50

  const title = gameSummary ? (locale === 'ko' && gameSummary.name.ko ? gameSummary.name.ko : gameSummary.name.en) : gameId

  // WinStrip 표시값 — 우선순위: (1) 더블업 세션이 있고 승리 배너가 안 떠 있으면(롤업/홀드가
  // 끝났으면) 걸려 있는 금액 + 받기/더블 버튼, (2) winBannerValue가 0이 아니면(굴러가는 중이거나
  // 홀드가 끝났지만 다음 스핀 전이라 최종값이 남아 있는 경우) "WIN", (3) 0이고 프리스핀 중이면
  // 누적 총액을 "FREE SPINS TOTAL", (4) 그 외(진짜 유휴)엔 "WIN 0".
  // math.gamble이 없는데(설정이 아예 없는 게임) gambleSession이 있는 건 있을 수 없는 상태지만,
  // 방어적으로 한 번 더 걸어 둔다 — 서버/엔진 쪽 계약이 어긋나도 UI가 조용히 숨는 쪽이 안전하다.
  const showGambleActions = gambleSession !== null && math?.gamble !== undefined && !winBanner
  const winStripAmount = showGambleActions
    ? gambleSession.pendingWin
    : freeSpins && winBannerValue === 0
      ? freeSpins.accumulatedWin
      : winBannerValue
  const winStripLabel = showGambleActions
    ? t('gamblePendingWinLabel')
    : freeSpins && winBannerValue === 0
      ? t('freeSpinsTotalLabel')
      : t('winStripLabel')

  const handleSpin = (): void => {
    if (isBusy || !math) return
    haptic('medium')
    void spinAction()
  }

  // 스페이스바 단축키(데스크탑 편의) — phase === 'spinning'이면 탭과 동일하게 "결과로 건너뛰기",
  // phase === 'idle'이고 시트/모달이 없고 프리스핀 자동 진행 중이 아니면 스핀을 시작한다.
  // 둘 다 페이지 스크롤을 막고, 키를 누르고 있어도(오토리핏) keyup 전까지 한 번만 반응한다.
  // 텍스트 입력/모달에 포커스가 가 있으면 아예 가로채지 않는다.
  useEffect(() => {
    const isModalOpen = betSheetOpen || helpSheetOpen || errorCode === 'INSUFFICIENT_FUNDS' || gambleModalOpen

    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }

    // 포커스가 버튼/링크(도움말·뒤로가기·베팅 −/+/표시 등)에 가 있으면 스페이스는 그 요소의
    // 기본 동작(클릭)이어야 한다 — 우리가 가로채 스핀/스킵을 대신 발동시키면 안 된다.
    function isActivatableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return target.closest('button, a, [role="button"], [role="tab"]') !== null
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (isEditableTarget(event.target)) return
      if (isActivatableTarget(event.target)) return
      if (spaceHeldRef.current) return // 오토리핏 — keyup에서 풀릴 때까지 무시한다.

      if (phase === 'spinning') {
        spaceHeldRef.current = true
        event.preventDefault()
        useGameStore.getState().requestSkip()
        haptic('light')
        return
      }

      if (phase === 'idle' && !isModalOpen && !freeSpins) {
        spaceHeldRef.current = true
        event.preventDefault()
        handleSpin()
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (event.code !== 'Space' && event.key !== ' ') return
      spaceHeldRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
    // handleSpin은 매 렌더마다 새로 만들어지는 클로저라 deps에 넣어도 사실상 매번 재구독되지만,
    // 명시해 두는 편이 "이 값들이 바뀌면 다시 걸어야 한다"는 의도를 정확히 드러낸다.
  }, [phase, betSheetOpen, helpSheetOpen, errorCode, freeSpins, gambleModalOpen, handleSpin])

  const handleBetDec = (): void => {
    if (betLevels.length === 0) return
    if (errorCode === 'BET_LOCKED') dismissError()
    setBet((betIndex - 1 + betLevels.length) % betLevels.length)
  }

  const handleBetInc = (): void => {
    if (betLevels.length === 0) return
    if (errorCode === 'BET_LOCKED') dismissError()
    setBet((betIndex + 1) % betLevels.length)
  }

  const handleBetPick = (index: number): void => {
    if (errorCode === 'BET_LOCKED') dismissError()
    setBet(index)
    setBetSheetOpen(false)
  }

  const handleRescueClaim = async (): Promise<void> => {
    const result = await claimRescue()
    if (result) dismissError()
  }

  const openGambleModal = (): void => {
    if (gambleResultTimeoutRef.current !== null) {
      clearTimeout(gambleResultTimeoutRef.current)
      gambleResultTimeoutRef.current = null
    }
    setGambleFlip({ flipping: false, side: null, outcome: null })
    setGambleLockedPick(null)
    setGambleModalOpen(true)
  }

  const closeGambleModal = (): void => {
    if (gambleResultTimeoutRef.current !== null) {
      clearTimeout(gambleResultTimeoutRef.current)
      gambleResultTimeoutRef.current = null
    }
    setGambleModalOpen(false)
    setGambleFlip({ flipping: false, side: null, outcome: null })
    setGambleLockedPick(null)
  }

  const handleGambleCollect = (): void => {
    // 성공하면 WinStrip이 다음 스핀 전까지 보여줄 최종 금액을 지금 아는 pendingWin으로 맞춘다 —
    // 안 그러면 더블업을 시작하기 전의(더블업과 무관한) 오래된 당첨액이 그대로 남아있는 것처럼 보인다.
    const pendingAtCollect = gambleSession?.pendingWin ?? 0
    setGambleCollecting(true)
    void collectGambleAction()
      .then(() => setWinBannerValue(pendingAtCollect))
      .catch((err: unknown) => {
        // store가 이미 NOT_GAMBLEABLE(서버엔 세션이 없었음)은 로컬 세션 정리 + 잔액 새로고침까지
        // 끝내둔다 — 여기선 예외가 처리되지 않은 채 남지 않게만 한다.
        console.error('[game] collect failed', err)
      })
      .finally(() => setGambleCollecting(false))
  }

  /**
   * 서버 응답만 신뢰한다 — pick이 맞았는지는 절대 스스로 계산하지 않는다.
   * outcome은 항상 response.outcome을 그대로 따른다('win'|'lose'|'collected'). 'collected'는
   * 판정 없이 이미 회수됐거나(예: 막 만료됐는데 픽이 들어온 경쟁 상황) 이겼지만 상한(단계/금액)에
   * 닿아 즉시 회수된 경우다 — 두 경우 다 코인을 뒤집힌 것처럼 보여주면 안 되므로, side는
   * response.side가 실제로 있을 때만 쓰고 pick으로 대체하지 않는다.
   */
  const handleGamblePick = async (pick: GambleSide): Promise<void> => {
    setGambleFlip({ flipping: true, side: null, outcome: null })
    haptic('medium')
    try {
      const response = await gambleAction(pick)
      if (!response) return

      // 성공했으니(응답을 받았으니) 더 이상 잠글 이유가 없다 — 다음 픽은 새 키로 자유롭게 고른다.
      setGambleLockedPick(null)

      const outcome: 'win' | 'lose' | 'collected' =
        response.outcome === 'collected' || response.autoCollected
          ? 'collected'
          : response.outcome === 'win'
            ? 'win'
            : 'lose'
      const side = outcome === 'collected' ? null : (response.side ?? null)
      setGambleFlip({ flipping: false, side, outcome })
      haptic(outcome === 'win' ? 'success' : 'light')

      // 더블업 세션이 끝났으면(졌거나, 이겼지만 상한에 닿아 즉시 회수됐거나, 판정 없이 회수됐으면)
      // WinStrip이 다음 스핀 전까지 보여줄 금액을 이 결과로 맞춘다 — response.pendingWin은
      // 졌을 땐 이미 0이고, 회수된 경우엔 지갑에 들어간 금액 그대로다. 세션이 계속되면(이겨서
      // 다음 단계로 넘어가면) gambleSession.pendingWin이 표시를 대신 맡으므로 손대지 않는다.
      if (outcome !== 'win' || response.stepsLeft === 0) {
        setWinBannerValue(response.pendingWin)
      }

      if (gambleResultTimeoutRef.current !== null) clearTimeout(gambleResultTimeoutRef.current)
      gambleResultTimeoutRef.current = setTimeout(() => {
        gambleResultTimeoutRef.current = null
        setGambleModalOpen(false)
        setGambleFlip({ flipping: false, side: null, outcome: null })
      }, 1800)
    } catch (err) {
      console.error('[game] gamble pick failed', err)
      setGambleFlip({ flipping: false, side: null, outcome: null })
      // idempotencyKey가 남아 있으면(store가 재시도 가능한 실패로 판단해 키를 그대로 들고 있음)
      // 서버가 다음 요청을 "같은 시도의 재전송"으로 보므로, 재시도는 반드시 같은 픽이어야 한다 —
      // 다른 면을 고르면 서버가 원래 픽 기준으로 이미 저장된 판정을 그대로 돌려줄 수 있다.
      setGambleLockedPick(useGameStore.getState().gambleIdempotencyKey !== null ? pick : null)
    }
  }

  const handleRevealSeed = async (): Promise<void> => {
    if (!lastResult || !token || !math) return
    setVerifyState('checking')
    setVerifyResult(null)
    try {
      const seedInfo = await getRoundSeed(token, lastResult.roundId)
      const hashMatch = (await sha256Hex(seedInfo.seed)) === lastResult.seedHash

      // 서버가 공개한 seedInput으로 스핀을 그대로 재생해 릴 정지 위치까지 검증한다 — 재생 결과가
      // 서버가 공개한 stops와 같아야 하고(계산이 재현 가능함), 그 공개된 stops도 이미 화면에서
      // 본 결과(lastResult.stops)와 같아야 한다(서버가 다른 라운드의 증명을 준 게 아님).
      const rng = createSeededRng(seedInfo.seedInput)
      const replay = replaySpin(math, { totalBet: lastResult.totalBet }, rng)
      const stopsMatch =
        stopsEqual(replay.stops, seedInfo.stops) && stopsEqual(seedInfo.stops, lastResult.stops)

      setVerifyResult({ hashMatch, stopsMatch })
      setVerifyState('done')
    } catch (err) {
      console.error('[game] provably fair verification failed', err)
      setVerifyState('error')
    }
  }

  if (phase === 'error' && errorCode !== 'INSUFFICIENT_FUNDS') {
    return (
      <div className="hub-game-screen hub-game-screen--error">
        <button
          type="button"
          className="hub-game-screen__back hub-game-screen__back--standalone"
          onClick={navigateToLobby}
          aria-label={t('back')}
        >
          ←
        </button>
        <p className="hub-game-screen__error-message">{error ?? t('gameLoadError')}</p>
        <button type="button" className="hub-game-screen__retry" onClick={() => void load(gameId)}>
          {t('errorRetry')}
        </button>
      </div>
    )
  }

  return (
    <div className="hub-game-screen">
      <div className="hub-game-screen__topbar">
        <button
          type="button"
          className="hub-game-screen__back"
          onClick={navigateToLobby}
          aria-label={t('back')}
        >
          ←
        </button>
        <span className="hub-game-screen__title">{title}</span>
        <span className="hub-game-screen__jackpot-pill" aria-label={t('jackpot')}>
          <span aria-hidden="true">🎰</span>
          <Odometer value={jackpotPool} />
        </span>
        <button
          type="button"
          className="hub-game-screen__icon-btn"
          onClick={() => setHelpSheetOpen(true)}
          disabled={!math}
          aria-label={t('help')}
        >
          ?
        </button>
        <span className="hub-game-screen__wallet-pill" aria-label={t('coins')}>
          <span aria-hidden="true">🪙</span>
          <Odometer value={wallet?.coins ?? 0} />
        </span>
      </div>

      <div
        className="hub-game-screen__stage"
        data-phase={phase}
        onClick={handleStageTap}
      >
        <div ref={containerRef} className="hub-game-screen__canvas" />
        {phase === 'loading' && <div className="hub-game-screen__loading">{t('loading')}</div>}
        {rendererError && (
          <div className="hub-game-screen__renderer-note" role="status">
            {t('graphicsUnavailable')}
          </div>
        )}
        {freeSpinsIntro && (
          <div className="hub-freespins-intro" role="status">
            <span className="hub-freespins-intro__text">
              {t('freeSpinsIntro', { spins: freeSpinsIntro.spins, multiplier: freeSpinsIntro.multiplier })}
            </span>
          </div>
        )}
        <div className="hub-game-screen__banners">
          {freeSpinsRetrigger && (
            <div className="hub-game-screen__win-banner hub-game-screen__win-banner--freespins">
              <span className="hub-game-screen__win-tier-label">
                {t('freeSpinsRetrigger', { spins: freeSpinsRetrigger.spins })}
              </span>
            </div>
          )}
          {freeSpinsComplete && (
            <div className="hub-game-screen__win-banner hub-game-screen__win-banner--freespins">
              <span className="hub-game-screen__win-tier-label">{t('freeSpinsComplete')}</span>
            </div>
          )}
          {lastResult?.jackpotWin !== undefined && (
            <div className="hub-game-screen__win-banner hub-game-screen__win-banner--jackpot">
              <span className="hub-game-screen__jackpot-win-label">{t('jackpotWin')}</span>
              <Odometer className="hub-game-screen__win-value" value={lastResult.jackpotWin} />
            </div>
          )}
          {lastResult?.levelUp && (
            <div className="hub-game-screen__win-banner hub-game-screen__win-banner--levelup">
              <span className="hub-game-screen__level-up-label">
                {t('levelUp', { from: lastResult.levelUp.from, to: lastResult.levelUp.to })}
              </span>
              {lastResult.levelUp.bonus > 0 && (
                <span className="hub-game-screen__win-label">
                  +{lastResult.levelUp.bonus.toLocaleString('en-US')} 🪙
                </span>
              )}
            </div>
          )}
          {winBanner && (
            <div className={`hub-game-screen__win-banner hub-game-screen__win-banner--${winBanner.tier}`}>
              {/* 금액은 안 넣는다 — 등급 단어만 크고 짧게(WIN_HOLD_MS) 보여준다. 실제 금액은 WinStrip 몫. */}
              <span className="hub-game-screen__win-tier-label">{t(winTierLabelKey(winBanner.tier))}</span>
            </div>
          )}
        </div>
      </div>

      {/* 굴러가는 중/홀드 중일 때만 탭 가능하게 한다 — 평소(유휴)엔 WinStrip이 그냥 숫자판이다.
          더블업 세션이 있으면(그리고 승리 배너가 안 떠 있으면) 탭 대신 받기/더블 버튼을 보여준다. */}
      <WinStrip
        label={winStripLabel}
        amount={winStripAmount}
        onTap={winBanner ? handleWinPresentationTap : undefined}
        gambleActions={
          showGambleActions
            ? {
                onCollect: handleGambleCollect,
                onDouble: openGambleModal,
                collectLabel: t('gambleCollect'),
                doubleLabel: t('gambleDouble', { percent: gambleChancePercent }),
                disabled: gambleCollecting || gambleFlip.flipping,
                // 만료됐으면(로컬 시계 기준) "더블"부터 숨긴다 — "받기"는 서버 동기화가 끝날 때까지 남겨둔다.
                hideDouble: gambleExpired,
                expiresInLabel:
                  gambleRemainingMs !== null && !gambleExpired
                    ? t('gambleExpiresIn', { time: formatGambleCountdown(gambleRemainingMs) })
                    : undefined,
              }
            : undefined
        }
      />

      {/* gambleSession이 아니라 gambleModalOpen만으로 마운트를 결정한다 — 지는 픽은 세션을
          즉시 지우므로(store), 세션 존재를 조건으로 걸면 결과가 뜨기도 전에 모달이 닫혀버린다. */}
      {gambleModalOpen && (
        <GambleModal
          onClose={closeGambleModal}
          onPick={(pick) => void handleGamblePick(pick)}
          flipping={gambleFlip.flipping}
          revealedSide={gambleFlip.side}
          outcome={gambleFlip.outcome}
          pendingWin={gambleSession?.pendingWin ?? 0}
          payout={math?.gamble?.payout ?? 2}
          lockedPick={gambleLockedPick}
        />
      )}

      <div className="hub-game-screen__controls">
        <div className="hub-game-screen__controls-row">
          <div className="hub-game-screen__bet">
            <button
              type="button"
              className="hub-game-screen__bet-btn"
              onClick={handleBetDec}
              disabled={isBusy || betLevels.length === 0 || betLocked}
              aria-label="-"
            >
              −
            </button>
            <button
              type="button"
              className="hub-game-screen__bet-display"
              onClick={() => setBetSheetOpen(true)}
              disabled={isBusy || betLevels.length === 0 || betLocked}
              aria-label={t('bet')}
            >
              <span className="hub-game-screen__bet-label">{t('bet')}</span>
              <span className="hub-game-screen__bet-value">{currentBet}</span>
            </button>
            <button
              type="button"
              className="hub-game-screen__bet-btn"
              onClick={handleBetInc}
              disabled={isBusy || betLevels.length === 0 || betLocked}
              aria-label="+"
            >
              +
            </button>
          </div>

          <button type="button" className="hub-game-screen__spin" onClick={handleSpin} disabled={isBusy || !math}>
            {freeSpins ? t('freeSpinButton', { n: freeSpins.left }) : t('spin')}
          </button>
        </div>

        {errorCode === 'BET_LOCKED' && (
          <p className="hub-game-screen__bet-hint" role="alert">
            {t('betLockedHint', { maxBet: (hubLevelInfo?.maxBet ?? 0).toLocaleString('en-US') })}
          </p>
        )}
      </div>

      {errorCode === 'INSUFFICIENT_FUNDS' && (
        <div className="hub-sheet-backdrop" role="presentation" onClick={dismissError}>
          <div
            ref={outOfCoinsSheetRef}
            className="hub-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="hub-sheet__title">{t('outOfCoinsTitle')}</h2>
            <p className="hub-sheet__message">{t('outOfCoinsMessage')}</p>
            {bonusStatus?.rescue.claimable && (
              <button
                type="button"
                className="hub-sheet__reveal"
                onClick={() => void handleRescueClaim()}
                disabled={claimingBonus === 'rescue'}
              >
                {t('rescueBonus')} · +{bonusStatus.rescue.amount.toLocaleString('en-US')} 🪙
              </button>
            )}
            <button type="button" className="hub-sheet__close" onClick={dismissError}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {betSheetOpen && math && (
        <div className="hub-sheet-backdrop" role="presentation" onClick={() => setBetSheetOpen(false)}>
          <div ref={betSheetRef} className="hub-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="hub-sheet__title">{t('bet')}</h2>
            <ul className="hub-bet-picker__list">
              {betLevels.map((level, index) => {
                const lineBet = isWays
                  ? level / (math.ways?.betDivisor ?? 25)
                  : math.paylines.length > 0
                    ? level / math.paylines.length
                    : level
                const isCurrent = index === betIndex
                // 현재 레벨의 최대 베팅을 넘는 항목은 골라도 어차피 서버가 BET_LOCKED로 거절한다 —
                // 미리 비활성화하고 표시해 헛걸음을 막는다.
                const locked = hubLevelInfo !== null && level > hubLevelInfo.maxBet
                return (
                  <li key={level}>
                    <button
                      type="button"
                      className={
                        isCurrent
                          ? 'hub-bet-picker__row hub-bet-picker__row--current'
                          : locked
                            ? 'hub-bet-picker__row hub-bet-picker__row--locked'
                            : 'hub-bet-picker__row'
                      }
                      onClick={() => handleBetPick(index)}
                      disabled={locked}
                    >
                      <span className="hub-bet-picker__amount">{level}</span>
                      <span className="hub-bet-picker__per-line">
                        {locked ? '🔒 ' : ''}
                        {t(isWays ? 'betPerWay' : 'betPerLine', { amount: lineBet.toLocaleString('en-US') })}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {hubLevelInfo && betLevels.some((level) => level > hubLevelInfo.maxBet) && (
              <p className="hub-game-screen__bet-hint" role="note">
                {t('betLockedHint', { maxBet: hubLevelInfo.maxBet.toLocaleString('en-US') })}
              </p>
            )}
            <button type="button" className="hub-sheet__close" onClick={() => setBetSheetOpen(false)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {helpSheetOpen && math && (
        <div className="hub-sheet-backdrop" role="presentation" onClick={() => setHelpSheetOpen(false)}>
          <div
            ref={helpSheetRef}
            className="hub-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="hub-sheet__title">{t('help')}</h2>
            <div className="hub-help-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={helpPage === 'paytable'}
                className={
                  helpPage === 'paytable' ? 'hub-help-tabs__btn hub-help-tabs__btn--active' : 'hub-help-tabs__btn'
                }
                onClick={() => setHelpPage('paytable')}
              >
                {t('paytableTitle')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={helpPage === 'paylines'}
                className={
                  helpPage === 'paylines' ? 'hub-help-tabs__btn hub-help-tabs__btn--active' : 'hub-help-tabs__btn'
                }
                onClick={() => setHelpPage('paylines')}
              >
                {isWays ? t('tabWays') : t('paylinesTitle')}
              </button>
              {hasFeaturesPage && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={helpPage === 'features'}
                  className={
                    helpPage === 'features' ? 'hub-help-tabs__btn hub-help-tabs__btn--active' : 'hub-help-tabs__btn'
                  }
                  onClick={() => setHelpPage('features')}
                >
                  {t('tabFeatures')}
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={helpPage === 'fairness'}
                className={
                  helpPage === 'fairness' ? 'hub-help-tabs__btn hub-help-tabs__btn--active' : 'hub-help-tabs__btn'
                }
                onClick={() => setHelpPage('fairness')}
              >
                {t('tabFairness')}
              </button>
            </div>

            <div className="hub-sheet__scroll">
              {helpPage === 'paytable' && (
                <>
                  <p className="hub-paytable__bet-per-line">
                    {t(isWays ? 'betPerWay' : 'betPerLine', { amount: betPerLine.toLocaleString('en-US') })}
                  </p>
                  <ul className="hub-paytable__list">
                    {Object.entries(math.paytable).map(([id, payrule]) => {
                      const isGroup = Boolean(math.groups?.[id])
                      const label = isGroup ? groupLabel(math, id, locale) : symbolLabel(math, id, locale)
                      const counts = Object.keys(payrule)
                        .map(Number)
                        .sort((a, b) => a - b)

                      return (
                        <li key={id} className="hub-paytable__row">
                          {isGroup ? (
                            <div className="hub-paytable__symbol-stack" aria-hidden="true">
                              {groupMembers(math, id)
                                .slice(0, 3)
                                .map((memberId, i) => {
                                  const memberImage = theme?.symbols[memberId]
                                  return memberImage ? (
                                    <img
                                      key={memberId}
                                      className="hub-paytable__symbol-stack-img"
                                      style={{ zIndex: i }}
                                      src={memberImage}
                                      alt=""
                                      width={40}
                                      height={40}
                                    />
                                  ) : (
                                    <span
                                      key={memberId}
                                      className="hub-paytable__symbol-stack-img hub-paytable__symbol-stack-img--fallback"
                                      style={{ zIndex: i }}
                                    />
                                  )
                                })}
                            </div>
                          ) : theme?.symbols[id] ? (
                            <img
                              className="hub-paytable__symbol-img"
                              src={theme.symbols[id]}
                              alt={label}
                              width={40}
                              height={40}
                            />
                          ) : (
                            <span className="hub-paytable__symbol-fallback" aria-hidden="true">
                              {label}
                            </span>
                          )}
                          <div className="hub-paytable__row-body">
                            {isGroup && <span className="hub-paytable__row-label">{label}</span>}
                            <div className="hub-paytable__chips">
                              {counts.map((count) => (
                                <span key={count} className="hub-paytable__chip">
                                  {count}: ×{payrule[count]}
                                </span>
                              ))}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {math.wild && <p className="hub-paytable__wild-note">{t('wildSubstitutesAll')}</p>}
                  {hasSingleCountPay && <p className="hub-paytable__wild-note">{t('singlePayFootnote')}</p>}
                </>
              )}

              {helpPage === 'paylines' && isWays && (
                <div className="hub-paylines__ways-explainer">
                  <p className="hub-sheet__message">{t('waysExplainer', { base: math.ways?.base ?? 0 })}</p>
                  {math.ways?.bothWays && <p className="hub-sheet__message">{t('waysBothWaysNote')}</p>}
                </div>
              )}

              {helpPage === 'paylines' && !isWays && (
                <div className="hub-paylines__grid-list">
                  {math.paylines.map((line, index) => (
                    <div key={index} className="hub-paylines__item">
                      <div
                        className="hub-paylines__mini-grid"
                        style={{
                          gridTemplateColumns: `repeat(${math.reels}, 1fr)`,
                          gridTemplateRows: `repeat(${math.rows}, 1fr)`,
                        }}
                      >
                        {Array.from({ length: math.rows * math.reels }, (_, cellIndex) => {
                          const row = Math.floor(cellIndex / math.reels)
                          const reel = cellIndex % math.reels
                          const active = line[reel] === row
                          return (
                            <span
                              key={cellIndex}
                              className={
                                active ? 'hub-paylines__cell hub-paylines__cell--active' : 'hub-paylines__cell'
                              }
                            />
                          )
                        })}
                      </div>
                      <span className="hub-paylines__number">{index + 1}</span>
                    </div>
                  ))}
                </div>
              )}

              {helpPage === 'features' && hasFeaturesPage && (
                <>
                  {math.wild && (
                    <div className="hub-features__section">
                      <h3 className="hub-sheet__subtitle">{t('featuresWildTitle')}</h3>
                      <p className="hub-paytable__wild-note">
                        {math.wild.substitutesFor === 'all'
                          ? t('wildSubstitutesAll')
                          : t('wildSubstitutesSome', {
                              symbols: math.wild.substitutesFor.map((id) => symbolLabel(math, id, locale)).join(', '),
                            })}
                      </p>
                    </div>
                  )}
                  {math.scatter && (
                    <div className="hub-features__section">
                      <h3 className="hub-sheet__subtitle">{t('featuresScatterTitle')}</h3>
                      <div className="hub-paytable__row">
                        {theme?.symbols[math.scatter.symbol] ? (
                          <img
                            className="hub-paytable__symbol-img"
                            src={theme.symbols[math.scatter.symbol]}
                            alt={symbolLabel(math, math.scatter.symbol, locale)}
                            width={40}
                            height={40}
                          />
                        ) : (
                          <span className="hub-paytable__symbol-fallback" aria-hidden="true">
                            {symbolLabel(math, math.scatter.symbol, locale)}
                          </span>
                        )}
                        <div className="hub-paytable__chips">
                          {math.scatter.pays &&
                            Object.entries(math.scatter.pays)
                              .map(([count, multiplier]) => [Number(count), multiplier] as [number, number])
                              .sort((a, b) => a[0] - b[0])
                              .map(([count, multiplier]) => (
                                <span key={count} className="hub-paytable__chip">
                                  {count}: {t('scatterPayOfTotalBet', { n: multiplier })}
                                </span>
                              ))}
                        </div>
                      </div>
                      {math.scatter.freeSpins && (
                        <div className="hub-features__freespins-rules">
                          <p>{t('freeSpinsTriggerRule', { count: math.scatter.freeSpins.trigger })}</p>
                          <p>
                            {t('freeSpinsGrantRule', {
                              spins: math.scatter.freeSpins.count,
                              multiplier: math.scatter.freeSpins.multiplier,
                            })}
                          </p>
                          {math.scatter.freeSpins.retrigger && <p>{t('freeSpinsRetriggerRule')}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {helpPage === 'fairness' && (
                <div className="hub-features__section">
                  {lastResult ? (
                    <>
                      <dl className="hub-sheet__fair-list">
                        <dt>{t('provablyFairSeedHash')}</dt>
                        <dd className="hub-sheet__mono">{lastResult.seedHash}</dd>
                        <dt>{t('provablyFairNonce')}</dt>
                        <dd className="hub-sheet__mono">{lastResult.nonce}</dd>
                      </dl>
                      <button
                        type="button"
                        className="hub-sheet__reveal"
                        onClick={() => void handleRevealSeed()}
                        disabled={verifyState === 'checking'}
                      >
                        {t('revealSeed')}
                      </button>
                      {verifyState === 'checking' && <p className="hub-sheet__verify-status">{t('verifying')}</p>}
                      {verifyState === 'done' && verifyResult && (
                        <>
                          <p
                            className={
                              verifyResult.hashMatch
                                ? 'hub-sheet__verify-status hub-sheet__verify-status--ok'
                                : 'hub-sheet__verify-status hub-sheet__verify-status--fail'
                            }
                          >
                            {verifyResult.hashMatch ? '✓' : '✗'} {t('fairVerifyHash')}:{' '}
                            {verifyResult.hashMatch ? t('fairVerifyOk') : t('fairVerifyFail')}
                          </p>
                          <p
                            className={
                              verifyResult.stopsMatch
                                ? 'hub-sheet__verify-status hub-sheet__verify-status--ok'
                                : 'hub-sheet__verify-status hub-sheet__verify-status--fail'
                            }
                          >
                            {verifyResult.stopsMatch ? '✓' : '✗'} {t('fairVerifyStops')}:{' '}
                            {verifyResult.stopsMatch ? t('fairVerifyOk') : t('fairVerifyFail')}
                          </p>
                        </>
                      )}
                      {verifyState === 'error' && (
                        <p className="hub-sheet__verify-status hub-sheet__verify-status--fail">
                          ✗ {t('verifyError')}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="hub-sheet__message">{t('fairnessNoRoundYet')}</p>
                  )}
                </div>
              )}
            </div>

            <button type="button" className="hub-sheet__close" onClick={() => setHelpSheetOpen(false)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
