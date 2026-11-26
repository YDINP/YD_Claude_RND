import { describe, expect, it } from 'vitest'
import hanbokMathRaw from '../../../../../../games/hanbok-night-market/math.json'
import {
  YUT_BOARD_SIZE,
  boardLayout,
  boardPadding,
  chipLabel,
  chipPlacement,
  chipWidth,
  missingLayoutNodes,
  nodeCenter,
  nodeGaps,
  nodeRadius,
  nodeSizeClass,
  boxHitsCircle,
  type ChipBox,
} from './yutLayout'

const layout = boardLayout('yut29')
if (layout === null) throw new Error('yut29 좌표표가 없다')

const mathNodes = Object.keys((hanbokMathRaw as { boardBonus: { nodes: Record<string, unknown> } }).boardBonus.nodes)

describe('yut29 좌표표', () => {
  it('모르는 이름은 null이다', () => {
    expect(boardLayout('nope')).toBeNull()
  })

  it('math.json의 모든 칸이 좌표표에 있다', () => {
    expect(missingLayoutNodes(layout, mathNodes)).toEqual([])
  })

  it('출발과 결승은 같은 자리(오른쪽 아래)다', () => {
    expect(nodeCenter(layout, 'start', 358)).toEqual(nodeCenter(layout, 'goal', 358))
    const goal = nodeCenter(layout, 'goal', 358)
    const pad = boardPadding(358)
    expect(goal?.x).toBeCloseTo(358 - pad, 5)
    expect(goal?.y).toBeCloseTo(358 - pad, 5)
  })

  it('모든 칸이 판 안쪽 여백 안에 들어와 판 밖으로 나가지 않는다', () => {
    for (const size of [358, 398]) {
      for (const id of Object.keys(layout.positions)) {
        const p = nodeCenter(layout, id, size)
        const r = nodeRadius(id, size)
        expect(p).not.toBeNull()
        if (p === null) continue
        expect(p.x - r).toBeGreaterThanOrEqual(-0.01)
        expect(p.y - r).toBeGreaterThanOrEqual(-0.01)
        expect(p.x + r).toBeLessThanOrEqual(size + 0.01)
        expect(p.y + r).toBeLessThanOrEqual(size + 0.01)
      }
    }
  })

  it('칸 크기: 모퉁이·방은 크고 결승은 가장 크다(398px 기준 40/50/58)', () => {
    expect(nodeSizeClass('o3')).toBe('normal')
    for (const id of ['o5', 'o10', 'o15', 'c']) expect(nodeSizeClass(id)).toBe('corner')
    expect(nodeSizeClass('goal')).toBe('goal')
    expect(nodeRadius('o3', YUT_BOARD_SIZE) * 2).toBe(40)
    expect(nodeRadius('o5', YUT_BOARD_SIZE) * 2).toBe(50)
    expect(nodeRadius('goal', YUT_BOARD_SIZE) * 2).toBe(58)
  })

  it('판 358px(390 화면)에서 모든 칸 쌍의 틈이 6px 이상이다 — 가장 붙는 쌍은 모퉁이 옆 대각선 칸', () => {
    const gaps = nodeGaps(layout, 358)
    const tightest = [...gaps].sort((a, b) => a.gap - b.gap).slice(0, 6)
    for (const pair of gaps) expect(pair.gap).toBeGreaterThanOrEqual(6)
    // 가장 붙는 쌍이 계획서가 지목한 «모퉁이 옆 대각선 칸»인지 — 좌표표가 바뀌면 이 목록이 먼저 알려 준다.
    const names = new Set(tightest.flatMap((pair) => [pair.a, pair.b]))
    expect(names.has('a1') || names.has('b1')).toBe(true)
  })

  it('판 398px(430 화면)에서도 틈이 6px 이상이다', () => {
    for (const pair of nodeGaps(layout, 398)) expect(pair.gap).toBeGreaterThanOrEqual(6)
  })

  it('방은 판 정중앙이다', () => {
    const c = nodeCenter(layout, 'c', 398)
    expect(c?.x).toBeCloseTo(199, 5)
    expect(c?.y).toBeCloseTo(199, 5)
  })
})

