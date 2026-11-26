/**
 * 판 위 글자 상자(갈림길 «지름길» 글자와 도·개·걸·윷·모 꼬리표)의 자리를 한꺼번에 정한다 — 순수 함수.
 * `BoardMap`이 이 결과를 그대로 그리고, 테스트는 도달 가능한 모든 상태에서 상자가 칸을 가리지 않는지,
 * 그리고 꼬리표가 이웃 칸이 아니라 **제 칸** 것으로 읽히는지(`chipOwnership`) 본다.
 */
import type { BoardBonusConfig } from '@tgslot/slot-engine'
import type { LandingPreview } from '../../../game/boardPlayback'
import {
  CHIP_OWN_MARGIN,
  YUT_BOARD_SIZE,
  chipLabel,
  chipPlacement,
  chipWidth,
  goalBadgeCircle,
  nodeCenter,
  type BoardLayout,
  type ChipBox,
} from './yutLayout'

/** 말 지름(398 기준). 말이 서 있는 칸은 칸보다 크게 가려진다. */
export const TOKEN_DIAMETER = 46

export interface ChipPlan {
  /** 갈림길 칸 id → «지름길» 글자 상자. */
  forkLabels: Map<string, ChipBox>
  /** 미리보기 칸 id → 꼬리표 상자. */
  chips: Map<string, ChipBox>
}

export function planChips(args: {
  layout: BoardLayout
  config: Pick<BoardBonusConfig, 'forks'>
  previews: readonly LandingPreview[] | null
  currentAt: string
  chipNames: readonly string[]
}): ChipPlan {
  const { layout, config, previews, currentAt, chipNames } = args
  const placed: ChipBox[] = []
  // 결승 «큰 상» 딱지는 늘 그 자리 — 모든 글자 상자가 피한다.
  const badge = goalBadgeCircle(layout, YUT_BOARD_SIZE)
  const fixed = badge === null ? [] : [badge]
  const forkLabels = new Map<string, ChipBox>()
  for (const id of Object.keys(config.forks)) {
    const box = chipPlacement(layout, id, YUT_BOARD_SIZE, { w: 40, h: 14 }, placed, fixed, CHIP_OWN_MARGIN)
    if (box !== null) {
      forkLabels.set(id, box)
      placed.push(box)
    }
  }
  const chips = new Map<string, ChipBox>()
  const tokenCenter = nodeCenter(layout, currentAt, YUT_BOARD_SIZE)
  const avoid = tokenCenter === null ? fixed : [...fixed, { ...tokenCenter, r: TOKEN_DIAMETER / 2 }]
  for (const preview of previews ?? []) {
    const w = chipWidth(chipLabel(preview.steps, chipNames))
    const box = chipPlacement(layout, preview.at, YUT_BOARD_SIZE, { w, h: 20 }, placed, avoid, CHIP_OWN_MARGIN)
    if (box !== null) {
      chips.set(preview.at, box)
      placed.push(box)
    }
  }
  return { forkLabels, chips }
}
