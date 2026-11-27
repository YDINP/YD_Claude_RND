import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../store/game'
import { useSettingsStore } from '../store/settings'
import { BREAK_INTERVAL_MS, usePlaySessionStore } from '../store/playSession'
import { BreakReminder } from './BreakReminder'

describe('BreakReminder', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useSettingsStore.setState({ locale: 'ko' })
    useGameStore.getState().reset()
    usePlaySessionStore.setState({ visibleMs: 0, spinNet: 0, breakStep: 0, lastTickAt: null, hiddenAt: null })
  })

  it('60분 전에는 없고, 60분이 되면 손익과 함께 한 번 뜬다', () => {
    render(<BreakReminder />)
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => {
      usePlaySessionStore.setState({ spinNet: -340 })
      usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS)
    })
    expect(screen.getByText('60분째 플레이 중이에요')).toBeInTheDocument()
    expect(screen.getByText(/게임 손익 −340/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '계속하기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(usePlaySessionStore.getState().breakDue()).toBe(false)
  })

  it('판이 도는 중에는 끝난 뒤(idle)에 띄운다', () => {
    useGameStore.setState({ gameId: 'classic-777', phase: 'spinning' })
    render(<BreakReminder />)
    act(() => usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => useGameStore.setState({ phase: 'idle' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('프리스핀 사이의 idle에는 띄우지 않고 라운드가 끝난 뒤에 띄운다', () => {
    useGameStore.setState({
      gameId: 'classic-777',
      phase: 'idle',
      freeSpins: { gameId: 'classic-777', left: 3, total: 8, multiplier: 1, totalBet: 20, accumulatedWin: 0 },
    })
    render(<BreakReminder />)
    act(() => usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => useGameStore.setState({ freeSpins: null }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('오토스핀이 돌고 있으면 멈추고 이유를 남긴다', () => {
    useGameStore.setState({
      gameId: 'classic-777',
      phase: 'idle',
      autoSpin: { remaining: 9, startCoins: 10_000, net: 0, lossLimit: 0.5, stopOnBigWin: false },
    })
    render(<BreakReminder />)
    act(() => usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS))
    expect(useGameStore.getState().autoSpin).toBeNull()
    expect(useGameStore.getState().autoSpinNotice?.reason).toBe('breakReminder')
  })

  it('120분에 다시 한 번 뜬다', () => {
    render(<BreakReminder />)
    act(() => usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS))
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }))
    act(() => usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS))
    expect(screen.getByText('120분째 플레이 중이에요')).toBeInTheDocument()
  })
})
