import { describe, expect, it } from 'vitest'
import { Game } from '../src/core/game'
import { GOAL_PCT, H, MAX_CHAIN, MOVES, N, W, isGoal } from '../src/core/constants'
import { findGroups, hasMatch, hasMove } from '../src/core/match'
import { reshuffle } from '../src/core/moves'
import { Rng } from '../src/core/rng'
import { stepPoints } from '../src/core/score'
import { planStains } from '../src/core/stain'
import { BRUSH, type TurnEvent } from '../src/core/types'
import { B, baseBoard, cell, clears, makeGame } from './helpers'

const rowRun = (r: number, c0: number, len: number, color: number): Record<string, number> => {
  const o: Record<string, number> = {}
  for (let i = 0; i < len; i++) o[`${r},${c0 + i}`] = color
  return o
}
const colRun = (c: number, r0: number, len: number, color: number): Record<string, number> => {
  const o: Record<string, number> = {}
  for (let i = 0; i < len; i++) o[`${r0 + i},${c}`] = color
  return o
}

const GOAL = Math.ceil((GOAL_PCT * N) / 100)
const safe = (ends: [number, number][]): number => [0, 1, 2, 3, 4].find((c) => ends.every(([r, cc]) => baseBoard()[cell(r, cc)] !== c))!

describe('1. 직선 3/4/5 -> spread 0/1/2', () => {
  for (const [len, spread] of [[3, 0], [4, 1], [5, 2]] as const) {
    it(`가로 ${len}`, () => {
      const g = findGroups(baseBoard(rowRun(3, 1, len, safe([[3, 0], [3, 1 + len]]))))
      expect(g).toHaveLength(1)
      expect(g[0]!.maxRun).toBe(len)
      expect(g[0]!.spread).toBe(spread)
    })
    it(`세로 ${len}`, () => {
      const g = findGroups(baseBoard(colRun(3, 1, len, safe([[0, 3], [1 + len, 3]]))))
      expect(g).toHaveLength(1)
      expect(g[0]!.maxRun).toBe(len)
      expect(g[0]!.spread).toBe(spread)
    })
  }
})

describe('2. L, T, 십자 -> 한 그룹 spread 1', () => {
  it('L', () => {
    const g = findGroups(baseBoard({ ...rowRun(3, 1, 3, 0), ...colRun(1, 3, 3, 0) }))
    expect(g).toHaveLength(1)
    expect(g[0]!.spread).toBe(1)
  })
  it('T', () => {
    const g = findGroups(baseBoard({ ...rowRun(3, 1, 3, 0), ...colRun(2, 3, 3, 0) }))
    expect(g).toHaveLength(1)
    expect(g[0]!.spread).toBe(1)
  })
  it('십자', () => {
    const g = findGroups(baseBoard({ ...rowRun(3, 1, 3, 0), ...colRun(2, 2, 3, 0) }))
    expect(g).toHaveLength(1)
    expect(g[0]!.spread).toBe(1)
  })
})

describe('3. 붓 생성', () => {
  it('직선 6 -> 붓 1개, 들어온 칸에 생성', () => {
    const g = makeGame({ ...rowRun(3, 0, 3, 0), ...rowRun(3, 4, 2, 0), '3,3': 2, '4,3': 0 })
    const ev = clears(g.trySwap(cell(3, 3), cell(4, 3)).events)[0]!
    expect(ev.groups[0]!.maxRun).toBe(6)
    expect(ev.created).toEqual([{ cell: cell(3, 3), piece: BRUSH }])
  })
  it('다른 색 5줄 동시 -> 붓 2개', () => {
    const g = makeGame({ ...rowRun(3, 0, 4, 0), ...rowRun(4, 0, 4, 1), '3,4': 1, '4,4': 0 })
    const ev = clears(g.trySwap(cell(3, 4), cell(4, 4)).events)[0]!
    expect(ev.groups).toHaveLength(2)
    expect(ev.created).toHaveLength(2)
  })
  it('L 모양 5 이상은 붓이 아님', () => {
    const g = findGroups(baseBoard({ ...rowRun(3, 0, 5, 0), ...colRun(0, 3, 3, 0) }))
    expect(g[0]!.mixed).toBe(true)
  })
})

