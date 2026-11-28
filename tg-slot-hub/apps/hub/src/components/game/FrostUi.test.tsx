import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSeededRng, parseGameMath, spin, type FrostChainTrigger, type GameMath, type RoundState } from '@tgslot/slot-engine'
import type { RendererEvent } from '@tgslot/renderer'
import { findFrostChain, frostHoldCoins, frostPlayInput } from '../../game/frostFlow'
import { INITIAL_FROST_VIEW, reduceFrostView, useFrostStore, type FrostView } from '../../store/frost'
import { buildSpinToOptions } from '../../store/game'
import { useSettingsStore } from '../../store/settings'
import { AuroraBands } from './AuroraBands'
import { DiamondBoardHelp, FrostFeatureHelp, FrostPaytableSpecials } from './DiamondHelp'
import { FrostLayer, formatMultiple, nextBonusMultiple } from './FrostLayer'
import { FrostSummary, formatBetMultiple } from './FrostSummary'

function loadMath(gameId: string): GameMath {
  const path = resolve(process.cwd(), '..', '..', 'games', gameId, 'math.json')
  return parseGameMath(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

const aurora = loadMath('aurora-ice-palace')
const plain = loadMath('classic-777')

type FrostEvent = Extract<RendererEvent, { type: 'frostStart' | 'frostStep' | 'frostEnd' }>

const start = (over: Partial<Extract<FrostEvent, { type: 'frostStart' }>> = {}): FrostEvent => ({
  type: 'frostStart',
  phase: 'start',
  target: 'bear',
  tier: 'high',
  count: 5,
  nextThreshold: 6,
  positions: [],
  ...over,
})
const step = (over: Partial<Extract<FrostEvent, { type: 'frostStep' }>> = {}): FrostEvent => ({
  type: 'frostStep',
  phase: 'land',
  index: 0,
  total: 3,
  newlyFrozen: [],
  count: 8,
  crossed: [6],
  nextThreshold: 9,
  ...over,
})
const end = (over: Partial<Extract<FrostEvent, { type: 'frostEnd' }>> = {}): FrostEvent => ({
  type: 'frostEnd',
  phase: 'start',
  count: 12,
  bonusMultiple: 5.92,
  auroraMultiplier: 2,
  auroraBefore: 0,
  auroraAfter: 1,
  auroraUp: true,
  bonus: 590,
  palace: false,
  quiet: false,
  ...over,
})

beforeEach(() => {
  useSettingsStore.setState({ locale: 'ko' })
  useFrostStore.getState().resetRound()
})

afterEach(() => {
  cleanup()
})

describe('reduceFrostView — 서버 이벤트를 표시용 진행으로 접는다', () => {
  it('시작은 칸 수를 0부터 다시 세고 눈금을 건다', () => {
    const before: FrostView = { ...INITIAL_FROST_VIEW, count: 14, end: { count: 14, bonusMultiple: 1, auroraMultiplier: 1, bonus: 1, palace: false, quiet: false } }
    const next = reduceFrostView(before, start())
    expect(next).toMatchObject({ active: true, target: 'bear', tier: 'high', count: 0, nextThreshold: 6, end: null })
    // 얼음이 앉는 순간 시작 칸 수가 들어온다
    expect(reduceFrostView(next, start({ phase: 'end' })).count).toBe(5)
  })

  it('눈금을 넘으면 crossedKey가 오른다. 넘지 않으면 그대로다', () => {
    let view = reduceFrostView(INITIAL_FROST_VIEW, start())
    view = reduceFrostView(view, step())
    expect(view).toMatchObject({ count: 8, crossed: [6], crossedKey: 1, nextThreshold: 9 })
    view = reduceFrostView(view, step({ index: 1, count: 8, crossed: [], nextThreshold: 9 }))
    expect(view.crossedKey).toBe(1)
    // start/end 단계는 칸 수를 건드리지 않는다
    expect(reduceFrostView(view, step({ phase: 'start', count: 99 })).count).toBe(8)
  })

  it('끝: 곱셈식 재료와 오로라 단계를 올린다. 오로라가 오르지 않으면 번호가 그대로다', () => {
    const view = reduceFrostView(reduceFrostView(INITIAL_FROST_VIEW, start()), end())
    expect(view).toMatchObject({ showingEnd: true, auroraLevel: 1, auroraRise: 1 })
    expect(view.end).toMatchObject({ count: 12, bonus: 590, auroraMultiplier: 2 })
    const same = reduceFrostView(view, end({ auroraBefore: 1, auroraAfter: 1, auroraUp: false }))
    expect(same.auroraRise).toBe(1)
    expect(reduceFrostView(same, end({ phase: 'end' }))).toMatchObject({ active: false, showingEnd: false })
  })

  it('newSpin은 이번 판 표시만 지우고 오로라는 남긴다. resetRound는 전부 지운다', () => {
    const store = useFrostStore.getState()
    store.apply(start())
    store.apply(end())
    useFrostStore.getState().newSpin()
    expect(useFrostStore.getState().view).toMatchObject({ target: null, count: 0, end: null, auroraLevel: 1 })
    useFrostStore.getState().resetRound()
    expect(useFrostStore.getState().view).toEqual(INITIAL_FROST_VIEW)
  })

  it('얼림이 아닌 이벤트는 무시한다', () => {
    const store = useFrostStore.getState()
    store.apply({ type: 'spinEnd' })
    expect(useFrostStore.getState().view).toEqual(INITIAL_FROST_VIEW)
  })
})

describe('frostFlow — 응답에서 재생 입력을 꺼낸다', () => {
  function sample(): { chain: FrostChainTrigger; grid: string[][] } {
    for (let seed = 1; seed < 4000; seed += 1) {
      const state: RoundState = {
        freeSpinsLeft: 5,
        freeSpinsTotal: 8,
        multiplier: 1,
        carry: { frost: { level: 0, paid: 0, bestCount: 0, bonusTotal: 0 } },
      }
      const result = spin(aurora, { totalBet: 100 }, createSeededRng(`ui-${seed}`), state)
      const chain = result.features.find((f): f is FrostChainTrigger => f.type === 'frostChain')
      if (chain !== undefined) return { chain, grid: result.grid }
    }
    throw new Error('얼림 시료를 못 찾았다')
  }

  it('findFrostChain / frostPlayInput / frostHoldCoins', () => {
    const { chain, grid } = sample()
    const features = [chain] as never
    expect(findFrostChain(features)).toBe(chain)
    const input = frostPlayInput({ grid }, chain as never, aurora)
    expect(input.thresholds).toEqual(aurora.frostRespin?.thresholds)
    expect(input.grid).toBe(grid)
    expect('type' in input.chain).toBe(false)
    expect(frostHoldCoins(features, true)).toBe(chain.bonus)
    // 렌더러가 없으면 덜어 둘 것도 없다
    expect(frostHoldCoins(features, false)).toBe(0)
    expect(frostHoldCoins([] as never, true)).toBe(0)
  })
})

describe('buildSpinToOptions — 얼림 팩', () => {
  const base = {
    stops: [0, 0, 0, 0, 0],
    isFreeSpin: false,
    gridBefore: undefined,
    mutations: [],
    features: [],
    wins: [],
  } as never

  it('얼림 팩이면 프리스핀 여부를 렌더러에 알린다. 아니면 기존 그대로 undefined', () => {
    expect(buildSpinToOptions(base, aurora)).toEqual({ frost: { freeSpin: false } })
    expect(buildSpinToOptions({ ...(base as object), isFreeSpin: true } as never, aurora)).toEqual({
      fast: true,
      frost: { freeSpin: true },
    })
    expect(buildSpinToOptions(base, plain)).toBeUndefined()
    expect(buildSpinToOptions(base)).toBeUndefined()
  })
})

describe('FrostLayer', () => {
  it('기본 판은 «구슬 3개 → 프리스핀 8~12회» 안내 띠', () => {
    render(<FrostLayer math={aurora} locale="ko" inFreeSpins={false} carryLevel={0} />)
    expect(screen.getByText('스캐터 3개 → 얼려 두기 프리스핀 8~12회')).toBeInTheDocument()
    expect(screen.queryByText('오로라')).not.toBeInTheDocument()
  })

  it('얼림이 없는 게임에는 아무것도 그리지 않는다', () => {
    const { container } = render(<FrostLayer math={plain} locale="ko" inFreeSpins carryLevel={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('프리스핀: 칸 수·눈금·다음 보너스·오로라 4단', () => {
    render(<FrostLayer math={aurora} locale="ko" inFreeSpins carryLevel={1} />)
    expect(screen.getByText('당첨금이 가장 큰 그림이 얼어요')).toBeInTheDocument()
    act(() => {
      useFrostStore.getState().apply(start())
      useFrostStore.getState().apply(start({ phase: 'end' }))
      useFrostStore.getState().apply(step({ count: 8, crossed: [6], nextThreshold: 9 }))
    })
    expect(screen.getByText('8칸')).toBeInTheDocument()
    const bonus = aurora.frostRespin!.bonus.high[1]
    expect(screen.getByText(`9칸이면 ×${formatMultiple(bonus ?? 0)}`)).toBeInTheDocument()
    // 서버 이월 오로라 1단계 = ×2까지 점등
    const aria = screen.getByRole('img', { name: /오로라 2단계/ })
    expect(aria.querySelectorAll('[data-lit="true"]')).toHaveLength(2)
  })

  it('끝: 곱셈식. 보너스 0은 «이번엔 보너스 없음»', () => {
    render(<FrostLayer math={aurora} locale="ko" inFreeSpins carryLevel={0} />)
    act(() => {
      useFrostStore.getState().apply(start())
      useFrostStore.getState().apply(end())
    })
    expect(screen.getByText('×5.92 × 오로라 ×2 = 11.84배')).toBeInTheDocument()
    act(() => {
      useFrostStore.getState().apply(start())
      useFrostStore.getState().apply(end({ bonus: 0, bonusMultiple: 0, auroraUp: false, auroraAfter: 0, auroraMultiplier: 1, quiet: true }))
    })
    expect(screen.getByText('이번엔 보너스 없음')).toBeInTheDocument()
  })

  it('오로라 ×1이면 같은 값을 되풀이하지 않고 «얼음 보너스 N배»만', () => {
    render(<FrostLayer math={aurora} locale="ko" inFreeSpins carryLevel={0} />)
    act(() => {
      useFrostStore.getState().apply(start())
      useFrostStore.getState().apply(end({ bonusMultiple: 3.26, auroraMultiplier: 1, auroraUp: false, auroraAfter: 0, bonus: 163 }))
    })
    expect(screen.getByText('얼음 보너스 3.26배')).toBeInTheDocument()
    expect(screen.queryByText(/×3.26 = 3.26배/)).not.toBeInTheDocument()
  })

  it('다음 보너스는 보너스표에서 읽는다', () => {
    expect(nextBonusMultiple(aurora, { tier: 'high', nextThreshold: 6 })).toBe(aurora.frostRespin!.bonus.high[0])
    expect(nextBonusMultiple(aurora, { tier: null, nextThreshold: 6 })).toBeNull()
    expect(nextBonusMultiple(aurora, { tier: 'low', nextThreshold: null })).toBeNull()
    expect(nextBonusMultiple(plain, { tier: 'low', nextThreshold: 6 })).toBeNull()
  })
})

describe('AuroraBands', () => {
  it('단계까지 점등하고 범위를 넘는 값은 끝 단계로 맞춘다', () => {
    render(<AuroraBands ladder={[1, 2, 3, 5]} level={9} rise={0} />)
    const root = screen.getByRole('img')
    expect(root.querySelectorAll('[data-lit="true"]')).toHaveLength(4)
    expect(root.querySelector('[data-current="true"]')?.textContent).toBe('×5')
  })
})

describe('도움말 · 결과 요약', () => {
  it('판과 지급: 마름모 그림은 정사각 칸이고 가운데 규칙을 말한다', () => {
    const { container } = render(<DiamondBoardHelp math={aurora} />)
    expect(screen.getByText(/가운데 릴에서 시작해/)).toBeInTheDocument()
    expect(screen.getByText(/2 × 1 × 3 = 6길/)).toBeInTheDocument()
    // 보드는 19칸, 높이 4 릴이 가운데 정렬
    const board = container.querySelector('.hub-diamond-help__board')
    expect(board?.querySelectorAll('.hub-diamond-help__cell')).toHaveLength(19)
    expect(screen.getByText('3·4·5·4·3')).toBeInTheDocument()
  })

  it('얼려 두기: 보너스표는 math.json 값 그대로, 최대 당첨은 상한', () => {
    render(<FrostFeatureHelp math={aurora} />)
    const config = aurora.frostRespin!
    expect(screen.getAllByRole('columnheader')).toHaveLength(config.thresholds.length + 1)
    expect(screen.getByText(`×${config.bonus.high[0]}`)).toBeInTheDocument()
    expect(screen.getByText(/2,500배/)).toBeInTheDocument()
    expect(screen.getByText('다시 돌리기 중에 생긴 다른 당첨은 지급하지 않아요.')).toBeInTheDocument()
  })

  it('배당표 맨 위: 육각 얼음(와일드)과 스캐터를 그림과 쉬운 말로', () => {
    render(<FrostPaytableSpecials math={aurora} symbols={{ wild: 'wild.png', scatter: 'orb.png' }} />)
    expect(screen.getByAltText('육각 얼음')).toHaveAttribute('src', 'wild.png')
    expect(screen.getByAltText('스캐터')).toHaveAttribute('src', 'orb.png')
    expect(screen.getByText('2·3·4번 릴에만 나와요. 스캐터를 뺀 모든 그림 대신 맞아요.')).toBeInTheDocument()
    expect(screen.getByText('육각 얼음만으로 이어지면 북극곰 배당을 받아요.')).toBeInTheDocument()
    expect(screen.getByText('3개: 베팅의 2.5배 + 8회')).toBeInTheDocument()
    // 피처를 여는 그림은 13종 공용어 «스캐터»로 부른다(2026-11-28 사용자 결정). 와일드는 그림 이름(육각 얼음)으로 둔다.
    expect(screen.queryByText(/와일드/)).not.toBeInTheDocument()
  })

  it('얼려 두기: 얼리는 그림의 정의와 보너스표 «이상» 기준', () => {
    render(<FrostFeatureHelp math={aurora} />)
    expect(screen.getByText(/당첨금이 가장 큰 그림이에요/)).toBeInTheDocument()
    expect(screen.getByText('6칸+')).toBeInTheDocument()
    expect(screen.getByText(/6칸보다 적으면 얼음 보너스가 없어요/)).toBeInTheDocument()
  })

  it('얼림 팩이 아니면 도움말도 비어 있다', () => {
    const { container } = render(<FrostFeatureHelp math={plain} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('결과 요약: 베팅의 N배, 최다 칸, 오로라, 보너스 합계', () => {
    render(<FrostSummary data={{ bestCount: 17, auroraLevel: 2, bonusTotal: 1234, ladder: [1, 2, 3, 5], multipleOfBet: 38.24, spins: 8 }} />)
    expect(screen.getByText('베팅의 38.2배')).toBeInTheDocument()
    expect(screen.getByText('17칸')).toBeInTheDocument()
    expect(screen.getByText('×3')).toBeInTheDocument()
    expect(screen.getByText('+1,234')).toBeInTheDocument()
    expect(screen.getByText('프리스핀 8회')).toBeInTheDocument()
    expect(formatBetMultiple(250.4)).toBe('250')
    expect(formatBetMultiple(0)).toBe('0')
  })
})
