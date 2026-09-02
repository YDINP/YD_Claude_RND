import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRAME_WINDOW } from './constants.js'
import { resolveSymbolFx } from './fx.js'
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
    expect(theme.background).toBe('/games/classic-777/theme/bg.webp')
    expect(theme.sfx).toBeUndefined()
  })

  it('프레임 아트와 실측된 창을 함께 선언한다', () => {
    // theme-gen이 생성한 이미지에서 초록 창을 직접 재어 기록한다.
    // 값은 아트가 바뀌면 달라지므로 고정하지 않고 "창이 프레임 안에 있다"만 확인한다.
    const theme = parseTheme(loadThemeJson('classic-777'), '/games/classic-777')
    expect(theme.frame).toBe('/games/classic-777/theme/frame.webp')

    const window = theme.frameLayout?.window
    expect(window).toBeDefined()
    if (window === undefined) return
    expect(window.x + window.w).toBeLessThanOrEqual(1)
    expect(window.y + window.h).toBeLessThanOrEqual(1)
    expect(window.w).toBeGreaterThan(0.5)
    expect(window.h).toBeGreaterThan(0.2)
  })

  it('실측 창이 가로로 거의 가운데에 있다', () => {
    // 아트 생성이 크게 어긋나 창을 한쪽으로 몰아 그렸다면 여기서 걸린다.
    // 세로 위치는 마퀴가 위를 차지하므로 가운데가 아니어도 정상이다.
    const window = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').frameLayout?.window
    if (window === undefined) throw new Error('frameLayout 없음')
    const leftGap = window.x
    const rightGap = 1 - (window.x + window.w)
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(0.05)
  })

  it('창 비율이 3x3 격자를 담기에 무리가 없다', () => {
    // 창이 지나치게 납작하면 격자가 세로에 묶여 심볼이 작아진다.
    // 이 값이 1보다 작아야(=세로가 더 긺) 심볼이 폭 기준으로 커진다.
    const window = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').frameLayout?.window
    if (window === undefined) throw new Error('frameLayout 없음')
    const aspect = (window.w * 1080) / (window.h * 1620)
    expect(aspect).toBeGreaterThan(0.6)
    expect(aspect).toBeLessThan(1.15)
  })

  it('생성된 에셋은 전부 webp다', () => {
    const theme = parseTheme(loadThemeJson('classic-777'), '/games/classic-777')
    for (const url of Object.values(theme.symbols)) {
      expect(url).toMatch(/\.webp$/)
    }
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

describe('심볼 연출(fx) 스키마', () => {
  const withFx = {
    ...validJson,
    fx: {
      default: { win: [{ type: 'pulse', scale: 1.12, durationMs: 600 }] },
      a: { win: [{ type: 'burst', particles: 24 }, { type: 'glow', color: '#f4d98a' }] },
      b: { win: [] },
    },
  }

  it('fx가 없어도 파싱된다', () => {
    expect(parseTheme(validJson, '/games/demo').fx).toBeUndefined()
  })

  it('fx를 그대로 실어 나른다', () => {
    const theme = parseTheme(withFx, '/games/demo')
    expect(theme.fx?.['a']?.win?.[0]?.type).toBe('burst')
    expect(theme.fx?.['default']?.win).toHaveLength(1)
  })

  it('빈 연출 배열을 지운 것으로 착각하지 않는다', () => {
    expect(parseTheme(withFx, '/games/demo').fx?.['b']?.win).toEqual([])
  })

  it('여덟 가지 타입을 모두 받는다', () => {
    const all = ['pulse', 'shine', 'wobble', 'bounce', 'burst', 'glow', 'flash', 'spin']
    const theme = parseTheme(
      { ...validJson, fx: { a: { win: all.map((type) => ({ type })) } } },
      '/games/demo',
    )
    expect(theme.fx?.['a']?.win?.map((effect) => effect.type)).toEqual(all)
  })

  it('모르는 타입은 거부한다', () => {
    expect(() =>
      parseTheme({ ...validJson, fx: { a: { win: [{ type: 'explode' }] } } }, '/games/demo'),
    ).toThrow(ThemeError)
  })

  it('길이나 파티클 수가 0 이하면 거부한다', () => {
    expect(() =>
      parseTheme({ ...validJson, fx: { a: { win: [{ type: 'pulse', durationMs: 0 }] } } }, '/games/demo'),
    ).toThrow(ThemeError)
    expect(() =>
      parseTheme({ ...validJson, fx: { a: { win: [{ type: 'burst', particles: -1 }] } } }, '/games/demo'),
    ).toThrow(ThemeError)
  })

  it('intensity 범위를 벗어나면 거부한다', () => {
    expect(() =>
      parseTheme({ ...validJson, fx: { a: { win: [{ type: 'pulse', intensity: 2 }] } } }, '/games/demo'),
    ).toThrow(ThemeError)
  })

  it('glow 색은 팔레트와 같은 형식만 받는다', () => {
    expect(() =>
      parseTheme({ ...validJson, fx: { a: { win: [{ type: 'glow', color: 'gold' }] } } }, '/games/demo'),
    ).toThrow(ThemeError)
  })
})

describe('classic-777 연출 팩', () => {
  const math = loadGameMath('classic-777')

  it('math의 심볼을 모두 덮고 default도 갖는다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    expect(fx).toBeDefined()
    expect(fx?.['default']?.win?.length).toBeGreaterThan(0)
    for (const symbol of math.symbols) {
      expect(fx?.[symbol.id]).toBeDefined()
    }
  })

  it('그룹 id는 연출 키가 아니다', () => {
    // 그룹 배당은 자리마다 실제 심볼로 연출을 찾으므로 그룹 항목을 둘 이유가 없다.
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    for (const groupId of Object.keys(math.groups ?? {})) {
      expect(fx?.[groupId]).toBeUndefined()
    }
  })

  it('그룹 멤버는 저마다 연출을 갖는다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    for (const group of Object.values(math.groups ?? {})) {
      for (const member of group.members) {
        expect(fx?.[member]).toBeDefined()
      }
    }
  })

  it('와일드는 가장 화려하다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    expect(fx?.['wild']?.win?.map((effect) => effect.type)).toEqual(['burst', 'glow', 'spin'])
  })

  it('연출 없는 심볼이 있다면 빈 배열로 명시돼 있다', () => {
    // `blank`처럼 배당이 없는 심볼은 팩에서 빠질 수 있다. 있을 때만 규칙을 검사한다.
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    const silent = fx?.['blank']
    if (silent === undefined) return
    expect(silent.win).toEqual([])
  })

  it('BAR 3종이 구획 수만 다르고 나머지는 같다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    expect(fx?.['bar3']?.win?.[0]).toMatchObject({ type: 'flash', segments: 3, stagger: true })
    expect(fx?.['bar2']?.win?.[0]).toMatchObject({ type: 'flash', segments: 2, stagger: true })
    // bar1은 구획을 나누지 않아 통째로 깜빡인다.
    expect(fx?.['bar1']?.win?.[0]?.segments).toBeUndefined()
  })

  it('와일드의 회전은 한 번만 돌고 멈춘다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    const spin = fx?.['wild']?.win?.find((effect) => effect.type === 'spin')
    expect(spin?.repeat).toBe(1)
  })

  it('벨과 체리는 두 연출을 겹쳐 재생한다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    expect(fx?.['bell']?.win?.map((effect) => effect.type)).toEqual(['wobble', 'glow'])
    expect(fx?.['cherry']?.win?.map((effect) => effect.type)).toEqual(['bounce', 'wobble'])
  })

  it('모든 심볼이 모션 축소에서 pulse 하나로 줄어든다', () => {
    const fx = parseTheme(loadThemeJson('classic-777'), '/games/classic-777').fx
    for (const symbol of math.symbols) {
      const effects = resolveSymbolFx(fx, symbol.id, true)
      expect(effects.length).toBeLessThanOrEqual(1)
      for (const effect of effects) expect(effect.type).toBe('pulse')
    }
  })
})

