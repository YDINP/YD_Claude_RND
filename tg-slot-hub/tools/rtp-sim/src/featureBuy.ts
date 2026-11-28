import { createHash, randomBytes } from 'node:crypto'
import { MAX_FREE_SPINS_PER_ROUND, createSeededRng, findFeatureBuySpin, spinUnchecked } from '@tgslot/slot-engine'
import type { FeatureBuyTrigger, GameMath, RoundState } from '@tgslot/slot-engine'

/**
 * 피처 구매 환수율 측정.
 *
 * 구매 한 번 = «대표 보너스가 열린 유료 판» 분포에서 뽑은 한 판 + 그 판이 연 프리스핀 전부(잭팟 제외).
 * 그래서 구매 환수율 = E[라운드 총당첨 | 보너스 진입] ÷ (가격 × 총 베팅)이다.
 *
 * ## 표본 설계 (2단계)
 * 진입 판은 서버와 같은 거절 표본 추출(`findFeatureBuySpin`)로 `entries`개 뽑는다. 진입 판이 프리스핀을 열었으면
 * 그 상태에서 이어지는 프리스핀을 서로 독립인 RNG로 `continuations`번 돌려 평균한다.
 * 진입 판마다 «진입 당첨 + 이어지는 프리스핀 평균»이 하나의 i.i.d. 표본이라 평균은 불편 추정량이고,
 * 표준오차는 그 표본들의 표준편차/√entries로 바로 나온다. 진입 판 탐색(평균 수십~수백 판)이 비싸므로
 * 이어지는 프리스핀을 여러 번 돌려 같은 계산으로 분산을 더 줄이는 것이다.
 * 그 판 안에서 끝나는 보너스(코인 리스핀·말판·룰렛)는 이어지는 것이 없어 `entries`가 곧 표본 수다.
 */
export interface FeatureBuyEstimate {
  trigger: FeatureBuyTrigger
  totalBet: number
  entries: number
  continuations: number
  /** E[라운드 총당첨 | 진입] — 총 베팅 배수 */
  meanRoundWin: number
  /** `meanRoundWin`의 표준오차 — 총 베팅 배수 */
  stdErr: number
  /** 진입 판 하나를 찾기까지 평균 시도(유료 판) 수 */
  meanTries: number
  /** 진입 판 기준 평균 당첨(배수). 프리스핀 몫과 나눠 보는 용도 */
  meanEntryWin: number
}

export interface EstimateOptions {
  entries: number
  continuations: number
  seed: string
}

/** 한 진입 상태에서 프리스핀을 끝까지 돌린 합계 코인. */
function playContinuation(math: GameMath, totalBet: number, start: RoundState, seed: string): number {
  const rng = createSeededRng(seed)
  let state: RoundState | undefined = start
  let total = 0
  let played = 0
  while (state !== undefined) {
    played += 1
    if (played > MAX_FREE_SPINS_PER_ROUND) throw new RangeError('프리스핀이 라운드 상한을 넘었다. 엔진 캡이 동작하지 않았다')
    const free = spinUnchecked(math, totalBet, rng, state)
    total += free.totalWin
    state = free.nextState
  }
  return total
}

export function estimateFeatureBuy(
  math: GameMath,
  trigger: FeatureBuyTrigger,
  totalBet: number,
  options: EstimateOptions,
): FeatureBuyEstimate {
  const { entries, continuations, seed } = options
  let counter = 0
  const newSeed = (): string => `${seed}:e${(counter += 1)}`
  const createRng = (s: string, nonce: number) => createSeededRng(`${s}:${nonce}`)

  let sum = 0
  let sumSq = 0
  let triesSum = 0
  let entrySum = 0
  for (let i = 0; i < entries; i += 1) {
    const found = findFeatureBuySpin({ math, trigger, totalBet, nonce: i + 1, newSeed, createRng })
    if (found === null) throw new Error(`[feature-buy] ${math.id}: 탐색 상한 안에서 '${trigger}' 진입 판을 못 찾았다`)
    triesSum += found.tries
    const entryWin = found.result.totalWin
    entrySum += entryWin
    let group = entryWin
    const next = found.result.nextState
    if (next !== undefined) {
      let cont = 0
      for (let j = 0; j < continuations; j += 1) cont += playContinuation(math, totalBet, next, `${seed}:c${i}:${j}`)
      group += cont / continuations
    }
    const x = group / totalBet
    sum += x
    sumSq += x * x
  }
  const mean = sum / entries
  const variance = entries > 1 ? Math.max(0, (sumSq - entries * mean * mean) / (entries - 1)) : 0
  return {
    trigger,
    totalBet,
    entries,
    continuations,
    meanRoundWin: mean,
    stdErr: Math.sqrt(variance / entries),
    meanTries: triesSum / entries,
    meanEntryWin: entrySum / entries / totalBet,
  }
}

