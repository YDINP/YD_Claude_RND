import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  firstName: text('first_name').notNull(),
  username: text('username'),
  locale: text('locale').notNull().default('en'),
  /**
   * 유저가 앱에서 언어를 직접 골랐는지. true면 재로그인 때 initData의 `language_code`로
   * 덮어쓰지 않는다. 텔레그램 앱 언어와 게임 언어를 다르게 두고 싶은 유저를 위한 것이다.
   */
  localeExplicit: boolean('locale_explicit').notNull().default(false),
  level: integer('level').notNull().default(1),
  /** 누적 베팅액. level은 여기서 파생된다. */
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
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
    /**
     * 이 라운드가 부수적으로 만든 결과. 멱등 재전송이 **처음과 똑같은 응답**을 돌려주려면
     * 지갑에 이미 반영된 이 값들을 라운드와 함께 남겨야 한다.
     */
    jackpotWin: bigint('jackpot_win', { mode: 'number' }),
    levelUpFrom: integer('level_up_from'),
    levelUpTo: integer('level_up_to'),
    levelUpBonus: bigint('level_up_bonus', { mode: 'number' }),
    /** 프리스핀으로 돈 라운드인지. true면 `bet`은 계산 기준일 뿐 차감되지 않았다. */
    isFreeSpin: boolean('is_free_spin').notNull().default(false),
    /**
     * 이 스핀에 실제로 적용된 승수. 기본 게임은 1, 프리스핀이면 세션 배수다.
     * 시드 공개로 라운드를 재현하려면 스핀 **직전**의 배수를 알아야 한다.
     */
    multiplier: doublePrecision('multiplier').notNull().default(1),
    /** 이 스핀이 발동한 피처 (shared `FeatureTrigger[]`) */
    features: jsonb('features'),
    /** 스핀 직후의 프리스핀 상태 (shared `FreeSpinsState`). 세션이 끝났으면 null */
    freeSpinsAfter: jsonb('free_spins_after'),
    /** 이 스핀으로 세션이 끝났을 때의 요약 `{ total, spins }`. 재전송 복원용 */
    freeSpinsSummary: jsonb('free_spins_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('rounds_user_id_idempotency_key_unique').on(table.userId, table.idempotencyKey)]
)

// ---- 허브 기능 (Phase 3) ----

/**
 * 보너스 수령 기록. append-only 히스토리이며 "마지막 수령"은 `(user_id, kind)`의 최신 행이다.
 * 중복 수령 방어는 지갑 row lock으로 직렬화한 뒤 트랜잭션 안에서 다시 판정하는 쪽이 맡는다.
 */
export const bonusClaims = pgTable(
  'bonus_claims',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** 'daily' | 'timed' | 'rescue' */
    kind: text('kind').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
    /** 데일리에서만 의미가 있다. 나머지는 1. */
    streakDay: integer('streak_day').notNull().default(1),
  },
  (table) => [index('bonus_claims_user_kind_claimed_at_idx').on(table.userId, table.kind, table.claimedAt)]
)

/**
 * 허브 전체가 공유하는 잭팟 풀. 항상 `id = 1` 한 행만 쓴다.
 * `pool`과 `seed`는 **1/100 코인 단위 정수**다 (2,500,000 = 25,000 코인).
 * 코인 단위로 들면 작은 베팅의 1% 적립이 반올림에 먹혀 베팅별 적립률이 달라진다.
 */
export const jackpotPool = pgTable('jackpot_pool', {
  id: integer('id').primaryKey(),
  /** 1/100 코인 단위 */
  pool: bigint('pool', { mode: 'number' }).notNull(),
  /** 당첨 후 풀이 되돌아가는 시드. 1/100 코인 단위 */
  seed: bigint('seed', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** 잭팟 당첨 기록. 분쟁 대응과 "최근 당첨자" 표시의 소스. */
export const jackpotHits = pgTable('jackpot_hits', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  roundId: uuid('round_id'),
  /** 실제 지급액. 지갑에 들어간 값이므로 **코인 단위**다. */
  amount: bigint('amount', { mode: 'number' }).notNull(),
  wonAt: timestamp('won_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * 주간 리더보드. ISO 주차(UTC) 단위 집계이며 스핀 트랜잭션 안에서 갱신된다.
 * Redis 대신 Postgres를 쓰는 이유는 주간 리셋이 키 만료가 아니라 `week` 값 변경이면 끝나기 때문이다.
 */
export const leaderboardWeekly = pgTable(
  'leaderboard_weekly',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** `YYYY-Www` */
    week: text('week').notNull(),
    totalWin: bigint('total_win', { mode: 'number' }).notNull().default(0),
    bestMultiplier: doublePrecision('best_multiplier').notNull().default(0),
    spins: bigint('spins', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.week] }),
    index('leaderboard_weekly_week_total_win_idx').on(table.week, table.totalWin),
  ]
)

/**
 * 게임별 진행 상태. 지금은 프리스핀 세션 하나뿐이다.
 *
 * 지갑처럼 유저 단위 행이라 스핀 트랜잭션이 잡는 지갑 락으로 직렬화된다.
 * 클라이언트가 새로고침해도 `GET /games/:id/state`로 이어서 돌 수 있게 서버가 들고 있는다.
 */
export const gameStates = pgTable(
  'game_states',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    gameId: text('game_id').notNull(),
    /**
     * shared `GameState`. 지금은 `{ freeSpins }` 하나지만 캐스케이드·리스핀·스티키·미터·갬블이
     * 같은 자리에 들어온다. 피처마다 컬럼을 늘리지 않으려고 컨테이너 하나로 둔다.
     */
    state: jsonb('state'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.gameId] })]
)

/** 데일리 미션 진행도. 미션 정의 자체는 코드(`economy/config.ts`)가 갖는다. */
export const missionProgress = pgTable(
  'mission_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** `YYYY-MM-DD` (UTC) */
    day: text('day').notNull(),
    missionId: text('mission_id').notNull(),
    progress: integer('progress').notNull().default(0),
    claimed: boolean('claimed').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day, table.missionId] })]
)
