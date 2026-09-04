import { execFile, spawn } from 'node:child_process'
import type { Dirent } from 'node:fs'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import sharp from 'sharp'
import { chromaKey } from '../chromaKey.js'
import {
  CODEX_EARLY_EXIT_POLL_INTERVAL_MS,
  CODEX_EARLY_EXIT_STABLE_CHECKS,
  CODEX_GENERATED_IMAGES_MAX_DEPTH,
  CODEX_GENERATED_IMAGES_START_SKEW_MS,
  CODEX_LOG_FILENAME,
  CODEX_OUTPUT_FILENAME,
  CODEX_OUTPUT_TAIL_LENGTH,
  CODEX_TEMP_CLEANUP_RETRIES,
  CODEX_TEMP_CLEANUP_RETRY_DELAY_MS,
  CODEX_TEMP_DIR_PREFIX,
  DEFAULT_CODEX_AVAILABILITY_TIMEOUT_MS,
  DEFAULT_CODEX_SHEET_TIMEOUT_MS,
  DEFAULT_CODEX_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_COUNT,
} from '../constants.js'
import { logWarn } from '../log.js'
import { withRetry } from '../retry.js'
import type { AssetSize } from '../schema.js'
import type { GenerateOptions, GeneratedImage, ImageProvider } from './types.js'

/** stdout/stderr에서 필요한 건 `data` 이벤트뿐이라 전체 `Readable` 대신 이 최소 타입만 요구한다. */
export interface ReadableLike {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
}

/** stdin에 쓰고 닫는 것만 필요하다. */
export interface WritableLike {
  write(chunk: string): unknown
  end(): unknown
}

/**
 * 실제 `child_process.spawn`과 테스트용 가짜 프로세스를 모두 받아들이는 최소 인터페이스.
 * `ChildProcess`의 전체 타입을 요구하지 않아 테스트에서 EventEmitter 기반 fake를 쉽게 만들 수 있다.
 */
export interface SpawnedProcessLike {
  /** 트리/그룹 kill에 필요하다. 실제 spawn은 항상 채워주고, fake는 없어도 된다(그러면 child.kill()로 폴백). */
  pid?: number
  stdin: WritableLike | null
  stdout: ReadableLike | null
  stderr: ReadableLike | null
  on(event: 'close', listener: (code: number | null) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: ['pipe' | 'ignore', 'pipe', 'pipe']; shell?: boolean; detached?: boolean },
) => SpawnedProcessLike

/**
 * 타임아웃으로 죽일 때 `child.kill()`만 부르면 `shell: true`로 띄운 Windows에서는 cmd.exe만
 * 죽고 그 아래 codex.cmd → node.exe(→ codex가 또 띄웠을 수 있는 프로세스)는 고아로 남는다.
 * Windows는 `taskkill /T`로 트리 전체를, POSIX는 (spawn 시 `detached: true`로 새 프로세스
 * 그룹을 만들어 뒀으므로) 음수 pid로 그룹 전체를 죽인다. 둘 다 실패해도 최소한 직계 자식은
 * `child.kill()`로 정리한다.
 */
function killProcessTree(child: SpawnedProcessLike): void {
  const pid = child.pid
  if (pid !== undefined) {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {
        /* fire-and-forget — 이미 타임아웃으로 실패 처리했으니 결과를 기다릴 이유가 없다 */
      })
    } else {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        /* 그룹 kill 실패 — 아래 child.kill()로 폴백 */
      }
    }
  }
  child.kill()
}

/** Windows npm 글로벌 설치는 `.cmd` 래퍼를 쓴다. `spawn`으로 `.cmd`를 직접 실행하려면 shell이 필요하다. */
export function resolveCodexBinary(): string {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex'
}

function sizeToDims(size: AssetSize): { width: number; height: number } {
  const [w, h] = size.split('x')
  return { width: Number(w), height: Number(h) }
}

/** codex CLI에 넘길 자연어 지시문. 부수효과가 없는 순수 함수라 단위 테스트하기 쉽다. */
export function buildCodexInstruction(width: number, height: number, transparent: boolean, prompt: string): string {
  const backgroundNote = transparent ? 'Background must be fully transparent (PNG alpha).' : 'Opaque full-bleed image.'
  return (
    `Use your image generation tool (image_gen__imagegen) to generate exactly ONE image and save it as ` +
    `${CODEX_OUTPUT_FILENAME} in the current working directory. Size: ${width}x${height} pixels. ${backgroundNote} ` +
    `Do not create or modify any other files. Image description: ${prompt}. When the file is saved, reply with the single word DONE.`
  )
}

