import type { GamePack } from '../games.js'
import { compactCount, num, pct } from '../lib/format.js'

/** 몬테카를로 스핀 수 선택지. */
export const SPIN_CHOICES = [100_000, 1_000_000, 5_000_000] as const

export interface GateChip {
  key: string
  label: string
  state: 'pass' | 'fail' | 'idle'
}

export interface LeftPanelProps {
  packs: GamePack[]
  gameId: string
  onGameChange: (id: string) => void
  betLevels: number[]
  totalBet: number
  onBetChange: (bet: number) => void
  spins: number
  onSpinsChange: (spins: number) => void
  seed: string
  onSeedChange: (seed: string) => void
  onRunExact: () => void
  onRunMc: () => void
  onCancel: () => void
  onExport: () => void
  busy: { phase: string; ratio: number } | null
  exactDone: boolean
  exportReady: boolean
  chips: GateChip[]
  error: string | null
}

export function LeftPanel(props: LeftPanelProps) {
  const running = props.busy !== null

  return (
    <aside className="sim-panel">
      <div className="sim-brand">
        SLOT SIM
        <small>RTP 검수 시뮬레이터</small>
      </div>

      <div className="sim-field">
        <label htmlFor="sim-game">게임</label>
        <select
          id="sim-game"
          value={props.gameId}
          onChange={(event) => props.onGameChange(event.target.value)}
          disabled={running}
        >
          {props.packs.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label} ({pack.id})
            </option>
          ))}
        </select>
      </div>

      <div className="sim-field">
        <label htmlFor="sim-bet">베팅 레벨 (총 베팅액)</label>
        <select
          id="sim-bet"
          value={props.totalBet}
          onChange={(event) => props.onBetChange(Number(event.target.value))}
          disabled={running}
        >
          {props.betLevels.map((level) => (
            <option key={level} value={level}>
              {num(level)} 코인
            </option>
          ))}
        </select>
      </div>

      <div className="sim-field">
        <label htmlFor="sim-spins">몬테카를로 스핀 수</label>
        <select
          id="sim-spins"
          value={props.spins}
          onChange={(event) => props.onSpinsChange(Number(event.target.value))}
          disabled={running}
        >
          {SPIN_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {compactCount(choice)} 스핀
            </option>
          ))}
        </select>
      </div>

      <div className="sim-field">
        <label htmlFor="sim-seed">시드</label>
        <input
          id="sim-seed"
          value={props.seed}
          onChange={(event) => props.onSeedChange(event.target.value)}
          disabled={running}
          spellCheck={false}
        />
      </div>

      <button type="button" className="sim-button" onClick={props.onRunExact} disabled={running}>
        전수조사 실행
      </button>
      <button type="button" className="sim-button" onClick={props.onRunMc} disabled={running}>
        시뮬레이션 실행
      </button>
      {running && (
        <button type="button" className="sim-button sim-button--ghost" onClick={props.onCancel}>
          중단
        </button>
      )}
      <button
        type="button"
        className="sim-button sim-button--ghost"
        onClick={props.onExport}
        disabled={!props.exportReady || running}
        title={props.exportReady ? '검수 리포트를 마크다운으로 내려받는다' : '전수조사와 시뮬레이션을 모두 실행해야 한다'}
      >
        검수 결과 내보내기
      </button>

      {props.busy !== null && (
        <div className="sim-progress">
          {props.busy.phase} {Math.round(props.busy.ratio * 100)}%
          <div className="sim-progress-bar">
            <div style={{ width: `${Math.round(props.busy.ratio * 100)}%` }} />
          </div>
        </div>
      )}

      {props.error !== null && (
        <div className="sim-chip sim-chip--fail sim-chip--block" role="alert">
          ❌ {props.error}
        </div>
      )}

      <div>
        <div className="sim-kpi-label" style={{ marginBottom: 'var(--sim-space-xs)' }}>
          게이트 요약
        </div>
        <div className="sim-chips">
          {props.chips.map((chip) => (
            <span key={chip.key} className={`sim-chip${chip.state === 'idle' ? '' : ` sim-chip--${chip.state}`}`}>
              {chip.state === 'pass' ? '✅' : chip.state === 'fail' ? '❌' : '·'} {chip.label}
            </span>
          ))}
        </div>
        {!props.exactDone && (
          <p className="sim-progress" style={{ marginTop: 'var(--sim-space-sm)' }}>
            전수조사를 실행하면 판정이 채워진다.
          </p>
        )}
      </div>
    </aside>
  )
}

/** 목표 RTP 허용 오차 표기용. */
export function toleranceLabel(tolerance: number): string {
  return `±${pct(tolerance, 1)}p`
}
