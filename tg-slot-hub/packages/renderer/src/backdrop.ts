import type { ReelBackdrop } from '@tgslot/game-sdk'
import {
  REEL_BACKDROP_ALPHA,
  REEL_BACKDROP_COLOR,
  REEL_BACKDROP_INSET_RATIO,
  REEL_BACKDROP_RADIUS_RATIO,
} from './constants.js'
import type { Rect } from './layout.js'

/**
 * 릴 창 뒤에 까는 패널을 어떻게 그릴지.
 *
 * 그리지 않는 경우를 `alpha: 0`으로 표현하지 않는다 — 그러면 그리는 쪽이 매번 "0이면 건너뛴다"를
 * 기억해야 하고, 언젠가 한 곳이 잊는다. 아예 다른 상태로 두면 잊을 자리가 없다.
 */
export type ReelBackdropPlan =
  | { readonly kind: 'hidden' }
  | {
      readonly kind: 'panel'
      /** 그릴 사각형(콘텐츠 좌표). 릴이 보이는 영역과 정확히 같다. */
      readonly rect: Rect
      readonly color: string
      readonly alpha: number
      /** 모서리 반경(px). 비율이 아니라 이미 심볼 크기를 곱한 값이다. */
      readonly radius: number
    }

/** 그리지 않는 상태. 널 오브젝트라 호출 측이 null을 다루지 않는다. */
export const NO_REEL_BACKDROP: ReelBackdropPlan = { kind: 'hidden' }

function clamp(value: number | undefined, fallback: number, max: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 사각형을 사방으로 `inset`만큼 줄인다. 음수면 반대로 넓어진다. */
function shrink(rect: Rect, inset: number): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: rect.width - inset * 2,
    height: rect.height - inset * 2,
  }
}

/**
 * 테마 값과 지금 레이아웃으로 패널 한 장을 계획한다.
 *
 * 순수 함수다 — 레이아웃이 바뀔 때만 다시 부르면 되고, 매 프레임 다시 그릴 이유가 없다.
 * 반경은 심볼 한 변에 대한 비율로 받는다. 창 크기는 기기마다 달라도 모서리의 인상은 같아야 한다.
 *
 * @param style theme.json의 `reelBackdrop`. 없으면 전부 기본값.
 * @param rect 릴이 보이는 영역(마스크와 같은 사각형).
 * @param symbolSize 심볼 한 변(px). 반경과 여백의 기준.
 */
export function planReelBackdrop(
  style: ReelBackdrop | undefined,
  rect: Rect,
  symbolSize: number,
): ReelBackdropPlan {
  if (rect.width <= 0 || rect.height <= 0) return NO_REEL_BACKDROP

  const alpha = clamp(style?.alpha, REEL_BACKDROP_ALPHA, 1)
  // 완전히 투명한 판은 그리지 않는다. 테마가 배경 아트를 그대로 보이고 싶을 때 쓰는 값이다.
  if (alpha <= 0) return NO_REEL_BACKDROP

  // 여백을 먼저 적용한다. 반경은 줄어든 사각형을 기준으로 묶여야 모서리가 어긋나지 않는다.
  const panel = shrink(rect, symbolSize * clamp(style?.inset, REEL_BACKDROP_INSET_RATIO, 1, -1))
  // 여백이 창보다 크면 남는 판이 없다. 그리지 않는 것이 맞다.
  if (panel.width <= 0 || panel.height <= 0) return NO_REEL_BACKDROP

  const ratio = clamp(style?.radius, REEL_BACKDROP_RADIUS_RATIO, 1)
  // 반경이 변의 절반을 넘으면 pixi가 모양을 스스로 접는다. 계획 단계에서 미리 묶어 둔다.
  const radius = Math.min(symbolSize * ratio, panel.width / 2, panel.height / 2)

  return {
    kind: 'panel',
    rect: panel,
    color: style?.color ?? REEL_BACKDROP_COLOR,
    alpha,
    radius: Math.max(0, radius),
  }
}
