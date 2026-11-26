/**
 * 코인 리스핀 도움말 — 6단계를 그림(작은 5×3 판)과 한두 문장으로 설명한다. 규칙은 릴 위가 아니라 여기에만 쓴다.
 * 숫자(트리거 개수·리스핀 횟수·감기 배수·보물 4단·상한)는 전부 math.json에서 읽어 와서 문서와 어긋날 수 없다.
 * 금액은 지금 베팅 기준이고, 코인 얼굴·보물 띠와 같은 압축 표기를 쓴다.
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { formatCoinAmount } from '../../lib/coinFormat'
import './CoinRespinHelp.css'

interface CoinRespinHelpProps {
  math: GameMath
  symbols?: Record<string, string> | undefined
  props?: Record<string, string> | undefined
  /** 지금 베팅(총 베팅액). 보물 상금과 예시 금액을 이 값으로 보여 준다. */
  bet: number
  locale: Locale
}

type CellKind = 'empty' | 'coin' | 'treasure' | 'new'

interface MiniCell {
  kind: CellKind
  label?: string
}

/** 코인 한 개. 금화 그림이 있으면 그림 위에, 없으면 코드로 그린 금화 위에 글자를 얹는다. */
function CoinChip({
  src,
  label,
  kind = 'coin',
}: {
  src?: string | undefined
  label?: string | undefined
  kind?: CellKind
}): ReactNode {
  return (
    <span className={`hub-respin-help__coin hub-respin-help__coin--${kind}`} aria-hidden="true">
      {src ? <img className="hub-respin-help__coin-img" src={src} alt="" width={40} height={40} /> : null}
      {label !== undefined && <span className="hub-respin-help__coin-label">{label}</span>}
    </span>
  )
}

/** 도움말 ①·② 판의 시작 코인 금액(베팅 배수). */
const START_MULTIPLES: readonly number[] = [1, 2, 1, 3, 2, 5, 1, 2, 3]

