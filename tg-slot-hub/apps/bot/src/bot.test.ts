import { describe, expect, it, vi } from 'vitest'
import type { Update } from 'grammy/types'
import { createBot, type CreateBotOptions } from './bot.js'
import type { BotConfig } from './config.js'

// grammY 문서가 권장하는 테스트 패턴: botInfo를 주입해 bot.init()의 getMe 호출을 건너뛴다.
// 정확한 UserFromGetMe 구조는 grammy 버전에 따라 미세하게 달라질 수 있어 unknown을 경유해 캐스팅한다.
const botInfo = {
  id: 42,
  is_bot: true,
  first_name: 'Slot Hub Bot',
  username: 'slothubtestbot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as unknown as NonNullable<CreateBotOptions['botInfo']>

const baseConfig: BotConfig = {
  token: 'test-token:ABCDEF',
  miniAppUrl: 'https://hub.example.com',
  port: 8788,
}

let updateId = 0

function makeStartUpdate(payload?: string, languageCode = 'en'): Update {
  updateId += 1
  const text = payload ? `/start ${payload}` : '/start'
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 100, type: 'private', first_name: 'Tester' },
      from: {
        id: 100,
        is_bot: false,
        first_name: 'Tester',
        language_code: languageCode,
      },
      text,
      entities: [{ offset: 0, length: 6, type: 'bot_command' }],
    },
  } as Update
}

/** bot.api.config.use로 실제 네트워크 호출을 가로채고, sendMessage 호출 payload만 수집한다. */
function interceptSendMessage(bot: ReturnType<typeof createBot>) {
  const calls: Array<Record<string, unknown>> = []
  bot.api.config.use((prev, method, payload, signal) => {
    if (method === 'sendMessage') {
      calls.push(payload as Record<string, unknown>)
      return Promise.resolve({
        ok: true,
        result: { message_id: 1, date: 0, chat: { id: 100, type: 'private' } },
      }) as ReturnType<typeof prev>
    }
    return prev(method, payload, signal)
  })
  return calls
}

describe('createBot /start', () => {
  it('replies with a welcome message containing a web_app inline button', async () => {
    const bot = createBot(baseConfig, { botInfo })
    await bot.init()
    const calls = interceptSendMessage(bot)

    await bot.handleUpdate(makeStartUpdate())

    expect(calls).toHaveLength(1)
    const replyMarkup = calls[0]?.reply_markup as {
      inline_keyboard: Array<Array<{ web_app?: { url: string } }>>
    }
    const button = replyMarkup.inline_keyboard[0]?.[0]
    expect(button?.web_app?.url).toBe(baseConfig.miniAppUrl)
  })

  it('passes a ref_<telegramId> start payload through as a startapp query param and logs it', async () => {
    const bot = createBot(baseConfig, { botInfo })
    await bot.init()
    const calls = interceptSendMessage(bot)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await bot.handleUpdate(makeStartUpdate('ref_123'))

    const replyMarkup = calls[0]?.reply_markup as {
      inline_keyboard: Array<Array<{ web_app?: { url: string } }>>
    }
    const button = replyMarkup.inline_keyboard[0]?.[0]
    expect(button?.web_app?.url).toBe(`${baseConfig.miniAppUrl}/?startapp=ref_123`)

    const referralLog = logSpy.mock.calls.find(([line]) =>
      typeof line === 'string' ? line.includes('referral_start') : false,
    )
    expect(referralLog).toBeDefined()
    expect(String(referralLog?.[0])).toContain('"referrerTelegramId":"123"')

    logSpy.mockRestore()
  })

  it('replies in Korean when the sender language_code is ko', async () => {
    const bot = createBot(baseConfig, { botInfo })
    await bot.init()
    const calls = interceptSendMessage(bot)

    await bot.handleUpdate(makeStartUpdate(undefined, 'ko'))

    expect(String(calls[0]?.text)).toContain('환영합니다')
  })
})

describe('createBot /help', () => {
  it('replies with locale-appropriate help text', async () => {
    const bot = createBot(baseConfig, { botInfo })
    await bot.init()
    const calls: Array<Record<string, unknown>> = []
    bot.api.config.use((prev, method, payload, signal) => {
      if (method === 'sendMessage') {
        calls.push(payload as Record<string, unknown>)
        return Promise.resolve({
          ok: true,
          result: { message_id: 1, date: 0, chat: { id: 100, type: 'private' } },
        }) as ReturnType<typeof prev>
      }
      return prev(method, payload, signal)
    })

    const update: Update = {
      update_id: 999,
      message: {
        message_id: 999,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 100, type: 'private', first_name: 'Tester' },
        from: { id: 100, is_bot: false, first_name: 'Tester', language_code: 'en' },
        text: '/help',
        entities: [{ offset: 0, length: 5, type: 'bot_command' }],
      },
    } as Update

    await bot.handleUpdate(update)

    expect(String(calls[0]?.text)).toContain('Slot Hub commands')
  })
})
