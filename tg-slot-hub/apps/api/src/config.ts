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
  }
}
