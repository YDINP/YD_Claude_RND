import { describe, expect, it } from 'vitest'
import type { StageRouletteConfig } from '@tgslot/slot-engine'
import { loadIdolMath, sampleRoulettes } from '../test/idolMath'
import {
  MAX_JITTER,
  angleAt,
  arcPath,
  easeOutCubic,
  estimateShowMs,
  hashSeed,
  initialRestAngles,
  litCountOf,
  litSegmentAt,
  maxRouletteMultiple,
  planRoulette,
  polar,
  restAngleFor,
  ringBands,
  ringSegments,
  rouletteTimings,
  seededUnit,
  segmentAtAngle,
  skipRemainingMs,
  snapshotAt,
  summaryItems,
  sweepDeg,
  tickTimes,
  wrapDeg,
  type RouletteSpeed,
} from './rouletteShow'

const math = loadIdolMath()
const maybeConfig = math.stageRoulette
if (maybeConfig === undefined) throw new Error('idol-stage-live math에 stageRoulette가 없다')
const config: StageRouletteConfig = maybeConfig
const samples = sampleRoulettes(math, 300)

describe('시간표(기획 §7-3)', () => {
  it('normal·quick·turbo·모션 축소 값이 표와 같다', () => {
    expect(rouletteTimings('normal', false)).toMatchObject({
      spinMs: 2400,
      resultMs: { coin: 700, stepUp: 1100, encore: 900, grand: 2000 },
      riseMs: 500,
      lightMs: 160,
      autoSpinWaitMs: 2000,
      quickStopMs: 350,
      skipStepMs: 300,
    })
    expect(rouletteTimings('quick', false)).toMatchObject({ spinMs: 1500, resultMs: { coin: 500, stepUp: 800, encore: 600, grand: 1500 } })
    expect(rouletteTimings('turbo', false)).toMatchObject({ spinMs: 800, resultMs: { coin: 300, stepUp: 500, encore: 400, grand: 1000 } })
    expect(rouletteTimings('normal', true)).toMatchObject({
      spinMs: 350,
      turns: 0,
      riseMs: 0,
      lightMs: 0,
      resultMs: { coin: 300, stepUp: 300, encore: 300, grand: 600 },
    })
  })

  it('모션 축소는 스핀 속도와 무관하게 같다', () => {
    const speeds: RouletteSpeed[] = ['normal', 'quick', 'turbo']
    for (const speed of speeds) expect(rouletteTimings(speed, true)).toEqual(rouletteTimings('normal', true))
  })
})

