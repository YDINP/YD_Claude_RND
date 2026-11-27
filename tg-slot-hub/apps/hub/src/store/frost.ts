/**
 * 얼림(얼려 두기 프리스핀) 표시용 진행 — 마퀴 띠(얼린 칸 수·눈금)와 오로라 4단이 읽는 작은 스토어.
 *
 * **값의 주인은 서버다.** 여기 들어오는 숫자는 전부 렌더러가 서버 피처(`frostChain`)를 재생하며 내보내는 이벤트에서만 온다.
 * 클라이언트가 스스로 정하는 것은 없다. 공용 `store/game.ts`는 건드리지 않는다(여러 팀이 함께 고치는 파일).
 * 이벤트를 접는 규칙은 순수 함수(`reduceFrostView`)라 렌더러 없이 순서를 그대로 검증한다.
 */
import { create } from 'zustand'
import type { RendererEvent } from '@tgslot/renderer'

export type FrostTierName = 'high' | 'mid' | 'low'

export interface FrostEndView {
  count: number
  bonusMultiple: number
  auroraMultiplier: number
  bonus: number
  palace: boolean
  quiet: boolean
}

export interface FrostView {
  /** 얼림이 재생되는 중인가(`frostStart` 시작 ~ `frostEnd` 끝). */
  active: boolean
  /** 이번 판에 얼린 그림(심볼 id). 아직 없으면 null. */
  target: string | null
  tier: FrostTierName | null
  /** 지금 얼린 칸 수. 이 판 얼림이 끝나도 다음 판 전까지 그대로 보인다. */
  count: number
  /** 다음 눈금까지. 없으면 null. */
  nextThreshold: number | null
  /** 눈금을 넘을 때마다 올라가는 번호(띠가 번쩍이게 한다). */
  crossedKey: number
  /** 이번에 넘은 눈금. */
  crossed: readonly number[]
  /** 곱셈식을 보여 주는 끝. 없으면 null(진행 중이거나 아직 안 끝남). */
  end: FrostEndView | null
  /** 이번 판 곱셈식이 보이는 중인가(끝 `start` ~ `end`). */
  showingEnd: boolean
  /**
   * 오로라 단계 — 얼림 도중 서버가 정한 값을 재생 시점에 맞춰 올린다. null이면 서버 이월값(`carry.frost.level`)을 쓴다
   * (새로고침 복원). 얼림 끝에서 `auroraAfter`로 오르고, 오른 순간 `auroraRise`도 늘어 띠가 한 칸 점등한다.
   */
  auroraLevel: number | null
  auroraRise: number
}

export const INITIAL_FROST_VIEW: FrostView = {
  active: false,
  target: null,
  tier: null,
  count: 0,
  nextThreshold: null,
  crossedKey: 0,
  crossed: [],
  end: null,
  showingEnd: false,
  auroraLevel: null,
  auroraRise: 0,
}

export function isFrostEvent(event: RendererEvent): event is Extract<RendererEvent, { type: 'frostStart' | 'frostStep' | 'frostEnd' }> {
  return event.type === 'frostStart' || event.type === 'frostStep' || event.type === 'frostEnd'
}

/** 렌더러 이벤트 하나를 표시용 진행에 접는다. 순수 함수. */
export function reduceFrostView(
  view: FrostView,
  event: Extract<RendererEvent, { type: 'frostStart' | 'frostStep' | 'frostEnd' }>,
): FrostView {
  switch (event.type) {
    case 'frostStart':
      if (event.phase === 'start') {
        return {
          ...view,
          active: true,
          target: event.target,
          tier: event.tier,
          // 얼림이 시작되기 전까지는 지난 판 숫자가 남는다. 시작하면 0부터 다시 센다.
          count: 0,
          nextThreshold: event.nextThreshold,
          crossed: [],
          end: null,
          showingEnd: false,
          // 오로라 단계는 «이 판 시작 전» 값이 그대로다. 서버 이월값과 같다.
        }
      }
      return { ...view, count: event.count, nextThreshold: event.nextThreshold }
    case 'frostStep':
      if (event.phase === 'land') {
        return {
          ...view,
          count: event.count,
          nextThreshold: event.nextThreshold,
          crossed: event.crossed,
          crossedKey: event.crossed.length > 0 ? view.crossedKey + 1 : view.crossedKey,
        }
      }
      return view
    case 'frostEnd':
      if (event.phase === 'start') {
        return {
          ...view,
          count: event.count,
          end: {
            count: event.count,
            bonusMultiple: event.bonusMultiple,
            auroraMultiplier: event.auroraMultiplier,
            bonus: event.bonus,
            palace: event.palace,
            quiet: event.quiet,
          },
          showingEnd: true,
          auroraLevel: event.auroraAfter,
          auroraRise: event.auroraUp ? view.auroraRise + 1 : view.auroraRise,
        }
      }
      return { ...view, active: false, showingEnd: false }
  }
}

interface FrostStore {
  view: FrostView
  apply(event: RendererEvent): void
  /** 새 판이 시작됐다: 지난 판의 곱셈식·칸 수를 지운다(오로라 단계는 남긴다). */
  newSpin(): void
  /** 라운드가 끝났거나 기본 판이다: 오로라까지 전부 지운다. */
  resetRound(): void
}

export const useFrostStore = create<FrostStore>((set) => ({
  view: INITIAL_FROST_VIEW,
  apply(event) {
    if (!isFrostEvent(event)) return
    set((state) => ({ view: reduceFrostView(state.view, event) }))
  },
  newSpin() {
    set((state) => ({
      view: {
        ...state.view,
        active: false,
        target: null,
        tier: null,
        count: 0,
        nextThreshold: null,
        crossed: [],
        end: null,
        showingEnd: false,
      },
    }))
  },
  resetRound() {
    set({ view: INITIAL_FROST_VIEW })
  },
}))
