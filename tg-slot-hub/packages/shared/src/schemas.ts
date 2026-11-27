import { z } from 'zod'
import { SUPPORTED_LOCALES } from './constants.js'
import { BoardBonusFeatureSchema } from './board.js'
import { GardenCarrySchema, GardenFeatureSchema, GardenSummarySchema, GardenTopUpFeatureSchema } from './garden.js'

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
  /** 현재 레벨 문턱 xp (레벨 바 구간 진행률의 시작점) */
  levelStartXp: z.number().int().min(0).optional(),
  /** 다음 레벨에 도달할 때 받는 보너스 */
  nextLevelBonus: z.number().int().min(0).optional(),
  /** 다음 최대 베팅 해금. 더 없으면 null */
  nextUnlock: z.object({ level: z.number().int().min(1), maxBet: z.number().int().min(1) }).nullable().optional(),
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
  /** 페이라인 수 또는 ways 수. 클러스터 게임은 0이다 */
  lines: z.number().int().min(0),
  minBet: z.number().int().min(1),
  maxBet: z.number().int().min(1),
  sort: z.number().int().default(0),
  /** 위치 무관 지불 게임만 실린다(로비 카드가 «클러스터»로 오해하지 않게). 없으면 lines로 짐작한다 */
  payModel: z.literal('anywhere').optional(),
  /** 자라는 정원(growBoard) 팩이면 true. 로비 카드가 «8×8» 대신 «자라는 정원» 문구를 쓴다. 다른 팩은 키가 없다 */
  growBoard: z.boolean().optional(),
  /** 릴마다 높이가 다른 판(마름모 등)의 릴별 칸 수. 직사각 판은 없다 */
  reelHeights: z.array(z.number().int().min(1)).optional(),
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

/**
 * 개발 전용 강제 결과 프리셋. 다음 스핀이 이 조건을 만족할 때까지 서버가 시드를 다시 뽑아 본다.
 * `win`: 당첨은 있지만 피처(프리스핀/스캐터 등)는 없음. `bigWin`: 총 베팅의 10배 이상.
 * `freeSpins`: 프리스핀 진입/재발동 피처 발생. `gamble`: 더블업 제안이 열리는 유료 당첨.
 * `lose`: 무당첨에 피처 없음.
 * 당첨 단계 확인용(피처 없는 판): `winUnder` 총 베팅의 0 초과 1배 미만 · `winSmall` 1배 이상 2배 미만 ·
 * `winGood` 2배 이상 5배 미만 · `winGreat` 5배 이상 10배 미만.
 * 연쇄 게임 전용: `cascade3`: 연쇄 3단계 이상. `orderRound`: 유료 스핀에 주문 카드 라운드 진입.
 * `orderComplete`: 라운드 중 주문 완료 1건 이상. 해당 피처가 없는 게임은 서버가 거부한다.
 * 말판 게임 전용: `boardBonus`: 말판 진입. `boardGoal`: 결승 도착. `boardTraps`: 함정으로 끝남.
 * `boardFork`: 갈림길에 한 번 이상 멈춤. `boardBig`: 말판 지급이 총 베팅의 100배 이상.
 * 무대 룰렛 게임 전용: `roulette` 룰렛 진입 · `rouletteInner` 안쪽 고리 도달 · `roulette4` 가운데 고리 시작(초대권 4장+) ·
 * `rouletteGrand` 대상 착지 · `rouletteBig` 룰렛 합계 총 베팅 100배 이상. 드문 셋은 `maxTries` 20000을 권한다.
 */
