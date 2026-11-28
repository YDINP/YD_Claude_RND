import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mission } from '@tgslot/shared'

const mockRenderer = vi.hoisted(() => ({
  onEvent: null as ((e: { type: string; [key: string]: unknown }) => void) | null,
}))

vi.mock('@tgslot/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tgslot/renderer')>()),
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
  // 게임 진입(load)이 레벨 정보가 없으면 /me를 받는다. 실제 요청이 나가면 테스트 토큰이 거절돼 세션이 지워진다.
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getGameState: vi.fn(), getRoundSeed: vi.fn(), getMe: vi.fn() }
})

import { getGameMath, getGameState } from '../../sdk/api'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { useSettingsStore } from '../../store/settings'
import { GameScreen } from './GameScreen'

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

function mission(id: string, patch: Partial<Mission> = {}): Mission {
  return {
    id,
    name: { en: `Mission ${id}`, ko: id },
    target: 10,
    progress: 0,
    reward: 100,
    claimed: false,
    completed: false,
    ...patch,
  }
}

function resetHub(patch: Partial<ReturnType<typeof useHubStore.getState>> = {}): void {
  useHubStore.setState({
    status: 'ready',
    errorMessage: null,
    bonusStatus: null,
    jackpot: null,
    missions: null,
    leaderboard: null,
    levelInfo: null,
    claimingBonus: null,
    claimingMissionId: null,
    bonusClaimError: null,
    missionNotices: [],
    ...patch,
  })
}

describe('GameScreen 당첨 패널 진행 한 줄', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRenderer.onEvent = null
    useGameStore.getState().reset()
    useSettingsStore.setState({ spinSpeed: 'normal', locale: 'en' })
    useGamesStore.setState({ status: 'ready', games: [], errorMessage: null })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
    vi.mocked(getGameMath).mockResolvedValue(rawMath)
    vi.mocked(getGameState).mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
  })

  afterEach(() => {
    useGameStore.getState().reset()
  })

  it('꽝·진입 직후(당첨 금액 0, 라인 문구 없음)에는 가장 진행률 높은 미션이 한 줄로 보인다', async () => {
    resetHub({
      missions: { day: '2026-09-02', missions: [mission('spin_50', { progress: 2 }), mission('win_3', { progress: 7 })] },
    })

    render(<GameScreen gameId="classic-777" />)

    await waitFor(() => expect(document.querySelector('.hub-win-strip__line-label')).not.toBeNull())
    expect(document.querySelector('.hub-win-strip__line-label')).toHaveTextContent('Mission · Mission win_3 7/10')
  })

  it('받을 미션이 있으면 미션 탭 안내가 먼저다', async () => {
    resetHub({
      missions: {
        day: '2026-09-02',
        missions: [mission('a', { progress: 10, completed: true }), mission('b', { progress: 7 })],
      },
    })

    render(<GameScreen gameId="classic-777" />)

    await waitFor(() =>
      expect(document.querySelector('.hub-win-strip__line-label')).toHaveTextContent('Mission done! Claim it in the Missions tab'),
    )
  })

  it('당첨 중에는 진행 줄 대신 라인 문구가 보인다', async () => {
    resetHub({ missions: { day: '2026-09-02', missions: [mission('spin_50', { progress: 2 })] } })

    render(<GameScreen gameId="classic-777" />)
    await waitFor(() => expect(document.querySelector('.hub-win-strip__line-label')).not.toBeNull())

    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 348 })
    })

    const label = document.querySelector('.hub-win-strip__line-label')
    expect(label).toHaveTextContent('Total 348')
    expect(label).not.toHaveTextContent('Mission')
  })

  it('허브 정보가 없으면 줄을 그리지 않는다', async () => {
    resetHub()

    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    expect(document.querySelector('.hub-win-strip__line-label')).toBeNull()
  })
})
