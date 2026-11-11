import { spin } from '@tgslot/slot-engine'
import type {
  FeatureTrigger as EngineFeatureTrigger,
  GameMath,
  Rng,
  RoundState,
  SpinResult,
} from '@tgslot/slot-engine'
import { foldCascades } from '@tgslot/slot-engine'
import type { CascadeStep as EngineCascadeStep, WinLine as EngineWinLine } from '@tgslot/slot-engine'
import type { CascadeStep, FeatureTrigger, MutationEvent, WinLine } from '@tgslot/shared'

export { toRoundState } from '../economy/freeSpins.js'

/**
 * 엔진의 WinLine과 shared의 WinLine은 모양이 같지만 소유 패키지가 다르므로 명시적으로 옮긴다.
 * 필드를 하나씩 옮기는 구조라 엔진에 필드가 늘면 여기도 같이 늘려야 한다.
 * 키 순서가 고정이라 jsonb 왕복을 거친 값이어도 응답 바이트가 같다.
 */
export function toSharedWinLine(win: EngineWinLine): WinLine {
  return {
    line: win.line,
    symbol: win.symbol,
    count: win.count,
    multiplier: win.multiplier,
    win: win.win,
    positions: win.positions.map(([reel, row]) => [reel, row] as [number, number]),
    // 심볼 그룹(Any BAR 등)으로 지급된 라인일 때만 있다. 연출이 그룹 이름을 띄우는 데 쓴다.
    ...(win.group === undefined ? {} : { group: win.group }),
    // ways 지급일 때만. 라인 게임에는 없다.
    ...(win.ways === undefined ? {} : { ways: win.ways }),
    ...(win.direction === undefined ? {} : { direction: win.direction }),
    // 연쇄·클러스터 팩만. 기존 6팩은 이 키가 생기지 않는다(응답이 그대로다).
    ...(win.payKind === undefined ? {} : { payKind: win.payKind }),
    ...(win.cascade === undefined ? {} : { cascade: win.cascade }),
    ...(win.ladder === undefined ? {} : { ladder: win.ladder }),
  }
}

/**
 * 연쇄 단계 → shared. `refill`은 릴별 배열(`SymbolId[][]`)이라 칸 객체 목록보다 훨씬 작다.
 * 12단계 최악 스핀을 12KB 안에 두는 핵심이다.
 */
export function toSharedCascadeStep(step: EngineCascadeStep): CascadeStep {
  return {
    index: step.index,
    wins: step.wins.map(toSharedWinLine),
    removed: step.removed.map(([reel, row]) => [reel, row] as [number, number]),
    refill: step.refill.map((column) => [...column]),
    multiplier: step.multiplier,
    stepWin: step.stepWin,
  }
}

/**
 * 저장된 `cascades`로 연쇄 후 최종 판을 되살린다. 스핀을 다시 돌리지 않는다.
 * `grid`는 뮤테이션까지 적용된 첫 평가 그리드다 (`foldCascades(grid, cascades) === finalGrid`).
 */
export function rebuildFinalGrid(grid: string[][], cascades: readonly EngineCascadeStep[]): string[][] {
  return foldCascades(grid, cascades)
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
  if (feature.type === 'orderRound') {
    return { type: 'orderRound', cards: feature.cards.map((card) => ({ ...card })) }
  }
  if (feature.type === 'orderComplete') {
    return { type: 'orderComplete', id: feature.id, prize: feature.prize }
  }
  if (feature.type === 'winCapped') {
    return { type: 'winCapped', requested: feature.requested, granted: feature.granted, cap: feature.cap }
  }
  if (feature.type === 'scatterWin') {
    return {
      type: 'scatterWin',
      symbol: feature.symbol,
      count: feature.count,
      win: feature.win,
      positions: feature.positions.map(([reel, row]) => [reel, row] as [number, number]),
    }
  }
  const exhaustive: never = feature
  throw new Error(`[engineSpin] unknown feature: ${JSON.stringify(exhaustive)}`)
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
