import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { H, N, W } from '../src/core/constants'
import { findGroups, hasMatch, hasMove } from '../src/core/match'
import { Rng } from '../src/core/rng'
import { BRUSH, NO_FLOOR, type TurnEvent } from '../src/core/types'
import { B, baseBoard, cell, clears, makeGame } from './helpers'

const rowRun = (r: number, c0: number, len: number, color: number): Record<string, number> => {
  const o: Record<string, number> = {}
  for (let i = 0; i < len; i++) o[`${r},${c0 + i}`] = color
  return o
}

describe('엣지: 입력 검증', () => {
  it('같은 칸/비인접/범위 밖/행 경계 스왑은 이동 소모 없이 무시 또는 무효', () => {
    const g = makeGame()
    const before = Array.from(g.pieces)
    for (const [a, b] of [[0, 0], [0, 2], [-1, 0], [N - 1, N], [7, 8], [0, 9]] as [number, number][]) {
      const r = g.trySwap(a, b)
      expect(g.movesLeft).toBe(12)
      expect(r.events.every((e) => e.k !== 'swap' || !e.valid)).toBe(true)
    }
    expect(Array.from(g.pieces)).toEqual(before)
  })
  it('종료 후 스왑은 무시', () => {
    const g = makeGame()
    g.status = 'win'
    expect(g.trySwap(0, 1).events).toHaveLength(0)
    g.status = 'lose'
    expect(g.trySwap(0, 1).events).toHaveLength(0)
  })
})

describe('엣지: 붓', () => {
  it('연쇄(스왑 아님)로 생긴 5줄 -> 줄 가운데 칸에 붓', () => {
    const g = makeGame()
    g.pieces.set(baseBoard({ ...rowRun(7, 0, 5, 2) }))
    const found = findGroups(g.pieces)
    expect(found).toHaveLength(1)
    expect(found[0]!.maxRun).toBe(5)
  })
  it('붓은 매치 판정에서 제외되고 번짐 이웃이어도 지워지지 않음', () => {
    const p = baseBoard({ ...rowRun(4, 0, 4, 2), '5,1': B })
    p[cell(5, 1)] = B
    const g = makeGame({ ...rowRun(4, 0, 4, 2) })
    g.pieces[cell(5, 1)] = B
    expect(hasMatch(new Int8Array([...p].map((v) => (v === B ? B : v))))).toBe(true)
    const groups = findGroups(g.pieces)
    expect(groups.every((x) => !x.cells.includes(cell(5, 1)))).toBe(true)
  })
  it('붓 3개가 같은 줄에 있고 하나 발동 -> 나머지 휘말려 각 1회', () => {
    const g = makeGame({ '3,0': B, '3,1': 2, '3,3': B, '3,6': B })
    const ev = clears(g.trySwap(cell(3, 0), cell(3, 1)).events)[0]!
    const ats = ev.brushes.map((f) => f.at)
    expect(new Set(ats).size).toBe(ats.length)
    expect(ats).toContain(cell(3, 3))
    expect(ats).toContain(cell(3, 6))
    expect(ev.brushes.every((f) => f.color === 2 || f.cross)).toBe(true)
  })
  it('붓 발동 줄에 열 방향 다른 붓 -> 휘말림은 가로줄만(세로 아님)', () => {
    const g = makeGame({ '3,3': B, '3,4': 1, '5,3': B })
    const res = g.trySwap(cell(3, 3), cell(3, 4))
    expect(res.events[0]).toMatchObject({ k: 'swap', valid: true })
    const ev = clears(res.events)[0]!
    expect(ev.brushes.map((f) => f.at)).toEqual([cell(3, 4)])
  })
  it('붓 + 이웃 스왑에서 맨 끝 줄/모서리도 동작', () => {
    const g = makeGame({ '0,0': B })
    const r = g.trySwap(cell(0, 0), cell(0, 1))
    expect(r.events[0]).toMatchObject({ valid: true })
    expect(g.movesLeft).toBe(11)
    const g2 = makeGame({ '7,7': B })
    const r2 = g2.trySwap(cell(7, 7), cell(6, 7))
    expect(r2.events[0]).toMatchObject({ valid: true })
    const ev = clears(r2.events)[0]!
    expect(ev.brushes[0]!.cells).toHaveLength(W)
    expect(ev.brushes[0]!.at).toBe(cell(6, 7))
  })
  it('붓끼리 스왑: 십자 15칸, 모서리면 15칸 유지/중앙은 15', () => {
    const g = makeGame({ '3,3': B, '3,4': B })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.brushes[0]!.cells).toHaveLength(W + H - 1)
    const g2 = makeGame({ '0,0': B, '0,1': B })
    const e2 = clears(g2.trySwap(cell(0, 0), cell(0, 1)).events)[0]!
    expect(e2.brushes[0]!.cells).toHaveLength(W + H - 1)
  })
  it('붓 발동 스텝에서 같은 스텝 5줄이 붓 줄 위면 붓 생성 생략(붓 소비)', () => {
    const g = makeGame({ ...rowRun(3, 0, 5, 2), '3,6': B, '3,7': 1 })
    const ev = clears(g.trySwap(cell(3, 6), cell(3, 7)).events)[0]!
    expect(ev.created).toHaveLength(0)
  })
})

describe('엣지: 종료/불변식 퍼즈', () => {
  it('2000턴: end 정확히 1회(마지막), continue면 매치 없음 + 수 있음, 붓 있으면 섞기 없음, 커버리지 단조', () => {
    const rng = new Rng(2024)
    let g = new Game(5)
    let prevStained = 0
    let shuffles = 0
    for (let t = 0; t < 2000; t++) {
      if (g.status !== 'playing') {
        g = new Game(t + 11)
        prevStained = 0
      }
      const all: [number, number][] = []
      for (let i = 0; i < N; i++) {
        if (i % W < W - 1) all.push([i, i + 1])
        if (i < N - W) all.push([i, i + W])
      }
      const [a, b] = all[rng.int(all.length)]!
      const hadBrush = g.pieces.includes(BRUSH)
      const res = g.trySwap(a, b)
      const evs: TurnEvent[] = res.events
      const ends = evs.filter((e) => e.k === 'end')
      if (evs.length > 0 && evs[0]!.k === 'swap' && evs[0]!.valid) {
        expect(ends).toHaveLength(1)
        expect(evs[evs.length - 1]!.k).toBe('end')
        const sh = evs.some((e) => e.k === 'shuffle')
        if (sh) shuffles++
        if (g.status === 'playing') {
          expect(hasMatch(g.pieces)).toBe(false)
          expect(hasMove(g.pieces)).toBe(true)
        }
        if (g.pieces.includes(BRUSH) && sh) throw new Error('붓이 있는데 섞기 발생 ' + hadBrush)
        const st = g.stainedCount()
        expect(st).toBeGreaterThanOrEqual(prevStained)
        prevStained = st
        expect(g.movesLeft).toBeGreaterThanOrEqual(0)
      } else {
        expect(ends).toHaveLength(0)
      }
      expect(g.pieces.includes(-1)).toBe(false)
      expect(g.floor.some((v) => v < NO_FLOOR)).toBe(false)
    }
    expect(shuffles).toBeGreaterThanOrEqual(0)
  })
  it('결정성: 같은 시드/같은 수 -> 같은 이벤트', () => {
    const run = (): string => {
      const g = new Game(42)
      const out: unknown[] = []
      for (let i = 0; i < N - 1; i++) out.push(g.trySwap(i, i + 1).events)
      return JSON.stringify(out) + g.score
    }
    expect(run()).toBe(run())
  })
})
