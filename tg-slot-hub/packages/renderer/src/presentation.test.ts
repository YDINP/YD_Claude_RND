import { describe, expect, it } from 'vitest'
import type { WinLine } from '@tgslot/slot-engine'
import type { FeatureTrigger } from '@tgslot/shared'
import {
  PHASE_ALL_BIGWIN_MS,
  PHASE_ALL_MEGA_MS,
  PHASE_ALL_MS,
  PHASE_FEATURE_MS,
  PHASE_LINE_MS,
  REDUCED_WIN_CYCLE_MS,
  WIN_TIER_MULTIPLIERS,
} from './constants.js'
import {
  buildPresentation,
  defaultLineLabel,
  phaseAllDurationMs,
  presentationCycleMs,
  presentationOptionsFor,
} from './presentation.js'
import { loadGameMath } from './testSupport.js'

const math = loadGameMath('classic-777')

function makeWin(line: number, win: number, multiplier: number): WinLine {
  return {
    line,
    symbol: 'seven',
    count: 3,
    multiplier,
    win,
    positions: [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  }
}

describe('buildPresentation', () => {
  it('승리가 없으면 아무것도 하지 않는다', () => {
    expect(buildPresentation([], math)).toEqual([])
  })

  it('A단계가 언제나 맨 앞에 온다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(2, 10, 5)], math, { totalBet: 10 })
    expect(steps[0]?.phase).toBe('all')
  })

  it('A단계 다음에 라인이 하나씩 이어진다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(2, 10, 5)], math, { totalBet: 100 })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'line', 'line'])
  })

  it('라인은 인덱스 순서로 정렬된다', () => {
    const steps = buildPresentation([makeWin(4, 10, 5), makeWin(1, 10, 5), makeWin(2, 10, 5)], math, {
      totalBet: 500,
    })
    const lines = steps.flatMap((step) => (step.phase === 'line' ? [step.win.line] : []))
    expect(lines).toEqual([1, 2, 4])
  })

  it('입력 배열을 건드리지 않는다', () => {
    const wins = [makeWin(4, 10, 5), makeWin(1, 10, 5)]
    buildPresentation(wins, math, { totalBet: 500 })
    expect(wins.map((win) => win.line)).toEqual([4, 1])
  })

  it('승리가 하나면 A단계와 그 라인만 돈다', () => {
    const steps = buildPresentation([makeWin(3, 10, 5)], math, { totalBet: 500 })
    expect(steps).toHaveLength(2)
    expect(steps[0]?.phase).toBe('all')
    expect(steps[1]).toMatchObject({ phase: 'line', durationMs: PHASE_LINE_MS })
  })

  it('A단계는 총배당을 합쳐서 들고 있다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(2, 30, 15)], math, { totalBet: 500 })
    const first = steps[0]
    expect(first?.phase).toBe('all')
    if (first?.phase === 'all') {
      expect(first.totalWin).toBe(50)
      expect(first.wins).toHaveLength(2)
    }
  })

  it('보통 승리의 A단계 길이는 900ms다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5)], math, { totalBet: 500 })
    expect(steps[0]?.durationMs).toBe(PHASE_ALL_MS)
  })

  it('BIG 등급이면 A단계가 길어진다', () => {
    // 총배당 100, 베팅 10 -> 10배 = BIG
    const steps = buildPresentation([makeWin(0, 100, 50)], math, { totalBet: 10 })
    expect(steps[0]?.durationMs).toBe(PHASE_ALL_BIGWIN_MS)
  })

  it('MEGA 이상이면 A단계가 가장 길다', () => {
    // 총배당 200, 베팅 10 -> 20배 = MEGA
    const steps = buildPresentation([makeWin(0, 200, 100)], math, { totalBet: 10 })
    expect(steps[0]?.durationMs).toBe(PHASE_ALL_MEGA_MS)
  })

  it('A단계가 등급을 함께 실어 나른다', () => {
    const steps = buildPresentation([makeWin(0, 1000, 500)], math, { totalBet: 10 })
    const first = steps[0]
    expect(first?.phase).toBe('all')
    if (first?.phase === 'all') expect(first.tier).toBe('max')
  })

  it('라인 스텝은 1400ms다', () => {
    expect(PHASE_LINE_MS).toBe(1400)
  })

  it('한 바퀴 길이는 각 단계의 합이다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, { totalBet: 500 })
    expect(presentationCycleMs(steps)).toBe(PHASE_ALL_MS + PHASE_LINE_MS * 2)
  })
})

