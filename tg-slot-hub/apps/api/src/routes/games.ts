import { Hono } from 'hono'
import { SpinRequestSchema } from '@tgslot/shared'
import type {
  GameStateResponse,
  GamesResponse,
  SpinDebugPreset,
  SpinResponse,
  WinLine as SharedWinLine,
} from '@tgslot/shared'
import { buildGrid } from '@tgslot/slot-engine'
import type { Rng, WinLine as EngineWinLine } from '@tgslot/slot-engine'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import { toLevelState } from '../economy/level.js'
import { toMissionDtos } from '../economy/missions.js'
import { applyMutationsToGrid, spinWithState, toRoundState, toSharedFeatures } from '../games/engineSpin.js'
import { DebugNoMatchError, findDebugSeed } from '../games/debugSpin.js'
import type { ApiConfig } from '../config.js'
import type { GameRegistry } from '../games/registry.js'
import type { Repos } from '../repos/types.js'
import { BetRuleError, InsufficientFundsError } from '../repos/types.js'
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
  /** `allowDevMock`은 `debug` 강제 프리셋 요청을 허용할지 결정한다 (개발/테스트 환경 전용). */
  config: Pick<ApiConfig, 'spinLockTimeoutMs' | 'allowDevMock'>
  /** 테스트에서 락을 공유하고 싶을 때 주입. 없으면 config의 타임아웃으로 새로 만든다. */
  lock?: SpinLock
  /**
   * 라운드 RNG 팩토리. 기본은 `createRoundRng`(=시드+nonce 결정론 RNG)이고,
   * 테스트가 잭팟 당첨 같은 희귀 경로를 강제할 때만 갈아끼운다.
   */
  createRng?: (seed: string, nonce: number) => Rng
}

/**
 * 엔진의 WinLine과 shared의 WinLine은 모양이 같지만 소유 패키지가 다르므로 명시적으로 옮긴다.
 * 필드를 하나씩 옮기는 구조라 엔진에 필드가 늘면 여기도 같이 늘려야 한다.
 */
