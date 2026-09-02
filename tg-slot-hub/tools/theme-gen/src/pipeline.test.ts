import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyThemeUpdate, generateAsset } from './pipeline.js'
import type { GeneratedImage, GenerateOptions, ImageProvider } from './provider/types.js'
import type { PromptAsset, PromptsFile } from './schema.js'
import type { ThemeUpdate } from './themeWriter.js'

async function fakePng(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 255 } } })
    .png()
    .toBuffer()
}

function fakeProvider(name: ImageProvider['name'], buffer: Buffer): ImageProvider {
  return {
    name,
    async generate(_options: GenerateOptions): Promise<GeneratedImage> {
      return { buffer, mimeType: 'image/png' }
    },
  }
}

const file: PromptsFile = { game: 'demo', concept: 'c', stylePrefix: 'sp', negative: 'neg', assets: [] }

let gameDir: string

beforeEach(() => {
  gameDir = mkdtempSync(join(tmpdir(), 'theme-gen-pipeline-'))
})

afterEach(() => {
  // Windows에서 sharp(libvips)가 방금 읽은 파일 핸들을 비동기로 늦게 놓는 경우가 있어 재시도를 둔다.
  rmSync(gameDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('generateAsset', () => {
  it('symbol asset을 생성해 out과 128 썸네일을 쓰고 theme update를 기록한다', async () => {
    const asset: PromptAsset = {
      id: 'seven',
      kind: 'symbol',
      prompt: 'p',
      size: '1024x1024',
      transparent: true,
      out: 'theme/symbols/seven.webp',
      outSize: 128,
    }
    const provider = fakeProvider('openai', await fakePng())
    const themeUpdate: ThemeUpdate = {}

    const result = await generateAsset(gameDir, file, asset, provider, false, themeUpdate)

    expect(result.skipped).toBe(false)
    expect(existsSync(join(gameDir, 'theme', 'symbols', 'seven.webp'))).toBe(true)
    expect(existsSync(join(gameDir, 'theme', 'symbols', 'seven@128.webp'))).toBe(true)
    expect(existsSync(join(gameDir, 'art', 'raw', 'seven.png'))).toBe(true)
    expect(themeUpdate.symbols).toEqual({ seven: 'symbols/seven.webp' })
  })

  it('force 없이 이미 출력이 있으면 건너뛰되 theme update는 기록한다', async () => {
    const asset: PromptAsset = {
      id: 'seven',
      kind: 'symbol',
      prompt: 'p',
      size: '1024x1024',
      transparent: true,
      out: 'theme/symbols/seven.webp',
      outSize: 128,
    }
    await generateAsset(gameDir, file, asset, fakeProvider('openai', await fakePng()), false, {})

    let calls = 0
    const countingProvider: ImageProvider = {
      name: 'openai',
      async generate() {
        calls += 1
        return { buffer: await fakePng(), mimeType: 'image/png' }
      },
    }
    const themeUpdate: ThemeUpdate = {}
    const result = await generateAsset(gameDir, file, asset, countingProvider, false, themeUpdate)

    expect(result.skipped).toBe(true)
    expect(calls).toBe(0)
    expect(themeUpdate.symbols).toEqual({ seven: 'symbols/seven.webp' })
  })

  it('force면 이미 있는 출력도 다시 생성한다', async () => {
    const asset: PromptAsset = {
      id: 'seven',
      kind: 'symbol',
      prompt: 'p',
      size: '1024x1024',
      transparent: true,
      out: 'theme/symbols/seven.webp',
      outSize: 128,
    }
    await generateAsset(gameDir, file, asset, fakeProvider('openai', await fakePng()), false, {})

    let calls = 0
    const countingProvider: ImageProvider = {
      name: 'openai',
      async generate() {
        calls += 1
        return { buffer: await fakePng(), mimeType: 'image/png' }
      },
    }
    const result = await generateAsset(gameDir, file, asset, countingProvider, true, {})
    expect(result.skipped).toBe(false)
    expect(calls).toBe(1)
  })

  it('frame/bg kind는 theme.frame/background에 기록되고 128 썸네일은 만들지 않는다', async () => {
    const frameAsset: PromptAsset = {
      id: 'frame',
      kind: 'frame',
      prompt: 'p',
      size: '1024x1536',
      transparent: true,
      out: 'theme/frame.webp',
      outSize: 64,
    }
    const themeUpdate: ThemeUpdate = {}
    await generateAsset(gameDir, file, frameAsset, fakeProvider('openai', await fakePng()), false, themeUpdate)

    expect(themeUpdate.frame).toBe('frame.webp')
    expect(existsSync(join(gameDir, 'theme', 'frame@128.webp'))).toBe(false)
  })

  it('thumb kind는 theme update에 아무것도 기록하지 않는다', async () => {
    const thumbAsset: PromptAsset = {
      id: 'thumb',
      kind: 'thumb',
      prompt: 'p',
      size: '1024x1024',
      transparent: false,
      out: 'art/thumb.webp',
      outSize: 64,
    }
    const themeUpdate: ThemeUpdate = {}
    await generateAsset(gameDir, file, thumbAsset, fakeProvider('openai', await fakePng()), false, themeUpdate)

    expect(themeUpdate.symbols).toBeUndefined()
    expect(themeUpdate.frame).toBeUndefined()
    expect(themeUpdate.background).toBeUndefined()
    expect(existsSync(join(gameDir, 'art', 'thumb.webp'))).toBe(true)
  })

  it('gemini + transparent면 파이프라인이 크로마키를 적용한다 (초록 배경이 사라진다)', async () => {
    const redSquare = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } } })
      .png()
      .toBuffer()
    const greenBg = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .composite([{ input: redSquare, left: 15, top: 15 }])
      .png()
      .toBuffer()

    const asset: PromptAsset = {
      id: 'bell',
      kind: 'symbol',
      prompt: 'p',
      size: '1024x1024',
      transparent: true,
      out: 'theme/symbols/bell.webp',
      outSize: 64,
    }
    await generateAsset(gameDir, file, asset, fakeProvider('gemini', greenBg), false, {})

    const outPath = join(gameDir, 'theme', 'symbols', 'bell.webp')
    expect(existsSync(outPath)).toBe(true)
    // 버퍼로 읽어 sharp에 넘기면 Windows에서 libvips가 파일 핸들을 붙잡고 있는 문제를 피할 수 있다.
    const meta = await sharp(readFileSync(outPath)).metadata()
    expect(meta.hasAlpha).toBe(true)
  })

  it('openai + transparent는 네이티브 투명 배경을 쓰므로 크로마키를 건너뛴다', async () => {
    // 순수 초록 PNG를 그대로 openai로 흉내내도 크로마키가 적용되지 않아야 한다(색이 그대로 남는다).
    const greenOnly = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 255 } } })
      .png()
      .toBuffer()
    const asset: PromptAsset = {
      id: 'greenish',
      kind: 'symbol',
      prompt: 'p',
      size: '1024x1024',
      transparent: true,
      out: 'theme/symbols/greenish.webp',
      outSize: 32,
    }
    await generateAsset(gameDir, file, asset, fakeProvider('openai', greenOnly), false, {})

    const outPath = join(gameDir, 'theme', 'symbols', 'greenish.webp')
    // sharp(path)로 직접 읽으면 Windows에서 libvips가 파일 핸들을 늦게 놓아 afterEach의 rmSync가 실패할 수 있다.
    // 버퍼로 읽어 sharp에 넘기면 파일 핸들이 즉시 닫힌다.
    const { data, info } = await sharp(readFileSync(outPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const centerOffset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4
    // 크로마키가 안 걸렸으니 중심 픽셀은 여전히 불투명해야 한다
    expect(data[centerOffset + 3]).toBeGreaterThan(0)
  })
})

describe('applyThemeUpdate', () => {
  it('업데이트가 비어 있으면 theme.json을 건드리지 않는다', () => {
    applyThemeUpdate(gameDir, {})
    expect(existsSync(join(gameDir, 'theme', 'theme.json'))).toBe(false)
  })

  it('없던 theme.json을 새로 만든다', () => {
    applyThemeUpdate(gameDir, { symbols: { seven: 'symbols/seven.webp' } })
    const themePath = join(gameDir, 'theme', 'theme.json')
    expect(existsSync(themePath)).toBe(true)
    const written = JSON.parse(readFileSync(themePath, 'utf8')) as { symbols: Record<string, string>; palette: unknown }
    expect(written.symbols.seven).toBe('symbols/seven.webp')
    expect(written.palette).toEqual({})
  })
})
