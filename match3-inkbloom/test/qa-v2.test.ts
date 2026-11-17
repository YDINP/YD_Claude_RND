import { describe, expect, it } from 'vitest'
import { orderMet, orderProgress, Game } from '../src/core/game'
import { N, W } from '../src/core/constants'
import { hasMatch, hasMove } from '../src/core/match'
import { Rng } from '../src/core/rng'
import {
  BLUE, BRUSH, EMPTY, GREEN, KIND_BUCKET, KIND_COL, KIND_ROW, MUDDY, NO_FLOOR, ORANGE, RED, WATER, YELLOW, makePiece,
  type ClearEvent, type TurnEvent,
} from '../src/core/types'
import { B, cell, clears, makeGame, paintFloor, rowCells } from './helpers'

const sorted = (a: number[]): number[] => [...a].sort((x, y) => x - y)
function cleanGame(over: Record<string, number>): Game {
  const g = makeGame()
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) g.pieces[cell(r, c)] = r % 2 === 0 ? 2 + (c % 2) : c % 2
  for (const [k, v] of Object.entries(over)) {
    const [r, c] = k.split(',').map(Number) as [number, number]
    g.pieces[cell(r, c)] = v
  }
  return g
}
const validPiece = (v: number): boolean => v === BRUSH || (v >= 0 && v < 16)

describe('QA v2: 특수 방울 우선순위 붓 > 물감 통 > 줄 방울', () => {
  it('직선 5 + 직각 3 -> 붓(물감 통 아님)', () => {
    const g = makeGame({
      '7,0': RED, '7,1': RED, '7,3': RED, '7,4': RED, '6,2': RED, '7,2': YELLOW, '6,4': RED, '5,4': RED,
    })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.groups[0]!.maxRun).toBe(5)
    expect(ev.created).toEqual([{ cell: cell(7, 2), piece: B }])
  })
  it('직선 4 + 직각 3 -> 물감 통(줄 방울 아님)', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,3': RED, '6,2': RED, '7,2': YELLOW, '6,3': RED, '5,3': RED })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.groups[0]!.maxRun).toBe(4)
    expect(ev.created).toEqual([{ cell: cell(7, 2), piece: makePiece(RED, KIND_BUCKET) }])
  })
  it('십자(+) -> 물감 통', () => {
    const g = cleanGame({ '3,0': YELLOW, '3,1': RED, '3,2': RED, '3,3': YELLOW, '3,4': RED, '2,2': RED, '4,2': RED, '1,2': WATER, '5,2': WATER })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.groups[0]!.cells).toHaveLength(5)
    expect(ev.created.map((c) => c.piece)).toEqual([makePiece(RED, KIND_BUCKET)])
  })
  it('한 스왑으로 서로 다른 두 그룹 4줄 -> 줄 방울 2개, 각자 색 유지', () => {
    const g = cleanGame({
      '3,0': RED, '3,1': RED, '3,2': RED, '3,4': RED, '3,3': YELLOW, '3,5': YELLOW, '3,6': YELLOW, '3,7': YELLOW,
    })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.created).toEqual([
      { cell: cell(3, 3), piece: makePiece(RED, KIND_COL) },
      { cell: cell(3, 4), piece: makePiece(YELLOW, KIND_COL) },
    ])
  })
})

