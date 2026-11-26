/**
 * 윷판(`layout: "yut29"`) 노드 좌표표 — 수학(math.json)은 칸의 종류·길만 알고, 화면 위치는 여기서만 안다.
 *
 * 정규화 좌표(0~1): 정사각 판의 모퉁이는 (1,1)(1,0)(0,0)(0,1), 바깥 길은 한 변에 5칸(0.2 간격),
 * 대각선 길은 모퉁이→방(중앙)의 1/3·2/3 지점이다. 말은 출발(오른쪽 아래)에서 시계 반대 방향으로 돈다.
 * 판 가장자리 안쪽 여백은 결승 칸 반지름이라 어느 칸도 판 밖으로 나가지 않는다.
 *
 * 순수 함수만 둔다(DOM 없음) — 단위 테스트가 «가장 붙는 칸 쌍 사이 틈»과 꼬리표가 칸을 가리지 않는지를 잡는다.
 */

/** 판의 기준 한 변(px). SVG viewBox가 이 값이고, 실제 화면 크기는 CSS가 비율로 줄인다. */
export const YUT_BOARD_SIZE = 398

export type NodeSizeClass = 'normal' | 'corner' | 'goal'

/** 기준 판(398px)에서 칸 지름. 390px 화면(판 358px)에서는 비율대로 36·45·52가 된다. */
export const NODE_DIAMETER: Record<NodeSizeClass, number> = { normal: 40, corner: 50, goal: 58 }

export type NormPoint = readonly [x: number, y: number]

const YUT29_POSITIONS: Readonly<Record<string, NormPoint>> = {
  start: [1, 1],
  goal: [1, 1],
  // 오른쪽 변(위로) → 첫째 모퉁이 o5
  o1: [1, 0.8],
  o2: [1, 0.6],
  o3: [1, 0.4],
  o4: [1, 0.2],
  o5: [1, 0],
  // 위 변(왼쪽으로) → 둘째 모퉁이 o10
  o6: [0.8, 0],
  o7: [0.6, 0],
  o8: [0.4, 0],
  o9: [0.2, 0],
  o10: [0, 0],
  // 왼쪽 변(아래로) → 셋째 모퉁이 o15
  o11: [0, 0.2],
  o12: [0, 0.4],
  o13: [0, 0.6],
  o14: [0, 0.8],
  o15: [0, 1],
  // 아래 변(오른쪽으로) → 결승
  o16: [0.2, 1],
  o17: [0.4, 1],
  o18: [0.6, 1],
  o19: [0.8, 1],
  // 대각선 a: 첫째 모퉁이(오른쪽 위) → 방 → 셋째 모퉁이(왼쪽 아래)
  a1: [5 / 6, 1 / 6],
  a2: [2 / 3, 1 / 3],
  c: [0.5, 0.5],
  c1: [1 / 3, 2 / 3],
  c2: [1 / 6, 5 / 6],
  // 대각선 b: 둘째 모퉁이(왼쪽 위) → 방 → 결승
  b1: [1 / 6, 1 / 6],
  b2: [1 / 3, 1 / 3],
  f1: [2 / 3, 2 / 3],
  f2: [5 / 6, 5 / 6],
}

const CORNER_IDS: ReadonlySet<string> = new Set(['o5', 'o10', 'o15', 'c'])

export interface BoardLayout {
  readonly name: string
  readonly positions: Readonly<Record<string, NormPoint>>
}

const LAYOUTS: Readonly<Record<string, BoardLayout>> = {
  yut29: { name: 'yut29', positions: YUT29_POSITIONS },
}

/** 이름으로 좌표표를 찾는다. 모르는 이름이면 null — 호출 쪽이 지도 없이 요약만 보여 준다. */
export function boardLayout(name: string): BoardLayout | null {
  return LAYOUTS[name] ?? null
}

/** 좌표표에 없는 칸 id가 있는지(수학 설정과 화면 표가 어긋났는지) 확인한다. */
export function missingLayoutNodes(layout: BoardLayout, nodeIds: Iterable<string>): string[] {
  const missing: string[] = []
  for (const id of nodeIds) if (layout.positions[id] === undefined) missing.push(id)
  return missing
}

