import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    TELEGRAM_BOT_TOKEN: 'test-token:ABCDEF',
    ...overrides,
  } as NodeJS.ProcessEnv
}

describe('loadConfig', () => {
  it('throws when TELEGRAM_BOT_TOKEN is missing', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  it('falls back to the default MINI_APP_URL when unset', () => {
    const config = loadConfig(makeEnv())
    expect(config.miniAppUrl).toBe('http://localhost:5173')
  })

  it('defaults to polling mode when BOT_WEBHOOK_URL is unset', () => {
    const config = loadConfig(makeEnv())
    expect(config.webhookUrl).toBeUndefined()
    expect(config.webhookSecret).toBeUndefined()
  })

  it('throws when BOT_WEBHOOK_URL is set but BOT_WEBHOOK_SECRET is missing', () => {
    expect(() =>
      loadConfig(makeEnv({ BOT_WEBHOOK_URL: 'https://bot.example.com' })),
    ).toThrow(/BOT_WEBHOOK_SECRET/)
  })

  it('throws when BOT_WEBHOOK_SECRET is shorter than 16 characters', () => {
    expect(() =>
      loadConfig(
        makeEnv({ BOT_WEBHOOK_URL: 'https://bot.example.com', BOT_WEBHOOK_SECRET: 'short' }),
      ),
    ).toThrow(/BOT_WEBHOOK_SECRET/)
  })

  it('accepts a webhook secret of 16+ characters', () => {
    const config = loadConfig(
      makeEnv({
        BOT_WEBHOOK_URL: 'https://bot.example.com',
        BOT_WEBHOOK_SECRET: 'a'.repeat(16),
      }),
    )
    expect(config.webhookUrl).toBe('https://bot.example.com')
    expect(config.webhookSecret).toBe('a'.repeat(16))
  })

  it('uses BOT_PORT when provided, otherwise defaults to 8788', () => {
    expect(loadConfig(makeEnv()).port).toBe(8788)
    expect(loadConfig(makeEnv({ BOT_PORT: '9000' })).port).toBe(9000)
  })
})
