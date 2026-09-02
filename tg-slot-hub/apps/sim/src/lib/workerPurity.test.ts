import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 워커는 브라우저에서만 돈다. `node:*`를 정적으로 끌어오는 모듈이 하나라도 그래프에 끼면
 * dev에서는 "Module externalized for browser compatibility" 뒤에 런타임 오류로,
 * 빌드에서는 rollup 오류로 터진다. 그래서 import 그래프를 직접 걸어 확인한다.
 *
 * 특히 `@tgslot/slot-engine/crypto-rng`는 `node:crypto`를 쓰는 서버 전용 서브패스다.
 * 누군가 편하다고 그걸 끌어오면 여기서 잡힌다.
 */
const appRoot = resolve(process.cwd())
const workspaceRoot = resolve(appRoot, '../..')
const workerEntry = join(appRoot, 'src', 'lib', 'mc.worker.ts')

/** 워크스페이스 패키지 이름 -> 패키지 폴더. */
function findWorkspacePackages(): Map<string, string> {
  const found = new Map<string, string>()
  for (const group of ['packages', 'tools', 'apps']) {
    const groupDir = join(workspaceRoot, group)
    if (!existsSync(groupDir)) continue
    for (const name of readdirSync(groupDir)) {
      const dir = join(groupDir, name)
      const manifest = join(dir, 'package.json')
      if (!statSync(dir).isDirectory() || !existsSync(manifest)) continue
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }
      if (typeof parsed.name === 'string') found.set(parsed.name, dir)
    }
  }
  return found
}

const workspacePackages = findWorkspacePackages()

function readExports(packageDir: string): Record<string, string> {
  const parsed = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>
    main?: string
  }
  const map: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed.exports ?? {})) {
    if (typeof value === 'string') map[key] = value
  }
  if (map['.'] === undefined && typeof parsed.main === 'string') map['.'] = parsed.main
  return map
}

function withExtension(path: string): string | null {
  const candidates = [path, path.replace(/\.js$/, '.ts'), path.replace(/\.js$/, '.tsx'), `${path}.ts`, `${path}.tsx`]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  const index = join(path, 'index.ts')
  return existsSync(index) ? index : null
}

/** 워크스페이스 안에서만 따라간다. 외부 의존(zod 등)은 그래프 밖으로 둔다. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith('.')) return withExtension(resolve(dirname(fromFile), specifier))

  for (const [name, dir] of workspacePackages) {
    if (specifier !== name && !specifier.startsWith(`${name}/`)) continue
    const subpath = specifier === name ? '.' : `./${specifier.slice(name.length + 1)}`
    const target = readExports(dir)[subpath]
    return target === undefined ? null : withExtension(resolve(dir, target))
  }
  return null
}

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function extractSpecifiers(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1]
    if (specifier !== undefined) found.push(specifier)
  }
  return found
}

interface GraphNode {
  file: string
  specifiers: string[]
}

/** 워커 진입점에서 시작해 워크스페이스 소스만 따라간 import 그래프. */
function walkGraph(entry: string): GraphNode[] {
  const seen = new Set<string>()
  const queue = [entry]
  const nodes: GraphNode[] = []

  while (queue.length > 0) {
    const file = queue.shift()
    if (file === undefined || seen.has(file)) continue
    seen.add(file)
    const specifiers = extractSpecifiers(readFileSync(file, 'utf8'))
    nodes.push({ file, specifiers })
    for (const specifier of specifiers) {
      const next = resolveSpecifier(specifier, file)
      if (next !== null && !seen.has(next)) queue.push(next)
    }
  }
  return nodes
}

describe('몬테카를로 워커의 브라우저 순수성', () => {
  const graph = walkGraph(workerEntry)

  it('워커 진입점이 있고 그래프가 실제로 뻗어 나간다', () => {
    expect(existsSync(workerEntry)).toBe(true)
    // 워커 -> mcTypes/slot-engine/rtp-sim audit -> 그 아래 모듈들.
    expect(graph.length).toBeGreaterThan(10)
  })

  it('그래프 안 어디에도 node: import가 없다', () => {
    const offenders = graph
      .flatMap((node) => node.specifiers.map((specifier) => ({ file: node.file, specifier })))
      .filter((entry) => entry.specifier.startsWith('node:'))
      .map((entry) => `${entry.file.replace(workspaceRoot, '')} -> ${entry.specifier}`)
    expect(offenders).toEqual([])
  })

  it('서버 전용 crypto-rng 서브패스를 끌어오지 않는다', () => {
    const offenders = graph
      .filter((node) => node.specifiers.some((specifier) => specifier.includes('crypto-rng')))
      .map((node) => node.file.replace(workspaceRoot, ''))
    expect(offenders).toEqual([])
  })

  it('rtp-sim의 검수 헬퍼가 그래프에 들어 있다', () => {
    // 계산을 워커 안에서 다시 구현하지 않고 공유 모듈을 쓴다는 확인이다.
    const files = graph.map((node) => node.file.replace(/\\/g, '/'))
    expect(files.some((file) => file.includes('tools/rtp-sim/src/audit/'))).toBe(true)
    expect(files.some((file) => file.includes('packages/slot-engine/src/'))).toBe(true)
  })

  it('검수 헬퍼 폴더 전체가 node:를 쓰지 않는다', () => {
    // GUI가 audit/*를 통째로 import하므로 그래프에 안 걸린 파일도 브라우저 안전해야 한다.
    const auditDir = join(workspaceRoot, 'tools', 'rtp-sim', 'src', 'audit')
    const offenders: string[] = []
    for (const name of readdirSync(auditDir)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
      const file = join(auditDir, name)
      for (const specifier of extractSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('node:')) offenders.push(`${name} -> ${specifier}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
