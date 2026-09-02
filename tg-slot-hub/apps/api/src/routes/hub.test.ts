import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type {
  BonusClaimResponse,
  BonusStatus,
  Jackpot,
  LeaderboardResponse,
  MeResponse,
  MissionsResponse,
  SpinResponse,
} from '@tgslot/shared'
import type { FeatureTrigger } from '@tgslot/shared'
import { createSeededRng } from '@tgslot/slot-engine'
import type { Rng, SpinResult } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR, JACKPOT_SEED_COINS } from '../economy/config.js'

const GAME_ID = 'classic-777'
const BET = 100
const START_AT = '2026-09-02T09:00:00Z'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const diskPacks = loadGamePacks()

function classicPack(): GamePack {
  const pack = diskPacks.find((candidate) => candidate.id === GAME_ID)
  if (!pack) throw new Error(`${GAME_ID} 팩이 없다`)
  return pack
}

function makeConfig(): ApiConfig {
  return {
    telegramBotToken: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevMock: true,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
  }
}

/** 앞으로만 가는 테스트용 시계. 레포와 라우트가 **같은** 인스턴스를 본다. */
function makeClock(startIso: string) {
  let current = new Date(startIso)
  return {
    now: (): Date => current,
    advance(ms: number): void {
      current = new Date(current.getTime() + ms)
    },
  }
}

/** 릴은 진짜 시드 RNG로 돌리고 잭팟 판정만 "절대 안 터짐"으로 고정한다. */
function noJackpotRng(seed: string, nonce: number): Rng {
  const rng = createSeededRng(`${seed}:${nonce}`)
  return { nextInt: (max) => (max === JACKPOT_ODDS_DENOMINATOR ? max - 1 : rng.nextInt(max)) }
}

/** 잭팟이 반드시 터지는 RNG. `jackpotRoll = 0 < totalBet`. */
function alwaysJackpotRng(): Rng {
  return { nextInt: () => 0 }
}

interface Harness {
  app: ReturnType<typeof createApp>
  repos: MemoryRepos
  clock: ReturnType<typeof makeClock>
  token: string
  userId: string
}

async function login(app: ReturnType<typeof createApp>, initData: string): Promise<{ token: string; userId: string }> {
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { token: body.token, userId: body.user.id }
}

async function setup(options: { spinRng?: (seed: string, nonce: number) => Rng } = {}): Promise<Harness> {
  const clock = makeClock(START_AT)
  const repos = new MemoryRepos(clock.now)
  const app = createApp({
    config: makeConfig(),
    repos,
    games: createGameRegistry([classicPack()]),
    clock: clock.now,
    spinRng: options.spinRng ?? noJackpotRng,
  })

  const { token, userId } = await login(app, 'mock:8001:Hubber')
  return { app, repos, clock, token, userId }
}

