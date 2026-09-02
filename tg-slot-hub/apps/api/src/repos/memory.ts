import { randomUUID } from 'node:crypto'
import { STARTING_COINS, STARTING_GEMS } from '@tgslot/shared'
import type { Locale } from '@tgslot/shared'
import type { TelegramUser } from '../auth/initData.js'
import { InsufficientFundsError } from './types.js'
import type { AppUser, AppWallet, ApplySpinInput, ApplySpinResult, Repos, RoundRecord, UpsertResult } from './types.js'

type Currency = 'coins' | 'gems'

interface LedgerEntry {
  id: number
  userId: string
  delta: number
  currency: Currency
  reason: string
  refId?: string
  createdAt: Date
}

/** 지갑 내부 상태. nonce는 API 응답에 나가지 않으므로 AppWallet에는 없다. */
interface WalletState extends AppWallet {
  nonce: number
}

/**
 * 프로세스 메모리 안에서만 사는 레포. dev/test 전용.
 * ledger 배열을 실제로 유지해서 `sum(ledger.delta) == wallet.coins` 불변식을 지킨다.
 */
export class MemoryRepos implements Repos {
  private readonly usersById = new Map<string, AppUser>()
  private readonly usersByTelegramId = new Map<number, string>()
  private readonly wallets = new Map<string, WalletState>()
  private readonly ledger: LedgerEntry[] = []
  private readonly rounds = new Map<string, RoundRecord>()
  /** `${userId}:${idempotencyKey}` -> roundId. Postgres의 unique 제약과 같은 역할. */
  private readonly roundIdsByKey = new Map<string, string>()
  private nextLedgerId = 1

  async upsertFromTelegram(tgUser: TelegramUser, locale: Locale): Promise<UpsertResult> {
    const existingId = this.usersByTelegramId.get(tgUser.id)

    if (existingId) {
      const user = this.usersById.get(existingId)
      const wallet = this.wallets.get(existingId)
      if (!user || !wallet) {
        throw new Error('[memory-repo] inconsistent state: user/wallet missing for known telegramId')
      }
      user.firstName = tgUser.firstName
      user.locale = locale
      if (tgUser.username) user.username = tgUser.username
      return { user: { ...user }, wallet: toAppWallet(wallet), created: false }
    }

    const id = randomUUID()
    const user: AppUser = {
      id,
      telegramId: tgUser.id,
      firstName: tgUser.firstName,
      username: tgUser.username,
      locale,
      level: 1,
    }
    this.usersById.set(id, user)
    this.usersByTelegramId.set(tgUser.id, id)

    const wallet: WalletState = { coins: 0, gems: 0, nonce: 0 }
    this.wallets.set(id, wallet)
    this.credit(id, wallet, 'coins', STARTING_COINS, 'signup_bonus')
    this.credit(id, wallet, 'gems', STARTING_GEMS, 'signup_bonus')

    return { user: { ...user }, wallet: toAppWallet(wallet), created: true }
  }

  async getById(userId: string): Promise<AppUser | null> {
    const user = this.usersById.get(userId)
    return user ? { ...user } : null
  }

  async getWallet(userId: string): Promise<AppWallet | null> {
    const wallet = this.wallets.get(userId)
    return wallet ? toAppWallet(wallet) : null
  }

  /**
   * Drizzle 구현과 같은 의미론을 단일 스레드에서 재현한다.
   * 이 메서드 안에는 `await`이 없으므로 실행 자체가 원자적이다 (JS 이벤트 루프가 중간에 끼어들 수 없다).
   */
  async applySpin(input: ApplySpinInput): Promise<ApplySpinResult> {
    const wallet = this.wallets.get(input.userId)
    if (!wallet) throw new Error('[memory-repo] wallet not found')

    const key = idempotencyMapKey(input.userId, input.idempotencyKey)
    const existingRoundId = this.roundIdsByKey.get(key)
    if (existingRoundId !== undefined) {
      const existing = this.rounds.get(existingRoundId)
      if (!existing) throw new Error('[memory-repo] inconsistent state: idempotency key without round')
      return { round: cloneRound(existing), wallet: toAppWallet(wallet), replayed: true }
    }

    if (wallet.coins < input.totalBet) {
      throw new InsufficientFundsError(input.totalBet, wallet.coins)
    }

    const nonce = wallet.nonce + 1
    const { result, seed, seedHash } = input.compute(nonce)
    const roundId = randomUUID()

    wallet.nonce = nonce
    this.credit(input.userId, wallet, 'coins', -input.totalBet, 'spin_bet', roundId)
    if (result.totalWin > 0) {
      this.credit(input.userId, wallet, 'coins', result.totalWin, 'spin_win', roundId)
    }

    const round: RoundRecord = {
      id: roundId,
      userId: input.userId,
      gameId: input.gameId,
      bet: input.totalBet,
      win: result.totalWin,
      stops: [...result.stops],
      wins: result.wins,
      seed,
      seedHash,
      nonce,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
    }
    this.rounds.set(roundId, round)
    this.roundIdsByKey.set(key, roundId)

    return { round: cloneRound(round), wallet: toAppWallet(wallet), replayed: false }
  }

  async getRoundById(roundId: string): Promise<RoundRecord | null> {
    const round = this.rounds.get(roundId)
    return round ? cloneRound(round) : null
  }

  /** 테스트용 불변식 검사 보조. Repos 인터페이스에는 없다. */
  getLedgerSum(userId: string, currency: Currency = 'coins'): number {
    return this.ledger
      .filter((entry) => entry.userId === userId && entry.currency === currency)
      .reduce((sum, entry) => sum + entry.delta, 0)
  }

  /** 테스트용. 특정 사유의 원장 항목 수. */
  countLedgerEntries(userId: string, reason: string): number {
    return this.ledger.filter((entry) => entry.userId === userId && entry.reason === reason).length
  }

  private credit(
    userId: string,
    wallet: WalletState,
    currency: Currency,
    delta: number,
    reason: string,
    refId?: string
  ): void {
    if (delta === 0) return
    wallet[currency] += delta
    this.ledger.push({ id: this.nextLedgerId++, userId, delta, currency, reason, refId, createdAt: new Date() })
  }
}

function toAppWallet(wallet: WalletState): AppWallet {
  return { coins: wallet.coins, gems: wallet.gems }
}

function cloneRound(round: RoundRecord): RoundRecord {
  return { ...round, stops: [...round.stops], wins: round.wins.map((win) => ({ ...win })) }
}

function idempotencyMapKey(userId: string, idempotencyKey: string): string {
  return `${userId}:${idempotencyKey}`
}
