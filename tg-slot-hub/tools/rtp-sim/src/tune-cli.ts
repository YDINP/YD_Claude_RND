/**
 * 연쇄 팩 튜닝 CLI. 한 번 돌려 RTP 분해·적중률·최초 클러스터율·평균 연쇄·라운드 진입률·
 * 주문 완료율·σ·n*를 한 화면에 낸다. 밀도표로 스트립을 다시 만들고 배율을 걸어 볼 수 있다.
 * 말판 팩(`boardBonus`)은 라인·스캐터 해석식 + 말판 DP로 정확 RTP를 먼저 내고, 표본으로 적중률·σ를 잰다.
 * 무대 룰렛 팩(`stageRoulette`)은 진입률·룰렛 평균·15× 미만 비율을 낸다(룰렛 판 값은 `--roulette-scale`).
 *
 * ```
 * pnpm --filter @tgslot/rtp-sim run tune candy-cluster-pop --spins 1000000 --shards 4 \
 *   --strips densities.json --strip-seed 7 --pay-scale 1.2 --prize-scale 0.9 [--write]
 * ```
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { boardExpectation, computeBoardRtp, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { buildBoardReport, buildCascadeReport, buildCoinRespinReport, buildRouletteReport, requiredAuditSpins, roundAuditSpins } from './audit/index.js'
import type { BoardReport, CascadeReport, CoinRespinReport, RouletteReport } from './audit/index.js'
import { buildForgeReport } from './audit/forgeStats.js'
import type { ForgeReport } from './audit/forgeStats.js'
import type { SampleState } from './audit/index.js'
import { runShardedSample } from './audit/shards.js'
import { readJson, resolveMathPath } from './paths.js'
import { MIN_STRIP_LENGTH, generateStrips, scalePaytable, scalePrizes, scaleRoulette, stripCounts } from './strips.js'
import type { DensityTable } from './strips.js'

export interface TuneOptions {
  target: string
  spins: number
  seed: string
  bet: number
  shards: number
  strips: string | null
  stripSeed: string
  payScale: number
  prizeScale: number
  boardScale: number
  rouletteScale: number
  write: boolean
  json: boolean
}

const USAGE = `사용법: pnpm --filter @tgslot/rtp-sim run tune <게임폴더|math.json|게임id> [옵션]

옵션
  --spins <n>        표본 유료 스핀 수 (기본 1,000,000)
  --seed <s>         시드 (기본 tune). 샤드 i는 <seed>:shard-i
  --bet <coins>      총 베팅액 (기본 100)
  --shards <k>       워커 수 (기본 1, 최대 8)
  --strips <path>    밀도표 JSON으로 스트립을 새로 만든다
  --strip-seed <s>   스트립 생성 시드 (기본 1)
  --pay-scale <x>    기본 페이테이블 선형 배율 (0.05 눈금으로 반올림)
  --prize-scale <x>  주문 카드 상품 선형 배율 (0.05 눈금으로 반올림)
  --board-scale <k>  말판 코인·큰 상·최소 지급 선형 배율 (정수 반올림, maxWin은 DP 최대로 다시 맞춤)
  --roulette-scale <x> 무대 룰렛 판 값 선형 배율 (정수로 반올림)
  --write            바꾼 수학을 math.json에 쓴다
  --json             요약을 JSON으로 낸다
  -h, --help         도움말`

export function parseTuneArgs(argv: string[]): TuneOptions {
  const options: TuneOptions = {
    target: '',
    spins: 1_000_000,
    seed: 'tune',
    bet: 100,
    shards: 1,
    strips: null,
    stripSeed: '1',
    payScale: 1,
    prizeScale: 1,
    boardScale: 1,
    rouletteScale: 1,
    write: false,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    const takeValue = (): string => {
      const value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} 뒤에 값이 필요하다`)
      i += 1
      return value
    }
    switch (arg) {
      case '--spins':
        options.spins = Number(takeValue())
        break
      case '--seed':
        options.seed = takeValue()
        break
      case '--bet':
        options.bet = Number(takeValue())
        break
      case '--shards':
        options.shards = Number(takeValue())
        break
      case '--strips':
        options.strips = takeValue()
        break
      case '--strip-seed':
        options.stripSeed = takeValue()
        break
      case '--pay-scale':
        options.payScale = Number(takeValue())
        break
      case '--prize-scale':
        options.prizeScale = Number(takeValue())
        break
      case '--board-scale':
        options.boardScale = Number(takeValue())
        break
      case '--roulette-scale':
        options.rouletteScale = Number(takeValue())
        break
      case '--write':
        options.write = true
        break
      case '--json':
        options.json = true
        break
      case '-h':
      case '--help':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션: ${arg}`)
        options.target = arg
    }
  }
  if (options.target === '') throw new Error(`대상 게임을 지정할 것\n\n${USAGE}`)
  if (!Number.isInteger(options.spins) || options.spins < 1) throw new Error(`--spins는 양의 정수여야 한다`)
  if (!Number.isInteger(options.bet) || options.bet < 1) throw new Error(`--bet은 양의 정수여야 한다`)
  if (!Number.isInteger(options.shards) || options.shards < 1 || options.shards > 8) {
    throw new Error('--shards는 1~8 정수여야 한다')
  }
  if (!(options.payScale > 0) || !(options.prizeScale > 0) || !(options.boardScale > 0) || !(options.rouletteScale > 0)) {
    throw new Error('배율은 양수여야 한다')
  }
  return options
}

/**
 * 원본 math.json(파싱 전 JSON)에 튜닝 손잡이를 건다. 스키마 기본값이 끼어들지 않도록 원본을 고친다.
 * 결과는 반드시 `parseGameMath`를 통과해야 한다.
 */
