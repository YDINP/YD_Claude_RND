/**
 * 자라는 정원 표시용 진행 — 성장 막대(HUD)가 읽는 작은 스토어.
 *
 * **값의 주인은 서버다.** 여기에 들어오는 숫자는 서버 피처(`garden`)·이월 상태(`freeSpins.carry.garden`)와
 * 렌더러가 그것을 재생하며 내보내는 이벤트에서만 온다. 클라이언트가 스스로 정하는 것은 없다.
 * 공용 `store/game.ts`는 건드리지 않는다(여러 팀이 함께 고치는 파일). 접는 규칙은 순수 함수라 타이머·렌더러 없이 검증한다.
 */
import { create } from 'zustand'
import type { RendererEvent } from '@tgslot/renderer'
import type { FreeSpinsState, SpinResponse } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'

/** 성장 단계(0~4) → 활성 범위. 엔진 `gardenBoundsFor`와 같은 표다(허브는 엔진 값을 import하지 않는다). */
const STAGE_BOUNDS = [
  { x: 2, y: 2, size: 4 },
  { x: 2, y: 1, size: 5 },
  { x: 1, y: 1, size: 6 },
  { x: 1, y: 0, size: 7 },
  { x: 0, y: 0, size: 8 },
] as const

export interface GardenBoundsView {
  x: number
  y: number
  size: number
}

export function gardenBoundsOfStage(stage: number): GardenBoundsView {
  const bounds = STAGE_BOUNDS[Math.max(0, Math.min(STAGE_BOUNDS.length - 1, Math.round(stage)))]
  return { ...(bounds as GardenBoundsView) }
}

export interface GardenView {
  /** 지금 활성 판 한 변(4~8). */
  size: number
  /** 성장 막대 값(터진 칸 수). 기본 게임은 스핀 누적, 프리스핀은 라운드 누적. */
  popped: number
  /** 지금 모드의 성장 문턱 4개(5×5·6×6·7×7·8×8로 가는 값). */
  thresholds: readonly number[]
  /** 정원 프리스핀 중인가. */
  round: boolean
  /** 햇살 간격(프리스핀 8×8). 정원 팩이 아니면 0. */
  sunEvery: number
  /** 지금까지 받은 햇살 수(프리스핀). */
  suns: number
  /** 성장이 일어날 때마다 오른다 — 막대가 한 번 반짝이게 하는 신호. */
  grewTick: number
  /** 씨앗 개화가 일어날 때마다 오른다. */
  bloomTick: number
}

export interface GardenMeter {
  size: number
  /** 다음 크기(8×8이면 null). */
  nextSize: number | null
  /** 다음 크기(또는 햇살)까지 남은 칸. */
  toNext: number
  /** 막대 채움 0~1. */
  fill: number
  /** 다음 문턱이 2칸 안인가(봉오리가 부푼다). 실제 진행도일 때만 켠다. */
  near: boolean
  /** 8×8 이후 프리스핀의 햇살까지 막대인가. */
  sun: boolean
  /** 8×8 기본 게임: 더 자랄 곳이 없다. */
  full: boolean
}

export const INITIAL_GARDEN_VIEW: GardenView = {
  size: 4,
  popped: 0,
  thresholds: [10, 19, 30, 42],
  round: false,
  sunEvery: 0,
  suns: 0,
  grewTick: 0,
  bloomTick: 0,
}

/** 지금 모드(기본/프리스핀)가 쓰는 성장 문턱. 프리스핀 전용 값이 없으면 기본 값. */
export function gardenThresholds(math: Pick<GameMath, 'growBoard'> | null, round: boolean): readonly number[] {
  const config = math?.growBoard
  if (config === undefined) return INITIAL_GARDEN_VIEW.thresholds
  return round && config.bonus.thresholds !== undefined ? config.bonus.thresholds : config.thresholds
}

