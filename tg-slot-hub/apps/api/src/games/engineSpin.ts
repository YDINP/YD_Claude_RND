import { spin } from '@tgslot/slot-engine'
import type {
  FeatureTrigger as EngineFeatureTrigger,
  GameMath,
  Rng,
  RoundState,
  SpinResult,
} from '@tgslot/slot-engine'
import type { FeatureTrigger, FreeSpinsState, MutationEvent } from '@tgslot/shared'

/** 저장된 프리스핀 세션 → 엔진이 받는 라운드 상태. 필드 이름만 옮긴다. */
export function toRoundState(freeSpins: FreeSpinsState | null): RoundState | undefined {
  if (!freeSpins) return undefined
  return {
    freeSpinsLeft: freeSpins.left,
    freeSpinsTotal: freeSpins.total,
    multiplier: freeSpins.multiplier,
  }
}

/**
 * 라운드 상태를 실어 엔진을 돌린다. 상태가 없으면 기본 게임 스핀과 같다.
 * 베팅 레벨 검증(`assertBetLevel`)은 엔진의 `spin`이 한다.
 */
export function spinWithState(math: GameMath, totalBet: number, rng: Rng, state?: RoundState): SpinResult {
  return spin(math, { totalBet }, rng, state)
}

/**
 * 엔진 피처 → shared 피처. 두 타입은 지금 구조가 같지만 소유 패키지가 다르므로 명시적으로 옮긴다.
 * (`toSharedWinLine`과 같은 이유다. 한쪽이 바뀌면 여기서 컴파일 에러가 나야 한다.)
 */
export function toSharedFeature(feature: EngineFeatureTrigger): FeatureTrigger {
  if (feature.type === 'freeSpins') {
    return {
      type: 'freeSpins',
      spins: feature.spins,
      multiplier: feature.multiplier,
      retrigger: feature.retrigger,
    }
  }
  if (feature.type === 'freeSpinsCapped') {
    // 리트리거가 라운드 상한(MAX_FREE_SPINS_PER_ROUND)에 걸려 잘렸다는 방어적 신호.
    // 클라이언트로도 그대로 넘겨서 라운드 레코드에 잘림 사실이 남게 한다.
    return {
      type: 'freeSpinsCapped',
      requested: feature.requested,
      granted: feature.granted,
      cap: feature.cap,
    }
  }
  return {
    type: 'scatterWin',
    symbol: feature.symbol,
    count: feature.count,
    win: feature.win,
    positions: feature.positions.map(([reel, row]) => [reel, row] as [number, number]),
  }
}

export function toSharedFeatures(features: readonly EngineFeatureTrigger[]): FeatureTrigger[] {
  return features.map(toSharedFeature)
}

/**
 * 저장된 `gridBefore`에 뮤테이션을 다시 입혀 평가 격자를 만든다.
 *
 * 뮤테이션은 RNG를 더 소모해 결정되므로 `stops`만으로는 되살릴 수 없다. 그래서 서버는
 * 시작 격자와 바뀐 칸 목록을 저장해 두고, 응답을 만들 때 여기서 다시 겹친다.
 * 멱등 재전송이 처음과 같은 격자를 돌려주게 하는 것이 목적이다.
 */
export function applyMutationsToGrid(gridBefore: string[][], mutations: readonly MutationEvent[]): string[][] {
  if (mutations.length === 0) return gridBefore.map((row) => [...row])

  const grid = gridBefore.map((row) => [...row])
  for (const mutation of mutations) {
    for (const cell of mutation.cells) {
      const [reel, row] = cell.position
      const line = grid[row]
      if (line === undefined || line[reel] === undefined) {
        // 저장된 격자와 뮤테이션이 어긋났다는 뜻이다. 조용히 건너뛰면 클라이언트에 틀린 격자가
        // 나가므로 여기서 멈춘다 (500). 데이터가 깨진 것을 감추는 것보다 낫다.
        throw new Error(`[games] 뮤테이션 좌표가 격자 밖이다: [${reel}, ${row}]`)
      }
      line[reel] = cell.to
    }
  }
  return grid
}
