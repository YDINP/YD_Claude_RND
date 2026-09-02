import { describe, expect, it, vi } from 'vitest'
import { ProviderHttpError, withRetry } from './retry.js'

describe('withRetry', () => {
  it('첫 시도에 성공하면 바로 반환한다', async () => {
    const fn = vi.fn(async () => 'ok')
    await expect(withRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('429는 재시도 후 성공할 수 있다', async () => {
    let attempts = 0
    const fn = vi.fn(async () => {
      attempts += 1
      if (attempts < 2) throw new ProviderHttpError('rate limited', 429)
      return 'ok'
    })
    const sleep = vi.fn(async () => {})
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('재시도 횟수를 넘기면 마지막 에러를 던진다', async () => {
    const fn = vi.fn(async () => {
      throw new ProviderHttpError('server error', 500)
    })
    const sleep = vi.fn(async () => {})
    await expect(withRetry(fn, { retries: 2, sleep })).rejects.toThrow('server error')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('재시도 대상이 아닌 에러(4xx 등)는 즉시 던진다', async () => {
    const fn = vi.fn(async () => {
      throw new ProviderHttpError('bad request', 400)
    })
    const sleep = vi.fn(async () => {})
    await expect(withRetry(fn, { sleep })).rejects.toThrow('bad request')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('일반 Error는 재시도하지 않는다', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(withRetry(fn, { sleep: vi.fn(async () => {}) })).rejects.toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('지수 백오프 지연을 계산한다', async () => {
    const fn = vi.fn(async () => {
      throw new ProviderHttpError('x', 500)
    })
    const delays: number[] = []
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms)
    })
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 100, sleep })).rejects.toThrow()
    expect(delays).toEqual([100, 200])
  })
})