/** 5×3 작은 판. `cells`는 릴 → 행 순서가 아니라 행 우선(왼쪽 위부터) 15개다. */
function MiniBoard({
  reels,
  rows,
  cells,
  coinSrc,
  tentacleColumn,
}: {
  reels: number
  rows: number
  cells: readonly MiniCell[]
  coinSrc?: string | undefined
  /** 촉수가 감는 줄(릴 인덱스). 그 줄을 보라색 띠로 감싼다. */
  tentacleColumn?: number | undefined
}): ReactNode {
  return (
    <div
      className="hub-respin-help__board"
      style={{ gridTemplateColumns: `repeat(${reels}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {cells.map((cell, i) => {
        const reel = i % reels
        return (
          <span
            key={i}
            className={`hub-respin-help__cell hub-respin-help__cell--${cell.kind}`}
            data-wrapped={tentacleColumn === reel ? 'true' : undefined}
          >
            {cell.kind !== 'empty' && <CoinChip src={coinSrc} label={cell.label} kind={cell.kind} />}
          </span>
        )
      })}
    </div>
  )
}

/** 행 우선 15칸 배열을 만든다. `filled`는 `[reel, row]` 좌표와 칸 종류·글자다. */
function makeCells(
  reels: number,
  rows: number,
  filled: readonly { pos: readonly [number, number]; kind: CellKind; label?: string }[],
): MiniCell[] {
  const cells: MiniCell[] = Array.from({ length: reels * rows }, () => ({ kind: 'empty' }))
  for (const entry of filled) {
    const [reel, row] = entry.pos
    if (reel < reels && row < rows) cells[row * reels + reel] = { kind: entry.kind, ...(entry.label === undefined ? {} : { label: entry.label }) }
  }
  return cells
}

function Dots({ total, on }: { total: number; on: number }): ReactNode {
  return (
    <span className="hub-respin-help__dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="hub-respin-help__dot" data-on={i < on ? 'true' : 'false'} />
      ))}
    </span>
  )
}

function Step({ n, title, children, picture }: { n: number; title: string; children: ReactNode; picture: ReactNode }): ReactNode {
  return (
    <section className="hub-respin-help__step">
      <h3 className="hub-respin-help__title">
        <span className="hub-respin-help__num" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      <div className="hub-respin-help__picture">{picture}</div>
      <p className="hub-respin-help__text">{children}</p>
    </section>
  )
}

export function CoinRespinHelp({ math, symbols, props, bet, locale }: CoinRespinHelpProps): ReactNode {
  const t = useT()
  const config = math.coinRespin
  if (config === undefined) return null
  const { reels, rows } = math
  const cells = reels * rows
  const coinSrc = symbols?.[config.symbol]
  // ③의 감기 주인공은 게임 안 크라켄 그림(와일드)이다. 없으면 촉수 그림, 둘 다 없으면 글자 그림으로 대신한다.
  const wildId = math.symbols.find((symbol) => symbol.wild === true)?.id
  const krakenSrc = (wildId === undefined ? undefined : symbols?.[wildId]) ?? props?.['tentacle']
  const multiplier = config.columnBonus.multiplier
  const fmt = (multiple: number): string => formatCoinAmount(Math.round(multiple * bet), locale)

  // ① 코인 6개가 박힌 판 (트리거 개수만큼).
  const starts: readonly [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 2],
    [2, 1],
    [3, 0],
    [4, 2],
    [0, 0],
    [3, 2],
    [4, 0],
  ]
  const startBoard = makeCells(
    reels,
    rows,
    starts.slice(0, Math.min(config.trigger, starts.length)).map((pos, i) => ({
      pos,
      kind: 'coin' as const,
      label: fmt(START_MULTIPLES[i] ?? 1),
    })),
  )

  // ② 리스핀: 점 → 새 코인 → 점. 이미 붙은 코인도 ①과 같은 금액을 그대로 보여 준다(빈 금화가 없다).
  const respinBoard = makeCells(reels, rows, [
    ...starts.slice(0, Math.min(config.trigger, starts.length)).map((pos, i) => ({
      pos,
      kind: 'coin' as const,
      label: fmt(START_MULTIPLES[i] ?? 1),
    })),
    { pos: [2, 0] as const, kind: 'new' as const, label: fmt(2) },
  ])

  // ③ 촉수 감기: 세로 한 줄이 차면 숫자가 배가 된다. 보물 코인(마지막 줄 맨 아래)은 그대로다.
  const wrapColumn = 2
  const before = [fmt(1), fmt(2), fmt(config.treasures.small)]
  const afterLabels = [fmt(1 * multiplier), fmt(2 * multiplier), fmt(config.treasures.small)]
  const wrapBoard = (labels: readonly string[]): MiniCell[] =>
    makeCells(
      reels,
      rows,
      labels.map((label, row) => ({
        pos: [wrapColumn, row] as const,
        kind: row === rows - 1 ? ('treasure' as const) : ('coin' as const),
        label,
      })),
    )

  // ⑤ 보물 4단.
  const tiers = [
    { id: 'small', name: t('coinRespinTreasureSmallFull'), mult: config.treasures.small, icon: props?.['coin-small'] },
    { id: 'medium', name: t('coinRespinTreasureMediumFull'), mult: config.treasures.medium, icon: props?.['coin-medium'] },
    { id: 'large', name: t('coinRespinTreasureLargeFull'), mult: config.treasures.large, icon: props?.['coin-large'] },
    { id: 'top', name: t('coinRespinTreasureTopFull'), mult: config.treasures.top, icon: props?.['treasure-top'] },
  ] as const
  const cap = math.round?.maxWinCap

  return (
    <div className="hub-respin-help">
      <Step
        n={1}
        title={t('coinRespinHelpTitle1')}
        picture={<MiniBoard reels={reels} rows={rows} cells={startBoard} coinSrc={coinSrc} />}
      >
        {t('coinRespinHelpStep1', { trigger: config.trigger })}
      </Step>

      <Step
        n={2}
        title={t('coinRespinHelpTitle2')}
        picture={
          <div className="hub-respin-help__flow">
            <Dots total={config.respins} on={config.respins - 1} />
            <span className="hub-respin-help__arrow" aria-hidden="true">
              →
            </span>
            <MiniBoard reels={reels} rows={rows} cells={respinBoard} coinSrc={coinSrc} />
            <span className="hub-respin-help__arrow" aria-hidden="true">
              →
            </span>
            <Dots total={config.respins} on={config.respins} />
          </div>
        }
      >
        {t('coinRespinHelpStep2', { respins: config.respins })}
      </Step>

      <Step
        n={3}
        title={t('coinRespinHelpTitle3')}
        picture={
          <div className="hub-respin-help__flow">
            <MiniBoard reels={reels} rows={rows} cells={wrapBoard(before)} coinSrc={coinSrc} tentacleColumn={wrapColumn} />
            <span className="hub-respin-help__arrow hub-respin-help__arrow--wrap" aria-hidden="true">
              {krakenSrc ? (
                <img className="hub-respin-help__kraken-img" src={krakenSrc} alt="" width={34} height={34} />
              ) : (
                <span className="hub-respin-help__kraken">🐙</span>
              )}
              ×{multiplier}
            </span>
            <MiniBoard reels={reels} rows={rows} cells={wrapBoard(afterLabels)} coinSrc={coinSrc} tentacleColumn={wrapColumn} />
          </div>
        }
      >
        {t('coinRespinHelpStep3', { rows, multiplier })}
      </Step>

      <Step
        n={4}
        title={t('coinRespinHelpTitle4')}
        picture={
          <div className="hub-respin-help__flow">
            <span className="hub-respin-help__stack">
              {[1, 3, 2].map((m, i) => (
                <CoinChip key={i} src={coinSrc} label={fmt(m)} />
              ))}
            </span>
            <span className="hub-respin-help__arrow" aria-hidden="true">
              →
            </span>
            <span className="hub-respin-help__total">{fmt(6)}</span>
          </div>
        }
      >
        {t('coinRespinHelpStep4')}
      </Step>

      <Step
        n={5}
        title={t('coinRespinHelpTitle5')}
        picture={
          <div className="hub-respin-help__tiers">
            <p className="hub-respin-help__note">{t('coinRespinHelpBetNote', { bet: bet.toLocaleString('en-US') })}</p>
            <ul className="hub-respin-help__tier-list" aria-label={t('coinRespinHelpTreasureTable')}>
              {tiers.map((tier) => (
                <li key={tier.id} className={`hub-respin-help__tier hub-respin-help__tier--${tier.id}`}>
                  {tier.icon ? (
                    <img className="hub-respin-help__tier-icon" src={tier.icon} alt="" width={28} height={28} />
                  ) : (
                    <span className="hub-respin-help__tier-dot" aria-hidden="true" />
                  )}
                  <span className="hub-respin-help__tier-name">{tier.name}</span>
                  <span className="hub-respin-help__tier-mult">×{tier.mult}</span>
                  <span className="hub-respin-help__tier-amount">{fmt(tier.mult)}</span>
                </li>
              ))}
            </ul>
          </div>
        }
      >
        {t('coinRespinHelpStep5', {
          small: config.treasures.small,
          medium: config.treasures.medium,
          large: config.treasures.large,
          cells,
          top: config.treasures.top,
        })}
      </Step>

      <section className="hub-respin-help__step">
        <h3 className="hub-respin-help__title">
          <span className="hub-respin-help__num" aria-hidden="true">
            6
          </span>
          {t('coinRespinHelpTitle6')}
        </h3>
        <ul className="hub-respin-help__notes">
          <li>{t('coinRespinHelpNote1')}</li>
          {cap !== undefined && <li>{t('coinRespinHelpNote2', { cap: cap.toLocaleString('en-US') })}</li>}
          <li>{t('coinRespinHelpNote3')}</li>
        </ul>
      </section>
    </div>
  )
}
