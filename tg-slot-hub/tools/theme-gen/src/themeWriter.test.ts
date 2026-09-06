import { describe, expect, it } from 'vitest'
import { THEME_DEFAULT_PALETTE, THEME_DEFAULT_VERSION } from './constants.js'
import { deepMerge, mergeTheme } from './themeWriter.js'

describe('mergeTheme', () => {
  it('파일이 없으면 허브 기본 palette/version으로 새로 만든다', () => {
    const merged = mergeTheme(undefined, { symbols: { seven: 'symbols/seven.webp' } })
    expect(merged).toEqual({
      symbols: { seven: 'symbols/seven.webp' },
      palette: THEME_DEFAULT_PALETTE,
      version: THEME_DEFAULT_VERSION,
    })
  })

  it('palette 키가 아예 없는 기존 파일에도 기본 palette를 채운다', () => {
    const merged = mergeTheme({ symbols: { seven: 'seven.webp' } }, { symbols: {} })
    expect(merged.palette).toEqual(THEME_DEFAULT_PALETTE)
    expect(merged.version).toBe(THEME_DEFAULT_VERSION)
  })

  it('이미 palette/version이 있으면 기본값으로 덮지 않는다', () => {
    const existing = { version: '2.0.0', palette: { frame: '#111', reelBg: '#222', winLine: ['#333'], text: '#444' } }
    const merged = mergeTheme(existing, { symbols: {} })
    expect(merged.version).toBe('2.0.0')
    expect(merged.palette).toEqual({ frame: '#111', reelBg: '#222', winLine: ['#333'], text: '#444' })
  })

  it('기본 palette는 원본 상수를 공유하지 않는 복사본이다 (다음 호출에 오염 안 됨)', () => {
    const merged = mergeTheme(undefined, {}) as { palette: { winLine: string[] } }
    merged.palette.winLine.push('#000000')
    const again = mergeTheme(undefined, {}) as { palette: { winLine: string[] } }
    expect(again.palette.winLine).toEqual(THEME_DEFAULT_PALETTE.winLine)
  })

  it('backgroundFreeSpins은 지정했을 때만 덮어쓰고 background와 별개로 유지된다', () => {
    const existing = { background: 'bg.webp', palette: {} }
    const merged = mergeTheme(existing, { backgroundFreeSpins: 'bg-freespins.webp' })
    expect(merged.background).toBe('bg.webp')
    expect(merged.backgroundFreeSpins).toBe('bg-freespins.webp')
  })

  it('기존 심볼과 새 심볼을 합친다 (겹치면 새 값이 이긴다)', () => {
    const existing = { symbols: { seven: 'old.webp', bell: 'bell.webp' }, palette: { frame: '#fff' } }
    const merged = mergeTheme(existing, { symbols: { seven: 'new.webp' } })
    expect(merged.symbols).toEqual({ seven: 'new.webp', bell: 'bell.webp' })
  })

  it('모르는 키(version, sfx 등)를 그대로 보존한다', () => {
    const existing = {
      version: '1.0.0',
      symbols: { seven: 'seven.webp' },
      palette: { frame: '#fff', reelBg: '#000', winLine: ['#f00'], text: '#fff' },
      sfx: { spin: 'sfx/spin.ogg' },
    }
    const merged = mergeTheme(existing, { symbols: { bell: 'bell.webp' } })
    expect(merged.version).toBe('1.0.0')
    expect(merged.sfx).toEqual({ spin: 'sfx/spin.ogg' })
    expect(merged.palette).toEqual({ frame: '#fff', reelBg: '#000', winLine: ['#f00'], text: '#fff' })
    expect(merged.symbols).toEqual({ seven: 'seven.webp', bell: 'bell.webp' })
  })

  it('frame/background는 지정했을 때만 덮어쓴다', () => {
    const existing = { background: 'old-bg.webp', palette: {} }
    const merged = mergeTheme(existing, { symbols: {} })
    expect(merged.background).toBe('old-bg.webp')
    expect(merged.frame).toBeUndefined()

    const merged2 = mergeTheme(existing, { frame: 'frame.webp', background: 'new-bg.webp' })
    expect(merged2.frame).toBe('frame.webp')
    expect(merged2.background).toBe('new-bg.webp')
  })

  it('심볼이 하나도 없는 갱신이면 기존에 symbols 키가 없던 파일에 빈 객체를 추가하지 않는다', () => {
    const existing = { palette: {} }
    const merged = mergeTheme(existing, { frame: 'frame.webp' })
    expect(merged.symbols).toBeUndefined()
  })

  it('frameLayout을 지정했을 때만 덮어쓰고 다른 키는 보존한다', () => {
    const existing = { frame: 'frame.webp', frameLayout: { window: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }, palette: {} }

    const untouched = mergeTheme(existing, { symbols: {} })
    expect(untouched.frameLayout).toEqual({ window: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } })

    const updated = mergeTheme(existing, { frameLayout: { window: { x: 0.09, y: 0.19, w: 0.82, h: 0.61 } } })
    expect(updated.frameLayout).toEqual({ window: { x: 0.09, y: 0.19, w: 0.82, h: 0.61 } })
    expect(updated.frame).toBe('frame.webp')
  })

  it('frameLayout이 없던 파일에도 새로 추가한다', () => {
    const merged = mergeTheme({ palette: {} }, { frameLayout: { window: { x: 0, y: 0, w: 1, h: 1 } } })
    expect(merged.frameLayout).toEqual({ window: { x: 0, y: 0, w: 1, h: 1 } })
  })

  it('sheets가 없던 파일에 새로 추가한다', () => {
    const merged = mergeTheme({ palette: {} }, { sheets: { seven: { win: 'sheets/seven-win.json' } } })
    expect(merged.sheets).toEqual({ seven: { win: 'sheets/seven-win.json' } })
  })

  it('같은 symbol의 다른 애니메이션은 덮지 않고 추가된다', () => {
    const existing = { sheets: { seven: { win: 'sheets/seven-win.json' } }, palette: {} }
    const merged = mergeTheme(existing, { sheets: { seven: { idle: 'sheets/seven-idle.json' } } })
    expect(merged.sheets).toEqual({ seven: { win: 'sheets/seven-win.json', idle: 'sheets/seven-idle.json' } })
  })

  it('같은 symbol+애니메이션 이름이 겹치면 새 값이 이긴다', () => {
    const existing = { sheets: { seven: { win: 'old/seven-win.json' } }, palette: {} }
    const merged = mergeTheme(existing, { sheets: { seven: { win: 'new/seven-win.json' } } })
    expect(merged.sheets).toEqual({ seven: { win: 'new/seven-win.json' } })
  })

  it('다른 symbol의 시트는 건드리지 않는다', () => {
    const existing = { sheets: { seven: { win: 'sheets/seven-win.json' } }, palette: {} }
    const merged = mergeTheme(existing, { sheets: { bell: { win: 'sheets/bell-win.json' } } })
    expect(merged.sheets).toEqual({
      seven: { win: 'sheets/seven-win.json' },
      bell: { win: 'sheets/bell-win.json' },
    })
  })

  it('sheets를 지정하지 않으면 기존 값을 그대로 둔다', () => {
    const existing = { sheets: { seven: { win: 'sheets/seven-win.json' } }, palette: {} }
    const merged = mergeTheme(existing, { symbols: {} })
    expect(merged.sheets).toEqual({ seven: { win: 'sheets/seven-win.json' } })
  })
})

