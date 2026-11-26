import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import type { SpinResponse, StageRouletteFeature } from '@tgslot/shared'
import { getGameMath, spin as apiSpin, getGameState } from '../sdk/api'
import { useGameStore, type SpinRenderer } from './game'
import { useSessionStore } from './session'
import { sampleRoulettes, loadIdolMath } from '../test/idolMath'
import { ROULETTE_RESUME_KEY, readRouletteCache, writeRouletteCache } from '../lib/rouletteResume'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)

const rawIdol = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', '..', 'games', 'idol-stage-live', 'math.json'), 'utf8'),
) as unknown
const samples = sampleRoulettes(loadIdolMath(), 12, 'store')
const small = samples.reduce((a, b) => (b.feature.total < a.feature.total ? b : a))
const big = samples.reduce((a, b) => (b.feature.total > a.feature.total ? b : a))

function response(feature: StageRouletteFeature | null, baseWin: number, overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'round-roulette',
    stops: [0, 0, 0, 0, 0],
    grid: [['idol_pink', 'idol_blue', 'idol_gold', 'album', 'note']],
    wins: [],
    totalBet: 100,
    totalWin: baseWin + (feature?.total ?? 0),
    wallet: { coins: 777_000, gems: 0 },
    seedHash: 'hash',
    nonce: 0,
    jackpot: 0,
    isFreeSpin: false,
    features: feature === null ? [] : [feature],
    freeSpins: null,
    mutations: [],
    ...overrides,
  }
}

/** 커튼이 «시작 → 걷힘»을 한 틱 간격으로 알리는 렌더러. GameScreen이 하는 일을 흉내 낸다. */
function makeRenderer(winsMs = 0) {
  const spinTo = vi.fn().mockResolvedValue(undefined)
  // 릴 위 강조(showWins 첫 바퀴)가 도는 시간 — 0이면 곧바로 끝난다.
  const showWins = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, winsMs)))
  const clearWins = vi.fn()
  // 진짜 렌더러처럼 모드가 바뀔 때만 커튼을 건다(같은 모드로 다시 맞추면 아무 일도 없다).
  let current: 'freeSpins' | 'base' = 'base'
  const setMode = vi.fn((mode: { freeSpins?: unknown; immediate?: boolean }) => {
    const to = mode.freeSpins ? ('freeSpins' as const) : ('base' as const)
    if (to === current) return
    current = to
    if (mode.immediate) return
    useGameStore.getState().notifyCurtain(to, 'start')
    setTimeout(() => useGameStore.getState().notifyCurtain(to, 'end'), 5)
  })
  const renderer: SpinRenderer = { spinTo, showWins, setMode, clearWins }
  return { renderer, spinTo, showWins, setMode, clearWins }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  useGameStore.getState().reset()
  mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
  useSessionStore.setState({
    status: 'ready',
    token: 'test-token',
    user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
    wallet: { coins: 1000, gems: 0 },
    errorMessage: null,
    refreshError: null,
  })
})

async function loadGame(winsMs = 0): Promise<ReturnType<typeof makeRenderer>> {
  mockedGetGameMath.mockResolvedValue(rawIdol)
  await useGameStore.getState().load('idol-stage-live')
  const fake = makeRenderer(winsMs)
  useGameStore.getState().setRenderer(fake.renderer)
  return fake
}

const stage = (): string | null => useGameStore.getState().roulette?.stage ?? null

/** 룰렛 요약을 닫고, 이어서 뜨는 빅윈 오버레이(룰렛 합은 거의 항상 10배 이상이다)를 닫아 판을 끝낸다. */
async function finishAll(done: Promise<void>): Promise<void> {
  useGameStore.getState().finishRoulette()
  await vi.waitFor(() => expect(useGameStore.getState().winCelebration).not.toBeNull())
  useGameStore.getState().dismissWinCelebration()
  await done
}