export const SpinDebugPresetSchema = z.enum([
  'win',
  'bigWin',
  'freeSpins',
  'gamble',
  'lose',
  'winUnder',
  'winSmall',
  'winGood',
  'winGreat',
  'cascade3',
  'orderRound',
  'orderComplete',
  // 코인 리스핀 게임 전용(kraken-cove): 진입 / 리스핀 도중 촉수 감기 / 끝난 판에 보물 코인 / 15칸 채움
  'coinRespin',
  'columnWrap',
  'treasure',
  'coinRespinFull',
  'boardBonus',
  'boardGoal',
  'boardTraps',
  'boardFork',
  'boardBig',
  'roulette',
  'rouletteInner',
  'roulette4',
  'rouletteGrand',
  'rouletteBig',
  // 화로 배율 줄 게임 전용(volcano-forge): 불씨 2개+ / 화로 가득 / 프리스핀 추가 / 배율 10+ 연쇄 지급 50배+
  'forgeEmbers',
  'forgeFull',
  'forgeRetrigger',
  'forgeBig',
  // 자라는 정원 전용(greenhouse-garden): 성장 1회 이상 / 8×8 도달 / 씨앗 개화 / 햇살(프리스핀 중) /
  // 총 베팅 50배 이상 / 최저 보장(마지막 프리스핀). 드문 셋(gardenGrow8·gardenSun·gardenBig)은 서버가 탐색 상한을 올린다
  'gardenGrow',
  'gardenGrow8',
  'seedBloom',
  'gardenSun',
  'gardenBig',
  'gardenTopUp',
  // 얼려 두기 프리스핀 게임 전용(aurora-ice-palace): 유료 판 진입 / 라운드 중 12칸 이상 얼림 / 오로라 상승 /
  // 19칸 전부(궁전 완성) / 얼음 보너스가 총 베팅의 25배 이상(큰 결과)
  'frostRound',
  'frostChain12',
  'auroraUp',
  'frostFull',
  'frostBig',
  // 유료 판에서 바깥 릴 앞에 구슬이 진입 개수 −1개(바깥 릴 기대감 감속을 화면으로 확인)
  'frostTease',
])
export type SpinDebugPreset = z.infer<typeof SpinDebugPresetSchema>

/** `allowDevMock`이 꺼져 있으면 서버는 이 블록을 통째로 거부한다 (`400 DEBUG_DISABLED`). */
export const SpinDebugRequestSchema = z.object({
  preset: SpinDebugPresetSchema,
  /** 시드 탐색 최대 시도 횟수. 다 써도 못 찾으면 `409 DEBUG_NO_MATCH`. */
  maxTries: z.number().int().min(1).max(20000).default(5000),
})
export type SpinDebugRequest = z.infer<typeof SpinDebugRequestSchema>

export const SpinRequestSchema = z.object({
  totalBet: z.number().int().min(1),
  /** 클라이언트가 스핀마다 새로 만드는 키. 재전송 시 같은 결과를 돌려준다 */
  idempotencyKey: z.string().min(8).max(64),
  /** 개발 전용: 다음 스핀 결과를 강제하는 프리셋. 프로덕션(`allowDevMock=false`)에서는 항상 거부된다 */
  debug: SpinDebugRequestSchema.optional(),
})
export type SpinRequest = z.infer<typeof SpinRequestSchema>

const GridPositionSchema = z.tuple([z.number().int(), z.number().int()])

/** `payKind`가 없던 시절의 라운드는 `line`/`ways`에서 종류를 되짚는다. */
function withPayKind(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const line = value as { payKind?: unknown; line?: unknown; ways?: unknown }
  if (line.payKind !== undefined) return value
  return { ...line, payKind: line.line === -1 || line.ways !== undefined ? 'ways' : 'line' }
}

const WinLineObjectSchema = z
  .object({
    /** 페이라인 인덱스. `-1`은 페이라인이 아닌 당첨(ways·클러스터)을 뜻한다 */
    line: z.number().int().min(-1),
    symbol: z.string(),
    count: z.number().int().min(1),
    multiplier: z.number(),
    win: z.number().int().min(0),
    /** 그룹 배당(예: Any BAR)으로 지급된 경우 그룹 id. symbol에는 같은 그룹 id가 들어간다 */
    group: z.string().optional(),
    /** ways 지급일 때 경로 수. 라인 지급이면 없다 */
    ways: z.number().int().min(1).optional(),
    /** ways 지급 방향. `bothWays` 게임에서 어느 쪽으로 읽었는지. `center`는 가운데 릴부터 양쪽 */
    direction: z.enum(['ltr', 'rtl', 'center']).optional(),
    /** [reel, row] 좌표 목록 */
    positions: z.array(GridPositionSchema),
    /** 지급 종류. 파싱하면 항상 채워진다(없던 라운드는 line/ways에서 되짚는다). `anywhere`는 위치 무관(판 전체 개수) */
    payKind: z.enum(['line', 'ways', 'cluster', 'anywhere']).optional(),
    /** 연쇄 단계 인덱스(0부터). 연쇄 게임만 */
    cascade: z.number().int().min(0).optional(),
    /** 이 승리에 곱해진 사다리 배수. 연쇄 게임만 */
    ladder: z.number().int().min(1).optional(),
    /** 자라는 정원만. 이 클러스터에 곱해진 씨앗 배율(씨앗 값의 합). 씨앗이 없으면 키가 없다 */
    seed: z.number().int().min(1).optional(),
  })
  .refine((v) => (v.line === -1) === (v.payKind !== 'line'), {
    message: 'line이 -1이면 ways·클러스터 당첨이고, 라인 당첨이면 line은 0 이상이어야 한다',
  })
  .refine((v) => (v.payKind === 'ways') === (v.ways !== undefined), {
    message: 'ways 당첨에만 ways(경로 수)가 있다',
  })