function toSharedWinLine(win: EngineWinLine): SharedWinLine {
  return {
    line: win.line,
    symbol: win.symbol,
    count: win.count,
    multiplier: win.multiplier,
    win: win.win,
    positions: win.positions.map(([reel, row]) => [reel, row] as [number, number]),
    // 심볼 그룹(Any BAR 등)으로 지급된 라인일 때만 있다. 연출이 그룹 이름을 띄우는 데 쓴다.
    ...(win.group === undefined ? {} : { group: win.group }),
    // ways 지급일 때만. 라인 게임에는 없다.
    ...(win.ways === undefined ? {} : { ways: win.ways }),
    ...(win.direction === undefined ? {} : { direction: win.direction }),
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

  route.get('/:id/state', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const pack = deps.registry.getVisible(c.req.param('id'))
    if (!pack) return c.json({ error: 'Game not found', code: 'GAME_NOT_FOUND' }, 404)

    // 새로고침한 클라이언트가 진행 중인 프리스핀을 이어서 돌 수 있게 서버 상태를 그대로 준다.
    const state = await deps.repos.getGameState(c.get('auth').sub, pack.id)
    const response: GameStateResponse = { freeSpins: state.freeSpins, state }
    return c.json(response, 200)
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
    const { totalBet, idempotencyKey, debug } = parsed.data

    // 개발 전용 강제 프리셋. `allowDevMock`이 꺼져 있으면 (프로덕션 기본값) 요청 자체를 거부한다.
    if (debug && !deps.config.allowDevMock) {
      return c.json({ error: 'Debug spin presets are disabled', code: 'DEBUG_DISABLED' }, 400)
    }
    // gamble 프리셋은 그 게임에 더블업 설정이 없으면 애초에 만족될 수 없다. 시드 탐색을
    // 낭비하지 않고 바로 알려준다.
    if (debug?.preset === 'gamble' && !pack.math.gamble) {
      return c.json({ error: 'This game has no gamble feature, so no gamble outcome can be forced', code: 'DEBUG_NO_MATCH' }, 409)
    }

    // 베팅 상한은 레벨로 해금된다. 유저는 미들웨어가 이미 읽어 컨텍스트에 실어 뒀고,
    // 저장된 level 컬럼이 아니라 xp에서 다시 계산한다 (/me가 보여주는 상한과 항상 같아야 한다).
    const maxBet = toLevelState(c.get('user').xp).maxBet

    // compute()가 (재전송이 아닌) 새 라운드를 실제로 계산했을 때만 채워진다. 재전송이면
    // compute()가 아예 호출되지 않으므로 자연스럽게 undefined로 남아 응답에서 빠진다 —
    // 그래서 debug 프리셋은 멱등 재전송 시맨틱을 건드리지 않는다 (저장된 결과를 그대로 돌려줄 뿐).
    let debugUsed: { preset: SpinDebugPreset; triesUsed: number } | undefined

    try {
      const applied = await lock.run(auth.sub, idempotencyKey, () =>
        deps.repos.applySpin({
          userId: auth.sub,
          gameId: pack.id,
          totalBet,
          idempotencyKey,
          // 더블업 설정은 math.json이 갖고 있다. 없는 게임이면 제안이 열리지 않는다.
          ...(pack.math.gamble ? { gamble: pack.math.gamble } : {}),
          compute: (ctx) => {
            // 베팅 규칙은 **락을 잡은 뒤** 확정된 값으로 검사한다. 트랜잭션 밖에서 읽은
            // 상태로 판단하면 그 사이 프리스핀이 시작/종료됐을 때 잘못된 판정이 나온다.
            // 프리스핀은 코인을 걸지 않으므로 두 검사 모두 건너뛴다.
            if (!ctx.isFreeSpin) {
              if (!pack.math.betLevels.includes(ctx.totalBet)) {
                throw new BetRuleError('INVALID_BET', `Bet ${ctx.totalBet} is not an allowed bet level`)
              }
              if (ctx.totalBet > maxBet) {
                throw new BetRuleError(
                  'BET_LOCKED',
                  `Bet ${ctx.totalBet} is locked. Your level allows up to ${maxBet}`
                )
              }
            }

            const state = ctx.isFreeSpin ? toRoundState(ctx.freeSpins) : undefined
            let seed: string
            let rng: ReturnType<typeof createRng>
            let result: ReturnType<typeof spinWithState>

            if (debug) {
              // 시드 탐색: 실제 스핀과 같은 rng 파생(`${seed}:${nonce}`)과 같은 엔진 경로로
              // 지갑/원장/라운드를 건드리지 않고 조건을 만족하는 시드가 나올 때까지 반복한다.
              // 매칭에 쓴 rng를 그대로 이어받아 잭팟 판정을 뽑으므로 소비 순서가 실제 경로와 같다.
              const found = findDebugSeed({
                math: pack.math,
                totalBet: ctx.totalBet,
                state,
                nonce: ctx.nonce,
                preset: debug.preset,
                maxTries: debug.maxTries,
                createRng,
              })
              if (!found) throw new DebugNoMatchError(debug.preset)
              seed = found.seed
              rng = found.rng
              result = found.result
              debugUsed = { preset: debug.preset, triesUsed: found.triesUsed }
            } else {
              seed = createRoundSeed()
              rng = createRng(seed, ctx.nonce)
              // 릴을 **먼저** 뽑고 그 다음 잭팟을 뽑는다. 이 순서가 바뀌면 공개된 시드로
              // 라운드를 재현할 수 없게 되므로 provably fair가 깨진다.
              // 베팅액과 라운드 상태는 레포가 락을 잡고 읽은 값이다 (프리스핀이면 고정 베팅).
              // 라운드 상태는 **프리스핀일 때만** 넘긴다. 유료 스핀에 넘기면 엔진이 그 스핀을
              // 프리스핀으로 취급해 남은 횟수를 깎는다.
              result = spinWithState(pack.math, ctx.totalBet, rng, state)
            }

            return {
              result,
              seed,
              seedHash: hashSeed(seed),
              jackpotRoll: rng.nextInt(JACKPOT_ODDS_DENOMINATOR),
              features: toSharedFeatures(result.features),
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
          freeSpin: applied.isFreeSpin,
          freeSpinsLeft: applied.freeSpins?.left,
        })
      )

      // 뮤테이션이 있으면 평가 격자는 stops만으로 되살릴 수 없다. 저장해 둔 것을 쓰고,
      // 뮤테이션이 없거나 이 필드가 없던 시절의 라운드면 stops로 재구성한다.
      const rebuiltGrid = buildGrid(pack.math, round.stops)
      const gridBefore = round.gridBefore ?? rebuiltGrid
      const grid = applyMutationsToGrid(gridBefore, round.mutations)

      const response: SpinResponse = {
        roundId: round.id,
        stops: round.stops,
        grid,
        gridBefore,
        mutations: round.mutations,
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
        isFreeSpin: round.isFreeSpin,
        features: round.features,
        freeSpins: applied.freeSpins,
        ...(applied.freeSpinsSummary ? { freeSpinsSummary: applied.freeSpinsSummary } : {}),
        ...(applied.gambleOffer ? { gambleOffer: applied.gambleOffer } : {}),
        ...(debugUsed ? { debug: debugUsed } : {}),
      }
      return c.json(response, 200)
    } catch (error) {
      if (error instanceof SpinInProgressError) {
        return c.json({ error: 'Another spin is already in progress', code: 'SPIN_IN_PROGRESS' }, 409)
      }
      // 베팅 규칙 위반은 트랜잭션 안에서 판정하고 여기서 400으로 번역한다.
      if (error instanceof BetRuleError) {
        return c.json({ error: error.message, code: error.code }, 400)
      }
      // 시드 탐색이 maxTries 안에 프리셋을 만족하는 결과를 못 찾았을 때. 시드는 로그에 남기지 않는다.
      if (error instanceof DebugNoMatchError) {
        return c.json({ error: error.message, code: 'DEBUG_NO_MATCH' }, 409)
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
