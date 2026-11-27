import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SpinResponseSchema } from '@tgslot/shared'
import type { FeatureTrigger, GameStateResponse, SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createSeededRng, foldGarden, parseGameMath, spin } from '@tgslot/slot-engine'
import type { Rng, RoundState } from '@tgslot/slot-engine'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import type { GamePack } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import type { RoundSeedResponse } from './rounds.js'

const GAME_ID = 'greenhouse-garden'
const BET = 100

/**
 * greenhouse-garden은 아트가 오기 전이라 `hidden`이다. 수학·manifest만으로 팩을 만들고
 * status만 `live`로 바꿔 공개 라우트에 올린다(테스트 전용).
 */
function gardenPack(): GamePack {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`../../../../games/${GAME_ID}/${file}`, import.meta.url), 'utf8'))
  const rawMath = read('math.json')
  const manifest = { ...parseGameManifest(read('manifest.json')), status: 'live' as const }
  return {
    id: GAME_ID,
    manifest,
    math: parseGameMath(rawMath),
    theme: emptyTheme(),
    hasTheme: false,
    prompts: null,
    fx: {},
    hasFxSource: false,
    rawFx: {},
    rawMath,
    summary: toGameSummary(manifest),
  }
}

const classic = loadGamePacks().find((pack) => pack.id === 'classic-777')
const pack = gardenPack()
const maxTier = (pack.math.growBoard?.seedTiers.length ?? 1) - 1

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

interface Harness {
  app: ReturnType<typeof createApp>
  repos: MemoryRepos
  token: string
  userId: string
  calls: Map<string, number[]>
}

async function setup(): Promise<Harness> {
  const repos = new MemoryRepos()
  const calls = new Map<string, number[]>()
  const spinRng = (seed: string, nonce: number): Rng => {
    const inner = createSeededRng(`${seed}:${nonce}`)
    const log: number[] = []
    calls.set(`${seed}:${nonce}`, log)
    return {
      nextInt: (max) => {
        log.push(max)
        return inner.nextInt(max)
      },
    }
  }
  const packs = [gardenPack(), ...(classic ? [classic] : [])]
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs), spinRng })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9410:Garden' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id, calls }
}

