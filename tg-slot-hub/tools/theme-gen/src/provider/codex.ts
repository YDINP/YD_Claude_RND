import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { chromaKey } from '../chromaKey.js'
import {
  CODEX_LOG_FILENAME,
  CODEX_OUTPUT_FILENAME,
  CODEX_OUTPUT_TAIL_LENGTH,
  CODEX_TEMP_DIR_PREFIX,
  DEFAULT_CODEX_AVAILABILITY_TIMEOUT_MS,
  DEFAULT_CODEX_TIMEOUT_MS,
} from '../constants.js'
import { logWarn } from '../log.js'
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
  options: { cwd: string; stdio: ['pipe' | 'ignore', 'pipe', 'pipe']; shell?: boolean },
) => SpawnedProcessLike

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
 * 프로세스를 띄우고 stdout/stderr를 모으다가 close/timeout/error 중 먼저 오는 쪽으로 정리한다.
 * `stdin`을 주면 그 내용을 써서 보내고 스트림을 닫는다(codex `exec`에 PROMPT를 이 경로로 넘긴다 —
 * 이유는 `generate()` 쪽 주석 참고).
 */
function runProcess(spawnImpl: SpawnFn, command: string, args: string[], cwd: string, timeoutMs: number, stdin?: string): Promise<RunResult> {
  const child = spawnImpl(command, args, {
    cwd,
    stdio: [stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  return new Promise<RunResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve({ stdout, stderr, timedOut: true, exitCode: null })
    }, timeoutMs)

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
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, timedOut: false, exitCode: code })
    })

    if (stdin !== undefined) {
      child.stdin?.write(stdin)
      child.stdin?.end()
    }
  })
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

export interface CodexProviderOptions {
  spawnImpl?: SpawnFn
  /** codex 실행 1건 상한(ms). 기본 `DEFAULT_CODEX_TIMEOUT_MS`(5분). */
  timeoutMs?: number
  /** 테스트에서 `os.tmpdir()` 대신 격리된 폴더를 쓰기 위한 오버라이드. */
  tmpDirBase?: string
}

/**
 * 로컬 Codex CLI 프로바이더. API 키 없이 사용자의 ChatGPT 로그인을 그대로 쓴다.
 * `codex exec`를 서브프로세스로 띄워 `image_gen__imagegen` 도구로 이미지를 생성하게 시키고,
 * 결과 파일(`out.png`)을 읽어 돌려준다. 한 번에 1~3분 걸릴 수 있어 호출부는 순차 실행을 전제로 한다.
 */
export function createCodexProvider(options: CodexProviderOptions = {}): ImageProvider {
  const spawnImpl = options.spawnImpl ?? (spawn as unknown as SpawnFn)
  const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS
  const tmpBase = options.tmpDirBase ?? tmpdir()

  return {
    name: 'codex',
    async generate({ id, prompt, size, transparent }: GenerateOptions): Promise<GeneratedImage> {
      const { width, height } = sizeToDims(size)
      const instruction = buildCodexInstruction(width, height, transparent, prompt)
      const tempDir = mkdtempSync(join(tmpBase, `${CODEX_TEMP_DIR_PREFIX}${id}-`))
      // PROMPT는 CLI 인자가 아니라 stdin으로 넘긴다. Windows에서 `shell: true`로 .cmd를 실행하면
      // Node가 인자를 이스케이프 없이 그냥 이어 붙이기만 해서(공식 문서에 명시된 동작), 지시문 안의
      // 공백/%/&/() 등에 cmd.exe가 단어를 쪼개버려 codex가 "unexpected argument" 로 죽는 걸 실측으로
      // 확인했다. `codex exec`는 PROMPT 인자가 없으면 stdin에서 읽는다(`codex exec --help` 참고)
      // — 이 경로는 cmd.exe 파싱을 아예 타지 않아 안전하다.
      const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-o', CODEX_LOG_FILENAME]

      let result: RunResult
      try {
        result = await runProcess(spawnImpl, resolveCodexBinary(), args, tempDir, timeoutMs, instruction)
      } catch (err) {
        logWarn(`codex: ${id} 실행 자체가 실패해 임시 폴더를 남겨둔다: ${tempDir}`)
        throw err
      }

      const outPath = join(tempDir, CODEX_OUTPUT_FILENAME)

      if (result.timedOut) {
        logWarn(`codex: ${id} 실행이 시간 초과돼 임시 폴더를 남겨둔다: ${tempDir}`)
        throw new Error(`codex 실행이 시간 초과됐다 (${timeoutMs}ms): ${id}\nstderr: ${tail(result.stderr)}`)
      }

      if (!existsSync(outPath)) {
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

      let buffer: Buffer = readFileSync(outPath)
      if (transparent) {
        const needsFallback = await needsAlphaFallback(buffer)
        if (needsFallback) {
          logWarn(`codex: ${id} 응답에 투명 배경이 없어(또는 알파가 없어) 폴백 크로마키를 적용한다`)
          buffer = await applyCornerChromaKeyFallback(buffer)
        }
      }

      rmSync(tempDir, { recursive: true, force: true })
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