describe('4. 붓 + 일반 스왑', () => {
  it('매치 없어도 유효, 이동 -1, 상대 색으로 한 줄', () => {
    const g = makeGame({ '3,3': B, '3,4': 2 })
    const res = g.trySwap(cell(3, 3), cell(3, 4))
    expect(res.events[0]).toEqual({ k: 'swap', a: cell(3, 3), b: cell(3, 4), valid: true })
    expect(res.movesLeft).toBe(MOVES - 1)
    const ev = clears(res.events)[0]!
    expect(ev.brushes).toHaveLength(1)
    const row = ev.stains.filter((s) => s.src === 'brush')
    expect(row).toHaveLength(8)
    expect(row.every((s) => s.to === 2 && Math.floor(s.cell / W) === 3)).toBe(true)
  })
})

describe('5. 붓끼리 스왑', () => {
  it('십자, 먹색', () => {
    const g = makeGame({ '3,3': B, '3,4': B })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.brushes).toHaveLength(1)
    expect(ev.brushes[0]!.cross).toBe(true)
    expect(ev.brushes[0]!.cells).toHaveLength(W + H - 1)
    expect(ev.stains.filter((s) => s.src === 'brush').every((s) => s.to === 4)).toBe(true)
  })
})

describe('6. 휘말림', () => {
  it('십자 줄 위의 다른 붓이 연쇄 발동, 붓마다 1회', () => {
    const g = makeGame({ '3,3': B, '3,4': B, '6,4': B })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.brushes).toHaveLength(2)
    expect(new Set(ev.brushes.map((f) => f.at)).size).toBe(2)
    const chained = ev.brushes.find((f) => f.at === cell(6, 4))!
    expect(chained.color).toBe(4)
    expect(chained.cross).toBe(false)
  })
  it('같은 줄 붓도 한 번씩만', () => {
    const g = makeGame({ '3,3': B, '3,4': 2, '3,6': B })
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.brushes.map((f) => f.at).sort()).toEqual([cell(3, 4), cell(3, 6)].sort())
  })
})

describe('7. 무효 스왑', () => {
  it('이동 그대로, 판 불변', () => {
    const g = makeGame()
    const before = g.snapshot()
    const res = g.trySwap(cell(2, 2), cell(2, 3))
    expect(res.events).toEqual([{ k: 'swap', a: cell(2, 2), b: cell(2, 3), valid: false }])
    expect(g.snapshot()).toEqual(before)
  })
})

describe('8. 번짐은 판 밖으로 안 나감', () => {
  it('모서리·테두리', () => {
    const corner = planStains(new Int8Array(N).fill(-1), [{ color: 1, cells: [cell(0, W - 1)], maxRun: 5, spread: 2 }], [])
    expect(corner.map((s) => s.cell).sort((a, b) => a - b)).toEqual([cell(0, W - 2), cell(0, W - 1), cell(1, W - 2), cell(1, W - 1)])
    const edge = planStains(new Int8Array(N).fill(-1), [{ color: 1, cells: [cell(3, 0)], maxRun: 4, spread: 1 }], [])
    expect(edge.map((s) => s.cell).sort((a, b) => a - b)).toEqual([cell(2, 0), cell(3, 0), cell(3, 1), cell(4, 0)])
  })
})

describe('9. 겹침 우선순위 결정성', () => {
  it('지운 칸 > 번진 칸, 긴 maxRun 우선', () => {
    const floor = new Int8Array(N).fill(-1)
    const a = { color: 1, cells: [cell(3, 3), cell(3, 4), cell(3, 5)], maxRun: 3, spread: 1 as const }
    const b = { color: 2, cells: [cell(2, 4), cell(2, 5), cell(2, 6), cell(2, 7)], maxRun: 4, spread: 1 as const }
    const res = planStains(floor, [a, b], [])
    const to = (c: number) => res.find((s) => s.cell === c)!.to
    expect(to(cell(3, 4))).toBe(1)
    expect(to(cell(2, 4))).toBe(2)
    expect(to(cell(3, 5))).toBe(1)
    expect(to(cell(3, 6))).toBe(2)
    expect(planStains(floor, [a, b], [])).toEqual(res)
  })
  it('같은 시드 같은 결과', () => {
    const play = (): string => {
      const g = new Game(42)
      const out: TurnEvent[] = []
      for (let i = 0; i < N; i++) for (const d of [1, W]) if (i + d < N) out.push(...g.trySwap(i, i + d).events)
      return JSON.stringify(out) + JSON.stringify(g.snapshot())
    }
    expect(play()).toBe(play())
  })
})