export function applyTuning(
  raw: Record<string, unknown>,
  knobs: { densities?: DensityTable; stripSeed?: string; payScale?: number; prizeScale?: number; boardScale?: number; rouletteScale?: number },
): { raw: Record<string, unknown>; math: GameMath } {
  const base = parseGameMath(raw)
  const next: Record<string, unknown> = { ...raw }
  if (knobs.densities !== undefined) next['strips'] = generateStrips(base, knobs.densities, knobs.stripSeed ?? '1')
  if (knobs.payScale !== undefined && knobs.payScale !== 1) next['paytable'] = scalePaytable(base, knobs.payScale)
  if (knobs.prizeScale !== undefined && knobs.prizeScale !== 1 && base.orderRound !== undefined) {
    next['orderRound'] = { ...(raw['orderRound'] as Record<string, unknown>), pool: scalePrizes(base, knobs.prizeScale) }
  }
  if (knobs.boardScale !== undefined && knobs.boardScale !== 1 && base.boardBonus !== undefined) {
    next['boardBonus'] = scaleBoard(base.boardBonus, knobs.boardScale)
  }
  if (knobs.rouletteScale !== undefined && knobs.rouletteScale !== 1 && base.stageRoulette !== undefined) {
    next['stageRoulette'] = scaleRoulette(raw, knobs.rouletteScale)
  }
  return { raw: next, math: parseGameMath(next) }
}

type BoardConfig = NonNullable<GameMath['boardBonus']>

/**
 * 말판 값 배율. 코인·큰 상·최소 지급을 k배(정수 반올림)하면 말판 평균이 거의 정확히 k배가 된다(배수 칸은 그대로).
 * 구조상 최대가 바뀌므로 `maxWin`은 DP 최대로 다시 맞춘다.
 */
export function scaleBoard(board: BoardConfig, scale: number): BoardConfig {
  const nodes = Object.fromEntries(
    Object.entries(board.nodes).map(([id, node]) =>
      node.kind === 'coin' || node.kind === 'goal'
        ? [id, { ...node, value: Math.max(node.kind === 'coin' ? 1 : 0, Math.round((node.value ?? 0) * scale)) }]
        : [id, node],
    ),
  )
  const scaled: BoardConfig = { ...board, nodes, minPayout: Math.round(board.minPayout * scale) }
  return { ...scaled, maxWin: Math.max(1, boardExpectation(scaled).max) }
}

