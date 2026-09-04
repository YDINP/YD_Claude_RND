/**
 * 개발자 디버그 패널 — `debug=1`(URL/해시 쿼리) 또는 localStorage, 또는 게임 제목 5탭 제스처로만
 * 뜨는 도구다(디버그 플래그 자체는 apps/hub/src/lib/debugFlag.ts가 판정한다). 절대 기본으로
 * 보이면 안 되므로 이 컴포넌트는 GameScreen이 `debugEnabled`일 때만 마운트한다.
 *
 * 기능:
 *  (a) 프리셋 버튼 — 다음 한 판만 강제할 결과를 store에 무장한다(GameScreen이 setDebugPreset을
 *      호출). 원샷이라 spin()이 요청을 보내는 순간 store가 알아서 비운다.
 *  (b) "연출 다시 재생" — 마지막 결과로 showWins()를 다시 튼다(부모가 onReplay로 넘겨준다).
 *  (c) 마지막 스핀 타이밍(store가 spin() 흐름 안에서 기록한 값).
 *  (d) 마지막 SpinResponse JSON — 복사 버튼 포함.
 *  (e) 지금 phase/프리스핀/더블업 세션 요약.
 */
import { useState, type ReactNode } from 'react'
import type { FreeSpinsState, SpinResponse } from '@tgslot/shared'
import type { GambleSession, GamePhase, SpinTiming } from '../../store/game'
import type { DebugPreset } from '../../lib/debugPreset'
import { DEBUG_PRESETS } from '../../lib/debugPreset'
import { Modal } from '../Modal'
import { useT, type TranslationKey } from '../../i18n'
import './DebugPanel.css'

const PRESET_LABEL_KEY: Record<DebugPreset, TranslationKey> = {
  win: 'debugPresetWin',
  bigWin: 'debugPresetBigWin',
  freeSpins: 'debugPresetFreeSpins',
  gamble: 'debugPresetGamble',
  lose: 'debugPresetLose',
}

interface DebugPanelProps {
  onClose: () => void
  armedPreset: DebugPreset | null
  onSetPreset: (preset: DebugPreset | null) => void
  /** 스핀 중이거나 승리 연출 중이면 프리셋/재생 버튼을 잠깐 잠근다. */
  busy: boolean
  onReplay: () => void
  canReplay: boolean
  timing: SpinTiming | null
  lastResult: SpinResponse | null
  lastSpinDebug: { preset: DebugPreset; triesUsed: number } | null
  phase: GamePhase
  freeSpins: FreeSpinsState | null
  gambleSession: GambleSession | null
}

function formatMs(ms: number | null): string {
  return ms === null ? '—' : `${ms.toLocaleString('en-US')} ms`
}

export function DebugPanel({
  onClose,
  armedPreset,
  onSetPreset,
  busy,
  onReplay,
  canReplay,
  timing,
  lastResult,
  lastSpinDebug,
  phase,
  freeSpins,
  gambleSession,
}: DebugPanelProps): ReactNode {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const responseJson = lastResult ? JSON.stringify(lastResult, null, 2) : null

  async function handleCopy(): Promise<void> {
    if (!responseJson) return
    try {
      await navigator.clipboard.writeText(responseJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      // 클립보드 권한이 없는 환경(일부 브라우저/webview) — 복사만 실패할 뿐 패널은 계속 쓸 수 있다.
      console.error('[debug-panel] clipboard write failed', err)
    }
  }

  return (
    <Modal onClose={onClose} titleId="hub-debug-panel-title">
      <h2 id="hub-debug-panel-title" className="hub-sheet__title">
        {t('debugPanelTitle')}
      </h2>

      <section className="hub-debug-panel__section">
        <h3 className="hub-sheet__subtitle">{t('debugPresetsTitle')}</h3>
        <div className="hub-debug-panel__presets">
          {DEBUG_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={
                armedPreset === preset
                  ? 'hub-debug-panel__preset-btn hub-debug-panel__preset-btn--armed'
                  : 'hub-debug-panel__preset-btn'
              }
              disabled={busy}
              onClick={() => onSetPreset(armedPreset === preset ? null : preset)}
            >
              {t(PRESET_LABEL_KEY[preset])}
            </button>
          ))}
        </div>
        {armedPreset && (
          <p className="hub-debug-panel__armed-note" role="status">
            {t('debugPresetArmedBadge', { preset: t(PRESET_LABEL_KEY[armedPreset]) })}
          </p>
        )}
      </section>

      <section className="hub-debug-panel__section">
        <button
          type="button"
          className="hub-sheet__reveal"
          onClick={onReplay}
          disabled={!canReplay || busy}
        >
          {t('debugReplayWins')}
        </button>
        {!canReplay && <p className="hub-debug-panel__hint">{t('debugReplayNone')}</p>}
      </section>

      <section className="hub-debug-panel__section">
        <h3 className="hub-sheet__subtitle">{t('debugTimingTitle')}</h3>
        <dl className="hub-debug-panel__timing">
          <dt>{t('debugTimingRequest')}</dt>
          <dd>{timing ? formatMs(timing.requestMs) : '—'}</dd>
          <dt>{t('debugTimingReelToWin')}</dt>
          <dd>{timing ? formatMs(timing.reelStopToWinStartMs) : '—'}</dd>
          <dt>{t('debugTimingFirstPass')}</dt>
          <dd>{timing ? formatMs(timing.firstPassMs) : '—'}</dd>
        </dl>
        {lastSpinDebug && (
          <p className="hub-debug-panel__hint">
            {t('debugAppliedPreset', {
              preset: t(PRESET_LABEL_KEY[lastSpinDebug.preset]),
              tries: lastSpinDebug.triesUsed,
            })}
          </p>
        )}
      </section>

      <section className="hub-debug-panel__section">
        <h3 className="hub-sheet__subtitle">{t('debugStateTitle')}</h3>
        <p className="hub-debug-panel__state-line">{t('debugStatePhase', { phase })}</p>
        <p className="hub-debug-panel__state-line">
          {freeSpins
            ? t('debugStateFreeSpins', { left: freeSpins.left, total: freeSpins.total, multiplier: freeSpins.multiplier })
            : t('debugStateFreeSpinsNone')}
        </p>
        <p className="hub-debug-panel__state-line">
          {gambleSession
            ? t('debugStateGamble', {
                amount: gambleSession.pendingWin.toLocaleString('en-US'),
                steps: gambleSession.stepsLeft,
              })
            : t('debugStateGambleNone')}
        </p>
      </section>

      <section className="hub-debug-panel__section">
        <div className="hub-debug-panel__response-header">
          <h3 className="hub-sheet__subtitle">{t('debugResponseTitle')}</h3>
          {responseJson && (
            <button type="button" className="hub-debug-panel__copy-btn" onClick={() => void handleCopy()}>
              {copied ? t('debugResponseCopied') : t('debugResponseCopy')}
            </button>
          )}
        </div>
        {responseJson ? (
          <pre className="hub-debug-panel__json">{responseJson}</pre>
        ) : (
          <p className="hub-debug-panel__hint">{t('debugResponseNone')}</p>
        )}
      </section>

      <button type="button" className="hub-sheet__close" onClick={onClose}>
        {t('close')}
      </button>
    </Modal>
  )
}
