import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRAME_WINDOW } from './constants.js'
import {
  loadTheme,
  parseTheme,
  resolveAssetUrl,
  resolveFrameWindow,
  resolveSymbolSource,
  themeFileUrl,
  ThemeError,
} from './theme.js'
import type { Theme } from './types.js'
import { loadGameMath, loadThemeJson } from './testSupport.js'

const validJson = {
  symbols: { a: 'symbols/a.svg', b: './symbols/b.svg' },
  background: 'bg.svg',
  palette: { frame: '#d8a94a', reelBg: '#0b1220', winLine: ['#f4d98a', '#4fc3d9'], text: '#f2f4f8' },
}

describe('resolveAssetUrl', () => {
  it('상대 경로를 theme.json 디렉터리 기준으로 푼다', () => {
    expect(resolveAssetUrl('/games/classic-777', 'symbols/a.svg')).toBe('/games/classic-777/theme/symbols/a.svg')
    expect(resolveAssetUrl('/games/classic-777/', './bg.svg')).toBe('/games/classic-777/theme/bg.svg')
  })

  it('절대 경로와 URL과 data URI는 그대로 둔다', () => {
    expect(resolveAssetUrl('/games/x', '/cdn/a.svg')).toBe('/cdn/a.svg')
    expect(resolveAssetUrl('/games/x', 'https://cdn.example/a.svg')).toBe('https://cdn.example/a.svg')
    expect(resolveAssetUrl('/games/x', '//cdn.example/a.svg')).toBe('//cdn.example/a.svg')
    expect(resolveAssetUrl('/games/x', 'data:image/svg+xml,<svg/>')).toBe('data:image/svg+xml,<svg/>')
  })
})

describe('themeFileUrl', () => {
  it('베이스 URL 뒤에 theme/theme.json을 붙인다', () => {
    expect(themeFileUrl('/games/classic-777')).toBe('/games/classic-777/theme/theme.json')
    expect(themeFileUrl('/games/classic-777///')).toBe('/games/classic-777/theme/theme.json')
  })
})

describe('parseTheme', () => {
  it('심볼과 배경 URL을 모두 푼다', () => {
    const theme = parseTheme(validJson, '/games/demo')
    expect(theme.symbols['a']).toBe('/games/demo/theme/symbols/a.svg')
    expect(theme.symbols['b']).toBe('/games/demo/theme/symbols/b.svg')
    expect(theme.background).toBe('/games/demo/theme/bg.svg')
    expect(theme.palette.winLine).toEqual(['#f4d98a', '#4fc3d9'])
  })

  it('sfx 키가 없으면 sfx 자체를 만들지 않는다', () => {
    expect(parseTheme(validJson, '/games/demo').sfx).toBeUndefined()
  })

  it('선언된 sfx만 URL로 푼다', () => {
    const theme = parseTheme({ ...validJson, sfx: { spin: 'sfx/spin.ogg' } }, '/games/demo')
    expect(theme.sfx).toEqual({ spin: '/games/demo/theme/sfx/spin.ogg' })
  })

  it('색 형식이 틀리면 ThemeError를 던진다', () => {
    const broken = { ...validJson, palette: { ...validJson.palette, frame: 'gold' } }
    expect(() => parseTheme(broken, '/games/demo')).toThrow(ThemeError)
  })

  it('winLine 팔레트가 비면 던진다', () => {
    const broken = { ...validJson, palette: { ...validJson.palette, winLine: [] } }
    expect(() => parseTheme(broken, '/games/demo')).toThrow(ThemeError)
  })

  it('math의 심볼이 빠지면 어떤 id가 없는지 알려준다', () => {
    const math = { symbols: [{ id: 'a' }, { id: 'zzz' }] }
    expect(() => parseTheme(validJson, '/games/demo', { require: math })).toThrow(/zzz/)
  })

  it('math의 심볼을 모두 덮으면 통과한다', () => {
    const math = { symbols: [{ id: 'a' }, { id: 'b' }] }
    expect(parseTheme(validJson, '/games/demo', { require: math }).symbols['a']).toBeTruthy()
  })
})

describe('loadTheme', () => {
  it('theme.json을 읽어 Theme을 만든다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(validJson), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const theme = await loadTheme('/games/demo', undefined, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledWith('/games/demo/theme/theme.json', undefined)
    expect(theme.symbols['a']).toBe('/games/demo/theme/symbols/a.svg')
  })

  it('두 번째 인자로 받은 math로 심볼 커버리지를 검사한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validJson), { status: 200 }))
    await expect(
      loadTheme('/games/demo', { symbols: [{ id: 'missing' }] }, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(ThemeError)
  })

  it('응답이 실패면 상태 코드를 담아 던진다', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }))
    await expect(
      loadTheme('/games/demo', undefined, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/404/)
  })
})

describe('resolveSymbolSource', () => {
  const theme: Theme = {
    symbols: { a: '/a.svg', empty: '   ' },
    palette: { frame: '#000000', reelBg: '#000000', winLine: ['#ffffff'], text: '#ffffff' },
  }

  it('URL이 있으면 그 URL을 쓴다', () => {
    expect(resolveSymbolSource(theme, 'a')).toEqual({ kind: 'url', url: '/a.svg' })
  })

  it('URL이 없으면 폴백 텍스처 경로를 고른다', () => {
    expect(resolveSymbolSource(theme, 'nope')).toEqual({ kind: 'fallback', label: 'nope' })
  })

  it('URL이 공백뿐이어도 폴백이다', () => {
    expect(resolveSymbolSource(theme, 'empty')).toEqual({ kind: 'fallback', label: 'empty' })
  })
})

