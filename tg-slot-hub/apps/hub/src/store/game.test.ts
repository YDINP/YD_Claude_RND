import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return {
    ...actual,
    getGameMath: vi.fn(),
    spin: vi.fn(),
    getMe: vi.fn(),
    getGameState: vi.fn(),
    gamble: vi.fn(),
    collectGamble: vi.fn(),
  }
})

import type { GameMath } from '@tgslot/slot-engine'
import type { SpinResponse, FreeSpinsState, MutationEvent, GambleResponse } from '@tgslot/shared'
import {
  getGameMath,
  spin as apiSpin,
  getMe,
  getGameState,
  gamble as apiGamble,
  collectGamble as apiCollectGamble,
  ApiClientError,
} from '../sdk/api'
import { useGameStore, type SpinRenderer, type SpinToHandle } from './game'
import { useSessionStore } from './session'
import { useHubStore } from './hub'
import { useSettingsStore } from './settings'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetMe = vi.mocked(getMe)
const mockedGetGameState = vi.mocked(getGameState)
const mockedApiGamble = vi.mocked(apiGamble)
const mockedApiCollectGamble = vi.mocked(apiCollectGamble)

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

/** SpinResponse 목(mock) 팩토리 — Phase 5 필드(isFreeSpin/features/freeSpins)를 매번 다시 안 써도 되게. */
function baseSpinResponse(overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'r0',
    stops: [0, 0, 0],
    grid: [['seven', 'seven', 'seven']],
    wins: [],
    totalBet: 10,
    totalWin: 0,
    wallet: { coins: 990, gems: 0 },
    seedHash: 'hash',
    nonce: 0,
    jackpot: 0,
    isFreeSpin: false,
    features: [],
    freeSpins: null,
    mutations: [],
    ...overrides,
  }
}

function makeFreeSpinsState(overrides: Partial<FreeSpinsState> = {}): FreeSpinsState {
  return {
    gameId: 'classic-777',
    left: 9,
    total: 10,
    multiplier: 2,
    totalBet: 10,
    accumulatedWin: 0,
    ...overrides,
  }
}

function makeGambleResponse(overrides: Partial<GambleResponse> = {}): GambleResponse {
  return {
    outcome: 'win',
    autoCollected: false,
    side: 'heads',
    pendingWin: 20,
    wallet: { coins: 1000, gems: 0 },
    stepsLeft: 2,
    seedInput: 'gamble-seed',
    ...overrides,
  }
}

function makeRenderer() {
  const spinTo = vi.fn().mockResolvedValue(undefined)
  const showWins = vi.fn().mockResolvedValue(undefined)
  const setMode = vi.fn()
  const renderer: SpinRenderer = { spinTo, showWins, setMode }
  return { ...renderer, spinTo, showWins, setMode }
}

/**
 * spinTo()가 돌려주는 손잡이를 흉내낸다 — 진짜 Promise 위에 skip()을 얹어 thenable +
 * skip 가능한 형태로 만든다. resolveFn을 밖에서 쥐고 있다가 원할 때 "릴이 멈췄다"를 흉내낸다.
 */
function makeControllableSpinHandle(): {
  handle: SpinToHandle
  skip: ReturnType<typeof vi.fn>
  resolve: () => void
} {
  let resolveFn: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve
  })
  const skip = vi.fn()
  const handle = Object.assign(promise, { skip }) as SpinToHandle
  return { handle, skip, resolve: resolveFn }
}

