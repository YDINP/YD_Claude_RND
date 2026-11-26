import { describe, expect, it } from 'vitest'
import { runRotation, type RotationClock } from './rouletteMotion'

/** 손으로 시간을 흘리는 가짜 시계 + rAF. */
function fakeClock(): RotationClock & { time: number; advance(ms: number): void; pending(): number } {
  let time = 0
  let nextId = 1
  const callbacks = new Map<number, (t: number) => void>()
  return {
    get time() {
      return time
    },
    now: () => time,
    request(cb) {
      const id = nextId++
      callbacks.set(id, cb)
      return id
    },
    cancel(id) {
      callbacks.delete(id)
    },
    advance(ms) {
      // 16ms 프레임으로 쪼개서 흘린다.
      let left = ms
      while (left > 0) {
        const step = Math.min(16, left)
        time += step
        left -= step
        const run = [...callbacks.entries()]
        callbacks.clear()
        for (const [, cb] of run) cb(time)
      }
    },
    pending: () => callbacks.size,
  }
}

describe('runRotation', () => {
  it('단조 증가로 돌아 정확히 목표 각도에서 멈춘다', async () => {
    const clock = fakeClock()
    const angles: number[] = []
    const run = runRotation({ from: 10, to: 1210, ms: 1000, apply: (a) => angles.push(a), clock })
    clock.advance(1100)
    await run.done
    expect(run.finished).toBe(true)
    expect(angles[angles.length - 1]).toBe(1210)
    for (let i = 1; i < angles.length; i += 1) expect(angles[i] as number).toBeGreaterThanOrEqual(angles[i - 1] as number)
    expect(clock.pending()).toBe(0)
  })

  it('감속한다 — 앞 구간이 뒤 구간보다 많이 돈다', () => {
    const clock = fakeClock()
    let angle = 0
    runRotation({ from: 0, to: 1000, ms: 1000, apply: (a) => (angle = a), clock })
    clock.advance(250)
    const first = angle
    clock.advance(500)
    const middle = angle - first
    clock.advance(250)
    const last = angle - first - middle
    expect(first).toBeGreaterThan(middle / 2)
    expect(middle).toBeGreaterThan(last)
  })

  it('빠르게 멈춤은 같은 각도에 더 빨리 도착하고 되돌아가지 않는다', async () => {
    const clock = fakeClock()
    const angles: number[] = []
    const run = runRotation({ from: 0, to: 1500, ms: 2400, apply: (a) => angles.push(a), clock })
    clock.advance(300)
    const before = angles[angles.length - 1] as number
    run.compress(350)
    clock.advance(400)
    await run.done
    expect(angles[angles.length - 1]).toBe(1500)
    expect(clock.time).toBeLessThanOrEqual(300 + 400)
    for (let i = 1; i < angles.length; i += 1) expect(angles[i] as number).toBeGreaterThanOrEqual(angles[i - 1] as number)
    expect(angles[angles.length - 1] as number).toBeGreaterThan(before)
  })

  it('이미 곧 끝날 회전은 압축해도 늘어나지 않는다', async () => {
    const clock = fakeClock()
    const run = runRotation({ from: 0, to: 720, ms: 1000, apply: () => undefined, clock })
    clock.advance(900)
    run.compress(350)
    clock.advance(120)
    await run.done
    expect(clock.time).toBeLessThanOrEqual(1020)
  })

  it('두 번째 압축도 안전하다(무시되거나 같은 결과)', async () => {
    const clock = fakeClock()
    let last = 0
    const run = runRotation({ from: 0, to: 900, ms: 2400, apply: (a) => (last = a), clock })
    clock.advance(100)
    run.compress(350)
    run.compress(350)
    clock.advance(500)
    await run.done
    expect(last).toBe(900)
  })

  it('finish는 그 자리에서 목표로 붙이고 프레임을 끊는다', async () => {
    const clock = fakeClock()
    let last = 0
    const run = runRotation({ from: 0, to: 900, ms: 2400, apply: (a) => (last = a), clock })
    clock.advance(100)
    run.finish()
    await run.done
    expect(last).toBe(900)
    expect(clock.pending()).toBe(0)
  })

  it('cancel은 프레임을 끊고 done을 푼다(각도는 그대로 둔다)', async () => {
    const clock = fakeClock()
    let last = 0
    const run = runRotation({ from: 0, to: 900, ms: 2400, apply: (a) => (last = a), clock })
    clock.advance(200)
    const at = last
    run.cancel()
    await run.done
    clock.advance(3000)
    expect(last).toBe(at)
    expect(last).toBeLessThan(900)
    expect(clock.pending()).toBe(0)
  })

  it('길이가 0이거나 제자리면 즉시 도착한다(모션 축소 점프)', async () => {
    const clock = fakeClock()
    const seen: number[] = []
    const run = runRotation({ from: 30, to: 120, ms: 0, apply: (a) => seen.push(a), clock })
    await run.done
    expect(seen).toEqual([120])
    expect(run.finished).toBe(true)
    const same = runRotation({ from: 50, to: 50, ms: 1000, apply: (a) => seen.push(a), clock })
    await same.done
    expect(seen[seen.length - 1]).toBe(50)
  })

  it('프레임마다 진행도를 알린다(마지막은 1)', () => {
    const clock = fakeClock()
    const progresses: number[] = []
    runRotation({ from: 0, to: 360, ms: 200, apply: () => undefined, onFrame: (_a, p) => progresses.push(p), clock })
    clock.advance(300)
    expect(progresses[progresses.length - 1]).toBe(1)
    expect(progresses.length).toBeGreaterThan(3)
  })
})
