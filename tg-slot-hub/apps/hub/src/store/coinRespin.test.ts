import { describe, expect, it } from 'vitest'
import type { RendererEvent } from '@tgslot/renderer'
import { INITIAL_RESPIN_VIEW, isRespinEvent, reduceRespinView, useCoinRespinStore, type RespinView } from './coinRespin'

const coin = (amount: number, tier?: 'small' | 'medium' | 'large') => ({
  pos: [0, 0] as [number, number],
  kind: tier === undefined ? ('bet' as const) : ('treasure' as const),
  value: 1,
  amount,
  ...(tier === undefined ? {} : { tier }),
})

function run(events: RendererEvent[]): RespinView {
  return events.reduce(reduceRespinView, INITIAL_RESPIN_VIEW)
}

const START: RendererEvent = { type: 'respinStart', respins: 3, coinTotal: 600, empty: 9, treasures: [] }

const step = (
  phase: 'start' | 'land' | 'pin' | 'end',
  extra: Partial<Extract<RendererEvent, { type: 'respinStep' }>> = {},
): RendererEvent => ({
  type: 'respinStep',
  index: 0,
  total: 3,
  phase,
  last: false,
  left: 3,
  empty: 9,
  newCoins: [],
  coinTotal: 600,
  treasures: [],
  ...extra,
})

describe('코인 리스핀 표시 상태', () => {
  it('시작하면 HUD가 켜지고 횟수가 가득 찬다', () => {
    const view = run([START])
    expect(view.active).toBe(true)
    expect(view.left).toBe(3)
    expect(view.respins).toBe(3)
    expect(view.coinTotal).toBe(600)
    expect(view.empty).toBe(9)
  })

  it('헛돈 리스핀은 칸이 선 순간 점 하나가 빠진다', () => {
    const view = run([START, step('start'), step('land', { left: 2, empty: 9 })])
    expect(view.left).toBe(2)
    expect(view.coinTotal).toBe(600)
  })

  it('새 코인이 붙는 리스핀은 land에서 아직 아무것도 올리지 않고 pin에서 올린다', () => {
    const coins = [coin(200)]
    const landed = run([START, step('start'), step('land', { newCoins: coins, left: 3, coinTotal: 800, empty: 8 })])
    expect(landed.coinTotal).toBe(600)
    expect(landed.empty).toBe(9)
    const pinned = reduceRespinView(landed, step('pin', { newCoins: coins, left: 3, coinTotal: 800, empty: 8 }))
    expect(pinned.coinTotal).toBe(800)
    expect(pinned.empty).toBe(8)
    expect(pinned.left).toBe(3)
  })

  it('마지막 리스핀은 start에서 켜지고 end에서 꺼진다', () => {
    const view = run([START, step('start', { last: true })])
    expect(view.last).toBe(true)
    expect(reduceRespinView(view, step('end', { last: true })).last).toBe(false)
  })

  it('감기는 전후 합의 차만큼만 합계에 더한다', () => {
    const wrap = (phase: 'start' | 'end'): RendererEvent => ({
      type: 'columnWrap',
      reel: 2,
      phase,
      entry: false,
      before: [100, 200, 2000],
      after: [200, 400, 2000],
    })
    const mid = run([START, wrap('start')])
    expect(mid.wrapping).toBe(2)
    expect(mid.coinTotal).toBe(600)
    const done = reduceRespinView(mid, wrap('end'))
    expect(done.wrapping).toBeNull()
    expect(done.coinTotal).toBe(900)
  })

  it('보물은 판에 나오면 «등장», 정산에서 «지급»으로 켜진다', () => {
    const view = run([
      START,
      step('start'),
      step('pin', { newCoins: [coin(2000, 'small')], treasures: ['small'], coinTotal: 2600, left: 3, empty: 8 }),
    ])
    expect(view.seen).toEqual(['small'])
    expect(view.paid).toEqual([])
    const paid = reduceRespinView(view, {
      type: 'respinCollect',
      index: 0,
      total: 7,
      cell: coin(2000, 'small'),
      running: 2000,
    })
    expect(paid.paid).toEqual(['small'])
    expect(paid.collected).toBe(2000)
  })

  it('등장한 보물은 단계 순서로 정렬된다', () => {
    const view = run([
      { ...START, treasures: ['large'] } as RendererEvent,
      step('pin', { treasures: ['small', 'large'], left: 3 }),
    ])
    expect(view.seen).toEqual(['small', 'large'])
  })

  it('15칸 정산이 끝나면 최고 보물이 지급 표시가 된다', () => {
    const view = run([
      START,
      { type: 'respinTop', amount: 100000, phase: 'start' },
      { type: 'respinEnd', coinWin: 5000, topWin: 100000, full: true },
    ])
    expect(view.topPaid).toBe(true)
    expect(view.collected).toBe(105000)
    expect(view.phase).toBe('done')
  })

  it('복귀 전환이 덮은 순간 HUD는 꺼지지만 지급 표시는 남는다', () => {
    const view = run([
      START,
      { type: 'respinCollect', index: 0, total: 1, cell: coin(2000, 'small'), running: 2000 },
      { type: 'modeTransition', to: 'base', phase: 'start' },
    ])
    expect(view.active).toBe(false)
    expect(view.paid).toEqual(['small'])
  })

  it('프리스핀 진입 전환은 건드리지 않는다', () => {
    expect(isRespinEvent({ type: 'modeTransition', to: 'freeSpins', phase: 'start' })).toBe(false)
    expect(isRespinEvent({ type: 'reelStop', reel: 0 })).toBe(false)
    expect(isRespinEvent({ type: 'respinEnd', coinWin: 0, topWin: 0, full: false })).toBe(true)
  })

  it('입력을 바꾸지 않는다', () => {
    const before = JSON.stringify(INITIAL_RESPIN_VIEW)
    run([START, step('pin', { treasures: ['small'] })])
    expect(JSON.stringify(INITIAL_RESPIN_VIEW)).toBe(before)
  })

  it('스토어: 이벤트를 접고 reset으로 비운다', () => {
    const store = useCoinRespinStore
    store.getState().reset()
    store.getState().apply(START)
    expect(store.getState().view.active).toBe(true)
    store.getState().apply({ type: 'reelStop', reel: 1 })
    expect(store.getState().view.active).toBe(true)
    store.getState().reset()
    expect(store.getState().view).toEqual(INITIAL_RESPIN_VIEW)
  })
})

describe('최고 보물 연출', () => {
  it('상자가 뜨는 순간 누적에 더하고 띠 칸을 키우며, 끝나면 칸만 돌아온다', () => {
    let view: RespinView = { ...INITIAL_RESPIN_VIEW, active: true, phase: 'collecting', collected: 1760 }
    view = reduceRespinView(view, { type: 'respinTop', amount: 20000, phase: 'start' })
    expect(view.topShowing).toBe(true)
    expect(view.topPaid).toBe(true)
    expect(view.collected).toBe(21760)
    view = reduceRespinView(view, { type: 'respinTop', amount: 20000, phase: 'end' })
    expect(view.topShowing).toBe(false)
    expect(view.topPaid).toBe(true)
    view = reduceRespinView(view, { type: 'respinEnd', coinWin: 1760, topWin: 20000, full: true })
    expect(view.collected).toBe(21760)
  })
})
