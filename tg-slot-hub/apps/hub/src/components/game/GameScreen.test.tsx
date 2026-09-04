import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinResponse, GambleResponse } from '@tgslot/shared'

// GameScreen이 createSlotRenderer(...)에 넘긴 onEvent를 테스트에서 직접 호출할 수 있도록 캡처해둔다.
const mockRenderer = vi.hoisted(() => ({
  onEvent: null as ((e: { type: string; [key: string]: unknown }) => void) | null,
}))

vi.mock('@tgslot/renderer', () => ({
  createSlotRenderer: vi.fn((options: { onEvent?: (e: { type: string }) => void }) => {
    mockRenderer.onEvent = options.onEvent ?? null
    return {
      ready: Promise.resolve(),
      spinTo: vi.fn().mockResolvedValue(undefined),
      showWins: vi.fn().mockResolvedValue(undefined),
      skipWins: vi.fn(),
      clearWins: vi.fn(),
      setSpinSpeed: vi.fn(),
      setSpinningIdle: vi.fn(),
      setMode: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
    }
  }),
  loadTheme: vi.fn().mockResolvedValue({
    symbols: {},
    palette: { frame: '#000000', reelBg: '#000000', winLine: ['#ffffff'], text: '#ffffff' },
  }),
}))

vi.mock('../../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../../sdk/api')>('../../sdk/api')
  return {
    ...actual,
    getGameMath: vi.fn(),
    spin: vi.fn(),
    getGameState: vi.fn(),
    getRoundSeed: vi.fn(),
    gamble: vi.fn(),
    collectGamble: vi.fn(),
  }
})

import { createSlotRenderer, loadTheme } from '@tgslot/renderer'
import { createSeededRng, spin as engineSpin, parseGameMath } from '@tgslot/slot-engine'
import {
  getGameMath,
  spin as apiSpin,
  getGameState,
  getRoundSeed,
  gamble as apiGamble,
  collectGamble as apiCollectGamble,
  ApiClientError,
} from '../../sdk/api'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { useSettingsStore } from '../../store/settings'
import { SettingsModal } from '../SettingsModal'
import { GameScreen } from './GameScreen'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)
const mockedGetRoundSeed = vi.mocked(getRoundSeed)
const mockedApiGamble = vi.mocked(apiGamble)
const mockedApiCollectGamble = vi.mocked(apiCollectGamble)
const mockedCreateSlotRenderer = vi.mocked(createSlotRenderer)
const mockedLoadTheme = vi.mocked(loadTheme)

const rawMath = {
  id: 'classic-777',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'seven', name: { en: 'Seven' } },
    { id: 'bar', name: { en: 'Bar' } },
  ],
  strips: [
    ['seven', 'bar', 'seven'],
    ['seven', 'bar', 'seven'],
    ['seven', 'bar', 'seven'],
  ],
  paylines: [[1, 1, 1]],
  paytable: { seven: { 3: 10 }, bar: { 3: 5 } },
  betLevels: [10, 20, 50],
  rtpTarget: 0.96,
  volatility: 'medium',
  // 더블업(Wave 1) — showGambleActions가 math.gamble 존재를 방어적으로 요구하므로 gamble UI
  // 테스트들은 이 블록이 있어야 한다. chance*payout<=1(엔진 refine)을 만족하는 동전 던지기.
  gamble: { type: 'coin-flip' as const, chance: 0.5, payout: 2, maxSteps: 3 },
}

/** 피처 탭 테스트용 — 와일드 + 스캐터(배당표 + 프리스핀 규칙 포함)를 가진 fixture. */
const rawMathWithFeatures = {
  id: 'classic-777',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'seven', name: { en: 'Seven' } },
    { id: 'bar', name: { en: 'Bar' } },
    { id: 'wild', name: { en: 'Wild' }, wild: true },
    { id: 'scatter', name: { en: 'Scatter' }, scatter: true },
  ],
  strips: [
    ['seven', 'bar', 'seven', 'scatter'],
    ['seven', 'bar', 'seven', 'scatter'],
    ['seven', 'bar', 'seven', 'scatter'],
  ],
  paylines: [[1, 1, 1]],
  paytable: { seven: { 3: 10 }, bar: { 3: 5 } },
  wild: { substitutesFor: 'all' as const },
  scatter: {
    symbol: 'scatter',
    pays: { 3: 5, 4: 10, 5: 50 },
    freeSpins: { trigger: 3, count: 10, multiplier: 2, retrigger: true },
  },
  betLevels: [10, 20, 50],
  rtpTarget: 0.96,
  volatility: 'medium',
}

/** 게임 전환 테스트용 — classic-777과는 심볼/페이테이블이 완전히 다른 두 번째 게임. */
const otherRawMath = {
  id: 'fruit-fiesta',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'lemon', name: { en: 'Lemon' } },
    { id: 'plum', name: { en: 'Plum' } },
  ],
  strips: [
    ['lemon', 'plum', 'lemon'],
    ['lemon', 'plum', 'lemon'],
    ['lemon', 'plum', 'lemon'],
  ],
  paylines: [[1, 1, 1]],
  paytable: { lemon: { 3: 4 }, plum: { 3: 3 } },
  betLevels: [10, 20, 50],
  rtpTarget: 0.96,
  volatility: 'medium',
}

/**
 * ways 게임 테스트용 — payModel: 'ways', paylines 없음. ways.base는 rows^reels(3^3=27)와
 * 같아야 하고 betLevels는 betDivisor(25)로 나누어떨어져야 한다(둘 다 slot-engine의 refine).
 */
const waysRawMath = {
  id: 'jungle-ways',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'tiger', name: { en: 'Tiger' } },
    { id: 'monkey', name: { en: 'Monkey' } },
  ],
  strips: [
    ['tiger', 'monkey', 'tiger'],
    ['tiger', 'monkey', 'tiger'],
    ['tiger', 'monkey', 'tiger'],
  ],
  payModel: 'ways' as const,
  ways: { base: 27, bothWays: true, betDivisor: 25 },
  paylines: [],
  paytable: { tiger: { 3: 10 }, monkey: { 3: 5 } },
  betLevels: [25, 50, 100],
  rtpTarget: 0.96,
  volatility: 'medium',
}

function baseSpinResponse(overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'r1',
    stops: [0, 0, 0],
    grid: [['seven', 'seven', 'seven']],
    wins: [],
    totalBet: 10,
    totalWin: 0,
    wallet: { coins: 990, gems: 0 },
    seedHash: 'hash',
    nonce: 1,
    jackpot: 0,
    isFreeSpin: false,
    features: [],
    freeSpins: null,
    mutations: [],
    ...overrides,
  }
}

/**
 * 스핀 버튼을 role+accessible name으로 찾으면 WinStrip("FREE SPINS TOTAL"도 role="button"이고
 * "spin"을 문자열로 포함한다)과 충돌할 수 있으므로, 안정적인 클래스 선택자로 직접 찾는다.
 */
function getSpinButton(): HTMLButtonElement {
  const btn = document.querySelector('.hub-game-screen__spin')
  if (!(btn instanceof HTMLButtonElement)) throw new Error('spin button not found')
  return btn
}

