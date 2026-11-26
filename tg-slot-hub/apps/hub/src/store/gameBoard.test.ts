import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import type { BoardBonusFeature, SpinResponse } from '@tgslot/shared'
import { getGameMath, spin as apiSpin, getGameState } from '../sdk/api'
import { useGameStore, type SpinRenderer } from './game'
import { useSessionStore } from './session'
import { boardSnapshotKey, loadBoardSnapshot } from '../game/boardPlayback'
import { makeBoardFeature } from '../test/hanbokMath'
import hanbokRaw from '../../../../games/hanbok-night-market/math.json'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)

/** 지급이 있는 말판 하나(시드 고정). */
function boardWithWin(): BoardBonusFeature {
  for (let i = 0; i < 200; i += 1) {
    const feature = makeBoardFeature(`store-board-${i}`, 25)
    if (feature.win >= 100) return feature
  }
  throw new Error('지급이 있는 말판을 못 찾았다')
}

function boardResponse(board: BoardBonusFeature, overrides: Partial<SpinResponse> = {}): SpinResponse {
  // 라인 15 + 초롱 50 + 말판. 지갑은 서버 값이라 이미 전부 들어 있다(10,000 − 25 + totalWin).
  const totalWin = 15 + 50 + board.win
  return {
    roundId: 'board-round-1',
    stops: [0, 0, 0, 0, 0],
    grid: [['wild', 'wild', 'wild']],
    wins: [],
    totalBet: 25,
    totalWin,
    wallet: { coins: 10_000 - 25 + totalWin, gems: 0 },
    seedHash: 'hash',
    nonce: 1,
    jackpot: 0,
    isFreeSpin: false,
    features: [{ type: 'scatterWin', count: 3, win: 50, positions: [] } as never, board],
    freeSpins: null,
    mutations: [],
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

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !predicate(); i += 1) await tick()
  expect(predicate()).toBe(true)
}

