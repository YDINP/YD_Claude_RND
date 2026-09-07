import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { SpinResponse } from '@tgslot/shared'
import { createSeededRng, parseGameMath, spin } from '@tgslot/slot-engine'
import type { WinLine as EngineWinLine } from '@tgslot/slot-engine'
import { randomUUID } from 'node:crypto'
import { createApp } from '../app.js'
import { createJwtService } from '../auth/jwt.js'
import { MemoryRepos } from '../repos/memory.js'
import { InsufficientFundsError } from '../repos/types.js'
import type { ApplySpinInput, ApplySpinResult } from '../repos/types.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { GameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import type { RoundSeedResponse } from './rounds.js'

const GAME_ID = 'classic-777'
/** 레벨 1이 해금한 상한(100)과 같은 베팅. 레벨 잠금에 걸리지 않는 최대값이다. */
const BET = 100

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    telegramBotToken: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevAuth: true,
    allowDebugSpin: true,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
    ...overrides,
  }
}

const diskPacks = loadGamePacks()

function classicPack(): GamePack {
  const pack = diskPacks.find((candidate) => candidate.id === GAME_ID)
  if (!pack) throw new Error(`${GAME_ID} 팩이 없다`)
  return pack
}

function hiddenPack(): GamePack {
  const pack = classicPack()
  return {
    ...pack,
    id: 'secret-lab',
    manifest: { ...pack.manifest, id: 'secret-lab', status: 'hidden' },
    summary: { ...pack.summary, id: 'secret-lab', status: 'hidden' },
  }
}

interface Harness {
  app: ReturnType<typeof createApp>
  repos: MemoryRepos
  token: string
  userId: string
}

async function setup(
  registry?: GameRegistry,
  options: { repos?: MemoryRepos; config?: Partial<ApiConfig> } = {}
): Promise<Harness> {
  const repos = options.repos ?? new MemoryRepos()
  const app = createApp({
    config: makeConfig(options.config),
    repos,
    games: registry ?? createGameRegistry([classicPack()]),
  })

  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:7001:Spinner' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

async function spinRequest(
  harness: Harness,
  options: { gameId?: string; totalBet?: number; idempotencyKey: string; token?: string }
): Promise<Response> {
  return harness.app.request(`/games/${options.gameId ?? GAME_ID}/spin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.token ?? harness.token}`,
    },
    body: JSON.stringify({ totalBet: options.totalBet ?? BET, idempotencyKey: options.idempotencyKey }),
  })
}

