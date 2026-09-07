import { DEFAULT_SPIN_LOCK_TIMEOUT_MS } from './spin/lock.js'

/** apps/api 런타임 설정. 필수 값이 없으면 부팅 시점에 즉시 에러를 던진다. */
export interface ApiConfig {
  telegramBotToken: string
  jwtSecret: string
  /** 설정되어 있으면 Postgres(drizzle) 레포, 없으면 in-memory 레포 사용 */
  databaseUrl?: string
  port: number
  /**
   * true일 때만 `mock:<telegramId>:<firstName>` initData를 서명 검증 없이 허용한다.
   * 즉 **임의 유저 사칭**을 여는 스위치다. 결과 강제(`allowDebugSpin`)와는 별개다.
   */
  allowDevAuth: boolean
  /**
   * true일 때만 `SpinRequest.debug` 강제 프리셋을 허용한다.
   * 즉 **스핀 결과 강제**를 여는 스위치다. 로그인 방식(`allowDevAuth`)과는 별개다.
   */
  allowDebugSpin: boolean
  corsOrigin: string
  /** 유저별 스핀 락을 쥔 채 기다릴 수 있는 최대 시간(ms). 넘기면 락을 놓고 503을 돌려준다. */
  spinLockTimeoutMs: number
}

const DEFAULT_PORT = 8787
const DEFAULT_DEV_CORS_ORIGIN = '*'

/**
 * 개발 전용 스위치. 성격이 다르므로 **하나씩 따로** 켠다.
 *
 * 예전에는 `API_ALLOW_DEV_MOCK` 하나가 둘을 동시에 열었다. 한쪽은 "임의 유저로 로그인",
 * 다른 쪽은 "스핀 결과 강제"라 권한의 성격이 전혀 다른데도 묶여 있어서, 로컬에서 mock 로그인만
 * 쓰려고 켠 플래그가 결과 강제까지 함께 열었다. 둘이 결합하면 "임의 유저로 로그인해 원하는 결과를
 * 뽑는다"가 그대로 성립한다.
 */
const DEV_AUTH_FLAG = 'API_ALLOW_DEV_AUTH'
const DEBUG_SPIN_FLAG = 'API_ALLOW_DEBUG_SPIN'
/** 위 둘로 쪼개기 전의 이름. 남아 있으면 조용히 무시하지 않고 부팅을 막는다 (아래 주석 참고). */
const REMOVED_COMBINED_FLAG = 'API_ALLOW_DEV_MOCK'

function isEnabled(value: string | undefined): boolean {
  return value === 'true'
}

function warnDevFlag(flag: string, whatItOpens: string): void {
  console.warn(
    '\n' +
      '!'.repeat(70) +
      `\n[config] ${flag}=true — ${whatItOpens}` +
      '\n[config] 개발/테스트 환경 전용입니다. 프로덕션에서는 절대 켜지 마세요.\n' +
      '!'.repeat(70) +
      '\n'
  )
}

/**
 * 프로덕션에서 위험한 조합을 **부팅 단계에서 거부한다.**
 *
 * 예전에는 경고만 찍고 그대로 떴는데, 경고는 배포 로그에 묻힌다. 여기 걸리는 것들은
 * 전부 "떠 있으면 안 되는 상태"라 기동 실패로 알리는 편이 안전하다.
 */
function assertProductionSafe(env: NodeJS.ProcessEnv): void {
  const problems: string[] = []

  if (isEnabled(env[DEV_AUTH_FLAG])) {
    problems.push(`${DEV_AUTH_FLAG}=true (서명 검증 없는 mock 로그인 = 임의 유저 사칭)`)
  }
  if (isEnabled(env[DEBUG_SPIN_FLAG])) {
    problems.push(`${DEBUG_SPIN_FLAG}=true (스핀 결과 강제)`)
  }
  if (!env.CORS_ORIGIN) {
    // 개발 기본값 `*`가 프로덕션까지 따라오면, 환경변수를 빠뜨린 것만으로 전면 개방이 된다.
    problems.push('CORS_ORIGIN 미설정 (미니앱 도메인을 명시해야 한다)')
  }
  if (!env.DATABASE_URL) {
    // in-memory 레포는 프로세스 메모리에만 살아서 인스턴스를 여러 개 띄우면 상태가 갈라지고,
    // `spin/lock.ts`의 인프로세스 락도 인스턴스 경계를 넘지 못해 이중 차감 방어가 사라진다.
    // (DB 경로에서는 지갑 row lock과 rounds 유니크가 실질 방어라 인스턴스가 늘어도 안전하다.)
    problems.push('DATABASE_URL 미설정 (프로덕션에서 in-memory 레포는 허용하지 않는다)')
  }

  if (problems.length > 0) {
    throw new Error(
      `[config] NODE_ENV=production에서 허용되지 않는 설정입니다:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n')
    )
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN
  if (!telegramBotToken) {
    throw new Error('[config] TELEGRAM_BOT_TOKEN is required')
  }

  const jwtSecret = env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('[config] JWT_SECRET is required')
  }

  // 이름이 사라졌는데 값만 남아 있으면 "아직 켜져 있다"고 착각한 채 배포된다.
  // 반대로 끄려고 지웠는데 사실 다른 플래그가 열려 있는 경우도 마찬가지다. 그래서 무시하지 않고 막는다.
  if (env[REMOVED_COMBINED_FLAG] !== undefined) {
    throw new Error(
      `[config] ${REMOVED_COMBINED_FLAG}은(는) 제거됐습니다. 서로 다른 권한이라 두 개로 나뉘었습니다:\n` +
        `  - ${DEV_AUTH_FLAG}=true    서명 검증 없는 mock 로그인 (임의 유저 사칭)\n` +
        `  - ${DEBUG_SPIN_FLAG}=true  스핀 결과 강제 프리셋\n` +
        `  필요한 쪽만 켜고 ${REMOVED_COMBINED_FLAG}은(는) 지우세요.`
    )
  }

  if (env.NODE_ENV === 'production') {
    assertProductionSafe(env)
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

  const allowDevAuth = isEnabled(env[DEV_AUTH_FLAG])
  const allowDebugSpin = isEnabled(env[DEBUG_SPIN_FLAG])
  if (allowDevAuth) warnDevFlag(DEV_AUTH_FLAG, '서명 검증 없는 mock: initData가 허용됩니다 (임의 유저 사칭).')
  if (allowDebugSpin) warnDevFlag(DEBUG_SPIN_FLAG, 'SpinRequest.debug로 스핀 결과를 강제할 수 있습니다.')

  return {
    telegramBotToken,
    jwtSecret,
    databaseUrl: env.DATABASE_URL || undefined,
    port,
    allowDevAuth,
    allowDebugSpin,
    corsOrigin: env.CORS_ORIGIN || DEFAULT_DEV_CORS_ORIGIN,
    spinLockTimeoutMs,
  }
}
