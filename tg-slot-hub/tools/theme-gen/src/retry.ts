import { RETRY_BASE_DELAY_MS, RETRY_COUNT } from './constants.js'

/** 프로바이더 HTTP 호출 실패를 나타낸다. status로 재시도 여부를 판단한다. */
export class ProviderHttpError extends Error {
  override name = 'ProviderHttpError'
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
  shouldRetry?: (error: unknown) => boolean
  sleep?: (ms: number) => Promise<void>
}

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof ProviderHttpError) return error.status === 429 || error.status >= 500
  return false
}

const defaultSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 429/5xx 응답만 지수 백오프로 재시도한다. 그 외 오류는 즉시 던진다. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? RETRY_COUNT
  const baseDelayMs = options.baseDelayMs ?? RETRY_BASE_DELAY_MS
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry
  const sleep = options.sleep ?? defaultSleep

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === retries || !shouldRetry(error)) throw error
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }
  throw lastError
}
