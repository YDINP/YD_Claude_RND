/**
 * 게임 화면 — 상단바(뒤로/게임명/지갑) + 릴 캔버스 + 승리 배너 + 베팅 셀렉터 + 스핀 버튼 +
 * provably fair 시트 + 코인 소진 시트.
 * 스핀 결과와 잔액은 항상 서버 값(store/game.ts의 spin())을 그대로 반영한다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  createSlotRenderer,
  loadTheme,
  type SlotRenderer,
  type Theme,
  type WinTier,
  type RendererEvent,
} from '@tgslot/renderer'
import { createSeededRng, spin as replaySpin } from '@tgslot/slot-engine'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { navigateToLobby } from '../../router'
import { showBackButton, hideBackButton, haptic } from '../../sdk/tma'
import { getRoundSeed } from '../../sdk/api'
import { Odometer } from '../Odometer'
import { useT, useEffectiveLocale } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { winTierLabelKey } from '../../lib/winTier'
import './GameScreen.css'

interface GameScreenProps {
  gameId: string
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

type VerifyState = 'idle' | 'checking' | 'done' | 'error'

interface VerifyResult {
  hashMatch: boolean
  stopsMatch: boolean
}

function stopsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/** math.symbols[id].name을 로케일에 맞춰 고른다. 없으면 심볼 id 그대로 보여준다. */
function symbolLabel(
  symbols: { id: string; name: { en: string; ko?: string } }[],
  symbolId: string,
  locale: string,
): string {
  const symbol = symbols.find((s) => s.id === symbolId)
  if (!symbol) return symbolId
  if (locale === 'ko' && symbol.name.ko) return symbol.name.ko
  return symbol.name.en
}

