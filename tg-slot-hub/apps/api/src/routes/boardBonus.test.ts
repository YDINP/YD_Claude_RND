import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createSeededRng, parseGameMath, replayBoard, spin as engineSpin } from '@tgslot/slot-engine'
import type { GameMath, SpinResult } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import { BOARD_BIG_PAYOUT, matchesDebugPreset } from '../games/debugSpin.js'
import type { RoundSeedResponse } from './rounds.js'
import type { ApiConfig } from '../config.js'

const BET = 100
const GAME = 'hanbok-night-market'
const BOARD_PRESETS: SpinDebugPreset[] = ['boardBonus', 'boardGoal', 'boardTraps', 'boardFork', 'boardBig']

const diskPacks = loadGamePacks()

function pack(id: string): GamePack {
  const found = diskPacks.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`${id} 팩이 없다`)
  return found
}

/**
 * 말판 팩. 아트(썸네일·테마)가 아직 없으면 서빙 검증에서 빠지므로, 그때는 manifest·math만으로 팩을 만든다.
 * 수학·API 경로는 아트와 무관하다.
 */
function hanbokPack(): GamePack {
  const found = diskPacks.find((candidate) => candidate.id === GAME)
  if (found) return found
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`../../../../games/${GAME}/${file}`, import.meta.url), 'utf8'))
  const rawMath = read('math.json')
  const manifest = parseGameManifest(read('manifest.json'))
  return {
    id: GAME,
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

async function setup(packs: GamePack[], telegramId = 9101) {
  const repos = new MemoryRepos()
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs) })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: `mock:${telegramId}:BoardTester` }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

type Harness = Awaited<ReturnType<typeof setup>>

