import { evaluateClusters } from './cluster.js'
import { evaluate, getWildIds } from './evaluate.js'
import { buildGrid, getBetUnit } from './spin.js'
import type { GameMath } from './schema.js'
import type { SymbolId } from './types.js'
import { evaluateWays } from './ways.js'
import { reelHeight } from './shape.js'

/** 릴마다 살펴볼 «깨끗한» 정지 위치 후보 수. 5릴이면 최대 8^5번 평가한다. */
const CANDIDATES_PER_REEL = 8

/** 대기 화면에 띄우지 않을 심볼: 와일드, 스캐터, 미스터리 타일. */
function specialSymbols(math: GameMath): ReadonlySet<SymbolId> {
  const special = new Set<SymbolId>(getWildIds(math))
  if (math.scatter !== undefined) special.add(math.scatter.symbol)
  for (const mutation of math.mutations ?? []) {
    if (mutation.type === 'mystery') special.add(mutation.symbol)
  }
  return special
}

/** 이 정지 위치의 rows칸 창에 특수 심볼이 하나도 없으면 참. */
function isCleanWindow(strip: readonly SymbolId[], stop: number, rows: number, special: ReadonlySet<SymbolId>): boolean {
  for (let row = 0; row < rows; row += 1) {
    const symbol = strip[(stop + row) % strip.length]
    if (symbol === undefined || special.has(symbol)) return false
  }
  return true
}

function hasWin(math: GameMath, grid: SymbolId[][]): boolean {
  const totalBet = math.betLevels[0] ?? 1
  if (math.payModel === 'cluster') return evaluateClusters(grid, math, totalBet, 1).wins.length > 0
  const unit = getBetUnit(math, totalBet)
  const result = math.payModel === 'ways' ? evaluateWays(grid, math, unit) : evaluate(grid, math, unit)
  return result.wins.length > 0
}

/**
 * 첫 방문 대기 화면에 쓸 정지 위치. **결정적**이다(난수 없음, 같은 math면 같은 답).
 *
 * 스트립 0번 칸이 와일드인 팩이 많아 정지 위치 0으로 열면 «스핀도 안 했는데 대박» 화면이 된다.
 * 릴마다 창에 와일드·스캐터·미스터리가 없는 위치를 앞에서부터 고르고, 그 조합 중
 * 라인·웨이·클러스터 어느 당첨도 없는 첫 조합을 돌려준다. 결과·잔액과 무관한 표시 전용 값이다.
 * 깨끗한 조합을 못 찾으면 특수 심볼만 피한 조합, 그마저 없으면 전부 0을 돌려준다.
 */
export function pickIdleStops(math: GameMath): number[] {
  const special = specialSymbols(math)
  const candidates: number[][] = math.strips.slice(0, math.reels).map((strip: readonly SymbolId[], reel: number) => {
    const clean: { stop: number; variety: number }[] = []
    for (let stop = 0; stop < strip.length; stop += 1) {
      // 릴별 높이 팩은 그 릴의 칸 수만 본다. 직사각 판은 reelHeight = rows라 기존과 같다.
      const height = reelHeight(math, reel)
      if (!isCleanWindow(strip, stop, height, special)) continue
      const seen = new Set<SymbolId>()
      for (let row = 0; row < height; row += 1) seen.add(strip[(stop + row) % strip.length] as SymbolId)
      clean.push({ stop, variety: seen.size })
    }
    // 같은 심볼이 쌓인 창보다 여러 심볼이 보이는 창을 먼저(동률이면 앞 위치). 정렬은 안정적이다.
    clean.sort((a, b) => b.variety - a.variety)
    const picked = clean.slice(0, CANDIDATES_PER_REEL).map((entry) => entry.stop)
    // 같은 스트립을 쓰는 릴들이 똑같은 창을 고르면 가로로 같은 그림이 줄지어 선다. 릴 번호만큼 후보를 돌린다.
    const shift = picked.length === 0 ? 0 : reel % picked.length
    return [...picked.slice(shift), ...picked.slice(0, shift)]
  })
  if (candidates.length !== math.reels || candidates.some((list) => list.length === 0)) {
    return Array.from({ length: math.reels }, () => 0)
  }

  const index = Array.from({ length: math.reels }, () => 0)
  const at = (): number[] => index.map((i, reel) => candidates[reel]?.[i] ?? 0)
  for (;;) {
    const stops = at()
    if (!hasWin(math, buildGrid(math, stops))) return stops
    // 마지막 릴부터 올리는 주행거리계 순서. 앞 릴일수록 오래 첫 후보에 머문다.
    let reel = math.reels - 1
    while (reel >= 0) {
      const limit = candidates[reel]?.length ?? 1
      index[reel] = (index[reel] ?? 0) + 1
      if ((index[reel] ?? 0) < limit) break
      index[reel] = 0
      reel -= 1
    }
    if (reel < 0) break
  }
  return candidates.map((list) => list[0] ?? 0)
}
