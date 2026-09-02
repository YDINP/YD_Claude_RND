import { z } from 'zod'
import { SUPPORTED_LOCALES } from './constants.js'

export const LocaleSchema = z.enum(SUPPORTED_LOCALES)

/** 다국어 문자열. en은 필수, 나머지는 선택 */
export const LocalizedStringSchema = z.object({ en: z.string(), ko: z.string().optional() })
export type LocalizedString = z.infer<typeof LocalizedStringSchema>

/**
 * 레벨 상태. `xp`는 누적 베팅액이고 `maxBet`은 이 레벨에서 해금된 최대 베팅이다.
 * 응답 안에서 다른 스키마가 참조하므로 도메인 타입과 함께 위쪽에 둔다.
 */
export const LevelSchema = z.object({
  level: z.number().int().min(1),
  xp: z.number().int().min(0),
  /** 다음 레벨에 필요한 누적 xp */
  nextLevelXp: z.number().int().min(0),
  maxBet: z.number().int().min(1),
})
export type Level = z.infer<typeof LevelSchema>

/** 오늘의 미션 1개. 진행도와 수령 여부는 유저별이다. */
export const MissionSchema = z.object({
  id: z.string(),
  name: LocalizedStringSchema,
  target: z.number().int().min(1),
  progress: z.number().int().min(0),
  reward: z.number().int().min(0),
  claimed: z.boolean(),
  completed: z.boolean(),
})
export type Mission = z.infer<typeof MissionSchema>

export const PublicUserSchema = z.object({
  id: z.string(),
  telegramId: z.number().int(),
  firstName: z.string(),
  username: z.string().optional(),
  locale: LocaleSchema,
  level: z.number().int().min(1),
  /** 누적 베팅액. 레벨 계산의 원천 */
  xp: z.number().int().min(0),
})
export type PublicUser = z.infer<typeof PublicUserSchema>

export const WalletSchema = z.object({
  coins: z.number().int().min(0),
  gems: z.number().int().min(0),
})
export type Wallet = z.infer<typeof WalletSchema>

export const GameStatusSchema = z.enum(['live', 'soon', 'hidden'])
export type GameStatus = z.infer<typeof GameStatusSchema>

/**
 * 게임 변동성 등급. 수학 모델(slot-engine)과 로비 메타데이터(game-sdk)가 함께 쓰므로
 * 두 패키지의 공통 상위인 shared가 소유한다.
 */
export const VolatilitySchema = z.enum(['low', 'medium', 'high'])
export type Volatility = z.infer<typeof VolatilitySchema>

/** 로비 카드에 필요한 최소 게임 정보 (manifest의 요약본) */
export const GameSummarySchema = z.object({
  id: z.string(),
  name: LocalizedStringSchema,
  thumbnail: z.string(),
  status: GameStatusSchema,
  reels: z.number().int().min(1),
  rows: z.number().int().min(1),
  lines: z.number().int().min(1),
  minBet: z.number().int().min(1),
  maxBet: z.number().int().min(1),
  sort: z.number().int().default(0),
})
export type GameSummary = z.infer<typeof GameSummarySchema>

// ---- API 요청/응답 ----
export const AuthTelegramRequestSchema = z.object({ initData: z.string().min(1) })
export type AuthTelegramRequest = z.infer<typeof AuthTelegramRequestSchema>

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: PublicUserSchema,
  wallet: WalletSchema,
})
export type AuthResponse = z.infer<typeof AuthResponseSchema>

export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  wallet: WalletSchema,
  /** 레벨·다음 레벨 요구치·해금된 최대 베팅 */
  levelInfo: LevelSchema,
  /** 현재 잭팟 풀. 헤더에 항상 띄우므로 /me에 같이 실어 왕복을 줄인다 */
  jackpot: z.number().int().min(0),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

/** `PATCH /me` 본문. 지금은 언어만 바꾼다. */
export const UpdateMeRequestSchema = z.object({ locale: LocaleSchema })
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>

export const GamesResponseSchema = z.object({ games: z.array(GameSummarySchema) })
export type GamesResponse = z.infer<typeof GamesResponseSchema>

export const ApiErrorSchema = z.object({ error: z.string(), code: z.string().optional() })
export type ApiError = z.infer<typeof ApiErrorSchema>

// ---- 스핀 (Phase 2) ----
export const SpinRequestSchema = z.object({
  totalBet: z.number().int().min(1),
  /** 클라이언트가 스핀마다 새로 만드는 키. 재전송 시 같은 결과를 돌려준다 */
  idempotencyKey: z.string().min(8).max(64),
})
export type SpinRequest = z.infer<typeof SpinRequestSchema>

