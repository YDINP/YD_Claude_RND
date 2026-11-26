/**
 * 무대 룰렛 연출 계획 — 서버가 정한 결과(`StageRouletteFeature`)를 화면에서 어떻게 보여 줄지 정하는 순수 함수 모음.
 *
 * 규칙은 하나다: **결과는 이미 정해져 있다.** 탭·STOP·건너뛰기는 시간만 바꾸고 칸·금액은 바꾸지 못한다.
 * 그래서 여기서는 칸마다 어느 각도에 멈출지, 몇 초 걸릴지, 합계가 어떻게 쌓이는지를 입력만으로 정한다.
 * 같은 피처 + 같은 시드면 항상 같은 계획이다(칸 안 멈춤 위치 지터도 시드 고정).
 *
 * 각도 규칙: 각 고리는 12시(포인터)를 0°로 하고 시계 방향으로 칸이 놓인다. 고리를 시계 방향으로 `R`도 돌리면
 * 포인터는 고리 위의 `-R`도를 가리킨다. 그래서 칸 `s`의 중앙에 서려면 `R ≡ −(s + 0.5 + 지터) × 360/n`이다.
 */
import type { RouletteStep, StageRouletteFeature } from '@tgslot/shared'
import type { StageRouletteConfig } from '@tgslot/slot-engine'

export type RouletteSpeed = 'normal' | 'quick' | 'turbo'
export type RouletteKind = RouletteStep['kind']

export const ROULETTE_KINDS: readonly RouletteKind[] = ['coin', 'stepUp', 'encore', 'grand']

// ------------------------------------------------------------------ 시간표

export interface RouletteTimings {
  /** 회전 한 번(ms). 감속 포함. */
  spinMs: number
  /** 회전 바퀴 수(최소). 모션 축소는 0 — 돌리지 않고 칸으로 점프한다. */
  turns: number
  /** 결과가 정해진 뒤 보여 주는 연출 길이(ms). */
  resultMs: Record<RouletteKind, number>
  /** E5 판이 떠오르는 시간. */
  riseMs: number
  /** E6 불빛 토큰 하나가 세 고리를 켜는 시간. */
  lightMs: number
  /** 요약 카드가 스스로 닫히기까지. */
  summaryMs: number
  /** 탭이 없을 때 자동으로 도는 대기. 기획 R5: 2초. */
  autoSpinWaitMs: number
  /** 회전 중 탭(빠르게 멈춤)이 남은 감속을 줄이는 길이. */
  quickStopMs: number
  /** 건너뛰기 뒤 회전 하나당 길이. */
  skipStepMs: number
  reduced: boolean
}

/**
 * 기획 §7-3 시간표. 회전·결과 연출 값은 기획서 표 그대로이고, quick 회전(1.6→1.5s)·turbo 회전(1.0→0.8s)과
 * quick·turbo·모션 축소의 요약 자동 닫힘(탭하면 바로 닫힌다)만 §7-5 «시간 예산 게이트»(quick ≤ 19s · turbo ≤ 10s · 모션 축소 ≤ 5s)에
 * 맞추려고 조금 줄였다(표의 합계가 게이트와 어긋나 있었다). 시간 예산 테스트가 이 값을 지킨다.
 */
export function rouletteTimings(speed: RouletteSpeed, reducedMotion: boolean): RouletteTimings {
  const common = { autoSpinWaitMs: 2000, quickStopMs: 350, skipStepMs: 300 }
  if (reducedMotion) {
    return {
      ...common,
      spinMs: 350,
      turns: 0,
      resultMs: { coin: 300, stepUp: 300, encore: 300, grand: 600 },
      riseMs: 0,
      lightMs: 0,
      summaryMs: 800,
      reduced: true,
    }
  }
  switch (speed) {
    case 'turbo':
      return {
        ...common,
        spinMs: 800,
        turns: 2,
        resultMs: { coin: 300, stepUp: 500, encore: 400, grand: 1000 },
        riseMs: 150,
        lightMs: 60,
        summaryMs: 600,
        reduced: false,
      }
    case 'quick':
      return {
        ...common,
        spinMs: 1500,
        turns: 2,
        resultMs: { coin: 500, stepUp: 800, encore: 600, grand: 1500 },
        riseMs: 400,
        lightMs: 120,
        summaryMs: 1500,
        reduced: false,
      }
    default:
      return {
        ...common,
        spinMs: 2400,
        turns: 3,
        resultMs: { coin: 700, stepUp: 1100, encore: 900, grand: 2000 },
        riseMs: 500,
        lightMs: 160,
        summaryMs: 2500,
        reduced: false,
      }
  }
}

