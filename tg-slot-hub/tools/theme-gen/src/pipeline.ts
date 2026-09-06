import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import sharp from 'sharp'
import { ArtFxFileSchema, PACK_FILES } from '@tgslot/game-sdk'
import type { FxMap } from '@tgslot/game-sdk'
import {
  CHROMA_KEY_COLOR,
  CHROMA_KEY_FEATHER_PX,
  CHROMA_KEY_TOLERANCE_DEG,
  FLAT_MATTE_MIN_REMOVED_RATIO,
  RAW_DIR_NAME,
} from './constants.js'
import { chromaKey } from './chromaKey.js'
import { removeFlatBackground } from './flatMatte.js'
import { logAsset, logInfo, logWarn } from './log.js'
import { readJsonOptional, writeBuffer, writeJson } from './paths.js'
import { processFlat, processFrame, processSymbol } from './postProcess.js'
import type { ImageProvider } from './provider/types.js'
import { resolveAssetPrompt, type PromptAsset, type PromptsFile } from './schema.js'
import { processSheet } from './spriteSheet.js'
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

/** sprite sheet 아틀라스 webp 옆에 나란히 두는 JSON 경로. 같은 폴더, 같은 이름, 확장자만 다르다. */
export function sheetJsonPath(outPath: string): string {
  return outPath.replace(/\.webp$/i, '.json')
}

/** `theme.json` 파일 기준 상대 경로로 바꾸고 구분자를 `/`로 통일한다(Windows에서도 URL처럼 쓸 수 있게). */
function relativeToThemeDir(gameDir: string, absPath: string): string {
  const themeDir = join(gameDir, 'theme')
  return relative(themeDir, absPath).split(sep).join('/')
}

/**
 * `kind: "sheet"` asset id에서 애니메이션 이름을 뽑는다. `<symbol>-<animation>` 컨벤션을 쓴다
 * (예: symbol `seven` + id `seven-win` → `win`). 컨벤션을 안 따르는 id면 id 전체를 이름으로 쓴다.
 */
function sheetAnimationName(asset: PromptAsset): string {
  const symbol = asset.symbol ?? ''
  const prefix = `${symbol}-`
  return asset.id.startsWith(prefix) ? asset.id.slice(prefix.length) : asset.id
}

/**
 * 배경을 지우는 방식. **불리언 두 개가 아니라 상태 하나**로 둔다 — "크로마키가 필요한가"와
 * "평면 매트를 쓰는가"가 따로 있으면 둘 다 참인 불가능한 조합이 표현되기 때문이다.
 *
 * - `chroma` — 프롬프트가 약속한 `#00FF00`을 색상(hue)으로 지운다. gpt-image-1/gemini처럼
 *   지시를 지키는 생성기용이고 기본값이다.
 * - `flat` — 배경색을 **이미지에서 추정**해 테두리 연결 성분을 지운다(`flatMatte.ts`).
 *   로컬 SDXL은 "초록 배경" 지시를 안 지키고 초록을 오브젝트에 칠해 버리므로 이쪽을 쓴다.
 */
export const MATTE_MODES = ['chroma', 'flat'] as const
export type MatteMode = (typeof MATTE_MODES)[number]

/** asset 하나에 실제로 적용할 배경 제거. 프로바이더·asset 종류·선택한 모드가 함께 정한다. */
export type MattePlan = 'none' | MatteMode

/**
 * gpt-image-1은 네이티브 투명 배경을 지원해 배경 제거가 필요 없다. gemini/comfy는 필요하다.
 * codex는 제외한다 — codex 프로바이더가 내부에서 필요할 때만 스스로 폴백 크로마키를 적용해서 돌려준다.
 * frame도 제외한다 — `processFrame`이 창 탐지 + 전체 크로마키 mop-up을 자체적으로 처리한다
 * (이미지 전체를 무조건 키잉하는 이 경로와 달리, frame은 릴 창 자리만 정확히 뚫어야 하기 때문).
 */
