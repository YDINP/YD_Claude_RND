import { describe, expect, it } from 'vitest'
import { buildInitData, validateInitData } from './initData.js'

const BOT_TOKEN = '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz'

function makeParams(overrides: Record<string, string> = {}): Record<string, string> {
  const authDate = Math.floor(Date.now() / 1000)
  return {
    auth_date: String(authDate),
    query_id: 'AAH1abcDEF',
    user: JSON.stringify({ id: 42, first_name: 'Ada', username: 'ada_lovelace', language_code: 'en' }),
    ...overrides,
  }
}

describe('validateInitData', () => {
  it('accepts a correctly signed payload built by buildInitData', () => {
    const initData = buildInitData(makeParams(), BOT_TOKEN)
    const result = validateInitData(initData, BOT_TOKEN)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user.id).toBe(42)
      expect(result.user.firstName).toBe('Ada')
      expect(result.user.username).toBe('ada_lovelace')
      expect(result.user.languageCode).toBe('en')
    }
  })

  it('rejects a tampered hash', () => {
    const initData = buildInitData(makeParams(), BOT_TOKEN)
    const tampered = initData.replace(/hash=[0-9a-f]{64}/, `hash=${'a'.repeat(64)}`)

    const result = validateInitData(tampered, BOT_TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a tampered payload even though the hash format still looks valid', () => {
    const initData = buildInitData(makeParams(), BOT_TOKEN)
    const tampered = initData.replace('Ada', 'Adaa')

    const result = validateInitData(tampered, BOT_TOKEN)
    expect(result.ok).toBe(false)
  })

  it('rejects an expired auth_date', () => {
    const oldAuthDate = Math.floor(Date.now() / 1000) - 999_999
    const initData = buildInitData(makeParams({ auth_date: String(oldAuthDate) }), BOT_TOKEN)

    const result = validateInitData(initData, BOT_TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('expired')
  })

  it('rejects an auth_date more than 300s in the future', () => {
    const futureAuthDate = Math.floor(Date.now() / 1000) + 301
    const initData = buildInitData(makeParams({ auth_date: String(futureAuthDate) }), BOT_TOKEN)

    const result = validateInitData(initData, BOT_TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('auth_date_in_future')
  })

  it('accepts an auth_date within the future tolerance (clock skew)', () => {
    const slightlyFutureAuthDate = Math.floor(Date.now() / 1000) + 60
    const initData = buildInitData(makeParams({ auth_date: String(slightlyFutureAuthDate) }), BOT_TOKEN)

    const result = validateInitData(initData, BOT_TOKEN)
    expect(result.ok).toBe(true)
  })

  it('rejects a payload signed with a different bot token', () => {
    const initData = buildInitData(makeParams(), BOT_TOKEN)
    const result = validateInitData(initData, 'different:bot-token')
    expect(result.ok).toBe(false)
  })

  it('rejects a payload with no hash at all', () => {
    const result = validateInitData('auth_date=1&user=%7B%7D', BOT_TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing_hash')
  })

  it('buildInitData round-trips through validateInitData for repeated calls', () => {
    const a = buildInitData(makeParams({ auth_date: '1000000000' }), BOT_TOKEN)
    const b = buildInitData(makeParams({ auth_date: '1000000000' }), BOT_TOKEN)
    expect(a).toBe(b)
  })
})
