import { describe, expect, it } from 'vitest'
import { mergeTheme } from './themeWriter.js'

describe('mergeTheme', () => {
  it('파일이 없으면 빈 palette로 새로 만든다', () => {
    const merged = mergeTheme(undefined, { symbols: { seven: 'symbols/seven.webp' } })
    expect(merged).toEqual({ symbols: { seven: 'symbols/seven.webp' }, palette: {} })
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
})
