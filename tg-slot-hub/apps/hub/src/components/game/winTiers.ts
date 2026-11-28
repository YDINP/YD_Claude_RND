/**
 * 승리 축하 연출의 "순수한 부분" — 등급 판정, 타임라인, 롤업 값, 파티클 배치.
 * 여기엔 React도 타이머도 DOM도 없다. 표현 컴포넌트(`WinCelebration.tsx`)는 이 함수들이 계산해 준
 * 결과를 재생만 한다(부작용은 컴포넌트 쪽 useEffect 하나씩에 몰아둔다 — `gambleToss.ts`와 같은 모양).
 *
 * 이 표 하나가 **일반 스핀의 빅윈 오버레이와 프리스핀 종료 팝업 양쪽**을 먹인다. 같은 배수에
 * 같은 이름·같은 색이 나오지 않으면 사용자는 두 화면을 다른 게임으로 읽는다.
 *
 * 다만 **길이는 화면마다 다르다**: 프리스핀 종료 팝업은 등급이 정하는 롤업 하나로 끝나고
 * (`celebrationTiming`), 빅윈 오버레이는 금액이 길이를 정하는 세 박자다(`bigWinTimeline`) —
 * 사용자가 "당첨금액에 비례해서 길게"를 요구한 곳이 후자다.
 */
import type { CelebrationLabel } from '@tgslot/game-sdk'
import type { Locale } from '@tgslot/shared'
import { ROUND_POPUP_AUTO_CLOSE_MS } from '../../game/roundFlow'
import {
  celebrationParticleCount,
  planCelebrationParticles,
  type CelebrationParticleLook,
  type ResolvedCelebrationSkin,
} from '@tgslot/renderer'

// 베팅 대비 당첨 단계(under~great)는 렌더러가 정한다. 허브가 렌더러 상수를 직접 들고 다니지 않게 여기서 다시 내보낸다.
export { winBandFor, floorMultipleLabel, type WinBand } from '@tgslot/renderer'

/**
 * 축하 등급. 인덱스가 곧 강도이자 결이다 —
 * surge(큰 당첨, 밀려 올라옴) → blast(엄청난 당첨, 터짐) → storm(전설 당첨, 휘몰아침) → cataclysm(최고 당첨, 뒤흔듦).
 * 키 이름은 내부 식별자다. 화면 이름은 i18n(`winTier*`)이 정한다.
 * `none`은 "축하할 일이 아니다"라는 뜻이고, 일반 스핀에서는 **아무것도 띄우지 않는다**
 * (작은 당첨은 WinStrip만으로 충분하다).
 */
export type CelebrationTier = 'none' | 'surge' | 'blast' | 'storm' | 'cataclysm'

/** 이름이 붙는 등급만. 게임팩 라벨 오버라이드의 키이기도 하다. */
export type NamedTier = Exclude<CelebrationTier, 'none'>

export const CELEBRATION_TIERS: readonly CelebrationTier[] = ['none', 'surge', 'blast', 'storm', 'cataclysm']
export const NAMED_TIERS: readonly NamedTier[] = ['surge', 'blast', 'storm', 'cataclysm']

/**
 * 등급 경계(총 획득 ÷ 총 베팅). `docs/REFERENCE_PRAGMATIC.md`의 표와 같은 값이고,
 * 릴 위 코인 버스트를 터뜨리는 렌더러의 `WIN_TIER_MULTIPLIERS`와도 같아야 한다 — 한 판의 등급이
 * 화면 두 곳에서 갈리면(캔버스는 터지는데 오버레이는 안 뜬다) 사용자는 어느 쪽을 믿을지 알 수 없다.
 * 렌더러 상수를 직접 import하지 않는 건 이 모듈을 PIXI 의존성 없이 두기 위해서다.
 */
export const CELEBRATION_TIER_MULTIPLIERS = { surge: 10, blast: 20, storm: 50, cataclysm: 100 } as const

/**
 * 이번 당첨의 등급.
 *
 * **분모(총 베팅)를 모르면 등급을 올리지 않는다.** 베팅을 짐작해서 STORM을 띄우면 소액 판이
 * 대박처럼 보이고, 반대면 진짜 대박이 조용히 지나간다 — 모를 땐 'none'이 정답이다.
 */
