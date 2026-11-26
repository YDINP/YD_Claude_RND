/** 테스트 전용 — 실제 idol-stage-live 팩의 math.json과, 엔진으로 뽑은 룰렛 진입 응답 표본. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSeededRng, parseGameMath, spin, type GameMath } from '@tgslot/slot-engine'
import type { StageRouletteFeature } from '@tgslot/shared'

export function loadIdolMath(): GameMath {
  const path = resolve(process.cwd(), '..', '..', 'games', 'idol-stage-live', 'math.json')
  return parseGameMath(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

export interface RouletteSample {
  seed: string
  totalBet: number
  feature: StageRouletteFeature
  totalWin: number
}

/** 엔진을 시드로 돌려 룰렛에 진입하는 스핀 `count`개를 모은다(평균 약 221스핀에 한 번). */
export function sampleRoulettes(math: GameMath, count: number, seedPrefix = 'idol'): RouletteSample[] {
  const found: RouletteSample[] = []
  for (let n = 0; found.length < count && n < 4_000_000; n += 1) {
    const seed = `${seedPrefix}-${n}`
    const result = spin(math, { totalBet: 100 }, createSeededRng(seed))
    const feature = result.features.find((f) => f.type === 'stageRoulette')
    if (feature !== undefined) {
      found.push({ seed, totalBet: 100, feature: feature as StageRouletteFeature, totalWin: result.totalWin })
    }
  }
  return found
}