// ------------------------------------------------------------------ 각도

/** 칸 하나의 호 각도. */
export function sweepDeg(segmentCount: number): number {
  return 360 / segmentCount
}

/** 각도를 [0, 360)으로 접는다. */
export function wrapDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** 고리가 `angle`도 돌아가 멈췄을 때 포인터가 가리키는 칸. 목표 칸 검증과 틱 계산이 같은 식을 쓴다. */
export function segmentAtAngle(segmentCount: number, angle: number): number {
  const index = Math.floor(wrapDeg(-angle) / sweepDeg(segmentCount))
  return Math.min(segmentCount - 1, Math.max(0, index))
}

/** 칸 `segment`의 중앙(+지터)이 포인터에 오는 고리 각도(0~360 접힘). 지터는 칸 폭의 비율이고 ±0.3 안이다. */
export function restAngleFor(segmentCount: number, segment: number, jitter: number): number {
  return wrapDeg(-(segment + 0.5 + jitter) * sweepDeg(segmentCount))
}

/** 시드 문자열 → 32비트 해시(FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 0~1 난수 하나(mulberry32 한 걸음). 같은 시드면 같은 값이다. */
export function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 칸 폭의 ±30% 안 멈춤 위치. */
export const MAX_JITTER = 0.3

/** 감속 곡선: easeOutCubic. 결과 칸으로 단조롭게 느려지고 되돌아오지 않는다. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - (1 - c) ** 3
}

/** 진행도(0~1) → 지금 각도. */
export function angleAt(from: number, to: number, progress: number): number {
  return from + (to - from) * easeOutCubic(progress)
}

/**
 * 포인터가 칸 경계를 지나는 시각(ms) 목록 — 틱 소리용. 회전이 느려질수록 간격이 벌어진다.
 * `minGapMs`보다 가까운 틱은 하나로 묶는다(너무 빠른 구간이 소리를 갈아 버리지 않게).
 */
export function tickTimes(from: number, to: number, segmentCount: number, spinMs: number, minGapMs = 25): number[] {
  const step = sweepDeg(segmentCount)
  const delta = to - from
  if (delta <= 0 || spinMs <= 0) return []
  const first = Math.floor(from / step) + 1
  const last = Math.floor(to / step)
  const times: number[] = []
  for (let k = first; k <= last; k += 1) {
    const progress = (k * step - from) / delta
    const t = 1 - (1 - Math.min(1, Math.max(0, progress))) ** (1 / 3)
    const at = t * spinMs
    const prev = times[times.length - 1]
    if (prev === undefined || at - prev >= minGapMs) times.push(at)
  }
  return times
}

// ------------------------------------------------------------------ 계획

/** 판이 처음 놓이는 각도 — 고리마다 0번 칸 중앙이 포인터에 온다(경계에 걸쳐 시작하면 어색하다). */
export function initialRestAngles(config: StageRouletteConfig): number[] {
  return config.rings.map((ring) => restAngleFor(ring.segments.length, 0, 0))
}

export interface PlannedStep {
  index: number
  ring: number
  segment: number
  kind: RouletteKind
  lit: boolean
  win: number
  encoreCounted: boolean
  /** 이 회전 앞/뒤 남은 돌리기. */
  songsBefore: number
  songsLeft: number
  /** 이 회전 앞/뒤 앙코르 사용 수(곡을 늘린 것만 센다). */
  encoresUsedBefore: number
  encoresUsedAfter: number
  /** 룰렛 합계가 이 회전 앞/뒤에 얼마인가. */
  totalBefore: number
  totalAfter: number
  /** 앞 회전이 «한 단계 위로»였다 — 탭 없이 곧바로 돈다. */
  auto: boolean
  /** 이 회전을 시작하기 전 그 고리가 쉬고 있던 각도(누적, 시계 방향이 +). */
  fromAngle: number
  /** 멈추는 각도. 항상 fromAngle보다 크다. */
  toAngle: number
  /** 칸 안에서 멈추는 위치(칸 폭 비율, 0.5가 정중앙). */
  landing: number
}