describe('buildPresentation 모션 축소', () => {
  it('모든 단계를 짧은 상한으로 자른다', () => {
    const steps = buildPresentation([makeWin(0, 200, 100), makeWin(1, 10, 5)], math, {
      totalBet: 10,
      reducedMotion: true,
    })
    for (const step of steps) {
      expect(step.durationMs).toBeLessThanOrEqual(REDUCED_WIN_CYCLE_MS)
    }
  })

  it('단계 순서는 그대로다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, {
      totalBet: 500,
      reducedMotion: true,
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'line', 'line'])
  })
})

describe('defaultLineLabel', () => {
  it('라인 번호와 심볼 이름과 배당을 보여준다', () => {
    expect(defaultLineLabel(makeWin(0, 1234, 617))).toBe('Line 1 · seven · 1,234')
    expect(defaultLineLabel(makeWin(4, 20, 10))).toBe('Line 5 · seven · 20')
  })

  it('그룹 배당이면 그룹 id를 쓴다', () => {
    // win.symbol이 그룹 id와 같더라도 group 쪽을 우선한다.
    const groupWin = { ...makeWin(2, 60, 30), symbol: 'anybar', group: 'anybar' }
    expect(defaultLineLabel(groupWin)).toBe('Line 3 · anybar · 60')
  })

  it('그룹이 없으면 심볼 id로 되돌아간다', () => {
    const plain = { ...makeWin(1, 40, 20), symbol: 'bell' }
    expect(defaultLineLabel(plain)).toBe('Line 2 · bell · 40')
  })
})

describe('phaseAllDurationMs', () => {
  it('등급이 오를수록 길어지거나 같다', () => {
    const none = phaseAllDurationMs('none')
    const big = phaseAllDurationMs('big')
    const mega = phaseAllDurationMs('mega')
    expect(big).toBeGreaterThan(none)
    expect(mega).toBeGreaterThan(big)
  })

  it('MEGA 이상은 모두 같은 길이다', () => {
    expect(phaseAllDurationMs('epic')).toBe(phaseAllDurationMs('mega'))
    expect(phaseAllDurationMs('max')).toBe(phaseAllDurationMs('mega'))
  })

  it('문서가 정한 값과 일치한다', () => {
    expect(phaseAllDurationMs('none')).toBe(900)
    expect(phaseAllDurationMs('big')).toBe(1600)
    expect(phaseAllDurationMs('mega')).toBe(2200)
  })
})

describe('승리 등급 문턱', () => {
  it('10 / 20 / 50 / 100배다', () => {
    expect(WIN_TIER_MULTIPLIERS).toEqual({ big: 10, mega: 20, epic: 50, max: 100 })
  })
})

