import { describe, expect, it } from 'vitest'
import { decodeFloor, encodeFloor, mergeEntry, parseAlbum } from '../src/core/album'
import { blend } from '../src/core/color'
import { COLORS, N } from '../src/core/constants'
import { Game, starsFor } from '../src/core/game'
import { findHint } from '../src/core/hint'
import { LEVELS, type Level } from '../src/core/levels'
import { findGroups, hasMatch, hasMove } from '../src/core/match'
import { reshuffle } from '../src/core/moves'
import { Rng } from '../src/core/rng'
import {
  BLUE, BRUSH, EMPTY, GREEN, KIND_BUCKET, KIND_COL, KIND_NORMAL, KIND_ROW, NO_FLOOR, ORANGE, PURPLE, RED, YELLOW,
  colorOf, isColored, isSpecial, kindOf, makePiece, type TurnEvent,
} from '../src/core/types'
import { B, allPairs, baseBoard, cell, clears, colCells, makeGame, mixGame, rowCells } from './helpers'

const sorted = (a: number[]): number[] => [...a].sort((x, y) => x - y)

describe('조각 인코딩', () => {
  it('색 6가지 × 종류 4가지 왕복', () => {
    const seen = new Set<number>()
    for (let c = 0; c < COLORS; c++) {
      for (const k of [KIND_NORMAL, KIND_ROW, KIND_COL, KIND_BUCKET]) {
        const p = makePiece(c, k)
        expect(isColored(p)).toBe(true)
        expect(colorOf(p)).toBe(c)
        expect(kindOf(p)).toBe(k)
        expect(isSpecial(p)).toBe(k !== KIND_NORMAL)
        seen.add(p)
      }
    }
    expect(seen.size).toBe(COLORS * 4)
    expect(seen.has(BRUSH)).toBe(false)
  })
  it('붓과 빈칸은 색 없음', () => {
    expect(isColored(BRUSH)).toBe(false)
    expect(isSpecial(BRUSH)).toBe(true)
    expect(colorOf(BRUSH)).toBe(-1)
    expect(isColored(EMPTY)).toBe(false)
  })
  it('원색 섞기 표', () => {
    expect([blend(RED, YELLOW), blend(YELLOW, RED)]).toEqual([ORANGE, ORANGE])
    expect([blend(YELLOW, BLUE), blend(BLUE, YELLOW)]).toEqual([GREEN, GREEN])
    expect([blend(RED, BLUE), blend(BLUE, RED)]).toEqual([PURPLE, PURPLE])
    expect(blend(RED, RED)).toBe(-1)
    expect(blend(RED, ORANGE)).toBe(-1)
  })
})

