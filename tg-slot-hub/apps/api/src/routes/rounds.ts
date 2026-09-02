import { Hono } from 'hono'
import type { Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { roundSeedInput } from '../spin/provablyFair.js'

export interface RoundsRouteDeps {
  repos: Repos
  jwt: JwtService
}

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
}

export function createRoundsRoute(deps: RoundsRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()

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
    }
    return c.json(response, 200)
  })

  return route
}
