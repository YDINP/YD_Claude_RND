import { describe, expect, it } from 'vitest'
import { mix, wash } from '../src/core/color'
import { Game } from '../src/core/game'
import { H, MAX_CHAIN, N, W } from '../src/core/constants'
import { findGroups, hasMatch, hasMove } from '../src/core/match'
import { reshuffle } from '../src/core/moves'
import { Rng } from '../src/core/rng'
import { stepPoints } from '../src/core/score'
import { paint, planStains } from '../src/core/stain'
import {
  BLUE, GREEN, KIND_BUCKET, KIND_COL, KIND_ROW, MUDDY, NO_FLOOR, ORANGE, PURPLE, RED, WATER, YELLOW, makePiece,
  type TurnEvent,
} from '../src/core/types'
import { B, allCells, baseBoard, cell, clears, colCells, makeGame, paintFloor, rowCells } from './helpers'

const empty = (): Int8Array => new Int8Array(N).fill(NO_FLOOR)
const sorted = (a: number[]): number[] => [...a].sort((x, y) => x - y)

describe('1. 섞기·씻기 표', () => {
  it('mix 전 경우', () => {
    for (const c of [RED, YELLOW, BLUE]) {
      expect(mix(NO_FLOOR, c)).toBe(c)
      expect(mix(c, c)).toBe(c)
      for (const f of [ORANGE, GREEN, PURPLE, MUDDY]) expect(mix(f, c)).toBe(MUDDY)
    }
    expect([mix(RED, YELLOW), mix(YELLOW, RED)]).toEqual([ORANGE, ORANGE])
    expect([mix(YELLOW, BLUE), mix(BLUE, YELLOW)]).toEqual([GREEN, GREEN])
    expect([mix(RED, BLUE), mix(BLUE, RED)]).toEqual([PURPLE, PURPLE])
  })
  it('wash 전 경우 + base 되돌리기', () => {
    expect(wash(MUDDY, RED)).toBe(NO_FLOOR)
    expect(wash(ORANGE, YELLOW)).toBe(YELLOW)
    expect(wash(GREEN, BLUE)).toBe(BLUE)
    expect(wash(PURPLE, RED)).toBe(RED)
    expect(wash(RED, RED)).toBe(NO_FLOOR)
    expect(wash(NO_FLOOR, NO_FLOOR)).toBe(NO_FLOOR)
    expect(paint(NO_FLOOR, NO_FLOOR, RED)).toEqual({ to: RED, base: RED })
    expect(paint(RED, RED, YELLOW)).toEqual({ to: ORANGE, base: RED })
    expect(paint(ORANGE, RED, WATER)).toEqual({ to: RED, base: RED })
    expect(paint(RED, RED, WATER)).toEqual({ to: NO_FLOOR, base: NO_FLOOR })
    expect(paint(MUDDY, BLUE, WATER)).toEqual({ to: NO_FLOOR, base: NO_FLOOR })
  })
})

describe('2. 번짐은 무색 칸에만', () => {
  it('이미 물든 이웃은 그대로', () => {
    const floor = empty()
    const base = empty()
    floor[cell(2, 4)] = base[cell(2, 4)] = YELLOW
    const g = { color: RED, cells: [cell(3, 3), cell(3, 4), cell(3, 5), cell(3, 6)], maxRun: 4, spread: 1 as const }
    const res = planStains(floor, base, [g], [])
    expect(res.find((s) => s.cell === cell(2, 4))).toBeUndefined()
    expect(res.find((s) => s.cell === cell(2, 3))).toMatchObject({ to: RED, base: RED, src: 'spread' })
  })
  it('판 밖으로 안 나감', () => {
    const corner = planStains(empty(), empty(), [{ color: 1, cells: [cell(0, W - 1)], maxRun: 5, spread: 2 }], [])
    expect(sorted(corner.map((s) => s.cell))).toEqual([cell(0, W - 2), cell(0, W - 1), cell(1, W - 2), cell(1, W - 1)])
  })
})

describe('3. 물 매치', () => {
  it('씻기만 하고 번짐 없음', () => {
    const g = makeGame({ '6,0': WATER, '6,1': WATER, '7,2': WATER })
    paintFloor(g, allCells(), ORANGE, RED)
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.groups[0]!.color).toBe(WATER)
    expect(ev.stains.every((s) => s.src === 'clear' && s.to === RED)).toBe(true)
    expect(ev.stains).toHaveLength(ev.groups[0]!.cells.length)
  })
})

