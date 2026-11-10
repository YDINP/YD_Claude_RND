import type {
  CelebrationFont,
  CelebrationMotion,
  CelebrationRayStyle,
  CelebrationShape,
  CelebrationSkin,
  CelebrationTierKey,
  CelebrationTitle,
  CelebrationWaveStyle,
} from '@tgslot/game-sdk'
import type { WinTier } from './wins.js'

/**
 * 빅윈 축하 스킨의 "순수한 부분" — theme.json의 `celebration`을 기본값 위에 얹어 **완전히 채운
 * 스킨**으로 만들고, 파티클 하나하나의 모양·색을 정한다.
 *
 * 허브 오버레이(CSS)와 렌더러 캔버스 버스트(Pixi)가 이 결과 하나를 함께 읽는다. 모양의 윤곽도
 * 여기 한 벌만 있다(`celebrationShapePoints`) — 허브는 clip-path로, 렌더러는 캔버스 패스로 그린다.
 * 그래서 한 게임의 빅윈은 어디서 터지든 같은 모양·같은 색이다.
 */

/** 축하 단계. `none`은 프리스핀 종료 팝업처럼 등급 없이 축하하는 자리다. */
export type CelebrationLevel = 'none' | CelebrationTierKey

export const CELEBRATION_LEVELS: readonly CelebrationLevel[] = ['none', 'surge', 'blast', 'storm', 'cataclysm']

/** 렌더러 등급 → 축하 등급. 경계 배수(10/20/50/100×)가 같아 1:1로 대응한다. */
const LEVEL_BY_WIN_TIER: Record<WinTier, CelebrationLevel> = {
  none: 'none',
  big: 'surge',
  mega: 'blast',
  epic: 'storm',
  max: 'cataclysm',
}

export function celebrationLevelForWinTier(tier: WinTier): CelebrationLevel {
  return LEVEL_BY_WIN_TIER[tier]
}

export interface ResolvedCelebrationTitle {
  readonly font: CelebrationFont
  /** CSS `font-family` 값 그대로. */
  readonly fontFamily: string
  readonly weight: number
  readonly stroke: number
  readonly strokeColor: string
  /** 금액 글자 채움. 항상 세 칸(위·가운데·아래)이다. */
  readonly gradient: readonly [string, string, string]
  readonly tracking: number
}

export interface ResolvedCelebrationLevel {
  readonly core: string
  readonly edge: string
  readonly glow: string
  readonly rays: number
  readonly raySpinMs: number
  readonly waves: number
  readonly density: number
  readonly title: ResolvedCelebrationTitle
}

/** 파티클 재료 하나. 심볼은 id와 (있으면) 이미지 URL을 함께 싣는다. */
export type CelebrationParticleKind =
  | { readonly kind: 'shape'; readonly shape: CelebrationShape }
  | { readonly kind: 'symbol'; readonly symbol: string; readonly src?: string }

export interface ResolvedCelebrationSkin {
  /** 게임이 스킨을 하나라도 지정했는가. false면 허브 기본 연출 그대로다. */
  readonly custom: boolean
  readonly particles: {
    readonly kinds: readonly CelebrationParticleKind[]
    /** null이면 모양 파티클이 등급 팔레트(core)를 따른다. */
    readonly colors: readonly string[] | null
    readonly motion: CelebrationMotion
    readonly size: number
  }
  readonly rayStyle: CelebrationRayStyle
  readonly waveStyle: CelebrationWaveStyle
  readonly labels: Readonly<Partial<Record<CelebrationTierKey, string>>>
  readonly levels: Readonly<Record<CelebrationLevel, ResolvedCelebrationLevel>>
}

export const CELEBRATION_FONT_FAMILIES: Record<CelebrationFont, string> = {
  sans: 'inherit',
  serif: "Georgia, 'Times New Roman', 'Noto Serif KR', serif",
  slab: "Rockwell, 'Roboto Slab', 'Courier New', serif",
  rounded: "'Arial Rounded MT Bold', 'Nunito', 'Trebuchet MS', system-ui, sans-serif",
}

interface LevelBase {
  readonly core: string
  readonly edge: string
  readonly glow: string
  readonly rays: number
  readonly raySpinMs: number
  readonly waves: number
}