async function spinRequest(h: Harness, gameId: string, key: string, preset?: SpinDebugPreset) {
  return h.app.request(`/games/${gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({
      totalBet: BET,
      idempotencyKey: key,
      ...(preset === undefined ? {} : { debug: { preset, maxTries: 20000 } }),
    }),
  })
}

type BoardFeature = Extract<SpinResponse['features'][number], { type: 'boardBonus' }>

function boardOf(body: SpinResponse): BoardFeature | undefined {
  return body.features.find((feature): feature is BoardFeature => feature.type === 'boardBonus')
}

describe('말판 프리셋은 말판 팩에서만 탐색한다', () => {
  for (const preset of BOARD_PRESETS) {
    it(`${preset}: 말판이 없는 팩은 탐색 없이 409 DEBUG_NO_MATCH다`, async () => {
      const h = await setup([pack('classic-777')])
      const res = await spinRequest(h, 'classic-777', `key-noboard-${preset}`, preset)
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
      expect((await h.repos.getWallet(h.userId))?.coins).toBe(STARTING_COINS)
    })
  }
})

describe('matchesDebugPreset 말판', () => {
  const base: SpinResult = {
    stops: [],
    gridBefore: [],
    grid: [],
    mutations: [],
    wins: [],
    lineWin: 0,
    scatterWin: 0,
    totalWin: 0,
    features: [],
  }
  const math = hanbokPack().math
  const row = { steps: 2, extraThrow: false, path: ['o1', 'o2'], at: 'o2', route: 'outer', tile: 'coin' as const, value: 2, pot: 2, multiplier: 1, traps: 0, throwsLeft: 4 }
  const board = (patch: Record<string, unknown>): SpinResult => ({
    ...base,
    features: [{ type: 'boardBonus', throws: [row], end: 'throws', pot: 2, multiplier: 1, payout: 5, win: 500, ...patch }],
  })

  it('boardBonus·boardGoal·boardTraps·boardBig는 피처 값만 본다', () => {
    expect(matchesDebugPreset('boardBonus', board({}), BET, false)).toBe(true)
    expect(matchesDebugPreset('boardBonus', base, BET, false)).toBe(false)
    expect(matchesDebugPreset('boardGoal', board({ end: 'goal' }), BET, false)).toBe(true)
    expect(matchesDebugPreset('boardGoal', board({}), BET, false)).toBe(false)
    expect(matchesDebugPreset('boardTraps', board({ end: 'traps' }), BET, false)).toBe(true)
    expect(matchesDebugPreset('boardBig', board({ payout: BOARD_BIG_PAYOUT }), BET, false)).toBe(true)
    expect(matchesDebugPreset('boardBig', board({ payout: BOARD_BIG_PAYOUT - 1 }), BET, false)).toBe(false)
  })

  it('boardFork는 갈림길 칸에 멈춘 던지기가 있어야 맞는다 (math 필요)', () => {
    const forked = board({ throws: [{ ...row, path: ['o1', 'o2', 'o3', 'o4', 'o5'], at: 'o5', route: 'a', steps: 5 }] })
    expect(matchesDebugPreset('boardFork', forked, BET, false, math)).toBe(true)
    expect(matchesDebugPreset('boardFork', board({}), BET, false, math)).toBe(false)
    expect(matchesDebugPreset('boardFork', forked, BET, false)).toBe(false)
  })
})

describe('hanbok-night-market 종단', () => {
  const hanbok = (): GamePack => visible(hanbokPack())

  it('boardBonus: 말판 피처가 실리고 계약을 통과하며, 재전송은 같은 바이트·원장 1건이다', async () => {
    const h = await setup([hanbok()])
    const res = await spinRequest(h, GAME, 'key-board-entry-01', 'boardBonus')
    const text = await res.text()
    expect(res.status).toBe(200)
    const body = JSON.parse(text) as SpinResponse
    expect(SpinResponseSchema.safeParse(body).success).toBe(true)
    const board = boardOf(body)
    expect(board).toBeDefined()
    if (board === undefined) return
    expect(board.win).toBe(board.payout * BET)
    expect(body.isFreeSpin).toBe(false)
    expect(body.freeSpins).toBeNull()
    const scatter = body.features.find((feature) => feature.type === 'scatterWin')
    const lineWin = body.wins.reduce((sum, win) => sum + win.win, 0)
    expect(body.totalWin).toBe(lineWin + (scatter?.type === 'scatterWin' ? scatter.win : 0) + board.win)
    const wallet = body.wallet.coins

    const replay = await spinRequest(h, GAME, 'key-board-entry-01')
    const { debug: _debug, ...withoutDebug } = body
    void _debug
    expect(JSON.parse(await replay.text())).toEqual(withoutDebug)
    expect((await h.repos.getWallet(h.userId))?.coins).toBe(wallet)
  })

  it('공개된 시드로 말판까지 그대로 재현되고 replayBoard도 같은 값을 낸다', async () => {
    const h = await setup([hanbok()], 9102)
    const res = await spinRequest(h, GAME, 'key-board-seed-01', 'boardFork')
    expect(res.status).toBe(200)
    const body = (await res.json()) as SpinResponse
    const board = boardOf(body)
    expect(board).toBeDefined()
    if (board === undefined) return
    const math = hanbok().math as GameMath
    expect(board.throws.some((row) => math.boardBonus?.forks[row.at] !== undefined)).toBe(true)

    const revealRes = await h.app.request(`/rounds/${body.roundId}/seed`, {
      headers: { authorization: `Bearer ${h.token}` },
    })
    expect(revealRes.status).toBe(200)
    const reveal = (await revealRes.json()) as RoundSeedResponse
    expect(reveal.stateBefore).toBeNull()
    const replay = engineSpin(math, { totalBet: reveal.totalBet }, createSeededRng(reveal.seedInput))
    expect(replay.stops).toEqual(body.stops)
    expect(replay.totalWin).toBe(body.totalWin)
    expect(replay.boardWin).toBe(board.win)

    const config = math.boardBonus
    if (config === undefined) throw new Error('boardBonus 없음')
    const again = replayBoard(config, board.throws.map((row) => row.steps), BET, Infinity)
    expect(again.pot).toBe(board.pot)
    expect(again.multiplier).toBe(board.multiplier)
    expect(again.payout).toBe(board.payout)
    expect(again.end).toBe(board.end)
  })

  it('boardGoal·boardTraps·boardBig를 강제할 수 있다', async () => {
    const h = await setup([hanbok()], 9103)
    const goal = (await (await spinRequest(h, GAME, 'key-board-goal-001', 'boardGoal')).json()) as SpinResponse
    expect(boardOf(goal)?.end).toBe('goal')
    const traps = (await (await spinRequest(h, GAME, 'key-board-traps-01', 'boardTraps')).json()) as SpinResponse
    expect(boardOf(traps)?.end).toBe('traps')
    const big = (await (await spinRequest(h, GAME, 'key-board-big-0001', 'boardBig')).json()) as SpinResponse
    expect(boardOf(big)?.payout).toBeGreaterThanOrEqual(BOARD_BIG_PAYOUT)
  }, 30_000)
})
