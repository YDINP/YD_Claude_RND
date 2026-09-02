import { GEMINI_MODEL } from '../constants.js'
import { redact } from '../log.js'
import { ProviderHttpError, withRetry } from '../retry.js'
import type { GenerateOptions, GeneratedImage, ImageProvider } from './types.js'

export interface GeminiProviderOptions {
  apiKey: string
  fetchImpl?: typeof fetch
}

interface GeminiPart {
  inlineData?: { data: string; mimeType?: string }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
}

/**
 * gemini-2.5-flash-image 프로바이더. 이 모델은 투명 배경을 지원하지 않으므로
 * `transparent`일 때 프롬프트에 순수 초록(#00FF00) 배경을 명시적으로 요청한다.
 * 실제 크로마키 처리는 이 프로바이더 밖(파이프라인)에서 한다.
 */
export function createGeminiProvider(options: GeminiProviderOptions): ImageProvider {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    name: 'gemini',
    async generate({ prompt, transparent }: GenerateOptions): Promise<GeneratedImage> {
      return withRetry(async () => {
        const fullPrompt = transparent ? `${prompt}, isolated on a flat pure green #00FF00 background` : prompt
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${options.apiKey}`

        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new ProviderHttpError(`gemini 이미지 생성 실패 (${response.status}): ${redact(text)}`, response.status)
        }

        const json = (await response.json()) as GeminiResponse
        const parts = json.candidates?.[0]?.content?.parts ?? []
        const imagePart = parts.find((part) => part.inlineData !== undefined)
        if (imagePart?.inlineData === undefined) throw new Error('gemini 응답에 이미지가 없다')

        return {
          buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
          mimeType: imagePart.inlineData.mimeType ?? 'image/png',
        }
      })
    },
  }
}
