import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mission, SpinResponse } from '@tgslot/shared'

vi.mock('../../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../../sdk/api')>('../../sdk/api')
  return { ...actual, claimMission: vi.fn() }
})

import { claimMission as apiClaimMission } from '../../sdk/api'
import { useHubStore } from '../../store/hub'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useSettingsStore } from '../../store/settings'
import { MissionToast, MISSION_TOAST_MS, MISSION_TOAST_AUTO_MS, WALLET_REFRESH_WAIT_MS } from './MissionToast'

const mockedClaim = vi.mocked(apiClaimMission)

function mission(id: string, patch: Partial<Mission> = {}): Mission {
  return {
    id,
    name: { en: `Mission ${id}`, ko: id },
    target: 3,
    progress: 3,
    reward: 500,
    claimed: false,
    completed: true,
    ...patch,
  }
}

function setRoundId(roundId: string): void {
  useGameStore.setState({ lastResult: { roundId } as SpinResponse })
}

describe('MissionToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    useSettingsStore.setState({ locale: 'en' })
    useSessionStore.setState({
      status: 'ready',
      token: 'tok',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
      refreshMe: vi.fn().mockResolvedValue(undefined),
    })
    useHubStore.setState({
      missions: { day: '2026-09-02', missions: [mission('a')] },
      missionNotices: [mission('a')],
      claimingMissionId: null,
    })
    setRoundId('r1')
  })

  afterEach(() => {
    vi.useRealTimers()
    useGameStore.setState({ lastResult: null })
  })

  it('알림이 없으면 아무것도 그리지 않는다', () => {
    useHubStore.setState({ missionNotices: [] })
    render(<MissionToast idle autoSpinning={false} />)
    expect(screen.queryByTestId('mission-toast')).not.toBeInTheDocument()
  })

  it('피처 팝업·큰 당첨 연출 중(held)에는 숨긴 채 큐에 두고, 끝난 뒤부터 표시 시간을 잰다', () => {
    const { rerender } = render(<MissionToast idle={false} autoSpinning={false} held />)
    expect(screen.queryByTestId('mission-toast')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(MISSION_TOAST_MS * 2)
    })
    expect(useHubStore.getState().missionNotices).toHaveLength(1)
    rerender(<MissionToast idle autoSpinning={false} held={false} />)
    expect(screen.getByTestId('mission-toast')).toBeInTheDocument()
  })

  it('6초 뒤 사라지고 미션 목록에는 남는다', () => {
    render(<MissionToast idle autoSpinning={false} />)
    expect(screen.getByTestId('mission-toast')).toHaveTextContent('Mission done · Mission a')

    act(() => {
      vi.advanceTimersByTime(MISSION_TOAST_MS - 1)
    })
    expect(screen.getByTestId('mission-toast')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('mission-toast')).not.toBeInTheDocument()
    expect(useHubStore.getState().missions?.missions[0]?.completed).toBe(true)
  })

  it('idle이 아니면 받기 버튼이 잠긴다', () => {
    render(<MissionToast idle={false} autoSpinning={false} />)
    expect(screen.getByRole('button', { name: 'Claim +500' })).toBeDisabled()
  })

  it('오토스핀 중에는 버튼 없이 안내 문구만 3초', () => {
    render(<MissionToast idle autoSpinning />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTestId('mission-toast')).toHaveTextContent('Claim it in the Missions tab')

    act(() => {
      vi.advanceTimersByTime(MISSION_TOAST_AUTO_MS)
    })
    expect(screen.queryByTestId('mission-toast')).not.toBeInTheDocument()
  })

  it('받기 성공: 금액을 1초 보여 주고 지갑을 반영한다', async () => {
    mockedClaim.mockResolvedValue({ amount: 500, wallet: { coins: 1500, gems: 0 } })
    render(<MissionToast idle autoSpinning={false} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim +500' }))
    })

    expect(useSessionStore.getState().wallet?.coins).toBe(1500)
    expect(screen.getByTestId('mission-toast')).toHaveTextContent('+500')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByTestId('mission-toast')).not.toBeInTheDocument()
  })

  it('받는 사이 새 스핀 응답이 오면(roundId 변경) 응답 지갑을 쓰지 않는다', async () => {
    let resolveClaim: (v: { amount: number; wallet: { coins: number; gems: number } }) => void = () => {}
    mockedClaim.mockReturnValue(new Promise((resolve) => (resolveClaim = resolve)))
    render(<MissionToast idle autoSpinning={false} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim +500' }))
    })
    // 요청 중에 스핀 응답이 먼저 도착해 지갑을 더 새로운 값으로 바꿨다.
    useSessionStore.setState({ wallet: { coins: 777, gems: 0 } })
    setRoundId('r2')
    await act(async () => {
      resolveClaim({ amount: 500, wallet: { coins: 1500, gems: 0 } })
    })

    expect(useSessionStore.getState().wallet?.coins).toBe(777)
    expect(useHubStore.getState().missions?.missions[0]?.claimed).toBe(true)
  })

  it('버린 응답 지갑은 그 판이 끝나 idle이 되면 /me로 한 번 맞춘다', async () => {
    // 앞 테스트가 남긴 «idle 기다림»을 먼저 흘려보낸 뒤 새 mock을 단다.
    useGameStore.setState({ phase: 'idle' })
    const refreshMe = vi.fn().mockResolvedValue(undefined)
    useSessionStore.setState({ refreshMe })
    let resolveClaim: (v: { amount: number; wallet: { coins: number; gems: number } }) => void = () => {}
    mockedClaim.mockReturnValue(new Promise((resolve) => (resolveClaim = resolve)))
    render(<MissionToast idle autoSpinning={false} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim +500' }))
    })
    useGameStore.setState({ phase: 'spinning' })
    setRoundId('r2')
    await act(async () => {
      resolveClaim({ amount: 500, wallet: { coins: 1500, gems: 0 } })
    })
    expect(refreshMe).not.toHaveBeenCalled()
    act(() => useGameStore.setState({ phase: 'idle' }))
    expect(refreshMe).toHaveBeenCalledTimes(1)
    act(() => useGameStore.setState({ phase: 'spinning' }))
    act(() => useGameStore.setState({ phase: 'idle' }))
    expect(refreshMe).toHaveBeenCalledTimes(1)
  })

  async function claimWhileSpinning(): Promise<ReturnType<typeof vi.fn>> {
    useGameStore.setState({ phase: 'idle', gameId: 'classic-777' })
    const refreshMe = vi.fn().mockResolvedValue(undefined)
    useSessionStore.setState({ refreshMe })
    let resolveClaim: (v: { amount: number; wallet: { coins: number; gems: number } }) => void = () => {}
    mockedClaim.mockReturnValue(new Promise((resolve) => (resolveClaim = resolve)))
    render(<MissionToast idle autoSpinning={false} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim +500' }))
    })
    useGameStore.setState({ phase: 'spinning' })
    setRoundId('r9')
    await act(async () => {
      resolveClaim({ amount: 500, wallet: { coins: 1500, gems: 0 } })
    })
    return refreshMe
  }

  it('idle을 기다리다 게임을 나가면(loading) 그때 한 번 맞추고 구독을 푼다', async () => {
    const refreshMe = await claimWhileSpinning()
    expect(refreshMe).not.toHaveBeenCalled()
    act(() => useGameStore.setState({ phase: 'loading', gameId: 'kraken' }))
    expect(refreshMe).toHaveBeenCalledTimes(1)
    act(() => useGameStore.setState({ phase: 'idle' }))
    expect(refreshMe).toHaveBeenCalledTimes(1)
  })

  it('idle이 오지 않으면 상한 시간 뒤 구독만 푼다', async () => {
    const refreshMe = await claimWhileSpinning()
    act(() => vi.advanceTimersByTime(WALLET_REFRESH_WAIT_MS + 1))
    act(() => useGameStore.setState({ phase: 'idle' }))
    expect(refreshMe).not.toHaveBeenCalled()
  })
})
