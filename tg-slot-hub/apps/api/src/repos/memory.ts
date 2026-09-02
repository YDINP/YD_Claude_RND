import { randomUUID } from 'node:crypto'
import { STARTING_COINS, STARTING_GEMS } from '@tgslot/shared'
import type { GambleState, GambleStep, GameState, Locale } from '@tgslot/shared'
import type { TelegramUser } from '../auth/initData.js'
import { BONUS_KINDS, emptyBonusClaims } from '../economy/bonus.js'
import type { BonusClaim, BonusClaims } from '../economy/bonus.js'
import { JACKPOT_SEED_HUNDREDTHS, LEDGER_REASONS } from '../economy/config.js'
import { freeSpinsSummary, isFreeSpinsActive, wrapFreeSpinsState } from '../economy/freeSpins.js'
import {
  findStepByKey,
  gambleEscrowRefId,
  gambleExpiresAt,
  gamblePayout,
  gambleRefId,
  isGambleActive,
  isGambleEligible,
  isGambleExpired,
  shouldAutoCollect,
  stepsLeft,
} from '../economy/gamble.js'
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
  ApplyGambleInput,
  ApplySpinInput,
  ApplySpinResult,
  GambleOutcome,
  GambleStepRecord,
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
        // 재전송이면 제안도 그대로 살아 있다 (스핀을 다시 돌린 게 아니므로).
        ...(gambleOfferFor(this.gameStates.get(gameStateKey(input.userId, input.gameId)) ?? null, existing.id)
          ? { gambleOffer: gambleOfferFor(this.gameStates.get(gameStateKey(input.userId, input.gameId)) ?? null, existing.id) }
          : {}),
      }
    }

    // 프리스핀은 차감하지 않고, 베팅액도 진입 시점에 고정된 값을 쓴다.
    const stateKey = gameStateKey(input.userId, input.gameId)
    const stateBefore = this.gameStates.get(stateKey) ?? null

    // 스핀 한 번이면 이전 더블업은 끝난다. 잠겨 있던 판돈을 **베팅을 확인하기 전에** 돌려준다
    // (그 돈으로 이번 스핀을 돌릴 수 있어야 한다).
    const escrowBefore = stateBefore?.gamble ?? null
    if (escrowBefore && escrowBefore.pendingWin > 0) {
      this.credit(
        input.userId,
        wallet,
        'coins',
        escrowBefore.pendingWin,
        LEDGER_REASONS.gambleCollect,
        gambleRefId(escrowBefore.roundId, escrowBefore.steps.length)
      )
    }
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

    // 새 당첨이면 그 금액을 지갑 밖으로 잠그고 제안을 연다. 잠겨 있는 동안에는 잔액에 보이지 않으므로
    // 다른 게임에서 다 써 버린 뒤 더블업으로 마이너스를 만드는 경로가 생기지 않는다.
    let gambleAfter: GambleState | null = null
    let gambleOffer: ApplySpinResult['gambleOffer']
    if (isGambleEligible({ isFreeSpin, totalWin: result.totalWin, config: input.gamble }) && input.gamble) {
      // 방어: 방금 당첨금을 넣었으므로 잔액이 모자랄 수 없다. 그래도 확인하고 못 잠그면 제안을 열지 않는다.
      if (wallet.coins >= result.totalWin) {
        this.credit(
          input.userId,
          wallet,
          'coins',
          -result.totalWin,
          LEDGER_REASONS.gambleEscrow,
          gambleEscrowRefId(roundId)
        )
        const expiresAt = gambleExpiresAt(now)
        gambleAfter = {
          roundId,
          pendingWin: result.totalWin,
          steps: [],
          maxSteps: input.gamble.maxSteps,
          expiresAt,
        }
        gambleOffer = { pendingWin: gambleAfter.pendingWin, maxSteps: gambleAfter.maxSteps, expiresAt }
      }
    }

    // 앞뒤로 아무 상태가 없으면 쓸 이유가 없다 (기본 게임 스핀의 대부분).
    if (freeSpinsAfter || gambleAfter) this.gameStates.set(stateKey, { freeSpins: freeSpinsAfter, gamble: gambleAfter })
    else if (stateBefore) this.gameStates.delete(stateKey)

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
      gridBefore: result.gridBefore.map((row) => [...row]),
      mutations: result.mutations,
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
      gambleSteps: [],
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
      ...(gambleOffer ? { gambleOffer } : {}),
    }
  }

  async applyGamble(input: ApplyGambleInput): Promise<GambleOutcome | null> {
    const wallet = this.wallets.get(input.userId)
    if (!wallet) throw new Error('[memory-repo] wallet not found')

    const now = this.clock()
    const stateKey = gameStateKey(input.userId, input.gameId)
    const state = this.gameStates.get(stateKey) ?? null
    const gamble = state?.gamble ?? null
    const round = this.rounds.get(input.roundId)

    if (!round) return null
    // 방어: 남의 라운드나 프리스핀 라운드로는 애초에 제안이 열리지 않지만, 상태가 꼬였을 때를 대비한다.
    if (round.userId !== input.userId || round.isFreeSpin) return null

    // 같은 키가 이미 처리됐으면 판정을 다시 하지 않고 그때 결과를 그대로 돌려준다.
    // 세션이 닫힌 뒤(패배·자동 회수)의 재전송도 여기서 걸린다 — 라운드 기록은 남아 있다.
    const replay = findStepByKey(round.gambleSteps, input.idempotencyKey)
    if (replay) return toOutcome(replay, toAppWallet(wallet), gamble, true)

    if (!gamble || gamble.roundId !== input.roundId) return null

    // 만료됐으면 도전 대신 자동 회수로 끝낸다. 잠긴 돈을 잃게 두지 않는다.
    if (isGambleExpired(gamble, now)) {
      return this.releaseEscrow(input.userId, input.gameId, wallet, state, gamble, true)
    }
    if (!isGambleActive(gamble, now)) return null

    const decision = input.decide({ round: cloneRound(round), state: { ...gamble } })
    const stake = gamble.pendingWin
    const pendingWin = decision.won ? gamblePayout(stake, input.config.payout) : 0
    const step = gamble.steps.length + 1

    const nextGamble: GambleState = {
      ...gamble,
      pendingWin,
      steps: [
        ...gamble.steps,
        {
          step,
          idempotencyKey: input.idempotencyKey,
          pick: input.pick,
          side: decision.side,
          won: decision.won,
          stake,
          pendingWin,
          autoCollected: false,
          seedInput: decision.seedInput,
        },
      ],
      expiresAt: gambleExpiresAt(now),
    }

    // 졌으면 잠긴 돈이 그대로 사라진다 (에스크로가 이미 지갑에서 빠져 있다).
    // 이겼는데 상한에 닿으면 늘어난 판돈을 바로 돌려준다.
    const autoCollected = decision.won && shouldAutoCollect(nextGamble, input.config, round.bet)
    if (autoCollected) {
      this.credit(input.userId, wallet, 'coins', pendingWin, LEDGER_REASONS.gambleCollect, gambleRefId(round.id, step))
    }

    const finished = !decision.won || autoCollected
    const lastStep = { ...nextGamble.steps[nextGamble.steps.length - 1]!, autoCollected }
    const storedSteps = [...nextGamble.steps.slice(0, -1), lastStep]

    this.gameStates.set(stateKey, {
      freeSpins: state?.freeSpins ?? null,
      gamble: finished ? null : { ...nextGamble, steps: storedSteps },
    })
    this.rounds.set(round.id, { ...round, gambleSteps: storedSteps })

    return toOutcome(lastStep, toAppWallet(wallet), finished ? null : nextGamble, false)
  }

  async collectGamble(input: { userId: string; gameId: string; roundId: string }): Promise<GambleOutcome | null> {
    const wallet = this.wallets.get(input.userId)
    if (!wallet) throw new Error('[memory-repo] wallet not found')

    const stateKey = gameStateKey(input.userId, input.gameId)
    const state = this.gameStates.get(stateKey) ?? null
    const gamble = state?.gamble ?? null
    if (!gamble || gamble.roundId !== input.roundId) return null

    // 만료됐어도 회수는 된다. 잠긴 돈은 언제나 유저 것이다.
    return this.releaseEscrow(input.userId, input.gameId, wallet, state, gamble, false)
  }

  /** 잠긴 판돈을 지갑으로 돌려주고 세션을 닫는다. */
  private releaseEscrow(
    userId: string,
    gameId: string,
    wallet: WalletState,
    state: GameState | null,
    gamble: GambleState,
    autoCollected: boolean
  ): GambleOutcome {
    if (gamble.pendingWin > 0) {
      this.credit(
        userId,
        wallet,
        'coins',
        gamble.pendingWin,
        LEDGER_REASONS.gambleCollect,
        gambleRefId(gamble.roundId, gamble.steps.length)
      )
    }
    this.gameStates.set(gameStateKey(userId, gameId), { freeSpins: state?.freeSpins ?? null, gamble: null })

    return {
      outcome: 'collected',
      pendingWin: gamble.pendingWin,
      wallet: toAppWallet(wallet),
      stepsLeft: 0,
      seedInput: '',
      autoCollected,
      replayed: false,
    }
  }

  async getGameState(userId: string, gameId: string): Promise<GameState> {
    const now = this.clock()
    const state = this.gameStates.get(gameStateKey(userId, gameId)) ?? null
    const gamble = state?.gamble ?? null

    // 만료된 더블업은 **이 자리에서 회수한다.** 숨기기만 하면 다음 스핀 전까지 돈이 잠긴 채로 남는다.
    if (gamble && isGambleExpired(gamble, now)) {
      const wallet = this.wallets.get(userId)
      if (wallet) this.releaseEscrow(userId, gameId, wallet, state, gamble, true)
    }

    const current = this.gameStates.get(gameStateKey(userId, gameId)) ?? null
    const freeSpins = current?.freeSpins ?? null
    const active = current?.gamble ?? null
    return {
      freeSpins: isFreeSpinsActive(freeSpins, now) && freeSpins ? { ...freeSpins } : null,
      gamble: active ? { ...active } : null,
    }
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
    gridBefore: round.gridBefore ? round.gridBefore.map((row) => [...row]) : null,
    mutations: round.mutations.map((mutation) => ({ ...mutation })),
    gambleSteps: round.gambleSteps.map((step) => ({ ...step })),
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

/** 단계 기록 하나를 응답 모양으로 옮긴다. 재전송과 새 판정이 같은 코드를 쓴다. */
function toOutcome(
  step: GambleStep,
  wallet: AppWallet,
  remaining: GambleState | null,
  replayed: boolean
): GambleOutcome {
  return {
    outcome: step.won ? 'win' : 'lose',
    side: step.side,
    pendingWin: step.pendingWin,
    wallet,
    stepsLeft: step.won && !step.autoCollected ? stepsLeft(remaining) : 0,
    seedInput: step.seedInput,
    autoCollected: step.autoCollected,
    replayed,
    // 세션이 계속 열려 있을 때만. 클라이언트는 이 값으로 카운트다운을 다시 맞춘다.
    ...(remaining?.expiresAt !== undefined && !step.autoCollected && step.won
      ? { expiresAt: remaining.expiresAt }
      : {}),
  }
}

/** 저장된 상태에서 이 라운드의 더블업 제안을 꺼낸다. 다른 라운드 것이면 없는 셈이다. */
function gambleOfferFor(
  state: GameState | null,
  roundId: string
): { pendingWin: number; maxSteps: number; expiresAt: string } | undefined {
  const gamble = state?.gamble
  if (!gamble || gamble.roundId !== roundId || gamble.pendingWin <= 0) return undefined
  // 만료 시각이 없는 상태는 이 필드가 생기기 전에 만들어진 것이다. 10분짜리 세션이라
  // 실제로는 남아 있을 수 없지만, 그런 상태는 제안으로 다시 광고하지 않는다.
  if (gamble.expiresAt === undefined) return undefined
  return { pendingWin: gamble.pendingWin, maxSteps: gamble.maxSteps, expiresAt: gamble.expiresAt }
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
