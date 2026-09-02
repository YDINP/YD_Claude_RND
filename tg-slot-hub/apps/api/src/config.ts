import { DEFAULT_SPIN_LOCK_TIMEOUT_MS } from './spin/lock.js'

/** apps/api 런타임 설정. 필수 값이 없으면 부팅 시점에 즉시 에러를 던진다. */
export interface ApiConfig {
  telegramBotToken: string
  jwtSecret: string
  /** 설정되어 있으면 Postgres(drizzle) 레포, 없으면 in-memory 레포 사용 */
  databaseUrl?: string
  port: number
  /** true일 때만 `mock:<telegramId>:<firstName>` initData를 서명 검증 없이 허용 */
  allowDevMock: boolean
  corsOrigin: string
  /** 유저별 스핀 락을 쥔 채 기다릴 수 있는 최대 시간(ms). 넘기면 락을 놓고 503을 돌려준다. */
  spinLockTimeoutMs: number
}

const DEFAULT_PORT = 8787

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN
  if (!telegramBotToken) {
    throw new Error('[config] TELEGRAM_BOT_TOKEN is required')
  }

  const jwtSecret = env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('[config] JWT_SECRET is required')
  }

  const port = env.API_PORT ? Number(env.API_PORT) : DEFAULT_PORT
  if (!Number.isFinite(port)) {
    throw new Error(`[config] API_PORT must be a number, got: ${env.API_PORT}`)
  }

  const spinLockTimeoutMs = env.SPIN_LOCK_TIMEOUT_MS
    ? Number(env.SPIN_LOCK_TIMEOUT_MS)
    : DEFAULT_SPIN_LOCK_TIMEOUT_MS
  if (!Number.isFinite(spinLockTimeoutMs) || spinLockTimeoutMs <= 0) {
    throw new Error(`[config] SPIN_LOCK_TIMEOUT_MS must be a positive number, got: ${env.SPIN_LOCK_TIMEOUT_MS}`)
  }

  const allowDevMock = env.API_ALLOW_DEV_MOCK === 'true'
  if (allowDevMock) {
    console.warn(
      '\n' +
        '!'.repeat(70) +
        '\n[config] API_ALLOW_DEV_MOCK=true — 서명 검증 없는 mock: initData가 허용됩니다.' +
        '\n[config] 개발/테스트 환경 전용입니다. 프로덕션에서는 절대 켜지 마세요.\n' +
        '!'.repeat(70) +
        '\n'
    )
  }

  return {
    telegramBotToken,
    jwtSecret,
    databaseUrl: env.DATABASE_URL || undefined,
    port,
    allowDevMock,
    corsOrigin: env.CORS_ORIGIN || '*',
    spinLockTimeoutMs,
  }
}
