import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePromptsFile, resolveAssetPrompt } from './schema.js'

const fixturePath = fileURLToPath(new URL('../fixtures/prompts.json', import.meta.url))
const fixtureJson = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown

describe('parsePromptsFile', () => {
  it('고정 픽스처를 통과시킨다', () => {
    const file = parsePromptsFile(fixtureJson)
    expect(file.game).toBe('classic-777')
    expect(file.assets.length).toBeGreaterThan(0)
  })

  it('필수 필드가 없으면 던진다', () => {
    expect(() => parsePromptsFile({})).toThrow(/prompts\.json 검증 실패/)
  })

  it('알 수 없는 kind를 거부한다', () => {
    const bad = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'sprite', prompt: 'p', size: '1024x1024', out: 'o.webp', outSize: 100 }],
    }
    expect(() => parsePromptsFile(bad)).toThrow()
  })

  it('허용되지 않은 size를 거부한다', () => {
    const bad = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'p', size: '2048x2048', out: 'o.webp', outSize: 100 }],
    }
    expect(() => parsePromptsFile(bad)).toThrow()
  })

  it('asset id 중복을 거부한다', () => {
    const dup = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        { id: 'a', kind: 'symbol', prompt: 'p', size: '1024x1024', out: 'a1.webp', outSize: 100 },
        { id: 'a', kind: 'symbol', prompt: 'p2', size: '1024x1024', out: 'a2.webp', outSize: 100 },
      ],
    }
    expect(() => parsePromptsFile(dup)).toThrow(/중복/)
  })

  it('transparent 기본값은 false다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'bg', prompt: 'p', size: '1024x1024', out: 'o.webp', outSize: 100 }],
    })
    expect(file.assets[0]?.transparent).toBe(false)
  })

  it('1536x1536(sprite sheet 콘택트시트용)도 허용되는 size다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        {
          id: 'seven-win',
          kind: 'sheet',
          symbol: 'seven',
          grid: { cols: 3, rows: 3 },
          fps: 12,
          prompt: 'p',
          size: '1536x1536',
          transparent: true,
          out: 'theme/sheets/seven-win.webp',
          outSize: 1536,
        },
      ],
    })
    expect(file.assets[0]?.size).toBe('1536x1536')
  })

  it("kind가 sheet면 symbol/grid/fps가 필요하다", () => {
    const missingGrid = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'seven-win', kind: 'sheet', symbol: 'seven', fps: 12, prompt: 'p', size: '1536x1536', out: 'o.webp', outSize: 100 }],
    }
    expect(() => parsePromptsFile(missingGrid)).toThrow(/grid/)

    const missingSymbol = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        { id: 'seven-win', kind: 'sheet', grid: { cols: 3, rows: 3 }, fps: 12, prompt: 'p', size: '1536x1536', out: 'o.webp', outSize: 100 },
      ],
    }
    expect(() => parsePromptsFile(missingSymbol)).toThrow(/symbol/)

    const missingFps = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        {
          id: 'seven-win',
          kind: 'sheet',
          symbol: 'seven',
          grid: { cols: 3, rows: 3 },
          prompt: 'p',
          size: '1536x1536',
          out: 'o.webp',
          outSize: 100,
        },
      ],
    }
    expect(() => parsePromptsFile(missingFps)).toThrow(/fps/)
  })

  it('grid.cols/rows와 fps는 양의 정수여야 한다', () => {
    const bad = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        {
          id: 'seven-win',
          kind: 'sheet',
          symbol: 'seven',
          grid: { cols: 0, rows: 3 },
          fps: 12,
          prompt: 'p',
          size: '1536x1536',
          out: 'o.webp',
          outSize: 100,
        },
      ],
    }
    expect(() => parsePromptsFile(bad)).toThrow()
  })

  it('kind가 sheet가 아니면 symbol/grid/fps가 없어도 통과한다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'p', size: '1024x1024', out: 'o.webp', outSize: 100 }],
    })
    expect(file.assets[0]?.grid).toBeUndefined()
  })

  it("kind가 sheet면 out은 .webp로 끝나야 한다 (JSON 사이드카가 같은 이름을 쓰기 때문)", () => {
    const bad = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        {
          id: 'seven-win',
          kind: 'sheet',
          symbol: 'seven',
          grid: { cols: 3, rows: 3 },
          fps: 12,
          prompt: 'p',
          size: '1536x1536',
          out: 'theme/sheets/seven-win.png',
          outSize: 100,
        },
      ],
    }
    expect(() => parsePromptsFile(bad)).toThrow(/\.webp/)
  })

  it('out이 절대경로면 거부한다', () => {
    const bad = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'p', size: '1024x1024', out: '/etc/passwd', outSize: 100 }],
    }
    expect(() => parsePromptsFile(bad)).toThrow(/게임 폴더 밖/)
  })

  it("out에 '..' 세그먼트가 있으면 거부한다(게임 폴더 밖 탈출 방지)", () => {
    const bad = {
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'p', size: '1024x1024', out: 'theme/../../secrets/a.webp', outSize: 100 }],
    }
    expect(() => parsePromptsFile(bad)).toThrow(/게임 폴더 밖/)
  })

  it('평범한 상대경로 out은 통과한다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'p', size: '1024x1024', out: 'theme/symbols/a.webp', outSize: 100 }],
    })
    expect(file.assets[0]?.out).toBe('theme/symbols/a.webp')
  })
})

