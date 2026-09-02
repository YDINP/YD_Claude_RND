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
})
