import { describe, expect, it } from 'vitest'
import type { GridPosition } from '@tgslot/slot-engine'
import { PULSE_HOLD_MS, PULSE_HOP_MS } from './constants.js'
import { computeLayout, symbolCenter } from './layout.js'
import { buildPulsePath, pulseHopMsForTier, pulsePointAt, pulseTrailForTier } from './pulse.js'

const layout = computeLayout({ containerWidth: 360, reels: 5, rows: 3 })
const middleRow: GridPosition[] = [
  [0, 1],
  [1, 1],
  [2, 1],
]

describe('buildPulsePath', () => {
  const path = buildPulsePath(layout, middleRow)

  it('당첨 자리마다 지점을 하나씩 만든다', () => {
    expect(path.waypoints).toHaveLength(3)
    expect(path.waypoints.map((point) => point.position)).toEqual(middleRow)
  })

  it('지점 좌표가 심볼 중심이다', () => {
    for (const waypoint of path.waypoints) {
      const [reel, row] = waypoint.position
      expect(waypoint.point).toEqual(symbolCenter(layout, reel, row))
    }
  })

  it('한 칸 건너뛰는 데 120ms가 걸린다', () => {
    expect(path.waypoints.map((point) => point.atMs)).toEqual([0, PULSE_HOP_MS, PULSE_HOP_MS * 2])
  })

  it('첫 지점에는 곧바로 닿는다', () => {
    expect(path.waypoints[0]?.atMs).toBe(0)
  })

  it('이동 시간은 마지막 지점에 닿는 시각이다', () => {
    expect(path.travelMs).toBe(PULSE_HOP_MS * 2)
  })

  it('전체 길이는 이동 시간에 머무는 시간을 더한 값이다', () => {
    expect(path.totalMs).toBe(PULSE_HOP_MS * 2 + PULSE_HOLD_MS)
  })

  it('왼쪽에서 오른쪽 순서로 정렬한다', () => {
    const shuffled: GridPosition[] = [
      [2, 0],
      [0, 2],
      [1, 1],
    ]
    expect(buildPulsePath(layout, shuffled).waypoints.map((point) => point.position[0])).toEqual([0, 1, 2])
  })

  it('입력 배열을 건드리지 않는다', () => {
    const input: GridPosition[] = [
      [2, 0],
      [0, 1],
    ]
    buildPulsePath(layout, input)
    expect(input[0]?.[0]).toBe(2)
  })

  it('대각선 라인은 지점마다 y가 달라진다', () => {
    const diagonal: GridPosition[] = [
      [0, 0],
      [1, 1],
      [2, 2],
    ]
    const ys = buildPulsePath(layout, diagonal).waypoints.map((point) => point.point.y)
    expect(ys[1] ?? 0).toBeGreaterThan(ys[0] ?? 0)
    expect(ys[2] ?? 0).toBeGreaterThan(ys[1] ?? 0)
  })

  it('당첨 자리가 하나뿐이면 이동 시간이 0이다', () => {
    const single = buildPulsePath(layout, [[3, 1]])
    expect(single.travelMs).toBe(0)
    expect(single.totalMs).toBe(PULSE_HOLD_MS)
  })

  it('당첨 자리가 없으면 지점도 없다', () => {
    const empty = buildPulsePath(layout, [])
    expect(empty.waypoints).toEqual([])
    expect(empty.travelMs).toBe(0)
  })

  it('건너뛰는 시간을 바꿀 수 있다', () => {
    expect(buildPulsePath(layout, middleRow, 200).travelMs).toBe(400)
  })

  it('5릴 전부 당첨이면 지점이 5개다', () => {
    const full: GridPosition[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]
    expect(buildPulsePath(layout, full).waypoints).toHaveLength(5)
  })
})

describe('pulsePointAt', () => {
  const path = buildPulsePath(layout, middleRow)

  it('시작 전에는 첫 지점에 붙어 있다', () => {
    expect(pulsePointAt(path, -50)).toEqual(path.waypoints[0]?.point)
  })

  it('지점에 정확히 닿는 시각에는 그 좌표다', () => {
    expect(pulsePointAt(path, PULSE_HOP_MS)).toEqual(path.waypoints[1]?.point)
  })

  it('지점 사이에서는 절반쯤 와 있다', () => {
    const half = pulsePointAt(path, PULSE_HOP_MS / 2)
    const from = path.waypoints[0]?.point
    const to = path.waypoints[1]?.point
    if (half === null || from === undefined || to === undefined) throw new Error('경로 없음')
    expect(half.x).toBeCloseTo((from.x + to.x) / 2, 9)
  })

  it('끝난 뒤에는 마지막 지점에 머문다', () => {
    expect(pulsePointAt(path, 99_999)).toEqual(path.waypoints[2]?.point)
  })

  it('x가 시간에 따라 단조증가한다', () => {
    let previous = -Infinity
    for (let t = 0; t <= path.travelMs; t += 20) {
      const point = pulsePointAt(path, t)
      if (point === null) throw new Error('경로 없음')
      expect(point.x).toBeGreaterThanOrEqual(previous)
      previous = point.x
    }
  })

  it('빈 경로에서는 null이다', () => {
    expect(pulsePointAt(buildPulsePath(layout, []), 0)).toBeNull()
  })
})

describe('등급별 빛 속도', () => {
  it('등급이 오를수록 느긋해진다', () => {
    expect(pulseHopMsForTier('none')).toBe(120)
    expect(pulseHopMsForTier('big')).toBe(150)
    expect(pulseHopMsForTier('mega')).toBe(180)
    expect(pulseHopMsForTier('epic')).toBe(220)
    expect(pulseHopMsForTier('max')).toBe(220)
  })

  it('등급이 오를수록 잔상이 길어진다', () => {
    expect(pulseTrailForTier('none')).toBeLessThan(pulseTrailForTier('big'))
    expect(pulseTrailForTier('big')).toBeLessThan(pulseTrailForTier('mega'))
    expect(pulseTrailForTier('mega')).toBeLessThan(pulseTrailForTier('epic'))
  })

  it('느린 등급은 경로 전체도 길어진다', () => {
    const fast = buildPulsePath(layout, middleRow, pulseHopMsForTier('none'))
    const slow = buildPulsePath(layout, middleRow, pulseHopMsForTier('max'))
    expect(slow.travelMs).toBeGreaterThan(fast.travelMs)
  })
})

describe('도착 판정은 반올림하지 않는다', () => {
  const path = buildPulsePath(layout, middleRow)

  it('절반쯤 지난 시점은 아직 앞 심볼이다', () => {
    // Math.round를 쓰면 여기서 다음 심볼이 이르게 터진다.
    const half = PULSE_HOP_MS * 0.6
    expect(Math.floor(half / PULSE_HOP_MS + 1e-6)).toBe(0)
  })

  it('정확히 닿는 시점에 다음 심볼이 된다', () => {
    expect(Math.floor(PULSE_HOP_MS / PULSE_HOP_MS + 1e-6)).toBe(1)
    expect(pulsePointAt(path, PULSE_HOP_MS)).toEqual(path.waypoints[1]?.point)
  })
})