describe('피처가 있는 연출', () => {
  const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }
  const scatterWin: FeatureTrigger = {
    type: 'scatterWin',
    symbol: 'scatter',
    count: 3,
    win: 200,
    positions: [
      [0, 0],
      [2, 1],
      [4, 2],
    ],
  }

  it('프리스핀에 걸리면 A단계 바로 뒤에 피처 단계가 낀다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10)], math, {
      totalBet: 500,
      features: [scatterWin, freeSpins],
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'feature', 'line'])
  })

  it('피처 단계는 프리스핀 트리거를 그대로 들고 있다', () => {
    const steps = buildPresentation([], math, { totalBet: 500, features: [scatterWin, freeSpins] })
    const feature = steps.find((step) => step.phase === 'feature')
    expect(feature?.phase).toBe('feature')
    if (feature?.phase === 'feature') expect(feature.feature).toEqual(freeSpins)
  })

  it('피처 단계 길이는 900ms다', () => {
    const steps = buildPresentation([], math, { totalBet: 500, features: [freeSpins] })
    const feature = steps.find((step) => step.phase === 'feature')
    expect(feature?.durationMs).toBe(PHASE_FEATURE_MS)
  })

  it('프리스핀이 없으면 피처 단계도 없다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10)], math, {
      totalBet: 500,
      features: [scatterWin],
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'line'])
  })

  it('모든 스텝이 스캐터 좌표를 함께 들고 다닌다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(1, 20, 10)], math, {
      totalBet: 500,
      features: [scatterWin, freeSpins],
    })
    expect(steps).toHaveLength(4)
    for (const step of steps) {
      expect(step.scatters).toEqual(scatterWin.positions)
    }
  })

  it('라인 승리가 없어도 스캐터만으로 연출이 생긴다', () => {
    const steps = buildPresentation([], math, { totalBet: 500, features: [scatterWin] })
    expect(steps.map((step) => step.phase)).toEqual(['all'])
    expect(steps[0]?.scatters).toHaveLength(3)
  })

  it('라인도 피처도 없으면 아무것도 하지 않는다', () => {
    expect(buildPresentation([], math, { totalBet: 500, features: [] })).toEqual([])
  })

  it('스캐터가 없으면 좌표 목록이 비어 있다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10)], math, { totalBet: 500 })
    expect(steps[0]?.scatters).toEqual([])
  })

  it('모션 축소에서도 피처 단계는 살아 있고 길이만 줄어든다', () => {
    const steps = buildPresentation([], math, {
      totalBet: 500,
      features: [scatterWin, freeSpins],
      reducedMotion: true,
    })
    const feature = steps.find((step) => step.phase === 'feature')
    expect(feature).toBeDefined()
    expect(feature?.durationMs).toBeLessThanOrEqual(REDUCED_WIN_CYCLE_MS)
  })
})

describe('showWins 옵션 전달', () => {
  const scatterWin: FeatureTrigger = {
    type: 'scatterWin',
    symbol: 'scatter',
    count: 3,
    win: 200,
    positions: [[0, 0]],
  }
  const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }

  it('피처를 그대로 넘긴다', () => {
    // 이걸 빠뜨리면 스캐터 링도 피처 단계도 조용히 사라진다.
    const options = presentationOptionsFor({ features: [scatterWin, freeSpins] }, false)
    expect(options.features).toEqual([scatterWin, freeSpins])
  })

  it('베팅액을 그대로 넘긴다', () => {
    expect(presentationOptionsFor({ totalBet: 50 }, false).totalBet).toBe(50)
  })

  it('모션 축소 여부를 함께 싣는다', () => {
    expect(presentationOptionsFor(undefined, true).reducedMotion).toBe(true)
  })

  it('옵션이 없어도 동작한다', () => {
    const options = presentationOptionsFor(undefined, false)
    expect(options.features).toBeUndefined()
    expect(options.totalBet).toBeUndefined()
  })

  it('옮긴 옵션으로 피처 단계가 실제로 생긴다', () => {
    // showWins가 실제로 만드는 계획과 같은 경로다.
    const steps = buildPresentation(
      [],
      math,
      presentationOptionsFor({ totalBet: 500, features: [scatterWin, freeSpins] }, false),
    )
    expect(steps.map((step) => step.phase)).toEqual(['all', 'feature'])
    expect(steps[0]?.scatters).toEqual([[0, 0]])
  })

  it('라인 승리가 없어도 스캐터만으로 연출이 생긴다', () => {
    const steps = buildPresentation(
      [],
      math,
      presentationOptionsFor({ features: [scatterWin] }, false),
    )
    expect(steps.length).toBeGreaterThan(0)
  })
})
