import type { AssetKind, AssetSize } from '../schema.js'

export type ProviderName = 'openai' | 'gemini' | 'comfy' | 'codex'

export function isProviderName(value: string): value is ProviderName {
  return value === 'openai' || value === 'gemini' || value === 'comfy' || value === 'codex'
}

export interface GenerateOptions {
  /** asset id. 로그와 codex의 임시 폴더 이름에 쓴다. */
  id: string
  /** stylePrefix가 이미 합쳐진 최종 프롬프트. */
  prompt: string
  /** prompts.json의 공용 negative 프롬프트. comfy만 실제로 사용한다. */
  negative: string
  size: AssetSize
  transparent: boolean
  /** asset의 kind. codex만 이걸로 kind별 기본 타임아웃(sheet는 더 길게)을 고른다. */
  kind?: AssetKind
  /** asset.timeoutMs 오버라이드. codex만 사용한다. */
  timeoutMs?: number
}

export interface GeneratedImage {
  buffer: Buffer
  mimeType: string
}

export interface ImageProvider {
  readonly name: ProviderName
  generate(options: GenerateOptions): Promise<GeneratedImage>
}
