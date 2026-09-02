import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { logError } from './log.js'
import { promptsJsonPath, readJson, resolveGameDir } from './paths.js'
import { applyThemeUpdate, generateAsset, planAssets, reprocessAsset } from './pipeline.js'
import { checkCodexAvailable, createCodexProvider } from './provider/codex.js'
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
  --provider <openai|gemini|comfy|codex>   프로바이더 강제 지정 (기본: 자동 선택)
  --only <id1,id2,...>                     지정한 asset id만 생성
  --dry-run                                실제 호출 없이 계획만 출력
  --force                                  기존 출력 파일이 있어도 다시 생성
  --reprocess                              프로바이더를 호출하지 않고 art/raw/<id>.png에서 후처리만 다시 돌린다
  -h, --help                               도움말

자동 선택 순서: --provider → THEME_GEN_PROVIDER → OPENAI_API_KEY → GEMINI_API_KEY → codex 로그인 → 로컬 ComfyUI
(codex는 API 키 없이 ChatGPT 로그인을 쓰고, 자산 하나에 1~3분 걸릴 수 있어 항상 순차 실행한다)`

interface CliOptions {
  target: string
  provider?: ProviderName
  only?: string[]
  dryRun: boolean
  force: boolean
  reprocess: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let target: string | undefined
  let provider: ProviderName | undefined
  let only: string[] | undefined
  let dryRun = false
  let force = false
  let reprocess = false

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
        if (value !== 'openai' && value !== 'gemini' && value !== 'comfy' && value !== 'codex') {
          throw new Error(`알 수 없는 --provider 값: ${value} (openai | gemini | comfy | codex 중 하나)`)
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
      case '--reprocess':
        reprocess = true
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
  const options: CliOptions = { target, dryRun, force, reprocess }
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
  loadWorkspaceDotenv()
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
  if (name === 'codex') {
    const options: Parameters<typeof createCodexProvider>[0] = {}
    const timeoutMs = Number(process.env.CODEX_TIMEOUT_MS)
    if (process.env.CODEX_TIMEOUT_MS !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) options.timeoutMs = timeoutMs
    return createCodexProvider(options)
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

  if (options.reprocess) {
    console.log('  provider: (none — --reprocess, art/raw/<id>.png에서 후처리만 다시 돌린다)\n')
    const themeUpdate: ThemeUpdate = {}
    for (const asset of assets) {
      await reprocessAsset(gameDir, asset, themeUpdate)
    }
    applyThemeUpdate(gameDir, themeUpdate)
    console.log('\n완료')
    return
  }

  const env = readEnv()
  const checkCodex = options.dryRun
    ? async (): Promise<boolean> => true
    : (): Promise<boolean> => checkCodexAvailable({ available: process.env.CODEX_AVAILABLE })
  const checkComfy = options.dryRun ? async (): Promise<boolean> => true : (url: string): Promise<boolean> => checkComfyAvailable(url)
  const providerName = await selectProviderName(options.provider, env, checkCodex, checkComfy)

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

/** 워크스페이스 루트의 .env를 있으면 읽는다 (Node 21+ 내장, 이미 설정된 값은 덮어쓰지 않음). */
function loadWorkspaceDotenv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      process.loadEnvFile(file)
    } catch {
      /* 형식 오류는 무시하고 환경변수만 쓴다 */
    }
    return
  }
}

