import { describe, expect, it } from 'vitest'
import {
  ArtFxFileSchema,
  FX_EFFECT_FIELDS,
  THEME_DEFAULT_PALETTE,
  ThemeFileSchema,
  emptyTheme,
  sheetAtlasPath,
  themeAssetRefs,
} from './theme.js'
import type { ThemeFile } from './theme.js'

const palette = { frame: '#d8a94a', reelBg: '#0b1220', winLine: ['#f4d98a'], text: '#f2f4f8' }

describe('ThemeFileSchema', () => {
  it('심볼과 팔레트만 있으면 통과한다', () => {
    const parsed = ThemeFileSchema.parse({ symbols: { seven: 'symbols/seven.webp' }, palette })
    expect(parsed.symbols.seven).toBe('symbols/seven.webp')
    expect(parsed.frameLayout).toBeUndefined()
  })

  it('palette가 없으면 거부한다 (렌더러가 네 필드를 전부 요구한다)', () => {
    expect(ThemeFileSchema.safeParse({ symbols: {} }).success).toBe(false)
  })

  it('색 형식이 아니면 거부한다', () => {
    const bad = { symbols: {}, palette: { ...palette, frame: 'gold' } }
    expect(ThemeFileSchema.safeParse(bad).success).toBe(false)
  })

  it('빈 문자열 경로는 거부한다 (파일이 없으면 키 자체를 빼는 것이 규약)', () => {
    expect(ThemeFileSchema.safeParse({ symbols: { seven: '' }, palette }).success).toBe(false)
    expect(ThemeFileSchema.safeParse({ symbols: {}, palette, background: '' }).success).toBe(false)
  })

  it('릴 창이 프레임 밖으로 넘치면 거부한다', () => {
    const overflow = { symbols: {}, palette, frameLayout: { window: { x: 0.6, y: 0, w: 0.5, h: 0.5 } } }
    const result = ThemeFileSchema.safeParse(overflow)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('오른쪽으로 넘친다')
  })

  it('알 수 없는 fx 타입은 거부한다', () => {
    const bad = { symbols: {}, palette, fx: { wild: { win: [{ type: 'explode' }] } } }
    expect(ThemeFileSchema.safeParse(bad).success).toBe(false)
  })

  it('전환 클립과 효과음은 선택이고, 있으면 그대로 실린다', () => {
    const parsed = ThemeFileSchema.parse({
      symbols: {},
      palette,
      transitions: { freeSpinsEnter: 'transitions/fs-enter.webm' },
      sfx: { spin: 'sfx/spin.ogg' },
    })
    expect(parsed.transitions?.freeSpinsEnter).toBe('transitions/fs-enter.webm')
    expect(parsed.sfx?.spin).toBe('sfx/spin.ogg')
  })
})

describe('ArtFxFileSchema', () => {
  it('fx 한 덩어리만 받는다', () => {
    const parsed = ArtFxFileSchema.parse({ fx: { default: { win: [{ type: 'pulse', scale: 1.1 }] } } })
    expect(parsed.fx.default?.win?.[0]?.type).toBe('pulse')
  })

  it('fx 키가 없으면 거부한다', () => {
    expect(ArtFxFileSchema.safeParse({}).success).toBe(false)
  })
})

describe('themeAssetRefs', () => {
  const theme: ThemeFile = ThemeFileSchema.parse({
    symbols: { wild: 'symbols/wild.webp', seven: 'symbols/seven.webp' },
    background: 'bg.webp',
    backgroundFreeSpins: 'bg-freespins.webp',
    frame: 'frame.webp',
    sheets: { wild: { win: 'sheets/wild-win.json' } },
    transitions: { freeSpinsEnter: 'transitions/enter.webm', freeSpinsExit: 'transitions/exit.webm' },
    sfx: { spin: 'sfx/spin.ogg', win: 'sfx/win.ogg' },
    palette,
  })

  it('경로가 있는 모든 필드를 한 번씩 뽑는다', () => {
    expect(themeAssetRefs(theme).map((ref) => ref.field)).toEqual([
      'symbols.wild',
      'symbols.seven',
      'background',
      'backgroundFreeSpins',
      'frame',
      'sheets.wild.win',
      'transitions.freeSpinsEnter',
      'transitions.freeSpinsExit',
      'sfx.spin',
      'sfx.win',
    ])
  })

  it('종류를 구분한다 (시트는 아틀라스가 따로 있고, 전환은 영상이다)', () => {
    const byField = new Map(themeAssetRefs(theme).map((ref) => [ref.field, ref.kind]))
    expect(byField.get('sheets.wild.win')).toBe('sheet')
    expect(byField.get('transitions.freeSpinsEnter')).toBe('video')
    expect(byField.get('sfx.spin')).toBe('audio')
    expect(byField.get('symbols.wild')).toBe('image')
  })

  it('없는 필드는 뽑지 않는다', () => {
    const minimal = ThemeFileSchema.parse({ symbols: {}, palette })
    expect(themeAssetRefs(minimal)).toEqual([])
  })
})

describe('sheetAtlasPath', () => {
  it('사이드카 JSON 옆의 webp 아틀라스를 가리킨다', () => {
    expect(sheetAtlasPath('theme/sheets/wild-win.json')).toBe('theme/sheets/wild-win.webp')
  })
})

describe('emptyTheme', () => {
  it('심볼 0개 + 기본 팔레트를 준다', () => {
    const theme = emptyTheme()
    expect(theme.symbols).toEqual({})
    expect(theme.palette).toEqual(THEME_DEFAULT_PALETTE)
    expect(ThemeFileSchema.safeParse(theme).success).toBe(true)
  })

  it('호출마다 독립된 복사본이라 기본 상수가 오염되지 않는다', () => {
    emptyTheme().palette.winLine.push('#000000')
    expect(emptyTheme().palette.winLine).toEqual(THEME_DEFAULT_PALETTE.winLine)
  })
})

describe('FX_EFFECT_FIELDS', () => {
  it('스키마가 아는 필드를 그대로 열거한다', () => {
    expect(FX_EFFECT_FIELDS).toContain('type')
    expect(FX_EFFECT_FIELDS).toContain('durationMs')
    expect(FX_EFFECT_FIELDS).not.toContain('fromAlpha')
  })
})
