/**
 * 시드 샤딩. `worker_threads`로 샤드마다 워커 하나를 띄워 `runAuditPart`(또는 튜닝용 표본)를 돌리고 합친다.
 * node 전용이라 `audit/index.ts`에서 내보내지 않는다. CLI만 쓴다.
 */
import { Worker } from 'node:worker_threads'
import type { GameMath } from '@tgslot/slot-engine'
import { finishAuditParts, planShards, shardSeed, shardSeedLabel } from './parts.js'
import type { AuditPart, AuditPartOptions } from './parts.js'
import { simulateRuin } from './ruin.js'
import { chunkSizes } from './mc.js'
import { collectSample, mergeSampleStates } from './sampleDistribution.js'
import type { SampleOptions, SampleState } from './sampleDistribution.js'
import type { AuditResult } from './types.js'

export type ShardTask =
  | { kind: 'audit'; math: GameMath; options: Omit<AuditPartOptions, 'onProgress'> }
  | { kind: 'sample'; math: GameMath; totalBet: number; options: Omit<SampleOptions, 'onProgress'> }

export type ShardMessage =
  | { type: 'progress'; phase: string; ratio: number }
  | { type: 'done'; result: AuditPart | SampleState }
  | { type: 'error'; message: string }

/** tsx로 띄운 프로세스면 로더 인자를 물려받고, 아니면(vitest 등) tsx 로더를 붙인다. */
function workerExecArgv(): string[] {
  const inherited = process.execArgv
  return inherited.some((arg) => arg.includes('tsx')) ? inherited : [...inherited, '--import', 'tsx']
}

function runTask<T>(task: ShardTask, onProgress?: (phase: string, ratio: number) => void): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const worker = new Worker(new URL('./shardWorker.ts', import.meta.url), {
      workerData: task,
      execArgv: workerExecArgv(),
    })
    let settled = false
    worker.on('message', (message: ShardMessage) => {
      if (message.type === 'progress') onProgress?.(message.phase, message.ratio)
      else if (message.type === 'done') {
        settled = true
        resolvePromise(message.result as T)
        void worker.terminate()
      } else {
        settled = true
        reject(new Error(message.message))
        void worker.terminate()
      }
    })
    worker.on('error', (error) => {
      settled = true
      reject(error)
    })
    worker.on('exit', (code) => {
      if (!settled) reject(new Error(`샤드 워커가 결과 없이 끝났다 (exit ${code})`))
    })
  })
}

export interface ShardedAuditOptions {
  totalBet: number
  spins: number
  seed: string
  shards: number
  sampleSpins?: number
  betLevelSpins?: number
  generatedAt?: Date
  onProgress?: (phase: string, ratio: number) => void
}

/** 몬테카를로 감사를 샤드로 나눠 돈다. 샤드 i의 시드는 `${seed}:shard-${i}`다. */
export async function runShardedAudit(
  math: GameMath,
  manifestJson: unknown,
  options: ShardedAuditOptions,
): Promise<AuditResult> {
  const plans = planShards(options, options.shards)
  const ratios = new Map<string, number[]>()
  const report = (index: number) => (phase: string, ratio: number) => {
    const list = ratios.get(phase) ?? new Array<number>(plans.length).fill(0)
    list[index] = ratio
    ratios.set(phase, list)
    options.onProgress?.(phase, list.reduce((sum, value) => sum + value, 0) / plans.length)
  }
  const parts = await Promise.all(
    plans.map((plan) => runTask<AuditPart>({ kind: 'audit', math, options: plan.options }, report(plan.index))),
  )
  options.onProgress?.('파산 확률 시뮬', 0)
  const ruin = simulateRuin(math, options.totalBet, options.seed)
  options.onProgress?.('파산 확률 시뮬', 1)
  const finishOptions = { totalBet: options.totalBet, spins: options.spins, seed: options.seed }
  return finishAuditParts(
    math,
    manifestJson,
    options.generatedAt === undefined ? finishOptions : { ...finishOptions, generatedAt: options.generatedAt },
    parts,
    ruin,
  )
}

/**
 * 표본만 샤드로 나눠 돈다(튜닝 CLI용). `shards`가 1이면 워커 없이 이 스레드에서 돈다.
 * 시드 규칙은 감사와 같다.
 */
export async function runShardedSample(
  math: GameMath,
  totalBet: number,
  spins: number,
  seed: string,
  shards: number,
  options: Omit<SampleOptions, 'onProgress' | 'spins' | 'seed'> = {},
): Promise<SampleState> {
  const sizes = chunkSizes(spins, shards)
  if (sizes.length === 1) return collectSample(math, totalBet, { ...options, spins, seed: shardSeed(seed, 0) })
  const parts = await Promise.all(
    sizes.map((size, index) =>
      runTask<SampleState>({
        kind: 'sample',
        math,
        totalBet,
        options: { ...options, spins: size, seed: shardSeed(seed, index) },
      }),
    ),
  )
  return mergeSampleStates(math, parts, shardSeedLabel(seed, parts.length))
}
