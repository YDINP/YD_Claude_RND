/**
 * Postgres 경로 통합 테스트.
 *
 * 지금까지 Drizzle 레포는 **코드 독해로만** 안전하다고 판정돼 있었다. 특히 이 전제가
 * 실측된 적이 없다: `db.transaction(...)`이 콜백에서 나온 **비-DB 예외**(라우트가 던지는
 * `BetRuleError`, `InsufficientFundsError`)에도 ROLLBACK 하는가?
 *
 * memory 레포의 무한 코인 버그가 정확히 "예외가 났는데 앞선 쓰기만 남았다"는 형태였으므로,
 * Postgres 쪽도 같은 시나리오를 실제 DB에 대고 못 박아 둔다.
 *
 * PGlite(WASM 빌드 Postgres)를 in-process로 띄우고 `drizzle/`의 마이그레이션을 그대로
 * 적용한다. 외부 서버도 Docker도 필요 없으므로 일반 `vitest run`에서 항상 돈다.
 * 스키마는 프로덕션과 같은 마이그레이션에서 나오므로, 이 파일은 마이그레이션이 실제로
 * 적용되는지도 함께 검증한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { STARTING_COINS } from '@tgslot/shared'
import type { SpinResponse } from '@tgslot/shared'
import type { GambleConfig, Rng } from '@tgslot/slot-engine'
import { eq } from 'drizzle-orm'
import { createApp } from '../app.js'
import { ledger, wallets } from '../db/schema.js'
import { BetRuleError, InsufficientFundsError } from './types.js'
import { DrizzleRepos } from './drizzle.js'
import type { DrizzleDb } from '../db/client.js'
import type { ApplySpinInput, ApplySpinResult } from './types.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import type { Clock } from '../economy/time.js'

const GAME_ID = 'classic-777'
const BET = 100
const WIN = 400
const START_AT = '2026-09-03T09:00:00Z'
/** `apps/api` 기준 상대 경로. vitest는 패키지 루트에서 돈다. */
const MIGRATIONS_FOLDER = './drizzle'

const diskPacks = loadGamePacks()

function packById(id: string): GamePack {
  const pack = diskPacks.find((candidate) => candidate.id === id)
  if (!pack) throw new Error(`${id} 팩이 없다`)
  return pack
}

/** 더블업이 달린 팩. sheriff-sixgun처럼 math.json에 gamble 블록이 있는 게임을 흉내낸다. */
function gamblePack(): GamePack {
  const pack = packById(GAME_ID)
  const gamble: GambleConfig = { type: 'coin-flip', chance: 0.5, payout: 2, maxSteps: 5 }
  return { ...pack, math: { ...pack.math, gamble } }
}

function makeConfig(): ApiConfig {
  return {
    telegramBotToken: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevAuth: true,
    allowDebugSpin: false,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
    ...{},
  }
}

/** 잭팟은 절대 안 터지게 고정. 이 파일의 관심사가 아니다. */
const noJackpotRng = (): Rng => ({ nextInt: (max) => (max === JACKPOT_ODDS_DENOMINATOR ? max - 1 : 0) })

/** 스핀 당첨액을 테스트가 정해 주는 레포. memory 쪽 테스트의 ScriptedRepos와 같은 수법이다. */
class ScriptedDrizzleRepos extends DrizzleRepos {
  private win: number | null = null

  next(win: number): void {
    this.win = win
  }

  override applySpin(input: ApplySpinInput): Promise<ApplySpinResult> {
    const win = this.win
    this.win = null
    return super.applySpin({
      ...input,
      compute: (ctx) => {
        const computed = input.compute(ctx)
        if (win === null) return computed
        return {
          ...computed,
          result: { ...computed.result, wins: [], lineWin: win, scatterWin: 0, totalWin: win },
        }
      },
    })
  }
}

interface Harness {
  client: PGlite
  /** 트랜잭션 의미론을 직접 찌르는 테스트용. 라우트를 거치지 않고 쓴다. */
  db: DrizzleDb
  app: ReturnType<typeof createApp>
  repos: ScriptedDrizzleRepos
  token: string
  userId: string
}

let harness: Harness

async function setup(packs: GamePack[] = [gamblePack()]): Promise<Harness> {
  const client = new PGlite()
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

  const clock: Clock = () => new Date(START_AT)
  // PGlite 드라이버는 postgres-js와 다른 구체 타입이지만 드리즐의 같은 쿼리 표면을 구현한다.
  // 프로덕션 타입(`DrizzleDb`)을 넓히지 않으려고 캐스팅은 테스트 안에만 둔다.
  const repos = new ScriptedDrizzleRepos(db as unknown as DrizzleDb, clock)
  const app = createApp({
    config: makeConfig(),
    repos,
    games: createGameRegistry(packs),
    clock,
    spinRng: noJackpotRng,
    gambleRng: () => ({ nextInt: () => 0 }),
  })

  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9401:PgUser' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { client, db: db as unknown as DrizzleDb, app, repos, token: body.token, userId: body.user.id }
}

