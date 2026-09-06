import type { FxMap } from '@tgslot/game-sdk'
import { THEME_DEFAULT_PALETTE, THEME_DEFAULT_VERSION } from './constants.js'

/** 렌더러의 `FrameWindowSchema`와 같은 모양. `@tgslot/game-sdk`의 `FrameWindow` 참고. */
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
  /** `art/fx.json`에서 그대로 옮겨 오는 심볼 승리 연출. 손으로 쓴 원본이 유일한 출처다. */
  fx?: FxMap
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 객체 두 개를 재귀적으로 합친다. **patch에 없는 키는 절대 건드리지 않는다.**
 * 배열은 통째로 교체한다 (팔레트의 `winLine`처럼 순서가 의미인 값이라 원소 병합은 틀린 답이다).
 */
export function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const previous = out[key]
    out[key] = isPlainObject(previous) && isPlainObject(value) ? deepMerge(previous, value) : value
  }
  return out
}

/** 비어 있지 않은 맵만 patch에 넣는다. 빈 맵을 넣으면 없던 키가 `{}`로 생겨난다. */
function nonEmpty<T extends object>(value: T | undefined): T | undefined {
  return value !== undefined && Object.keys(value).length > 0 ? value : undefined
}

/** `ThemeUpdate`를 `theme.json` 모양의 부분 객체로. undefined 필드는 아예 키를 만들지 않는다. */
function toThemePatch(update: ThemeUpdate): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const symbols = nonEmpty(update.symbols)
  if (symbols !== undefined) patch.symbols = symbols
  if (update.frame !== undefined) patch.frame = update.frame
  if (update.background !== undefined) patch.background = update.background
  if (update.backgroundFreeSpins !== undefined) patch.backgroundFreeSpins = update.backgroundFreeSpins
  if (update.frameLayout !== undefined) patch.frameLayout = { window: { ...update.frameLayout.window } }
  const sheets = nonEmpty(update.sheets)
  if (sheets !== undefined) patch.sheets = sheets
  const fx = nonEmpty(update.fx)
  if (fx !== undefined) patch.fx = fx
  return patch
}

/**
 * 기존 `theme.json`(파싱된 값, 없으면 undefined)에 새로 생성한 자산 경로를 병합한다.
 *
 * **merge, never drop unknown keys** — `version`, `palette`, `sfx`, `transitions`처럼 생성기가
 * 모르는 키는 중첩 단계까지 그대로 보존한다. 손으로 쓴 필드를 재생성이 지워 버리면 안 되기 때문이다.
 * `palette`나 `version`이 아예 없는 파일(대개 새로 만드는 경우)이면 허브 공통 기본값으로 채운다 —
 * 렌더러의 `ThemePaletteSchema`가 네 필드를 전부 요구해서, 빈 `{}`를 남기면 렌더러 쪽이 깨진다.
 */
export function mergeTheme(existing: unknown, update: ThemeUpdate): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(existing) ? existing : {}
  const merged = deepMerge(base, toThemePatch(update))

  if (merged.version === undefined) merged.version = THEME_DEFAULT_VERSION
  if (merged.palette === undefined) {
    merged.palette = { ...THEME_DEFAULT_PALETTE, winLine: [...THEME_DEFAULT_PALETTE.winLine] }
  }

  return merged
}