/** 스트립과 `name`은 한 줄로, 나머지는 2칸 들여쓰기로 쓴다. 원래 math.json 모양을 따른다. */
export function formatMathJson(raw: Record<string, unknown>): string {
  const inline: string[] = []
  const mark = (text: string): string => {
    inline.push(text)
    return `__INLINE_${inline.length - 1}__`
  }
  const prepared = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
  const symbols = prepared['symbols']
  if (Array.isArray(symbols)) {
    for (const symbol of symbols as Record<string, unknown>[]) {
      const name = symbol['name']
      if (typeof name === 'object' && name !== null) {
        symbol['name'] = mark(
          `{${Object.entries(name)
            .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
            .join(', ')}}`,
        )
      }
    }
  }
  const strips = prepared['strips']
  if (Array.isArray(strips)) prepared['strips'] = strips.map((strip) => mark(JSON.stringify(strip)))
  return `${JSON.stringify(prepared, null, 2).replace(/"__INLINE_(\d+)__"/g, (_, index: string) => inline[Number(index)] ?? '')}\n`
}

export interface TuneSummary {
  spins: number
  rtp: number
  sigma: number
  nStar: number
  nStarRounded: number
  hitRate: number
  maxWinMultiplier: number
  stripLengths: number[]
  /** 연쇄 팩만. */
  cascade: CascadeReport | null
  /** 코인 리스핀 팩만. */
  coinRespin: CoinRespinReport | null
  /** 무대 룰렛 팩만. */
  roulette?: RouletteReport
  /** 화로 배율 줄 팩만. */
  forge?: ForgeReport
}

export function summarize(math: GameMath, state: SampleState): TuneSummary {
  const cascade = state.cascade
  const coinRespin = state.coinRespin ?? null
  const roulette = state.roulette ?? null
  if (cascade === null && coinRespin === null && roulette === null) {
    throw new Error('연쇄·코인 리스핀·무대 룰렛 팩이 아니다. tune은 cascade·coinRespin·stageRoulette 설정이 있는 팩 전용이다')
  }
  const n = state.spins
  const rtp = state.multiplierSum / n
  const variance = n > 1 ? Math.max(0, (state.multiplierSquareSum - n * rtp * rtp) / (n - 1)) : 0
  const sigma = Math.sqrt(variance)
  const nStar = requiredAuditSpins(sigma)
  return {
    spins: n,
    rtp,
    sigma,
    nStar,
    nStarRounded: roundAuditSpins(nStar),
    hitRate: state.hits / n,
    maxWinMultiplier: state.maxWin / state.totalBet,
    stripLengths: math.strips.map((strip) => strip.length),
    cascade: cascade === null ? null : buildCascadeReport(math, cascade, state.totalBet),
    coinRespin: coinRespin === null ? null : buildCoinRespinReport(math, coinRespin, state.totalBet),
    ...(roulette === null ? {} : { roulette: buildRouletteReport(math, roulette, state.totalBet, rtp) }),
    ...(state.forge == null ? {} : { forge: buildForgeReport(state.forge, state.totalBet) }),
  }
}