describe('mergeTheme — 모르는 키 보존 (deep merge)', () => {
  it('손으로 쓴 transitions 키를 재생성이 지우지 않는다', () => {
    const existing = {
      version: '1.0.0',
      symbols: { wild: 'symbols/wild.webp' },
      palette: { frame: '#fff', reelBg: '#000', winLine: ['#f00'], text: '#fff' },
      transitions: { freeSpinsEnter: 'transitions/fs-enter.webm' },
    }
    const merged = mergeTheme(existing, {
      symbols: { wild: 'symbols/wild.webp', seven: 'symbols/seven.webp' },
      frame: 'frame.webp',
      frameLayout: { window: { x: 0.02, y: 0.19, w: 0.96, h: 0.62 } },
    })
    expect(merged.transitions).toEqual({ freeSpinsEnter: 'transitions/fs-enter.webm' })
  })

  it('중첩된 모르는 키도 보존한다 (얕은 병합이면 날아가는 자리)', () => {
    const existing = {
      palette: { frame: '#fff', reelBg: '#000', winLine: ['#f00'], text: '#fff' },
      transitions: { freeSpinsEnter: 'a.webm', freeSpinsExit: 'b.webm' },
      sheets: { wild: { win: 'sheets/wild-win.json', idle: 'sheets/wild-idle.json' } },
    }
    const merged = mergeTheme(existing, { sheets: { wild: { win: 'sheets/wild-win.json' } } })
    expect(merged.sheets).toEqual({ wild: { win: 'sheets/wild-win.json', idle: 'sheets/wild-idle.json' } })
    expect(merged.transitions).toEqual({ freeSpinsEnter: 'a.webm', freeSpinsExit: 'b.webm' })
  })

  it('배열은 원소 병합이 아니라 통째로 교체한다', () => {
    const existing = { palette: { frame: '#fff', reelBg: '#000', winLine: ['#a', '#b', '#c'], text: '#fff' } }
    const merged = deepMerge(existing as Record<string, unknown>, { palette: { winLine: ['#z'] } })
    expect((merged.palette as { winLine: string[] }).winLine).toEqual(['#z'])
  })

  it('원본 객체를 변형하지 않는다', () => {
    const existing = { palette: {}, transitions: { freeSpinsEnter: 'a.webm' } }
    mergeTheme(existing, { symbols: { wild: 'w.webp' } })
    expect(existing).toEqual({ palette: {}, transitions: { freeSpinsEnter: 'a.webm' } })
  })
})

describe('mergeTheme — fx', () => {
  it('art/fx.json에서 온 fx를 theme.json에 채운다', () => {
    const merged = mergeTheme({ palette: {} }, { fx: { default: { win: [{ type: 'pulse', scale: 1.1 }] } } })
    expect(merged.fx).toEqual({ default: { win: [{ type: 'pulse', scale: 1.1 }] } })
  })

  it('fx를 주지 않으면 기존 fx를 그대로 둔다', () => {
    const existing = { palette: {}, fx: { wild: { win: [{ type: 'shine' }] } } }
    expect(mergeTheme(existing, { symbols: { wild: 'w.webp' } }).fx).toEqual({ wild: { win: [{ type: 'shine' }] } })
  })

  it('같은 심볼의 연출은 새 값이 이긴다 (효과 배열은 통째로 교체)', () => {
    const existing = { palette: {}, fx: { wild: { win: [{ type: 'shine' }, { type: 'glow' }] } } }
    const merged = mergeTheme(existing, { fx: { wild: { win: [{ type: 'pulse' }] } } })
    expect(merged.fx).toEqual({ wild: { win: [{ type: 'pulse' }] } })
  })
})
