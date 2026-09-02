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

export const WinLineSchema = z
  .object({
    /** 페이라인 인덱스. `-1`은 페이라인이 아닌 ways 당첨을 뜻한다 (이때 `ways`가 함께 온다) */
    line: z.number().int().min(-1),
    symbol: z.string(),
    count: z.number().int().min(1),
    multiplier: z.number(),
    win: z.number().int().min(0),
    /** 그룹 배당(예: Any BAR)으로 지급된 경우 그룹 id. symbol에는 같은 그룹 id가 들어간다 */
    group: z.string().optional(),
    /** ways 지급일 때 경로 수. 라인 지급이면 없다 */
    ways: z.number().int().min(1).optional(),
    /** ways 지급 방향. `bothWays` 게임에서 어느 쪽으로 읽었는지 */
    direction: z.enum(['ltr', 'rtl']).optional(),
    /** [reel, row] 좌표 목록 */
    positions: z.array(z.tuple([z.number().int(), z.number().int()])),
  })
  .refine((v) => (v.line === -1) === (v.ways !== undefined), {
    message: 'line이 -1이면 ways가 있어야 하고, ways가 있으면 line은 -1이어야 한다',
  })
export type WinLine = z.infer<typeof WinLineSchema>

/** 뮤테이션이 바꾼 칸 하나. 렌더러가 from → to 전환을 그린다. */
export const MutationCellChangeSchema = z.object({
  /** [reel, row] */
  position: z.tuple([z.number().int(), z.number().int()]),
  from: z.string(),
  to: z.string(),
})
export type MutationCellChange = z.infer<typeof MutationCellChangeSchema>

/** 뮤테이션 1단계가 실제로 무엇을 바꿨는지. `@tgslot/slot-engine`의 `MutationEvent`와 같은 모양이다. */
export const MutationEventSchema = z.object({
  type: z.enum(['mystery', 'expandWild', 'upgrade', 'randomWild']),
  /** mystery면 공개된 심볼, upgrade면 승급 결과, 와일드 계열이면 와일드 id */
  symbol: z.string().optional(),
  /** expandWild가 덮은 릴 인덱스 */
  reels: z.array(z.number().int()).optional(),
  cells: z.array(MutationCellChangeSchema),
})
export type MutationEvent = z.infer<typeof MutationEventSchema>

export const SpinResponseSchema = z.object({
  roundId: z.string(),
  stops: z.array(z.number().int()),
  /** grid[row][reel] = symbolId. 뮤테이션까지 적용된, 평가에 쓰인 격자 */
  grid: z.array(z.array(z.string())),
  /**
   * 뮤테이션 적용 **전** 격자. 리빌·확장 연출의 시작 프레임이다.
   * 서버는 항상 채워서 보내고, 뮤테이션이 없으면 `grid`와 같다.
   * (이 필드가 없던 시절의 라운드를 파싱할 수 있도록 선택 필드로 둔다.)
   */
  gridBefore: z.array(z.array(z.string())).optional(),
  /** 적용된 뮤테이션. 선언 순서대로, 실제로 무언가 바꾼 것만 담긴다 */
  mutations: z.array(MutationEventSchema).default([]),
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
  /** 이 스핀이 프리스핀이었는지 (베팅 차감 없음) */
  isFreeSpin: z.boolean().default(false),
  /** 이번 스핀에서 발동한 피처(프리스핀 진입/재발동, 스캐터 배당) */
  features: z.array(z.lazy(() => FeatureTriggerSchema)).default([]),
  /** 스핀 후 프리스핀 상태. 남은 게 없으면 null */
  freeSpins: z.lazy(() => FreeSpinsStateSchema).nullable().default(null),
  /**
   * 이 스핀의 당첨을 더블업에 걸 수 있을 때만. 다음 스핀을 돌리면 사라진다.
   * 당첨금은 이미 `wallet`에 들어가 있고, 더블업은 그것을 다시 거는 것이다.
   */
  gambleOffer: z
    .object({
      pendingWin: z.number().int().min(1),
      maxSteps: z.number().int().min(1),
      /** 이 시각이 지나면 판돈이 자동 회수된다 (ISO 8601). 카운트다운 표시용 */
      expiresAt: z.string(),
    })
    .optional(),
  /** 이 스핀으로 프리스핀 세션이 **끝났을 때만**. 결과 화면에 띄우는 총합이다 */
  freeSpinsSummary: z
    .object({
      /** 세션 전체 누적 당첨 (이 스핀 포함) */
      total: z.number().int().min(0),
      /** 세션에서 실제로 돈 프리스핀 횟수 (리트리거 포함) */
      spins: z.number().int().min(0),
    })
    .optional(),
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

// ---- 피처: 프리스핀 (Phase 5) ----
export const FreeSpinsStateSchema = z.object({
  gameId: z.string(),
  left: z.number().int().min(0),
  total: z.number().int().min(0),
  multiplier: z.number().min(1),
  /** 프리스핀 진입 시 고정된 베팅액. 프리스핀은 이 금액 기준으로 계산되며 차감되지 않는다 */
  totalBet: z.number().int().min(1),
  /** 이 프리스핀 세션에서 누적된 당첨 합계 */
  accumulatedWin: z.number().int().min(0),
  /**
   * 세션 만료 시각 (ISO 8601). 지나면 없는 것으로 취급한다.
   * 오래된 행에는 없을 수 있어 선택 필드다 (없으면 만료되지 않는다).
   */
  expiresAt: z.string().optional(),
})
export type FreeSpinsState = z.infer<typeof FreeSpinsStateSchema>

export const FeatureTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('freeSpins'), spins: z.number().int().min(1), multiplier: z.number().min(1), retrigger: z.boolean() }),
  z.object({
    type: z.literal('scatterWin'),
    symbol: z.string(),
    count: z.number().int().min(1),
    win: z.number().int().min(0),
    positions: z.array(z.tuple([z.number().int(), z.number().int()])),
  }),
  /**
   * 리트리거가 라운드 상한(`MAX_FREE_SPINS_PER_ROUND`)에 걸려 잘렸다는 기록.
   * 엔진이 예외를 던지는 대신 잘라내고 남기는 방어적 신호라, 실전에서는 사실상 나오지 않는다.
   */
  z.object({
    type: z.literal('freeSpinsCapped'),
    requested: z.number().int().min(1),
    granted: z.number().int().min(0),
    cap: z.number().int().min(1),
  }),
])
export type FeatureTrigger = z.infer<typeof FeatureTriggerSchema>