export function celebrationTier(totalWin: number, totalBet?: number): CelebrationTier {
  if (totalBet === undefined || totalBet <= 0 || totalWin <= 0) return 'none'
  const multiple = totalWin / totalBet
  if (multiple >= CELEBRATION_TIER_MULTIPLIERS.cataclysm) return 'cataclysm'
  if (multiple >= CELEBRATION_TIER_MULTIPLIERS.storm) return 'storm'
  if (multiple >= CELEBRATION_TIER_MULTIPLIERS.blast) return 'blast'
  if (multiple >= CELEBRATION_TIER_MULTIPLIERS.surge) return 'surge'
  return 'none'
}

/**
 * 게임팩이 `theme.json`으로 덮어쓴 등급 이름. 주어진 것만 갈아 끼우는 널 오브젝트라
 * 빠진 등급은 허브 기본값(i18n)을 그대로 쓴다 — 서부극이 `storm`만 "STAMPEDE"로 바꿔도 된다.
 */
export type WinTierLabels = Partial<Record<NamedTier, CelebrationLabel>>

/**
 * 게임팩 라벨이 있으면 그것, 없으면 null(호출부가 i18n 기본값으로 떨어진다).
 * `{ ko, en }` 라벨은 화면 언어 → en → ko 순으로 고른다. 문자열 라벨은 언어와 무관하게 그대로 쓴다.
 */
export function overrideLabel(tier: CelebrationTier, labels?: WinTierLabels, locale: Locale = 'en'): string | null {
  if (tier === 'none' || labels === undefined) return null
  const label = labels[tier]
  if (label === undefined) return null
  const picked = typeof label === 'string' ? label : (label[locale] ?? label.en ?? label.ko)
  return picked !== undefined && picked.trim() !== '' ? picked : null
}

// ---- 타임라인 ----

/** 금액이 굴러 올라가는 시간(ms). 등급이 오를수록 더 오래 뜸을 들인다. */
export const ROLLUP_MS_BY_TIER: Record<CelebrationTier, number> = {
  none: 1200,
  surge: 1400,
  blast: 1600,
  storm: 1800,
  cataclysm: 2000,
}

/**
 * 오토스핀·프리스핀이 도는 동안의 배율. 축하는 그대로 뜨되 **판 사이를 막지 않도록**
 * 타임라인 전체(롤업·강조)를 같은 비율로 줄인다. 롤업만 줄이면 다 굴러가기도 전에
 * 강조가 시작되고, 강조만 줄이면 숫자를 읽을 시간이 사라진다.
 */
export const HURRIED_SCALE = 0.5

/** 모션 줄이기일 때의 롤업 길이(ms). 0이 아닌 이유는 "올라간다"는 사실 자체가 정보이기 때문이다. */
export const REDUCED_ROLLUP_MS = 300

/** 진입 팝업의 스핀 수 카운트업 길이(ms) — 금액이 아니라 등급 개념이 없다. */
export const COUNT_UP_MS = 600

/** rAF가 멈춘 탭/환경에서도 최종 값을 맞추는 안전장치의 여유(ms). */
export const ROLLUP_BACKSTOP_MS = 150

export interface TimingInput {
  /** 오토스핀 또는 프리스핀 진행 중 — 전체 타임라인을 절반으로 줄인다. */
  readonly hurried?: boolean
  readonly reducedMotion?: boolean
}

export interface CelebrationTiming {
  readonly rollupMs: number
}

/**
 * 등급이 정하는 롤업 길이 — **프리스핀 종료 팝업 전용**이다. 그쪽은 세션 총액을 한 번 보여주고
 * 사용자가 닫는 화면이라 금액에 맞춰 길이를 늘일 이유가 없다.
 *
 * 일반 스핀의 빅윈 오버레이는 이걸 쓰지 않는다 — 거기서는 **금액이 길이를 정한다**
 * (`bigWinTimeline`). 등급은 결(팔레트·파티클·고리)만 정한다.
 */
export function celebrationTiming(tier: CelebrationTier, input: TimingInput = {}): CelebrationTiming {
  const scale = input.hurried === true ? HURRIED_SCALE : 1
  const base = input.reducedMotion === true ? REDUCED_ROLLUP_MS : ROLLUP_MS_BY_TIER[tier]
  return { rollupMs: Math.round(base * scale) }
}

// ---- 빅윈 오버레이 타임라인 (단계가 승격하며 길어진다) ----

/**
 * 단계 구간 길이(ms, normal). 롤업은 0에서 출발해 **문턱을 하나 넘을 때마다 한 단계씩 승격**한다
 * (큰 당첨 → 엄청난 당첨 → 전설 당첨 → 최고 당첨). 구간마다 시간이 같아 승격이 고르게 찾아온다.
 * 강조 비트(`BIG_WIN_EMPHASIS_MS`)까지 더하면 normal 기준 큰 3.0s / 엄청난 4.5s / 전설 6.0s / 최고 7.5s.
 */
