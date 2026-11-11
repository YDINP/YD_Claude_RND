/**
 * 검수 리포트 CLI. 전수 조사 + 몬테카를로 + 기여도 분해 + 변동성을 한 번에 돌려
 * 한국어 마크다운 파일로 떨군다.
 *
 * ```
 * pnpm --filter @tgslot/rtp-sim run audit games/classic-777 --spins 2000000 --seed 42
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { getBetUnit, parseGameMath } from '@tgslot/slot-engine'
import {
  DEFAULT_AUDIT_SEED,
  DEFAULT_AUDIT_SPINS,
  DEFAULT_MC_SAMPLE_SPINS,
  DEFAULT_SAMPLE_SPINS,
  buildAuditMarkdown,
  canEnumerate,
  pickAuditSpins,
  resolveMethod,
  runAudit,
} from './audit/index.js'
import type { AuditResult } from './audit/index.js'
import { runShardedAudit } from './audit/shards.js'
import { findWorkspaceRoot, readJson, resolveMathPath } from './paths.js'

/** 총 베팅액을 지정하지 않았을 때 우선 고르는 값. betLevels에 없으면 첫 레벨을 쓴다. */
const PREFERRED_BET = 100

/** 워커 수 상한. 메모리가 빠듯한 기계를 지키려는 값이다. */
export const MAX_SHARDS = 8

interface AuditCliOptions {
  target: string
  /** null이면 manifest.auditSpins, 그것도 없으면 기본값. */
  spins: number | null
  shards: number
  seed: string
  bet: number | null
  out: string | null
  stdout: boolean
  /** 해석 모드에서 분포·기여도를 추정할 표본 스핀 수. */
  sampleSpins: number | null
}

const USAGE = `사용법: pnpm --filter @tgslot/rtp-sim run audit <게임폴더|math.json|게임id> [옵션]

옵션
  --spins <n>    몬테카를로 스핀 수 (기본 manifest.auditSpins, 없으면 ${DEFAULT_AUDIT_SPINS.toLocaleString('en-US')})
  --shards <k>   몬테카를로 감사를 워커 k개로 나눠 돈다 (시드 \`<seed>:shard-i\`, 최대 ${MAX_SHARDS})
  --sample <n>   전수 조사가 불가능한 모델에서 분포를 추정할 표본 스핀 수
                 (해석 모델 기본 ${DEFAULT_SAMPLE_SPINS.toLocaleString('en-US')},
                  몬테카를로 모델 기본 ${DEFAULT_MC_SAMPLE_SPINS.toLocaleString('en-US')})
  --seed <s>     시드 (기본 ${DEFAULT_AUDIT_SEED})
  --bet <coins>  검수 베팅액 (기본 ${PREFERRED_BET}, 없으면 첫 betLevel)
  --out <path>   리포트 경로 (기본 docs/RTP_AUDIT_<id>.md)
  --stdout       파일로 쓰지 않고 표준출력으로 낸다
  -h, --help     도움말`

export function parseAuditArgs(argv: string[]): AuditCliOptions {
  let target: string | undefined
  let spins: number | null = null
  let shards = 1
  // 지정하지 않으면 방법에 따라 고른다 (해석 200만 / 몬테카를로 2천5백만).
  let sampleSpins: number | null = null
  let seed = DEFAULT_AUDIT_SEED
  let bet: number | null = null
  let out: string | null = null
  let stdout = false

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
        spins = Number(takeValue())
        break
      case '--shards':
        shards = Number(takeValue())
        break
      case '--sample':
        sampleSpins = Number(takeValue())
        break
      case '--seed':
        seed = takeValue()
        break
      case '--bet':
        bet = Number(takeValue())
        break
      case '--out':
        out = takeValue()
        break
      case '--stdout':
        stdout = true
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
  if (spins !== null && (!Number.isInteger(spins) || spins <= 0)) throw new Error(`--spins는 양의 정수여야 한다: ${spins}`)
  if (!Number.isInteger(shards) || shards < 1 || shards > MAX_SHARDS) {
    throw new Error(`--shards는 1~${MAX_SHARDS} 정수여야 한다: ${shards}`)
  }
  if (sampleSpins !== null && (!Number.isInteger(sampleSpins) || sampleSpins <= 0)) {
    throw new Error(`--sample은 양의 정수여야 한다: ${sampleSpins}`)
  }
  if (bet !== null && (!Number.isInteger(bet) || bet <= 0)) throw new Error(`--bet은 양의 정수여야 한다: ${bet}`)
  return { target, spins, shards, seed, bet, out, stdout, sampleSpins }
}


