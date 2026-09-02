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
} from '@tgslot/shared'

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

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
  return requestJson<MeResponse>('/me', MeResponseSchema, {
    headers: { Authorization: `Bearer ${token}` },
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
  return requestJson<SpinResponse>(`/games/${encodeURIComponent(gameId)}/spin`, SpinResponseSchema, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
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
  return requestJson<RoundSeedResponse>(`/rounds/${encodeURIComponent(roundId)}/seed`, roundSeedSchema, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ---- 허브 기능 (Phase 3) ----

/** GET /bonus — 데일리/4시간/구제 보너스 수령 가능 상태 */
export async function getBonusStatus(token: string): Promise<BonusStatus> {
  return requestJson<BonusStatus>('/bonus', BonusStatusSchema, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** POST /bonus/daily/claim — 실패 시 서버가 409 NOT_CLAIMABLE을 돌려줄 수 있다 */
export async function claimDailyBonus(token: string): Promise<BonusClaimResponse> {
  return requestJson<BonusClaimResponse>('/bonus/daily/claim', BonusClaimResponseSchema, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** POST /bonus/timed/claim */
export async function claimTimedBonus(token: string): Promise<BonusClaimResponse> {
  return requestJson<BonusClaimResponse>('/bonus/timed/claim', BonusClaimResponseSchema, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** POST /bonus/rescue/claim */
export async function claimRescueBonus(token: string): Promise<BonusClaimResponse> {
  return requestJson<BonusClaimResponse>('/bonus/rescue/claim', BonusClaimResponseSchema, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** GET /jackpot — 공개 엔드포인트, 토큰이 없어도 조회 가능 */
export async function getJackpot(): Promise<Jackpot> {
  return requestJson<Jackpot>('/jackpot', JackpotSchema)
}

/** GET /leaderboard — 이번 주 리더보드 */
export async function getLeaderboard(token: string): Promise<LeaderboardResponse> {
  return requestJson<LeaderboardResponse>('/leaderboard', LeaderboardResponseSchema, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** GET /missions — 오늘의 미션 목록 */
export async function getMissions(token: string): Promise<MissionsResponse> {
  return requestJson<MissionsResponse>('/missions', MissionsResponseSchema, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** POST /missions/:id/claim — 보너스 수령과 같은 응답 형태(amount + wallet)를 쓴다 */
export async function claimMission(token: string, missionId: string): Promise<BonusClaimResponse> {
  return requestJson<BonusClaimResponse>(
    `/missions/${encodeURIComponent(missionId)}/claim`,
    BonusClaimResponseSchema,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  )
}
