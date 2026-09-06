import { describe, expect, it } from 'vitest'
import { formatReport, formatTotals, parseCheckArgs, shouldFail, summarizeReport } from './checkReport.js'
import type { PackProblem } from './pack.js'

const error: PackProblem = { level: 'error', file: 'theme/theme.json', field: 'symbols.wild', message: '자산 파일이 없다' }
const warn: PackProblem = { level: 'warn', file: 'theme/old.svg', field: '', message: '아무도 참조하지 않는 파일이다' }

describe('parseCheckArgs', () => {
  it('인자가 없으면 전체 검사, 기본은 비엄격·고아 검사 켬', () => {
    expect(parseCheckArgs([])).toEqual({ ids: [], strict: false, quiet: false, orphans: true, help: false })
  })

  it('게임 id를 여러 개 받는다', () => {
    expect(parseCheckArgs(['classic-777', 'shiba-shrine']).ids).toEqual(['classic-777', 'shiba-shrine'])
  })

  it('플래그를 읽는다', () => {
    const options = parseCheckArgs(['--strict', '--quiet', '--no-orphans'])
    expect(options).toMatchObject({ strict: true, quiet: true, orphans: false })
  })

  it('모르는 옵션은 던진다', () => {
    expect(() => parseCheckArgs(['--nope'])).toThrow(/알 수 없는 옵션/)
  })
})

describe('formatReport', () => {
  it('문제가 없으면 OK 한 줄이다', () => {
    expect(formatReport(summarizeReport('demo', []))).toEqual(['demo: OK'])
  })

  it('문제마다 한 줄씩, 파일과 필드를 함께 찍는다', () => {
    const lines = formatReport(summarizeReport('demo', [error, warn]))
    expect(lines[0]).toBe('demo: 오류 1, 경고 1')
    expect(lines[1]).toBe('  ERROR demo theme/theme.json symbols.wild — 자산 파일이 없다')
    expect(lines[2]).toBe('  WARN  demo theme/old.svg — 아무도 참조하지 않는 파일이다')
  })

  it('--quiet면 경고 줄을 빼지만 집계에는 남는다', () => {
    const lines = formatReport(summarizeReport('demo', [error, warn]), true)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('demo: 오류 1, 경고 1')
  })
})

describe('formatTotals', () => {
  it('팩 전체를 합산한다', () => {
    const reports = [summarizeReport('a', [error]), summarizeReport('b', [warn, warn])]
    expect(formatTotals(reports)).toBe('팩 2개: 오류 1, 경고 2')
  })
})

describe('shouldFail', () => {
  it('오류가 있으면 실패다', () => {
    expect(shouldFail([summarizeReport('a', [error])], false)).toBe(true)
  })

  it('경고만 있으면 기본은 통과, --strict면 실패다', () => {
    const reports = [summarizeReport('a', [warn])]
    expect(shouldFail(reports, false)).toBe(false)
    expect(shouldFail(reports, true)).toBe(true)
  })

  it('문제가 없으면 통과다', () => {
    expect(shouldFail([summarizeReport('a', [])], true)).toBe(false)
  })
})
