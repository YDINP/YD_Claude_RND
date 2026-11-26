/**
 * 말판 보너스 화면 — HUD(기회·등불·배수·바구니) + 윷판 + 결과 글자 + 윷가락 + «지금 끝나면 N배» + 버튼 + 요약 카드.
 *
 * 값의 주인은 서버다. 이 화면은 트리거 스핀 응답에 실려 온 말판 전체(`feature`)를 던지기 하나씩 보여 줄 뿐이고,
 * 순서·길이는 순수 상태 기계(`game/boardFlow.ts`)가 정한다. 탭·자동·빨리 감기는 속도만 바꾸고 결과는 못 바꾼다 —
 * HUD 숫자는 전부 `boardViewAfter(feature, shown)`에서 읽는다(서버 기록 그대로).
 *
 * 이 컴포넌트가 하는 일은 «효과 실행»이다: 상태 기계가 내놓는 효과(윷 던지기·말 이동·칸 효과·요약)를 소리와
 * 애니메이션으로 옮기고, 타이머 하나로 `tick`을 되돌려 보낸다. 타이머·WAAPI·이펙트 풀은 언마운트 때 전부 거둔다.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { BoardBonusFeature } from '@tgslot/shared'
import type { BoardBonusConfig } from '@tgslot/slot-engine'
import { useT } from '../../../i18n'
import { haptic } from '../../../sdk/tma'
import {
  boardEndsNowPayout,
  boardViewAfter,
  lanternsLit,
  mostValuableLanding,
  previewLandings,
} from '../../../game/boardPlayback'
import {
  boardFlowReducer,
  boardTimingsFor,
  createBoardFlow,
  planBoardThrows,
  subPhaseMs,
  type BoardFlowEffect,
  type BoardFlowEvent,
  type BoardFlowState,
} from '../../../game/boardFlow'
import type { SpinSpeed } from '../../../store/settings'
import { useWinRollup } from '../WinCelebration'
import { BoardMap, type BoardMapHandle, type NodeEffect } from './BoardMap'
import { YutThrow, type YutThrowHandle } from './YutThrow'
import { CoinGlyph, LanternGlyph } from './tileIcons'
import { createFxPool, punch, shake, type FxPool } from './boardFx'
import { boardSfx } from './boardSfx'
import type { BoardLayout } from './yutLayout'
import './BoardBonus.css'

/** 첫 진입 때만 2초 보이는 안내 말풍선의 기억 키. */
const HINT_KEY = 'tgslot.boardHint'

function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

function writeHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    /* 저장소를 못 써도 안내가 한 번 더 뜰 뿐이다 */
  }
}

export interface BoardBonusProps {
  feature: BoardBonusFeature
  config: BoardBonusConfig
  layout: BoardLayout
  totalBet: number
  /** 이 게임 심볼 그림(말·결승 탑). */
  symbols: Record<string, string> | undefined
  /** 말판 배경(테마 `backgroundFreeSpins`). 없으면 코드로 칠한 바탕. */
  bgUrl: string | undefined
  speed: SpinSpeed
  reducedMotion: boolean
  /** 오토스핀 중 진입하면 자동 재생으로 시작한다. */
  auto: boolean
  /** 복원: 이만큼 보여 준 상태에서 이어 간다. */
  resumeShown?: number
  /** 진입 연출을 시작해도 되는가. 진입 커튼이 걷히기 시작할 때 true가 된다. 복원이면 처음부터 true. */
  started: boolean
  /** 던지기를 하나 보여 줄 때마다(복원 스냅숏 갱신) — 끝까지 봤으면 'done'. */
  onProgress: (shown: number | 'done') => void
  /** [받기] — 호스트가 복귀 커튼을 건다. */
  onExit: () => void
  /** 말 이동·칸 효과 소리 등을 켜고 끄는 게 아니라 «모션 축소»만 반영한다(표시 전용). */
  tokenSymbol?: string
  towerSymbol?: string
}

const ASPECT_TOKEN = { symbol: 'lantern_girl', tower: 'bonus' } as const

