/**
 * 무대 룰렛 오버레이 — 스핀 응답에 이미 실려 온 결과(`session.feature`)를 보여 주는 연출 화면.
 * 릴 캔버스 위 DOM이라 캔버스 리사이즈가 없다. **입력은 결과를 바꾸지 못한다**: «돌리기»는 시작 신호,
 * «빠르게 멈춤»은 남은 감속을 줄일 뿐 같은 칸에 선다, «건너뛰기»는 남은 회전을 짧게 압축해 보여 준다.
 *
 * 순서는 `lib/rouletteDirector`가, 칸·각도·시간은 `lib/rouletteShow`가 정한다. 여기서는 그 계획을 화면과 타이머로 옮긴다.
 *
 * 자원: 불빛 토큰 6개·금액 팝 4개·별 8개는 풀(고정 DOM)을 재사용한다. 타이머·rAF·WAAPI는 전부 장부에 올리고
 * 언마운트 때 걷는다(`lib/rouletteRuntime`).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { symbolLabel } from '../../game/labels'
import type { RouletteSession } from '../../game/rouletteFlow'
import { celebrationTier, floorMultipleLabel, winBandFor } from './winTiers'
import { ringNameKey, RouletteWheel, type RouletteWheelHandle } from './RouletteWheel'
import { runRouletteShow, type RouletteHost } from '../../lib/rouletteDirector'
import { playRouletteCue } from '../../lib/rouletteCues'
import { runRotation, type RotationRun } from '../../lib/rouletteMotion'
import { advanceRouletteCache } from '../../lib/rouletteResume'
import {
  cancelTrackedAnimations,
  noteRouletteMount,
  setRouletteTokenNodes,
  trackAnimation,
} from '../../lib/rouletteRuntime'
import {
  litCountOf,
  planRoulette,
  rouletteTimings,
  snapshotAt,
  summaryItems,
  type PlannedStep,
  type RouletteSpeed,
} from '../../lib/rouletteShow'
import './StageRoulette.css'

/** 불빛 토큰 풀 크기(기획: 최대 6개). */
export const ROULETTE_TOKEN_POOL = 6
const POP_POOL = 4
const STAR_POOL = 8
/** 건너뛰기 뒤 회전 하나를 보여 주는 시간(회전 + 결과). 합쳐서 300ms. */
const SKIP_SPIN_MS = 160
const SKIP_RESULT_MS = 140

export interface CheerGatherInput {
  /** 응원봉 칸의 렌더러 좌표(캔버스 기준 CSS px). 못 구한 칸은 null. */
  rects: readonly ({ x: number; y: number; w: number; h: number } | null)[]
  /** 캔버스 왼쪽 위의 화면 좌표. */
  origin: { x: number; y: number }
  /** 토큰이 칩까지 나는 시간. 0이면 숫자만 올린다. */
  ms: number
}

export interface StageRouletteHandle {
  /** 렌더러의 `rouletteCheer`(응원봉 칸 강조) 시점에 부른다 — 칸마다 불빛 토큰이 칩으로 날아간다. */
  gatherCheer(input: CheerGatherInput): void
}

interface StageRouletteProps {
  session: RouletteSession
  math: GameMath
  locale: Locale
  symbols: Record<string, string> | undefined
  speed: RouletteSpeed
  reducedMotion: boolean
  /** 오토스핀 중이면 탭 없이 자동으로 돈다. */
  autoSpin: boolean
  /** 룰렛 합계가 바뀔 때(WinStrip). `rollMs`는 숫자가 오르는 시간. */
  onProgress: (total: number, rollMs: number) => void
  /** 요약 카드가 닫혔다 — 퇴장 클립을 시작해도 된다. */
  onFinished: () => void
}

interface Ui {
  visible: boolean
  ring: number
  zoom: number
  songsLeft: number
  encoresUsed: number
  total: number
  totalKey: number
  litOn: number[][]
  action: 'idle' | 'wait' | 'spin' | 'result'
  badge: { text: string; tone: 'coin' | 'up' | 'encore' | 'grand'; key: number; ms: number } | null
  summary: boolean
  chipVisible: boolean
  chipCount: number
  chipBump: number
  resumeNote: boolean
  countdown: { key: number; ms: number } | null
  grandGlow: boolean
  announce: string
}

/** 고리 번호 → 판 확대 배율. 안쪽으로 갈수록 칸 라벨이 커져 390px에서도 읽힌다(기획 §7-3). */
export function zoomFor(ring: number, ringCount: number): number {
  if (ringCount <= 1) return 1
  return [1, 1.25, 1.5][Math.min(ring, 2)] ?? 1
}

/** 금액 팝이 떠오르는 자리: 멈춘 칸에서 판 가운데 쪽으로 이 비율만큼 들어온 곳. */
const POP_START_TOWARD_CENTER = 0.5