describe('섞기', () => {
  it('다른 원색 둘, 매치 없음 → 도착 칸에 2차색, 1수 소모', () => {
    const g = mixGame({ '3,3': RED, '3,4': YELLOW })
    const moves = g.movesLeft
    const res = g.trySwap(cell(3, 3), cell(3, 4))
    expect(res.events[0]).toEqual({ k: 'swap', a: cell(3, 3), b: cell(3, 4), valid: true })
    expect(res.events[1]).toEqual({ k: 'mix', from: cell(3, 3), to: cell(3, 4), piece: ORANGE })
    expect(g.pieces[cell(3, 4)]).toBe(ORANGE)
    expect(g.movesLeft).toBe(moves - 1)
    expect(g.mixes).toBe(1)
    expect(res.events.some((e) => e.k === 'fall')).toBe(true)
    expect(res.events.some((e) => e.k === 'refill')).toBe(true)
    expect(g.pieces.includes(EMPTY)).toBe(false)
  })
  it('옮긴 쪽이 기준: 파랑을 빨강 자리로 → 보라가 빨강 자리에', () => {
    const g = mixGame({ '5,1': BLUE, '5,2': RED })
    const res = g.trySwap(cell(5, 2), cell(5, 1))
    expect(res.events[1]).toEqual({ k: 'mix', from: cell(5, 2), to: cell(5, 1), piece: PURPLE })
  })
  it('특수 방울 종류 유지', () => {
    const a = mixGame({ '3,3': makePiece(RED, KIND_ROW), '3,4': YELLOW })
    expect(a.trySwap(cell(3, 3), cell(3, 4)).events[1]).toMatchObject({ k: 'mix', piece: makePiece(ORANGE, KIND_ROW) })
    const b = mixGame({ '3,3': YELLOW, '3,4': makePiece(BLUE, KIND_BUCKET) })
    expect(b.trySwap(cell(3, 3), cell(3, 4)).events[1]).toMatchObject({ k: 'mix', piece: makePiece(GREEN, KIND_BUCKET) })
  })
  it('2차색이 끼거나 같은 색끼리면 무효, 수 그대로', () => {
    for (const over of [{ '3,4': RED }, { '3,3': RED, '3,4': RED }] as Record<string, number>[]) {
      const g = mixGame(over)
      const before = g.snapshot()
      const res = g.trySwap(cell(3, 3), cell(3, 4))
      expect(res.events).toEqual([{ k: 'swap', a: cell(3, 3), b: cell(3, 4), valid: false }])
      expect(g.snapshot()).toEqual(before)
    }
  })
  it('맞바꿔 매치가 생기면 섞지 않고 터뜨림', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '6,2': RED })
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    expect(res.events.some((e) => e.k === 'mix')).toBe(false)
    expect(g.mixes).toBe(0)
    expect(clears(res.events)[0]!.groups[0]!.color).toBe(RED)
  })
  it('섞인 방울이 바로 줄을 이루면 터지고 주문에 들어감', () => {
    const g = mixGame({ '3,3': RED, '3,4': YELLOW, '3,5': ORANGE, '3,6': ORANGE, '3,7': GREEN })
    const res = g.trySwap(cell(3, 3), cell(3, 4))
    expect(res.events[1]).toMatchObject({ k: 'mix' })
    const ev = clears(res.events)[0]!
    expect(ev.chain).toBe(1)
    expect(ev.groups[0]!.color).toBe(ORANGE)
    expect(ev.groups[0]!.cells).toEqual(expect.arrayContaining([cell(3, 4), cell(3, 5), cell(3, 6)]))
    expect(g.collected[ORANGE]).toBeGreaterThanOrEqual(3)
  })
  it('previewMix 는 섞일 때만 결과를 주고 상태 불변', () => {
    const g = mixGame({ '3,3': RED, '3,4': YELLOW })
    const before = JSON.stringify(g.snapshot())
    expect(g.previewMix(cell(3, 3), cell(3, 4))).toBe(ORANGE)
    expect(g.previewMix(cell(3, 3), cell(2, 3))).toBe(EMPTY)
    expect(g.previewMix(cell(3, 3), cell(5, 5))).toBe(EMPTY)
    expect(JSON.stringify(g.snapshot())).toBe(before)
  })
})