describe('POST /games/:id/spin', () => {
  it('debits the bet, credits the win and returns the post-spin wallet', async () => {
    const harness = await setup()

    const res = await spinRequest(harness, { idempotencyKey: 'key-happy-000001' })

    expect(res.status).toBe(200)
    const body = (await res.json()) as SpinResponse
    expect(body.totalBet).toBe(BET)
    expect(body.totalWin).toBeGreaterThanOrEqual(0)
    expect(body.wallet.coins).toBe(STARTING_COINS - BET + body.totalWin)
    expect(body.stops).toHaveLength(classicPack().math.reels)
    expect(body.grid).toHaveLength(classicPack().math.rows)
    expect(body.nonce).toBe(1)
    expect(body.seedHash).toMatch(/^[0-9a-f]{64}$/)

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(body.wallet.coins)
  })

  it('keeps sum(ledger) == wallet.coins across 25 spins', async () => {
    const harness = await setup()

    let expected = STARTING_COINS
    for (let i = 0; i < 25; i += 1) {
      const res = await spinRequest(harness, { idempotencyKey: `key-invariant-${String(i).padStart(6, '0')}` })
      expect(res.status).toBe(200)
      const body = (await res.json()) as SpinResponse
      expected = expected - BET + body.totalWin
      expect(body.wallet.coins).toBe(expected)
      expect(body.nonce).toBe(i + 1)
    }

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(expected)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(expected)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(25)
  })

  it('replays the identical result for a repeated idempotency key without a second debit', async () => {
    const harness = await setup()

    const first = await spinRequest(harness, { idempotencyKey: 'key-idem-000001' })
    const firstBody = (await first.json()) as SpinResponse

    const second = await spinRequest(harness, { idempotencyKey: 'key-idem-000001' })
    const secondBody = (await second.json()) as SpinResponse

    expect(second.status).toBe(200)
    expect(secondBody).toEqual(firstBody)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS - BET + firstBody.totalWin)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)
  })

  it('rejects a bet the wallet cannot cover with 402 INSUFFICIENT_FUNDS', async () => {
    // 레벨 1의 베팅 상한(100)보다 큰 베팅은 잔액 판정 전에 BET_LOCKED로 막히므로,
    // 잔액 부족은 레포가 던지게 해서 라우트의 402 번역만 확인한다.
    // 지갑/원장이 그대로 남는다는 사실 자체는 repos/memory.test.ts가 검사한다.
    const harness = await setup(undefined, { repos: new BrokeRepos() })

    const res = await spinRequest(harness, { idempotencyKey: 'key-broke-000001' })

    expect(res.status).toBe(402)
    expect(((await res.json()) as { code: string }).code).toBe('INSUFFICIENT_FUNDS')

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(STARTING_COINS)
  })

  it('rejects a bet outside betLevels with 400 INVALID_BET', async () => {
    const harness = await setup()

    const res = await spinRequest(harness, { idempotencyKey: 'key-badbet-00001', totalBet: 37 })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('INVALID_BET')

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS)
  })

  it('rejects a malformed body with 400', async () => {
    const harness = await setup()

    const res = await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'short' }),
    })

    expect(res.status).toBe(400)
  })

  it('rejects an unauthenticated spin with 401', async () => {
    const harness = await setup()

    const res = await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'key-noauth-00001' }),
    })

    expect(res.status).toBe(401)
  })

  it('rejects a token whose user no longer exists with 401 USER_NOT_FOUND', async () => {
    const harness = await setup()
    const jwt = createJwtService(makeConfig().jwtSecret)
    const orphanToken = await jwt.signToken({ sub: randomUUID(), tid: 999_999 })

    const res = await spinRequest(harness, { idempotencyKey: 'key-orphan-00001', token: orphanToken })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'User not found', code: 'USER_NOT_FOUND' })
    // 인증에서 잘렸으므로 회계는 그대로다.
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(STARTING_COINS)
  })

  it('returns 404 GAME_NOT_FOUND for an unknown game', async () => {
    const harness = await setup()

    const res = await spinRequest(harness, { gameId: 'no-such-game', idempotencyKey: 'key-unknown-0001' })

    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('GAME_NOT_FOUND')
  })

  it('returns 404 GAME_NOT_FOUND for a hidden game', async () => {
    const harness = await setup(createGameRegistry([classicPack(), hiddenPack()]))

    const res = await spinRequest(harness, { gameId: 'secret-lab', idempotencyKey: 'key-hidden-00001' })

    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('GAME_NOT_FOUND')
  })
})

describe('심볼 그룹 당첨 라인', () => {
  it('group을 응답에 그대로 싣고, 재전송에서도 복원한다', async () => {
    const harness = await setup(undefined, { repos: new FixedWinRepos(GROUP_WIN) })

    const first = (await (await spinRequest(harness, { idempotencyKey: 'key-group-00001' })).json()) as SpinResponse
    expect(first.wins).toHaveLength(1)
    expect(first.wins[0]?.group).toBe('anybar')
    expect(first.wins[0]?.symbol).toBe('bar1')

    // 재전송은 저장된 라운드(wins jsonb)에서 복원한다. group이 살아남아야 한다.
    const replay = (await (await spinRequest(harness, { idempotencyKey: 'key-group-00001' })).json()) as SpinResponse
    expect(replay).toEqual(first)
    expect(replay.wins[0]?.group).toBe('anybar')

    // 스키마도 통과해야 한다 (group은 optional).
    expect(SpinResponseSchema.safeParse(replay).success).toBe(true)
  })

  it('group이 없는 라인은 응답에 키를 만들지 않는다', async () => {
    const harness = await setup(undefined, { repos: new FixedWinRepos(PLAIN_WIN) })

    const body = (await (await spinRequest(harness, { idempotencyKey: 'key-nogroup-0001' })).json()) as SpinResponse

    expect(body.wins).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(body.wins[0], 'group')).toBe(false)
  })
})