export const BIG_WIN_STAGE_MS: Readonly<Record<NamedTier, number>> = {
  surge: 1800,
  blast: 1500,
  storm: 1500,
  cataclysm: 1500,
}

/**
 * 목표 금액에 닿은 뒤의 강조 비트(ms). 여기가 "얼마를 땄다"가 확정되는 순간이다.
 * 승격 연출이 롤업 안에서 이미 몇 번 터지므로 한 호흡(1.2초)으로 줄였다.
 */
export const BIG_WIN_EMPHASIS_MS = 1200

/** 스핀 속도별 배율. quick은 조금, turbo는 절반으로 줄인다. 오토·프리스핀(hurried)과 겹치면 더 짧은 쪽. */
export const BIG_WIN_SPEED_SCALE = { normal: 1, quick: 0.75, turbo: 0.5 } as const

export type BigWinSpeed = keyof typeof BIG_WIN_SPEED_SCALE

export interface BigWinTimingInput extends TimingInput {
  readonly speed?: BigWinSpeed
}

/**
 * 오토스핀·프리스핀이 도는 동안의 결과 화면 유지 시간(ms). 10초 계약(ROUND_POPUP_AUTO_CLOSE_MS)은
 * **사용자가 지금 화면의 주인일 때**의 약속이다 — 자동으로 도는 중에 10초를 붙들면 판 간격이
 * 20초를 넘겨 "진행이 멈춘 것처럼 보인다"는 예전 결함이 그대로 되살아난다. 그래서 이 구간에서는
 * 결과를 확인할 최소한의 틈만 남기고(0.9초) 곧장 다음 판으로 넘어간다. 사용자는 언제든 탭해서
 * 더 빨리 닫을 수 있고, 반대로 오토스핀을 멈추면 다음 판부터는 다시 10초를 받는다.
 */
export const BIG_WIN_HURRIED_HOLD_MS = 900

/** 롤업 한 구간. 이 구간 동안 화면 단계는 `tier`이고 금액은 `from`→`to`로 오른다. */
export interface BigWinStage {
  readonly tier: NamedTier
  readonly from: number
  readonly to: number
  readonly startMs: number
  readonly endMs: number
}

/** 빅윈 오버레이의 세 박자. 순서대로 굴리고(rollup) → 못 박고(emphasis) → 붙든다(hold). */
export interface BigWinTimeline {
  readonly rollupMs: number
  /** 목표에 닿은 «그 순간»부터 재는 강조 비트. */
  readonly emphasisMs: number
  /** 강조가 끝난 뒤 자동으로 닫히기까지. 그 전에 탭하면 바로 닫힌다. */
  readonly holdMs: number
}

function bigWinScale(input: BigWinTimingInput): number {
  const speed = BIG_WIN_SPEED_SCALE[input.speed ?? 'normal'] ?? 1
  return Math.min(speed, input.hurried === true ? HURRIED_SCALE : 1)
}

/**
 * 롤업 구간표. 최종 등급까지의 단계를 차례로 밟는다 — 각 구간의 끝이 다음 단계의 문턱(베팅 × 배수)이다.
 * 모션 줄이기면 승격 없이 최종 단계 한 구간(짧은 롤업)만 둔다 — 숫자만 보여 준다.
 * 10× 미만이거나 베팅을 모르면 빈 배열(오버레이가 뜨지 않는다).
 */
export function bigWinStages(totalWin: number, totalBet: number, input: BigWinTimingInput = {}): BigWinStage[] {
  const final = celebrationTier(totalWin, totalBet)
  if (final === 'none') return []
  if (input.reducedMotion === true) {
    return [{ tier: final, from: 0, to: totalWin, startMs: 0, endMs: REDUCED_ROLLUP_MS }]
  }
  const scale = bigWinScale(input)
  const tiers = NAMED_TIERS.slice(0, NAMED_TIERS.indexOf(final) + 1)
  const stages: BigWinStage[] = []
  let at = 0
  tiers.forEach((tier, i) => {
    const next = tiers[i + 1]
    const from = i === 0 ? 0 : CELEBRATION_TIER_MULTIPLIERS[tier] * totalBet
    const to = next === undefined ? totalWin : CELEBRATION_TIER_MULTIPLIERS[next] * totalBet
    const ms = Math.round(BIG_WIN_STAGE_MS[tier] * scale)
    stages.push({ tier, from, to, startMs: at, endMs: at + ms })
    at += ms
  })
  return stages
}