export interface RoulettePlan {
  steps: PlannedStep[]
  /** 고리마다 마지막 회전이 끝난 각도(회전이 없던 고리는 처음 놓인 각도). */
  restAngles: number[]
  total: number
  endedBy: StageRouletteFeature['endedBy']
}

export interface PlanOptions {
  /** 지터 시드. 보통 roundId. */
  seed: string
  speed?: RouletteSpeed
  reducedMotion?: boolean
}

/**
 * 서버 결과 → 연출 계획. 각 회전의 도착 각도·합계·남은 돌리기를 전부 미리 계산한다.
 * 결과(칸·금액)는 피처에서 그대로 옮기고, 여기서 정하는 것은 **보이는 방식**뿐이다.
 */
export function planRoulette(
  feature: StageRouletteFeature,
  config: StageRouletteConfig,
  options: PlanOptions,
): RoulettePlan {
  const timings = rouletteTimings(options.speed ?? 'normal', options.reducedMotion === true)
  const rest = initialRestAngles(config)
  const steps: PlannedStep[] = []
  let songs = config.songs
  let encoresUsed = 0
  let total = 0

  feature.steps.forEach((raw, index) => {
    const ring = config.rings[raw.ring]
    if (ring === undefined) throw new RangeError(`룰렛 고리 ${raw.ring}이(가) 없다`)
    const count = ring.segments.length
    const hash = hashSeed(`${options.seed}:${index}`)
    const landing = 0.5 + (seededUnit(hash) * 2 - 1) * MAX_JITTER
    const extra = timings.turns === 0 ? 0 : timings.turns + (seededUnit(hash ^ 0x9e3779b9) < 0.5 ? 0 : 1)
    const fromAngle = rest[raw.ring] ?? 0
    const target = restAngleFor(count, raw.segment, landing - 0.5)
    const forward = wrapDeg(target - fromAngle)
    // 같은 고리를 다시 돌릴 때 거의 제자리면 한 바퀴를 더 돌린다(모션 축소는 점프라 제외).
    const minForward = timings.turns === 0 ? 0 : 20
    const toAngle = fromAngle + extra * 360 + (forward < minForward && timings.turns > 0 ? forward + 360 : forward)
    rest[raw.ring] = toAngle

    const totalBefore = total
    total += raw.win
    const songsBefore = songs
    songs = raw.songsLeft
    const encoresUsedBefore = encoresUsed
    if (raw.kind === 'encore' && raw.encoreCounted) encoresUsed += 1

    steps.push({
      index,
      ring: raw.ring,
      segment: raw.segment,
      kind: raw.kind,
      lit: raw.lit,
      win: raw.win,
      encoreCounted: raw.encoreCounted,
      songsBefore,
      songsLeft: raw.songsLeft,
      encoresUsedBefore,
      encoresUsedAfter: encoresUsed,
      totalBefore,
      totalAfter: total,
      auto: index > 0 && feature.steps[index - 1]?.kind === 'stepUp',
      fromAngle,
      toAngle,
      landing,
    })
  })

  return { steps, restAngles: rest, total, endedBy: feature.endedBy }
}

/** 지금까지(`shown`회전)의 화면 상태 — 새로고침 이어 보기와 진행 중 갱신이 같은 식을 쓴다. */
export interface ShowSnapshot {
  /** 지금 활성 고리(다음에 돌릴 고리). */
  ring: number
  songsLeft: number
  encoresUsed: number
  total: number
  /** 고리마다 쉬고 있는 각도. */
  restAngles: number[]
}

export function snapshotAt(plan: RoulettePlan, config: StageRouletteConfig, shown: number): ShowSnapshot {
  const done = Math.max(0, Math.min(shown, plan.steps.length))
  const rest = initialRestAngles(config)
  let ring = plan.steps[0]?.ring ?? 0
  let songsLeft = config.songs
  let encoresUsed = 0
  let total = 0
  for (let i = 0; i < done; i += 1) {
    const step = plan.steps[i] as PlannedStep
    rest[step.ring] = step.toAngle
    songsLeft = step.songsLeft
    encoresUsed = step.encoresUsedAfter
    total = step.totalAfter
    ring = step.kind === 'stepUp' ? Math.min(step.ring + 1, config.rings.length - 1) : step.ring
  }
  const next = plan.steps[done]
  if (next !== undefined) ring = next.ring
  return { ring, songsLeft, encoresUsed, total, restAngles: rest }
}

