/**
 * 도움말 «말판 보너스» — 규칙을 그림 여섯 칸으로. 글보다 그림이 먼저 읽히게 한다.
 *
 *   1 들어가기  2 윷 던지기  3 칸 종류  4 지름길  5 끝나는 때  6 받는 돈
 *
 * 수치(기회·등불·최소·최대·큰 상·던지기 상한·진입 개수·스캐터 배당)는 전부 **math.json에서 읽는다** —
 * 하드코딩하지 않아서 튜닝해도 도움말이 항상 맞는다. 윷가락 그림은 게임 화면의 `YutSticksStatic`을 그대로 쓴다.
 */
import type { ReactNode } from 'react'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../../i18n'
import { yutFaceMask } from '../../../game/boardPlayback'
import { YutSticksStatic } from './YutThrow'
import { LanternGlyph, TileGlyph, TILE_FILL } from './tileIcons'
import { YUT_BOARD_SIZE, boardLayout, nodeCenter, nodeRadius } from './yutLayout'
import type { BoardTileKind } from '@tgslot/shared'

interface BoardHelpProps {
  math: GameMath
  symbols: Record<string, string> | undefined
}

/** 칸 종류 줄에 보여 줄 순서(도움말 3번 칸). */
const TILE_ORDER: readonly Exclude<BoardTileKind, 'start'>[] = ['coin', 'mult', 'forward', 'again', 'trap', 'goal']

function Cell(props: { n: number; title: string; children: ReactNode }): ReactNode {
  return (
    <section className="board-help__cell">
      <div className="board-help__cell-head">
        <span className="board-help__num" aria-hidden="true">
          {props.n}
        </span>
        <h4 className="board-help__cell-title">{props.title}</h4>
      </div>
      {props.children}
    </section>
  )
}

/** 지름길 그림: 작은 윷판에 갈림길 세 곳을 금빛으로 표시한다. */
function MiniBoard({ math }: { math: GameMath }): ReactNode {
  const config = math.boardBonus
  const layout = config === undefined ? null : boardLayout(config.layout)
  if (config === undefined || layout === null) return null
  const forks = new Set(Object.keys(config.forks))
  const edges = new Set<string>()
  for (const nodes of Object.values(config.routes)) {
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      const a = nodes[i] as string
      const b = nodes[i + 1] as string
      edges.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
  }
  return (
    <svg className="board-help__map" viewBox={`-6 -6 ${YUT_BOARD_SIZE + 12} ${YUT_BOARD_SIZE + 12}`} aria-hidden="true">
      <rect x="0" y="0" width={YUT_BOARD_SIZE} height={YUT_BOARD_SIZE} rx="22" fill="rgba(22,25,50,0.6)" stroke="rgba(232,195,74,0.4)" />
      {[...edges].map((key) => {
        const [a, b] = key.split('|') as [string, string]
        const pa = nodeCenter(layout, a)
        const pb = nodeCenter(layout, b)
        if (pa === null || pb === null) return null
        return <line key={key} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="rgba(242,236,224,0.4)" strokeWidth="3" strokeDasharray="3 7" strokeLinecap="round" />
      })}
      {Object.keys(config.nodes).map((id) => {
        const p = nodeCenter(layout, id)
        if (p === null || id === 'start') return null
        const fork = forks.has(id)
        const kind = config.nodes[id]?.kind ?? 'coin'
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={nodeRadius(id) * 0.78} fill={TILE_FILL[kind].fill} stroke={TILE_FILL[kind].stroke} strokeWidth="2" opacity={fork ? 1 : 0.8} />
            {fork && <circle cx={p.x} cy={p.y} r={nodeRadius(id) + 7} fill="none" stroke="#ffd45a" strokeWidth="3.4" strokeDasharray="6 6" />}
          </g>
        )
      })}
    </svg>
  )
}

