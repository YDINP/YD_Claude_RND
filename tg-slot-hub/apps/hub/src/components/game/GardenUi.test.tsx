import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RendererEvent } from '@tgslot/renderer'
import { parseGameMath, type GameMath } from '@tgslot/slot-engine'
import { t } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { gardenBaseView, type GardenView } from '../../store/garden'
import { ceremonyFor, withGardenPopup } from '../../game/roundFlow'
import { gardenSoundFor, playGardenEventSound } from '../../lib/gardenSfx'
import { specLabel } from '../GameCard'
import { GardenHelp } from './GardenHelp'
import { GardenHud } from './GardenMeter'
import { RoundPopupView } from './RoundPopup'

vi.mock('../../lib/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/audio')>()
  return {
    ...actual,
    playCascadePop: vi.fn(),
    playCascadeDrop: vi.fn(),
    playLadderUp: vi.fn(),
    playFeature: vi.fn(),
    playCountUp: vi.fn(),
    playRollupEnd: vi.fn(),
    stopCountUp: vi.fn(),
  }
})

function loadMath(): GameMath {
  const path = resolve(process.cwd(), '..', '..', 'games', 'greenhouse-garden', 'math.json')
  return parseGameMath(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

const math = loadMath()
const view = (over: Partial<GardenView> = {}): GardenView => ({ ...gardenBaseView(math), ...over })

beforeEach(() => {
  useSettingsStore.setState({ locale: 'ko' })
})
afterEach(() => cleanup())

describe('GardenHud', () => {
  it('목표 띠와 성장 막대를 보여 준다(크기 배지·«다음 크기까지 n칸»)', () => {
    render(<GardenHud math={math} view={view({ popped: 4 })} />)
    expect(screen.getByText(t('ko', 'gardenRibbonGoal', { count: math.growBoard?.bonus.trigger ?? 3 }))).toBeInTheDocument()
    expect(screen.getByText('4×4')).toBeInTheDocument()
    expect(screen.getByText(t('ko', 'gardenMeterNext', { n: 6 }))).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
  })

  it('1칸 남으면 느낌표 문구, 프리스핀 8×8에서는 «햇살까지»', () => {
    const { rerender } = render(<GardenHud math={math} view={view({ popped: 9 })} />)
    expect(screen.getByText(t('ko', 'gardenMeterNextOne'))).toBeInTheDocument()
    const thresholds = math.growBoard?.bonus.thresholds as number[]
    const every = math.growBoard?.bonus.sunEvery as number
    rerender(
      <GardenHud
        math={math}
        hideGoal
        view={view({ size: 8, round: true, thresholds, sunEvery: every, popped: (thresholds[3] as number) + 4 })}
      />,
    )
    expect(screen.getByText(t('ko', 'gardenMeterSun', { n: every - 4 }))).toBeInTheDocument()
    // 프리스핀 중에는 목표 띠를 숨긴다.
    expect(screen.queryByText(t('ko', 'gardenRibbonGoal', { count: 3 }))).not.toBeInTheDocument()
  })

  it('정원 팩이 아니면 아무것도 그리지 않는다', () => {
    const plain = { ...math, growBoard: undefined } as unknown as GameMath
    const { container } = render(<GardenHud math={plain} view={view()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('GardenHelp', () => {
  it('네 장 탭이 있고 숫자는 math.json에서 읽는다', () => {
    render(<GardenHelp math={math} locale="ko" />)
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByText(t('ko', 'gardenHelpFlowersRule', { min: math.cluster?.minCluster ?? 5 }))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: t('ko', 'gardenHelpTabGrow') }))
    for (const threshold of math.growBoard?.thresholds ?? []) {
      expect(screen.getAllByText(new RegExp(`터진 칸 ${threshold}`)).length).toBeGreaterThan(0)
    }
    fireEvent.click(screen.getByRole('tab', { name: t('ko', 'gardenHelpTabSeed') }))
    for (const value of math.growBoard?.seedTiers ?? []) expect(screen.getByText(`×${value}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: t('ko', 'gardenHelpTabBonus') }))
    const bonus = math.growBoard?.bonus
    expect(
      screen.getByText(t('ko', 'gardenHelpBonusSun', { n: bonus?.sunEvery ?? 0, max: bonus?.maxSunsPerSpin ?? 0, plant: bonus?.sunPlant ?? 0 })),
    ).toBeInTheDocument()
    expect(screen.getByText(t('ko', 'gardenHelpMaxWin', { cap: (math.round?.maxWinCap ?? 0).toLocaleString('en-US') }))).toBeInTheDocument()
  })

  it('격자 그림 칸은 정사각 px로 그려 찌그러지지 않는다', () => {
    const { container } = render(<GardenHelp math={math} locale="ko" />)
    const board = container.querySelector<HTMLElement>('.hub-garden-help__board')
    expect(board).not.toBeNull()
    expect(board?.style.getPropertyValue('--hub-garden-help-cell')).toMatch(/^\d+px$/)
    // 칸 수는 한 변의 제곱이다.
    const size = Number(board?.style.getPropertyValue('--hub-garden-help-size'))
    expect(board?.children).toHaveLength(size * size)
  })

  it('영어 사전에도 같은 키가 있다', () => {
    for (const key of ['gardenHelpTab', 'gardenMeterNext', 'gardenRoundMax', 'gardenCardTagline', 'gardenWinSeed'] as const) {
      expect(t('en', key, { n: 3, size: 5 })).not.toBe(key)
      expect(t('ko', key, { n: 3, size: 5 })).not.toBe(t('en', key, { n: 3, size: 5 }))
    }
  })
})

describe('프리스핀 종료 팝업 요약', () => {
  const exit = ceremonyFor(
    { gameId: 'g', left: 1, total: 10, multiplier: 1, totalBet: 20, accumulatedWin: 100 },
    { freeSpins: null, features: [], totalWin: 40, freeSpinsSummary: { total: 2824, spins: 18, garden: { maxSize: 8, bestSeed: 20, bestSpinWin: 825, topUp: 120 } } },
  )

  it('서버 요약과 베팅 배수를 팝업에 싣는다', () => {
    expect(exit).not.toBeNull()
    const withGarden = withGardenPopup(exit!, { freeSpinsSummary: { total: 2824, spins: 18, garden: { maxSize: 8, bestSeed: 20, bestSpinWin: 825, topUp: 120 } } }, 20)
    expect(withGarden.popup).toMatchObject({ kind: 'freeSpinsExit', garden: { maxSize: 8, bestSeed: 20, bestSpinWin: 825, topUp: 120, betMultiple: 141.2 } })
  })

  it('정원이 아닌 라운드·진입 팝업은 그대로 돌려준다', () => {
    expect(withGardenPopup(exit!, { freeSpinsSummary: { total: 1, spins: 1 } }, 20)).toBe(exit)
    const entry = ceremonyFor(null, { freeSpins: { gameId: 'g', left: 10, total: 10, multiplier: 1, totalBet: 20, accumulatedWin: 0 }, features: [], totalWin: 0 })
    expect(withGardenPopup(entry!, { freeSpinsSummary: { total: 1, spins: 1, garden: { maxSize: 5, bestSeed: 0, bestSpinWin: 0, topUp: 0 } } }, 20)).toBe(entry)
  })

  it('팝업이 4행(+최저 보장)을 그린다', () => {
    const popup = withGardenPopup(exit!, { freeSpinsSummary: { total: 2824, spins: 18, garden: { maxSize: 8, bestSeed: 20, bestSpinWin: 825, topUp: 120 } } }, 20).popup
    render(<RoundPopupView popup={popup} onDismiss={() => undefined} freeSpinsPlayed={18} />)
    expect(screen.getByText(t('ko', 'gardenRoundMultiple', { n: '141.2' }))).toBeInTheDocument()
    expect(screen.getByText(t('ko', 'gardenRoundMax', { size: 8 }))).toBeInTheDocument()
    expect(screen.getByText(t('ko', 'gardenRoundBestSeed', { n: 20 }))).toBeInTheDocument()
    expect(screen.getByText(t('ko', 'gardenRoundBestSpin', { amount: '825' }))).toBeInTheDocument()
    expect(screen.getByText(t('ko', 'gardenRoundTopUp', { amount: '120' }))).toBeInTheDocument()
  })

  it('최저 보장이 없으면 그 줄을 그리지 않는다', () => {
    const popup = withGardenPopup(exit!, { freeSpinsSummary: { total: 2824, spins: 18, garden: { maxSize: 6, bestSeed: 0, bestSpinWin: 90, topUp: 0 } } }, 20).popup
    render(<RoundPopupView popup={popup} onDismiss={() => undefined} freeSpinsPlayed={18} />)
    expect(screen.queryByText(/최저 보장 적용/)).not.toBeInTheDocument()
    expect(screen.queryByText(/가장 큰 씨앗/)).not.toBeInTheDocument()
  })
})

describe('정원 효과음 배선·로비 문구', () => {
  const step = (phase: 'start' | 'end', stepWin: number): RendererEvent => ({
    type: 'gardenStep',
    index: 2,
    total: 3,
    phase,
    stepWin,
    cumulativeWin: stepWin,
    popped: 5,
    size: 4,
    bloomed: 0,
    seedMultiplier: 1,
    wins: [],
  })

  it('이벤트마다 소리 종류가 정해져 있다', () => {
    expect(gardenSoundFor(step('start', 10))).toBe('pop')
    expect(gardenSoundFor(step('end', 10))).toBe('drop')
    expect(gardenSoundFor(step('start', 0))).toBeNull()
    expect(gardenSoundFor({ type: 'gardenGrow', phase: 'start', from: { x: 2, y: 2, size: 4 }, to: { x: 2, y: 1, size: 5 }, size: 5, newCells: 9, newSeeds: 0, grown: 0, popped: 10 })).toBe('grow')
    expect(gardenSoundFor({ type: 'seedBloom', count: 1, multipliers: [3] })).toBe('bloom')
    expect(gardenSoundFor({ type: 'gardenSun', phase: 'start', grown: 1, planted: 2 })).toBe('sun')
    expect(gardenSoundFor({ type: 'gardenSun', phase: 'end', grown: 1, planted: 2 })).toBeNull()
    expect(gardenSoundFor({ type: 'spinEnd' })).toBeNull()
    expect(playGardenEventSound(step('start', 10))).toBe('pop')
  })

  it('로비 카드는 정원 팩이면 «자라는 정원 · 씨앗 배율»', () => {
    const summary = { id: 'greenhouse-garden', name: { en: 'G' }, thumbnail: '', status: 'live' as const, reels: 8, rows: 8, lines: 0, minBet: 20, maxBet: 1000, sort: 0 }
    expect(specLabel({ ...summary, growBoard: true }, 'ko')).toBe('자라는 정원 · 씨앗 배율')
    expect(specLabel(summary, 'ko')).toContain('8×8')
  })
})