export function nodeSizeClass(id: string): NodeSizeClass {
  if (id === 'goal' || id === 'start') return 'goal'
  return CORNER_IDS.has(id) ? 'corner' : 'normal'
}

/** 판 한 변이 `boardPx`일 때 칸 반지름(px). */
export function nodeRadius(id: string, boardPx: number = YUT_BOARD_SIZE): number {
  return (NODE_DIAMETER[nodeSizeClass(id)] / 2) * (boardPx / YUT_BOARD_SIZE)
}

/** 결승 탑 «큰 상» 숫자 딱지 반지름(398 기준). */
export const GOAL_BADGE_R = 11.5

/**
 * 결승 탑 테두리에 붙이는 «큰 상» 숫자 딱지 원 — 판 가운데 쪽 가로 방향(아래 변을 따라)으로 테두리에 걸친다.
 * 대각선(판 가운데 쪽)은 결승 꼬리표 자리라 비워 둔다. 출발 대기에서 말(반지름 23)이 탑 한가운데를 가려도
 * 딱지 바깥 절반은 드러난다.
 */
export function goalBadgeCircle(layout: BoardLayout, boardPx: number = YUT_BOARD_SIZE): { x: number; y: number; r: number } | null {
  const c = nodeCenter(layout, 'goal', boardPx)
  if (c === null) return null
  const mid = boardPx / 2
  const k = boardPx / YUT_BOARD_SIZE
  const reach = nodeRadius('goal', boardPx) - 2 * k
  return { x: c.x + Math.sign(mid - c.x || 1) * reach, y: c.y, r: GOAL_BADGE_R * k }
}

/** 판 가장자리 안쪽 여백 = 결승 칸 반지름. */
export function boardPadding(boardPx: number = YUT_BOARD_SIZE): number {
  return (NODE_DIAMETER.goal / 2) * (boardPx / YUT_BOARD_SIZE)
}

export interface PixelPoint {
  x: number
  y: number
}

/** 칸 중심(px, 판 왼쪽 위 기준). 좌표표에 없으면 null. */
export function nodeCenter(layout: BoardLayout, id: string, boardPx: number = YUT_BOARD_SIZE): PixelPoint | null {
  const norm = layout.positions[id]
  if (norm === undefined) return null
  const pad = boardPadding(boardPx)
  const span = boardPx - pad * 2
  return { x: pad + norm[0] * span, y: pad + norm[1] * span }
}

/**
 * 가장 붙어 있는 칸 쌍들. 테스트가 «틈이 충분한가»를 모든 쌍에 대해 검사한다.
 * @returns 중심 거리에서 두 반지름의 합을 뺀 틈(px). 음수면 겹친다.
 */
export function nodeGaps(layout: BoardLayout, boardPx: number): { a: string; b: string; gap: number }[] {
  const ids = Object.keys(layout.positions)
  const out: { a: string; b: string; gap: number }[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i] as string
      const b = ids[j] as string
      // 출발과 결승은 같은 자리다 — 한 칸으로 센다.
      if ((a === 'start' && b === 'goal') || (a === 'goal' && b === 'start')) continue
      const pa = nodeCenter(layout, a, boardPx)
      const pb = nodeCenter(layout, b, boardPx)
      if (pa === null || pb === null) continue
      const distance = Math.hypot(pa.x - pb.x, pa.y - pb.y)
      out.push({ a, b, gap: distance - nodeRadius(a, boardPx) - nodeRadius(b, boardPx) })
    }
  }
  return out
}

// ───────────────────────── 꼬리표(칩) 글자와 자리 ─────────────────────────

/**
 * 한 칸에 합쳐진 결과(1~5)들의 칩 글자. 둘이면 이어 붙이고(`걸윷`), 연속한 셋 이상이면 `걸~모`처럼 줄인다 —
 * 결승 넘침은 윷·모가 겹치는 일이 잦아 글자가 길어지면 이웃 칸을 가린다.
 */
