/**
 * 도움말 «기능» 탭의 무대 룰렛 절. 숫자·칸·순서는 전부 `math.stageRoulette`에서 읽어 그린다(하드코딩 금지) —
 * 판 그림의 값, 불 켜지는 번호 순서, 최대 회전·최대 배수·상한이 팩 수치와 항상 같다.
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import { maxRouletteSteps, type GameMath } from '@tgslot/slot-engine'
import { useT, type TranslationKey } from '../../i18n'
import { symbolLabel } from '../../game/labels'
import { maxRouletteMultiple } from '../../lib/rouletteShow'
import { RouletteBoardPreview, ringNameKey } from './RouletteWheel'
import './StageRoulette.css'

interface RouletteHelpProps {
  math: GameMath
  symbols: Record<string, string> | undefined
  locale: Locale
}

/** 불 켜지는 순서 예시에 쓰는 응원봉 개수. 팩의 `maxLit`보다 크지 않게 잡는다. */
const EXAMPLE_CHEER = 4

/** 고리 짧은 이름(바깥/가운데/안쪽) — 좁은 줄에서 쓴다. */
function ringShortKey(id: string, index: number): TranslationKey {
  const key = id === 'middle' || (id !== 'outer' && id !== 'inner' && index === 1) ? 'stageRouletteRingShortMiddle' : id === 'inner' || index === 2 ? 'stageRouletteRingShortInner' : 'stageRouletteRingShortOuter'
  return key
}