describe('classic-777 실제 테마 팩', () => {
  const math = loadGameMath('classic-777')

  it('math.json의 심볼을 하나도 빠짐없이 덮는다', () => {
    const theme = parseTheme(loadThemeJson('classic-777'), '/games/classic-777', { require: math })
    for (const symbol of math.symbols) {
      expect(theme.symbols[symbol.id]).toMatch(/^\/games\/classic-777\/theme\/symbols\/.+\.(svg|webp|png)$/)
    }
  })

  it('페이라인 수만큼 승리선 색을 갖는다', () => {
    const theme = parseTheme(loadThemeJson('classic-777'), '/games/classic-777')
    expect(theme.palette.winLine.length).toBeGreaterThanOrEqual(math.paylines.length)
  })

  it('배경을 선언하고 효과음은 선언하지 않는다', () => {
    const theme = parseTheme(loadThemeJson('classic-777'), '/games/classic-777')
    expect(theme.background).toBe('/games/classic-777/theme/bg.svg')
    expect(theme.sfx).toBeUndefined()
  })

  it('아직 프레임 아트가 없어 벡터 베젤 경로를 탄다', () => {
    // theme-gen이 frame.webp를 만들어 theme.json에 기록하면 이 기대값이 바뀐다.
    const theme = parseTheme(loadThemeJson('classic-777'), '/games/classic-777')
    expect(theme.frame).toBeUndefined()
    expect(theme.frameLayout).toBeUndefined()
  })
})

describe('프레임 아트', () => {
  const framedJson = { ...validJson, frame: 'frame.webp' }

  it('frame 경로를 배경과 같은 규칙으로 푼다', () => {
    expect(parseTheme(framedJson, '/games/demo').frame).toBe('/games/demo/theme/frame.webp')
  })

  it('절대 URL은 그대로 둔다', () => {
    const theme = parseTheme({ ...validJson, frame: 'https://cdn.example/frame.webp' }, '/games/demo')
    expect(theme.frame).toBe('https://cdn.example/frame.webp')
  })

  it('frameLayout이 없으면 ART_DIRECTION 기본 창을 채운다', () => {
    expect(parseTheme(framedJson, '/games/demo').frameLayout).toEqual({
      window: { x: 0.08, y: 0.22, w: 0.84, h: 0.46 },
    })
    expect(DEFAULT_FRAME_WINDOW).toEqual({ x: 0.08, y: 0.22, w: 0.84, h: 0.46 })
  })

  it('frameLayout을 주면 그 값을 쓴다', () => {
    const theme = parseTheme(
      { ...framedJson, frameLayout: { window: { x: 0.1, y: 0.3, w: 0.8, h: 0.4 } } },
      '/games/demo',
    )
    expect(theme.frameLayout).toEqual({ window: { x: 0.1, y: 0.3, w: 0.8, h: 0.4 } })
  })

  it('frame이 없으면 frameLayout도 만들지 않는다', () => {
    const theme = parseTheme(validJson, '/games/demo')
    expect(theme.frame).toBeUndefined()
    expect(theme.frameLayout).toBeUndefined()
  })

  it('frame 없이 frameLayout만 있어도 보존한다', () => {
    const theme = parseTheme({ ...validJson, frameLayout: { window: { x: 0, y: 0, w: 1, h: 1 } } }, '/games/demo')
    expect(theme.frame).toBeUndefined()
    expect(theme.frameLayout).toEqual({ window: { x: 0, y: 0, w: 1, h: 1 } })
  })

  it('창이 프레임 밖으로 넘치면 던진다', () => {
    expect(() =>
      parseTheme({ ...framedJson, frameLayout: { window: { x: 0.5, y: 0, w: 0.6, h: 0.4 } } }, '/games/demo'),
    ).toThrow(ThemeError)
    expect(() =>
      parseTheme({ ...framedJson, frameLayout: { window: { x: 0, y: 0.8, w: 0.5, h: 0.4 } } }, '/games/demo'),
    ).toThrow(ThemeError)
  })

  it('분수 범위를 벗어나거나 폭이 0이면 던진다', () => {
    expect(() =>
      parseTheme({ ...framedJson, frameLayout: { window: { x: -0.1, y: 0, w: 0.5, h: 0.4 } } }, '/games/demo'),
    ).toThrow(ThemeError)
    expect(() =>
      parseTheme({ ...framedJson, frameLayout: { window: { x: 0, y: 0, w: 0, h: 0.4 } } }, '/games/demo'),
    ).toThrow(ThemeError)
  })

  it('빈 frame 문자열은 거부한다', () => {
    expect(() => parseTheme({ ...validJson, frame: '' }, '/games/demo')).toThrow(ThemeError)
  })
})

describe('resolveFrameWindow', () => {
  it('frameLayout이 있으면 그 창을 쓴다', () => {
    const window = { x: 0.1, y: 0.2, w: 0.5, h: 0.5 }
    expect(resolveFrameWindow({ frameLayout: { window } })).toEqual(window)
  })

  it('없으면 기본 창으로 되돌린다', () => {
    expect(resolveFrameWindow({})).toEqual({ ...DEFAULT_FRAME_WINDOW })
  })
})
