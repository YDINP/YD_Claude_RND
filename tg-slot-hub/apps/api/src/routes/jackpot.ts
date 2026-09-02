import { Hono } from 'hono'
import type { Jackpot } from '@tgslot/shared'
import type { JackpotState, Repos } from '../repos/types.js'

export interface JackpotRouteDeps {
  repos: Repos
}

/** 레포의 Date를 API의 ISO 문자열로 옮긴다. */
export function toJackpotResponse(state: JackpotState): Jackpot {
  return {
    pool: state.pool,
    ...(state.lastWin
      ? { lastWin: { amount: state.lastWin.amount, at: state.lastWin.at.toISOString(), userId: state.lastWin.userId } }
      : {}),
  }
}

/** 잭팟 풀은 로비의 미끼라서 로그인 전에도 보여준다. 유일한 무인증 허브 라우트다. */
export function createJackpotRoute(deps: JackpotRouteDeps): Hono {
  const route = new Hono()

  route.get('/', async (c) => {
    const response = toJackpotResponse(await deps.repos.getJackpot())
    return c.json(response, 200)
  })

  return route
}
