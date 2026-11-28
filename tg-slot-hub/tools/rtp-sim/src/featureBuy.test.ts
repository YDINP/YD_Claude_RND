import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_BUY_MAX_TRIES, FEATURE_BUY_TRIGGERS, canTriggerFeatureBuy, parseGameMath } from '@tgslot/slot-engine'
import { findWorkspaceRoot, listGamePackDirs, readJson } from './paths.js'
import { estimateFeatureBuy, mathHash, suggestPrice, type FeatureBuyBaseline } from './featureBuy.js'

/**
 * 피처 구매 게이트.
 *
 * 정식 측정(진입 판 4만~60만 개, `pnpm --filter @tgslot/rtp-sim feature-buy <id> --write`)은 CI에서 돌리기엔 길다(게임당 1~11분).
 * 그래서 그 결과를 `tools/rtp-sim/feature-buy.json`에 남기고, 여기서는
 *  1) 기준값이 지금 math.json으로 잰 것인지(해시) · 가격·보너스가 같은지
 *  2) 구매 환수율이 기본 목표 ±1%p 안이고 95% 신뢰구간 반폭이 1%p 이하인지
 *  3) 작은 표본(고정 시드)으로 다시 재도 기준값과 어긋나지 않는지(4.5 표준오차)
 * 를 본다. math를 고치면 1)이 «다시 재라»로 실패한다.
 */
const TOLERANCE = 0.01
const QUICK = { entries: 400, continuations: 2, seed: 'gate' }

const root = findWorkspaceRoot()
const baselinePath = join(root, 'tools/rtp-sim/feature-buy.json')
const baseline: Record<string, FeatureBuyBaseline> = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, FeatureBuyBaseline>)
  : {}

const packs = listGamePackDirs().map((dir) => {
  const raw = readJson(join(dir, 'math.json')) as Record<string, unknown>
  return { id: basename(dir), raw, math: parseGameMath(raw) }
})

describe('피처 구매 게이트', () => {
  for (const { id, raw, math } of packs) {
    const buy = math.featureBuy
    if (buy === undefined) {
      it(`${id}: 대표 보너스가 없어서 featureBuy가 없다`, () => {
        expect(FEATURE_BUY_TRIGGERS.filter((trigger) => canTriggerFeatureBuy(math, trigger))).toEqual([])
      })
      continue
    }

    it(`${id}: 기준값이 지금 math로 잰 것이고 가격·보너스가 같다`, () => {
      const row = baseline[id]
      expect(row, `feature-buy.json에 ${id}가 없다. feature-buy ${id} --write로 재라`).toBeDefined()
      expect(row!.mathHash, `${id} math.json이 바뀌었다. feature-buy ${id} --write로 다시 재라`).toBe(mathHash(raw))
      expect(row!.trigger).toBe(buy.trigger)
      expect(row!.price).toBe(buy.price)
      expect(row!.rtpTarget).toBe(math.rtpTarget)
    })

    it(`${id}: 구매 환수율이 기본 목표 ±1%p 안이고 신뢰구간 반폭 1%p 이하`, () => {
      const row = baseline[id]!
      const buyRtp = row.meanRoundWin / buy.price
      const halfWidth = (1.96 * row.stdErr) / buy.price
      expect(Math.abs(buyRtp - math.rtpTarget)).toBeLessThanOrEqual(TOLERANCE)
      expect(halfWidth).toBeLessThanOrEqual(TOLERANCE)
      // 가격은 규칙(10 → 5 → 1 → 0.5 → 0.2 → 0.1 단위)대로 정한 값이어야 한다.
      expect(buy.price).toBe(suggestPrice(row.meanRoundWin, math.rtpTarget, math.betLevels))
    })

    it(`${id}: 탐색 상한이 평균 시도 수의 50배 이상`, () => {
      expect(baseline[id]!.meanTries * 50).toBeLessThanOrEqual(FEATURE_BUY_MAX_TRIES)
    })

    it(`${id}: 작은 표본으로 다시 재도 기준값과 맞는다`, () => {
      const row = baseline[id]!
      const quick = estimateFeatureBuy(math, buy.trigger, row.totalBet, QUICK)
      expect(Math.abs(quick.meanRoundWin - row.meanRoundWin)).toBeLessThanOrEqual(4.5 * Math.hypot(quick.stdErr, row.stdErr))
    }, 60_000)
  }
})
