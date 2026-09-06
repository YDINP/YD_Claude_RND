import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CHECK_USAGE, formatReport, formatTotals, parseCheckArgs, shouldFail, summarizeReport } from './checkReport.js'
import { checkGamePackDir, listGamePackDirs, resolveGamesDir } from './node.js'
import type { ValidateOptions } from './validate.js'

/**
 * `pnpm pack:check [id...]` — 게임 팩 계약 검사기.
 *
 * 팩마다 스키마 위반, 끊어진 자산 참조, math와 theme의 심볼 불일치, 고아 파일을 한 줄씩 찍는다.
 * `error`가 하나라도 있으면 exit 1이라 CI 게이트로 쓸 수 있다.
 */
function resolveDirs(ids: readonly string[], gamesDir: string): string[] {
  if (ids.length === 0) return listGamePackDirs(gamesDir)
  return ids.map((id) => {
    const dir = join(gamesDir, id)
    if (!existsSync(dir)) throw new Error(`게임 팩 폴더를 찾지 못했다: ${dir}`)
    return dir
  })
}

function main(): void {
  const options = parseCheckArgs(process.argv.slice(2))
  if (options.help) {
    console.log(CHECK_USAGE)
    return
  }

  const gamesDir = resolveGamesDir()
  const dirs = resolveDirs(options.ids, gamesDir)
  if (dirs.length === 0) throw new Error(`검사할 게임 팩이 없다: ${gamesDir}`)

  const validateOptions: ValidateOptions = options.orphans ? {} : { orphans: false }
  const reports = dirs.map((dir) => summarizeReport(basename(dir), checkGamePackDir(dir, validateOptions)))

  for (const report of reports) {
    for (const line of formatReport(report, options.quiet)) console.log(line)
  }
  console.log(`\n${formatTotals(reports)}`)

  if (shouldFail(reports, options.strict)) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(`[pack:check] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
