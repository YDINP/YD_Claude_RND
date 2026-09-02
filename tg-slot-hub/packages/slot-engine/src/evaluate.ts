import type { GameMath, SymbolDef } from './schema.js'
import type { EvaluateResult, GridPosition, SymbolId, WinLine } from './types.js'

/**
 * 후보 심볼 1개에 대한 사전 계산 결과.
 * 스핀마다 와일드 대체 규칙을 다시 해석하지 않도록 math당 1회만 만든다.
 */
interface CandidatePlan {
  symbol: SymbolId
  /** 이 후보로 셀 수 있는 심볼 집합 (자기 자신 + 대체 가능한 와일드). */
  matches: Set<SymbolId>
  /** index = 왼쪽부터 연속 매치 길이, value = betPerLine 배수. */
  bestPayout: number[]
  /** index = 연속 매치 길이, value = 실제로 지급되는 매치 개수. */
  bestCount: number[]
}

interface Evaluator {
  reels: number
  paylines: number[][]
  candidates: CandidatePlan[]
}

/** 와일드가 target을 대체할 수 있는지. 스캐터와 다른 와일드는 절대 대체하지 않는다. */
function wildCovers(math: GameMath, target: SymbolDef): boolean {
  if (target.scatter === true || target.wild === true) return false
  const config = math.wild
  if (config === undefined) return true
  if (config.excludes?.includes(target.id) === true) return false
  if (config.substitutesFor === 'all') return true
  return config.substitutesFor.includes(target.id)
}

function buildEvaluator(math: GameMath): Evaluator {
  const wildIds = math.symbols.filter((s) => s.wild === true).map((s) => s.id)
  const candidates: CandidatePlan[] = []

  for (const symbol of math.symbols) {
    if (symbol.scatter === true) continue
    const payrule = math.paytable[symbol.id]
    if (payrule === undefined) continue

    const matches = new Set<SymbolId>([symbol.id])
    if (symbol.wild !== true && wildCovers(math, symbol)) {
      for (const wildId of wildIds) matches.add(wildId)
    }

    // "긴 연속이 이긴다": 연속 길이 k에서는 k 이하 중 배당이 정의된 **가장 긴** 개수로 지급한다.
    // 스키마가 배수의 단조증가를 강제하므로 이 값이 곧 최고 배수이기도 하다.
    // 2연속 배당과 3연속 배당을 겹쳐 주지 않는다.
    const bestPayout: number[] = [0]
    const bestCount: number[] = [0]
    for (let k = 1; k <= math.reels; k += 1) {
      const direct = payrule[k]
      if (direct !== undefined && direct > 0) {
        bestPayout.push(direct)
        bestCount.push(k)
      } else {
        bestPayout.push(bestPayout[k - 1] ?? 0)
        bestCount.push(bestCount[k - 1] ?? 0)
      }
    }

    candidates.push({ symbol: symbol.id, matches, bestPayout, bestCount })
  }

  return { reels: math.reels, paylines: math.paylines, candidates }
}

const evaluatorCache = new WeakMap<GameMath, Evaluator>()

function getEvaluator(math: GameMath): Evaluator {
  const cached = evaluatorCache.get(math)
  if (cached !== undefined) return cached
  const built = buildEvaluator(math)
  evaluatorCache.set(math, built)
  return built
}

/** 총 베팅액을 라인 수로 나눈 라인당 베팅액. 나누어떨어지지 않으면 예외. */
export function getBetPerLine(math: GameMath, totalBet: number): number {
  const lines = math.paylines.length
  if (!Number.isInteger(totalBet) || totalBet <= 0) {
    throw new RangeError(`totalBet은 양의 정수여야 한다: ${totalBet}`)
  }
  if (totalBet % lines !== 0) {
    throw new RangeError(`totalBet(${totalBet})이 라인 수(${lines})로 나누어떨어지지 않는다`)
  }
  return totalBet / lines
}

/**
 * 화면 심볼로부터 승리 라인을 계산한다. 순수 함수라서 서버와 렌더러가 같은 코드를 공유한다.
 * @param grid `grid[row][reel]` 순서
 */
export function evaluate(grid: SymbolId[][], math: GameMath, betPerLine: number): EvaluateResult {
  const evaluator = getEvaluator(math)
  const wins: WinLine[] = []
  let totalWin = 0

  for (let lineIndex = 0; lineIndex < evaluator.paylines.length; lineIndex += 1) {
    const line = evaluator.paylines[lineIndex]
    if (line === undefined) continue

    const lineSymbols: SymbolId[] = []
    for (let reel = 0; reel < evaluator.reels; reel += 1) {
      const row = line[reel]
      const symbol = row === undefined ? undefined : grid[row]?.[reel]
      if (symbol === undefined) {
        throw new RangeError(`페이라인 ${lineIndex}이 그리드 범위를 벗어났다 (reel ${reel})`)
      }
      lineSymbols.push(symbol)
    }

    let bestSymbol: SymbolId | null = null
    let bestCount = 0
    let bestMultiplier = 0

    for (const candidate of evaluator.candidates) {
      let run = 0
      while (run < evaluator.reels) {
        const symbol = lineSymbols[run]
        if (symbol === undefined || !candidate.matches.has(symbol)) break
        run += 1
      }
      if (run === 0) continue
      const multiplier = candidate.bestPayout[run] ?? 0
      if (multiplier <= 0) continue
      const count = candidate.bestCount[run] ?? run
      const better = multiplier > bestMultiplier || (multiplier === bestMultiplier && count > bestCount)
      if (bestSymbol === null || better) {
        bestSymbol = candidate.symbol
        bestCount = count
        bestMultiplier = multiplier
      }
    }

    if (bestSymbol === null || bestMultiplier <= 0) continue
    // 스키마가 모든 betLevel에서 betPerLine x 배수를 정수로 강제하므로 여기서 반올림이 일어날 일은 없다.
    // Math.round는 부동소수 오차에 대한 안전망일 뿐 라운딩으로 RTP를 밀어 올리지 않는다.
    const win = Math.round(bestMultiplier * betPerLine)
    if (win <= 0) continue

    const positions: GridPosition[] = []
    for (let reel = 0; reel < bestCount; reel += 1) {
      positions.push([reel, line[reel] ?? 0])
    }

    wins.push({ line: lineIndex, symbol: bestSymbol, count: bestCount, multiplier: bestMultiplier, win, positions })
    totalWin += win
  }

  return { wins, totalWin }
}
