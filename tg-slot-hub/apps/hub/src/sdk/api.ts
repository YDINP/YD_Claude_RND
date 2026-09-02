/**
 * API 서버 타입 세이프 fetch 클라이언트.
 * 모든 응답은 @tgslot/shared의 zod 스키마로 검증한다.
 */
import {
  AuthResponseSchema,
  MeResponseSchema,
  GamesResponseSchema,
  SpinResponseSchema,
  ApiErrorSchema,
  BonusStatusSchema,
  BonusClaimResponseSchema,
  JackpotSchema,
  LeaderboardResponseSchema,
  MissionsResponseSchema,
  GameStateResponseSchema,
  GambleResponseSchema,
  type AuthResponse,
  type MeResponse,
  type GamesResponse,
  type AuthTelegramRequest,
  type SpinRequest,
  type SpinResponse,
  type BonusStatus,
  type BonusClaimResponse,
  type Jackpot,
  type LeaderboardResponse,
  type MissionsResponse,
  type GameStateResponse,
  type GambleResponse,
  type GambleSide,
  type Locale,
} from '@tgslot/shared'

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

/**
 * 세션 재인증 훅. store/session.ts가 모듈 로드 시 registerReauthHandler()로 딱 한 번 등록한다.
 * 여기서 '../store/session'을 직접 import하지 않는 이유: session.ts가 이미 이 파일(../sdk/api)을
 * import하고 있어서 정적 순환 import가 되면(특히 Vitest의 vi.mock 호이스팅 순서와 얽혀) 모듈 초기화
 * 순서가 깨진다 — 실제로 시도해보니 session.test.ts의 기존 테스트까지 깨졌다. 지연 등록으로 피한다.
 */
type ReauthHandler = () => Promise<string | null>
let reauthHandler: ReauthHandler | null = null

/** store/session.ts 전용. 다른 곳에서 호출할 필요 없다. */
export function registerReauthHandler(handler: ReauthHandler): void {
  reauthHandler = handler
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

/** zod 스키마 최소 구조. @tgslot/shared 스키마 객체를 그대로 넘길 수 있다. */
interface ParseableSchema<T> {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false }
}

async function requestJson<T>(
  path: string,
  schema: ParseableSchema<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiClientError('서버에 연결할 수 없습니다', 0, 'network_error')
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    if (!res.ok) {
      throw new ApiClientError(`요청 실패 (${res.status})`, res.status)
    }
    throw new ApiClientError('서버 응답을 읽을 수 없습니다', res.status, 'invalid_json')
  }

  if (!res.ok) {
    const parsedError = ApiErrorSchema.safeParse(json)
    if (parsedError.success) {
      throw new ApiClientError(parsedError.data.error, res.status, parsedError.data.code)
    }
    throw new ApiClientError(`요청 실패 (${res.status})`, res.status)
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ApiClientError('서버 응답 형식이 올바르지 않습니다', res.status, 'invalid_response')
  }
  return parsed.data
}

/**
 * 인증이 필요한 요청 공통 래퍼.
 * API가 프로세스 재시작(인메모리 repo) 등으로 토큰의 유저를 더 이상 모르면 401(UNAUTHORIZED)이나
 * 404 code=USER_NOT_FOUND를 돌려준다 — 코드 문자열은 apps/api/src/middleware/auth.ts가 쓰는 것과
 * 정확히 같아야 한다. 이 경우 세션을 재인증(reauth)한 뒤 새 토큰으로 원래 요청을 딱 한 번만
 * 재시도한다. body(idempotencyKey 포함)는 그대로 재사용된다 — 서버는 idempotencyKey를 유저별로
 * 스코프하므로 재인증으로 유저가 바뀌어도 같은 키를 재사용해 문제 없다.
 * 재인증까지 실패하면(초기화 안 됨, initData 없음 등) 원래 에러를 그대로 던진다.
 */