describe('4. 붓', () => {
  it('붓+노랑 on 빨강 줄 -> 주황 줄, 이동 -1', () => {
    const g = makeGame({ '3,3': B, '3,4': YELLOW })
    const moves = g.movesLeft
    paintFloor(g, rowCells(3), RED)
    const res = g.trySwap(cell(3, 3), cell(3, 4))
    expect(res.events[0]).toEqual({ k: 'swap', a: cell(3, 3), b: cell(3, 4), valid: true })
    expect(res.movesLeft).toBe(moves - 1)
    const row = clears(res.events)[0]!.stains.filter((s) => s.src === 'brush')
    expect(row).toHaveLength(8)
    expect(row.every((s) => s.to === ORANGE && s.base === RED)).toBe(true)
  })
  it('붓+물 -> 줄 씻기', () => {
    const g = makeGame({ '3,5': B, '3,6': WATER })
    paintFloor(g, rowCells(3), PURPLE, BLUE)
    const row = clears(g.trySwap(cell(3, 5), cell(3, 6)).events)[0]!.stains.filter((s) => s.src === 'brush')
    expect(row).toHaveLength(8)
    expect(row.every((s) => s.to === BLUE)).toBe(true)
  })
  it('붓+붓 -> 십자 씻기', () => {
    const g = makeGame({ '3,3': B, '3,4': B })
    paintFloor(g, allCells(), RED)
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.fires[0]!.shape).toBe('cross')
    expect(ev.fires[0]!.cells).toHaveLength(W + H - 1)
    expect(ev.stains.filter((s) => s.src === 'brush').every((s) => s.to === NO_FLOOR && s.base === NO_FLOOR)).toBe(true)
  })
  it('휘말린 붓은 줄 색 상속, 붓마다 1회', () => {
    const g = makeGame({ '3,3': B, '3,4': B, '6,4': B })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.fires).toHaveLength(2)
    expect(ev.fires.find((f) => f.at === cell(6, 4))).toMatchObject({ color: WATER, shape: 'row' })
  })
})

describe('5. 같은 스텝 우선순위', () => {
  it('터진 칸 > 붓 줄 > 번짐, 긴 maxRun 우선, 결정적', () => {
    const a = { color: RED, cells: [cell(3, 3), cell(3, 4), cell(3, 5)], maxRun: 3, spread: 1 as const }
    const b = { color: BLUE, cells: [cell(2, 4), cell(2, 5), cell(2, 6), cell(2, 7)], maxRun: 4, spread: 1 as const }
    const f = { at: cell(5, 0), color: YELLOW, cells: rowCells(4), shape: 'row' as const, brush: true }
    const res = planStains(empty(), empty(), [a, b], [f])
    const at = (c: number) => res.find((s) => s.cell === c)!
    expect(at(cell(3, 4)).to).toBe(RED)
    expect(at(cell(2, 4)).to).toBe(BLUE)
    expect(at(cell(3, 6)).to).toBe(BLUE)
    expect(at(cell(4, 4))).toMatchObject({ to: YELLOW, src: 'brush' })
    expect(planStains(empty(), empty(), [a, b], [f])).toEqual(res)
  })
  it('같은 시드 같은 결과', () => {
    const play = (): string => {
      const g = new Game(42, 3)
      const out: TurnEvent[] = []
      for (let i = 0; i < N; i++) for (const d of [1, W]) if (i + d < N) out.push(...g.trySwap(i, i + d).events)
      return JSON.stringify(out) + JSON.stringify(g.snapshot())
    }
    expect(play()).toBe(play())
  })
})

describe('6. 점수와 연쇄 섞임 보너스', () => {
  const st = (from: number, to: number) => ({ cell: 0, from, to, base: RED, src: 'clear' as const })
  it('새 2차색 30, 연쇄 2부터 칸당 +20', () => {
    expect(stepPoints([st(RED, ORANGE)], [0], 1)).toEqual({ points: 30, lucky: 0 })
    expect(stepPoints([st(RED, ORANGE)], [0], 2)).toEqual({ points: 75, lucky: 1 })
  })
  it('터짐 10 / 같은 색 15 / 탁해짐 0', () => {
    expect(stepPoints([st(NO_FLOOR, RED)], [0], 1).points).toBe(10)
    expect(stepPoints([st(RED, RED)], [0], 1).points).toBe(15)
    expect(stepPoints([st(ORANGE, MUDDY)], [0], 1).points).toBe(0)
  })
})