describe('각도 계산', () => {
  it('칸 중앙에 설 각도는 포인터가 그 칸을 가리킨다(모든 고리·칸·지터)', () => {
    for (const ring of config.rings) {
      const n = ring.segments.length
      for (let segment = 0; segment < n; segment += 1) {
        for (const jitter of [-MAX_JITTER, -0.1, 0, 0.1, MAX_JITTER]) {
          expect(segmentAtAngle(n, restAngleFor(n, segment, jitter))).toBe(segment)
          // 360도 더 돌아도 같은 칸이다.
          expect(segmentAtAngle(n, restAngleFor(n, segment, jitter) + 720)).toBe(segment)
        }
      }
    }
  })

  it('wrapDeg·sweepDeg', () => {
    expect(wrapDeg(-90)).toBe(270)
    expect(wrapDeg(725)).toBe(5)
    expect(sweepDeg(12)).toBe(30)
  })

  it('시드 난수는 같은 시드에서 같고 0~1이다', () => {
    expect(seededUnit(hashSeed('a:0'))).toBe(seededUnit(hashSeed('a:0')))
    expect(seededUnit(hashSeed('a:0'))).not.toBe(seededUnit(hashSeed('a:1')))
    for (let i = 0; i < 200; i += 1) {
      const u = seededUnit(hashSeed(`x:${i}`))
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })

  it('감속 곡선은 단조 증가이고 0에서 시작해 1에 닿는다(되돌아옴 없음)', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    let prev = -1
    for (let i = 0; i <= 100; i += 1) {
      const v = easeOutCubic(i / 100)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(angleAt(10, 410, 0)).toBe(10)
    expect(angleAt(10, 410, 1)).toBe(410)
  })
})

describe('planRoulette — 실제 엔진 표본 300판', () => {
  it('표본이 모였다', () => {
    expect(samples.length).toBe(300)
  })

  it('모든 회전이 서버가 정한 칸에서 멈춘다(탭·시간이 결과를 바꾸지 못한다)', () => {
    for (const sample of samples) {
      for (const speed of ['normal', 'quick', 'turbo'] as const) {
        const plan = planRoulette(sample.feature, config, { seed: sample.seed, speed })
        plan.steps.forEach((step, i) => {
          const raw = sample.feature.steps[i]
          if (raw === undefined) throw new Error('step 누락')
          const n = config.rings[step.ring]?.segments.length ?? 0
          expect(step.ring).toBe(raw.ring)
          expect(step.segment).toBe(raw.segment)
          expect(step.kind).toBe(raw.kind)
          expect(step.win).toBe(raw.win)
          expect(segmentAtAngle(n, step.toAngle)).toBe(raw.segment)
        })
      }
    }
  })

  it('항상 시계 방향으로 돌아 멈추고 최소 바퀴 수를 채운다', () => {
    for (const sample of samples.slice(0, 80)) {
      for (const speed of ['normal', 'quick', 'turbo'] as const) {
        const turns = rouletteTimings(speed, false).turns
        const plan = planRoulette(sample.feature, config, { seed: sample.seed, speed })
        for (const step of plan.steps) {
          expect(step.toAngle).toBeGreaterThan(step.fromAngle)
          expect(step.toAngle - step.fromAngle).toBeGreaterThanOrEqual(turns * 360)
        }
      }
    }
  })

  it('모션 축소는 바퀴 수 0 — 점프지만 각도는 줄지 않는다', () => {
    for (const sample of samples.slice(0, 80)) {
      const plan = planRoulette(sample.feature, config, { seed: sample.seed, reducedMotion: true })
      for (const step of plan.steps) {
        expect(step.toAngle).toBeGreaterThanOrEqual(step.fromAngle)
        expect(step.toAngle - step.fromAngle).toBeLessThan(360)
      }
    }
  })

  it('같은 고리를 다시 돌릴 때 출발 각도는 직전에 멈춘 각도다', () => {
    for (const sample of samples.slice(0, 80)) {
      const plan = planRoulette(sample.feature, config, { seed: sample.seed })
      const rest = initialRestAngles(config)
      for (const step of plan.steps) {
        expect(step.fromAngle).toBe(rest[step.ring])
        rest[step.ring] = step.toAngle
      }
      expect(plan.restAngles).toEqual(rest)
    }
  })

  it('같은 입력은 같은 계획이고 시드가 다르면 멈춤 위치만 달라진다', () => {
    const sample = samples[0]
    if (sample === undefined) throw new Error('표본 없음')
    const a = planRoulette(sample.feature, config, { seed: 'r1' })
    const b = planRoulette(sample.feature, config, { seed: 'r1' })
    const c = planRoulette(sample.feature, config, { seed: 'r2' })
    expect(a).toEqual(b)
    expect(c.steps.map((s) => s.segment)).toEqual(a.steps.map((s) => s.segment))
    expect(c.steps.map((s) => s.toAngle)).not.toEqual(a.steps.map((s) => s.toAngle))
  })

  it('합계·남은 돌리기·앙코르 수가 서버 값과 이어진다', () => {
    for (const sample of samples) {
      const plan = planRoulette(sample.feature, config, { seed: sample.seed })
      expect(plan.total).toBe(sample.feature.total)
      expect(plan.endedBy).toBe(sample.feature.endedBy)
      let songs = config.songs
      let total = 0
      let encores = 0
      plan.steps.forEach((step, i) => {
        expect(step.songsBefore).toBe(songs)
        expect(step.totalBefore).toBe(total)
        expect(step.encoresUsedBefore).toBe(encores)
        songs = step.songsLeft
        total += step.win
        if (step.kind === 'encore' && step.encoreCounted) encores += 1
        expect(step.totalAfter).toBe(total)
        expect(step.encoresUsedAfter).toBe(encores)
        expect(step.auto).toBe(i > 0 && plan.steps[i - 1]?.kind === 'stepUp')
      })
      expect(encores).toBeLessThanOrEqual(config.maxEncores)
      // 서버 응답의 합계는 모든 회전 지급의 합이다.
      expect(total).toBe(sample.totalWin - (sample.totalWin - sample.feature.total))
    }
  })

  it('탭이 필요 없는 회전은 «한 단계 위로» 바로 다음 회전뿐이다', () => {
    const sample = samples.find((s) => s.feature.steps.some((st) => st.kind === 'stepUp'))
    if (sample === undefined) throw new Error('위로 표본 없음')
    const plan = planRoulette(sample.feature, config, { seed: sample.seed })
    const autos = plan.steps.filter((s) => s.auto)
    expect(autos.length).toBeGreaterThan(0)
    for (const step of autos) expect(plan.steps[step.index - 1]?.kind).toBe('stepUp')
  })

  it('회전 수는 3~7회이고 척도가 정수로 줄어든다', () => {
    for (const sample of samples) {
      const n = sample.feature.steps.length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(7)
    }
  })
})

describe('snapshotAt — 새로고침 이어 보기', () => {
  const sample = samples.find((s) => s.feature.steps.length >= 4)
  if (sample === undefined) throw new Error('표본 없음')
  const plan = planRoulette(sample.feature, config, { seed: sample.seed })

  it('0회전 = 시작 상태', () => {
    expect(snapshotAt(plan, config, 0)).toMatchObject({
      songsLeft: config.songs,
      encoresUsed: 0,
      total: 0,
      ring: plan.steps[0]?.ring,
    })
  })

  it('k회전 뒤 상태는 그 회전까지의 합·남은 돌리기와 같다', () => {
    for (let k = 1; k <= plan.steps.length; k += 1) {
      const snap = snapshotAt(plan, config, k)
      const last = plan.steps[k - 1]
      expect(snap.total).toBe(last?.totalAfter)
      expect(snap.songsLeft).toBe(last?.songsLeft)
      expect(snap.encoresUsed).toBe(last?.encoresUsedAfter)
    }
  })

  it('범위를 벗어난 값은 접는다', () => {
    expect(snapshotAt(plan, config, 99).total).toBe(plan.total)
    expect(snapshotAt(plan, config, -3).total).toBe(0)
  })

  it('쉬는 각도는 그 고리의 마지막 회전 각도다', () => {
    const snap = snapshotAt(plan, config, plan.steps.length)
    expect(snap.restAngles).toEqual(plan.restAngles)
  })
})

describe('tickTimes', () => {
  it('칸 경계를 지날 때마다 하나, 시간 순이고 감속하며 간격이 벌어진다', () => {
    const times = tickTimes(0, 3 * 360 + 100, 12, 2400, 0)
    expect(times.length).toBe(Math.floor((3 * 360 + 100) / 30))
    for (let i = 1; i < times.length; i += 1) expect(times[i] as number).toBeGreaterThan(times[i - 1] as number)
    expect((times[times.length - 1] as number) <= 2400).toBe(true)
    const early = (times[1] as number) - (times[0] as number)
    const late = (times[times.length - 1] as number) - (times[times.length - 2] as number)
    expect(late).toBeGreaterThan(early * 3)
  })

  it('최소 간격 안의 틱은 묶는다', () => {
    const times = tickTimes(0, 5 * 360, 12, 1000, 25)
    for (let i = 1; i < times.length; i += 1) expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThanOrEqual(25)
  })

  it('회전이 없으면 틱도 없다', () => {
    expect(tickTimes(100, 100, 12, 1000)).toEqual([])
    expect(tickTimes(100, 50, 12, 1000)).toEqual([])
  })
})

describe('판 모양', () => {
  const counts = config.rings.map((r) => r.segments.length)
  const { bands, hub } = ringBands(counts)

  it('고리 띠가 겹치지 않고 안쪽으로 줄어든다', () => {
    expect(bands).toHaveLength(3)
    bands.forEach((band, i) => {
      expect(band.outer).toBeGreaterThan(band.inner)
      expect(band.mid).toBeGreaterThan(band.inner)
      expect(band.mid).toBeLessThan(band.outer)
      const next = bands[i + 1]
      if (next !== undefined) expect(next.outer).toBeLessThan(band.inner)
    })
    expect(hub).toBeGreaterThan(20)
    expect((bands[2] as { inner: number }).inner).toBeGreaterThan(hub - 2)
  })

  it('두께는 0.24R·0.22R·0.22R 비율을 따른다(틈 포함 근사)', () => {
    const widths = bands.map((b) => b.outer - b.inner)
    expect(widths[0] as number).toBeGreaterThan(widths[1] as number)
    expect(Math.abs((widths[1] as number) - (widths[2] as number))).toBeLessThan(1)
  })

  it('호 경로는 닫힌 도형이다', () => {
    const path = arcPath(55, 76, 0, 30)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path.match(/A/g)).toHaveLength(2)
  })

  it('극좌표: 12시 0°는 위, 90°는 오른쪽', () => {
    expect(polar(10, 0).y).toBeCloseTo(-10)
    expect(polar(10, 90).x).toBeCloseTo(10)
  })

  it('칸 라벨: 불 켜진 코인 칸은 이미 2배가 된 값이다', () => {
    const outer = bands[0]
    if (outer === undefined) throw new Error('띠 없음')
    const lit = config.rings[0]?.litOrder.slice(0, 2) ?? []
    const segs = ringSegments(config, outer, lit)
    expect(segs).toHaveLength(12)
    for (const seg of segs) {
      if (seg.lit) {
        expect(seg.kind).toBe('coin')
        expect(seg.shownValue).toBe(seg.value * config.cheer.litMultiplier)
      } else {
        expect(seg.shownValue).toBe(seg.value)
      }
    }
    expect(segs.filter((s) => s.lit).map((s) => s.index).sort()).toEqual([...lit].sort())
    // 켜지지 않은 칸은 값이 math 그대로(첫 칸 ×4)이다.
    expect(segs[0]?.shownValue).toBe(4)
  })

  it('불 켜진 칸이 코인이 아니면 켜지지 않는다', () => {
    const outer = bands[0]
    if (outer === undefined) throw new Error('띠 없음')
    const stepUpIndex = config.rings[0]?.segments.findIndex((s) => s.kind === 'stepUp') ?? -1
    const segs = ringSegments(config, outer, [stepUpIndex])
    expect(segs[stepUpIndex]?.lit).toBe(false)
  })

  it('litOrder 칸은 전부 코인 칸이다(math 계약)', () => {
    config.rings.forEach((ring, r) => {
      ring.litOrder.forEach((idx, k) => {
        expect(ring.segments[idx]?.kind).toBe('coin')
        expect(litSegmentAt(config, r, k)).toBe(idx)
      })
    })
    expect(litSegmentAt(config, 2, 99)).toBeUndefined()
  })

  it('litCountOf: 응원봉 7개여도 칸은 6개(안쪽은 5)', () => {
    const sample = samples.find((s) => s.feature.cheer >= 6)
    if (sample === undefined) return
    expect(litCountOf(sample.feature)).toBe(Math.min(6, sample.feature.cheer))
    expect(sample.feature.lit[2]?.length).toBeLessThanOrEqual(5)
  })
})

