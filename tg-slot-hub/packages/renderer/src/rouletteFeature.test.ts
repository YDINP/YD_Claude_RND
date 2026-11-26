import { describe, expect, it } from 'vitest'
import {
  featureTriggerCount as engineFeatureTriggerCount,
  type GridPosition,
  type WinLine,
} from '@tgslot/slot-engine'
import type { FeatureTrigger } from '@tgslot/shared'
import { anticipatedReels, featureTriggerCount } from './anticipation.js'
import { findStageRoulette, isStageRouletteTrigger, scatterPositions } from './features.js'
import { buildPresentation, shouldLoopPresentation, type PresentationStep } from './presentation.js'
import { planRouletteHighlight, rouletteHighlightMs } from './rouletteFeature.js'
import { modeTransitionTarget } from './transition.js'
import { loadGameMath } from './testSupport.js'

const roulette = (over: Partial<Extract<FeatureTrigger, { type: 'stageRoulette' }>> = {}): FeatureTrigger => ({
  type: 'stageRoulette',
  bonusCount: 3,
  positions: [
    [0, 1],
    [2, 0],
    [4, 3],
  ],
  cheer: 2,
  cheerPositions: [
    [1, 0],
    [3, 2],
  ],
  lit: [[5, 1], [4, 2], [2, 4]],
  startRing: 0,
  steps: [{ ring: 0, segment: 5, kind: 'coin', lit: true, win: 1200, encoreCounted: false, songsLeft: 2 }],
  total: 1200,
  endedBy: 'songs',
  ...over,
})

const waysWin: WinLine = {
  line: -1,
  symbol: 'idol_pink',
  count: 3,
  multiplier: 26,
  win: 520,
  positions: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  ways: 1,
  payKind: 'ways',
}

describe('피처 구분', () => {
  it('무대 룰렛 트리거를 찾는다', () => {
    const feature = roulette()
    expect(isStageRouletteTrigger(feature)).toBe(true)
    expect(findStageRoulette([feature])).toBe(feature)
    expect(findStageRoulette([])).toBeNull()
    expect(findStageRoulette()).toBeNull()
  })

  it('룰렛 초대권은 스캐터 배당 좌표에 섞이지 않는다', () => {
    expect(scatterPositions([roulette()])).toEqual([])
  })
})

describe('planRouletteHighlight', () => {
  const feature = roulette()

  it('초대권 → 응원봉 순서로 두 단계다', () => {
    const steps = planRouletteHighlight(feature as never)
    expect(steps.map((s) => s.stage)).toEqual(['pass', 'cheer'])
    expect(steps[0]?.positions).toEqual([
      [0, 1],
      [2, 0],
      [4, 3],
    ])
    expect(steps[1]?.positions).toEqual([
      [1, 0],
      [3, 2],
    ])
  })

  it('길이는 기획 §7-2 표 그대로다', () => {
    const f = feature as never
    expect(planRouletteHighlight(f, { speed: 'normal' }).map((s) => s.durationMs)).toEqual([900, 700])
    expect(planRouletteHighlight(f, { speed: 'quick' }).map((s) => s.durationMs)).toEqual([700, 500])
    expect(planRouletteHighlight(f, { speed: 'turbo' }).map((s) => s.durationMs)).toEqual([450, 300])
    expect(planRouletteHighlight(f, { reducedMotion: true }).map((s) => s.durationMs)).toEqual([300, 0])
  })

  it('응원봉이 없으면 응원봉 단계가 없다', () => {
    const steps = planRouletteHighlight(roulette({ cheer: 0, cheerPositions: [] }) as never)
    expect(steps.map((s) => s.stage)).toEqual(['pass'])
  })

  it('입력 좌표를 복사한다(원본을 바꾸지 않는다)', () => {
    const steps = planRouletteHighlight(feature as never)
    const first = steps[0]?.positions[0] as GridPosition
    first[0] = 99
    expect((feature as { positions: GridPosition[] }).positions[0]?.[0]).toBe(0)
  })

  it('전체 길이는 단계 합이다', () => {
    expect(rouletteHighlightMs(planRouletteHighlight(feature as never))).toBe(1600)
  })
})