export function GameScreen({ gameId }: GameScreenProps): ReactNode {
  const t = useT()
  const token = useSessionStore((s) => s.token)
  const wallet = useSessionStore((s) => s.wallet)
  const locale = useEffectiveLocale()
  const gameSummary = useGamesStore((s) => s.games.find((g) => g.id === gameId))

  const jackpotPool = useHubStore((s) => s.jackpot?.pool ?? 0)
  const hubLevelInfo = useHubStore((s) => s.levelInfo)
  const bonusStatus = useHubStore((s) => s.bonusStatus)
  const claimingBonus = useHubStore((s) => s.claimingBonus)
  const claimRescue = useHubStore((s) => s.claimRescue)

  const math = useGameStore((s) => s.math)
  const phase = useGameStore((s) => s.phase)
  const betIndex = useGameStore((s) => s.betIndex)
  const lastResult = useGameStore((s) => s.lastResult)
  const error = useGameStore((s) => s.error)
  const errorCode = useGameStore((s) => s.errorCode)
  const load = useGameStore((s) => s.load)
  const setBet = useGameStore((s) => s.setBet)
  const setRenderer = useGameStore((s) => s.setRenderer)
  const spinAction = useGameStore((s) => s.spin)
  const dismissError = useGameStore((s) => s.dismissError)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [fairSheetOpen, setFairSheetOpen] = useState(false)
  const [helpSheetOpen, setHelpSheetOpen] = useState(false)
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [rendererError, setRendererError] = useState(false)
  /** 배당표에 심볼 이미지를 보여주기 위해 로드된 테마를 들고 있는다. 렌더러 생성 성공 여부와 무관하다. */
  const [theme, setTheme] = useState<Theme | null>(null)

  // 승리 배너 — 렌더러의 winTotal 이벤트가 시작 신호. tier는 렌더러가 계산해 보내주므로
  // 허브는 그대로 받아 라벨만 고르고, 금액만 durationMs에 걸쳐 롤업한다.
  const [winBanner, setWinBanner] = useState<{ tier: WinTier } | null>(null)
  const [winBannerValue, setWinBannerValue] = useState(0)
  const winRafRef = useRef<number | null>(null)
  /** 스테이지 탭으로 카운터를 즉시 목표값으로 점프시키는 플래그. 릴 연출 자체는 건드리지 않는다. */
  const winSkipRef = useRef(false)

  // 게임 진입 시 math.json 로드, 이탈 시 store 초기화.
  useEffect(() => {
    void load(gameId)
    return () => {
      useGameStore.getState().reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  // 텔레그램 네이티브 뒤로가기 버튼 — 로비로 복귀.
  useEffect(() => {
    showBackButton(navigateToLobby)
    return () => hideBackButton()
  }, [])

  // 렌더러 이벤트 — winTotal이 승리 배너를 시작시키고 durationMs에 걸쳐 롤업한다.
  // 등급(tier)은 렌더러가 계산해 함께 보내주므로 허브에서 다시 계산하지 않는다.
  // ref/setState만 사용하므로 렌더러 생성 시점에 캡처돼도 값이 오래돼(stale) 문제되지 않는다.
  function handleRendererEvent(event: RendererEvent): void {
    if (event.type !== 'winTotal') return

    const target = event.totalWin
    const duration = event.durationMs > 0 ? event.durationMs : 1

    winSkipRef.current = false
    if (winRafRef.current !== null) cancelAnimationFrame(winRafRef.current)
    setWinBanner({ tier: event.tier })
    setWinBannerValue(0)

    // 첫 rAF 틱의 timestamp 자체를 기준점으로 삼는다 (Odometer.tsx와 동일한 패턴) —
    // 별도로 `performance.now()`를 부르면 환경에 따라 rAF의 timestamp와 기준이 어긋날 수 있다.
    let startTs: number | null = null
    const step = (ts: number): void => {
      if (winSkipRef.current) {
        setWinBannerValue(target)
        winRafRef.current = null
        return
      }
      if (startTs === null) startTs = ts
      const progress = Math.min(1, (ts - startTs) / duration)
      setWinBannerValue(Math.round(target * progress))
      if (progress < 1) {
        winRafRef.current = requestAnimationFrame(step)
      } else {
        winRafRef.current = null
      }
    }
    winRafRef.current = requestAnimationFrame(step)
  }

  // 새 스핀이 시작되면 이전 승리 배너를 지운다.
  useEffect(() => {
    if (phase !== 'spinning') return
    setWinBanner(null)
    setWinBannerValue(0)
    winSkipRef.current = false
    if (winRafRef.current !== null) {
      cancelAnimationFrame(winRafRef.current)
      winRafRef.current = null
    }
  }, [phase])

  // 언마운트 시 진행 중인 롤업 애니메이션을 정리한다.
  useEffect(() => {
    return () => {
      if (winRafRef.current !== null) cancelAnimationFrame(winRafRef.current)
    }
  }, [])

  /** 승리 연출 중 스테이지를 탭하면 카운터만 목표값으로 즉시 점프한다 — 릴 라인 순환은 그대로 둔다. */
  const handleStageTap = (): void => {
    if (winRafRef.current !== null) winSkipRef.current = true
  }

  // math가 준비되면 테마를 읽고 렌더러를 만든다. 실패해도 서버 스핀 자체는 막지 않는다.
  useEffect(() => {
    if (!math || !containerRef.current) return
    let cancelled = false
    let renderer: SlotRenderer | null = null
    setRendererError(false)
    setTheme(null)

    async function setup(): Promise<void> {
      try {
        const loadedTheme = await loadTheme(`/games/${gameId}`, math ?? undefined)
        if (cancelled || !containerRef.current || !math) return
        // 배당표 시트는 렌더러 생성 성공 여부와 무관하게 심볼 이미지가 필요하므로 먼저 반영한다.
        setTheme(loadedTheme)
        renderer = createSlotRenderer({
          container: containerRef.current,
          math,
          theme: loadedTheme,
          fit: 'window',
          // 마운트 시점 값만 읽는다(구독 아님) — 설정을 바꿔도 이 화면에 있는 동안은 재생성하지
          // 않고, 게임을 나갔다 다시 들어올 때 반영된다. 설정 시트 안내 문구에도 그렇게 적혀 있다.
          reducedMotion: useSettingsStore.getState().reducedMotion,
          onEvent: handleRendererEvent,
        })
        await renderer.ready
        if (cancelled) {
          renderer.destroy()
          return
        }
        setRenderer(renderer)
      } catch (err) {
        // 연출 로딩 실패 — 릴 그래픽 없이도 서버 권위 스핀 버튼은 계속 동작해야 한다.
        // 다만 원인을 콘솔에 남기고 화면에도 비차단 안내를 띄워 다음에 이런 문제가 조용히 묻히지 않게 한다.
        console.error('[game] renderer setup failed', err)
        if (!cancelled) setRendererError(true)
      }
    }

    void setup()

    return () => {
      cancelled = true
      renderer?.destroy()
      setRenderer(null)
    }
  }, [math, gameId, setRenderer])

  useEffect(() => {
    if (lastResult && lastResult.wins.length > 0) haptic('success')
  }, [lastResult])

  const betLevels = math?.betLevels ?? []
  const currentBet = betLevels[betIndex] ?? 0
  const betPerLine = math && math.paylines.length > 0 ? currentBet / math.paylines.length : 0
  const isBusy = phase === 'spinning' || phase === 'showingWin'

  const title = gameSummary ? (locale === 'ko' && gameSummary.name.ko ? gameSummary.name.ko : gameSummary.name.en) : gameId

  const handleSpin = (): void => {
    if (isBusy || !math) return
    haptic('medium')
    void spinAction()
  }

  const handleBetDec = (): void => {
    if (betLevels.length === 0) return
    if (errorCode === 'BET_LOCKED') dismissError()
    setBet((betIndex - 1 + betLevels.length) % betLevels.length)
  }

  const handleBetInc = (): void => {
    if (betLevels.length === 0) return
    if (errorCode === 'BET_LOCKED') dismissError()
    setBet((betIndex + 1) % betLevels.length)
  }

  const handleRescueClaim = async (): Promise<void> => {
    const result = await claimRescue()
    if (result) dismissError()
  }

  const handleRevealSeed = async (): Promise<void> => {
    if (!lastResult || !token || !math) return
    setVerifyState('checking')
    setVerifyResult(null)
    try {
      const seedInfo = await getRoundSeed(token, lastResult.roundId)
      const hashMatch = (await sha256Hex(seedInfo.seed)) === lastResult.seedHash

      // 서버가 공개한 seedInput으로 스핀을 그대로 재생해 릴 정지 위치까지 검증한다.
      const rng = createSeededRng(seedInfo.seedInput)
      const replay = replaySpin(math, { totalBet: lastResult.totalBet }, rng)
      const stopsMatch = stopsEqual(replay.stops, seedInfo.stops)

      setVerifyResult({ hashMatch, stopsMatch })
      setVerifyState('done')
    } catch (err) {
      console.error('[game] provably fair verification failed', err)
      setVerifyState('error')
    }
  }

  const openFairSheet = (): void => {
    setVerifyState('idle')
    setVerifyResult(null)
    setFairSheetOpen(true)
  }

  if (phase === 'error' && errorCode !== 'INSUFFICIENT_FUNDS') {
    return (
      <div className="hub-game-screen hub-game-screen--error">
        <button
          type="button"
          className="hub-game-screen__back hub-game-screen__back--standalone"
          onClick={navigateToLobby}
          aria-label={t('back')}
        >
          ←
        </button>
        <p className="hub-game-screen__error-message">{error ?? t('gameLoadError')}</p>
        <button type="button" className="hub-game-screen__retry" onClick={() => void load(gameId)}>
          {t('errorRetry')}
        </button>
      </div>
    )
  }

  return (
    <div className="hub-game-screen">
      <div className="hub-game-screen__topbar">
        <button
          type="button"
          className="hub-game-screen__back"
          onClick={navigateToLobby}
          aria-label={t('back')}
        >
          ←
        </button>
        <span className="hub-game-screen__title">{title}</span>
        <span className="hub-game-screen__jackpot-pill" aria-label={t('jackpot')}>
          <span aria-hidden="true">🎰</span>
          <Odometer value={jackpotPool} />
        </span>
        <button
          type="button"
          className="hub-game-screen__icon-btn"
          onClick={() => setHelpSheetOpen(true)}
          disabled={!math}
          aria-label={t('help')}
        >
          ?
        </button>
        <span className="hub-game-screen__wallet-pill" aria-label={t('coins')}>
          <span aria-hidden="true">🪙</span>
          <Odometer value={wallet?.coins ?? 0} />
        </span>
      </div>

      <div
        className="hub-game-screen__stage"
        data-phase={phase}
        onClick={handleStageTap}
      >
        <div ref={containerRef} className="hub-game-screen__canvas" />
        {phase === 'loading' && <div className="hub-game-screen__loading">{t('loading')}</div>}
        {rendererError && (
          <div className="hub-game-screen__renderer-note" role="status">
            {t('graphicsUnavailable')}
          </div>
        )}
        <div className="hub-game-screen__banners">
          {lastResult?.jackpotWin !== undefined && (
            <div className="hub-game-screen__win-banner hub-game-screen__win-banner--jackpot">
              <span className="hub-game-screen__jackpot-win-label">{t('jackpotWin')}</span>
              <Odometer className="hub-game-screen__win-value" value={lastResult.jackpotWin} />
            </div>
          )}
          {lastResult?.levelUp && (
            <div className="hub-game-screen__win-banner hub-game-screen__win-banner--levelup">
              <span className="hub-game-screen__level-up-label">
                {t('levelUp', { from: lastResult.levelUp.from, to: lastResult.levelUp.to })}
              </span>
              {lastResult.levelUp.bonus > 0 && (
                <span className="hub-game-screen__win-label">
                  +{lastResult.levelUp.bonus.toLocaleString('en-US')} 🪙
                </span>
              )}
            </div>
          )}
          {winBanner && (
            <div className={`hub-game-screen__win-banner hub-game-screen__win-banner--${winBanner.tier}`}>
              <span className="hub-game-screen__win-tier-label">{t(winTierLabelKey(winBanner.tier))}</span>
              {/* 일반 Odometer(자체 600ms 스무딩)를 쓰지 않는다 — 아래 rAF 롤업 자체가 이미
                  "숫자가 올라가는" 연출이라 이중으로 겹치면 오히려 굼떠 보인다. */}
              <span className="hub-game-screen__win-value">{winBannerValue.toLocaleString('en-US')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="hub-game-screen__controls">
        <div className="hub-game-screen__controls-row">
          <div className="hub-game-screen__bet">
            <button
              type="button"
              className="hub-game-screen__bet-btn"
              onClick={handleBetDec}
              disabled={isBusy || betLevels.length === 0}
              aria-label="-"
            >
              −
            </button>
            <div className="hub-game-screen__bet-display">
              <span className="hub-game-screen__bet-label">{t('bet')}</span>
              <span className="hub-game-screen__bet-value">{currentBet}</span>
            </div>
            <button
              type="button"
              className="hub-game-screen__bet-btn"
              onClick={handleBetInc}
              disabled={isBusy || betLevels.length === 0}
              aria-label="+"
            >
              +
            </button>
          </div>

          <button type="button" className="hub-game-screen__spin" onClick={handleSpin} disabled={isBusy || !math}>
            {t('spin')}
          </button>
        </div>

        {errorCode === 'BET_LOCKED' && (
          <p className="hub-game-screen__bet-hint" role="alert">
            {t('betLockedHint', { maxBet: (hubLevelInfo?.maxBet ?? 0).toLocaleString('en-US') })}
          </p>
        )}
      </div>

      {errorCode === 'INSUFFICIENT_FUNDS' && (
        <div className="hub-sheet-backdrop" role="presentation" onClick={dismissError}>
          <div
            className="hub-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="hub-sheet__title">{t('outOfCoinsTitle')}</h2>
            <p className="hub-sheet__message">{t('outOfCoinsMessage')}</p>
            {bonusStatus?.rescue.claimable && (
              <button
                type="button"
                className="hub-sheet__reveal"
                onClick={() => void handleRescueClaim()}
                disabled={claimingBonus === 'rescue'}
              >
                {t('rescueBonus')} · +{bonusStatus.rescue.amount.toLocaleString('en-US')} 🪙
              </button>
            )}
            <button type="button" className="hub-sheet__close" onClick={dismissError}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {fairSheetOpen && lastResult && (
        <div className="hub-sheet-backdrop" role="presentation" onClick={() => setFairSheetOpen(false)}>
          <div
            className="hub-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="hub-sheet__title">{t('provablyFair')}</h2>
            <dl className="hub-sheet__fair-list">
              <dt>{t('provablyFairSeedHash')}</dt>
              <dd className="hub-sheet__mono">{lastResult.seedHash}</dd>
              <dt>{t('provablyFairNonce')}</dt>
              <dd className="hub-sheet__mono">{lastResult.nonce}</dd>
            </dl>
            <button
              type="button"
              className="hub-sheet__reveal"
              onClick={() => void handleRevealSeed()}
              disabled={verifyState === 'checking'}
            >
              {t('revealSeed')}
            </button>
            {verifyState === 'checking' && <p className="hub-sheet__verify-status">{t('verifying')}</p>}
            {verifyState === 'done' && verifyResult && (
              <>
                <p
                  className={
                    verifyResult.hashMatch
                      ? 'hub-sheet__verify-status hub-sheet__verify-status--ok'
                      : 'hub-sheet__verify-status hub-sheet__verify-status--fail'
                  }
                >
                  {verifyResult.hashMatch ? '✓' : '✗'} {t('fairVerifyHash')}:{' '}
                  {verifyResult.hashMatch ? t('fairVerifyOk') : t('fairVerifyFail')}
                </p>
                <p
                  className={
                    verifyResult.stopsMatch
                      ? 'hub-sheet__verify-status hub-sheet__verify-status--ok'
                      : 'hub-sheet__verify-status hub-sheet__verify-status--fail'
                  }
                >
                  {verifyResult.stopsMatch ? '✓' : '✗'} {t('fairVerifyStops')}:{' '}
                  {verifyResult.stopsMatch ? t('fairVerifyOk') : t('fairVerifyFail')}
                </p>
              </>
            )}
            {verifyState === 'error' && (
              <p className="hub-sheet__verify-status hub-sheet__verify-status--fail">✗ {t('verifyError')}</p>
            )}
            <button type="button" className="hub-sheet__close" onClick={() => setFairSheetOpen(false)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {helpSheetOpen && math && (
        <div className="hub-sheet-backdrop" role="presentation" onClick={() => setHelpSheetOpen(false)}>
          <div
            className="hub-sheet"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="hub-sheet__title">{t('help')}</h2>
            <div className="hub-sheet__scroll">
              <h3 className="hub-sheet__subtitle">{t('paytableTitle')}</h3>
              <p className="hub-paytable__bet-per-line">{t('betPerLine', { amount: betPerLine })}</p>
              <ul className="hub-paytable__list">
                {Object.entries(math.paytable).map(([symbolId, payrule]) => {
                  const label = symbolLabel(math.symbols, symbolId, locale)
                  const counts = Object.keys(payrule)
                    .map(Number)
                    .sort((a, b) => a - b)
                  const symbolImage = theme?.symbols[symbolId]
                  return (
                    <li key={symbolId} className="hub-paytable__row">
                      {symbolImage ? (
                        <img
                          className="hub-paytable__symbol-img"
                          src={symbolImage}
                          alt={label}
                          width={40}
                          height={40}
                        />
                      ) : (
                        <span className="hub-paytable__symbol-fallback" aria-hidden="true">
                          {label}
                        </span>
                      )}
                      <div className="hub-paytable__chips">
                        {counts.map((count) => (
                          <span key={count} className="hub-paytable__chip">
                            {count}: ×{payrule[count]}
                          </span>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {math.wild && <p className="hub-paytable__wild-note">{t('wildSubstitutesAll')}</p>}

              <h3 className="hub-sheet__subtitle">{t('paylinesTitle')}</h3>
              <div className="hub-paylines__grid-list">
                {math.paylines.map((line, index) => (
                  <div key={index} className="hub-paylines__item">
                    <div
                      className="hub-paylines__mini-grid"
                      style={{
                        gridTemplateColumns: `repeat(${math.reels}, 1fr)`,
                        gridTemplateRows: `repeat(${math.rows}, 1fr)`,
                      }}
                    >
                      {Array.from({ length: math.rows * math.reels }, (_, cellIndex) => {
                        const row = Math.floor(cellIndex / math.reels)
                        const reel = cellIndex % math.reels
                        const active = line[reel] === row
                        return (
                          <span
                            key={cellIndex}
                            className={
                              active ? 'hub-paylines__cell hub-paylines__cell--active' : 'hub-paylines__cell'
                            }
                          />
                        )
                      })}
                    </div>
                    <span className="hub-paylines__number">{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="hub-sheet__footer-link"
              onClick={() => {
                setHelpSheetOpen(false)
                openFairSheet()
              }}
              disabled={!lastResult}
            >
              {t('provablyFair')}
            </button>
            <button type="button" className="hub-sheet__close" onClick={() => setHelpSheetOpen(false)}>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
