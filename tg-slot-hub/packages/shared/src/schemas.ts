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