function tail(text: string, length = CODEX_OUTPUT_TAIL_LENGTH): string {
  return text.length <= length ? text : text.slice(-length)
}

interface RunResult {
  stdout: string
  stderr: string
  timedOut: boolean
  exitCode: number | null
}

/**
 * out.png가 나타난 뒤 크기가 안정되면(성장이 멈추면) 타임아웃을 기다리지 않고 조기 종료하기 위한 설정.
 * `existsSyncImpl`/`statSyncImpl`을 주입받아 테스트에서 실제 파일 시스템 타이밍에 기대지 않고
 * 빠르게(짧은 `pollIntervalMs`로) 검증할 수 있게 한다.
 */
export interface EarlyExitWatch {
  outPath: string
  pollIntervalMs: number
  stableChecks: number
  existsSyncImpl: (path: string) => boolean
  statSyncImpl: (path: string) => { size: number }
}

/**
 * 프로세스를 띄우고 stdout/stderr를 모으다가 close/timeout/조기종료/error 중 먼저 오는 쪽으로 정리한다.
 * `stdin`을 주면 그 내용을 써서 보내고 스트림을 닫는다(codex `exec`에 PROMPT를 이 경로로 넘긴다 —
 * 이유는 `generate()` 쪽 주석 참고). `watch`를 주면 `watch.outPath`의 크기가 `stableChecks`번
 * 연속으로 안 변할 때 프로세스를 죽이고 `timedOut: false`로 조기 반환한다(sheet asset처럼 codex가
 * 파일을 다 쓰고도 검증 단계를 오래 끄는 경우를 위한 것).
 */
function runProcess(
  spawnImpl: SpawnFn,
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  stdin?: string,
  watch?: EarlyExitWatch,
): Promise<RunResult> {
  const child = spawnImpl(command, args, {
    cwd,
    stdio: [stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    // POSIX에서만 켠다 — 새 프로세스 그룹을 만들어야 음수 pid로 그룹 전체를 죽일 수 있다.
    // Windows는 detached가 별도 콘솔 창을 띄우는 부작용이 있고, 어차피 taskkill /T를 쓴다.
    detached: process.platform !== 'win32',
  })

  return new Promise<RunResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let pollTimer: ReturnType<typeof setInterval> | undefined

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      if (pollTimer !== undefined) clearInterval(pollTimer)
      killProcessTree(child)
      resolve({ stdout, stderr, timedOut: true, exitCode: null })
    }, timeoutMs)

    if (watch !== undefined) {
      let lastSize: number | undefined
      let stableCount = 0
      pollTimer = setInterval(() => {
        if (settled) return
        if (!watch.existsSyncImpl(watch.outPath)) {
          lastSize = undefined
          stableCount = 0
          return
        }
        let size: number
        try {
          size = watch.statSyncImpl(watch.outPath).size
        } catch {
          // 파일이 존재 확인 직후 사라지는 경합 등 — 다음 폴링에서 다시 본다.
          return
        }
        if (size <= 0) {
          lastSize = undefined
          stableCount = 0
          return
        }
        stableCount = lastSize !== undefined && size === lastSize ? stableCount + 1 : 1
        lastSize = size
        if (stableCount < watch.stableChecks) return

        settled = true
        clearTimeout(timer)
        if (pollTimer !== undefined) clearInterval(pollTimer)
        killProcessTree(child)
        resolve({ stdout, stderr, timedOut: false, exitCode: null })
      }, watch.pollIntervalMs)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (pollTimer !== undefined) clearInterval(pollTimer)
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (pollTimer !== undefined) clearInterval(pollTimer)
      resolve({ stdout, stderr, timedOut: false, exitCode: code })
    })

    if (stdin !== undefined) {
      child.stdin?.write(stdin)
      child.stdin?.end()
    }
  })
}

/**
 * `readFileSync`를 감싸 EPERM/EBUSY 등 일시적 파일 접근 오류로 죽지 않게 한다. 프로세스 트리를
 * 막 죽인 직후에는 Windows에서 핸들이 잠깐 남아 읽기가 실패할 수 있는데, 이건 회수 실패로만
 * 취급하고(경고 로그) 호출부가 다음 폴백(회수 실패 → generated_images 등)으로 넘어가게 한다.
 */
