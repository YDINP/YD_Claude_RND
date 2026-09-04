import { describe, expect, it } from 'vitest'
import { evaluateTapGesture, TAP_GESTURE_COUNT, TAP_GESTURE_MAX_GAP_MS } from './tapGesture'

describe('evaluateTapGesture', () => {
  it('is not complete before 5 quick taps', () => {
    const timestamps = [0, 100, 200, 300]
    const result = evaluateTapGesture(timestamps)
    expect(result.complete).toBe(false)
    expect(result.remaining).toEqual(timestamps)
  })

  it('completes on the 5th quick tap', () => {
    const timestamps = [0, 100, 200, 300, 400]
    expect(timestamps.length).toBe(TAP_GESTURE_COUNT)
    const result = evaluateTapGesture(timestamps)
    expect(result.complete).toBe(true)
    expect(result.remaining).toEqual([])
  })

  it('drops taps that are older than the max gap and restarts counting from the break', () => {
    const timestamps = [0, 100, 200, 200 + TAP_GESTURE_MAX_GAP_MS + 1, 900]
    const result = evaluateTapGesture(timestamps)
    // 3번째와 4번째 사이 간격이 너무 벌어졌으므로 그 이전 탭은 이번 시퀀스로 안 쳐준다.
    expect(result.complete).toBe(false)
    expect(result.remaining).toEqual([200 + TAP_GESTURE_MAX_GAP_MS + 1, 900])
  })

  it('returns not complete with an empty array for no taps', () => {
    expect(evaluateTapGesture([])).toEqual({ complete: false, remaining: [] })
  })

  it('a single tap is never complete', () => {
    expect(evaluateTapGesture([0]).complete).toBe(false)
  })
})
