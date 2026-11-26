import { describe, expect, it } from 'vitest'
import { initialBoardState, stepBoard, type BoardState } from '@tgslot/slot-engine'
import { previewLandings } from '../../../game/boardPlayback'
import { hanbokBoardConfig } from '../../../test/hanbokMath'
import { TOKEN_DIAMETER, planChips } from './chipPlan'
import { CHIP_OWN_MARGIN, YUT_BOARD_SIZE, boardLayout, chipOwnership, chipTail, nodeCenter, nodeRadius, type ChipBox } from './yutLayout'

const config = hanbokBoardConfig()
const layout = boardLayout('yut29')
if (layout === null) throw new Error('좌표표 없음')

const KO = ['', '도', '개', '걸', '윷', '모']
const EN = ['', '1', '2', '3', '4', '5']

/** 판에서 말이 설 수 있는 (칸, 길) 조합 전부 — 엔진의 `stepBoard`로 모든 윷 결과를 따라간다. */
function reachableStates(): { at: string; route: string }[] {
  const start = initialBoardState(config)
  const seen = new Map<string, { at: string; route: string }>()
  const queue: BoardState[] = [{ ...start, throwsLeft: 99, thrown: 0 }]
  seen.set(`${start.at}|${start.route}`, { at: start.at, route: start.route })
  while (queue.length > 0) {
    const state = queue.shift() as BoardState
    for (const row of config.throwTable) {
      let stepped
      try {
        stepped = stepBoard(config, { ...state, throwsLeft: 99, thrown: 0, end: undefined as never }, row.steps)
      } catch {
        continue
      }
      const next = stepped.state
      if (next.at === 'goal') continue
      const key = `${next.at}|${next.route}`
      if (seen.has(key)) continue
      seen.set(key, { at: next.at, route: next.route })
      queue.push({ ...next, throwsLeft: 99, thrown: 0 })
    }
  }
  return [...seen.values()]
}

/** 상자가 원을 얼마나 파고드는지(px). 0 이하면 안 닿는다. */
function penetration(box: ChipBox, circle: { x: number; y: number; r: number }): number {
  const nx = Math.max(box.x - box.w / 2, Math.min(circle.x, box.x + box.w / 2))
  const ny = Math.max(box.y - box.h / 2, Math.min(circle.y, box.y + box.h / 2))
  return circle.r - Math.hypot(circle.x - nx, circle.y - ny)
}

