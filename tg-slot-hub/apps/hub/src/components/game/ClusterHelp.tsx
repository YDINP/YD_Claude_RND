/**
 * 클러스터 게임 도움말 — "클러스터" 탭(인접 예시 그림 2장, 크기별 배당표, 연쇄 배수표)과
 * 피처 탭의 "주문 카드 라운드" 설명. 숫자는 전부 math.json에서 읽어 와서 문서와 어긋날 수 없다.
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { symbolLabel } from '../../game/labels'
import { orderCardText } from '../../game/orders'
import './ClusterHelp.css'

const EXAMPLE_COLS = 5
const EXAMPLE_ROWS = 3
const HIT_CELLS = ['0:0', '1:0', '2:0', '2:1', '2:2']
const MISS_CELLS = ['0:0', '1:1', '2:2', '3:1', '4:0']

function MiniGrid({ cells, hit, caption }: { cells: readonly string[]; hit: boolean; caption: string }): ReactNode {
  return (
    <figure className="hub-cluster-help__example">
      <div
        className="hub-cluster-help__mini"
        style={{ gridTemplateColumns: `repeat(${EXAMPLE_COLS}, 1fr)`, gridTemplateRows: `repeat(${EXAMPLE_ROWS}, 1fr)` }}
        aria-hidden="true"
      >
        {Array.from({ length: EXAMPLE_COLS * EXAMPLE_ROWS }, (_, i) => {
          const key = `${i % EXAMPLE_COLS}:${Math.floor(i / EXAMPLE_COLS)}`
          const on = cells.includes(key)
          return (
            <span
              key={i}
              className={on ? `hub-cluster-help__cell hub-cluster-help__cell--${hit ? 'hit' : 'miss'}` : 'hub-cluster-help__cell'}
            />
          )
        })}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/** 지급 크기 구간 라벨. 마지막은 `N+`, 중간은 `N–M`. */
export function tierRanges(sizes: readonly number[]): { size: number; label: string }[] {
  return sizes.map((size, i) => {
    const next = sizes[i + 1]
    if (next === undefined) return { size, label: `${size}+` }
    return { size, label: next - 1 > size ? `${size}–${next - 1}` : String(size) }
  })
}

interface ClusterHelpProps {
  math: GameMath
  symbols?: Record<string, string>
  locale: Locale
}

export function ClusterHelp({ math, symbols, locale }: ClusterHelpProps): ReactNode {
  const t = useT()
  const min = math.cluster?.minCluster ?? 5
  const sizes = [...new Set(Object.values(math.paytable).flatMap((rule) => Object.keys(rule).map(Number)))].sort(
    (a, b) => a - b,
  )
  const topPay = (id: string): number => Math.max(0, ...Object.values(math.paytable[id] ?? {}))
  const ranked = Object.keys(math.paytable).sort((a, b) => topPay(b) - topPay(a))
  const columns = ranked.length > 1 ? [ranked[0] as string, ranked[ranked.length - 1] as string] : ranked
  const ladder = math.cascade?.multiplierLadder ?? []

  const symbolHead = (id: string): ReactNode =>
    symbols?.[id] ? (
      <img className="hub-cluster-help__sym" src={symbols[id]} alt={symbolLabel(math, id, locale)} width={28} height={28} />
    ) : (
      <span>{symbolLabel(math, id, locale)}</span>
    )

  return (
    <div className="hub-cluster-help">
      <p className="hub-sheet__message">{t('clusterHelpRule', { min })}</p>
      <div className="hub-cluster-help__examples">
        <MiniGrid cells={HIT_CELLS} hit caption={t('clusterHelpExampleHit')} />
        <MiniGrid cells={MISS_CELLS} hit={false} caption={t('clusterHelpExampleMiss')} />
      </div>
      {math.wild && <p className="hub-sheet__message">{t('clusterHelpWild')}</p>}
      <p className="hub-sheet__message">{t('clusterHelpBetBasis')}</p>

      <h3 className="hub-sheet__subtitle">{t('clusterHelpTierTitle')}</h3>
      <table className="hub-cluster-help__table">
        <thead>
          <tr>
            <th scope="col">{t('clusterHelpTierSize')}</th>
            {columns.map((id) => (
              <th key={id} scope="col">
                {symbolHead(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tierRanges(sizes).map(({ size, label }) => (
            <tr key={size}>
              <th scope="row">{label}</th>
              {columns.map((id) => (
                <td key={id}>{math.paytable[id]?.[size] !== undefined ? `×${math.paytable[id]?.[size]}` : '–'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {ladder.length > 0 && (
        <>
          <h3 className="hub-sheet__subtitle">{t('clusterHelpLadderTitle')}</h3>
          <div className="hub-cluster-help__ladder">
            {ladder.map((multiplier, i) => (
              <span key={i} className="hub-cluster-help__ladder-step">
                <span>{t('clusterHelpLadderStep', { n: i + 1 })}</span>
                <strong>×{multiplier}</strong>
              </span>
            ))}
          </div>
          <p className="hub-sheet__message">{t('clusterHelpLadderNote')}</p>
        </>
      )}
    </div>
  )
}

/** 피처 탭의 주문 카드 라운드 설명. */
export function OrderRoundHelp({ math, locale }: { math: GameMath; locale: Locale }): ReactNode {
  const t = useT()
  const cfg = math.orderRound
  if (cfg === undefined) return null
  const cap = cfg.spins + cfg.extraSpinsPerOrder * cfg.maxOrders
  const sample = (kind: 'popSymbol' | 'clusterSize' | 'chainLength') => cfg.pool.find((p) => p.kind === kind)
  const kinds = [
    { key: 'orderHelpKindPop', entry: sample('popSymbol') },
    { key: 'orderHelpKindCluster', entry: sample('clusterSize') },
    { key: 'orderHelpKindChain', entry: sample('chainLength') },
  ] as const
  return (
    <div className="hub-features__section hub-cluster-help">
      <h3 className="hub-sheet__subtitle">{t('orderHelpTitle')}</h3>
      <p className="hub-sheet__message">{t('orderHelpTrigger', { count: cfg.trigger })}</p>
      <p className="hub-sheet__message">{t('orderHelpFlow', { slots: cfg.slots, spins: cfg.spins })}</p>
      <ul className="hub-cluster-help__kinds">
        {kinds.map(({ key, entry }) => (
          <li key={key}>
            {entry && (
              <span className="hub-cluster-help__kind-card">
                {orderCardText(entry, math, locale, t, true)} · ×{entry.prize}
              </span>
            )}
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <p className="hub-sheet__message">{t('orderHelpComplete', { extra: cfg.extraSpinsPerOrder })}</p>
      <p className="hub-sheet__message">{t('orderHelpLimits', { max: cfg.maxOrders, cap })}</p>
      <p className="hub-sheet__message">{t('orderHelpMiss')}</p>
    </div>
  )
}
