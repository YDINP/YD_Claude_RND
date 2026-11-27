/**
 * 정원 도움말 — «꽃 모으기 / 정원이 자라요 / 씨앗 화분 / 정원 프리스핀» 네 장.
 * 숫자는 전부 math.json에서 읽는다(문턱·씨앗 값·스핀 수·햇살 간격). 격자 그림은 CSS `aspect-ratio: 1`인 정사각 칸이라
 * 페이라인 그림처럼 찌그러지지 않는다. 심볼은 테마 그림이 있으면 그것을, 없으면 이름 글자를 쓴다.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import { getWildIds, type GameMath } from '@tgslot/slot-engine'
import { useT, type TranslationKey } from '../../i18n'
import { symbolLabel } from '../../game/labels'
import './GardenHelp.css'

type Section = 'flowers' | 'grow' | 'seed' | 'bonus'

const SECTIONS: readonly { id: Section; key: TranslationKey }[] = [
  { id: 'flowers', key: 'gardenHelpTabFlowers' },
  { id: 'grow', key: 'gardenHelpTabGrow' },
  { id: 'seed', key: 'gardenHelpTabSeed' },
  { id: 'bonus', key: 'gardenHelpTabBonus' },
]

const TIER_KEYS: readonly TranslationKey[] = ['gardenTier0', 'gardenTier1', 'gardenTier2', 'gardenTier3', 'gardenTier4']

interface GardenHelpProps {
  math: GameMath
  symbols?: Record<string, string> | undefined
  props?: Record<string, string> | undefined
  locale: Locale
}

type CellMark = 'hit' | 'new' | 'seed' | 'none'

interface MiniCell {
  symbol?: string
  mark?: CellMark
  /** 씨앗 등급 인덱스(마크가 seed일 때). */
  tier?: number
}

interface MiniBoardProps {
  size: number
  cell: number
  cells: readonly MiniCell[]
  symbols?: Record<string, string> | undefined
  math: GameMath
  locale: Locale
  caption?: string
  label: string
}

