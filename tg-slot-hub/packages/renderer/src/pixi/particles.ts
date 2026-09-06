import type { Container, Sprite, Texture } from 'pixi.js'
import { MAX_LIVE_PARTICLES } from '../constants.js'
import { ParticleBudget, type ParticleBudgetSnapshot, type PoolStats } from '../pool.js'
import { LayerSpritePool } from './spritePool.js'

/**
 * 승리 파티클(코인·색종이·스캐터 알갱이)의 공급처.
 *
 * 두 가지를 함께 본다.
 * - **재사용**: 다 쓴 스프라이트를 감춰 두었다가 다시 꺼낸다. 빅윈 한 번에 100개씩 만들고
 *   버리던 자리가 첫 빅윈 이후로는 새로 만드는 것이 없어진다.
 * - **총량**: 코인 샤워와 색종이와 스캐터 흡입은 겹쳐서 돈다. 각자의 상한만으로는 합계가
 *   묶이지 않아, 예산 하나를 셋이 나눠 쓴다. 모자라면 요청이 조용히 깎인다 —
 *   개수만 줄고 연출은 그대로 나온다.
 *
 * 꺼낸 쪽이 반드시 `release`로 돌려줘야 한다. 돌려주지 않으면 예산이 줄어든 채로 남아
 * 다음 빅윈이 점점 초라해진다. 연출의 `stop()`이 그 자리다.
 */
export class ParticlePool {
  private readonly sprites: LayerSpritePool
  private readonly budget: ParticleBudget

  constructor(layer: Container, capacity: number = MAX_LIVE_PARTICLES) {
    this.sprites = new LayerSpritePool(layer, capacity)
    this.budget = new ParticleBudget(capacity)
  }

  /**
   * 최대 `count`개를 꺼낸다. 예산이 모자라면 **더 적게** 돌려준다(빈 배열일 수도 있다).
   * 호출 측은 받은 배열의 길이만 보면 된다.
   */
  acquire(count: number, texture: Texture): Sprite[] {
    const granted = this.budget.take(count)
    const acquired: Sprite[] = []
    for (let i = 0; i < granted; i += 1) acquired.push(this.sprites.acquire(texture))
    return acquired
  }

  /** 한 무리를 통째로 돌려준다. 예산도 함께 되돌아온다. */
  release(sprites: readonly Sprite[]): void {
    for (const sprite of sprites) this.sprites.release(sprite)
    this.budget.give(sprites.length)
  }

  /** 보관분을 전부 파괴한다. 렌더러가 내려갈 때 한 번 부른다. */
  clear(): void {
    this.sprites.clear()
  }

  get stats(): PoolStats {
    return this.sprites.stats
  }

  get budgetSnapshot(): ParticleBudgetSnapshot {
    return this.budget.snapshot
  }
}
