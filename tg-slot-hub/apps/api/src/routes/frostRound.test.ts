import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GameStateResponseSchema, SpinResponseSchema } from '@tgslot/shared'
import type { FeatureTrigger, SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { VOID_CELL, createSeededRng, foldFrost, parseGameMath, spin } from '@tgslot/slot-engine'
import type { Rng } from '@tgslot/slot-engine'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import type { GamePack } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import type { RoundSeedResponse } from './rounds.js'

const GAME_ID = 'aurora-ice-palace'
const BET = 50

/** 아트가 오기 전이라 `hidden`·썸네일 없음. 수학·manifest만으로 팩을 만들고 status만 `live`로(테스트 전용). */
function auroraPack(): GamePack {
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
  const packs = [auroraPack(), ...(classic ? [classic] : [])]
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs), spinRng })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9410:Aurora' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id, calls }
}

async function spinRaw(h: Harness, key: string, preset?: SpinDebugPreset, gameId = GAME_ID): Promise<Response> {
  return h.app.request(`/games/${gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({
      totalBet: BET,
      idempotencyKey: key,
      ...(preset ? { debug: { preset, maxTries: 20000 } } : {}),
    }),
  })
}

async function spinOk(h: Harness, key: string, preset?: SpinDebugPreset): Promise<SpinResponse> {
  const res = await spinRaw(h, key, preset)
  expect(res.status).toBe(200)
  return SpinResponseSchema.parse(await res.json())
}

function chainOf(features: FeatureTrigger[]): Extract<FeatureTrigger, { type: 'frostChain' }> | undefined {
  const feature = features.find((candidate) => candidate.type === 'frostChain')
  return feature?.type === 'frostChain' ? feature : undefined
}

describe('aurora-ice-palace 얼려 두기 프리스핀 API', () => {
  it('진입(frostRound): 프리스핀 8~12회, carry.frost 초기값, 판 밖 칸은 VOID', async () => {
    const h = await setup()
    const body = await spinOk(h, 'aurora-entry-0001', 'frostRound')
    const entry = body.features.find((feature) => feature.type === 'freeSpins')
    expect(entry?.type === 'freeSpins' ? [8, 10, 12].includes(entry.spins) : false).toBe(true)
    expect(body.freeSpins?.carry?.frost).toEqual({ level: 0, paid: 0, bestCount: 0, bonusTotal: 0 })
    expect(body.grid[3]?.[0]).toBe(VOID_CELL)
    expect(body.grid[4]?.[1]).toBe(VOID_CELL)
    expect(body.grid.flat().filter((cell) => cell !== VOID_CELL)).toHaveLength(19)
    expect(body.frostWin).toBeUndefined()
    const state = GameStateResponseSchema.parse(
      await (await h.app.request(`/games/${GAME_ID}/state`, { headers: { authorization: `Bearer ${h.token}` } })).json(),
    )
    expect(state.freeSpins?.carry?.frost).toEqual(body.freeSpins?.carry?.frost)
  })

  it('얼림(frostChain12): frostWin = 피처 bonus, totalWin 분해, foldFrost = finalGrid, 새로고침 복원·재전송·시드 공개', async () => {
    const h = await setup()
    await spinOk(h, 'aurora-chain-0000', 'frostRound')
    const body = await spinOk(h, 'aurora-chain-0001', 'frostChain12')
    expect(body.isFreeSpin).toBe(true)
    const chain = chainOf(body.features)
    expect(chain).toBeDefined()
    if (chain === undefined) return
    expect(chain.count).toBeGreaterThanOrEqual(12)
    expect(body.frostWin).toBe(chain.bonus)
    const line = body.wins.reduce((sum, win) => sum + win.win, 0)
    const scatter = body.features.reduce((sum, feature) => sum + (feature.type === 'scatterWin' ? feature.win : 0), 0)
    if (!body.features.some((feature) => feature.type === 'winCapped')) expect(body.totalWin).toBe(line + scatter + chain.bonus)
    expect(foldFrost(body.grid, chain)).toEqual(chain.finalGrid)
    expect(body.wins.every((win) => win.direction === 'center')).toBe(true)

    // 새로고침: 서버 carry가 남은 횟수·오로라 단계를 그대로 준다.
    if (body.freeSpins !== null) {
      const state = GameStateResponseSchema.parse(
        await (await h.app.request(`/games/${GAME_ID}/state`, { headers: { authorization: `Bearer ${h.token}` } })).json(),
      )
      expect(state.freeSpins?.left).toBe(body.freeSpins.left)
      expect(state.freeSpins?.carry?.frost?.level).toBe(chain.auroraAfter)
      expect(state.freeSpins?.carry?.frost?.bestCount).toBe(chain.count)
    }

    // 같은 키 재전송: debug 블록만 빼고 바이트가 같다(엔진 재실행 없음).
    const again = (await (await spinRaw(h, 'aurora-chain-0001', 'frostChain12')).json()) as SpinResponse
    const { debug: _debug, ...withoutDebug } = (await (await spinRaw(h, 'aurora-chain-0001')).json()) as SpinResponse
    expect(JSON.stringify(again)).toBe(JSON.stringify(withoutDebug))
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(1)

    // 시드 공개: stateBefore로 재생하면 같은 판·단계·금액, 잭팟 판정은 얼림 뒤 마지막 1회.
    const reveal = (await (
      await h.app.request(`/rounds/${body.roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })
    ).json()) as RoundSeedResponse
    expect(createHash('sha256').update(reveal.seed).digest('hex')).toBe(body.seedHash)
    expect(reveal.stateBefore?.carry?.frost).toBeDefined()
    const counted = { calls: 0, inner: createSeededRng(reveal.seedInput) }
    const replay = spin(
      auroraPack().math,
      { totalBet: reveal.totalBet },
      { nextInt: (max) => (counted.calls++, counted.inner.nextInt(max)) },
      reveal.stateBefore ?? undefined,
    )
    expect(replay.totalWin).toBe(body.totalWin)
    expect(replay.stops).toEqual(body.stops)
    const replayed = replay.features.find((feature) => feature.type === 'frostChain')
    expect(replayed?.type === 'frostChain' ? replayed.steps : null).toEqual(chain.steps)
    const log = h.calls.get(reveal.seedInput) ?? []
    expect(log).toHaveLength(counted.calls + 1)
    expect(log[log.length - 1]).toBe(JACKPOT_ODDS_DENOMINATOR)
  }, 30_000)

  it('라운드 끝: freeSpinsSummary.frost = 최다 칸·마지막 오로라·보너스 합', async () => {
    const h = await setup()
    await spinOk(h, 'aurora-end-00000', 'frostRound')
    let bonusTotal = 0
    let best = 0
    let level = 0
    let last: SpinResponse | undefined
    for (let i = 1; i <= 25; i += 1) {
      last = await spinOk(h, `aurora-end-${String(i).padStart(5, '0')}`)
      const chain = chainOf(last.features)
      if (chain !== undefined) {
        bonusTotal += chain.bonus
        best = Math.max(best, chain.count)
        level = chain.auroraAfter
      }
      if (last.freeSpins === null) break
    }
    expect(last?.freeSpins).toBeNull()
    expect(last?.freeSpinsSummary?.frost).toEqual({ bestCount: best, auroraLevel: level, bonusTotal })
  }, 30_000)

  it('auroraUp·frostFull·frostBig 프리셋', async () => {
    const h = await setup()
    await spinOk(h, 'aurora-presets-00', 'frostRound')
    const up = chainOf((await spinOk(h, 'aurora-presets-01', 'auroraUp')).features)
    expect(up !== undefined && up.auroraAfter > up.auroraBefore).toBe(true)
    expect(up?.count).toBeGreaterThanOrEqual(15)
    const full = await spinOk(h, 'aurora-presets-02', 'frostFull')
    expect(chainOf(full.features)?.count).toBe(19)
    if (full.freeSpins !== null) {
      const big = chainOf((await spinOk(h, 'aurora-presets-03', 'frostBig')).features)
      expect(big?.bonus).toBeGreaterThanOrEqual(25 * BET)
    }
  }, 60_000)

  it('frostTease: 유료 판, 진입 없이 가운데·안쪽 릴에 구슬 2개', async () => {
    const h = await setup()
    const res = await spinOk(h, 'aurora-tease-00', 'frostTease')
    expect(res.freeSpins).toBeNull()
    expect(res.features.some((feature) => feature.type === 'freeSpins')).toBe(false)
    const inner = res.grid.flatMap((row) => row.filter((cell, reel) => reel > 0 && reel < row.length - 1 && cell === 'scatter'))
    expect(inner).toHaveLength(2)
  })

  it('얼림이 없는 게임은 프리셋 6종 모두 409', async () => {
    const h = await setup()
    for (const preset of ['frostRound', 'frostChain12', 'auroraUp', 'frostFull', 'frostBig', 'frostTease'] as const) {
      const res = await spinRaw(h, `classic-${preset}-001`, preset, 'classic-777')
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
    }
  })
})
