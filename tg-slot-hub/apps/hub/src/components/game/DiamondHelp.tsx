/**
 * 마름모 판 게임(aurora-ice-palace) 도움말 — «판과 지급» 탭과 «얼려 두기 프리스핀» 설명.
 * 숫자는 전부 math.json에서 읽어 와서 문서와 어긋날 수 없다. 칸 그림은 전부 정사각(`aspect-ratio: 1`)이라
 * 페이라인 그림처럼 찌그러지지 않고, 높이 4 릴은 실제 판처럼 반 칸 내려앉는다. 선은 그리지 않고 칸 색칠로 보인다.
 */
import type { ReactNode } from 'react'
import type { GameMath } from '@tgslot/slot-engine'
import { useEffectiveLocale, useT } from '../../i18n'
import { symbolLabel } from '../../game/labels'
import './DiamondHelp.css'

type CellState = 'off' | 'win' | 'ice' | 'hit'

/** 그림 한 장: 릴별로 칸 상태를 담는다. 칸 좌표는 [reel, row] — 판의 실제 좌표와 같다. */
interface Figure {
  /** `[reel, row]` → 상태. 목록에 없으면 'off'. */
  cells: ReadonlyMap<string, CellState>
  /** 맞은 칸에 가운데부터 순서 번호를 매길까. */
  numbered?: boolean
}

const key = (reel: number, row: number): string => `${reel}:${row}`

function figureOf(entries: readonly (readonly [number, number, CellState])[], numbered = false): Figure {
  return { cells: new Map(entries.map(([reel, row, state]) => [key(reel, row), state] as const)), numbered }
}

/** 가운데 릴에서 먼 순서(0=가운데). 같은 거리는 위 칸이 먼저. */
function orderOf(figure: Figure, heights: readonly number[], reel: number, row: number): number | null {
  const mid = (heights.length - 1) / 2
  const list: [number, number, number][] = []
  heights.forEach((h, r) => {
    for (let w = 0; w < h; w += 1) {
      if (figure.cells.get(key(r, w)) === 'win') list.push([Math.abs(r - mid), r, w])
    }
  })
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
  const index = list.findIndex(([, r, w]) => r === reel && w === row)
  return index < 0 ? null : index + 1
}

interface MiniDiamondProps {
  heights: readonly number[]
  figure: Figure
  caption?: string
  small?: boolean
}

