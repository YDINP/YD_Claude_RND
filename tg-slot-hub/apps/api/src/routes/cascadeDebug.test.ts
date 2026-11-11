import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createSeededRng, spin as engineSpin } from '@tgslot/slot-engine'
import type { CascadeStep, GameMath, SpinResult } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import { findDebugSeed, matchesDebugPreset } from '../games/debugSpin.js'
import { createRoundRng } from '../spin/provablyFair.js'
import { ORDER_CARDS } from '../testing/cascadeScript.js'
import type { RoundSeedResponse } from './rounds.js'
import type { ApiConfig } from '../config.js'

const BET = 100
const CASCADE_PRESETS: SpinDebugPreset[] = ['cascade3', 'orderRound', 'orderComplete']

const diskPacks = loadGamePacks()

function pack(id: string): GamePack {
  const found = diskPacks.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`${id} 팩이 없다`)
  return found
}

/** hidden 팩은 공개 라우트에서 보이지 않으므로 테스트에서만 live로 바꾼 사본을 쓴다. */
function visible(source: GamePack): GamePack {
  return { ...source, summary: { ...source.summary, status: 'live' } }
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

async function setup(packs: GamePack[], telegramId = 8301) {
  const repos = new MemoryRepos()
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs) })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: `mock:${telegramId}:CascadeDebugger` }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

type Harness = Awaited<ReturnType<typeof setup>>

