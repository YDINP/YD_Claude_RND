import type { TelegramUser } from '../auth/initData.js'
import type { Locale } from '@tgslot/shared'

export interface AppUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
  locale: Locale
  level: number
}

export interface AppWallet {
  coins: number
  gems: number
}

export interface UpsertResult {
  user: AppUser
  wallet: AppWallet
  /** 이번 호출에서 새로 생성됐는지 (신규 유저면 signup_bonus가 지급됨) */
  created: boolean
}

export interface UserRepo {
  upsertFromTelegram(tgUser: TelegramUser, locale: Locale): Promise<UpsertResult>
  getById(userId: string): Promise<AppUser | null>
}

export interface WalletRepo {
  getWallet(userId: string): Promise<AppWallet | null>
}

export interface Repos extends UserRepo, WalletRepo {}