describe('7. 주문 판정', () => {
  const redRow = { '6,1': RED }
  it('end 는 연쇄 뒤 맨 끝 1회', () => {
    const res = makeGame(redRow).trySwap(cell(6, 2), cell(7, 2))
    expect(res.events.filter((e) => e.k === 'end')).toHaveLength(1)
    expect(res.events[res.events.length - 1]!.k).toBe('end')
  })
  it('채우면 win + 남은 이동 보너스', () => {
    const g = makeGame(redRow, { moves: 3 })
    paintFloor(g, [...rowCells(0), cell(1, 0)], RED)
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    expect(res.events[res.events.length - 1]).toMatchObject({ k: 'end', result: 'win', bonus: 200 })
    expect(g.status).toBe('win')
    expect(g.trySwap(0, 1).events).toEqual([])
  })
  it('턴 전엔 채워져 있어도 덧칠로 줄면 미달 -> 마지막 이동이면 lose', () => {
    const g = makeGame({ '6,0': YELLOW, '7,2': YELLOW }, { moves: 1 })
    paintFloor(g, [cell(6, 0), cell(6, 1), cell(6, 2), ...rowCells(0), cell(1, 0)], RED)
    expect(g.progress()[0]).toMatchObject({ color: RED, have: 12, need: 12 })
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    expect(res.events[res.events.length - 1]).toMatchObject({ k: 'end', result: 'lose' })
    expect(g.progress()[0]!.have).toBeLessThan(12)
  })
})

describe('8. previewSwap', () => {
  it('실제 첫 스텝과 일치, 상태 불변', () => {
    let checked = 0
    for (let seed = 0; seed < 20; seed++) {
      const g = new Game(seed, 5)
      paintFloor(g, [seed % N, (seed * 7) % N], RED)
      for (let i = 0; i < N; i++) {
        for (const d of [1, W]) {
          if (i + d >= N || (d === 1 && i % W === W - 1)) continue
          const before = JSON.stringify(g.snapshot()) + g.rng.state
          const pv = g.previewSwap(i, i + d)
          expect(JSON.stringify(g.snapshot()) + g.rng.state).toBe(before)
          const first = clears(g.clone().trySwap(i, i + d).events)[0]
          expect(pv).toEqual(first ? first.stains : null)
          if (pv) checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(20)
  })
})

describe('9. 특수 방울 생성', () => {
  it('가로 4 -> 세로줄 방울(색 유지), 들어온 칸', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '7,3': RED, '6,2': RED })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(7, 2), piece: makePiece(RED, KIND_COL) }])
  })
  it('세로 4 -> 가로줄 방울', () => {
    const g = makeGame({ '4,0': YELLOW, '5,0': YELLOW, '6,0': 2, '7,0': YELLOW, '6,1': YELLOW })
    const ev = clears(g.trySwap(cell(6, 0), cell(6, 1)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(6, 0), piece: makePiece(YELLOW, KIND_ROW) }])
  })
  it('L -> 물감 통', () => {
    const g = makeGame({ '7,0': RED, '7,1': WATER, '6,1': RED, '5,0': RED, '4,0': YELLOW })
    const ev = clears(g.trySwap(cell(6, 1), cell(7, 1)).events)[0]!
    expect(ev.groups[0]!.cells).toHaveLength(5)
    expect(ev.created).toEqual([{ cell: cell(7, 1), piece: makePiece(RED, KIND_BUCKET) }])
  })
  it('T -> 물감 통', () => {
    const g = makeGame({ '5,1': RED, '6,1': RED, '7,1': RED, '7,0': YELLOW })
    const ev = clears(g.trySwap(cell(6, 0), cell(7, 0)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(7, 0), piece: makePiece(RED, KIND_BUCKET) }])
  })
  it('직선 5 -> 붓', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,3': YELLOW, '7,4': RED, '6,3': RED })
    const ev = clears(g.trySwap(cell(6, 3), cell(7, 3)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(7, 3), piece: B }])
  })
  it('특수 방울도 같은 색 매치에 참여', () => {
    const groups = findGroups(baseBoard({ '7,0': makePiece(RED, KIND_ROW), '7,1': RED }))
    expect(groups).toHaveLength(1)
    expect(groups[0]!.color).toBe(RED)
  })
})

