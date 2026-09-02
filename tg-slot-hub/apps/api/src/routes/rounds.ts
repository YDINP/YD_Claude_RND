import { Hono } from 'hono'
import { GambleRequestSchema } from '@tgslot/shared'
import type { GambleResponse } from '@tgslot/shared'
import { createSeededRng } from '@tgslot/slot-engine'
import type { Rng } from '@tgslot/slot-engine'
import type { Repos } from '../repos/types.js'
import type { GambleStepRecord } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { roundSeedInput } from '../spin/provablyFair.js'
import { drawGamble, gambleSeedInput } from '../economy/gamble.js'
import type { GameRegistry } from '../games/registry.js'
import { SpinLock, SpinInProgressError, SpinTimeoutError } from '../spin/lock.js'
import type { ApiConfig } from '../config.js'

export interface RoundsRouteDeps {
  repos: Repos
  jwt: JwtService
  /** 더블업 설정은 게임 팩이 갖고 있어서 레지스트리가 필요하다 */
  registry: GameRegistry
  /**
   * 더블업 판정 RNG 팩토리. 기본은 시드 결정론 RNG이고,
   * 테스트가 승패를 강제할 때만 갈아끼운다.
   */
  createRng?: (seedInput: string) => Rng
  config: Pick<ApiConfig, 'spinLockTimeoutMs'>
}

/** 헤더로 온 멱등키. 본문에 없을 때 여기서 찾는다. */
const IDEMPOTENCY_HEADER = 'Idempotency-Key'
const MIN_KEY_LENGTH = 8

/** provably fair 검증에 필요한 것 전부. shared는 이 형태를 아직 모르므로 api가 소유한다. */
export interface RoundSeedResponse {
  roundId: string
  gameId: string
  seed: string
  seedHash: string
  nonce: number
  stops: number[]
  /** `createSeededRng(seedInput)`에 그대로 넣으면 같은 stops가 나온다. */
  seedInput: string
  /** 프리스핀으로 돈 라운드인지. 베팅은 차감되지 않았다. */
  isFreeSpin: boolean
  /**
   * 이 스핀에 적용된 승수 (스핀 **직전**의 세션 배수). 기본 게임은 1.
   * 재현할 때 `totalWin`을 맞추려면 이 값이 필요하다.
   */
  multiplier: number
  /** 재현에 쓸 베팅액. 프리스핀이면 진입 시점에 고정된 값이다. */
  totalBet: number
  /**
   * 이 라운드에서 진행한 더블업 판정. 각 단계의 `seedInput`으로 같은 결과를 재현할 수 있다.
   * 더블업을 하지 않았으면 빈 배열이다.
   */
  gamble: GambleStepRecord[]
}

