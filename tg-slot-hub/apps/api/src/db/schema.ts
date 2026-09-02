import { sql } from 'drizzle-orm'
import { bigint, bigserial, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
