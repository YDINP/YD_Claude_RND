import { describe, expect, it } from 'vitest'
import { DEBUG_PRESETS, presetsFor } from './debugPreset'

const fruit = { scatter: { freeSpins: {} } } as never
const sheriff = { scatter: { freeSpins: {} }, gamble: {} } as never
const classic = {} as never
const candy = { cascade: {}, orderRound: {}, scatter: {} } as never

describe('presetsFor', () => {
  it('keeps all five base presets only when the game has free spins and gamble', () => {
    expect(presetsFor(sheriff)).toEqual(DEBUG_PRESETS)
    expect(presetsFor(null)).toEqual(DEBUG_PRESETS)
  })

  it('drops freeSpins / gamble presets the server would reject with 409', () => {
    const bands = ['winUnder', 'winSmall', 'winGood', 'winGreat']
    expect(presetsFor(fruit)).toEqual(['win', 'bigWin', 'freeSpins', 'lose', ...bands])
    expect(presetsFor(classic)).toEqual(['win', 'bigWin', 'lose', ...bands])
    expect(presetsFor(candy)).not.toContain('gamble')
  })

  it('hides round-entry presets while a round is already running', () => {
    expect(presetsFor(fruit, { inRound: true })).not.toContain('freeSpins')
    const list = presetsFor(candy, { inRound: true })
    expect(list).not.toContain('orderRound')
    expect(list).toContain('orderComplete')
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