describe('주문 = 터뜨린 개수', () => {
  it('일반 매치 3개 → 그 색 +3, 바닥은 그 색', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '6,2': RED, '7,3': BLUE })
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    const first = clears(res.events)[0]!
    expect(first.collected[RED]).toBe(3)
    for (const c of [cell(7, 0), cell(7, 1), cell(7, 2)]) expect(g.floor[c]).toBe(RED)
  })
  it('줄 방울이 터뜨린 칸도 색별로 셈', () => {
    const g = makeGame({ '7,0': makePiece(RED, KIND_COL), '7,1': YELLOW, '6,1': RED })
    const before = Array.from(g.pieces)
    const ev = clears(g.trySwap(cell(6, 1), cell(7, 1)).events)[0]!
    expect(ev.fires[0]).toMatchObject({ at: cell(7, 0), shape: 'col', color: RED })
    const swapped = [...before]
    swapped[cell(6, 1)] = before[cell(7, 1)]!
    swapped[cell(7, 1)] = before[cell(6, 1)]!
    const popped = new Set([...ev.groups.flatMap((g2) => g2.cells), ...colCells(0)])
    const expected = new Array<number>(COLORS).fill(0)
    for (const c of popped) expected[colorOf(swapped[c]!)]!++
    expect(ev.collected).toEqual(expected)
  })
  it('붓 + 색 → 그 색 방울 전부 터지고 전부 셈', () => {
    const g = makeGame({ '3,3': B, '3,4': YELLOW })
    const yellows = Array.from(g.pieces).filter((p) => isColored(p) && colorOf(p) === YELLOW).length
    const ev = clears(g.trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.fires[0]).toMatchObject({ shape: 'color', color: YELLOW, brush: true })
    expect(ev.collected[YELLOW]).toBe(yellows)
  })
  it('붓끼리 → 십자', () => {
    const ev = clears(makeGame({ '3,3': B, '3,4': B }).trySwap(cell(3, 3), cell(3, 4)).events)[0]!
    expect(ev.fires[0]!.shape).toBe('cross')
    expect(ev.fires[0]!.cells).toHaveLength(15)
  })
  it('연쇄까지 합친 값이 game.collected 와 end.progress', () => {
    const rng = new Rng(5)
    let chained = 0
    for (let seed = 0; seed < 30; seed++) {
      const g = new Game(seed, seed % LEVELS.length)
      const sum = new Array<number>(COLORS).fill(0)
      for (let t = 0; t < 40 && g.status === 'playing'; t++) {
        const [a, b] = allPairs()[rng.int(allPairs().length)]!
        const res = g.trySwap(a, b)
        for (const ev of clears(res.events)) {
          ev.collected.forEach((n, c) => (sum[c]! += n))
          if (ev.chain > 1) chained++
        }
        const end = res.events.find((e) => e.k === 'end')
        if (end) expect(end.progress).toEqual(g.progress())
      }
      expect(g.collected).toEqual(sum)
    }
    expect(chained).toBeGreaterThan(0)
  })
  it('채우면 win + 남은 이동 보너스, 이후 입력 무시', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '6,2': RED }, { moves: 3 })
    g.collected[RED] = LEVELS[0]!.order[0]!.need - 3
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    expect(res.events[res.events.length - 1]).toMatchObject({ k: 'end', result: 'win', bonus: 200 })
    expect(g.status).toBe('win')
    expect(g.trySwap(0, 1).events).toEqual([])
  })
  it('수가 떨어지면 lose', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '6,2': RED }, { moves: 1 })
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    expect(res.events[res.events.length - 1]).toMatchObject({ k: 'end', result: 'lose' })
  })
})

describe('별', () => {
  const plain: Level = { moves: 20, order: [{ color: RED, need: 10 }], spawn: [1, 1, 1, 0, 0, 0], mixes: 0 }
  const mixed: Level = { moves: 20, order: [{ color: ORANGE, need: 10 }], spawn: [1, 1, 1, 0, 0, 0], mixes: 4 }
  it('2차색 주문 없음: 남은 수 기준', () => {
    expect(starsFor(plain, 4, 0)).toBe(1)
    expect(starsFor(plain, 5, 0)).toBe(2)
    expect(starsFor(plain, 7, 0)).toBe(2)
    expect(starsFor(plain, 8, 0)).toBe(3)
  })
  it('2차색 주문: ★2 + 섞기 횟수', () => {
    expect(starsFor(mixed, 4, 9)).toBe(1)
    expect(starsFor(mixed, 5, 3)).toBe(2)
    expect(starsFor(mixed, 5, 4)).toBe(3)
  })
  it('이긴 판 stars 가 starsFor 와 같음', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '6,2': RED }, { moves: 18 })
    g.collected[RED] = 100
    const res = g.trySwap(cell(6, 2), cell(7, 2))
    const end = res.events[res.events.length - 1] as Extract<TurnEvent, { k: 'end' }>
    expect(end.stars).toBe(starsFor(LEVELS[0]!, g.movesLeft, g.mixes))
    expect(g.stars).toBe(end.stars)
  })
})

