import { describe, expect, it, vi, type Mock } from 'vitest'
import { TextureRegistry, type DestroyableTexture } from './textureRegistry.js'

type FakeTexture = { destroy: Mock<(destroyTextureSource?: boolean) => void> }

function fakeTexture(): FakeTexture {
  return { destroy: vi.fn<(destroyTextureSource?: boolean) => void>() }
}

describe('TextureRegistry', () => {
  it('처음에는 비어 있다', () => {
    expect(new TextureRegistry().size).toBe(0)
  })

  it('등록한 텍스처를 그대로 돌려준다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    expect(registry.own(texture)).toBe(texture)
    expect(registry.has(texture)).toBe(true)
    expect(registry.size).toBe(1)
  })

  it('같은 텍스처를 두 번 넣어도 한 번만 센다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.own(texture)
    registry.own(texture)
    expect(registry.size).toBe(1)
  })

  it('등록하지 않은 텍스처는 소유하지 않는다', () => {
    const registry = new TextureRegistry()
    registry.own(fakeTexture())
    expect(registry.has(fakeTexture())).toBe(false)
  })

  it('destroyAll은 GPU 리소스까지 해제한다', () => {
    const registry = new TextureRegistry()
    const a = fakeTexture()
    const b = fakeTexture()
    registry.own(a)
    registry.own(b)

    registry.destroyAll()

    expect(a.destroy).toHaveBeenCalledWith(true)
    expect(b.destroy).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('두 번 호출해도 텍스처는 한 번만 파괴된다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.own(texture)

    registry.destroyAll()
    registry.destroyAll()

    expect(texture.destroy).toHaveBeenCalledTimes(1)
  })

  it('하나가 실패해도 나머지를 끝까지 해제한다', () => {
    const registry = new TextureRegistry()
    const broken: DestroyableTexture = {
      destroy: () => {
        throw new Error('이미 파괴됨')
      },
    }
    const healthy = fakeTexture()
    registry.own(broken)
    registry.own(healthy)

    expect(() => registry.destroyAll()).not.toThrow()
    expect(healthy.destroy).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('해제 뒤에 다시 등록해 쓸 수 있다', () => {
    const registry = new TextureRegistry()
    registry.own(fakeTexture())
    registry.destroyAll()

    const next = fakeTexture()
    registry.own(next)
    expect(registry.size).toBe(1)

    registry.destroyAll()
    expect(next.destroy).toHaveBeenCalledWith(true)
  })
})