export function chipLabel(steps: readonly number[], names: readonly string[]): string {
  const name = (s: number): string => names[s] ?? String(s)
  const sorted = [...steps].sort((a, b) => a - b)
  if (sorted.length >= 3 && sorted.every((s, i) => i === 0 || s === (sorted[i - 1] as number) + 1)) {
    return `${name(sorted[0] as number)}~${name(sorted[sorted.length - 1] as number)}`
  }
  return sorted.map(name).join('·')
}

/** 칩 글자 폭(viewBox 단위, 13.5px 굵은 글씨 기준). 한글은 넓고 숫자·영문은 좁다. */
export function chipWidth(label: string): number {
  let width = 0
  for (const ch of label) width += ch.charCodeAt(0) > 255 ? 13 : 8.5
  return Math.max(22, Math.round(width + 11))
}

export interface ChipBox {
  /** 중심. */
  x: number
  y: number
  w: number
  h: number
}

/** 사각형과 원이 겹치는가(원은 여유 `margin`을 둔다). */
export function boxHitsCircle(box: ChipBox, circle: { x: number; y: number; r: number }, margin = 0): boolean {
  const nearestX = Math.max(box.x - box.w / 2, Math.min(circle.x, box.x + box.w / 2))
  const nearestY = Math.max(box.y - box.h / 2, Math.min(circle.y, box.y + box.h / 2))
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.r + margin
}

export function boxesOverlap(a: ChipBox, b: ChipBox, margin = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + margin
}

/**
 * 찾을 방향들(판 중앙을 향하는 쪽이 첫째, 그다음 22.5° 간격으로 번갈아 벌린다).
 * 대각선 길의 칸은 이웃이 빽빽해 45° 간격만으로는 «제 칸에 확실히 붙은» 자리를 못 찾는 일이 있다.
 */
const CHIP_TURNS = [0, 22.5, -22.5, 45, -45, 67.5, -67.5, 90, -90, 112.5, -112.5, 135, -135, 157.5, -157.5, 180] as const

/** 칸 가장자리에서 칩을 띄우는 거리 후보(px). 좁은 곳은 칩이 칸 테두리에 살짝 걸치게 줄여 본다. */
const CHIP_GAPS = [3, 0, -3, -6] as const

/**
 * 꼬리표가 «어느 칸 것인지» 읽히는 정도(px): 상자 중심에서 **다른 칸 중 가장 가까운 가장자리**까지 거리 −
 * **제 칸** 가장자리까지 거리. 클수록 제 칸 꼬리표로 확실히 읽히고, 0 근처나 음수면 이웃 칸 것으로 오독된다.
 */
export function chipOwnership(layout: BoardLayout, id: string, box: { x: number; y: number }, boardPx: number): { margin: number; nearest: string } {
  const own = nodeCenter(layout, id, boardPx)
  if (own === null) return { margin: Number.NEGATIVE_INFINITY, nearest: '' }
  const ownDist = Math.hypot(own.x - box.x, own.y - box.y) - nodeRadius(id, boardPx)
  let best = Number.POSITIVE_INFINITY
  let nearest = ''
  for (const other of Object.keys(layout.positions)) {
    if (other === id || (id === 'start' && other === 'goal') || (id === 'goal' && other === 'start')) continue
    const c = nodeCenter(layout, other, boardPx)
    if (c === null) continue
    const d = Math.hypot(c.x - box.x, c.y - box.y) - nodeRadius(other, boardPx)
    if (d < best) {
      best = d
      nearest = other
    }
  }
  return { margin: best - ownDist, nearest }
}

/** 꼬리표가 제 칸 것으로 읽히려면 다른 칸보다 이만큼(398 기준 px) 더 가까워야 한다. */
export const CHIP_OWN_MARGIN = 10

/**
 * 칸 `id`에 붙일 꼬리표 자리. 노드에서 **판 중앙 쪽**으로 비켜 붙이고, 다른 칸·이미 놓은 상자·판 밖과
 * 겹치거나 **이웃 칸 꼬리표로 읽힐 만큼 이웃에 가까우면**(`ownMargin`) 방향을 돌려 가며 처음으로 비는 자리를 쓴다.
 * 그런 자리가 없으면 «제 칸 우선» 조건만 풀어 한 번 더 찾고, 다 막히면 중앙 쪽 기본 자리를 그대로 준다.
 */
