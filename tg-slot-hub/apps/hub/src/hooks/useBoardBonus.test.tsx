import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Theme } from '@tgslot/renderer'
import { useBoardBonus } from './useBoardBonus'
import { useGameStore, type SpinRenderer } from '../store/game'
import { boardSnapshotKey, saveBoardSnapshot } from '../game/boardPlayback'
import { hanbokMath, makeBoardFeature } from '../test/hanbokMath'

vi.mock('../lib/audio', async () => {
  const actual = await vi.importActual<typeof import('../lib/audio')>('../lib/audio')
  return { ...actual, bgmModeTransition: vi.fn(), setBgmMode: vi.fn() }
})
import { bgmModeTransition, setBgmMode } from '../lib/audio'

const theme: Theme = {
  symbols: { lantern_girl: '/x/girl.svg', bonus: '/x/bonus.svg' },
  palette: { frame: '#000', reelBg: '#000', winLine: ['#fff'], text: '#fff' },
}

function Harness({ onWinStrip, themeSettled = true }: { onWinStrip: (value: number, ms: number) => void; themeSettled?: boolean }): ReactNode {
  const board = useBoardBonus({ gameId: 'hanbok-night-market', theme, themeSettled, onWinStrip })
  return (
    <div>
      <span data-testid="active">{String(board.active)}</span>
      {board.overlay}
    </div>
  )
}

function makeRenderer(): SpinRenderer & { setPaused: ReturnType<typeof vi.fn> } {
  return {
    spinTo: vi.fn().mockResolvedValue(undefined) as never,
    showWins: vi.fn().mockResolvedValue(undefined) as never,
    setPaused: vi.fn(),
  } as never
}

const feature = makeBoardFeature('hook-board', 25)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.mocked(bgmModeTransition).mockClear()
  vi.mocked(setBgmMode).mockClear()
  useGameStore.getState().reset()
  useGameStore.setState({ gameId: 'hanbok-night-market', math: hanbokMath, phase: 'idle' })
})

afterEach(() => {
  cleanup()
  useGameStore.getState().reset()
  vi.useRealTimers()
})

const phaseOf = (container: HTMLElement): string | null => container.querySelector('.board-bonus')?.getAttribute('data-phase') ?? null