describe('무대 룰렛 — 스토어 흐름', () => {
  it('룰렛이 없는 스핀은 예전처럼 곧바로 공개한다(잔액·lastResult)', async () => {
    await loadGame()
    mockedApiSpin.mockResolvedValue(response(null, 0, { roundId: 'plain' }))
    await useGameStore.getState().spin()
    expect(useGameStore.getState().roulette).toBeNull()
    expect(useGameStore.getState().lastResult?.roundId).toBe('plain')
    expect(useSessionStore.getState().wallet?.coins).toBe(777_000)
  })

  it('룰렛 스핀: 초대권 강조(brief) → 클립 → 오버레이 → 클립 → 그제서야 잔액·lastResult를 공개한다', async () => {
    const fake = await loadGame(150)
    mockedApiSpin.mockResolvedValue(response(small.feature, 200, { roundId: 'r-small' }))
    const done = useGameStore.getState().spin()

    // 릴이 멈추고 강조가 도는 동안: 세션은 pre, 잔액·lastResult는 아직 새지 않는다.
    await vi.waitFor(() => expect(stage()).toBe('pre'))
    expect(useSessionStore.getState().wallet?.coins).toBe(1000)
    expect(useGameStore.getState().lastResult).toBeNull()
    expect(useGameStore.getState().roulette?.feature.total).toBe(small.feature.total)
    expect(useGameStore.getState().roulette?.baseWin).toBe(200)

    // 강조가 끝나면 진입 클립(룰렛 모드, 릴 감춤) → 오버레이.
    await vi.waitFor(() => expect(stage()).toBe('show'))
    expect(fake.showWins).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ presentation: 'brief', features: [small.feature] }),
    )
    expect(fake.setMode).toHaveBeenNthCalledWith(1, {
      freeSpins: { left: 3, total: 3, multiplier: 1 },
      hideReels: true,
    })
    expect(useSessionStore.getState().wallet?.coins).toBe(1000)
    expect(useGameStore.getState().lastResult).toBeNull()
    // 룰렛 동안 어떤 경로로도 새 스핀이 시작되지 않는다.
    expect(useGameStore.getState().phase).toBe('showingWin')

    // 요약 카드를 닫으면 퇴장 클립 → 오버레이 제거 → 공개.
    useGameStore.getState().finishRoulette()
    await vi.waitFor(() => expect(stage()).toBeNull())
    await vi.waitFor(() => expect(useGameStore.getState().lastResult?.roundId).toBe('r-small'))
    expect(fake.setMode).toHaveBeenNthCalledWith(2, { freeSpins: null })
    expect(useSessionStore.getState().wallet?.coins).toBe(777_000)
    // 빅윈 오버레이를 닫으면 판이 끝난다.
    await vi.waitFor(() => expect(useGameStore.getState().winCelebration).not.toBeNull())
    useGameStore.getState().dismissWinCelebration()
    await done
    expect(useGameStore.getState().phase).toBe('idle')
  })

  it('큰 당첨이면 룰렛이 끝난 뒤에 빅윈 오버레이를 한 번만 띄운다', async () => {
    await loadGame()
    mockedApiSpin.mockResolvedValue(response(big.feature, 0, { roundId: 'r-big' }))
    const done = useGameStore.getState().spin()
    await vi.waitFor(() => expect(stage()).toBe('show'))
    // 룰렛 도중에는 빅윈이 뜨지 않는다.
    expect(useGameStore.getState().winCelebration).toBeNull()
    useGameStore.getState().finishRoulette()
    await vi.waitFor(() => expect(useGameStore.getState().winCelebration).not.toBeNull())
    expect(useGameStore.getState().winCelebration?.totalWin).toBe(big.feature.total)
    expect(useGameStore.getState().lastResult?.roundId).toBe('r-big')
    useGameStore.getState().dismissWinCelebration()
    await done
    expect(useGameStore.getState().winCelebration).toBeNull()
  })

  it('룰렛 도중 화면을 나가도(reset) 잔액은 서버 값으로 공개하고 연출은 물러난다', async () => {
    await loadGame()
    mockedApiSpin.mockResolvedValue(response(small.feature, 0, { roundId: 'r-leave' }))
    const done = useGameStore.getState().spin()
    await vi.waitFor(() => expect(stage()).toBe('show'))
    useGameStore.getState().reset()
    await done
    expect(useGameStore.getState().roulette).toBeNull()
    expect(useSessionStore.getState().wallet?.coins).toBe(777_000)
  })

  it('«이어 보기» 캐시는 응답 시점에 쓰이고 새 스핀이 시작되면 지워진다', async () => {
    await loadGame(150)
    mockedApiSpin.mockResolvedValue(response(small.feature, 0, { roundId: 'r-cache' }))
    const first = useGameStore.getState().spin()
    await vi.waitFor(() => expect(stage()).toBe('pre'))
    const cache = readRouletteCache('idol-stage-live')
    expect(cache?.roundId).toBe('r-cache')
    expect(cache?.shownSteps).toBe(0)
    expect(cache?.totalWin).toBe(small.feature.total)
    await vi.waitFor(() => expect(stage()).toBe('show'))
    await finishAll(first)
    // 끝까지 보면 캐시가 지워진다.
    expect(sessionStorage.getItem(ROULETTE_RESUME_KEY)).toBeNull()

    writeRouletteCache({
      gameId: 'idol-stage-live',
      roundId: 'stale',
      feature: small.feature,
      baseWin: 0,
      totalWin: small.feature.total,
      totalBet: 100,
      shownSteps: 1,
      savedAt: Date.now(),
    })
    mockedApiSpin.mockResolvedValue(response(null, 0, { roundId: 'next' }))
    await useGameStore.getState().spin()
    expect(sessionStorage.getItem(ROULETTE_RESUME_KEY)).toBeNull()
  })

  it('이어 보기: 캐시가 있으면 끝까지 본 회전 다음부터 곧장 룰렛 모드(클립 없이)로 들어간다', async () => {
    const fake = await loadGame()
    writeRouletteCache({
      gameId: 'idol-stage-live',
      roundId: 'resume-1',
      feature: small.feature,
      baseWin: 40,
      totalWin: 40 + small.feature.total,
      totalBet: 100,
      shownSteps: 1,
      savedAt: Date.now(),
    })
    const done = useGameStore.getState().resumeRoulette()
    await vi.waitFor(() => expect(stage()).toBe('show'))
    const session = useGameStore.getState().roulette
    expect(session?.resumed).toBe(true)
    expect(session?.startAt).toBe(1)
    expect(session?.baseWin).toBe(40)
    expect(fake.setMode).toHaveBeenNthCalledWith(1, {
      freeSpins: { left: 3, total: 3, multiplier: 1 },
      hideReels: true,
      immediate: true,
    })
    // 이어 보는 동안에도 입력은 잠긴다.
    expect(useGameStore.getState().phase).toBe('showingWin')
    useGameStore.getState().finishRoulette()
    await done
    expect(useGameStore.getState().roulette).toBeNull()
    expect(useGameStore.getState().phase).toBe('idle')
    // 정산은 이미 끝났으니 지갑을 건드리지 않는다.
    expect(useSessionStore.getState().wallet?.coins).toBe(1000)
  })

  it('이어 보기: 캐시가 없거나 다른 게임이면 아무 일도 하지 않는다', async () => {
    await loadGame()
    await useGameStore.getState().resumeRoulette()
    expect(useGameStore.getState().roulette).toBeNull()
    writeRouletteCache({
      gameId: 'other-game',
      roundId: 'x',
      feature: small.feature,
      baseWin: 0,
      totalWin: small.feature.total,
      totalBet: 100,
      shownSteps: 0,
      savedAt: Date.now(),
    })
    await useGameStore.getState().resumeRoulette()
    expect(useGameStore.getState().roulette).toBeNull()
    expect(useGameStore.getState().phase).toBe('idle')
  })

  it('커튼 이벤트가 안 와도 상한(8초) 뒤에는 흐름이 이어진다', async () => {
    vi.useFakeTimers()
    try {
      mockedGetGameMath.mockResolvedValue(rawIdol)
      await useGameStore.getState().load('idol-stage-live')
      const spinTo = vi.fn().mockResolvedValue(undefined)
      const showWins = vi.fn().mockResolvedValue(undefined)
      const setMode = vi.fn() // 커튼 이벤트를 영영 안 보낸다.
      useGameStore.getState().setRenderer({ spinTo, showWins, setMode })
      mockedApiSpin.mockResolvedValue(response(small.feature, 0, { roundId: 'r-stuck' }))
      const done = useGameStore.getState().spin()
      await vi.advanceTimersByTimeAsync(50)
      expect(stage()).toBe('curtain')
      await vi.advanceTimersByTimeAsync(8100)
      expect(stage()).toBe('show')
      useGameStore.getState().finishRoulette()
      await vi.advanceTimersByTimeAsync(8100)
      expect(useGameStore.getState().roulette).toBeNull()
      useGameStore.getState().dismissWinCelebration()
      await done
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('빅윈 기준', () => {
  it('표본 결과에 한쪽은 작고 한쪽은 크다(테스트 전제)', () => {
    expect(big.feature.total).toBeGreaterThan(small.feature.total)
    expect(big.feature.total / 100).toBeGreaterThanOrEqual(10)
  })
})
