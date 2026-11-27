/**
 * 화로 배율 줄(volcano-forge) 화면 진행. GameScreen이 렌더러 이벤트를 넘겨 주면
 * 불씨 비행 → 칸 점화 → 화로 가득 → 정산(망치) 순서를 지휘한다.
 * 결과·잔액은 서버 몫이다. 여기 값은 표시 전용이고, 스핀이 끝나면 서버 `heatAfter`·`filledAfter`로 맞춘다.
 *
 * 타이머·비행 토큰·GSAP 없음: 타이머는 전부 한 집합에 모아 스핀마다·언마운트 때 비운다(메모리).
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { RendererEvent, SlotRenderer } from '@tgslot/renderer'
import type { FreeSpinsState, SpinResponse } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import {
  EMPTY_RAIL,
  cascadeHoldFor,
  countSymbol,
  embersAtStep,
  findForgeRail,
  forgeTiming,
  planEmbers,
  planSettle,
  railFromCarry,
  type EmberPlan,
  type ForgeRailTrigger,
  type ForgeSpeed,
  type RailView,
  type SettlePlan,
} from '../game/forge'
import type { ForgeRailHandle } from '../components/game/ForgeRail'
import { useGameStore } from '../store/game'
import { useSettingsStore } from '../store/settings'
import {
  playForgeAnvilTease,
  playForgeBreath,
  playForgeEmberLand,
  playForgeEmberSpark,
  playForgeFull,
  playForgeSettle,
  playForgeSettleTick,
} from '../lib/audio'

interface ForgePlay {
  source: SpinResponse
  feature: ForgeRailTrigger | null
  plans: EmberPlan[]
  lastStep: number
}

export interface UseForgeRailOptions {
  math: GameMath | null
  phase: string
  freeSpins: FreeSpinsState | null
  /** 커튼 전환이 끝난 뒤에야 갱신되는 프리스핀 스냅샷. null → 값이면 프리스핀 진입이 화면에 드러난 것이다. */
  displayedFreeSpins: FreeSpinsState | null
  slotRendererRef: MutableRefObject<SlotRenderer | null>
  containerRef: MutableRefObject<HTMLElement | null>
  compressedRef: MutableRefObject<boolean>
  /** WinStrip 한 줄 문구를 정산 문구(`160 × 12 = 1,920`)로 바꾼다. */
  onSettleLabel: (settle: SettlePlan) => void
}

export interface ForgeRailView {
  heat: number
  filled: number
  anvilCount: number
  tickKey: number
  fullKey: number
  slamKey: number
  settling: boolean
}

