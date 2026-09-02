import { z } from 'zod'
import { VolatilitySchema } from '@tgslot/shared'
import type { GameSummary } from '@tgslot/shared'

/**
 * 로비와 게임 로더가 읽는 게임 팩 메타데이터. `games/<id>/manifest.json`의 스키마다.
 * 수학 모델은 여기에 없다 (math.json이 담당). 여기 값은 **표시용 요약**이다.
 */
export const GameManifestSchema = z.object({
  id: z.string().min(1),
  name: z.object({ en: z.string().min(1), ko: z.string().min(1).optional() }),
  version: z.string().min(1),
  thumbnail: z.string().min(1),
  status: z.enum(['live', 'soon', 'hidden']),
  reels: z.number().int().min(1),
  rows: z.number().int().min(1),
  lines: z.number().int().min(1),
  betLevels: z.array(z.number().int().positive()).min(1),
  /** 기본 게임만의 목표 RTP. math.json의 rtpTarget과 같아야 한다. */
  rtpTarget: z.number().gt(0).max(1),
  /**
   * 허브 기여분까지 더한 플레이어 체감 RTP. 표시용이며 엔진은 쓰지 않는다.
   * 보통 `rtpTarget + jackpotContribution`.
   */
  rtpTotalTarget: z.number().gt(0).max(1).optional(),
  /** 잭팟 등 허브가 얹어 주는 기대 환급률. 베팅액 대비 비율. */
  jackpotContribution: z.number().min(0).max(1).optional(),
  volatility: VolatilitySchema,
  /** 'wild', 'freespins', 'jackpot' 등 로비 배지에 쓰는 자유 태그. */
  features: z.array(z.string().min(1)).default([]),
  sort: z.number().int().default(0),
})

export type GameManifest = z.infer<typeof GameManifestSchema>

export function parseGameManifest(json: unknown): GameManifest {
  return GameManifestSchema.parse(json)
}

/**
 * manifest → 로비 카드용 요약. Phase 2에서 api의 하드코딩 게임 레지스트리를
 * 이 함수로 대체해 데이터 기반으로 만든다.
 */
export function toGameSummary(manifest: GameManifest): GameSummary {
  const sorted = [...manifest.betLevels].sort((a, b) => a - b)
  const minBet = sorted[0]
  const maxBet = sorted[sorted.length - 1]
  if (minBet === undefined || maxBet === undefined) {
    throw new RangeError(`${manifest.id}: betLevels가 비어 있다`)
  }
  return {
    id: manifest.id,
    name: manifest.name,
    thumbnail: manifest.thumbnail,
    status: manifest.status,
    reels: manifest.reels,
    rows: manifest.rows,
    lines: manifest.lines,
    minBet,
    maxBet,
    sort: manifest.sort,
  }
}