/** 막대 한 줄의 표시값. 순수 함수. */
export function gardenMeterOf(view: GardenView): GardenMeter {
  const stage = Math.max(0, Math.min(4, view.size - 4))
  const full = stage >= 4
  if (full) {
    if (view.round && view.sunEvery > 0) {
      const base = view.thresholds[3] ?? 0
      // 햇살은 막대가 base + sunEvery·k를 넘을 때마다(k = 1, 2, …). 받은 만큼 다음 목표가 한 칸씩 뒤로 간다.
      const target = base + view.sunEvery * (view.suns + 1)
      const start = base + view.sunEvery * view.suns
      const left = Math.max(0, target - view.popped)
      const progressed = Math.max(0, Math.min(view.sunEvery, view.popped - start))
      return { size: view.size, nextSize: null, toNext: left, fill: progressed / view.sunEvery, near: left > 0 && left <= 2, sun: true, full: true }
    }
    return { size: view.size, nextSize: null, toNext: 0, fill: 1, near: false, sun: false, full: true }
  }
  const target = view.thresholds[stage] ?? Number.POSITIVE_INFINITY
  const start = stage === 0 ? 0 : (view.thresholds[stage - 1] ?? 0)
  const left = Math.max(0, target - view.popped)
  const span = Math.max(1, target - start)
  const fill = Math.max(0, Math.min(1, (view.popped - start) / span))
  return { size: view.size, nextSize: view.size + 1, toNext: left, fill, near: left > 0 && left <= 2, sun: false, full: false }
}

/** 이벤트 하나를 접는다. 정원과 무관한 이벤트는 그대로 돌려준다. */
export function reduceGardenView(view: GardenView, event: RendererEvent): GardenView {
  if (event.type === 'gardenStep') {
    if (event.phase === 'start') return { ...view, popped: Math.max(view.popped, event.popped), bloomTick: view.bloomTick + (event.bloomed > 0 ? 1 : 0) }
    return view
  }
  if (event.type === 'gardenGrow') {
    if (event.phase === 'start') return { ...view, size: event.size, popped: Math.max(view.popped, event.popped), grewTick: view.grewTick + 1 }
    return view
  }
  if (event.type === 'gardenSun' && event.phase === 'start') return { ...view, suns: view.suns + 1 }
  return view
}

export function isGardenEvent(event: RendererEvent): boolean {
  return event.type === 'gardenStep' || event.type === 'gardenGrow' || event.type === 'seedBloom' || event.type === 'gardenSun'
}

/** 서버 프리스핀 이월 상태 → 표시값. 이월 상태가 없으면 null. */
export function gardenViewFromCarry(math: GameMath | null, freeSpins: FreeSpinsState | null, previous?: GardenView): GardenView | null {
  const carry = freeSpins?.carry?.garden
  const config = math?.growBoard
  if (carry === undefined || config === undefined) return null
  return {
    size: gardenBoundsOfStage(carry.stage).size,
    popped: carry.popped,
    thresholds: gardenThresholds(math, true),
    round: true,
    sunEvery: config.bonus.sunEvery,
    suns: carry.suns,
    grewTick: previous?.grewTick ?? 0,
    bloomTick: previous?.bloomTick ?? 0,
  }
}

/** 시작 상태(유료 스핀: 4×4·막대 0). */
export function gardenBaseView(math: GameMath | null, previous?: GardenView): GardenView {
  return {
    ...INITIAL_GARDEN_VIEW,
    thresholds: gardenThresholds(math, false),
    grewTick: previous?.grewTick ?? 0,
    bloomTick: previous?.bloomTick ?? 0,
  }
}

/** 서버 스핀 결과가 말하는 «끝난 뒤» 표시값. 정원 피처가 없으면 null. */
export function gardenViewFromResult(math: GameMath | null, result: Pick<SpinResponse, 'features' | 'freeSpins' | 'isFreeSpin'>, previous?: GardenView): GardenView | null {
  const config = math?.growBoard
  const feature = result.features.find((f) => f.type === 'garden')
  if (config === undefined || feature === undefined || feature.type !== 'garden') return null
  const round = result.isFreeSpin || (result.freeSpins !== null && result.freeSpins.left > 0)
  const last = feature.steps.at(-1)
  const carry = result.freeSpins?.carry?.garden
  return {
    size: feature.final.size,
    popped: last?.popped ?? feature.startPopped,
    thresholds: gardenThresholds(math, round),
    round,
    sunEvery: round ? config.bonus.sunEvery : 0,
    suns: carry?.suns ?? previous?.suns ?? 0,
    grewTick: previous?.grewTick ?? 0,
    bloomTick: previous?.bloomTick ?? 0,
  }
}

interface GardenStore {
  view: GardenView
  apply(event: RendererEvent): void
  set(view: GardenView): void
  reset(): void
}

export const useGardenStore = create<GardenStore>((set) => ({
  view: INITIAL_GARDEN_VIEW,
  apply: (event) => {
    if (!isGardenEvent(event)) return
    set((state) => ({ view: reduceGardenView(state.view, event) }))
  },
  set: (view) => set({ view }),
  reset: () => set({ view: INITIAL_GARDEN_VIEW }),
}))
