import { sql } from 'drizzle-orm'
import { bigint, bigserial, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  firstName: text('first_name').notNull(),
  username: text('username'),
  locale: text('locale').notNull().default('en'),
  level: integer('level').notNull().default(1),
  referrerId: uuid('referrer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

export const wallets = pgTable('wallets', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  coins: bigint('coins', { mode: 'number' }).notNull().default(0),
  gems: bigint('gems', { mode: 'number' }).notNull().default(0),
  /** 유저별 스핀 카운터. provably fair 시드에 섞여 라운드마다 다른 수열을 만든다. */
  nonce: bigint('nonce', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** append-only 원장. update/delete 하지 않는다. */
export const ledger = pgTable('ledger', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  delta: bigint('delta', { mode: 'number' }).notNull(),
  currency: text('currency', { enum: ['coins', 'gems'] })
    .notNull()
    .default('coins'),
  reason: text('reason').notNull(),
  refId: text('ref_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * 스핀 1회 = 1행. 분쟁 대응, RTP 실측, provably fair 검증의 소스다.
 * `(user_id, idempotency_key)` 유니크가 재전송에 의한 이중 차감을 DB 레벨에서 막는다.
 */
export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    gameId: text('game_id').notNull(),
    bet: bigint('bet', { mode: 'number' }).notNull(),
    win: bigint('win', { mode: 'number' }).notNull().default(0),
    /** 릴별 정지 위치. grid는 math.json + stops로 언제든 재구성할 수 있어 저장하지 않는다. */
    stops: jsonb('stops').$type<number[]>().notNull(),
    wins: jsonb('wins').notNull(),
    /** 라운드 서버 시드 (hex). 라운드가 끝난 뒤 소유자에게만 공개한다. */
    seed: text('seed').notNull(),
    seedHash: text('seed_hash').notNull(),
    nonce: bigint('nonce', { mode: 'number' }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('rounds_user_id_idempotency_key_unique').on(table.userId, table.idempotencyKey)]
)
