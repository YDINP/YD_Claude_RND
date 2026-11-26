/**
 * 촉수 한 가닥의 경로 계산. **순수 모듈이다** — pixi도 gsap도 없다(`purity.test.ts`가 막는다).
 *
 * 촉수는 세로줄(릴) 아래에서 올라와 줄을 휘감는다. 경로는 «판 아래 → 줄 위끝»으로 이어지는 하나의 곡선(`u`는 0~1)이고,
 * 화면에 보이는 몸통은 그 곡선의 일부 구간이다. 머리(`head`)가 곡선 위를 올라가고, 몸통 길이(`length`)만큼이 따라온다.
 * 곡선은 좌우로 감기는 사인파라 줄 칸 위로 촉수가 넘나드는 것처럼 보인다.
 */

export interface TentacleGeometry {
  /** 줄 중심의 x. */
  cx: number
  /** 곡선 시작 y(판 아래, 창 밖). */
  bottomY: number
  /** 곡선 끝 y(줄 위끝). */
  topY: number
  /** 칸 한 변(px). 좌우 진폭이 여기에 비례한다. */
  cell: number
}

export interface TentaclePoint {
  x: number
  y: number
}

/** 곡선을 감는 횟수. 칸 3개 높이에 2.5바퀴 감으면 «칭칭 감았다»로 읽힌다. */
export const TENTACLE_TURNS = 2.5
/** 좌우 진폭(칸 한 변 대비). 줄 폭(= 칸)의 절반을 조금 넘는다. */
export const TENTACLE_AMPLITUDE = 0.42

/** 곡선 위 한 점. `u`는 0(판 아래)~1(줄 위끝), `time`은 꿈틀거림(초)이다. */
export function tentacleCurvePoint(geo: TentacleGeometry, u: number, wiggle = 0, time = 0): TentaclePoint {
  const clamped = Math.min(1, Math.max(0, u))
  // 끝으로 갈수록 진폭이 줄어 머리가 줄 안쪽에 감겨 붙는다.
  const envelope = 1 - 0.25 * clamped
  const phase = clamped * TENTACLE_TURNS * Math.PI * 2
  const sway = wiggle > 0 ? Math.sin(time * 6 + clamped * 5) * wiggle * geo.cell : 0
  return {
    x: geo.cx + Math.sin(phase) * TENTACLE_AMPLITUDE * geo.cell * envelope + sway,
    y: geo.bottomY + (geo.topY - geo.bottomY) * clamped,
  }
}

export interface TentacleShape {
  /** 머리 위치(0~1). 올라오는 동안 0 → 1이다. */
  head: number
  /** 몸통이 곡선에서 차지하는 길이(0~1). */
  length: number
  /** 꿈틀거림 세기(칸 대비). 0이면 곧게 선다. */
  wiggle?: number
  /** 꿈틀거림 시계(초). */
  time?: number
}

/**
 * 몸통을 따라 `count`개의 점을 고른다. 머리가 아직 몸통 길이보다 낮으면(올라오는 중) 꼬리는 곡선 시작에 붙어 있고
 * 몸통이 점점 길어진다. 그 뒤에는 길이를 지킨 채 곡선을 따라 올라간다.
 */
export function tentaclePoints(geo: TentacleGeometry, shape: TentacleShape, count: number): TentaclePoint[] {
  const points = Math.max(2, Math.floor(count))
  const head = Math.min(1, Math.max(0, shape.head))
  const length = Math.min(1, Math.max(0.0001, shape.length))
  const tail = Math.max(0, head - length)
  const span = head - tail
  const result: TentaclePoint[] = []
  for (let i = 0; i < points; i += 1) {
    const u = tail + span * (i / (points - 1))
    result.push(tentacleCurvePoint(geo, u, shape.wiggle ?? 0, shape.time ?? 0))
  }
  return result
}

/**
 * 한 칸 남은 줄 아래에서 꿈틀대는 촉수 끝. 판 아래 가장자리(`bottomY`)에서 `reach`(칸 대비)만큼만 고개를 내민다.
 * `time`에 따라 올라왔다 내려갔다 한다(숨 쉬듯 한 호흡 ≈ 1.4초).
 */
export function tentaclePeekShape(geo: TentacleGeometry, time: number, reach = 0.55): TentacleShape {
  const total = Math.abs(geo.topY - geo.bottomY)
  const breath = 0.5 + 0.5 * Math.sin(time * 4.4)
  const head = total <= 0 ? 0 : ((reach * geo.cell) / total) * (0.65 + 0.35 * breath)
  return { head, length: Math.max(head, 0.0001), wiggle: 0.08, time }
}