export const WinLineSchema = z.object({
  line: z.number().int().min(0),
  symbol: z.string(),
  count: z.number().int().min(1),
  multiplier: z.number(),
  win: z.number().int().min(0),
  /** [reel, row] 좌표 목록 */
  positions: z.array(z.tuple([z.number().int(), z.number().int()])),
})
export type WinLine = z.infer<typeof WinLineSchema>

export const SpinResponseSchema = z.object({
  roundId: z.string(),
  stops: z.array(z.number().int()),
  /** grid[row][reel] = symbolId */
  grid: z.array(z.array(z.string())),
  wins: z.array(WinLineSchema),
  totalBet: z.number().int(),
  totalWin: z.number().int(),
  /** 스핀 반영 후 서버 잔액. 클라이언트는 이 값으로 덮어쓴다 */
  wallet: WalletSchema,
  /** provably fair: 라운드 서버 시드의 sha256 hex */
  seedHash: z.string(),
  nonce: z.number().int(),
  /** 이 스핀이 잭팟을 터뜨렸을 때만. 지급액은 wallet에 이미 반영돼 있다 */
  jackpotWin: z.number().int().min(0).optional(),
  /** 이 스핀 반영 후 잭팟 풀 */
  jackpot: z.number().int().min(0),
  /** 이 스핀으로 레벨이 올랐을 때만. `bonus`는 wallet에 이미 반영돼 있다 */
  levelUp: z
    .object({
      from: z.number().int().min(1),
      to: z.number().int().min(1),
      bonus: z.number().int().min(0),
    })
    .optional(),
  /** 이 스핀으로 갱신된 오늘의 미션 진행도 */
  missions: z.array(MissionSchema).optional(),
})
export type SpinResponse = z.infer<typeof SpinResponseSchema>

// ---- 허브 기능 (Phase 3) ----

/**
 * 보너스 3종의 수령 가능 여부. 판정은 서버가 하고 클라이언트는 표시만 한다.
 * `nextAvailableAt`은 ISO 8601 문자열이며, 지금 수령 가능하면 `null`이다.
 */
export const BonusStatusSchema = z.object({
  daily: z.object({
    claimable: z.boolean(),
    /** 다음 수령이 연속 며칠째가 되는지 (1..) */
    streakDay: z.number().int().min(1),
    /** 다음 수령으로 받게 될 코인 */
    nextAmount: z.number().int().min(0),
    nextAvailableAt: z.string().nullable(),
  }),
  timed: z.object({
    claimable: z.boolean(),
    amount: z.number().int().min(0),
    nextAvailableAt: z.string().nullable(),
  }),
  rescue: z.object({
    claimable: z.boolean(),
    amount: z.number().int().min(0),
  }),
})
export type BonusStatus = z.infer<typeof BonusStatusSchema>

/** 보너스/미션 수령 응답. 지갑은 적립 후 서버 잔액이다. */
export const BonusClaimResponseSchema = z.object({
  amount: z.number().int().min(0),
  wallet: WalletSchema,
  /** 데일리 보너스일 때만. 이번 수령이 연속 며칠째였는지 */
  streakDay: z.number().int().min(1).optional(),
})
export type BonusClaimResponse = z.infer<typeof BonusClaimResponseSchema>

/** 허브 전체가 공유하는 프로그레시브 잭팟 풀 */
export const JackpotSchema = z.object({
  pool: z.number().int().min(0),
  lastWin: z
    .object({
      amount: z.number().int().min(0),
      /** ISO 8601 */
      at: z.string(),
      userId: z.string(),
    })
    .optional(),
})
export type Jackpot = z.infer<typeof JackpotSchema>

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1),
  userId: z.string(),
  firstName: z.string(),
  totalWin: z.number().int().min(0),
  /** 이번 주 최고 배수 (win / bet) */
  bestMultiplier: z.number().min(0),
  spins: z.number().int().min(0),
})
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>

export const LeaderboardResponseSchema = z.object({
  /** ISO 주차 키. 예: `2026-W36` */
  week: z.string(),
  entries: z.array(LeaderboardEntrySchema),
  /** 내가 이번 주에 한 번도 스핀하지 않았으면 null */
  me: LeaderboardEntrySchema.nullable(),
  /** 이번 주가 끝나는 시각 (ISO 8601, 다음 주 월요일 00:00 UTC) */
  endsAt: z.string(),
})
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>

export const MissionsResponseSchema = z.object({
  /** UTC 일자 키. 예: `2026-09-02` */
  day: z.string(),
  missions: z.array(MissionSchema),
})
export type MissionsResponse = z.infer<typeof MissionsResponseSchema>
