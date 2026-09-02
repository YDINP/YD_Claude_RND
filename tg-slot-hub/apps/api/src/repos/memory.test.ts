import { describe, expect, it } from 'vitest'
import { STARTING_COINS } from '@tgslot/shared'
import { MemoryRepos } from './memory.js'
import type { TelegramUser } from '../auth/initData.js'

const tgUser: TelegramUser = { id: 9001, firstName: 'Ada', username: 'ada' }

describe('MemoryRepos.upsertFromTelegram', () => {
  it('creates a new user with STARTING_COINS on first call', async () => {
    const repos = new MemoryRepos()
    const result = await repos.upsertFromTelegram(tgUser, 'en')

    expect(result.created).toBe(true)
    expect(result.user.locale).toBe('en')
    expect(result.wallet.coins).toBe(STARTING_COINS)
  })

  it('updates locale, firstName and username on a later login without re-crediting', async () => {
    const repos = new MemoryRepos()
    const first = await repos.upsertFromTelegram(tgUser, 'en')

    const second = await repos.upsertFromTelegram({ id: 9001, firstName: 'Ada Renamed', username: 'ada2' }, 'ko')

    expect(second.created).toBe(false)
    expect(second.user.id).toBe(first.user.id)
    expect(second.user.locale).toBe('ko')
    expect(second.user.firstName).toBe('Ada Renamed')
    expect(second.user.username).toBe('ada2')
    expect(second.wallet.coins).toBe(first.wallet.coins)
  })

  it('keeps the existing username when a later login omits it', async () => {
    const repos = new MemoryRepos()
    await repos.upsertFromTelegram(tgUser, 'en')

    const second = await repos.upsertFromTelegram({ id: 9001, firstName: 'Ada' }, 'en')
    expect(second.user.username).toBe('ada')
  })
})
