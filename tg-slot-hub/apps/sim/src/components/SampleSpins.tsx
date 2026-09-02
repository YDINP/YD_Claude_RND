import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSampleSpinner } from '@tgslot/rtp-sim/audit'
import type { SampleSpin } from '@tgslot/rtp-sim/audit'
import type { GameMath } from '@tgslot/slot-engine'
import { mult, num } from '../lib/format.js'

/** 처음 보여 줄 라운드 수. 프리스핀이 붙으면 화면의 스핀 수는 이보다 많아진다. */
export const INITIAL_SAMPLE_ROUNDS = 20

/**
 * "프리스핀 나올 때까지" 버튼이 훑을 라운드 상한.
 * 트리거 확률이 1~2%인 게임에서 20라운드만 보면 프리스핀을 거의 못 본다.
 * 그렇다고 무한정 돌 수는 없으므로 상한을 둔다.
 */
export const MAX_TRIGGER_SEARCH_ROUNDS = 5000

export interface SampleSpinsProps {
  math: GameMath
  totalBet: number
  seed: string
}

/**
 * 시드로 뽑은 라운드 목록. 연출은 없다 — 격자와 승리 라인을 그대로 찍어 보여 준다.
 * 프리스핀이 열리면 그 세션도 이어서 보여 준다. 같은 시드·베팅액이면 CLI와 같은 순서가 나온다.
 */
export function SampleSpins({ math, totalBet, seed }: SampleSpinsProps) {
  const spinner = useMemo(() => createSampleSpinner(math, totalBet, seed), [math, totalBet, seed])
  const [spins, setSpins] = useState<SampleSpin[]>([])

  const fill = useCallback(() => {
    const next: SampleSpin[] = []
    for (let i = 0; i < INITIAL_SAMPLE_ROUNDS; i += 1) next.push(...spinner())
    setSpins(next)
  }, [spinner])

  useEffect(() => {
    const next: SampleSpin[] = []
    for (let i = 0; i < INITIAL_SAMPLE_ROUNDS; i += 1) next.push(...spinner())
    setSpins(next)
  }, [spinner])

  const hasFreeSpins = math.scatter?.freeSpins !== undefined

  /** 프리스핀 세션이 나올 때까지 라운드를 이어 뽑는다. 나온 라운드는 전부 목록에 남긴다. */
  const findFreeSpins = useCallback(() => {
    const collected: SampleSpin[] = []
    let found = false
    for (let i = 0; i < MAX_TRIGGER_SEARCH_ROUNDS && !found; i += 1) {
      const round = spinner()
      collected.push(...round)
      found = round.some((entry) => entry.isFreeSpin)
    }
    setSpins((prev) => [...prev, ...collected])
  }, [spinner])

  const paidSpins = spins.filter((spin) => !spin.isFreeSpin).length
  const freeSpins = spins.length - paidSpins
  const wins = spins.filter((spin) => spin.totalWin > 0).length
  const paid = spins.reduce((acc, spin) => acc + spin.totalWin, 0)

  return (
    <section className="sim-section">
      <h2>샘플 스핀</h2>
      <div className="sim-toolbar">
        <button type="button" className="sim-button" onClick={() => setSpins((prev) => [...prev, ...spinner()])}>
          스핀 1회
        </button>
        <button type="button" className="sim-button sim-button--ghost" onClick={fill}>
          {INITIAL_SAMPLE_ROUNDS}라운드 다시 뽑기
        </button>
        {hasFreeSpins && (
          <button type="button" className="sim-button sim-button--ghost" onClick={findFreeSpins}>
            프리스핀 나올 때까지
          </button>
        )}
        <span className="sim-progress">
          시드 <span className="sim-mono">{seed}</span> · 베팅 <span className="sim-mono">{num(totalBet)}</span> ·{' '}
          유료 {paidSpins}회
          {freeSpins > 0 ? ` + 프리스핀 ${freeSpins}회` : ''} · {wins}회 적중 · 누적 지급{' '}
          <span className="sim-mono">{num(paid)}</span> 코인
        </span>
      </div>

      <div className="sim-spins">
        {spins.map((spin) => (
          <SpinCard key={spin.index} spin={spin} math={math} />
        ))}
      </div>
    </section>
  )
}

