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
    })

    await useSessionStore.getState().bootstrap()

    const state = useSessionStore.getState()
    expect(state.status).toBe('ready')
    expect(state.token).toBe('stored-token')
    expect(state.wallet).toEqual({ coins: 5_000, gems: 2 })
    expect(mockedGetMe).toHaveBeenCalledWith('stored-token')
    expect(mockedAuthTelegram).not.toHaveBeenCalled()
  })
})