/**
 * 허브 기본 팔레트 — 인덱스가 곧 온도다: 금 → 호박 → 주홍 → 자전(紫電) → 백열.
 * `WinCelebration.css`의 `.hub-tier--*` 값과 같다(스킨이 없는 화면도 같은 색이어야 한다).
 */
export const DEFAULT_CELEBRATION_LEVELS: Readonly<Record<CelebrationLevel, LevelBase>> = {
  none: { core: '#f4d98a', edge: '#d8a94a', glow: '#d8a94a57', rays: 0.3, raySpinMs: 15000, waves: 0 },
  surge: { core: '#ffd782', edge: '#ffab3d', glow: '#ffab3d6b', rays: 0.38, raySpinMs: 12000, waves: 0 },
  blast: { core: '#ffc06a', edge: '#ff6a2f', glow: '#ff6a2f80', rays: 0.46, raySpinMs: 9000, waves: 2 },
  storm: { core: '#d9c7ff', edge: '#7b5cff', glow: '#7b5cff8a', rays: 0.54, raySpinMs: 6500, waves: 2 },
  cataclysm: { core: '#fff6d6', edge: '#7ce7ff', glow: '#ffeeb49e', rays: 0.62, raySpinMs: 4500, waves: 3 },
}

const DEFAULT_TITLE = {
  font: 'sans' as CelebrationFont,
  weight: 900,
  stroke: 0,
  strokeColor: '#00000099',
  tracking: -0.02,
}

function resolveTitle(level: LevelBase, ...layers: (CelebrationTitle | undefined)[]): ResolvedCelebrationTitle {
  const merged: CelebrationTitle = Object.assign({}, ...layers.filter((layer) => layer !== undefined))
  const font = merged.font ?? DEFAULT_TITLE.font
  const gradient = merged.gradient
  return {
    font,
    fontFamily: CELEBRATION_FONT_FAMILIES[font],
    weight: merged.weight ?? DEFAULT_TITLE.weight,
    stroke: merged.stroke ?? DEFAULT_TITLE.stroke,
    strokeColor: merged.strokeColor ?? DEFAULT_TITLE.strokeColor,
    gradient:
      gradient === undefined
        ? ['#ffffff', level.core, level.edge]
        : gradient.length >= 3
          ? [gradient[0]!, gradient[1]!, gradient[2]!]
          : [gradient[0]!, gradient[0]!, gradient[1]!],
    tracking: merged.tracking ?? DEFAULT_TITLE.tracking,
  }
}

export interface ResolveCelebrationOptions {
  /** 테마의 심볼 id → 이미지 URL. 주면 없는 심볼은 버리고, 있는 심볼에는 `src`를 싣는다. */
  readonly symbols?: Readonly<Record<string, string>>
}

/**
 * 스킨을 완전히 채운다. 겹치는 순서는 **허브 기본 → 게임 공통(`palette`·`title`) → 등급(`tiers`)**.
 * `skin`이 없으면 허브 기본 스킨이다(같은 입력이면 늘 같은 값 — 호출부가 메모해도 된다).
 */
