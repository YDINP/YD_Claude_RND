export interface ThemeUpdate {
  symbols?: Record<string, string>
  frame?: string
  background?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 기존 `theme.json`(파싱된 값, 없으면 undefined)에 새로 생성한 자산 경로를 병합한다.
 * `version`, `palette`, `sfx` 등 모르는 키는 그대로 보존한다(merge, never drop unknown keys).
 * 파일이 아예 없었으면 빈 palette를 가진 새 객체를 만든다.
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
  if (base.palette === undefined) base.palette = {}

  return base
}
