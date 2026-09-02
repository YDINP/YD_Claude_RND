import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE_MARKER = 'pnpm-workspace.yaml'

/** pnpm-workspace.yaml을 찾아 올라가며 모노레포 루트를 정한다. */
export function findWorkspaceRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`${WORKSPACE_MARKER}를 찾지 못했다: ${startDir}`)
    current = parent
  }
}

export function gamesDir(): string {
  return join(findWorkspaceRoot(), 'games')
}

export const MANIFEST_FILE = 'manifest.json'
export const MATH_FILE = 'math.json'

/**
 * `_`로 시작하지 않는 games 하위 폴더 전부. 분류하기 전의 날것이다.
 * 게이트가 실제로 검사할 대상은 `listGamePackDirs`를 쓴다.
 */
export function listGameDirs(root: string = gamesDir()): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => !name.startsWith('_'))
    .map((name) => join(root, name))
    .filter((dir) => statSync(dir).isDirectory())
    .sort()
}

/**
 * manifest.json이 있는 폴더인지. **아트만 있는 폴더와 진짜 게임 팩을 가르는 기준**이다.
 * `apps/api/src/games/packs.ts`의 로더와 같은 규칙을 쓴다.
 */
export function hasManifest(dir: string): boolean {
  return existsSync(join(dir, MANIFEST_FILE))
}

/**
 * 게이트 검사 대상 게임 팩.
 *
 * 아트 파이프라인이 `games/<id>/art`를 수학 팩보다 며칠 먼저 만든다. manifest가 없는 폴더는
 * 아직 게임이 아니라고 보고 건너뛴다. 그러지 않으면 아트를 만드는 것만으로 CI가 통째로 막힌다.
 *
 * 반대로 manifest가 **있는데** math.json이 없거나 깨진 폴더는 건너뛰지 않는다.
 * 만들다 만 팩을 조용히 빠뜨리는 것이 실패로 세우는 것보다 위험하기 때문이다.
 */
export function listGamePackDirs(root: string = gamesDir()): string[] {
  return listGameDirs(root).filter(hasManifest)
}

/** manifest가 없어 검사에서 빠진 폴더. 한 번 로그로 알리는 용도다. */
export function listArtOnlyDirs(root: string = gamesDir()): string[] {
  return listGameDirs(root).filter((dir) => !hasManifest(dir))
}

/**
 * CLI 인자를 math.json 경로로 해석한다.
 * 게임 폴더 / math.json 파일 / 게임 id 어느 쪽을 줘도 되고,
 * pnpm --filter로 실행돼 cwd가 패키지 폴더여도 워크스페이스 루트 기준으로 다시 찾는다.
 */
export function resolveMathPath(input: string): string {
  const candidates = isAbsolute(input)
    ? [input]
    : [resolve(process.cwd(), input), resolve(findWorkspaceRoot(), input), join(gamesDir(), input)]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    if (statSync(candidate).isDirectory()) {
      const nested = join(candidate, 'math.json')
      if (existsSync(nested)) return nested
      continue
    }
    return candidate
  }
  throw new Error(`math.json을 찾지 못했다: ${input}`)
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}