describe('spin concurrency', () => {
  it('never corrupts the balance when 5 spins with different keys race', async () => {
    const harness = await setup()

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        spinRequest(harness, { idempotencyKey: `key-race-${String(i).padStart(6, '0')}` })
      )
    )

    const statuses = responses.map((res) => res.status)
    expect(statuses.every((status) => status === 200 || status === 409)).toBe(true)
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(1)

    const bodies = await Promise.all(responses.map((res) => res.json() as Promise<Record<string, unknown>>))
    const succeeded = bodies.filter((_, i) => statuses[i] === 200) as unknown as SpinResponse[]
    const conflicts = bodies.filter((_, i) => statuses[i] === 409)
    for (const body of conflicts) {
      expect(body.code).toBe('SPIN_IN_PROGRESS')
    }

    const expected = succeeded.reduce((coins, body) => coins - BET + body.totalWin, STARTING_COINS)

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(expected)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(expected)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(succeeded.length)
    // 성공한 스핀의 nonce는 1..n으로 겹치지 않는다.
    expect([...new Set(succeeded.map((body) => body.nonce))].sort((a, b) => a - b)).toEqual(
      succeeded.map((_, i) => i + 1)
    )
  })

  it('serializes concurrent requests that share one idempotency key into a single round', async () => {
    const harness = await setup()

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => spinRequest(harness, { idempotencyKey: 'key-same-000001' }))
    )

    expect(responses.every((res) => res.status === 200)).toBe(true)
    const bodies = (await Promise.all(responses.map((res) => res.json()))) as SpinResponse[]
    for (const body of bodies) {
      expect(body).toEqual(bodies[0])
    }
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)
  })
})

describe('GET /rounds/:id/seed', () => {
  it('reveals a seed whose hash matches and which reproduces the round', async () => {
    const harness = await setup()

    const spinRes = await spinRequest(harness, { idempotencyKey: 'key-fair-000001' })
    const round = (await spinRes.json()) as SpinResponse

    const res = await harness.app.request(`/rounds/${round.roundId}/seed`, {
      headers: { authorization: `Bearer ${harness.token}` },
    })

    expect(res.status).toBe(200)
    const reveal = (await res.json()) as RoundSeedResponse

    expect(createHash('sha256').update(reveal.seed).digest('hex')).toBe(round.seedHash)
    expect(reveal.seedInput).toBe(`${reveal.seed}:${round.nonce}`)

    const replay = spin(classicPack().math, { totalBet: BET }, createSeededRng(reveal.seedInput))
    expect(replay.stops).toEqual(round.stops)
    expect(replay.grid).toEqual(round.grid)
    expect(replay.totalWin).toBe(round.totalWin)
  })

  it('returns 404 for a round that belongs to another user', async () => {
    const harness = await setup()
    const spinRes = await spinRequest(harness, { idempotencyKey: 'key-owner-000001' })
    const round = (await spinRes.json()) as SpinResponse

    const otherLogin = await harness.app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'mock:7002:Nosy' }),
    })
    const other = (await otherLogin.json()) as { token: string }

    const res = await harness.app.request(`/rounds/${round.roundId}/seed`, {
      headers: { authorization: `Bearer ${other.token}` },
    })

    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('ROUND_NOT_FOUND')
  })

  it('requires authentication', async () => {
    const harness = await setup()
    const res = await harness.app.request('/rounds/00000000-0000-0000-0000-000000000000/seed')
    expect(res.status).toBe(401)
  })
})

describe('GET /games/:id/math', () => {
  it('returns math the engine can parse, with a cacheable header', async () => {
    const harness = await setup()

    const res = await harness.app.request(`/games/${GAME_ID}/math`)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const body = await res.json()
    const math = parseGameMath(body)
    expect(math.id).toBe(GAME_ID)
    expect(math.betLevels).toContain(BET)
  })

  it('returns 404 for unknown and hidden games', async () => {
    const harness = await setup(createGameRegistry([classicPack(), hiddenPack()]))

    expect((await harness.app.request('/games/no-such-game/math')).status).toBe(404)
    expect((await harness.app.request('/games/secret-lab/math')).status).toBe(404)
  })
})

