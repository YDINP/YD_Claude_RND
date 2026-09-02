import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { STARTING_COINS, STARTING_GEMS } from '@tgslot/shared'
import type { FeatureTrigger, FreeSpinsState, Locale } from '@tgslot/shared'
import type { WinLine } from '@tgslot/slot-engine'
import type { DrizzleDb } from '../db/client.js'
import {
  bonusClaims,
  gameStates,
  jackpotHits,
  jackpotPool,
  leaderboardWeekly,
  ledger,
  missionProgress,
  rounds,
  users,
  wallets,
} from '../db/schema.js'
import type { TelegramUser } from '../auth/initData.js'
import { BONUS_KINDS, emptyBonusClaims } from '../economy/bonus.js'
import type { BonusClaim, BonusClaims, BonusKind } from '../economy/bonus.js'
import { JACKPOT_SEED_HUNDREDTHS, LEDGER_REASONS } from '../economy/config.js'
import { isFreeSpinsActive, nextFreeSpinsState } from '../economy/freeSpins.js'
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

type UserRow = typeof users.$inferSelect
type WalletRow = typeof wallets.$inferSelect
type RoundRow = typeof rounds.$inferSelect

/** 잭팟 풀 단일 행의 고정 id. 허브 전체가 이 한 행을 공유한다. */
const JACKPOT_ROW_ID = 1

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    telegramId: row.telegramId,
    firstName: row.firstName,
    username: row.username ?? undefined,
    locale: row.locale as Locale,
    level: row.level,
    xp: row.xp,
  }
}

function toAppWallet(row: WalletRow): AppWallet {
  return { coins: row.coins, gems: row.gems }
}

function toRoundRecord(row: RoundRow): RoundRecord {
  return {
    id: row.id,
    userId: row.userId,
    gameId: row.gameId,
    bet: row.bet,
    win: row.win,
    stops: row.stops,
    // jsonb 컬럼이라 드라이버가 unknown으로 준다. 쓸 때 WinLine[]만 넣으므로 여기서 되돌린다.
    wins: row.wins as WinLine[],
    seed: row.seed,
    seedHash: row.seedHash,
    nonce: row.nonce,
    idempotencyKey: row.idempotencyKey,
    ...(row.jackpotWin === null ? {} : { jackpotWin: row.jackpotWin }),
    ...(row.levelUpFrom === null || row.levelUpTo === null || row.levelUpBonus === null
      ? {}
      : { levelUp: { from: row.levelUpFrom, to: row.levelUpTo, bonus: row.levelUpBonus } }),
    isFreeSpin: row.isFreeSpin,
    // jsonb라 드라이버가 unknown으로 준다. 쓸 때 이 모양만 넣으므로 여기서 되돌린다.
    features: (row.features ?? []) as FeatureTrigger[],
    freeSpinsAfter: (row.freeSpinsAfter ?? null) as FreeSpinsState | null,
    createdAt: row.createdAt,
  }
}

/** Postgres(Supabase) 구현. 신규 유저 생성/지급은 트랜잭션 + row lock으로 처리한다. */
export class DrizzleRepos implements Repos {
  constructor(
    private readonly db: DrizzleDb,
    private readonly clock: Clock = systemClock
  ) {}

