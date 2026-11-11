import { parentPort, workerData } from 'node:worker_threads'
import { runAuditPart } from './parts.js'
import { collectSample } from './sampleDistribution.js'
import type { ShardMessage, ShardTask } from './shards.js'

const port = parentPort
if (port === null) throw new Error('shardWorker는 워커 스레드에서만 돈다')

const post = (message: ShardMessage): void => port.postMessage(message)
const task = workerData as ShardTask

try {
  if (task.kind === 'audit') {
    const result = runAuditPart(task.math, {
      ...task.options,
      onProgress: (phase, ratio) => post({ type: 'progress', phase, ratio }),
    })
    post({ type: 'done', result })
  } else {
    post({ type: 'done', result: collectSample(task.math, task.totalBet, task.options) })
  }
} catch (error) {
  post({ type: 'error', message: error instanceof Error ? (error.stack ?? error.message) : String(error) })
}