/**
 * 엔진 결과의 wins만 갈아끼우는 레포. 심볼 그룹(Any BAR)으로 지급된 라인은 실제로 만들려면
 * 특정 스트립 조합을 노려야 해서, 회계·저장 경로는 그대로 두고 결과만 바꾼다.
 */
class FixedWinRepos extends MemoryRepos {
  constructor(private readonly winLine: EngineWinLine) {
    super()
  }

  override applySpin(input: ApplySpinInput): Promise<ApplySpinResult> {
    return super.applySpin({
      ...input,
      compute: (nonce) => {
        const computed = input.compute(nonce)
        return {
          ...computed,
          result: { ...computed.result, wins: [this.winLine], totalWin: this.winLine.win },
        }
      },
    })
  }
}

/** 그룹으로 지급된 라인 1건. `group`이 라운드 저장까지 살아남는지 확인하는 데 쓴다. */
const GROUP_WIN: EngineWinLine = {
  line: 0,
  symbol: 'bar1',
  count: 3,
  multiplier: 4,
  win: 80,
  positions: [
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  group: 'anybar',
}

/** 같은 라인인데 그룹 없이 단일 심볼로 지급된 경우. 응답에 `group` 키가 없어야 한다. */
const PLAIN_WIN: EngineWinLine = { ...GROUP_WIN, group: undefined }

/** 잔액이 항상 모자란 레포. 라우트의 402 번역만 결정적으로 확인한다. */
class BrokeRepos extends MemoryRepos {
  override applySpin(input: ApplySpinInput): Promise<never> {
    return Promise.reject(new InsufficientFundsError(input.totalBet, 0))
  }
}

/** applySpin이 영원히 끝나지 않는 레포. 멈춰 선 DB 질의를 흉내낸다. */
class HungRepos extends MemoryRepos {
  override applySpin(): Promise<never> {
    return new Promise<never>(() => {})
  }
}

describe('spin timeout', () => {
  it('returns 503 SPIN_TIMEOUT and frees the user for the next spin', async () => {
    const harness = await setup(undefined, { repos: new HungRepos(), config: { spinLockTimeoutMs: 30 } })

    const res = await spinRequest(harness, { idempotencyKey: 'key-hung-000001' })

    expect(res.status).toBe(503)
    expect(((await res.json()) as { code: string }).code).toBe('SPIN_TIMEOUT')

    // 락이 풀렸으므로 다른 키의 다음 요청이 409가 아니라 다시 503까지 도달한다.
    const next = await spinRequest(harness, { idempotencyKey: 'key-hung-000002' })
    expect(next.status).toBe(503)

    // 타임아웃은 회계를 건드리지 않는다.
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(STARTING_COINS)
  })
})

/**
 * M-1 회귀: 멱등키는 **게임별로** 스코프된다.
 *
 * 예전에는 조회 키와 DB 유니크가 `(userId, idempotencyKey)`뿐이라 게임이 빠져 있었다.
 * 클라이언트는 게임마다 독립적으로 키를 만들므로 서로 다른 게임이 같은 키를 쓸 수 있고,
 * 그때 두 번째 요청이 **첫 번째 게임의 라운드**를 재전송으로 오인해 돌려줬다.
 *  - 릴 수가 다르면 응답 조립에서 터져 500 (인증된 유저가 반복 가능한 500을 만들 수 있다)
 *  - 릴 수가 같으면 조용히 다른 게임의 라운드가 응답된다
 *
 * 지금 금전 버그가 아닌 이유는 재전송 분기에 부수효과가 하나도 없기 때문뿐이다.
 * 그 분기에 부수효과가 앞서는 형태가 바로 무한 코인 버그였으므로 여기서 닫는다.
 */
describe('멱등키는 게임별로 스코프된다', () => {
  const MULTI_GAME_IDS = ['classic-777', 'royal-diamond-777', 'fruit-fiesta', 'shiba-shrine'] as const

  function multiGameRegistry(): GameRegistry {
    return createGameRegistry(
      MULTI_GAME_IDS.map((id) => {
        const pack = diskPacks.find((candidate) => candidate.id === id)
        if (!pack) throw new Error(`${id} 팩이 없다`)
        return pack
      })
    )
  }

  async function spinOn(harness: Harness, gameId: string, idempotencyKey: string): Promise<Response> {
    return spinRequest(harness, { gameId, idempotencyKey, totalBet: BET })
  }

  it('릴 수가 다른 게임에 같은 키를 써도 500이 아니라 새 라운드가 나온다', async () => {
    // 감사자가 HTTP로 재현한 그대로: 3릴 -> 5릴에 같은 키.
    // 예전에는 두 번째가 classic-777 라운드(stops 3개)를 5릴 응답으로 조립하려다
    // `RangeError: stops 개수(3)가 reels(5)와 다르다`로 500이 됐다.
    const harness = await setup(multiGameRegistry())
    const key = 'key-crossgame-1'

    const first = await spinOn(harness, 'classic-777', key)
    expect(first.status).toBe(200)
    const second = await spinOn(harness, 'royal-diamond-777', key)

    expect(second.status).toBe(200)
    const firstBody = (await first.json()) as SpinResponse
    const secondBody = (await second.json()) as SpinResponse
    // 서로 독립된 라운드다.
    expect(secondBody.roundId).not.toBe(firstBody.roundId)
    // 각자 자기 게임의 릴 수만큼 stops를 갖는다 — 이게 어긋나면 예전의 500이 재현된다.
    expect(firstBody.stops).toHaveLength(3)
    expect(secondBody.stops).toHaveLength(5)
    // 두 게임 모두 실제로 베팅이 빠졌다 (한쪽이 재전송으로 삼켜지지 않았다).
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(2)
  })

  it('릴 수가 같은 게임에 같은 키를 써도 다른 게임의 라운드가 나오지 않는다', async () => {
    // 이쪽은 예전에도 200이었지만 **조용히** 앞 게임의 라운드를 돌려줬다. 더 위험한 형태다.
    const harness = await setup(multiGameRegistry())
    const key = 'key-crossgame-2'

    const first = (await (await spinOn(harness, 'fruit-fiesta', key)).json()) as SpinResponse
    const second = (await (await spinOn(harness, 'shiba-shrine', key)).json()) as SpinResponse

    expect(second.roundId).not.toBe(first.roundId)
    // 라운드 기록의 게임이 각각 맞는지 레포에서 직접 확인한다.
    expect((await harness.repos.getRoundById(first.roundId))?.gameId).toBe('fruit-fiesta')
    expect((await harness.repos.getRoundById(second.roundId))?.gameId).toBe('shiba-shrine')
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(2)
  })

  it('같은 게임 안에서는 멱등 재전송이 그대로 동작한다', async () => {
    // 스코프를 좁혔다고 원래 목적(네트워크 재전송 방어)이 약해지면 안 된다.
    const harness = await setup(multiGameRegistry())
    const key = 'key-samegame-01'

    const first = (await (await spinOn(harness, 'classic-777', key)).json()) as SpinResponse
    const replay = (await (await spinOn(harness, 'classic-777', key)).json()) as SpinResponse

    expect(replay.roundId).toBe(first.roundId)
    expect(replay).toEqual(first)
    // 재전송은 회계를 다시 건드리지 않는다.
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)
  })

  it('네 게임에 같은 키를 돌려도 네 개의 독립된 라운드가 된다', async () => {
    const harness = await setup(multiGameRegistry())
    const key = 'key-crossgame-4'

    const roundIds: string[] = []
    for (const gameId of MULTI_GAME_IDS) {
      const res = await spinOn(harness, gameId, key)
      expect(res.status).toBe(200)
      roundIds.push(((await res.json()) as SpinResponse).roundId)
    }

    expect(new Set(roundIds).size).toBe(MULTI_GAME_IDS.length)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(MULTI_GAME_IDS.length)
    expect(harness.repos.findDuplicateLedgerRefs(harness.userId)).toEqual([])
  })
})
