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
  type RendererEvent,
} from '@tgslot/renderer'
import { createSeededRng, spin as replaySpin, type GameMath } from '@tgslot/slot-engine'
import type { GambleSide, Locale } from '@tgslot/shared'
import { useGameStore, toRendererFreeSpinsMode, AUTO_SPIN_COUNTS } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { navigateToLobby } from '../../router'
import { showBackButton, hideBackButton, haptic } from '../../sdk/tma'
import { getRoundSeed } from '../../sdk/api'
import { Odometer } from '../Odometer'
import { useT, useEffectiveLocale } from '../../i18n'
import { useSettingsStore, type SpinSpeed } from '../../store/settings'
import { groupLabel, groupMembers, symbolLabel, winLineLabel } from '../../game/labels'
import { useDialog } from '../../hooks/useDialog'
import { detectDebugFlag, writeStoredDebugFlag } from '../../lib/debugFlag'
import { evaluateTapGesture } from '../../lib/tapGesture'
import { Modal } from '../Modal'
import { WinStrip, type WinStripLineLabel } from './WinStrip'
import { GambleModal } from './GambleModal'
import { DebugPanel } from './DebugPanel'
import './GameScreen.css'

/** 하단 컨트롤의 스핀 속도 세그먼트가 보여주는 순서(느린 → 빠른). */
const SPIN_SPEEDS: readonly SpinSpeed[] = ['normal', 'quick', 'turbo']

const AUTO_SPIN_SHEET_TITLE_ID = 'hub-autospin-title'

function spinSpeedLabelKey(speed: SpinSpeed): 'spinSpeedNormal' | 'spinSpeedQuick' | 'spinSpeedTurbo' {
  if (speed === 'turbo') return 'spinSpeedTurbo'
  if (speed === 'quick') return 'spinSpeedQuick'
  return 'spinSpeedNormal'
}

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

/**
 * WinStrip 라인 문구의 원천 데이터 — 렌더러의 `winLine`/`winCycle` 이벤트를 그대로 옮겨 담는다.
 * 문구 자체(번역/포맷)는 렌더 시점에 최신 `t`/`locale`/`math`로 계산한다(핸들러 안에서 미리
 * 문자열로 굳히지 않는다) — 렌더러의 onEvent 콜백은 생성 시점에 한 번만 캡처되므로, 문구를
 * 그 안에서 만들면 로케일을 바꿔도 계속 옛 언어로 남는다(WinBanner의 tier와 같은 이유).
 */
type LineLabelSource =
  | { kind: 'line'; symbol: string; group?: string; ways?: number; count: number; win: number; key: number }
  | { kind: 'cycle'; totalWin: number; key: number }

/**
 * 라인/ways 승리에서 심볼 이름 대신 이미지를 count번 반복해 보여주기 위한 아이콘 목록을
 * 만든다(사용자 요청). 배당표 시트가 이미 쓰는 것과 같은 해석 경로(`theme.symbols[id]`)를
 * 그대로 재사용한다 — 별도 URL 조립을 하지 않는다.
 *
 * 그룹 승리(anybar 등)는 대표할 단일 이미지가 없으므로 애초에 아이콘을 만들지 않고 undefined를
 * 돌려준다 — 호출부가 `text`(그룹 이름 문구)로 폴백한다. 테마가 아직 없거나 그 심볼 이미지를
 * 찾지 못해도(로딩 실패, math/theme 심볼 목록 불일치 등) 마찬가지로 undefined — 빈 줄이 뜨거나
 * 깨진 이미지가 보이면 안 된다.
 */