describe('game store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
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
      user: {
        id: 'u1',
        telegramId: 1,
        firstName: 'Dev',
        locale: 'en',
        level: 1,
        xp: 0,
      },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  describe('load', () => {
    it('parses math.json and sets phase to idle', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)

      await useGameStore.getState().load('classic-777')

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.math?.id).toBe('classic-777')
      expect(state.betIndex).toBe(0)
    })

    it('sets phase to error when math.json fails to load', async () => {
      mockedGetGameMath.mockRejectedValue(new ApiClientError('not found', 404, 'GAME_NOT_FOUND'))

      await useGameStore.getState().load('missing-game')

      const state = useGameStore.getState()
      expect(state.phase).toBe('error')
      expect(state.errorCode).toBe('GAME_NOT_FOUND')
    })

    it('resumes an in-progress free spins session from GET /games/:id/state', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      const freeSpins = makeFreeSpinsState({ left: 4, total: 10 })
      mockedGetGameState.mockResolvedValue({ freeSpins, state: { freeSpins, gamble: null } })

      await useGameStore.getState().load('classic-777')

      expect(mockedGetGameState).toHaveBeenCalledWith('test-token', 'classic-777')
      expect(useGameStore.getState().freeSpins).toEqual(freeSpins)
    })

    it('does not fail the whole load() when the state resume call errors', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      mockedGetGameState.mockRejectedValue(new ApiClientError('offline', 0, 'network_error'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useGameStore.getState().load('classic-777')

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.freeSpins).toBeNull()
      consoleErrorSpy.mockRestore()
    })

    it('does not call getGameState when there is no token', async () => {
      useSessionStore.setState({ token: null })
      mockedGetGameMath.mockResolvedValue(rawMath)

      await useGameStore.getState().load('classic-777')

      expect(mockedGetGameState).not.toHaveBeenCalled()
    })
  })

  describe('spin', () => {
    async function loadGame(): Promise<void> {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')
    }

    it('passes stops through to the renderer and overwrites wallet with the server value', async () => {
      await loadGame()
      const renderer = makeRenderer()
      useGameStore.getState().setRenderer(renderer)

      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({ roundId: 'r1', stops: [1, 2, 0], grid: [['seven', 'bar', 'seven']], nonce: 1 }),
      )

      await useGameStore.getState().spin()

      expect(renderer.spinTo).toHaveBeenCalledWith([1, 2, 0], undefined)
      expect(useSessionStore.getState().wallet).toEqual({ coins: 990, gems: 0 })
      expect(useGameStore.getState().phase).toBe('idle')
      expect(useGameStore.getState().lastResult?.roundId).toBe('r1')
    })

    describe('mutations (Wave 1)', () => {
      it('passes gridBefore/mutations through to spinTo when the response has them', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)

        const mutations: MutationEvent[] = [
          {
            type: 'mystery',
            symbol: 'seven',
            cells: [{ position: [0, 1], from: 'q', to: 'seven' }],
          },
        ]
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({
            roundId: 'mut1',
            stops: [1, 2, 0],
            gridBefore: [['q', 'bar', 'seven']],
            grid: [['seven', 'bar', 'seven']],
            mutations,
          }),
        )

        await useGameStore.getState().spin()

        expect(renderer.spinTo).toHaveBeenCalledWith(
          [1, 2, 0],
          expect.objectContaining({ gridBefore: [['q', 'bar', 'seven']], mutations }),
        )
      })

      it('does not add spinTo options at all when there is nothing special (no mutations, no free spin)', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)

        mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'mut2', stops: [0, 1, 2] }))

        await useGameStore.getState().spin()

        expect(renderer.spinTo).toHaveBeenCalledWith([0, 1, 2], undefined)
      })

      it('win presentation (showWins) only starts after spinTo (which plays the mutation reveal) resolves', async () => {
        await loadGame()
        const renderer = makeRenderer()
        const { handle, resolve } = makeControllableSpinHandle()
        renderer.spinTo.mockReturnValue(handle)
        useGameStore.getState().setRenderer(renderer)

        const wins = [
          { line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] as [number, number][] },
        ]
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({
            roundId: 'mut3',
            wins,
            totalWin: 100,
            mutations: [{ type: 'expandWild', symbol: 'wild', reels: [1], cells: [] }],
          }),
        )

        const spinPromise = useGameStore.getState().spin()
        await Promise.resolve()
        expect(renderer.spinTo).toHaveBeenCalled()
        // 손잡이(=뮤테이션 리빌 연출 포함)가 아직 안 끝났으니 showWins는 아직 불리면 안 된다.
        expect(renderer.showWins).not.toHaveBeenCalled()

        resolve()
        await spinPromise

        expect(renderer.showWins).toHaveBeenCalledWith(wins, expect.objectContaining({ totalBet: 10 }))
      })
    })

    it('calls showWins on the renderer when the result has wins', async () => {
      await loadGame()
      const renderer = makeRenderer()
      useGameStore.getState().setRenderer(renderer)

      const wins = [
        { line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] as [number, number][] },
      ]
      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({ roundId: 'r2', wins, totalWin: 100, wallet: { coins: 1090, gems: 0 }, nonce: 2 }),
      )

      await useGameStore.getState().spin()

      // totalBet을 함께 넘겨야 렌더러가 winTotal 이벤트의 등급(tier)을 라인 추정 없이 정확히 계산한다.
      // formatLineLabel도 항상 넘긴다 — 정확한 문구는 아래 별도 테스트가 검증한다.
      expect(renderer.showWins).toHaveBeenCalledWith(
        wins,
        expect.objectContaining({ totalBet: 10, formatLineLabel: expect.any(Function) }),
      )
    })

    it('accepts a ways win (line: -1, ways set) from the response: wallet updated, lastResult set, showWins called', async () => {
      await loadGame()
      const renderer = makeRenderer()
      useGameStore.getState().setRenderer(renderer)

      const waysWins = [
        {
          line: -1,
          symbol: 'charm',
          count: 5,
          multiplier: 13,
          win: 52,
          positions: [[0, 0], [1, 1]] as [number, number][],
          ways: 4,
          direction: 'ltr' as const,
        },
      ]
      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({ roundId: 'ways1', wins: waysWins, totalWin: 52, wallet: { coins: 1042, gems: 0 }, nonce: 11 }),
      )

      await useGameStore.getState().spin()

      expect(useSessionStore.getState().wallet).toEqual({ coins: 1042, gems: 0 })
      expect(useGameStore.getState().lastResult?.roundId).toBe('ways1')
      expect(useGameStore.getState().lastResult?.wins).toEqual(waysWins)
      expect(useGameStore.getState().phase).toBe('idle')
      expect(renderer.showWins).toHaveBeenCalledWith(waysWins, expect.objectContaining({ totalBet: 10 }))
    })

    it('builds a formatLineLabel that uses the symbol name for a plain win and the group name for a group win', async () => {
      await loadGame()
      // math.groups는 아직 실제 GameMath 타입/스키마에 없을 수 있으므로(엔진 작업 중) 캐스트로
      // 주입한다 — labels.test.ts와 같은 이유다.
      const mathWithGroup = {
        ...rawMath,
        groups: { anybar: { name: { en: 'Any BAR' }, members: ['bar'] } },
      } as unknown as GameMath
      useGameStore.setState({ math: mathWithGroup })

      const renderer = makeRenderer()
      useGameStore.getState().setRenderer(renderer)

      const wins = [
        {
          line: 0,
          symbol: 'seven',
          count: 3,
          multiplier: 10,
          win: 100,
          positions: [[0, 1], [1, 1], [2, 1]] as [number, number][],
        },
      ]
      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({ roundId: 'r2b', wins, totalWin: 100, wallet: { coins: 1090, gems: 0 }, nonce: 2 }),
      )

      await useGameStore.getState().spin()

      const { formatLineLabel } = renderer.showWins.mock.calls[0]![1] as {
        formatLineLabel: (win: (typeof wins)[number] & { group?: string }) => string
      }

      expect(formatLineLabel(wins[0]!)).toBe('Seven · 100')
      expect(formatLineLabel({ ...wins[0]!, symbol: 'anybar', group: 'anybar' })).toBe('Any BAR · 100')
    })

    it('formatLineLabel follows the settings locale (not just the session user locale) — user.locale stays en but settings.locale=ko wins', async () => {
      await loadGame()
      const mathWithKoName = {
        ...rawMath,
        symbols: [{ id: 'seven', name: { en: 'Seven', ko: '세븐' } }, { id: 'bar', name: { en: 'Bar' } }],
      } as unknown as GameMath
      useGameStore.setState({ math: mathWithKoName })
      // 세션 유저 로케일은 여전히 en이다 — 설정에서 ko를 고르면 그걸 우선해야 한다(원래 버그:
      // formatLineLabel이 user.locale만 봐서 설정을 ko로 바꿔도 라인 명판이 영어로 나왔다).
      useSettingsStore.setState({ locale: 'ko' })

      try {
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)

        const wins = [
          {
            line: 0,
            symbol: 'seven',
            count: 3,
            multiplier: 10,
            win: 100,
            positions: [[0, 1], [1, 1], [2, 1]] as [number, number][],
          },
        ]
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({ roundId: 'r2c', wins, totalWin: 100, wallet: { coins: 1090, gems: 0 }, nonce: 3 }),
        )

        await useGameStore.getState().spin()

        const { formatLineLabel } = renderer.showWins.mock.calls[0]![1] as {
          formatLineLabel: (win: (typeof wins)[number]) => string
        }
        expect(formatLineLabel(wins[0]!)).toBe('세븐 · 100')
      } finally {
        useSettingsStore.setState({ locale: 'auto' })
      }
    })

    it('applies the server wallet immediately even if renderer.spinTo throws, and still returns phase to idle', async () => {
      await loadGame()
      const renderer = makeRenderer()
      renderer.spinTo.mockRejectedValue(new Error('renderer boom'))
      useGameStore.getState().setRenderer(renderer)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'r4', nonce: 4 }))

      await useGameStore.getState().spin()

      expect(useSessionStore.getState().wallet).toEqual({ coins: 990, gems: 0 })
      expect(useGameStore.getState().phase).toBe('idle')
      consoleErrorSpy.mockRestore()
    })

    it('clears the previous lastResult (win banner) as soon as a new spin starts', async () => {
      await loadGame()
      useGameStore.setState({
        lastResult: baseSpinResponse({
          roundId: 'prev',
          wins: [
            {
              line: 0,
              symbol: 'seven',
              count: 3,
              multiplier: 10,
              win: 100,
              positions: [[0, 1]] as [number, number][],
            },
          ],
          totalWin: 100,
          wallet: { coins: 1090, gems: 0 },
        }),
      })

      let resolveSpin: (value: Awaited<ReturnType<typeof apiSpin>>) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      const spinPromise = useGameStore.getState().spin()

      expect(useGameStore.getState().lastResult).toBeNull()

      resolveSpin(baseSpinResponse({ roundId: 'r5', nonce: 5 }))
      await spinPromise
    })

    it('reuses the same idempotencyKey after a 409 SPIN_IN_PROGRESS failure and returns to idle', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValueOnce(
        new ApiClientError('spin in progress', 409, 'SPIN_IN_PROGRESS'),
      )

      await useGameStore.getState().spin()

      const afterFailure = useGameStore.getState()
      expect(afterFailure.phase).toBe('idle')
      expect(afterFailure.errorCode).toBe('SPIN_IN_PROGRESS')
      const reusedKey = afterFailure.idempotencyKey
      expect(reusedKey).not.toBeNull()

      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'r3', nonce: 3 }))

      await useGameStore.getState().spin()

      expect(mockedApiSpin).toHaveBeenLastCalledWith(
        'test-token',
        'classic-777',
        expect.objectContaining({ idempotencyKey: reusedKey }),
      )
    })

    it('retains the idempotencyKey after a network error (status 0)', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('offline', 0, 'network_error'))

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.idempotencyKey).not.toBeNull()
    })

    it('drops the idempotencyKey on a definitive 4xx failure so the next attempt uses a new key', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('invalid bet', 400, 'INVALID_BET'))

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('INVALID_BET')
      expect(state.idempotencyKey).toBeNull()
    })

    it('invalid_response (schema mismatch on a 200) resyncs freeSpins/gamble via GET /state and wallet via /me — client no longer trusts its own stale free-spins count', async () => {
      await loadGame()
      // 클라이언트는 아직 프리스핀이 진행 중인 줄 안다(예: 이전 스핀에서 받은 값) — 실제로는
      // 서버가 이미 끝냈는데 이번 스핀 응답이 스키마와 안 맞아(invalid_response) 그 사실을 놓쳤다.
      useGameStore.setState({
        freeSpins: {
          gameId: 'classic-777',
          left: 2,
          total: 10,
          multiplier: 2,
          totalBet: 10,
          accumulatedWin: 40,
        },
      })
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bad shape', 200, 'invalid_response'))
      mockedGetGameState.mockResolvedValueOnce({
        freeSpins: null, // 서버 기준 진실 — 프리스핀은 이미 끝났다.
        state: { freeSpins: null, gamble: null },
      })
      mockedGetMe.mockResolvedValueOnce({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
        wallet: { coins: 1234, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 50 },
        jackpot: 0,
      })

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('invalid_response') // 비차단 안내는 그대로 뜬다.
      // GET /games/:id/state로 다시 물어 프리스핀이 실제로 끝났다는 걸 반영한다 — "프리스핀 (2)"
      // 처럼 서버와 어긋난 채로 자동진행이 멈춰 있지 않는다.
      expect(mockedGetGameState).toHaveBeenCalledWith('test-token', 'classic-777')
      expect(state.freeSpins).toBeNull()
      // 지갑도 /me로 다시 맞춘다.
      await vi.waitFor(() => expect(mockedGetMe).toHaveBeenCalled())
      await vi.waitFor(() => expect(useSessionStore.getState().wallet).toEqual({ coins: 1234, gems: 0 }))
    })

    it('sets phase to error with INSUFFICIENT_FUNDS code without retrying the idempotencyKey', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValue(
        new ApiClientError('not enough coins', 402, 'INSUFFICIENT_FUNDS'),
      )

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('error')
      expect(state.errorCode).toBe('INSUFFICIENT_FUNDS')
      expect(state.idempotencyKey).toBeNull()
    })

    it('stores jackpotWin on lastResult when the spin response includes it', async () => {
      await loadGame()
      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({ roundId: 'r9', wallet: { coins: 5990, gems: 0 }, nonce: 9, jackpotWin: 5000 }),
      )

      await useGameStore.getState().spin()

      expect(useGameStore.getState().lastResult?.jackpotWin).toBe(5000)
    })

    it('adds totalBet to the hub levelInfo xp on every successful spin, not only on levelUp', async () => {
      await loadGame()
      useHubStore.setState({ levelInfo: { level: 1, xp: 40, nextLevelXp: 100, maxBet: 100 } })
      mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'r10', nonce: 10 }))

      await useGameStore.getState().spin()

      expect(useHubStore.getState().levelInfo?.xp).toBe(50)
      expect(mockedGetMe).not.toHaveBeenCalled()
    })

    it('updates the hub jackpot pool immediately from the spin response', async () => {
      await loadGame()
      mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'r6', nonce: 6, jackpot: 555 }))

      await useGameStore.getState().spin()

      expect(useHubStore.getState().jackpot).toEqual({ pool: 555 })
    })

    it('applies the missions progress from the spin response to the hub store', async () => {
      await loadGame()
      const missions = [
        { id: 'm1', name: { en: 'Spin 100 times' }, target: 100, progress: 5, reward: 50, claimed: false, completed: false },
      ]
      mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'r7', nonce: 7, missions }))

      await useGameStore.getState().spin()

      expect(useHubStore.getState().missions?.missions).toEqual(missions)
    })

    it('refreshes the hub levelInfo when the spin response includes a levelUp', async () => {
      await loadGame()
      mockedGetMe.mockResolvedValue({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 2, xp: 120 },
        wallet: { coins: 990, gems: 0 },
        levelInfo: { level: 2, xp: 120, nextLevelXp: 300, maxBet: 50 },
        jackpot: 0,
      })
      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({ roundId: 'r8', nonce: 8, levelUp: { from: 1, to: 2, bonus: 100 } }),
      )

      await useGameStore.getState().spin()
      await vi.waitFor(() => expect(useHubStore.getState().levelInfo?.level).toBe(2))

      expect(mockedGetMe).toHaveBeenCalledWith('test-token')
    })

    it('clamps the bet index to the level maxBet and sets BET_LOCKED without blocking the phase', async () => {
      await loadGame()
      useGameStore.getState().setBet(2) // bet 50
      useHubStore.setState({ levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 } })
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bet locked', 400, 'BET_LOCKED'))

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('BET_LOCKED')
      expect(state.betIndex).toBe(0) // 10 is the highest level <= maxBet(15)
      expect(state.idempotencyKey).toBeNull()
    })

    it('refreshes levelInfo before clamping when entering the game screen directly (levelInfo is null)', async () => {
      await loadGame()
      useGameStore.getState().setBet(2) // bet 50
      expect(useHubStore.getState().levelInfo).toBeNull()
      mockedGetMe.mockResolvedValue({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
        wallet: { coins: 1000, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 },
        jackpot: 0,
      })
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bet locked', 400, 'BET_LOCKED'))

      await useGameStore.getState().spin()

      expect(mockedGetMe).toHaveBeenCalledWith('test-token')
      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('BET_LOCKED')
      expect(state.betIndex).toBe(0) // 10 is the highest level <= maxBet(15), fetched via refreshLevelInfo()
      expect(useHubStore.getState().levelInfo?.maxBet).toBe(15)
    })

    it('does nothing when a spin is already in flight', async () => {
      await loadGame()
      useGameStore.setState({ phase: 'spinning' })

      await useGameStore.getState().spin()

      expect(mockedApiSpin).not.toHaveBeenCalled()
    })

    describe('requestSkip (UX round 3 — tap/Space skip-to-result)', () => {
      it('does nothing when called outside phase === spinning', () => {
        useGameStore.setState({ phase: 'idle' })

        expect(() => useGameStore.getState().requestSkip()).not.toThrow()
      })

      it('calls handle.skip() when the server result already arrived and spinTo is in flight', async () => {
        await loadGame()
        const renderer = makeRenderer()
        const { handle, skip, resolve } = makeControllableSpinHandle()
        renderer.spinTo.mockReturnValue(handle)
        useGameStore.getState().setRenderer(renderer)
        mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'skip-after' }))

        const spinPromise = useGameStore.getState().spin()

        // apiSpin이 이미 resolve된 값이라 다음 microtask 틱에서 spinTo가 불릴 때까지 기다린다 —
        // 즉 "결과가 이미 도착해 spinTo가 진행 중"인 상황을 재현한다.
        await vi.waitFor(() => expect(renderer.spinTo).toHaveBeenCalled())

        useGameStore.getState().requestSkip()

        expect(skip).toHaveBeenCalledTimes(1)

        resolve()
        await spinPromise
      })

      it('defers the skip via a flag until spinTo starts, when the result has not arrived yet', async () => {
        await loadGame()
        const renderer = makeRenderer()
        const { handle, skip, resolve } = makeControllableSpinHandle()
        renderer.spinTo.mockReturnValue(handle)
        useGameStore.getState().setRenderer(renderer)

        let resolveApiSpin: (value: SpinResponse) => void = () => {}
        mockedApiSpin.mockReturnValue(
          new Promise((res) => {
            resolveApiSpin = res
          }),
        )

        const spinPromise = useGameStore.getState().spin()
        await vi.waitFor(() => expect(useGameStore.getState().phase).toBe('spinning'))
        expect(renderer.spinTo).not.toHaveBeenCalled()

        // 탭/스페이스가 결과보다 먼저 눌렸다 — 아직 건너뛸 손잡이가 없으므로 skip이 불리면 안 된다.
        useGameStore.getState().requestSkip()
        expect(skip).not.toHaveBeenCalled()

        resolveApiSpin(baseSpinResponse({ roundId: 'skip-before' }))
        await vi.waitFor(() => expect(renderer.spinTo).toHaveBeenCalled())

        // spinTo가 막 시작되는 순간, 미뤄뒀던 건너뛰기 요청이 즉시 실행된다.
        expect(skip).toHaveBeenCalledTimes(1)

        resolve()
        await spinPromise
      })
    })

    describe('free spins', () => {
      it('locks the bet selector: setBet() is a no-op while a free spins session is active', async () => {
        await loadGame()
        useGameStore.getState().setBet(1)
        expect(useGameStore.getState().betIndex).toBe(1)

        useGameStore.setState({ freeSpins: makeFreeSpinsState() })
        useGameStore.getState().setBet(2)

        expect(useGameStore.getState().betIndex).toBe(1)
      })

      it('sends the free-spin session totalBet (not the selector bet) while active', async () => {
        await loadGame()
        useGameStore.getState().setBet(2) // 50 — irrelevant once free spins lock the bet
        useGameStore.setState({ freeSpins: makeFreeSpinsState({ totalBet: 10 }) })
        mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'fs1', isFreeSpin: true }))

        await useGameStore.getState().spin()

        expect(mockedApiSpin).toHaveBeenCalledWith(
          'test-token',
          'classic-777',
          expect.objectContaining({ totalBet: 10 }),
        )
      })

      it('always overwrites the wallet from the server response during free spins — no local debit assumption', async () => {
        await loadGame()
        useGameStore.setState({ freeSpins: makeFreeSpinsState() })
        // 프리스핀은 차감이 없어야 정상이지만, 스토어는 어떤 값이 오든 그대로 반영할 뿐
        // 스스로 "차감 없음"을 가정해 지갑을 계산하지 않는다는 것이 이 테스트의 요점이다.
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({ roundId: 'fs2', isFreeSpin: true, wallet: { coins: 1234, gems: 0 } }),
        )

        await useGameStore.getState().spin()

        expect(useSessionStore.getState().wallet).toEqual({ coins: 1234, gems: 0 })
      })

      it('passes fast: true to renderer.spinTo when the response says this was a free spin', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)
        useGameStore.setState({ freeSpins: makeFreeSpinsState() })
        mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'fs3', isFreeSpin: true }))

        await useGameStore.getState().spin()

        expect(renderer.spinTo).toHaveBeenCalledWith(expect.any(Array), { fast: true })
      })

      it('updates freeSpins from the response and calls renderer.setMode', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)
        const nextFreeSpins = makeFreeSpinsState({ left: 3 })
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({ roundId: 'fs4', isFreeSpin: true, freeSpins: nextFreeSpins }),
        )

        await useGameStore.getState().spin()

        expect(useGameStore.getState().freeSpins).toEqual(nextFreeSpins)
        expect(renderer.setMode).toHaveBeenCalledWith({
          freeSpins: { left: 3, total: nextFreeSpins.total, multiplier: nextFreeSpins.multiplier },
        })
      })

      it('calls renderer.setMode with null once free spins end', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)
        useGameStore.setState({ freeSpins: makeFreeSpinsState({ left: 1 }) })
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({ roundId: 'fs5', isFreeSpin: true, freeSpins: null }),
        )

        await useGameStore.getState().spin()

        expect(useGameStore.getState().freeSpins).toBeNull()
        expect(renderer.setMode).toHaveBeenCalledWith({ freeSpins: null })
      })

      it('calls showWins even when there are no paying wins, as long as a feature triggered', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)
        mockedApiSpin.mockResolvedValue(
          baseSpinResponse({
            roundId: 'fs6',
            wins: [],
            features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
            freeSpins: makeFreeSpinsState(),
          }),
        )

        await useGameStore.getState().spin()

        expect(renderer.showWins).toHaveBeenCalledWith(
          [],
          expect.objectContaining({
            features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
          }),
        )
      })

      it('auto-spins the next free spin ~1.2s after the presentation settles, and a manual spin cancels the pending auto-spin', async () => {
        await loadGame()
        const renderer = makeRenderer()
        useGameStore.getState().setRenderer(renderer)
        useGameStore.setState({ freeSpins: makeFreeSpinsState({ left: 2 }) })

        vi.useFakeTimers()
        try {
          mockedApiSpin.mockResolvedValueOnce(
            baseSpinResponse({ roundId: 'fs7', isFreeSpin: true, freeSpins: makeFreeSpinsState({ left: 1 }) }),
          )
          await useGameStore.getState().spin()
          expect(mockedApiSpin).toHaveBeenCalledTimes(1)

          // 아직 자동 스핀 지연(1.2s) 전 — 더 호출되면 안 된다.
          await vi.advanceTimersByTimeAsync(1100)
          expect(mockedApiSpin).toHaveBeenCalledTimes(1)

          mockedApiSpin.mockResolvedValueOnce(
            baseSpinResponse({ roundId: 'fs8', isFreeSpin: true, freeSpins: null }),
          )
          await vi.advanceTimersByTimeAsync(200)
          expect(mockedApiSpin).toHaveBeenCalledTimes(2)
          expect(mockedApiSpin).toHaveBeenLastCalledWith(
            'test-token',
            'classic-777',
            expect.objectContaining({}),
          )
          // 프리스핀이 끝났으니 더 이상 자동 스핀이 예약되지 않는다.
          await vi.advanceTimersByTimeAsync(5000)
          expect(mockedApiSpin).toHaveBeenCalledTimes(2)
        } finally {
          vi.useRealTimers()
        }
      })

      describe('FS transition gating (round 3b)', () => {
        it('BLOCKER FIX: latches a modeTransition release that arrives before spinTo/showWins finish, so the first free spin still auto-starts', async () => {
          // 실제 렌더러 타이밍: modeTransition(to:'freeSpins', phase:'end')은 renderer.setMode()
          // 직후(spinTo/showWins가 끝나기 한참 전에) 온다 — 그 시점엔 아직 spin()의 finally가
          // 실행되기 전이라 pendingAutoSpinRelease가 비어 있다. 그래도 첫 프리스핀이 자동으로
          // 시작돼야 한다(래치 없인 영원히 안 걸리는 게 버그였다).
          await loadGame()
          const renderer = makeRenderer()
          const { handle, resolve } = makeControllableSpinHandle()
          renderer.spinTo.mockReturnValue(handle)
          useGameStore.getState().setRenderer(renderer)
          mockedApiSpin.mockResolvedValueOnce(
            baseSpinResponse({
              roundId: 'gate-blocker',
              features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
              freeSpins: makeFreeSpinsState({ left: 10 }),
            }),
          )

          // finally에서 scheduleAutoSpin()이 곧장 불릴 수 있으므로(래치가 서 있으면), 그 setTimeout이
          // 실타이머로 잡혔다가 나중에 페이크로 바꾸는 일이 없도록 처음부터 페이크 타이머 아래서 돌린다.
          vi.useFakeTimers()
          try {
            const spinPromise = useGameStore.getState().spin()
            // apiSpin의 await 이후 spinTo가 불릴 때까지 마이크로태스크를 한 틱 흘려보낸다
            // (페이크 타이머는 setTimeout류만 가짜로 만들 뿐 마이크로태스크 큐는 그대로 동작한다).
            await Promise.resolve()
            expect(renderer.spinTo).toHaveBeenCalled()

            // spinTo는 아직 안 끝났는데(handle이 pending) 전환-끝 이벤트가 먼저 도착한다.
            useGameStore.getState().releaseFreeSpinsEntryGate()

            resolve()
            await spinPromise

            mockedApiSpin.mockResolvedValueOnce(
              baseSpinResponse({ roundId: 'gate-blocker-2', isFreeSpin: true, freeSpins: makeFreeSpinsState({ left: 9 }) }),
            )
            // 래치돼 있었으므로 게이트를 다시 풀 필요 없이 평소 자동 스핀 지연만큼만 기다리면 된다.
            await vi.advanceTimersByTimeAsync(1300)
            expect(mockedApiSpin).toHaveBeenCalledTimes(2)
          } finally {
            vi.useRealTimers()
          }
        })

        it('does NOT auto-spin the first free spin until releaseFreeSpinsEntryGate() is called', async () => {
          await loadGame()
          const renderer = makeRenderer()
          useGameStore.getState().setRenderer(renderer)
          // freeSpins가 pre-spin 시점에는 null이었다가 이번 결과로 새로 생긴다 — "첫 진입".
          mockedApiSpin.mockResolvedValueOnce(
            baseSpinResponse({
              roundId: 'gate1',
              features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
              freeSpins: makeFreeSpinsState({ left: 10 }),
            }),
          )

          vi.useFakeTimers()
          try {
            await useGameStore.getState().spin()
            expect(mockedApiSpin).toHaveBeenCalledTimes(1)

            // 게이트가 안 풀렸으면 아무리 기다려도 자동 스핀이 안 걸린다.
            await vi.advanceTimersByTimeAsync(5000)
            expect(mockedApiSpin).toHaveBeenCalledTimes(1)

            mockedApiSpin.mockResolvedValueOnce(
              baseSpinResponse({ roundId: 'gate2', isFreeSpin: true, freeSpins: makeFreeSpinsState({ left: 9 }) }),
            )
            useGameStore.getState().releaseFreeSpinsEntryGate()
            // 이제 평소 자동 스핀 지연(1.2s) 만큼만 기다리면 된다.
            await vi.advanceTimersByTimeAsync(1300)
            expect(mockedApiSpin).toHaveBeenCalledTimes(2)
          } finally {
            vi.useRealTimers()
          }
        })

        it('releaseFreeSpinsEntryGate() does nothing when there is no pending gate', () => {
          expect(() => useGameStore.getState().releaseFreeSpinsEntryGate()).not.toThrow()
        })

        it('a manual spin while the entry gate is pending cancels it (no double auto-spin later)', async () => {
          await loadGame()
          const renderer = makeRenderer()
          useGameStore.getState().setRenderer(renderer)
          mockedApiSpin.mockResolvedValueOnce(
            baseSpinResponse({
              roundId: 'gate3',
              features: [{ type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }],
              freeSpins: makeFreeSpinsState({ left: 10 }),
            }),
          )

          vi.useFakeTimers()
          try {
            await useGameStore.getState().spin()
            expect(mockedApiSpin).toHaveBeenCalledTimes(1)

            // 유저가 게이트가 풀리기 전에 직접 FREE SPIN 버튼을 눌렀다(수동 스핀) — 이 응답으로 프리스핀이 끝난다.
            mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'gate4', isFreeSpin: true, freeSpins: null }))
            await useGameStore.getState().spin()
            expect(mockedApiSpin).toHaveBeenCalledTimes(2)

            // 뒤늦게 (이제는 낡은) 게이트 해제 신호가 와도 중복 스핀을 만들지 않는다 — 게이트가 안 지워졌다면
            // 여기서 스핀이 또 걸려 3번째 호출이 생겼을 것이다.
            useGameStore.getState().releaseFreeSpinsEntryGate()
            await vi.advanceTimersByTimeAsync(5000)
            expect(mockedApiSpin).toHaveBeenCalledTimes(2)
          } finally {
            vi.useRealTimers()
          }
        })
      })
    })
  })

  describe('setBet (round 3 hub review)', () => {
    it('clears a retained idempotencyKey so a new bet never replays a failed spin at the old totalBet', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')

      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('offline', 0, 'network_error'))
      await useGameStore.getState().spin()
      expect(useGameStore.getState().idempotencyKey).not.toBeNull()

      useGameStore.getState().setBet(1)

      expect(useGameStore.getState().idempotencyKey).toBeNull()
    })
  })

  describe('gamble (Wave 1 — double-up)', () => {
    async function loadGameWithGambleOffer(): Promise<void> {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')
      mockedApiSpin.mockResolvedValue(
        baseSpinResponse({
          roundId: 'gr1',
          totalWin: 20,
          wallet: { coins: 1020, gems: 0 },
          gambleOffer: { pendingWin: 20, maxSteps: 3, expiresAt: '2099-01-01T00:00:10.000Z' },
        }),
      )
      await useGameStore.getState().spin()
    }

    it('opens a gambleSession from the spin response gambleOffer', async () => {
      await loadGameWithGambleOffer()

      expect(useGameStore.getState().gambleSession).toEqual({
        roundId: 'gr1',
        pendingWin: 20,
        stepsLeft: 3,
        maxSteps: 3,
        expiresAt: '2099-01-01T00:00:10.000Z',
      })
    })

    it('does not open a gambleSession when the spin response has no gambleOffer', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')
      mockedApiSpin.mockResolvedValue(baseSpinResponse({ roundId: 'gr-none' }))

      await useGameStore.getState().spin()

      expect(useGameStore.getState().gambleSession).toBeNull()
    })

    it('gamble(pick) on a win: applies the server wallet and keeps the session going with the new pendingWin/stepsLeft', async () => {
      await loadGameWithGambleOffer()
      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'win', pendingWin: 40, stepsLeft: 2, wallet: { coins: 1000, gems: 0 } }),
      )

      const response = await useGameStore.getState().gamble('heads')

      // idempotencyKey는 매 판마다 새로 만든다 — 정확한 값이 아니라 "문자열이 실려 갔다"만 본다.
      expect(mockedApiGamble).toHaveBeenCalledWith('test-token', 'gr1', 'heads', expect.any(String))
      expect(response?.outcome).toBe('win')
      expect(useSessionStore.getState().wallet).toEqual({ coins: 1000, gems: 0 })
      expect(useGameStore.getState().gambleSession).toEqual({
        roundId: 'gr1',
        pendingWin: 40,
        stepsLeft: 2,
        maxSteps: 3,
        expiresAt: '2099-01-01T00:00:10.000Z',
      })
    })

    it('gamble(pick) on a loss: clears the session (pendingWin is gone) and still applies the server wallet', async () => {
      await loadGameWithGambleOffer()
      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'lose', pendingWin: 0, stepsLeft: 3, wallet: { coins: 1000, gems: 0 } }),
      )

      await useGameStore.getState().gamble('tails')

      expect(useSessionStore.getState().wallet).toEqual({ coins: 1000, gems: 0 })
      expect(useGameStore.getState().gambleSession).toBeNull()
    })

    it('gamble(pick) that reaches stepsLeft === 0 clears the session even though it was a win', async () => {
      await loadGameWithGambleOffer()
      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'win', pendingWin: 160, stepsLeft: 0, wallet: { coins: 1000, gems: 0 } }),
      )

      await useGameStore.getState().gamble('heads')

      expect(useGameStore.getState().gambleSession).toBeNull()
    })

    it('gamble() does nothing (and does not call the API) when there is no active session', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')

      const response = await useGameStore.getState().gamble('heads')

      expect(response).toBeNull()
      expect(mockedApiGamble).not.toHaveBeenCalled()
    })

    it('collectGamble(): banks the pending win, applies the server wallet, and clears the session', async () => {
      await loadGameWithGambleOffer()
      mockedApiCollectGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'collected', pendingWin: 0, stepsLeft: 0, wallet: { coins: 1020, gems: 0 } }),
      )

      await useGameStore.getState().collectGamble()

      expect(mockedApiCollectGamble).toHaveBeenCalledWith('test-token', 'gr1')
      expect(useSessionStore.getState().wallet).toEqual({ coins: 1020, gems: 0 })
      expect(useGameStore.getState().gambleSession).toBeNull()
    })

    it('collectGamble() does nothing (and does not call the API) when there is no active session', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')

      await useGameStore.getState().collectGamble()

      expect(mockedApiCollectGamble).not.toHaveBeenCalled()
    })

    it('starting a new spin clears any pending gamble session locally WITHOUT calling collectGamble — the server auto-releases escrow before the bet check, so the spin response wallet is already final', async () => {
      await loadGameWithGambleOffer()
      mockedApiSpin.mockResolvedValueOnce(baseSpinResponse({ roundId: 'gr2', wallet: { coins: 1020, gems: 0 } }))

      await useGameStore.getState().spin()

      // 스핀 전에 별도로 회수 요청을 보내지 않는다 — 서버가 스핀 처리 안에서 알아서 돌려준다.
      expect(mockedApiCollectGamble).not.toHaveBeenCalled()
      expect(useGameStore.getState().gambleSession).toBeNull()
      expect(useSessionStore.getState().wallet).toEqual({ coins: 1020, gems: 0 })
      expect(useGameStore.getState().lastResult?.roundId).toBe('gr2')
    })

    it('resumes an in-progress gamble session from GET /games/:id/state on load()', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      mockedGetGameState.mockResolvedValueOnce({
        freeSpins: null,
        state: {
          freeSpins: null,
          gamble: {
            roundId: 'resumed-round',
            pendingWin: 80,
            // stepsLeft(3) = maxSteps(5) - steps.length(2) — 지금까지 두 단계를 진행했다는 뜻.
            steps: [
              {
                step: 1,
                idempotencyKey: 'k1',
                pick: 'heads',
                side: 'heads',
                won: true,
                stake: 20,
                pendingWin: 40,
                autoCollected: false,
                seedInput: 'seed-1',
              },
              {
                step: 2,
                idempotencyKey: 'k2',
                pick: 'tails',
                side: 'tails',
                won: true,
                stake: 40,
                pendingWin: 80,
                autoCollected: false,
                seedInput: 'seed-2',
              },
            ],
            maxSteps: 5,
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        },
      })

      await useGameStore.getState().load('classic-777')

      expect(useGameStore.getState().gambleSession).toEqual({
        roundId: 'resumed-round',
        pendingWin: 80,
        stepsLeft: 3,
        maxSteps: 5,
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
    })

    it('syncGambleExpiry(): re-reads GET /games/:id/state (not POST /collect) and clears the session when the server reports it already collected', async () => {
      await loadGameWithGambleOffer()
      mockedGetGameState.mockResolvedValueOnce({
        freeSpins: null,
        state: { freeSpins: null, gamble: null },
      })
      mockedGetMe.mockResolvedValueOnce({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
        wallet: { coins: 1020, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 50 },
        jackpot: 0,
      })

      await useGameStore.getState().syncGambleExpiry()

      expect(mockedApiCollectGamble).not.toHaveBeenCalled()
      expect(useGameStore.getState().gambleSession).toBeNull()
      // 상태 응답엔 지갑이 없다 — 세션이 사라졌을 때만 /me로 따로 잔액을 맞춘다.
      await vi.waitFor(() => expect(mockedGetMe).toHaveBeenCalled())
      await vi.waitFor(() => expect(useSessionStore.getState().wallet).toEqual({ coins: 1020, gems: 0 }))
    })

    it('syncGambleExpiry(): keeps the session (and does not refresh /me) when the server still reports it open', async () => {
      await loadGameWithGambleOffer()
      mockedGetGameState.mockResolvedValueOnce({
        freeSpins: null,
        state: {
          freeSpins: null,
          gamble: { roundId: 'gr1', pendingWin: 20, steps: [], maxSteps: 3, expiresAt: '2099-01-01T00:00:00.000Z' },
        },
      })

      await useGameStore.getState().syncGambleExpiry()

      expect(useGameStore.getState().gambleSession).toEqual({
        roundId: 'gr1',
        pendingWin: 20,
        stepsLeft: 3,
        maxSteps: 3,
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
      expect(mockedGetMe).not.toHaveBeenCalled()
    })

    it('syncGambleExpiry() does nothing when there is no active session', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')

      await useGameStore.getState().syncGambleExpiry()

      expect(mockedGetGameState).toHaveBeenCalledTimes(1) // load()의 초기 조회 한 번뿐
    })

    it('reuses the same idempotencyKey when a gamble call fails with a retryable error (network/409/503), and mints a new one after any other failure or a success', async () => {
      await loadGameWithGambleOffer()

      mockedApiGamble.mockRejectedValueOnce(new ApiClientError('네트워크 오류', 0, 'network_error'))
      await expect(useGameStore.getState().gamble('heads')).rejects.toThrow()
      const [, , , firstKey] = mockedApiGamble.mock.calls[0]!

      mockedApiGamble.mockRejectedValueOnce(new ApiClientError('진행 중', 409, 'GAMBLE_IN_PROGRESS'))
      await expect(useGameStore.getState().gamble('heads')).rejects.toThrow()
      const [, , , secondKey] = mockedApiGamble.mock.calls[1]!
      expect(secondKey).toBe(firstKey) // 재시도 가능한 실패는 같은 키를 재사용한다.

      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'win', pendingWin: 40, stepsLeft: 2, wallet: { coins: 1000, gems: 0 } }),
      )
      await useGameStore.getState().gamble('heads')
      const [, , , thirdKey] = mockedApiGamble.mock.calls[2]!
      expect(thirdKey).toBe(firstKey) // 세 번째 시도도 같은 키를 재사용해 성공한다.

      // 성공 후에는 pending 키가 지워지므로, 다음(별개의) 판은 새 키를 쓴다.
      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'win', pendingWin: 80, stepsLeft: 1, wallet: { coins: 1000, gems: 0 } }),
      )
      await useGameStore.getState().gamble('tails')
      const [, , , fourthKey] = mockedApiGamble.mock.calls[3]!
      expect(fourthKey).not.toBe(firstKey)
    })

    it('NOT_GAMBLEABLE clears the local session and refreshes /me — the server already considers it over (e.g. expired and auto-collected server-side)', async () => {
      await loadGameWithGambleOffer()
      mockedGetMe.mockResolvedValueOnce({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
        wallet: { coins: 1020, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 50 },
        jackpot: 0,
      })

      mockedApiGamble.mockRejectedValueOnce(new ApiClientError('사용 불가', 409, 'NOT_GAMBLEABLE'))
      await expect(useGameStore.getState().gamble('heads')).rejects.toThrow()

      expect(useGameStore.getState().gambleSession).toBeNull()
      await vi.waitFor(() => expect(mockedGetMe).toHaveBeenCalled())
      await vi.waitFor(() => expect(useSessionStore.getState().wallet).toEqual({ coins: 1020, gems: 0 }))

      // 세션이 사라졌으니 다음 gamble() 호출은 API를 부르지도 않고 null을 돌려준다.
      const response = await useGameStore.getState().gamble('heads')
      expect(response).toBeNull()
      expect(mockedApiGamble).toHaveBeenCalledTimes(1)
    })

    it('reuses the idempotencyKey across an unclassified failure too, and mints a new one only once a step actually succeeds', async () => {
      await loadGameWithGambleOffer()

      mockedApiGamble.mockRejectedValueOnce(new ApiClientError('서버 오류', 500, 'INTERNAL'))
      await expect(useGameStore.getState().gamble('heads')).rejects.toThrow()
      const [, , , firstKey] = mockedApiGamble.mock.calls[0]!
      // 세션은 그대로 남는다 — 알 수 없는 오류라고 함부로 지우지 않는다.
      expect(useGameStore.getState().gambleSession).not.toBeNull()

      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'win', pendingWin: 40, stepsLeft: 2, wallet: { coins: 1000, gems: 0 } }),
      )
      await useGameStore.getState().gamble('heads')
      const [, , , secondKey] = mockedApiGamble.mock.calls[1]!
      expect(secondKey).toBe(firstKey) // 미분류 오류도 같은 키로 재시도한다.

      // 그 시도가 성공했으니, 다음(별개의) 판은 새 키를 쓴다.
      mockedApiGamble.mockResolvedValueOnce(
        makeGambleResponse({ outcome: 'win', pendingWin: 80, stepsLeft: 1, wallet: { coins: 1000, gems: 0 } }),
      )
      await useGameStore.getState().gamble('tails')
      const [, , , thirdKey] = mockedApiGamble.mock.calls[2]!
      expect(thirdKey).not.toBe(firstKey)
    })
  })

  describe('dismissError', () => {
    it('returns to idle and clears the error', () => {
      useGameStore.setState({ phase: 'error', error: 'oops', errorCode: 'INSUFFICIENT_FUNDS' })

      useGameStore.getState().dismissError()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.error).toBeNull()
      expect(state.errorCode).toBeNull()
    })
  })
})
