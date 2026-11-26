import type { GameMath, StageRouletteConfig } from './schema.js'
import { evaluate, evaluateScatter } from './evaluate.js'
import { evaluateWays } from './ways.js'
import type {
  FeatureTrigger,
  GridPosition,
  MutationEvent,
  Rng,
  RouletteStep,
  SpinResult,
  StageRouletteTrigger,
  SymbolId,
} from './types.js'

/**
 * 무대 룰렛(여러 겹 보너스 휠). 트리거 스핀 응답 하나에서 끝까지 정산한다.
 *
 * RNG 계약: 릴 정지(→ 뮤테이션) 뒤, 회전마다 `rng.nextInt(그 고리 칸 수)` 1회. 응원봉 불빛은 RNG를 쓰지 않는다.
 * 회전 수는 결과로 정해지므로 `seedInput + totalBet`만으로 전부 재생된다.
 */

/** 화면의 응원봉 칸. 와일드는 세지 않는다. */
export function countCheer(grid: SymbolId[][], config: StageRouletteConfig): GridPosition[] {
  const positions: GridPosition[] = []
  grid.forEach((line, row) => {
    line.forEach((symbol, reel) => {
      if (symbol === config.cheer.symbol) positions.push([reel, row])
    })
  })
  return positions.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** 고리마다 불 켜진 칸 인덱스. `litOrder` 앞에서부터 `min(cheer, maxLit, 길이)`칸. */
export function litSegments(config: StageRouletteConfig, cheer: number): number[][] {
  const lit = Math.max(0, Math.min(cheer, config.cheer.maxLit))
  return config.rings.map((ring) => ring.litOrder.slice(0, Math.min(lit, ring.litOrder.length)))
}

/** 초대권 수로 정해지는 시작 고리. */
export function startRingFor(config: StageRouletteConfig, bonusCount: number): number {
  return config.startInnerAt !== undefined && bonusCount >= config.startInnerAt ? 1 : 0
}

/** 단조 감소 척도의 시작값 = 최대 회전 수. 회전마다 정확히 1씩 준다. */
export function maxRouletteSteps(config: StageRouletteConfig, startRing: number): number {
  return config.songs + (config.rings.length - 1 - startRing) + config.maxEncores
}

export interface RoulettePlay {
  steps: RouletteStep[]
  /** 지급 합계 코인 (캡 적용 후). */
  total: number
  /** 캡이 없었다면 지급됐을 합계 코인 (잘린 회전까지). */
  requested: number
  endedBy: 'songs' | 'capped'
}

/**
 * 룰렛을 끝까지 돌린다. 순수 함수 + rng.
 * @param capRemaining 이 스핀에서 룰렛이 더 줄 수 있는 코인. 넘으면 그 회전을 잘라 주고 끝낸다(남은 돌리기 무효).
 */
export function playStageRoulette(
  config: StageRouletteConfig,
  startRing: number,
  lit: readonly (readonly number[])[],
  totalBet: number,
  capRemaining: number,
  rng: Rng,
): RoulettePlay {
  const last = config.rings.length - 1
  const limit = maxRouletteSteps(config, startRing)
  const litSets = lit.map((indices) => new Set(indices))
  const steps: RouletteStep[] = []
  let ring = startRing
  let songsLeft = config.songs
  let encoresUsed = 0
  let total = 0
  let requested = 0
  let endedBy: 'songs' | 'capped' = 'songs'

  while (songsLeft > 0) {
    if (steps.length >= limit) {
      // 척도가 회전마다 1씩 줄어 도달할 수 없다. 여기 오면 규칙 구현이 틀렸다.
      throw new RangeError(`무대 룰렛이 최대 회전 ${limit}번을 넘었다`)
    }
    const spunRing = ring
    const ringConfig = config.rings[ring]
    if (ringConfig === undefined) throw new RangeError(`고리 ${ring}이 없다`)
    const segment = rng.nextInt(ringConfig.segments.length)
    const picked = ringConfig.segments[segment]
    if (picked === undefined) throw new RangeError(`고리 ${ring}에 칸 ${segment}이 없다`)

    let pay = 0
    let isLit = false
    let encoreCounted = false
    switch (picked.kind) {
      case 'coin':
        isLit = litSets[ring]?.has(segment) === true
        pay = picked.value * (isLit ? config.cheer.litMultiplier : 1) * totalBet
        songsLeft -= 1
        break
      case 'grand':
        pay = picked.value * totalBet
        songsLeft -= 1
        break
      case 'encore':
        pay = picked.value * totalBet
        if (encoresUsed < config.maxEncores) {
          encoresUsed += 1
          encoreCounted = true
        } else {
          songsLeft -= 1
        }
        break
      case 'stepUp':
        // 스키마가 마지막 고리의 stepUp을 막는다. 곡을 쓰지 않고 안쪽 고리로 간다(한 방향).
        ring = Math.min(ring + 1, last)
        break
    }

    requested += pay
    const room = Math.max(0, capRemaining - total)
    const capped = pay > room
    const win = capped ? room : pay
    total += win
    steps.push({
      ring: spunRing,
      segment,
      kind: picked.kind,
      lit: isLit,
      win,
      encoreCounted,
      songsLeft: capped ? 0 : songsLeft,
    })
    if (capped) {
      endedBy = 'capped'
      break
    }
  }
  return { steps, total, requested, endedBy }
}

/**
 * 무대 룰렛 팩의 정산. ways(또는 라인) 평가 → 스캐터 → 유료 스핀이면 룰렛 → 스핀 단위 지급 상한.
 * 상한(`round.maxWinCap x totalBet`)은 ways, 스캐터, 룰렛 순으로 채우고 넘치는 몫은 잘라 `winCapped`를 남긴다.
 */
export function resolveRouletteSpin(
  math: GameMath,
  grid: SymbolId[][],
  stops: number[],
  totalBet: number,
  betUnit: number,
  gridBefore: SymbolId[][],
  mutations: MutationEvent[],
  rng: Rng | undefined,
  paid: boolean,
): SpinResult {
  const config = math.stageRoulette
  if (config === undefined) throw new RangeError('stageRoulette 설정이 없는 팩이다')
  const cap = math.round === undefined ? Infinity : Math.round(math.round.maxWinCap * totalBet)

  const evaluated = math.payModel === 'ways' ? evaluateWays(grid, math, betUnit) : evaluate(grid, math, betUnit)
  const wins = evaluated.wins
  const rawLineWin = evaluated.totalWin
  let requested = rawLineWin
  let lineWin = rawLineWin
  if (lineWin > cap) {
    let left = cap
    for (const line of wins) {
      line.win = Math.min(line.win, left)
      left -= line.win
    }
    lineWin = cap
  }
  let room = cap - lineWin

  const scatter = evaluateScatter(grid, math, totalBet)
  requested += scatter.win
  const scatterWin = Math.min(scatter.win, room)
  room -= scatterWin

  const features: FeatureTrigger[] = []
  if (scatter.win > 0) {
    features.push({
      type: 'scatterWin',
      symbol: math.scatter?.symbol ?? '',
      count: scatter.count,
      win: scatterWin,
      positions: scatter.positions,
    })
  }

  let rouletteWin: number | undefined
  if (paid && scatter.count >= config.trigger) {
    if (rng === undefined) throw new RangeError('무대 룰렛 회전 추첨에는 rng가 필요하다')
    const cheerPositions = countCheer(grid, config)
    const lit = litSegments(config, cheerPositions.length)
    const startRing = startRingFor(config, scatter.count)
    const play = playStageRoulette(config, startRing, lit, totalBet, room, rng)
    requested += play.requested
    room -= play.total
    rouletteWin = play.total
    const trigger: StageRouletteTrigger = {
      type: 'stageRoulette',
      bonusCount: scatter.count,
      positions: scatter.positions,
      cheer: cheerPositions.length,
      cheerPositions,
      lit,
      startRing,
      steps: play.steps,
      total: play.total,
      endedBy: play.endedBy,
    }
    features.push(trigger)
  }

  const granted = lineWin + scatterWin + (rouletteWin ?? 0)
  if (Number.isFinite(cap) && granted < requested) {
    features.push({ type: 'winCapped', requested, granted, cap })
  }

  const result: SpinResult = {
    stops,
    gridBefore,
    grid,
    mutations,
    wins,
    lineWin,
    scatterWin,
    totalWin: granted,
    features,
  }
  if (rouletteWin !== undefined) result.rouletteWin = rouletteWin
  return result
}