/** 검수 베팅액을 고른다. 명시값 > 100 > 첫 betLevel 순. */
export function pickBet(betLevels: readonly number[], requested: number | null): number {
  if (requested !== null) return requested
  if (betLevels.includes(PREFERRED_BET)) return PREFERRED_BET
  const first = betLevels[0]
  if (first === undefined) throw new Error('betLevels가 비어 있다')
  return first
}

async function main(): Promise<void> {
  const options = parseAuditArgs(process.argv.slice(2))
  const mathPath = resolveMathPath(options.target)
  const math = parseGameMath(readJson(mathPath))

  // manifest.json은 스키마 밖 필드(jackpotContribution 등)까지 봐야 하므로 원본 JSON을 넘긴다.
  const manifestPath = join(dirname(mathPath), 'manifest.json')
  let manifestJson: unknown = null
  try {
    manifestJson = readJson(manifestPath)
  } catch {
    process.stderr.write(`[rtp-sim] manifest.json을 읽지 못했다: ${manifestPath} (잭팟 회계 생략)\n`)
  }

  const totalBet = pickBet(math.betLevels, options.bet)
  // 배당 단위는 라인 수일 수도 ways.betDivisor일 수도 있다. 판단은 엔진에 맡긴다.
  // (ways 게임은 paylines가 비어 있어 라인 수로 나누면 0으로 나누게 된다.)
  try {
    getBetUnit(math, totalBet)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`--bet ${totalBet}을 쓸 수 없다: ${reason}. 가능한 값: ${math.betLevels.join(', ')}`)
  }

  const spins = pickAuditSpins(options.spins, manifestJson)
  process.stderr.write(`[rtp-sim] ${mathPath} (${spins.toLocaleString('en-US')} 스핀)\n`)
  let lastPhase = ''
  let lastPercent = -1
  const onProgress = (phase: string, ratio: number): void => {
    const percent = Math.round(ratio * 100)
    if (phase !== lastPhase || (percent !== lastPercent && percent % 10 === 0)) {
      process.stderr.write(`\r[rtp-sim] ${phase} ${percent}%   `)
      lastPhase = phase
      lastPercent = percent
    }
  }
  const common = {
    totalBet,
    spins,
    seed: options.seed,
    ...(options.sampleSpins === null ? {} : { sampleSpins: options.sampleSpins }),
    onProgress,
  }
  const sharded = options.shards > 1 && resolveMethod(math, totalBet) === 'monte-carlo'
  if (options.shards > 1 && !sharded) {
    process.stderr.write('[rtp-sim] 닫힌 식이 있는 모델이라 샤딩 없이 돈다\n')
  }
  const startedAt = Date.now()
  const result: AuditResult = sharded
    ? await runShardedAudit(math, manifestJson, { ...common, shards: options.shards })
    : runAudit(math, manifestJson, common)
  process.stderr.write(`\n[rtp-sim] 소요 ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`)
  process.stderr.write('\r[rtp-sim] 계산 완료                    \n')

  const markdown = buildAuditMarkdown(result)

  if (options.stdout) {
    process.stdout.write(markdown)
  } else {
    const root = findWorkspaceRoot()
    const outPath =
      options.out === null
        ? join(root, 'docs', `RTP_AUDIT_${math.id}.md`)
        : isAbsolute(options.out)
          ? options.out
          : resolve(root, options.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, markdown, 'utf8')
    process.stderr.write(`[rtp-sim] 리포트: ${outPath}\n`)
  }

  const failed = result.gates.filter((gate) => !gate.pass)
  for (const gate of result.gates) {
    process.stderr.write(`  ${gate.pass ? '[PASS]' : '[FAIL]'} ${gate.label} — ${gate.detail}\n`)
  }
  if (failed.length > 0) {
    process.stderr.write(`\n[rtp-sim] 게이트 ${failed.length}개 실패\n`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\n[rtp-sim] ${error instanceof Error ? error.message : String(error)}\n\n`)
  process.exit(1)
})