function readFileSafely(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch (err) {
    logWarn(`codex: ${path} 읽기 실패(무시): ${(err as NodeJS.ErrnoException).code ?? String(err)}`)
    return undefined
  }
}

/**
 * 타임아웃 시점에 out.png가 이미 완성돼 있는지 확인한다. codex가 파일을 다 쓰고도 검증
 * 단계를 오래 끌 때, 있는 파일을 버리지 않고 회수하기 위한 것. 존재하지 않거나 비어 있거나
 * sharp로 디코드가 안 되면(=아직 쓰는 중이거나 손상됨) undefined를 돌려준다.
 */
async function readSalvageableOutput(outPath: string): Promise<Buffer | undefined> {
  if (!existsSync(outPath)) return undefined
  const buffer = readFileSafely(outPath)
  if (buffer === undefined) return undefined
  if (buffer.byteLength === 0) return undefined
  try {
    const meta = await sharp(buffer).metadata()
    if ((meta.width ?? 0) <= 0 || (meta.height ?? 0) <= 0) return undefined
  } catch {
    return undefined
  }
  return buffer
}

function splitPathList(value: string | undefined): string[] {
  if (value === undefined || value === '') return []
  return value.split(delimiter).filter((entry) => entry !== '')
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

export interface ResolveGeneratedImagesDirsOptions {
  /** 명시적 루트 오버라이드. 주면 아래 자동 탐색을 건너뛰고 이 값(+env)만 쓴다. */
  generatedImageRoots?: string[]
  /** `CODEX_GENERATED_IMAGES_DIR` 등 환경변수를 읽을 대상 (테스트 주입용). 기본 `process.env`. */
  env?: NodeJS.ProcessEnv
  /** 자동 탐색 시 홈 디렉터리 (테스트 주입용). 기본 `os.homedir()`. */
  homedirImpl?: () => string
}

/**
 * codex CLI(Orca 계정 매니저를 통해 실행되는 경우 포함)가 실제로 이미지를 저장하는 폴더 후보를
 * 찾는다. codex가 `out.png`로 결과를 복사하는 마지막 단계에서 실패해도, 생성된 이미지 자체는
 * 보통 이 폴더 아래 남아 있다.
 *
 * 우선순위: `options.generatedImageRoots` → `CODEX_GENERATED_IMAGES_DIR` 환경변수(OS 경로
 * 구분자로 여러 개 나열 가능) → 자동 탐색(`%APPDATA%\orca\codex-accounts\*\home\generated_images`
 * 전부 + `~/.codex/generated_images`가 있으면 추가). 계정 id를 하드코딩하지 않고 매번
 * `codex-accounts` 폴더를 나열해서 찾으므로 계정이 여러 개거나 새로 생겨도 그대로 동작한다.
 */
export function resolveGeneratedImagesDirs(options: ResolveGeneratedImagesDirsOptions = {}): string[] {
  const env = options.env ?? process.env
  const explicit = [...(options.generatedImageRoots ?? []), ...splitPathList(env.CODEX_GENERATED_IMAGES_DIR)]
  if (explicit.length > 0) return dedupe(explicit)

  const homedirImpl = options.homedirImpl ?? homedir
  const home = homedirImpl()
  const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const accountsRoot = join(appData, 'orca', 'codex-accounts')
  const discovered: string[] = []

  if (existsSync(accountsRoot)) {
    let entries: string[] = []
    try {
      entries = readdirSync(accountsRoot)
    } catch {
      entries = []
    }
    for (const entry of entries) {
      const candidate = join(accountsRoot, entry, 'home', 'generated_images')
      if (existsSync(candidate)) discovered.push(candidate)
    }
  }

  const dotCodexDir = join(home, '.codex', 'generated_images')
  if (existsSync(dotCodexDir)) discovered.push(dotCodexDir)

  return dedupe(discovered)
}

interface GeneratedImageCandidate {
  path: string
  mtimeMs: number
}

/** `root` 아래를 `maxDepth`까지 재귀적으로 내려가며 `.png` 파일과 그 mtime을 모은다. 개별 항목 읽기 실패(경합 등)는 건너뛴다. */
function collectPngCandidates(root: string, maxDepth: number): GeneratedImageCandidate[] {
  const out: GeneratedImageCandidate[] = []
  const walk = (dir: string, depth: number): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !full.toLowerCase().endsWith('.png')) continue
      try {
        out.push({ path: full, mtimeMs: statSync(full).mtimeMs })
      } catch {
        /* 존재 확인 직후 사라지는 경합 — 다음 후보로 넘어간다 */
      }
    }
  }
  walk(root, 0)
  return out
}

