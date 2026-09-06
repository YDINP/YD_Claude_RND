import { formatProblem } from './pack.js'
import type { PackProblem } from './pack.js'

/**
 * `pack:check`의 인자 파싱과 출력 조립. 부작용이 없어서 그대로 테스트할 수 있다.
 * 실제 파일 읽기와 종료 코드는 `checkCli.ts`가 맡는다.
 */

export const CHECK_USAGE = `사용법: pnpm pack:check [게임 id ...] [옵션]

인자를 주지 않으면 games/ 아래 모든 팩을 검사한다 (\`_\`로 시작하는 스캐폴드는 제외).

옵션
  --strict        경고도 실패로 친다 (기본은 error만 실패)
  --quiet         경고를 출력하지 않는다
  --no-orphans    고아 파일 검사를 끈다
  -h, --help      도움말`

export interface CheckCliOptions {
  ids: string[]
  strict: boolean
  quiet: boolean
  orphans: boolean
  help: boolean
}

export function parseCheckArgs(argv: readonly string[]): CheckCliOptions {
  const options: CheckCliOptions = { ids: [], strict: false, quiet: false, orphans: true, help: false }
  for (const arg of argv) {
    switch (arg) {
      case '--strict':
        options.strict = true
        break
      case '--quiet':
        options.quiet = true
        break
      case '--no-orphans':
        options.orphans = false
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션: ${arg}\n\n${CHECK_USAGE}`)
        options.ids.push(arg)
    }
  }
  return options
}

/** 팩 1개의 결과. 출력과 종료 코드 판정이 같은 값을 본다. */
export interface PackReport {
  id: string
  problems: PackProblem[]
  errors: number
  warnings: number
}

export function summarizeReport(id: string, problems: PackProblem[]): PackReport {
  return {
    id,
    problems,
    errors: problems.filter((problem) => problem.level === 'error').length,
    warnings: problems.filter((problem) => problem.level === 'warn').length,
  }
}

/** 팩 하나의 출력 줄들. 헤더 1줄 + 문제 1줄씩. */
export function formatReport(report: PackReport, quiet = false): string[] {
  const header = report.errors === 0 && report.warnings === 0 ? `${report.id}: OK` : `${report.id}: 오류 ${report.errors}, 경고 ${report.warnings}`
  const lines = [header]
  for (const problem of report.problems) {
    if (quiet && problem.level === 'warn') continue
    lines.push(`  ${formatProblem(report.id, problem)}`)
  }
  return lines
}

export function formatTotals(reports: readonly PackReport[]): string {
  const errors = reports.reduce((sum, report) => sum + report.errors, 0)
  const warnings = reports.reduce((sum, report) => sum + report.warnings, 0)
  return `팩 ${reports.length}개: 오류 ${errors}, 경고 ${warnings}`
}

/** 실패로 볼지. `--strict`면 경고도 실패다. */
export function shouldFail(reports: readonly PackReport[], strict: boolean): boolean {
  return reports.some((report) => report.errors > 0 || (strict && report.warnings > 0))
}