/**
 * 롤업 `elapsedMs` 시점의 금액. 중간 구간은 문턱 앞에서 살짝 숨을 고르는 곡선(smoothstep)이라
 * 문턱을 넘는 순간의 승격이 또렷하고, 마지막 구간은 감속(ease-out)하며 목표에 앉는다.
 */
export function stagedRollupValue(stages: readonly BigWinStage[], elapsedMs: number): number {
  const last = stages[stages.length - 1]
  if (last === undefined) return 0
  if (elapsedMs >= last.endMs) return last.to
  const stage = stages.find((s) => elapsedMs < s.endMs) ?? last
  const span = Math.max(1, stage.endMs - stage.startMs)
  const p = Math.min(1, Math.max(0, (elapsedMs - stage.startMs) / span))
  const eased = stage === last ? 1 - Math.pow(1 - p, 3) : p * p * (3 - 2 * p)
  return Math.round(stage.from + (stage.to - stage.from) * eased)
}

/** 지금 금액이 몇 번째 단계인가(0부터). 문턱(`from`)에 닿으면 그 단계다. */
export function stageIndexForValue(stages: readonly BigWinStage[], value: number): number {
  let index = 0
  stages.forEach((stage, i) => {
    if (i > 0 && value >= stage.from) index = i
  })
  return index
}

/**
 * 이번 빅윈 오버레이의 세 박자. 롤업 = 구간표 끝, 강조는 같은 배율로 줄고, 붙드는 시간은 서두를 때만 짧다.
 */
export function bigWinTimeline(
  totalWin: number,
  totalBet: number,
  input: BigWinTimingInput = {},
): BigWinTimeline {
  const stages = bigWinStages(totalWin, totalBet, input)
  const rollupMs = stages[stages.length - 1]?.endMs ?? (input.reducedMotion === true ? REDUCED_ROLLUP_MS : BIG_WIN_STAGE_MS.surge)
  const scale = input.reducedMotion === true ? 1 : bigWinScale(input)
  return {
    rollupMs,
    emphasisMs: Math.round(BIG_WIN_EMPHASIS_MS * scale),
    holdMs: input.hurried === true ? BIG_WIN_HURRIED_HOLD_MS : ROUND_POPUP_AUTO_CLOSE_MS,
  }
}

/** 진입 팝업의 카운트업 길이(ms). */
export function countUpMs(reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_ROLLUP_MS : COUNT_UP_MS
}

/**
 * 롤업 중간값. 항상 0에서 출발해 ease-out(cubic)으로 감속하며 차오른다 —
 * 초반에 빠르게 자릿수가 늘고 끝에서 천천히 붙는 게 "얼마인지" 읽히는 리듬이다.
 */
export function rollupValue(to: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return Math.round(to * (1 - Math.pow(1 - p, 3)))
}

/**
 * 자릿수. 롤업 중 이 값이 바뀌는 순간(9→10, 99→100)에만 숫자를 톡 튕긴다 —
 * 매 프레임 튕기면 그건 진동이지 강조가 아니다.
 */
export function digitCount(value: number): number {
  return Math.max(1, Math.abs(Math.trunc(value))).toString().length
}

// ---- 파티클 ----

/**
 * 황금비 켤레(0.618…)로 가로 위치를 흩는다 — 앞에서부터 몇 개를 잘라 써도 화면 폭에 고르게
 * 퍼지므로, 등급마다 코인을 새로 만들 필요 없이 **하나의 배열을 접두사로 나눠 쓸 수 있다**
 * (`gambleToss.ts`가 황금각으로 하는 것과 같은 수법이다).
 */
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895
const GOLDEN_ANGLE = 137.508

/** 코인 한 닢. 값은 전부 CSS 커스텀 속성으로 넘어간다(올라갈지 떨어질지는 CSS가 정한다). */
export interface ShowerCoin {
  /** 가로 위치(%) */
  readonly left: number
  /** 출발까지의 지연(ms) */
  readonly delay: number
  /** 한 번 지나가는 데 걸리는 시간(ms) */
  readonly duration: number
  /** 지나가며 옆으로 밀리는 폭(px, 부호가 방향) */
  readonly drift: number
  /** 지름(px) */
  readonly size: number
  /** 회전량(deg, 부호가 방향) */
  readonly spin: number
}