describe('resolveAssetPrompt', () => {
  it('stylePrefix와 asset prompt를 합친다', () => {
    const file = parsePromptsFile(fixtureJson)
    const asset = file.assets[0]
    if (asset === undefined) throw new Error('fixture asset 없음')
    expect(resolveAssetPrompt(file, asset)).toBe(`${file.stylePrefix}, ${asset.prompt}`)
  })

  it('asset.prompt가 이미 stylePrefix로 시작하면 다시 붙이지 않는다 (idempotent)', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 'flat vector icon, bold linework',
      negative: 'n',
      assets: [
        {
          id: 'a',
          kind: 'symbol',
          prompt: 'flat vector icon, bold linework — a red seven',
          size: '1024x1024',
          out: 'a.webp',
          outSize: 100,
        },
      ],
    })
    const asset = file.assets[0]
    if (asset === undefined) throw new Error('asset 없음')
    expect(resolveAssetPrompt(file, asset)).toBe('flat vector icon, bold linework — a red seven')
  })

  it('stylePrefix/asset.prompt 양쪽의 앞뒤 공백은 무시하고 비교·결합한다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: '  flat vector icon  ',
      negative: 'n',
      assets: [
        { id: 'a', kind: 'symbol', prompt: '  flat vector icon — a red seven  ', size: '1024x1024', out: 'a.webp', outSize: 100 },
        { id: 'b', kind: 'symbol', prompt: '  a golden bell  ', size: '1024x1024', out: 'b.webp', outSize: 100 },
      ],
    })
    const assetA = file.assets[0]
    const assetB = file.assets[1]
    if (assetA === undefined || assetB === undefined) throw new Error('asset 없음')
    expect(resolveAssetPrompt(file, assetA)).toBe('flat vector icon — a red seven')
    expect(resolveAssetPrompt(file, assetB)).toBe('flat vector icon, a golden bell')
  })

  it('대소문자가 다르면 접두어로 보지 않고 그대로 붙인다 (대소문자 구분 비교)', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 'Flat Vector Icon',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'flat vector icon — a red seven', size: '1024x1024', out: 'a.webp', outSize: 100 }],
    })
    const asset = file.assets[0]
    if (asset === undefined) throw new Error('asset 없음')
    expect(resolveAssetPrompt(file, asset)).toBe('Flat Vector Icon, flat vector icon — a red seven')
  })

  it('kind가 sheet면 격자 지시문을 끝에 덧붙인다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 'style',
      negative: 'n',
      assets: [
        {
          id: 'seven-win',
          kind: 'sheet',
          symbol: 'seven',
          grid: { cols: 3, rows: 4 },
          fps: 12,
          prompt: 'a red seven symbol glowing and pulsing for a win celebration',
          size: '1536x1536',
          transparent: true,
          out: 'theme/sheets/seven-win.webp',
          outSize: 1536,
        },
      ],
    })
    const asset = file.assets[0]
    if (asset === undefined) throw new Error('asset 없음')
    const resolved = resolveAssetPrompt(file, asset)

    expect(resolved).toContain('style, a red seven symbol glowing and pulsing for a win celebration')
    expect(resolved).toContain('Render exactly 3×4 equal cells in a grid')
    expect(resolved).toContain('each cell one animation frame of the SAME object')
    expect(resolved).toContain('identical camera/scale/position')
    // count = cols*rows = 12
    expect(resolved).toContain('frame N shows the pose at time N/12')
    // loopDescription은 asset.prompt 본문을 그대로 재사용한다.
    expect(resolved).toContain('a red seven symbol glowing and pulsing for a win celebration;')
    expect(resolved).toContain('no borders, no labels, transparent background.')
  })

  it('kind가 sheet가 아니면 격자 지시문을 안 붙인다', () => {
    const file = parsePromptsFile({
      game: 'g',
      concept: 'c',
      stylePrefix: 'style',
      negative: 'n',
      assets: [{ id: 'a', kind: 'symbol', prompt: 'a red seven', size: '1024x1024', out: 'a.webp', outSize: 100 }],
    })
    const asset = file.assets[0]
    if (asset === undefined) throw new Error('asset 없음')
    expect(resolveAssetPrompt(file, asset)).not.toContain('Render exactly')
  })
})