export function planMatte(
  providerName: string,
  transparent: boolean,
  kind: PromptAsset['kind'],
  mode: MatteMode,
): MattePlan {
  if (!transparent || kind === 'frame') return 'none'
  return providerName === 'gemini' || providerName === 'comfy' ? mode : 'none'
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

/**
 * `kind: "bg"` asset의 id를 theme.json 키로 매핑한다. `bg`는 기본 배경, `bgFreeSpins`는
 * 프리스핀 전용 배경(`backgroundFreeSpins`). 목록에 없는 id는 기존처럼 기본 배경으로 본다
 * (지금까지 게임 팩들이 `bg` 하나만 썼던 것과 하위 호환).
 */
const BG_ASSET_ID_TO_THEME_KEY: Record<string, 'background' | 'backgroundFreeSpins'> = {
  bg: 'background',
  bgFreeSpins: 'backgroundFreeSpins',
}

function recordThemeUpdate(gameDir: string, asset: PromptAsset, outPath: string, themeUpdate: ThemeUpdate): void {
  const relPath = relativeToThemeDir(gameDir, outPath)

  if (asset.kind === 'symbol') {
    themeUpdate.symbols = { ...(themeUpdate.symbols ?? {}), [asset.id]: relPath }
  } else if (asset.kind === 'frame') {
    themeUpdate.frame = relPath
  } else if (asset.kind === 'bg') {
    const themeKey = BG_ASSET_ID_TO_THEME_KEY[asset.id] ?? 'background'
    themeUpdate[themeKey] = relPath
  }
  // kind === 'thumb'는 theme.json이 아니라 manifest.json 소관이라 여기서 다루지 않는다.
}

/**
 * asset 종류별 후처리를 돌리고 결과를 파일로 쓴다. `frame`이면 릴 창 탐지 결과를
 * `themeUpdate.frameLayout`에 반영한다(못 찾으면 경고만 남기고 기존 값을 건드리지 않는다).
 * `generateAsset`(프로바이더 호출)과 `reprocessAsset`(`--reprocess`, raw 파일에서 재처리)이 공유한다.
 */
async function writeAssetOutputs(gameDir: string, asset: PromptAsset, input: Buffer, themeUpdate: ThemeUpdate): Promise<void> {
  const outPath = assetOutPath(gameDir, asset)

  if (asset.kind === 'symbol') {
    const { full, thumb } = await processSymbol(input, asset.outSize)
    writeBuffer(outPath, full)
    writeBuffer(symbolThumbPath(outPath, asset.id), thumb)
  } else if (asset.kind === 'frame') {
    const { buffer, window } = await processFrame(input, asset.outSize)
    writeBuffer(outPath, buffer)
    if (window !== undefined) {
      themeUpdate.frameLayout = { window }
      logInfo(
        `frame: ${asset.id} 릴 창 감지 x=${window.x.toFixed(4)} y=${window.y.toFixed(4)} w=${window.w.toFixed(4)} h=${window.h.toFixed(4)}`,
      )
    } else {
      logWarn(`frame: ${asset.id}에서 릴 창을 찾지 못해 frameLayout을 갱신하지 않는다 (렌더러 기본값을 쓰게 된다)`)
    }
  } else if (asset.kind === 'sheet') {
    if (asset.symbol === undefined || asset.grid === undefined || asset.fps === undefined) {
      throw new Error(`sheet asset ${asset.id}에 symbol/grid/fps가 없다 (prompts.json 스키마 검증을 거쳤는지 확인할 것)`)
    }
    const { atlas, json } = await processSheet(input, {
      cols: asset.grid.cols,
      rows: asset.grid.rows,
      fps: asset.fps,
      symbol: asset.symbol,
      outSize: asset.outSize,
    })
    writeBuffer(outPath, atlas)
    const jsonPath = sheetJsonPath(outPath)
    writeJson(jsonPath, json)

    const animation = sheetAnimationName(asset)
    themeUpdate.sheets = {
      ...(themeUpdate.sheets ?? {}),
      [asset.symbol]: { ...(themeUpdate.sheets?.[asset.symbol] ?? {}), [animation]: relativeToThemeDir(gameDir, jsonPath) },
    }
    logInfo(`sheet: ${asset.id} → symbol=${asset.symbol} anim=${animation} frames=${json.count} (${json.frameW}x${json.frameH})`)
  } else {
    writeBuffer(outPath, await processFlat(input, asset.outSize))
  }

  recordThemeUpdate(gameDir, asset, outPath, themeUpdate)
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
  matte: MatteMode = 'chroma',
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
    kind: asset.kind,
    ...(asset.timeoutMs !== undefined ? { timeoutMs: asset.timeoutMs } : {}),
  })

  writeBuffer(assetRawPath(gameDir, asset), generated.buffer)

  let processedInput = generated.buffer
  const mattePlan = planMatte(provider.name, asset.transparent, asset.kind, matte)
  if (mattePlan !== 'none') {
    const raw = await sharp(generated.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const input = { data: raw.data, width: raw.info.width, height: raw.info.height, channels: 4 as const }
    let keyed
    if (mattePlan === 'chroma') {
      keyed = chromaKey(input, {
        keyColor: CHROMA_KEY_COLOR,
        toleranceDeg: CHROMA_KEY_TOLERANCE_DEG,
        featherPx: CHROMA_KEY_FEATHER_PX,
      })
    } else {
      const result = removeFlatBackground(input)
      keyed = result.image
      const percent = (result.removedRatio * 100).toFixed(1)
      const bg = `rgb(${result.background.r},${result.background.g},${result.background.b})`
      // 지운 비율이 너무 작으면 배경이 평평하지 않았다는 뜻이고, removeFlatBackground는
      // 그런 경우 원본을 그대로 돌려준다. 조용히 넘어가면 불투명한 심볼이 커밋된다.
      if (result.removedRatio < FLAT_MATTE_MIN_REMOVED_RATIO) {
        logWarn(`flat matte: ${asset.id}의 배경이 평평하지 않아 지우지 못했다 (배경 추정 ${bg}, 지움 ${percent}%)`)
      } else {
        logInfo(`flat matte: ${asset.id} 배경 ${bg} 제거 ${percent}%`)
      }
    }
    processedInput = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
      .png()
      .toBuffer()
  }

  await writeAssetOutputs(gameDir, asset, processedInput, themeUpdate)

  const ms = Date.now() - started
  const bytes = generated.buffer.byteLength
  logAsset({ id: asset.id, provider: provider.name, ms, bytes })
  return { asset, skipped: false, ms, bytes }
}

