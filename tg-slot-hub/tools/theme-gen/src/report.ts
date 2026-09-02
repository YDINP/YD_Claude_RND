import { DEFAULT_COMFY_URL } from './constants.js'
import type { AssetPlan, GenerateAssetResult } from './pipeline.js'
import type { ProviderName } from './provider/types.js'
import type { PromptsFile } from './schema.js'

export function formatHeader(gameDirName: string, promptsPath: string, file: PromptsFile): string {
  return `\n${gameDirName}  (${promptsPath})\n  concept: ${file.concept}`
}

export function formatProviderLine(providerName: ProviderName, comfyUrl: string | undefined, dryRun: boolean): string {
  if (!dryRun) return `  provider: ${providerName}\n`
  if (providerName === 'comfy') return `  provider: ${providerName} (연결 확인 생략, ${comfyUrl ?? DEFAULT_COMFY_URL})\n`
  if (providerName === 'codex') return `  provider: ${providerName} (로그인 확인 생략)\n`
  return `  provider: ${providerName}\n`
}

/** `--dry-run`에서 실제 호출 없이 계획만 사람이 읽을 수 있게 찍는다. */
export function formatDryRunPlan(plans: AssetPlan[]): string[] {
  const lines: string[] = []
  for (const plan of plans) {
    const skipNote = plan.willSkip ? ' — 기존 파일 있음, skip 예정' : ''
    lines.push(`  [${plan.asset.kind}] ${plan.asset.id}${skipNote}`)
    lines.push(`      prompt: ${plan.resolvedPrompt}`)
    lines.push(`      size: ${plan.asset.size}  transparent: ${plan.asset.transparent}  out: ${plan.asset.out}`)
  }
  return lines
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

/** 한 번 실행이 끝난 뒤 사람이 훑어볼 요약 한 줄. `gen`/`--reprocess` 둘 다에서 쓴다. */
export function formatRunSummary(results: GenerateAssetResult[]): string {
  const generated = results.filter((r) => !r.skipped)
  const skipped = results.length - generated.length
  const totalMs = generated.reduce((sum, r) => sum + r.ms, 0)
  const totalBytes = generated.reduce((sum, r) => sum + r.bytes, 0)

  return (
    `\n요약: 자산 ${results.length}개 (생성 ${generated.length}, skip ${skipped}), ` +
    `총 ${formatMs(totalMs)}, 총 ${formatBytes(totalBytes)}`
  )
}