/**
 * 가격의 반올림 단위 후보. 큰 것부터 써 보고 환수율 오차가 허용 안이면 그 값을 쓴다.
 * 우리 팩의 대표 보너스 기대값은 16~80배라 10·5 단위로는 환수율이 ±1%p를 쉽게 벗어난다(가격 17에서 1 단위 반올림만으로 최대 2.8%p).
 * 그래서 0.5·0.2·0.1 단위까지 내려가되, 모든 베팅 단계에서 비용이 정수 코인이 되는 단위만 쓴다.
 */
const PRICE_STEPS = [10, 5, 1, 0.5, 0.2, 0.1] as const
/** 반올림이 만드는 환수율 오차 허용치. 표본 오차 몫을 남기려고 ±1%p보다 훨씬 좁게 둔다. */
export const PRICE_ROUNDING_TOLERANCE = 0.003

function isWholeCoin(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9
}

/** 가격 = E[라운드 총당첨 | 진입] ÷ 목표 환수율을 보기 좋은 값으로. 10 → 5 → 1 → 0.5 → 0.2 → 0.1 단위 순으로 시도한다. */
export function suggestPrice(meanRoundWin: number, rtpTarget: number, betLevels: readonly number[]): number {
  const raw = meanRoundWin / rtpTarget
  let best = Math.max(2, Math.round(raw))
  for (const step of PRICE_STEPS) {
    const price = Number((Math.max(step, Math.round(raw / step) * step)).toFixed(1))
    if (!betLevels.every((bet) => isWholeCoin(bet * price))) continue
    best = price
    if (Math.abs(meanRoundWin / price - rtpTarget) <= PRICE_ROUNDING_TOLERANCE) return price
  }
  return best
}

/**
 * 기준값이 어떤 math로 잰 것인지. `featureBuy` 블록과 심볼 표시 이름은 빼고 해시한다
 * (가격·이름만 바꾸는 것은 결과에 영향이 없어 재측정이 필요 없다).
 */
export function mathHash(raw: Record<string, unknown>): string {
  const { featureBuy: _ignored, symbols, ...rest } = raw
  const plainSymbols = Array.isArray(symbols)
    ? symbols.map((symbol) => {
        const { name: _name, ...other } = symbol as Record<string, unknown>
        return other
      })
    : symbols
  return createHash('sha256').update(JSON.stringify({ ...rest, symbols: plainSymbols })).digest('hex').slice(0, 16)
}

export interface SearchBench {
  searches: number
  meanTries: number
  meanMs: number
  p99Ms: number
}

/** 서버와 같은 조건(crypto 32바이트 시드 + `${seed}:${nonce}` 파생 + 베팅 검사 포함 spin)으로 탐색 비용을 잰다. */
export function benchFeatureBuySearch(math: GameMath, trigger: FeatureBuyTrigger, totalBet: number, searches: number): SearchBench {
  const times: number[] = []
  let tries = 0
  for (let i = 0; i < searches; i += 1) {
    const started = performance.now()
    const found = findFeatureBuySpin({
      math,
      trigger,
      totalBet,
      nonce: i + 1,
      newSeed: () => randomBytes(32).toString('hex'),
      createRng: (seed, nonce) => createSeededRng(`${seed}:${nonce}`),
    })
    times.push(performance.now() - started)
    if (found === null) throw new Error(`[feature-buy] ${math.id}: 탐색 실패`)
    tries += found.tries
  }
  times.sort((a, b) => a - b)
  return {
    searches,
    meanTries: tries / searches,
    meanMs: times.reduce((a, b) => a + b, 0) / searches,
    p99Ms: times[Math.min(times.length - 1, Math.floor(times.length * 0.99))]!,
  }
}

/** `tools/rtp-sim/feature-buy.json`의 게임 한 줄. */
export interface FeatureBuyBaseline {
  trigger: FeatureBuyTrigger
  price: number
  totalBet: number
  entries: number
  continuations: number
  meanRoundWin: number
  stdErr: number
  meanTries: number
  meanEntryWin: number
  /** 구매 환수율 = meanRoundWin / price */
  buyRtp: number
  rtpTarget: number
  /** 서버 조건 탐색 비용 */
  searchMs: number
  mathHash: string
}
