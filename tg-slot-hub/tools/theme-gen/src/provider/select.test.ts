import { describe, expect, it, vi } from 'vitest'
import { checkComfyAvailable, ProviderSelectionError, selectProviderName } from './select.js'

describe('selectProviderName', () => {
  it('명시적 --provider가 최우선이다', async () => {
    const checkComfy = vi.fn(async () => true)
    const name = await selectProviderName('gemini', { OPENAI_API_KEY: 'sk-x' }, checkComfy)
    expect(name).toBe('gemini')
    expect(checkComfy).not.toHaveBeenCalled()
  })

  it('알 수 없는 --provider 값은 던진다', async () => {
    await expect(selectProviderName('bogus', {}, vi.fn())).rejects.toThrow(ProviderSelectionError)
  })

  it('THEME_GEN_PROVIDER 환경변수를 명시값 다음으로 본다', async () => {
    const checkComfy = vi.fn(async () => true)
    const name = await selectProviderName(undefined, { THEME_GEN_PROVIDER: 'comfy' }, checkComfy)
    expect(name).toBe('comfy')
    expect(checkComfy).not.toHaveBeenCalled()
  })

  it('OPENAI_API_KEY가 있으면 openai를 고른다', async () => {
    const name = await selectProviderName(undefined, { OPENAI_API_KEY: 'sk-x', GEMINI_API_KEY: 'g-x' }, vi.fn(async () => true))
    expect(name).toBe('openai')
  })

  it('OPENAI 없고 GEMINI_API_KEY만 있으면 gemini를 고른다', async () => {
    const name = await selectProviderName(undefined, { GEMINI_API_KEY: 'g-x' }, vi.fn(async () => true))
    expect(name).toBe('gemini')
  })

  it('키가 하나도 없으면 comfy 가용성을 확인해 comfy를 고른다', async () => {
    const checkComfy = vi.fn(async () => true)
    const name = await selectProviderName(undefined, {}, checkComfy)
    expect(name).toBe('comfy')
    expect(checkComfy).toHaveBeenCalledWith('http://127.0.0.1:8188')
  })

  it('COMFY_URL을 지정하면 그 주소로 확인한다', async () => {
    const checkComfy = vi.fn(async () => true)
    await selectProviderName(undefined, { COMFY_URL: 'http://example:9000' }, checkComfy)
    expect(checkComfy).toHaveBeenCalledWith('http://example:9000')
  })

  it('아무것도 안 되면 세 가지 옵션을 안내하며 던진다', async () => {
    await expect(selectProviderName(undefined, {}, vi.fn(async () => false))).rejects.toThrow(/OPENAI_API_KEY.*GEMINI_API_KEY.*ComfyUI/s)
  })
})

describe('checkComfyAvailable', () => {
  it('fetch가 ok면 true를 반환한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await expect(checkComfyAvailable('http://127.0.0.1:8188', fetchImpl)).resolves.toBe(true)
  })

  it('fetch가 실패하면 false를 반환한다 (던지지 않는다)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(checkComfyAvailable('http://127.0.0.1:8188', fetchImpl)).resolves.toBe(false)
  })

  it('끝의 슬래시를 정리하고 /system_stats를 호출한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await checkComfyAvailable('http://127.0.0.1:8188/', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8188/system_stats')
  })
})