describe('배당 없는 심볼이 팩에서 빠져도 견딘다', () => {
  // 엔진이 `blank`를 걷어내는 중이다. 있든 없든 테마 검증이 통과해야 한다.
  function stripSymbol(json: unknown, id: string): unknown {
    const theme = structuredClone(json) as {
      symbols: Record<string, string>
      fx?: Record<string, unknown>
    }
    delete theme.symbols[id]
    if (theme.fx !== undefined) delete theme.fx[id]
    return theme
  }

  const math = loadGameMath('classic-777')
  const withoutBlank = stripSymbol(loadThemeJson('classic-777'), 'blank')
  const remaining = math.symbols.filter((symbol) => symbol.id !== 'blank')

  it('blank를 뺀 테마도 그대로 파싱된다', () => {
    expect(() => parseTheme(withoutBlank, '/games/classic-777')).not.toThrow()
  })

  it('남은 심볼만 요구하면 커버리지 검사를 통과한다', () => {
    expect(() =>
      parseTheme(withoutBlank, '/games/classic-777', { require: { symbols: remaining } }),
    ).not.toThrow()
  })

  it('blank가 없어도 나머지 심볼은 전부 연출을 갖는다', () => {
    const fx = parseTheme(withoutBlank, '/games/classic-777').fx
    for (const symbol of remaining) {
      expect(fx?.[symbol.id]).toBeDefined()
    }
  })

  it('blank가 빠지면 그 심볼 연출도 함께 사라진다', () => {
    expect(parseTheme(withoutBlank, '/games/classic-777').fx?.['blank']).toBeUndefined()
  })
})

