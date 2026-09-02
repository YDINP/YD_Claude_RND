import { THEME_DEFAULT_PALETTE, THEME_DEFAULT_VERSION } from './constants.js'

/** 렌더러의 `FrameWindowSchema`와 같은 모양. `packages/renderer/src/theme.ts` 참고. */
export interface ThemeFrameWindow {
  x: number
  y: number
  w: number
  h: number
}

export interface ThemeUpdate {
  symbols?: Record<string, string>
  frame?: string
  background?: string
  /** 프리스핀 전용 배경. asset id `bgFreeSpins`(kind `bg`)가 여기로 매핑된다. */
  backgroundFreeSpins?: string
  frameLayout?: { window: ThemeFrameWindow }
  /** symbol -> 애니메이션 이름 -> 아틀라스 JSON 상대 경로. `kind: "sheet"` 에셋이 채운다. */
  sheets?: Record<string, Record<string, string>>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 기존 `theme.json`(파싱된 값, 없으면 undefined)에 새로 생성한 자산 경로를 병합한다.
 * `version`, `palette`, `sfx` 등 모르는 키는 그대로 보존한다(merge, never drop unknown keys).
 * `palette`나 `version`이 아예 없는 파일(대개 새로 만드는 경우)이면 허브 공통 기본값으로 채운다 —
 * 렌더러의 `ThemePaletteSchema`가 네 필드를 전부 요구해서, 빈 `{}`를 남기면 렌더러 쪽이 깨진다.
 */
export function mergeTheme(existing: unknown, update: ThemeUpdate): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(existing) ? { ...existing } : {}

  const existingSymbols = isPlainObject(base.symbols) ? base.symbols : {}
  const nextSymbols = { ...existingSymbols, ...(update.symbols ?? {}) }
  if (Object.keys(nextSymbols).length > 0 || base.symbols !== undefined) {
    base.symbols = nextSymbols
  }

  if (update.frame !== undefined) base.frame = update.frame
  if (update.background !== undefined) base.background = update.background
  if (update.backgroundFreeSpins !== undefined) base.backgroundFreeSpins = update.backgroundFreeSpins
  if (update.frameLayout !== undefined) base.frameLayout = { window: { ...update.frameLayout.window } }

  if (update.sheets !== undefined) {
    const existingSheets = isPlainObject(base.sheets) ? base.sheets : {}
    const nextSheets: Record<string, unknown> = { ...existingSheets }
    for (const [symbol, animations] of Object.entries(update.sheets)) {
      const existingAnimations = isPlainObject(nextSheets[symbol]) ? nextSheets[symbol] : {}
      nextSheets[symbol] = { ...existingAnimations, ...animations }
    }
    base.sheets = nextSheets
  }

  if (base.version === undefined) base.version = THEME_DEFAULT_VERSION
  if (base.palette === undefined) {
    base.palette = { ...THEME_DEFAULT_PALETTE, winLine: [...THEME_DEFAULT_PALETTE.winLine] }
  }

  return base
}