describe('특수 방울 생성', () => {
  it('가로 4 -> 세로줄 방울, 들어온 칸', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '7,3': RED, '6,2': RED })
    const ev = clears(g.trySwap(cell(6, 2), cell(7, 2)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(7, 2), piece: makePiece(RED, KIND_COL) }])
  })
  it('세로 4 -> 가로줄 방울', () => {
    const g = makeGame({ '4,0': YELLOW, '5,0': YELLOW, '6,0': BLUE, '7,0': YELLOW, '6,1': YELLOW })
    const ev = clears(g.trySwap(cell(6, 0), cell(6, 1)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(6, 0), piece: makePiece(YELLOW, KIND_ROW) }])
  })
  it('L -> 물감 통', () => {
    const g = makeGame({ '7,0': RED, '7,1': ORANGE, '6,1': RED, '5,0': RED, '4,0': YELLOW })
    const ev = clears(g.trySwap(cell(6, 1), cell(7, 1)).events)[0]!
    expect(ev.groups[0]!.cells).toHaveLength(5)
    expect(ev.created).toEqual([{ cell: cell(7, 1), piece: makePiece(RED, KIND_BUCKET) }])
  })
  it('직선 5 -> 붓', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,3': YELLOW, '7,4': RED, '6,3': RED })
    const ev = clears(g.trySwap(cell(6, 3), cell(7, 3)).events)[0]!
    expect(ev.created).toEqual([{ cell: cell(7, 3), piece: B }])
  })
  it('2차색도 같은 규칙으로 매치·특수', () => {
    const g = mixGame({ '6,0': GREEN, '6,1': GREEN, '6,2': PURPLE, '6,3': GREEN, '6,4': PURPLE, '5,2': GREEN })
    const ev = clears(g.trySwap(cell(5, 2), cell(6, 2)).events)[0]!
    expect(ev.groups[0]!.color).toBe(GREEN)
    expect(ev.created).toEqual([{ cell: cell(6, 2), piece: makePiece(GREEN, KIND_COL) }])
  })
  it('물감 통: 판 모서리면 4칸', () => {
    const g = makeGame({ '7,0': makePiece(RED, KIND_BUCKET), '7,1': YELLOW, '6,1': RED })
    const ev = clears(g.trySwap(cell(6, 1), cell(7, 1)).events)[0]!
    expect(ev.fires[0]!.shape).toBe('box')
    expect(sorted(ev.fires[0]!.cells)).toEqual([cell(6, 0), cell(6, 1), cell(7, 0), cell(7, 1)])
  })
  it('특수 방울도 같은 색 매치에 참여', () => {
    const groups = findGroups(baseBoard({ '7,0': makePiece(RED, KIND_ROW), '7,1': RED }))
    expect(groups).toHaveLength(1)
    expect(groups[0]!.color).toBe(RED)
  })
})

describe('도움: findHint', () => {
  it('돌려준 수는 항상 유효', () => {
    let found = 0
    for (let seed = 0; seed < 40; seed++) {
      const g = new Game(seed, seed % LEVELS.length)
      const h = findHint(g)
      if (!h) continue
      found++
      const first = g.clone().trySwap(h.a, h.b).events[0]
      expect(first).toMatchObject({ k: 'swap', valid: true })
    }
    expect(found).toBe(40)
  })
  it('주문에 도움 되는 매치를 섞기보다 먼저', () => {
    const g = mixGame({ '3,3': RED, '3,4': YELLOW, '6,0': RED, '6,1': RED, '7,2': RED })
    const h = findHint(g)!
    expect([h.a, h.b].sort((x, y) => x - y)).toEqual([cell(6, 2), cell(7, 2)])
  })
  it('매치가 없으면 필요한 색을 만드는 섞기', () => {
    const g = mixGame({ '2,2': RED, '2,3': BLUE, '5,5': RED, '5,6': YELLOW }, { level: 2 })
    const h = findHint(g)!
    expect([h.a, h.b].sort((x, y) => x - y)).toEqual([cell(5, 5), cell(5, 6)])
  })
  it('끝난 판은 null', () => {
    const g = new Game(1)
    g.status = 'win'
    expect(findHint(g)).toBeNull()
  })
})