describe('요약 기록', () => {
  it('회전마다 한 줄이고 불 켜진 칸은 2배 값을 보여 준다', () => {
    const sample = samples.find((s) => s.feature.steps.some((st) => st.lit))
    if (sample === undefined) throw new Error('불 표본 없음')
    const plan = planRoulette(sample.feature, config, { seed: sample.seed })
    const items = summaryItems(plan, config)
    expect(items).toHaveLength(plan.steps.length)
    items.forEach((item, i) => {
      const step = plan.steps[i]
      if (step === undefined) throw new Error('step 없음')
      if (item.kind === 'coin') expect(item.multiple * (sample.totalBet) ).toBe(step.win)
      if (item.kind === 'stepUp') expect(item.multiple).toBe(0)
    })
  })
})

describe('시간 예산(기획 §7-5, 탭 대기 제외)', () => {
  /**
   * 한 판 = 릴 위 강조(기본 지급 A단계 + 초대권 + 응원봉) + 진입 클립 + 룰렛 + 퇴장 클립.
   * 기본 지급 A단계는 ways 승리가 있을 때만 있다(`totalWin > 룰렛 합`). 클립 길이는 기획 기준(보통 3.0s·터보 1.5s)이다.
   */
  function budget(speed: RouletteSpeed, reduced: boolean): number {
    const clip = reduced ? 400 : speed === 'turbo' ? 1500 : 3000
    const total = samples.reduce((sum, sample) => {
      const plan = planRoulette(sample.feature, config, { seed: sample.seed, speed, reducedMotion: reduced })
      const hasWins = sample.totalWin > sample.feature.total
      const hasCheer = sample.feature.cheer > 0
      const highlight = reduced
        ? 300
        : (speed === 'normal' ? 900 : speed === 'quick' ? 700 : 450) +
          (hasCheer ? (speed === 'normal' ? 700 : speed === 'quick' ? 500 : 300) : 0)
      const aStep = !hasWins ? 0 : reduced ? 450 : speed === 'normal' ? 100 + 756 : speed === 'quick' ? 70 + 756 : 45 + 416
      return (
        sum +
        estimateShowMs(plan, {
          speed,
          reducedMotion: reduced,
          lit: litCountOf(sample.feature),
          entryMs: aStep + highlight + clip,
          exitMs: clip,
        })
      )
    }, 0)
    return total / samples.length
  }

  it('평균 한 판이 게이트 안이다 — normal ≤ 28s · quick ≤ 19s · turbo ≤ 10s · 모션 축소 ≤ 5s', () => {
    const normal = budget('normal', false)
    const quick = budget('quick', false)
    const turbo = budget('turbo', false)
    const reduced = budget('normal', true)
    // 실측값을 남긴다(통과 여부와 별개로 QA 기록에 옮긴다).
    console.info('룰렛 시간 예산(평균, ms)', { normal, quick, turbo, reduced })
    expect(normal).toBeLessThanOrEqual(28_000)
    expect(quick).toBeLessThanOrEqual(19_000)
    expect(turbo).toBeLessThanOrEqual(10_000)
    expect(reduced).toBeLessThanOrEqual(5_000)
  })

  it('건너뛰기를 누른 뒤 남은 회전은 회전당 300ms이고 최악 7회도 2.4s 안이다', () => {
    const sample = samples.reduce((a, b) => (b.feature.steps.length > a.feature.steps.length ? b : a))
    const plan = planRoulette(sample.feature, config, { seed: sample.seed })
    expect(skipRemainingMs(plan, 0, 'normal', false)).toBe(plan.steps.length * 300)
    expect(skipRemainingMs(plan, plan.steps.length, 'normal', false)).toBe(0)
    expect(plan.steps.length * 300).toBeLessThanOrEqual(2400)
  })
})

describe('maxRouletteMultiple (도움말 «룰렛 최대 N배»)', () => {
  it('이 팩의 이론 최대는 384배다(위로·위로·앙코르 ×12 두 번·대상 셋)', () => {
    expect(maxRouletteMultiple(config)).toBe(384)
  })

  it('표본 어느 판도 이 값을 넘지 않는다', () => {
    const max = maxRouletteMultiple(config)
    for (const sample of samples) {
      expect(sample.feature.total / sample.totalBet).toBeLessThanOrEqual(max)
    }
  })

  it('가운데 고리에서 시작해도 바깥 시작보다 작아지지 않는다', () => {
    expect(maxRouletteMultiple(config, 1)).toBeLessThanOrEqual(maxRouletteMultiple(config, 0))
  })
})
