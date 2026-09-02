import { randomInt } from 'node:crypto'
import type { Rng } from '../types.js'

/**
 * 실제 스핀용 RNG. `Math.random`은 예측 가능하므로 절대 쓰지 않는다.
 *
 * node:crypto에 의존하므로 브라우저 번들이 딸려오지 않도록
 * `@tgslot/slot-engine/crypto-rng` 서브패스로만 노출한다.
 */
export function createCryptoRng(): Rng {
  return {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new RangeError(`nextInt(maxExclusive)는 1 이상의 정수여야 한다: ${maxExclusive}`)
      }
      return randomInt(maxExclusive)
    },
  }
}
