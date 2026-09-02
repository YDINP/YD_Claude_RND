import { randomUUID } from 'node:crypto'
import { STARTING_COINS, STARTING_GEMS } from '@tgslot/shared'
import type { GameState, Locale } from '@tgslot/shared'
import type { TelegramUser } from '../auth/initData.js'
import { BONUS_KINDS, emptyBonusClaims } from '../economy/bonus.js'
import type { BonusClaim, BonusClaims } from '../economy/bonus.js'
import { JACKPOT_SEED_HUNDREDTHS, LEDGER_REASONS } from '../economy/config.js'
import { freeSpinsSummary, isFreeSpinsActive, wrapFreeSpinsState } from '../economy/freeSpins.js'
import { hundredthsToCoins, isJackpotHit, jackpotAccrualHundredths } from '../economy/jackpot.js'
import { levelFromXp, levelUpBonus, toLevelState } from '../economy/level.js'
import { applySpinToMissions } from '../economy/missions.js'
import type { MissionProgress } from '../economy/missions.js'
import { isoWeekKey, systemClock, utcDayKey } from '../economy/time.js'
import type { Clock } from '../economy/time.js'
import { InsufficientFundsError } from './types.js'
import type {
  AppUser,
  AppWallet,
  ApplySpinInput,
  ApplySpinResult,
  ClaimBonusInput,
  ClaimMissionInput,
  ClaimResult,
  JackpotState,
  LeaderboardRow,
  LeaderboardSnapshot,
  Repos,
  RoundRecord,
  UpsertResult,
} from './types.js'

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

interface LeaderboardState {
  userId: string
  week: string
  totalWin: number
  bestMultiplier: number
  spins: number
}

interface MissionState extends MissionProgress {
  userId: string
  day: string
}

/**
 * 프로세스 메모리 안에서만 사는 레포. dev/test 전용.
 * ledger 배열을 실제로 유지해서 `sum(ledger.delta) == wallet.coins` 불변식을 지킨다.
 *
 * 시간에 의존하는 기능(보너스 쿨다운, 데일리/주간 버킷)은 주입된 `clock`만 본다.
 * 테스트는 clock을 앞으로 돌려 하루 뒤·6시간 뒤를 재현한다.
 */
export class MemoryRepos implements Repos {
  private readonly usersById = new Map<string, AppUser>()
  private readonly usersByTelegramId = new Map<number, string>()
  private readonly wallets = new Map<string, WalletState>()
  private readonly ledger: LedgerEntry[] = []
  private readonly rounds = new Map<string, RoundRecord>()
  /** `${userId}:${idempotencyKey}` -> roundId. Postgres의 unique 제약과 같은 역할. */
  private readonly roundIdsByKey = new Map<string, string>()
  /** 앱에서 언어를 직접 고른 유저. 재로그인 때 initData가 덮어쓰지 못하게 막는다. */
  private readonly localeExplicit = new Set<string>()
  /** `${userId}:${kind}` -> 마지막 수령 기록 */
  private readonly bonusClaims = new Map<string, BonusClaim>()
  /** `${userId}:${week}` */
  private readonly leaderboard = new Map<string, LeaderboardState>()
  /** `${userId}:${day}:${missionId}` */
  private readonly missions = new Map<string, MissionState>()
  /** `${userId}:${gameId}` -> 게임별 진행 상태 컨테이너 */
  private readonly gameStates = new Map<string, GameState>()
  /** 1/100 코인 단위. 응답으로 나갈 때만 코인으로 내린다. */
  private jackpotPoolHundredths = JACKPOT_SEED_HUNDREDTHS
  private jackpotLastWin: JackpotState['lastWin'] = null
  private nextLedgerId = 1

  constructor(private readonly clock: Clock = systemClock) {}

