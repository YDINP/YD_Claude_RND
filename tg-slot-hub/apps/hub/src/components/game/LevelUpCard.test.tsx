import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level } from '@tgslot/shared'

vi.mock('../../lib/audio', async () => {
  const actual = await vi.importActual<typeof import('../../lib/audio')>('../../lib/audio')
  return { ...actual, playUiSound: vi.fn() }
})

import { playUiSound } from '../../lib/audio'
import { useSettingsStore } from '../../store/settings'
import { LevelUpCard, LEVEL_UP_CARD_MS, LEVEL_UP_TOAST_MS, type LevelUpCardProps } from './LevelUpCard'

const levelUp = { from: 1, to: 2, bonus: 300 }
const info: Level = {
  level: 2,
  xp: 800,
  nextLevelXp: 2599,
  maxBet: 100,
  levelStartXp: 800,
  nextLevelBonus: 300,
  nextUnlock: { level: 5, maxBet: 200 },
}

function props(patch: Partial<LevelUpCardProps> = {}): LevelUpCardProps {
  return {
    levelUp,
    roundId: 'r1',
    idle: true,
    blocked: false,
    autoSpinning: false,
    levelInfo: info,
    reducedMotion: true,
    ...patch,
  }
}

describe('LevelUpCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    useSettingsStore.setState({ locale: 'ko' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('levelUp이 없으면 안 뜬다', () => {
    render(<LevelUpCard {...props({ levelUp: undefined })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
  })

  it('연출 중(idle 아님·빅윈 등)에는 안 뜨고, idle이 되면 뜬다', () => {
    const { rerender } = render(<LevelUpCard {...props({ idle: false })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()

    rerender(<LevelUpCard {...props({ idle: true, blocked: true })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()

    rerender(<LevelUpCard {...props({ idle: true, blocked: false })} />)
    const card = screen.getByTestId('levelup-card')
    expect(card).toHaveTextContent('레벨 업!')
    expect(card).toHaveTextContent('Lv.1 → Lv.2')
    expect(card).toHaveTextContent('+300')
    expect(card).toHaveTextContent('다음 레벨 보상 +300')
    expect(card).toHaveTextContent('Lv.5에 최대 베팅 200')
    expect(playUiSound).toHaveBeenCalledWith('up')
  })

  it('서버 레벨 정보가 아직 새 레벨이 아니면 다음 보상 줄을 숨긴다', () => {
    render(<LevelUpCard {...props({ levelInfo: { ...info, level: 1 } })} />)
    expect(screen.getByTestId('levelup-card')).not.toHaveTextContent('다음 레벨 보상')
  })

  it('3초 뒤 자동으로 닫힌다', () => {
    render(<LevelUpCard {...props()} />)
    act(() => {
      vi.advanceTimersByTime(LEVEL_UP_CARD_MS)
    })
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
  })

  it('탭하면 즉시 닫힌다', () => {
    render(<LevelUpCard {...props()} />)
    fireEvent.click(screen.getByTestId('levelup-card'))
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
  })

  it('다음 스핀이 시작되면(idle 아님) 카드가 닫히고 같은 판에서 다시 뜨지 않는다', () => {
    const { rerender } = render(<LevelUpCard {...props()} />)
    expect(screen.getByTestId('levelup-card')).toBeInTheDocument()
    rerender(<LevelUpCard {...props({ idle: false })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
    rerender(<LevelUpCard {...props({ idle: true })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
  })

  it('레벨업 판이 프리스핀을 열어 lastResult가 바뀌어도, 라운드가 끝난 뒤 카드가 뜬다', () => {
    const { rerender } = render(<LevelUpCard {...props({ blocked: true })} />)
    // 프리스핀 판들: levelUp 없음, roundId가 바뀜, 사이사이 idle이지만 blocked(프리스핀 중)
    rerender(<LevelUpCard {...props({ levelUp: undefined, roundId: 'fs1', idle: false, blocked: true })} />)
    rerender(<LevelUpCard {...props({ levelUp: undefined, roundId: 'fs1', idle: true, blocked: true })} />)
    rerender(<LevelUpCard {...props({ levelUp: undefined, roundId: 'fs2', idle: true, blocked: true })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
    rerender(<LevelUpCard {...props({ levelUp: undefined, roundId: 'fs2', idle: true, blocked: false })} />)
    expect(screen.getByTestId('levelup-card')).toHaveTextContent('Lv.1 → Lv.2')
    expect(screen.getByTestId('levelup-card')).toHaveTextContent('+300')
  })

  it('오토스핀 중에는 카드 대신 한 줄 토스트 1.6초', () => {
    render(<LevelUpCard {...props({ autoSpinning: true, idle: false })} />)
    expect(screen.queryByTestId('levelup-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('levelup-toast')).toHaveTextContent('Lv.2 달성 · +300')

    act(() => {
      vi.advanceTimersByTime(LEVEL_UP_TOAST_MS)
    })
    expect(screen.queryByTestId('levelup-toast')).not.toBeInTheDocument()
  })

  it('보상은 처음부터 최종 값이다(굴림 첫 프레임의 작은 값이 다음 판 베팅처럼 보이지 않게)', () => {
    render(<LevelUpCard {...props({ reducedMotion: false })} />)
    expect(screen.getByTestId('levelup-card')).toHaveTextContent('+300')
    expect(screen.getByTestId('levelup-card')).not.toHaveTextContent('+0')
  })
})