  async upsertFromTelegram(tgUser: TelegramUser, locale: Locale): Promise<UpsertResult> {
    return this.db.transaction(async (tx) => {
      // 최초 로그인 레이스 대응: SELECT...FOR UPDATE는 행이 없으면 아무것도 잠그지 못해
      // 동시 최초 로그인 2건이 둘 다 insert를 시도해 telegram_id unique 제약에서 하나가 500이 난다.
      // 그래서 먼저 INSERT ... ON CONFLICT DO NOTHING을 시도한다: 동시 요청 중 하나만
      // 실제로 행을 만들고(반환됨), 나머지는 unique index 잠금에 걸려 대기했다가
      // 커밋 이후 빈 반환을 받는다 -> 그 경우 아래에서 재조회해 기존 유저 경로를 탄다.
      const insertedRows = await tx
        .insert(users)
        .values({ telegramId: tgUser.id, firstName: tgUser.firstName, username: tgUser.username, locale })
        .onConflictDoNothing({ target: users.telegramId })
        .returning()

      const inserted = insertedRows[0]

      if (inserted) {
        const [initialWallet] = await tx
          .insert(wallets)
          .values({ userId: inserted.id, coins: 0, gems: 0 })
          .returning()
        if (!initialWallet) throw new Error('[drizzle-repo] wallet insert failed')

        const [creditedWallet] = await tx
          .update(wallets)
          .set({
            coins: sql`${wallets.coins} + ${STARTING_COINS}`,
            gems: sql`${wallets.gems} + ${STARTING_GEMS}`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.userId, inserted.id))
          .returning()
        if (!creditedWallet) throw new Error('[drizzle-repo] wallet credit failed')

        const ledgerEntries: (typeof ledger.$inferInsert)[] = []
        if ((STARTING_COINS as number) !== 0) {
          ledgerEntries.push({ userId: inserted.id, delta: STARTING_COINS, currency: 'coins', reason: 'signup_bonus' })
        }
        if ((STARTING_GEMS as number) !== 0) {
          ledgerEntries.push({ userId: inserted.id, delta: STARTING_GEMS, currency: 'gems', reason: 'signup_bonus' })
        }
        if (ledgerEntries.length > 0) {
          await tx.insert(ledger).values(ledgerEntries)
        }

        return { user: toAppUser(inserted), wallet: toAppWallet(creditedWallet), created: true }
      }

      // 여기 도달하면 (a) 원래부터 기존 유저였거나 (b) 방금 경쟁에서 진 최초 로그인이다.
      // 두 경우 모두 행은 이제 반드시 존재하므로 FOR UPDATE로 잠그고 재적립 없이 갱신만 한다.
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.telegramId, tgUser.id))
        .limit(1)
        .for('update')

      if (!existing) {
        throw new Error('[drizzle-repo] inconsistent state: insert conflicted but row not found')
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          firstName: tgUser.firstName,
          username: tgUser.username ?? existing.username,
          // 직접 고른 언어는 텔레그램 앱 언어보다 우선한다.
          locale: existing.localeExplicit ? existing.locale : locale,
          lastSeenAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning()

      const [walletRow] = await tx.select().from(wallets).where(eq(wallets.userId, existing.id)).limit(1)

      if (!updatedUser || !walletRow) {
        throw new Error('[drizzle-repo] inconsistent state: existing user/wallet missing')
      }

      return { user: toAppUser(updatedUser), wallet: toAppWallet(walletRow), created: false }
    })
  }

  async getById(userId: string): Promise<AppUser | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    return row ? toAppUser(row) : null
  }

  async updateLocale(userId: string, locale: Locale): Promise<AppUser | null> {
    const [row] = await this.db
      .update(users)
      .set({ locale, localeExplicit: true })
      .where(eq(users.id, userId))
      .returning()

    return row ? toAppUser(row) : null
  }

  async getWallet(userId: string): Promise<AppWallet | null> {
    const [row] = await this.db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
    return row ? toAppWallet(row) : null
  }

  async applySpin(input: ApplySpinInput): Promise<ApplySpinResult> {
    const now = this.clock()
    const day = utcDayKey(now)
    const week = isoWeekKey(now)

    return this.db.transaction(async (tx) => {
      // 이 유저의 동시 스핀을 트랜잭션 하나로 직렬화하는 지점.
      // 락을 먼저 잡아야 멱등키 확인과 잔액 확인이 같은 스냅샷 위에서 이뤄진다.
      const [locked] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, input.userId))
        .limit(1)
        .for('update')

      if (!locked) throw new Error('[drizzle-repo] wallet not found for spin')

      // xp를 읽어 더한 값을 다시 쓰므로 유저 행도 잠근다. 지갑 락만으로는 users를 건드리는
      // 다른 경로(레벨 보정 잡 등)와의 경합을 막지 못한다.
      const [userRow] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1).for('update')
      if (!userRow) throw new Error('[drizzle-repo] user not found for spin')

      const [existingRound] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.userId, input.userId), eq(rounds.idempotencyKey, input.idempotencyKey)))
        .limit(1)

      // 재전송: 지갑을 건드리지 않고 기존 라운드를 그대로 돌려준다.
      if (existingRound) {
        const [poolRow] = await tx.select().from(jackpotPool).where(eq(jackpotPool.id, JACKPOT_ROW_ID)).limit(1)
        const missions = await readMissionRows(tx, input.userId, day)
        const round = toRoundRecord(existingRound)
        // 응답은 처음과 **완전히 같아야** 한다. 그때 터진 잭팟/레벨업은 라운드에 저장해 둔 값으로 복원하고,
        // 잭팟 풀·레벨·미션은 지금 상태를 준다 (그 사이 다른 스핀이 있었을 수 있다).
        return {
          round,
          wallet: toAppWallet(locked),
          replayed: true,
          jackpot: hundredthsToCoins(poolRow?.pool ?? JACKPOT_SEED_HUNDREDTHS),
          jackpotWin: round.jackpotWin,
          level: toLevelState(userRow.xp),
          levelUp: round.levelUp,
          missions,
          isFreeSpin: round.isFreeSpin,
          // 세션은 그 사이 더 진행됐을 수 있다. 라운드에 남긴 "그때 값"을 그대로 돌려준다.
          freeSpins: round.freeSpinsAfter,
        }
      }

      // 프리스핀 세션은 유저 단위 행이라 지갑 락이 이미 직렬화한다. 여기서 읽은 값이 곧
      // 이 스핀의 진실이다 (요청의 totalBet은 프리스핀 중이면 무시된다).
      const [stateRow] = await tx
        .select()
        .from(gameStates)
        .where(and(eq(gameStates.userId, input.userId), eq(gameStates.gameId, input.gameId)))
        .limit(1)

      const freeSpinsBefore = (stateRow?.freeSpins ?? null) as FreeSpinsState | null
      const isFreeSpin = isFreeSpinsActive(freeSpinsBefore)
      const totalBet = isFreeSpin && freeSpinsBefore ? freeSpinsBefore.totalBet : input.totalBet

      if (!isFreeSpin && locked.coins < totalBet) {
        throw new InsufficientFundsError(totalBet, locked.coins)
      }

      const nonce = locked.nonce + 1
      const { result, seed, seedHash, jackpotRoll, freeSpinsAward, features } = input.compute({
        nonce,
        totalBet,
        freeSpins: freeSpinsBefore,
        isFreeSpin,
      })
      const roundId = randomUUID()

      const entries: (typeof ledger.$inferInsert)[] = []
      let walletDelta = 0

      // 프리스핀은 차감하지 않는다. 원장에 spin_bet 항목 자체가 생기지 않는다.
      if (!isFreeSpin) {
        entries.push({
          userId: input.userId,
          delta: -totalBet,
          currency: 'coins',
          reason: 'spin_bet',
          refId: roundId,
        })
        walletDelta -= totalBet
      }

      if (result.totalWin > 0) {
        entries.push({
          userId: input.userId,
          delta: result.totalWin,
          currency: 'coins',
          reason: 'spin_win',
          refId: roundId,
        })
        walletDelta += result.totalWin
      }

      // 레벨: xp = 누적 베팅. 여러 레벨을 한 번에 뛸 수 있고 보너스는 도달 레벨 기준 1회다.
      // xp는 **실제로 건 돈**만 센다. 프리스핀은 베팅이 없었으므로 xp도 오르지 않는다.
      const previousLevel = levelFromXp(userRow.xp)
      const newXp = userRow.xp + (isFreeSpin ? 0 : totalBet)
      const newLevel = levelFromXp(newXp)
      let levelUp: ApplySpinResult['levelUp']
      if (newLevel > previousLevel) {
        const bonus = levelUpBonus(newLevel)
        entries.push({
          userId: input.userId,
          delta: bonus,
          currency: 'coins',
          reason: LEDGER_REASONS.levelUp,
          refId: roundId,
        })
        walletDelta += bonus
        levelUp = { from: previousLevel, to: newLevel, bonus }
      }
      await tx.update(users).set({ xp: newXp, level: newLevel }).where(eq(users.id, input.userId))

      // 주간 리더보드
      const multiplier = result.totalWin / totalBet
      await tx
        .insert(leaderboardWeekly)
        .values({
          userId: input.userId,
          week,
          totalWin: result.totalWin,
          bestMultiplier: multiplier,
          spins: 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [leaderboardWeekly.userId, leaderboardWeekly.week],
          set: {
            totalWin: sql`${leaderboardWeekly.totalWin} + ${result.totalWin}`,
            bestMultiplier: sql`greatest(${leaderboardWeekly.bestMultiplier}, ${multiplier})`,
            spins: sql`${leaderboardWeekly.spins} + 1`,
            updatedAt: now,
          },
        })

      // 데일리 미션
      const missions = applySpinToMissions(await readMissionRows(tx, input.userId, day), {
        gameId: input.gameId,
        win: result.totalWin,
      })
      for (const mission of missions) {
        await tx
          .insert(missionProgress)
          .values({
            userId: input.userId,
            day,
            missionId: mission.missionId,
            progress: mission.progress,
            claimed: mission.claimed,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [missionProgress.userId, missionProgress.day, missionProgress.missionId],
            set: { progress: mission.progress, updatedAt: now },
          })
      }

      // 프리스핀 세션 갱신. 유저 단위 행이라 전역 잭팟 행보다 먼저 끝내 둔다.
      const freeSpinsAfter = nextFreeSpinsState(freeSpinsBefore, {
        gameId: input.gameId,
        totalBet,
        isFreeSpin,
        win: result.totalWin,
        award: freeSpinsAward,
      })
      await tx
        .insert(gameStates)
        .values({ userId: input.userId, gameId: input.gameId, freeSpins: freeSpinsAfter, updatedAt: now })
        .onConflictDoUpdate({
          target: [gameStates.userId, gameStates.gameId],
          set: { freeSpins: freeSpinsAfter, updatedAt: now },
        })

      // 잭팟 풀은 **전역 단일 행**이라 모든 유저의 스핀이 여기서 직렬화된다. 그래서 유저 전용 쓰기를
      // 전부 끝낸 뒤 맨 마지막에 만진다. 뒤에 남는 것은 라운드·원장·지갑 쓰기 세 문장뿐이라
      // 이 행을 잡고 커밋까지 가는 구간이 가장 짧다. 락 순서는 항상 wallets -> users -> jackpot_pool이고
      // 모든 스핀이 같은 순서를 지키므로 교착은 생기지 않는다.
      //
      // 적립분은 하우스 몫이라 원장에 남지 않고 베팅 차감도 그대로다. 적립을 먼저 하므로
      // 당첨자는 자기 스핀의 적립분까지 가져간다.
      // 잭팟은 **유료 스핀만** 적립하고 판정한다. 프리스핀은 풀에 넣은 돈이 없다.
      const accrual = isFreeSpin ? 0 : jackpotAccrualHundredths(totalBet)
      const pool = await accrueJackpot(tx, accrual)
      let poolAfterSpin = pool

      let jackpotWin: number | undefined
      if (isJackpotHit(jackpotRoll, accrual)) {
        // 지급은 코인 단위로 내린다. 1코인 미만 잔돈은 풀에 남기지 않고 버린다.
        jackpotWin = hundredthsToCoins(pool)
        entries.push({
          userId: input.userId,
          delta: jackpotWin,
          currency: 'coins',
          reason: LEDGER_REASONS.jackpotWin,
          refId: roundId,
        })
        walletDelta += jackpotWin
        const [resetRow] = await tx
          .update(jackpotPool)
          .set({ pool: sql`${jackpotPool.seed}`, updatedAt: now })
          .where(eq(jackpotPool.id, JACKPOT_ROW_ID))
          .returning()
        if (!resetRow) throw new Error('[drizzle-repo] jackpot pool reset failed')
        poolAfterSpin = resetRow.pool
        await tx.insert(jackpotHits).values({ userId: input.userId, roundId, amount: jackpotWin, wonAt: now })
      }

      // 라운드는 잭팟 결과를 함께 실어야 하므로(멱등 재전송 복원용) 잭팟 판정 뒤에 넣는다.
      const [insertedRound] = await tx
        .insert(rounds)
        .values({
          id: roundId,
          userId: input.userId,
          gameId: input.gameId,
          bet: totalBet,
          win: result.totalWin,
          stops: result.stops,
          wins: result.wins,
          seed,
          seedHash,
          nonce,
          idempotencyKey: input.idempotencyKey,
          jackpotWin: jackpotWin ?? null,
          levelUpFrom: levelUp?.from ?? null,
          levelUpTo: levelUp?.to ?? null,
          levelUpBonus: levelUp?.bonus ?? null,
          isFreeSpin,
          features,
          freeSpinsAfter,
        })
        .returning()
      if (!insertedRound) throw new Error('[drizzle-repo] round insert failed')

      await tx.insert(ledger).values(entries)

      const [updatedWallet] = await tx
        .update(wallets)
        .set({
          coins: sql`${wallets.coins} + ${walletDelta}`,
          nonce,
          updatedAt: now,
        })
        .where(eq(wallets.userId, input.userId))
        .returning()
      if (!updatedWallet) throw new Error('[drizzle-repo] wallet update failed')

      return {
        round: toRoundRecord(insertedRound),
        wallet: toAppWallet(updatedWallet),
        replayed: false,
        jackpot: hundredthsToCoins(poolAfterSpin),
        jackpotWin,
        level: toLevelState(newXp),
        levelUp,
        missions,
        isFreeSpin,
        freeSpins: freeSpinsAfter,
      }
    })
  }

  async getGameState(userId: string, gameId: string): Promise<FreeSpinsState | null> {
    const [row] = await this.db
      .select()
      .from(gameStates)
      .where(and(eq(gameStates.userId, userId), eq(gameStates.gameId, gameId)))
      .limit(1)

    return (row?.freeSpins ?? null) as FreeSpinsState | null
  }

  async getRoundById(roundId: string): Promise<RoundRecord | null> {
    const [row] = await this.db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1)
    return row ? toRoundRecord(row) : null
  }

  // ---- 보너스 ----

  async getBonusClaims(userId: string): Promise<BonusClaims> {
    const claims = emptyBonusClaims()
    const rows = await Promise.all(BONUS_KINDS.map((kind) => this.lastBonusClaim(this.db, userId, kind)))
    BONUS_KINDS.forEach((kind, index) => {
      claims[kind] = rows[index] ?? null
    })
    return claims
  }

  async claimBonus(input: ClaimBonusInput): Promise<ClaimResult | null> {
    const now = this.clock()

    return this.db.transaction(async (tx) => {
      // 지갑 락이 같은 유저의 동시 수령을 직렬화한다. 판정은 락을 잡은 뒤에 다시 굴린다.
      const [locked] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, input.userId))
        .limit(1)
        .for('update')
      if (!locked) throw new Error('[drizzle-repo] wallet not found for bonus claim')

      const lastClaim = await this.lastBonusClaim(tx, input.userId, input.kind)
      const grant = input.decide({ lastClaim, wallet: toAppWallet(locked), now })
      if (!grant) return null

      await tx.insert(ledger).values({
        userId: input.userId,
        delta: grant.amount,
        currency: 'coins',
        reason: input.reason,
      })
      await tx.insert(bonusClaims).values({
        userId: input.userId,
        kind: input.kind,
        claimedAt: now,
        streakDay: grant.streakDay,
      })

      const [updated] = await tx
        .update(wallets)
        .set({ coins: sql`${wallets.coins} + ${grant.amount}`, updatedAt: now })
        .where(eq(wallets.userId, input.userId))
        .returning()
      if (!updated) throw new Error('[drizzle-repo] wallet update failed on bonus claim')

      return { amount: grant.amount, wallet: toAppWallet(updated), streakDay: grant.streakDay }
    })
  }

  // ---- 잭팟 ----

  async getJackpot(): Promise<JackpotState> {
    const [poolRow] = await this.db.select().from(jackpotPool).where(eq(jackpotPool.id, JACKPOT_ROW_ID)).limit(1)
    const [hit] = await this.db.select().from(jackpotHits).orderBy(desc(jackpotHits.wonAt)).limit(1)

    return {
      pool: hundredthsToCoins(poolRow?.pool ?? JACKPOT_SEED_HUNDREDTHS),
      lastWin: hit ? { amount: hit.amount, at: hit.wonAt, userId: hit.userId } : null,
    }
  }

  // ---- 리더보드 ----

  async getLeaderboard(week: string, limit: number, userId: string): Promise<LeaderboardSnapshot> {
    const rows = await this.db
      .select({
        userId: leaderboardWeekly.userId,
        firstName: users.firstName,
        totalWin: leaderboardWeekly.totalWin,
        bestMultiplier: leaderboardWeekly.bestMultiplier,
        spins: leaderboardWeekly.spins,
      })
      .from(leaderboardWeekly)
      .innerJoin(users, eq(users.id, leaderboardWeekly.userId))
      .where(eq(leaderboardWeekly.week, week))
      .orderBy(
        desc(leaderboardWeekly.totalWin),
        desc(leaderboardWeekly.bestMultiplier),
        leaderboardWeekly.userId
      )
      .limit(limit)

    const entries: LeaderboardRow[] = rows.map((row, index) => ({ ...row, rank: index + 1 }))
    const inTop = entries.find((row) => row.userId === userId)
    if (inTop) return { entries, me: inTop }

    const [mine] = await this.db
      .select({
        userId: leaderboardWeekly.userId,
        firstName: users.firstName,
        totalWin: leaderboardWeekly.totalWin,
        bestMultiplier: leaderboardWeekly.bestMultiplier,
        spins: leaderboardWeekly.spins,
      })
      .from(leaderboardWeekly)
      .innerJoin(users, eq(users.id, leaderboardWeekly.userId))
      .where(and(eq(leaderboardWeekly.week, week), eq(leaderboardWeekly.userId, userId)))
      .limit(1)

    if (!mine) return { entries, me: null }

    // 나보다 **앞선** 행의 수 + 1. 정렬 키와 같은 순서(총 승리 → 최고 배수 → userId)를 그대로 쓴다.
    const [counted] = await this.db
      .select({ ahead: sql<number>`count(*)::int` })
      .from(leaderboardWeekly)
      .where(
        and(
          eq(leaderboardWeekly.week, week),
          sql`(
            ${leaderboardWeekly.totalWin} > ${mine.totalWin}
            or (${leaderboardWeekly.totalWin} = ${mine.totalWin} and ${leaderboardWeekly.bestMultiplier} > ${mine.bestMultiplier})
            or (${leaderboardWeekly.totalWin} = ${mine.totalWin} and ${leaderboardWeekly.bestMultiplier} = ${mine.bestMultiplier} and ${leaderboardWeekly.userId} < ${userId})
          )`
        )
      )

    return { entries, me: { ...mine, rank: (counted?.ahead ?? entries.length) + 1 } }
  }

  // ---- 미션 ----

  async getMissionProgress(userId: string, day: string): Promise<MissionProgress[]> {
    return readMissionRows(this.db, userId, day)
  }

  async claimMission(input: ClaimMissionInput): Promise<ClaimResult | null> {
    const now = this.clock()

    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, input.userId))
        .limit(1)
        .for('update')
      if (!locked) throw new Error('[drizzle-repo] wallet not found for mission claim')

      const [row] = await tx
        .select()
        .from(missionProgress)
        .where(
          and(
            eq(missionProgress.userId, input.userId),
            eq(missionProgress.day, input.day),
            eq(missionProgress.missionId, input.missionId)
          )
        )
        .limit(1)
        .for('update')

      if (!row || row.claimed || row.progress < input.target) return null

      await tx
        .update(missionProgress)
        .set({ claimed: true, updatedAt: now })
        .where(
          and(
            eq(missionProgress.userId, input.userId),
            eq(missionProgress.day, input.day),
            eq(missionProgress.missionId, input.missionId)
          )
        )

      await tx.insert(ledger).values({
        userId: input.userId,
        delta: input.reward,
        currency: 'coins',
        reason: input.reason,
      })

      const [updated] = await tx
        .update(wallets)
        .set({ coins: sql`${wallets.coins} + ${input.reward}`, updatedAt: now })
        .where(eq(wallets.userId, input.userId))
        .returning()
      if (!updated) throw new Error('[drizzle-repo] wallet update failed on mission claim')

      return { amount: input.reward, wallet: toAppWallet(updated), streakDay: 1 }
    })
  }

  private async lastBonusClaim(
    db: DrizzleDb | DrizzleTx,
    userId: string,
    kind: BonusKind
  ): Promise<BonusClaim | null> {
    const [row] = await db
      .select()
      .from(bonusClaims)
      .where(and(eq(bonusClaims.userId, userId), eq(bonusClaims.kind, kind)))
      .orderBy(desc(bonusClaims.claimedAt))
      .limit(1)

    return row ? { kind, claimedAt: row.claimedAt, streakDay: row.streakDay } : null
  }
}