/**
 * `--reprocess`: 프로바이더를 아예 호출하지 않고 이미 저장된 `art/raw/<id>.png`에서
 * 후처리만 다시 돌린다. 어떤 프로바이더가 raw를 만들었는지는 모르므로 generic 크로마키는
 * 적용하지 않는다 — `frame`은 `processFrame`이 자체적으로 처리하고, symbol/bg/thumb는 raw를
 * 그대로 후처리한다(원본이 아직 초록 배경이면 재처리로는 못 고친다. 그럴 땐 provider로 다시 생성할 것).
 */
export async function reprocessAsset(gameDir: string, asset: PromptAsset, themeUpdate: ThemeUpdate): Promise<GenerateAssetResult> {
  const rawPath = assetRawPath(gameDir, asset)
  if (!existsSync(rawPath)) {
    throw new Error(`--reprocess: 원본이 없다. 먼저 프로바이더로 한 번 생성해야 한다: ${rawPath}`)
  }

  const started = Date.now()
  const input = readFileSync(rawPath)

  await writeAssetOutputs(gameDir, asset, input, themeUpdate)

  const ms = Date.now() - started
  const bytes = input.byteLength
  logAsset({ id: asset.id, provider: 'reprocess', ms, bytes })
  return { asset, skipped: false, ms, bytes }
}

/**
 * `art/fx.json`(손으로 쓰는 연출 원본)을 읽는다. 없으면 undefined.
 *
 * 다섯 게임이 제각각이던 것을 여기로 통일했다 — 연출은 `art/fx.json`에만 쓰고,
 * `theme.json`의 `fx`는 이 함수가 매 실행마다 다시 채우는 **생성물**이다.
 */
export function readArtFx(gameDir: string): FxMap | undefined {
  const json = readJsonOptional(join(gameDir, PACK_FILES.fx))
  if (json === undefined) return undefined
  const parsed = ArtFxFileSchema.safeParse(json)
  if (!parsed.success) {
    logWarn(`${PACK_FILES.fx} 검증 실패로 fx를 반영하지 않는다: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    return undefined
  }
  // 검증은 스키마로 하되 **원본을 그대로** 옮긴다. zod가 모르는 필드를 버리므로 파싱 결과를 쓰면
  // 재생성이 손으로 쓴 필드를 조용히 지운다 — 여기도 merge, never drop unknown keys다.
  // (스키마 밖 필드는 `pnpm pack:check`가 경고로 짚는다.)
  return (json as { fx: FxMap }).fx
}

/**
 * 누적된 ThemeUpdate에 `art/fx.json`을 얹어 실제 `theme.json`에 병합해 쓴다.
 * 반영할 게 하나도 없으면 파일을 건드리지 않는다.
 */
export function applyThemeUpdate(gameDir: string, update: ThemeUpdate): void {
  const fx = readArtFx(gameDir)
  const full: ThemeUpdate = fx === undefined ? update : { ...update, fx }
  if (Object.values(full).every((value) => value === undefined)) return

  const themePath = join(gameDir, PACK_FILES.theme)
  const merged = mergeTheme(readJsonOptional(themePath), full)
  writeJson(themePath, merged)
}
