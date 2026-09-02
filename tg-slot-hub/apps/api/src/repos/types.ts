import type { SpinResult, WinLine } from '@tgslot/slot-engine'
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

/** 잔액이 베팅액보다 적을 때. 라우트가 402로 번역한다. */
export class InsufficientFundsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number
  ) {
    super(`Insufficient funds: need ${required}, have ${available}`)
    this.name = 'InsufficientFundsError'
  }
}

/** 저장된 스핀 1회. `grid`는 math.json + stops로 재구성하므로 저장하지 않는다. */
export interface RoundRecord {
  id: string
  userId: string
  gameId: string
  bet: number
  win: number
  stops: number[]
  wins: WinLine[]
  seed: string
  seedHash: string
  nonce: number
  idempotencyKey: string
  createdAt: Date
}

/** 라운드 nonce가 정해진 뒤에야 시드를 만들 수 있으므로 결과 계산을 콜백으로 받는다. */
export interface SpinComputation {
  result: SpinResult
  seed: string
  seedHash: string
}

export interface ApplySpinInput {
  userId: string
  gameId: string
  totalBet: number
  idempotencyKey: string
  /** 지갑을 잠그고 잔액을 확인한 뒤, 트랜잭션 안에서 정확히 한 번 호출된다. */
  compute: (nonce: number) => SpinComputation
}

export interface ApplySpinResult {
  round: RoundRecord
  /** 스핀 반영 후 지갑. 클라이언트는 이 값으로 잔액을 덮어쓴다. */
  wallet: AppWallet
  /** 같은 idempotencyKey의 기존 라운드를 그대로 돌려준 경우 true (지갑은 건드리지 않음). */
  replayed: boolean
}

export interface RoundRepo {
  /**
   * 스핀 1회를 원자적으로 반영한다.
   * 지갑 row lock → 멱등키 확인 → 잔액 확인 → nonce 증가 → compute → 차감/적립 + 원장 + 라운드 저장.
   * 전부 한 트랜잭션이며, 실패하면 아무것도 남지 않는다.
   */
  applySpin(input: ApplySpinInput): Promise<ApplySpinResult>
  getRoundById(roundId: string): Promise<RoundRecord | null>
}

export interface Repos extends UserRepo, WalletRepo, RoundRepo {}
