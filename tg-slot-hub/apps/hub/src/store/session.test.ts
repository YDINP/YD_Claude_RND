import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/tma', () => ({
  initTma: vi.fn(),
  getInitDataRaw: vi.fn(() => null),
}))

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return {
    ...actual,
    authTelegram: vi.fn(),
    getMe: vi.fn(),
  }
})

import { authTelegram, getMe } from '../sdk/api'
import { getInitDataRaw } from '../sdk/tma'
import { useSessionStore } from './session'

const mockedAuthTelegram = vi.mocked(authTelegram)
const mockedGetMe = vi.mocked(getMe)
const mockedGetInitDataRaw = vi.mocked(getInitDataRaw)

const mockUser = {
  id: 'u1',
  telegramId: 777000,
  firstName: 'Dev',
  locale: 'en' as const,
  level: 1,
  xp: 0,
}

function resetStore(): void {
  useSessionStore.setState({
    status: 'idle',
    token: null,
    user: null,
    wallet: null,
    errorMessage: null,
  })
}

describe('session store bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetInitDataRaw.mockReturnValue(null)
    sessionStorage.clear()
    resetStore()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('authenticates with the dev mock initData when outside Telegram and the flag is on', async () => {
    vi.stubEnv('VITE_DEV_MOCK_TMA', 'true')
    mockedAuthTelegram.mockResolvedValue({
      token: 'test-token',
      user: mockUser,
      wallet: { coins: 10_000, gems: 0 },
    })

    await useSessionStore.getState().bootstrap()

    const state = useSessionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.wallet).toEqual({ coins: 10_000, gems: 0 })
    expect(state.user).toEqual(mockUser)
    expect(mockedAuthTelegram).toHaveBeenCalledWith('mock:777000:Dev')
  })

  it('sets status to outside when outside Telegram and the dev mock flag is off', async () => {
    vi.stubEnv('VITE_DEV_MOCK_TMA', 'false')

    await useSessionStore.getState().bootstrap()

    expect(useSessionStore.getState().status).toBe('outside')
    expect(mockedAuthTelegram).not.toHaveBeenCalled()
  })

  it('restores a session from a previously stored token without calling authTelegram', async () => {
    sessionStorage.setItem('tgslot.token', 'stored-token')
    mockedGetMe.mockResolvedValue({
      user: mockUser,
      wallet: { coins: 5_000, gems: 2 },
      levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 1000 },
      jackpot: 0,
    })

    await useSessionStore.getState().bootstrap()

    const state = useSessionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.token).toBe('stored-token')
    expect(state.wallet).toEqual({ coins: 5_000, gems: 2 })
    expect(mockedGetMe).toHaveBeenCalledWith('stored-token')
    expect(mockedAuthTelegram).not.toHaveBeenCalled()
  })

  it('uses the refreshed token when getMe() reauthenticates internally (stale token recovery)', async () => {
    sessionStorage.setItem('tgslot.token', 'stale-token')
    mockedGetMe.mockImplementation(async () => {
      // sdk/api.ts의 authedFetch가 401을 받아 내부적으로 reauth()한 것을 흉내낸다 — reauth()는
      // getMe()가 resolve되기 전에 store의 token을 이미 새 값으로 갱신해 둔다.
      useSessionStore.setState({ token: 'fresh-token' })
      return {
        user: mockUser,
        wallet: { coins: 7_000, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 1000 },
        jackpot: 0,
      }
    })

    await useSessionStore.getState().bootstrap()

    const state = useSessionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.token).toBe('fresh-token')
    expect(state.wallet).toEqual({ coins: 7_000, gems: 0 })
  })
})

describe('session store reauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetInitDataRaw.mockReturnValue(null)
    sessionStorage.clear()
    resetStore()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('clears the stored token, re-authenticates with initData, and updates token/user/wallet without touching status', async () => {
    vi.stubEnv('VITE_DEV_MOCK_TMA', 'true')
    sessionStorage.setItem('tgslot.token', 'stale-token')
    useSessionStore.setState({ status: 'ready', token: 'stale-token' })
    mockedAuthTelegram.mockResolvedValue({
      token: 'fresh-token',
      user: mockUser,
      wallet: { coins: 3_000, gems: 0 },
    })

    const newToken = await useSessionStore.getState().reauth()

    expect(newToken).toBe('fresh-token')
    const state = useSessionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.token).toBe('fresh-token')
    expect(state.user).toEqual(mockUser)
    expect(state.wallet).toEqual({ coins: 3_000, gems: 0 })
    expect(sessionStorage.getItem('tgslot.token')).toBe('fresh-token')
  })

  it('returns null and clears the token when there is no available initData', async () => {
    vi.stubEnv('VITE_DEV_MOCK_TMA', 'false')
    useSessionStore.setState({ status: 'ready', token: 'stale-token' })

    const newToken = await useSessionStore.getState().reauth()

    expect(newToken).toBeNull()
    expect(useSessionStore.getState().token).toBeNull()
    expect(mockedAuthTelegram).not.toHaveBeenCalled()
  })

  it('returns null and clears the token when authTelegram fails', async () => {
    vi.stubEnv('VITE_DEV_MOCK_TMA', 'true')
    useSessionStore.setState({ status: 'ready', token: 'stale-token' })
    mockedAuthTelegram.mockRejectedValue(new Error('boom'))

    const newToken = await useSessionStore.getState().reauth()

    expect(newToken).toBeNull()
    expect(useSessionStore.getState().token).toBeNull()
  })

  it('shares a single in-flight reauth across concurrent callers', async () => {
    vi.stubEnv('VITE_DEV_MOCK_TMA', 'true')
    let resolveAuth: (value: Awaited<ReturnType<typeof authTelegram>>) => void = () => {}
    mockedAuthTelegram.mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve
      }),
    )

    const first = useSessionStore.getState().reauth()
    const second = useSessionStore.getState().reauth()

    resolveAuth({ token: 'fresh-token', user: mockUser, wallet: { coins: 1, gems: 0 } })

    const [a, b] = await Promise.all([first, second])
    expect(a).toBe('fresh-token')
    expect(b).toBe('fresh-token')
    expect(mockedAuthTelegram).toHaveBeenCalledTimes(1)
  })
})
