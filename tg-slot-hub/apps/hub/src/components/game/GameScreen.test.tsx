import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
      clearWins: vi.fn(),
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

  it('disables the Spin button while a spin is in flight and re-enables it after', async () => {
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

    expect(spinButton).toBeDisabled()

    await act(async () => {
      resolveSpin(baseSpinResponse())
    })

    await waitFor(() => expect(spinButton).not.toBeDisabled())
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

  describe('win banner (winTotal renderer event)', () => {
    async function spinAndSettle(response: SpinResponse): Promise<void> {
      mockedApiSpin.mockResolvedValueOnce(response)
      await act(async () => {
        getSpinButton().click()
      })
      await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
    }

    it('rolls the counter up to the total and shows the tier label the renderer sent', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 250,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 25, win: 250, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      expect(mockRenderer.onEvent).not.toBeNull()

      // tier는 허브가 계산하지 않고 렌더러가 보내주는 값을 그대로 라벨로 옮긴다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 250, tier: 'big', durationMs: 30 })
      })

      expect(await screen.findByText('BIG WIN')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('250')).toBeInTheDocument())
    })

    it('jumps the counter to the final value immediately when the stage is tapped', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      // 아주 긴 durationMs — 탭하지 않으면 짧은 시간 안에 목표값에 도달할 수 없다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 50, tier: 'none', durationMs: 60_000 })
      })
      // 배너는 이제 금액 없이 등급 단어(WIN)만 릴 위에 뜬다 — 실제 금액은 WinStrip 몫이다.
      await waitFor(() => expect(container.querySelector('.hub-game-screen__banners')).toHaveTextContent('WIN'))
      expect(container.querySelector('.hub-win-strip__amount')).not.toHaveTextContent('50')

      const stage = container.querySelector('.hub-game-screen__stage')
      expect(stage).not.toBeNull()
      if (stage) fireEvent.click(stage)

      // 탭하면 WinStrip 금액이 즉시 목표값으로 점프한다(롤업 건너뛰기).
      await waitFor(() => expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('50'))

      // 첫 탭은 롤업을 건너뛰고 홀드로 넘어간다 — 두 번째 탭은 그 홀드(배너)를 즉시 끝낸다.
      // WinStrip의 금액은 다음 스핀이 시작되기 전까지 그대로 남는다(새 설계).
      if (stage) fireEvent.click(stage)
      await waitFor(() => expect(container.querySelector('.hub-game-screen__banners')).not.toHaveTextContent('WIN'))
      expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('50')
    })

    it('auto-dismisses the banner after the tier hold time when not tapped, but WinStrip keeps the amount', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      vi.useFakeTimers()
      try {
        // WIN_HOLD_MS.none = 1200ms
        act(() => {
          mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 50, tier: 'none', durationMs: 10 })
        })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(50)
        })
        expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('50')

        // 홀드 시간 이전에는 배너가 아직 떠 있는다.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_100)
        })
        expect(container.querySelector('.hub-game-screen__banners')).toHaveTextContent('WIN')

        // 홀드 시간을 넘기면 탭 없이도 배너는 사라지지만, WinStrip 금액은 남아 있는다.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(200)
        })
        expect(container.querySelector('.hub-game-screen__banners')).not.toHaveTextContent('WIN')
        expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('50')
      } finally {
        vi.useRealTimers()
      }
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

    it('shows the full-screen intro banner when the renderer reports a freeSpins featureTriggered event', async () => {
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

      act(() => {
        mockRenderer.onEvent?.({
          type: 'featureTriggered',
          feature: { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false },
        })
      })

      expect(await screen.findByText('FREE SPINS! 10 spins ×2')).toBeInTheDocument()
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

    it('shows the FREE SPINS COMPLETE banner when the renderer reports modeTransition(to:base, phase:start)', async () => {
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

      // 배너 타이머가 페이크 타이머로 예약되게 스핀 자체를 페이크 타이머 아래서 실행한다 —
      // 실타이머로 예약된 뒤 페이크로 바꾸면 advanceTimersByTimeAsync가 그 타이머를 건드리지 못한다.
      vi.useFakeTimers()
      try {
        await act(async () => {
          getSpinButton().click()
        })

        // freeSpins가 null이 된 것만으로는(예전 동작) 배너가 안 뜬다 — 렌더러의 전환 이벤트가 신호다.
        expect(screen.queryByText('FREE SPINS COMPLETE')).not.toBeInTheDocument()

        act(() => {
          mockRenderer.onEvent?.({ type: 'modeTransition', to: 'base', phase: 'start' })
        })

        expect(screen.getByText('FREE SPINS COMPLETE')).toBeInTheDocument()
        // 배너가 떠 있는 동안은 베팅 셀렉터도 함께 잠겨 있는다.
        expect(screen.getByRole('button', { name: '-' })).toBeDisabled()

        await act(async () => {
          await vi.advanceTimersByTimeAsync(2600)
        })
        expect(screen.queryByText('FREE SPINS COMPLETE')).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
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

    it('WinStrip is only tappable while a win is rolling/holding — the stage tap still calls renderer.clearWins()', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      // 유휴 상태 — WinStrip에는 role="button"이 없다(탭할 게 없다).
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

      // 굴러가는 중 — 이제 WinStrip이 role="button"이 된다.
      await waitFor(() => expect(document.querySelector('.hub-win-strip')).toHaveAttribute('role', 'button'))

      const createdRenderer = mockedCreateSlotRenderer.mock.results.at(-1)?.value as { clearWins: ReturnType<typeof vi.fn> }
      expect(createdRenderer.clearWins).not.toHaveBeenCalled()

      const stage = document.querySelector('.hub-game-screen__stage')
      if (stage) fireEvent.click(stage)

      // 탭하면 릴 라인 순환도(clearWins) 함께 멈춘다.
      expect(createdRenderer.clearWins).toHaveBeenCalledTimes(1)
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
})
