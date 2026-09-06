/**
 * 승리 축하 연출의 "순수한 부분" — 등급 판정, 타임라인, 롤업 값, 파티클 배치.
 * 여기엔 React도 타이머도 DOM도 없다. 표현 컴포넌트(`WinCelebration.tsx`)는 이 함수들이 계산해 준
 * 결과를 재생만 한다(부작용은 컴포넌트 쪽 useEffect 하나씩에 몰아둔다 — `gambleToss.ts`와 같은 모양).
 *
 * 이 표 하나가 **일반 스핀의 빅윈 오버레이와 프리스핀 종료 팝업 양쪽**을 먹인다. 같은 배수에
 * 같은 이름·같은 색·같은 길이가 나오지 않으면 사용자는 두 화면을 다른 게임으로 읽는다.
 */

/**
 * 축하 등급. 인덱스가 곧 강도이자 결이다 —
 * SURGE(밀려 올라옴) → BLAST(터짐) → STORM(휘몰아침) → CATACLYSM(뒤흔듦).
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
export type WinTierLabels = Partial<Record<NamedTier, string>>

/** 게임팩 라벨이 있으면 그것, 없으면 null(호출부가 i18n 기본값으로 떨어진다). */
export function overrideLabel(tier: CelebrationTier, labels?: WinTierLabels): string | null {
  if (tier === 'none' || labels === undefined) return null
  const label = labels[tier]
  return label !== undefined && label.trim() !== '' ? label : null
}

// ---- 타임라인 ----

/**
 * 등급별 화면 체류 시간(ms) — `docs/REFERENCE_PRAGMATIC.md`의 "배너 표시 시간" 표 그대로다.
 * **롤업을 포함한 총 시간**이라 이 값이 지나면 오버레이가 스스로 닫힌다.
 */
export const DISPLAY_MS_BY_TIER: Record<CelebrationTier, number> = {
  none: 0,
  surge: 2000,
  blast: 3000,
  storm: 4500,
  cataclysm: 6500,
}

/** 금액이 굴러 올라가는 시간(ms). 등급이 오를수록 더 오래 뜸을 들인다. */
export const ROLLUP_MS_BY_TIER: Record<CelebrationTier, number> = {
  none: 1200,
  surge: 1400,
  blast: 1600,
  storm: 1800,
  cataclysm: 2000,
}

/** 다 굴러간 뒤 최소한 이만큼은 최종 금액을 볼 수 있어야 한다(ms). */
export const MIN_READ_MS = 600

/**
 * 오토스핀·프리스핀이 도는 동안의 배율. 축하는 그대로 뜨되 **판 사이를 막지 않도록**
 * 타임라인 전체(롤업·체류·읽는 시간)를 같은 비율로 줄인다. 롤업만 줄이면 다 굴러가기도 전에
 * 닫히고, 체류만 줄이면 숫자를 읽을 시간이 사라진다.
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
  /** 마운트부터 자동으로 닫힐 때까지(ms). 0이면 자동으로 닫지 않는다(= 등급 없음). */
  readonly displayMs: number
}

/**
 * 이번 축하의 타임라인.
 *
 * 체류 시간은 표의 값이지만 **롤업 + 읽는 시간**보다 짧아질 수는 없다 — SURGE(2000ms)가
 * 마침 그 하한(1400 + 600)과 정확히 같고, 서두르는 구간에서는 양쪽이 함께 절반이 되어
 * 그 관계가 유지된다.
 */
export function celebrationTiming(tier: CelebrationTier, input: TimingInput = {}): CelebrationTiming {
  const scale = input.hurried === true ? HURRIED_SCALE : 1
  const base = input.reducedMotion === true ? REDUCED_ROLLUP_MS : ROLLUP_MS_BY_TIER[tier]
  const rollupMs = Math.round(base * scale)
  if (tier === 'none') return { rollupMs, displayMs: 0 }
  return {
    rollupMs,
    displayMs: Math.round(Math.max(DISPLAY_MS_BY_TIER[tier] * scale, rollupMs + MIN_READ_MS * scale)),
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
