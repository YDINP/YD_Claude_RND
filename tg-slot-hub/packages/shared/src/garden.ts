import { z } from 'zod'
import { WinLineSchema } from './schemas.js'

/**
 * 자라는 정원(greenhouse-garden) 응답 계약. 엔진 `@tgslot/slot-engine`의 `gardenTypes.ts`와 1:1이다.
 * 좌표는 전부 물리 8×8 판의 절대 좌표 `[reel, row]`.
 *
 * `schemas.ts`와 서로 import하므로 `WinLineSchema`는 `z.lazy`로만 참조한다(모듈 초기화 순서와 무관하게 안전).
 */

const PositionSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)])

/** 활성 영역. `x`=첫 열, `y`=첫 행, `size`=한 변(4~8). */
export const GardenBoundsSchema = z.object({
  x: z.number().int().min(0).max(7),
  y: z.number().int().min(0).max(7),
  size: z.number().int().min(4).max(8),
})
export type GardenBounds = z.infer<typeof GardenBoundsSchema>

/** 씨앗 화분. `tier`는 math.json `growBoard.seedTiers` 인덱스. */
export const GardenSeedSchema = z.object({
  reel: z.number().int().min(0).max(7),
  row: z.number().int().min(0).max(7),
  tier: z.number().int().min(0),
})
export type GardenSeed = z.infer<typeof GardenSeedSchema>

/** 한 겹 성장. `cells`는 새로 열린 칸(씨앗 추첨 순서), `grown`은 등급이 오른 기존 씨앗 수. */
export const GardenGrowSchema = z.object({
  from: GardenBoundsSchema,
  to: GardenBoundsSchema,
  cells: z.array(PositionSchema),
  seeds: z.array(GardenSeedSchema),
  grown: z.number().int().min(0),
})
export type GardenGrow = z.infer<typeof GardenGrowSchema>

/**
 * 정원 1단계: 평가 → 씨앗 배정 → 팝 → 활성 범위 안 중력 → 리필 → (문턱을 넘었으면) 성장.
 * `refill[c]`는 활성 열 `bounds.x + c`에 위→아래로 떨어지는 심볼. 성장만 하는 단계는 `wins`·`removed`·`refill`이 빈 배열.
 */
export const GardenStepSchema = z.object({
  index: z.number().int().min(0),
  wins: z.array(z.lazy(() => WinLineSchema)),
  removed: z.array(PositionSchema),
  refill: z.array(z.array(z.string())),
  bloomed: z.array(PositionSchema),
  grow: GardenGrowSchema.optional(),
  /** 이 단계 뒤 성장 막대(기본 게임은 스핀 누적, 프리스핀은 라운드 누적) */
  popped: z.number().int().min(0),
  stepWin: z.number().int().min(0),
})
export type GardenStep = z.infer<typeof GardenStepSchema>

/** 햇살 1회. 씨앗 전부 +1등급 후 새 씨앗을 심는다. `seeds`는 이 햇살 뒤 판 위 씨앗 전부. */
export const GardenSunSchema = z.object({
  grown: z.number().int().min(0),
  planted: z.array(GardenSeedSchema),
  seeds: z.array(GardenSeedSchema),
})
export type GardenSun = z.infer<typeof GardenSunSchema>

/** 프리스핀 결과 팝업용 라운드 집계(이 스핀까지 반영). 서버 값만 정본. */
export const GardenRoundStatsSchema = z.object({
  maxSize: z.number().int().min(4).max(8),
  bestSeed: z.number().int().min(0),
  bestSpinWin: z.number().int().min(0),
  freeWin: z.number().int().min(0),
  topUp: z.number().int().min(0),
})
export type GardenRoundStats = z.infer<typeof GardenRoundStatsSchema>

/** 스핀 하나의 정원 진행 전부. 응답 `grid`(8×8 착지)에서 `foldGarden`으로 접으면 `finalGrid`가 된다. */
export const GardenFeatureSchema = z.object({
  type: z.literal('garden'),
  start: GardenBoundsSchema,
  startSeeds: z.array(GardenSeedSchema),
  startPopped: z.number().int().min(0),
  steps: z.array(GardenStepSchema),
  finalGrid: z.array(z.array(z.string())),
  final: GardenBoundsSchema,
  seeds: z.array(GardenSeedSchema),
  sun: z.array(GardenSunSchema).optional(),
  round: GardenRoundStatsSchema.optional(),
  capped: z.boolean(),
  hitMaxCascades: z.boolean(),
})
export type GardenFeature = z.infer<typeof GardenFeatureSchema>

/** 정원 프리스핀 최저 보장으로 마지막 스핀에 더한 코인. `totalWin`에 이미 들어 있다. */
export const GardenTopUpFeatureSchema = z.object({
  type: z.literal('gardenTopUp'),
  amount: z.number().int().min(1),
})
export type GardenTopUpFeature = z.infer<typeof GardenTopUpFeatureSchema>

/** 정원 프리스핀 스핀 간 상태(`FreeSpinsState.carry.garden`). 새로고침하면 이 값으로 판 크기·씨앗·막대를 복원한다. */
export const GardenCarrySchema = z.object({
  /** 성장 단계 0~4 (= 한 변 4~8) */
  stage: z.number().int().min(0).max(4),
  popped: z.number().int().min(0),
  seeds: z.array(GardenSeedSchema),
  retriggers: z.number().int().min(0),
  suns: z.number().int().min(0),
  roundWin: z.number().int().min(0),
  freeWin: z.number().int().min(0),
  maxStage: z.number().int().min(0).max(4),
  /** 라운드 최고 씨앗 등급 인덱스(없으면 -1) */
  bestTier: z.number().int().min(-1),
  bestSpinWin: z.number().int().min(0),
})
export type GardenCarry = z.infer<typeof GardenCarrySchema>

/** `freeSpinsSummary.garden`: 정원 프리스핀 결과 팝업 행. */
export const GardenSummarySchema = z.object({
  maxSize: z.number().int().min(4).max(8),
  bestSeed: z.number().int().min(0),
  bestSpinWin: z.number().int().min(0),
  topUp: z.number().int().min(0),
})
export type GardenSummary = z.infer<typeof GardenSummarySchema>
