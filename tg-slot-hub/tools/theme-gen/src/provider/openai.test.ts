import { describe, expect, it, vi } from 'vitest'
import { createOpenAiProvider } from './openai.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createOpenAiProvider', () => {
  it('happy path: b64_json을 디코드해서 버퍼로 돌려준다', async () => {
    const b64 = Buffer.from('fake-png-bytes').toString('base64')
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ b64_json: b64 }] }))

    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await provider.generate({ id: 'seven', prompt: 'a red seven', negative: 'blurry', size: '1024x1024', transparent: true })

    expect(provider.name).toBe('openai')
    expect(result.mimeType).toBe('image/png')
    expect(result.buffer.toString()).toBe('fake-png-bytes')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/generations')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.model).toBe('gpt-image-1')
    expect(body.prompt).toBe('a red seven')
    expect(body.size).toBe('1024x1024')
    expect(body.background).toBe('transparent')
    expect(body.quality).toBe('medium')
  })

  it('transparent가 false면 background 필드를 안 보낸다', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ b64_json: Buffer.from('x').toString('base64') }] }))
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await provider.generate({ id: 'a', prompt: 'p', negative: 'n', size: '1536x1024', transparent: false })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.background).toBeUndefined()
  })

  it('실패 응답(429)은 ProviderHttpError로 재시도 후 던진다', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }))
    const provider = createOpenAiProvider({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(
      provider.generate({ id: 'a', prompt: 'p', negative: 'n', size: '1024x1024', transparent: false }),
    ).rejects.toThrow(/openai 이미지 생성 실패 \(429\)/)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