export function resolveCelebrationSkin(
  skin?: CelebrationSkin,
  options: ResolveCelebrationOptions = {},
): ResolvedCelebrationSkin {
  const levels = {} as Record<CelebrationLevel, ResolvedCelebrationLevel>
  for (const level of CELEBRATION_LEVELS) {
    const tier = level === 'none' ? undefined : skin?.tiers?.[level]
    const base: LevelBase = {
      ...DEFAULT_CELEBRATION_LEVELS[level],
      ...definedOnly(skin?.palette),
      ...definedOnly({
        core: tier?.core,
        edge: tier?.edge,
        glow: tier?.glow,
        rays: tier?.rays,
        raySpinMs: tier?.raySpinMs,
        waves: tier?.waves,
      }),
    }
    levels[level] = {
      ...base,
      density: tier?.density ?? 1,
      title: resolveTitle(base, skin?.title, tier?.title),
    }
  }

  const symbols = options.symbols
  const kinds: CelebrationParticleKind[] = []
  for (const shape of skin?.particles?.shapes ?? []) kinds.push({ kind: 'shape', shape })
  for (const symbol of skin?.particles?.symbols ?? []) {
    if (symbols === undefined) {
      kinds.push({ kind: 'symbol', symbol })
      continue
    }
    const src = symbols[symbol]
    if (src !== undefined && src !== '') kinds.push({ kind: 'symbol', symbol, src })
  }
  if (kinds.length === 0) kinds.push({ kind: 'shape', shape: 'coin' })

  const labels: Partial<Record<CelebrationTierKey, string>> = {}
  for (const [key, label] of Object.entries(skin?.labels ?? {})) {
    if (label !== undefined && label.trim() !== '') labels[key as CelebrationTierKey] = label
  }

  return {
    custom: skin !== undefined,
    particles: {
      kinds,
      colors: skin?.particles?.colors ?? null,
      motion: skin?.particles?.motion ?? 'flip',
      size: skin?.particles?.size ?? 1,
    },
    rayStyle: skin?.rays?.style ?? 'sunburst',
    waveStyle: skin?.waves?.style ?? 'ring',
    labels,
    levels,
  }
}

function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  if (value === undefined) return {}
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** 허브 기본 스킨. 테마가 없거나 `celebration`을 쓰지 않는 게임 전부가 이것을 본다. */
export const DEFAULT_CELEBRATION_SKIN: ResolvedCelebrationSkin = resolveCelebrationSkin()

/** 파티클 하나의 겉모습. 자리·타이밍은 소비자(허브의 황금비 배치, 렌더러의 무작위 낙하)가 정한다. */
export interface CelebrationParticleLook {
  readonly kind: CelebrationParticleKind
  /** 모양 파티클의 주색. 심볼 그림에는 쓰지 않는다. */
  readonly color: string
  /** 그늘 색 — 주색을 어둡게 민 것. */
  readonly shade: string
}

/** 밀도 배수를 적용한 파티클 수. `max`를 넘지 않는다. */
export function celebrationParticleCount(
  skin: ResolvedCelebrationSkin,
  level: CelebrationLevel,
  base: number,
  max = Number.POSITIVE_INFINITY,
): number {
  return Math.max(0, Math.min(max, Math.round(base * skin.levels[level].density)))
}

/**
 * 파티클 `count`개의 겉모습. 재료와 색을 **서로 다른 보폭**으로 돌린다 — 재료 2개·색 2개면
 * 같은 칸끼리만 짝지어 "빨간 별·파란 별"만 나오는 일이 없도록 색 쪽을 한 칸씩 밀어 준다.
 */
export function planCelebrationParticles(
  skin: ResolvedCelebrationSkin,
  level: CelebrationLevel,
  count: number,
): CelebrationParticleLook[] {
  const { kinds, colors } = skin.particles
  const palette = colors ?? [skin.levels[level].core]
  const looks: CelebrationParticleLook[] = []
  for (let i = 0; i < count; i += 1) {
    const kind = kinds[i % kinds.length]!
    const color = palette[(i + Math.floor(i / kinds.length)) % palette.length]!
    looks.push({ kind, color, shade: shadeColor(color, 0.42) })
  }
  return looks
}

/** `#rgb`/`#rrggbb`/`#rrggbbaa` → `#rrggbb`(알파는 버린다). 틴트·캔버스 채움에 쓴다. */
export function opaqueHex(color: string): string {
  const hex = color.trim().replace(/^#/, '')
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }
  return `#${hex.slice(0, 6)}`.toLowerCase()
}