function Grid({
  grid,
  reels,
  winning,
  changed,
}: {
  grid: string[][]
  reels: number
  winning?: Set<string>
  changed?: Set<string>
}) {
  return (
    <div className="sim-grid" style={{ gridTemplateColumns: `repeat(${reels}, 1fr)` }}>
      {grid.map((row, rowIndex) =>
        row.map((symbol, reelIndex) => {
          const key = `${reelIndex},${rowIndex}`
          const classNames = ['sim-cell']
          if (winning?.has(key) === true) classNames.push('sim-cell--win')
          if (changed?.has(key) === true) classNames.push('sim-cell--changed')
          return (
            <div key={`${rowIndex}-${reelIndex}`} className={classNames.join(' ')}>
              {symbol}
            </div>
          )
        }),
      )}
    </div>
  )
}

function SpinCard({ spin, math }: { spin: SampleSpin; math: GameMath }) {
  const winning = new Set(spin.winningCells)
  const changedCells = new Set(spin.mutations.flatMap((event) => event.cells))
  const classNames = ['sim-spin']
  if (spin.totalWin > 0) classNames.push('sim-spin--win')
  if (spin.isFreeSpin) classNames.push('sim-spin--free')

  return (
    <article className={classNames.join(' ')}>
      <header className="sim-spin-head">
        <span>
          #{spin.index}
          <span className="sim-spin-round"> R{spin.round}</span>
          {spin.isFreeSpin && <span className="sim-badge sim-badge--free">프리스핀 {spin.winMultiplier}x</span>}
        </span>
        <span className="sim-spin-win">
          {spin.totalWin > 0 ? `+${num(spin.totalWin)} (${mult(spin.multiplier)})` : '꽝'}
        </span>
      </header>

      {spin.mutations.length > 0 ? (
        <div className="sim-grid-pair">
          <div>
            <div className="sim-grid-caption">변형 전</div>
            <Grid grid={spin.gridBefore} reels={math.reels} changed={changedCells} />
          </div>
          <div className="sim-grid-arrow" aria-hidden="true">
            ▶
          </div>
          <div>
            <div className="sim-grid-caption">변형 후</div>
            <Grid grid={spin.grid} reels={math.reels} winning={winning} changed={changedCells} />
          </div>
        </div>
      ) : (
        <Grid grid={spin.grid} reels={math.reels} winning={winning} />
      )}

      {(spin.wins.length > 0 || spin.scatterWin > 0 || spin.freeSpinsAwarded > 0 || spin.mutations.length > 0) && (
        <ul className="sim-spin-lines">
          {spin.mutations.map((event) => (
            <li key={`${event.type}-${event.cells.join()}`} className="sim-mutation-line">
              {event.type}
              {event.symbol === undefined ? '' : ` → ${event.symbol}`}
              {event.reels === undefined ? '' : ` (릴 ${event.reels.join(', ')})`} · {event.cells.length}칸
            </li>
          ))}
          {spin.wins.map((win) => (
            <li key={`${win.line}-${win.symbol}-${win.ways ?? 'l'}`}>
              {win.ways === undefined ? `라인 #${win.line}` : `${win.ways} ways`} · {win.symbol}
              {win.group === undefined ? '' : ` (${win.group})`} x{win.count} → {win.multiplier}x ={' '}
              {num(win.win * spin.winMultiplier)}
            </li>
          ))}
          {spin.scatterWin > 0 && (
            <li>
              스캐터 {spin.scatterCount}개 → {num(spin.scatterWin)}
            </li>
          )}
          {spin.freeSpinsAwarded > 0 && <li>프리스핀 {spin.freeSpinsAwarded}회 획득</li>}
        </ul>
      )}
    </article>
  )
}
