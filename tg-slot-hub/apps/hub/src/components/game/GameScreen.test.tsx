import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinResponse } from '@tgslot/shared'

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
  }
})

import { createSlotRenderer, loadTheme } from '@tgslot/renderer'
import { createSeededRng, spin as engineSpin, parseGameMath } from '@tgslot/slot-engine'
import { getGameMath, spin as apiSpin, getGameState, getRoundSeed } from '../../sdk/api'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { GameScreen } from './GameScreen'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)
const mockedGetRoundSeed = vi.mocked(getRoundSeed)
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
    mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null } })
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
