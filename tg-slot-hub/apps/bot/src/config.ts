/**
 * 봇 프로세스 설정.
 * 값은 `loadConfig()` 호출 시점에 읽는다 (import 시 부수효과 없음 → 테스트 친화적).
 */
export interface BotConfig {
  /** BotFather가 발급한 토큰. 필수 */
  token: string
  /** 미니앱(hub) URL. web_app 버튼과 메뉴 버튼에 사용 */
  miniAppUrl: string
  /** 설정 시 webhook 모드, 미설정 시 long polling 모드 */
  webhookUrl?: string
  /** Telegram이 보내는 X-Telegram-Bot-Api-Secret-Token 검증용 (webhook 모드에서만 의미 있음) */
  webhookSecret?: string
  /** webhook 모드에서 로컬 HTTP 서버가 바인딩할 포트 */
  port: number
}

const DEFAULT_MINI_APP_URL = 'http://localhost:5173'
const DEFAULT_PORT = 8788
/** grammY의 secretToken 검증에 실질적 의미가 있으려면 최소 이 길이 이상이어야 한다 (Telegram 상한은 256). */
const MIN_WEBHOOK_SECRET_LENGTH = 16

/** @internal 테스트에서 임의의 process.env 대체용으로 주입 가능 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('[bot/config] 필수 환경변수 누락: TELEGRAM_BOT_TOKEN')
  }

  let miniAppUrl = env.MINI_APP_URL
  if (!miniAppUrl) {
    miniAppUrl = DEFAULT_MINI_APP_URL
    console.warn(
      `[bot/config] MINI_APP_URL이 설정되지 않아 기본값(${DEFAULT_MINI_APP_URL})을 사용합니다. ` +
        '프로덕션 배포 전에는 반드시 설정하세요.',
    )
  }

  const webhookUrl = env.BOT_WEBHOOK_URL?.trim() || undefined
  const webhookSecret = env.BOT_WEBHOOK_SECRET?.trim() || undefined
  const port = env.BOT_PORT ? Number(env.BOT_PORT) : DEFAULT_PORT

  if (webhookUrl && (!webhookSecret || webhookSecret.length < MIN_WEBHOOK_SECRET_LENGTH)) {
    // 시크릿이 없으면 grammY가 X-Telegram-Bot-Api-Secret-Token을 검증하지 않아,
    // /telegram/webhook URL을 아는 누구나 가짜 업데이트(가짜 결제 등)를 주입할 수 있다.
    throw new Error(
      `[bot/config] BOT_WEBHOOK_URL이 설정된 경우 BOT_WEBHOOK_SECRET이 최소 ${MIN_WEBHOOK_SECRET_LENGTH}자 ` +
        '이상 필요합니다 (webhook 요청 위조 방지).',
    )
  }

  return { token, miniAppUrl, webhookUrl, webhookSecret, port }
}
