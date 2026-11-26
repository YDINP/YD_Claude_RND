import { z } from 'zod'

/** 말판 칸 종류. 엔진 `BoardTileKind`와 같다. */
export const BoardTileKindSchema = z.enum(['start', 'coin', 'mult', 'forward', 'again', 'trap', 'goal'])
export type BoardTileKind = z.infer<typeof BoardTileKindSchema>

/** 말판이 끝난 이유. 결승 도착 / 함정으로 등불이 다 꺼짐 / 기회 소진. */
export const BoardEndSchema = z.enum(['goal', 'traps', 'throws'])
export type BoardEnd = z.infer<typeof BoardEndSchema>

/** 말판 던지기 상한(엔진 `BOARD_MAX_THROWS_LIMIT`). 응답 검증에서 길이를 묶는다. */
export const BOARD_THROWS_MAX = 20

/** 말판 던지기 1회. 값은 전부 이 던지기를 처리한 **뒤**의 상태다 (엔진 `BoardThrow`와 1:1). */
export const BoardThrowSchema = z.object({
  /** 1~5 = 도·개·걸·윷·모 */
  steps: z.number().int().min(1).max(5),
  /** 윷·모의 «한 번 더»가 실제로 인정됐는지 (상한에 걸리면 false) */
  extraThrow: z.boolean(),
  /** 지나간 노드 id. 출발 칸 제외, 도착 칸 포함 */
  path: z.array(z.string()),
  /** 앞으로 칸이 더 옮긴 노드 id. 앞으로 칸에 멈췄을 때만 */
  forward: z.array(z.string()).optional(),
  /** 최종으로 멈춘 칸 */
  at: z.string(),
  /** 다음 던지기에서 탈 길 id (갈림길에 멈췄으면 바뀐 값) */
  route: z.string(),
  tile: BoardTileKindSchema,
  value: z.number().int().optional(),
  /** 바구니 (총 베팅 배수) */
  pot: z.number().int().min(0),
  multiplier: z.number().int().min(1),
  /** 꺼진 등불 수 */
  traps: z.number().int().min(0),
  throwsLeft: z.number().int().min(0),
})
export type BoardThrow = z.infer<typeof BoardThrowSchema>

/**
 * 말판 보너스 전체. 트리거 스핀 하나의 `features`에 실린다. 화면의 «윷 던지기»는 이 기록을 차례로 보여 주는 연출이다.
 * `win`은 실제 지급 코인이고 그 스핀의 `totalWin`에 이미 들어 있다.
 */
export const BoardBonusFeatureSchema = z.object({
  type: z.literal('boardBonus'),
  throws: z.array(BoardThrowSchema).min(1).max(BOARD_THROWS_MAX),
  end: BoardEndSchema,
  pot: z.number().int().min(0),
  multiplier: z.number().int().min(1),
  /** `max(minPayout, pot x multiplier)`. 총 베팅 배수 */
  payout: z.number().int().min(0),
  win: z.number().int().min(0),
})
export type BoardBonusFeature = z.infer<typeof BoardBonusFeatureSchema>
