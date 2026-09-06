import { z } from 'zod'

/**
 * `games/<id>/theme/theme.json`의 스키마 — **게임 팩 아트 계약의 단일 출처**다.
 *
 * 렌더러(`packages/renderer/src/theme.ts`)는 이 스키마를 그대로 재수출해서 쓰고,
 * URL 해석(`resolveAssetUrl`)과 런타임 폴백은 렌더러 쪽에 남는다. 여기에는 **파일의 모양**만 둔다.
 * 경로 값은 전부 `theme.json` 파일 기준 상대 경로다.
 */

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
export type ThemePalette = z.infer<typeof ThemePaletteSchema>

export const SFX_KEYS = ['spin', 'stop', 'win', 'bigwin'] as const
export type SfxKey = (typeof SFX_KEYS)[number]

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
export type FrameWindow = z.infer<typeof FrameWindowSchema>

/** 프레임 아트의 배치 정보. 지금은 릴 창 하나뿐이다. */
export const FrameLayoutSchema = z.object({ window: FrameWindowSchema })
export type FrameLayout = z.infer<typeof FrameLayoutSchema>

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
export type FxType = (typeof FX_TYPES)[number]

/**
 * 심볼 연출 1개. 모든 필드가 선택이고 빠진 값은 렌더러의 `resolveFxEffect`가 채운다.
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

/** `FxEffectSchema`가 아는 필드 이름 전부. 팩 검사기가 오타난 필드를 짚는 데 쓴다. */
export const FX_EFFECT_FIELDS = Object.keys(FxEffectSchema.shape)

/** 심볼 1개의 트리거별 연출. 지금은 승리(`win`)만 쓴다. */
export const FxSymbolSchema = z.object({ win: z.array(FxEffectSchema).optional() })
export type FxSymbol = z.infer<typeof FxSymbolSchema>

/** 심볼 id -> 연출. `default` 키는 항목이 없는 심볼 전부에 적용된다. */
export const FxMapSchema = z.record(z.string().min(1), FxSymbolSchema)
export type FxMap = z.infer<typeof FxMapSchema>

/** `fx` 맵에서 심볼 id가 아니라 "나머지 전부"를 뜻하는 예약 키. */
export const FX_DEFAULT_KEY = 'default'

/**
 * `games/<id>/art/fx.json`의 스키마. 손으로 쓰는 **연출 원본**이고,
 * `theme-gen`이 이 값을 `theme.json`의 `fx`로 병합한다 (`tools/theme-gen`의 `applyThemeUpdate`).
 * 파일이 없으면 `theme.json`에 이미 들어 있는 `fx`를 그대로 쓴다.
 */
export const ArtFxFileSchema = z.object({ fx: FxMapSchema })
export type ArtFxFile = z.infer<typeof ArtFxFileSchema>

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
 * 모드 전환 커튼 위에서 재생할 영상 클립. 경로는 `sheets`와 똑같이 theme.json 기준 상대 경로다.
 * 방향마다 따로 걸 수 있고, 없는 방향은 키를 빼면 지금까지의 단색 커튼으로 남는다.
 */
/**
 * 릴 창 뒤에 까는 어두운 패널(스크림).
 *
 * 벚꽃·석양처럼 밝고 대비가 낮은 배경 아트 위에서는 심볼이 묻힌다. 배경과 심볼 사이에
 * 반투명 판을 한 장 끼워 대비를 세우되, 배경 아트가 죽지 않을 만큼만 어둡게 한다.
 * 전부 선택이고, 키가 없으면 렌더러 기본값을 쓴다. `alpha: 0`이면 아예 그리지 않는다.
 */
export const ReelBackdropSchema = z.object({
  /** 판 색. 기본은 검정. */
  color: ColorSchema.optional(),
  /** 불투명도(0~1). 0이면 그리지 않는다. */
  alpha: z.number().min(0).max(1).optional(),
  /** 모서리 반경 = 심볼 한 변 대비 비율. 프레임 아트가 창 모서리를 덮는 게임은 크게 준다. */
  radius: z.number().min(0).max(1).optional(),
  /**
   * 안쪽 여백 = 심볼 한 변 대비 비율. 판을 릴 창보다 이만큼 좁힌다.
   * 음수면 반대로 넓어져 베젤 아래까지 깔린다 — 프레임 아트와 판 사이가 뜨는 게임에 쓴다.
   */
  inset: z.number().min(-1).max(1).optional(),
})
export type ReelBackdrop = z.infer<typeof ReelBackdropSchema>