export function RouletteHelp({ math, symbols, locale }: RouletteHelpProps): ReactNode {
  const t = useT()
  const config = math.stageRoulette
  if (config === undefined) return null

  const bonusId = math.scatter?.symbol
  const bonusSrc = bonusId === undefined ? undefined : symbols?.[bonusId]
  const bonusName = bonusId === undefined ? '' : symbolLabel(math, bonusId, locale)
  const wildId = math.symbols.find((s) => s.wild)?.id
  const wildSrc = wildId === undefined ? undefined : symbols?.[wildId]
  const wildName = wildId === undefined ? '' : symbolLabel(math, wildId, locale)
  const stickSrc = symbols?.[config.cheer.symbol]
  const stickName = symbolLabel(math, config.cheer.symbol, locale)
  const example = Math.min(EXAMPLE_CHEER, config.cheer.maxLit)
  const maxSpins = maxRouletteSteps(config, 0)
  const maxMultiple = maxRouletteMultiple(config)
  const cap = math.round?.maxWinCap
  const outerCoin = config.rings[0]?.segments.find((s) => s.kind === 'coin')
  const encoreSegment = config.rings.flatMap((r) => r.segments).find((s) => s.kind === 'encore')
  const grandSegment = config.rings.flatMap((r) => r.segments).find((s) => s.kind === 'grand')
  const valueOf = (segment: { kind: string } | undefined): number =>
    segment !== undefined && 'value' in segment && typeof (segment as { value?: unknown }).value === 'number'
      ? ((segment as { value: number }).value)
      : 0
  const innerLitMax = Math.min(config.cheer.maxLit, config.rings[config.rings.length - 1]?.litOrder.length ?? 0)
  const passCount = Math.max(1, config.trigger)

  return (
    <div className="hub-roulette-help" data-testid="roulette-help">
      <section className="hub-roulette-help__section" data-testid="roulette-help-symbols">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpSymbolsTitle')}</h3>
        {wildId !== undefined && (
          <div className="hub-roulette-help__symbol-row">
            {wildSrc ? <img className="hub-roulette-help__symbol-img" src={wildSrc} alt="" width={48} height={48} /> : null}
            <div>
              <strong className="hub-roulette-help__card-name">{wildName}</strong>
              <p className="hub-roulette-help__card-text">{t('stageRouletteHelpWildText')}</p>
            </div>
          </div>
        )}
        {bonusId !== undefined && (
          <div className="hub-roulette-help__symbol-row">
            {bonusSrc ? <img className="hub-roulette-help__symbol-img" src={bonusSrc} alt="" width={48} height={48} /> : null}
            <div>
              <strong className="hub-roulette-help__card-name">{bonusName}</strong>
              <p className="hub-roulette-help__card-text">{t('stageRouletteHelpPassText', { n: config.trigger })}</p>
            </div>
          </div>
        )}
      </section>

      <section className="hub-roulette-help__section">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpEntryTitle')}</h3>
        <div className="hub-roulette-help__passes" aria-label={bonusName}>
          {Array.from({ length: passCount }, (_, i) => (
            <span key={i} className="hub-roulette-help__pass">
              {bonusSrc ? <img src={bonusSrc} alt="" /> : <span className="hub-roulette-help__pass-fallback">{bonusName.slice(0, 4)}</span>}
            </span>
          ))}
          <span className="hub-roulette-help__arrow" aria-hidden="true">
            →
          </span>
          <span className="hub-roulette-help__badge">{t('stageRouletteTitle')}</span>
        </div>
        <p className="hub-roulette-help__text">{t('stageRouletteHelpEntry', { n: config.trigger, songs: config.songs })}</p>
        {config.startInnerAt !== undefined && (
          <p className="hub-roulette-help__text">{t('stageRouletteHelpEntryInner', { n: config.startInnerAt })}</p>
        )}
      </section>

      <section className="hub-roulette-help__section">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpBoardTitle')}</h3>
        <div className="hub-roulette-help__board" data-testid="roulette-help-board">
          <RouletteBoardPreview config={config} lightstickSrc={stickSrc} />
        </div>
        <ul className="hub-roulette-help__ring-names">
          {config.rings.map((ring, i) => (
            <li key={ring.id} className="hub-roulette-help__ring-name">
              {t(ringNameKey(ring.id, i))} · {ring.segments.length}
            </li>
          ))}
        </ul>
        <p className="hub-roulette-help__text">{t('stageRouletteHelpBoard')}</p>
      </section>

      <section className="hub-roulette-help__section">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpCellsTitle')}</h3>
        <div className="hub-roulette-help__cards">
          <div className="hub-roulette-help__card">
            <div className="hub-roulette-help__card-head">
              <span className="hub-roulette-help__chipcell">×{valueOf(outerCoin)}</span>
              <span className="hub-roulette-help__card-name">{t('stageRouletteSegCoin')}</span>
            </div>
            <p className="hub-roulette-help__card-text">{t('stageRouletteHelpCellCoin')}</p>
          </div>
          <div className="hub-roulette-help__card">
            <div className="hub-roulette-help__card-head">
              <span className="hub-roulette-help__chipcell hub-roulette-help__chipcell--stepUp">▲</span>
              <span className="hub-roulette-help__card-name">{t('stageRouletteSegStepUp')}</span>
            </div>
            <p className="hub-roulette-help__card-text">{t('stageRouletteHelpCellStepUp')}</p>
          </div>
          <div className="hub-roulette-help__card">
            <div className="hub-roulette-help__card-head">
              <span className="hub-roulette-help__chipcell hub-roulette-help__chipcell--encore">×{valueOf(encoreSegment)}</span>
              <span className="hub-roulette-help__card-name">{t('stageRouletteSegEncore')}</span>
            </div>
            <p className="hub-roulette-help__card-text">{t('stageRouletteHelpCellEncore', { max: config.maxEncores })}</p>
          </div>
          <div className="hub-roulette-help__card">
            <div className="hub-roulette-help__card-head">
              <span className="hub-roulette-help__chipcell hub-roulette-help__chipcell--grand">★ ×{valueOf(grandSegment)}</span>
              <span className="hub-roulette-help__card-name">{t('stageRouletteSegGrand')}</span>
            </div>
            <p className="hub-roulette-help__card-text">{t('stageRouletteHelpCellGrand')}</p>
          </div>
        </div>
        <p className="hub-roulette-help__text">{t('stageRouletteHelpValueNote')}</p>
      </section>

      <section className="hub-roulette-help__section">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpCheerTitle')}</h3>
        <div className="hub-roulette-help__cheer" data-testid="roulette-help-cheer">
          <div className="hub-roulette-help__sticks" aria-label={stickName}>
            {Array.from({ length: example }, (_, i) =>
              stickSrc ? (
                <img key={i} className="hub-roulette-help__stick" src={stickSrc} alt="" />
              ) : (
                <span key={i} className="hub-roulette-help__stick-fallback" />
              ),
            )}
          </div>
          {config.rings.map((ring, r) => {
            const order = ring.litOrder.slice(0, Math.min(example, ring.litOrder.length))
            return (
              <div key={ring.id} className="hub-roulette-help__ring-lit">
                <span className="hub-roulette-help__ring-lit-name">{t(ringShortKey(ring.id, r))}</span>
                <span className="hub-roulette-help__lit-cells">
                  {order.map((index, k) => {
                    const segment = ring.segments[index]
                    return (
                      <span key={index} className="hub-roulette-help__lit-cell" data-lit="true" data-order={k + 1}>
                        <span className="hub-roulette-help__lit-num">{k + 1}</span>×{valueOf(segment) * config.cheer.litMultiplier}
                      </span>
                    )
                  })}
                </span>
              </div>
            )
          })}
        </div>
        <p className="hub-roulette-help__text">{t('stageRouletteHelpCheerSetup', { n: example })}</p>
        <p className="hub-roulette-help__text">
          {t('stageRouletteHelpCheerRule', {
            mult: config.cheer.litMultiplier,
            max: config.cheer.maxLit,
            inner: innerLitMax,
          })}
        </p>
      </section>

      <section className="hub-roulette-help__section">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpEndTitle')}</h3>
        <div className="hub-roulette-help__dots" aria-hidden="true">
          {Array.from({ length: config.songs }, (_, i) => (
            <span key={i}>♪</span>
          ))}
        </div>
        <p className="hub-roulette-help__text" data-testid="roulette-help-end">
          {t('stageRouletteHelpEnd', {
            spins: maxSpins,
            max: maxMultiple.toLocaleString('en-US'),
            cap: cap === undefined ? '—' : cap.toLocaleString('en-US'),
          })}
        </p>
      </section>

      <section className="hub-roulette-help__section">
        <h3 className="hub-roulette-help__title">{t('stageRouletteHelpFairTitle')}</h3>
        <p className="hub-roulette-help__text">{t('stageRouletteHelpFair')}</p>
      </section>
    </div>
  )
}