function MiniBoard({ size, cell, cells, symbols, math, locale, caption, label }: MiniBoardProps): ReactNode {
  const style = { '--hub-garden-help-cell': `${cell}px`, '--hub-garden-help-size': size } as CSSProperties
  return (
    <figure className="hub-garden-help__figure">
      <div className="hub-garden-help__board" style={style} role="img" aria-label={label}>
        {cells.map((entry, index) => {
          const src = entry.symbol === undefined ? undefined : symbols?.[entry.symbol]
          return (
            <span key={index} className="hub-garden-help__cell" data-mark={entry.mark ?? 'none'}>
              {src !== undefined ? (
                <img src={src} alt="" draggable={false} />
              ) : entry.symbol !== undefined && cell >= 18 ? (
                <span className="hub-garden-help__cell-text">{symbolLabel(math, entry.symbol, locale).slice(0, 2)}</span>
              ) : null}
              {entry.mark === 'seed' && <span className="hub-garden-help__seed-dot" data-tier={entry.tier ?? 0} />}
            </span>
          )
        })}
      </div>
      {caption !== undefined && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** 심볼 id 목록: 꽃(배당표 순) 세 가지와 와일드·스캐터. 팩이 바뀌어도 그림이 비지 않게 math에서 고른다. */
function pickSymbols(math: GameMath): { flowers: string[]; wild: string | undefined; scatter: string | undefined } {
  const wilds = getWildIds(math)
  const scatter = math.scatter?.symbol
  const flowers = Object.keys(math.paytable).filter((id) => !wilds.has(id) && id !== scatter)
  const wild = [...wilds][0]
  return { flowers, wild, scatter }
}

/** 4×4 예시 판. `a`는 주인공 꽃, `b`·`c`는 배경 꽃. 칸 번호는 행 우선(0~15). */
function exampleBoard(flowers: readonly string[], opts: { hit?: readonly number[]; wild?: number; refill?: readonly number[] }): MiniCell[] {
  const a = flowers[0] ?? ''
  const b = flowers[1] ?? a
  const c = flowers[2] ?? b
  const hit = new Set(opts.hit ?? [])
  const refill = new Set(opts.refill ?? [])
  return Array.from({ length: 16 }, (_, index) => {
    const row = Math.floor(index / 4)
    const reel = index % 4
    const filler = (row + reel) % 2 === 0 ? b : c
    if (opts.wild === index) return { symbol: '__wild__', mark: 'hit' as const }
    if (hit.has(index)) return { symbol: a, mark: 'hit' as const }
    if (refill.has(index)) return { symbol: a, mark: 'new' as const }
    return { symbol: filler }
  })
}

export function GardenHelp({ math, symbols, props, locale }: GardenHelpProps): ReactNode {
  const t = useT()
  const [section, setSection] = useState<Section>('flowers')
  const config = math.growBoard
  if (config === undefined) return null
  const { flowers, wild, scatter } = pickSymbols(math)
  const withWild = (cells: MiniCell[]): MiniCell[] =>
    cells.map((entry) => (entry.symbol === '__wild__' ? { ...entry, ...(wild === undefined ? {} : { symbol: wild }) } : entry))
  const min = math.cluster?.minCluster ?? 5
  const bonus = config.bonus
  const tiers = config.seedTiers
  const spinsRows = Object.entries(bonus.spinsByCount)
    .map(([count, spins]) => ({ count: Number(count), spins }))
    .sort((x, y) => x.count - y.count)
  const scatterPays = Object.entries(math.scatter?.pays ?? {})
    .map(([count, mult]) => ({ count: Number(count), mult }))
    .sort((x, y) => x.count - y.count)
  const maxWin = math.round?.maxWinCap
  const common = { symbols, math, locale } as const

  const hitL = [0, 1, 2, 6, 10] // 이어진 5칸(ㄱ자)
  const miss4 = [0, 1, 2, 6]
  const wildCells = withWild(exampleBoard(flowers, { hit: [0, 1, 6, 10], wild: 2 }))

  // 정원이 자라는 모습: 한 변 4→8. 새로 열린 겹은 연두 테두리.
  const growBoards = Array.from({ length: 5 }, (_, stage) => {
    const size = 4 + stage
    // 새 겹은 ㄱ자다: 홀수 단계(5×5·7×7)는 오른쪽 열 + 위쪽 행, 짝수 단계(6×6·8×8)는 왼쪽 열 + 아래쪽 행.
    const cells: MiniCell[] = Array.from({ length: size * size }, (_, index) => {
      const row = Math.floor(index / size)
      const reel = index % size
      const edge = stage > 0 && (stage % 2 === 1 ? reel === size - 1 || row === 0 : reel === 0 || row === size - 1)
      return edge ? { mark: 'new' as const } : {}
    })
    return { size, cells, threshold: stage === 0 ? undefined : config.thresholds[stage - 1] }
  })

  return (
    <div className="hub-garden-help">
      <div className="hub-garden-help__tabs" role="tablist">
        {SECTIONS.map(({ id, key }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            className={section === id ? 'hub-garden-help__tab hub-garden-help__tab--active' : 'hub-garden-help__tab'}
            onClick={() => setSection(id)}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {section === 'flowers' && (
        <div className="hub-garden-help__page">
          <p className="hub-sheet__message">{t('gardenHelpFlowersRule', { min })}</p>
          <div className="hub-garden-help__row">
            <MiniBoard size={4} cell={22} cells={exampleBoard(flowers, { hit: hitL })} caption={t('gardenHelpFlowersHit')} label={t('gardenHelpFlowersHit')} {...common} />
            <MiniBoard size={4} cell={22} cells={exampleBoard(flowers, { hit: miss4 })} caption={t('gardenHelpFlowersMiss')} label={t('gardenHelpFlowersMiss')} {...common} />
            <MiniBoard size={4} cell={22} cells={wildCells} caption={t('gardenHelpFlowersWild')} label={t('gardenHelpFlowersWild')} {...common} />
          </div>
          <div className="hub-garden-help__row">
            <MiniBoard size={4} cell={18} cells={exampleBoard(flowers, { hit: hitL })} caption={t('gardenHelpFlowersStepBefore')} label={t('gardenHelpFlowersStepBefore')} {...common} />
            <span className="hub-garden-help__arrow" aria-hidden="true">→</span>
            <MiniBoard
              size={4}
              cell={18}
              cells={exampleBoard(flowers, { hit: hitL }).map((entry) => (entry.mark === 'hit' ? { mark: 'hit' as const } : entry))}
              caption={t('gardenHelpFlowersStepPop')}
              label={t('gardenHelpFlowersStepPop')}
              {...common}
            />
            <span className="hub-garden-help__arrow" aria-hidden="true">→</span>
            <MiniBoard size={4} cell={18} cells={exampleBoard(flowers, { refill: [0, 1, 2, 4, 8] })} caption={t('gardenHelpFlowersStepDrop')} label={t('gardenHelpFlowersRefill')} {...common} />
          </div>
          <p className="hub-sheet__message">{t('gardenHelpFlowersRefill')}</p>
          {scatter !== undefined && <p className="hub-sheet__message">{t('gardenHelpFlowersScatter')}</p>}
          <p className="hub-sheet__message">{t('gardenHelpFlowersBasis')}</p>
        </div>
      )}

      {section === 'grow' && (
        <div className="hub-garden-help__page">
          <p className="hub-sheet__message">{t('gardenHelpGrowIntro')}</p>
          <div className="hub-garden-help__grow">
            {growBoards.map((board) => (
              <MiniBoard
                key={board.size}
                size={board.size}
                cell={10}
                cells={board.cells}
                caption={board.threshold === undefined ? `${board.size}×${board.size}` : `${board.size}×${board.size}\n${t('gardenHelpGrowCells', { n: board.threshold })}`}
                label={`${board.size}×${board.size}`}
                {...common}
              />
            ))}
          </div>
          <p className="hub-sheet__message">{t('gardenHelpGrowCovered')}</p>
          <p className="hub-sheet__message">{t('gardenHelpGrowReset')}</p>
          <p className="hub-sheet__message">{t('gardenHelpGrowRound')}</p>
        </div>
      )}

      {section === 'seed' && (
        <div className="hub-garden-help__page">
          <p className="hub-sheet__message">{t('gardenHelpSeedIntro')}</p>
          <ol className="hub-garden-help__tiers">
            {tiers.map((value, tier) => {
              const icon = props?.[`seed-${tier}`]
              return (
                <li key={tier} className="hub-garden-help__tier">
                  {icon !== undefined ? (
                    <img className="hub-garden-help__tier-img" src={icon} alt="" width={40} height={40} />
                  ) : (
                    <span className="hub-garden-help__seed-dot hub-garden-help__seed-dot--big" data-tier={tier} />
                  )}
                  <span className="hub-garden-help__tier-value">×{value}</span>
                  <span className="hub-garden-help__tier-name">{t(TIER_KEYS[Math.min(tier, TIER_KEYS.length - 1)] as TranslationKey)}</span>
                </li>
              )
            })}
          </ol>
          <p className="hub-sheet__message">{t('gardenHelpSeedGrow')}</p>
          <p className="hub-sheet__message">{t('gardenHelpSeedApply', { cap: config.clusterSeedCap })}</p>
          <p className="hub-sheet__message">{t('gardenHelpSeedUse')}</p>
        </div>
      )}

      {section === 'bonus' && (
        <div className="hub-garden-help__page">
          <p className="hub-sheet__message">{t('gardenHelpBonusIntro', { trigger: bonus.trigger })}</p>
          <ul className="hub-garden-help__list">
            {spinsRows.map((row, i) => (
              <li key={row.count}>
                {scatter !== undefined && symbols?.[scatter] !== undefined && (
                  <img className="hub-garden-help__list-img" src={symbols[scatter]} alt="" width={22} height={22} />
                )}
                <span>
                  {t(i === spinsRows.length - 1 ? 'gardenHelpBonusRowMore' : 'gardenHelpBonusRow', { count: row.count, spins: row.spins })}
                </span>
              </li>
            ))}
          </ul>
          <p className="hub-sheet__message">{t('gardenHelpBonusKeep', { size: bonus.minStartSize })}</p>
          <p className="hub-sheet__message">
            {t('gardenHelpBonusSun', { n: bonus.sunEvery, max: bonus.maxSunsPerSpin, plant: bonus.sunPlant })}
          </p>
          <p className="hub-sheet__message">
            {t('gardenHelpBonusRetrigger', { trigger: bonus.trigger, spins: bonus.retriggerSpins, max: bonus.maxRetriggers })}
          </p>
          <p className="hub-sheet__message">{t('gardenHelpBonusMin', { n: bonus.minRoundPay })}</p>
          {scatterPays.length > 0 && (
            <ul className="hub-garden-help__list">
              {scatterPays.map((row) => (
                <li key={row.count}>{t('gardenHelpBonusScatterPay', { count: row.count, mult: row.mult })}</li>
              ))}
            </ul>
          )}
          {maxWin !== undefined && <p className="hub-sheet__message">{t('gardenHelpMaxWin', { cap: maxWin.toLocaleString('en-US') })}</p>}
        </div>
      )}
    </div>
  )
}
