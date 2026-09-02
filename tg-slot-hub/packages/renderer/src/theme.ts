import { z } from 'zod'
import type { SymbolId } from '@tgslot/slot-engine'
import type { FrameWindow } from './layout.js'
import { DEFAULT_FRAME_WINDOW, THEME_FILE_PATH } from './constants.js'
import type { SfxKey, Theme } from './types.js'

const ColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, '색은 #RGB, #RRGGBB, #RRGGBBAA 형식이어야 한다')

export const ThemePaletteSchema = z.object({
  frame: ColorSchema,
  reelBg: ColorSchema,
  winLine: z.array(ColorSchema).min(1),
  text: ColorSchema,
})

export const SFX_KEYS = ['spin', 'stop', 'win', 'bigwin'] as const

/** 효과음 URL 묶음. 파일이 없는 키는 아예 빼는 것이 규약이라 전부 optional이다. */
export const SfxSchema = z.object({
  spin: z.string().min(1).optional(),
  stop: z.string().min(1).optional(),
  win: z.string().min(1).optional(),
  bigwin: z.string().min(1).optional(),
})

const FractionSchema = z.number().min(0).max(1)

/** 프레임 이미지 안에서 릴 창이 차지하는 영역. 프레임 크기에 대한 분수다. */
export const FrameWindowSchema = z
  .object({
    x: FractionSchema,
    y: FractionSchema,
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .superRefine((window, ctx) => {
    if (window.x + window.w > 1) {
      ctx.addIssue({ code: 'custom', message: `창이 오른쪽으로 넘친다: x(${window.x}) + w(${window.w}) > 1`, path: ['w'] })
    }
    if (window.y + window.h > 1) {
      ctx.addIssue({ code: 'custom', message: `창이 아래로 넘친다: y(${window.y}) + h(${window.h}) > 1`, path: ['h'] })
    }
  })

/** 프레임 아트의 배치 정보. 지금은 릴 창 하나뿐이다. */
export const FrameLayoutSchema = z.object({ window: FrameWindowSchema })

/** 심볼 연출 종류. 각 타입이 쓰는 추가 필드는 아래 스키마의 주석을 볼 것. */
export const FX_TYPES = [
  'pulse',
  'shine',
  'wobble',
  'bounce',
  'burst',
  'glow',
  'flash',
  'spin',
  /** 스프라이트 시트 재생. `theme.sheets[symbol].win`이 있어야 동작한다. */
  'sheet',
] as const

/**
 * 심볼 연출 1개. 모든 필드가 선택이고 빠진 값은 `resolveFxEffect`가 채운다.
 * 타입별로 쓰는 필드가 다르지만, 게임 팩 작성자가 외우기 쉽도록 한 덩어리로 둔다.
 */
export const FxEffectSchema = z.object({
  type: z.enum(FX_TYPES),
  /** 공통. 1회 재생 길이(ms). */
  durationMs: z.number().positive().optional(),
  /** 공통. 반복 여부. 기본 true. */
  loop: z.boolean().optional(),
  /** 공통. 0~1 진폭 배수. 기본 1. */
  intensity: z.number().min(0).max(1).optional(),
  /** `pulse`. 최대 배율. */
  scale: z.number().positive().optional(),
  /** `shine`. 빛줄기 기울기(도). */
  angle: z.number().optional(),
  /** `wobble`. 좌우 회전 폭(도). */
  degrees: z.number().positive().optional(),
  /** `bounce`. 위아래 이동량(심볼 높이 대비 비율). */
  px: z.number().positive().optional(),
  /** `burst`. 파티클 개수. */
  particles: z.number().int().positive().optional(),
  /** `glow`. 광채 색. */
  color: ColorSchema.optional(),
  /** `flash`. 심볼마다 시작을 어긋나게 할지. */
  stagger: z.boolean().optional(),
  /** `flash`. 심볼을 가로 띠 N개로 나눠 위에서 아래로 훑는다. */
  segments: z.number().int().positive().optional(),
  /** 유한 반복 횟수. 다 돌면 멈춰 있는다. 없으면 `loop`를 따른다. */
  repeat: z.number().int().nonnegative().optional(),
})
export type FxEffect = z.infer<typeof FxEffectSchema>

/** 심볼 1개의 트리거별 연출. 지금은 승리(`win`)만 쓴다. */
export const FxSymbolSchema = z.object({ win: z.array(FxEffectSchema).optional() })
export type FxSymbol = z.infer<typeof FxSymbolSchema>

/** 심볼 id -> 연출. `default` 키는 항목이 없는 심볼 전부에 적용된다. */
export const FxMapSchema = z.record(z.string().min(1), FxSymbolSchema)
export type FxMap = z.infer<typeof FxMapSchema>

/**
 * 심볼 1개의 스프라이트 시트. 값은 사이드카 JSON 경로다.
 * 아틀라스 이미지는 같은 경로의 `.webp`라 따로 적지 않는다.
 */
export const SheetSymbolSchema = z.object({ win: z.string().min(1).optional() })
export type SheetSymbol = z.infer<typeof SheetSymbolSchema>

/** 심볼 id -> 시트. `default`는 쓰지 않는다. 시트는 심볼마다 그림이 다르기 때문이다. */
export const SheetMapSchema = z.record(z.string().min(1), SheetSymbolSchema)
export type SheetMap = z.infer<typeof SheetMapSchema>

/**
 * `games/<id>/theme/theme.json`의 스키마. 경로는 theme.json 파일 기준 상대 경로다.
 * 파일이 없는 효과음은 키 자체를 넣지 않는다 (빈 문자열 금지).
 */
export const ThemeFileSchema = z.object({
  /** 자유 형식 버전 문자열. 캐시 무효화 용도. */
  version: z.string().min(1).optional(),
  symbols: z.record(z.string().min(1), z.string().min(1)),
  background: z.string().min(1).optional(),
  /** 프리스핀 중에 쓰는 배경. 없으면 기본 배경 위에 금빛 틴트를 덧씌운다. */
  backgroundFreeSpins: z.string().min(1).optional(),
  /** 릴을 감싸는 베젤 아트. 없으면 렌더러가 벡터 베젤을 직접 그린다. */
  frame: z.string().min(1).optional(),
  /** 프레임 아트의 릴 창 위치. 없으면 `DEFAULT_FRAME_WINDOW`를 쓴다. */
  frameLayout: FrameLayoutSchema.optional(),
  /** 심볼 승리 연출. 없으면 전부 내장 pulse를 쓴다. */
  fx: FxMapSchema.optional(),
  /** 심볼별 스프라이트 시트. 있으면 승리 연출에서 정지 이미지 대신 재생한다. */
  sheets: SheetMapSchema.optional(),
  palette: ThemePaletteSchema,
  sfx: SfxSchema.optional(),
})

export type ThemeFile = z.infer<typeof ThemeFileSchema>

/** `theme.json`의 심볼 커버리지를 검사할 때 쓰는 최소 형태. math.json이 그대로 들어맞는다. */
export interface SymbolSource {
  symbols: readonly { id: SymbolId }[]
}

export class ThemeError extends Error {
  override name = 'ThemeError'
}

/** 끝의 슬래시를 정리한 베이스 URL. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/**
 * theme.json 안의 상대 경로를 절대(또는 문서 기준) URL로 바꾼다.
 * 이미 절대 URL(`http`, `//`, `/`)이거나 data URI면 그대로 둔다.
 */
export function resolveAssetUrl(baseUrl: string, path: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(path)) return path
  const dir = `${trimBase(baseUrl)}/${THEME_FILE_PATH}`.replace(/\/[^/]*$/, '')
  return `${dir}/${path.replace(/^\.\//, '')}`
}

/** `<baseUrl>/theme/theme.json`의 절대 경로. */
export function themeFileUrl(baseUrl: string): string {
  return `${trimBase(baseUrl)}/${THEME_FILE_PATH}`
}

export interface ParseThemeOptions {
  /** 심볼이 빠짐없이 선언됐는지 검사할 기준. 보통 math.json. */
  require?: SymbolSource
}

/**
 * theme.json(JSON 파싱된 값)을 검증하고 URL을 풀어 `Theme`으로 만든다.
 * 네트워크를 쓰지 않아 단위 테스트에서 그대로 호출할 수 있다.
 */
export function parseTheme(json: unknown, baseUrl: string, options: ParseThemeOptions = {}): Theme {
  const parsed = ThemeFileSchema.safeParse(json)
  if (!parsed.success) {
    throw new ThemeError(`theme.json 검증 실패: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  }
  const file = parsed.data

  const required = options.require?.symbols ?? []
  const missing = required.map((s) => s.id).filter((id) => file.symbols[id] === undefined)
  if (missing.length > 0) {
    throw new ThemeError(`theme.json에 심볼 이미지가 없다: ${missing.join(', ')}`)
  }

  const symbols: Record<SymbolId, string> = {}
  for (const [id, path] of Object.entries(file.symbols)) {
    symbols[id] = resolveAssetUrl(baseUrl, path)
  }

  const sfx: Partial<Record<SfxKey, string>> = {}
  for (const key of SFX_KEYS) {
    const value = file.sfx?.[key]
    if (value !== undefined) sfx[key] = resolveAssetUrl(baseUrl, value)
  }

  const theme: Theme = {
    symbols,
    palette: { ...file.palette, winLine: [...file.palette.winLine] },
  }
  if (file.background !== undefined) theme.background = resolveAssetUrl(baseUrl, file.background)
  if (file.backgroundFreeSpins !== undefined) {
    theme.backgroundFreeSpins = resolveAssetUrl(baseUrl, file.backgroundFreeSpins)
  }
  if (file.frame !== undefined) theme.frame = resolveAssetUrl(baseUrl, file.frame)
  // 프레임 아트가 있으면 창 좌표를 반드시 갖게 한다. 생성기(theme-gen)는 frameLayout을 쓰지 않으므로
  // 기본값(ART_DIRECTION §5)을 여기서 채워 넣어 렌더러가 분기하지 않게 한다.
  if (file.frameLayout !== undefined) {
    theme.frameLayout = { window: { ...file.frameLayout.window } }
  } else if (file.frame !== undefined) {
    theme.frameLayout = { window: { ...DEFAULT_FRAME_WINDOW } }
  }
  if (file.fx !== undefined) theme.fx = file.fx
  if (file.sheets !== undefined) {
    const sheets: SheetMap = {}
    for (const [symbolId, entry] of Object.entries(file.sheets)) {
      const resolved: SheetSymbol = {}
      if (entry.win !== undefined) resolved.win = resolveAssetUrl(baseUrl, entry.win)
      sheets[symbolId] = resolved
    }
    theme.sheets = sheets
  }
  if (Object.keys(sfx).length > 0) theme.sfx = sfx
  return theme
}

export interface LoadThemeOptions extends ParseThemeOptions {
  /** 테스트에서 주입 가능한 fetch. 기본값은 전역 fetch. */
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/**
 * `<baseUrl>/theme/theme.json`을 읽어 `Theme`을 만든다.
 * 게임 팩 디렉터리 URL을 그대로 넘기면 된다. 예: `loadTheme('/games/classic-777', math)`.
 */
export async function loadTheme(
  baseUrl: string,
  manifestLike?: SymbolSource,
  options: LoadThemeOptions = {},
): Promise<Theme> {
  const url = themeFileUrl(baseUrl)
  const doFetch = options.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') throw new ThemeError('fetch를 쓸 수 없다. fetchImpl을 주입할 것')

  const init = options.signal ? { signal: options.signal } : undefined
  const response = await doFetch(url, init)
  if (!response.ok) throw new ThemeError(`테마를 불러오지 못했다 (${response.status}): ${url}`)

  const json: unknown = await response.json()
  const parseOptions: ParseThemeOptions = {}
  const require = options.require ?? manifestLike
  if (require !== undefined) parseOptions.require = require
  return parseTheme(json, baseUrl, parseOptions)
}

/** 심볼 텍스처의 출처. 이미지가 없으면 글자 텍스처로 대신한다. */
export type SymbolSourceKind =
  | { kind: 'url'; url: string }
  | { kind: 'fallback'; label: string }

/**
 * 심볼 하나의 텍스처 출처를 정한다.
 * URL이 비어 있거나 없으면 곧바로 폴백이다. 로딩 실패는 호출 측이 폴백으로 되돌린다.
 */
export function resolveSymbolSource(theme: Theme, symbolId: SymbolId): SymbolSourceKind {
  const url = theme.symbols[symbolId]
  if (typeof url !== 'string' || url.trim() === '') return { kind: 'fallback', label: symbolId }
  return { kind: 'url', url }
}

/**
 * 릴 창 좌표를 확정한다. `parseTheme`을 거친 테마라면 이미 채워져 있지만,
 * Theme을 손으로 조립한 경우를 위해 기본값 폴백을 한 군데로 모아 둔다.
 */
export function resolveFrameWindow(theme: Pick<Theme, 'frameLayout'>): FrameWindow {
  return theme.frameLayout?.window ?? { ...DEFAULT_FRAME_WINDOW }
}
