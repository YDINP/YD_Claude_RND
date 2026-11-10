import { describe, expect, it } from 'vitest'
import {
  ArtFxFileSchema,
  TransitionClipSchema,
  FX_EFFECT_FIELDS,
  THEME_DEFAULT_PALETTE,
  ThemeFileSchema,
  emptyTheme,
  sheetAtlasPath,
  themeAssetRefs,
} from './theme.js'
import type { ThemeFile } from './theme.js'

const palette = { frame: '#d8a94a', reelBg: '#0b1220', winLine: ['#f4d98a'], text: '#f2f4f8' }

describe('TransitionClipSchema — opaqueMs', () => {
  it('0을 받는다 — 첫 프레임부터 덮는 클립의 정상값이다', () => {
    const parsed = TransitionClipSchema.parse({ src: 'a.webp', opaqueMs: 0 })
    expect(parsed.opaqueMs).toBe(0)
  })

  it('키를 빼면 undefined다 — 0과 다른 상태다', () => {
    expect(TransitionClipSchema.parse({ src: 'a.webp' }).opaqueMs).toBeUndefined()
  })

  it('음수는 거부한다', () => {
    expect(() => TransitionClipSchema.parse({ src: 'a.webp', opaqueMs: -1 })).toThrow()
  })
})

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
      transitions: { freeSpinsEnter: { src: 'transitions/fs-enter.webm' } },
      sfx: { spin: 'sfx/spin.ogg' },
    })
    expect(parsed.transitions?.freeSpinsEnter?.src).toBe('transitions/fs-enter.webm')
    expect(parsed.sfx?.spin).toBe('sfx/spin.ogg')
  })

  it('sound.preset은 알려진 프리셋만 받고 없어도 된다', () => {
    const base = { version: '1.0.0', symbols: {}, palette }
    expect(ThemeFileSchema.parse(base).sound).toBeUndefined()
    for (const preset of ['bell', 'fruit', 'western', 'shrine', 'clockwork']) {
      expect(ThemeFileSchema.parse({ ...base, sound: { preset } }).sound?.preset).toBe(preset)
    }
    expect(ThemeFileSchema.safeParse({ ...base, sound: { preset: 'disco' } }).success).toBe(false)
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
    transitions: { freeSpinsEnter: { src: 'transitions/enter.webm' }, freeSpinsExit: { src: 'transitions/exit.webm' } },
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
    expect(byField.get('transitions.freeSpinsEnter')).toBe('image')
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

describe('CelebrationSkinSchema', () => {
  it('celebration이 없어도 된다 — 허브 기본 연출로 떨어진다', () => {
    expect(ThemeFileSchema.parse({ symbols: {}, palette }).celebration).toBeUndefined()
  })

  it('모양·심볼·등급별 값을 받는다', () => {
    const parsed = ThemeFileSchema.parse({
      symbols: { charm: 'symbols/charm.webp' },
      palette,
      celebration: {
        palette: { core: '#ffe3ea', glow: '#f6c0cf80' },
        particles: { shapes: ['petal', 'ema'], symbols: ['charm'], colors: ['#f6c0cf'], motion: 'flutter', size: 1.2 },
        rays: { style: 'halo' },
        waves: { style: 'dashed' },
        title: { font: 'rounded', weight: 900, stroke: 2, strokeColor: '#00000099', gradient: ['#ffffff', '#f6c0cf'] },
        labels: { storm: 'HANAMI' },
        tiers: { cataclysm: { core: '#ffffff', density: 1.6, waves: 3, rays: 0.7 } },
      },
    })
    expect(parsed.celebration?.particles?.shapes).toEqual(['petal', 'ema'])
    expect(parsed.celebration?.tiers?.cataclysm?.density).toBe(1.6)
  })

  it('모르는 모양·스타일, 깨진 색, 범위를 넘는 밀도는 거부한다', () => {
    const base = { symbols: {}, palette }
    expect(ThemeFileSchema.safeParse({ ...base, celebration: { particles: { shapes: ['banana'] } } }).success).toBe(false)
    expect(ThemeFileSchema.safeParse({ ...base, celebration: { rays: { style: 'laser' } } }).success).toBe(false)
    expect(ThemeFileSchema.safeParse({ ...base, celebration: { palette: { core: 'gold' } } }).success).toBe(false)
    expect(ThemeFileSchema.safeParse({ ...base, celebration: { tiers: { storm: { density: 9 } } } }).success).toBe(false)
    expect(ThemeFileSchema.safeParse({ ...base, celebration: { tiers: { storm: { waves: 4 } } } }).success).toBe(false)
    expect(ThemeFileSchema.safeParse({ ...base, celebration: { labels: { blast: '   ' } } }).success).toBe(false)
  })
})
