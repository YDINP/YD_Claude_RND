import { Hono } from 'hono'
import type { BonusClaimResponse, MissionsResponse } from '@tgslot/shared'
import type { Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { LEDGER_REASONS } from '../economy/config.js'
import { findMissionDef, toMissionDtos } from '../economy/missions.js'
import { systemClock, utcDayKey } from '../economy/time.js'
import type { Clock } from '../economy/time.js'

export interface MissionsRouteDeps {
  repos: Repos
  jwt: JwtService
  /** 테스트가 시간을 앞당길 수 있도록 주입. 레포와 **같은** 시계를 써야 한다. */
  clock?: Clock
}

export function createMissionsRoute(deps: MissionsRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()
  const clock = deps.clock ?? systemClock

  route.use('*', authMiddleware(deps.jwt, deps.repos))

  route.get('/', async (c) => {
    const auth = c.get('auth')
    const day = utcDayKey(clock())
    const progress = await deps.repos.getMissionProgress(auth.sub, day)

    const response: MissionsResponse = { day, missions: toMissionDtos(progress) }
    return c.json(response, 200)
  })

  route.post('/:id/claim', async (c) => {
    const auth = c.get('auth')
    const missionId = c.req.param('id')

    const def = findMissionDef(missionId)
    if (!def) return c.json({ error: 'Mission not found', code: 'MISSION_NOT_FOUND' }, 404)

    // 완료 여부와 중복 수령 판정은 레포가 트랜잭션 안에서 한다.
    const claimed = await deps.repos.claimMission({
      userId: auth.sub,
      day: utcDayKey(clock()),
      missionId: def.id,
      target: def.target,
      reward: def.reward,
      reason: LEDGER_REASONS.missionReward,
    })

    if (!claimed) {
      return c.json({ error: 'Mission is not completed or already claimed', code: 'NOT_CLAIMABLE' }, 409)
    }

    console.log(JSON.stringify({ evt: 'mission_claim', userId: auth.sub, missionId: def.id, amount: claimed.amount }))

    const response: BonusClaimResponse = { amount: claimed.amount, wallet: claimed.wallet }
    return c.json(response, 200)
  })

  return route
}
