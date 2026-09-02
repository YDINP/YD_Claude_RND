import { eq, sql } from 'drizzle-orm'
import { STARTING_COINS, STARTING_GEMS } from '@tgslot/shared'
import type { Locale } from '@tgslot/shared'
import type { DrizzleDb } from '../db/client.js'
import { ledger, users, wallets } from '../db/schema.js'
import type { TelegramUser } from '../auth/initData.js'
import type { AppUser, AppWallet, Repos, UpsertResult } from './types.js'

type UserRow = typeof users.$inferSelect
type WalletRow = typeof wallets.$inferSelect

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    telegramId: row.telegramId,
    firstName: row.firstName,
    username: row.username ?? undefined,
    locale: row.locale as Locale,
    level: row.level,
  }
}

function toAppWallet(row: WalletRow): AppWallet {
  return { coins: row.coins, gems: row.gems }
}

/** Postgres(Supabase) 구현. 신규 유저 생성/지급은 트랜잭션 + row lock으로 처리한다. */
export class DrizzleRepos implements Repos {
  constructor(private readonly db: DrizzleDb) {}

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
          locale,
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

  async getWallet(userId: string): Promise<AppWallet | null> {
    const [row] = await this.db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
    return row ? toAppWallet(row) : null
  }
}