describe('useBoardBonus', () => {
  it('붙어 있는 동안만 스토어에 «말판 화면이 있다»고 알린다', () => {
    const { unmount } = render(<Harness onWinStrip={vi.fn()} />)
    // spin()이 말판을 열려면 이 신호가 있어야 한다 — 마운트 직후 켜지고 언마운트로 꺼진다.
    useGameStore.getState().resumeBoard({ roundId: 'r', feature, totalBet: 25, totalWin: 0, resumeShown: 1, auto: false })
    expect(useGameStore.getState().boardPlay).not.toBeNull()
    unmount()
  })

  it('진짜 판: 커튼이 덮이면 캔버스를 멈추고 말판을 올리고, 걷히기 시작하면 진입 연출이 시작된다', () => {
    const renderer = makeRenderer()
    useGameStore.getState().setRenderer(renderer)
    const onWinStrip = vi.fn()
    const { container } = render(<Harness onWinStrip={onWinStrip} />)
    act(() => {
      useGameStore.setState({
        boardPlay: { roundId: 'r1', feature, totalBet: 25, totalWin: feature.win + 65, auto: false },
        phase: 'showingWin',
      })
    })
    expect(container.querySelector('.board-curtain--enter')).not.toBeNull()
    expect(container.querySelector('.board-bonus')).toBeNull()
    expect(bgmModeTransition).toHaveBeenCalledWith('freeSpins', 'start')

    // 덮인 순간(단색 커튼 320ms): 말판 장착 + 캔버스 정지 + WinStrip을 라인+초롱 몫까지
    act(() => vi.advanceTimersByTime(330))
    expect(renderer.setPaused).toHaveBeenCalledWith(true)
    expect(container.querySelector('.board-bonus')).not.toBeNull()
    expect(onWinStrip).toHaveBeenCalledWith(65, 0)
    expect(phaseOf(container)).toBe('intro')

    // 걷히기 시작하면 진입 연출 → 던지기 차례
    act(() => vi.advanceTimersByTime(60))
    expect(bgmModeTransition).toHaveBeenCalledWith('freeSpins', 'end')
    act(() => vi.advanceTimersByTime(3000))
    expect(container.querySelector('.board-curtain')).toBeNull()
    expect(phaseOf(container)).toBe('ready')
  })

  it('[받기] → 복귀 커튼이 덮이면 말판을 내리고 캔버스를 다시 돌리고 WinStrip을 합계로 올린 뒤, 끝나면 finishBoard()', () => {
    const renderer = makeRenderer()
    useGameStore.getState().setRenderer(renderer)
    const onWinStrip = vi.fn()
    const { container } = render(<Harness onWinStrip={onWinStrip} />)
    const totalWin = feature.win + 65
    act(() => {
      useGameStore.setState({
        boardPlay: { roundId: 'r1', feature, totalBet: 25, totalWin, auto: false },
        phase: 'showingWin',
      })
    })
    // act 하나 안에서는 렌더가 몰려서 걷힘 뒤의 타이머가 안 걸린다 — 단계별로 흘린다.
    act(() => vi.advanceTimersByTime(330))
    act(() => vi.advanceTimersByTime(60))
    act(() => vi.advanceTimersByTime(3000))
    expect(phaseOf(container)).toBe('ready')

    // ⏩ 두 번 → 요약 → 받기
    const icon = container.querySelector('.board-btn--icon') as HTMLElement
    fireEvent.click(icon)
    fireEvent.click(icon)
    expect(phaseOf(container)).toBe('summary')
    fireEvent.click(container.querySelector('.board-summary__collect') as HTMLElement)
    expect(container.querySelector('.board-curtain--exit')).not.toBeNull()
    expect(bgmModeTransition).toHaveBeenCalledWith('base', 'start')
    // 말판은 덮일 때까지 남아 있다.
    expect(container.querySelector('.board-bonus')).not.toBeNull()

    act(() => vi.advanceTimersByTime(330))
    expect(container.querySelector('.board-bonus')).toBeNull()
    expect(renderer.setPaused).toHaveBeenLastCalledWith(false)
    expect(onWinStrip).toHaveBeenLastCalledWith(totalWin, 900)
    // 아직 커튼이 걷히는 중 — 스토어의 멈춰 있던 판은 끝나야 풀린다.
    expect(useGameStore.getState().boardPlay).not.toBeNull()

    act(() => vi.advanceTimersByTime(700))
    expect(useGameStore.getState().boardPlay).toBeNull()
    expect(container.querySelector('.board-curtain')).toBeNull()
    expect(bgmModeTransition).toHaveBeenLastCalledWith('base', 'end')
    // 끝까지 본 판은 스냅숏에서 다시 안 뜬다.
    saveBoardSnapshot('hanbok-night-market', { roundId: 'r1', savedAt: Date.now(), totalBet: 25, feature, shown: 'done' })
    expect(localStorage.getItem(boardSnapshotKey('hanbok-night-market'))).not.toBeNull()
  })

  it('복원: 커튼 없이 곧장 보던 던지기부터, 캔버스는 멈춘다', () => {
    const renderer = makeRenderer()
    useGameStore.getState().setRenderer(renderer)
    const { container } = render(<Harness onWinStrip={vi.fn()} />)
    act(() => {
      useGameStore.getState().resumeBoard({ roundId: 'r2', feature, totalBet: 25, totalWin: 0, resumeShown: 2, auto: false })
    })
    expect(container.querySelector('.board-curtain')).toBeNull()
    expect(container.querySelector('.board-bonus')).not.toBeNull()
    expect(renderer.setPaused).toHaveBeenCalledWith(true)
    expect(setBgmMode).toHaveBeenCalledWith('freeSpins')
    act(() => vi.advanceTimersByTime(60))
    expect(phaseOf(container)).toBe('ready')
  })

  it('스냅숏이 있으면 열릴 때 한 번 복원하고, 서버 규칙과 어긋나면 버린다', () => {
    saveBoardSnapshot('hanbok-night-market', { roundId: 'good', savedAt: Date.now(), totalBet: 25, feature, shown: 1 })
    const { container, unmount } = render(<Harness onWinStrip={vi.fn()} />)
    act(() => vi.advanceTimersByTime(60))
    expect(useGameStore.getState().boardPlay?.roundId).toBe('good')
    expect(container.querySelector('.board-bonus')).not.toBeNull()
    unmount()
    useGameStore.getState().reset()
    useGameStore.setState({ gameId: 'hanbok-night-market', math: hanbokMath, phase: 'idle' })

    // 값을 바꿔 망가뜨린 스냅숏 — 재생하지 않고 지운다.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    saveBoardSnapshot('hanbok-night-market', { roundId: 'bad', savedAt: Date.now(), totalBet: 25, feature: { ...feature, pot: feature.pot + 7 }, shown: 1 })
    render(<Harness onWinStrip={vi.fn()} />)
    act(() => vi.advanceTimersByTime(60))
    expect(useGameStore.getState().boardPlay).toBeNull()
    expect(localStorage.getItem(boardSnapshotKey('hanbok-night-market'))).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('테마가 아직 안 정해졌으면 복원을 미룬다', () => {
    saveBoardSnapshot('hanbok-night-market', { roundId: 'later', savedAt: Date.now(), totalBet: 25, feature, shown: 1 })
    const { rerender } = render(<Harness onWinStrip={vi.fn()} themeSettled={false} />)
    act(() => vi.advanceTimersByTime(100))
    expect(useGameStore.getState().boardPlay).toBeNull()
    rerender(<Harness onWinStrip={vi.fn()} themeSettled />)
    act(() => vi.advanceTimersByTime(60))
    expect(useGameStore.getState().boardPlay?.roundId).toBe('later')
  })
})