export function chipPlacement(
  layout: BoardLayout,
  id: string,
  boardPx: number,
  size: { w: number; h: number },
  placed: readonly ChipBox[] = [],
  /** 칸 말고도 피할 원(예: 말이 서 있는 칸 — 말은 칸보다 크다). */
  extraCircles: readonly { x: number; y: number; r: number }[] = [],
  /** 제 칸이 이웃 칸보다 얼마나 더 가까워야 하는가(px, 판 크기 비례 전). 0이면 따지지 않는다. */
  ownMargin = 0,
): ChipBox | null {
  const center = nodeCenter(layout, id, boardPx)
  if (center === null) return null
  const mid = boardPx / 2
  const baseAngle = Math.atan2(mid - center.y, mid - center.x)
  const own = nodeRadius(id, boardPx)
  const circles = Object.keys(layout.positions)
    .filter((other) => other !== id && !(id === 'start' && other === 'goal') && !(id === 'goal' && other === 'start'))
    .map((other) => {
      const p = nodeCenter(layout, other, boardPx)
      return p === null ? null : { ...p, r: nodeRadius(other, boardPx) }
    })
    .filter((c): c is { x: number; y: number; r: number } => c !== null)

  circles.push(...extraCircles)
  const needMargin = ownMargin * (boardPx / YUT_BOARD_SIZE)

  let fallback: ChipBox | null = null
  for (const strict of needMargin > 0 ? [true, false] : [false]) {
    for (const gap of CHIP_GAPS) {
      for (const turn of CHIP_TURNS) {
        const angle = baseAngle + (turn * Math.PI) / 180
        const dx = Math.cos(angle)
        const dy = Math.sin(angle)
        // 노드 가장자리에서 칩 가장자리까지 `gap`px — 방향에 따라 칩의 반폭·반높이가 다르다.
        const reach = own + gap + Math.abs(dx) * (size.w / 2) + Math.abs(dy) * (size.h / 2)
        const box: ChipBox = { x: center.x + dx * reach, y: center.y + dy * reach, w: size.w, h: size.h }
        if (fallback === null) fallback = box
        const inside =
          box.x - box.w / 2 >= 0 && box.x + box.w / 2 <= boardPx && box.y - box.h / 2 >= 0 && box.y + box.h / 2 <= boardPx
        if (!inside) continue
        if (circles.some((c) => boxHitsCircle(box, c, 1))) continue
        if (placed.some((other) => boxesOverlap(box, other, 2))) continue
        if (strict && chipOwnership(layout, id, box, boardPx).margin < needMargin) continue
        return box
      }
    }
  }
  return fallback
}

/**
 * 꼬리표에서 제 칸 쪽으로 내미는 뾰족한 꼬리(말풍선 꼬리) — 삼각형 세 점(상자 중심 기준 좌표).
 * 상자 가장자리 두 점에서 칸 테두리 안쪽 한 점까지. 꼬리가 «이 꼬리표는 이 칸 것»을 눈으로 묶는다.
 */
export function chipTail(
  box: ChipBox,
  target: PixelPoint,
  targetRadius: number,
): { base1: PixelPoint; base2: PixelPoint; tip: PixelPoint } {
  const vx = target.x - box.x
  const vy = target.y - box.y
  const len = Math.hypot(vx, vy) || 1
  const ux = vx / len
  const uy = vy / len
  // 상자 중심에서 그 방향으로 상자 테두리까지
  const toEdge = Math.min(
    Math.abs(ux) > 1e-6 ? box.w / 2 / Math.abs(ux) : Number.POSITIVE_INFINITY,
    Math.abs(uy) > 1e-6 ? box.h / 2 / Math.abs(uy) : Number.POSITIVE_INFINITY,
  )
  const baseDist = Math.max(0, toEdge - 3)
  const tipDist = Math.max(baseDist + 4, len - targetRadius + 2.5)
  const half = 4
  return {
    base1: { x: ux * baseDist - uy * half, y: uy * baseDist + ux * half },
    base2: { x: ux * baseDist + uy * half, y: uy * baseDist - ux * half },
    tip: { x: ux * tipDist, y: uy * tipDist },
  }
}