function buildWinLineIcons(
  math: GameMath,
  theme: Theme | null,
  locale: Locale,
  source: Extract<LineLabelSource, { kind: 'line' }>,
): WinStripLineLabel['icons'] | undefined {
  if (source.group) return undefined
  const src = theme?.symbols[source.symbol]
  if (!src) return undefined
  return {
    srcs: Array.from({ length: source.count }, () => src),
    ariaLabel: `${symbolLabel(math, source.symbol, locale)} ×${source.count}`,
    suffix: [...(source.ways ? [`${source.ways} ways`] : []), source.win.toLocaleString('en-US')].join(' · '),
  }
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
  const autoSpin = useGameStore((s) => s.autoSpin)
  const rendererInstance = useGameStore((s) => s.renderer)
  const load = useGameStore((s) => s.load)
  const setBet = useGameStore((s) => s.setBet)
  const setRenderer = useGameStore((s) => s.setRenderer)
  const spinAction = useGameStore((s) => s.spin)
  const startAutoSpinAction = useGameStore((s) => s.startAutoSpin)
  const stopAutoSpinAction = useGameStore((s) => s.stopAutoSpin)
  const gambleAction = useGameStore((s) => s.gamble)
  const collectGambleAction = useGameStore((s) => s.collectGamble)
  const syncGambleExpiryAction = useGameStore((s) => s.syncGambleExpiry)
  const dismissError = useGameStore((s) => s.dismissError)
  // 디버그 패널(개발자 전용, debugEnabled일 때만 마운트) — 프리셋 무장/타이밍/마지막 응답 debug.
  const debugPreset = useGameStore((s) => s.debugPreset)
  const debugMessage = useGameStore((s) => s.debugMessage)
  const lastSpinTiming = useGameStore((s) => s.lastSpinTiming)
  const lastSpinDebug = useGameStore((s) => s.lastSpinDebug)
  const setDebugPresetAction = useGameStore((s) => s.setDebugPreset)
  const dismissDebugMessageAction = useGameStore((s) => s.dismissDebugMessage)
  const spinSpeed = useSettingsStore((s) => s.spinSpeed)
  const setSpinSpeedAction = useSettingsStore((s) => s.setSpinSpeed)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [betSheetOpen, setBetSheetOpen] = useState(false)
  const [autoSpinSheetOpen, setAutoSpinSheetOpen] = useState(false)
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [helpPage, setHelpPage] = useState<HelpPage>(() => readStoredHelpPage(gameId) ?? 'paytable')
  // 디버그 패널 노출 여부 — URL(쿼리/해시쿼리)/localStorage로 마운트 시 한 번 판정하고, 그 뒤로는
  // 게임 제목 5탭 제스처(handleTitleTap)로도 켤 수 있다(껐다 다시 켜는 건 이 세션에서는 지원하지
  // 않는다 — 숨은 기능이라 끄는 UI를 따로 안 둔다).
  const [debugEnabled, setDebugEnabled] = useState(() => detectDebugFlag())
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)
  /** 게임 제목 탭 타임스탬프 — evaluateTapGesture()가 순수하게 판정한다(탭 제스처 참고). */
  const titleTapsRef = useRef<number[]>([])
  /** WinStrip 라인 문구의 원천. 렌더러의 winLine/winCycle 이벤트가 채우고, 새 스핀/탭-스킵이 지운다. */
  const [lineLabelSource, setLineLabelSource] = useState<LineLabelSource | null>(null)
  const lineLabelKeyRef = useRef(0)
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

  // 당첨액 롤업 — 릴 위에 등급 단어 배너는 더 이상 띄우지 않는다(사용자 피드백으로 제거). 실제
  // 금액은 항상 WinStrip(컨트롤 위 고정줄)이 보여주고, winRollupValue는 렌더러의 winTotal 이벤트가
  // 주는 durationMs에 걸쳐 0→목표값으로 굴러간다. 다음 스핀이 시작되기 전까지 최종값이 그대로 남는다.
  const [winRollupValue, setWinRollupValue] = useState(0)
  const winRafRef = useRef<number | null>(null)
  /** SPIN 버튼으로 승리 연출을 건너뛸 때(handleSkipWinsAndAdvance) 롤업을 목표값으로 즉시 점프시키는 플래그. */
  const winSkipRef = useRef(false)
  /**
   * 지금 연출 중인 바퀴가 몇 번째인지(0부터) — 렌더러의 `winCycle` 이벤트가 `winTotal`보다
   * 먼저(같은 렌더 스텝 안에서 동기적으로) 오므로, `winTotal` 핸들러가 이 값을 그대로 읽어
   * "첫 바퀴인지"를 판정한다. 로컬 불리언 플래그 대신 렌더러가 실제로 보내는 사이클 번호를
   * 신뢰 원본으로 쓴다 — 그래야 순환이 스킵/재시작을 거쳐도 어긋나지 않는다.
   */
  const winCycleRef = useRef(0)
  /** showingWin 중 SPIN을 눌러 skipWins()를 부른 뒤, phase가 idle로 돌아오면 곧장 다음 스핀을 건다. */
  const autoAdvanceAfterSkipRef = useRef(false)

  // 새 라운드가 되면(roundId가 바뀌면) 이전 라운드의 공정성 검증 결과를 들고 있으면 안 된다 —
  // 안 그러면 다음 스핀 뒤 공정성 탭을 다시 열었을 때 예전 라운드의 ✓/✗가 잠깐 그대로 보인다.
  useEffect(() => {
    setVerifyState('idle')
    setVerifyResult(null)
  }, [lastResult?.roundId])

  /** 스페이스바를 누르고 있는 동안(오토리핏) 반복 발동을 막는 플래그. keyup에서 풀린다. */
  const spaceHeldRef = useRef(false)

  // 프리스핀 최초 진입 배너 — 데이터는 featureTriggered(freeSpins, retrigger:false)가 주지만,
  // 뜨고 걷히는 시점은 커튼(modeTransition to:'freeSpins' start~end)을 그대로 따른다. 릴 회전·
  // 승리 연출이 다 끝나고 커튼이 화면을 덮은 뒤에야 뜨는 배너이므로, 고정 타이머로 따로 놀지
  // 않는다 — 커튼 배너와 겹치거나 중복되지 않도록 이 배너 하나만 남겼다.
  const freeSpinsIntroDataRef = useRef<{ spins: number; multiplier: number } | null>(null)
  const [freeSpinsIntro, setFreeSpinsIntro] = useState<{ spins: number; multiplier: number } | null>(null)
  // 재발동은 이미 프리스핀 중이라(같은 모드) 커튼이 안 뜬다 — 그래서 재발동만은 지금처럼
  // featureTriggered 자체가 신호가 되는 짧은 토스트로 남겨둔다.
  const [freeSpinsRetrigger, setFreeSpinsRetrigger] = useState<{ spins: number } | null>(null)
  const retriggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 프리스핀 종료 배너 — 렌더러의 modeTransition(to:'base') start/end 쌍이 신호다. 커튼이 화면을
  // 완전히 가리는 순간(start) 뜨고, 커튼이 다 걷힌 순간(end) 함께 사라진다 — 더 이상 고정된
  // 타이머로 따로 놀지 않는다(전환 길이가 스핀 속도/모션 축소에 따라 달라지므로 맞출 수 없다).
  // 렌더러가 end를 어떤 이유로든 못 보내는 극단적인 경우를 대비해 안전장치로 최대 유지 시간을 둔다.
  const [freeSpinsComplete, setFreeSpinsComplete] = useState(false)
  const completeSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * 배너에 함께 보여줄 누적 획득액. freeSpins가 null로 바뀌기 직전까지의 누적값을 담아둔다 —
   * 마지막 프리스핀 라운드 자체의 결과는 서버가 freeSpins를 이미 null로 내려보내 accumulatedWin에
   * 실리지 않으므로, 그 라운드의 totalWin을 별도 effect에서 더해 맞춘다.
   */
  const freeSpinsSummaryRef = useRef<{ accumulatedWin: number } | null>(null)

  function showFreeSpinsCompleteBanner(): void {
    if (completeSafetyTimeoutRef.current !== null) clearTimeout(completeSafetyTimeoutRef.current)
    setFreeSpinsComplete(true)
    completeSafetyTimeoutRef.current = setTimeout(() => {
      completeSafetyTimeoutRef.current = null
      setFreeSpinsComplete(false)
    }, 6000)
  }

  function hideFreeSpinsCompleteBanner(): void {
    if (completeSafetyTimeoutRef.current !== null) {
      clearTimeout(completeSafetyTimeoutRef.current)
      completeSafetyTimeoutRef.current = null
    }
    setFreeSpinsComplete(false)
  }

  // 프리스핀 진입/이탈 커튼 전환이 도는 동안(렌더러의 modeTransition start~end) 스핀/스킵
  // 입력을 무시한다 — 화면이 완전히 가려진 채로 배경이 바뀌는 연출인데 그 틈에 다음 스핀이
  // 끼어들면 커튼과 릴이 어긋나 보인다. 전환이 끝나야 자동 진행(프리스핀 자동 스핀 등)이 이어진다.
  const [modeTransitioning, setModeTransitioning] = useState(false)

  // 배너용 누적 획득액 스냅샷 — freeSpins가 살아있는 동안은 그 값을 그대로 담아두고, 마지막
  // 프리스핀 라운드(freeSpins가 막 null이 된, 그 라운드 자체가 isFreeSpin인 결과)의 당첨은
  // 이 결과의 totalWin을 더해 채운다.
  useEffect(() => {
    if (freeSpins) {
      freeSpinsSummaryRef.current = { accumulatedWin: freeSpins.accumulatedWin }
    } else if (lastResult?.isFreeSpin && freeSpinsSummaryRef.current) {
      freeSpinsSummaryRef.current = {
        accumulatedWin: freeSpinsSummaryRef.current.accumulatedWin + lastResult.totalWin,
      }
    }
  }, [freeSpins, lastResult])

  // WinStrip의 프리스핀 카운터가 참조하는 "표시용" freeSpins. store.freeSpins는 스핀 응답이
  // 오는 즉시 바뀌지만(베팅 잠금/FREE SPIN 버튼 표시 등에 필요), 커튼은 그보다 한참 뒤(릴 회전·
  // 승리 연출이 다 끝난 뒤)에야 뜬다 — 그래서 "진입/이탈"처럼 모드 자체가 바뀌는 경계는
  // store.freeSpins가 바뀐 순간이 아니라 그 전환의 커튼이 다 걷힌 순간(modeTransition end)에야
  // 반영한다. 남은 횟수만 바뀌는 같은 모드 안의 변화(재발동 포함 — 커튼이 안 뜬다)는 곧장
  // 반영한다(모드 경계가 아니므로 미룰 이유가 없다).
  const [displayedFreeSpins, setDisplayedFreeSpins] = useState(freeSpins)
  /** 마지막으로 살펴본 freeSpins의 "활성 여부(null이 아님)" — 이 값과 달라지는 순간이 모드 경계다. */
  const freeSpinsActiveRef = useRef(freeSpins !== null)
  /** 모드 경계를 넘은 새 값 — 커튼이 다 걷힐 때까지 여기 담아두고 표시는 아직 미룬다. */
  const pendingFreeSpinsRevealRef = useRef<{ value: typeof freeSpins; pending: boolean }>({
    value: null,
    pending: false,
  })

  useEffect(() => {
    const isActive = freeSpins !== null
    const crossedBoundary = freeSpinsActiveRef.current !== isActive
    freeSpinsActiveRef.current = isActive

    // 렌더러가 아예 없으면(그래픽 비활성/에러) 커튼도 modeTransition 이벤트도 영영 오지 않는다 —
    // 그런 경우까지 표시를 미루면 카운터가 영영 안 바뀐다. 곧장 반영해 폴백한다.
    if (crossedBoundary && rendererInstance) {
      pendingFreeSpinsRevealRef.current = { value: freeSpins, pending: true }
    } else {
      setDisplayedFreeSpins(freeSpins)
    }
  }, [freeSpins, rendererInstance])

  /** modeTransition('end')에서 부른다 — 경계를 넘어 보류돼 있던 값이 있으면 이제서야 반영한다. */
  function revealPendingFreeSpins(): void {
    if (!pendingFreeSpinsRevealRef.current.pending) return
    setDisplayedFreeSpins(pendingFreeSpinsRevealRef.current.value)
    pendingFreeSpinsRevealRef.current = { value: null, pending: false }
  }

  // 언마운트 시 프리스핀 배너/더블업 결과 타이머 정리.
  useEffect(() => {
    return () => {
      if (retriggerTimeoutRef.current !== null) clearTimeout(retriggerTimeoutRef.current)
      if (completeSafetyTimeoutRef.current !== null) clearTimeout(completeSafetyTimeoutRef.current)
      if (gambleResultTimeoutRef.current !== null) clearTimeout(gambleResultTimeoutRef.current)
    }
  }, [])

  // 렌더러가 새로 생기면(마운트, 또는 renderer 에러 뒤 재생성) 그 시점의 서버 권위 상태로 시각
  // 모드를 맞춰 둔다 — 화면을 나갔다 돌아와 프리스핀을 재개한 경우에도 렌더러가 새로 생성되자마자
  // 반영된다. freeSpins를 의존성에 넣지 않는다 — 스핀마다 커튼을 거는 건 store.spin()의 몫이다
  // (릴 회전·승리 연출이 다 끝난 뒤에야 걸어야 인과가 맞는다). 여기서 매번 반응하면 스핀 응답이
  // 오자마자(릴이 돌기도 전에) 커튼이 뜨는 예전 버그가 되살아난다 — 그래서 store.getState()로
  // "지금 이 순간" 값만 한 번 읽고 구독하지 않는다.
  useEffect(() => {
    rendererInstance?.setMode?.({ freeSpins: toRendererFreeSpinsMode(useGameStore.getState().freeSpins) })
  }, [rendererInstance])

  // 렌더러가 준비되거나(마운트) 설정에서 스핀 속도를 바꾸면 그대로 반영한다 — 돌고 있는 스핀은
  // 건드리지 않고 다음 스핀부터 적용된다(렌더러 계약).
  useEffect(() => {
    rendererInstance?.setSpinSpeed?.(spinSpeed)
  }, [rendererInstance, spinSpeed])

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

  /** 프리스핀 재발동 — 짧은 토스트만 띄운다(같은 모드라 커튼이 없다 — 전체화면 인트로는 최초 진입 때만). */
  function showFreeSpinsRetrigger(spins: number): void {
    if (retriggerTimeoutRef.current !== null) clearTimeout(retriggerTimeoutRef.current)
    setFreeSpinsRetrigger({ spins })
    retriggerTimeoutRef.current = setTimeout(() => {
      retriggerTimeoutRef.current = null
      setFreeSpinsRetrigger(null)
    }, 1600)
  }

  // 렌더러 이벤트:
  // - modeTransition: 커튼이 화면을 완전히 가리는 동안(start~end) 스핀/스킵 입력을 무시한다
  //   (modeTransitioning). 진입 커튼이 뜨면(to:freeSpins, start) featureTriggered가 미리 담아둔
  //   데이터로 전체화면 인트로 배너를 띄우고, 걷히면(end) 함께 내리며 첫 자동 스핀을 풀어주고
  //   보류해 둔 카운터 값을 반영한다. 종료 커튼이 뜨면(to:base, start) COMPLETE 배너를 띄웠다가
  //   걷기까지 끝나면(end) 함께 내리며 카운터를 반영한다 — 배너와 카운터가 커튼보다 먼저
  //   바뀌지 않는다(스핀→승리 연출→커튼 순서를 그대로 따른다).
  // - winTotal이 승리 배너를 시작시키고 durationMs에 걸쳐 롤업한다. 등급(tier)은 렌더러가
  //   계산해 함께 보내주는 값을 우선 쓰고, 없으면 로컬로 폴백 계산한다.
  // - featureTriggered는 프리스핀 진입/재발동을 알린다 — 재발동(retrigger)은 그 자체가 토스트의
  //   신호지만, 최초 진입은 데이터만 담아두고(freeSpinsIntroDataRef) 실제로 뜨는 시점은 위
  //   modeTransition이 정한다(커튼과 겹치지 않도록 인트로 배너를 하나로 합쳤다).
  // ref/setState만 사용하므로 렌더러 생성 시점에 캡처돼도 값이 오래돼(stale) 문제되지 않는다.
  function handleRendererEvent(event: RendererEvent): void {
    if (event.type === 'modeTransition') {
      setModeTransitioning(event.phase === 'start')
      if (event.to === 'freeSpins' && event.phase === 'start') {
        setFreeSpinsIntro(freeSpinsIntroDataRef.current)
      } else if (event.to === 'freeSpins' && event.phase === 'end') {
        setFreeSpinsIntro(null)
        freeSpinsIntroDataRef.current = null
        revealPendingFreeSpins()
        useGameStore.getState().releaseFreeSpinsEntryGate()
      } else if (event.to === 'base' && event.phase === 'start') {
        showFreeSpinsCompleteBanner()
      } else if (event.to === 'base' && event.phase === 'end') {
        hideFreeSpinsCompleteBanner()
        revealPendingFreeSpins()
        // 프리스핀이 끝나 커튼이 다 걷혔다 — 프리스핀 동안 쉬고 있던 오토스핀이 남은 횟수를
        // 그대로 들고 여기서 이어진다(커튼이 덮인 채로 다음 판이 돌면 안 되므로 지금까지 미뤘다).
        useGameStore.getState().resumeAutoSpin()
      }
      return
    }

    if (event.type === 'featureTriggered') {
      const feature = event.feature
      if (feature.type === 'freeSpins') {
        if (feature.retrigger) {
          showFreeSpinsRetrigger(feature.spins)
        } else {
          // 표시는 커튼(modeTransition to:'freeSpins')이 뜰 때 한다 — 여기서는 데이터만 담아둔다.
          freeSpinsIntroDataRef.current = { spins: feature.spins, multiplier: feature.multiplier }
        }
      }
      return
    }

    // 승리 연출 B단계(라인/사이클) — WinStrip 아래에 "어떤 심볼이 얼마를 땄는지" 한 줄을 채운다.
    // 렌더러는 첫 바퀴가 끝난 뒤(showWins가 resolve된 뒤)에도 다음 스핀 전까지 계속 순환하므로
    // 이 이벤트들은 phase가 'idle'로 돌아간 뒤에도 계속 들어올 수 있다 — 의도된 동작이다.
    if (event.type === 'winLine') {
      lineLabelKeyRef.current += 1
      setLineLabelSource({
        kind: 'line',
        symbol: event.symbol,
        group: event.group,
        ways: event.ways,
        count: event.count,
        win: event.win,
        key: lineLabelKeyRef.current,
      })
      return
    }

    if (event.type === 'winCycle') {
      // winTotal이 바로 뒤이어(같은 렌더 스텝 안에서 동기적으로) 오므로, 그 핸들러가 "첫 바퀴인지"
      // 판정할 수 있도록 사이클 번호를 먼저 적어 둔다.
      winCycleRef.current = event.cycle
      lineLabelKeyRef.current += 1
      setLineLabelSource({ kind: 'cycle', totalWin: event.totalWin, key: lineLabelKeyRef.current })
      return
    }

    if (event.type !== 'winTotal') return

    // 등급 단어 배너는 더 이상 없다 — 이 이벤트는 이제 WinStrip 금액 롤업만 다룬다.
    const target = event.totalWin
    const duration = event.durationMs > 0 ? event.durationMs : 1

    if (winRafRef.current !== null) cancelAnimationFrame(winRafRef.current)
    winRafRef.current = null

    // 이 스핀 결과의 승리 연출은 계속 순환(A→B→A→...)하며 매 바퀴 winTotal을 다시 내보낸다.
    // 0→목표값 롤업 애니메이션은 그 결과를 "처음 보여주는" 첫 바퀴(cycle 0)에서만 튼다 —
    // 그 뒤로 도는 바퀴(cycle > 0)는 이미 확정된 금액이므로 다시 세는 척하지 않고 최종값을
    // 그대로 유지한다(재설정 후 재애니메이션하면 사용자가 본 것처럼 매번 0부터 다시 세는
    // 버그가 된다).
    if (winCycleRef.current > 0) {
      winSkipRef.current = false
      setWinRollupValue(target)
      return
    }

    winSkipRef.current = false
    setWinRollupValue(0)

    // 첫 rAF 틱의 timestamp 자체를 기준점으로 삼는다 (Odometer.tsx와 동일한 패턴) —
    // 별도로 `performance.now()`를 부르면 환경에 따라 rAF의 timestamp와 기준이 어긋날 수 있다.
    let startTs: number | null = null
    const step = (ts: number): void => {
      if (winSkipRef.current) {
        setWinRollupValue(target)
        winRafRef.current = null
        return
      }
      if (startTs === null) startTs = ts
      const progress = Math.min(1, (ts - startTs) / duration)
      setWinRollupValue(Math.round(target * progress))
      if (progress < 1) {
        winRafRef.current = requestAnimationFrame(step)
      } else {
        winRafRef.current = null
      }
    }
    winRafRef.current = requestAnimationFrame(step)
  }

  // 새 스핀이 시작되면 이전 당첨 롤업/WinStrip 라인 문구를 지운다.
  useEffect(() => {
    if (phase !== 'spinning') return
    setWinRollupValue(0)
    setLineLabelSource(null)
    winSkipRef.current = false
    winCycleRef.current = 0
    if (winRafRef.current !== null) {
      cancelAnimationFrame(winRafRef.current)
      winRafRef.current = null
    }
  }, [phase])

  // 언마운트 시 진행 중인 롤업 애니메이션을 정리한다.
  useEffect(() => {
    return () => {
      if (winRafRef.current !== null) cancelAnimationFrame(winRafRef.current)
    }
  }, [])

  /**
   * showingWin 중 phase가 idle로 돌아오면(승리 연출의 첫 바퀴가 끝나면) 곧장 다음 스핀을 건다 —
   * SPIN 버튼/스페이스로 "연출 스킵 + 즉시 다음 스핀"을 눌렀을 때만 세워지는 플래그다
   * (handleSkipWinsAndAdvance 참고). 프리스핀 자동진행 타이머는 store.spin()이 항상
   * cancelAutoSpin()으로 먼저 지우므로 여기서 따로 조율할 필요가 없다 — 사용자가 자동 진행을
   * 기다리지 않고 지금 바로 이어가고 싶다는 뜻이라 기존 "탭하면 즉시 진행" 관행과 같다.
   */
  useEffect(() => {
    if (phase !== 'idle' || !autoAdvanceAfterSkipRef.current) return
    autoAdvanceAfterSkipRef.current = false
    void spinAction()
  }, [phase, spinAction])

  /**
   * SPIN 버튼(또는 스페이스)을 승리 연출 중(phase 'showingWin')에 누르면 부른다 — 릴 회전 자체를
   * 건너뛰는 게 아니라(그건 requestSkip 몫) 승리 연출의 첫 바퀴만 즉시 접고(renderer.skipWins,
   * 순환 자체는 멈추지 않는다) 곧장 다음 스핀으로 넘어간다. 롤업 카운터가 돌고 있었으면 사용자가
   * 최종 금액을 잠깐이라도 보도록 목표값으로 점프시킨다.
   */
  const handleSkipWinsAndAdvance = (): void => {
    if (winRafRef.current !== null) winSkipRef.current = true
    rendererInstance?.skipWins?.()
    autoAdvanceAfterSkipRef.current = true
  }

  /**
   * 스테이지(릴 캔버스) 탭 — phase === 'spinning'일 때만 반응한다("결과로 건너뛰기": 릴 회전을
   * 접고 곧장 정지 위치로 붙인다. 서버 결과가 아직 안 왔으면 store가 spinTo 시작 시점에 즉시
   * 건너뛴다). 승리 연출 중(showingWin)에는 탭이 아무 것도 하지 않는다 — 사용자 피드백에 따라
   * "연출을 끝내는" 탭 동작은 없앴다. 연출을 건너뛰고 싶으면 SPIN 버튼(또는 스페이스)을 쓴다.
   */
  const handleStageTap = (): void => {
    // 커튼 전환이 도는 동안은 탭을 무시한다 — 화면이 완전히 가려진 채로 배경이 바뀌는 연출인데
    // 그 틈에 스킵이 끼어들면 커튼이 걷힌 뒤 릴이 결과와 어긋나 보인다.
    if (modeTransitioning) return
    if (phase !== 'spinning') return
    useGameStore.getState().requestSkip()
    haptic('light')
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

  // 디버그 프리셋 요청이 거절됐을 때(DEBUG_DISABLED/DEBUG_NO_MATCH)의 비차단 토스트 — 잠깐 보여주고
  // 스스로 사라진다(사용자가 직접 닫을 필요 없이 스핀을 계속 진행할 수 있어야 한다).
  useEffect(() => {
    if (!debugMessage) return
    const id = setTimeout(() => dismissDebugMessageAction(), 3000)
    return () => clearTimeout(id)
  }, [debugMessage, dismissDebugMessageAction])

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
  const isBusy = phase === 'spinning' || phase === 'showingWin' || modeTransitioning
  // 프리스핀이 끝난 직후에도 종료 배너가 떠 있는 동안은 셀렉터를 계속 잠가 둔다(배너와 함께 풀린다).
  // 오토스핀이 도는 동안도 잠근다(업계 관행) — 판 사이의 짧은 idle 틈에 베팅이 바뀌면 사용자가
  // 무장할 때 예상한 금액과 실제로 빠져나가는 금액이 어긋난다.
  const betLocked = freeSpins !== null || freeSpinsComplete || autoSpin !== null
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

  // WinStrip 표시값 — 우선순위: (1) 더블업 세션이 있으면 걸려 있는 금액 + 받기/더블 버튼(사용자가
  // 누르거나 만료될 때까지 고정 — 더 이상 승리 배너에 가려 깜빡이지 않는다, 애초에 배너 자체가
  // 없어졌다), (2) winRollupValue가 0이 아니면(굴러가는 중이거나 다음 스핀 전이라 최종값이 남아
  // 있는 경우) "WIN", (3) 0이고 프리스핀 중이면 누적 총액을 "FREE SPINS TOTAL", (4) 그 외
  // (진짜 유휴)엔 "WIN 0".
  // math.gamble이 없는데(설정이 아예 없는 게임) gambleSession이 있는 건 있을 수 없는 상태지만,
  // 방어적으로 한 번 더 걸어 둔다 — 서버/엔진 쪽 계약이 어긋나도 UI가 조용히 숨는 쪽이 안전하다.
  const showGambleActions = gambleSession !== null && math?.gamble !== undefined
  const winStripAmount = showGambleActions
    ? gambleSession.pendingWin
    : freeSpins && winRollupValue === 0
      ? freeSpins.accumulatedWin
      : winRollupValue
  const winStripLabel = showGambleActions
    ? t('gamblePendingWinLabel')
    : freeSpins && winRollupValue === 0
      ? t('freeSpinsTotalLabel')
      : t('winStripLabel')

  // WinStrip 아래 프리스핀 진행 상황("프리스핀 5/8 ×2") — 릴 위에 그리던 명판을 대신한다.
  // 렌더러 이벤트가 아니라 store의 freeSpins 상태(left/total/multiplier)를 쓰되, 커튼 전환이
  // 도는 동안은 displayedFreeSpins(전환이 끝나야 갱신되는 스냅샷)를 대신 쓴다 — 릴은 아직 커튼에
  // 가려 있는데 카운터만 먼저 갈아 끼워지면 어색하다. 배수는 1보다 클 때만 붙인다(×1은 정보가
  // 없고 시야만 어지럽힌다 — 릴 위 명판이 지키던 규칙을 그대로 옮겼다).
  const freeSpinsCounter = displayedFreeSpins
    ? displayedFreeSpins.multiplier > 1
      ? t('freeSpinsCounterWithMultiplier', {
          left: displayedFreeSpins.left,
          total: displayedFreeSpins.total,
          multiplier: displayedFreeSpins.multiplier,
        })
      : t('freeSpinsCounter', { left: displayedFreeSpins.left, total: displayedFreeSpins.total })
    : null

  // WinStrip 아래 라인 문구 — 항상 최신 t()/locale/math로 지금 계산한다(handleRendererEvent는
  // 원천 데이터만 담아 두고, 문구 자체는 여기서 만든다 — 렌더러 생성 시점에 캡처된 콜백 안에서
  // 만들면 그 뒤 로케일을 바꿔도 옛 언어로 굳어버린다). 더블업 받기/더블 버튼이 떠 있는 동안에도
  // 계속 보여준다 — 사용자가 "루핑 돌 때마다 어떤 심볼이 얼마 당첨됐는지" 반복 표기를 요청했고,
  // WinStrip은 이 문구와 버튼 줄을 서로 다른 고정 높이 줄에 나눠 그려 자리를 다투지 않는다.
  //
  // 지급 종류별 문구 형태(winLineLabel은 이름만 주므로 count/ways/금액은 여기서 합성한다):
  //   라인/그룹 승리: "위스키 ×3 · 20"        (이름, ×맞은개수, · 금액)
  //   ways 승리:     "판다 ×5 · 4 ways · 348" (이름, ×맞은개수, · N ways, · 금액)
  // 예전엔 winLineLabel이 스스로 "심볼 × N ways"를 만들고 여기서 다시 ×count를 이어 붙여
  // "판다 × 4 ways ×5"처럼 이중으로 겹쳐 보였다 — 이제 이름/count/ways/금액을 한 곳에서만 합성한다.
  const lineLabel: WinStripLineLabel | null = lineLabelSource
    ? {
        key: lineLabelSource.key,
        text:
          lineLabelSource.kind === 'cycle'
            ? t('winStripCycleTotal', { amount: lineLabelSource.totalWin.toLocaleString('en-US') })
            : math
              ? [
                  `${winLineLabel(math, lineLabelSource, locale)} ×${lineLabelSource.count}`,
                  ...(lineLabelSource.ways ? [`${lineLabelSource.ways} ways`] : []),
                  lineLabelSource.win.toLocaleString('en-US'),
                ].join(' · ')
              : '',
        // 'text'는 항상 완전한 폴백 문구로 채워 둔다(위) — 아이콘은 그 위에 얹는 표시 방식일
        // 뿐이다(사용자 요청: 심볼 이름 대신 이미지를 count번). 그룹 승리/이미지 없음이면
        // buildWinLineIcons가 undefined를 돌려주고 WinStrip이 자동으로 text로 폴백한다.
        icons:
          lineLabelSource.kind === 'line' && math ? buildWinLineIcons(math, theme, locale, lineLabelSource) : undefined,
      }
    : null

  const handleSpin = (): void => {
    if (isBusy || !math) return
    haptic('medium')
    void spinAction()
  }

  /** 오토스핀이 돌고 있는 동안 메인 버튼은 "중지 (남은 수)"로 바뀐다. */
  const autoSpinning = autoSpin !== null

  /** 오토스핀 시트에서 회수를 고르면 — 시트를 닫고 그 자리에서 무장한다(첫 판은 store가 건다). */
  const handleAutoSpinPick = (count: number): void => {
    setAutoSpinSheetOpen(false)
    haptic('medium')
    startAutoSpinAction(count)
  }

  /**
   * 오토스핀 중지 — 지금 돌고 있는 판은 그대로 끝나고 다음 판만 취소된다(store.stopAutoSpin).
   * 릴 건너뛰기(requestSkip)로 대신 해석하지 않는다: 오토스핀 중 메인 버튼은 오직 "중지"다.
   */
  const handleStopAutoSpin = (): void => {
    stopAutoSpinAction()
    haptic('light')
  }

  /**
   * SPIN(/STOP) 버튼 클릭 — phase별로 다른 일을 한다:
   * - 'spinning': STOP으로 바뀐 상태다 — 릴 회전만 건너뛴다(requestSkip). 프리젠테이션은 아직
   *   시작도 안 했으니 건드릴 게 없다.
   * - 'showingWin': 버튼은 여전히 SPIN(또는 FREE SPIN)으로 보인다 — 승리 연출을 접고 곧장 다음
   *   스핀으로 넘어간다(handleSkipWinsAndAdvance).
   * - 그 외('idle' 등): 평소처럼 새 스핀을 시작한다.
   */
  const handleSpinButtonClick = (): void => {
    // 오토스핀 중이면 이 버튼은 "중지" 하나만 한다 — 커튼이 떠 있어도 눌러서 멈출 수 있어야 하므로
    // (새 스핀을 거는 게 아니라 예약을 거두는 것뿐이다) 아래 커튼 가드보다 먼저 처리한다.
    if (autoSpinning) {
      handleStopAutoSpin()
      return
    }
    // 커튼 전환이 도는 동안은 스핀/스킵 모두 무시한다 — phase가 이미 idle로 돌아와 있어도
    // (예: 프리스핀 종료 전환처럼 결과가 도착한 직후부터 도는 경우) 커튼이 걷히기 전까진 막는다.
    if (modeTransitioning) return
    if (phase === 'spinning') {
      useGameStore.getState().requestSkip()
      haptic('light')
      return
    }
    if (phase === 'showingWin') {
      handleSkipWinsAndAdvance()
      haptic('light')
      return
    }
    handleSpin()
  }

  // 스페이스바 단축키(데스크탑 편의) — SPIN/STOP 버튼과 정확히 같은 phase별 동작을 따른다:
  // 'spinning'이면 릴 스킵만, 'showingWin'이면 연출 스킵 + 즉시 다음 스핀, 'idle'이고 시트/모달이
  // 없고 프리스핀 자동 진행 중이 아니면 스핀을 시작한다. 다 페이지 스크롤을 막고, 키를 누르고
  // 있어도(오토리핏) keyup 전까지 한 번만 반응한다. 텍스트 입력/모달에 포커스가 가 있으면 아예
  // 가로채지 않는다.
  useEffect(() => {
    const isModalOpen =
      betSheetOpen || helpSheetOpen || autoSpinSheetOpen || errorCode === 'INSUFFICIENT_FUNDS' || gambleModalOpen

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

      // 오토스핀 중이면 스페이스도 메인 버튼과 똑같이 "중지"다 — 그렇지 않으면 판 사이의 짧은
      // idle 틈에 스페이스가 여분의 스핀을 하나 더 끼워 넣는다.
      if (autoSpinning) {
        spaceHeldRef.current = true
        event.preventDefault()
        handleStopAutoSpin()
        return
      }

      // 커튼 전환이 도는 동안은 스페이스도 무시한다(스핀 버튼과 동일 규칙).
      if (modeTransitioning) return

      if (phase === 'spinning') {
        spaceHeldRef.current = true
        event.preventDefault()
        useGameStore.getState().requestSkip()
        haptic('light')
        return
      }

      if (phase === 'showingWin') {
        spaceHeldRef.current = true
        event.preventDefault()
        handleSkipWinsAndAdvance()
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
    // handleSpin/handleSkipWinsAndAdvance는 매 렌더마다 새로 만들어지는 클로저라 deps에 넣어도
    // 사실상 매번 재구독되지만, 명시해 두는 편이 "이 값들이 바뀌면 다시 걸어야 한다"는 의도를
    // 정확히 드러낸다.
  }, [
    phase,
    betSheetOpen,
    helpSheetOpen,
    autoSpinSheetOpen,
    errorCode,
    freeSpins,
    gambleModalOpen,
    modeTransitioning,
    autoSpinning,
    handleSpin,
    handleSkipWinsAndAdvance,
    handleStopAutoSpin,
  ])

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

  /** 게임 제목 5탭(빠르게) — 숨은 제스처로 디버그 패널을 켠다(디버그 패널 참고). 껐다 켜는 UI는 없다. */
  const handleTitleTap = (): void => {
    const { complete, remaining } = evaluateTapGesture([...titleTapsRef.current, Date.now()])
    if (complete) {
      titleTapsRef.current = []
      writeStoredDebugFlag(true)
      setDebugEnabled(true)
      return
    }
    titleTapsRef.current = remaining
  }

  /** 디버그 패널의 "연출 다시 재생" — 마지막 결과로 승리 연출만 다시 튼다(라인 문구도 다시 순환). */
  const handleReplayWins = (): void => {
    if (!rendererInstance || !lastResult) return
    void rendererInstance.showWins(lastResult.wins, {
      totalBet: lastResult.totalBet,
      features: lastResult.features,
    })
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
      .then(() => setWinRollupValue(pendingAtCollect))
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
        setWinRollupValue(response.pendingWin)
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
        {/* onClick은 숨은 디버그 제스처(5번 빠르게 탭)다 — 평소 사용자에게는 아무 표시도 안 하고,
            시각적으로도 버튼처럼 보이지 않게 그대로 둔다(디버그 패널 참고). */}
        <span className="hub-game-screen__title" onClick={handleTitleTap}>
          {title}
        </span>
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
              <span className="hub-game-screen__win-tier-label">
                {freeSpinsSummaryRef.current
                  ? t('freeSpinsCompleteWithWin', {
                      amount: freeSpinsSummaryRef.current.accumulatedWin.toLocaleString('en-US'),
                    })
                  : t('freeSpinsComplete')}
              </span>
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
        </div>

        {/* debugEnabled일 때만 마운트되는 진입점 — 절대 기본으로 보이면 안 된다(디버그 패널 참고).
            stage 자체에 onClick(handleStageTap)이 있으므로 버블링을 막아야 스킵/탭-스킵을 대신
            발동시키지 않는다. */}
        {debugEnabled && (
          <button
            type="button"
            className="hub-game-screen__debug-btn"
            onClick={(e) => {
              e.stopPropagation()
              setDebugPanelOpen(true)
            }}
            aria-label={t('debugButtonLabel')}
          >
            🐞
            {debugPreset && (
              <span className="hub-game-screen__debug-btn-badge" aria-hidden="true">
                {debugPreset.slice(0, 2).toUpperCase()}
              </span>
            )}
          </button>
        )}

        {debugMessage && (
          <div className="hub-game-screen__debug-toast" role="status">
            {debugMessage.message}
          </div>
        )}
      </div>

      {/* 탭으로 승리 연출을 건너뛰는 기능은 없앴다(사용자 피드백) — 연출 스킵은 SPIN 버튼/스페이스
          몫이다(handleSkipWinsAndAdvance). 더블업 세션이 있으면 받기/더블 버튼을 보여준다 —
          한 번 뜨면 사용자가 누르거나 만료될 때까지 고정이다(더 이상 승리 배너에 가려 깜빡이지 않는다). */}
      <WinStrip
        label={winStripLabel}
        amount={winStripAmount}
        lineLabel={lineLabel}
        freeSpinsCounter={freeSpinsCounter}
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

      {debugPanelOpen && (
        <DebugPanel
          onClose={() => setDebugPanelOpen(false)}
          armedPreset={debugPreset}
          onSetPreset={setDebugPresetAction}
          busy={isBusy}
          onReplay={handleReplayWins}
          canReplay={Boolean(rendererInstance && lastResult)}
          timing={lastSpinTiming}
          lastResult={lastResult}
          lastSpinDebug={lastSpinDebug}
          phase={phase}
          freeSpins={freeSpins}
          gambleSession={gambleSession}
        />
      )}

      <div className="hub-game-screen__controls">
        {/* 스핀 속도 3분할 세그먼트 — 예전엔 스핀 버튼 옆 ⚡ 순환 버튼이었다. 세 칸에 이름을 다
            적으려면 폭이 필요해 베팅/스핀 줄 위 자체 줄로 올렸다(그 자리는 AUTO 버튼이 이어받았다) —
            390px에서도 스핀 버튼을 좁히지 않고 세 칸 모두 편히 누를 수 있다. 설정 모달의 같은
            항목과 값을 공유한다(useSettingsStore.spinSpeed 하나뿐이다). */}
        <div
          className="hub-game-screen__speed-seg"
          role="radiogroup"
          aria-label={t('spinSpeedTitle')}
        >
          {SPIN_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={spinSpeed === speed}
              data-active={spinSpeed === speed}
              className="hub-game-screen__speed-seg-btn"
              onClick={() => {
                if (spinSpeed === speed) return
                setSpinSpeedAction(speed)
                haptic('light')
              }}
            >
              {t(spinSpeedLabelKey(speed))}
            </button>
          ))}
        </div>

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

          {/* 오토스핀 중에는 이 버튼 하나가 "중지 (남은 수)"가 된다 — 별도의 중지 버튼을 두지
              않는다(누르면 지금 도는 판만 마치고 멈춘다). */}
          <button
            type="button"
            className={
              phase === 'spinning' || autoSpinning
                ? 'hub-game-screen__spin hub-game-screen__spin--stop'
                : 'hub-game-screen__spin'
            }
            onClick={handleSpinButtonClick}
            disabled={!math}
          >
            {autoSpinning
              ? t('autoSpinStop', { n: autoSpin.remaining })
              : phase === 'spinning'
                ? t('stop')
                : freeSpins
                  ? t('freeSpinButton', { n: freeSpins.left })
                  : t('spin')}
          </button>

          {/* 오토스핀 진입 — 회수(10/25/50/100)를 고르는 작은 중앙 모달을 연다. 프리스핀 중에는
              그 자동진행이 루프의 주인이므로 무장할 수 없다. */}
          <button
            type="button"
            className="hub-game-screen__auto-btn"
            onClick={() => setAutoSpinSheetOpen(true)}
            disabled={!math || autoSpinning || freeSpins !== null}
            aria-label={t('autoSpinTitle')}
          >
            {t('autoSpin')}
          </button>
        </div>

        {errorCode === 'BET_LOCKED' && (
          <p className="hub-game-screen__bet-hint" role="alert">
            {t('betLockedHint', { maxBet: (hubLevelInfo?.maxBet ?? 0).toLocaleString('en-US') })}
          </p>
        )}
      </div>

      {/* 오토스핀 회수 선택 — 설정 모달과 같은 중앙 모달(Modal)을 쓴다(포커스 트랩/Esc/스크롤
          잠금을 그대로 물려받는다). 무제한은 제공하지 않는다. */}
      {autoSpinSheetOpen && (
        <Modal onClose={() => setAutoSpinSheetOpen(false)} titleId={AUTO_SPIN_SHEET_TITLE_ID}>
          <h2 id={AUTO_SPIN_SHEET_TITLE_ID} className="hub-sheet__title">
            {t('autoSpinTitle')}
          </h2>
          <p className="hub-sheet__message">{t('autoSpinHint')}</p>
          <div className="hub-autospin__counts">
            {AUTO_SPIN_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                className="hub-autospin__count"
                onClick={() => handleAutoSpinPick(count)}
              >
                {t('autoSpinCount', { n: count })}
              </button>
            ))}
          </div>
          <button type="button" className="hub-sheet__close" onClick={() => setAutoSpinSheetOpen(false)}>
            {t('close')}
          </button>
        </Modal>
      )}

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
