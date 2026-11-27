import { describe, expect, it } from 'vitest'
import type { BonusClaimResponse, LeaderboardResponse } from '@tgslot/shared'
import type { SpinResult } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR, LEADERBOARD_REWARDS } from '../economy/config.js'

const GAME_ID = 'classic-777'
const DAY_MS = 24 * 60 * 60 * 1000
// 2026-09-02는 W36(수요일). 이틀 뒤 일요일까지 W36, 09-07(월)부터 W37.
const START_AT = '2026-09-02T09:00:00Z'

const classicPack = loadGamePacks().find((pack) => pack.id === GAME_ID)
if (!classicPack) throw new Error('classic-777 팩이 없다')

function makeClock(startIso: string) {
  let current = new Date(startIso)
  return {
    now: (): Date => current,
    advance(ms: number): void {
      current = new Date(current.getTime() + ms)
    },
  }
}

function makeConfig(): ApiConfig {
  return {
    telegramBotToken: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevAuth: true,
    allowDebugSpin: true,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
  }
}

function setup() {
  const clock = makeClock(START_AT)
  const repos = new MemoryRepos(clock.now)
  const app = createApp({
    config: makeConfig(),
    repos,
    games: createGameRegistry([classicPack!]),
    clock: clock.now,
  })
  return { clock, repos, app }
}

type Harness = ReturnType<typeof setup>

async function login(harness: Harness, telegramId: number): Promise<{ token: string; userId: string }> {
  const res = await harness.app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: `mock:${telegramId}:User${telegramId}` }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { token: body.token, userId: body.user.id }
}

async function authed(harness: Harness, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return harness.app.request(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers },
  })
}

function fixedSpin(harness: Harness, userId: string, key: string, win: number) {
  const result: SpinResult = {
    stops: [0, 0, 0],
    gridBefore: [['a', 'a', 'a']],
    grid: [['a', 'a', 'a']],
    mutations: [],
    wins: [],
    lineWin: win,
    scatterWin: 0,
    totalWin: win,
    features: [],
  }
  return harness.repos.applySpin({
    userId,
    gameId: GAME_ID,
    totalBet: 100,
    idempotencyKey: key,
    compute: () => ({
      result,
      seed: 'seed',
      seedHash: 'hash',
      jackpotRoll: JACKPOT_ODDS_DENOMINATOR - 1,
      features: [],
    }),
  })
}

async function getBoard(harness: Harness, token: string): Promise<LeaderboardResponse> {
  return (await (await authed(harness, token, '/leaderboard')).json()) as LeaderboardResponse
}

describe('GET /leaderboard 보상 표', () => {
  it('보상 표를 항상 돌려주고 지난 주 기록이 없으면 lastWeek는 null이다', async () => {
    const harness = setup()
    const { token } = await login(harness, 9001)

    const body = await getBoard(harness, token)

    expect(body.rewards).toEqual(LEADERBOARD_REWARDS.map((tier) => ({ ...tier })))
    expect(body.rewards?.[0]).toEqual({ fromRank: 1, toRank: 1, coins: 10000 })
    expect(body.lastWeek).toBeNull()
    expect(body.entries).toEqual([])
    expect(body.me).toBeNull()
  })
})

describe('지난 주 보상 받기', () => {
  it('지난 주 1위는 10,000 코인을 한 번만 받는다 (200 -> 409, 원장 1행)', async () => {
    const harness = setup()
    const { token, userId } = await login(harness, 9001)
    await fixedSpin(harness, userId, 'lb-reward-000001', 500)

    // 같은 주에는 아직 받을 수 없다.
    expect((await authed(harness, token, '/leaderboard/claim', { method: 'POST' })).status).toBe(409)

    harness.clock.advance(6 * DAY_MS) // 2026-09-08, W37
    const board = await getBoard(harness, token)
    expect(board.week).toBe('2026-W37')
    expect(board.lastWeek).toEqual({ week: '2026-W36', rank: 1, reward: 10000, claimed: false })

    const before = (await harness.repos.getWallet(userId))!.coins
    const first = await authed(harness, token, '/leaderboard/claim', { method: 'POST' })
    expect(first.status).toBe(200)
    const claimed = (await first.json()) as BonusClaimResponse
    expect(claimed.amount).toBe(10000)
    expect(claimed.wallet.coins).toBe(before + 10000)

    const second = await authed(harness, token, '/leaderboard/claim', { method: 'POST' })
    expect(second.status).toBe(409)
    expect(((await second.json()) as { code: string }).code).toBe('NOT_CLAIMABLE')

    expect(harness.repos.countLedgerEntries(userId, 'leaderboard_reward')).toBe(1)
    expect(harness.repos.findDuplicateLedgerRefs(userId)).toEqual([])
    expect((await getBoard(harness, token)).lastWeek).toMatchObject({ claimed: true })
  })

  it('2주 전 기록은 소멸해 받을 수 없다', async () => {
    const harness = setup()
    const { token, userId } = await login(harness, 9001)
    await fixedSpin(harness, userId, 'lb-reward-000002', 500)

    harness.clock.advance(13 * DAY_MS) // 2026-09-15, W38. 지난 주는 W37
    expect((await getBoard(harness, token)).lastWeek).toBeNull()
    expect((await authed(harness, token, '/leaderboard/claim', { method: 'POST' })).status).toBe(409)
    expect(harness.repos.countLedgerEntries(userId, 'leaderboard_reward')).toBe(0)
  })

  it('지난 주 51위는 보상 대상이 아니다', async () => {
    const harness = setup()
    const me = await login(harness, 9000)
    await fixedSpin(harness, me.userId, 'lb-me-000000001', 1)
    for (let i = 0; i < 50; i += 1) {
      const other = await login(harness, 9100 + i)
      await fixedSpin(harness, other.userId, `lb-other-${String(i).padStart(7, '0')}`, 1000 + i)
    }

    harness.clock.advance(6 * DAY_MS)
    const board = await getBoard(harness, me.token)
    expect(board.lastWeek).toBeNull()
    expect((await authed(harness, me.token, '/leaderboard/claim', { method: 'POST' })).status).toBe(409)
  })

  it('지난 주 당첨이 0이면 순위가 있어도 보상 대상이 아니다', async () => {
    const harness = setup()
    const { token, userId } = await login(harness, 9300)
    await fixedSpin(harness, userId, 'lb-zero-0000001', 0)

    harness.clock.advance(6 * DAY_MS)
    expect((await getBoard(harness, token)).lastWeek).toBeNull()
    expect((await authed(harness, token, '/leaderboard/claim', { method: 'POST' })).status).toBe(409)
  })

  it('순위별 보상 금액이 표를 따른다 (3위 4,000, 4위 2,000)', async () => {
    const harness = setup()
    const users: { token: string; userId: string }[] = []
    for (let i = 0; i < 4; i += 1) {
      const user = await login(harness, 9200 + i)
      users.push(user)
      await fixedSpin(harness, user.userId, `lb-rank-${String(i).padStart(8, '0')}`, 4000 - i * 100)
    }

    harness.clock.advance(6 * DAY_MS)
    const third = await getBoard(harness, users[2]!.token)
    const fourth = await getBoard(harness, users[3]!.token)
    expect(third.lastWeek).toMatchObject({ rank: 3, reward: 4000 })
    expect(fourth.lastWeek).toMatchObject({ rank: 4, reward: 2000 })
  })
})
