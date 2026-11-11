import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderCard } from '@tgslot/shared'
import { parseGameMath } from '@tgslot/slot-engine'
import { miniCandyRaw } from '../../test/candyMath'
import { LadderMeter } from './LadderMeter'
import { OrderBoard, type OrderBoardHandle, type OrderCascadeStepInput } from './OrderBoard'

const math = parseGameMath(miniCandyRaw)

const card = (id: string, progress: number, extra: Partial<OrderCard> = {}): OrderCard => ({
  id,
  kind: 'popSymbol',
  symbol: 'drop_red',
  target: 30,
  progress,
  prize: 3,
  ...extra,
})
const cards = [
  card('a', 23),
  card('b', 4, { kind: 'clusterSize', symbol: undefined, target: 10, prize: 8 }),
  card('c', 0, { kind: 'chainLength', symbol: undefined, target: 3, prize: 5 }),
]

const step = (over: Partial<OrderCascadeStepInput> = {}): OrderCascadeStepInput => ({
  index: 0,
  removed: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  removedSymbols: ['drop_red', 'drop_red', 'wild'],
  cellRects: [null, null, null],
  canvasOrigin: { x: 0, y: 0 },
  skipTokens: true,
  ...over,
})

function setup(serverCards: readonly OrderCard[] | null = cards, visible = true) {
  const ref = createRef<OrderBoardHandle>()
  const onTick = vi.fn()
  const onComplete = vi.fn()
  const onDeal = vi.fn()
  const props = { math, slots: 3, locale: 'en' as const, reducedMotion: true, onTick, onComplete, onDeal }
  const view = render(<OrderBoard ref={ref} cards={serverCards} visible={visible} {...props} />)
  const rerender = (next: readonly OrderCard[] | null, vis = visible): void =>
    view.rerender(<OrderBoard ref={ref} cards={next} visible={vis} {...props} />)
  return { ref, onTick, onComplete, onDeal, rerender, container: view.container }
}

describe('OrderBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows three cards with text, progress and prize', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Order cards' })).toBeInTheDocument()
    expect(screen.getByText('23/30')).toBeInTheDocument()
    expect(screen.getByText('Pop 30')).toBeInTheDocument()
    expect(screen.getByText('4/10')).toBeInTheDocument()
    expect(screen.getByText('10+ at once')).toBeInTheDocument()
    expect(screen.getByText('Chain 3')).toBeInTheDocument()
    expect(screen.getByText('×8')).toBeInTheDocument()
  })

  it('is hidden (but keeps its height) outside a round', () => {
    const { container } = setup(cards, false)
    expect(container.querySelector('.hub-order-board--on')).toBeNull()
    expect(container.querySelector('.hub-order-board')).toHaveAttribute('aria-hidden', 'true')
  })

  it('raises display progress from removedSymbols, ignoring wild, and ticks once per step', () => {
    const { ref, onTick } = setup()
    act(() => ref.current?.cascadeStep(step()))
    expect(screen.getByText('25/30')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(onTick).toHaveBeenCalledTimes(1)
  })

  it('does not tick when nothing on the board changed', () => {
    const { ref, onTick } = setup()
    act(() => ref.current?.cascadeStep(step({ removedSymbols: ['wild', 'wild', 'wild'], index: 0 })))
    // 연쇄 1단계라 chain 카드가 1로 오른다 — 표시는 바뀌었으니 틱이 난다.
    expect(onTick).toHaveBeenCalledTimes(1)
    act(() => ref.current?.cascadeStep(step({ removedSymbols: ['wild', 'wild', 'wild'], index: 0 })))
    expect(onTick).toHaveBeenCalledTimes(1)
  })

  it('overwrites the display with the server value and logs when they differ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ref, rerender } = setup()
    act(() => ref.current?.cascadeStep(step()))
    expect(screen.getByText('25/30')).toBeInTheDocument()
    rerender([card('a', 24), cards[1]!, cards[2]!])
    expect(screen.getByText('24/30')).toBeInTheDocument()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn when the server agrees with the display', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ref, rerender } = setup()
    act(() => ref.current?.cascadeStep(step({ removedSymbols: ['wild', 'wild', 'wild'] })))
    rerender([cards[0]!, cards[1]!, card('c', 1, { kind: 'chainLength', symbol: undefined, target: 3, prize: 5 })])
    expect(warn).not.toHaveBeenCalled()
  })

  it('stamps a completed card, then deals the replacement', () => {
    const { rerender, container, onComplete, onDeal } = setup()
    onDeal.mockClear()
    rerender([card('new', 0), cards[1]!, cards[2]!])
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.hub-order-card__stamp')).not.toBeNull()
    expect(screen.getByText('30/30')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector('.hub-order-card__stamp')).toBeNull()
    expect(screen.getByText('0/30')).toBeInTheDocument()
    expect(onDeal).toHaveBeenCalledTimes(1)
  })

  it('deals the cards one by one when the round starts', () => {
    const { rerender, onDeal, container } = setup(cards, false)
    expect(onDeal).not.toHaveBeenCalled()
    rerender(cards, true)
    expect(onDeal).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('.hub-order-card--deal-all')).toHaveLength(3)
  })

  it('keeps the last cards when the server value disappears at the end of the round', () => {
    const { rerender } = setup()
    rerender(null)
    expect(screen.getByText('23/30')).toBeInTheDocument()
  })
})

describe('LadderMeter', () => {
  it('marks the active rung and the reached ones', () => {
    const { container } = render(<LadderMeter ladder={[1, 2, 3, 5, 8, 12, 20]} activeIndex={2} />)
    expect(container.querySelectorAll('.hub-ladder__step')).toHaveLength(7)
    expect(container.querySelectorAll('.hub-ladder__step--reached')).toHaveLength(2)
    expect(container.querySelector('.hub-ladder__step--active')).toHaveTextContent('×3')
    expect(screen.getByRole('img', { name: 'Chain multiplier ×3' })).toBeInTheDocument()
  })

  it('resets to the first rung', () => {
    const { container } = render(<LadderMeter ladder={[1, 2, 3]} activeIndex={0} />)
    expect(container.querySelector('.hub-ladder__step--active')).toHaveTextContent('×1')
    expect(container.querySelectorAll('.hub-ladder__step--reached')).toHaveLength(0)
  })
})
