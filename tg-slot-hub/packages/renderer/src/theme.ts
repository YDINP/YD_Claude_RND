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

/**
 * `games/<id>/theme/theme.json`의 스키마. 경로는 theme.json 파일 기준 상대 경로다.
 * 파일이 없는 효과음은 키 자체를 넣지 않는다 (빈 문자열 금지).
 */
export const ThemeFileSchema = z.object({
  /** 자유 형식 버전 문자열. 캐시 무효화 용도. */
  version: z.string().min(1).optional(),
  symbols: z.record(z.string().min(1), z.string().min(1)),
  background: z.string().min(1).optional(),
  /** 릴을 감싸는 베젤 아트. 없으면 렌더러가 벡터 베젤을 직접 그린다. */
  frame: z.string().min(1).optional(),
  /** 프레임 아트의 릴 창 위치. 없으면 `DEFAULT_FRAME_WINDOW`를 쓴다. */
  frameLayout: FrameLayoutSchema.optional(),
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
  if (file.frame !== undefined) theme.frame = resolveAssetUrl(baseUrl, file.frame)
  // 프레임 아트가 있으면 창 좌표를 반드시 갖게 한다. 생성기(theme-gen)는 frameLayout을 쓰지 않으므로
  // 기본값(ART_DIRECTION §5)을 여기서 채워 넣어 렌더러가 분기하지 않게 한다.
  if (file.frameLayout !== undefined) {
    theme.frameLayout = { window: { ...file.frameLayout.window } }
  } else if (file.frame !== undefined) {
    theme.frameLayout = { window: { ...DEFAULT_FRAME_WINDOW } }
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