/**
 * `readSalvageableOutput`(out.png 회수)도 실패했을 때 마지막으로 시도하는 경로. codex CLI가
 * 실제로는 이미지를 생성했지만 워크스페이스(`out.png`)로 복사하는 마지막 단계에서만 실패한
 * 경우, 이미지 자체는 codex 계정 홈의 `generated_images` 아래
 * (`<루트>/<uuid>/exec-<uuid>.png` 형태로) 남아 있다. `sinceMs`(이 실행 시작 직전 시각, 스큐
 * 포함) 이후 mtime을 가진 png 중 최신순으로 sharp 디코드를 검증해 유효한 첫 파일을 돌려준다.
 * 원본 파일은 절대 지우거나 옮기지 않는다(다른 도구가 참조할 수 있어 읽기 전용으로만 다룬다).
 */
async function salvageFromGeneratedImages(roots: string[], sinceMs: number): Promise<{ buffer: Buffer; path: string } | undefined> {
  const candidates = roots
    .flatMap((root) => collectPngCandidates(root, CODEX_GENERATED_IMAGES_MAX_DEPTH))
    .filter((candidate) => candidate.mtimeMs >= sinceMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  for (const candidate of candidates) {
    let buffer: Buffer
    try {
      buffer = readFileSync(candidate.path)
    } catch {
      continue
    }
    if (buffer.byteLength === 0) continue
    try {
      const meta = await sharp(buffer).metadata()
      if ((meta.width ?? 0) <= 0 || (meta.height ?? 0) <= 0) continue
    } catch {
      continue
    }
    return { buffer, path: candidate.path }
  }
  return undefined
}

async function cornersAreOpaque(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const corners: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]
  return corners.every(([x, y]) => {
    const offset = (y * width + x) * 4 + 3
    return (data[offset] ?? 255) === 255
  })
}

/** codex는 보통 transparent 요청을 알아서 지키지만, 알파 채널이 없거나 네 모서리가 불투명하면 실패로 본다. */
async function needsAlphaFallback(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata()
  if (meta.hasAlpha !== true) return true
  return cornersAreOpaque(buffer)
}

/** gemini/comfy용 크로마키를 재사용하되, 초록을 가정하지 않고 실제 좌상단 픽셀 색을 배경색으로 삼는다. */
async function applyCornerChromaKeyFallback(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const keyColor = { r: data[0] ?? 0, g: data[1] ?? 0, b: data[2] ?? 0 }
  const keyed = chromaKey({ data, width: info.width, height: info.height, channels: 4 }, { keyColor })
  return sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
    .png()
    .toBuffer()
}

/** `removeTempDirSafely`에서 재시도할 가치가 있는(=핸들이 곧 풀릴 수 있는) 에러 코드. */
const RETRYABLE_CLEANUP_CODES = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES'])

const defaultCleanupSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 성공한 자산의 임시 폴더를 지운다. Windows에서는 방금 죽인 프로세스 트리의 파일 핸들이 잠깐
 * 남아 있어 `rmSync`가 EPERM 등으로 실패할 수 있는데, 이는 진단 가치가 없는 부수적 실패이므로
 * 최대 `retries`번(기본 3, ~150ms 간격)까지만 재시도하고 그래도 안 되면 경고만 남기고 넘어간다 —
 * **절대 던지지 않는다.** 이미 읽어 들인 이미지의 성공 여부는 여기서 바뀌지 않는다.
 */
async function removeTempDirSafely(
  path: string,
  options: {
    rmSyncImpl: (path: string, options: { recursive: true; force: true }) => void
    sleep: (ms: number) => Promise<void>
    retries: number
    delayMs: number
  },
): Promise<void> {
  const { rmSyncImpl, sleep, retries, delayMs } = options
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      rmSyncImpl(path, { recursive: true, force: true })
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code !== undefined && RETRYABLE_CLEANUP_CODES.has(code)
      if (attempt === retries || !retryable) {
        logWarn(`codex: 임시 폴더 정리 실패(무시): ${path} — ${code ?? String(err)}`)
        return
      }
      await sleep(delayMs)
    }
  }
}

