import { SignJWT, jwtVerify } from 'jose'
import { JWT_TTL } from '@tgslot/shared'

export interface TokenPayload {
  /** 내부 user.id (uuid) */
  sub: string
  /** telegram user id */
  tid: number
}

export interface VerifiedToken extends TokenPayload {
  iat: number
  exp: number
}

export interface JwtService {
  signToken(payload: TokenPayload): Promise<string>
  verifyToken(token: string): Promise<VerifiedToken | null>
}

/** JWT_SECRET을 클로저로 감싸 signToken/verifyToken을 간단한 시그니처로 노출한다. */
export function createJwtService(jwtSecret: string): JwtService {
  const key = new TextEncoder().encode(jwtSecret)

  return {
    async signToken(payload: TokenPayload): Promise<string> {
      return new SignJWT({ tid: payload.tid })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime(JWT_TTL)
        .sign(key)
    },

    async verifyToken(token: string): Promise<VerifiedToken | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
        if (typeof payload.sub !== 'string' || typeof payload.tid !== 'number') return null
        return {
          sub: payload.sub,
          tid: payload.tid,
          iat: payload.iat ?? 0,
          exp: payload.exp ?? 0,
        }
      } catch {
        return null
      }
    },
  }
}