describe('QA v2: 특수 발동 범위·섞기·휘말림', () => {
  it('줄 방울 발동 줄 + 휘말린 특수 모두 1회씩(중복 없음)', () => {
    const g = makeGame({
      '7,0': makePiece(RED, KIND_ROW), '7,1': RED, '7,2': YELLOW, '6,2': RED,
      '7,5': makePiece(BLUE, KIND_BUCKET), '7,6': makePiece(YELLOW, KIND_COL), '2,6': makePiece(BLUE, KIND_BUCKET),
    })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    const ats = ev.fires.map((f) => f.at)
    expect(new Set(ats).size).toBe(ats.length)
    expect(sorted(ats)).toEqual(sorted([cell(7, 0), cell(7, 5), cell(7, 6), cell(2, 6)]))
    const col = ev.fires.find((f) => f.at === cell(7, 6))!
    expect(col.cells).toHaveLength(8)
    expect(col.color).toBe(YELLOW)
  })
  it('줄 방울 섞기: 빨강 위 노랑 -> 주황, 주황 위 노랑 -> 탁함(base 유지), 무색 -> 노랑', () => {
    const g = makeGame({ '7,0': makePiece(YELLOW, KIND_ROW), '7,1': YELLOW, '7,2': RED, '6,2': YELLOW })
    paintFloor(g, [cell(7, 3)], RED)
    paintFloor(g, [cell(7, 4)], ORANGE, RED)
    paintFloor(g, [cell(7, 5)], GREEN, BLUE)
    paintFloor(g, [cell(7, 6)], MUDDY, RED)
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    const at = (c: number) => ev.stains.find((s) => s.cell === cell(7, c))!
    expect(at(3)).toMatchObject({ to: ORANGE, base: RED })
    expect(at(4)).toMatchObject({ to: MUDDY, base: RED })
    expect(at(5)).toMatchObject({ to: MUDDY })
    expect(at(6)).toMatchObject({ to: MUDDY })
    expect(at(7)).toMatchObject({ to: YELLOW, base: YELLOW })
  })
  it('물감 통: 판 안쪽 9칸, 가장자리 6칸', () => {
    const g = makeGame({ '4,4': makePiece(RED, KIND_BUCKET), '4,5': RED, '4,6': YELLOW, '3,6': RED })
    const ev = clears(g.trySwap(cell(3, 6), cell(4, 6)).events)[0]!
    expect(ev.fires[0]!.cells).toHaveLength(9)
    const g2 = makeGame({ '7,3': makePiece(RED, KIND_BUCKET), '7,4': RED, '7,5': YELLOW, '6,5': RED })
    const ev2 = clears(g2.trySwap(cell(6, 5), cell(7, 5)).events)[0]!
    expect(ev2.fires[0]!.cells).toHaveLength(6)
  })
  it('줄 방울은 번짐 없음(발동 칸만 칠함, src=brush)', () => {
    const g = makeGame({ '7,0': makePiece(RED, KIND_COL), '7,1': RED, '7,2': YELLOW, '6,2': RED })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.stains.filter((s) => s.src === 'spread')).toHaveLength(0)
  })
  it('붓 + 일반: 번짐 없음, 붓 + 줄 방울: 둘 다 발동 후 스왑 이동 1 소모', () => {
    const g = makeGame({ '3,3': B, '3,4': makePiece(YELLOW, KIND_COL) }, { moves: 5 })
    const res = g.trySwap(cell(3, 3), cell(3, 4))
    expect(res.movesLeft).toBe(4)
    const ev = clears(res.events)[0]!
    expect(ev.fires).toHaveLength(2)
    expect(ev.stains.some((s) => s.src === 'spread')).toBe(false)
  })
})

