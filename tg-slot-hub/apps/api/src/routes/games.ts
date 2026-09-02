import { Hono } from 'hono'
import { SpinRequestSchema } from '@tgslot/shared'
import type { GamesResponse, SpinResponse, WinLine as SharedWinLine } from '@tgslot/shared'
import { buildGrid, spin } from '@tgslot/slot-engine'
import type { Rng, WinLine as EngineWinLine } from '@tgslot/slot-engine'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import { toLevelState } from '../economy/level.js'
import { toMissionDtos } from '../economy/missions.js'
import type { ApiConfig } from '../config.js'
import type { GameRegistry } from '../games/registry.js'
import type { Repos } from '../repos/types.js'
import { InsufficientFundsError } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { SpinLock, SpinInProgressError, SpinTimeoutError } from '../spin/lock.js'
import { createRoundRng, createRoundSeed, hashSeed } from '../spin/provablyFair.js'

/** math.json은 게임 버전이 올라갈 때만 바뀌므로 짧게 캐시한다. */
const MATH_CACHE_MAX_AGE_SEC = 300

export interface GamesRouteDeps {
  registry: GameRegistry
  repos: Repos
  jwt: JwtService
  config: Pick<ApiConfig, 'spinLockTimeoutMs'>
  /** 테스트에서 락을 공유하고 싶을 때 주입. 없으면 config의 타임아웃으로 새로 만든다. */
  lock?: SpinLock
  /**
   * 라운드 RNG 팩토리. 기본은 `createRoundRng`(=시드+nonce 결정론 RNG)이고,
   * 테스트가 잭팟 당첨 같은 희귀 경로를 강제할 때만 갈아끼운다.
   */
  createRng?: (seed: string, nonce: number) => Rng
}

/** 엔진의 WinLine과 shared의 WinLine은 모양이 같지만 소유 패키지가 다르므로 명시적으로 옮긴다. */
function toSharedWinLine(win: EngineWinLine): SharedWinLine {
  return {
    line: win.line,
    symbol: win.symbol,
    count: win.count,
    multiplier: win.multiplier,
    win: win.win,
    positions: win.positions.map(([reel, row]) => [reel, row] as [number, number]),
  }
}

export function createGamesRoute(deps: GamesRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()
  const lock = deps.lock ?? new SpinLock(deps.config.spinLockTimeoutMs)
  const createRng = deps.createRng ?? createRoundRng

  route.get('/', (c) => {
    const response: GamesResponse = { games: deps.registry.list() }
    return c.json(response, 200)
  })

  route.get('/:id/math', (c) => {
    const pack = deps.registry.getVisible(c.req.param('id'))
    if (!pack) return c.json({ error: 'Game not found', code: 'GAME_NOT_FOUND' }, 404)

    c.header('Cache-Control', `public, max-age=${MATH_CACHE_MAX_AGE_SEC}`)
    return c.json(pack.rawMath, 200)
  })

  route.post('/:id/spin', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const auth = c.get('auth')
    const gameId = c.req.param('id')

    const pack = deps.registry.getVisible(gameId)
    if (!pack) return c.json({ error: 'Game not found', code: 'GAME_NOT_FOUND' }, 404)

    const body: unknown = await c.req.json().catch(() => null)
    const parsed = SpinRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, 400)
    }
    const { totalBet, idempotencyKey } = parsed.data

    // 엔진의 assertBetLevel이 던지기 전에 먼저 걸러 400 INVALID_BET으로 응답한다.
    if (!pack.math.betLevels.includes(totalBet)) {
      return c.json(
        { error: `Bet ${totalBet} is not an allowed bet level`, code: 'INVALID_BET' },
        400
      )
    }

    // 베팅 상한은 레벨로 해금된다. 게임의 betLevels에 있는 값이라도 레벨이 낮으면 막는다.
    // 유저는 미들웨어가 이미 읽어 컨텍스트에 실어 뒀다.
    // 저장된 level 컬럼이 아니라 xp에서 다시 계산한다. /me가 보여주는 상한과 항상 같아야 한다.
    const maxBet = toLevelState(c.get('user').xp).maxBet
    if (totalBet > maxBet) {
      return c.json(
        { error: `Bet ${totalBet} is locked. Your level allows up to ${maxBet}`, code: 'BET_LOCKED' },
        400
      )
    }

    try {
      const applied = await lock.run(auth.sub, idempotencyKey, () =>
        deps.repos.applySpin({
          userId: auth.sub,
          gameId: pack.id,
          totalBet,
          idempotencyKey,
          compute: (nonce) => {
            const seed = createRoundSeed()
            const rng = createRng(seed, nonce)
            // 릴을 **먼저** 뽑고 그 다음 잭팟을 뽑는다. 이 순서가 바뀌면 공개된 시드로
            // 라운드를 재현할 수 없게 되므로 provably fair가 깨진다.
            const result = spin(pack.math, { totalBet }, rng)
            return {
              result,
              seed,
              seedHash: hashSeed(seed),
              jackpotRoll: rng.nextInt(JACKPOT_ODDS_DENOMINATOR),
            }
          },
        })
      )
      const { round, wallet, replayed } = applied

      console.log(
        JSON.stringify({
          evt: 'spin',
          userId: auth.sub,
          gameId: pack.id,
          bet: round.bet,
          win: round.win,
          nonce: round.nonce,
          replayed,
          jackpotWin: applied.jackpotWin,
          levelUp: applied.levelUp?.to,
        })
      )

      const response: SpinResponse = {
        roundId: round.id,
        stops: round.stops,
        // grid는 저장하지 않는다. stops + math.json으로 항상 같은 격자가 나온다.
        grid: buildGrid(pack.math, round.stops),
        wins: round.wins.map(toSharedWinLine),
        totalBet: round.bet,
        totalWin: round.win,
        wallet,
        seedHash: round.seedHash,
        nonce: round.nonce,
        ...(applied.jackpotWin === undefined ? {} : { jackpotWin: applied.jackpotWin }),
        jackpot: applied.jackpot,
        ...(applied.levelUp ? { levelUp: applied.levelUp } : {}),
        missions: toMissionDtos(applied.missions),
      }
      return c.json(response, 200)
    } catch (error) {
      if (error instanceof SpinInProgressError) {
        return c.json({ error: 'Another spin is already in progress', code: 'SPIN_IN_PROGRESS' }, 409)
      }
      if (error instanceof InsufficientFundsError) {
        return c.json({ error: 'Not enough coins', code: 'INSUFFICIENT_FUNDS' }, 402)
      }
      // 락은 이미 풀렸다. 유저는 **같은 키로** 재시도하면 되고, 그 사이 원래 작업이 끝났다면
      // 멱등 경로를 타고 같은 결과를 받는다.
      if (error instanceof SpinTimeoutError) {
        console.error(`[api] spin timed out after ${error.timeoutMs}ms (user=${auth.sub}, game=${pack.id})`)
        return c.json({ error: 'Spin timed out, retry with the same idempotencyKey', code: 'SPIN_TIMEOUT' }, 503)
      }
      throw error
    }
  })

  return route
}
