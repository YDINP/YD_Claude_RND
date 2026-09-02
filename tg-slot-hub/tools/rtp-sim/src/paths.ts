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

/**
 * 게이트 검사 대상 게임 폴더 전부.
 * `_`로 시작하는 폴더(_template)만 제외하고, math.json이 없는 폴더도 **포함한다**.
 * 파일이 빠진 팩은 조용히 건너뛰는 대신 게이트 테스트에서 실패해야 하기 때문이다.
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
