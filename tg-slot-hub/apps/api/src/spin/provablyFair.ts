import { createHash, randomBytes } from 'node:crypto'
import { createSeededRng } from '@tgslot/slot-engine'
import type { Rng } from '@tgslot/slot-engine'

/** 서버 시드 바이트 수. 32바이트 = 256비트. */
const SEED_BYTES = 32

/** `node:crypto`로 뽑은 라운드 서버 시드 (hex). `Math.random`은 쓰지 않는다. */
export function createRoundSeed(): string {
  return randomBytes(SEED_BYTES).toString('hex')
}

export function hashSeed(seed: string): string {
  return createHash('sha256').update(seed).digest('hex')
}

/**
 * 라운드 RNG. 시드와 nonce를 묶어 라운드마다 다른 수열을 만든다.
 * 유저는 나중에 공개된 seed로 같은 RNG를 만들어 결과를 그대로 재현할 수 있다.
 */
export function createRoundRng(seed: string, nonce: number): Rng {
  return createSeededRng(roundSeedInput(seed, nonce))
}

/** 검증 문서와 코드가 어긋나지 않도록 시드 조합 규칙을 한 곳에 둔다. */
export function roundSeedInput(seed: string, nonce: number): string {
  return `${seed}:${nonce}`
}
