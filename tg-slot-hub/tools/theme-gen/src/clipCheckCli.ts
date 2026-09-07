import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { logError } from './log.js'
import { findWorkspaceRoot } from './paths.js'
import { checkTransitionClip, formatTransitionClipReport } from './transitionClipCheck.js'

const USAGE = `사용법: pnpm --filter @tgslot/theme-gen check:clips [파일 또는 폴더...]

인자를 주지 않으면 games/*/theme/transitions/*.webp 를 전부 검사한다.

검사 항목 (계약은 docs/TRANSITION_DESIGN.md 5-1)
  - 해상도 360x640, 길이 3.00초, loop=1
  - **정지 구간**: 프레임 하나가 200ms를 넘으면 실패.
    libwebp가 동일한 연속 프레임을 합치므로 긴 프레임 = 화면이 멈춰 있었다는 뜻이다.
    전면 커튼이 멈추면 연출이 아니라 로딩 화면으로 읽힌다.`

/** 모든 팩의 `theme/transitions` 아래 `.webp`를 모은다. 없으면 빈 배열. */
function defaultTargets(root: string): string[] {
  const gamesDir = join(root, 'games')
  const found: string[] = []
  let packs: string[]
  try {
    packs = readdirSync(gamesDir)
  } catch {
    return found
  }
  for (const pack of packs) {
    const dir = join(gamesDir, pack, 'theme', 'transitions')
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.endsWith('.webp')) found.push(join(dir, entry))
    }
  }
  return found.sort()
}

/** 인자 하나를 파일 목록으로 편다. 폴더면 그 안의 `.webp`를 얕게 훑는다. */
function expandTarget(target: string): string[] {
  if (statSync(target).isDirectory()) {
    return readdirSync(target)
      .filter((entry) => entry.endsWith('.webp'))
      .map((entry) => join(target, entry))
      .sort()
  }
  return [target]
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE)
    return
  }

  const root = findWorkspaceRoot()
  const targets = args.length > 0 ? args.flatMap(expandTarget) : defaultTargets(root)

  if (targets.length === 0) {
    console.log('[theme-gen] 검사할 전환 클립이 없다.')
    return
  }

  let failed = 0
  for (const target of targets) {
    const label = relative(root, target).replace(/\\/g, '/')
    try {
      const report = checkTransitionClip(readFileSync(target))
      console.log(formatTransitionClipReport(label, report))
      for (const problem of report.problems) console.log(`    ${problem}`)
      if (report.problems.length > 0) failed += 1
    } catch (error) {
      failed += 1
      console.log(`FAIL ${label}`)
      console.log(`    ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log(`\n전환 클립 ${targets.length}개: 실패 ${failed}`)
  if (failed > 0) process.exitCode = 1
}

try {
  main()
} catch (error) {
  logError(error)
  process.exitCode = 1
}