/** 시간 예산 검산용 — 탭 대기를 뺀 한 판의 예상 길이(ms). 곡선을 돌리지 않고 합만 낸다. */
export function estimateShowMs(
  plan: RoulettePlan,
  options: { speed: RouletteSpeed; reducedMotion: boolean; lit: number; entryMs: number; exitMs: number },
): number {
  const t = rouletteTimings(options.speed, options.reducedMotion)
  const steps = plan.steps.reduce((sum, step) => sum + t.spinMs + t.resultMs[step.kind], 0)
  return options.entryMs + t.riseMs + t.lightMs * options.lit + steps + t.summaryMs + options.exitMs
}

/** 건너뛰기를 누른 뒤 남은 회전의 길이(ms). */
export function skipRemainingMs(plan: RoulettePlan, shown: number, speed: RouletteSpeed, reducedMotion: boolean): number {
  const t = rouletteTimings(speed, reducedMotion)
  return Math.max(0, plan.steps.length - shown) * t.skipStepMs
}

// ------------------------------------------------------------------ 판 모양

/** viewBox 반폭. 판 반지름은 `WHEEL_R`, 포인터가 바깥으로 삐져나올 여유를 `WHEEL_PAD`만큼 둔다. */
export const WHEEL_R = 100
export const WHEEL_PAD = 8
export const WHEEL_VIEW = WHEEL_R + WHEEL_PAD

export interface RingBand {
  ring: number
  inner: number
  outer: number
  mid: number
  count: number
}

/** 바깥에서 안쪽으로 두께 0.24R·0.22R·0.22R, 사이에 가는 틈. 남은 가운데 원이 합계를 담는다. */
const BAND_WEIGHTS = [0.24, 0.22, 0.22] as const
const BAND_GAP = 0.012

export function ringBands(segmentCounts: readonly number[]): { bands: RingBand[]; hub: number } {
  let outer = WHEEL_R
  const bands = segmentCounts.map((count, ring) => {
    const weight = BAND_WEIGHTS[Math.min(ring, BAND_WEIGHTS.length - 1)] as number
    const inner = outer - weight * WHEEL_R + BAND_GAP * WHEEL_R
    const band: RingBand = { ring, inner, outer: outer - (ring === 0 ? 0 : BAND_GAP * WHEEL_R), mid: 0, count }
    band.mid = (band.inner + band.outer) / 2
    outer = inner - BAND_GAP * WHEEL_R
    return band
  })
  return { bands, hub: Math.max(10, outer + BAND_GAP * WHEEL_R) }
}

/** 극좌표(12시 0°, 시계 방향) → viewBox 좌표. */
export function polar(radius: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) }
}