function formatInt(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function BoardBonus(props: BoardBonusProps): ReactNode {
  const { feature, config, layout, totalBet, reducedMotion } = props
  const t = useT()

  const plan = useMemo(() => planBoardThrows(config, feature), [config, feature])
  const timings = useMemo(() => boardTimingsFor(props.speed, reducedMotion), [props.speed, reducedMotion])
  const startRoute = useMemo(() => boardViewAfter(config, feature, 0).route, [config, feature])

  const initialShown = props.resumeShown !== undefined ? Math.max(0, Math.min(props.resumeShown, feature.throws.length)) : 0
  const fresh = props.resumeShown === undefined

  // 상태 기계는 ref가 정본이고 state는 렌더용 사본이다 — 타이머 콜백이 낡은 값을 보지 않게 한다.
  const flowRef = useRef<BoardFlowState | null>(null)
  const [flow, setFlow] = useState<BoardFlowState | null>(null)
  const timerRef = useRef<{ id: ReturnType<typeof setTimeout>; ms: number; startedAt: number } | null>(null)
  const pausedRemainingRef = useRef<number | null>(null)
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const effectTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const mapRef = useRef<BoardMapHandle | null>(null)
  const yutRef = useRef<YutThrowHandle | null>(null)
  const fxRef = useRef<FxPool | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const potRef = useRef<HTMLElement | null>(null)
  const multRef = useRef<HTMLElement | null>(null)
  const dotsRef = useRef<HTMLElement | null>(null)
  const lanternsRef = useRef<HTMLElement | null>(null)
  const unmounted = useRef(false)

  // ── 표시 상태(전부 서버 기록에서 파생되거나 순수 연출 상태) ──
  const [introLit, setIntroLit] = useState(fresh ? 0 : config.trapLimit)
  const [banner, setBanner] = useState<{ key: number; text: string; tone: 'intro' | 'goal' | 'last' } | null>(null)
  const [callText, setCallText] = useState<{ key: number; text: string; stamp: boolean; tone?: 'fork' } | null>(null)
  const [nodeEffect, setNodeEffect] = useState<NodeEffect | null>(null)
  const [forkKey, setForkKey] = useState(0)
  const [lanternOut, setLanternOut] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [hint, setHint] = useState(false)
  const effectKey = useRef(0)

  const shown = flow?.shown ?? initialShown
  const phase = flow?.phase ?? 'intro'
  const view = useMemo(() => boardViewAfter(config, feature, shown), [config, feature, shown])

  const dispatch = useCallback((event: BoardFlowEvent): void => {
    const current = flowRef.current
    if (current === null || unmounted.current) return
    const { state, effects } = boardFlowReducer(current, event)
    if (state !== current) {
      flowRef.current = state
      setFlow(state)
    }
    runRef.current(effects, state)
  }, [])

  const runRef = useRef<(effects: readonly BoardFlowEffect[], state: BoardFlowState) => void>(() => undefined)

  function armTimer(ms: number): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current.id)
    const startedAt = Date.now()
    const id = setTimeout(() => {
      timerRef.current = null
      dispatch({ type: 'tick' })
    }, Math.max(0, ms))
    timerRef.current = { id, ms, startedAt }
  }

  function clearTimer(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current.id)
    timerRef.current = null
  }

  /** 지금 칸 효과의 위치(판 기준 px). */
  function nodePoint(id: string): { x: number; y: number } | null {
    const frac = mapRef.current?.nodeFraction(id)
    const map = mapRef.current?.element()
    if (frac === null || frac === undefined || map === null || map === undefined) return null
    return { x: frac.x * map.clientWidth, y: frac.y * map.clientHeight }
  }

  /** 판 한가운데(판 기준 px). */
  function stageCenter(): { x: number; y: number } | null {
    const map = mapRef.current?.element()
    if (map === null || map === undefined) return null
    return { x: map.clientWidth / 2, y: map.clientHeight / 2 }
  }

  /** HUD 요소 중심(판 기준 px) — 엽전이 날아갈 도착점. */
  function hudPoint(el: HTMLElement | null): { x: number; y: number } | null {
    const map = mapRef.current?.element()
    if (el === null || map === null || map === undefined) return null
    const a = el.getBoundingClientRect()
    const b = map.getBoundingClientRect()
    return { x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top }
  }

  function later(ms: number, fn: () => void): void {
    effectTimers.current.push(
      setTimeout(() => {
        if (!unmounted.current) fn()
      }, ms),
    )
  }

  /** 결과 글자 한 줄. `stamp`면 «한 번 더!» 도장이 옆에 찍힌다(윷·모). */
  function showCall(text: string, stamp: boolean, tone?: 'fork'): void {
    effectKey.current += 1
    setCallText(tone === undefined ? { key: effectKey.current, text, stamp } : { key: effectKey.current, text, stamp, tone })
  }

  function tileEffect(index: number, compressed: boolean): void {
    const record = feature.throws[index]
    if (record === undefined) return
    effectKey.current += 1
    const key = effectKey.current
    const quiet = compressed || reducedMotion
    const at = record.at
    const value = record.value ?? 0
    switch (record.tile) {
      case 'coin': {
        boardSfx.coin()
        setNodeEffect({ id: at, kind: 'coin', key, label: `+${value}` })
        const from = nodePoint(at)
        const to = hudPoint(potRef.current)
        if (!quiet && from !== null && to !== null) {
          void fxRef.current?.flyCoins(from, to, Math.max(3, Math.min(6, value + 1)), 520)
          later(420, () => punch(potRef.current))
        }
        break
      }
      case 'mult':
        boardSfx.mult(record.multiplier)
        setNodeEffect({ id: at, kind: 'mult', key, label: `×${record.multiplier}` })
        if (!quiet) {
          punch(multRef.current, 1.4, 340)
          punch(potRef.current, 1.18, 320)
        }
        break
      case 'forward':
        setNodeEffect({ id: at, kind: 'forward', key, label: t('boardTileForward') })
        break
      case 'again':
        boardSfx.coin()
        setNodeEffect({ id: at, kind: 'again', key, label: t('boardAgain') })
        showCall(t('boardAgain'), false)
        if (!quiet) punch(dotsRef.current, 1.3, 320)
        break
      case 'trap':
        boardSfx.trap()
        haptic('light')
        setNodeEffect({ id: at, kind: 'trap', key, label: t('boardTrapOut') })
        setLanternOut(record.traps)
        if (!quiet) shake(stageRef.current)
        later(600, () => setLanternOut(null))
        break
      case 'goal': {
        boardSfx.goal()
        haptic('success')
        // 판에서 가장 큰 보상 순간 — 칸 옆 작은 글자 대신 판 가운데 큰 배너로 외치고, 불꽃을 판 안쪽까지 크게 퍼뜨린다.
        // 마지막 던지기라 `finaleMs`만큼 더 머문 뒤 요약 카드가 뜬다(boardFlow).
        setNodeEffect({ id: at, kind: 'goal', key, label: '' })
        setBanner({ key, text: t('boardGoalPrize', { n: value }), tone: 'goal' })
        const c = nodePoint(at)
        const mid = stageCenter()
        if (!quiet && c !== null) {
          void fxRef.current?.burstSparks(c, 12, 120, 1000)
          if (mid !== null) later(280, () => void fxRef.current?.burstSparks({ x: (c.x + mid.x) / 2, y: (c.y + mid.y) / 2 }, 10, 95, 900))
          punch(potRef.current, 1.25, 360)
        }
        break
      }
      default:
        break
    }
    // 코인·배수 변화는 HUD 숫자가 즉시 올라간다. 윷·모의 «한 번 더»는 call 단계에서 이미 보여 줬다.
  }

  function execute(effects: readonly BoardFlowEffect[], state: BoardFlowState): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'schedule':
          armTimer(effect.ms)
          break
        case 'cancelTimer':
          clearTimer()
          break
        case 'intro': {
          // 효과음(feature)은 진입 커튼이 시작될 때 훅이 이미 냈다 — 여기서는 등불이 하나씩 켜질 때 틱만 낸다.
          setBanner({ key: 1, text: t('boardIntroBanner', { n: config.throws }), tone: 'intro' })
          const step = reducedMotion ? 0 : 200
          for (let i = 1; i <= config.trapLimit; i += 1) {
            introTimers.current.push(
              setTimeout(() => {
                if (unmounted.current) return
                setIntroLit(i)
                boardSfx.hop(i - 1)
              }, i * step),
            )
          }
          introTimers.current.push(
            setTimeout(() => {
              if (!unmounted.current) setBanner((b) => (b !== null && b.tone === 'intro' ? null : b))
            }, Math.max(600, state.timings.introMs - 150)),
          )
          break
        }
        case 'ready': {
          // 지난 칸 효과 글자(«등불이 꺼졌어요» 등)가 새 꼬리표와 겹치지 않게 걷는다.
          setNodeEffect(null)
          if (state.shown === 0 && !state.auto && !readHintSeen()) {
            setHint(true)
            writeHintSeen()
            later(2400, () => setHint(false))
          }
          break
        }
        case 'throw': {
          setHint(false)
          setCallText(null)
          setNodeEffect(null)
          setBanner((b) => (b !== null && b.tone !== 'intro' ? null : b))
          const planned = plan[effect.index]
          if (planned !== undefined) {
            yutRef.current?.toss(planned.steps, effect.index, effect.compressed ? 0 : timings.throwMs)
            if (effect.compressed && state.fast > 0) boardSfx.tick()
            else boardSfx.toss()
          }
          break
        }
        case 'call': {
          const planned = plan[effect.index]
          if (planned === undefined) break
          const name = t(`boardYutName${planned.steps}` as 'boardYutName1')
          if (!(effect.compressed && state.fast > 0)) {
            boardSfx.land(planned.steps)
            later(90, () => boardSfx.call(planned.steps))
          }
          // 윷·모: 결과 글자 옆에 «한 번 더!» 도장이 찍히고 기회 점이 하나 늘어난다.
          // 판이 끝나는 던지기(결승 도착 등)에서는 «한 번 더»가 없으니 도장을 찍지 않는다.
          const again = planned.extraThrow && planned.last !== true
          showCall(t(planned.steps === 1 ? 'boardCallOne' : 'boardCall', { name, n: planned.steps }), again)
          if (again && !effect.compressed) later(250, () => punch(dotsRef.current, 1.3, 320))
          break
        }
        case 'move': {
          const record = feature.throws[effect.index]
          const planned = plan[effect.index]
          if (record === undefined || planned === undefined) break
          const total = subPhaseMs('move', planned, state.timings, { compress: state.compress, fast: state.fast > 0 })
          const hopMs = reducedMotion ? 0 : Math.max(16, Math.floor(total / Math.max(1, planned.hops)))
          const path = [...record.path, ...(record.forward ?? [])]
          const quietHops = effect.compressed && state.fast > 0
          void mapRef.current?.moveToken(path, hopMs, (i) => {
            if (!quietHops) boardSfx.hop(i)
          })
          break
        }
        case 'applyTile': {
          props.onProgress(effect.index + 1)
          tileEffect(effect.index, effect.compressed)
          break
        }
        case 'openFork': {
          const record = feature.throws[effect.index]
          if (record === undefined) break
          boardSfx.fork()
          setForkKey((k) => k + 1)
          // «지름길!»은 결과 외침 줄(«개! 2칸» 자리)에 띄운다 — 판 한가운데에 띄우면 한가운데 칸의 말·배수 펀치와
          // 다음 꼬리표를 덮는다(플레이어 QA).
          showCall(t('boardForkOpen'), false, 'fork')
          break
        }
        case 'compress': {
          fxRef.current?.finishAll()
          yutRef.current?.finish()
          if (state.phase === 'moving' || state.phase === 'effect' || state.phase === 'summary') {
            const record = feature.throws[state.phase === 'summary' ? state.plan.length - 1 : state.index]
            if (record !== undefined) mapRef.current?.snapToken(record.at)
          }
          break
        }
        case 'summary':
          setHint(false)
          setBanner(null)
          setSummaryOpen(true)
          // 요약 직행(⏩ 2회)이면 마지막 던지기 결과를 판에 반영해 둔다.
          {
            const last = feature.throws[feature.throws.length - 1]
            if (last !== undefined) mapRef.current?.snapToken(last.at)
            props.onProgress(feature.throws.length)
          }
          boardSfx.summary()
          break
        case 'finish':
          props.onProgress('done')
          props.onExit()
          break
      }
    }
  }
  runRef.current = execute

  // 시작: `started`가 되면 상태 기계를 만들고 첫 효과를 실행한다(진입 커튼이 걷히기 시작할 때).
  useEffect(() => {
    if (!props.started || flowRef.current !== null) return
    const created = createBoardFlow({
      plan,
      timings,
      auto: props.auto,
      ...(props.resumeShown === undefined ? {} : { resumeShown: initialShown }),
    })
    flowRef.current = created.state
    setFlow(created.state)
    runRef.current(created.effects, created.state)
    // 시작은 한 번만이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.started])

  // 이펙트 풀(엽전·불꽃)은 판 안의 층에 붙는다. 언마운트 때 요소째 걷는다.
  useLayoutEffect(() => {
    const layer = mapRef.current?.element()?.querySelector<HTMLElement>('[data-fx-layer]') ?? null
    if (layer === null) return
    const pool = createFxPool(layer)
    fxRef.current = pool
    return () => {
      pool.dispose()
      fxRef.current = null
    }
  }, [])

  // 언마운트: 타이머·진행 중 애니메이션을 전부 거둔다(메모리 누수 없음).
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      clearTimer()
      for (const id of introTimers.current) clearTimeout(id)
      for (const id of effectTimers.current) clearTimeout(id)
      introTimers.current = []
      effectTimers.current = []
      mapRef.current?.snapToken('start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 앱이 숨겨지면 일시정지하고 돌아오면 남은 시간부터 이어 간다.
  useEffect(() => {
    function onVisibility(): void {
      if (document.hidden) {
        const timer = timerRef.current
        if (timer === null) return
        pausedRemainingRef.current = Math.max(0, timer.ms - (Date.now() - timer.startedAt))
        clearTimer()
        return
      }
      const remaining = pausedRemainingRef.current
      pausedRemainingRef.current = null
      if (remaining !== null) armTimer(remaining)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 스페이스: 던지기 차례엔 던지기, 재생 중엔 지금 던지기 끝내기, 요약엔 받기.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea')) return
      const state = flowRef.current
      if (state === null) return
      event.preventDefault()
      if (state.phase === 'ready') dispatch({ type: 'throw' })
      else if (state.phase === 'summary') dispatch({ type: 'closeSummary' })
      else dispatch({ type: 'skip' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  // ── 파생 표시값 ──
  const visited = useMemo(() => {
    const set = new Set<string>(['start'])
    for (let i = 0; i < shown; i += 1) {
      const record = feature.throws[i]
      if (record === undefined) continue
      for (const id of record.path) set.add(id)
      for (const id of record.forward ?? []) set.add(id)
    }
    return set
  }, [feature, shown])

  const ready = phase === 'ready'
  const previews = useMemo(() => (ready ? previewLandings(config, view) : null), [ready, config, view])
  const lastChance = ready && view.throwsLeft === 1
  const hotNode = useMemo(
    () => (lastChance && previews !== null ? mostValuableLanding(config, previews) : null),
    [lastChance, previews, config],
  )

  // 기회 점: 던지는 동안 하나 줄어든 모습, 윷·모가 나오면 하나 돌려받은 모습으로 보여 준다.
  const playing = phase === 'throwing' || phase === 'calling' || phase === 'moving'
  const activeIndex = flow?.index ?? 0
  const activePlan = plan[activeIndex]
  const chancesShown = playing
    ? Math.max(0, view.throwsLeft - 1) + (phase !== 'throwing' && activePlan?.extraThrow === true ? 1 : 0)
    : view.throwsLeft
  const dotTotal = Math.max(config.throws, chancesShown)

  const litShown = Math.min(introLit, lanternsLit(config, view))
  const endsNow = boardEndsNowPayout(config, view)
  const towerLit = feature.end === 'goal' && shown >= feature.throws.length

  const summaryActive = phase === 'summary' || phase === 'closing'
  const closing = phase === 'closing' || phase === 'done'

  const handleStageTap = (event: MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return
    const state = flowRef.current
    if (state === null) return
    if (state.phase === 'intro' || state.phase === 'throwing' || state.phase === 'calling' || state.phase === 'moving' || state.phase === 'effect') {
      dispatch({ type: 'skip' })
    }
  }

  const chipNames = useMemo(
    () => ['', t('boardChipName1'), t('boardChipName2'), t('boardChipName3'), t('boardChipName4'), t('boardChipName5')],
    [t],
  )

  const primaryLabel = lastChance ? t('boardLastThrow') : playing || phase === 'effect' ? t('boardThrowing') : t('boardThrowBtn')
  const auto = flow?.auto === true
  const fast = flow?.fast ?? 0

  return (
    <div
      className="board-bonus"
      role="dialog"
      aria-modal="true"
      aria-label={t('boardAria')}
      data-phase={phase}
      data-reduced={reducedMotion ? 'true' : undefined}
      onClick={handleStageTap}
    >
      <div className="board-bonus__bg" style={props.bgUrl !== undefined ? { backgroundImage: `url("${props.bgUrl}")` } : undefined} />
      <div className="board-bonus__col">
        <header className="board-hud">
          <div className="board-hud__cell board-hud__cell--chances" aria-label={t('boardChancesAria', { n: chancesShown })}>
            <span className="board-hud__label">{t('boardChances')}</span>
            <b ref={(el) => void (dotsRef.current = el)} className="board-dots" aria-hidden="true">
              {Array.from({ length: dotTotal }, (_, i) => (
                <i key={i} className={i < chancesShown ? 'board-dot board-dot--on' : 'board-dot'} />
              ))}
            </b>
          </div>
          <div className="board-hud__cell board-hud__cell--lanterns" aria-label={t('boardLanternsAria', { lit: litShown })}>
            <span className="board-hud__label">{t('boardLanterns')}</span>
            <b ref={(el) => void (lanternsRef.current = el)} className="board-lanterns" aria-hidden="true">
              {Array.from({ length: config.trapLimit }, (_, i) => {
                const on = i < litShown
                const justOut = lanternOut !== null && i === config.trapLimit - lanternOut
                return (
                  <svg
                    key={i}
                    viewBox="-12 -14 24 30"
                    className={['board-lantern', on ? 'board-lantern--on' : 'board-lantern--off', justOut ? 'board-lantern--out' : '', litShown === 1 && on ? 'board-lantern--last' : ''].filter(Boolean).join(' ')}
                  >
                    <LanternGlyph lit={on} />
                  </svg>
                )
              })}
            </b>
          </div>
          <div className="board-hud__cell board-hud__cell--mult">
            <span className="board-hud__label">{t('boardMultiplier')}</span>
            <b ref={(el) => void (multRef.current = el)} className="board-hud__value">
              ×{view.multiplier}
            </b>
          </div>
          <div className="board-hud__cell board-hud__cell--pot">
            <span className="board-hud__label">{t('boardPot')}</span>
            <b ref={(el) => void (potRef.current = el)} className="board-hud__value">
              {t('boardPotValue', { n: view.pot })}
            </b>
          </div>
        </header>

        <div ref={stageRef} className="board-stage">
          <BoardMap
            ref={mapRef}
            config={config}
            layout={layout}
            initialAt={view.at}
            currentAt={view.at}
            visited={visited}
            previews={previews}
            hotNode={hotNode}
            openRoute={view.route !== startRoute ? view.route : null}
            forkKey={forkKey}
            towerLit={towerLit}
            nodeEffect={nodeEffect}
            symbols={props.symbols}
            chipNames={chipNames}
            forkLabel={t('boardForkLabel')}
            tokenSymbol={props.tokenSymbol ?? ASPECT_TOKEN.symbol}
            towerSymbol={props.towerSymbol ?? ASPECT_TOKEN.tower}
            reducedMotion={reducedMotion}
          />
          {banner !== null && (
            <div key={banner.key} className={`board-banner board-banner--${banner.tone}`} role="status">
              {banner.text}
            </div>
          )}
          {hint && (
            <div className="board-hint" role="note">
              {t('boardTapHint')}
            </div>
          )}
        </div>

        <div className="board-call" aria-live="polite">
          {callText !== null && (
            <span key={callText.key} className={callText.tone === 'fork' ? 'board-call__text board-call__text--fork' : 'board-call__text'}>
              {callText.text}
            </span>
          )}
          {callText !== null && callText.stamp && (
            <span key={`stamp-${callText.key}`} className="board-call__stamp">
              {t('boardAgain')}
            </span>
          )}
        </div>

        <div className="board-yutrow">
          <span className="board-yutrow__mat" aria-hidden="true" />
          <YutThrow ref={yutRef} reducedMotion={reducedMotion} />
        </div>

        <div className="board-endsnow">
          <span className="board-endsnow__main">{t('boardEndsNow', { n: formatInt(endsNow) })}</span>
          <span className="board-endsnow__coins">({t('boardEndsNowCoins', { coins: formatInt(endsNow * totalBet) })})</span>
        </div>

        <footer className="board-controls">
          <button
            type="button"
            className={lastChance ? 'board-btn board-btn--throw board-btn--last' : 'board-btn board-btn--throw'}
            disabled={!ready || closing}
            onClick={() => dispatch({ type: 'throw' })}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className={auto ? 'board-btn board-btn--small board-btn--on' : 'board-btn board-btn--small'}
            aria-pressed={auto}
            aria-label={t('boardAutoAria')}
            disabled={summaryActive || closing}
            onClick={() => dispatch({ type: 'toggleAuto' })}
          >
            {auto ? t('boardAutoOn') : t('boardAutoOff')}
          </button>
          <button
            type="button"
            className={fast > 0 ? 'board-btn board-btn--icon board-btn--on' : 'board-btn board-btn--icon'}
            aria-label={fast > 0 ? t('boardFastAria2') : t('boardFastAria')}
            disabled={summaryActive || closing}
            onClick={() => dispatch({ type: 'fastForward' })}
          >
            <FastIcon end={fast > 0} />
          </button>
        </footer>
      </div>

      {summaryActive && (
        <BoardSummary
          feature={feature}
          config={config}
          minApplied={feature.payout === config.minPayout && feature.pot * feature.multiplier < config.minPayout}
          disabled={closing}
          reducedMotion={reducedMotion}
          onCollect={() => dispatch({ type: 'closeSummary' })}
        />
      )}
    </div>
  )
}

/** 요약 카드: 바구니 × 배수 = 지급, 끝난 이유, 코인 롤업, [받기]. */
function BoardSummary(props: {
  feature: BoardBonusFeature
  config: BoardBonusConfig
  minApplied: boolean
  disabled: boolean
  reducedMotion: boolean
  onCollect: () => void
}): ReactNode {
  const t = useT()
  const { feature } = props
  const roll = useWinRollup(feature.win, props.reducedMotion ? 300 : 1200)
  const reason =
    feature.end === 'goal' ? t('boardEndGoal') : feature.end === 'traps' ? t('boardEndTraps') : t('boardEndThrows')
  return (
    <div className="board-summary" role="group" aria-label={t('boardSummaryTitle')}>
      <div className="board-summary__card">
        <h2 className="board-summary__title">{t('boardSummaryTitle')}</h2>
        <p className="board-summary__reason">{reason}</p>
        <p className="board-summary__formula">
          {t('boardSummaryFormula', { pot: feature.pot, mult: feature.multiplier, payout: feature.pot * feature.multiplier })}
        </p>
        {props.minApplied && <p className="board-summary__min">{t('boardSummaryMin', { n: props.config.minPayout })}</p>}
        <p className="board-summary__coins" aria-label={`${formatInt(feature.win)}`}>
          {/* 시스템 이모지(🪙)는 OS마다 모양이 달라 말판 코인 칸과 같은 엽전 그림을 쓴다 */}
          <svg className="board-summary__coin" viewBox="-12 -12 24 24" width="34" height="34" aria-hidden="true">
            <CoinGlyph />
          </svg>{' '}
          {formatInt(roll.value)}
        </p>
        <button type="button" className="board-btn board-btn--throw board-summary__collect" disabled={props.disabled} onClick={props.onCollect}>
          {t('boardCollectBtn')}
        </button>
      </div>
    </div>
  )
}

/** 빨리 감기 아이콘(코드 SVG) — 시스템 이모지(파란 네모)는 오방색 테마와 따로 논다. `end`면 «끝으로»(▶▶|). */
function FastIcon({ end }: { end: boolean }): ReactNode {
  return (
    <svg className="board-btn__glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 5.5 L11 12 L3 18.5 Z" fill="currentColor" />
      <path d={end ? 'M10.5 5.5 L18 12 L10.5 18.5 Z' : 'M12 5.5 L20 12 L12 18.5 Z'} fill="currentColor" />
      {end && <rect x="18.6" y="5.5" width="2.6" height="13" rx="0.8" fill="currentColor" />}
    </svg>
  )
}