describe('천 모음', () => {
  it('바닥 왕복, 범위 밖 글자는 빈 바닥', () => {
    const floor = new Int8Array(N).fill(NO_FLOOR)
    floor[0] = RED
    floor[1] = ORANGE
    floor[N - 1] = PURPLE
    const s = encodeFloor(floor)
    expect(s).toHaveLength(N)
    expect(Array.from(decodeFloor(s))).toEqual(Array.from(floor))
    expect(decodeFloor('zz')[0]).toBe(NO_FLOOR)
    expect(decodeFloor('')[5]).toBe(NO_FLOOR)
  })
  it('mergeEntry: 별 우선, 같은 별이면 점수 우선', () => {
    const a = { stars: 2, score: 1000, floor: '', at: 0 }
    const b = { stars: 1, score: 9999, floor: '', at: 1 }
    const c = { stars: 2, score: 1500, floor: '', at: 2 }
    expect(mergeEntry(a, b)).toBe(a)
    expect(mergeEntry(a, c)).toBe(c)
    expect(mergeEntry(undefined, b)).toBe(b)
  })
  it('깨진 JSON·배열·잘못된 항목은 버림', () => {
    expect(parseAlbum('{not json')).toEqual({})
    expect(parseAlbum('[1,2]')).toEqual({})
    expect(parseAlbum(null)).toEqual({})
    const ok = { stars: 3, score: 10, floor: 'b', at: 1 }
    expect(parseAlbum(JSON.stringify({ 0: ok, 1: { stars: 'x' }, 2: null }))).toEqual({ 0: ok })
  })
})

describe('판·섞기 규칙 유지', () => {
  it('무효 스왑: 이동 그대로, 판 불변', () => {
    const g = makeGame()
    const before = g.snapshot()
    const res = g.trySwap(cell(2, 2), cell(2, 3))
    expect(res.events).toEqual([{ k: 'swap', a: cell(2, 2), b: cell(2, 3), valid: false }])
    expect(g.snapshot()).toEqual(before)
  })
  it('둘 수 없는 판은 다시 놓기: 매치 없음 + 둘 수 있음, 붓 있으면 안 함', () => {
    const p = mixGame().pieces
    expect(hasMove(p)).toBe(false)
    expect(reshuffle(p, new Rng(3), [1, 1, 1, 1, 1, 1])).not.toBeNull()
    expect(hasMove(p)).toBe(true)
    expect(hasMatch(p)).toBe(false)
    const q = mixGame({ '2,2': B }).pieces
    expect(reshuffle(q, new Rng(3), [1, 1, 1, 1, 1, 1])).toBeNull()
  })
  it('시작 판: 매치 없음 + 매치 수 있음, 판별 생성 비율 반영', () => {
    const count = new Array<number>(COLORS).fill(0)
    for (let seed = 0; seed < 50; seed++) {
      const g = new Game(seed, 2)
      expect(hasMatch(g.pieces)).toBe(false)
      expect(hasMove(g.pieces, false)).toBe(true)
      for (const p of g.pieces) count[colorOf(p)]!++
    }
    const prim = count[RED]! + count[YELLOW]! + count[BLUE]!
    const sec = count[ORANGE]! + count[GREEN]! + count[PURPLE]!
    expect(prim).toBeGreaterThan(sec * 5)
  })
  it('같은 시드 같은 결과', () => {
    const play = (): string => {
      const g = new Game(42, 3)
      const out: TurnEvent[] = []
      for (const [a, b] of allPairs()) out.push(...g.trySwap(a, b).events)
      return JSON.stringify(out) + JSON.stringify(g.snapshot())
    }
    expect(play()).toBe(play())
  })
  it('바닥은 덮어쓰기: 터진 자리는 그 방울 색', () => {
    const g = makeGame({ '7,0': RED, '7,1': RED, '7,2': YELLOW, '6,2': RED })
    for (const c of rowCells(7)) g.floor[c] = BLUE
    g.trySwap(cell(6, 2), cell(7, 2))
    expect(g.floor[cell(7, 0)]).toBe(RED)
    expect(g.floor[cell(7, 5)]).toBe(BLUE)
  })
})