describe('10. 특수 방울 발동', () => {
  it('세로줄 방울: 세로줄 전체 + 그 색으로 섞기', () => {
    const g = makeGame({ '7,0': makePiece(RED, KIND_COL), '7,1': YELLOW, '6,1': RED })
    paintFloor(g, colCells(0), YELLOW)
    const ev = clears(g.trySwap(cell(6, 1), cell(7, 1)).events)[0]!
    expect(ev.fires).toHaveLength(1)
    expect(ev.fires[0]).toMatchObject({ at: cell(7, 0), shape: 'col', color: RED })
    expect(sorted(ev.fires[0]!.cells)).toEqual(colCells(0))
    for (const c of colCells(0)) expect(ev.stains.find((s) => s.cell === c)!.to).toBe(ORANGE)
  })
  it('물감 통: 3x3, 판 모서리면 4칸', () => {
    const g = makeGame({ '7,0': makePiece(RED, KIND_BUCKET), '7,1': YELLOW, '6,1': RED })
    const ev = clears(g.trySwap(cell(6, 1), cell(7, 1)).events)[0]!
    expect(ev.fires[0]!.shape).toBe('box')
    expect(sorted(ev.fires[0]!.cells)).toEqual([cell(6, 0), cell(6, 1), cell(7, 0), cell(7, 1)])
  })
  it('물 줄 방울은 씻기', () => {
    const g = makeGame({ '7,0': makePiece(WATER, KIND_COL), '7,1': WATER, '7,2': YELLOW, '6,2': WATER })
    paintFloor(g, colCells(0), GREEN, BLUE)
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    for (const c of colCells(0)) expect(ev.stains.find((s) => s.cell === c)!.to).toBe(BLUE)
  })
  it('연쇄 휘말림: 특수마다 1회', () => {
    const g = makeGame({
      '7,0': makePiece(RED, KIND_BUCKET), '7,1': RED, '7,2': YELLOW, '6,2': RED,
      '6,1': makePiece(YELLOW, KIND_ROW), '6,5': makePiece(BLUE, KIND_BUCKET),
    })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.fires.map((f) => [f.at, f.shape])).toEqual([[cell(7, 0), 'box'], [cell(6, 1), 'row'], [cell(6, 5), 'box']])
  })
  it('붓 + 특수: 붓 줄 뒤 상대 특수도 발동', () => {
    const g = makeGame({ '3,3': B, '3,4': makePiece(BLUE, KIND_BUCKET) })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.fires.map((f) => [f.at, f.shape, f.color])).toEqual([[cell(3, 4), 'row', BLUE], [cell(3, 3), 'box', BLUE]])
  })
})

describe('11. 기존 규칙', () => {
  it('무효 스왑: 이동 그대로, 판 불변', () => {
    const g = makeGame()
    const before = g.snapshot()
    const res = g.trySwap(cell(2, 2), cell(2, 3))
    expect(res.events).toEqual([{ k: 'swap', a: cell(2, 2), b: cell(2, 3), valid: false }])
    expect(g.snapshot()).toEqual(before)
  })
  it('섞기: 수 없는 판 -> 수 있고 매치 없음, 붓 있으면 안 섞음', () => {
    const p = baseBoard()
    expect(hasMove(p)).toBe(false)
    expect(reshuffle(p, new Rng(3))).not.toBeNull()
    expect(hasMove(p)).toBe(true)
    expect(hasMatch(p)).toBe(false)
    const q = baseBoard({ '2,2': B })
    const copy = Int8Array.from(q)
    expect(reshuffle(q, new Rng(3))).toBeNull()
    expect(q).toEqual(copy)
  })
  it('1000턴 무작위: chain < 50, 빈칸 없음, 바닥·base 일관', () => {
    const rng = new Rng(99)
    let g = new Game(7)
    let valid = 0
    for (let t = 0; t < 1000; t++) {
      if (g.status !== 'playing') g = new Game(t, t % 10)
      const a = rng.int(N)
      const b = rng.int(2) === 0 ? a + 1 : a + W
      const res = g.trySwap(a, b)
      if (res.events[0]?.k === 'swap' && res.events[0].valid) valid++
      for (const ev of clears(res.events)) expect(ev.chain).toBeLessThan(MAX_CHAIN)
      expect(g.pieces.includes(-1)).toBe(false)
      for (let i = 0; i < N; i++) {
        const f = g.floor[i]!
        const b0 = g.base[i]!
        expect(f >= NO_FLOOR && f <= MUDDY).toBe(true)
        expect(f === NO_FLOOR).toBe(b0 === NO_FLOOR)
        if (f >= RED && f <= BLUE) expect(b0).toBe(f)
      }
    }
    expect(valid).toBeGreaterThan(50)
  })
})
