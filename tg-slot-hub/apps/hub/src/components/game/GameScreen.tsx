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
  const rendererInstance = useGameStore((s) => s.renderer)
  const load = useGameStore((s) => s.load)
  const setBet = useGameStore((s) => s.setBet)
  const setRenderer = useGameStore((s) => s.setRenderer)
  const spinAction = useGameStore((s) => s.spin)
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

  // 언마운트 시 프리스핀 배너 타이머 정리.
  useEffect(() => {
    return () => {
      if (introTimeoutRef.current !== null) clearTimeout(introTimeoutRef.current)
      if (retriggerTimeoutRef.current !== null) clearTimeout(retriggerTimeoutRef.current)
      if (completeTimeoutRef.current !== null) clearTimeout(completeTimeoutRef.current)
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
  const betPerLine = math && math.paylines.length > 0 ? currentBet / math.paylines.length : 0
  const isBusy = phase === 'spinning' || phase === 'showingWin'
  // 프리스핀이 끝난 직후에도 종료 배너가 떠 있는 동안은 셀렉터를 계속 잠가 둔다(배너와 함께 풀린다).
  const betLocked = freeSpins !== null || freeSpinsComplete
  // 페이테이블에 1개짜리 배당이 하나라도 있으면(단일 심볼이 1번 릴에 있을 때만 인정) 각주를 보여준다.
  const hasSingleCountPay = math ? Object.values(math.paytable).some((rule) => 1 in rule) : false

  // 베팅이 잠기는 동안(스핀 중/프리스핀 중) 베팅 목록 시트가 열려 있으면 안 된다.
  useEffect(() => {
    if (betLocked) setBetSheetOpen(false)
  }, [betLocked])

  const title = gameSummary ? (locale === 'ko' && gameSummary.name.ko ? gameSummary.name.ko : gameSummary.name.en) : gameId

  // WinStrip 표시값 — winBannerValue가 0이 아니면(굴러가는 중이거나, 홀드가 끝났지만 다음 스핀
  // 전이라 최종값이 그대로 남아 있는 경우) 그걸 "WIN"으로 보여준다. 0이고 프리스핀 중이면 지금까지
  // 누적된 총액을 "FREE SPINS TOTAL"로, 그 외(진짜 유휴)에는 "WIN 0"을 보여준다.
  const winStripAmount = freeSpins && winBannerValue === 0 ? freeSpins.accumulatedWin : winBannerValue
  const winStripLabel = freeSpins && winBannerValue === 0 ? t('freeSpinsTotalLabel') : t('winStripLabel')

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
    const isModalOpen = betSheetOpen || helpSheetOpen || errorCode === 'INSUFFICIENT_FUNDS'

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
  }, [phase, betSheetOpen, helpSheetOpen, errorCode, freeSpins, handleSpin])

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

      {/* 굴러가는 중/홀드 중일 때만 탭 가능하게 한다 — 평소(유휴)엔 WinStrip이 그냥 숫자판이다. */}
      <WinStrip
        label={winStripLabel}
        amount={winStripAmount}
        onTap={winBanner ? handleWinPresentationTap : undefined}
      />

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
                const lineBet = math.paylines.length > 0 ? level / math.paylines.length : level
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
                        {t('betPerLine', { amount: lineBet.toLocaleString('en-US') })}
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
                {t('paylinesTitle')}
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
                    {t('betPerLine', { amount: betPerLine.toLocaleString('en-US') })}
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

              {helpPage === 'paylines' && (
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