export const WinLineSchema = z.preprocess(withPayKind, WinLineObjectSchema)
export type WinLine = z.infer<typeof WinLineSchema>

/**
 * 연쇄 1단계. `@tgslot/slot-engine`의 `CascadeStep`과 같은 모양이다.
 * `refill[reel]`은 그 릴 위에서 떨어지는 심볼을 위→아래 순서로 담는다(릴별 압축 표기).
 */
export const CascadeStepSchema = z.object({
  index: z.number().int().min(0),
  wins: z.array(WinLineSchema),
  /** 지워진 칸 [reel, row] */
  removed: z.array(GridPositionSchema),
  refill: z.array(z.array(z.string())),
  /** 이 단계의 사다리 배수 */
  multiplier: z.number().int().min(1),
  stepWin: z.number().int().min(0),
})
export type CascadeStep = z.infer<typeof CascadeStepSchema>

/** 주문 카드 1장. `prize`는 **총 베팅액 배수**다 */
export const OrderCardSchema = z.object({
  id: z.string(),
  kind: z.enum(['popSymbol', 'clusterSize', 'chainLength']),
  /** popSymbol 전용 */
  symbol: z.string().optional(),
  target: z.number().int().min(1),
  progress: z.number().int().min(0),
  prize: z.number().gt(0),
})
export type OrderCard = z.infer<typeof OrderCardSchema>

/** 주문 카드 라운드의 스핀 간 상태. 서버 값만이 정본이다 */
export const OrderRoundCarrySchema = z.object({
  /** 왼쪽 칸부터. 더 뽑을 카드가 없으면 짧아진다 */
  cards: z.array(OrderCardSchema),
  drawn: z.number().int().min(0),
  completed: z.number().int().min(0),
  /** 지금까지 지급한 상품 합계 코인 */
  prizeTotal: z.number().int().min(0),
})
export type OrderRoundCarry = z.infer<typeof OrderRoundCarrySchema>

/** 얼려 두기 프리스핀 라운드의 스핀 간 상태(aurora-ice-palace). 얼음은 판 사이에 안 남고 오로라 단계만 남는다 */
export const FrostCarrySchema = z.object({
  /** 오로라 단계 0..3 */
  level: z.number().int().min(0),
  /** 이 라운드 프리스핀에서 지금까지 지급한 코인(진입 판 제외). 라운드 상한이 이 값을 본다 */
  paid: z.number().int().min(0),
  /** 한 판에 가장 많이 얼린 칸 수 */
  bestCount: z.number().int().min(0),
  /** 얼음 보너스 지급 합계 코인 */
  bonusTotal: z.number().int().min(0),
})
export type FrostCarry = z.infer<typeof FrostCarrySchema>

/** 스핀 사이에 이월되는 피처 상태. 게임마다 필드를 더한다 */
/** 화로 배율 줄 프리스핀 라운드의 스핀 간 상태(volcano-forge). 서버 값만이 정본이다 */
export const ForgeCarrySchema = z.object({
  /** 화로 합계(배율) */
  heat: z.number().int().min(0),
  /** 켜진 화로 칸 수 */
  filled: z.number().int().min(0),
  /** 라운드 누적 지급 코인(진입 스핀 포함). 라운드 지급 상한에 쓴다 */
  paid: z.number().int().min(0),
  /** 라운드에서 «화로 가득» 두 배가 난 횟수 */
  fulls: z.number().int().min(0),
  /** 프리스핀 한 판 최고 지급 코인 */
  bestSpin: z.number().int().min(0),
})
export type ForgeCarry = z.infer<typeof ForgeCarrySchema>