/** 칸 하나의 호 모양 경로(SVG). 각도는 12시 기준 시계 방향이다. */
export function arcPath(inner: number, outer: number, startDeg: number, endDeg: number): string {
  const a = polar(outer, startDeg)
  const b = polar(outer, endDeg)
  const c = polar(inner, endDeg)
  const d = polar(inner, startDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  const f = (n: number): string => n.toFixed(2)
  return `M${f(a.x)} ${f(a.y)}A${f(outer)} ${f(outer)} 0 ${large} 1 ${f(b.x)} ${f(b.y)}L${f(c.x)} ${f(c.y)}A${f(inner)} ${f(inner)} 0 ${large} 0 ${f(d.x)} ${f(d.y)}Z`
}

export interface WheelSegment {
  ring: number
  index: number
  kind: RouletteKind
  /** math의 원래 값. 위로 칸은 0. */
  value: number
  /** 화면에 쓰는 값 — 불 켜진 코인 칸은 이미 2배가 된 값이다. */
  shownValue: number
  lit: boolean
  path: string
  /** 라벨 중심(viewBox)과 칸 중앙 각도. */
  labelAt: { x: number; y: number }
  midDeg: number
}

/** 고리 하나의 칸 목록. `lit`은 불 켜진 칸 인덱스(점등 진행 중이면 일부만 들어온다). */
export function ringSegments(
  config: StageRouletteConfig,
  band: RingBand,
  lit: readonly number[],
): WheelSegment[] {
  const ring = config.rings[band.ring]
  if (ring === undefined) return []
  const sweep = sweepDeg(ring.segments.length)
  const litSet = new Set(lit)
  return ring.segments.map((segment, index) => {
    const isLit = segment.kind === 'coin' && litSet.has(index)
    const value = 'value' in segment && typeof segment.value === 'number' ? segment.value : 0
    const midDeg = (index + 0.5) * sweep
    return {
      ring: band.ring,
      index,
      kind: segment.kind,
      value,
      shownValue: isLit ? value * config.cheer.litMultiplier : value,
      lit: isLit,
      path: arcPath(band.inner, band.outer, index * sweep + 0.4, (index + 1) * sweep - 0.4),
      labelAt: polar(band.mid, midDeg),
      midDeg,
    }
  })
}

/** 응원봉 불빛이 k번째(0부터)로 켜지는 칸 — 고리마다 `litOrder[k]`. 그 고리에 그만큼 칸이 없으면 undefined. */
export function litSegmentAt(config: StageRouletteConfig, ring: number, k: number): number | undefined {
  return config.rings[ring]?.litOrder[k]
}

/** 실제로 켜지는 불 칸 수(개수와 다를 수 있다 — 응원봉 7개여도 최대 6칸, 안쪽 고리는 5칸). */
export function litCountOf(feature: Pick<StageRouletteFeature, 'lit'>): number {
  return feature.lit.reduce((max, indices) => Math.max(max, indices.length), 0)
}

// ------------------------------------------------------------------ 도움말 수치

/**
 * 한 번의 공연에서 이론상 받을 수 있는 최대 배수(총 베팅 배수). 도움말이 math에서 읽어 쓴다 — 하드코딩 금지.
 * 불 켜진 칸 배율은 `maxLit` 안의 칸에 최대로 적용한 값이다.
 */
export function maxRouletteMultiple(config: StageRouletteConfig, startRing = 0): number {
  const last = config.rings.length - 1
  const maxLit = config.cheer.maxLit
  const prize = (ring: number, index: number): number => {
    const segment = config.rings[ring]?.segments[index]
    if (segment === undefined || !('value' in segment) || typeof segment.value !== 'number') return 0
    if (segment.kind !== 'coin') return segment.value
    const litOrder = config.rings[ring]?.litOrder ?? []
    const lit = litOrder.slice(0, Math.min(maxLit, litOrder.length)).includes(index)
    return lit ? segment.value * config.cheer.litMultiplier : segment.value
  }
  const memo = new Map<string, number>()
  const best = (ring: number, songs: number, encores: number): number => {
    if (songs <= 0) return 0
    const key = `${ring}:${songs}:${encores}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    let top = 0
    config.rings[ring]?.segments.forEach((segment, index) => {
      let value = 0
      if (segment.kind === 'stepUp') {
        value = ring < last ? best(ring + 1, songs, encores) : 0
      } else if (segment.kind === 'encore') {
        value = prize(ring, index) + (encores < config.maxEncores ? best(ring, songs, encores + 1) : best(ring, songs - 1, encores))
      } else {
        value = prize(ring, index) + best(ring, songs - 1, encores)
      }
      if (value > top) top = value
    })
    memo.set(key, top)
    return top
  }
  return best(startRing, config.songs, 0)
}

// ------------------------------------------------------------------ 요약

export interface SummaryItem {
  ring: number
  kind: RouletteKind
  /** 코인·앙코르·대상은 지급액이 아니라 «판 값(불이면 2배 반영)» 배수를 보여 준다. */
  multiple: number
  lit: boolean
  encoreCounted: boolean
  win: number
}

/** 요약 카드의 회전 기록. 배수는 총 베팅으로 나눈 값이라 베팅액이 달라도 같은 모양이다. */
export function summaryItems(plan: RoulettePlan, config: StageRouletteConfig): SummaryItem[] {
  return plan.steps.map((step) => {
    const segment = config.rings[step.ring]?.segments[step.segment]
    const value = segment !== undefined && 'value' in segment && typeof segment.value === 'number' ? segment.value : 0
    return {
      ring: step.ring,
      kind: step.kind,
      multiple: step.lit ? value * config.cheer.litMultiplier : value,
      lit: step.lit,
      encoreCounted: step.encoreCounted,
      win: step.win,
    }
  })
}