/**
 * 등급별 코인 수. `none`은 일반 스핀에서는 쓰이지 않고(오버레이 자체가 안 뜬다)
 * 프리스핀 종료 팝업이 배수 없이 끝났을 때의 소박한 축하에만 쓰인다.
 */
export const SHOWER_COUNT_BY_TIER: Record<CelebrationTier, number> = {
  none: 12,
  surge: 16,
  blast: 20,
  storm: 24,
  cataclysm: 28,
}

const ALL_SHOWER_COINS: readonly ShowerCoin[] = Array.from(
  { length: SHOWER_COUNT_BY_TIER.cataclysm },
  (_, i) => ({
    left: Number((((i * GOLDEN_RATIO_CONJUGATE) % 1) * 100).toFixed(1)),
    delay: (i % 7) * 130,
    duration: 1500 + (i % 4) * 260,
    drift: ((i % 5) - 2) * 11,
    size: 13 + (i % 3) * 5,
    spin: (i % 2 === 0 ? 1 : -1) * (240 + (i % 3) * 120),
  }),
)

/** 등급별 접두사를 모듈 로드 시 한 번만 만들어 둔다 — 렌더마다 새 배열을 만들지 않는다. */
const SHOWER_BY_TIER: Record<CelebrationTier, readonly ShowerCoin[]> = {
  none: ALL_SHOWER_COINS.slice(0, SHOWER_COUNT_BY_TIER.none),
  surge: ALL_SHOWER_COINS.slice(0, SHOWER_COUNT_BY_TIER.surge),
  blast: ALL_SHOWER_COINS.slice(0, SHOWER_COUNT_BY_TIER.blast),
  storm: ALL_SHOWER_COINS.slice(0, SHOWER_COUNT_BY_TIER.storm),
  cataclysm: ALL_SHOWER_COINS,
}

/** 등급에 해당하는 코인 배열. 같은 등급이면 **항상 같은 배열 참조**를 돌려준다. */
export function showerCoins(tier: CelebrationTier): readonly ShowerCoin[] {
  return SHOWER_BY_TIER[tier] ?? SHOWER_BY_TIER.none
}

/**
 * 충격파 고리 수. SURGE는 아래에서 밀려 올라오는 결이라 고리가 어울리지 않아 0이고,
 * BLAST부터 중앙에서 터지기 시작한다.
 */
export const SHOCKWAVE_COUNT_BY_TIER: Record<CelebrationTier, number> = {
  none: 0,
  surge: 0,
  blast: 2,
  storm: 2,
  cataclysm: 3,
}

/** 고리별 출발 지연(ms). 코인과 같은 이유로 한 벌만 만들어 접두사로 나눠 쓴다. */
const ALL_SHOCKWAVES: readonly number[] = [0, 220, 440]

const SHOCKWAVE_BY_TIER: Record<CelebrationTier, readonly number[]> = {
  none: [],
  surge: [],
  blast: ALL_SHOCKWAVES.slice(0, SHOCKWAVE_COUNT_BY_TIER.blast),
  storm: ALL_SHOCKWAVES.slice(0, SHOCKWAVE_COUNT_BY_TIER.storm),
  cataclysm: ALL_SHOCKWAVES,
}

export function shockwaveDelays(tier: CelebrationTier): readonly number[] {
  return SHOCKWAVE_BY_TIER[tier] ?? SHOCKWAVE_BY_TIER.none
}

/** 진입 팝업에서 숫자 주위로 튀는 반짝임 한 점. */
export interface Sparkle {
  readonly angle: number
  readonly distance: number
  readonly delay: number
  readonly size: number
}

export const SPARKLE_COUNT = 10

/** 진입 팝업의 반짝임 — 등급 구분이 없으니 통째로 한 벌만 만들어 재사용한다. */
export const ENTRY_SPARKLES: readonly Sparkle[] = Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
  angle: Number(((i * GOLDEN_ANGLE) % 360).toFixed(1)),
  distance: 46 + (i % 3) * 18,
  delay: (i % 5) * 90,
  size: 5 + (i % 3) * 2,
}))

// ---- 게임 스킨 파티클 ----

/** 샤워 한 알 — 자리·타이밍은 금화와 같고, 겉모습(모양·색·심볼)은 게임 스킨이 정한다. */
export interface ShowerParticle extends ShowerCoin {
  readonly look: CelebrationParticleLook
}

