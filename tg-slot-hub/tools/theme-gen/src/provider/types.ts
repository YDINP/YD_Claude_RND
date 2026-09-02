import type { AssetSize } from '../schema.js'

export type ProviderName = 'openai' | 'gemini' | 'comfy'

export function isProviderName(value: string): value is ProviderName {
  return value === 'openai' || value === 'gemini' || value === 'comfy'
}

export interface GenerateOptions {
  /** stylePrefix가 이미 합쳐진 최종 프롬프트. */
  prompt: string
  /** prompts.json의 공용 negative 프롬프트. comfy만 실제로 사용한다. */
  negative: string
  size: AssetSize
  transparent: boolean
}

export interface GeneratedImage {
  buffer: Buffer
  mimeType: string
}

export interface ImageProvider {
  readonly name: ProviderName
  generate(options: GenerateOptions): Promise<GeneratedImage>
}
