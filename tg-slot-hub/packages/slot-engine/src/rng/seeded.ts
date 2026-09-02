import type { Rng } from '../types.js'

const UINT32 = 0x1_0000_0000

/** cyrb128: 문자열 → 32비트 시드 4개. xoshiro의 상태를 골고루 채우기 위한 해시. */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  const s = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0] as const
  // 상태가 전부 0이면 xoshiro가 0만 뱉으므로 방어한다.
  return s.every((v) => v === 0) ? [1, 2, 3, 4] : [s[0], s[1], s[2], s[3]]
}

function assertMax(maxExclusive: number): void {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`nextInt(maxExclusive)는 1 이상의 정수여야 한다: ${maxExclusive}`)
  }
}

/**
 * xoshiro128** 결정론 RNG. 같은 시드는 항상 같은 수열을 만든다.
 *
 * **실제 스핀도 이것을 쓴다.** 서버가 라운드마다 `node:crypto`로 256비트 시드를 새로 뽑고
 * `${seed}:${nonce}` 형태로 이 생성기를 시드한다. 난수의 출처는 crypto이고 이 생성기는
 * 그 시드를 재현 가능한 수열로 펼치는 역할만 한다. 라운드 전에 `sha256(seed)`를 공개하고
 * 라운드 후 `seed`를 공개하면 유저가 같은 수열을 만들어 결과를 그대로 검증할 수 있다
 * (provably fair). 시뮬레이션과 테스트도 같은 이유로 이것을 쓴다.
 *
 * `@tgslot/slot-engine/crypto-rng`의 `createCryptoRng`는 시드 없이 매 호출마다 crypto에서
 * 직접 뽑고 싶은 (=검증 불가능한) 호출자를 위해 남겨 둔다.
 */
export function createSeededRng(seed: number | string): Rng {
  let [s0, s1, s2, s3] = hashSeed(typeof seed === 'number' ? `n:${seed}` : seed)

  // xoshiro128**: result = rotl(s1 * 5, 7) * 9
  const nextUint32 = (): number => {
    const scaled = Math.imul(s1, 5) >>> 0
    const rotated = ((scaled << 7) | (scaled >>> 25)) >>> 0
    const result = Math.imul(rotated, 9) >>> 0
    const t = (s1 << 9) >>> 0
    s2 = (s2 ^ s0) >>> 0
    s3 = (s3 ^ s1) >>> 0
    s1 = (s1 ^ s2) >>> 0
    s0 = (s0 ^ s3) >>> 0
    s2 = (s2 ^ t) >>> 0
    s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0
    return result
  }

  return {
    nextInt(maxExclusive: number): number {
      assertMax(maxExclusive)
      // 모듈로 편향 제거: 균등하지 않은 꼬리 구간은 버리고 다시 뽑는다.
      const limit = Math.floor(UINT32 / maxExclusive) * maxExclusive
      let value = nextUint32()
      while (value >= limit) value = nextUint32()
      return value % maxExclusive
    },
  }
}
