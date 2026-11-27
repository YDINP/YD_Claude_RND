import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { safeParseGameMath } from './schema.js'
import { isAnalytic } from './analytic.js'
import { gardenMaxSpins, gardenMinStripLength } from './gardenSchema.js'

const raw = JSON.parse(readFileSync(new URL('../../../games/greenhouse-garden/math.json', import.meta.url), 'utf8')) as Record<string, any>

function withGrow(patch: (math: Record<string, any>) => void): ReturnType<typeof safeParseGameMath> {
  const math = structuredClone(raw)
  patch(math)
  return safeParseGameMath(math)
}

function messages(result: ReturnType<typeof safeParseGameMath>): string {
  return result.success ? '' : result.error.issues.map((issue) => issue.message).join('\n')
}

describe('growBoard 스키마', () => {
  it('greenhouse-garden 팩이 통과하고 몬테카를로 전용 모델로 분류된다', () => {
    const parsed = safeParseGameMath(raw)
    expect(messages(parsed)).toBe('')
    expect(parsed.success && isAnalytic(parsed.data)).toBe(false)
  })

  it('스트립이 maxSize + maxCascades × maxSize보다 짧으면 거절한다(리필이 덮인 화분과 겹침)', () => {
    expect(gardenMinStripLength(raw.growBoard)).toBe(8 + 16 * 8)
    const short = withGrow((math) => {
      math.strips[0] = math.strips[0].slice(0, 100)
    })
    expect(messages(short)).toMatch(/리필이 덮인 화분과 겹칠 수 있다/)
  })

  it('bonus.strips 릴 길이가 기본 스트립과 다르면 거절한다', () => {
    const bad = withGrow((math) => {
      math.growBoard.bonus.strips[3] = [...math.growBoard.bonus.strips[3], 'clover']
    })
    expect(messages(bad)).toMatch(/bonus\.strips 릴 3 길이/)
  })

  it('cascade·scatter.freeSpins와 함께 둘 수 없고, reels = rows = 8이어야 한다', () => {
    const cascade = withGrow((math) => {
      math.cascade = { enabled: true, maxCascades: 12, refill: 'gravity', source: 'strip-pull', multiplierLadder: [1] }
    })
    expect(messages(cascade)).toMatch(/growBoard와 cascade/)
    const freeSpins = withGrow((math) => {
      math.scatter.freeSpins = { trigger: 3, count: 8, multiplier: 1, retrigger: true }
    })
    expect(messages(freeSpins)).toMatch(/scatter\.freeSpins/)
    const shape = withGrow((math) => {
      math.rows = 6
    })
    expect(messages(shape)).toMatch(/reels = rows = maxSize/)
  })

  it('문턱·등급은 오름차순, 씨앗 표 등급은 seedTiers 안이어야 한다', () => {
    const thresholds = withGrow((math) => {
      math.growBoard.thresholds = [10, 30, 20, 40]
    })
    expect(messages(thresholds)).toMatch(/thresholds는 오름차순/)
    const tier = withGrow((math) => {
      math.growBoard.seedTable.push({ tier: 9, weight: 1 })
    })
    expect(messages(tier)).toMatch(/seedTiers 길이/)
  })

  it('최장 프리스핀은 spinsByCount 최대 + 리트리거 × 횟수(20)다', () => {
    expect(gardenMaxSpins(raw.growBoard)).toBe(20)
  })
})