describe('10. x1.5 는 적용 전 바닥 기준', () => {
  it('같은 색 바닥 15점, 연쇄 2는 x1.5', () => {
    const before = new Int8Array(N).fill(-1)
    before[0] = 2
    before[1] = 2
    const stains = [0, 1, 2].map((cell) => ({ cell, from: before[cell]!, to: 2, src: 'clear' as const }))
    expect(stepPoints(before, stains, [0, 1, 2], 1)).toBe(40)
    expect(stepPoints(before, stains, [0, 1, 2], 2)).toBe(60)
    expect(stepPoints(before, stains, [0, 1, 2], 3)).toBe(80)
  })
})

describe('11. 목표와 end 이벤트', () => {
  it('목표 -1칸 미달 / 목표 칸 달성', () => {
    expect(isGoal(GOAL - 1)).toBe(false)
    expect(isGoal(GOAL)).toBe(true)
  })
  it('연쇄 도중 넘어도 end 는 맨 끝 1회', () => {
    const off = Array.from({ length: 26 }, (_, i) => i)
    const g = makeGame({ ...rowRun(3, 0, 2, 0), '3,2': 4, '4,2': 0 }, { floorOff: off, seed: 5 })
    const res = g.trySwap(cell(3, 2), cell(4, 2))
    expect(res.events.filter((e) => e.k === 'end')).toHaveLength(1)
    expect(res.events[res.events.length - 1]!.k).toBe('end')
  })
  it('칸 수 변화 없는 한 수는 미달 유지', () => {
    for (let seed = 0; seed < 200; seed++) {
      const off = Array.from({ length: N - (GOAL - 1) }, (_, i) => i)
      const g = makeGame({ ...rowRun(6, 0, 2, 0), '6,2': 4, '7,2': 0 }, { floorOff: off, seed })
      const res = g.trySwap(cell(6, 2), cell(7, 2))
      if (clears(res.events).length !== 1) continue
      const end = res.events[res.events.length - 1]!
      expect(end).toMatchObject({ k: 'end', result: 'continue', stained: GOAL - 1 })
      return
    }
    throw new Error('단일 연쇄 시드를 찾지 못함')
  })
})

describe('12. 마지막 이동', () => {
  it('달성하면 win, 미달이면 lose', () => {
    const offWin = Array.from({ length: N - GOAL }, (_, i) => i)
    const win = makeGame({ ...rowRun(6, 0, 2, 0), '6,2': 4, '7,2': 0 }, { moves: 1, floorOff: [...offWin, cell(6, 0), cell(6, 1), cell(6, 2)] })
    const wr = win.trySwap(cell(6, 2), cell(7, 2))
    expect(wr.events[wr.events.length - 1]).toMatchObject({ k: 'end', result: 'win' })
    expect(win.status).toBe('win')
    const lose = makeGame({ ...rowRun(6, 0, 2, 0), '6,2': 4, '7,2': 0 }, { moves: 1, floorOff: Array.from({ length: N }, (_, i) => i) })
    const lr = lose.trySwap(cell(6, 2), cell(7, 2))
    expect(lr.events[lr.events.length - 1]).toMatchObject({ k: 'end', result: 'lose' })
    expect(lose.status).toBe('lose')
    expect(lose.trySwap(0, 1).events).toEqual([])
  })
})

describe('13. 섞기', () => {
  it('수 없는 판 -> 섞은 뒤 수 있고 매치 없음', () => {
    const p = baseBoard()
    expect(hasMove(p)).toBe(false)
    const res = reshuffle(p, new Rng(3))
    expect(res).not.toBeNull()
    expect(hasMove(p)).toBe(true)
    expect(hasMatch(p)).toBe(false)
  })
  it('붓이 있으면 섞지 않음', () => {
    const p = baseBoard({ '2,2': B })
    const copy = Int8Array.from(p)
    expect(reshuffle(p, new Rng(3))).toBeNull()
    expect(p).toEqual(copy)
  })
})

describe('14. 1000턴 무작위 플레이', () => {
  it('예외 없음, chain < 50, 빈칸 없음', () => {
    const rng = new Rng(99)
    let g = new Game(7)
    let valid = 0
    for (let t = 0; t < 1000; t++) {
      if (g.status !== 'playing') g = new Game(t)
      const a = rng.int(N)
      const b = rng.int(2) === 0 ? a + 1 : a + W
      const res = g.trySwap(a, b)
      if (res.events[0]?.k === 'swap' && res.events[0].valid) valid++
      for (const ev of clears(res.events)) expect(ev.chain).toBeLessThan(MAX_CHAIN)
      expect(g.pieces.includes(-1)).toBe(false)
      expect(g.floor.every((v) => v >= -1 && v <= 4)).toBe(true)
    }
    expect(valid).toBeGreaterThan(50)
  })
})
