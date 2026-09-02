import { describe, expect, it } from 'vitest'
import type { WinLine } from '@tgslot/slot-engine'
import {
  PHASE_ALL_BIGWIN_MS,
  PHASE_ALL_MEGA_MS,
  PHASE_ALL_MS,
  PHASE_LINE_MS,
  REDUCED_WIN_CYCLE_MS,
  WIN_TIER_MULTIPLIERS,
} from './constants.js'
import {
  buildPresentation,
  defaultLineLabel,
  phaseAllDurationMs,
  presentationCycleMs,
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
  it('1부터 세는 라인 번호와 배당을 보여준다', () => {
    expect(defaultLineLabel(makeWin(0, 1234, 617))).toBe('Line 1 · 1,234')
    expect(defaultLineLabel(makeWin(4, 20, 10))).toBe('Line 5 · 20')
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