describe('꼬리표 배치 — 도달 가능한 모든 말 자리', () => {
  const states = reachableStates()

  it('말이 설 수 있는 자리를 모두 찾았다(출발 + 바깥 + 지름길)', () => {
    expect(states.length).toBeGreaterThan(25)
    expect(states.some((s) => s.route === 'center')).toBe(true)
    expect(states.some((s) => s.route === 'a')).toBe(true)
    expect(states.some((s) => s.route === 'b')).toBe(true)
  })

  for (const [label, names] of [['ko', KO], ['en', EN]] as const) {
    it(`${label}: 꼬리표가 판 안에 있고, 말과 이웃 칸을 거의 가리지 않는다`, () => {
      const worst: string[] = []
      for (const state of states) {
        const previews = previewLandings(config, state)
        const plan = planChips({ layout, config, previews, currentAt: state.at, chipNames: names })
        const token = nodeCenter(layout, state.at, YUT_BOARD_SIZE)
        for (const [id, box] of plan.chips) {
          expect(box.x - box.w / 2).toBeGreaterThanOrEqual(-0.5)
          expect(box.x + box.w / 2).toBeLessThanOrEqual(YUT_BOARD_SIZE + 0.5)
          expect(box.y - box.h / 2).toBeGreaterThanOrEqual(-0.5)
          expect(box.y + box.h / 2).toBeLessThanOrEqual(YUT_BOARD_SIZE + 0.5)
          if (token !== null) {
            const hitToken = penetration(box, { ...token, r: TOKEN_DIAMETER / 2 })
            if (hitToken > 3) worst.push(`${state.at}/${state.route}: 칩(${id})이 말을 ${hitToken.toFixed(1)}px 가린다`)
          }
          for (const other of Object.keys(layout.positions)) {
            if (other === id || (id === 'goal' && other === 'start') || (id === 'start' && other === 'goal')) continue
            const c = nodeCenter(layout, other, YUT_BOARD_SIZE)
            if (c === null) continue
            const hit = penetration(box, { ...c, r: nodeRadius(other, YUT_BOARD_SIZE) })
            if (hit > 5) worst.push(`${state.at}/${state.route}: 칩(${id})이 칸 ${other}을 ${hit.toFixed(1)}px 가린다`)
          }
        }
      }
      expect(worst).toEqual([])
    })
  }

  it('칩끼리는 겹치지 않는다', () => {
    const overlaps: string[] = []
    for (const state of states) {
      const previews = previewLandings(config, state)
      const plan = planChips({ layout, config, previews, currentAt: state.at, chipNames: KO })
      const boxes = [...plan.chips.entries()]
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const [ida, a] = boxes[i] as [string, ChipBox]
          const [idb, b] = boxes[j] as [string, ChipBox]
          if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) overlaps.push(`${state.at}/${state.route}: ${ida}↔${idb}`)
        }
      }
    }
    expect(overlaps).toEqual([])
  })
  // 플레이어 QA: 한가운데(×+2) 꼬리표가 바로 옆 «코인 8» 칸에 더 가까워 «개 → 8코인»으로 읽혔다.
  for (const [label, names] of [['ko', KO], ['en', EN]] as const) {
    it(`${label}: 꼬리표와 «지름길» 글자는 이웃 칸보다 제 칸에 확실히 가깝다`, () => {
      const ambiguous: string[] = []
      for (const state of states) {
        const plan = planChips({ layout, config, previews: previewLandings(config, state), currentAt: state.at, chipNames: names })
        for (const [id, box] of [...plan.chips, ...plan.forkLabels]) {
          const own = chipOwnership(layout, id, box, YUT_BOARD_SIZE)
          if (own.margin < CHIP_OWN_MARGIN) ambiguous.push(`${state.at}/${state.route}: ${id} 꼬리표가 ${own.nearest}에 가깝다(${own.margin.toFixed(1)}px)`)
        }
      }
      expect(ambiguous).toEqual([])
    })
  }

  it('한가운데 칸 꼬리표는 «코인 8»(f1)이 아니라 한가운데 쪽에 붙는다', () => {
    for (const from of ['a1', 'a2', 'o10', 'b1']) {
      const state = states.find((s) => s.at === from)
      if (state === undefined) continue
      const plan = planChips({ layout, config, previews: previewLandings(config, state), currentAt: state.at, chipNames: KO })
      const box = plan.chips.get('c')
      if (box === undefined) continue
      expect(chipOwnership(layout, 'c', box, YUT_BOARD_SIZE).nearest).not.toBe('')
      expect(chipOwnership(layout, 'c', box, YUT_BOARD_SIZE).margin).toBeGreaterThanOrEqual(CHIP_OWN_MARGIN)
    }
  })

  it('꼬리는 상자에서 제 칸 테두리 안쪽까지 뻗는다', () => {
    const c = nodeCenter(layout, 'c', YUT_BOARD_SIZE)
    if (c === null) throw new Error('칸 없음')
    const box: ChipBox = { x: c.x + 50, y: c.y, w: 30, h: 20 }
    const tail = chipTail(box, c, nodeRadius('c', YUT_BOARD_SIZE))
    // 꼬리 끝(상자 기준)이 칸 테두리 안쪽
    expect(Math.hypot(box.x + tail.tip.x - c.x, box.y + tail.tip.y - c.y)).toBeLessThan(nodeRadius('c', YUT_BOARD_SIZE))
    // 꼬리 밑동은 상자 안
    expect(Math.abs(tail.base1.x)).toBeLessThanOrEqual(box.w / 2)
  })
})