export function createRoundsRoute(deps: RoundsRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()
  const createRng = deps.createRng ?? createSeededRng
  // 같은 유저의 더블업을 인프로세스에서 직렬화한다. 같은 키면 기다렸다 저장된 결과를 받고,
  // 다른 키가 겹치면 409다. 스핀 락과 같은 장치를 그대로 쓴다.
  const lock = new SpinLock(deps.config.spinLockTimeoutMs)

  route.get('/:id/seed', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const auth = c.get('auth')
    const round = await deps.repos.getRoundById(c.req.param('id'))

    // 남의 라운드는 존재 여부조차 알려주지 않는다. 없는 것과 같은 404로 답한다.
    if (!round || round.userId !== auth.sub) {
      return c.json({ error: 'Round not found', code: 'ROUND_NOT_FOUND' }, 404)
    }

    const response: RoundSeedResponse = {
      roundId: round.id,
      gameId: round.gameId,
      seed: round.seed,
      seedHash: round.seedHash,
      nonce: round.nonce,
      stops: round.stops,
      seedInput: roundSeedInput(round.seed, round.nonce),
      isFreeSpin: round.isFreeSpin,
      multiplier: round.multiplier,
      totalBet: round.bet,
      gamble: round.gambleSteps,
    }
    return c.json(response, 200)
  })

  route.post('/:id/gamble', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const auth = c.get('auth')
    const roundId = c.req.param('id')

    const body: unknown = await c.req.json().catch(() => null)
    const parsed = GambleRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, 400)
    }

    // 본문에 없으면 헤더에서 찾는다. 둘 다 없으면 재전송을 구분할 수 없어 거절한다.
    const idempotencyKey = parsed.data.idempotencyKey ?? c.req.header(IDEMPOTENCY_HEADER)?.trim()
    if (!idempotencyKey || idempotencyKey.length < MIN_KEY_LENGTH) {
      return c.json(
        { error: `idempotencyKey is required (at least ${MIN_KEY_LENGTH} chars, body or ${IDEMPOTENCY_HEADER} header)`, code: 'BAD_REQUEST' },
        400
      )
    }

    const round = await deps.repos.getRoundById(roundId)
    // 남의 라운드는 존재 여부조차 알려주지 않는다.
    if (!round || round.userId !== auth.sub) {
      return c.json({ error: 'Round not found', code: 'ROUND_NOT_FOUND' }, 404)
    }

    const pack = deps.registry.getVisible(round.gameId)
    if (!pack?.math.gamble) {
      return c.json({ error: 'This game has no gamble feature', code: 'GAMBLE_UNAVAILABLE' }, 409)
    }
    const config = pack.math.gamble

    try {
      const outcome = await lock.run(auth.sub, idempotencyKey, () =>
        deps.repos.applyGamble({
          userId: auth.sub,
          gameId: round.gameId,
          roundId,
          pick: parsed.data.pick,
          idempotencyKey,
          config,
          // 판정은 트랜잭션 안에서 한 번만 돈다. 시드는 라운드 시드에서 이어 붙인다.
          decide: (ctx) => {
            const step = ctx.state.steps.length + 1
            const seedInput = gambleSeedInput(ctx.round.seed, ctx.round.nonce, step)
            const draw = drawGamble(createRng(seedInput), parsed.data.pick, config.chance)
            return { ...draw, seedInput }
          },
        })
      )

      if (!outcome) {
        return c.json({ error: 'No gamble is available for this round', code: 'NOT_GAMBLEABLE' }, 409)
      }

      console.log(
        JSON.stringify({
          evt: 'gamble',
          userId: auth.sub,
          roundId,
          outcome: outcome.outcome,
          pendingWin: outcome.pendingWin,
          autoCollected: outcome.autoCollected,
          replayed: outcome.replayed,
        })
      )

      const response: GambleResponse = {
        outcome: outcome.outcome,
        autoCollected: outcome.autoCollected,
        ...(outcome.side ? { side: outcome.side } : {}),
        pendingWin: outcome.pendingWin,
        wallet: outcome.wallet,
        stepsLeft: outcome.stepsLeft,
        seedInput: outcome.seedInput,
        ...(outcome.expiresAt ? { expiresAt: outcome.expiresAt } : {}),
      }
      return c.json(response, 200)
    } catch (error) {
      if (error instanceof SpinInProgressError) {
        return c.json({ error: 'Another gamble step is already in progress', code: 'GAMBLE_IN_PROGRESS' }, 409)
      }
      if (error instanceof SpinTimeoutError) {
        return c.json({ error: 'Gamble timed out, retry with the same idempotencyKey', code: 'GAMBLE_TIMEOUT' }, 503)
      }
      throw error
    }
  })

  route.post('/:id/collect', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const auth = c.get('auth')
    const roundId = c.req.param('id')

    const round = await deps.repos.getRoundById(roundId)
    if (!round || round.userId !== auth.sub) {
      return c.json({ error: 'Round not found', code: 'ROUND_NOT_FOUND' }, 404)
    }

    const outcome = await deps.repos.collectGamble({ userId: auth.sub, gameId: round.gameId, roundId })
    if (!outcome) {
      return c.json({ error: 'No gamble is available for this round', code: 'NOT_GAMBLEABLE' }, 409)
    }

    const response: GambleResponse = {
      outcome: outcome.outcome,
      autoCollected: outcome.autoCollected,
      pendingWin: outcome.pendingWin,
      wallet: outcome.wallet,
      stepsLeft: 0,
      seedInput: '',
    }
    return c.json(response, 200)
  })

  return route
}
