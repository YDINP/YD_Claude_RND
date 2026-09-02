import type { SpinResult, WinLine } from '@tgslot/slot-engine'
import type { Level, Locale } from '@tgslot/shared'
import type { TelegramUser } from '../auth/initData.js'
import type { BonusClaims, BonusGrant, BonusKind } from '../economy/bonus.js'
import type { MissionProgress } from '../economy/missions.js'

export interface AppUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
  locale: Locale
  /** xp에서 파생된 저장 값. 응답에는 `xp`로 다시 계산한 값을 쓴다. */
  level: number
  /** 누적 베팅액 */
  xp: number
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
  /** 이 라운드가 터뜨린 잭팟 지급액. 멱등 재전송이 같은 응답을 만들 수 있도록 함께 저장한다. */
  jackpotWin?: number
  /** 이 라운드가 만든 레벨업. 같은 이유로 함께 저장한다. */
  levelUp?: { from: number; to: number; bonus: number }
  createdAt: Date
}

/** 라운드 nonce가 정해진 뒤에야 시드를 만들 수 있으므로 결과 계산을 콜백으로 받는다. */
export interface SpinComputation {
  result: SpinResult
  seed: string
  seedHash: string
  /**
   * 릴 추첨 **뒤** 같은 라운드 RNG에서 `nextInt(JACKPOT_ODDS_DENOMINATOR)`로 뽑은 잭팟 판정값.
   * 이 값이 **이번 스핀의 적립액**보다 작으면 당첨이다 (`economy/jackpot.ts`의 `isJackpotHit`).
   * 릴을 먼저 뽑는 순서를 지켜야 provably fair 재현이 성립한다.
   */
  jackpotRoll: number
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
  /** 이 스핀 반영 후 잭팟 풀 */
  jackpot: number
  /** 이 스핀이 잭팟을 터뜨렸을 때만. 지급액은 wallet에 이미 반영돼 있다. */
  jackpotWin?: number
  /** 스핀 반영 후 레벨 상태 (xp = 누적 베팅) */
  level: Level
  /** 이 스핀으로 레벨이 올랐을 때만. `bonus`는 wallet에 이미 반영돼 있다. */
  levelUp?: { from: number; to: number; bonus: number }
  /** 갱신된 오늘의 미션 진행도 */
  missions: MissionProgress[]
}

// ---- 허브 기능 (Phase 3) ----

export interface BonusDecisionContext {
  lastClaim: BonusClaims[BonusKind]
  wallet: AppWallet
  now: Date
}

export interface ClaimBonusInput {
  userId: string
  kind: BonusKind
  /** 원장 사유. `LEDGER_REASONS`의 값. */
  reason: string
  /**
   * 트랜잭션 안에서 **최신** 수령 기록과 지갑으로 다시 판정한다.
   * 동시 요청 2건이 같은 보너스를 두 번 타지 못하게 하는 지점이므로,
   * 조회 시점 판정을 재사용하지 않고 반드시 여기서 다시 굴린다.
   */
  decide: (ctx: BonusDecisionContext) => BonusGrant | null
}

/** 수령 결과. 수령 불가면 레포가 `null`을 돌려주고 라우트가 409로 번역한다. */
export interface ClaimResult {
  amount: number
  wallet: AppWallet
  streakDay: number
}

export interface BonusRepo {
  getBonusClaims(userId: string): Promise<BonusClaims>
  claimBonus(input: ClaimBonusInput): Promise<ClaimResult | null>
}

export interface JackpotState {
  pool: number
  lastWin: { amount: number; at: Date; userId: string } | null
}

export interface JackpotRepo {
  getJackpot(): Promise<JackpotState>
}

export interface LeaderboardRow {
  rank: number
  userId: string
  firstName: string
  totalWin: number
  bestMultiplier: number
  spins: number
}

export interface LeaderboardSnapshot {
  entries: LeaderboardRow[]
  /** 이번 주 스핀이 없으면 null */
  me: LeaderboardRow | null
}

export interface LeaderboardRepo {
  getLeaderboard(week: string, limit: number, userId: string): Promise<LeaderboardSnapshot>
}

export interface ClaimMissionInput {
  userId: string
  /** UTC 일자 키 */
  day: string
  missionId: string
  target: number
  reward: number
  reason: string
}

export interface MissionRepo {
  getMissionProgress(userId: string, day: string): Promise<MissionProgress[]>
  /** 목표 미달이거나 이미 수령했으면 `null`. 판정은 트랜잭션 안에서 다시 한다. */
  claimMission(input: ClaimMissionInput): Promise<ClaimResult | null>
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

export interface Repos extends UserRepo, WalletRepo, RoundRepo, BonusRepo, JackpotRepo, LeaderboardRepo, MissionRepo {}
