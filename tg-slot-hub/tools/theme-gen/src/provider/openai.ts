import { redact } from '../log.js'
import { ProviderHttpError, withRetry } from '../retry.js'
import type { GenerateOptions, GeneratedImage, ImageProvider } from './types.js'

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations'

export interface OpenAiProviderOptions {
  apiKey: string
  /** 기본 'medium'. `THEME_GEN_QUALITY` 환경변수로 CLI에서 덮어쓴다. */
  quality?: string
  fetchImpl?: typeof fetch
}

interface OpenAiImagesResponse {
  data?: { b64_json?: string }[]
}

/** gpt-image-1 (`/v1/images/generations`) 프로바이더. 응답은 base64 png(`b64_json`)다. */
export function createOpenAiProvider(options: OpenAiProviderOptions): ImageProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const quality = options.quality ?? 'medium'

  return {
    name: 'openai',
    async generate({ prompt, size, transparent }: GenerateOptions): Promise<GeneratedImage> {
      return withRetry(async () => {
        const body: Record<string, unknown> = {
          model: 'gpt-image-1',
          prompt,
          size,
          output_format: 'png',
          quality,
        }
        if (transparent) body.background = 'transparent'

        const response = await fetchImpl(OPENAI_IMAGES_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new ProviderHttpError(`openai 이미지 생성 실패 (${response.status}): ${redact(text)}`, response.status)
        }

        const json = (await response.json()) as OpenAiImagesResponse
        const b64 = json.data?.[0]?.b64_json
        if (b64 === undefined) throw new Error('openai 응답에 b64_json이 없다')
        return { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png' }
      })
    },
  }
}
