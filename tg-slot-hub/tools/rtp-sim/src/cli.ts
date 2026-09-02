import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { computeExactRtp, createSeededRng, parseGameMath, simulate } from '@tgslot/slot-engine'
import { parseGameManifest } from '@tgslot/game-sdk'
import { betUnitCount } from './audit/index.js'
import { readJson, resolveMathPath } from './paths.js'
import { formatExact, formatHeader, formatSimulation } from './report.js'
import type { JackpotInfo } from './report.js'

/**
 * math.json 옆 manifest.json에서 허브 잭팟 기여분을 읽는다.
 * manifest가 없거나 깨져도 시뮬레이션 자체는 계속한다. 수학 모델과 무관한 표시용 값이다.
 */
function readJackpotInfo(mathPath: string): JackpotInfo | undefined {
  const manifestPath = join(dirname(mathPath), 'manifest.json')
  if (!existsSync(manifestPath)) return undefined
  try {
    const manifest = parseGameManifest(readJson(manifestPath))
    if (manifest.jackpotContribution === undefined) return undefined
    return { contribution: manifest.jackpotContribution, totalTarget: manifest.rtpTotalTarget }
  } catch (error) {
    console.warn(`[rtp-sim] manifest.json을 읽지 못했다: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

const DEFAULT_BET = 100
const DEFAULT_SPINS = 1_000_000
const DEFAULT_SEED = 42
const DEFAULT_SAMPLE = 200_000
const DEFAULT_MC = 2_000_000
const DEFAULT_MC_SEED_ARG = 'monte-carlo'

interface CliOptions {
  target: string
  bet: number
  spins: number
  seed: string
  exactOnly: boolean
  sampleSpins: number
  mcSpins: number
  mcSeed: string
}

const USAGE = `사용법: pnpm --filter @tgslot/rtp-sim sim <게임폴더|math.json|게임id> [옵션]

옵션
  --bet <coins>     총 베팅액 (기본 ${DEFAULT_BET})
  --spins <n>       몬테카를로 스핀 수 (기본 ${DEFAULT_SPINS.toLocaleString('en-US')})
  --seed <s>        시드 (기본 ${DEFAULT_SEED})
  --sample <n>      해석 모드에서 적중률·최대 배수를 잴 표본 스핀 수 (기본 ${DEFAULT_SAMPLE.toLocaleString('en-US')})
  --mc <n>          몬테카를로 모드에서 돌릴 유료 스핀 수 (기본 ${DEFAULT_MC.toLocaleString('en-US')})
  --mc-seed <s>     몬테카를로 시드 (기본 ${DEFAULT_MC_SEED_ARG})
  --exact           RTP만 내고 몬테카를로는 건너뛴다
  -h, --help        도움말`

function parseArgs(argv: string[]): CliOptions {
  let target: string | undefined
  let bet = DEFAULT_BET
  let spins = DEFAULT_SPINS
  let seed = String(DEFAULT_SEED)
  let exactOnly = false
  let sampleSpins = DEFAULT_SAMPLE
  let mcSpins = DEFAULT_MC
  let mcSeed = DEFAULT_MC_SEED_ARG

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
      case '--bet':
        bet = Number(takeValue())
        break
      case '--spins':
        spins = Number(takeValue())
        break
      case '--seed':
        seed = takeValue()
        break
      case '--sample':
        sampleSpins = Number(takeValue())
        break
      case '--mc':
        mcSpins = Number(takeValue())
        break
      case '--mc-seed':
        mcSeed = takeValue()
        break
      case '--exact':
        exactOnly = true
        break
      case '-h':
      case '--help':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) throw new Error(`알 수 없는 옵션: ${arg}`)
        target = arg
    }
  }

  if (target === undefined) throw new Error(`대상 게임을 지정할 것\n\n${USAGE}`)
  if (!Number.isInteger(bet) || bet <= 0) throw new Error(`--bet은 양의 정수여야 한다: ${bet}`)
  if (!Number.isInteger(spins) || spins <= 0) throw new Error(`--spins는 양의 정수여야 한다: ${spins}`)
  if (!Number.isInteger(sampleSpins) || sampleSpins < 0) {
    throw new Error(`--sample은 0 이상의 정수여야 한다: ${sampleSpins}`)
  }
  if (!Number.isInteger(mcSpins) || mcSpins < 1) {
    throw new Error(`--mc는 1 이상의 정수여야 한다: ${mcSpins}`)
  }
  return { target, bet, spins, seed, exactOnly, sampleSpins, mcSpins, mcSeed }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const mathPath = resolveMathPath(options.target)
  const math = parseGameMath(readJson(mathPath))

  // ways 게임은 페이라인이 없고 배당 단위가 betDivisor다. 단위 수는 엔진에서 되짚는다.
  const divisor = betUnitCount(math, math.betLevels[0] ?? 1)
  const unit = math.payModel === 'ways' ? 'betDivisor' : '라인 수'
  if (divisor <= 0 || options.bet % divisor !== 0) {
    throw new Error(`--bet ${options.bet}이 ${unit}(${divisor})로 나누어떨어지지 않는다. 예: ${math.betLevels.join(', ')}`)
  }

  console.log(`\n${mathPath}`)
  console.log(formatHeader(math, options.bet))

  // computeExactRtp가 조합 수를 보고 전수 조사와 해석적 계산 중에 알아서 고른다.
  const exact = computeExactRtp(math, options.bet, {
    sampleSpins: options.sampleSpins,
    mcSpins: options.mcSpins,
    mcSeed: options.mcSeed,
  })
  console.log(`\n${formatExact(exact, math.rtpTarget, readJackpotInfo(mathPath))}`)

  if (!options.exactOnly) {
    const rng = createSeededRng(options.seed)
    const report = simulate(math, options.bet, options.spins, rng)
    console.log(`\n${formatSimulation(report, options.bet, math.rtpTarget)}`)
  }
  console.log('')
}

try {
  main()
} catch (error) {
  console.error(`\n[rtp-sim] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