async function authed(harness: Harness, path: string, init: RequestInit = {}): Promise<Response> {
  return harness.app.request(path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}`, ...init.headers },
  })
}

async function spinRequest(harness: Harness, idempotencyKey: string, totalBet = BET): Promise<Response> {
  return authed(harness, `/games/${GAME_ID}/spin`, {
    method: 'POST',
    body: JSON.stringify({ totalBet, idempotencyKey }),
  })
}

/**
 * 엔진을 거치지 않고 결과를 고정한 스핀. 리더보드·미션·프리스핀 상태를 결정적으로 만든다.
 * `features`를 주면 엔진이 피처를 뱉은 것처럼 굴 수 있다.
 */
function fixedSpin(
  repos: MemoryRepos,
  userId: string,
  options: {
    key: string
    bet?: number
    win?: number
    gameId?: string
    jackpotRoll?: number
    features?: FeatureTrigger[]
  }
) {
  const win = options.win ?? 0
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
  return repos.applySpin({
    userId,
    gameId: options.gameId ?? GAME_ID,
    totalBet: options.bet ?? BET,
    idempotencyKey: options.key,
    compute: () => ({
      result,
      seed: 'seed',
      seedHash: 'hash',
      jackpotRoll: options.jackpotRoll ?? JACKPOT_ODDS_DENOMINATOR - 1,
      features: options.features ?? [],
    }),
  })
}

/**
 * 잔액을 파산 문턱 아래로 태운다. 전액 베팅을 반복하는데, 도중에 레벨업 보너스가
 * 들어오면 다시 0이 아니게 되므로 문턱 아래가 될 때까지 돌린다.
 */
async function drainWallet(repos: MemoryRepos, userId: string, prefix: string): Promise<number> {
  for (let i = 0; i < 10; i += 1) {
    const coins = (await repos.getWallet(userId))?.coins ?? 0
    if (coins < 10) return coins
    await fixedSpin(repos, userId, { key: `${prefix}-${String(i).padStart(8, '0')}`, bet: coins, win: 0 })
  }
  throw new Error('[test] 지갑을 파산 문턱 아래로 태우지 못했다')
}

describe('GET /bonus', () => {
  it('신규 유저에게 데일리·시간 보너스는 열려 있고 구제는 닫혀 있다', async () => {
    const harness = await setup()

    const res = await authed(harness, '/bonus')

    expect(res.status).toBe(200)
    const body = (await res.json()) as BonusStatus
    expect(body.daily).toEqual({ claimable: true, streakDay: 1, nextAmount: 500, nextAvailableAt: null })
    expect(body.timed).toEqual({ claimable: true, amount: 300, nextAvailableAt: null })
    // 코인이 10,000이라 파산 구제 대상이 아니다.
    expect(body.rescue).toEqual({ claimable: false, amount: 500 })
  })

  it('인증 없이는 401이다', async () => {
    const harness = await setup()
    expect((await harness.app.request('/bonus')).status).toBe(401)
  })
})

describe('POST /bonus/daily/claim', () => {
  it('수령 → 같은 날 재수령 409 → 다음 날 연속 2일차', async () => {
    const harness = await setup()

    const first = (await (await authed(harness, '/bonus/daily/claim', { method: 'POST' })).json()) as BonusClaimResponse
    expect(first.amount).toBe(500)
    expect(first.streakDay).toBe(1)
    expect(first.wallet.coins).toBe(STARTING_COINS + 500)

    const again = await authed(harness, '/bonus/daily/claim', { method: 'POST' })
    expect(again.status).toBe(409)
    expect(((await again.json()) as { code: string }).code).toBe('NOT_CLAIMABLE')

    const status = (await (await authed(harness, '/bonus')).json()) as BonusStatus
    expect(status.daily.claimable).toBe(false)
    expect(status.daily.streakDay).toBe(2)
    expect(status.daily.nextAmount).toBe(800)
    expect(status.daily.nextAvailableAt).toBe('2026-09-03T00:00:00.000Z')

    harness.clock.advance(DAY_MS)
    const second = (await (
      await authed(harness, '/bonus/daily/claim', { method: 'POST' })
    ).json()) as BonusClaimResponse
    expect(second.streakDay).toBe(2)
    expect(second.amount).toBe(800)
    expect(second.wallet.coins).toBe(STARTING_COINS + 500 + 800)

    expect(harness.repos.getLedgerSum(harness.userId)).toBe(second.wallet.coins)
    expect(harness.repos.countLedgerEntries(harness.userId, 'daily_bonus')).toBe(2)
  })

  it('하루를 건너뛰면 연속이 1일차로 리셋된다', async () => {
    const harness = await setup()

    await authed(harness, '/bonus/daily/claim', { method: 'POST' })
    harness.clock.advance(DAY_MS)
    const day2 = (await (await authed(harness, '/bonus/daily/claim', { method: 'POST' })).json()) as BonusClaimResponse
    expect(day2.streakDay).toBe(2)

    // 하루를 통째로 건너뛴다.
    harness.clock.advance(2 * DAY_MS)
    const afterGap = (await (
      await authed(harness, '/bonus/daily/claim', { method: 'POST' })
    ).json()) as BonusClaimResponse
    expect(afterGap.streakDay).toBe(1)
    expect(afterGap.amount).toBe(500)
  })
})

describe('POST /bonus/timed/claim', () => {
  it('4시간 쿨다운이 끝나야 다시 수령된다', async () => {
    const harness = await setup()

    const first = (await (await authed(harness, '/bonus/timed/claim', { method: 'POST' })).json()) as BonusClaimResponse
    expect(first.amount).toBe(300)
    // 시간 보너스는 연속 개념이 없으므로 streakDay를 싣지 않는다.
    expect(first.streakDay).toBeUndefined()

    expect((await authed(harness, '/bonus/timed/claim', { method: 'POST' })).status).toBe(409)

    harness.clock.advance(4 * HOUR_MS - 1)
    expect((await authed(harness, '/bonus/timed/claim', { method: 'POST' })).status).toBe(409)

    harness.clock.advance(1)
    const second = await authed(harness, '/bonus/timed/claim', { method: 'POST' })
    expect(second.status).toBe(200)
    expect(((await second.json()) as BonusClaimResponse).wallet.coins).toBe(STARTING_COINS + 600)
  })
})

describe('POST /bonus/rescue/claim', () => {
  it('코인이 10 미만일 때만 열리고 6시간 쿨다운을 갖는다', async () => {
    const harness = await setup()

    expect((await authed(harness, '/bonus/rescue/claim', { method: 'POST' })).status).toBe(409)

    const burned = await drainWallet(harness.repos, harness.userId, 'burn-a')
    expect(burned).toBeLessThan(10)

    const status = (await (await authed(harness, '/bonus')).json()) as BonusStatus
    expect(status.rescue).toEqual({ claimable: true, amount: 500 })

    const claimed = (await (
      await authed(harness, '/bonus/rescue/claim', { method: 'POST' })
    ).json()) as BonusClaimResponse
    expect(claimed.amount).toBe(500)
    expect(claimed.wallet.coins).toBe(burned + 500)

    // 쿨다운 안에서는 다시 태워도 못 받는다.
    await drainWallet(harness.repos, harness.userId, 'burn-b')
    expect((await authed(harness, '/bonus/rescue/claim', { method: 'POST' })).status).toBe(409)

    harness.clock.advance(6 * HOUR_MS)
    const second = await authed(harness, '/bonus/rescue/claim', { method: 'POST' })
    expect(second.status).toBe(200)

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)
    expect(harness.repos.countLedgerEntries(harness.userId, 'rescue_bonus')).toBe(2)
  })
})

describe('잭팟 적립과 확률', () => {
  // 풀은 1/100 코인 단위로 쌓여서 모든 베팅이 정확히 1%를 넣는다.
  // 응답에는 코인으로 내림해서 나가므로, 100 미만 베팅은 한 번에 코인 자릿수를 못 올린다.
  const cases: { bet: number; visibleCoinGain: number; payoutOnHit: number }[] = [
    { bet: 10, visibleCoinGain: 0, payoutOnHit: JACKPOT_SEED_COINS },
    { bet: 20, visibleCoinGain: 0, payoutOnHit: JACKPOT_SEED_COINS },
    { bet: 50, visibleCoinGain: 0, payoutOnHit: JACKPOT_SEED_COINS },
    { bet: 100, visibleCoinGain: 1, payoutOnHit: JACKPOT_SEED_COINS + 1 },
    { bet: 200, visibleCoinGain: 2, payoutOnHit: JACKPOT_SEED_COINS + 2 },
    { bet: 500, visibleCoinGain: 5, payoutOnHit: JACKPOT_SEED_COINS + 5 },
  ]

  for (const { bet, visibleCoinGain, payoutOnHit } of cases) {
    it(`베팅 ${bet} 한 번은 표시 풀을 ${visibleCoinGain}코인 올린다`, async () => {
      const harness = await setup()

      const applied = await fixedSpin(harness.repos, harness.userId, { key: `acc-${bet}-000001`, bet, win: 0 })

      expect(applied.jackpot).toBe(JACKPOT_SEED_COINS + visibleCoinGain)
      expect(applied.jackpotWin).toBeUndefined()
    })

    it(`베팅 ${bet}도 판정값 0이면 당첨된다`, async () => {
      const harness = await setup()

      const applied = await fixedSpin(harness.repos, harness.userId, {
        key: `hit-${bet}-000001`,
        bet,
        win: 0,
        jackpotRoll: 0,
      })

      // 모든 베팅이 1%를 넣으므로 모든 베팅에 당첨 기회가 있다. 확률만 적립액에 비례한다.
      expect(applied.jackpotWin).toBe(payoutOnHit)
      expect(applied.jackpot).toBe(JACKPOT_SEED_COINS)

      const wallet = await harness.repos.getWallet(harness.userId)
      expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)
    })
  }

  it('최소 베팅도 1%를 쌓는다: 10 베팅 10회면 풀이 정확히 1코인 오른다', async () => {
    const harness = await setup()

    for (let i = 0; i < 10; i += 1) {
      await fixedSpin(harness.repos, harness.userId, { key: `min-${String(i).padStart(8, '0')}`, bet: 10, win: 0 })
    }

    // 10 x 0.1 코인 = 1 코인. 코인 단위로 반올림했다면 0이 됐을 값이다.
    expect((await harness.repos.getJackpot()).pool).toBe(JACKPOT_SEED_COINS + 1)
  })

  it('같은 총 베팅이면 잘게 나눠 걸어도 적립 총액이 같다', async () => {
    const harness = await setup()

    // 500 한 번 vs 10 x 50번. 둘 다 총 베팅 500이므로 적립도 5코인으로 같아야 한다.
    await fixedSpin(harness.repos, harness.userId, { key: 'split-big-00001', bet: 500, win: 0 })
    const afterBig = (await harness.repos.getJackpot()).pool

    for (let i = 0; i < 50; i += 1) {
      await fixedSpin(harness.repos, harness.userId, { key: `split-sm-${String(i).padStart(6, '0')}`, bet: 10, win: 0 })
    }
    const afterSmall = (await harness.repos.getJackpot()).pool

    expect(afterBig - JACKPOT_SEED_COINS).toBe(5)
    expect(afterSmall - afterBig).toBe(5)
  })
})

describe('잭팟', () => {
  it('인증 없이 풀을 조회할 수 있고 시드 금액에서 시작한다', async () => {
    const harness = await setup()

    const res = await harness.app.request('/jackpot')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Jackpot
    expect(body.pool).toBe(JACKPOT_SEED_COINS)
    expect(body.lastWin).toBeUndefined()
  })

  it('스핀마다 베팅의 1%가 쌓이고 베팅 차감은 그대로다', async () => {
    const harness = await setup()

    const res = await spinRequest(harness, 'key-accrue-00001')
    const body = (await res.json()) as SpinResponse

    expect(body.jackpot).toBe(JACKPOT_SEED_COINS + 1)
    expect(body.jackpotWin).toBeUndefined()
    // 적립은 하우스 몫이라 유저 지갑에서 더 빠지지 않는다.
    expect(body.wallet.coins).toBe(STARTING_COINS - BET + body.totalWin)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(body.wallet.coins)

    const second = (await (await spinRequest(harness, 'key-accrue-00002')).json()) as SpinResponse
    expect(second.jackpot).toBe(JACKPOT_SEED_COINS + 2)
  })

  it('당첨되면 풀 전액을 지급하고 시드로 되돌린다', async () => {
    const harness = await setup({ spinRng: alwaysJackpotRng })

    const body = (await (await spinRequest(harness, 'key-jackpot-0001')).json()) as SpinResponse

    // 이 스핀의 적립분까지 포함해서 가져간다.
    expect(body.jackpotWin).toBe(JACKPOT_SEED_COINS + 1)
    expect(body.jackpot).toBe(JACKPOT_SEED_COINS)
    expect(body.wallet.coins).toBe(STARTING_COINS - BET + body.totalWin + JACKPOT_SEED_COINS + 1)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(body.wallet.coins)
    expect(harness.repos.countLedgerEntries(harness.userId, 'jackpot_win')).toBe(1)

    const jackpot = (await (await harness.app.request('/jackpot')).json()) as Jackpot
    expect(jackpot.pool).toBe(JACKPOT_SEED_COINS)
    expect(jackpot.lastWin?.amount).toBe(JACKPOT_SEED_COINS + 1)
    expect(jackpot.lastWin?.userId).toBe(harness.userId)
    expect(jackpot.lastWin?.at).toBe(new Date(START_AT).toISOString())
  })
})

describe('GET /leaderboard', () => {
  it('총 승리 내림차순으로 정렬하고 내 순위를 함께 준다', async () => {
    const harness = await setup()
    const rival = await login(harness.app, 'mock:8002:Rival')
    const third = await login(harness.app, 'mock:8003:Third')

    await fixedSpin(harness.repos, harness.userId, { key: 'lb-me-00000001', bet: 100, win: 500 })
    await fixedSpin(harness.repos, rival.userId, { key: 'lb-rival-000001', bet: 100, win: 900 })
    await fixedSpin(harness.repos, rival.userId, { key: 'lb-rival-000002', bet: 100, win: 100 })
    await fixedSpin(harness.repos, third.userId, { key: 'lb-third-000001', bet: 100, win: 50 })

    const body = (await (await authed(harness, '/leaderboard')).json()) as LeaderboardResponse

    expect(body.week).toBe('2026-W36')
    expect(body.endsAt).toBe('2026-09-07T00:00:00.000Z')
    expect(body.entries.map((entry) => entry.userId)).toEqual([rival.userId, harness.userId, third.userId])
    expect(body.entries[0]).toMatchObject({ rank: 1, firstName: 'Rival', totalWin: 1000, spins: 2, bestMultiplier: 9 })
    expect(body.me).toMatchObject({ rank: 2, userId: harness.userId, totalWin: 500, bestMultiplier: 5, spins: 1 })
  })

  it('이번 주 스핀이 없으면 me는 null이다', async () => {
    const harness = await setup()

    const body = (await (await authed(harness, '/leaderboard')).json()) as LeaderboardResponse
    expect(body.entries).toEqual([])
    expect(body.me).toBeNull()
  })

  it('주가 바뀌면 집계가 새로 시작한다', async () => {
    const harness = await setup()
    await fixedSpin(harness.repos, harness.userId, { key: 'lb-week-000001', bet: 100, win: 500 })

    harness.clock.advance(7 * DAY_MS)
    const body = (await (await authed(harness, '/leaderboard')).json()) as LeaderboardResponse

    expect(body.week).toBe('2026-W37')
    expect(body.entries).toEqual([])
    expect(body.me).toBeNull()
  })
})

describe('미션', () => {
  it('스핀이 진행도를 올리고 완료한 미션만 수령된다', async () => {
    const harness = await setup()

    const before = (await (await authed(harness, '/missions')).json()) as MissionsResponse
    expect(before.day).toBe('2026-09-02')
    expect(before.missions.map((mission) => mission.id)).toEqual(['spin_50', 'win_3', 'classic_20'])
    expect(before.missions.every((mission) => mission.progress === 0)).toBe(true)

    // 당첨 스핀 3회로 win_3만 완료시킨다.
    for (let i = 0; i < 3; i += 1) {
      await fixedSpin(harness.repos, harness.userId, { key: `ms-win-${String(i).padStart(7, '0')}`, win: 250 })
    }

    const after = (await (await authed(harness, '/missions')).json()) as MissionsResponse
    const win3 = after.missions.find((mission) => mission.id === 'win_3')
    expect(win3).toMatchObject({ progress: 3, target: 3, completed: true, claimed: false, reward: 500 })
    expect(after.missions.find((mission) => mission.id === 'spin_50')).toMatchObject({ progress: 3, completed: false })

    const walletBefore = await harness.repos.getWallet(harness.userId)
    const claimed = (await (
      await authed(harness, '/missions/win_3/claim', { method: 'POST' })
    ).json()) as BonusClaimResponse
    expect(claimed.amount).toBe(500)
    expect(claimed.wallet.coins).toBe((walletBefore?.coins ?? 0) + 500)

    // 두 번째 수령은 409.
    const again = await authed(harness, '/missions/win_3/claim', { method: 'POST' })
    expect(again.status).toBe(409)
    expect(((await again.json()) as { code: string }).code).toBe('NOT_CLAIMABLE')

    // 미완료 미션도 409.
    const notDone = await authed(harness, '/missions/spin_50/claim', { method: 'POST' })
    expect(notDone.status).toBe(409)

    expect(harness.repos.countLedgerEntries(harness.userId, 'mission_reward')).toBe(1)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(claimed.wallet.coins)
  })

  it('없는 미션 id는 404다', async () => {
    const harness = await setup()
    const res = await authed(harness, '/missions/no-such-mission/claim', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('MISSION_NOT_FOUND')
  })

  it('날짜가 바뀌면 진행도가 초기화된다', async () => {
    const harness = await setup()
    await fixedSpin(harness.repos, harness.userId, { key: 'ms-day-00000001', win: 0 })
    expect(
      ((await (await authed(harness, '/missions')).json()) as MissionsResponse).missions[0]?.progress
    ).toBe(1)

    harness.clock.advance(DAY_MS)
    const nextDay = (await (await authed(harness, '/missions')).json()) as MissionsResponse
    expect(nextDay.day).toBe('2026-09-03')
    expect(nextDay.missions.every((mission) => mission.progress === 0)).toBe(true)
  })
})

describe('레벨', () => {
  it('레벨 1은 100을 넘는 베팅을 400 BET_LOCKED로 막는다', async () => {
    const harness = await setup()

    const res = await spinRequest(harness, 'key-locked-00001', 200)

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BET_LOCKED')
    expect((await harness.repos.getWallet(harness.userId))?.coins).toBe(STARTING_COINS)
  })

  it('누적 베팅이 문턱을 넘으면 레벨업 보너스를 지급한다', async () => {
    const harness = await setup()

    // 레벨 2 문턱은 round(2000 * 2^1.6) = 6063 xp. 베팅 100씩이면 61번째 스핀에서 넘는다.
    let levelUp: SpinResponse['levelUp']
    let last: SpinResponse | null = null
    for (let i = 0; i < 61; i += 1) {
      const res = await spinRequest(harness, `key-level-${String(i).padStart(6, '0')}`)
      expect(res.status).toBe(200)
      last = (await res.json()) as SpinResponse
      if (last.levelUp) levelUp = last.levelUp
    }

    expect(levelUp).toEqual({ from: 1, to: 2, bonus: 400 })
    expect(harness.repos.countLedgerEntries(harness.userId, 'level_up')).toBe(1)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(last?.wallet.coins)

    const me = (await (await authed(harness, '/me')).json()) as MeResponse
    expect(me.user.level).toBe(2)
    expect(me.user.xp).toBe(6100)
    expect(me.levelInfo).toEqual({ level: 2, xp: 6100, nextLevelXp: 11599, maxBet: 100 })
    expect(me.jackpot).toBe(JACKPOT_SEED_COINS + 61)
  })
})

describe('확장된 스핀 응답', () => {
  it('SpinResponseSchema를 그대로 통과한다', async () => {
    const harness = await setup()

    const res = await spinRequest(harness, 'key-schema-00001')
    const parsed = SpinResponseSchema.safeParse(await res.json())

    expect(parsed.success).toBe(true)
    expect(parsed.data?.jackpot).toBe(JACKPOT_SEED_COINS + 1)
    expect(parsed.data?.missions?.map((mission) => mission.id)).toEqual(['spin_50', 'win_3', 'classic_20'])
  })

  it('멱등 재전송도 같은 응답을 돌려주고 잭팟을 두 번 적립하지 않는다', async () => {
    const harness = await setup()

    const first = (await (await spinRequest(harness, 'key-replay-00001')).json()) as SpinResponse
    const second = (await (await spinRequest(harness, 'key-replay-00001')).json()) as SpinResponse

    expect(second).toEqual(first)
    expect(((await (await harness.app.request('/jackpot')).json()) as Jackpot).pool).toBe(JACKPOT_SEED_COINS + 1)
  })

  it('잭팟이 터진 스핀을 재전송해도 같은 jackpotWin을 돌려준다', async () => {
    const harness = await setup({ spinRng: alwaysJackpotRng })

    const first = (await (await spinRequest(harness, 'key-replayjp-0001')).json()) as SpinResponse
    expect(first.jackpotWin).toBe(JACKPOT_SEED_COINS + 1)

    const second = (await (await spinRequest(harness, 'key-replayjp-0001')).json()) as SpinResponse

    // 지급은 한 번뿐이지만 응답의 jackpotWin은 그대로 복원돼야 한다.
    expect(second.jackpotWin).toBe(first.jackpotWin)
    expect(second.wallet).toEqual(first.wallet)
    expect(harness.repos.countLedgerEntries(harness.userId, 'jackpot_win')).toBe(1)
    // 재전송 시점의 풀은 당첨으로 리셋된 값이다.
    expect(second.jackpot).toBe(JACKPOT_SEED_COINS)
  })

  it('레벨업을 만든 스핀을 재전송해도 같은 levelUp을 돌려준다', async () => {
    const harness = await setup()

    // 레벨 2 문턱(6063 xp) 직전까지 xp를 올려 둔 뒤, 마지막 스핀이 레벨업을 만들게 한다.
    await fixedSpin(harness.repos, harness.userId, { key: 'lvl-pre-0000001', bet: 6000, win: 6000 })

    const first = (await (await spinRequest(harness, 'key-replaylv-0001')).json()) as SpinResponse
    expect(first.levelUp).toEqual({ from: 1, to: 2, bonus: 400 })

    const second = (await (await spinRequest(harness, 'key-replaylv-0001')).json()) as SpinResponse
    expect(second.levelUp).toEqual(first.levelUp)
    expect(second.wallet).toEqual(first.wallet)
    expect(harness.repos.countLedgerEntries(harness.userId, 'level_up')).toBe(1)
  })
})