export interface CodexProviderOptions {
  spawnImpl?: SpawnFn
  /**
   * codex 실행 1건 상한(ms) 강제 오버라이드. 주면 kind/asset별 기본 타임아웃보다 우선한다
   * (CLI `CODEX_TIMEOUT_MS` 환경변수가 이 자리로 들어온다). 안 주면 asset.timeoutMs →
   * kind별 기본값(sheet는 `DEFAULT_CODEX_SHEET_TIMEOUT_MS`, 그 외는 `DEFAULT_CODEX_TIMEOUT_MS`) 순으로 고른다.
   */
  timeoutMs?: number
  /** 테스트에서 `os.tmpdir()` 대신 격리된 폴더를 쓰기 위한 오버라이드. */
  tmpDirBase?: string
  /** spawn 실패 재시도 백오프에 쓰는 sleep. 테스트에서 실제 타이머 없이 빠르게 돌리는 용도. */
  sleep?: (ms: number) => Promise<void>
  /** out.png 크기가 안정되면 타임아웃 전에 조기 종료할지. 기본 true. */
  earlyExitOnOutput?: boolean
  /** 조기 종료 폴링 주기(ms) 오버라이드. 기본 `CODEX_EARLY_EXIT_POLL_INTERVAL_MS`. 테스트에서 줄여서 쓴다. */
  earlyExitPollIntervalMs?: number
  /** 조기 종료 전 크기가 안 변해야 하는 연속 폴링 횟수. 기본 `CODEX_EARLY_EXIT_STABLE_CHECKS`. */
  earlyExitStableChecks?: number
  /** out.png 존재 확인용 fs 함수 오버라이드 (테스트 주입용). 기본 `node:fs`의 `existsSync`. */
  existsSyncImpl?: (path: string) => boolean
  /** out.png 크기 확인용 fs 함수 오버라이드 (테스트 주입용). 기본 `node:fs`의 `statSync`. */
  statSyncImpl?: (path: string) => { size: number }
  /**
   * out.png 회수(타임아웃/누락 둘 다)에도 실패했을 때 `generated_images` 폴더에서 마지막으로
   * 회수를 시도할 루트 오버라이드. 주면 `resolveGeneratedImagesDirs`의 자동 탐색을 건너뛴다
   * (테스트/CI 및 `CODEX_GENERATED_IMAGES_DIR` 환경변수보다 우선하는 강제 지정용).
   */
  generatedImageRoots?: string[]
  /** 임시 폴더 삭제(`rmSync`) 오버라이드 (테스트에서 EPERM 등을 재현하는 용도). 기본 `node:fs`의 `rmSync`. */
  rmSyncImpl?: (path: string, options: { recursive: true; force: true }) => void
  /** 임시 폴더 정리 실패 시 재시도 횟수(첫 시도 포함). 기본 `CODEX_TEMP_CLEANUP_RETRIES`(3). */
  cleanupRetries?: number
  /** 임시 폴더 정리 재시도 사이 지연(ms). 기본 `CODEX_TEMP_CLEANUP_RETRY_DELAY_MS`(150). `sleep` 옵션으로 대체 가능(테스트용). */
  cleanupRetryDelayMs?: number
}

/**
 * 로컬 Codex CLI 프로바이더. API 키 없이 사용자의 ChatGPT 로그인을 그대로 쓴다.
 * `codex exec`를 서브프로세스로 띄워 `image_gen__imagegen` 도구로 이미지를 생성하게 시키고,
 * 결과 파일(`out.png`)을 읽어 돌려준다. 한 번에 1~3분 걸릴 수 있어 호출부는 순차 실행을 전제로 한다.
 */
/** kind별 codex 기본 타임아웃. `sheet`는 3x3 격자 + 긴 프롬프트라 codex가 검증 단계를 오래 끈다. */
export function defaultTimeoutForKind(kind: GenerateOptions['kind']): number {
  return kind === 'sheet' ? DEFAULT_CODEX_SHEET_TIMEOUT_MS : DEFAULT_CODEX_TIMEOUT_MS
}

