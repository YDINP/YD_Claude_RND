import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Level } from '@tgslot/shared'
import { LevelBar, levelSectionProgress } from './LevelBar'

const base: Level = { level: 2, xp: 1112, nextLevelXp: 2599, maxBet: 100 }

describe('LevelBar', () => {
  it('구간 진행률: levelStartXp부터 다음 문턱까지', () => {
    render(<LevelBar levelInfo={{ ...base, levelStartXp: 800 }} />)

    // (1112 - 800) / (2599 - 800) = 312 / 1,799
    expect(screen.getByText('312 / 1,799')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17')
  })

  it('levelStartXp가 없으면 0부터 계산하는 예전 방식으로 폴백한다', () => {
    render(<LevelBar levelInfo={base} />)

    expect(screen.getByText('1,112 / 2,599')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43')
  })

  it('xp가 문턱을 넘어도 100%를 넘지 않고, 시작 문턱 아래여도 0 미만이 되지 않는다', () => {
    expect(levelSectionProgress({ ...base, xp: 9999, levelStartXp: 800 })).toEqual({ done: 1799, span: 1799 })
    expect(levelSectionProgress({ ...base, xp: 100, levelStartXp: 800 })).toEqual({ done: 0, span: 1799 })
  })

  it('levelInfo가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<LevelBar levelInfo={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