describe('프리스핀 배경', () => {
  it('경로를 기본 배경과 같은 규칙으로 푼다', () => {
    const theme = parseTheme({ ...validJson, backgroundFreeSpins: 'bg-fs.webp' }, '/games/demo')
    expect(theme.backgroundFreeSpins).toBe('/games/demo/theme/bg-fs.webp')
  })

  it('절대 URL은 그대로 둔다', () => {
    const theme = parseTheme(
      { ...validJson, backgroundFreeSpins: 'https://cdn.example/fs.webp' },
      '/games/demo',
    )
    expect(theme.backgroundFreeSpins).toBe('https://cdn.example/fs.webp')
  })

  it('없으면 만들지 않는다', () => {
    // 렌더러가 금빛 틴트로 대신한다.
    expect(parseTheme(validJson, '/games/demo').backgroundFreeSpins).toBeUndefined()
  })

  it('빈 문자열은 거부한다', () => {
    expect(() => parseTheme({ ...validJson, backgroundFreeSpins: '' }, '/games/demo')).toThrow(ThemeError)
  })

  it('기본 배경과 따로 논다', () => {
    const theme = parseTheme(
      { ...validJson, background: 'bg.webp', backgroundFreeSpins: 'bg-fs.webp' },
      '/games/demo',
    )
    expect(theme.background).toBe('/games/demo/theme/bg.webp')
    expect(theme.backgroundFreeSpins).toBe('/games/demo/theme/bg-fs.webp')
  })
})

describe('스프라이트 시트 선언', () => {
  const withSheets = {
    ...validJson,
    sheets: { a: { win: 'sheets/a.json' }, b: {} },
  }

  it('시트 경로를 다른 에셋과 같은 규칙으로 푼다', () => {
    const theme = parseTheme(withSheets, '/games/demo')
    expect(theme.sheets?.['a']?.win).toBe('/games/demo/theme/sheets/a.json')
  })

  it('절대 URL은 그대로 둔다', () => {
    const theme = parseTheme(
      { ...validJson, sheets: { a: { win: 'https://cdn.example/a.json' } } },
      '/games/demo',
    )
    expect(theme.sheets?.['a']?.win).toBe('https://cdn.example/a.json')
  })

  it('win이 없는 항목도 받아들인다', () => {
    expect(parseTheme(withSheets, '/games/demo').sheets?.['b']).toEqual({})
  })

  it('sheets가 없으면 만들지 않는다', () => {
    expect(parseTheme(validJson, '/games/demo').sheets).toBeUndefined()
  })

  it('빈 경로는 거부한다', () => {
    expect(() => parseTheme({ ...validJson, sheets: { a: { win: '' } } }, '/games/demo')).toThrow(
      ThemeError,
    )
  })

  it('fx 타입으로 sheet를 쓸 수 있다', () => {
    const theme = parseTheme(
      { ...validJson, fx: { a: { win: [{ type: 'sheet' }] } }, sheets: { a: { win: 'sheets/a.json' } } },
      '/games/demo',
    )
    expect(theme.fx?.['a']?.win?.[0]?.type).toBe('sheet')
  })
})
