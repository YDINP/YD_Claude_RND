import { computeExactRtp, createSeededRng, MAX_ENUMERATION_COMBOS, parseGameMath, simulate } from '@tgslot/slot-engine'
import { readJson, resolveMathPath } from './paths.js'
import { formatExact, formatHeader, formatSimulation } from './report.js'

const DEFAULT_BET = 100
const DEFAULT_SPINS = 1_000_000
const DEFAULT_SEED = 42

interface CliOptions {
  target: string
  bet: number
  spins: number
  seed: string
  exactOnly: boolean
}

const USAGE = `사용법: pnpm --filter @tgslot/rtp-sim sim <게임폴더|math.json|게임id> [옵션]

옵션
  --bet <coins>     총 베팅액 (기본 ${DEFAULT_BET})
  --spins <n>       몬테카를로 스핀 수 (기본 ${DEFAULT_SPINS.toLocaleString('en-US')})
  --seed <s>        시드 (기본 ${DEFAULT_SEED})
  --exact           전수 조사만 하고 몬테카를로는 건너뛴다
  -h, --help        도움말`

function parseArgs(argv: string[]): CliOptions {
  let target: string | undefined
  let bet = DEFAULT_BET
  let spins = DEFAULT_SPINS
  let seed = String(DEFAULT_SEED)
  let exactOnly = false

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
  return { target, bet, spins, seed, exactOnly }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const mathPath = resolveMathPath(options.target)
  const math = parseGameMath(readJson(mathPath))

  const lines = math.paylines.length
  if (options.bet % lines !== 0) {
    throw new Error(`--bet ${options.bet}이 라인 수(${lines})로 나누어떨어지지 않는다. 예: ${math.betLevels.join(', ')}`)
  }

  console.log(`\n${mathPath}`)
  console.log(formatHeader(math, options.bet))

  const combos = math.strips.reduce((acc, strip) => acc * strip.length, 1)
  if (combos <= MAX_ENUMERATION_COMBOS) {
    console.log(`\n${formatExact(computeExactRtp(math, options.bet), math.rtpTarget)}`)
  } else {
    console.log(`\n전수 조사 생략: 조합 수 ${combos.toLocaleString('en-US')} > 상한 ${MAX_ENUMERATION_COMBOS.toLocaleString('en-US')}`)
  }

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