export const StageRoulette = forwardRef<StageRouletteHandle, StageRouletteProps>(function StageRoulette(props, ref) {
  const { session, math, locale, symbols } = props
  const t = useT()
  // 호스트는 한 번만 만든다 — 언어가 바뀌어도 최신 번역을 쓰도록 ref로 읽는다.
  const tRef = useRef(t)
  tRef.current = t
  const config = math.stageRoulette
  if (config === undefined) throw new Error('무대 룰렛 math가 없다')
  const feature = session.feature

  // 계획은 시작할 때 한 번 정한다 — 진행 중 속도를 바꿔도 이미 놓인 고리 각도와 어긋나지 않는다.
  const [plan] = useState(() =>
    planRoulette(feature, config, { seed: session.roundId, speed: props.speed, reducedMotion: props.reducedMotion }),
  )
  const litCount = useMemo(() => litCountOf(feature), [feature])
  const startRing = plan.steps[0]?.ring ?? 0
  const ringCount = config.rings.length

  const [ui, setUiState] = useState<Ui>(() => ({
    visible: false,
    ring: startRing,
    zoom: zoomFor(startRing, ringCount),
    songsLeft: config.songs,
    encoresUsed: 0,
    total: 0,
    totalKey: 0,
    litOn: config.rings.map(() => []),
    action: 'idle',
    badge: null,
    summary: false,
    chipVisible: false,
    chipCount: 0,
    chipBump: 0,
    resumeNote: false,
    countdown: null,
    grandGlow: false,
    announce: '',
  }))
  const uiRef = useRef(ui)
  const patch = useCallback((next: Partial<Ui>) => {
    uiRef.current = { ...uiRef.current, ...next }
    setUiState(uiRef.current)
  }, [])

  // 최신 props를 ref로 들고 있어 호스트(한 번만 만든다)가 낡은 값을 읽지 않는다.
  const propsRef = useRef(props)
  propsRef.current = props

  const wheelRef = useRef<RouletteWheelHandle | null>(null)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const chipRef = useRef<HTMLDivElement | null>(null)
  const tokenEls = useRef<(HTMLSpanElement | null)[]>([])
  const popEls = useRef<(HTMLSpanElement | null)[]>([])
  const starEls = useRef<(HTMLSpanElement | null)[]>([])
  const abortRef = useRef(false)
  const startedRef = useRef(false)
  const skipRef = useRef(false)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  /** 기다리는 약속 전부(언마운트가 깨운다)와 그중 건너뛰기가 깨울 수 있는 것. */
  const sleepers = useRef(new Set<() => void>())
  const skipSleepers = useRef(new Set<() => void>())
  /** 언마운트(StrictMode 재마운트 포함)마다 오른다 — 지난 세대의 연출이 새 세대에 끼어들지 못하게 한다. */
  const genRef = useRef(0)
  const tapResolve = useRef<(() => void) | null>(null)
  const runRef = useRef<RotationRun | null>(null)
  const rollRaf = useRef<number | null>(null)
  const poolCursor = useRef({ token: 0, pop: 0 })
  const countdownKey = useRef(0)
  const badgeKey = useRef(0)
  const [wheelSize, setWheelSize] = useState(0)

  // ---- 마운트·정리 ---------------------------------------------------------
  useEffect(() => {
    abortRef.current = false
    noteRouletteMount(1)
    setRouletteTokenNodes(ROULETTE_TOKEN_POOL)
    const pending = timers.current
    const wake = sleepers.current
    return () => {
      abortRef.current = true
      genRef.current += 1
      noteRouletteMount(-1)
      setRouletteTokenNodes(0)
      for (const id of pending) clearTimeout(id)
      pending.clear()
      runRef.current?.cancel()
      if (rollRaf.current !== null) cancelAnimationFrame(rollRaf.current)
      cancelTrackedAnimations()
      // 기다리던 약속을 모두 풀어 보낸다(호스트가 aborted를 보고 물러난다).
      for (const resolve of [...wake]) resolve()
      wake.clear()
      skipSleepers.current.clear()
      tapResolve.current?.()
      tapResolve.current = null
    }
  }, [])

  // 판 크기: 영역 폭의 92%와 영역 높이 중 작은 쪽(기획 §7-6). 캔버스는 건드리지 않는다.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = (): void => {
      const rect = el.getBoundingClientRect()
      setWheelSize(Math.max(0, Math.floor(Math.min(rect.width * 0.92, rect.height - 8))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ---- 도구 ----------------------------------------------------------------
  const timings = (): ReturnType<typeof rouletteTimings> =>
    rouletteTimings(propsRef.current.speed, propsRef.current.reducedMotion)

  /** `ms` 기다린다. 건너뛰기·취소가 오면 곧바로 풀린다. */
  const sleep = useCallback((ms: number, skippable = true): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (abortRef.current || ms <= 0 || (skippable && skipRef.current)) {
        resolve()
        return
      }
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(id)
        timers.current.delete(id)
        sleepers.current.delete(finish)
        skipSleepers.current.delete(finish)
        resolve()
      }
      const id = setTimeout(finish, ms)
      timers.current.add(id)
      sleepers.current.add(finish)
      if (skippable) skipSleepers.current.add(finish)
    })
  }, [])

  const later = useCallback((fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      timers.current.delete(id)
      if (!abortRef.current) fn()
    }, ms)
    timers.current.add(id)
  }, [])

  /** 탭 또는 `ms` 경과(또는 건너뛰기)까지 기다린다. `ignoreSkip`이면 건너뛰기가 깨우지 못한다(요약 카드). */
  const waitForTap = useCallback((ms: number, ignoreSkip = false): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (abortRef.current || (!ignoreSkip && skipRef.current)) {
        resolve()
        return
      }
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(id)
        timers.current.delete(id)
        sleepers.current.delete(finish)
        skipSleepers.current.delete(finish)
        if (tapResolve.current === finish) tapResolve.current = null
        resolve()
      }
      const id = setTimeout(finish, ms)
      timers.current.add(id)
      sleepers.current.add(finish)
      if (!ignoreSkip) skipSleepers.current.add(finish)
      tapResolve.current = finish
    })
  }, [])

  const animateEl = useCallback((el: HTMLElement | null, frames: Keyframe[], options: KeyframeAnimationOptions): Animation | null => {
    if (!el || typeof el.animate !== 'function') return null
    return trackAnimation(el.animate(frames, options))
  }, [])

  /** 합계 숫자를 `to`까지 올린다(단조 증가). 아래 당첨 줄(GameScreen `tickWinTo`)과 같은 직선 곡선이라 두 숫자가 함께 오른다. */
  const rollTotal = useCallback(
    (from: number, to: number, ms: number): void => {
      if (rollRaf.current !== null) cancelAnimationFrame(rollRaf.current)
      rollRaf.current = null
      propsRef.current.onProgress(to, ms)
      if (ms <= 0 || from >= to) {
        patch({ total: to, totalKey: uiRef.current.totalKey + 1 })
        return
      }
      const start = performance.now()
      const step = (now: number): void => {
        if (abortRef.current) return
        const p = Math.min(1, (now - start) / ms)
        const value = Math.max(uiRef.current.total, Math.round(from + (to - from) * p))
        patch({ total: value })
        if (p < 1) rollRaf.current = requestAnimationFrame(step)
        else {
          rollRaf.current = null
          patch({ total: to, totalKey: uiRef.current.totalKey + 1 })
        }
      }
      rollRaf.current = requestAnimationFrame(step)
    },
    [patch],
  )

  const chipCenter = (): { x: number; y: number } | null => {
    const rect = chipRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  /** 풀 토큰 하나를 `from`에서 `to`로 날린다. 끝나면 숨긴다. */
  const flyToken = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }, ms: number, delay = 0): Promise<void> => {
      return new Promise<void>((resolve) => {
        const index = poolCursor.current.token % ROULETTE_TOKEN_POOL
        poolCursor.current.token += 1
        const el = tokenEls.current[index]
        if (!el || ms <= 0 || typeof el.animate !== 'function') {
          resolve()
          return
        }
        el.style.visibility = 'visible'
        const anim = trackAnimation(
          el.animate(
            [
              { transform: `translate(${from.x}px, ${from.y}px) scale(1.15)`, opacity: 1 },
              { transform: `translate(${to.x}px, ${to.y}px) scale(0.6)`, opacity: 0.95 },
            ],
            { duration: ms, delay, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'both' },
          ),
        )
        const done = (): void => {
          el.style.visibility = 'hidden'
          anim.cancel()
          resolve()
        }
        anim.addEventListener('finish', done, { once: true })
        anim.addEventListener('cancel', () => resolve(), { once: true })
      })
    },
    [],
  )

  const pop = useCallback(
    (text: string, from: { x: number; y: number } | null, to: { x: number; y: number } | null, ms: number): void => {
      if (propsRef.current.reducedMotion || !from || !to) return
      const index = poolCursor.current.pop % POP_POOL
      poolCursor.current.pop += 1
      const el = popEls.current[index]
      if (!el) return
      el.textContent = text
      el.style.visibility = 'visible'
      const anim = animateEl(
        el,
        [
          { transform: `translate(${from.x}px, ${from.y}px) scale(0.8)`, opacity: 0 },
          { transform: `translate(${from.x}px, ${from.y - 10}px) scale(1.15)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${to.x}px, ${to.y}px) scale(0.7)`, opacity: 0.2 },
        ],
        { duration: ms, easing: 'ease-in', fill: 'both' },
      )
      anim?.addEventListener('finish', () => {
        el.style.visibility = 'hidden'
        anim.cancel()
      })
    },
    [animateEl],
  )

  const stars = useCallback(
    (center: { x: number; y: number } | null): void => {
      if (propsRef.current.reducedMotion || !center) return
      starEls.current.forEach((el, i) => {
        if (!el) return
        const angle = (i / STAR_POOL) * Math.PI * 2 + 0.3
        const dist = 90 + (i % 3) * 22
        el.style.visibility = 'visible'
        const anim = animateEl(
          el,
          [
            { transform: `translate(${center.x}px, ${center.y}px) scale(0.2) rotate(0deg)`, opacity: 1 },
            {
              transform: `translate(${center.x + Math.cos(angle) * dist}px, ${center.y + Math.sin(angle) * dist}px) scale(1.1) rotate(180deg)`,
              opacity: 0,
            },
          ],
          { duration: 900 + (i % 2) * 160, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
        )
        anim?.addEventListener('finish', () => {
          el.style.visibility = 'hidden'
          anim.cancel()
        })
      })
    },
    [animateEl],
  )

  // ---- 응원봉 모으기(E3) ---------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      gatherCheer({ rects, origin, ms }) {
        const total = feature.cheer
        patch({ chipVisible: true, chipCount: 0 })
        const target = chipCenter()
        if (propsRef.current.reducedMotion || ms <= 0 || !target || rects.length === 0) {
          patch({ chipCount: total, chipBump: uiRef.current.chipBump + 1 })
          return
        }
        let landed = 0
        const flights = rects.slice(0, ROULETTE_TOKEN_POOL).flatMap((rect, i) =>
          rect ? [{ from: { x: origin.x + rect.x + rect.w / 2, y: origin.y + rect.y + rect.h / 2 }, i }] : [],
        )
        if (flights.length === 0) {
          patch({ chipCount: total, chipBump: uiRef.current.chipBump + 1 })
          return
        }
        for (const flight of flights) {
          void flyToken(flight.from, target, ms, flight.i * 45).then(() => {
            if (abortRef.current) return
            landed += 1
            patch({ chipCount: Math.min(total, uiRef.current.chipCount + 1), chipBump: uiRef.current.chipBump + 1 })
            if (landed === flights.length) patch({ chipCount: total })
          })
        }
        // 안전망 — 토큰이 못 날아도 칩 숫자는 서버 값으로 끝난다.
        later(() => patch({ chipCount: total }), ms + flights.length * 45 + 400)
      },
    }),
    [feature.cheer, flyToken, later, patch],
  )

  // ---- 호스트(연출 실행) ---------------------------------------------------
  const host = useMemo<RouletteHost>(() => {
    const tr: typeof t = (key, vars) => tRef.current(key, vars)
    const ringName = (ring: number): string => tr(ringNameKey(config.rings[ring]?.id ?? '', ring))

    const showBadge = (text: string, tone: 'coin' | 'up' | 'encore' | 'grand', ms: number): void => {
      badgeKey.current += 1
      patch({ badge: { text, tone, key: badgeKey.current, ms } })
    }

    return {
      aborted: () => abortRef.current,

      restore(shown) {
        const snap = snapshotAt(plan, config, shown)
        config.rings.forEach((_, ring) => wheelRef.current?.setAngle(ring, snap.restAngles[ring] ?? 0))
        patch({
          ring: snap.ring,
          zoom: zoomFor(snap.ring, ringCount),
          songsLeft: snap.songsLeft,
          encoresUsed: snap.encoresUsed,
          total: snap.total,
          totalKey: uiRef.current.totalKey + 1,
          litOn: feature.lit.map((indices) => [...indices]),
          chipVisible: feature.cheer > 0,
          chipCount: feature.cheer,
          resumeNote: true,
        })
        propsRef.current.onProgress(snap.total, 1)
        later(() => patch({ resumeNote: false }), 2400)
      },

      async rise() {
        const ms = timings().riseMs
        patch({ visible: true })
        await sleep(ms, false)
      },

      async lightUp() {
        const lit = feature.lit
        const count = litCountOf(feature)
        if (count === 0) return
        const tm = timings()
        if (tm.reduced || tm.lightMs === 0) {
          patch({ litOn: lit.map((indices) => [...indices]) })
          return
        }
        for (let k = 0; k < count; k += 1) {
          if (abortRef.current) return
          const first = lit[0]?.[k]
          const from = chipCenter()
          const to = first === undefined ? null : (wheelRef.current?.segmentPoint(0, first) ?? null)
          if (from && to) await flyToken(from, to, tm.lightMs * 0.4)
          for (let ring = 0; ring < config.rings.length; ring += 1) {
            const index = lit[ring]?.[k]
            if (index === undefined) continue
            const next = uiRef.current.litOn.map((indices) => [...indices])
            next[ring] = [...(next[ring] ?? []), index]
            patch({ litOn: next })
            playRouletteCue({ kind: 'light', index: k })
            wheelRef.current?.flashSegment(ring, index)
            await sleep(tm.lightMs * 0.2)
            if (abortRef.current) return
          }
        }
        // 건너뛰기로 중간에 끊겼어도 불은 서버 값 전부 켠다.
        patch({ litOn: lit.map((indices) => [...indices]) })
      },

      async focus(step) {
        const changed = uiRef.current.ring !== step.ring
        patch({ ring: step.ring, zoom: zoomFor(step.ring, ringCount), action: 'idle' })
        if (changed) await sleep(timings().reduced ? 0 : 550)
      },

      async awaitSpin(step) {
        if (skipRef.current) return
        const tm = timings()
        if (step.auto) {
          await sleep(tm.reduced ? 100 : 250)
          return
        }
        if (propsRef.current.autoSpin) {
          patch({ action: 'wait', countdown: null })
          await waitForTap(tm.reduced || propsRef.current.speed !== 'normal' ? 200 : 450)
          return
        }
        countdownKey.current += 1
        patch({ action: 'wait', countdown: { key: countdownKey.current, ms: tm.autoSpinWaitMs } })
        await waitForTap(tm.autoSpinWaitMs)
        patch({ countdown: null })
      },

      async spin(step) {
        const tm = timings()
        patch({ action: 'spin', countdown: null })
        const wheel = wheelRef.current
        if (!wheel) return
        if (tm.reduced) {
          wheel.setAngle(step.ring, step.toAngle)
          await sleep(tm.spinMs, false)
          return
        }
        const n = config.rings[step.ring]?.segments.length ?? 12
        const sweep = 360 / n
        let boundary = Math.floor(step.fromAngle / sweep)
        let lastTick = 0
        const ms = skipRef.current ? SKIP_SPIN_MS : tm.spinMs
        const run = runRotation({
          from: step.fromAngle,
          to: step.toAngle,
          ms,
          apply: (angle) => wheel.setAngle(step.ring, angle),
          onFrame: (angle, progress) => {
            const now = Math.floor(angle / sweep)
            if (now <= boundary) return
            boundary = now
            const at = performance.now()
            if (skipRef.current || at - lastTick < 25) return
            lastTick = at
            playRouletteCue({ kind: 'tick', speed: Math.max(0, 1 - progress) })
          },
        })
        runRef.current = run
        await run.done
        if (runRef.current === run) runRef.current = null
        // 취소로 끊겼다면 각도를 목표에 붙이지 않는다(언마운트).
        if (!abortRef.current) wheel.setAngle(step.ring, step.toAngle)
      },

      async reveal(step) {
        const tm = timings()
        const skipping = skipRef.current
        const dur = skipping ? SKIP_RESULT_MS : tm.resultMs[step.kind]
        const wheel = wheelRef.current
        patch({ action: 'result', songsLeft: step.songsLeft, encoresUsed: step.encoresUsedAfter })
        playRouletteCue({ kind: 'land', result: step.kind, lit: step.lit })
        wheel?.flashSegment(step.ring, step.segment, step.kind === 'grand')
        wheel?.bouncePointer()

        const from = wheel?.segmentPoint(step.ring, step.segment) ?? null
        const center = wheel?.centerPoint() ?? null
        const what =
          step.kind === 'stepUp'
            ? tr('stageRouletteSegStepUp')
            : step.kind === 'encore'
              ? tr('stageRouletteSegEncore')
              : step.kind === 'grand'
                ? tr('stageRouletteSegGrand')
                : tr('stageRouletteSegCoin')
        const rollMs = skipping ? 0 : Math.min(600, Math.round(dur * 0.85))

        if (step.win > 0) {
          // 팝은 멈춘 칸 라벨을 가리지 않게 칸과 판 가운데 사이에서 떠올라 가운데 합계로 들어간다.
          const popFrom =
            from && center ? { x: from.x + (center.x - from.x) * POP_START_TOWARD_CENTER, y: from.y + (center.y - from.y) * POP_START_TOWARD_CENTER } : from
          pop(`+${step.win.toLocaleString('en-US')}`, popFrom, center, Math.min(700, Math.max(380, dur)))
          rollTotal(step.totalBefore, step.totalAfter, rollMs)
        }

        if (step.kind === 'stepUp') {
          const next = Math.min(step.ring + 1, ringCount - 1)
          if (!skipping) showBadge(tr('stageRouletteBadgeStepUp'), 'up', dur)
          playRouletteCue({ kind: 'zoom', ring: next })
          patch({ ring: next, zoom: zoomFor(next, ringCount) })
          patch({ announce: tr('stageRouletteAriaStepUp', { ring: ringName(step.ring) }) })
        } else if (step.kind === 'encore') {
          if (!skipping) showBadge(step.encoreCounted ? tr('stageRouletteBadgeEncore') : tr('stageRouletteBadgeEncoreSpent'), 'encore', dur)
          patch({ announce: tr('stageRouletteAriaResult', { what, win: step.win }) })
        } else if (step.kind === 'grand') {
          const segment = config.rings[step.ring]?.segments[step.segment]
          const value = segment && 'value' in segment && typeof segment.value === 'number' ? segment.value : 0
          showBadge(tr('stageRouletteBadgeGrand', { n: value }), 'grand', dur)
          patch({ grandGlow: true, announce: tr('stageRouletteAriaResult', { what, win: step.win }) })
          stars(center)
          later(() => patch({ grandGlow: false }), dur)
        } else {
          patch({ announce: tr('stageRouletteAriaResult', { what, win: step.win }) })
        }

        await sleep(dur, false)
        // 롤업이 아직 안 끝났어도 합계는 서버 값으로 맞춘다.
        if (!abortRef.current && uiRef.current.total !== step.totalAfter) {
          if (rollRaf.current !== null) cancelAnimationFrame(rollRaf.current)
          rollRaf.current = null
          patch({ total: step.totalAfter, totalKey: uiRef.current.totalKey + 1 })
        }
      },

      commit(shown) {
        advanceRouletteCache(session.roundId, shown)
      },

      async summary() {
        const tm = timings()
        patch({ summary: true, action: 'idle', badge: null })
        // 합계가 베팅 미만이면 요약 큐를 내지 않는다(손해를 축하처럼 꾸미지 않는다).
        if (winBandFor(session.totalWin, session.totalBet) !== 'under') {
          playRouletteCue({
            kind: 'summary',
            big: celebrationTier(session.totalWin, session.totalBet) !== 'none',
          })
        }
        await waitForTap(tm.summaryMs, true)
        // 요약 카드는 건너뛰기 뒤에도 보여 준다 — 건너뛰기는 회전만 압축한다.
        patch({ summary: false })
      },
    }
    // 호스트는 한 번만 만든다. 최신 값은 ref로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 시작 ----------------------------------------------------------------
  useEffect(() => {
    if (session.stage !== 'show' || startedRef.current) return
    startedRef.current = true
    skipRef.current = false
    // 이 세대의 연출만 이 호스트를 쓴다 — 언마운트(StrictMode 재마운트 포함)로 세대가 바뀌면 지난 연출은 스스로 물러난다.
    const generation = genRef.current
    const runHost: RouletteHost = { ...host, aborted: () => genRef.current !== generation || abortRef.current }
    void runRouletteShow(plan, runHost, { startAt: session.startAt })
      .then((result) => {
        if (result === 'done' && genRef.current === generation) {
          playRouletteCue({ kind: 'exit' })
          propsRef.current.onFinished()
        }
      })
      .catch((err: unknown) => {
        // 연출이 터져도 결과는 이미 서버가 정했다 — 게이트를 풀어 잔액 공개·입력 잠금 해제로 넘어간다.
        console.error('[roulette] show failed', err)
        if (genRef.current === generation) propsRef.current.onFinished()
      })
    return () => {
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stage가 show가 되는 순간 한 번.
  }, [session.stage])

  // 응원봉 칩: 렌더러 신호가 없는 경우(렌더러 없음·이어 보기)에도 show에서는 숫자를 보인다.
  useEffect(() => {
    if (session.stage === 'show' && feature.cheer > 0 && !uiRef.current.chipVisible) {
      patch({ chipVisible: true, chipCount: feature.cheer })
    }
  }, [session.stage, feature.cheer, patch])

  // ---- 입력 ----------------------------------------------------------------
  const onPrimary = useCallback((): void => {
    if (session.stage !== 'show' || uiRef.current.summary) return
    const action = uiRef.current.action
    if (action === 'wait') {
      tapResolve.current?.()
    } else if (action === 'spin') {
      // 빠르게 멈춤: 남은 감속만 줄인다. 같은 칸에 선다.
      runRef.current?.compress(timings().quickStopMs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.stage])

  const onSkip = useCallback((): void => {
    if (session.stage !== 'show' || uiRef.current.summary || skipRef.current) return
    skipRef.current = true
    runRef.current?.compress(SKIP_SPIN_MS)
    for (const wake of [...skipSleepers.current]) wake()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.stage])

  const onSummaryTap = useCallback((): void => {
    if (!uiRef.current.summary) return
    tapResolve.current?.()
  }, [])

  // 스페이스: 돌리기 / 빠르게 멈춤 / 요약 닫기. 게임 화면의 스페이스 핸들러는 룰렛 중 roundBusy로 막혀 있다.
  useEffect(() => {
    if (session.stage !== 'show') return
    const handle = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' && event.key !== ' ' && event.key !== 'Enter') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('button, a, [role="button"], input, textarea')) return
      event.preventDefault()
      if (uiRef.current.summary) onSummaryTap()
      else onPrimary()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [session.stage, onPrimary, onSummaryTap])

  // ---- 그리기 --------------------------------------------------------------
  const lightstick = config.cheer.symbol
  const lightstickSrc = symbols?.[lightstick]
  const lightstickName = symbolLabel(math, lightstick, locale)
  const ringConfig = config.rings[ui.ring]
  const ringTitle = t(ringNameKey(ringConfig?.id ?? '', ui.ring))
  const items = useMemo(() => summaryItems(plan, config), [plan, config])
  const ringShort = (ring: number): string => {
    const id = config.rings[ring]?.id ?? ''
    return t(id === 'middle' ? 'stageRouletteRingShortMiddle' : id === 'inner' ? 'stageRouletteRingShortInner' : 'stageRouletteRingShortOuter')
  }
  const chipBase =
    feature.cheer > litCount && litCount > 0
      ? t('stageRouletteCheerLit', { n: feature.cheer, lit: litCount })
      : t('stageRouletteCheer', { n: feature.cheer })
  const chipText = litCount > 0 ? `${chipBase} · ${t('stageRouletteLitNote', { n: config.cheer.litMultiplier })}` : chipBase
  const showControls = session.stage === 'show' && !ui.summary
  const canSpin = ui.action === 'wait'
  const canStop = ui.action === 'spin'
  const encoreSpent = ui.encoresUsed >= config.maxEncores
  const stageAttr = session.stage === 'show' && !ui.visible ? 'show-wait' : session.stage

  return (
    <div
      className="hub-roulette"
      data-stage={stageAttr}
      data-visible={ui.visible ? 'true' : 'false'}
      data-reduced={props.reducedMotion ? 'true' : 'false'}
      data-action={ui.action}
      data-testid="stage-roulette"
      style={{ ['--rise-ms' as string]: `${timings().riseMs}ms` }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="hub-roulette__info">
        <div className="hub-roulette__title" data-testid="roulette-title">
          <span>{t('stageRouletteTitle')}</span>
          <span className="hub-roulette__title-ring"> · {ringTitle}</span>
        </div>
        <div className="hub-roulette__dots" role="group" aria-label={t('stageRouletteSongsLeft', { n: ui.songsLeft })}>
          <span className="hub-roulette__songs" data-testid="roulette-songs">
            {Array.from({ length: config.songs }, (_, i) => (
              <span key={i} className="hub-roulette__song" data-on={i < ui.songsLeft ? 'true' : 'false'} aria-hidden="true">
                ♪
              </span>
            ))}
          </span>
          <span className="hub-roulette__songs-text">{t('stageRouletteSongsLeft', { n: ui.songsLeft })}</span>
          <span className="hub-roulette__encores" aria-label={t('stageRouletteEncoreLeft', { used: ui.encoresUsed, max: config.maxEncores })}>
            <span className="hub-roulette__encore-tag" aria-hidden="true">
              {t('stageRouletteEncoreTag')}
            </span>
            {Array.from({ length: config.maxEncores }, (_, i) => (
              <span key={i} className="hub-roulette__encore" data-on={i < ui.encoresUsed ? 'true' : 'false'} aria-hidden="true">
                {i < ui.encoresUsed ? '◆' : '◇'}
              </span>
            ))}
          </span>
        </div>
        <div
          ref={chipRef}
          className="hub-roulette__chip"
          data-on={ui.chipVisible ? 'true' : 'false'}
          data-bump={ui.chipBump % 2}
          data-testid="roulette-chip"
          aria-label={lightstickName}
        >
          {lightstickSrc ? (
            <img className="hub-roulette__chip-icon" src={lightstickSrc} alt="" width={22} height={22} />
          ) : (
            <span className="hub-roulette__chip-dot" aria-hidden="true" />
          )}
          <span className="hub-roulette__chip-text">
            {ui.chipCount >= feature.cheer ? chipText : t('stageRouletteCheer', { n: ui.chipCount })}
          </span>
        </div>
      </div>

      <div className="hub-roulette__area" ref={areaRef} onClick={() => (ui.summary ? onSummaryTap() : onPrimary())}>
        <div
          className="hub-roulette__wheel"
          style={{
            width: wheelSize > 0 ? wheelSize : undefined,
            height: wheelSize > 0 ? wheelSize : undefined,
            transform: `scale(${ui.zoom})`,
          }}
          data-zoom={ui.zoom}
          data-testid="roulette-wheel"
        >
          <RouletteWheel
            ref={wheelRef}
            config={config}
            lit={ui.litOn}
            activeRing={ui.ring}
            encoreSpent={encoreSpent}
            total={ui.total}
            totalKey={ui.totalKey}
            initialAngles={plan.steps.length > 0 ? snapshotAt(plan, config, session.startAt).restAngles : []}
            lightstickSrc={lightstickSrc}
            reducedMotion={props.reducedMotion}
            grandGlow={ui.grandGlow}
          />
        </div>
        {ui.badge && (
          <div
            key={ui.badge.key}
            className={`hub-roulette__badge hub-roulette__badge--${ui.badge.tone}`}
            style={{ ['--badge-ms' as string]: `${Math.max(500, ui.badge.ms)}ms` }}
            data-testid="roulette-badge"
            role="status"
          >
            {ui.badge.text}
          </div>
        )}
        {ui.resumeNote && (
          <div className="hub-roulette__resume" role="status">
            {t('stageRouletteResume')}
          </div>
        )}
      </div>

      <div className="hub-roulette__bar" data-hidden={showControls ? 'false' : 'true'}>
        <button
          type="button"
          className="hub-roulette__primary"
          onClick={onPrimary}
          disabled={!canSpin && !canStop}
          data-testid="roulette-primary"
          data-mode={canSpin ? 'spin' : canStop ? 'stop' : 'busy'}
        >
          <span className="hub-roulette__primary-label">
            {canSpin ? t('stageRouletteSpin') : canStop ? t('stageRouletteQuickStop') : t('stageRouletteSpinning')}
          </span>
          {ui.countdown && canSpin && (
            <span
              key={ui.countdown.key}
              className="hub-roulette__countdown"
              style={{ animationDuration: `${ui.countdown.ms}ms` }}
              aria-hidden="true"
            />
          )}
        </button>
        <button type="button" className="hub-roulette__skip" onClick={onSkip} data-testid="roulette-skip">
          {t('stageRouletteSkip')}
        </button>
      </div>

      {ui.summary && (
        <div className="hub-roulette__summary-wrap" onClick={onSummaryTap}>
          <div className="hub-roulette__summary" role="dialog" aria-label={t('stageRouletteSummaryTitle')} data-testid="roulette-summary">
            <h3 className="hub-roulette__summary-title">{t('stageRouletteSummaryTitle')}</h3>
            <ul className="hub-roulette__record" aria-label={t('stageRouletteSummaryTitle')}>
              {items.map((item, i) => (
                <li key={i} className={`hub-roulette__record-item hub-roulette__record-item--${item.kind}`} data-lit={item.lit ? 'true' : 'false'}>
                  {item.kind === 'stepUp'
                    ? t('stageRouletteRecStepUp')
                    : item.kind === 'encore'
                      ? t('stageRouletteRecEncore', { ring: ringShort(item.ring), n: item.multiple })
                      : item.kind === 'grand'
                        ? t('stageRouletteRecGrand', { ring: ringShort(item.ring), n: item.multiple })
                        : t('stageRouletteRecCoin', { ring: ringShort(item.ring), n: item.multiple })}
                </li>
              ))}
            </ul>
            <div className="hub-roulette__summary-row">
              <span>{t('stageRouletteSummaryTotal')}</span>
              <strong data-testid="roulette-summary-total">{feature.total.toLocaleString('en-US')}</strong>
            </div>
            <div className="hub-roulette__summary-row hub-roulette__summary-row--sub">
              <span>{t('stageRouletteSummarySpinTotal')}</span>
              <strong data-testid="roulette-summary-spin-total">{session.totalWin.toLocaleString('en-US')}</strong>
            </div>
            {session.totalWin > 0 && session.totalBet > 0 && (
              <p className="hub-roulette__summary-multiple" data-testid="roulette-summary-multiple">
                {t('winBandMultiple', { x: floorMultipleLabel(session.totalWin / session.totalBet) })}
              </p>
            )}
            {feature.endedBy === 'capped' && <p className="hub-roulette__capped">{t('stageRouletteSummaryCapped')}</p>}
            <p className="hub-roulette__summary-hint">{t('stageRouletteSummaryClose')}</p>
          </div>
        </div>
      )}

      {/* 풀: 고정 DOM을 재사용한다(토큰 6·금액 팝 4·별 8). 화면 밖에서 숨어 있다가 애니메이션 동안만 보인다. */}
      <div className="hub-roulette__pool" aria-hidden="true">
        {Array.from({ length: ROULETTE_TOKEN_POOL }, (_, i) => (
          <span
            key={`t${i}`}
            ref={(el) => {
              tokenEls.current[i] = el
            }}
            className="hub-roulette__token"
            data-testid="roulette-token"
            style={lightstickSrc ? { backgroundImage: `url("${lightstickSrc}")` } : undefined}
          />
        ))}
        {Array.from({ length: POP_POOL }, (_, i) => (
          <span
            key={`p${i}`}
            ref={(el) => {
              popEls.current[i] = el
            }}
            className="hub-roulette__pop"
          />
        ))}
        {Array.from({ length: STAR_POOL }, (_, i) => (
          <span
            key={`s${i}`}
            ref={(el) => {
              starEls.current[i] = el
            }}
            className="hub-roulette__star"
          >
            ★
          </span>
        ))}
      </div>
      <div className="hub-roulette__live" aria-live="polite">
        {ui.announce}
      </div>
    </div>
  )
})