export function useForgeRail(options: UseForgeRailOptions) {
  const { math, phase, freeSpins, displayedFreeSpins } = options
  const enabled = math?.forgeRail !== undefined
  const railRef = useRef<ForgeRailHandle | null>(null)
  const latest = useRef(options)
  latest.current = options

  const [rail, setRail] = useState<RailView>(EMPTY_RAIL)
  const [anvilCount, setAnvilCount] = useState(0)
  const anvilSeenRef = useRef(0)
  const [keys, setKeys] = useState({ tick: 0, full: 0, slam: 0 })
  const [settling, setSettling] = useState(false)

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const settleRef = useRef<{ timer: ReturnType<typeof setTimeout>; begin: () => void } | null>(null)
  const playRef = useRef<ForgePlay | null>(null)
  const railValueRef = useRef<RailView>(EMPTY_RAIL)

  const later = useCallback((ms: number, fn: () => void): void => {
    if (ms <= 0) {
      fn()
      return
    }
    const id = setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }, [])

  const applyRail = useCallback((next: RailView): void => {
    railValueRef.current = next
    setRail(next)
  }, [])

  const clearAll = useCallback((): void => {
    for (const id of timers.current) clearTimeout(id)
    timers.current.clear()
    if (settleRef.current !== null) {
      clearTimeout(settleRef.current.timer)
      settleRef.current = null
    }
    railRef.current?.clear()
    setSettling(false)
  }, [])

  /** 지금 연출 중인 스핀의 불씨 계획. 응답 객체가 같으면 다시 계산하지 않는다. */
  const currentPlay = useCallback((): ForgePlay | null => {
    const rules = latest.current.math?.forgeRail
    const source = useGameStore.getState().playing
    if (rules === undefined || source === null) return null
    if (playRef.current?.source === source) return playRef.current
    const feature = findForgeRail(source.features)
    const plans = feature === null ? [] : planEmbers(feature, rules)
    const lastStep = Math.max(0, (source.cascades?.length ?? 1) - 1)
    playRef.current = { source, feature, plans, lastStep }
    return playRef.current
  }, [])

  const timingNow = useCallback(
    (skipped: boolean) => {
      const settings = useSettingsStore.getState()
      return forgeTiming(settings.spinSpeed as ForgeSpeed, settings.reducedMotion, skipped || latest.current.compressedRef.current)
    },
    [],
  )

  const bump = useCallback((key: 'tick' | 'full' | 'slam'): void => {
    setKeys((prev) => ({ ...prev, [key]: prev[key] + 1 }))
  }, [])

  /** 연쇄 단계 `index`가 끝났다: 그 단계에서 솟은 불씨를 화로 칸으로 날린다. */
  const launchEmbers = useCallback(
    (index: number): void => {
      const play = currentPlay()
      if (play === null) return
      const here = embersAtStep(play.plans, index)
      if (here.length === 0) return
      const timing = timingNow(false)
      const renderer = latest.current.slotRendererRef.current
      // 칸 좌표는 캔버스 안 좌표다(캔버스는 컨테이너 가운데에 놓인다).
      const origin = (latest.current.containerRef.current?.querySelector('canvas') ?? latest.current.containerRef.current)?.getBoundingClientRect()
      const slots = latest.current.math?.forgeRail?.slots ?? 4
      here.forEach((plan, order) => {
        const land = (): void => {
          playForgeEmberLand(Math.max(0, plan.lit.filled - 1))
          if (plan.lit.filled === 3) later(180, playForgeBreath)
          if (plan.full === null) {
            applyRail(plan.after)
            bump('tick')
            return
          }
          // 화로 가득: 4번째 칸이 켜진 모습을 잠깐 보여 준 뒤 합계가 두 배로 오르고 칸이 빈다.
          applyRail(plan.lit)
          bump('tick')
          later(Math.min(260, timing.fullMs * 0.3), () => {
            playForgeFull()
            applyRail(plan.after)
            bump('full')
          })
        }
        let rect: ReturnType<SlotRenderer['getCellRect']> = null
        try {
          rect = renderer?.getCellRect(plan.position[0], plan.position[1]) ?? null
        } catch {
          rect = null
        }
        const from = {
          x: (origin?.left ?? 0) + (rect?.x ?? 0) + (rect?.w ?? 0) / 2,
          y: (origin?.top ?? 0) + (rect?.y ?? 0) + (rect?.h ?? 0) / 2,
        }
        later(order * Math.min(80, timing.flightMs / 4), () => {
          playForgeEmberSpark()
          const handle = railRef.current
          if (handle === null || rect === null) {
            land()
            return
          }
          handle.launch({
            from,
            slot: Math.min(plan.lit.filled - 1 < 0 ? slots - 1 : plan.lit.filled - 1, slots - 1),
            value: plan.value,
            ms: timing.flightMs,
            onLand: land,
          })
        })
      })
    },
    [applyRail, bump, currentPlay, later, timingNow],
  )

  const handleEvent = useCallback(
    (event: RendererEvent): void => {
      if (latest.current.math?.forgeRail === undefined) return
      if (event.type === 'cascadeStep' && event.phase === 'end') {
        launchEmbers(event.index)
        return
      }
      if (event.type === 'reelStop') {
        // 릴이 서는 대로 모루 칩을 센다. 판 전체 판독은 서버가 준 판(`playing.grid`)에서 읽는다.
        const play = currentPlay()
        const scatter = latest.current.math?.scatter?.symbol
        if (play === null || scatter === undefined) return
        const grid = play.source.grid
        let count = 0
        for (const line of grid ?? []) for (let reel = 0; reel <= event.reel; reel += 1) if (line[reel] === scatter) count += 1
        if (count > anvilSeenRef.current && count >= 2) playForgeAnvilTease(count)
        anvilSeenRef.current = count
        setAnvilCount(count)
        return
      }
      if (event.type === 'winTotal' || event.type === 'spinEnd') {
        const play = currentPlay()
        const scatter = latest.current.math?.scatter?.symbol
        if (play === null) return
        setAnvilCount(countSymbol(play.source.finalGrid ?? play.source.grid, scatter))
      }
    },
    [currentPlay, launchEmbers],
  )

  /** 렌더러가 연쇄 단계 사이에 멈출 시간. 화로 가득이 난 단계와 마지막 단계에서만 0이 아니다. */
  const cascadeHoldMs = useCallback(
    (index: number, skipped: boolean): number => {
      const play = currentPlay()
      if (play === null) return 0
      return cascadeHoldFor(play.plans, index, play.lastStep, timingNow(skipped))
    },
    [currentPlay, timingNow],
  )

  /**
   * 첫 바퀴 `winTotal` 직전: 정산이 필요하면 망치로 합계 상자를 내려치고 `begin`(금액 롤업)을 그 뒤로 미룬다.
   * 정산할 것이 없으면 false(호출 측이 바로 롤업).
   */
  const settleThen = useCallback(
    (begin: () => void): boolean => {
      const play = currentPlay()
      if (play === null) return false
      const settle = planSettle(play.feature, play.source.totalBet, play.source.isFreeSpin)
      if (settle === null) return false
      const timing = timingNow(false)
      latest.current.onSettleLabel(settle)
      setSettling(true)
      if (!settle.numbersOnly) {
        bump('slam')
        playForgeSettle()
      } else {
        playForgeSettleTick()
      }
      const wait = settle.numbersOnly ? Math.min(timing.settleMs, 300) : timing.settleMs
      const timer = setTimeout(() => {
        settleRef.current = null
        setSettling(false)
        begin()
      }, wait)
      settleRef.current = { timer, begin }
      return true
    },
    [bump, currentPlay, timingNow],
  )

  /** 정산 대기를 건너뛰고 롤업을 바로 시작한다(SPIN·STOP). 대기 중이 아니면 false. */
  const flushSettle = useCallback((): boolean => {
    const pending = settleRef.current
    if (pending === null) return false
    clearTimeout(pending.timer)
    settleRef.current = null
    setSettling(false)
    pending.begin()
    return true
  }, [])

  // 새 스핀: 비행·타이머 정리. 기본 게임은 줄을 비우고, 프리스핀은 서버 이월 값에서 이어 간다.
  useEffect(() => {
    if (!enabled || phase !== 'spinning') return
    clearAll()
    setKeys({ tick: 0, full: 0, slam: 0 })
    setAnvilCount(0)
    anvilSeenRef.current = 0
    const carry = freeSpins?.carry?.forge
    applyRail(freeSpins === null ? EMPTY_RAIL : railFromCarry(carry))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 스핀이 시작되는 순간만.
  }, [phase, enabled])

  // 쉬는 동안(새로고침 복원·프리스핀 진행·라운드 종료) 줄은 서버 이월 값을 따른다.
  const carry = freeSpins?.carry?.forge
  const hadFreeSpinsRef = useRef(freeSpins !== null)
  useEffect(() => {
    if (!enabled || phase !== 'idle') return
    if (freeSpins !== null) {
      const next = railFromCarry(carry)
      if (next.heat !== railValueRef.current.heat || next.filled !== railValueRef.current.filled) applyRail(next)
    } else if (hadFreeSpinsRef.current) {
      applyRail(EMPTY_RAIL)
    }
    hadFreeSpinsRef.current = freeSpins !== null
  }, [enabled, phase, freeSpins, carry?.heat, carry?.filled, applyRail])

  // 프리스핀이 화면에 드러나는 순간(커튼이 걷힘): 시작 배율이 있으면 합계 상자에 쾅.
  const shownBeforeRef = useRef(displayedFreeSpins !== null)
  useEffect(() => {
    const shown = displayedFreeSpins !== null
    if (enabled && shown && !shownBeforeRef.current) {
      const start = railFromCarry(freeSpins?.carry?.forge)
      applyRail(start)
      if (start.heat > 0) {
        bump('slam')
        playForgeSettle()
      }
    }
    shownBeforeRef.current = shown
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 스냅샷이 null → 값으로 바뀔 때만.
  }, [displayedFreeSpins !== null, enabled])

  // 언마운트: 타이머·비행 토큰 정리.
  useEffect(() => clearAll, [clearAll])

  const view: ForgeRailView = {
    heat: rail.heat,
    filled: rail.filled,
    anvilCount,
    tickKey: keys.tick,
    fullKey: keys.full,
    slamKey: keys.slam,
    settling,
  }

  return { enabled, railRef, view, handleEvent, cascadeHoldMs, settleThen, flushSettle, clearAll }
}
