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
    }
    return c.json(response, 200)
  })

  return route
}
