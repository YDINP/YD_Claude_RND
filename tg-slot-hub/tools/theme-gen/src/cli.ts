import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { logError } from './log.js'
import { promptsJsonPath, readJson, resolveGameDir } from './paths.js'
import { applyThemeUpdate, generateAsset, planAssets } from './pipeline.js'
import { createComfyProvider } from './provider/comfy.js'
import { createGeminiProvider } from './provider/gemini.js'
import { createOpenAiProvider } from './provider/openai.js'
import { checkComfyAvailable, selectProviderName, type SelectProviderEnv } from './provider/select.js'
import type { ImageProvider, ProviderName } from './provider/types.js'
import { formatDryRunPlan, formatHeader, formatProviderLine } from './report.js'
import { parsePromptsFile, type PromptAsset, type PromptsFile } from './schema.js'
import type { ThemeUpdate } from './themeWriter.js'

const USAGE = `사용법: pnpm --filter @tgslot/theme-gen gen <게임 폴더> [옵션]

옵션
  --provider <openai|gemini|comfy>   프로바이더 강제 지정 (기본: 자동 선택)
  --only <id1,id2,...>               지정한 asset id만 생성
  --dry-run                          실제 호출 없이 계획만 출력
  --force                            기존 출력 파일이 있어도 다시 생성
  -h, --help                         도움말

자동 선택 순서: --provider → THEME_GEN_PROVIDER → OPENAI_API_KEY → GEMINI_API_KEY → 로컬 ComfyUI`

interface CliOptions {
  target: string
  provider?: ProviderName
  only?: string[]
  dryRun: boolean
  force: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let target: string | undefined
  let provider: ProviderName | undefined
  let only: string[] | undefined
  let dryRun = false
  let force = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    const takeValue = (): string => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} 뒤에 값이 필요하다`)
      i += 1
      return value
    }
    switch (arg) {
      case '--provider': {
        const value = takeValue()
        if (value !== 'openai' && value !== 'gemini' && value !== 'comfy') {
          throw new Error(`알 수 없는 --provider 값: ${value} (openai | gemini | comfy 중 하나)`)
        }
        provider = value
        break
      }
      case '--only':
        only = takeValue()
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
        break
      case '--dry-run':
        dryRun = true
        break
      case '--force':
        force = true
        break
      case '-h':
      case '--help':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션: ${arg}`)
        target = arg
    }
  }

  if (target === undefined) throw new Error(`대상 게임 폴더를 지정할 것\n\n${USAGE}`)
  const options: CliOptions = { target, dryRun, force }
  if (provider !== undefined) options.provider = provider
  if (only !== undefined) options.only = only
  return options
}

function selectAssets(file: PromptsFile, only: string[] | undefined): PromptAsset[] {
  if (only === undefined) return file.assets
  const byId = new Map(file.assets.map((asset) => [asset.id, asset] as const))
  const missing = only.filter((id) => !byId.has(id))
  if (missing.length > 0) throw new Error(`--only에 없는 asset id: ${missing.join(', ')}`)
  return only.map((id) => {
    const asset = byId.get(id)
    if (asset === undefined) throw new Error(`--only에 없는 asset id: ${id}`)
    return asset
  })
}

function readEnv(): SelectProviderEnv {
  const env: SelectProviderEnv = {}
  if (process.env.THEME_GEN_PROVIDER !== undefined) env.THEME_GEN_PROVIDER = process.env.THEME_GEN_PROVIDER
  if (process.env.OPENAI_API_KEY !== undefined) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (process.env.GEMINI_API_KEY !== undefined) env.GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (process.env.COMFY_URL !== undefined) env.COMFY_URL = process.env.COMFY_URL
  return env
}

function buildProvider(name: ProviderName): ImageProvider {
  if (name === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY
    if (apiKey === undefined) throw new Error('OPENAI_API_KEY가 없다')
    const options: Parameters<typeof createOpenAiProvider>[0] = { apiKey }
    if (process.env.THEME_GEN_QUALITY !== undefined) options.quality = process.env.THEME_GEN_QUALITY
    return createOpenAiProvider(options)
  }
  if (name === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey === undefined) throw new Error('GEMINI_API_KEY가 없다')
    return createGeminiProvider({ apiKey })
  }
  const options: Parameters<typeof createComfyProvider>[0] = {}
  if (process.env.COMFY_URL !== undefined) options.baseUrl = process.env.COMFY_URL
  if (process.env.COMFY_CHECKPOINT !== undefined) options.checkpoint = process.env.COMFY_CHECKPOINT
  return createComfyProvider(options)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const gameDir = resolveGameDir(options.target)
  const promptsPath = promptsJsonPath(gameDir)
  if (!existsSync(promptsPath)) throw new Error(`prompts.json을 찾지 못했다: ${promptsPath}`)

  const file = parsePromptsFile(readJson(promptsPath))
  const assets = selectAssets(file, options.only)

  console.log(formatHeader(basename(gameDir), promptsPath, file))

  const env = readEnv()
  const checkComfy = options.dryRun ? async (): Promise<boolean> => true : (url: string): Promise<boolean> => checkComfyAvailable(url)
  const providerName = await selectProviderName(options.provider, env, checkComfy)

  if (options.dryRun) {
    console.log(formatProviderLine(providerName, env.COMFY_URL, true))
    for (const line of formatDryRunPlan(planAssets(gameDir, file, assets, options.force))) console.log(line)
    console.log('')
    return
  }

  console.log(formatProviderLine(providerName, env.COMFY_URL, false))
  const provider = buildProvider(providerName)
  const themeUpdate: ThemeUpdate = {}

  for (const asset of assets) {
    const result = await generateAsset(gameDir, file, asset, provider, options.force, themeUpdate)
    if (result.skipped) console.log(`  [skip] ${asset.id} (이미 있음, --force로 재생성)`)
  }

  applyThemeUpdate(gameDir, themeUpdate)
  console.log('\n완료')
}

main().catch((error: unknown) => {
  logError(error)
  process.exit(1)
})