describe('꼬리표 자리', () => {
  // 한 결과 = 한 글자(도·개·걸·윷·모) 칩, 두 결과가 같은 칸을 가리키면 두 글자 칩(약 34px)
  const chip = { w: 20, h: 18 }
  const mergedChip = { w: 34, h: 18 }

  it('칸을 가리지 않고 판 안에 있다 — 모든 칸 × 두 화면 크기', () => {
    for (const size of [358, 398]) {
      for (const id of Object.keys(layout.positions)) {
        const box = chipPlacement(layout, id, size, chip)
        expect(box).not.toBeNull()
        if (box === null) continue
        expect(box.x - box.w / 2).toBeGreaterThanOrEqual(-0.01)
        expect(box.x + box.w / 2).toBeLessThanOrEqual(size + 0.01)
        expect(box.y - box.h / 2).toBeGreaterThanOrEqual(-0.01)
        expect(box.y + box.h / 2).toBeLessThanOrEqual(size + 0.01)
        // 칩이 놓일 자리에 다른 칸 원이 끼지 않는다(자기 칸 위로는 3px 띄운다).
        for (const other of Object.keys(layout.positions)) {
          if (other === id) continue
          const p = nodeCenter(layout, other, size)
          if (p === null) continue
          const hit = boxHitsCircle(box, { ...p, r: nodeRadius(other, size) }, 0)
          if (hit) {
            // 출발·결승은 같은 자리라 서로를 «다른 칸»으로 세지 않는다.
            expect([id, other].sort().join('+')).toBe('goal+start')
          }
        }
      }
    }
  })

  it('두 글자 칩은 모퉁이 옆 대각선 칸 근처에서 칸을 가릴 수 있지만 판 밖으로는 나가지 않는다', () => {
    for (const id of ['goal', 'o5', 'o19']) {
      const box = chipPlacement(layout, id, 358, mergedChip)
      expect(box).not.toBeNull()
      if (box === null) continue
      expect(box.x - box.w / 2).toBeGreaterThanOrEqual(-0.01)
      expect(box.x + box.w / 2).toBeLessThanOrEqual(358.01)
    }
  })

  it('기본은 판 중앙 쪽으로 비켜 붙는다', () => {
    const o3 = nodeCenter(layout, 'o3', 358)
    const box = chipPlacement(layout, 'o3', 358, chip)
    expect(o3).not.toBeNull()
    expect(box).not.toBeNull()
    if (o3 === null || box === null) return
    expect(box.x).toBeLessThan(o3.x) // 오른쪽 변의 칸이라 칩은 왼쪽(안쪽)에 붙는다
  })

  it('이미 놓인 칩과 겹치지 않는다', () => {
    const placed: ChipBox[] = []
    for (const id of ['o4', 'o5', 'a1']) {
      const box = chipPlacement(layout, id, 358, chip, placed)
      expect(box).not.toBeNull()
      if (box === null) continue
      for (const other of placed) {
        const overlap =
          Math.abs(box.x - other.x) < (box.w + other.w) / 2 && Math.abs(box.y - other.y) < (box.h + other.h) / 2
        expect(overlap).toBe(false)
      }
      placed.push(box)
    }
  })

  it('없는 칸이면 null', () => {
    expect(chipPlacement(layout, 'zz', 358, chip)).toBeNull()
  })
})

describe('꼬리표 글자', () => {
  const ko = ['', '도', '개', '걸', '윷', '모']
  const en = ['', '1', '2', '3', '4', '5']

  it('한 결과는 그 이름, 둘은 이어 붙이고, 연속한 셋 이상은 «처음~끝»으로 줄인다', () => {
    expect(chipLabel([3], ko)).toBe('걸')
    expect(chipLabel([4, 3], ko)).toBe('걸·윷')
    expect(chipLabel([3, 4, 5], ko)).toBe('걸~모')
    expect(chipLabel([2, 3, 4, 5], ko)).toBe('개~모')
    expect(chipLabel([3, 4, 5], en)).toBe('3~5')
  })

  it('연속하지 않은 셋은 줄이지 않고 이어 붙인다', () => {
    expect(chipLabel([1, 3, 5], ko)).toBe('도·걸·모')
  })

  it('폭: 한 글자 칩은 22 이상, 한글이 숫자보다 넓다', () => {
    expect(chipWidth('도')).toBeGreaterThanOrEqual(22)
    expect(chipWidth('걸윷')).toBeGreaterThan(chipWidth('3~5') - 1)
    expect(chipWidth('3')).toBe(22)
    expect(chipWidth('걸~모')).toBeLessThan(60)
  })

  it('가장 긴 글자(결승 넘침 한 칩)도 모퉁이 옆에서 판 밖으로 나가지 않는다', () => {
    for (const label of ['개~모', '2~5']) {
      const box = chipPlacement(layout, 'goal', 358, { w: chipWidth(label), h: 20 })
      expect(box).not.toBeNull()
      if (box === null) continue
      expect(box.x + box.w / 2).toBeLessThanOrEqual(358.01)
      expect(box.y + box.h / 2).toBeLessThanOrEqual(358.01)
    }
  })
})