  async upsertFromTelegram(tgUser: TelegramUser, locale: Locale): Promise<UpsertResult> {
    const existingId = this.usersByTelegramId.get(tgUser.id)

    if (existingId) {
      const user = this.usersById.get(existingId)
      const wallet = this.wallets.get(existingId)
      if (!user || !wallet) {
        throw new Error('[memory-repo] inconsistent state: user/wallet missing for known telegramId')
      }
      user.firstName = tgUser.firstName
      // 직접 고른 언어는 텔레그램 앱 언어보다 우선한다.
      if (!this.localeExplicit.has(existingId)) user.locale = locale
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
      xp: 0,
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

  async updateLocale(userId: string, locale: Locale): Promise<AppUser | null> {
    const user = this.usersById.get(userId)
    if (!user) return null

    user.locale = locale
    this.localeExplicit.add(userId)
    return { ...user }
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
    const user = this.usersById.get(input.userId)
    if (!wallet || !user) throw new Error('[memory-repo] wallet not found')

    const now = this.clock()
    const day = utcDayKey(now)

    const key = idempotencyMapKey(input.userId, input.idempotencyKey)
    const existingRoundId = this.roundIdsByKey.get(key)
    if (existingRoundId !== undefined) {
      const existing = this.rounds.get(existingRoundId)
      if (!existing) throw new Error('[memory-repo] inconsistent state: idempotency key without round')
      // 재전송은 회계를 다시 건드리지 않는다. 다만 응답은 처음과 **완전히 같아야** 하므로
      // 그때 터진 잭팟/레벨업을 라운드에 저장해 둔 값으로 복원한다.
      // 잭팟 풀·레벨·미션은 지금 시점의 상태를 준다 (그 사이 다른 스핀이 있었을 수 있다).
      return {
        round: cloneRound(existing),
        wallet: toAppWallet(wallet),
        replayed: true,
        jackpot: hundredthsToCoins(this.jackpotPoolHundredths),
        jackpotWin: existing.jackpotWin,
        level: toLevelState(user.xp),
        levelUp: existing.levelUp,
        missions: this.readMissions(input.userId, day),
        isFreeSpin: existing.isFreeSpin,
        // 세션은 그 사이 더 진행됐을 수 있다. 라운드에 남긴 "그때 값"을 그대로 돌려준다.
        freeSpins: existing.freeSpinsAfter,
        freeSpinsSummary: existing.freeSpinsSummary,
      }
    }

    // 프리스핀은 차감하지 않고, 베팅액도 진입 시점에 고정된 값을 쓴다.
    const stateKey = gameStateKey(input.userId, input.gameId)
    const stateBefore = this.gameStates.get(stateKey) ?? null
    const freeSpinsBefore = stateBefore?.freeSpins ?? null
    const isFreeSpin = isFreeSpinsActive(freeSpinsBefore, now)
    const totalBet = isFreeSpin && freeSpinsBefore ? freeSpinsBefore.totalBet : input.totalBet
    const multiplier = isFreeSpin && freeSpinsBefore ? freeSpinsBefore.multiplier : 1

    if (!isFreeSpin && wallet.coins < totalBet) {
      throw new InsufficientFundsError(totalBet, wallet.coins)
    }

    const nonce = wallet.nonce + 1
    const { result, seed, seedHash, jackpotRoll, features } = input.compute({
      nonce,
      totalBet,
      freeSpins: freeSpinsBefore,
      isFreeSpin,
    })
    const roundId = randomUUID()

    wallet.nonce = nonce
    if (!isFreeSpin) {
      this.credit(input.userId, wallet, 'coins', -totalBet, 'spin_bet', roundId)
    }
    if (result.totalWin > 0) {
      this.credit(input.userId, wallet, 'coins', result.totalWin, 'spin_win', roundId)
    }

    // 남은 횟수·배수는 엔진의 nextState가 결정한다. 서버는 고정 베팅과 누적 당첨만 얹는다.
    const freeSpinsAfter = wrapFreeSpinsState(freeSpinsBefore, {
      gameId: input.gameId,
      totalBet,
      isFreeSpin,
      win: result.totalWin,
      nextState: result.nextState,
      now,
    })
    const summary = freeSpinsSummary(freeSpinsBefore, {
      isFreeSpin,
      win: result.totalWin,
      ended: freeSpinsAfter === null,
    })

    // 앞뒤로 아무 상태가 없으면 쓸 이유가 없다 (기본 게임 스핀의 대부분).
    if (freeSpinsAfter) this.gameStates.set(stateKey, { freeSpins: freeSpinsAfter })
    else if (freeSpinsBefore) this.gameStates.delete(stateKey)

    // 잭팟 적립은 하우스 몫에서 나가므로 유저 원장에 남지 않는다. 지급될 때만 원장에 찍힌다.
    // 적립을 먼저 하므로 당첨자는 자기 스핀의 적립분까지 가져간다.
    // 잭팟은 **유료 스핀만** 적립하고 판정한다. 프리스핀은 풀에 넣은 돈이 없다.
    const accrual = isFreeSpin ? 0 : jackpotAccrualHundredths(totalBet)
    this.jackpotPoolHundredths += accrual
    let jackpotWin: number | undefined
    if (isJackpotHit(jackpotRoll, accrual)) {
      // 지급은 코인 단위로 내린다. 1코인 미만 잔돈은 풀에 남기지 않고 버린다.
      jackpotWin = hundredthsToCoins(this.jackpotPoolHundredths)
      this.credit(input.userId, wallet, 'coins', jackpotWin, LEDGER_REASONS.jackpotWin, roundId)
      this.jackpotPoolHundredths = JACKPOT_SEED_HUNDREDTHS
      this.jackpotLastWin = { amount: jackpotWin, at: now, userId: input.userId }
    }

    // 레벨: xp = 누적 베팅. 여러 레벨을 한 번에 뛸 수 있고 보너스는 도달 레벨 기준 1회다.
    // xp는 **실제로 건 돈**만 센다. 프리스핀은 베팅이 없었으므로 xp도 오르지 않는다.
    const previousLevel = levelFromXp(user.xp)
    if (!isFreeSpin) user.xp += totalBet
    const newLevel = levelFromXp(user.xp)
    let levelUp: ApplySpinResult['levelUp']
    if (newLevel > previousLevel) {
      const bonus = levelUpBonus(newLevel)
      this.credit(input.userId, wallet, 'coins', bonus, LEDGER_REASONS.levelUp, roundId)
      levelUp = { from: previousLevel, to: newLevel, bonus }
    }
    user.level = newLevel

    // 주간 리더보드
    const week = isoWeekKey(now)
    const boardKey = `${input.userId}:${week}`
    const board = this.leaderboard.get(boardKey) ?? {
      userId: input.userId,
      week,
      totalWin: 0,
      bestMultiplier: 0,
      spins: 0,
    }
    board.totalWin += result.totalWin
    board.bestMultiplier = Math.max(board.bestMultiplier, result.totalWin / totalBet)
    board.spins += 1
    this.leaderboard.set(boardKey, board)

    // 데일리 미션
    const missions = applySpinToMissions(this.readMissions(input.userId, day), {
      gameId: input.gameId,
      win: result.totalWin,
      isFreeSpin,
    })
    for (const mission of missions) {
      this.missions.set(missionMapKey(input.userId, day, mission.missionId), {
        ...mission,
        userId: input.userId,
        day,
      })
    }

    const round: RoundRecord = {
      id: roundId,
      userId: input.userId,
      gameId: input.gameId,
      bet: totalBet,
      win: result.totalWin,
      stops: [...result.stops],
      wins: result.wins,
      seed,
      seedHash,
      nonce,
      idempotencyKey: input.idempotencyKey,
      jackpotWin,
      levelUp,
      isFreeSpin,
      features,
      multiplier,
      freeSpinsAfter,
      freeSpinsSummary: summary,
      createdAt: now,
    }
    this.rounds.set(roundId, round)
    this.roundIdsByKey.set(key, roundId)

    return {
      round: cloneRound(round),
      wallet: toAppWallet(wallet),
      replayed: false,
      jackpot: hundredthsToCoins(this.jackpotPoolHundredths),
      jackpotWin,
      level: toLevelState(user.xp),
      levelUp,
      missions,
      isFreeSpin,
      freeSpins: freeSpinsAfter,
      freeSpinsSummary: summary,
    }
  }

  async getGameState(userId: string, gameId: string): Promise<GameState> {
    const state = this.gameStates.get(gameStateKey(userId, gameId))
    const freeSpins = state?.freeSpins ?? null
    // 만료된 세션은 없는 것으로 본다.
    return { freeSpins: isFreeSpinsActive(freeSpins, this.clock()) ? { ...freeSpins! } : null }
  }

  async getRoundById(roundId: string): Promise<RoundRecord | null> {
    const round = this.rounds.get(roundId)
    return round ? cloneRound(round) : null
  }

  // ---- 보너스 ----

  async getBonusClaims(userId: string): Promise<BonusClaims> {
    const claims = emptyBonusClaims()
    for (const kind of BONUS_KINDS) {
      const claim = this.bonusClaims.get(`${userId}:${kind}`)
      claims[kind] = claim ? { ...claim } : null
    }
    return claims
  }

  async claimBonus(input: ClaimBonusInput): Promise<ClaimResult | null> {
    const wallet = this.wallets.get(input.userId)
    if (!wallet) throw new Error('[memory-repo] wallet not found')

    const now = this.clock()
    const lastClaim = this.bonusClaims.get(`${input.userId}:${input.kind}`) ?? null
    const grant = input.decide({
      lastClaim: lastClaim ? { ...lastClaim } : null,
      wallet: toAppWallet(wallet),
      now,
    })
    if (!grant) return null

    this.credit(input.userId, wallet, 'coins', grant.amount, input.reason)
    this.bonusClaims.set(`${input.userId}:${input.kind}`, {
      kind: input.kind,
      claimedAt: now,
      streakDay: grant.streakDay,
    })

    return { amount: grant.amount, wallet: toAppWallet(wallet), streakDay: grant.streakDay }
  }

  // ---- 잭팟 ----

  async getJackpot(): Promise<JackpotState> {
    return {
      pool: hundredthsToCoins(this.jackpotPoolHundredths),
      lastWin: this.jackpotLastWin ? { ...this.jackpotLastWin } : null,
    }
  }

  // ---- 리더보드 ----

  async getLeaderboard(week: string, limit: number, userId: string): Promise<LeaderboardSnapshot> {
    const ranked = [...this.leaderboard.values()]
      .filter((row) => row.week === week)
      .sort(compareLeaderboard)
      .map((row, index) => this.toLeaderboardRow(row, index + 1))

    return {
      entries: ranked.slice(0, limit),
      me: ranked.find((row) => row.userId === userId) ?? null,
    }
  }

  // ---- 미션 ----

  async getMissionProgress(userId: string, day: string): Promise<MissionProgress[]> {
    return this.readMissions(userId, day)
  }

  async claimMission(input: ClaimMissionInput): Promise<ClaimResult | null> {
    const wallet = this.wallets.get(input.userId)
    if (!wallet) throw new Error('[memory-repo] wallet not found')

    const mapKey = missionMapKey(input.userId, input.day, input.missionId)
    const state = this.missions.get(mapKey)
    if (!state || state.claimed || state.progress < input.target) return null

    this.credit(input.userId, wallet, 'coins', input.reward, input.reason)
    this.missions.set(mapKey, { ...state, claimed: true })

    return { amount: input.reward, wallet: toAppWallet(wallet), streakDay: 1 }
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

  private readMissions(userId: string, day: string): MissionProgress[] {
    return [...this.missions.values()]
      .filter((row) => row.userId === userId && row.day === day)
      .map((row) => ({ missionId: row.missionId, progress: row.progress, claimed: row.claimed }))
  }

  private toLeaderboardRow(row: LeaderboardState, rank: number): LeaderboardRow {
    return {
      rank,
      userId: row.userId,
      firstName: this.usersById.get(row.userId)?.firstName ?? '',
      totalWin: row.totalWin,
      bestMultiplier: row.bestMultiplier,
      spins: row.spins,
    }
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
    this.ledger.push({ id: this.nextLedgerId++, userId, delta, currency, reason, refId, createdAt: this.clock() })
  }
}

function toAppWallet(wallet: WalletState): AppWallet {
  return { coins: wallet.coins, gems: wallet.gems }
}

function cloneRound(round: RoundRecord): RoundRecord {
  return {
    ...round,
    stops: [...round.stops],
    wins: round.wins.map((win) => ({ ...win })),
    features: round.features.map((feature) => ({ ...feature })),
    freeSpinsAfter: round.freeSpinsAfter ? { ...round.freeSpinsAfter } : null,
    ...(round.freeSpinsSummary ? { freeSpinsSummary: { ...round.freeSpinsSummary } } : {}),
    ...(round.levelUp ? { levelUp: { ...round.levelUp } } : {}),
  }
}

function idempotencyMapKey(userId: string, idempotencyKey: string): string {
  return `${userId}:${idempotencyKey}`
}

function gameStateKey(userId: string, gameId: string): string {
  return `${userId}:${gameId}`
}

function missionMapKey(userId: string, day: string, missionId: string): string {
  return `${userId}:${day}:${missionId}`
}

/** 총 승리 내림차순 → 최고 배수 내림차순 → userId 오름차순. 마지막 항이 순위를 결정론적으로 만든다. */
function compareLeaderboard(a: LeaderboardState, b: LeaderboardState): number {
  if (b.totalWin !== a.totalWin) return b.totalWin - a.totalWin
  if (b.bestMultiplier !== a.bestMultiplier) return b.bestMultiplier - a.bestMultiplier
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
}
