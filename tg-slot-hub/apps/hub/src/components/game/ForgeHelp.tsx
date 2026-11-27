/**
 * 화로 배율 줄(volcano-forge) 도움말 — 탭 4개: 지불 · 연쇄와 불씨 · 화로 줄 · 프리스핀.
 * 그림은 전부 CSS 그리드(`aspect-ratio: 1` 정사각 칸)와 심볼 아이콘이라 칸이 찌그러지지 않는다.
 * 숫자(배당표·불씨 값·화로 칸 수·상한)는 전부 math.json에서 읽어 와서 문서와 어긋날 수 없다.
 */
import { useState, type ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { symbolLabel } from '../../game/labels'
import { tierRanges } from './ClusterHelp'
import './ClusterHelp.css'
import './ForgeHelp.css'

const COLS = 6
const ROWS = 5

type HelpTab = 'pay' | 'chain' | 'rail' | 'free'
const TABS: readonly HelpTab[] = ['pay', 'chain', 'rail', 'free']
const TAB_KEY = {
  pay: 'forgeHelpTabPay',
  chain: 'forgeHelpTabChain',
  rail: 'forgeHelpTabRail',
  free: 'forgeHelpTabFree',
} as const

interface ForgeHelpProps {
  math: GameMath
  symbols?: Record<string, string> | undefined
  locale: Locale
}

/** 칸 하나. 그림이 없으면 글자 한 자로 대신한다. */
function Cell({
  symbol,
  symbols,
  math,
  locale,
  state,
  ember,
}: {
  symbol?: string | undefined
  symbols?: Record<string, string> | undefined
  math: GameMath
  locale: Locale
  state: 'hit' | 'dim' | 'empty' | 'plain'
  ember?: number | undefined
}): ReactNode {
  const src = symbol === undefined ? undefined : symbols?.[symbol]
  return (
    <span className={`hub-forge-help__cell hub-forge-help__cell--${state}`}>
      {symbol !== undefined && (src ? <img src={src} alt="" /> : <span className="hub-forge-help__letter">{symbolLabel(math, symbol, locale).slice(0, 1)}</span>)}
      {ember !== undefined && <span className="hub-forge-help__ember">×{ember}</span>}
    </span>
  )
}

/** 6×5 작은 판. `cells[reel:row]`로 칸 내용을 준다. */
function MiniBoard({ caption, render }: { caption: string; render: (reel: number, row: number) => ReactNode }): ReactNode {
  return (
    <figure className="hub-forge-help__figure">
      <div className="hub-forge-help__board" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }} aria-hidden="true">
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <span key={i} className="hub-forge-help__slot-wrap">
            {render(i % COLS, Math.floor(i / COLS))}
          </span>
        ))}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

function RailPicture({ filled, slots, heat, caption }: { filled: number; slots: number; heat: string; caption: string }): ReactNode {
  return (
    <figure className="hub-forge-help__figure hub-forge-help__figure--rail">
      <div className="hub-forge-help__rail" aria-hidden="true">
        <span className="hub-forge-help__heat">{heat}</span>
        <span className="hub-forge-help__dots">
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className={i < filled ? 'hub-forge-help__dot hub-forge-help__dot--lit' : 'hub-forge-help__dot'} />
          ))}
        </span>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