describe('buildPresentation — 무대 룰렛', () => {
  const math = loadGameMath('idol-stage-live')

  function phases(steps: PresentationStep[]): string[] {
    return steps.map((s) => (s.phase === 'roulette' ? `roulette:${s.stage}` : s.phase))
  }

  it('brief는 A단계 → 초대권 → 응원봉에서 끝나고 B단계 라인은 없다', () => {
    const steps = buildPresentation([waysWin], math, {
      totalBet: 100,
      features: [roulette()],
      presentation: 'brief',
    })
    expect(phases(steps)).toEqual(['all', 'roulette:pass', 'roulette:cheer'])
  })

  it('룰렛 스핀은 한 바퀴만 돌고(순환 없음) 허브가 brief로 부른다', () => {
    expect(shouldLoopPresentation({ presentation: 'brief' })).toBe(false)
  })

  it('ways 승리가 없으면(룰렛만) 0원 A단계 없이 곧장 초대권 강조로 간다', () => {
    const steps = buildPresentation([], math, { totalBet: 100, features: [roulette()], presentation: 'brief' })
    expect(phases(steps)).toEqual(['roulette:pass', 'roulette:cheer'])
  })

  it('초대권 칸은 두 단계 모두 밝게 남고 응원봉 칸은 둘째 단계만 갖는다', () => {
    const steps = buildPresentation([waysWin], math, { totalBet: 100, features: [roulette()], presentation: 'brief' })
    const pass = steps.find((s) => s.phase === 'roulette' && s.stage === 'pass')
    const cheer = steps.find((s) => s.phase === 'roulette' && s.stage === 'cheer')
    if (pass?.phase !== 'roulette' || cheer?.phase !== 'roulette') throw new Error('단계가 없다')
    expect(pass.scatters).toHaveLength(3)
    expect(pass.cheer).toEqual([])
    expect(cheer.scatters).toHaveLength(3)
    expect(cheer.cheer).toHaveLength(2)
  })

  it('모션 축소에서는 응원봉 단계가 0ms(칩만)다', () => {
    const steps = buildPresentation([waysWin], math, {
      totalBet: 100,
      features: [roulette()],
      presentation: 'brief',
      reducedMotion: true,
    })
    const durations = steps.filter((s) => s.phase === 'roulette').map((s) => s.durationMs)
    expect(durations).toEqual([300, 0])
  })

  it('룰렛 단계 길이는 스핀 속도를 따른다', () => {
    const turbo = buildPresentation([waysWin], math, {
      totalBet: 100,
      features: [roulette()],
      presentation: 'brief',
      speed: 'turbo',
    })
    expect(turbo.filter((s) => s.phase === 'roulette').map((s) => s.durationMs)).toEqual([450, 300])
  })
})

describe('기대감 · 모드', () => {
  const math = loadGameMath('idol-stage-live')

  it('보너스 트리거 수는 엔진 featureTriggerCount와 같다', () => {
    expect(featureTriggerCount(math)).toBe(3)
    expect(featureTriggerCount(math)).toBe(engineFeatureTriggerCount(math))
  })

  it('초대권 2장이 앞 릴에 서면 남은 릴이 기대감 대상이다', () => {
    const bonus = math.scatter?.symbol as string
    const at = (reel: number): number => math.strips[reel]?.indexOf(bonus) ?? -1
    // 릴 0·1이 초대권 칸에 서고(창에 보임), 나머지는 아무 데나.
    const stops = [at(0), at(1), 0, 0, 0]
    expect(anticipatedReels(math, stops).length).toBeGreaterThan(0)
  })

  it('룰렛 진입·종료도 켜짐/꺼짐 경계에서만 전환한다(hideReels는 전환을 만들지 않는다)', () => {
    const on = { freeSpins: { left: 3, total: 3, multiplier: 1 }, hideReels: true }
    expect(modeTransitionTarget({ freeSpins: null }, on)).toBe('freeSpins')
    expect(modeTransitionTarget(on, { freeSpins: null })).toBe('base')
    expect(modeTransitionTarget(on, { ...on, hideReels: false })).toBeNull()
  })
})