/** 마름모 미니 판. 릴을 세로 가운데 정렬한 열로 그려 높이 4 릴이 반 칸 내려앉는다. */
function MiniDiamond({ heights, figure, caption, small = false }: MiniDiamondProps): ReactNode {
  const rows = Math.max(...heights)
  return (
    <figure className={small ? 'hub-diamond-help__figure hub-diamond-help__figure--small' : 'hub-diamond-help__figure'}>
      <div
        className="hub-diamond-help__board"
        style={{ gridTemplateColumns: `repeat(${heights.length}, 1fr)`, aspectRatio: `${heights.length} / ${rows}` }}
        aria-hidden="true"
      >
        {heights.map((h, reel) => (
          <div key={reel} className="hub-diamond-help__reel" style={{ justifyContent: 'center' }}>
            {Array.from({ length: h }, (_, row) => {
              const state = figure.cells.get(key(reel, row)) ?? 'off'
              const order = figure.numbered === true && state === 'win' ? orderOf(figure, heights, reel, row) : null
              return (
                <span key={row} className="hub-diamond-help__cell" data-state={state}>
                  {order !== null ? <b>{order}</b> : null}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      {caption !== undefined && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function heightsOf(math: GameMath): number[] {
  return math.reelHeights !== undefined ? [...math.reelHeights] : Array.from({ length: math.reels }, () => math.rows)
}

interface DiamondHelpProps {
  math: GameMath
  /** 테마 심볼 그림. 없으면 이름만 쓴다. */
  symbols?: Record<string, string> | undefined
}

/** 와일드 그림 id(첫 번째). 없으면 undefined. */
function wildIdOf(math: GameMath): string | undefined {
  return math.symbols.find((symbol) => symbol.wild === true)?.id
}

/** 와일드가 나오는 릴 번호(1부터) «2·3·4». 기본 스트립 기준. */
function wildReelsText(math: GameMath, wildId: string): string {
  return math.strips
    .map((strip, index) => (strip.includes(wildId) ? index + 1 : null))
    .filter((n): n is number => n !== null)
    .join('·')
}

/** 와일드만으로 된 길이 받는 배당의 주인 — 가장 긴 지급이 가장 큰 그림(엔진의 와일드 챔피언과 같다). */
function topPayingSymbol(math: GameMath): string | undefined {
  let best: string | undefined
  let bestPay = -1
  for (const [id, rule] of Object.entries(math.paytable)) {
    const pay = Math.max(...Object.values(rule))
    if (pay > bestPay) {
      best = id
      bestPay = pay
    }
  }
  return best
}

/** 도움말 그림 한 칸. 그림이 없으면 이름 배지. */
function SymbolIcon({ src, label }: { src: string | undefined; label: string }): ReactNode {
  return src !== undefined ? (
    <img className="hub-paytable__symbol-img" src={src} alt={label} width={40} height={40} />
  ) : (
    <span className="hub-paytable__symbol-fallback" aria-hidden="true">
      {label}
    </span>
  )
}

/**
 * «배당표» 탭 맨 위 특수 그림 두 줄 — 와일드(육각 얼음)와 오로라 구슬을 실제 그림과 함께 보여 준다.
 * 판에 비슷한 하위 그림(눈꽃)이 있어 이름만으로는 어떤 그림이 모든 그림을 대신하는지 알 수 없었다.
 */
export function FrostPaytableSpecials({ math, symbols }: DiamondHelpProps): ReactNode {
  const t = useT()
  const locale = useEffectiveLocale()
  const wildId = wildIdOf(math)
  const top = topPayingSymbol(math)
  const scatter = math.scatter
  const spinCounts = math.frostRespin?.freeSpins.counts ?? {}
  const pays = Object.entries(scatter?.pays ?? {})
    .map(([count, pay]) => [Number(count), pay] as const)
    .sort((a, b) => a[0] - b[0])
  return (
    <ul className="hub-paytable__list hub-diamond-help__specials">
      {wildId !== undefined && (
        <li className="hub-paytable__row">
          <SymbolIcon src={symbols?.[wildId]} label={symbolLabel(math, wildId, locale)} />
          <div className="hub-paytable__row-body">
            <span className="hub-paytable__row-label">{symbolLabel(math, wildId, locale)}</span>
            <span className="hub-diamond-help__special-rule">
              {t('auroraPayWildRule', { reels: wildReelsText(math, wildId) })}
            </span>
            {top !== undefined && (
              <span className="hub-diamond-help__special-rule">
                {t('auroraPayWildOnly', { name: symbolLabel(math, wildId, locale), top: symbolLabel(math, top, locale) })}
              </span>
            )}
          </div>
        </li>
      )}
      {scatter !== undefined && math.frostRespin !== undefined && (
        <li className="hub-paytable__row">
          <SymbolIcon src={symbols?.[scatter.symbol]} label={symbolLabel(math, scatter.symbol, locale)} />
          <div className="hub-paytable__row-body">
            <span className="hub-paytable__row-label">{symbolLabel(math, scatter.symbol, locale)}</span>
            <span className="hub-diamond-help__special-rule">
              {t('auroraPayOrbRule', { trigger: math.frostRespin.freeSpins.trigger })}
            </span>
            <div className="hub-paytable__chips">
              {pays.map(([count, pay]) => (
                <span key={count} className="hub-paytable__chip">
                  {t('auroraPayOrbChip', { n: count, pay, spins: spinCounts[count] ?? 0 })}
                </span>
              ))}
            </div>
          </div>
        </li>
      )}
    </ul>
  )
}

/** «판과 지급» 탭. */
export function DiamondBoardHelp({ math, symbols }: DiamondHelpProps): ReactNode {
  const t = useT()
  const locale = useEffectiveLocale()
  const wildId = wildIdOf(math)
  const heights = heightsOf(math)
  const mid = Math.floor(heights.length / 2)
  const pays = math.scatter?.pays ?? {}
  const payList = Object.entries(pays)
    .map(([count, mult]) => [Number(count), mult] as const)
    .sort((a, b) => a[0] - b[0])
  const spinCounts = math.frostRespin?.freeSpins.counts ?? {}
  const spinList = Object.entries(spinCounts)
    .map(([count, spins]) => [Number(count), spins] as const)
    .sort((a, b) => a[0] - b[0])

  const full = figureOf(
    heights.map((_, reel) => [reel, Math.min(reel === mid ? 2 : 1, (heights[reel] ?? 1) - 1), 'win' as const]),
    true,
  )
  const left = figureOf(
    [
      [0, 0, 'win'],
      [0, 2, 'win'],
      [1, 1, 'win'],
      [2, 1, 'win'],
      [2, 2, 'win'],
      [2, 3, 'win'],
    ],
    true,
  )
  const middle = figureOf(
    [
      [1, 1, 'win'],
      [2, 2, 'win'],
      [3, 2, 'win'],
    ],
    true,
  )
  const miss = figureOf([
    [0, 1, 'hit'],
    [1, 1, 'hit'],
    [3, 2, 'hit'],
    [4, 1, 'hit'],
  ])
  const board = figureOf([])

  return (
    <div className="hub-diamond-help">
      <section className="hub-diamond-help__section">
        <h3 className="hub-sheet__subtitle">{t('auroraHelpBoardTitle')}</h3>
        <MiniDiamond heights={heights} figure={board} caption={heights.join('·')} />
        <p className="hub-sheet__message">{t('auroraHelpBoardText')}</p>
      </section>

      <section className="hub-diamond-help__section">
        <div className="hub-diamond-help__figures">
          <MiniDiamond heights={heights} figure={left} caption={t('auroraHelpCapLeft')} small />
          <MiniDiamond heights={heights} figure={middle} caption={t('auroraHelpCapMiddle')} small />
          <MiniDiamond heights={heights} figure={full} caption={t('auroraHelpCapFull')} small />
          <MiniDiamond heights={heights} figure={miss} caption={t('auroraHelpCapMiss')} small />
        </div>
        <p className="hub-sheet__message">{t('auroraHelpOrder')}</p>
        <p className="hub-sheet__message">{t('auroraHelpWaysCount')}</p>
        <p className="hub-sheet__message">{t('auroraHelpOnce')}</p>
      </section>

      <section className="hub-diamond-help__section">
        {wildId !== undefined && (
          <p className="hub-sheet__message hub-diamond-help__icon-line">
            <SymbolIcon src={symbols?.[wildId]} label={symbolLabel(math, wildId, locale)} />
            <span>{t('auroraHelpWild', { name: symbolLabel(math, wildId, locale), reels: wildReelsText(math, wildId) })}</span>
          </p>
        )}
        {payList.length >= 3 && spinList.length >= 3 && (
          <p className="hub-sheet__message hub-diamond-help__icon-line">
            <SymbolIcon src={symbols?.[math.scatter?.symbol ?? '']} label={symbolLabel(math, math.scatter?.symbol ?? '', locale)} />
            <span>
            {t('auroraHelpScatter', {
              p3: payList[0]?.[1] ?? 0,
              p4: payList[1]?.[1] ?? 0,
              p5: payList[2]?.[1] ?? 0,
              f3: spinList[0]?.[1] ?? 0,
              f4: spinList[1]?.[1] ?? 0,
              f5: spinList[2]?.[1] ?? 0,
            })}
            </span>
          </p>
        )}
      </section>
    </div>
  )
}

/** «얼려 두기 프리스핀» 설명: 4컷 만화, 보너스표, 오로라, 리트리거, 최대 당첨. */
export function FrostFeatureHelp({ math }: DiamondHelpProps): ReactNode {
  const t = useT()
  const locale = useEffectiveLocale()
  const wildId = wildIdOf(math)
  const config = math.frostRespin
  if (config === undefined) return null
  const heights = heightsOf(math)

  const step1 = figureOf([
    [1, 1, 'hit'],
    [2, 1, 'hit'],
    [3, 2, 'hit'],
    [2, 3, 'hit'],
    [0, 2, 'hit'],
  ])
  const step2 = figureOf([
    [1, 1, 'ice'],
    [2, 1, 'ice'],
    [3, 2, 'ice'],
    [2, 3, 'ice'],
    [0, 2, 'ice'],
  ])
  const step3 = figureOf([
    [1, 1, 'ice'],
    [2, 1, 'ice'],
    [3, 2, 'ice'],
    [2, 3, 'ice'],
    [0, 2, 'ice'],
    [4, 1, 'ice'],
    [1, 3, 'ice'],
    [2, 4, 'ice'],
  ])
  const step4 = figureOf([
    [0, 0, 'ice'],
    [0, 2, 'ice'],
    [1, 0, 'ice'],
    [1, 1, 'ice'],
    [1, 3, 'ice'],
    [2, 0, 'ice'],
    [2, 1, 'ice'],
    [2, 3, 'ice'],
    [2, 4, 'ice'],
    [3, 2, 'ice'],
    [3, 3, 'ice'],
    [4, 1, 'ice'],
    [4, 2, 'ice'],
  ])

  const tiers = [
    ['high', t('auroraHelpTierHigh')],
    ['mid', t('auroraHelpTierMid')],
    ['low', t('auroraHelpTierLow')],
  ] as const
  const ladder = config.aurora.ladder.slice(1).map((value) => `×${value}`).join(' → ')
  const counts = Object.values(config.freeSpins.counts)

  return (
    <div className="hub-diamond-help">
      <section className="hub-diamond-help__section">
        <h3 className="hub-sheet__subtitle">{t('auroraHelpFreezeTitle')}</h3>
        <ol className="hub-diamond-help__steps">
          <li>
            <span className="hub-diamond-help__step-no">1</span>
            <MiniDiamond heights={heights} figure={step1} caption={t('auroraHelpStep1')} small />
          </li>
          <li>
            <span className="hub-diamond-help__step-no">2</span>
            <MiniDiamond heights={heights} figure={step2} caption={t('auroraHelpStep2')} small />
          </li>
          <li>
            <span className="hub-diamond-help__step-no">3</span>
            <MiniDiamond heights={heights} figure={step3} caption={t('auroraHelpStep3')} small />
          </li>
          <li>
            <span className="hub-diamond-help__step-no">4</span>
            <MiniDiamond heights={heights} figure={step4} caption={t('auroraHelpStep4')} small />
          </li>
        </ol>
        <p className="hub-sheet__message">
          {t('auroraHelpTarget', { wild: wildId === undefined ? '' : symbolLabel(math, wildId, locale) })}
        </p>
        <p className="hub-sheet__message">{t('auroraHelpNoPay')}</p>
      </section>

      <section className="hub-diamond-help__section">
        <h3 className="hub-sheet__subtitle">{t('auroraHelpBonusTitle')}</h3>
        <div className="hub-diamond-help__table-wrap">
          <table className="hub-diamond-help__table">
            <thead>
              <tr>
                <th scope="col">{t('auroraHelpCells')}</th>
                {config.thresholds.map((threshold) => (
                  <th key={threshold} scope="col">
                    {/* 판 전체 칸 수(19)는 «이상»이 없다 — 그보다 많이 얼릴 수 없다. */}
                    {threshold >= heights.reduce((sum, h) => sum + h, 0)
                      ? t('auroraCellCount', { n: threshold })
                      : t('auroraHelpCellsAtLeast', { n: threshold })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map(([tier, name]) => (
                <tr key={tier}>
                  <th scope="row">{name}</th>
                  {config.bonus[tier].map((value, index) => (
                    <td key={index}>×{Math.round(value * 100) / 100}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hub-sheet__message">{t('auroraHelpBonusNote', { min: config.thresholds[0] ?? 0 })}</p>
      </section>

      <section className="hub-diamond-help__section">
        <p className="hub-sheet__message">
          {t('auroraHelpAurora', { n: config.aurora.threshold, ladder })}
        </p>
        <p className="hub-sheet__message">
          {t('auroraHelpRetrigger', {
            trigger: config.freeSpins.trigger,
            retrigger: config.freeSpins.retrigger,
            max: config.freeSpins.maxTotal,
          })}
        </p>
        {counts.length > 0 && math.round?.maxWinCap !== undefined && (
          <p className="hub-sheet__message">{t('auroraHelpMaxWin', { cap: math.round.maxWinCap.toLocaleString('en-US') })}</p>
        )}
      </section>
    </div>
  )
}
