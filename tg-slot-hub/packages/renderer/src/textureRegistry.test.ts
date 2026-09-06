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

describe('release — 렌더러보다 먼저 끝나는 텍스처', () => {
  it('소유권을 놓고 GPU 리소스까지 해제한다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.own(texture)

    expect(registry.release(texture)).toBe(true)
    expect(texture.destroy).toHaveBeenCalledWith(true)
    expect(registry.size).toBe(0)
  })

  it('놓은 텍스처는 destroyAll이 다시 파괴하지 않는다', () => {
    // 전환 클립처럼 화면 도중에 걷히는 텍스처가 해제 때 두 번 파괴되는 것을 막는다.
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.own(texture)
    registry.release(texture)
    registry.destroyAll()

    expect(texture.destroy).toHaveBeenCalledTimes(1)
  })

  it('등록되지 않은 텍스처는 건드리지 않는다', () => {
    const registry = new TextureRegistry()
    const stranger = fakeTexture()

    expect(registry.release(stranger)).toBe(false)
    expect(stranger.destroy).not.toHaveBeenCalled()
  })

  it('두 번 놓아도 안전하다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.own(texture)

    expect(registry.release(texture)).toBe(true)
    expect(registry.release(texture)).toBe(false)
    expect(texture.destroy).toHaveBeenCalledTimes(1)
  })

  it('파괴가 실패해도 소유권은 놓는다', () => {
    const registry = new TextureRegistry()
    const broken: DestroyableTexture = {
      destroy: () => {
        throw new Error('이미 파괴됨')
      },
    }
    registry.own(broken)

    expect(() => registry.release(broken)).not.toThrow()
    expect(registry.size).toBe(0)
  })

  it('나머지 텍스처는 그대로 destroyAll이 맡는다', () => {
    const registry = new TextureRegistry()
    const released = fakeTexture()
    const kept = fakeTexture()
    registry.own(released)
    registry.own(kept)

    registry.release(released)
    expect(registry.size).toBe(1)

    registry.destroyAll()
    expect(kept.destroy).toHaveBeenCalledWith(true)
  })
})

describe('참조 계수와 LRU 축출', () => {
  it('붙잡은 텍스처는 소유 목록에 들어간다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()

    expect(registry.retain(texture)).toBe(texture)
    expect(registry.has(texture)).toBe(true)
    expect(registry.refCountOf(texture)).toBe(1)
  })

  it('여러 번 붙잡으면 그만큼 놓아야 참조가 끊긴다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.retain(texture)
    registry.retain(texture)

    expect(registry.refCountOf(texture)).toBe(2)
    registry.release(texture)
    expect(registry.refCountOf(texture)).toBe(1)
    registry.release(texture)
    expect(registry.refCountOf(texture)).toBe(0)
  })

  it('참조가 0이 되어도 그 자리에서 파괴하지 않는다', () => {
    const registry = new TextureRegistry()
    const texture = fakeTexture()
    registry.retain(texture)
    registry.release(texture)

    expect(texture.destroy).not.toHaveBeenCalled()
    expect(registry.has(texture)).toBe(true)
  })

  it('놓는 방식은 사용자가 남았는지가 정한다', () => {
    // 상주 텍스처는 사용자가 하나뿐이라 그 자리에서 사라지고,
    // 캐시 텍스처는 참조만 깎이고 남는다. 같은 `release`가 두 결말을 낸다.
    const registry = new TextureRegistry()
    const resident = fakeTexture()
    const cached = fakeTexture()
    registry.own(resident)
    registry.retain(cached)

    registry.release(resident)
    registry.release(cached)

    expect(resident.destroy).toHaveBeenCalledWith(true)
    expect(registry.has(resident)).toBe(false)
    expect(cached.destroy).not.toHaveBeenCalled()
    expect(registry.has(cached)).toBe(true)
  })

  it('상한을 넘으면 가장 먼저 놓은 것부터 밀어낸다', () => {
    const registry = new TextureRegistry({ cacheCapacity: 2 })
    const a = fakeTexture()
    const b = fakeTexture()
    const c = fakeTexture()
    registry.retain(a)
    registry.retain(b)
    registry.retain(c)
    // 셋 다 쓰는 중이라 상한을 넘어도 아무것도 밀려나지 않는다.
    expect(a.destroy).not.toHaveBeenCalled()

    registry.release(c)
    registry.release(a)

    // c가 먼저 놓였으므로 c가 먼저 나간다. 그러면 2장이 되어 축출이 멈춘다.
    expect(c.destroy).toHaveBeenCalledWith(true)
    expect(a.destroy).not.toHaveBeenCalled()
    expect(b.destroy).not.toHaveBeenCalled()
    expect(registry.has(c)).toBe(false)
  })

  it('다시 붙잡으면 축출 후보에서 빠진다', () => {
    const registry = new TextureRegistry({ cacheCapacity: 2 })
    const a = fakeTexture()
    const b = fakeTexture()
    const c = fakeTexture()
    registry.retain(a)
    registry.retain(b)
    registry.release(a)
    registry.retain(a)

    registry.release(b)
    registry.retain(c)

    // a는 다시 쓰는 중이므로 후보가 아니다. 놓여 있던 b가 나간다.
    expect(b.destroy).toHaveBeenCalledWith(true)
    expect(a.destroy).not.toHaveBeenCalled()
  })

  it('전부 쓰는 중이면 상한을 넘겨도 파괴하지 않는다', () => {
    const registry = new TextureRegistry({ cacheCapacity: 1 })
    const a = fakeTexture()
    const b = fakeTexture()
    const c = fakeTexture()
    registry.retain(a)
    registry.retain(b)
    registry.retain(c)

    expect(a.destroy).not.toHaveBeenCalled()
    expect(b.destroy).not.toHaveBeenCalled()
    expect(c.destroy).not.toHaveBeenCalled()
    expect(registry.snapshot.cached).toBe(3)
  })

  it('상주 텍스처는 상한에 세지 않고 밀려나지도 않는다', () => {
    const registry = new TextureRegistry({ cacheCapacity: 1 })
    const resident = fakeTexture()
    const a = fakeTexture()
    const b = fakeTexture()
    registry.own(resident)
    registry.retain(a)
    registry.retain(b)
    registry.release(a)
    registry.release(b)

    expect(resident.destroy).not.toHaveBeenCalled()
    expect(a.destroy).toHaveBeenCalledWith(true)
    expect(registry.has(resident)).toBe(true)
  })

  it('스냅샷이 상주·참조·후보를 나눠 센다', () => {
    const registry = new TextureRegistry({ cacheCapacity: 4 })
    registry.own(fakeTexture())
    const live = fakeTexture()
    const parked = fakeTexture()
    registry.retain(live)
    registry.retain(parked)
    registry.release(parked)

    expect(registry.snapshot).toEqual({
      owned: 3,
      cached: 2,
      live: 1,
      idle: 1,
      evicted: 0,
      capacity: 4,
    })
  })

  it('destroyAll은 붙잡혀 있던 것까지 전부 해제한다', () => {
    const registry = new TextureRegistry({ cacheCapacity: 8 })
    const held = fakeTexture()
    registry.retain(held)

    registry.destroyAll()

    expect(held.destroy).toHaveBeenCalledWith(true)
    expect(registry.refCountOf(held)).toBe(0)
    expect(registry.snapshot.cached).toBe(0)
  })
})