/** 밀도 배수가 커도 화면을 덮지 않는 상한. 기본 최고 등급(28)의 두 배다. */
export const MAX_SHOWER_PARTICLES = SHOWER_COUNT_BY_TIER.cataclysm * 2

function showerSlot(i: number): ShowerCoin {
  return (
    ALL_SHOWER_COINS[i] ?? {
      left: Number((((i * GOLDEN_RATIO_CONJUGATE) % 1) * 100).toFixed(1)),
      delay: (i % 7) * 130 + 60,
      duration: 1500 + (i % 4) * 260,
      drift: ((i % 5) - 2) * 11,
      size: 13 + (i % 3) * 5,
      spin: (i % 2 === 0 ? 1 : -1) * (240 + (i % 3) * 120),
    }
  )
}

const SHOWER_PARTICLES = new WeakMap<ResolvedCelebrationSkin, Map<CelebrationTier, readonly ShowerParticle[]>>()

/**
 * 스킨을 입힌 샤워. 개수 = 등급 기본 수 × 스킨 밀도, 자리는 `showerCoins`와 같은 황금비 배치다.
 * 같은 스킨·같은 등급이면 **같은 배열 참조**를 돌려준다(롤업 프레임마다 새로 만들지 않는다).
 */
export function showerParticles(skin: ResolvedCelebrationSkin, tier: CelebrationTier): readonly ShowerParticle[] {
  let byTier = SHOWER_PARTICLES.get(skin)
  if (byTier === undefined) {
    byTier = new Map()
    SHOWER_PARTICLES.set(skin, byTier)
  }
  const cached = byTier.get(tier)
  if (cached !== undefined) return cached
  const count = celebrationParticleCount(skin, tier, SHOWER_COUNT_BY_TIER[tier], MAX_SHOWER_PARTICLES)
  const scale = skin.particles.size
  const particles = planCelebrationParticles(skin, tier, count).map((look, i) => {
    const slot = showerSlot(i)
    return { ...slot, size: Math.round(slot.size * scale), look }
  })
  byTier.set(tier, particles)
  return particles
}

// ---- 동전 분수 (빅윈 오버레이) ----

/** 화면 바닥 가운데서 솟구쳤다 떨어지는 동전 한 닢. 값은 CSS 커스텀 속성으로 넘어간다. */
export interface FountainCoin {
  /** 옆으로 날아가는 거리(vw, 부호가 방향) */
  readonly dx: number
  /** 솟는 높이(vh) */
  readonly rise: number
  readonly delay: number
  readonly duration: number
  readonly size: number
}

/** 등급별 분수 동전 수. 높을수록 빽빽하다. */
export const FOUNTAIN_COUNT_BY_TIER: Record<CelebrationTier, number> = {
  none: 0,
  surge: 10,
  blast: 16,
  storm: 22,
  cataclysm: 30,
}

const ALL_FOUNTAIN: readonly FountainCoin[] = Array.from({ length: FOUNTAIN_COUNT_BY_TIER.cataclysm }, (_, i) => {
  const side = ((i * GOLDEN_RATIO_CONJUGATE) % 1) * 2 - 1
  return {
    dx: Number((side * 42).toFixed(1)),
    rise: 52 + (i % 5) * 7,
    delay: (i % 9) * 110,
    duration: 1300 + (i % 4) * 170,
    size: 14 + (i % 3) * 5,
  }
})

const FOUNTAIN_BY_TIER: Record<CelebrationTier, readonly FountainCoin[]> = {
  none: [],
  surge: ALL_FOUNTAIN.slice(0, FOUNTAIN_COUNT_BY_TIER.surge),
  blast: ALL_FOUNTAIN.slice(0, FOUNTAIN_COUNT_BY_TIER.blast),
  storm: ALL_FOUNTAIN.slice(0, FOUNTAIN_COUNT_BY_TIER.storm),
  cataclysm: ALL_FOUNTAIN,
}

/** 등급별 분수. 한 벌을 모듈 로드 때 만들어 접두사로 나눠 쓴다(같은 등급이면 같은 배열 참조). */
export function fountainCoins(tier: CelebrationTier): readonly FountainCoin[] {
  return FOUNTAIN_BY_TIER[tier] ?? FOUNTAIN_BY_TIER.none
}

/** 고리 `count`개의 출발 지연. 스킨이 등급별 고리 수를 바꿀 수 있어 수로 묻는다. */
export function shockwaveDelaysFor(count: number): readonly number[] {
  return ALL_SHOCKWAVES.slice(0, Math.max(0, Math.min(ALL_SHOCKWAVES.length, count)))
}