async function spinRaw(h: Harness, key: string, preset?: SpinDebugPreset, gameId = GAME_ID, maxTries?: number): Promise<Response> {
  return h.app.request(`/games/${gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({
      totalBet: BET,
      idempotencyKey: key,
      ...(preset ? { debug: { preset, ...(maxTries ? { maxTries } : {}) } } : {}),
    }),
  })
}

async function spinOk(h: Harness, key: string, preset?: SpinDebugPreset): Promise<SpinResponse> {
  const res = await spinRaw(h, key, preset)
  expect(res.status).toBe(200)
  return SpinResponseSchema.parse(await res.json())
}

function gardenOf(features: FeatureTrigger[]): Extract<FeatureTrigger, { type: 'garden' }> {
  const feature = features.find((candidate) => candidate.type === 'garden')
  if (feature?.type !== 'garden') throw new Error('garden 피처가 없다')
  return feature
}

describe('greenhouse-garden 정원 API', () => {
  it('진입 응답: 계약 모양, foldGarden = finalGrid, totalWin = 클러스터 + 물뿌리개, carry.garden 저장·복원', async () => {
    const h = await setup()
    const body = await spinOk(h, 'garden-entry-0001', 'freeSpins')
    const garden = gardenOf(body.features)
    expect(body.grid).toHaveLength(8)
    const fold = foldGarden(body.grid, garden.start, garden.steps, garden.startSeeds, maxTier)
    expect(fold.grid).toEqual(garden.finalGrid)
    expect(fold.bounds).toEqual(garden.final)
    expect(fold.seeds).toEqual(garden.seeds)
    const clusterWin = body.wins.reduce((sum, win) => sum + win.win, 0)
    const scatter = body.features.find((feature) => feature.type === 'scatterWin')
    expect(body.totalWin).toBe(clusterWin + (scatter?.type === 'scatterWin' ? scatter.win : 0))
    expect(body.cascades).toBeUndefined()
    const carry = body.freeSpins?.carry?.garden
    expect(carry).toBeDefined()
    expect(carry?.stage).toBeGreaterThanOrEqual(1)
    expect(carry?.seeds).toEqual(garden.seeds)
    expect(h.repos.getLedgerSum(h.userId)).toBe(body.wallet.coins)

    const stateRes = await h.app.request(`/games/${GAME_ID}/state`, { headers: { authorization: `Bearer ${h.token}` } })
    const state = (await stateRes.json()) as GameStateResponse
    expect(state.freeSpins?.carry?.garden).toEqual(carry)
  })

  it('프리스핀은 carry에서 이어지고, 끝 스핀의 요약 garden = 엔진 라운드 집계, 합계 = 누적', async () => {
    const h = await setup()
    const entry = await spinOk(h, 'garden-round-0000', 'freeSpins')
    let carry = entry.freeSpins?.carry?.garden
    let accumulated = 0
    let last: SpinResponse | undefined
    for (let i = 1; i <= 25 && carry !== undefined; i += 1) {
      const body = await spinOk(h, `garden-round-${String(i).padStart(4, '0')}`)
      expect(body.isFreeSpin).toBe(true)
      const garden = gardenOf(body.features)
      expect(garden.start.size).toBe(4 + carry.stage)
      expect(garden.startSeeds).toEqual(carry.seeds)
      expect(garden.startPopped).toBe(carry.popped)
      accumulated += body.totalWin
      last = body
      carry = body.freeSpins?.carry?.garden
    }
    expect(last?.freeSpins).toBeNull()
    const round = gardenOf(last!.features).round
    expect(last?.freeSpinsSummary?.garden).toEqual({
      maxSize: round?.maxSize,
      bestSeed: round?.bestSeed,
      bestSpinWin: round?.bestSpinWin,
      topUp: round?.topUp,
    })
    expect(last?.freeSpinsSummary?.total).toBe(accumulated)
    expect(accumulated).toBeGreaterThanOrEqual((pack.math.growBoard?.bonus.minRoundPay ?? 0) * BET)
  }, 60_000)

  it('같은 키 재전송은 바이트가 같고(debug 블록 제외) 원장이 늘지 않는다', async () => {
    const h = await setup()
    const first = (await (await spinRaw(h, 'garden-replay-001', 'gardenGrow')).json()) as SpinResponse
    const again = (await (await spinRaw(h, 'garden-replay-001', 'gardenGrow')).json()) as SpinResponse
    const { debug: _debug, ...firstWithoutDebug } = first
    expect(JSON.stringify(again)).toBe(JSON.stringify(firstWithoutDebug))
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(1)
  })

  it('프리스핀 시드 공개: stateBefore(carry.garden)로 재생하면 totalWin·단계가 같고 잭팟 판정은 마지막 1회', async () => {
    const h = await setup()
    await spinOk(h, 'garden-reveal-000', 'freeSpins')
    // 프리스핀이 8×8에서 시작하면 성장 프리셋은 맞출 수 없다 — 평범한 프리스핀으로 재생을 본다.
    const body = await spinOk(h, 'garden-reveal-001')
    expect(body.isFreeSpin).toBe(true)
    const res = await h.app.request(`/rounds/${body.roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })
    const reveal = (await res.json()) as RoundSeedResponse
    expect(createHash('sha256').update(reveal.seed).digest('hex')).toBe(body.seedHash)
    expect(reveal.stateBefore?.carry?.garden).toBeDefined()
    const counted = { calls: 0, inner: createSeededRng(reveal.seedInput) }
    const replay = spin(
      pack.math,
      { totalBet: reveal.totalBet },
      { nextInt: (max) => (counted.calls++, counted.inner.nextInt(max)) },
      reveal.stateBefore as RoundState,
    )
    expect(replay.totalWin).toBe(body.totalWin)
    const replayed = replay.features.find((feature) => feature.type === 'garden')
    expect(JSON.stringify(replayed?.type === 'garden' ? replayed.steps : null)).toBe(JSON.stringify(gardenOf(body.features).steps))
    const log = h.calls.get(reveal.seedInput) ?? []
    expect(log).toHaveLength(counted.calls + 1)
    expect(log[log.length - 1]).toBe(JACKPOT_ODDS_DENOMINATOR)
  })

  it.each(['gardenGrow', 'gardenGrow8', 'seedBloom', 'gardenBig', 'cascade3', 'win', 'lose'] as const)('%s 프리셋', async (preset) => {
    const h = await setup()
    const body = await spinOk(h, `garden-${preset}-0001`, preset)
    const garden = gardenOf(body.features)
    if (preset === 'gardenGrow') expect(garden.steps.some((step) => step.grow !== undefined)).toBe(true)
    if (preset === 'gardenGrow8') {
      expect(garden.final.size).toBe(8)
      expect(JSON.stringify(body).length).toBeLessThan(16 * 1024)
    }
    if (preset === 'seedBloom') expect(garden.steps.some((step) => step.bloomed.length > 0)).toBe(true)
    if (preset === 'gardenBig') expect(body.totalWin).toBeGreaterThanOrEqual(50 * BET)
    if (preset === 'cascade3') expect(garden.steps.filter((step) => step.wins.length > 0).length).toBeGreaterThanOrEqual(3)
    if (preset === 'win') {
      expect(body.totalWin).toBeGreaterThan(0)
      expect(body.features.map((feature) => feature.type)).toEqual(['garden'])
    }
    if (preset === 'lose') expect(body.totalWin).toBe(0)
  }, 30_000)

  it('햇살·최저 보장 프리셋은 유료 스핀에서 탐색 없이 409', async () => {
    const h = await setup()
    for (const preset of ['gardenSun', 'gardenTopUp'] as const) {
      const res = await spinRaw(h, `garden-${preset}-paid`, preset)
      expect(res.status).toBe(409)
    }
  })

  it('정원이 없는 게임은 정원 프리셋 모두 409', async () => {
    const h = await setup()
    for (const preset of ['gardenGrow', 'gardenGrow8', 'seedBloom', 'gardenSun', 'gardenBig', 'gardenTopUp'] as const) {
      const res = await spinRaw(h, `classic-${preset}-0001`, preset, 'classic-777')
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
    }
  })
})