/** 트랜잭션 핸들. drizzle이 콜백에 넘겨주는 타입을 그대로 쓴다. */
type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0]

/**
 * 잭팟 풀에 적립하고 적립 후 잔액을 돌려준다. 입출력 모두 **1/100 코인 단위**다.
 * 풀 행이 아직 없으면(마이그레이션 시드 누락 등) 시드 금액으로 만들어 두고 진행한다.
 */
async function accrueJackpot(tx: DrizzleTx, accrual: number): Promise<number> {
  await tx
    .insert(jackpotPool)
    .values({ id: JACKPOT_ROW_ID, pool: JACKPOT_SEED_HUNDREDTHS, seed: JACKPOT_SEED_HUNDREDTHS })
    .onConflictDoNothing({ target: jackpotPool.id })

  const [row] = await tx
    .update(jackpotPool)
    .set({ pool: sql`${jackpotPool.pool} + ${accrual}`, updatedAt: new Date() })
    .where(eq(jackpotPool.id, JACKPOT_ROW_ID))
    .returning()

  if (!row) throw new Error('[drizzle-repo] jackpot pool row missing')
  return row.pool
}

async function readMissionRows(
  db: DrizzleDb | DrizzleTx,
  userId: string,
  day: string
): Promise<MissionProgress[]> {
  const rows = await db
    .select()
    .from(missionProgress)
    .where(and(eq(missionProgress.userId, userId), eq(missionProgress.day, day)))

  return rows.map((row) => ({ missionId: row.missionId, progress: row.progress, claimed: row.claimed }))
}
