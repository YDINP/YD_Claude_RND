import { basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeExactRtp, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { parseGameManifest } from '@tgslot/game-sdk'
import { listGameDirs, readJson } from './paths.js'

/** Phase 5 양산의 CI 게이트: 새 게임 폴더는 등록 없이 자동으로 검사 대상이 된다. */
const RTP_TOLERANCE = 0.005
/** 해석 모드에서 적중률·최대 배수를 잴 표본 스핀 수. */
const SAMPLE_SPINS = 150_000

interface LoadResult {
  math: GameMath | null
  error: string | null
}

/**
 * 수집 단계에서는 절대 던지지 않는다. 팩 하나가 깨져도 다른 팩의 테스트까지
 * 무너지지 않도록 실패를 자기 `it` 안에 가둔다.
 */
function loadMath(dir: string): LoadResult {
  try {
    return { math: parseGameMath(readJson(join(dir, 'math.json'))), error: null }
  } catch (error) {
    return { math: null, error: error instanceof Error ? error.message : String(error) }
  }
}

const gameDirs = listGameDirs()

describe('games/* 수학 모델 게이트', () => {
  it('검사할 게임이 최소 1개는 있다', () => {
    expect(gameDirs.length).toBeGreaterThan(0)
  })

  it('_로 시작하는 폴더는 검사 대상에서 제외된다', () => {
    expect(gameDirs.map((dir) => basename(dir))).not.toContain('_template')
  })

  describe.each(gameDirs.map((dir) => [basename(dir), dir] as const))('%s', (name, dir) => {
    const loaded = loadMath(dir)

    const requireMath = (): GameMath => {
      if (loaded.math === null) throw new Error(`${name}: math.json 로딩 실패 — ${loaded.error ?? '알 수 없음'}`)
      return loaded.math
    }

    it('math.json이 있고 스키마를 통과한다', () => {
      expect(loaded.error).toBeNull()
      expect(loaded.math).not.toBeNull()
    })

    it('math.json의 id가 폴더 이름과 같다', () => {
      expect(requireMath().id).toBe(name)
    })

    if (loaded.math !== null) {
      // RTP만 보므로 분포 표본은 뽑지 않는다. 조합이 크면 해석적 계산으로 넘어간다.
      it.each(loaded.math.betLevels)('베팅액 %i에서 RTP가 목표 ±0.5%%p 안이다', (bet) => {
        const math = requireMath()
        const report = computeExactRtp(math, bet, { sampleSpins: 0 })
        expect(report.rtp).toBeGreaterThanOrEqual(math.rtpTarget - RTP_TOLERANCE)
        expect(report.rtp).toBeLessThanOrEqual(math.rtpTarget + RTP_TOLERANCE)
      })
    }

    it('적중률과 최대 배수가 플레이 가능한 범위다', () => {
      const math = requireMath()
      const bet = math.betLevels[0]
      expect(bet).toBeDefined()
      const report = computeExactRtp(math, bet ?? 1, { sampleSpins: SAMPLE_SPINS })
      expect(report.hitRate).toBeGreaterThan(0.2)
      expect(report.hitRate).toBeLessThan(0.6)
      // 전수 조사는 진짜 최댓값이지만 해석 모드는 표본에서 관측된 값이라
      // 기준을 낮게 잡는다. 5릴은 라인 하나의 최고 배당 자체가 총 베팅액의 25배 수준이다.
      const floor = report.method === 'enumerate' ? 100 : 20
      expect(report.maxWinMultiplier).toBeGreaterThanOrEqual(floor)
    })

    it('RTP 조각의 합이 전체와 같다', () => {
      const math = requireMath()
      const report = computeExactRtp(math, math.betLevels[0] ?? 1, { sampleSpins: 0 })
      const sum = report.breakdown.lines + report.breakdown.scatter + report.breakdown.freeSpins
      expect(sum).toBeCloseTo(report.rtp, 10)
    })

    it('프리스핀이 있으면 기대 횟수가 발산하지 않는다', () => {
      const math = requireMath()
      const feature = math.scatter?.freeSpins
      if (feature === undefined || !feature.retrigger) {
        expect(true).toBe(true)
        return
      }
      const report = computeExactRtp(math, math.betLevels[0] ?? 1, { sampleSpins: 0 })
      // count x P(트리거) < 1 이어야 등비급수가 수렴한다.
      expect(feature.count * report.triggerProbability).toBeLessThan(1)
    })

    it('manifest.json이 있고 math.json과 어긋나지 않는다', () => {
      const math = requireMath()
      const manifestPath = join(dir, 'manifest.json')
      expect(existsSync(manifestPath)).toBe(true)
      const manifest = parseGameManifest(readJson(manifestPath))
      expect(manifest.id).toBe(math.id)
      expect(manifest.reels).toBe(math.reels)
      expect(manifest.rows).toBe(math.rows)
      expect(manifest.lines).toBe(math.paylines.length)
      expect(manifest.betLevels).toEqual(math.betLevels)
      expect(manifest.rtpTarget).toBe(math.rtpTarget)
      expect(manifest.volatility).toBe(math.volatility)
      // 허브 기여분을 적어 뒀다면 기본 RTP와 합이 맞아야 한다. 표시용 숫자가 따로 놀지 않게.
      if (manifest.jackpotContribution !== undefined && manifest.rtpTotalTarget !== undefined) {
        expect(manifest.rtpTarget + manifest.jackpotContribution).toBeCloseTo(manifest.rtpTotalTarget, 6)
      }
    })
  })
})

describe('classic-777 회귀 고정값', () => {
  const dir = gameDirs.find((candidate) => basename(candidate) === 'classic-777')

  it('게임 팩이 존재한다', () => {
    expect(dir).toBeDefined()
  })

  it('README에 적힌 수치와 정확히 일치한다', () => {
    if (dir === undefined) throw new Error('classic-777 폴더가 없다')
    const math = parseGameMath(readJson(join(dir, 'math.json')))
    const report = computeExactRtp(math, 100)
    expect(report.combos).toBe(74_088)
    expect(report.rtp).toBeCloseTo(0.9449438505560954, 12)
    expect(report.hitRate).toBeCloseTo(0.41619425547996974, 12)
    expect(report.maxWinMultiplier).toBeCloseTo(131.6, 6)
  })
})