async function debugSpin(h: Harness, gameId: string, key: string, preset: SpinDebugPreset, maxTries?: number, totalBet = BET) {
  return h.app.request(`/games/${gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({
      totalBet,
      idempotencyKey: key,
      debug: { preset, ...(maxTries === undefined ? {} : { maxTries }) },
    }),
  })
}

function result(partial: Partial<SpinResult>): SpinResult {
  return {
    stops: [],
    gridBefore: [],
    grid: [],
    mutations: [],
    wins: [],
    lineWin: 0,
    scatterWin: 0,
    totalWin: 0,
    features: [],
    ...partial,
  }
}

function steps(count: number): CascadeStep[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    wins: [],
    removed: [],
    refill: [],
    multiplier: 1,
    stepWin: 0,
  }))
}

describe('연쇄·주문 프리셋은 그 피처가 있는 팩에서만 탐색한다', () => {
  for (const preset of CASCADE_PRESETS) {
    it(`${preset}: 연쇄·주문이 없는 팩은 탐색 없이 409 DEBUG_NO_MATCH다`, async () => {
      const h = await setup([pack('classic-777')])

      const res = await debugSpin(h, 'classic-777', `key-nocascade-${preset}`, preset)

      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
      expect((await h.repos.getWallet(h.userId))?.coins).toBe(STARTING_COINS)
    })
  }
})

describe('matchesDebugPreset 연쇄·주문', () => {
  it('cascade3: 연쇄 3단계 이상만 맞는다', () => {
    expect(matchesDebugPreset('cascade3', result({ cascades: steps(3) }), BET, false)).toBe(true)
    expect(matchesDebugPreset('cascade3', result({ cascades: steps(2) }), BET, false)).toBe(false)
    expect(matchesDebugPreset('cascade3', result({}), BET, false)).toBe(false)
  })

  it('orderRound: 유료 스핀의 진입만 맞는다', () => {
    const entry = result({ features: [{ type: 'orderRound', cards: ORDER_CARDS }] })
    expect(matchesDebugPreset('orderRound', entry, BET, false)).toBe(true)
    expect(matchesDebugPreset('orderRound', entry, BET, true)).toBe(false)
  })

  it('orderComplete: 완료 피처가 하나라도 있어야 맞는다', () => {
    const done = result({ features: [{ type: 'orderComplete', id: 'size-9', prize: 300 }] })
    expect(matchesDebugPreset('orderComplete', done, BET, true)).toBe(true)
    expect(matchesDebugPreset('orderComplete', result({}), BET, true)).toBe(false)
  })
})

describe('디버그 탐색 지연', () => {
  const classic = pack('classic-777')

  it('끝내 못 찾는 5,000회 탐색이 1초 안에 끝난다 (락 15초 대비)', () => {
    const started = performance.now()
    const found = findDebugSeed({
      math: classic.math,
      totalBet: BET,
      state: undefined,
      nonce: 1,
      preset: 'cascade3',
      maxTries: 5000,
      createRng: createRoundRng,
    })
    const elapsed = performance.now() - started

    expect(found).toBeNull()
    expect(elapsed).toBeLessThan(1000)
  })
})

/** 엔진(lane E)이 연쇄를 돌리기 시작했는지. 아직이면 엔진이 필요한 종단 테스트는 건너뛴다. */
function candyEngineReady(): boolean {
  try {
    const candy = pack('candy-cluster-pop')
    const sample = engineSpin(candy.math as GameMath, { totalBet: BET }, createSeededRng('probe'))
    return sample.cascades !== undefined || sample.finalGrid !== undefined
  } catch {
    return false
  }
}

const READY = candyEngineReady()

describe.skipIf(!READY)('candy-cluster-pop 종단 (엔진 필요)', () => {
  const candy = (): GamePack => visible(pack('candy-cluster-pop'))

  it('cascade3: 연쇄 3단계 이상을 찾아 cascades·finalGrid를 싣고 재전송은 같은 바이트다', async () => {
    const h = await setup([candy()])
    const res = await debugSpin(h, 'candy-cluster-pop', 'key-candy-cascade-3', 'cascade3', undefined, 20)
    const text = await res.text()
    expect(res.status).toBe(200)
    const body = JSON.parse(text) as SpinResponse
    expect(SpinResponseSchema.safeParse(body).success).toBe(true)
    expect(body.cascades?.length).toBeGreaterThanOrEqual(3)
    expect(body.finalGrid).toBeDefined()

    const replay = await h.app.request('/games/candy-cluster-pop/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
      body: JSON.stringify({ totalBet: 20, idempotencyKey: 'key-candy-cascade-3' }),
    })
    const { debug: _debug, ...withoutDebug } = body
    expect(JSON.parse(await replay.text())).toEqual(withoutDebug)
  })

  it('orderRound 진입 뒤 orderComplete까지 강제할 수 있고 carry가 상태에 남는다', async () => {
    // 한 스핀에 끝낼 수 있는 카드(클러스터 크기·연쇄 길이)가 한 장은 깔릴 때까지 새 유저로 다시 진입한다.
    // 전부 터뜨린 개수 카드(30개 등)면 어떤 시드로도 한 스핀에 완료할 수 없다.
    let h: Harness | null = null
    let entryBody: SpinResponse | null = null
    for (let attempt = 0; attempt < 12 && entryBody === null; attempt += 1) {
      const candidate = await setup([candy()], 8400 + attempt)
      const entry = await debugSpin(candidate, 'candy-cluster-pop', 'key-candy-order-001', 'orderRound', undefined, 20)
      expect(entry.status).toBe(200)
      const body = (await entry.json()) as SpinResponse
      if (body.freeSpins?.carry?.orders?.cards.some((card) => card.kind !== 'popSymbol')) {
        h = candidate
        entryBody = body
      }
    }
    if (h === null || entryBody === null) throw new Error('한 스핀에 완료할 수 있는 카드가 깔린 진입을 12번 안에 못 만들었다')
    expect(entryBody.features.some((feature) => feature.type === 'orderRound')).toBe(true)
    expect(entryBody.freeSpins?.carry?.orders?.cards.length).toBeGreaterThan(0)

    const done = await debugSpin(h, 'candy-cluster-pop', 'key-candy-order-002', 'orderComplete', 20000)
    expect(done.status).toBe(200)
    const doneBody = (await done.json()) as SpinResponse
    expect(doneBody.features.some((feature) => feature.type === 'orderComplete')).toBe(true)
    expect(doneBody.orderWin).toBeGreaterThan(0)
  })

  it('못 찾는 5,000회 탐색(orderComplete, 유료 상태)이 1초 안에 끝난다', () => {
    const started = performance.now()
    const found = findDebugSeed({
      math: candy().math,
      totalBet: BET,
      state: undefined,
      nonce: 1,
      preset: 'orderComplete',
      maxTries: 5000,
      createRng: createRoundRng,
    })
    expect(found).toBeNull()
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('주문 라운드 스핀은 공개된 시드와 stateBefore로 그대로 재현된다', async () => {
    const h = await setup([candy()])
    const entry = await debugSpin(h, 'candy-cluster-pop', 'key-candy-seed-0001', 'orderRound', undefined, 20)
    expect(entry.status).toBe(200)

    const roundRes = await h.app.request('/games/candy-cluster-pop/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
      body: JSON.stringify({ totalBet: 20, idempotencyKey: 'key-candy-seed-0002' }),
    })
    const round = (await roundRes.json()) as SpinResponse
    expect(round.isFreeSpin).toBe(true)

    const revealRes = await h.app.request(`/rounds/${round.roundId}/seed`, {
      headers: { authorization: `Bearer ${h.token}` },
    })
    const reveal = (await revealRes.json()) as RoundSeedResponse
    expect(reveal.stateBefore?.carry?.orders).toBeDefined()

    const replay = engineSpin(candy().math as GameMath, { totalBet: reveal.totalBet }, createSeededRng(reveal.seedInput), reveal.stateBefore ?? undefined)
    expect(replay.stops).toEqual(round.stops)
    expect(replay.totalWin).toBe(round.totalWin)
    expect(replay.finalGrid).toEqual(round.finalGrid)
  })
})