describe('말판 보너스 — 스토어(서버 값만, 재생 끝까지 몫을 감춘다)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    useGameStore.getState().setBoardPlayerReady(false)
    mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 10_000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  async function loadGame(): Promise<void> {
    mockedGetGameMath.mockResolvedValue(hanbokRaw)
    await useGameStore.getState().load('hanbok-night-market')
    useGameStore.getState().setRenderer(makeRenderer())
  }

  it('말판 화면이 붙어 있지 않으면 재생을 열지 않고 곧장 서버 값을 공개한다', async () => {
    await loadGame()
    const board = boardWithWin()
    const res = boardResponse(board)
    mockedApiSpin.mockResolvedValueOnce(res)
    await useGameStore.getState().spin()
    expect(useGameStore.getState().boardPlay).toBeNull()
    expect(useSessionStore.getState().wallet).toEqual(res.wallet)
    expect(useGameStore.getState().phase).toBe('idle')
  })

  it('응답을 받는 즉시 복원 스냅숏을 저장한다(shown 0)', async () => {
    await loadGame()
    const board = boardWithWin()
    mockedApiSpin.mockResolvedValueOnce(boardResponse(board))
    await useGameStore.getState().spin()
    const snapshot = loadBoardSnapshot('hanbok-night-market', Date.now())
    expect(snapshot).not.toBeNull()
    expect(snapshot?.roundId).toBe('board-round-1')
    expect(snapshot?.shown).toBe(0)
    expect(snapshot?.feature.win).toBe(board.win)
    expect(localStorage.getItem(boardSnapshotKey('hanbok-night-market'))).not.toBeNull()
  })

  it('착지 때는 잔액에서 말판 몫만 덜어 보이고, 재생이 끝나야 서버 값이 된다 — 재생 중 새 스핀은 막힌다', async () => {
    await loadGame()
    useGameStore.getState().setBoardPlayerReady(true)
    const board = boardWithWin()
    const res = boardResponse(board)
    mockedApiSpin.mockResolvedValueOnce(res)

    const pending = useGameStore.getState().spin()
    await until(() => useGameStore.getState().boardPlay !== null)

    // 결과 누설 0 — 잔액은 말판 몫을 뺀 값이고, 빅윈은 아직 안 뜬다.
    expect(useSessionStore.getState().wallet?.coins).toBe(res.wallet.coins - board.win)
    expect(useGameStore.getState().winCelebration).toBeNull()
    expect(useGameStore.getState().lastResult?.totalWin).toBe(res.totalWin)
    expect(useGameStore.getState().boardPlay).toMatchObject({ roundId: 'board-round-1', totalBet: 25, totalWin: res.totalWin })
    expect(useGameStore.getState().phase).toBe('showingWin')

    // 재생 중에는 새 스핀을 시작하지 못한다.
    mockedApiSpin.mockClear()
    await useGameStore.getState().spin()
    expect(mockedApiSpin).not.toHaveBeenCalled()

    useGameStore.getState().finishBoard()
    // 합계가 크면 말판이 끝난 뒤 빅윈 오버레이가 뜬다 — 그 경우 닫아 준다.
    await until(() => useGameStore.getState().winCelebration !== null || useGameStore.getState().phase === 'idle')
    expect(useSessionStore.getState().wallet).toEqual(res.wallet)
    useGameStore.getState().dismissWinCelebration()
    await pending
    expect(useGameStore.getState().boardPlay).toBeNull()
    expect(useGameStore.getState().phase).toBe('idle')
  })

  it('합계(라인 + 초롱 + 말판)의 빅윈은 말판이 끝난 뒤에 한 번만 뜬다', async () => {
    await loadGame()
    useGameStore.getState().setBoardPlayerReady(true)
    const board = boardWithWin()
    const res = boardResponse(board)
    // 합계가 10배(250코인) 이상인 판 — 말판 몫 덕분이다.
    expect(res.totalWin).toBeGreaterThanOrEqual(250)
    mockedApiSpin.mockResolvedValueOnce(res)
    const pending = useGameStore.getState().spin()
    await until(() => useGameStore.getState().boardPlay !== null)
    expect(useGameStore.getState().winCelebration).toBeNull()

    useGameStore.getState().finishBoard()
    await until(() => useGameStore.getState().winCelebration !== null)
    expect(useGameStore.getState().winCelebration).toMatchObject({ totalWin: res.totalWin, totalBet: 25 })
    expect(useSessionStore.getState().wallet).toEqual(res.wallet)

    useGameStore.getState().dismissWinCelebration()
    await pending
    expect(useGameStore.getState().winCelebration).toBeNull()
  })

  it('재생 중 화면을 떠나면(reset) 몫이 곧장 서버 값으로 돌아오고 멈춰 있던 판이 풀린다', async () => {
    await loadGame()
    useGameStore.getState().setBoardPlayerReady(true)
    const board = boardWithWin()
    const res = boardResponse(board)
    mockedApiSpin.mockResolvedValueOnce(res)
    const pending = useGameStore.getState().spin()
    await until(() => useGameStore.getState().boardPlay !== null)
    expect(useSessionStore.getState().wallet?.coins).toBe(res.wallet.coins - board.win)

    useGameStore.getState().reset()
    await pending
    expect(useSessionStore.getState().wallet).toEqual(res.wallet)
    expect(useGameStore.getState().boardPlay).toBeNull()
  })

  it('말판 판이 아니면 아무것도 감추지 않는다', async () => {
    await loadGame()
    useGameStore.getState().setBoardPlayerReady(true)
    const res: SpinResponse = {
      roundId: 'plain',
      stops: [0, 0, 0, 0, 0],
      grid: [['wild']],
      wins: [],
      totalBet: 25,
      totalWin: 0,
      wallet: { coins: 9_975, gems: 0 },
      seedHash: 'h',
      nonce: 2,
      jackpot: 0,
      isFreeSpin: false,
      features: [],
      freeSpins: null,
      mutations: [],
    }
    mockedApiSpin.mockResolvedValueOnce(res)
    await useGameStore.getState().spin()
    expect(useSessionStore.getState().wallet).toEqual(res.wallet)
    expect(useGameStore.getState().boardPlay).toBeNull()
  })

  it('resumeBoard: 쉬는 중이면 재생 요청을 세우고, 스핀 중이면 무시한다', async () => {
    await loadGame()
    const board = boardWithWin()
    useGameStore.getState().resumeBoard({ roundId: 'r-resume', feature: board, totalBet: 25, totalWin: 0, resumeShown: 2, auto: false })
    expect(useGameStore.getState().boardPlay?.resumeShown).toBe(2)

    useGameStore.getState().finishBoard()
    expect(useGameStore.getState().boardPlay).toBeNull()

    useGameStore.setState({ phase: 'spinning' })
    useGameStore.getState().resumeBoard({ roundId: 'r-resume', feature: board, totalBet: 25, totalWin: 0, resumeShown: 2, auto: false })
    expect(useGameStore.getState().boardPlay).toBeNull()
  })
})
