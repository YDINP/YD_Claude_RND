/**
 * API 서버 타입 세이프 fetch 클라이언트.
 * 모든 응답은 @tgslot/shared의 zod 스키마로 검증한다.
 */
import {
  AuthResponseSchema,
  MeResponseSchema,
  GamesResponseSchema,
  ApiErrorSchema,
  type AuthResponse,
  type MeResponse,
  type GamesResponse,
  type AuthTelegramRequest,
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
