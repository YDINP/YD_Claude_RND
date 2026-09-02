import { Bot, InlineKeyboard, type BotConfig as GrammyBotConfig, type Context } from 'grammy'
import type { BotConfig } from './config.js'
import { resolveLocale, t } from './i18n.js'

/** `/start ref_<telegramId>` 형태의 추천 딥링크 payload */
const REFERRAL_PAYLOAD_PATTERN = /^ref_(\d+)$/

export interface CreateBotOptions {
  /**
   * 테스트에서 getMe 네트워크 호출을 건너뛰기 위해 주입하는 봇 정보.
   * grammY의 `new Bot(token, { botInfo })`와 동일한 계약을 그대로 재사용한다.
   */
  botInfo?: GrammyBotConfig<Context>['botInfo']
}

/**
 * grammY Bot 인스턴스를 만든다. 실제 네트워크 연결(polling/webhook 시작)은 index.ts가 담당하고,
 * 이 함수는 핸들러 배선만 한다 (테스트에서 handleUpdate로 직접 검증 가능하도록).
 */
export function createBot(config: BotConfig, options: CreateBotOptions = {}) {
  const bot = new Bot(config.token, options.botInfo ? { botInfo: options.botInfo } : undefined)

  bot.command('start', async (ctx) => {
    const locale = resolveLocale(ctx.from?.language_code)
    const messages = t(locale)
    const payload = ctx.match?.trim()

    const referralMatch = payload ? REFERRAL_PAYLOAD_PATTERN.exec(payload) : null
    if (referralMatch) {
      // Phase 4에서 referrals 테이블에 영속화될 추천 의도. 지금은 구조화 로그만 남긴다.
      console.log(
        JSON.stringify({
          event: 'referral_start',
          referrerTelegramId: referralMatch[1],
          newUserTelegramId: ctx.from?.id,
          at: new Date().toISOString(),
        }),
      )
    }

    const name = ctx.from?.first_name ?? 'there'
    const webAppUrl = buildWebAppUrl(config.miniAppUrl, payload)
    const keyboard = new InlineKeyboard().webApp(messages.openHub, webAppUrl)

    await ctx.reply(messages.welcome(name), { reply_markup: keyboard })
  })

  bot.command('help', async (ctx) => {
    const locale = resolveLocale(ctx.from?.language_code)
    await ctx.reply(t(locale).help)
  })

  bot.catch((err) => {
    console.error('[bot] unhandled error', {
      updateId: err.ctx.update.update_id,
      message: err.error instanceof Error ? err.error.message : String(err.error),
    })
  })

  return bot
}

/** 미니앱 URL에 추천 payload를 startapp 쿼리 파라미터로 실어 보낸다. */
function buildWebAppUrl(miniAppUrl: string, startPayload: string | undefined): string {
  if (!startPayload) return miniAppUrl
  const url = new URL(miniAppUrl)
  url.searchParams.set('startapp', startPayload)
  return url.toString()
}