export function ForgeHelp({ math, symbols, locale }: ForgeHelpProps): ReactNode {
  const t = useT()
  const [tab, setTab] = useState<HelpTab>('pay')
  const min = math.anywhere?.minCount ?? 8
  const rail = math.forgeRail
  const slots = rail?.slots ?? 4
  const scatterId = math.scatter?.symbol
  const sizes = [...new Set(Object.values(math.paytable).flatMap((rule) => Object.keys(rule).map(Number)))].sort((a, b) => a - b)
  const ranked = Object.keys(math.paytable).sort(
    (a, b) => Math.max(0, ...Object.values(math.paytable[b] ?? {})) - Math.max(0, ...Object.values(math.paytable[a] ?? {})),
  )
  const topSymbol = ranked[0] ?? scatterId
  const lowSymbol = ranked[ranked.length - 1] ?? topSymbol
  const emberValues = Object.keys(rail?.values ?? {}).map(Number).sort((a, b) => a - b)
  const startHeats = Object.entries(rail?.startHeat ?? {}).map(([count, heat]) => ({ count: Number(count), heat })).sort((a, b) => a.count - b.count)
  const scatterPays = Object.entries(math.scatter?.pays ?? {}).map(([count, pay]) => ({ count: Number(count), pay })).sort((a, b) => a.count - b.count)
  const freeSpins = math.scatter?.freeSpins
  const cap = math.round?.maxWinCap
  const iconOf = (id: string | undefined): ReactNode =>
    id === undefined ? null : symbols?.[id] ? (
      <img className="hub-cluster-help__sym" src={symbols[id]} alt={symbolLabel(math, id, locale)} width={28} height={28} />
    ) : (
      <span>{symbolLabel(math, id, locale)}</span>
    )

  // ① 지불 그림: 윗 심볼 8개가 판 여기저기에 흩어져 빛난다. 나머지는 낮은 등급 그림이 섞여 있다.
  const HIT_SPOTS = new Set(['0:0', '2:0', '5:0', '1:1', '4:2', '0:3', '3:3', '5:4'])
  const FILLERS = ranked.slice(1)

  // ② 연쇄 그림: 판 여기저기 같은 그림 8개가 터짐 → 위에서 떨어짐, 새 칸 하나에 불씨.
  const POP_SPOTS = new Set(['0:1', '1:3', '2:2', '2:4', '3:0', '4:2', '4:3', '5:1'])
  // 터진 칸 수만큼 각 릴 위에서 새 그림이 떨어진다(릴 2·4는 2칸, 나머지는 1칸).
  const NEW_SPOTS = new Set(['0:0', '1:0', '2:0', '2:1', '3:0', '4:0', '4:1', '5:0'])
  // 터지는 그림과 같은 그림이 채움 칸에 섞이면 «8개»가 흐려진다.
  const CHAIN_FILLERS = FILLERS.filter((id) => id !== lowSymbol)

  return (
    <div className="hub-cluster-help hub-forge-help">
      <div className="hub-forge-help__tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'hub-forge-help__tab hub-forge-help__tab--active' : 'hub-forge-help__tab'}
            onClick={() => setTab(id)}
          >
            {t(TAB_KEY[id])}
          </button>
        ))}
      </div>

      {tab === 'pay' && (
        <>
          <MiniBoard
            caption={t('forgeHelpPayCaption', { min })}
            render={(reel, row) => {
              const hit = HIT_SPOTS.has(`${reel}:${row}`)
              const filler = FILLERS[(reel * 3 + row * 5) % Math.max(1, FILLERS.length)]
              return <Cell symbol={hit ? topSymbol : filler} symbols={symbols} math={math} locale={locale} state={hit ? 'hit' : 'dim'} />
            }}
          />
          <p className="hub-sheet__message">{t('forgeHelpPayRule', { min })}</p>
          <p className="hub-sheet__message">{t('clusterHelpBetBasis')}</p>
          <h3 className="hub-sheet__subtitle">{t('forgeHelpTierTitle')}</h3>
          <div className="hub-forge-help__table-wrap">
            <table className="hub-cluster-help__table hub-forge-help__table">
              <thead>
                <tr>
                  <th scope="col">{t('clusterHelpTierSize')}</th>
                  {tierRanges(sizes).map(({ size, label }) => (
                    <th key={size} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((id) => (
                  <tr key={id}>
                    <th scope="row">{iconOf(id)}</th>
                    {sizes.map((size) => (
                      <td key={size}>{math.paytable[id]?.[size] !== undefined ? `×${math.paytable[id]?.[size]}` : '–'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'chain' && (
        <>
          <div className="hub-forge-help__pair">
            <MiniBoard
              caption={t('forgeHelpChainBefore')}
              render={(reel, row) => {
                const popped = POP_SPOTS.has(`${reel}:${row}`)
                return popped ? (
                  <Cell symbol={lowSymbol} symbols={symbols} math={math} locale={locale} state="hit" />
                ) : (
                  <Cell symbol={CHAIN_FILLERS[(reel + row * 2) % Math.max(1, CHAIN_FILLERS.length)]} symbols={symbols} math={math} locale={locale} state="dim" />
                )
              }}
            />
            <MiniBoard
              caption={t('forgeHelpChainAfter')}
              render={(reel, row) => {
                if (NEW_SPOTS.has(`${reel}:${row}`)) {
                  return (
                    <Cell
                      symbol={CHAIN_FILLERS[(reel + 2) % Math.max(1, CHAIN_FILLERS.length)]}
                      symbols={symbols}
                      math={math}
                      locale={locale}
                      state="plain"
                      ember={reel === 2 && row === 0 ? emberValues[0] : undefined}
                    />
                  )
                }
                return <Cell symbol={CHAIN_FILLERS[(reel + row * 2) % Math.max(1, CHAIN_FILLERS.length)]} symbols={symbols} math={math} locale={locale} state="dim" />
              }}
            />
          </div>
          <p className="hub-sheet__message">{t('forgeHelpChainRule')}</p>
          <p className="hub-sheet__message">{t('forgeHelpEmberRule')}</p>
          {emberValues.length > 0 && (
            <div className="hub-forge-help__chips" aria-label={t('forgeHelpEmberValues')}>
              {emberValues.map((value) => (
                <span key={value} className="hub-forge-help__chip">
                  ×{value}
                </span>
              ))}
            </div>
          )}
          <p className="hub-sheet__message">{t('forgeHelpEmberBase')}</p>
        </>
      )}

      {tab === 'rail' && rail && (
        <>
          <div className="hub-forge-help__pair hub-forge-help__pair--stack">
            <RailPicture filled={slots - 1} slots={slots} heat="×37" caption={t('forgeHelpRailThree', { n: slots - 1 })} />
            <RailPicture filled={slots} slots={slots} heat="×37 → ×74" caption={t('forgeHelpRailFull', { n: slots, times: rail.fullMultiplier })} />
          </div>
          <p className="hub-sheet__message">{t('forgeHelpRailRule')}</p>
          <p className="hub-sheet__message">{t('forgeHelpRailFullRule', { n: slots, times: rail.fullMultiplier, cap: rail.heatCap })}</p>
          <p className="hub-sheet__message">{t('forgeHelpRailBase')}</p>
        </>
      )}

      {tab === 'free' && (
        <>
          <div className="hub-forge-help__table-wrap">
            <table className="hub-cluster-help__table hub-forge-help__table">
              <thead>
                <tr>
                  <th scope="col">{iconOf(scatterId)}</th>
                  <th scope="col">{t('forgeHelpFreePay')}</th>
                  <th scope="col">{t('forgeHelpFreeStart')}</th>
                </tr>
              </thead>
              <tbody>
                {scatterPays.map(({ count, pay }, index) => {
                  const start = [...startHeats].reverse().find((entry) => entry.count <= count)
                  return (
                    <tr key={count}>
                      <th scope="row">{index === scatterPays.length - 1 ? `${count}+` : count}</th>
                      <td>×{pay}</td>
                      <td>{start && start.heat > 0 ? `×${start.heat}` : '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {freeSpins && <p className="hub-sheet__message">{t('forgeHelpFreeRule', { trigger: freeSpins.trigger, count: freeSpins.count })}</p>}
          <p className="hub-sheet__message">{t('forgeHelpFreeKeep')}</p>
          {rail?.retrigger && (
            <p className="hub-sheet__message">
              {t('forgeHelpFreeMore', { trigger: rail.retrigger.trigger, spins: rail.retrigger.spins, max: rail.maxRoundSpins })}
            </p>
          )}
          {cap !== undefined && <p className="hub-sheet__message">{t('forgeHelpCap', { cap: cap.toLocaleString('en-US') })}</p>}
          <p className="hub-sheet__message">{t('forgeHelpRtp', { rtp: ((math.rtpTarget ?? 0.945) * 100).toFixed(1) })}</p>
        </>
      )}
    </div>
  )
}
