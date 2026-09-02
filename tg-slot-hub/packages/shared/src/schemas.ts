import { z } from 'zod'
import { SUPPORTED_LOCALES } from './constants.js'

export const LocaleSchema = z.enum(SUPPORTED_LOCALES)

/** 다국어 문자열. en은 필수, 나머지는 선택 */
export const LocalizedStringSchema = z.object({ en: z.string(), ko: z.string().optional() })
export type LocalizedString = z.infer<typeof LocalizedStringSchema>

export const PublicUserSchema = z.object({
  id: z.string(),
  telegramId: z.number().int(),
  firstName: z.string(),
  username: z.string().optional(),
  locale: LocaleSchema,
  level: z.number().int().min(1),
})
export type PublicUser = z.infer<typeof PublicUserSchema>

export const WalletSchema = z.object({
  coins: z.number().int().min(0),
  gems: z.number().int().min(0),
})
export type Wallet = z.infer<typeof WalletSchema>

export const GameStatusSchema = z.enum(['live', 'soon', 'hidden'])
export type GameStatus = z.infer<typeof GameStatusSchema>

/**
 * 게임 변동성 등급. 수학 모델(slot-engine)과 로비 메타데이터(game-sdk)가 함께 쓰므로
 * 두 패키지의 공통 상위인 shared가 소유한다.
 */
export const VolatilitySchema = z.enum(['low', 'medium', 'high'])
export type Volatility = z.infer<typeof VolatilitySchema>

/** 로비 카드에 필요한 최소 게임 정보 (manifest의 요약본) */
export const GameSummarySchema = z.object({
  id: z.string(),
  name: LocalizedStringSchema,
  thumbnail: z.string(),
  status: GameStatusSchema,
  reels: z.number().int().min(1),
  rows: z.number().int().min(1),
  lines: z.number().int().min(1),
  minBet: z.number().int().min(1),
  maxBet: z.number().int().min(1),
  sort: z.number().int().default(0),
})
export type GameSummary = z.infer<typeof GameSummarySchema>

// ---- API 요청/응답 ----
export const AuthTelegramRequestSchema = z.object({ initData: z.string().min(1) })
export type AuthTelegramRequest = z.infer<typeof AuthTelegramRequestSchema>

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: PublicUserSchema,
  wallet: WalletSchema,
})
export type AuthResponse = z.infer<typeof AuthResponseSchema>

export const MeResponseSchema = z.object({ user: PublicUserSchema, wallet: WalletSchema })
export type MeResponse = z.infer<typeof MeResponseSchema>

export const GamesResponseSchema = z.object({ games: z.array(GameSummarySchema) })
export type GamesResponse = z.infer<typeof GamesResponseSchema>

export const ApiErrorSchema = z.object({ error: z.string(), code: z.string().optional() })
export type ApiError = z.infer<typeof ApiErrorSchema>

// ---- 스핀 (Phase 2) ----
export const SpinRequestSchema = z.object({
  totalBet: z.number().int().min(1),
  /** 클라이언트가 스핀마다 새로 만드는 키. 재전송 시 같은 결과를 돌려준다 */
  idempotencyKey: z.string().min(8).max(64),
})
export type SpinRequest = z.infer<typeof SpinRequestSchema>

export const WinLineSchema = z.object({
  line: z.number().int().min(0),
  symbol: z.string(),
  count: z.number().int().min(1),
  multiplier: z.number(),
  win: z.number().int().min(0),
  /** [reel, row] 좌표 목록 */
  positions: z.array(z.tuple([z.number().int(), z.number().int()])),
})
export type WinLine = z.infer<typeof WinLineSchema>

export const SpinResponseSchema = z.object({
  roundId: z.string(),
  stops: z.array(z.number().int()),
  /** grid[row][reel] = symbolId */
  grid: z.array(z.array(z.string())),
  wins: z.array(WinLineSchema),
  totalBet: z.number().int(),
  totalWin: z.number().int(),
  /** 스핀 반영 후 서버 잔액. 클라이언트는 이 값으로 덮어쓴다 */
  wallet: WalletSchema,
  /** provably fair: 라운드 서버 시드의 sha256 hex */
  seedHash: z.string(),
  nonce: z.number().int(),
})
export type SpinResponse = z.infer<typeof SpinResponseSchema>
