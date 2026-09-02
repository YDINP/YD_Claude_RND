import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import type { GenerateAssetResult } from './pipeline.js'
import { planAssets } from './pipeline.js'
import { formatDryRunPlan, formatHeader, formatProviderLine, formatRunSummary } from './report.js'
import type { PromptAsset } from './schema.js'
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

const dummyAsset: PromptAsset = { id: 'a', kind: 'symbol', prompt: 'p', size: '1024x1024', transparent: false, out: 'a.webp', outSize: 100 }

describe('formatRunSummary', () => {
  it('생성/skip 개수와 총 시간/바이트를 합산한다', () => {
    const results: GenerateAssetResult[] = [
      { asset: dummyAsset, skipped: false, ms: 500, bytes: 1000 },
      { asset: dummyAsset, skipped: false, ms: 1500, bytes: 2_000_000 },
      { asset: dummyAsset, skipped: true, ms: 0, bytes: 0 },
    ]
    const summary = formatRunSummary(results)
    expect(summary).toContain('자산 3개')
    expect(summary).toContain('생성 2')
    expect(summary).toContain('skip 1')
    expect(summary).toContain('2.0s') // 500+1500ms
    expect(summary).toContain('1.91MB') // 2_001_000 bytes
  })

  it('skip된 자산의 ms/bytes는 합계에 안 들어간다', () => {
    const results: GenerateAssetResult[] = [
      { asset: dummyAsset, skipped: false, ms: 100, bytes: 500 },
      { asset: dummyAsset, skipped: true, ms: 9999, bytes: 9999 },
    ]
    const summary = formatRunSummary(results)
    expect(summary).toContain('100ms')
    expect(summary).toContain('500B')
  })

  it('결과가 비어 있어도 안 던진다', () => {
    expect(formatRunSummary([])).toContain('자산 0개')
  })

  it('1초 미만은 ms 단위, 1초 이상은 s 단위로 보여준다', () => {
    const under = formatRunSummary([{ asset: dummyAsset, skipped: false, ms: 999, bytes: 1 }])
    expect(under).toContain('999ms')

    const over = formatRunSummary([{ asset: dummyAsset, skipped: false, ms: 1000, bytes: 1 }])
    expect(over).toContain('1.0s')
  })
})
