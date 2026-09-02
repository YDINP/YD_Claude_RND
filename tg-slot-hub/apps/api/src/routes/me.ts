import { Hono } from 'hono'
import { UpdateMeRequestSchema } from '@tgslot/shared'
import type { MeResponse } from '@tgslot/shared'
import type { AppUser, Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { toLevelState } from '../economy/level.js'

export interface MeRouteDeps {
  repos: Repos
  jwt: JwtService
}

/**
 * GET과 PATCH가 **같은 모양**을 돌려주도록 응답 조립을 한 곳에 둔다.
 * 유저 존재는 미들웨어가 이미 보장하므로, `null`은 지갑이 없는 내부 불일치 상태뿐이다.
 */
async function buildMeResponse(repos: Repos, user: AppUser): Promise<MeResponse | null> {
  const [wallet, jackpot] = await Promise.all([repos.getWallet(user.id), repos.getJackpot()])
  if (!wallet) return null

  // level은 xp에서 파생되므로 저장 값이 아니라 계산 값을 응답에 싣는다.
  const levelInfo = toLevelState(user.xp)
  return { user: { ...user, level: levelInfo.level }, wallet, levelInfo, jackpot: jackpot.pool }
}

export function createMeRoute(deps: MeRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()

  route.use('*', authMiddleware(deps.jwt, deps.repos))

  route.get('/', async (c) => {
    // 유저 조회와 존재 확인은 미들웨어가 이미 했다.
    const response = await buildMeResponse(deps.repos, c.get('user'))
    if (!response) return c.json({ error: 'Wallet not found', code: 'NOT_FOUND' }, 404)

    return c.json(response, 200)
  })

  route.patch('/', async (c) => {
    const auth = c.get('auth')

    const body: unknown = await c.req.json().catch(() => null)
    const parsed = UpdateMeRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, 400)
    }

    // 여기서 바꾼 언어는 이후 로그인이 initData의 language_code로 덮어쓰지 못한다.
    const user = await deps.repos.updateLocale(auth.sub, parsed.data.locale)
    // 미들웨어 통과 뒤에 유저가 사라진 경우다. 인증 실패로 통일해 재로그인을 유도한다.
    if (!user) return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 401)

    const response = await buildMeResponse(deps.repos, user)
    if (!response) return c.json({ error: 'Wallet not found', code: 'NOT_FOUND' }, 404)

    return c.json(response, 200)
  })

  return route
}
