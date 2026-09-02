import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSampleSpinner } from '@tgslot/rtp-sim/audit'
import type { SampleSpin } from '@tgslot/rtp-sim/audit'
import type { GameMath } from '@tgslot/slot-engine'
import { mult, num } from '../lib/format.js'

/** 처음 보여 줄 스핀 개수. */
export const INITIAL_SAMPLE_SPINS = 20

export interface SampleSpinsProps {
  math: GameMath
  totalBet: number
  seed: string
}

/**
 * 시드로 뽑은 스핀 목록. 연출은 없다 — 격자와 승리 라인을 그대로 찍어 보여 준다.
 * 같은 시드·베팅액이면 CLI와 완전히 같은 순서가 나온다.
 */
export function SampleSpins({ math, totalBet, seed }: SampleSpinsProps) {
  const spinner = useMemo(() => createSampleSpinner(math, totalBet, seed), [math, totalBet, seed])
  const [spins, setSpins] = useState<SampleSpin[]>([])

  const fill = useCallback(() => {
    setSpins(Array.from({ length: INITIAL_SAMPLE_SPINS }, () => spinner()))
  }, [spinner])

  useEffect(() => {
    setSpins(Array.from({ length: INITIAL_SAMPLE_SPINS }, () => spinner()))
  }, [spinner])

  const wins = spins.filter((spin) => spin.totalWin > 0).length
  const paid = spins.reduce((acc, spin) => acc + spin.totalWin, 0)

  return (
    <section className="sim-section">
      <h2>샘플 스핀</h2>
      <div className="sim-toolbar">
        <button type="button" className="sim-button" onClick={() => setSpins((prev) => [...prev, spinner()])}>
          스핀 1회
        </button>
        <button type="button" className="sim-button sim-button--ghost" onClick={fill}>
          {INITIAL_SAMPLE_SPINS}회 다시 뽑기
        </button>
        <span className="sim-progress">
          시드 <span className="sim-mono">{seed}</span> · 베팅 <span className="sim-mono">{num(totalBet)}</span> ·{' '}
          {spins.length}회 중 {wins}회 적중 · 누적 지급 <span className="sim-mono">{num(paid)}</span> 코인
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

function SpinCard({ spin, math }: { spin: SampleSpin; math: GameMath }) {
  const winning = new Set(spin.winningCells)
  return (
    <article className={`sim-spin${spin.totalWin > 0 ? ' sim-spin--win' : ''}`}>
      <header className="sim-spin-head">
        <span>#{spin.index}</span>
        <span className="sim-spin-win">
          {spin.totalWin > 0 ? `+${num(spin.totalWin)} (${mult(spin.multiplier)})` : '꽝'}
        </span>
      </header>

      <div className="sim-grid" style={{ gridTemplateColumns: `repeat(${math.reels}, 1fr)` }}>
        {spin.grid.map((row, rowIndex) =>
          row.map((symbol, reelIndex) => (
            <div
              key={`${rowIndex}-${reelIndex}`}
              className={`sim-cell${winning.has(`${reelIndex},${rowIndex}`) ? ' sim-cell--win' : ''}`}
            >
              {symbol}
            </div>
          )),
        )}
      </div>

      {spin.wins.length > 0 && (
        <ul className="sim-spin-lines">
          {spin.wins.map((win) => (
            <li key={`${win.line}-${win.symbol}`}>
              라인 #{win.line} · {win.symbol}
              {win.group === undefined ? '' : ` (${win.group})`} x{win.count} → {win.multiplier}x = {num(win.win)}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
