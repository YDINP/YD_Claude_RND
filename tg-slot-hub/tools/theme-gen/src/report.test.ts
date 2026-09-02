import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { planAssets } from './pipeline.js'
import { formatDryRunPlan, formatHeader, formatProviderLine } from './report.js'
import { parsePromptsFile } from './schema.js'

const fixturePath = fileURLToPath(new URL('../fixtures/prompts.json', import.meta.url))
const file = parsePromptsFile(JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown)

/** 아무 출력도 없는 빈 게임 폴더. willSkip이 전부 false로 고정돼 스냅샷이 안정적이다. */
const emptyGameDir = mkdtempSync(join(tmpdir(), 'theme-gen-report-'))

afterAll(() => {
  rmSync(emptyGameDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('formatHeader', () => {
  it('게임 이름, prompts.json 경로, concept을 담는다', () => {
    const header = formatHeader('classic-777', '/abs/games/classic-777/art/prompts.json', file)
    expect(header).toBe('\nclassic-777  (/abs/games/classic-777/art/prompts.json)\n  concept: ' + file.concept)
  })
})

describe('formatProviderLine', () => {
  it('dry-run + comfy면 연결 확인 생략 문구를 붙인다', () => {
    expect(formatProviderLine('comfy', undefined, true)).toBe('  provider: comfy (연결 확인 생략, http://127.0.0.1:8188)\n')
  })

  it('dry-run이 아니면 comfy여도 문구를 안 붙인다', () => {
    expect(formatProviderLine('comfy', undefined, false)).toBe('  provider: comfy\n')
  })

  it('openai/gemini는 dry-run이어도 그대로다', () => {
    expect(formatProviderLine('openai', undefined, true)).toBe('  provider: openai\n')
  })

  it('dry-run + codex면 로그인 확인 생략 문구를 붙인다', () => {
    expect(formatProviderLine('codex', undefined, true)).toBe('  provider: codex (로그인 확인 생략)\n')
  })

  it('dry-run이 아니면 codex여도 문구를 안 붙인다', () => {
    expect(formatProviderLine('codex', undefined, false)).toBe('  provider: codex\n')
  })
})

describe('formatDryRunPlan', () => {
  it('픽스처 전체 자산 계획을 스냅샷과 비교한다 (--dry-run 출력)', () => {
    const plans = planAssets(emptyGameDir, file, file.assets, false)
    expect(formatDryRunPlan(plans).join('\n')).toMatchSnapshot()
  })

  it('willSkip이 true면 skip 예정 문구가 붙는다', () => {
    const plans = planAssets(emptyGameDir, file, file.assets, false).map((plan) => ({ ...plan, willSkip: true }))
    const lines = formatDryRunPlan(plans)
    expect(lines[0]).toContain('skip 예정')
  })
})