// ---- 더블업 (Wave 1) ----

export const GambleSideSchema = z.enum(['heads', 'tails'])
export type GambleSide = z.infer<typeof GambleSideSchema>

export const GambleRequestSchema = z.object({
  pick: GambleSideSchema,
  /**
   * 재전송 방어 키. 헤더 `Idempotency-Key`로 보내도 된다.
   * 같은 키로 다시 부르면 저장된 결과를 그대로 돌려주고 판정을 다시 하지 않는다.
   */
  idempotencyKey: z.string().min(8).max(64).optional(),
})
export type GambleRequest = z.infer<typeof GambleRequestSchema>

/** 더블업 한 단계의 기록. 재전송 복원과 provably fair 공개에 함께 쓰인다. */
export const GambleStepSchema = z.object({
  step: z.number().int().min(1),
  /** 이 단계를 만든 요청의 멱등키 */
  idempotencyKey: z.string(),
  pick: GambleSideSchema,
  side: GambleSideSchema,
  won: z.boolean(),
  /** 판정 전 판돈 */
  stake: z.number().int().min(0),
  /** 판정 후 판돈 */
  pendingWin: z.number().int().min(0),
  /** 이 단계가 자동 회수로 끝났는지 */
  autoCollected: z.boolean(),
  seedInput: z.string(),
})
export type GambleStep = z.infer<typeof GambleStepSchema>

/**
 * 진행 중인 더블업. 스핀 한 번이면 사라진다.
 *
 * `pendingWin`은 **지갑 밖에 잠겨 있는 돈**이다. 제안이 열릴 때 지갑에서 빠져나오고
 * 회수할 때 돌아온다. 그래서 더블업 중에는 지갑 잔액에 이 금액이 보이지 않는다.
 */
export const GambleStateSchema = z.object({
  roundId: z.string(),
  /** 지금 잠겨 있는 금액. 이기면 2배, 지면 0이 된다 */
  pendingWin: z.number().int().min(0),
  /** 지금까지 진행한 단계 기록 */
  steps: z.array(GambleStepSchema).default([]),
  maxSteps: z.number().int().min(1),
  /** 이 시각이 지나면 자동 회수된다 (ISO 8601) */
  expiresAt: z.string().optional(),
})
export type GambleState = z.infer<typeof GambleStateSchema>

export const GambleResponseSchema = z.object({
  /** `win`이면 2배, `lose`면 0, `collected`면 그대로 챙기고 종료 */
  outcome: z.enum(['win', 'lose', 'collected']),
  /** 상한(단계/금액/만료)에 걸려 서버가 알아서 회수했는지. 이때 판돈은 지갑에 들어가 있다 */
  autoCollected: z.boolean().default(false),
  /** 실제로 뒤집힌 면. 회수(`collected`)에는 없다 */
  side: GambleSideSchema.optional(),
  /** 판정 후 걸려 있는 금액. 종료됐으면 0이거나 이미 지갑에 들어간 값이다 */
  pendingWin: z.number().int().min(0),
  wallet: WalletSchema,
  /** 더 도전할 수 있는 횟수. 0이면 끝났다 */
  stepsLeft: z.number().int().min(0),
  /** 이 판정을 재현하는 RNG 시드 입력. 회수에는 빈 문자열 */
  seedInput: z.string(),
  /**
   * 세션이 아직 열려 있을 때의 만료 시각 (ISO 8601). 단계마다 새로 밀린다.
   * 끝난 판정(패배·회수·자동 회수)에는 없다.
   */
  expiresAt: z.string().optional(),
})
export type GambleResponse = z.infer<typeof GambleResponseSchema>

/**
 * 게임별 진행 상태 묶음. 지금은 프리스핀뿐이지만 앞으로 캐스케이드·리스핀·스티키·미터·갬블이
 * 같은 자리에 들어온다. 필드를 늘려도 저장 스키마를 바꾸지 않도록 컨테이너로 둔다.
 */
export const GameStateSchema = z.object({
  freeSpins: FreeSpinsStateSchema.nullable().default(null),
  gamble: GambleStateSchema.nullable().default(null),
})
export type GameState = z.infer<typeof GameStateSchema>

export const GameStateResponseSchema = z.object({
  /** `state.freeSpins`와 같은 값. 자주 쓰는 값이라 위로 꺼내 둔다 */
  freeSpins: FreeSpinsStateSchema.nullable(),
  state: GameStateSchema,
})
export type GameStateResponse = z.infer<typeof GameStateResponseSchema>
