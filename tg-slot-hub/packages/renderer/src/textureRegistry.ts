/**
 * 이 인스턴스가 **직접 만든** 텍스처만 추적한다.
 *
 * `Assets.load`로 받은 텍스처는 전역 캐시가 소유하므로 여기에 넣지 않는다.
 * 그것까지 파괴하면 다음 게임 진입에서 캐시 히트가 죽은 텍스처를 돌려준다.
 * 반대로 캔버스로 그린 폴백·코인 텍스처는 아무도 소유하지 않아서
 * 렌더러가 직접 정리하지 않으면 로비-게임을 오갈 때마다 GPU에 쌓인다.
 */
export interface DestroyableTexture {
  /** Pixi `Texture.destroy(destroySource)`. true면 GPU 리소스까지 함께 해제한다. */
  destroy(destroyTextureSource?: boolean): void
}

export class TextureRegistry {
  private readonly owned = new Set<DestroyableTexture>()

  /** 소유권을 등록하고 그대로 돌려준다. 같은 텍스처를 두 번 넣어도 한 번만 센다. */
  own<T extends DestroyableTexture>(texture: T): T {
    this.owned.add(texture)
    return texture
  }

  has(texture: DestroyableTexture): boolean {
    return this.owned.has(texture)
  }

  get size(): number {
    return this.owned.size
  }

  /**
   * 등록된 텍스처를 모두 GPU 리소스까지 해제한다.
   * 한 번 호출하면 목록이 비므로 다시 불러도 안전하다(destroy가 두 번 불리지 않는다).
   * 하나가 실패해도 나머지는 계속 해제한다. 정리 도중의 예외로 누수를 키우지 않기 위해서다.
   */
  destroyAll(): void {
    const textures = [...this.owned]
    this.owned.clear()
    for (const texture of textures) {
      try {
        texture.destroy(true)
      } catch {
        // 이미 파괴된 텍스처 등. 나머지 정리를 막지 않는다.
      }
    }
  }
}