function authHeaders(): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` }
}

async function spin(key: string, options: { gameId?: string; totalBet?: number; win?: number } = {}): Promise<Response> {
  if (options.win !== undefined) harness.repos.next(options.win)
  return harness.app.request(`/games/${options.gameId ?? GAME_ID}/spin`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ totalBet: options.totalBet ?? BET, idempotencyKey: key }),
  })
}

async function coins(): Promise<number> {
  const rows = await harness.client.query<{ coins: number }>('select coins from wallets where user_id = $1', [
    harness.userId,
  ])
  return Number(rows.rows[0]?.coins ?? 0)
}

/** 저장된 게임 상태(JSON). 더블업 세션이 여기 들어 있다. */
async function storedGameState(gameId = GAME_ID): Promise<unknown> {
  const rows = await harness.client.query<{ state: unknown }>(
    'select state from game_states where user_id = $1 and game_id = $2',
    [harness.userId, gameId]
  )
  return rows.rows[0]?.state ?? null
}

async function ledgerRowCount(): Promise<number> {
  const rows = await harness.client.query<{ n: number }>('select count(*)::int as n from ledger where user_id = $1', [
    harness.userId,
  ])
  return Number(rows.rows[0]?.n ?? 0)
}

/** `scripts/checkLedger.ts`의 `findDuplicateRefs`와 같은 질의. */
async function duplicateRefs(): Promise<{ reason: string; ref_id: string; entries: number }[]> {
  const rows = await harness.client.query<{ reason: string; ref_id: string; entries: number }>(
    `select reason, ref_id, count(*)::int as entries
     from ledger where ref_id is not null
     group by user_id, reason, ref_id having count(*) > 1`
  )
  return rows.rows
}

beforeEach(async () => {
  harness = await setup()
})

afterEach(async () => {
  await harness.client.close()
})

describe('마이그레이션과 제약이 실제 Postgres에 적용된다', () => {
  it('drizzle/의 마이그레이션이 전부 적용되고 새 제약이 존재한다', async () => {
    const rows = await harness.client.query<{ conname: string }>(
      `select conname from pg_constraint where conname = any($1::text[]) order by conname`,
      [
        [
          'ledger_reason_ref_id_unique',
          'rounds_user_id_game_id_idempotency_key_unique',
          'rounds_user_id_idempotency_key_unique',
          'wallets_coins_non_negative',
          'wallets_gems_non_negative',
        ],
      ]
    )
    const names = rows.rows.map((row) => row.conname)

    expect(names).toEqual([
      'ledger_reason_ref_id_unique',
      'rounds_user_id_game_id_idempotency_key_unique',
      'wallets_coins_non_negative',
      'wallets_gems_non_negative',
    ])
    // 게임이 빠진 옛 유니크는 사라져야 한다.
    expect(names).not.toContain('rounds_user_id_idempotency_key_unique')
  })

  it('M-4: 같은 (reason, ref_id)를 두 번 넣으면 DB가 거부한다', async () => {
    const insert = (): Promise<unknown> =>
      harness.client.query('insert into ledger (user_id, delta, currency, reason, ref_id) values ($1, 1, $2, $3, $4)', [
        harness.userId,
        'coins',
        'gamble_collect',
        'round-abc:g0',
      ])

    await insert()
    // 무한 코인 버그가 남기던 흔적이 정확히 이 모양이었다.
    await expect(insert()).rejects.toThrow(/ledger_reason_ref_id_unique|duplicate key/i)
  })

  it('M-4: ref_id가 NULL인 사유는 몇 번이든 반복된다', async () => {
    // 보너스·미션 보상은 정상적으로 반복되고 ref_id를 남기지 않는다. 오탐이 나면 안 된다.
    const insert = (): Promise<unknown> =>
      harness.client.query('insert into ledger (user_id, delta, currency, reason) values ($1, 500, $2, $3)', [
        harness.userId,
        'coins',
        'daily_bonus',
      ])

    await insert()
    await insert()
    await insert()

    expect(await duplicateRefs()).toEqual([])
  })

  it('M-4: 지갑 잔액을 음수로 만들면 DB가 거부한다', async () => {
    await expect(
      harness.client.query('update wallets set coins = -1 where user_id = $1', [harness.userId])
    ).rejects.toThrow(/wallets_coins_non_negative|violates check/i)
    await expect(
      harness.client.query('update wallets set gems = -1 where user_id = $1', [harness.userId])
    ).rejects.toThrow(/wallets_gems_non_negative|violates check/i)
  })
})

/**
 * C-1 회귀의 Postgres판. **이 스위트가 검증하는 가정**: 콜백이 던진 비-DB 예외에도
 * `db.transaction`이 ROLLBACK 한다. 아니라면 아래 어딘가에서 지갑이나 game_states가 남는다.
 */
describe('거부된 스핀은 Postgres에서도 아무것도 남기지 않는다', () => {
  const REJECTIONS = [
    { label: 'INVALID_BET', totalBet: 3, status: 400, code: 'INVALID_BET' },
    { label: 'BET_LOCKED', totalBet: 500, status: 400, code: 'BET_LOCKED' },
    { label: 'INSUFFICIENT_FUNDS', totalBet: 50_000, status: 402, code: 'INSUFFICIENT_FUNDS' },
  ] as const

  /** 당첨 스핀 한 번으로 더블업 에스크로를 연다. 거부 스핀이 되돌려선 안 되는 그 돈이다. */
  async function openEscrow(): Promise<string> {
    const res = await spin('pg-open-000001', { win: WIN })
    expect(res.status).toBe(200)
    const body = (await res.json()) as SpinResponse
    expect(body.gambleOffer?.pendingWin).toBe(WIN)
    return body.roundId
  }

  for (const rejection of REJECTIONS) {
    it(`${rejection.label}로 거부되면 지갑·game_states·ledger가 그대로다`, async () => {
      await openEscrow()
      const coinsBefore = await coins()
      const stateBefore = await storedGameState()
      const ledgerBefore = await ledgerRowCount()
      expect(stateBefore).not.toBeNull()

      const res = await spin('pg-bad-0000001', { totalBet: rejection.totalBet })

      expect(res.status).toBe(rejection.status)
      expect(((await res.json()) as { code: string }).code).toBe(rejection.code)
      // 트랜잭션이 롤백되지 않았다면 여기서 에스크로 환급분(+400)이 잡힌다.
      expect(await coins()).toBe(coinsBefore)
      expect(await storedGameState()).toEqual(stateBefore)
      expect(await ledgerRowCount()).toBe(ledgerBefore)
      expect(await duplicateRefs()).toEqual([])
    })
  }

  it('거부된 스핀을 반복해도 지갑은 1코인도 늘지 않는다', async () => {
    await openEscrow()
    const coinsBefore = await coins()
    const ledgerBefore = await ledgerRowCount()

    const attempts = 10
    for (let i = 0; i < attempts; i += 1) {
      const res = await spin(`pg-loop-${String(i).padStart(6, '0')}`, { totalBet: 3 })
      expect(res.status).toBe(400)
    }

    expect(await coins()).toBe(coinsBefore)
    expect(await ledgerRowCount()).toBe(ledgerBefore)
    expect(await duplicateRefs()).toEqual([])
  })

  it('거부된 스핀 뒤에도 원래 더블업 세션은 멀쩡히 살아 있다', async () => {
    const roundId = await openEscrow()
    const res = await spin('pg-bad-0000002', { totalBet: 3 })
    expect(res.status).toBe(400)

    // 세션이 살아 있으니 회수하면 잠긴 판돈이 **정확히 한 번** 돌아온다.
    const before = await coins()
    const collect = await harness.app.request(`/rounds/${roundId}/collect`, {
      method: 'POST',
      headers: authHeaders(),
    })

    expect(collect.status).toBe(200)
    expect(await coins()).toBe(before + WIN)
    // 두 번째 회수는 세션이 닫혀 거절된다 (거부된 스핀이 세션을 반쯤 닫아 두지 않았다는 뜻).
    const again = await harness.app.request(`/rounds/${roundId}/collect`, {
      method: 'POST',
      headers: authHeaders(),
    })
    expect(again.status).toBe(409)
    expect(await coins()).toBe(before + WIN)
    expect(await duplicateRefs()).toEqual([])
  })
})

describe('M-1: 멱등키는 Postgres에서도 게임별로 스코프된다', () => {
  it('릴 수가 다른 게임에 같은 키를 써도 500이 아니라 새 라운드가 나온다', async () => {
    harness = await setup([gamblePack(), packById('royal-diamond-777')])
    const key = 'pg-crossgame-1'

    const first = await spin(key, { gameId: GAME_ID, win: 0 })
    expect(first.status).toBe(200)
    const second = await spin(key, { gameId: 'royal-diamond-777', win: 0 })

    expect(second.status).toBe(200)
    const firstBody = (await first.json()) as SpinResponse
    const secondBody = (await second.json()) as SpinResponse
    expect(secondBody.roundId).not.toBe(firstBody.roundId)
    expect(firstBody.stops).toHaveLength(3)
    expect(secondBody.stops).toHaveLength(5)

    const rows = await harness.client.query<{ n: number }>(
      "select count(*)::int as n from ledger where user_id = $1 and reason = 'spin_bet'",
      [harness.userId]
    )
    expect(Number(rows.rows[0]?.n)).toBe(2)
  })

  it('같은 게임 안에서는 멱등 재전송이 그대로 동작한다', async () => {
    const key = 'pg-samegame-01'

    const first = (await (await spin(key, { win: 0 })).json()) as SpinResponse
    const replay = (await (await spin(key, { win: 0 })).json()) as SpinResponse

    expect(replay.roundId).toBe(first.roundId)
    const rows = await harness.client.query<{ n: number }>(
      "select count(*)::int as n from ledger where user_id = $1 and reason = 'spin_bet'",
      [harness.userId]
    )
    expect(Number(rows.rows[0]?.n)).toBe(1)
  })
})

describe('기본 회계가 Postgres에서도 맞는다', () => {
  it('가입 지급과 스핀 뒤에도 sum(ledger) == wallet', async () => {
    expect(await coins()).toBe(STARTING_COINS)

    await spin('pg-basic-00001', { win: WIN })

    const rows = await harness.client.query<{ sum: number }>(
      "select coalesce(sum(delta), 0)::int as sum from ledger where user_id = $1 and currency = 'coins'",
      [harness.userId]
    )
    expect(Number(rows.rows[0]?.sum)).toBe(await coins())
  })
})

/**
 * 감사자가 "코드 독해로만 안전"이라고 표시한 바로 그 전제를 직접 찌른다.
 *
 * 위의 거부 스핀 테스트들은 **compute 앞에 쓰기가 없다**는 순서 속성을 증명하지, 롤백 자체를
 * 증명하지는 않는다 (쓰기가 애초에 없었으므로 롤백이 없어도 통과한다). 그래서 여기서는
 * 트랜잭션 안에서 **실제로 쓴 뒤** 라우트가 쓰는 것과 같은 비-DB 예외를 던지고, 아무것도
 * 남지 않는지 본다. Postgres/드리즐이 `Error` 종류를 가려 가며 롤백하지 않는다는 확인이다.
 */
describe('db.transaction은 비-DB 예외에도 ROLLBACK 한다', () => {
  const CASES = [
    { label: 'BetRuleError (라우트의 베팅 규칙 위반)', error: (): Error => new BetRuleError('INVALID_BET', 'forced') },
    { label: 'InsufficientFundsError (레포의 잔액 부족)', error: (): Error => new InsufficientFundsError(999, 1) },
    { label: '평범한 Error', error: (): Error => new Error('forced') },
  ] as const

  for (const testCase of CASES) {
    it(`${testCase.label}가 나오면 트랜잭션 안의 쓰기가 전부 사라진다`, async () => {
      const ledgerBefore = await ledgerRowCount()
      const coinsBefore = await coins()

      await expect(
        harness.db.transaction(async (tx) => {
          // 원장 + 지갑을 실제로 건드린 다음에 던진다. 롤백되지 않으면 아래 단언이 깨진다.
          await tx.insert(ledger).values({
            userId: harness.userId,
            delta: 999_999,
            currency: 'coins',
            reason: 'gamble_collect',
            refId: `rollback-probe-${testCase.label}`,
          })
          await tx
            .update(wallets)
            .set({ coins: coinsBefore + 999_999 })
            .where(eq(wallets.userId, harness.userId))
          throw testCase.error()
        })
      ).rejects.toThrow()

      expect(await ledgerRowCount()).toBe(ledgerBefore)
      expect(await coins()).toBe(coinsBefore)
    })
  }

  it('던지지 않으면 같은 쓰기가 그대로 커밋된다 (위 단언이 헛돌지 않는다는 확인)', async () => {
    const ledgerBefore = await ledgerRowCount()
    const coinsBefore = await coins()

    await harness.db.transaction(async (tx) => {
      await tx.insert(ledger).values({
        userId: harness.userId,
        delta: 7,
        currency: 'coins',
        reason: 'gamble_collect',
        refId: 'commit-probe',
      })
      await tx
        .update(wallets)
        .set({ coins: coinsBefore + 7 })
        .where(eq(wallets.userId, harness.userId))
    })

    expect(await ledgerRowCount()).toBe(ledgerBefore + 1)
    expect(await coins()).toBe(coinsBefore + 7)
  })
})