async function authedFetch<T>(
  path: string,
  schema: ParseableSchema<T>,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const withToken = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}` },
  })

  try {
    return await requestJson<T>(path, schema, withToken(token))
  } catch (err) {
    const isStaleToken =
      err instanceof ApiClientError &&
      (err.status === 401 || (err.status === 404 && err.code === 'USER_NOT_FOUND'))
    if (!isStaleToken || !reauthHandler) throw err

    const newToken = await reauthHandler()
    if (!newToken) throw err

    return requestJson<T>(path, schema, withToken(newToken))
  }
}

/** POST /auth/telegram — initData 검증 후 JWT + 유저 + 지갑 반환 */
export async function authTelegram(initData: string): Promise<AuthResponse> {
  const body: AuthTelegramRequest = { initData }
  return requestJson<AuthResponse>('/auth/telegram', AuthResponseSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** GET /me — Authorization: Bearer 토큰으로 내 정보 조회 */
export async function getMe(token: string): Promise<MeResponse> {
  return authedFetch<MeResponse>('/me', MeResponseSchema, token)
}

/** PATCH /me — 언어(locale)를 서버에 저장한다. 'auto'는 로컬에서만 다루고 서버에는 보내지 않는다 */
export async function patchMe(token: string, locale: Locale): Promise<MeResponse> {
  return authedFetch<MeResponse>('/me', MeResponseSchema, token, {
    method: 'PATCH',
    body: JSON.stringify({ locale }),
  })
}

/** GET /games — 로비용 게임 목록 (이미 필터/정렬된 상태) */
export async function getGames(): Promise<GamesResponse> {
  return requestJson<GamesResponse>('/games', GamesResponseSchema)
}

/** 검증 없이 그대로 통과시키는 스키마. math.json은 @tgslot/slot-engine의 parseGameMath()가 검증한다. */
const passthroughSchema: ParseableSchema<unknown> = {
  safeParse: (data: unknown) => ({ success: true, data }),
}

/** GET /games/:id/math — 원시 게임 수학 모델 JSON. 호출부에서 parseGameMath()로 검증한다 */
export async function getGameMath(gameId: string): Promise<unknown> {
  return requestJson<unknown>(`/games/${encodeURIComponent(gameId)}/math`, passthroughSchema)
}

/** POST /games/:id/spin — 서버 권위 스핀. Bearer 토큰 필요 */
export async function spin(token: string, gameId: string, body: SpinRequest): Promise<SpinResponse> {
  return authedFetch<SpinResponse>(`/games/${encodeURIComponent(gameId)}/spin`, SpinResponseSchema, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * GET /games/:id/state — 진행 중인 피처(프리스핀 등) 상태 조회.
 * 게임 화면에 들어올 때마다 호출해 화면을 나갔다 돌아와도(또는 새로고침해도) 서버에 남아있는
 * 프리스핀을 그대로 이어서 보여준다.
 */
export async function getGameState(token: string, gameId: string): Promise<GameStateResponse> {
  return authedFetch<GameStateResponse>(
    `/games/${encodeURIComponent(gameId)}/state`,
    GameStateResponseSchema,
    token,
  )
}

export interface RoundSeedResponse {
  roundId: string
  gameId: string
  seed: string
  seedHash: string
  nonce: number
  /** 그 라운드의 릴 정지 위치. 클라이언트가 재생(replay)한 결과와 비교하는 기준값. */
  stops: number[]
  /** `createSeededRng(seedInput)`(@tgslot/slot-engine)에 그대로 넣으면 같은 stops가 나온다. */
  seedInput: string
}

function isRoundSeedResponse(data: unknown): data is RoundSeedResponse {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.roundId === 'string' &&
    typeof d.gameId === 'string' &&
    typeof d.seed === 'string' &&
    typeof d.seedHash === 'string' &&
    typeof d.nonce === 'number' &&
    Array.isArray(d.stops) &&
    d.stops.every((n) => typeof n === 'number') &&
    typeof d.seedInput === 'string'
  )
}

const roundSeedSchema: ParseableSchema<RoundSeedResponse> = {
  safeParse: (data: unknown) => {
    if (isRoundSeedResponse(data)) return { success: true, data }
    return { success: false }
  },
}

/** GET /rounds/:id/seed — provably fair 검증용 서버 시드 공개 */
export async function getRoundSeed(token: string, roundId: string): Promise<RoundSeedResponse> {
  return authedFetch<RoundSeedResponse>(`/rounds/${encodeURIComponent(roundId)}/seed`, roundSeedSchema, token)
}

/**
 * POST /rounds/:id/gamble — 더블업 한 판. `pick`(heads/tails)이 실제로 뒤집힌 면과 같으면 2배,
 * 다르면 0. 클라이언트는 절대 결과를 스스로 계산하지 않는다 — 서버 응답만 신뢰한다.
 * `idempotencyKey`는 서버가 사실상 필수로 요구한다(8자 미만/누락이면 400 BAD_REQUEST) — 재전송
 * 방어를 위해 호출부(store)가 매 단계 새 키를 만들고, 네트워크 오류/GAMBLE_IN_PROGRESS(409)/
 * GAMBLE_TIMEOUT(503)일 때만 같은 키로 재시도한다.
 */
export async function gamble(
  token: string,
  roundId: string,
  pick: GambleSide,
  idempotencyKey: string,
): Promise<GambleResponse> {
  return authedFetch<GambleResponse>(`/rounds/${encodeURIComponent(roundId)}/gamble`, GambleResponseSchema, token, {
    method: 'POST',
    body: JSON.stringify({ pick, idempotencyKey }),
  })
}

/** POST /rounds/:id/collect — 지금까지 걸려 있는 더블업 당첨금을 챙기고 세션을 끝낸다. */
export async function collectGamble(token: string, roundId: string): Promise<GambleResponse> {
  return authedFetch<GambleResponse>(`/rounds/${encodeURIComponent(roundId)}/collect`, GambleResponseSchema, token, {
    method: 'POST',
  })
}

// ---- 허브 기능 (Phase 3) ----

/** GET /bonus — 데일리/4시간/구제 보너스 수령 가능 상태 */
export async function getBonusStatus(token: string): Promise<BonusStatus> {
  return authedFetch<BonusStatus>('/bonus', BonusStatusSchema, token)
}

/** POST /bonus/daily/claim — 실패 시 서버가 409 NOT_CLAIMABLE을 돌려줄 수 있다 */
export async function claimDailyBonus(token: string): Promise<BonusClaimResponse> {
  return authedFetch<BonusClaimResponse>('/bonus/daily/claim', BonusClaimResponseSchema, token, {
    method: 'POST',
  })
}

/** POST /bonus/timed/claim */
export async function claimTimedBonus(token: string): Promise<BonusClaimResponse> {
  return authedFetch<BonusClaimResponse>('/bonus/timed/claim', BonusClaimResponseSchema, token, {
    method: 'POST',
  })
}

/** POST /bonus/rescue/claim */
export async function claimRescueBonus(token: string): Promise<BonusClaimResponse> {
  return authedFetch<BonusClaimResponse>('/bonus/rescue/claim', BonusClaimResponseSchema, token, {
    method: 'POST',
  })
}

/** GET /jackpot — 공개 엔드포인트, 토큰이 없어도 조회 가능 */
export async function getJackpot(): Promise<Jackpot> {
  return requestJson<Jackpot>('/jackpot', JackpotSchema)
}

/** GET /leaderboard — 이번 주 리더보드 */
export async function getLeaderboard(token: string): Promise<LeaderboardResponse> {
  return authedFetch<LeaderboardResponse>('/leaderboard', LeaderboardResponseSchema, token)
}

/** GET /missions — 오늘의 미션 목록 */
export async function getMissions(token: string): Promise<MissionsResponse> {
  return authedFetch<MissionsResponse>('/missions', MissionsResponseSchema, token)
}

/** POST /missions/:id/claim — 보너스 수령과 같은 응답 형태(amount + wallet)를 쓴다 */
export async function claimMission(token: string, missionId: string): Promise<BonusClaimResponse> {
  return authedFetch<BonusClaimResponse>(
    `/missions/${encodeURIComponent(missionId)}/claim`,
    BonusClaimResponseSchema,
    token,
    { method: 'POST' },
  )
}
