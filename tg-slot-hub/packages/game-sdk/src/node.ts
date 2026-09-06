import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectGamePack } from './pack.js'
import type { GamePack, PackProblem, PackSource } from './pack.js'
import { checkGamePack, parseGamePack } from './validate.js'
import type { ValidateOptions } from './validate.js'

/**
 * 디스크에서 게임 팩을 읽는 어댑터. 순수 로직(`pack.ts`/`validate.ts`)은 `PackSource`만 알고
 * 파일시스템을 모른다 — 부작용을 이 파일 하나에 몰아 둔 것이다.
 *
 * `@tgslot/game-sdk/node` 서브패스로만 노출한다. 기본 진입점은 브라우저에서도 import될 수 있게
 * `node:*`를 전혀 쓰지 않는다.
 */

const WORKSPACE_MARKER = 'pnpm-workspace.yaml'
const GAMES_DIRNAME = 'games'
/** `_`로 시작하는 폴더(`_template`)는 스캐폴드라 게임 목록에서 뺀다. */
const SCAFFOLD_PREFIX = '_'

/** 팩 폴더 아래 모든 파일의 상대 경로(`/` 구분). 심볼릭 링크는 따라가지 않는다. */
function listFilesRecursive(root: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) out.push(...listFilesRecursive(root, relPath))
    else if (entry.isFile()) out.push(relPath)
  }
  return out
}

/** `git ls-files` 한 번 실행 상한(ms). 이 검사 하나 때문에 CLI가 멈춰 있으면 안 된다. */
const GIT_TIMEOUT_MS = 10_000

/**
 * 팩 폴더 안에서 git이 **추적 중인** 파일의 상대 경로. 알 수 없으면 undefined.
 *
 * 파일마다 `git ls-files --error-unmatch <path>`를 부르면 프로세스가 자산 수만큼 뜬다.
 * 인덱스를 한 번에 나열해 같은 답을 얻는다 (추적 중 = 인덱스에 있음).
 * git이 없거나 저장소 밖이면 던지지 않고 undefined를 돌려줘 호출 측이 검사만 건너뛰게 한다.
 */
export function listTrackedFiles(dir: string): string[] | undefined {
  if (!existsSync(dir)) return undefined
  try {
    const stdout = execFileSync('git', ['ls-files', '-z', '--cached', '--', '.'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return stdout.split('\0').filter((path) => path !== '')
  } catch {
    // git 미설치, 저장소 밖, 권한 문제 — 어느 쪽이든 "추적 여부를 모른다"로 취급한다.
    return undefined
  }
}

/** 게임 팩 폴더 하나를 읽는 `PackSource`. */
export function createDirSource(dir: string): PackSource {
  return {
    readText: (path) => {
      const full = join(dir, ...path.split('/'))
      if (!existsSync(full)) return undefined
      return readFileSync(full, 'utf8')
    },
    list: () => (existsSync(dir) ? listFilesRecursive(dir).sort() : []),
    listTracked: () => listTrackedFiles(dir),
  }
}

/**
 * 게임 팩 1개를 디스크에서 읽고 전부 검증한다. `error`가 하나라도 있으면 던진다.
 * 폴더 이름이 곧 팩 id다.
 */
export function loadGamePack(dir: string, options: ValidateOptions = {}): GamePack {
  return parseGamePack(createDirSource(dir), basename(resolve(dir)), options)
}

/** 검증 결과를 문제 목록으로만 돌려준다. CLI가 쓴다. */
export function checkGamePackDir(dir: string, options: ValidateOptions = {}): PackProblem[] {
  return checkGamePack(createDirSource(dir), basename(resolve(dir)), options)
}

/** 스키마만 보고 팩을 조립한다. 참조 무결성은 보지 않는다 (부팅 경로가 빠르게 쓰는 길). */
export function inspectGamePackDir(dir: string): ReturnType<typeof inspectGamePack> {
  return inspectGamePack(createDirSource(dir), basename(resolve(dir)))
}

/** 이 모듈이 있는 디렉터리. src/로 돌든 번들로 돌든 실제 위치를 가리킨다. */
function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

/** `pnpm-workspace.yaml`을 찾아 올라가며 모노레포 루트를 정한다. */
export function findWorkspaceRoot(startDir: string = moduleDir()): string {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`${WORKSPACE_MARKER}를 찾지 못했다: ${startDir}`)
    current = parent
  }
}

/** `GAMES_DIR` 환경변수가 있으면 그것을, 없으면 워크스페이스 루트의 `games/`를 쓴다. */
export function resolveGamesDir(env: NodeJS.ProcessEnv = process.env, startDir: string = moduleDir()): string {
  const override = env.GAMES_DIR
  if (override) return resolve(override)
  return join(findWorkspaceRoot(startDir), GAMES_DIRNAME)
}

/** `games/` 아래 팩 폴더 절대 경로 목록. 스캐폴드(`_`로 시작)는 뺀다. */
export function listGamePackDirs(gamesDir: string = resolveGamesDir()): string[] {
  if (!existsSync(gamesDir)) return []
  return readdirSync(gamesDir)
    .filter((name) => !name.startsWith(SCAFFOLD_PREFIX))
    .map((name) => join(gamesDir, name))
    .filter((dir) => statSync(dir).isDirectory())
    .sort()
}