export const ThemeTransitionsSchema = z.object({
  /** 프리스핀으로 **들어갈 때**. */
  freeSpinsEnter: z.string().min(1).optional(),
  /** 프리스핀에서 **나올 때**. */
  freeSpinsExit: z.string().min(1).optional(),
})
export type ThemeTransitions = z.infer<typeof ThemeTransitionsSchema>

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
  /** 프레임 아트의 릴 창 위치. 없으면 렌더러의 `DEFAULT_FRAME_WINDOW`를 쓴다. */
  frameLayout: FrameLayoutSchema.optional(),
  /** 심볼 승리 연출. 없으면 전부 내장 pulse를 쓴다. 원본은 `art/fx.json`. */
  fx: FxMapSchema.optional(),
  /** 심볼별 스프라이트 시트. 있으면 승리 연출에서 정지 이미지 대신 재생한다. */
  sheets: SheetMapSchema.optional(),
  /** 모드 전환 클립. 없으면 전환은 단색 커튼 그대로다. */
  transitions: ThemeTransitionsSchema.optional(),
  /** 릴 창 뒤 패널. 없으면 렌더러 기본값(검정 반투명)으로 깔린다. */
  reelBackdrop: ReelBackdropSchema.optional(),
  palette: ThemePaletteSchema,
  sfx: SfxSchema.optional(),
})
export type ThemeFile = z.infer<typeof ThemeFileSchema>

/**
 * 허브 공통 기본 팔레트. `theme.json`을 새로 만들 때 쓴다.
 * `ThemePaletteSchema`가 네 필드를 전부 요구하므로 빈 `{}`를 남기면 렌더러가 깨진다.
 */
export const THEME_DEFAULT_PALETTE: ThemePalette = {
  frame: '#d8a94a',
  reelBg: '#0b1220',
  winLine: ['#f4d98a', '#4fc3d9', '#3fae6a', '#e0605c', '#5b9dff'],
  text: '#f2f4f8',
}

/** theme.json을 새로 만들 때 쓰는 기본 버전 문자열. */
export const THEME_DEFAULT_VERSION = '1.0.0'

/**
 * 아트가 아직 없는 팩의 널 오브젝트 테마. 심볼이 하나도 없고 팔레트만 기본값이다.
 * 이것 덕분에 소비자는 "theme이 있나?"를 분기하지 않고 `pack.theme.symbols`를 그냥 읽으면 된다.
 */
export function emptyTheme(): ThemeFile {
  return { symbols: {}, palette: { ...THEME_DEFAULT_PALETTE, winLine: [...THEME_DEFAULT_PALETTE.winLine] } }
}

/** 테마가 가리키는 자산 1개. 경로는 `theme.json` 파일 기준 상대 경로다. */
export interface ThemeAssetRef {
  /** 점 표기 필드 경로. 예: `symbols.wild`, `sheets.seven.win`. */
  field: string
  path: string
  /**
   * `sheet`는 값이 사이드카 JSON이고 같은 이름의 `.webp` 아틀라스가 옆에 있어야 한다.
   * 나머지는 파일 하나만 있으면 된다.
   */
  kind: 'image' | 'video' | 'audio' | 'sheet'
}

/**
 * 테마가 참조하는 **모든** 자산 경로를 한 곳에서 뽑는다.
 *
 * 팩 검사기와 프리로더가 이 함수 하나만 보면 되도록 만든 목록이다.
 * `ThemeFileSchema`에 경로 필드를 새로 넣으면 여기에도 넣어야 한다 — 그래서 두 정의를 같은 파일에 둔다.
 */
export function themeAssetRefs(theme: ThemeFile): ThemeAssetRef[] {
  const refs: ThemeAssetRef[] = []
  const push = (field: string, path: string | undefined, kind: ThemeAssetRef['kind'] = 'image'): void => {
    if (path !== undefined) refs.push({ field, path, kind })
  }

  for (const [id, path] of Object.entries(theme.symbols)) push(`symbols.${id}`, path)
  push('background', theme.background)
  push('backgroundFreeSpins', theme.backgroundFreeSpins)
  push('frame', theme.frame)
  for (const [symbol, sheet] of Object.entries(theme.sheets ?? {})) {
    push(`sheets.${symbol}.win`, sheet.win, 'sheet')
  }
  push('transitions.freeSpinsEnter', theme.transitions?.freeSpinsEnter, 'video')
  push('transitions.freeSpinsExit', theme.transitions?.freeSpinsExit, 'video')
  for (const key of SFX_KEYS) push(`sfx.${key}`, theme.sfx?.[key], 'audio')

  return refs
}

/** 스프라이트 시트 사이드카 JSON 경로 -> 아틀라스 이미지 경로. 같은 폴더, 같은 이름, 확장자만 다르다. */
export function sheetAtlasPath(sheetJsonPath: string): string {
  return sheetJsonPath.replace(/\.json$/i, '.webp')
}