/** 색을 검정 쪽으로 `amount`(0~1)만큼 민다. */
export function shadeColor(color: string, amount: number): string {
  const hex = opaqueHex(color).slice(1)
  const k = 1 - Math.min(1, Math.max(0, amount))
  const channel = (offset: number): string =>
    Math.round(parseInt(hex.slice(offset, offset + 2), 16) * k)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(0)}${channel(2)}${channel(4)}`
}

/** 정다각 별. 꼭짓점이 위로 오도록 −90°에서 시작한다. */
function starPoints(tips: number, inner: number): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i < tips * 2; i += 1) {
    const radius = i % 2 === 0 ? 0.5 : 0.5 * inner
    const angle = -Math.PI / 2 + (i * Math.PI) / tips
    points.push([0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)])
  }
  return points
}

function gearPoints(teeth: number): [number, number][] {
  const points: [number, number][] = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step
    for (const [offset, radius] of [
      [0, 0.37],
      [0.18, 0.5],
      [0.5, 0.5],
      [0.68, 0.37],
    ] as const) {
      const angle = a + offset * step
      points.push([0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)])
    }
  }
  return points
}

function slicePoints(): [number, number][] {
  const points: [number, number][] = []
  const samples = 14
  for (let i = 0; i <= samples; i += 1) {
    const angle = (i / samples) * Math.PI
    points.push([0.5 + 0.5 * Math.cos(angle), 0.22 + 0.62 * Math.sin(angle)])
  }
  return points
}

const round3 = (points: [number, number][]): readonly (readonly [number, number])[] =>
  points.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as const)

/**
 * 모양 윤곽 — 한 변 1짜리 상자 안의 점들. `coin`은 원이라 null이다.
 * 허브(clip-path)와 렌더러(캔버스 패스)가 같은 점을 그대로 쓴다.
 */
const SHAPE_POINTS: Readonly<Record<CelebrationShape, readonly (readonly [number, number])[] | null>> = {
  coin: null,
  star: round3(starPoints(5, 0.42)),
  badge: round3(starPoints(6, 0.56)),
  gem: round3([
    [0.22, 0.1],
    [0.78, 0.1],
    [1, 0.38],
    [0.5, 0.98],
    [0, 0.38],
  ]),
  petal: round3([
    [0.5, 0.18],
    [0.62, 0.02],
    [0.8, 0.06],
    [0.94, 0.28],
    [0.9, 0.55],
    [0.72, 0.8],
    [0.5, 1],
    [0.28, 0.8],
    [0.1, 0.55],
    [0.06, 0.28],
    [0.2, 0.06],
    [0.38, 0.02],
  ]),
  slice: round3(slicePoints()),
  shard: round3([
    [0.42, 0],
    [1, 0.36],
    [0.7, 1],
    [0.02, 0.72],
  ]),
  casing: round3([
    [0.36, 0.04],
    [0.64, 0.04],
    [0.66, 0.86],
    [0.72, 0.9],
    [0.72, 1],
    [0.28, 1],
    [0.28, 0.9],
    [0.34, 0.86],
  ]),
  ema: round3([
    [0.5, 0.06],
    [0.96, 0.36],
    [0.96, 0.94],
    [0.04, 0.94],
    [0.04, 0.36],
  ]),
  gear: round3(gearPoints(8)),
  confetti: round3([
    [0.28, 0.04],
    [0.72, 0.04],
    [0.72, 0.96],
    [0.28, 0.96],
  ]),
  spark: round3(starPoints(4, 0.24)),
}

export function celebrationShapePoints(shape: CelebrationShape): readonly (readonly [number, number])[] | null {
  return SHAPE_POINTS[shape]
}

const CLIP_PATHS = new Map<CelebrationShape, string>()

/** CSS `clip-path` 값. 원(`coin`)은 `circle(50%)`. 같은 모양이면 같은 문자열을 돌려준다. */
export function celebrationShapeClipPath(shape: CelebrationShape): string {
  const cached = CLIP_PATHS.get(shape)
  if (cached !== undefined) return cached
  const points = SHAPE_POINTS[shape]
  const clip =
    points === null
      ? 'circle(50% at 50% 50%)'
      : `polygon(${points.map(([x, y]) => `${Number((x * 100).toFixed(1))}% ${Number((y * 100).toFixed(1))}%`).join(', ')})`
  CLIP_PATHS.set(shape, clip)
  return clip
}

/** 광선의 살 폭과 주기(도). `on`이 0이면 살 없이 후광만 남는다. */
export function celebrationRayGeometry(style: CelebrationRayStyle): { readonly on: number; readonly period: number } {
  switch (style) {
    case 'beams':
      return { on: 11, period: 30 }
    case 'halo':
    case 'none':
      return { on: 0, period: 16 }
    case 'sunburst':
    default:
      return { on: 4, period: 16 }
  }
}