const p = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`

function formatCoinRespin(math: GameMath, summary: TuneSummary, r: CoinRespinReport): string {
  const b = r.breakdown
  return [
    `${math.id}  ${summary.spins.toLocaleString('en-US')} 스핀, 스트립 ${summary.stripLengths.join('/')}`,
    `RTP ${p(summary.rtp, 3)} (목표 ${p(math.rtpTarget)}) = 라인 ${p(b.lines, 3)} + 코인 리스핀 ${p(b.respin, 3)}`,
    `  리스핀 = 숫자 ${p(b.respinNumeric, 3)} + 감기 ${p(b.respinWrapBonus, 3)} + 보물 ${p(b.respinTreasure, 3)} + 최고 ${p(b.respinTop, 3)} - 캡 ${p(b.capLoss, 3)}`,
    `적중률 ${p(summary.hitRate)}  진입 1/${r.entryRate > 0 ? (1 / r.entryRate).toFixed(1) : '-'} (${r.rounds})  피처 평균 ${r.meanFeatureMultiplier.toFixed(2)}x σ ${r.featureSigma.toFixed(1)}  최대 ${summary.maxWinMultiplier.toFixed(1)}x`,
    `평균 리스핀 ${r.meanSteps.toFixed(2)} 최장 ${r.maxSteps}/${r.structuralMaxSteps}  종료 코인 ${r.meanFinalCoins.toFixed(2)}  15칸 ${p(r.fullRate, 3)}  진입 감기 ${p(r.entryWrapRate, 1)}  도중 감기 ${p(r.midWrapRate, 1)}`,
    `보물 ${p(r.tierRates.small, 1)} / ${p(r.tierRates.medium, 1)} / ${p(r.tierRates.large, 2)}  hardCap ${r.hardCapRounds}  winCapped ${r.winCappedRounds}  기대감 ${p(r.anticipationRate)}  q×빈칸 ${r.growthBound.toFixed(3)}`,
    `σ ${summary.sigma.toFixed(3)}  n* ${summary.nStar.toLocaleString('en-US')} (올림 ${summary.nStarRounded.toLocaleString('en-US')})`,
  ].join('\n')
}

function formatRouletteSummary(math: GameMath, summary: TuneSummary, r: RouletteReport): string {
  const odds = r.entryRate > 0 ? Math.round(1 / r.entryRate) : 0
  return [
    `${math.id}  ${summary.spins.toLocaleString('en-US')} 스핀, 스트립 ${summary.stripLengths.join('/')}`,
    `RTP ${p(summary.rtp, 3)} (목표 ${p(math.rtpTarget)})  ways ${p(r.waysRtp, 3)} + 룰렛 ${p(r.rouletteRtp, 3)}`,
    `적중률 ${p(summary.hitRate)}  최대 ${summary.maxWinMultiplier.toFixed(1)}x  winCapped ${r.winCappedSpins}`,
    `룰렛 진입 1/${odds} (${r.triggers})  가운데 시작 ${p(r.middleStartRate, 1)}  평균 ${r.mean.toFixed(2)}x  σ ${r.sigma.toFixed(1)}x  15x 미만 ${p(r.smallRate, 1)}`,
    `  고리 도달 ${r.ringReachRate.map((rate) => p(rate, 1)).join(' / ')}  대상 ${p(r.grandTriggerRate, 2)}  평균 회전 ${r.meanSteps.toFixed(2)} (최장 ${r.maxSteps})`,
    `  응원봉 ${r.cheer.map((row) => `${row.cheer}:${p(row.rate, 0)}/${row.mean.toFixed(0)}x`).join(' ')}`,
    `  구간 ${r.buckets.map((row) => `${row.range} ${p(row.rate, 1)}`).join('  ')}`,
    `σ ${summary.sigma.toFixed(3)}  n* ${summary.nStar.toLocaleString('en-US')} (올림 ${summary.nStarRounded.toLocaleString('en-US')})`,
  ].join('\n')
}

function formatForge(math: GameMath, summary: TuneSummary, f: ForgeReport, c: CascadeReport): string {
  const b = f.breakdown
  return [
    `${math.id}  ${summary.spins.toLocaleString('en-US')} 스핀, 스트립 ${summary.stripLengths.join('/')}`,
    `RTP ${p(summary.rtp, 3)} (목표 ${p(math.rtpTarget)}) = 연쇄 ×1 ${p(b.baseLines, 3)} + 불씨 ${p(b.emberBoost, 3)} + 모루 ${p(b.baseScatter, 3)} + 프리스핀 ${p(b.freeSpins, 3)}`,
    `  프리스핀 = 연쇄 ×1 ${p(b.freeLines, 3)} + 화로 ${p(b.freeBoost, 3)} + 모루 ${p(b.freeScatter, 3)}`,
    `적중률 ${p(summary.hitRate)}  베팅 미만 ${p(f.subBetWinShare, 1)}  평균 연쇄 ${c.meanCascades.toFixed(3)}  P(지속) ${c.continueProbability.toFixed(3)}  maxCascades ${c.maxCascadesHits}`,
    `기본 불씨 ${p(f.baseEmberRate, 2)}(당첨 대비)  진입 1/${f.entryRate > 0 ? (1 / f.entryRate).toFixed(1) : '-'} (${f.rounds})  라운드 평균 ${f.roundMean.toFixed(2)}x σ ${f.roundSigma.toFixed(1)}  최대 ${f.maxRound.toFixed(0)}x`,
    `라운드당 불씨 ${f.embersPerRound.toFixed(2)}  가득 1회+ ${p(f.fullRoundRate, 1)}  당첨≤1 라운드 ${p(f.dryRoundRate, 1)}  추가 1/${f.retriggerRate > 0 ? (1 / f.retriggerRate).toFixed(0) : '-'}  평균 길이 ${f.meanLength.toFixed(2)}  합계${f.heatCap} ${p(f.heatCapRate, 4)}  캡 ${f.winCappedSpins}`,
    `σ ${summary.sigma.toFixed(3)}  n* ${summary.nStar.toLocaleString('en-US')} (올림 ${summary.nStarRounded.toLocaleString('en-US')})  최대 ${summary.maxWinMultiplier.toFixed(1)}x`,
  ].join('\n')
}

export function formatSummary(math: GameMath, summary: TuneSummary): string {
  if (summary.coinRespin !== null) return formatCoinRespin(math, summary, summary.coinRespin)
  if (summary.forge !== undefined && summary.cascade !== null) return formatForge(math, summary, summary.forge, summary.cascade)
  if (summary.roulette !== undefined) return formatRouletteSummary(math, summary, summary.roulette)
  const c = summary.cascade
  if (c === null) throw new Error('요약할 연쇄 통계가 없다')
  const b = c.breakdown
  const lines = [
    `${math.id}  ${summary.spins.toLocaleString('en-US')} 스핀, 스트립 ${summary.stripLengths.join('/')}`,
    `RTP ${p(summary.rtp, 3)} (목표 ${p(math.rtpTarget)})  기본 ${p(b.base, 3)} = 클러스터 ${p(b.lines, 3)} + 스캐터 ${p(b.scatter, 3)}`,
    `  라운드 ${p(b.round, 3)} = 상품 ${p(b.orderPrize, 3)} + 라운드 클러스터 ${p(b.roundClusters, 3)}`,
    `적중률 ${p(summary.hitRate)}  최초 클러스터 ${p(c.firstClusterRate)}  평균 연쇄 ${c.meanCascades.toFixed(3)}  P(지속) ${c.continueProbability.toFixed(3)}  3연쇄+ ${p(c.depth3PlusRate)}`,
    `maxCascades 도달 ${c.maxCascadesHits}  winCapped ${c.winCappedSpins}  최대 ${summary.maxWinMultiplier.toFixed(1)}x`,
    `σ ${summary.sigma.toFixed(3)}  n* ${summary.nStar.toLocaleString('en-US')} (올림 ${summary.nStarRounded.toLocaleString('en-US')})`,
  ]
  const o = c.orders
  if (o !== null) {
    lines.push(
      `라운드 진입 1/${o.entryRate > 0 ? Math.round(1 / o.entryRate) : '-'} (${o.rounds})  평균 길이 ${o.meanLength.toFixed(2)}  최장 ${o.maxLength}  카드/라운드 ${o.cardsPerRound.toFixed(3)}  완료율 ${p(o.completionRate, 1)}`,
      `  종류별 ${o.byKind.map((row) => `${row.kind} ${p(row.rate, 1)}`).join('  ')}`,
      `  카드별 ${o.byId.map((row) => `${row.id} ${p(row.rate, 0)}`).join('  ')}`,
    )
  }
  return lines.join('\n')
}

export interface BoardTuneSummary {
  /** 해석식(라인·스캐터) + DP(말판) 정확 RTP. */
  exact: ReturnType<typeof computeBoardRtp>
  spins: number
  sampleRtp: number
  sigma: number
  nStar: number
  nStarRounded: number
  hitRate: number
  maxWinMultiplier: number
  board: BoardReport
}

export function summarizeBoard(math: GameMath, state: SampleState, totalBet: number): BoardTuneSummary {
  if (state.board == null) throw new Error('말판 팩이 아니다')
  const n = state.spins
  const sampleRtp = state.multiplierSum / n
  const variance = n > 1 ? Math.max(0, (state.multiplierSquareSum - n * sampleRtp * sampleRtp) / (n - 1)) : 0
  const sigma = Math.sqrt(variance)
  const nStar = requiredAuditSpins(sigma)
  return {
    exact: computeBoardRtp(math, totalBet),
    spins: n,
    sampleRtp,
    sigma,
    nStar,
    nStarRounded: roundAuditSpins(nStar),
    hitRate: state.hits / n,
    maxWinMultiplier: state.maxWin / state.totalBet,
    board: buildBoardReport(math, state.board, totalBet),
  }
}

export function formatBoardSummary(math: GameMath, summary: BoardTuneSummary): string {
  const e = summary.exact
  const x = e.expectation
  const b = summary.board
  return [
    `${math.id}  ${summary.spins.toLocaleString('en-US')} 스핀, 스트립 ${math.strips.map((strip) => strip.length).join('/')}`,
    `정확 RTP ${p(e.rtp, 3)} (목표 ${p(math.rtpTarget)}) = 라인 ${p(e.lines, 3)} + 스캐터 ${p(e.scatter, 3)} + 말판 ${p(e.board, 3)}`,
    `말판 진입 1/${(1 / e.triggerProbability).toFixed(1)}  평균 ${x.mean.toFixed(3)}x  σ ${x.sd.toFixed(2)}  최대 ${x.max}x (maxWin ${math.boardBonus?.maxWin ?? '-'})`,
    `  결승 ${p(x.pEnd.goal, 1)}  함정 ${p(x.pEnd.traps, 1)}  기회 소진 ${p(x.pEnd.throws, 1)}  갈림길 ${p(x.pFork, 1)}  평균 던지기 ${x.meanThrows.toFixed(2)}  최소 지급 ${p(x.pMinPayout, 1)}`,
    `표본 RTP ${p(summary.sampleRtp, 3)}  적중률 ${p(summary.hitRate)}  최대 ${summary.maxWinMultiplier.toFixed(1)}x  말판 MC 평균 ${b.meanPayout.toFixed(3)}x (${b.boards}판)`,
    `σ ${summary.sigma.toFixed(3)}  n* ${summary.nStar.toLocaleString('en-US')} (올림 ${summary.nStarRounded.toLocaleString('en-US')})`,
  ].join('\n')
}

async function main(): Promise<void> {
  const options = parseTuneArgs(process.argv.slice(2))
  const mathPath = resolveMathPath(options.target)
  const original = readFileSync(mathPath, 'utf8')
  const raw = readJson(mathPath) as Record<string, unknown>
  const densities =
    options.strips === null
      ? undefined
      : (readJson(isAbsolute(options.strips) ? options.strips : resolve(process.cwd(), options.strips)) as DensityTable)
  const tuned = applyTuning(raw, {
    ...(densities === undefined ? {} : { densities, stripSeed: options.stripSeed }),
    payScale: options.payScale,
    prizeScale: options.prizeScale,
    boardScale: options.boardScale,
    rouletteScale: options.rouletteScale,
  })
  const short = tuned.math.strips.filter((strip) => strip.length < MIN_STRIP_LENGTH).length
  if (short > 0) process.stderr.write(`[tune] 경고: 길이 ${MIN_STRIP_LENGTH} 미만 스트립 ${short}개\n`)

  const state = await runShardedSample(tuned.math, options.bet, options.spins, options.seed, options.shards, {
    rtpSource: 'sample',
    skipEngineMc: true,
  })
  if (tuned.math.boardBonus !== undefined) {
    const summary = summarizeBoard(tuned.math, state, options.bet)
    if (options.json) console.log(JSON.stringify({ ...summary, counts: stripCounts(tuned.math.strips) }, null, 2))
    else console.log(formatBoardSummary(tuned.math, summary))
  } else {
    const summary = summarize(tuned.math, state)
    if (options.json) console.log(JSON.stringify({ ...summary, counts: stripCounts(tuned.math.strips) }, null, 2))
    else console.log(formatSummary(tuned.math, summary))
  }

  if (options.write) {
    const text = formatMathJson(tuned.raw)
    writeFileSync(mathPath, original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text, 'utf8')
    process.stderr.write(`[tune] ${mathPath}에 썼다\n`)
  }
}

if (process.argv[1] !== undefined && /tune-cli\.[cm]?[jt]s$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(`\n[tune] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