export function BoardHelp({ math, symbols }: BoardHelpProps): ReactNode {
  const t = useT()
  const config = math.boardBonus
  if (config === undefined) return null

  const bonusUrl = math.scatter === undefined ? undefined : symbols?.[math.scatter.symbol]
  const scatterPay = math.scatter?.pays?.[config.trigger] ?? 0
  const forwardValue = Object.values(config.nodes).find((node) => node.kind === 'forward')?.value ?? 0
  const goalValue = Object.values(config.nodes).find((node) => node.kind === 'goal')?.value ?? 0
  const throwRows = [...config.throwTable].sort((a, b) => a.steps - b.steps)
  const tileText: Record<Exclude<BoardTileKind, 'start'>, string> = {
    coin: t('boardHelpTileCoin'),
    mult: t('boardHelpTileMult', { max: config.maxMultiplier }),
    forward: t('boardHelpTileForward', { n: forwardValue }),
    again: t('boardHelpTileAgain'),
    trap: t('boardHelpTileTrap'),
    goal: t('boardHelpTileGoal', { n: goalValue }),
  }
  const tileName: Record<Exclude<BoardTileKind, 'start'>, string> = {
    coin: t('boardTileCoin'),
    mult: t('boardTileMult'),
    forward: t('boardTileForward'),
    again: t('boardTileAgain'),
    trap: t('boardTileTrap'),
    goal: t('boardTileGoal'),
  }

  return (
    <div className="board-help">
      <h3 className="board-help__title">{t('boardHelpTitle')}</h3>

      <Cell n={1} title={t('boardHelpEnterTitle')}>
        <div className="board-help__figure">
          {[1, 3, 5].map((reel) => (
            <span key={reel} className="board-help__reel">
              {bonusUrl !== undefined ? (
                <img className="board-help__symbol" src={bonusUrl} alt="" width={38} height={38} />
              ) : (
                <svg viewBox="-12 -14 24 30" className="board-help__symbol" aria-hidden="true">
                  <LanternGlyph />
                </svg>
              )}
            </span>
          ))}
        </div>
        <p className="board-help__text">{t('boardHelpEnterText', { n: config.trigger, pay: scatterPay })}</p>
      </Cell>

      <Cell n={2} title={t('boardHelpThrowTitle')}>
        <div className="board-help__figure">
          <ul className="board-help__yut-list">
            {throwRows.map((row) => (
              <li key={row.steps} className="board-help__yut-row">
                <YutSticksStatic flat={yutFaceMask(row.steps, 0)} />
                <span>
                  {t(row.steps === 1 ? 'boardHelpYutRowOne' : 'boardHelpYutRow', {
                    name: t(`boardYutName${row.steps}` as 'boardYutName1'),
                    n: row.steps,
                  })}
                </span>
                {row.extraThrow === true && <span className="board-help__tag">{t('boardHelpAgainTag')}</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="board-help__text">{t('boardHelpThrowText')}</p>
      </Cell>

      <Cell n={3} title={t('boardHelpTilesTitle')}>
        <ul className="board-help__tiles">
          {TILE_ORDER.map((kind) => (
            <li key={kind} className="board-help__tile">
              <svg viewBox="-20 -20 40 40" aria-hidden="true">
                <circle r="18" fill={TILE_FILL[kind].fill} stroke={TILE_FILL[kind].stroke} strokeWidth="1.6" />
                <g transform={kind === 'goal' ? 'scale(0.55) translate(0 4)' : 'scale(0.95)'}>
                  <TileGlyph kind={kind} bonusUrl={kind === 'goal' ? bonusUrl : undefined} />
                </g>
              </svg>
              <span>
                <b>{tileName[kind]}</b> · {tileText[kind]}
              </span>
            </li>
          ))}
        </ul>
      </Cell>

      <Cell n={4} title={t('boardHelpShortcutTitle')}>
        <div className="board-help__figure">
          <MiniBoard math={math} />
        </div>
        <p className="board-help__text">{t('boardHelpShortcutText')}</p>
      </Cell>

      <Cell n={5} title={t('boardHelpEndTitle')}>
        <ul className="board-help__list">
          <li>{t('boardHelpEndThrows')}</li>
          <li>{t('boardHelpEndTraps', { n: config.trapLimit })}</li>
          <li>{t('boardHelpEndGoal')}</li>
          <li>{t('boardHelpEndMax', { n: config.maxThrows })}</li>
        </ul>
      </Cell>

      <Cell n={6} title={t('boardHelpPayTitle')}>
        <p className="board-help__text">{t('boardHelpPayText', { min: config.minPayout, max: config.maxWin })}</p>
        <p className="board-help__text">{t('boardHelpFairText')}</p>
      </Cell>
    </div>
  )
}
