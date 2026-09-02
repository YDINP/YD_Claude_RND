import { Hono } from 'hono'
import type { BonusClaimResponse, BonusStatus } from '@tgslot/shared'
import type { Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { buildBonusStatus, decideDaily, decideRescue, decideTimed } from '../economy/bonus.js'
import type { BonusKind, BonusGrant } from '../economy/bonus.js'
import { LEDGER_REASONS } from '../economy/config.js'
import { systemClock } from '../economy/time.js'
import type { Clock } from '../economy/time.js'
import type { BonusDecisionContext } from '../repos/types.js'

export interface BonusRouteDeps {
  repos: Repos
  jwt: JwtService
  /** 테스트가 시간을 앞당길 수 있도록 주입. 레포와 **같은** 시계를 써야 한다. */
  clock?: Clock
}

/** 세 보너스가 공유하는 수령 파이프라인. 판정 함수만 다르다. */
interface BonusVariant {
  kind: BonusKind
  reason: string
  decide: (ctx: BonusDecisionContext) => BonusGrant | null
  /** 응답에 streakDay를 실을지. 데일리만 의미가 있다. */
  exposeStreak: boolean
}

const VARIANTS: Record<'daily' | 'timed' | 'rescue', BonusVariant> = {
  daily: {
    kind: 'daily',
    reason: LEDGER_REASONS.dailyBonus,
    decide: (ctx) => decideDaily(ctx.lastClaim, ctx.now),
    exposeStreak: true,
  },
  timed: {
    kind: 'timed',
    reason: LEDGER_REASONS.timedBonus,
    decide: (ctx) => decideTimed(ctx.lastClaim, ctx.now),
    exposeStreak: false,
  },
  rescue: {
    kind: 'rescue',
    reason: LEDGER_REASONS.rescueBonus,
    decide: (ctx) => decideRescue(ctx.lastClaim, ctx.wallet.coins, ctx.now),
    exposeStreak: false,
  },
}

export function createBonusRoute(deps: BonusRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()
  const clock = deps.clock ?? systemClock

  route.use('*', authMiddleware(deps.jwt))

  route.get('/', async (c) => {
    const auth = c.get('auth')
    const [claims, wallet] = await Promise.all([
      deps.repos.getBonusClaims(auth.sub),
      deps.repos.getWallet(auth.sub),
    ])
    if (!wallet) return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)

    const response: BonusStatus = buildBonusStatus(claims, wallet.coins, clock())
    return c.json(response, 200)
  })

  for (const [path, variant] of Object.entries(VARIANTS)) {
    route.post(`/${path}/claim`, async (c) => {
      const auth = c.get('auth')

      // 판정은 레포가 트랜잭션 안에서 다시 굴린다. 여기서 미리 확인하지 않는 이유는
      // 확인과 수령 사이에 다른 요청이 끼어들 수 있기 때문이다.
      const claimed = await deps.repos.claimBonus({
        userId: auth.sub,
        kind: variant.kind,
        reason: variant.reason,
        decide: variant.decide,
      })

      if (!claimed) {
        return c.json({ error: 'Bonus is not claimable yet', code: 'NOT_CLAIMABLE' }, 409)
      }

      console.log(
        JSON.stringify({ evt: 'bonus_claim', userId: auth.sub, kind: variant.kind, amount: claimed.amount })
      )

      const response: BonusClaimResponse = {
        amount: claimed.amount,
        wallet: claimed.wallet,
        ...(variant.exposeStreak ? { streakDay: claimed.streakDay } : {}),
      }
      return c.json(response, 200)
    })
  }

  return route
}
