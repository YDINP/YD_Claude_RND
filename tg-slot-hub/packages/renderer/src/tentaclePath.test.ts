import { describe, expect, it } from 'vitest'
import {
  TENTACLE_AMPLITUDE,
  tentacleCurvePoint,
  tentaclePeekShape,
  tentaclePoints,
  type TentacleGeometry,
} from './tentaclePath.js'

const GEO: TentacleGeometry = { cx: 100, bottomY: 400, topY: 100, cell: 80 }

describe('촉수 경로', () => {
  it('곡선은 판 아래에서 시작해 줄 위끝에서 끝난다', () => {
    expect(tentacleCurvePoint(GEO, 0).y).toBe(400)
    expect(tentacleCurvePoint(GEO, 1).y).toBe(100)
    // 범위 밖 u는 끝으로 묶인다.
    expect(tentacleCurvePoint(GEO, -1).y).toBe(400)
    expect(tentacleCurvePoint(GEO, 2).y).toBe(100)
  })

  it('좌우로는 칸 폭 안에서만 흔들린다', () => {
    for (let i = 0; i <= 100; i += 1) {
      const p = tentacleCurvePoint(GEO, i / 100)
      expect(Math.abs(p.x - GEO.cx)).toBeLessThanOrEqual(TENTACLE_AMPLITUDE * GEO.cell + 1e-9)
    }
  })

  it('점 개수가 정확하고 아래에서 위로 이어진다', () => {
    const points = tentaclePoints(GEO, { head: 1, length: 0.8 }, 24)
    expect(points).toHaveLength(24)
    for (let i = 1; i < points.length; i += 1) {
      expect((points[i] as { y: number }).y).toBeLessThanOrEqual((points[i - 1] as { y: number }).y)
    }
    expect((points[points.length - 1] as { y: number }).y).toBeCloseTo(100)
  })

  it('머리가 몸통 길이보다 낮으면 꼬리는 곡선 시작에 붙어 있다', () => {
    const points = tentaclePoints(GEO, { head: 0.2, length: 0.8 }, 10)
    expect((points[0] as { y: number }).y).toBe(400)
    expect((points[9] as { y: number }).y).toBeCloseTo(400 - 300 * 0.2)
  })

  it('머리가 올라가도 몸통 길이는 유지된다', () => {
    const a = tentaclePoints(GEO, { head: 0.9, length: 0.5 }, 10)
    expect((a[0] as { y: number }).y).toBeCloseTo(400 - 300 * 0.4)
    expect((a[9] as { y: number }).y).toBeCloseTo(400 - 300 * 0.9)
  })

  it('점은 최소 2개다', () => {
    expect(tentaclePoints(GEO, { head: 0.5, length: 0.5 }, 0)).toHaveLength(2)
  })

  it('꿈틀거림이 0이면 시간이 흘러도 같은 경로다', () => {
    const a = tentaclePoints(GEO, { head: 0.7, length: 0.4, wiggle: 0, time: 0 }, 8)
    const b = tentaclePoints(GEO, { head: 0.7, length: 0.4, wiggle: 0, time: 9 }, 8)
    expect(a).toEqual(b)
  })

  it('꿈틀거림이 있으면 경로가 시간에 따라 달라진다', () => {
    const a = tentaclePoints(GEO, { head: 0.7, length: 0.4, wiggle: 0.1, time: 0 }, 8)
    const b = tentaclePoints(GEO, { head: 0.7, length: 0.4, wiggle: 0.1, time: 0.3 }, 8)
    expect(a).not.toEqual(b)
  })

  it('대기하는 끝은 판 아래 가장자리에서 한 칸 안쪽까지만 고개를 내민다', () => {
    for (let t = 0; t < 3; t += 0.1) {
      const shape = tentaclePeekShape(GEO, t)
      const tipY = (tentaclePoints(GEO, shape, 12).at(-1) as { y: number }).y
      expect(tipY).toBeLessThanOrEqual(400)
      expect(400 - tipY).toBeLessThanOrEqual(GEO.cell * 0.6)
    }
  })
})
