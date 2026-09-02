import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SPIN_LOCK_TIMEOUT_MS, SpinLock, SpinInProgressError, SpinTimeoutError } from './lock.js'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('SpinLock', () => {
  it('rejects a concurrent spin with a different key', async () => {
    const lock = new SpinLock()
    const gate = deferred()

    const first = lock.run('user-1', 'key-a', async () => {
      await gate.promise
      return 'first'
    })

    await expect(lock.run('user-1', 'key-b', async () => 'second')).rejects.toBeInstanceOf(SpinInProgressError)

    gate.resolve()
    await expect(first).resolves.toBe('first')
    expect(lock.size).toBe(0)
  })

  it('queues a concurrent spin with the same key instead of rejecting it', async () => {
    const lock = new SpinLock()
    const gate = deferred()
    const order: string[] = []

    const first = lock.run('user-1', 'key-a', async () => {
      await gate.promise
      order.push('first')
    })
    const second = lock.run('user-1', 'key-a', async () => {
      order.push('second')
    })

    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['first', 'second'])
  })

  it('does not block a different user', async () => {
    const lock = new SpinLock()
    const gate = deferred()

    const first = lock.run('user-1', 'key-a', async () => {
      await gate.promise
      return 1
    })
    await expect(lock.run('user-2', 'key-b', async () => 2)).resolves.toBe(2)

    gate.resolve()
    await first
  })

  it('releases the lock when the guarded work throws', async () => {
    const lock = new SpinLock()

    await expect(
      lock.run('user-1', 'key-a', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    expect(lock.size).toBe(0)
    await expect(lock.run('user-1', 'key-b', async () => 'ok')).resolves.toBe('ok')
  })
})

describe('SpinLock timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to 15 seconds', () => {
    expect(DEFAULT_SPIN_LOCK_TIMEOUT_MS).toBe(15_000)
  })

  it('gives up on a hung spin and releases the lock', async () => {
    vi.useFakeTimers()
    const lock = new SpinLock(1_000)
    // 절대 끝나지 않는 작업 = 멈춰 선 DB 질의.
    const hung = lock.run('user-1', 'key-a', () => new Promise<string>(() => {}))
    const rejected = expect(hung).rejects.toBeInstanceOf(SpinTimeoutError)

    expect(lock.size).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await rejected

    // 핵심: Map 항목이 남지 않아야 한다. 남으면 이 유저의 이후 스핀이 영원히 409가 된다.
    expect(lock.size).toBe(0)
  })

  it('lets the next spin through after a timeout instead of wedging the user', async () => {
    vi.useFakeTimers()
    const lock = new SpinLock(1_000)

    const hung = lock.run('user-1', 'key-a', () => new Promise<string>(() => {}))
    const rejected = expect(hung).rejects.toBeInstanceOf(SpinTimeoutError)
    await vi.advanceTimersByTimeAsync(1_000)
    await rejected

    await expect(lock.run('user-1', 'key-b', async () => 'ok')).resolves.toBe('ok')
  })

  it('does not time out work that finishes in time', async () => {
    vi.useFakeTimers()
    const lock = new SpinLock(1_000)

    const result = lock.run('user-1', 'key-a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return 'done'
    })

    await vi.advanceTimersByTimeAsync(100)
    await expect(result).resolves.toBe('done')

    // 타이머가 정리되지 않았다면 여기서 뒤늦은 거절이 터진다.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(lock.size).toBe(0)
  })

  it('treats a non-positive timeout as disabled', async () => {
    const lock = new SpinLock(0)
    await expect(lock.run('user-1', 'key-a', async () => 'ok')).resolves.toBe('ok')
  })
})