export const RoundCarrySchema = z.object({
  orders: OrderRoundCarrySchema.optional(),
  forge: ForgeCarrySchema.optional(),
  /** 자라는 정원 프리스핀만. 판 크기·성장 막대·씨앗 */
  garden: GardenCarrySchema.optional(),
  frost: FrostCarrySchema.optional(),
})
export type RoundCarry = z.infer<typeof RoundCarrySchema>

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
  /** 연쇄 게임만. `grid`에서 시작해 순서대로 접으면 `finalGrid`가 된다 */
  cascades: z.array(CascadeStepSchema).optional(),
  /** 연쇄 게임만. 연쇄가 끝난 판 */
  finalGrid: z.array(z.array(z.string())).optional(),
  /** 주문 카드 상품 합계 코인. `totalWin`에 이미 들어 있다 */
  orderWin: z.number().int().min(0).optional(),
  /** 코인 리스핀 지급 합계 코인. `totalWin`에 이미 들어 있다. 리스핀 진입 스핀만 */
  respinWin: z.number().int().min(0).optional(),
  /** 얼음 보너스 지급 코인(`frostChain` 피처의 `bonus`). `totalWin`에 이미 들어 있다. 얼림이 일어난 프리스핀만 */
  frostWin: z.number().int().min(0).optional(),
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
      /** 주문 카드 라운드만. 상품을 인정받은 완료 장수 */
      ordersCompleted: z.number().int().min(0).optional(),
      /** 주문 카드 라운드만. 상품 합계 코인 */
      orderPrizeTotal: z.number().int().min(0).optional(),
      /** 화로 배율 줄 라운드만. 끝났을 때의 화로 합계 */
      forgeHeat: z.number().int().min(0).optional(),
      /** 화로 배율 줄 라운드만. «화로 가득» 두 배 횟수 */
      forgeFulls: z.number().int().min(0).optional(),
      /** 화로 배율 줄 라운드만. 프리스핀 한 판 최고 지급 코인 */
      bestSpin: z.number().int().min(0).optional(),
      /** 자라는 정원 프리스핀만. 최대 정원 크기·가장 큰 씨앗·최고 한 판·최저 보장 코인 */
      garden: GardenSummarySchema.optional(),
      /** 얼려 두기 프리스핀만. 한 판 최다 얼린 칸 · 마지막 오로라 단계 · 얼음 보너스 합계 코인 */
      frost: z
        .object({
          bestCount: z.number().int().min(0),
          auroraLevel: z.number().int().min(0),
          bonusTotal: z.number().int().min(0),
        })
        .optional(),
    })
    .optional(),
  /**
   * 이 스핀이 개발 전용 강제 프리셋(`debug`)으로 만들어졌을 때만 실린다.
   * 같은 idempotencyKey로 재전송된 응답(멱등 replay)에는 실리지 않는다 — 저장된 결과를 그대로
   * 돌려줄 뿐 다시 검색하지 않기 때문이다.
   */
  debug: z
    .object({
      preset: SpinDebugPresetSchema,
      /** 조건을 만족하는 시드를 찾기까지 실제로 소모한 시도 횟수 */
      triesUsed: z.number().int().min(1),
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

/** 리더보드 순위 보상 한 줄 (가상 코인) */
export const LeaderboardRewardTierSchema = z.object({
  fromRank: z.number().int().min(1),
  toRank: z.number().int().min(1),
  coins: z.number().int().min(0),
})
export type LeaderboardRewardTier = z.infer<typeof LeaderboardRewardTierSchema>

/** 지난 주 순위 보상 상태. 순위권 밖이면 응답에서 null */
export const LeaderboardLastWeekSchema = z.object({
  week: z.string(),
  rank: z.number().int().min(1),
  reward: z.number().int().min(0),
  claimed: z.boolean(),
})
export type LeaderboardLastWeek = z.infer<typeof LeaderboardLastWeekSchema>

export const LeaderboardResponseSchema = z.object({
  /** ISO 주차 키. 예: `2026-W36` */
  week: z.string(),
  entries: z.array(LeaderboardEntrySchema),
  /** 내가 이번 주에 한 번도 스핀하지 않았으면 null */
  me: LeaderboardEntrySchema.nullable(),
  /** 이번 주가 끝나는 시각 (ISO 8601, 다음 주 월요일 00:00 UTC) */
  endsAt: z.string(),
  /** 순위 보상 표 (가상 코인) */
  rewards: z.array(LeaderboardRewardTierSchema).optional(),
  /** 지난 주 순위권이었을 때만. 아니면 null */
  lastWeek: LeaderboardLastWeekSchema.nullable().optional(),
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
  /** 스핀 간 이월 상태(주문 카드 등). 쓰는 피처가 없는 게임은 키가 없다 */
  carry: RoundCarrySchema.optional(),
})
export type FreeSpinsState = z.infer<typeof FreeSpinsStateSchema>

// ---- 코인 리스핀 (kraken-cove) ----

/** 판 위 코인 1개. `value`는 총 베팅액 배수, `amount`는 코인. 보물 코인은 `tier`가 있다 */
export const CoinCellSchema = z.object({
  /** [reel, row] */
  pos: GridPositionSchema,
  kind: z.enum(['bet', 'treasure']),
  value: z.number().gt(0),
  tier: z.enum(['small', 'medium', 'large']).optional(),
  amount: z.number().int().min(0),
})
export type CoinCell = z.infer<typeof CoinCellSchema>

/** 촉수 감기 1회. 세로줄 하나의 금액(코인)을 행 0→2 순서로 감기 전·후 */
export const ColumnWrapSchema = z.object({
  reel: z.number().int().min(0),
  before: z.array(z.number().int().min(0)),
  after: z.array(z.number().int().min(0)),
})
export type ColumnWrap = z.infer<typeof ColumnWrapSchema>

/** 리스핀 1회. `grid[row][reel]`(고정 칸은 코인), 새 코인 금액은 이 리스핀의 감기 전 값 */
export const RespinStepSchema = z.object({
  index: z.number().int().min(0),
  grid: z.array(z.array(z.string())),
  newCoins: z.array(CoinCellSchema),
  wraps: z.array(ColumnWrapSchema),
  left: z.number().int().min(0),
})
export type RespinStep = z.infer<typeof RespinStepSchema>
/** 무대 룰렛 회전 1번. `win`은 실지급 코인(캡 적용 후), `songsLeft`는 이 회전 뒤 남은 돌리기 */
export const RouletteStepSchema = z.object({
  ring: z.number().int().min(0).max(2),
  segment: z.number().int().min(0).max(11),
  kind: z.enum(['coin', 'stepUp', 'encore', 'grand']),
  lit: z.boolean(),
  win: z.number().int().min(0),
  encoreCounted: z.boolean(),
  songsLeft: z.number().int().min(0),
})
export type RouletteStep = z.infer<typeof RouletteStepSchema>

/**
 * 무대 룰렛 진입과 전체 결과. 트리거 스핀 응답 하나에 끝까지 실린다(서버 RNG가 칸을 정했다).
 * 화면의 «돌리기» 탭은 이 결과를 보여 주는 연출이다. `total`은 `totalWin`에 이미 들어 있다.
 */
export const StageRouletteFeatureSchema = z.object({
  type: z.literal('stageRoulette'),
  bonusCount: z.number().int().min(1),
  positions: z.array(z.tuple([z.number().int(), z.number().int()])),
  cheer: z.number().int().min(0),
  cheerPositions: z.array(z.tuple([z.number().int(), z.number().int()])),
  lit: z.array(z.array(z.number().int().min(0).max(11))).max(3),
  startRing: z.number().int().min(0).max(1),
  steps: z.array(RouletteStepSchema).min(1).max(12),
  total: z.number().int().min(0),
  endedBy: z.enum(['songs', 'capped']),
})
export type StageRouletteFeature = z.infer<typeof StageRouletteFeatureSchema>

/** 불씨 1개. 연쇄 단계 `step`의 리필 칸 `position`([reel, row], 릴 위쪽)에서 솟았다. `value`는 배율 */
export const EmberDropSchema = z.object({
  step: z.number().int().min(0),
  position: GridPositionSchema,
  value: z.number().int().min(1),
})
export type EmberDrop = z.infer<typeof EmberDropSchema>

/**
 * 화로 배율 줄 한 스핀(volcano-forge). 기본 게임은 불씨가 있을 때만, 프리스핀은 항상 실린다.
 * 불씨는 생긴 순서(단계 → 릴 → 위→아래). 허브의 줄 애니메이션은 표시용이고 `heatAfter`·`filledAfter`가 정본이다.
 * `boostedWin`은 연쇄 지급 × `multiplier`(상한 적용 후) 코인이고 `totalWin = boostedWin + 모루 지급`이다
 */
export const ForgeRailFeatureSchema = z.object({
  type: z.literal('forgeRail'),
  embers: z.array(EmberDropSchema),
  heatBefore: z.number().int().min(0),
  filledBefore: z.number().int().min(0),
  heatAfter: z.number().int().min(0),
  filledAfter: z.number().int().min(0),
  /** «화로 가득» 사건. `afterEmber`번째(0부터) 불씨 직후에 합계가 heatBefore → heatAfter */
  fulls: z.array(
    z.object({
      afterEmber: z.number().int().min(0),
      heatBefore: z.number().int().min(0),
      heatAfter: z.number().int().min(0),
    }),
  ),
  /** 이번 스핀 연쇄 지급에 곱한 배율. 1이면 미적용 */
  multiplier: z.number().int().min(1),
  /** 연쇄 지급 합(배율 전) */
  baseWin: z.number().int().min(0),
  boostedWin: z.number().int().min(0),
})
export type ForgeRailFeature = z.infer<typeof ForgeRailFeatureSchema>

// ---- 얼려 두기 프리스핀 (aurora-ice-palace) ----

/** 얼림 다시 돌리기 1단계. `cells`는 이 단계 시작 때 얼지 않은 칸(릴 → 행 순서)에 새로 뽑힌 심볼, `frozen`은 새로 언 칸 */
export const FrostStepSchema = z.object({
  cells: z.array(z.string()),
  frozen: z.array(GridPositionSchema),
})
export type FrostStep = z.infer<typeof FrostStepSchema>

/**
 * 프리스핀 한 판의 얼림 전체(서버가 끝까지 정했다). 허브는 재생만 한다.
 * `bonus`가 `frostWin`과 같고 `totalWin`에 이미 들어 있다. 오로라 상승 = `auroraAfter > auroraBefore`
 */
export const FrostChainFeatureSchema = z.object({
  type: z.literal('frostChain'),
  target: z.string(),
  tier: z.enum(['high', 'mid', 'low']),
  startFrozen: z.array(GridPositionSchema),
  steps: z.array(FrostStepSchema).max(64),
  finalGrid: z.array(z.array(z.string())),
  count: z.number().int().min(0),
  bonusMultiple: z.number().min(0),
  auroraBefore: z.number().int().min(0),
  auroraAfter: z.number().int().min(0),
  auroraMultiplier: z.number().int().min(1),
  bonus: z.number().int().min(0),
  hitHardCap: z.boolean(),
})
export type FrostChainFeature = z.infer<typeof FrostChainFeatureSchema>

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
  /** 주문 카드 라운드 진입. 처음 깔리는 카드를 왼쪽 칸부터 싣는다 */
  z.object({ type: z.literal('orderRound'), cards: z.array(OrderCardSchema) }),
  /** 주문 카드 1장 완료. `prize`는 실제 지급한 **코인**이다 */
  z.object({ type: z.literal('orderComplete'), id: z.string(), prize: z.number().int().min(0) }),
  /** 라운드 지급 상한에 걸려 잘렸다. 값은 전부 코인 */
  z.object({
    type: z.literal('winCapped'),
    requested: z.number().int().min(0),
    granted: z.number().int().min(0),
    cap: z.number().int().min(1),
  }),
  /** 기본 판에 뜬 코인(릴 → 행 순서). 금액 얼굴을 그리는 데 쓴다 */
  z.object({ type: z.literal('coinBoard'), cells: z.array(CoinCellSchema) }),
  /**
   * 코인 리스핀 라운드 전체(트리거 스핀 하나에 다 실린다). 서버가 정한 결과를 허브는 재생만 한다.
   * `entry`는 진입 감기 전, `final`은 감기 반영 후. `win = coinWin + topWin`이 `respinWin`과 같다
   */
  z.object({
    type: z.literal('coinRespin'),
    entry: z.array(CoinCellSchema),
    entryWraps: z.array(ColumnWrapSchema),
    steps: z.array(RespinStepSchema),
    final: z.array(CoinCellSchema),
    full: z.boolean(),
    coinWin: z.number().int().min(0),
    topWin: z.number().int().min(0),
    win: z.number().int().min(0),
    capped: z.boolean(),
    hitHardCap: z.boolean(),
  }),
  /** 말판 보너스 전체(던지기 기록·종료 사유·지급). 트리거 스핀에만 실린다 */
  BoardBonusFeatureSchema,
  StageRouletteFeatureSchema,
  ForgeRailFeatureSchema,
  GardenFeatureSchema,
  GardenTopUpFeatureSchema,
  FrostChainFeatureSchema,
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
