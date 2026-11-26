import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseGameMath, type GameMath } from '@tgslot/slot-engine'
import { t } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { INITIAL_RESPIN_VIEW, useCoinRespinStore, type RespinView } from '../../store/coinRespin'
import { CoinRespinHelp } from './CoinRespinHelp'
import { CoinRespinLayer } from './CoinRespinLayer'
import { FILL_HINT_MAX_EMPTY, RespinHud } from './RespinHud'
import { TreasureRibbon } from './TreasureRibbon'

/** 테스트 전용. vitest는 패키지 루트(apps/hub)를 cwd로 잡으니 두 단계 위가 모노레포 루트다. */
function loadMath(gameId: string): GameMath {
  const path = resolve(process.cwd(), '..', '..', 'games', gameId, 'math.json')
  return parseGameMath(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

const kraken = loadMath('kraken-cove')
const plain = loadMath('classic-777')

const view = (overrides: Partial<RespinView> = {}): RespinView => ({ ...INITIAL_RESPIN_VIEW, ...overrides })

beforeEach(() => {
  useSettingsStore.setState({ locale: 'ko' })
  useCoinRespinStore.getState().reset()
})

afterEach(() => {
  cleanup()
})

describe('TreasureRibbon', () => {
  it('보물 4단을 «지금 베팅 × math.json 배수»로 보여 준다', () => {
    render(<TreasureRibbon math={kraken} bet={20} view={view()} locale="ko" />)
    const chips = screen.getAllByRole('listitem')
    expect(chips).toHaveLength(4)
    const { small, medium, large, top } = kraken.coinRespin!.treasures
    expect(chips[0]).toHaveAttribute('aria-label', expect.stringContaining(String(small * 20)))
    expect(chips[1]).toHaveAttribute('aria-label', expect.stringContaining((medium * 20).toLocaleString('en-US')))
    expect(chips[2]).toHaveAttribute('aria-label', expect.stringContaining((large * 20).toLocaleString('en-US')))
    expect(chips[3]).toHaveAttribute('aria-label', expect.stringContaining((top * 20).toLocaleString('en-US')))
  })

  it('베팅이 바뀌면 금액이 따라 바뀐다', () => {
    const { rerender } = render(<TreasureRibbon math={kraken} bet={20} view={view()} locale="ko" />)
    const small = kraken.coinRespin!.treasures.small
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-label', expect.stringContaining(String(small * 20)))
    rerender(<TreasureRibbon math={kraken} bet={100} view={view()} locale="ko" />)
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute(
      'aria-label',
      expect.stringContaining((small * 100).toLocaleString('en-US')),
    )
  })

  it('나온 단계는 seen, 지급이 확인된 단계는 paid로 표시한다', () => {
    render(
      <TreasureRibbon math={kraken} bet={20} view={view({ seen: ['small', 'medium'], paid: ['medium'], topPaid: true })} locale="ko" />,
    )
    const chips = screen.getAllByRole('listitem')
    expect(chips.map((chip) => chip.getAttribute('data-state'))).toEqual(['seen', 'paid', 'idle', 'paid'])
  })

  it('그림이 있으면 이미지로, 없으면 색 점으로 그린다', () => {
    const { container, rerender } = render(<TreasureRibbon math={kraken} bet={20} view={view()} locale="ko" />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.querySelectorAll('.hub-treasure__dot')).toHaveLength(4)
    rerender(
      <TreasureRibbon
        math={kraken}
        bet={20}
        view={view()}
        locale="ko"
        props={{ 'coin-small': '/a.svg', 'coin-medium': '/b.svg', 'coin-large': '/c.svg', 'treasure-top': '/d.svg' }}
      />,
    )
    expect(container.querySelectorAll('img')).toHaveLength(4)
    expect(container.querySelectorAll('.hub-treasure__dot')).toHaveLength(0)
  })

  it('코인 리스핀이 없는 게임에서는 아무것도 그리지 않는다', () => {
    const { container } = render(<TreasureRibbon math={plain} bet={10} view={view()} locale="ko" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('RespinHud', () => {
  const dots = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('.hub-respin-hud__dot')].map((dot) => dot.getAttribute('data-on') ?? '')

  it('남은 횟수만큼 켜진 점과 꺼진 점을 그린다', () => {
    const { container } = render(<RespinHud view={view({ active: true, respins: 3, left: 2 })} locale="ko" />)
    expect(dots(container)).toEqual(['true', 'true', 'false'])
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', `${t('ko', 'coinRespinLeftLabel')} 2`)
  })

  it('기본 화면에서는 꺼져 있지만 자리는 그대로 있다(높이 고정)', () => {
    const { container } = render(<RespinHud view={view()} locale="ko" />)
    const hud = container.querySelector('.hub-respin-hud')
    expect(hud).not.toBeNull()
    expect(hud).toHaveAttribute('data-on', 'false')
  })

  it('마지막 리스핀이면 «마지막!»이 빈칸 힌트를 가린다', () => {
    render(<RespinHud view={view({ active: true, respins: 3, left: 1, last: true, empty: 2 })} locale="ko" />)
    expect(screen.getByText(t('ko', 'coinRespinLast'))).toBeInTheDocument()
    expect(screen.queryByText(t('ko', 'coinRespinFillLeft', { n: 2 }))).toBeNull()
  })

  it(`빈칸이 ${FILL_HINT_MAX_EMPTY}칸 이하일 때만 «판 채우기까지 N칸»을 띄운다`, () => {
    const { rerender } = render(<RespinHud view={view({ active: true, respins: 3, left: 3, empty: FILL_HINT_MAX_EMPTY })} locale="ko" />)
    expect(screen.getByText(t('ko', 'coinRespinFillLeft', { n: FILL_HINT_MAX_EMPTY }))).toBeInTheDocument()
    rerender(<RespinHud view={view({ active: true, respins: 3, left: 3, empty: FILL_HINT_MAX_EMPTY + 1 })} locale="ko" />)
    expect(screen.queryByText(/판 채우기까지/)).toBeNull()
    rerender(<RespinHud view={view({ active: true, respins: 3, left: 3, empty: 0 })} locale="ko" />)
    expect(screen.queryByText(/판 채우기까지/)).toBeNull()
  })

  it('판이 가득 차면 «판 가득!»을 띄운다', () => {
    render(<RespinHud view={view({ active: true, respins: 3, left: 1, last: true, empty: 0 })} locale="ko" />)
    expect(screen.getByText(t('ko', 'coinRespinBoardFull'))).toBeInTheDocument()
    expect(screen.queryByText(t('ko', 'coinRespinLast'))).toBeNull()
  })

  it('판 위 코인 합계는 HUD에 두지 않는다(WinStrip 한 곳에만 보인다)', () => {
    render(<RespinHud view={view({ active: true, respins: 3, left: 3, coinTotal: 12500 })} locale="ko" />)
    expect(screen.queryByText(/1\.25만/)).toBeNull()
  })
})

describe('CoinRespinLayer', () => {
  it('코인 리스핀이 없는 게임에서는 층 자체가 없다', () => {
    const { container } = render(<CoinRespinLayer math={plain} bet={10} locale="ko" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('보물 띠와 HUD를 함께 올리고, store 값이 바뀌면 따라 바뀐다', () => {
    const { container } = render(<CoinRespinLayer math={kraken} bet={20} locale="ko" />)
    expect(container.querySelector('.hub-treasure')).not.toBeNull()
    expect(container.querySelector('.hub-respin-hud')).toHaveAttribute('data-on', 'false')
    act(() => {
      useCoinRespinStore.setState({ view: view({ active: true, respins: 3, left: 3, empty: 2, coinTotal: 400 }) })
    })
    const hud = container.querySelector('.hub-respin-hud') as HTMLElement
    expect(hud).toHaveAttribute('data-on', 'true')
    expect(within(hud).getByText(t('ko', 'coinRespinFillLeft', { n: 2 }))).toBeInTheDocument()
  })
})

describe('CoinRespinHelp', () => {
  it('여섯 단계를 순서대로 그린다', () => {
    const { container } = render(<CoinRespinHelp math={kraken} bet={20} locale="ko" />)
    const steps = container.querySelectorAll('.hub-respin-help__step')
    expect(steps).toHaveLength(6)
    expect([...container.querySelectorAll('.hub-respin-help__num')].map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('트리거 개수·리스핀 횟수·감기 배수를 math.json에서 읽는다', () => {
    const config = kraken.coinRespin!
    render(<CoinRespinHelp math={kraken} bet={20} locale="ko" />)
    expect(screen.getByText(t('ko', 'coinRespinHelpStep1', { trigger: config.trigger }))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${config.respins}번`))).toBeInTheDocument()
  })

  it('보물 상금표는 지금 베팅 기준 금액이다', () => {
    const { treasures } = kraken.coinRespin!
    const { container, rerender } = render(<CoinRespinHelp math={kraken} bet={20} locale="ko" />)
    const rows = (): string[] =>
      [...container.querySelectorAll('.hub-respin-help__tier-amount')].map((el) => el.textContent ?? '')
    expect(rows()).toHaveLength(4)
    expect(rows()[0]).toBe((treasures.small * 20).toLocaleString('en-US'))
    rerender(<CoinRespinHelp math={kraken} bet={100} locale="ko" />)
    expect(rows()[0]).toBe((treasures.small * 100).toLocaleString('en-US'))
  })

  it('그림 자리는 보조기술에서 숨기고, 영어 문구도 같은 키를 쓴다', () => {
    const { container } = render(<CoinRespinHelp math={kraken} bet={20} locale="en" />)
    expect(container.querySelectorAll('.hub-respin-help__board').length).toBeGreaterThan(0)
    for (const board of container.querySelectorAll('.hub-respin-help__board')) {
      expect(board).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('코인 리스핀이 없는 게임에서는 아무것도 그리지 않는다', () => {
    const { container } = render(<CoinRespinHelp math={plain} bet={10} locale="ko" />)
    expect(container).toBeEmptyDOMElement()
  })
})
