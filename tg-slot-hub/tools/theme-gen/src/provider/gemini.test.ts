import { describe, expect, it, vi } from 'vitest'
import { createGeminiProvider } from './gemini.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createGeminiProvider', () => {
  it('happy path: inlineData를 디코드해서 버퍼로 돌려준다', async () => {
    const b64 = Buffer.from('fake-image-bytes').toString('base64')
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType: 'image/png' } }] } } as unknown],
      }),
    )

    const provider = createGeminiProvider({ apiKey: 'g-test', fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await provider.generate({ id: 'bell', prompt: 'a gold bell', negative: 'blurry', size: '1024x1024', transparent: true })

    expect(provider.name).toBe('gemini')
    expect(result.buffer.toString()).toBe('fake-image-bytes')
    expect(result.mimeType).toBe('image/png')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('key=g-test')
    expect(url).toContain('gemini-2.5-flash-image:generateContent')
    const body = JSON.parse(init.body as string) as { contents: { parts: { text: string }[] }[] }
    expect(body.contents[0]?.parts[0]?.text).toContain('a gold bell')
    expect(body.contents[0]?.parts[0]?.text).toContain('isolated on a flat pure green #00FF00 background')
  })

  it('transparent가 false면 프롬프트에 초록 배경 문구를 붙이지 않는다', async () => {
    const b64 = Buffer.from('x').toString('base64')
    const fetchImpl = vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: b64 } }] } }] }))
    const provider = createGeminiProvider({ apiKey: 'g-test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await provider.generate({ id: 'bg', prompt: 'a dark backdrop', negative: 'n', size: '1536x1024', transparent: false })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { contents: { parts: { text: string }[] }[] }
    expect(body.contents[0]?.parts[0]?.text).toBe('a dark backdrop')
  })

  it('이미지 파트가 없으면 던진다', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }))
    const provider = createGeminiProvider({ apiKey: 'g-test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(provider.generate({ id: 'a', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false })).rejects.toThrow(
      /gemini 응답에 이미지가 없다/,
    )
  })
})
