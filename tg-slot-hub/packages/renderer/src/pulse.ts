import type { GridPosition } from '@tgslot/slot-engine'
import { PULSE_HOLD_MS, PULSE_HOP_MS, PULSE_HOP_MS_BY_TIER, PULSE_TRAIL_BY_TIER } from './constants.js'
import { symbolCenter, type Layout, type Point } from './layout.js'
import type { WinTier } from './wins.js'
import type { WaysDirection } from './ways.js'

/** 등급에 맞는 한 칸 이동 시간(ms). */
export function pulseHopMsForTier(tier: WinTier): number {
  return PULSE_HOP_MS_BY_TIER[tier]
}

/** 등급에 맞는 잔상 개수. */
export function pulseTrailForTier(tier: WinTier): number {
  return PULSE_TRAIL_BY_TIER[tier]
}

/** 빛이 들르는 지점 하나. */
export interface PulseWaypoint {
  position: GridPosition
  /** 캔버스(콘텐츠 지역) 좌표의 심볼 중심. */
  point: Point
  /**
   * 빛이 이 자리에 닿는 시각(ms, 연출 시작 기준).
   * 이 순간 해당 심볼이 fx를 한 번 터뜨린다.
   */
  atMs: number
}

export interface PulsePath {
  waypoints: PulseWaypoint[]
  /** 빛이 마지막 심볼에 닿는 시각(ms). */
  travelMs: number
  /** 도착 후 잠시 머무는 시간을 포함한 전체 길이(ms). */
  totalMs: number
}

/**
 * 승리 좌표를 훑는 빛의 경로. 기본은 왼쪽에서 오른쪽이다.
 *
 * 페이라인을 선으로 그리는 대신 빛 한 점이 심볼 중심을 차례로 지나간다.
 * 선이 심볼을 가리지 않으면서도 "이 자리들이 이겼다"를 같은 순서로 말해 준다.
 *
 * `direction: 'rtl'`이면 오른쪽 릴부터 훑는다. `bothWays` 게임에서 오른쪽으로 읽은 승리는
 * 빛도 같은 방향으로 흘러야 어느 쪽에서 이겼는지가 화면만 보고 읽힌다.
 * 같은 릴에 여러 칸이 걸리는 ways 승리를 위해 릴이 같으면 위쪽 행부터 간다.
 *
 * 순수 함수라 타이머 없이 순서와 시각을 그대로 검증할 수 있다.
 */
export function buildPulsePath(
  layout: Layout,
  positions: readonly GridPosition[],
  hopMs: number = PULSE_HOP_MS,
  direction: WaysDirection = 'ltr',
): PulsePath {
  const reelOrder = direction === 'rtl' ? -1 : 1
  const ordered = [...positions].sort((a, b) => (a[0] - b[0]) * reelOrder || a[1] - b[1])
  const step = Math.max(1, hopMs)

  const waypoints = ordered.map((position, index) => ({
    position,
    point: symbolCenter(layout, position[0], position[1]),
    atMs: index * step,
  }))

  const last = waypoints[waypoints.length - 1]
  const travelMs = last?.atMs ?? 0
  return { waypoints, travelMs, totalMs: travelMs + PULSE_HOLD_MS }
}

/**
 * 빛이 시각 `atMs`에 있어야 할 좌표. 지점 사이는 직선 보간한다.
 * 경로가 비었으면 null이고, 범위 밖이면 양 끝에 붙는다.
 */
export function pulsePointAt(path: PulsePath, atMs: number): Point | null {
  const { waypoints } = path
  const first = waypoints[0]
  if (first === undefined) return null
  if (atMs <= first.atMs) return first.point

  for (let i = 1; i < waypoints.length; i += 1) {
    const previous = waypoints[i - 1]
    const current = waypoints[i]
    if (previous === undefined || current === undefined) continue
    if (atMs > current.atMs) continue
    const span = current.atMs - previous.atMs
    const ratio = span <= 0 ? 1 : (atMs - previous.atMs) / span
    return {
      x: previous.point.x + (current.point.x - previous.point.x) * ratio,
      y: previous.point.y + (current.point.y - previous.point.y) * ratio,
    }
  }

  return waypoints[waypoints.length - 1]?.point ?? null
}
