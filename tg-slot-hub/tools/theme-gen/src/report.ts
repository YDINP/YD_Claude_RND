import { DEFAULT_COMFY_URL } from './constants.js'
import type { AssetPlan } from './pipeline.js'
import type { ProviderName } from './provider/types.js'
import type { PromptsFile } from './schema.js'

export function formatHeader(gameDirName: string, promptsPath: string, file: PromptsFile): string {
  return `\n${gameDirName}  (${promptsPath})\n  concept: ${file.concept}`
}

export function formatProviderLine(providerName: ProviderName, comfyUrl: string | undefined, dryRun: boolean): string {
  if (providerName !== 'comfy' || !dryRun) return `  provider: ${providerName}\n`
  return `  provider: ${providerName} (연결 확인 생략, ${comfyUrl ?? DEFAULT_COMFY_URL})\n`
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