describe('QA v2: 연쇄 보너스·주문 통합 불변식', () => {
  it('특수 방울을 심은 3000턴 퍼즈: 이벤트·점수·주문·미리보기 일관', () => {
    const rng = new Rng(77)
    let g = new Game(3, 0)
    let luckySeen = 0
    let fireSeen = 0
    let previewChecked = 0
    let wins = 0
    for (let t = 0; t < 3000; t++) {
      if (g.status !== 'playing') {
        if (g.status === 'win') wins++
        g = new Game(t + 1, t % 10)
      }
      for (let k = 0; k < 2; k++) {
        if (rng.int(3) !== 0) continue
        const at = rng.int(N)
        const keep = g.pieces[at]!
        const kinds = [makePiece(rng.int(4), 1 + rng.int(3)), BRUSH]
        g.pieces[at] = kinds[rng.int(10) === 0 ? 1 : 0]!
        if (hasMatch(g.pieces)) g.pieces[at] = keep
      }
      const all: [number, number][] = []
      for (let i = 0; i < N; i++) {
        if (i % W < W - 1) all.push([i, i + 1])
        if (i < N - W) all.push([i, i + W])
      }
      const [a, b] = all[rng.int(all.length)]!
      const before = g.clone()
      const pv = g.previewSwap(a, b)
      expect(g.snapshot()).toEqual(before.snapshot())
      const res = g.trySwap(a, b)
      const evs: TurnEvent[] = res.events
      const first = clears(evs)[0]
      expect(pv).toEqual(first ? first.stains : null)
      if (pv) previewChecked++
      expect(g.pieces.every(validPiece)).toBe(true)
      expect(g.pieces.includes(EMPTY)).toBe(false)

      const valid = evs[0]?.k === 'swap' && evs[0].valid
      if (!valid) {
        expect(g.movesLeft).toBe(before.movesLeft)
        expect(g.score).toBe(before.score)
        continue
      }
      expect(g.movesLeft).toBe(before.movesLeft - 1)
      const cs = clears(evs)
      expect(cs.map((c) => c.chain)).toEqual(cs.map((_, i) => i + 1))
      let pts = 0
      for (const ev of cs) {
        pts += ev.points
        checkClear(ev)
        luckySeen += ev.lucky
        fireSeen += ev.fires.length
        if (ev.chain === 1) expect(ev.lucky).toBe(0)
      }
      const end = evs[evs.length - 1] as Extract<TurnEvent, { k: 'end' }>
      expect(end.k).toBe('end')
      expect(evs.filter((e) => e.k === 'end')).toHaveLength(1)
      expect(end.progress).toEqual(orderProgress(g.floor, g.order))
      expect(g.score).toBe(before.score + pts + end.bonus)
      if (end.result === 'win') {
        expect(orderMet(end.progress)).toBe(true)
        expect(end.bonus).toBe(g.movesLeft * 100)
      } else {
        expect(orderMet(end.progress)).toBe(false)
        expect(end.bonus).toBe(0)
        if (end.result === 'lose') expect(g.movesLeft).toBe(0)
        else {
          expect(hasMatch(g.pieces)).toBe(false)
          expect(hasMove(g.pieces)).toBe(true)
        }
      }
      for (let i = 0; i < N; i++) {
        const f = g.floor[i]!
        const b0 = g.base[i]!
        expect(f >= NO_FLOOR && f <= MUDDY).toBe(true)
        expect(f === NO_FLOOR).toBe(b0 === NO_FLOOR)
        if (f >= RED && f <= BLUE) expect(b0).toBe(f)
        if (f >= ORANGE && f <= 5) expect(b0 >= RED && b0 <= BLUE).toBe(true)
      }
    }
    expect(luckySeen).toBeGreaterThan(0)
    expect(fireSeen).toBeGreaterThan(30)
    expect(previewChecked).toBeGreaterThan(100)
    expect(wins).toBeGreaterThanOrEqual(0)
  })
})

function checkClear(ev: ClearEvent): void {
  const ats = ev.fires.map((f) => f.at)
  expect(new Set(ats).size).toBe(ats.length)
  expect(new Set(ev.cleared).size).toBe(ev.cleared.length)
  expect(new Set(ev.stains.map((s) => s.cell)).size).toBe(ev.stains.length)
  for (const c of ev.created) expect(ev.cleared.includes(c.cell)).toBe(false)
  for (const f of ev.fires) {
    for (const c of f.cells) expect(c >= 0 && c < N).toBe(true)
    for (const c of f.cells) expect(ev.cleared.includes(c) || ev.created.some((x) => x.cell === c)).toBe(true)
    expect([8, 15, 4, 6, 9]).toContain(f.cells.length)
  }
  for (const grp of ev.groups) for (const c of grp.cells) expect(ev.cleared.includes(c) || ev.created.some((x) => x.cell === c)).toBe(true)
}

describe('QA v2: WATER 상수와 특수', () => {
  it('물 줄 방울 조각값 = 종류*4+3', () => {
    expect(makePiece(WATER, KIND_ROW)).toBe(7)
    expect(makePiece(WATER, KIND_BUCKET)).toBe(15)
    expect(rowCells(0)).toHaveLength(8)
  })
})
