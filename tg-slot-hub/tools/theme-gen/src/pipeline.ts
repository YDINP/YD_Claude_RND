import { existsSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import sharp from 'sharp'
import { CHROMA_KEY_COLOR, CHROMA_KEY_FEATHER_PX, CHROMA_KEY_TOLERANCE_DEG, RAW_DIR_NAME } from './constants.js'
import { chromaKey } from './chromaKey.js'
import { logAsset } from './log.js'
import { readJsonOptional, writeBuffer, writeJson } from './paths.js'
import { processFlat, processSymbol } from './postProcess.js'
import type { ImageProvider } from './provider/types.js'
import { resolveAssetPrompt, type PromptAsset, type PromptsFile } from './schema.js'
import { mergeTheme, type ThemeUpdate } from './themeWriter.js'

export function assetOutPath(gameDir: string, asset: PromptAsset): string {
  return join(gameDir, asset.out)
}

export function assetRawPath(gameDir: string, asset: PromptAsset): string {
  return join(gameDir, 'art', RAW_DIR_NAME, `${asset.id}.png`)
}

export function symbolThumbPath(outPath: string, id: string): string {
  return join(dirname(outPath), `${id}@128.webp`)
}

/**
 * gpt-image-1은 네이티브 투명 배경을 지원해 크로마키가 필요 없다. gemini/comfy는 필요하다.
 * codex는 제외한다 — codex 프로바이더가 내부에서 필요할 때만 스스로 폴백 크로마키를 적용해서 돌려준다.
 */
function needsChromaKey(providerName: string, transparent: boolean): boolean {
  return transparent && (providerName === 'gemini' || providerName === 'comfy')
}

export interface AssetPlan {
  asset: PromptAsset
  resolvedPrompt: string
  outPath: string
  willSkip: boolean
}

/** `--dry-run`에서 쓰는, 아무것도 호출하지 않는 계획 미리보기. */
export function planAssets(gameDir: string, file: PromptsFile, assets: PromptAsset[], force: boolean): AssetPlan[] {
  return assets.map((asset) => {
    const outPath = assetOutPath(gameDir, asset)
    return {
      asset,
      resolvedPrompt: resolveAssetPrompt(file, asset),
      outPath,
      willSkip: !force && existsSync(outPath),
    }
  })
}

export interface GenerateAssetResult {
  asset: PromptAsset
  skipped: boolean
  ms: number
  bytes: number
}

function recordThemeUpdate(gameDir: string, asset: PromptAsset, outPath: string, themeUpdate: ThemeUpdate): void {
  const themeDir = join(gameDir, 'theme')
  const relPath = relative(themeDir, outPath).split(sep).join('/')

  if (asset.kind === 'symbol') {
    themeUpdate.symbols = { ...(themeUpdate.symbols ?? {}), [asset.id]: relPath }
  } else if (asset.kind === 'frame') {
    themeUpdate.frame = relPath
  } else if (asset.kind === 'bg') {
    themeUpdate.background = relPath
  }
  // kind === 'thumb'는 theme.json이 아니라 manifest.json 소관이라 여기서 다루지 않는다.
}

/**
 * asset 1개를 생성 → (필요하면) 크로마키 → 후처리 → 파일로 저장한다.
 * 이미 출력 파일이 있고 `--force`가 아니면 생성을 건너뛰되, theme.json 반영은 그대로 한다
 * (파일은 이미 있으니 idempotent하게 다시 채워 넣는 것뿐이다).
 */
export async function generateAsset(
  gameDir: string,
  file: PromptsFile,
  asset: PromptAsset,
  provider: ImageProvider,
  force: boolean,
  themeUpdate: ThemeUpdate,
): Promise<GenerateAssetResult> {
  const outPath = assetOutPath(gameDir, asset)

  if (!force && existsSync(outPath)) {
    recordThemeUpdate(gameDir, asset, outPath, themeUpdate)
    return { asset, skipped: true, ms: 0, bytes: 0 }
  }

  const started = Date.now()
  const generated = await provider.generate({
    id: asset.id,
    prompt: resolveAssetPrompt(file, asset),
    negative: file.negative,
    size: asset.size,
    transparent: asset.transparent,
  })

  writeBuffer(assetRawPath(gameDir, asset), generated.buffer)

  let processedInput = generated.buffer
  if (needsChromaKey(provider.name, asset.transparent)) {
    const raw = await sharp(generated.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const keyed = chromaKey(
      { data: raw.data, width: raw.info.width, height: raw.info.height, channels: 4 },
      { keyColor: CHROMA_KEY_COLOR, toleranceDeg: CHROMA_KEY_TOLERANCE_DEG, featherPx: CHROMA_KEY_FEATHER_PX },
    )
    processedInput = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
      .png()
      .toBuffer()
  }

  if (asset.kind === 'symbol') {
    const { full, thumb } = await processSymbol(processedInput, asset.outSize)
    writeBuffer(outPath, full)
    writeBuffer(symbolThumbPath(outPath, asset.id), thumb)
  } else {
    writeBuffer(outPath, await processFlat(processedInput, asset.outSize))
  }

  recordThemeUpdate(gameDir, asset, outPath, themeUpdate)

  const ms = Date.now() - started
  const bytes = generated.buffer.byteLength
  logAsset({ id: asset.id, provider: provider.name, ms, bytes })
  return { asset, skipped: false, ms, bytes }
}

/** 누적된 ThemeUpdate를 실제 `theme.json`에 병합해 쓴다. 반영할 게 없으면 아무것도 안 한다. */
export function applyThemeUpdate(gameDir: string, update: ThemeUpdate): void {
  if (update.symbols === undefined && update.frame === undefined && update.background === undefined) return
  const themePath = join(gameDir, 'theme', 'theme.json')
  const merged = mergeTheme(readJsonOptional(themePath), update)
  writeJson(themePath, merged)
}
