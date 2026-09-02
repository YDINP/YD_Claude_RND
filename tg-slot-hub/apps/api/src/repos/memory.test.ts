import { describe, expect, it } from 'vitest'
import { STARTING_COINS } from '@tgslot/shared'
import type { SpinResult } from '@tgslot/slot-engine'
import { MemoryRepos } from './memory.js'
import { InsufficientFundsError } from './types.js'
import type { ApplySpinInput } from './types.js'
import type { TelegramUser } from '../auth/initData.js'

/** 엔진을 부르지 않고 결과를 고정해 레포의 회계만 검사한다. */
function fixedResult(totalWin: number): SpinResult {
  return { stops: [1, 2, 3], grid: [['a', 'a', 'a']], wins: [], totalWin, features: [] }
}

function spinInput(userId: string, overrides: Partial<ApplySpinInput> = {}): ApplySpinInput {
  return {
    userId,
    gameId: 'classic-777',
    totalBet: 100,
    idempotencyKey: 'key-000000000001',
    compute: (nonce) => ({ result: fixedResult(250), seed: `seed-${nonce}`, seedHash: `hash-${nonce}` }),
    ...overrides,
  }
}

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

describe('MemoryRepos.applySpin', () => {
  async function newUser(): Promise<{ repos: MemoryRepos; userId: string }> {
    const repos = new MemoryRepos()
    const { user } = await repos.upsertFromTelegram(tgUser, 'en')
    return { repos, userId: user.id }
  }

  it('debits the bet, credits the win and keeps sum(ledger) == coins', async () => {
    const { repos, userId } = await newUser()

    const { round, wallet, replayed } = await repos.applySpin(spinInput(userId))

    expect(replayed).toBe(false)
    expect(round.nonce).toBe(1)
    expect(round.bet).toBe(100)
    expect(round.win).toBe(250)
    expect(wallet.coins).toBe(STARTING_COINS - 100 + 250)
    expect(repos.getLedgerSum(userId)).toBe(wallet.coins)
    expect(repos.countLedgerEntries(userId, 'spin_bet')).toBe(1)
    expect(repos.countLedgerEntries(userId, 'spin_win')).toBe(1)
  })

  it('writes no spin_win entry when the round pays nothing', async () => {
    const { repos, userId } = await newUser()

    await repos.applySpin(
      spinInput(userId, { compute: () => ({ result: fixedResult(0), seed: 's', seedHash: 'h' }) })
    )

    expect(repos.countLedgerEntries(userId, 'spin_win')).toBe(0)
    expect(repos.getLedgerSum(userId)).toBe(STARTING_COINS - 100)
  })

  it('replays a known idempotency key without recomputing or re-debiting', async () => {
    const { repos, userId } = await newUser()
    const first = await repos.applySpin(spinInput(userId))

    let computeCalls = 0
    const second = await repos.applySpin(
      spinInput(userId, {
        compute: (nonce) => {
          computeCalls += 1
          return { result: fixedResult(999), seed: `seed-${nonce}`, seedHash: `hash-${nonce}` }
        },
      })
    )

    expect(computeCalls).toBe(0)
    expect(second.replayed).toBe(true)
    expect(second.round).toEqual(first.round)
    expect(second.wallet).toEqual(first.wallet)
    expect(repos.countLedgerEntries(userId, 'spin_bet')).toBe(1)
  })

  it('throws InsufficientFundsError and leaves the wallet untouched', async () => {
    const { repos, userId } = await newUser()

    let computeCalls = 0
    await expect(
      repos.applySpin(
        spinInput(userId, {
          totalBet: STARTING_COINS + 1,
          compute: () => {
            computeCalls += 1
            return { result: fixedResult(0), seed: 's', seedHash: 'h' }
          },
        })
      )
    ).rejects.toBeInstanceOf(InsufficientFundsError)

    expect(computeCalls).toBe(0)
    expect(repos.getLedgerSum(userId)).toBe(STARTING_COINS)
  })

  it('exposes a stored round by id and nothing for an unknown id', async () => {
    const { repos, userId } = await newUser()
    const { round } = await repos.applySpin(spinInput(userId))

    expect(await repos.getRoundById(round.id)).toEqual(round)
    expect(await repos.getRoundById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
