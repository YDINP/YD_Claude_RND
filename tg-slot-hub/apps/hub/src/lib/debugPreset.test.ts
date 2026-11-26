import { describe, expect, it } from 'vitest'
import { DEBUG_PRESETS, presetsFor } from './debugPreset'

const classic = { scatter: { freeSpins: {} } } as never
const candy = { cascade: {}, orderRound: {}, scatter: {} } as never

describe('presetsFor', () => {
  it('keeps the five base presets for ordinary games', () => {
    expect(presetsFor(classic)).toEqual(DEBUG_PRESETS)
    expect(presetsFor(null)).toEqual(DEBUG_PRESETS)
  })

  it('exposes cascade3, orderRound and orderComplete only for the candy math', () => {
    const list = presetsFor(candy)
    expect(list).toEqual(expect.arrayContaining(['cascade3', 'orderRound', 'orderComplete']))
    expect(list).not.toContain('freeSpins')
    for (const preset of ['cascade3', 'orderRound', 'orderComplete'] as const) {
      expect(presetsFor(classic)).not.toContain(preset)
    }
  })

  it('exposes the board presets only for board-bonus math, without freeSpins', () => {
    const hanbok = { boardBonus: {}, scatter: {} } as never
    const list = presetsFor(hanbok)
    expect(list).toEqual(expect.arrayContaining(['boardBonus', 'boardGoal', 'boardTraps', 'boardFork', 'boardBig']))
    expect(list).not.toContain('freeSpins')
    expect(presetsFor(classic)).not.toContain('boardBonus')
    expect(presetsFor(candy)).not.toContain('boardBonus')
  })
})
