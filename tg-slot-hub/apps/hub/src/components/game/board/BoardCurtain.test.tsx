import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardCurtain, planCurtain } from './BoardCurtain'
import { acquireClip, clipCacheSize } from './curtainClip'

describe('planCurtain', () => {
  const clip = { opaqueMs: 1200, durationMs: 3000 }

  it('클립이 준비되면 덮이는 시각 = opaqueMs, 끝 = durationMs, 걷히기는 끝 800ms 전이다', () => {
    const plan = planCurtain({ mode: 'enter', clip, clipReady: true, reducedMotion: false, speed: 'normal' })
    expect(plan).toEqual({ useClip: true, coveredAtMs: 1200, revealAtMs: 2200, endAtMs: 3000 })
  })

  it('복귀 클립은 덮인 채 시작한다(opaqueMs 0) — 교체가 곧장 일어난다', () => {
    const plan = planCurtain({ mode: 'exit', clip: { opaqueMs: 0, durationMs: 3000 }, clipReady: true, reducedMotion: false, speed: 'normal' })
    expect(plan.coveredAtMs).toBe(0)
    expect(plan.useClip).toBe(true)
  })

  it('opaqueMs 키가 없으면 진입은 1.1초, 복귀는 0초로 가정한다', () => {
    expect(planCurtain({ mode: 'enter', clip: {}, clipReady: true, reducedMotion: false, speed: 'normal' }).coveredAtMs).toBe(1100)
    expect(planCurtain({ mode: 'exit', clip: {}, clipReady: true, reducedMotion: false, speed: 'normal' }).coveredAtMs).toBe(0)
  })

  it('걷히기는 항상 덮인 뒤이고 끝은 걷히기 뒤다', () => {
    for (const c of [{ opaqueMs: 2900, durationMs: 3000 }, { opaqueMs: 0, durationMs: 500 }, {}]) {
      const plan = planCurtain({ mode: 'enter', clip: c, clipReady: true, reducedMotion: false, speed: 'quick' })
      expect(plan.revealAtMs).toBeGreaterThan(plan.coveredAtMs)
      expect(plan.endAtMs).toBeGreaterThan(plan.revealAtMs)
    }
  })

  it('클립이 없거나 못 받았거나 터보·모션 축소면 단색 커튼으로 짧게 돈다', () => {
    const solid = (p: Parameters<typeof planCurtain>[0]) => planCurtain(p).useClip
    expect(solid({ mode: 'enter', clip: undefined, clipReady: false, reducedMotion: false, speed: 'normal' })).toBe(false)
    expect(solid({ mode: 'enter', clip, clipReady: false, reducedMotion: false, speed: 'normal' })).toBe(false)
    expect(solid({ mode: 'enter', clip, clipReady: true, reducedMotion: true, speed: 'normal' })).toBe(false)
    expect(solid({ mode: 'enter', clip, clipReady: true, reducedMotion: false, speed: 'turbo' })).toBe(false)
    const reduced = planCurtain({ mode: 'enter', clip, clipReady: true, reducedMotion: true, speed: 'normal' })
    expect(reduced.endAtMs).toBeLessThanOrEqual(400)
  })
})

describe('BoardCurtain 시간 흐름', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('시작 → 덮임 → 걷힘 → 끝 순서로 한 번씩만 부른다', () => {
    const calls: string[] = []
    render(
      <BoardCurtain
        mode="enter"
        clip={undefined}
        clipUrl={null}
        reducedMotion={false}
        speed="normal"
        onStart={() => calls.push('start')}
        onCovered={() => calls.push('covered')}
        onReveal={() => calls.push('reveal')}
        onDone={() => calls.push('done')}
      />,
    )
    expect(calls).toEqual(['start'])
    act(() => vi.advanceTimersByTime(330))
    expect(calls).toEqual(['start', 'covered'])
    act(() => vi.advanceTimersByTime(60))
    expect(calls).toEqual(['start', 'covered', 'reveal'])
    act(() => vi.advanceTimersByTime(400))
    expect(calls).toEqual(['start', 'covered', 'reveal', 'done'])
    act(() => vi.advanceTimersByTime(5000))
    expect(calls).toHaveLength(4)
  })

  it('언마운트하면 남은 타이머를 거둔다', () => {
    const onDone = vi.fn()
    const { unmount } = render(
      <BoardCurtain mode="exit" clip={undefined} clipUrl={null} reducedMotion={false} speed="normal" onCovered={vi.fn()} onDone={onDone} />,
    )
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(5000))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('클립이 있으면 img를 얹고 클래스로 구분한다', () => {
    const { container } = render(
      <BoardCurtain
        mode="enter"
        clip={{ opaqueMs: 1000, durationMs: 2500 }}
        clipUrl="blob:test"
        reducedMotion={false}
        speed="normal"
        onCovered={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(container.querySelector('.board-curtain--clip')).not.toBeNull()
    expect(container.querySelector('img.board-curtain__clip')?.getAttribute('src')).toBe('blob:test')
  })
})

describe('curtainClip 캐시', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('URL이 없으면 빈 임대(null)이고 캐시에 남지 않는다', async () => {
    const before = clipCacheSize()
    const lease = acquireClip(undefined)
    await expect(lease.ready).resolves.toBeNull()
    lease.release()
    expect(clipCacheSize()).toBe(before)
  })

  it('같은 URL은 한 번만 받고, 마지막 사용자가 놓으면 Blob URL을 해제한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
    vi.stubGlobal('fetch', fetchMock)
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip-1')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const a = acquireClip('/games/x/theme/fs-enter.webp')
    const b = acquireClip('/games/x/theme/fs-enter.webp')
    await expect(a.ready).resolves.toBe('blob:clip-1')
    await expect(b.ready).resolves.toBe('blob:clip-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    a.release()
    expect(revoke).not.toHaveBeenCalled()
    b.release()
    b.release()
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect(clipCacheSize()).toBe(0)
  })

  it('받기에 실패하면 null(단색 커튼으로 폴백)이다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }))
    const lease = acquireClip('/games/x/theme/missing.webp')
    await expect(lease.ready).resolves.toBeNull()
    lease.release()
  })
})