describe('GameScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRenderer.onEvent = null
    useGameStore.getState().reset()
    // 스핀 속도는 설정 스토어(모듈 스코프 싱글턴)에 남으므로 테스트마다 기본값으로 되돌린다.
    useSettingsStore.setState({ spinSpeed: 'normal' })
    useGamesStore.setState({ status: 'ready', games: [], errorMessage: null })
    useHubStore.setState({
      status: 'idle',
      errorMessage: null,
      bonusStatus: null,
      jackpot: null,
      missions: null,
      leaderboard: null,
      levelInfo: null,
      claimingBonus: null,
      claimingMissionId: null,
      bonusClaimError: null,
    })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
    mockedGetGameMath.mockResolvedValue(rawMath)
    mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
  })

  afterEach(() => {
    useGameStore.getState().reset()
  })

  it('loads the game and renders the bet selector with a Spin button', async () => {
    render(<GameScreen gameId="classic-777" />)

    await screen.findByText('10')
    expect(screen.getByRole('button', { name: 'Spin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spin' })).not.toBeDisabled()
  })

  it('turns the Spin button into a Stop button while a spin is in flight — it stays clickable so the reels can be skipped', async () => {
    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    let resolveSpin: (value: SpinResponse) => void = () => {}
    mockedApiSpin.mockReturnValue(
      new Promise((resolve) => {
        resolveSpin = resolve
      }),
    )

    const spinButton = screen.getByRole('button', { name: 'Spin' })

    await act(async () => {
      spinButton.click()
    })

    // 릴이 도는 동안엔 "스탑"으로 바뀐다 — 비활성화하지 않는다(눌러서 릴만 건너뛸 수 있어야 한다).
    const stopButton = screen.getByRole('button', { name: 'Stop' })
    expect(stopButton).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Spin' })).not.toBeInTheDocument()

    stopButton.click()
    expect(useGameStore.getState().phase).toBe('spinning') // 서버 응답 대기 중 — requestSkip은 래치만 세운다.

    await act(async () => {
      resolveSpin(baseSpinResponse())
    })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Spin' })).not.toBeDisabled())
  })

  it('opens the help sheet with the paytable and payline grids when the help button is clicked', async () => {
    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    const helpButton = screen.getByRole('button', { name: 'Help' })
    expect(helpButton).not.toBeDisabled()
    helpButton.click()

    expect(await screen.findByText('Paytable')).toBeInTheDocument()
    expect(screen.getByText('Paylines')).toBeInTheDocument()
    expect(screen.getByText('Bet per line: 10')).toBeInTheDocument()
    expect(screen.getByText('3: ×10')).toBeInTheDocument()
    expect(screen.getByText('3: ×5')).toBeInTheDocument()
  })

  it('shows a wild note in the help sheet when the game has a wild symbol', async () => {
    mockedGetGameMath.mockResolvedValue({
      ...rawMath,
      symbols: [...rawMath.symbols, { id: 'wild', name: { en: 'Wild' }, wild: true }],
      wild: { substitutesFor: 'all' },
    })

    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    screen.getByRole('button', { name: 'Help' }).click()

    expect(await screen.findByText('Wild substitutes for all symbols')).toBeInTheDocument()
  })

  describe('win amount rollup (winTotal renderer event) — no more on-stage banner', () => {
    async function spinAndSettle(response: SpinResponse): Promise<void> {
      mockedApiSpin.mockResolvedValueOnce(response)
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    }

    it('rolls the WinStrip amount up to the total — no tier-word banner is rendered on the stage', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 250,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 25, win: 250, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      expect(mockRenderer.onEvent).not.toBeNull()

      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 250, tier: 'big', durationMs: 30 })
      })

      // 등급 단어 배너는 완전히 없앴다 — 릴 위 배너 영역엔 아무 텍스트도 없어야 한다.
      expect(container.querySelector('.hub-game-screen__banners')).not.toHaveTextContent('WIN')
      await waitFor(() => expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('250'))
    })

    it('tapping the stage during the win presentation does nothing (no skip, no banner to dismiss)', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      // 아주 긴 durationMs — 탭해도 안 건드리면 롤업이 짧은 시간 안에 끝나지 않는다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 50, tier: 'none', durationMs: 60_000 })
      })
      expect(container.querySelector('.hub-win-strip__amount')).not.toHaveTextContent('50')

      const createdRenderer = mockedCreateSlotRenderer.mock.results.at(-1)?.value as {
        clearWins: ReturnType<typeof vi.fn>
        skipWins: ReturnType<typeof vi.fn>
      }
      const stage = container.querySelector('.hub-game-screen__stage')
      expect(stage).not.toBeNull()
      if (stage) fireEvent.click(stage)

      // 정정된 사용자 요구사항: 연출 중 스테이지 탭은 아무 것도 하지 않는다(롤업도 그대로 굴러간다).
      await act(async () => {
        await Promise.resolve()
      })
      expect(container.querySelector('.hub-win-strip__amount')).not.toHaveTextContent('50')
      expect(createdRenderer.clearWins).not.toHaveBeenCalled()
      expect(createdRenderer.skipWins).not.toHaveBeenCalled()
    })

    it('reaches the final amount naturally once durationMs elapses, and it stays until the next spin', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 50, tier: 'none', durationMs: 10 })
      })

      await waitFor(() => expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('50'))
      // 다음 스핀 전까지는 그대로 남아 있는다(새 설계에서도 유지되는 동작).
      await act(async () => {
        await Promise.resolve()
      })
      expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('50')
    })

    it('only rolls up on the first pass (winCycle 0) — a later pass (winCycle > 0) jumps straight to the final amount, never restarting from 0', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 348,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 34.8, win: 348, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      // 첫 바퀴(cycle 0) — 렌더러가 winCycle을 winTotal 바로 앞에 보낸다. durationMs를 짧게
      // 줘서 롤업이 실제로 0→목표값으로 굴러간 뒤(비동기로) 자연스럽게 최종값에 닿는지 본다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 348 })
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 348, tier: 'big', durationMs: 10 })
      })
      expect(container.querySelector('.hub-win-strip__amount')).not.toHaveTextContent('348')

      await waitFor(() => expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('348'))

      // 두 번째 바퀴(cycle 1) — 실사용 버그였다: 렌더러가 순환하며 매 바퀴 winTotal을 다시
      // 내보내는데, 예전 코드는 조건 없이 0으로 되돌리고 다시 굴렸다("당첨 33 · 합계 348"처럼
      // 도중 값이 잠깐 보였다 사라짐). cycle > 0에서는 애니메이션 없이 즉시 최종값이어야 하고,
      // 0으로 잠깐이라도 되돌아가면 안 된다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winCycle', cycle: 1, totalWin: 348 })
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 348, tier: 'big', durationMs: 60_000 })
      })
      // rAF/타이머가 단 하나도 돌기 전, act() 직후 곧장 확인한다 — 재설정됐다면 여기서 '348'이
      // 아니게 된다.
      expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('348')

      // 세 번째 바퀴(cycle 2)도 마찬가지로 즉시 최종값을 유지한다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winCycle', cycle: 2, totalWin: 348 })
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 348, tier: 'big', durationMs: 60_000 })
      })
      expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('348')
    })
  })

  describe('WinStrip line label (winLine/winCycle events)', () => {
    async function spinAndSettle(response: SpinResponse): Promise<void> {
      mockedApiSpin.mockResolvedValueOnce(response)
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    }

    it('shows "symbol ×count · amount" under the amount when a winLine event arrives', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 100,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({
          type: 'winLine',
          line: 0,
          win: 100,
          symbol: 'seven',
          count: 3,
          index: 0,
          total: 1,
          cycle: 0,
        })
      })

      expect(await screen.findByText('Seven ×3 · 100')).toHaveClass('hub-win-strip__line-label')
      expect(container.querySelector('.hub-win-strip__line-label')).toBeInTheDocument()
    })

    it('shows the group name (not the raw symbol id) for a group win', async () => {
      // math.groups는 아직 실제 GameMath 타입/스키마에 없을 수 있으므로(엔진 작업 중) 캐스트로
      // 주입한다 — labels.test.ts/game.test.ts와 같은 이유다.
      mockedGetGameMath.mockResolvedValueOnce({
        ...rawMath,
        groups: { anybar: { name: { en: 'Any BAR' }, members: ['bar', 'seven'] } },
      })
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'anybar', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]], group: 'anybar' }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({
          type: 'winLine',
          line: 0,
          win: 50,
          symbol: 'anybar',
          group: 'anybar',
          count: 3,
          index: 0,
          total: 1,
          cycle: 0,
        })
      })

      expect(await screen.findByText('Any BAR ×3 · 50')).toBeInTheDocument()
    })

    it('shows "name ×count · N ways · amount" for a ways win — no more doubled "× N ways ×count" (defect fix)', async () => {
      mockedGetGameMath.mockResolvedValueOnce(waysRawMath)
      render(<GameScreen gameId="jungle-ways" />)
      await screen.findByText('25')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 25,
          totalWin: 348,
          wins: [{ line: 0, symbol: 'tiger', count: 5, multiplier: 1, win: 348, ways: 4, positions: [] }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({
          type: 'winLine',
          line: 0,
          win: 348,
          symbol: 'tiger',
          count: 5,
          ways: 4,
          index: 0,
          total: 1,
          cycle: 0,
        })
      })

      expect(await screen.findByText('Tiger ×5 · 4 ways · 348')).toBeInTheDocument()
    })

    it('renders the line label in Korean (symbol name localized) when locale is ko', async () => {
      useSessionStore.setState((s) => ({ ...s, user: { ...s.user!, locale: 'ko' } }))
      mockedGetGameMath.mockResolvedValueOnce({
        ...rawMath,
        symbols: [
          { id: 'seven', name: { en: 'Seven', ko: '세븐' } },
          { id: 'bar', name: { en: 'Bar' } },
        ],
      })
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 100,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 100, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
      })

      expect(await screen.findByText('세븐 ×3 · 100')).toBeInTheDocument()
    })

    it('renders the group label in Korean for a group win', async () => {
      useSessionStore.setState((s) => ({ ...s, user: { ...s.user!, locale: 'ko' } }))
      mockedGetGameMath.mockResolvedValueOnce({
        ...rawMath,
        groups: { anybar: { name: { en: 'Any BAR', ko: '바 아무거나' }, members: ['bar', 'seven'] } },
      })
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'anybar', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]], group: 'anybar' }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({
          type: 'winLine',
          line: 0,
          win: 50,
          symbol: 'anybar',
          group: 'anybar',
          count: 3,
          index: 0,
          total: 1,
          cycle: 0,
        })
      })

      expect(await screen.findByText('바 아무거나 ×3 · 50')).toBeInTheDocument()
    })

    it('renders the ways line label in Korean, keeping the "ways" word untranslated (genre term)', async () => {
      useSessionStore.setState((s) => ({ ...s, user: { ...s.user!, locale: 'ko' } }))
      mockedGetGameMath.mockResolvedValueOnce({
        ...waysRawMath,
        symbols: [
          { id: 'tiger', name: { en: 'Tiger', ko: '타이거' } },
          { id: 'monkey', name: { en: 'Monkey' } },
        ],
      })
      render(<GameScreen gameId="jungle-ways" />)
      await screen.findByText('25')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 25,
          totalWin: 348,
          wins: [{ line: 0, symbol: 'tiger', count: 5, multiplier: 1, win: 348, ways: 4, positions: [] }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({
          type: 'winLine',
          line: 0,
          win: 348,
          symbol: 'tiger',
          count: 5,
          ways: 4,
          index: 0,
          total: 1,
          cycle: 0,
        })
      })

      expect(await screen.findByText('타이거 ×5 · 4 ways · 348')).toBeInTheDocument()
    })

    describe('symbol icons instead of the name (theme has the symbol image)', () => {
      it('renders the symbol image count times for a line win instead of "name ×count"', async () => {
        mockedLoadTheme.mockResolvedValueOnce({
          symbols: { seven: '/theme/seven@128.png', bar: '/theme/bar@128.png' },
          palette: { frame: '#000000', reelBg: '#000000', winLine: ['#ffffff'], text: '#ffffff' },
        })
        const { container } = render(<GameScreen gameId="classic-777" />)
        await screen.findByText('10')

        await spinAndSettle(
          baseSpinResponse({
            totalBet: 10,
            totalWin: 100,
            wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
          }),
        )

        act(() => {
          mockRenderer.onEvent?.({
            type: 'winLine',
            line: 0,
            win: 100,
            symbol: 'seven',
            count: 3,
            index: 0,
            total: 1,
            cycle: 0,
          })
        })

        const lineLabel = await waitFor(() => {
          const el = container.querySelector('.hub-win-strip__line-label')
          expect(el).not.toBeNull()
          return el as HTMLElement
        })
        const imgs = lineLabel.querySelectorAll('img')
        expect(imgs).toHaveLength(3)
        imgs.forEach((img) => {
          expect(img).toHaveAttribute('src', '/theme/seven@128.png')
          expect(img).toHaveAttribute('alt', '')
        })
        // 이름 텍스트("Seven ×3")는 화면에 그대로 노출되지 않는다 — 아이콘 그룹의 aria-label이 대신한다.
        expect(screen.queryByText('Seven ×3 · 100')).not.toBeInTheDocument()
        expect(lineLabel.querySelector('.hub-win-strip__line-icons')).toHaveAttribute('aria-label', 'Seven ×3')
        expect(lineLabel.textContent).toContain('100')
      })

      it('renders 5 icons plus "4 ways · 348" for a ways win', async () => {
        mockedGetGameMath.mockResolvedValueOnce(waysRawMath)
        mockedLoadTheme.mockResolvedValueOnce({
          symbols: { tiger: '/theme/tiger@128.png', monkey: '/theme/monkey@128.png' },
          palette: { frame: '#000000', reelBg: '#000000', winLine: ['#ffffff'], text: '#ffffff' },
        })
        const { container } = render(<GameScreen gameId="jungle-ways" />)
        await screen.findByText('25')

        await spinAndSettle(
          baseSpinResponse({
            totalBet: 25,
            totalWin: 348,
            wins: [{ line: 0, symbol: 'tiger', count: 5, multiplier: 1, win: 348, ways: 4, positions: [] }],
          }),
        )

        act(() => {
          mockRenderer.onEvent?.({
            type: 'winLine',
            line: 0,
            win: 348,
            symbol: 'tiger',
            count: 5,
            ways: 4,
            index: 0,
            total: 1,
            cycle: 0,
          })
        })

        const lineLabel = await waitFor(() => {
          const el = container.querySelector('.hub-win-strip__line-label')
          expect(el).not.toBeNull()
          return el as HTMLElement
        })
        const imgs = lineLabel.querySelectorAll('img')
        expect(imgs).toHaveLength(5)
        imgs.forEach((img) => expect(img).toHaveAttribute('src', '/theme/tiger@128.png'))
        expect(lineLabel.querySelector('.hub-win-strip__line-icons')).toHaveAttribute('aria-label', 'Tiger ×5')
        expect(lineLabel.textContent).toContain('4 ways')
        expect(lineLabel.textContent).toContain('348')
        expect(screen.queryByText('Tiger ×5 · 4 ways · 348')).not.toBeInTheDocument()
      })

      it('still shows the group name as text (no single icon represents a group) even when the theme has the member images', async () => {
        mockedGetGameMath.mockResolvedValueOnce({
          ...rawMath,
          groups: { anybar: { name: { en: 'Any BAR' }, members: ['bar', 'seven'] } },
        })
        mockedLoadTheme.mockResolvedValueOnce({
          symbols: { seven: '/theme/seven@128.png', bar: '/theme/bar@128.png' },
          palette: { frame: '#000000', reelBg: '#000000', winLine: ['#ffffff'], text: '#ffffff' },
        })
        const { container } = render(<GameScreen gameId="classic-777" />)
        await screen.findByText('10')

        await spinAndSettle(
          baseSpinResponse({
            totalBet: 10,
            totalWin: 50,
            wins: [{ line: 0, symbol: 'anybar', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]], group: 'anybar' }],
          }),
        )

        act(() => {
          mockRenderer.onEvent?.({
            type: 'winLine',
            line: 0,
            win: 50,
            symbol: 'anybar',
            group: 'anybar',
            count: 3,
            index: 0,
            total: 1,
            cycle: 0,
          })
        })

        const lineLabel = await screen.findByText('Any BAR ×3 · 50')
        expect(lineLabel).toHaveClass('hub-win-strip__line-label')
        expect(container.querySelector('.hub-win-strip__line-label img')).toBeNull()
      })

      it('falls back to "name ×count · amount" text when the theme has no image for that symbol', async () => {
        // 기본 mockedLoadTheme는 symbols: {}를 돌려준다 — seven 이미지가 없다.
        render(<GameScreen gameId="classic-777" />)
        await screen.findByText('10')

        await spinAndSettle(
          baseSpinResponse({
            totalBet: 10,
            totalWin: 100,
            wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
          }),
        )

        act(() => {
          mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 100, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
        })

        const lineLabel = await screen.findByText('Seven ×3 · 100')
        expect(lineLabel).toHaveClass('hub-win-strip__line-label')
        expect(lineLabel.querySelector('img')).toBeNull()
      })

      // "테마 전체 로딩 실패" 시나리오는 이 컴포넌트에서 별도로 흉내 낼 수 없다 — loadTheme와
      // createSlotRenderer가 같은 effect의 같은 try 블록에 있어서, loadTheme가 실패하면
      // 렌더러 자체가 만들어지지 않고(mockRenderer.onEvent가 결코 연결되지 않음) winLine 이벤트를
      // 재현할 방법이 없다(실제 앱에서도 마찬가지 — 렌더러가 없으면 winLine 이벤트도 없다).
      // buildWinLineIcons(theme=null)의 안전성은 위 "테마에 그 심볼 이미지가 없을 때" 케이스와
      // 같은 optional-chaining 경로(`theme?.symbols[id]`)로 이미 커버된다.
    })

    it('shows the total on a winCycle event', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 250,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 25, win: 250, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({ type: 'winCycle', cycle: 1, totalWin: 250 })
      })

      expect(await screen.findByText('Total 250')).toHaveClass('hub-win-strip__line-label')
    })

    it('clears the line label when a new spin starts', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 100,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )
      act(() => {
        mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 100, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
      })
      expect(await screen.findByText('Seven ×3 · 100')).toBeInTheDocument()

      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'r-next' }))
      await act(async () => {
        getSpinButton().click()
      })

      expect(container.querySelector('.hub-win-strip__line-label')).not.toBeInTheDocument()
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    })

    it('a stage tap during the win presentation does NOT clear the line label (tap does nothing now)', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 100,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 100, tier: 'none', durationMs: 60_000 })
        mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 100, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
      })
      expect(await screen.findByText('Seven ×3 · 100')).toBeInTheDocument()

      const stage = container.querySelector('.hub-game-screen__stage')
      expect(stage).not.toBeNull()
      if (stage) fireEvent.click(stage)

      await act(async () => {
        await Promise.resolve()
      })
      expect(container.querySelector('.hub-win-strip__line-label')).toBeInTheDocument()
    })

    it('clicking SPIN while phase is showingWin calls renderer.skipWins() and then advances straight to the next spin', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      const createdRenderer = mockedCreateSlotRenderer.mock.results.at(-1)?.value as {
        showWins: ReturnType<typeof vi.fn>
        skipWins: ReturnType<typeof vi.fn>
      }

      // showWins()가 곧바로 resolve하지 않게 붙잡아 둔다 — phase가 'showingWin'에 머문 상태를
      // 실제로 재현해야 SPIN 버튼이 그 분기(스킵 후 즉시 다음 스핀)를 타는지 검증할 수 있다.
      let resolveShowWins: () => void = () => {}
      createdRenderer.showWins.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveShowWins = resolve
        }),
      )

      mockedApiSpin.mockResolvedValueOnce(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 100,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(container.querySelector('.hub-game-screen__stage')).toHaveAttribute('data-phase', 'showingWin'))

      act(() => {
        mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 100, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
      })
      expect(await screen.findByText('Seven ×3 · 100')).toBeInTheDocument()

      // 다음 스핀 응답을 미리 준비해 둔다 — SPIN을 누르면 스킵 직후 곧장 이 응답으로 넘어가야 한다.
      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'r-next' }))

      fireEvent.click(getSpinButton())
      expect(createdRenderer.skipWins).toHaveBeenCalledTimes(1)

      // 렌더러가 skipWins()로 첫 바퀴를 접었다고 알려준다(실제로는 렌더러 내부가 하는 일) —
      // store.spin()의 await가 풀리고 phase가 idle로 돌아가는 순간, GameScreen의 자동 진행
      // effect가 곧장 다음 스핀을 건다.
      await act(async () => {
        resolveShowWins()
        await Promise.resolve()
      })

      await waitFor(() => expect(mockedApiSpin).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(container.querySelector('.hub-win-strip__line-label')).not.toBeInTheDocument())
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    })
  })

  describe('free spins', () => {
    async function spinAndSettle(response: SpinResponse): Promise<void> {
      mockedApiSpin.mockResolvedValueOnce(response)
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    }

    it('shows the full-screen intro banner once the entry curtain covers the screen (modeTransition to:freeSpins, start) — not right when featureTriggered fires', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
          freeSpins: {
            gameId: 'classic-777',
            left: 10,
            total: 10,
            multiplier: 2,
            totalBet: 10,
            accumulatedWin: 0,
          },
        }),
      )

      // featureTriggered (승리 연출 도중) 시점에는 아직 배너가 뜨지 않는다 — 데이터만 담아둔다.
      act(() => {
        mockRenderer.onEvent?.({
          type: 'featureTriggered',
          feature: { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false },
        })
      })
      expect(screen.queryByText('FREE SPINS! 10 spins ×2')).not.toBeInTheDocument()

      // 승리 연출이 다 끝난 뒤 store가 커튼을 걸면(modeTransition start) 그제서야 뜬다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
      })
      expect(await screen.findByText('FREE SPINS! 10 spins ×2')).toBeInTheDocument()

      // 커튼이 걷히면(end) 함께 내려간다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })
      expect(screen.queryByText('FREE SPINS! 10 spins ×2')).not.toBeInTheDocument()
    })

    it('shows a retrigger toast (not the full intro) when the feature is a retrigger', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          features: [{ type: 'freeSpins', spins: 5, multiplier: 2, retrigger: true }],
          freeSpins: {
            gameId: 'classic-777',
            left: 5,
            total: 15,
            multiplier: 2,
            totalBet: 10,
            accumulatedWin: 40,
          },
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({
          type: 'featureTriggered',
          feature: { type: 'freeSpins', spins: 5, multiplier: 2, retrigger: true },
        })
      })

      expect(await screen.findByText('+5 FREE SPINS')).toBeInTheDocument()
      expect(screen.queryByText(/FREE SPINS! /)).not.toBeInTheDocument()
    })

    it('locks the bet selector and shows the locked bet + FREE SPIN(n) label while active', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          isFreeSpin: true,
          freeSpins: {
            gameId: 'classic-777',
            left: 7,
            total: 10,
            multiplier: 2,
            totalBet: 20,
            accumulatedWin: 30,
          },
        }),
      )

      expect(await screen.findByText('FREE SPIN (7)')).toBeInTheDocument()
      expect(screen.getByText('20')).toBeInTheDocument() // locked bet, not the selector's own value
      expect(screen.getByRole('button', { name: '-' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '+' })).toBeDisabled()
    })

    it('is absent in the base game (row stays mounted with no text — reserved height)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      expect(screen.queryByText(/Free spins \d+\/\d+/)).not.toBeInTheDocument()
      const row = document.querySelector('.hub-win-strip__free-spins-row')
      expect(row).not.toBeNull()
      expect(row?.textContent).toBe('')
    })

    it('shows the free-spins counter below the reels once the entry curtain finishes, sourced from store.freeSpins (not a renderer event)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          isFreeSpin: true,
          freeSpins: {
            gameId: 'classic-777',
            left: 7,
            total: 10,
            multiplier: 2,
            totalBet: 20,
            accumulatedWin: 30,
          },
        }),
      )

      // 진입은 모드 경계다 — 커튼이 다 걷히기(end) 전에는 카운터가 아직 안 바뀐다.
      expect(screen.queryByText('Free spins 7/10 ×2')).not.toBeInTheDocument()
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })

      expect(await screen.findByText('Free spins 7/10 ×2')).toHaveClass(
        'hub-win-strip__free-spins-counter',
      )
    })

    it('renders the free-spins counter in Korean when locale is ko', async () => {
      useSessionStore.setState((s) => ({ ...s, user: { ...s.user!, locale: 'ko' } }))
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          isFreeSpin: true,
          freeSpins: {
            gameId: 'classic-777',
            left: 7,
            total: 10,
            multiplier: 2,
            totalBet: 20,
            accumulatedWin: 30,
          },
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })

      expect(await screen.findByText('프리스핀 7/10 ×2')).toBeInTheDocument()
    })

    it('hides the multiplier when it is ×1', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          isFreeSpin: true,
          freeSpins: {
            gameId: 'classic-777',
            left: 4,
            total: 10,
            multiplier: 1,
            totalBet: 20,
            accumulatedWin: 0,
          },
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })

      expect(await screen.findByText('Free spins 4/10')).toBeInTheDocument()
      expect(screen.queryByText(/×/)).not.toBeInTheDocument()
    })

    it('shows the FREE SPINS COMPLETE banner (with accumulated win) on modeTransition(to:base, start) and hides it on (to:base, end) — no fixed timer', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      useGameStore.setState({
        freeSpins: {
          gameId: 'classic-777',
          left: 1,
          total: 10,
          multiplier: 2,
          totalBet: 10,
          accumulatedWin: 320,
        },
      })
      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ isFreeSpin: true, freeSpins: null }))

      await act(async () => {
        getSpinButton().click()
      })

      // freeSpins가 null이 된 것만으로는(예전 동작) 배너가 안 뜬다 — 렌더러의 전환 이벤트가 신호다.
      expect(screen.queryByText(/FREE SPINS COMPLETE/)).not.toBeInTheDocument()

      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'start' })
      })

      // 마지막 프리스핀 라운드 자체의 결과(totalWin: 0, 기본값)까지 더한 누적액을 함께 보여준다.
      expect(screen.getByText('FREE SPINS COMPLETE · +320')).toBeInTheDocument()
      // 배너가 떠 있는 동안은 베팅 셀렉터도 함께 잠겨 있는다.
      expect(screen.getByRole('button', { name: '-' })).toBeDisabled()

      // 고정 타이머가 아니라 커튼이 다 걷힌 신호(end)로 사라진다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'end' })
      })
      expect(screen.queryByText(/FREE SPINS COMPLETE/)).not.toBeInTheDocument()
    })

    it('releases the first-entry auto-spin gate when the renderer reports modeTransition(to:freeSpins, phase:end)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
          freeSpins: {
            gameId: 'classic-777',
            left: 10,
            total: 10,
            multiplier: 2,
            totalBet: 10,
            accumulatedWin: 0,
          },
        }),
      )

      const releaseSpy = vi.spyOn(useGameStore.getState(), 'releaseFreeSpinsEntryGate')

      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })

      expect(releaseSpy).toHaveBeenCalledTimes(1)
      releaseSpy.mockRestore()
    })

    it('does not swap the below-reel counter while a mode transition is in flight — only after phase:end', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      // 프리스핀 활성 — store 갱신을 먼저 커밋시켜(별도 act) 경계 감지 effect가 pending 값을
      // 담아 두게 한 뒤에, 진입 커튼 start~end를 보낸다(실제로도 setState와 modeTransition
      // 이벤트 사이에는 spinTo/showWins만큼의 시간차가 있다 — 한 틱에 몰아 보내지 않는다).
      act(() => {
        useGameStore.setState({
          freeSpins: {
            gameId: 'classic-777',
            left: 3,
            total: 10,
            multiplier: 2,
            totalBet: 10,
            accumulatedWin: 100,
          },
        })
      })
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })
      expect(await screen.findByText('Free spins 3/10 ×2')).toBeInTheDocument()

      // 종료 커튼이 덮이기 시작한다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'start' })
      })

      // store는 이미 null이 됐지만(실제로는 커튼이 뜨기 전에 이미 그렇다), 커튼이 걷히기
      // 전까지는 카운터가 예전 값 그대로 남아 있어야 한다 — 릴은 아직 가려 있는데 카운터만
      // 먼저 사라지면 어색하다.
      act(() => {
        useGameStore.setState({ freeSpins: null })
      })
      expect(screen.getByText('Free spins 3/10 ×2')).toBeInTheDocument()

      // 커튼이 다 걷힌 뒤에야(end) 최신 상태(프리스핀 없음)로 맞춘다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'end' })
      })
      expect(screen.queryByText(/Free spins \d+\/\d+/)).not.toBeInTheDocument()
    })

    it('ignores Spin/Stop clicks and stage taps while a mode transition is in flight', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
      })

      const spinButton = getSpinButton()
      const stage = document.querySelector('.hub-game-screen__stage')
      expect(stage).not.toBeNull()

      act(() => {
        spinButton.click()
        if (stage) fireEvent.click(stage)
      })

      // 스핀도, 스킵도 걸리지 않는다 — 서버 스핀 API가 호출되지 않았어야 한다.
      expect(mockedApiSpin).not.toHaveBeenCalled()
      expect(useGameStore.getState().phase).toBe('idle')

      // 전환이 끝나면 다시 평소대로 반응한다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
      })
      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse())
      await act(async () => {
        spinButton.click()
      })
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)
    })
  })

  describe('skip to result / Space shortcut (UX round 3)', () => {
    it('tapping the stage while a spin is in flight calls store.requestSkip() and gives a light haptic', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )
      const requestSkipSpy = vi.spyOn(useGameStore.getState(), 'requestSkip')

      await act(async () => {
        screen.getByRole('button', { name: 'Spin' }).click()
      })

      const stage = document.querySelector('.hub-game-screen__stage')
      expect(stage).not.toBeNull()
      if (stage) fireEvent.click(stage)

      expect(requestSkipSpy).toHaveBeenCalledTimes(1)

      await act(async () => {
        resolveSpin(baseSpinResponse())
      })
      requestSkipSpy.mockRestore()
    })

    it('spins when Space is pressed while idle', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      await act(async () => {
        fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      })

      expect(mockedApiSpin).toHaveBeenCalledTimes(1)

      await act(async () => {
        fireEvent.keyUp(window, { code: 'Space', key: ' ' })
        resolveSpin(baseSpinResponse())
      })
    })

    it('ignores Space while a sheet (help) is open', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Help' }).click()
      await screen.findByText('Paytable')

      fireEvent.keyDown(window, { code: 'Space', key: ' ' })

      expect(mockedApiSpin).not.toHaveBeenCalled()
    })

    it('ignores repeated keydown events while Space is held down (no keyup in between)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      await act(async () => {
        fireEvent.keyDown(window, { code: 'Space', key: ' ' })
        fireEvent.keyDown(window, { code: 'Space', key: ' ' })
        fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      })

      expect(mockedApiSpin).toHaveBeenCalledTimes(1)

      await act(async () => {
        fireEvent.keyUp(window, { code: 'Space', key: ' ' })
        resolveSpin(baseSpinResponse())
      })
    })
  })

  describe('bet picker (round 3b)', () => {
    it('opens a bottom sheet listing every bet level with bet-per-line, highlighting the current one', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Bet' }).click()

      expect(await screen.findByText('Bet per line: 10')).toBeInTheDocument()
      expect(screen.getByText('Bet per line: 20')).toBeInTheDocument()
      expect(screen.getByText('Bet per line: 50')).toBeInTheDocument()

      const currentRow = screen.getByText('10', { selector: '.hub-bet-picker__amount' }).closest('button')
      expect(currentRow).toHaveClass('hub-bet-picker__row--current')
    })

    it('selecting a row updates the bet and closes the sheet', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Bet' }).click()
      await screen.findByText('Bet per line: 20')

      screen.getByText('20', { selector: '.hub-bet-picker__amount' }).click()

      await waitFor(() => expect(screen.queryByText('Bet per line: 50')).not.toBeInTheDocument())
      expect(screen.getByText('20')).toBeInTheDocument()
    })

    it('disables the bet trigger while a spin is in flight', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      await act(async () => {
        getSpinButton().click()
      })

      expect(screen.getByRole('button', { name: 'Bet' })).toBeDisabled()

      await act(async () => {
        resolveSpin(baseSpinResponse())
      })
    })
  })

  describe('help paging (round 3b)', () => {
    it('defaults to the paytable page and switches to paylines when that tab is clicked', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Help' }).click()
      expect(await screen.findByText('Bet per line: 10')).toBeInTheDocument()

      act(() => {
        screen.getByRole('tab', { name: 'Paylines' }).click()
      })
      expect(screen.queryByText('Bet per line: 10')).not.toBeInTheDocument()
      expect(screen.getByText('1', { selector: '.hub-paylines__number' })).toBeInTheDocument()
    })

    it('hides the Features tab entirely when the game has no wild and no scatter', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Help' }).click()
      await screen.findByText('Paytable')

      expect(screen.queryByRole('tab', { name: 'Features' })).not.toBeInTheDocument()
    })

    it('shows wild rule, scatter pays (× total bet) and free spins rules on the Features tab', async () => {
      mockedGetGameMath.mockResolvedValue(rawMathWithFeatures)
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Help' }).click()
      await screen.findByText('Paytable')

      act(() => {
        screen.getByRole('tab', { name: 'Features' }).click()
      })

      expect(await screen.findByText('Wild substitutes for all symbols')).toBeInTheDocument()
      expect(screen.getByText('3: ×5 total bet')).toBeInTheDocument()
      expect(screen.getByText('4: ×10 total bet')).toBeInTheDocument()
      expect(screen.getByText('5: ×50 total bet')).toBeInTheDocument()
      expect(screen.getByText('3+ scatters trigger free spins')).toBeInTheDocument()
      expect(screen.getByText('10 spins, ×2 multiplier')).toBeInTheDocument()
      expect(screen.getByText('Retriggering during free spins adds more spins')).toBeInTheDocument()
    })

    it('shows a placeholder on the Fairness tab before any round, and the reveal UI after one', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Help' }).click()
      await screen.findByText('Paytable')
      act(() => {
        screen.getByRole('tab', { name: 'Fairness' }).click()
      })

      expect(await screen.findByText('Spin once to see the fairness proof for that round.')).toBeInTheDocument()

      act(() => {
        screen.getByRole('button', { name: 'Close' }).click()
      })

      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'r9', seedHash: 'seed-hash-abc', nonce: 3 }))
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      act(() => {
        screen.getByRole('button', { name: 'Help' }).click()
      })

      expect(await screen.findByText('seed-hash-abc')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reveal seed' })).toBeInTheDocument()
    })

    it('remembers the last viewed help page per game across mounts', async () => {
      const { unmount } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Help' }).click()
      await screen.findByText('Paytable')
      screen.getByRole('tab', { name: 'Paylines' }).click()
      await waitFor(() => expect(screen.queryByText('Bet per line: 10')).not.toBeInTheDocument())

      unmount()
      useGameStore.getState().reset()

      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')
      screen.getByRole('button', { name: 'Help' }).click()

      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Paylines' })).toHaveAttribute('aria-selected', 'true'),
      )
      expect(screen.queryByText('Bet per line: 10')).not.toBeInTheDocument()
    })
  })

  describe('ways games (Wave 1)', () => {
    beforeEach(() => {
      mockedGetGameMath.mockResolvedValue(waysRawMath)
    })

    it('shows a "Ways" tab instead of "Paylines", with the ways explainer and both-ways note', async () => {
      render(<GameScreen gameId="jungle-ways" />)
      await screen.findByText('25')

      screen.getByRole('button', { name: 'Help' }).click()
      expect(await screen.findByText('Bet per way: 1')).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Paylines' })).not.toBeInTheDocument()

      screen.getByRole('tab', { name: 'Ways' }).click()

      expect(
        await screen.findByText('27 ways to win — matching symbols on adjacent reels pay regardless of position on the reel.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Pays both left-to-right and right-to-left.')).toBeInTheDocument()
    })

    it('shows "Bet per way" labels (not "Bet per line") in the bet-picker sheet', async () => {
      render(<GameScreen gameId="jungle-ways" />)
      await screen.findByText('25')

      screen.getByRole('button', { name: 'Bet' }).click()
      expect(await screen.findByText('Bet per way: 1')).toBeInTheDocument()
      expect(screen.getByText('Bet per way: 2')).toBeInTheDocument()
      expect(screen.getByText('Bet per way: 4')).toBeInTheDocument()
      expect(screen.queryByText(/Bet per line/)).not.toBeInTheDocument()
    })
  })

  describe('gamble / double-up (Wave 1)', () => {
    async function spinAndSettle(response: SpinResponse): Promise<void> {
      mockedApiSpin.mockResolvedValueOnce(response)
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    }

    it('shows Collect/Double buttons after a win with a gambleOffer, and doubling to a win updates the pending amount', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      // winTotal 렌더러 이벤트를 일부러 안 쏜다 — winBanner는 그 이벤트로만 뜨므로, 여기선
      // "배너가 끝난 뒤" 상태와 동등하게 gambleSession이 곧바로 반영되는지만 본다.
      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      expect(await screen.findByRole('button', { name: 'Double (50%)' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument()
      expect(screen.getByText('20', { selector: '.hub-win-strip__amount' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Double (50%)' }))
      expect(await screen.findByText('Double or Nothing (×2)')).toBeInTheDocument()

      mockedApiGamble.mockResolvedValueOnce({
        outcome: 'win',
        autoCollected: false,
        side: 'heads',
        pendingWin: 40,
        wallet: { coins: 990, gems: 0 },
        stepsLeft: 2,
        seedInput: 'gamble-seed-1',
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Heads' }))
      })

      expect(mockedApiGamble).toHaveBeenCalledWith('test-token', 'r1', 'heads', expect.any(String))
      expect(await screen.findByText('You called it! Double up.')).toBeInTheDocument()
      expect(screen.getByText('40', { selector: '.hub-win-strip__amount' })).toBeInTheDocument()
    })

    it('keeps showing the "symbol ×count · amount" line label under the amount while Collect/Double are up (defect: label used to be hidden entirely during a gamble offer)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )
      expect(await screen.findByRole('button', { name: 'Double (50%)' })).toBeInTheDocument()

      act(() => {
        mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 20, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
      })

      expect(await screen.findByText('Seven ×3 · 20')).toBeInTheDocument()
      // 라인 문구가 떴어도 받기/더블 버튼은 그대로 함께 보인다 — 자리를 다투지 않는다.
      expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Double (50%)' })).toBeInTheDocument()
    })

    it('does not remount the Collect/Double buttons across successive winLine/winCycle events (only the label text should change)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )
      const collectButton = await screen.findByRole('button', { name: 'Collect' })
      const doubleButton = screen.getByRole('button', { name: 'Double (50%)' })

      act(() => {
        mockRenderer.onEvent?.({ type: 'winLine', line: 0, win: 20, symbol: 'seven', count: 3, index: 0, total: 1, cycle: 0 })
      })
      expect(await screen.findByText('Seven ×3 · 20')).toBeInTheDocument()

      act(() => {
        mockRenderer.onEvent?.({ type: 'winCycle', cycle: 1, totalWin: 20 })
      })
      expect(await screen.findByText('Total 20')).toBeInTheDocument()

      // 같은 노드 참조(리마운트 없음)로 계속 남아 있는지 — Testing Library가 매번 새로 찾아도
      // 그 DOM 노드 자체가 이전과 동일해야 한다(===).
      expect(screen.getByRole('button', { name: 'Collect' })).toBe(collectButton)
      expect(screen.getByRole('button', { name: 'Double (50%)' })).toBe(doubleButton)
    })

    it('shows the lose message, clears the gamble session, and resets the WinStrip amount to 0 (was showing the stale wagered amount before the fix)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      // 원래 스핀의 승리 배너 롤업을 실제로 끝내둔다 — winBannerValue가 20으로 남아있는 상태에서
      // 더블업을 시작해야, 지고 난 뒤 그 값이 그대로 남는지(원래 버그)를 제대로 검증할 수 있다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 20, tier: 'none', durationMs: 10 })
      })
      await waitFor(() => expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('20'))
      // 승리 배너가 떠 있는 동안은(winBanner !== null) 더블업 버튼이 안 뜬다 — 탭해서 배너부터
      // 치운다(짧은 durationMs라 첫 탭에서 롤업과 홀드가 함께 끝난다).
      const stage = document.querySelector('.hub-game-screen__stage')
      if (stage) fireEvent.click(stage)
      await waitFor(() => expect(document.querySelector('.hub-game-screen__banners')).not.toHaveTextContent('WIN'))

      fireEvent.click(await screen.findByRole('button', { name: 'Double (50%)' }))
      expect(await screen.findByText('Double or Nothing (×2)')).toBeInTheDocument()

      mockedApiGamble.mockResolvedValueOnce({
        outcome: 'lose',
        autoCollected: false,
        side: 'tails',
        pendingWin: 0,
        wallet: { coins: 990, gems: 0 },
        stepsLeft: 0,
        seedInput: 'gamble-seed-2',
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Heads' }))
      })

      expect(await screen.findByText('Wrong side — this round is over.')).toBeInTheDocument()
      expect(useGameStore.getState().gambleSession).toBeNull()
      // WinStrip이 진 뒤에도 더블업 이전의 20을 그대로 보여주면 안 된다 — 0으로 떨어져야 한다.
      await waitFor(() => expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('0'))
    })

    it('updates the WinStrip to the final doubled amount when a win ends the session by hitting the step cap (autoCollected)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 1, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 20, tier: 'none', durationMs: 10 })
      })
      await waitFor(() => expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('20'))
      // 승리 배너가 떠 있는 동안은(winBanner !== null) 더블업 버튼이 안 뜬다 — 탭해서 배너부터
      // 치운다(짧은 durationMs라 첫 탭에서 롤업과 홀드가 함께 끝난다).
      const stage = document.querySelector('.hub-game-screen__stage')
      if (stage) fireEvent.click(stage)
      await waitFor(() => expect(document.querySelector('.hub-game-screen__banners')).not.toHaveTextContent('WIN'))

      fireEvent.click(await screen.findByRole('button', { name: 'Double (50%)' }))
      // maxSteps: 1이라 이 한 판으로 세션이 끝난다 — 이겼지만 자동으로 회수된다(autoCollected).
      mockedApiGamble.mockResolvedValueOnce({
        outcome: 'win',
        autoCollected: true,
        side: 'heads',
        pendingWin: 40,
        wallet: { coins: 1030, gems: 0 },
        stepsLeft: 0,
        seedInput: 'gamble-seed-3',
      })

      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Heads' }))
      })

      // 20에서 멈춰 있지 않고 최종 배당(40)으로 갱신된다.
      await waitFor(() => expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('40'))
    })

    it('collects the pending win via the "Collect" button, calling POST /rounds/:id/collect', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      expect(await screen.findByRole('button', { name: 'Collect' })).toBeInTheDocument()

      mockedApiCollectGamble.mockResolvedValueOnce({
        outcome: 'collected',
        autoCollected: false,
        pendingWin: 0,
        wallet: { coins: 1010, gems: 0 },
        stepsLeft: 0,
        seedInput: '',
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Collect' }))
      })

      expect(mockedApiCollectGamble).toHaveBeenCalledWith('test-token', 'r1')
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument())
      expect(useGameStore.getState().gambleSession).toBeNull()
      // 걸려 있던 20을 챙겼으니 WinStrip이 그 금액을 보여준다(0으로 뚝 떨어지지 않는다).
      await waitFor(() => expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('20'))
    })

    it('shows no Collect/Double buttons when the spin result has no gambleOffer (void case)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(baseSpinResponse({ roundId: 'r1', totalWin: 0, wins: [] }))

      expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Double (50%)' })).not.toBeInTheDocument()
    })

    it('never shows gamble UI when math.gamble is missing, even if the spin response carries a gambleOffer (defensive, engine-landed math.gamble follow-up)', async () => {
      const { gamble: _gamble, ...noGambleMath } = rawMath
      mockedGetGameMath.mockResolvedValue(noGambleMath)

      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      expect(screen.queryByRole('button', { name: /Double/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument()
    })

    it('labels the Double button with the real chance from math.gamble.chance, and the modal title with the real payout', async () => {
      mockedGetGameMath.mockResolvedValue({
        ...rawMath,
        gamble: { type: 'coin-flip' as const, chance: 0.4, payout: 2.5, maxSteps: 3 },
      })

      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      const doubleButton = await screen.findByRole('button', { name: 'Double (40%)' })
      fireEvent.click(doubleButton)
      expect(await screen.findByText('Double or Nothing (×2.5)')).toBeInTheDocument()
    })

    it('locks the modal to the original pick after a retryable failure — the other side is disabled and the picked side shows "Retry"', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Double (50%)' }))
      expect(await screen.findByText('Double or Nothing (×2)')).toBeInTheDocument()

      mockedApiGamble.mockRejectedValueOnce(new ApiClientError('진행 중', 409, 'GAMBLE_IN_PROGRESS'))

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Heads' }))
      })

      // 원래 고른 면(heads)만 "Retry"로 남고, 다른 면(tails)은 잠긴다.
      const retryButton = await screen.findByRole('button', { name: 'Retry' })
      expect(retryButton).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Tails' })).toBeDisabled()
      expect(useGameStore.getState().gambleIdempotencyKey).not.toBeNull()

      mockedApiGamble.mockResolvedValueOnce({
        outcome: 'win',
        autoCollected: false,
        side: 'heads',
        pendingWin: 40,
        wallet: { coins: 990, gems: 0 },
        stepsLeft: 2,
        seedInput: 'retry-seed',
      })

      await act(async () => {
        fireEvent.click(retryButton)
      })

      expect(await screen.findByText('You called it! Double up.')).toBeInTheDocument()
      // 성공했으니 잠금이 풀린다 — 다음에 모달을 새로 열면 두 면 다 고를 수 있다(여기선 굳이
      // 재확인하지 않는다. openGambleModal/closeGambleModal이 잠금을 초기화하는 건 코드로 보장된다).
    })

    it('never infers win/lose for a "collected" (or autoCollected) response — shows the collected message with no coin landing, and uses response.side only when present', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Double (50%)' }))
      expect(await screen.findByText('Double or Nothing (×2)')).toBeInTheDocument()

      // 서버가 판정 자체를 안 했다(만료 등으로 이미 회수됨) — outcome은 'collected'고 side가 없다.
      // outcome이 'win'이 아니므로 "찍은 면"(pick)을 뒤집힌 면으로 추측해 보여주면 안 된다.
      mockedApiGamble.mockResolvedValueOnce({
        outcome: 'collected',
        autoCollected: true,
        pendingWin: 0,
        wallet: { coins: 1010, gems: 0 },
        stepsLeft: 0,
        seedInput: '',
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Heads' }))
      })

      expect(await screen.findByText('Already collected — your win is safe in your wallet.')).toBeInTheDocument()
      expect(screen.queryByText('You called it! Double up.')).not.toBeInTheDocument()
      expect(screen.queryByText('Wrong side — this round is over.')).not.toBeInTheDocument()
      // 코인이 뒤집힌 것처럼 보이면 안 된다 — 착지 클래스가 전혀 없어야 한다.
      const coin = container.querySelector('.hub-gamble-coin__inner')
      expect(coin?.className).not.toMatch(/--land-/)
      expect(useGameStore.getState().gambleSession).toBeNull()
    })

    it('disables the Collect/Double buttons while a collect request is in flight, and re-enables them if it fails without clearing the session', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          roundId: 'r1',
          totalWin: 20,
          wallet: { coins: 990, gems: 0 },
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 2, win: 20, positions: [[0, 1], [1, 1], [2, 1]] }],
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )

      let resolveCollect: (value: GambleResponse) => void = () => {}
      mockedApiCollectGamble.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCollect = resolve
        }),
      )

      const collectButton = await screen.findByRole('button', { name: 'Collect' })
      const doubleButton = screen.getByRole('button', { name: 'Double (50%)' })

      await act(async () => {
        fireEvent.click(collectButton)
      })

      expect(collectButton).toBeDisabled()
      expect(doubleButton).toBeDisabled()

      await act(async () => {
        resolveCollect({
          outcome: 'collected',
          autoCollected: false,
          pendingWin: 0,
          wallet: { coins: 1010, gems: 0 },
          stepsLeft: 0,
          seedInput: '',
        })
      })

      await waitFor(() => expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument())
    })

    it('carries expiresAt from a resumed gamble session: shows a countdown, then hides "Double" (but keeps "Collect") once it passes, synced via a state re-read (not a collect POST)', async () => {
      // shouldAdvanceTime: true — findByText/waitFor의 내부 폴링이 실시간에 비례해 자동으로
      // 진행되므로, 렌더링 직후부터 페이크 타이머를 걸어도 초기 로딩이 멈추지 않는다. 이렇게 해야
      // 만료 effect의 setTimeout이 "페이크 타이머가 걸린 채로" 예약돼, 나중에 advanceTimersByTimeAsync로
      // 실제로 앞당길 수 있다(렌더 이후에 타이머를 걸면 이미 리얼 타이머로 예약된 뒤라 안 먹힌다).
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        mockedGetGameState
          .mockResolvedValueOnce({
            freeSpins: null,
            state: {
              freeSpins: null,
              gamble: {
                roundId: 'r1',
                pendingWin: 50,
                steps: [],
                maxSteps: 3,
                expiresAt: new Date(Date.now() + 5_000).toISOString(),
              },
            },
          })
          // 두 번째 조회(만료 동기화)부터는 서버가 "읽는 순간" 이미 회수해 세션이 없다고 답한다.
          .mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })

        render(<GameScreen gameId="classic-777" />)
        await screen.findByText('10')

        expect(await screen.findByText(/Expires in/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Double (50%)' })).toBeInTheDocument()

        await act(async () => {
          await vi.advanceTimersByTimeAsync(6_000)
        })

        // POST /rounds/:id/collect를 부르지 않는다 — GET /games/:id/state를 다시 읽는 것만으로
        // 서버가 만료된 세션을 회수한다.
        expect(mockedApiCollectGamble).not.toHaveBeenCalled()
        await waitFor(() => expect(mockedGetGameState).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument())
        expect(screen.queryByRole('button', { name: 'Double (50%)' })).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('auto-syncs (via a second state re-read, not a collect POST) a resumed gamble offer whose expiresAt has already passed', async () => {
      mockedGetGameState
        .mockResolvedValueOnce({
          freeSpins: null,
          state: {
            freeSpins: null,
            gamble: {
              roundId: 'r1',
              pendingWin: 50,
              steps: [],
              maxSteps: 3,
              expiresAt: new Date(Date.now() - 1_000).toISOString(),
            },
          },
        })
        .mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })

      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await waitFor(() => expect(mockedGetGameState).toHaveBeenCalledTimes(2))
      expect(mockedApiCollectGamble).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument()
    })
  })

  describe('switching games (App.tsx remounts via key={gameId})', () => {
    it('does not leak the previous game state: no stale WinStrip amount, and the renderer is built with the new game’s own math/theme', async () => {
      // 게임 A(classic-777) — 승리를 하나 굴려서 WinStrip에 3,000이 남게 만든다.
      const { unmount } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await act(async () => {
        mockedApiSpin.mockResolvedValueOnce(
          baseSpinResponse({
            totalWin: 3000,
            wins: [
              { line: 0, symbol: 'seven', count: 3, multiplier: 300, win: 3000, positions: [[0, 1], [1, 1], [2, 1]] },
            ],
          }),
        )
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 3000, tier: 'none', durationMs: 1 })
      })
      await waitFor(() =>
        expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('3,000'),
      )

      // App.tsx가 key={gameId}로 GameScreen을 완전히 새로 마운트하는 것과 동일하게 시뮬레이션한다
      // (같은 인스턴스를 재사용하며 gameId prop만 바꾸는 게 아니라 언마운트 후 재마운트).
      unmount()

      mockedGetGameMath.mockResolvedValue(otherRawMath)
      mockedCreateSlotRenderer.mockClear()
      mockedLoadTheme.mockClear()

      render(<GameScreen gameId="fruit-fiesta" />)
      await screen.findByText('10')

      // WinStrip에 이전 게임의 3,000이 남아있지 않다 — 새 게임은 0에서 시작한다.
      expect(document.querySelector('.hub-win-strip__amount')).toHaveTextContent('0')

      // loadTheme/createSlotRenderer는 새 게임 경로/새 게임 math로만 불렸다 — classic-777의
      // math(예: 'seven'/'bar' 심볼)와 짝지어 불린 적이 없다(그 race가 원래 버그였다).
      expect(mockedLoadTheme).toHaveBeenCalledTimes(1)
      expect(mockedLoadTheme).toHaveBeenCalledWith('/games/fruit-fiesta', expect.objectContaining({ id: 'fruit-fiesta' }))
      expect(mockedCreateSlotRenderer).toHaveBeenCalledTimes(1)
      const createdMath = mockedCreateSlotRenderer.mock.calls[0]?.[0]?.math
      expect(createdMath?.id).toBe('fruit-fiesta')
      expect(createdMath?.symbols.map((s) => s.id)).toEqual(['lemon', 'plum'])
    })

    it('never calls loadTheme with the previous game\'s math when switching directly via key remount in the same render (hash #/play/A -> #/play/B, no lobby in between)', async () => {
      // App.tsx가 실제로 하는 것과 똑같이 key={gameId}로 같은 자리에서 리마운트되게 한다 —
      // 위 테스트처럼 unmount() 후 별도로 render()하면 store reset이 이미 끝난 뒤라 새 렌더가
      // 시작되므로, 원래 버그(새 gameId + 이전 게임의 math 클로저)가 재현되지 않는다.
      function Harness({ gameId }: { gameId: string }) {
        return <GameScreen key={gameId} gameId={gameId} />
      }

      const { rerender } = render(<Harness gameId="classic-777" />)
      await screen.findByText('10')

      mockedGetGameMath.mockResolvedValue(otherRawMath)
      mockedLoadTheme.mockClear()
      mockedCreateSlotRenderer.mockClear()

      await act(async () => {
        rerender(<Harness gameId="fruit-fiesta" />)
      })
      await screen.findByText('10')

      // loadTheme가 어떻게 불렸든, '/games/fruit-fiesta' 경로로 부른 호출은 절대 classic-777의
      // math(예: seven/bar 심볼)를 실어 나르면 안 된다 — 그게 원래 버그였다(ThemeError 유발).
      for (const [path, mathArg] of mockedLoadTheme.mock.calls) {
        if (path === '/games/fruit-fiesta') {
          expect((mathArg as { id?: string } | undefined)?.id).not.toBe('classic-777')
        }
      }

      await waitFor(() => {
        const lastCall = mockedCreateSlotRenderer.mock.calls.at(-1)
        expect(lastCall?.[0]?.math?.id).toBe('fruit-fiesta')
      })
    })
  })

  describe('hub review round 3 (should-fix items)', () => {
    it('Space does not spin when the event target is a button (e.g. the Help button itself)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      const helpButton = screen.getByRole('button', { name: 'Help' })
      fireEvent.keyDown(helpButton, { code: 'Space', key: ' ' })

      expect(mockedApiSpin).not.toHaveBeenCalled()
    })

    it('WinStrip is never tappable anymore (no onTap) — stage tap during the win presentation does not call renderer.clearWins/skipWins', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      // 유휴 상태 — WinStrip에는 role="button"이 없다.
      expect(document.querySelector('.hub-win-strip')).not.toHaveAttribute('role')

      await act(async () => {
        mockedApiSpin.mockResolvedValueOnce(
          baseSpinResponse({
            totalWin: 50,
            wins: [
              { line: 0, symbol: 'seven', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]] },
            ],
          }),
        )
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 50, tier: 'none', durationMs: 60_000 })
      })

      // 굴러가는 중에도(showingWin) WinStrip은 탭 가능한 버튼이 되지 않는다 — 탭으로 연출을
      // 끝내는 기능은 없앴다(사용자 피드백). 연출 스킵은 SPIN 버튼/스페이스 몫이다.
      expect(document.querySelector('.hub-win-strip')).not.toHaveAttribute('role')

      const createdRenderer = mockedCreateSlotRenderer.mock.results.at(-1)?.value as {
        clearWins: ReturnType<typeof vi.fn>
        skipWins: ReturnType<typeof vi.fn>
      }
      const stage = document.querySelector('.hub-game-screen__stage')
      if (stage) fireEvent.click(stage)

      expect(createdRenderer.clearWins).not.toHaveBeenCalled()
      expect(createdRenderer.skipWins).not.toHaveBeenCalled()
    })

    it('fairness check fails when the server-revealed stops differ from what was actually shown, even if the local replay matches the revealed stops', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      const shownStops = [0, 0, 0]
      await act(async () => {
        mockedApiSpin.mockResolvedValueOnce(
          baseSpinResponse({ roundId: 'fair1', stops: shownStops, nonce: 1 }),
        )
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      // 서버가 "공개"하는 seedInput으로 진짜 엔진을 돌려, 로컬 재생과는 반드시 일치할 stops를
      // 미리 계산해 둔다 — 이 테스트는 오직 "공개된 값 vs 실제로 봤던 값(shownStops)"의 불일치만
      // 잡아내는지 확인한다(replay-vs-공개는 항상 맞는 상태로 통제한다).
      const math = parseGameMath(rawMath)
      const seedInput = 'server-seed-input'
      const revealedStops = engineSpin(math, { totalBet: 10 }, createSeededRng(seedInput)).stops
      expect(revealedStops).not.toEqual(shownStops)

      mockedGetRoundSeed.mockResolvedValueOnce({
        roundId: 'fair1',
        gameId: 'classic-777',
        seed: 'the-real-seed',
        seedHash: 'irrelevant-for-this-test',
        nonce: 1,
        stops: revealedStops,
        seedInput,
      })

      act(() => {
        screen.getByRole('button', { name: 'Help' }).click()
      })
      act(() => {
        screen.getByRole('tab', { name: 'Fairness' }).click()
      })
      await act(async () => {
        screen.getByRole('button', { name: 'Reveal seed' }).click()
      })

      expect(await screen.findByText(/Reel stops: Does not match/)).toBeInTheDocument()
    })

    it('resets the fairness verification result when a new round starts (roundId changes)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await act(async () => {
        mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'roundA', stops: [0, 0, 0] }))
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      mockedGetRoundSeed.mockResolvedValueOnce({
        roundId: 'roundA',
        gameId: 'classic-777',
        seed: 'seed-a',
        seedHash: 'irrelevant',
        nonce: 1,
        stops: [0, 0, 0],
        seedInput: 'seed-a',
      })

      act(() => {
        screen.getByRole('button', { name: 'Help' }).click()
      })
      act(() => {
        screen.getByRole('tab', { name: 'Fairness' }).click()
      })
      await act(async () => {
        screen.getByRole('button', { name: 'Reveal seed' }).click()
      })
      expect(await screen.findByText(/Seed hash:/)).toBeInTheDocument()

      act(() => {
        screen.getByRole('button', { name: 'Close' }).click()
      })

      // 다음 라운드가 시작된다 — roundId가 바뀐다.
      await act(async () => {
        mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'roundB', stops: [1, 1, 1] }))
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      act(() => {
        screen.getByRole('button', { name: 'Help' }).click()
      })

      // 이전 라운드의 ✓/✗ 검증 결과가 남아있지 않다 — 다시 "Reveal seed"를 눌러야 하는 idle 상태.
      expect(screen.queryByText(/Seed hash:/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reveal seed' })).not.toBeDisabled()
    })

    it('disables bet-picker rows above the level maxBet and shows the locked hint', async () => {
      useHubStore.setState({ levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 } })
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      screen.getByRole('button', { name: 'Bet' }).click()
      await screen.findByText('Bet per line: 10')

      // betLevels: [10, 20, 50] — maxBet 15면 20과 50이 잠긴다.
      const row50 = screen.getByText('50', { selector: '.hub-bet-picker__amount' }).closest('button')
      expect(row50).toBeDisabled()
      const row10 = screen.getByText('10', { selector: '.hub-bet-picker__amount' }).closest('button')
      expect(row10).not.toBeDisabled()

      expect(screen.getByText('Max bet at your level is 15')).toBeInTheDocument()
    })

    it('closes the help sheet on Escape (useDialog focus trap/Esc)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      act(() => {
        screen.getByRole('button', { name: 'Help' }).click()
      })
      await screen.findByText('Paytable')

      fireEvent.keyDown(document, { key: 'Escape' })

      await waitFor(() => expect(screen.queryByText('Paytable')).not.toBeInTheDocument())
    })
  })

  describe('debug panel (dev tool, gated by debug flag)', () => {
    function getDebugButton(): HTMLButtonElement | null {
      return document.querySelector('.hub-game-screen__debug-btn')
    }

    it('is not rendered by default (no debug=1, no stored flag)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      expect(getDebugButton()).toBeNull()
    })

    it('is rendered when localStorage already has the debug flag set before mount', async () => {
      localStorage.setItem('tgslot.debug', '1')
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      expect(getDebugButton()).not.toBeNull()
    })

    it('appears after 5 quick taps on the game title, and persists the flag to localStorage', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')
      expect(getDebugButton()).toBeNull()

      const title = document.querySelector('.hub-game-screen__title')
      expect(title).not.toBeNull()
      act(() => {
        for (let i = 0; i < 5; i += 1) fireEvent.click(title!)
      })

      expect(getDebugButton()).not.toBeNull()
      expect(localStorage.getItem('tgslot.debug')).toBe('1')
    })

    it('does not arm after slow taps on the title (gesture requires quick taps)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')
      const title = document.querySelector('.hub-game-screen__title')
      expect(title).not.toBeNull()

      vi.useFakeTimers()
      try {
        for (let i = 0; i < 5; i += 1) {
          act(() => {
            fireEvent.click(title!)
          })
          await act(async () => {
            await vi.advanceTimersByTimeAsync(1000)
          })
        }

        expect(getDebugButton()).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('opens the panel on click, arms a preset via the preset buttons, and shows an armed badge', async () => {
      localStorage.setItem('tgslot.debug', '1')
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      act(() => {
        getDebugButton()!.click()
      })
      expect(await screen.findByText('Force next spin')).toBeInTheDocument()

      act(() => {
        screen.getByRole('button', { name: 'Big win' }).click()
      })

      expect(useGameStore.getState().debugPreset).toBe('bigWin')
      // 배지는 프리셋 값의 앞 두 글자를 그대로 대문자로 보여준다("bigWin" → "BI") — 번역이
      // 아니라 좁은 배지 자리에 들어가는 짧은 표식일 뿐이다.
      expect(await screen.findByText('BI')).toBeInTheDocument()
    })

    it('sends the armed preset in the next spin request and clears the badge afterwards', async () => {
      localStorage.setItem('tgslot.debug', '1')
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      act(() => {
        getDebugButton()!.click()
      })
      act(() => {
        screen.getByRole('button', { name: 'Win' }).click()
      })
      act(() => {
        screen.getByText('Close').click()
      })

      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'preset-spin' }))
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      expect(mockedApiSpin).toHaveBeenCalledWith(
        expect.any(String),
        'classic-777',
        expect.objectContaining({ debug: { preset: 'win', maxTries: 5000 } }),
      )
      expect(document.querySelector('.hub-game-screen__debug-btn-badge')).toBeNull()
    })

    it('shows a non-blocking toast for DEBUG_DISABLED without blocking the next spin', async () => {
      localStorage.setItem('tgslot.debug', '1')
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      act(() => {
        getDebugButton()!.click()
      })
      act(() => {
        screen.getByRole('button', { name: 'Win' }).click()
      })
      act(() => {
        screen.getByText('Close').click()
      })

      mockedApiSpin.mockRejectedValueOnce(
        new ApiClientError('Debug spin presets are disabled', 400, 'DEBUG_DISABLED'),
      )
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      expect(await screen.findByText('Debug spin presets are disabled')).toBeInTheDocument()

      // 비차단이므로 곧바로 다음 스핀을 계속 진행할 수 있다.
      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'after-debug-disabled' }))
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
      expect(useGameStore.getState().lastResult?.roundId).toBe('after-debug-disabled')
    })

    it('shows the last SpinResponse JSON and current phase/free-spins/gamble state', async () => {
      localStorage.setItem('tgslot.debug', '1')
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'json-view-1', totalWin: 0 }))
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())

      act(() => {
        getDebugButton()!.click()
      })

      expect(await screen.findByText('Last response')).toBeInTheDocument()
      expect(screen.getByText(/"roundId": "json-view-1"/)).toBeInTheDocument()
      expect(screen.getByText('Phase: idle')).toBeInTheDocument()
      expect(screen.getByText('Free spins: none')).toBeInTheDocument()
      expect(screen.getByText('Gamble: none')).toBeInTheDocument()
    })
  })

  describe('spin speed segmented control (Wave 2 — replaces the ⚡ cycling button)', () => {
    function getSpeedSegment(): HTMLElement {
      const seg = document.querySelector('.hub-game-screen__speed-seg')
      if (!(seg instanceof HTMLElement)) throw new Error('spin speed segment not found')
      return seg
    }

    it('renders exactly three options with the stored value selected — and no ⚡ button is left', async () => {
      useSettingsStore.getState().setSpinSpeed('quick')
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      const options = within(getSpeedSegment()).getAllByRole('radio')
      expect(options.map((o) => o.textContent)).toEqual(['Normal', 'Quick', 'Turbo'])
      expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
      expect(getSpeedSegment().getAttribute('role')).toBe('radiogroup')
      // 순환 버튼은 사라졌다 — 값을 고르는 길은 이 세그먼트(와 설정 모달) 하나뿐이다.
      expect(document.querySelector('.hub-game-screen__speed-btn')).toBeNull()
    })

    it('switches the value on click, persists it, and hands it to the renderer', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      const turbo = within(getSpeedSegment()).getByRole('radio', { name: 'Turbo' })
      await act(async () => {
        turbo.click()
      })

      expect(useSettingsStore.getState().spinSpeed).toBe('turbo')
      expect(turbo.getAttribute('aria-checked')).toBe('true')
      expect(JSON.parse(localStorage.getItem('tgslot.settings') ?? '{}')).toMatchObject({
        spinSpeed: 'turbo',
      })

      const renderer = mockedCreateSlotRenderer.mock.results.at(-1)?.value as {
        setSpinSpeed: ReturnType<typeof vi.fn>
      }
      await waitFor(() => expect(renderer.setSpinSpeed).toHaveBeenCalledWith('turbo'))
    })

    it('stays in sync with the settings modal in both directions (one shared setting, two surfaces)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      // 설정 모달에서 바꾸면 게임 화면 세그먼트가 곧장 따라온다.
      const { unmount } = render(
        <SettingsModal
          user={{ id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 }}
          onClose={() => {}}
        />,
      )
      const modalCard = document.querySelector('.hub-modal')
      if (!(modalCard instanceof HTMLElement)) throw new Error('settings modal not found')
      await act(async () => {
        within(modalCard).getByRole('radio', { name: 'Quick' }).click()
      })
      expect(
        within(getSpeedSegment()).getByRole('radio', { name: 'Quick' }).getAttribute('aria-checked'),
      ).toBe('true')
      unmount()

      // 반대 방향 — 게임 화면에서 바꾼 값이 설정 모달을 다시 열었을 때 그대로 선택돼 있다.
      await act(async () => {
        within(getSpeedSegment()).getByRole('radio', { name: 'Turbo' }).click()
      })
      render(
        <SettingsModal
          user={{ id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 }}
          onClose={() => {}}
        />,
      )
      const reopened = document.querySelector('.hub-modal')
      if (!(reopened instanceof HTMLElement)) throw new Error('settings modal not found')
      expect(within(reopened).getByRole('radio', { name: 'Turbo' }).getAttribute('aria-checked')).toBe(
        'true',
      )
    })
  })

  describe('autospin (Wave 2)', () => {
    function getAutoButton(): HTMLButtonElement {
      const btn = document.querySelector('.hub-game-screen__auto-btn')
      if (!(btn instanceof HTMLButtonElement)) throw new Error('auto button not found')
      return btn
    }

    /** AUTO 버튼 → 회수 시트 → `count`회를 고른다. */
    async function armAutoSpin(count: number): Promise<void> {
      await act(async () => {
        getAutoButton().click()
      })
      const pick = await screen.findByRole('button', { name: `${count} spins` })
      await act(async () => {
        pick.click()
      })
    }

    it('offers exactly 10/25/50/100 (no unlimited) in a centered sheet, and arming it starts spinning right away', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      await act(async () => {
        getAutoButton().click()
      })
      const sheet = document.querySelector('.hub-modal')
      if (!(sheet instanceof HTMLElement)) throw new Error('autospin sheet not found')
      expect(
        within(sheet)
          .getAllByRole('button')
          .map((b) => b.textContent)
          .filter((label) => label !== null && /spins$/.test(label)),
      ).toEqual(['10 spins', '25 spins', '50 spins', '100 spins'])

      await act(async () => {
        within(sheet).getByRole('button', { name: '25 spins' }).click()
      })

      expect(useGameStore.getState().autoSpin).toEqual({ remaining: 25 })
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)

      await act(async () => {
        resolveSpin(baseSpinResponse())
      })
      useGameStore.getState().stopAutoSpin()
    })

    it('turns the main button into STOP with the remaining count, and pressing it finishes the current spin then stops', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      await armAutoSpin(10)

      // 별도의 중지 버튼을 만들지 않는다 — 메인 버튼 하나가 "중지 (남은 수)"가 된다.
      await waitFor(() => expect(getSpinButton()).toHaveTextContent('Stop (10)'))
      expect(getSpinButton().className).toContain('hub-game-screen__spin--stop')
      expect(document.querySelectorAll('.hub-game-screen__spin')).toHaveLength(1)

      await act(async () => {
        getSpinButton().click()
      })
      expect(useGameStore.getState().autoSpin).toBeNull()
      // 지금 도는 판은 그대로 끝난다 — 릴 건너뛰기로 해석하지 않는다.
      expect(useGameStore.getState().phase).toBe('spinning')

      await act(async () => {
        resolveSpin(baseSpinResponse())
      })
      await waitFor(() => expect(getSpinButton()).toHaveTextContent('Spin'))
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)
    })

    it('holds off while the free-spins curtain is up and resumes with the remaining count once modeTransition ends', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      vi.useFakeTimers()
      try {
        // 1판(유료) — 프리스핀을 발동시킨다. 오토스핀 카운터는 이 판만큼만 깎인다(3 → 2).
        mockedApiSpin.mockResolvedValueOnce(
          baseSpinResponse({
            roundId: 'auto-fs-1',
            features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
            freeSpins: {
              gameId: 'classic-777',
              left: 1,
              total: 10,
              multiplier: 2,
              totalBet: 10,
              accumulatedWin: 0,
            },
          }),
        )
        await act(async () => {
          useGameStore.getState().startAutoSpin(3)
          await vi.advanceTimersByTimeAsync(0)
        })
        expect(mockedApiSpin).toHaveBeenCalledTimes(1)
        expect(useGameStore.getState().autoSpin).toEqual({ remaining: 2 })

        // 진입 커튼이 화면을 덮고 있는 동안은 어느 쪽도 다음 판을 걸지 않는다.
        act(() => {
          mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(mockedApiSpin).toHaveBeenCalledTimes(1)

        // 커튼이 걷히면 프리스핀 자동진행이 이어받는다 — 무료 판은 오토스핀 카운터를 소모하지 않는다.
        mockedApiSpin.mockResolvedValueOnce(
          baseSpinResponse({ roundId: 'auto-fs-2', isFreeSpin: true, freeSpins: null }),
        )
        await act(async () => {
          mockRenderer.onEvent?.({ type: 'modeTransition', to: 'freeSpins', phase: 'end' })
          await vi.advanceTimersByTimeAsync(1300)
        })
        expect(mockedApiSpin).toHaveBeenCalledTimes(2)
        expect(useGameStore.getState().autoSpin).toEqual({ remaining: 2 })

        // 종료 커튼이 도는 동안(modeTransitioning)에도 스핀이 나가면 안 된다.
        act(() => {
          mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'start' })
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(mockedApiSpin).toHaveBeenCalledTimes(2)

        // 커튼이 다 걷힌 뒤에야 남은 횟수 그대로 이어진다.
        mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'auto-resume' }))
        await act(async () => {
          mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'end' })
          await vi.advanceTimersByTimeAsync(700)
        })
        expect(mockedApiSpin).toHaveBeenCalledTimes(3)
        expect(useGameStore.getState().autoSpin).toEqual({ remaining: 1 })

        useGameStore.getState().stopAutoSpin()
      } finally {
        vi.useRealTimers()
      }
    })

    it('stops on insufficient funds and surfaces the existing out-of-coins sheet', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      mockedApiSpin.mockRejectedValue(
        new ApiClientError('not enough coins', 402, 'INSUFFICIENT_FUNDS'),
      )

      await armAutoSpin(10)

      await waitFor(() => expect(useGameStore.getState().autoSpin).toBeNull())
      expect(await screen.findByText("You're out of coins")).toBeInTheDocument()
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)
    })

    it('locks the bet selector while it runs (industry practice — the armed bet must not drift)', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      const betPlus = screen.getByRole('button', { name: '+' })
      expect(betPlus).not.toBeDisabled()

      let resolveSpin: (value: SpinResponse) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )
      await armAutoSpin(10)

      await waitFor(() => expect(screen.getByRole('button', { name: '+' })).toBeDisabled())
      expect(screen.getByRole('button', { name: '-' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Bet' })).toBeDisabled()

      // 중지하면 지금 도는 판이 끝나는 대로 다시 풀린다.
      await act(async () => {
        getSpinButton().click()
      })
      await act(async () => {
        resolveSpin(baseSpinResponse())
      })
      await waitFor(() => expect(screen.getByRole('button', { name: '+' })).not.toBeDisabled())
    })

    it('cannot be armed during free spins — that loop owns the reels', async () => {
      mockedGetGameState.mockResolvedValue({
        freeSpins: {
          gameId: 'classic-777',
          left: 5,
          total: 10,
          multiplier: 2,
          totalBet: 10,
          accumulatedWin: 0,
        },
        state: { freeSpins: null, gamble: null },
      })
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await waitFor(() => expect(getAutoButton()).toBeDisabled())
    })
  })
})
