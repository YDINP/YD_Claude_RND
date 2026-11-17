import { describe, expect, it } from 'vitest'
import { COLORS, MAX_CHAIN, N } from '../src/core/constants'
import { Game, orderMet } from '../src/core/game'
import { LEVELS } from '../src/core/levels'
import { hasMatch, hasMove } from '../src/core/match'
import { Rng } from '../src/core/rng'
import { BRUSH, EMPTY, KIND_BUCKET, NO_FLOOR, isColored, makePiece, type ClearEvent, type TurnEvent } from '../src/core/types'
import { allPairs, clears } from './helpers'

const validPiece = (v: number): boolean => v === BRUSH || isColored(v)

function checkClear(ev: ClearEvent): void {
  const ats = ev.fires.map((f) => f.at)
  expect(new Set(ats).size).toBe(ats.length)
  expect(new Set(ev.cleared).size).toBe(ev.cleared.length)
  expect(new Set(ev.stains.map((s) => s.cell)).size).toBe(ev.stains.length)
  expect(ev.chain).toBeLessThan(MAX_CHAIN)
  for (const c of ev.created) expect(ev.cleared.includes(c.cell)).toBe(false)
  for (const f of ev.fires) for (const c of f.cells) expect(ev.cleared.includes(c) || ev.created.some((x) => x.cell === c)).toBe(true)
  for (const s of ev.stains) expect(s.to >= 0 && s.to < COLORS).toBe(true)
  expect(ev.collected).toHaveLength(COLORS)
}

describe('퍼즈: 특수 방울을 심은 3000턴', () => {
  it('이벤트·수·주문·바닥 일관', () => {
    const rng = new Rng(77)
    const pairs = allPairs()
    let g = new Game(3, 0)
    let mixes = 0
    let fires = 0
    let wins = 0
    for (let t = 0; t < 3000; t++) {
      if (g.status !== 'playing') {
        if (g.status === 'win') wins++
        g = new Game(t + 1, t % LEVELS.length)
      }
      if (rng.int(3) === 0) {
        const at = rng.int(N)
        const keep = g.pieces[at]!
        g.pieces[at] = rng.int(10) === 0 ? BRUSH : makePiece(rng.int(COLORS), 1 + rng.int(KIND_BUCKET))
        if (hasMatch(g.pieces)) g.pieces[at] = keep
      }
      const [a, b] = pairs[rng.int(pairs.length)]!
      const before = g.clone()
      const evs: TurnEvent[] = g.trySwap(a, b).events
      expect(g.pieces.every(validPiece)).toBe(true)
      expect(g.pieces.includes(EMPTY)).toBe(false)
      expect(g.floor.every((f) => f >= NO_FLOOR && f < COLORS)).toBe(true)
      const valid = evs[0]?.k === 'swap' && evs[0].valid
      if (!valid) {
        expect(g.snapshot()).toEqual(before.snapshot())
        continue
      }
      expect(g.movesLeft).toBe(before.movesLeft - 1)
      if (evs[1]?.k === 'mix') {
        mixes++
        expect(g.mixes).toBe(before.mixes + 1)
      }
      const cs = clears(evs)
      expect(cs.map((c) => c.chain)).toEqual(cs.map((_, i) => i + 1))
      let pts = 0
      for (const ev of cs) {
        pts += ev.points
        fires += ev.fires.length
        checkClear(ev)
      }
      const end = evs[evs.length - 1] as Extract<TurnEvent, { k: 'end' }>
      expect(end.k).toBe('end')
      expect(evs.filter((e) => e.k === 'end')).toHaveLength(1)
      expect(end.progress).toEqual(g.progress())
      expect(g.score).toBe(before.score + pts + end.bonus)
      if (end.result === 'win') {
        expect(orderMet(end.progress)).toBe(true)
        expect(end.bonus).toBe(g.movesLeft * 100)
        expect(end.stars).toBeGreaterThanOrEqual(1)
      } else {
        expect(orderMet(end.progress)).toBe(false)
        if (end.result === 'lose') expect(g.movesLeft).toBe(0)
        else {
          expect(hasMatch(g.pieces)).toBe(false)
          expect(hasMove(g.pieces)).toBe(true)
        }
      }
    }
    expect(mixes).toBeGreaterThan(50)
    expect(fires).toBeGreaterThan(30)
    expect(wins).toBeGreaterThanOrEqual(0)
  })
})