export function createCodexProvider(options: CodexProviderOptions = {}): ImageProvider {
  const spawnImpl = options.spawnImpl ?? (spawn as unknown as SpawnFn)
  // 명시적으로 준 값(예: CLI의 CODEX_TIMEOUT_MS 환경변수)은 원본 그대로 들고 있다가 호출마다
  // asset.timeoutMs → 이 값 → kind별 기본값 순으로 고른다. 여기서 기본값으로 못 박아버리면
  // kind별 기본 타임아웃을 적용할 수가 없다.
  const explicitTimeoutMs = options.timeoutMs
  const tmpBase = options.tmpDirBase ?? tmpdir()
  const sleep = options.sleep
  const earlyExitOnOutput = options.earlyExitOnOutput ?? true
  const earlyExitPollIntervalMs = options.earlyExitPollIntervalMs ?? CODEX_EARLY_EXIT_POLL_INTERVAL_MS
  const earlyExitStableChecks = options.earlyExitStableChecks ?? CODEX_EARLY_EXIT_STABLE_CHECKS
  const existsSyncImpl = options.existsSyncImpl ?? existsSync
  const statSyncImpl = options.statSyncImpl ?? statSync
  const generatedImageRoots = resolveGeneratedImagesDirs({ generatedImageRoots: options.generatedImageRoots })
  const rmSyncImpl = options.rmSyncImpl ?? rmSync
  const cleanupRetries = options.cleanupRetries ?? CODEX_TEMP_CLEANUP_RETRIES
  const cleanupRetryDelayMs = options.cleanupRetryDelayMs ?? CODEX_TEMP_CLEANUP_RETRY_DELAY_MS
  // 정리 재시도 사이 지연도 spawn 재시도와 같은 주입 지점(sleep)을 재사용한다 — 성공 경로에서는
  // spawn을 재시도하지 않으므로 테스트에서 두 용도가 섞여 카운트가 꼬일 일이 없다.
  const cleanupSleep = sleep ?? defaultCleanupSleep

  return {
    name: 'codex',
    async generate({ id, prompt, size, transparent, kind, timeoutMs: assetTimeoutMs }: GenerateOptions): Promise<GeneratedImage> {
      const { width, height } = sizeToDims(size)
      const instruction = buildCodexInstruction(width, height, transparent, prompt)
      const tempDir = mkdtempSync(join(tmpBase, `${CODEX_TEMP_DIR_PREFIX}${id}-`))
      const outPath = join(tempDir, CODEX_OUTPUT_FILENAME)
      const effectiveTimeoutMs = assetTimeoutMs ?? explicitTimeoutMs ?? defaultTimeoutForKind(kind)
      // PROMPT는 CLI 인자가 아니라 stdin으로 넘긴다. Windows에서 `shell: true`로 .cmd를 실행하면
      // Node가 인자를 이스케이프 없이 그냥 이어 붙이기만 해서(공식 문서에 명시된 동작), 지시문 안의
      // 공백/%/&/() 등에 cmd.exe가 단어를 쪼개버려 codex가 "unexpected argument" 로 죽는 걸 실측으로
      // 확인했다. `codex exec`는 PROMPT 인자가 없으면 stdin에서 읽는다(`codex exec --help` 참고)
      // — 이 경로는 cmd.exe 파싱을 아예 타지 않아 안전하다.
      const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-o', CODEX_LOG_FILENAME]
      const watch: EarlyExitWatch | undefined = earlyExitOnOutput
        ? { outPath, pollIntervalMs: earlyExitPollIntervalMs, stableChecks: earlyExitStableChecks, existsSyncImpl, statSyncImpl }
        : undefined
      // generated_images 폴백 회수에서 "이 실행이 만든 파일"만 보게 하는 기준 시각. spawn 직전
      // 시각에서 스큐를 빼 파일시스템/프로세스 시각차를 흡수한다.
      const runStartedAt = Date.now() - CODEX_GENERATED_IMAGES_START_SKEW_MS

      let result: RunResult
      try {
        // 타임아웃은 여기서 던지지 않고 `{timedOut: true}`로 정상 resolve된다(아래에서 따로 처리) —
        // 그러니 이 재시도는 spawn 실패 같은 진짜 일시적 오류에만 걸리고, 시간 초과는 절대 재시도하지 않는다.
        result = await withRetry(
          () => runProcess(spawnImpl, resolveCodexBinary(), args, tempDir, effectiveTimeoutMs, instruction, watch),
          {
            retries: RETRY_COUNT,
            baseDelayMs: RETRY_BASE_DELAY_MS,
            shouldRetry: () => true,
            ...(sleep !== undefined ? { sleep } : {}),
          },
        )
      } catch (err) {
        logWarn(`codex: ${id} 실행 자체가 실패해 임시 폴더를 남겨둔다: ${tempDir}`)
        throw err
      }

      let buffer: Buffer
      if (result.timedOut) {
        // 타임아웃이어도 codex가 out.png는 다 쓰고 이후 검증 단계에서만 오래 걸렸을 수 있다 —
        // 파일이 멀쩡하면 버리지 않고 회수한다. `runProcess`가 타임아웃 시점에 이미 프로세스
        // 트리를 죽였으니 여기서 따로 kill할 필요는 없다.
        const salvaged = await readSalvageableOutput(outPath)
        if (salvaged === undefined) {
          const fromGeneratedImages = await salvageFromGeneratedImages(generatedImageRoots, runStartedAt)
          if (fromGeneratedImages === undefined) {
            logWarn(`codex: ${id} 실행이 시간 초과돼 임시 폴더를 남겨둔다: ${tempDir}`)
            throw new Error(`codex 실행이 시간 초과됐다 (${effectiveTimeoutMs}ms): ${id}\nstderr: ${tail(result.stderr)}`)
          }
          logWarn(`codex: ${id} out.png는 없지만 생성 이미지 폴더에서 회수한다: ${fromGeneratedImages.path}`)
          buffer = fromGeneratedImages.buffer
        } else {
          logWarn(`codex: ${id} 시간 초과했지만 out.png가 있어 회수한다`)
          buffer = salvaged
        }
      } else {
        if (!existsSync(outPath)) {
          const fromGeneratedImages = await salvageFromGeneratedImages(generatedImageRoots, runStartedAt)
          if (fromGeneratedImages !== undefined) {
            logWarn(`codex: ${id} out.png는 없지만 생성 이미지 폴더에서 회수한다: ${fromGeneratedImages.path}`)
            buffer = fromGeneratedImages.buffer
          } else {
            logWarn(`codex: ${id}가 ${CODEX_OUTPUT_FILENAME}를 만들지 않아 임시 폴더를 남겨둔다: ${tempDir}`)
            const logPath = join(tempDir, CODEX_LOG_FILENAME)
            const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
            throw new Error(
              [
                `codex가 ${CODEX_OUTPUT_FILENAME}를 만들지 않았다 (exit ${result.exitCode ?? 'null'}): ${id}`,
                `stdout: ${tail(result.stdout)}`,
                `stderr: ${tail(result.stderr)}`,
                log !== '' ? `${CODEX_LOG_FILENAME}: ${tail(log)}` : '',
              ]
                .filter((line) => line !== '')
                .join('\n'),
            )
          }
        } else {
          buffer = readFileSync(outPath)
        }
      }

      if (transparent) {
        const needsFallback = await needsAlphaFallback(buffer)
        if (needsFallback) {
          logWarn(`codex: ${id} 응답에 투명 배경이 없어(또는 알파가 없어) 폴백 크로마키를 적용한다`)
          buffer = await applyCornerChromaKeyFallback(buffer)
        }
      }

      // 정리 실패(EPERM/EBUSY 등, 방금 죽인 프로세스의 잔여 핸들)는 이미 읽어 들인 이미지의
      // 성공 여부에 영향을 주지 않는다 — `removeTempDirSafely`는 절대 던지지 않는다.
      await removeTempDirSafely(tempDir, { rmSyncImpl, sleep: cleanupSleep, retries: cleanupRetries, delayMs: cleanupRetryDelayMs })
      return { buffer, mimeType: 'image/png' }
    },
  }
}

export interface CheckCodexOptions {
  /** `'1'`이면 실제로 spawn하지 않고 즉시 true를 반환한다 (테스트/CI에서 codex 없이 자동 선택 로직을 검증할 때). */
  available?: string
  spawnImpl?: SpawnFn
  timeoutMs?: number
}

/** `codex login status`가 0으로 종료하면 로그인된 것으로 본다. 실패/타임아웃/에러는 전부 false. */
export async function checkCodexAvailable(options: CheckCodexOptions = {}): Promise<boolean> {
  if (options.available === '1') return true

  const spawnImpl = options.spawnImpl ?? (spawn as unknown as SpawnFn)
  const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_AVAILABILITY_TIMEOUT_MS

  try {
    const result = await runProcess(spawnImpl, resolveCodexBinary(), ['login', 'status'], process.cwd(), timeoutMs)
    return !result.timedOut && result.exitCode === 0
  } catch {
    return false
  }
}
