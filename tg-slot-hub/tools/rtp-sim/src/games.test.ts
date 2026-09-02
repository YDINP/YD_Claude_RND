import { basename, join } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { computeExactRtp, isAnalytic, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { parseGameManifest } from '@tgslot/game-sdk'
import { listArtOnlyDirs, listGameDirs, listGamePackDirs, readJson } from './paths.js'
import { acceptMonteCarloRtp, betUnitCount } from './audit/index.js'

/** Phase 5 양산의 CI 게이트: 새 게임 폴더는 등록 없이 자동으로 검사 대상이 된다. */
const RTP_TOLERANCE = 0.005
/** 해석 모드에서 적중률·최대 배수를 잴 표본 스핀 수. */
const SAMPLE_SPINS = 150_000
/**
 * 게이트가 몬테카를로 모델을 잴 때 쓰는 스핀 수와 시드. 고정이라 CI에서 재현된다.
 *
 * **여기는 빠른 1차 관문이다.** 신뢰구간 반폭 0.2%p는 게임당 2천5백만 스핀이 필요해
 * (반폭이 1/sqrt(n)로 줄기 때문에) CI에서 감당할 수 없다. 그래서 두 단계로 나눈다.
 *
 * | 단계 | 어디 | 스핀 | 규칙 |
 * |---|---|---|---|
 * | 1차 (여기) | CI | 40만 | `\|rtp-target\| <= max(0.5%p, 3xSE)` + 재현성 + 정밀도 필드 존재 |
 * | 2차 (정식) | `run audit` | 2천5백만 | `\|rtp-target\| <= 0.5%p` **그리고** 반폭 <= 0.2%p |
 *
 * 1차는 크게 어긋난 모델을 몇 분 안에 잡는 것이 목적이고, 목표 근처인지 확정하는 것은
 * 2차 리포트(`docs/RTP_AUDIT_<id>.md`)가 맡는다. 1차만 보고 "RTP가 맞다"고 말하면 안 된다.
 */
const GATE_MC_SPINS = 400_000
const GATE_MC_SEED = 'gate'
/** 몬테카를로가 도는 테스트의 제한 시간. */
const MC_TIMEOUT_MS = 180_000

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

/**
 * 검사 대상은 manifest.json이 있는 폴더뿐이다.
 * 아트만 먼저 생긴 폴더(`games/<id>/art`)는 아직 게임이 아니므로 건너뛴다.
 * manifest가 있는데 math.json이 없거나 깨진 폴더는 건너뛰지 않고 실패한다.
 */
const gameDirs = listGamePackDirs()
const artOnlyDirs = listArtOnlyDirs()

if (artOnlyDirs.length > 0) {
  console.warn(
    `[games] manifest.json이 없어 건너뛴 폴더 ${artOnlyDirs.length}개: ${artOnlyDirs.map((dir) => basename(dir)).join(', ')}`,
  )
}

describe('games/* 수학 모델 게이트', () => {
  it('검사할 게임이 최소 1개는 있다', () => {
    expect(gameDirs.length).toBeGreaterThan(0)
  })

  it('_로 시작하는 폴더는 검사 대상에서 제외된다', () => {
    expect(listGameDirs().map((dir) => basename(dir))).not.toContain('_template')
  })

  it('manifest가 없는 폴더는 검사 대상에서 빠진다', () => {
    // 아트가 먼저 생성된 폴더 때문에 CI가 막히면 안 된다.
    for (const dir of artOnlyDirs) {
      expect(gameDirs).not.toContain(dir)
    }
    expect([...gameDirs, ...artOnlyDirs].sort()).toEqual(listGameDirs().sort())
  })

  it('검사 대상은 전부 manifest.json을 갖고 있다', () => {
    for (const dir of gameDirs) {
      expect(existsSync(join(dir, 'manifest.json'))).toBe(true)
    }
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

    const isMonteCarlo = loaded.math !== null && !isAnalytic(loaded.math)

    if (loaded.math !== null && !isMonteCarlo) {
      // 닫힌 식이 있는 모델만 베팅 레벨별로 돈다. 분포 표본은 뽑지 않는다.
      it.each(loaded.math.betLevels)('베팅액 %i에서 RTP가 목표 ±0.5%%p 안이다', (bet) => {
        const math = requireMath()
        const report = computeExactRtp(math, bet, { sampleSpins: 0 })
        expect(report.rtp).toBeGreaterThanOrEqual(math.rtpTarget - RTP_TOLERANCE)
        expect(report.rtp).toBeLessThanOrEqual(math.rtpTarget + RTP_TOLERANCE)
      })
    }

    if (isMonteCarlo) {
      /*
       * 1차 관문의 수용 조건은 카탈로그 규칙 `|rtp - target| <= max(0.5%p, 3xSE)`다.
       * 40만 스핀에서 반폭은 1.4%p 수준이라, 이 단계에서 확정할 수 있는 것은
       * "크게 어긋나지는 않았다"까지다. 목표 ±0.5%p 안인지는 정식 감사가 판정한다.
       */
      it('몬테카를로 RTP가 목표 ±max(0.5%p, 3xSE) 안이다', () => {
        const math = requireMath()
        const bet = math.betLevels[0] ?? 1
        // 방법 선택은 엔진의 computeExactRtp 디스패처에 맡긴다. 여기서 따로 고르지 않는다.
        const report = computeExactRtp(math, bet, { mcSpins: GATE_MC_SPINS, mcSeed: GATE_MC_SEED })
        expect(report.method).toBe('monte-carlo')

        const mc = report.monteCarlo
        expect(mc).toBeDefined()
        if (mc === undefined) return

        // 리포트에 spins·seed·stderr·ci95가 빠짐없이 실려야 감사가 성립한다.
        expect(mc.spins).toBe(GATE_MC_SPINS)
        expect(mc.seed).toBe(GATE_MC_SEED)
        expect(mc.stdErr).toBeGreaterThan(0)
        expect(mc.ci95[0]).toBeLessThan(report.rtp)
        expect(mc.ci95[1]).toBeGreaterThan(report.rtp)

        // 규칙은 감사 리포트와 같은 함수에서 나온다. 모드만 다르다.
        const verdict = acceptMonteCarloRtp({ rtp: report.rtp, target: math.rtpTarget, stdErr: mc.stdErr }, 'ci')
        expect(
          verdict.pass,
          `RTP ${(report.rtp * 100).toFixed(4)}%가 목표 ${(math.rtpTarget * 100).toFixed(2)}%에서 ` +
            `${(verdict.delta * 100).toFixed(3)}%p 떨어져 있다 (허용 ${(verdict.tolerance * 100).toFixed(3)}%p)`,
        ).toBe(true)
      }, MC_TIMEOUT_MS)

      it('정밀도 확정은 정식 감사가 맡는다', () => {
        // 1차 관문의 스핀 수로는 엄격 규칙(반폭 <= 0.2%p)을 만족할 수 없다.
        // 그 사실 자체를 못박아 둔다 — 누군가 여기에 엄격 규칙을 붙이면 이 테스트가 알려 준다.
        const math = requireMath()
        const bet = math.betLevels[0] ?? 1
        const report = computeExactRtp(math, bet, { mcSpins: GATE_MC_SPINS, mcSeed: GATE_MC_SEED })
        const mc = report.monteCarlo
        if (mc === undefined) throw new Error('monteCarlo 정보가 없다')
        const audit = acceptMonteCarloRtp({ rtp: report.rtp, target: math.rtpTarget, stdErr: mc.stdErr }, 'audit')
        expect(audit.precise).toBe(false)
        // ci 모드는 정밀도를 묻지 않으므로 같은 측정에서도 판정이 갈린다.
        expect(acceptMonteCarloRtp({ rtp: report.rtp, target: math.rtpTarget, stdErr: mc.stdErr }, 'ci').precise).toBe(
          true,
        )
      }, MC_TIMEOUT_MS)

      it('몬테카를로는 같은 시드에서 재현된다', () => {
        const math = requireMath()
        const bet = math.betLevels[0] ?? 1
        const first = computeExactRtp(math, bet, { mcSpins: 60_000, mcSeed: GATE_MC_SEED })
        const second = computeExactRtp(math, bet, { mcSpins: 60_000, mcSeed: GATE_MC_SEED })
        expect(second.rtp).toBe(first.rtp)
      }, MC_TIMEOUT_MS)

      it('모든 베팅 레벨이 배당 단위로 나누어떨어진다', () => {
        const math = requireMath()
        // 단위 수는 엔진의 getBetUnit에서 되짚는다. 라인 수/betDivisor를 여기서 다시 고르지 않는다.
        for (const level of math.betLevels) {
          expect(() => betUnitCount(math, level)).not.toThrow()
          expect(level % betUnitCount(math, level)).toBe(0)
        }
      })
    }

    it('적중률과 최대 배수가 플레이 가능한 범위다', () => {
      const math = requireMath()
      const bet = math.betLevels[0]
      expect(bet).toBeDefined()
      const report = computeExactRtp(math, bet ?? 1, {
        sampleSpins: SAMPLE_SPINS,
        mcSpins: GATE_MC_SPINS,
        mcSeed: GATE_MC_SEED,
      })
      expect(report.hitRate).toBeGreaterThan(0.2)
      expect(report.hitRate).toBeLessThan(0.6)
      // 전수 조사는 진짜 최댓값이지만 해석·몬테카를로는 표본에서 관측된 값이라
      // 기준을 낮게 잡는다. 5릴은 라인 하나의 최고 배당 자체가 총 베팅액의 25배 수준이다.
      const floor = report.method === 'enumerate' ? 100 : 20
      expect(report.maxWinMultiplier).toBeGreaterThanOrEqual(floor)
    }, MC_TIMEOUT_MS)

    it('RTP 조각의 합이 전체와 같다', () => {
      const math = requireMath()
      const report = computeExactRtp(math, math.betLevels[0] ?? 1, {
        sampleSpins: 0,
        mcSpins: 200_000,
        mcSeed: GATE_MC_SEED,
      })
      const sum = report.breakdown.lines + report.breakdown.scatter + report.breakdown.freeSpins
      expect(sum).toBeCloseTo(report.rtp, 10)
    }, MC_TIMEOUT_MS)

    it('프리스핀이 있으면 기대 횟수가 발산하지 않는다', () => {
      const math = requireMath()
      const feature = math.scatter?.freeSpins
      if (feature === undefined || !feature.retrigger) {
        expect(true).toBe(true)
        return
      }
      const report = computeExactRtp(math, math.betLevels[0] ?? 1, {
        sampleSpins: 0,
        mcSpins: 200_000,
        mcSeed: GATE_MC_SEED,
      })
      // count x P(트리거) < 1 이어야 등비급수가 수렴한다.
      expect(feature.count * report.triggerProbability).toBeLessThan(1)
    }, MC_TIMEOUT_MS)

    it('manifest.json이 있고 math.json과 어긋나지 않는다', () => {
      const math = requireMath()
      const manifestPath = join(dir, 'manifest.json')
      expect(existsSync(manifestPath)).toBe(true)
      const manifest = parseGameManifest(readJson(manifestPath))
      expect(manifest.id).toBe(math.id)
      expect(manifest.reels).toBe(math.reels)
      expect(manifest.rows).toBe(math.rows)
      // ways 게임은 페이라인이 없다. manifest의 lines에는 경로 수를 적는다.
      const expectedLines = math.payModel === 'ways' ? (math.ways?.base ?? 0) : math.paylines.length
      expect(manifest.lines).toBe(expectedLines)
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

/**
 * fruit-fiesta는 조합이 2억이 넘어 전수 조사가 불가능하다. 대신 RTP가 닫힌 식으로 나오므로
 * 그 값 자체를 고정해 둔다. 표본이 아니라 해석적 정확값이라 12자리까지 재현된다.
 *
 * 이 값이 흔들리면 페이테이블·스트립이 바뀌었거나 해석 경로가 달라진 것이다.
 * 어느 쪽이든 의도한 변경인지 확인해야 한다.
 */
describe('fruit-fiesta 해석 RTP 고정값', () => {
  const dir = gameDirs.find((candidate) => basename(candidate) === 'fruit-fiesta')

  it('게임 팩이 존재한다', () => {
    expect(dir).toBeDefined()
  })

  it('해석적 RTP가 고정값과 정확히 일치한다', () => {
    if (dir === undefined) throw new Error('fruit-fiesta 폴더가 없다')
    const math = parseGameMath(readJson(join(dir, 'math.json')))
    // 분포 표본은 뽑지 않는다. RTP만 보므로 표본이 필요 없고, 그래야 빠르고 결정론적이다.
    const report = computeExactRtp(math, 100, { sampleSpins: 0 })
    expect(report.method).toBe('analytic')
    expect(report.rtp).toBeCloseTo(0.9449304161655017, 12)
  })

  it('베팅액을 바꿔도 해석적 RTP는 같다', () => {
    if (dir === undefined) throw new Error('fruit-fiesta 폴더가 없다')
    const math = parseGameMath(readJson(join(dir, 'math.json')))
    for (const bet of math.betLevels) {
      expect(computeExactRtp(math, bet, { sampleSpins: 0 }).rtp).toBeCloseTo(0.9449304161655017, 12)
    }
  })
})

/**
 * 분류 규칙의 반대쪽 절반. 아트만 있는 폴더는 건너뛰지만,
 * manifest가 있는 반쪽짜리 팩은 반드시 실패로 잡혀야 한다.
 * 저장소에 그런 폴더를 남길 수는 없으므로 임시 폴더로 검증한다.
 */
describe('반쪽짜리 팩 처리', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtp-sim-gate-'))

  // 아트만 있는 폴더 — 건너뛴다.
  mkdirSync(join(root, 'art-only', 'art'), { recursive: true })

  // manifest는 있는데 math.json이 없다 — 검사 대상에 들어가고 실패한다.
  mkdirSync(join(root, 'no-math'))
  writeFileSync(join(root, 'no-math', 'manifest.json'), '{}')

  // manifest도 math도 있지만 math가 스키마를 통과하지 못한다 — 역시 실패한다.
  mkdirSync(join(root, 'bad-math'))
  writeFileSync(join(root, 'bad-math', 'manifest.json'), '{}')
  writeFileSync(join(root, 'bad-math', 'math.json'), '{"id":"bad-math"}')

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('아트만 있는 폴더는 대상에서 빠진다', () => {
    const packs = listGamePackDirs(root).map((dir) => basename(dir))
    expect(packs).not.toContain('art-only')
    expect(listArtOnlyDirs(root).map((dir) => basename(dir))).toEqual(['art-only'])
  })

  it('manifest만 있는 폴더는 대상에 들어간다', () => {
    expect(listGamePackDirs(root).map((dir) => basename(dir))).toEqual(['bad-math', 'no-math'])
  })

  it('math.json이 없으면 로딩이 실패로 보고된다', () => {
    const loaded = loadMath(join(root, 'no-math'))
    expect(loaded.math).toBeNull()
    expect(loaded.error).toContain('ENOENT')
  })

  it('math.json이 스키마를 못 통과해도 실패로 보고된다', () => {
    const loaded = loadMath(join(root, 'bad-math'))
    expect(loaded.math).toBeNull()
    expect(loaded.error).not.toBeNull()
  })

  it('아트만 있는 폴더는 로딩 자체를 시도하지 않는다', () => {
    // 대상 목록에 없으므로 describe.each가 만들지 않는다. 규칙을 한 줄로 못박아 둔다.
    expect(listGamePackDirs(root).some((dir) => basename(dir) === 'art-only')).toBe(false)
  })
})
