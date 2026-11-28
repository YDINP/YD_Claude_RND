/**
 * 피처 구매 가격·환수율 측정 CLI.
 *
 *   pnpm --filter @tgslot/rtp-sim feature-buy                         # featureBuy가 있는 팩 전부, 표만
 *   pnpm --filter @tgslot/rtp-sim feature-buy kraken-cove --write     # 재서 math.json 가격과 기준값 파일을 갱신
 *
 * | 옵션 | 기본값 | 설명 |
 * |---|---|---|
 * | `--entries` | 20,000 | 진입 판 표본 수 |
 * | `--cont` | 10 | 진입 판마다 이어지는 프리스핀을 돌릴 횟수 |
 * | `--seed` | feature-buy | 시드 |
 * | `--bench` | 2,000 | 서버 조건 탐색 비용을 잴 탐색 횟수 |
 * | `--write` | off | `games/<id>/math.json`의 featureBuy와 `tools/rtp-sim/feature-buy.json`을 갱신 |
 *
 * featureBuy가 아직 없는 팩을 이름으로 주면 대표 보너스를 추정해(코인 리스핀 → 말판 → 룰렛 → 주문 → 프리스핀) 잰다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseGameMath } from '@tgslot/slot-engine'
import type { FeatureBuyTrigger, GameMath } from '@tgslot/slot-engine'
import { findWorkspaceRoot, listGamePackDirs, readJson } from './paths.js'
import {
  benchFeatureBuySearch,
  estimateFeatureBuy,
  mathHash,
  suggestPrice,
  type FeatureBuyBaseline,
} from './featureBuy.js'

export const BASELINE_FILE = 'tools/rtp-sim/feature-buy.json'

function inferTrigger(math: GameMath): FeatureBuyTrigger | null {
  if (math.coinRespin) return 'coinRespin'
  if (math.boardBonus) return 'boardBonus'
  if (math.stageRoulette) return 'stageRoulette'
  if (math.orderRound) return 'orderRound'
  if (math.scatter?.freeSpins || math.growBoard || math.frostRespin) return 'freeSpins'
  return null
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback
}

function writeMathFeatureBuy(file: string, price: number, trigger: FeatureBuyTrigger): void {
  const text = readFileSync(file, 'utf8')
  const line = `  "featureBuy": { "price": ${price}, "trigger": "${trigger}" },`
  const next = /^ {2}"featureBuy": .*$/m.test(text)
    ? text.replace(/^ {2}"featureBuy": .*$/m, line)
    : text.replace(/^ {2}"betLevels"/m, `${line}\n  "betLevels"`)
  if (next === text && !text.includes(line)) throw new Error(`${file}: featureBuy를 넣을 자리를 못 찾았다`)
  writeFileSync(file, next)
}

function main(): void {
  const root = findWorkspaceRoot()
  const flags = new Set(['--entries', '--cont', '--seed', '--bench'])
  const ids = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !flags.has(all[i - 1] ?? ''))
  const entries = Number(arg('entries', '20000'))
  const continuations = Number(arg('cont', '10'))
  const seed = arg('seed', 'feature-buy')
  const benchSearches = Number(arg('bench', '2000'))
  const write = process.argv.includes('--write')

  const baselinePath = join(root, BASELINE_FILE)
  const baseline: Record<string, FeatureBuyBaseline> = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, FeatureBuyBaseline>)
    : {}

  const dirs = listGamePackDirs().filter((dir) => (ids.length === 0 ? true : ids.includes(basename(dir))))
  console.log('| 게임 | 보너스 | 가격 | 구매 환수율 | 95% 반폭 | 기본 환수율 | E[라운드] | 평균 탐색 | 탐색 ms |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const dir of dirs) {
    const id = basename(dir)
    const raw = readJson(join(dir, 'math.json')) as Record<string, unknown>
    const math = parseGameMath(raw)
    const trigger = math.featureBuy?.trigger ?? (ids.includes(id) ? inferTrigger(math) : null)
    if (trigger === null) continue
    const totalBet = math.betLevels.includes(100) ? 100 : math.betLevels[0]!
    const started = performance.now()
    const est = estimateFeatureBuy(math, trigger, totalBet, { entries, continuations, seed })
    const bench = benchFeatureBuySearch(math, trigger, totalBet, benchSearches)
    const price = write ? suggestPrice(est.meanRoundWin, math.rtpTarget, math.betLevels) : (math.featureBuy?.price ?? suggestPrice(est.meanRoundWin, math.rtpTarget, math.betLevels))
    const buyRtp = est.meanRoundWin / price
    const half = (1.96 * est.stdErr) / price
    console.log(
      `| ${id} | ${trigger} | ${price} | ${(buyRtp * 100).toFixed(2)}% | ±${(half * 100).toFixed(2)}%p | ${(math.rtpTarget * 100).toFixed(1)}% | ${est.meanRoundWin.toFixed(2)}x | ${bench.meanTries.toFixed(1)} | ${bench.meanMs.toFixed(2)} (p99 ${bench.p99Ms.toFixed(1)}) |`,
    )
    console.error(`  ${id}: ${((performance.now() - started) / 1000).toFixed(1)}s`)
    if (write) {
      writeMathFeatureBuy(join(dir, 'math.json'), price, trigger)
      baseline[id] = {
        trigger,
        price,
        totalBet,
        entries,
        continuations,
        meanRoundWin: Number(est.meanRoundWin.toFixed(4)),
        stdErr: Number(est.stdErr.toFixed(4)),
        meanTries: Number(est.meanTries.toFixed(1)),
        meanEntryWin: Number(est.meanEntryWin.toFixed(4)),
        buyRtp: Number(buyRtp.toFixed(4)),
        rtpTarget: math.rtpTarget,
        searchMs: Number(bench.meanMs.toFixed(2)),
        mathHash: mathHash(raw),
      }
      // 병렬로 여러 프로세스를 돌려도 서로 덮어쓰지 않도록 매 게임마다 최신 파일을 다시 읽어 합친다.
      const latest: Record<string, FeatureBuyBaseline> = existsSync(baselinePath)
        ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, FeatureBuyBaseline>)
        : {}
      latest[id] = baseline[id]!
      const sorted = Object.fromEntries(Object.entries(latest).sort(([a], [b]) => a.localeCompare(b)))
      writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`)
    }
  }
}

main()
