/**
 * 윷판 — SVG 판(점선·칸·꼬리표) + HTML 말. 모든 좌표는 `yutLayout`의 표(398 기준 viewBox)에서 나오고, 판은 CSS가
 * 비율로 줄여 390px 화면(판 358px)에서도 모양이 같다.
 *
 * 연결선은 **옅은 정적 점선**이다 — 빛이 판을 훑거나 굵은 선이 긋는 연출은 쓰지 않는다(당첨 선·사선 광택 금지 취향).
 * 지름길이 열리면 그 길의 칸 등불이 **하나씩 차례로** 켜진다(`openRoute`/`forkKey`), 그 뒤로는 은은한 고리만 남는다.
 *
 * 말은 `moveToken`이 칸을 한 칸씩 콩콩 건너 옮긴다. 도착 칸·경로는 서버 기록(`path`)이 정하고 여기서는 그대로 따라간다.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react'
import type { BoardBonusConfig } from '@tgslot/slot-engine'
import type { LandingPreview } from '../../../game/boardPlayback'
import {
  TILE_FILL,
  ArrowGlyph,
  LanternGlyph,
  MatGlyph,
  SwirlGlyph,
  TowerGlyph,
  YutCrossGlyph,
  BOARD_COLORS,
} from './tileIcons'
import { YUT_BOARD_SIZE, chipLabel, chipTail, goalBadgeCircle, nodeCenter, nodeRadius, type BoardLayout } from './yutLayout'
import { TOKEN_DIAMETER, planChips } from './chipPlan'

export interface BoardMapHandle {
  /** 말을 `path`의 칸을 차례로 건너 옮긴다. 칸에 닿을 때마다 `onHop`. 끝나면 resolve. */
  moveToken(path: readonly string[], hopMs: number, onHop?: (index: number, id: string) => void): Promise<void>
  /** 진행 중인 이동을 접고 말을 곧장 `id`에 놓는다(빨리 감기). */
  snapToken(id: string): void
  /** 칸 중심의 판 기준 위치(0~1 비율). 이펙트가 좌표를 잡는 데 쓴다. */
  nodeFraction(id: string): { x: number; y: number } | null
  /** 판 DOM(흔들림·이펙트 좌표 기준). */
  element(): HTMLElement | null
}

/** 칸 위 순간 이펙트(코인·함정·배수…). `key`가 바뀌면 처음부터 다시 재생한다. */
export interface NodeEffect {
  id: string
  kind: 'coin' | 'mult' | 'trap' | 'again' | 'forward' | 'goal'
  key: number
  /** 떠오르는 글자(예: `+3`, `×3`). */
  label: string
}

interface BoardMapProps {
  config: BoardBonusConfig
  layout: BoardLayout
  /** 말의 처음 자리(복원이면 보던 칸). 이후 이동은 `moveToken`이 한다. */
  initialAt: string
  /** 말이 지금 서 있는 칸(HUD 기준). 꼬리표가 말 아래에 깔리지 않게 피한다. */
  currentAt: string
  /** 지나간(밟은) 칸. 살짝 어둡게 보인다. */
  visited: ReadonlySet<string>
  /** 던지기 직전 도·개·걸·윷·모 꼬리표. null이면 숨긴다. */
  previews: readonly LandingPreview[] | null
  /** 가장 값진 미리보기 칸 한 곳을 한 번 반짝이게(«마지막 한 번!»). */
  hotNode: string | null
  /** 지금 열려 있는 길(갈림길에 멈춘 뒤의 길). 바깥 길이면 null. */
  openRoute: string | null
  /** 지름길이 «방금» 열렸다 — 값이 바뀌면 차례 점등을 다시 한다. */
  forkKey: number
  /** 결승 도착으로 등불탑이 켜졌다. */
  towerLit: boolean
  nodeEffect: NodeEffect | null
  /** 심볼 그림(말·탑). 없으면 코드로 그린 대체물. */
  symbols: Record<string, string> | undefined
  /** 꼬리표에 쓰는 짧은 이름(ko 도·개·걸·윷·모 / en 1~5), 인덱스 1~5. */
  chipNames: readonly string[]
  forkLabel: string
  /** 말에 쓸 심볼 id. */
  tokenSymbol: string
  towerSymbol: string
  reducedMotion: boolean
}

/** 반신 그림을 말 받침 안에서 얼굴 쪽으로 자르는 값(기획서 K6). 그림이 바뀌면 여기만 조정한다. */
export const TOKEN_CROP = { scale: 1.45, x: 50, y: 30 } as const

function pct(layout: BoardLayout, id: string): { left: number; top: number } | null {
  const c = nodeCenter(layout, id, YUT_BOARD_SIZE)
  return c === null ? null : { left: (c.x / YUT_BOARD_SIZE) * 100, top: (c.y / YUT_BOARD_SIZE) * 100 }
}

/** 길들의 이웃 칸 쌍(중복 없음). 점선 한 줄씩 그린다. */
function edgePairs(config: BoardBonusConfig): [string, string][] {
  const seen = new Set<string>()
  const pairs: [string, string][] = []
  for (const nodes of Object.values(config.routes)) {
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      const a = nodes[i] as string
      const b = nodes[i + 1] as string
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([a, b])
    }
  }
  return pairs
}

const NODE_FX_COLOR: Record<NodeEffect['kind'], string> = {
  coin: BOARD_COLORS.yellow,
  mult: BOARD_COLORS.red,
  trap: '#b9a0ff',
  again: BOARD_COLORS.ivory,
  forward: '#7fb6f0',
  goal: BOARD_COLORS.lantern,
}

export const BoardMap = forwardRef<BoardMapHandle, BoardMapProps>(function BoardMap(props, ref): ReactNode {
  const { config, layout, visited, previews, hotNode, openRoute, forkKey, towerLit, nodeEffect, symbols, chipNames, reducedMotion } = props
  const mapRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef<HTMLDivElement | null>(null)
  const tokenInnerRef = useRef<HTMLDivElement | null>(null)
  /** 말이 지금 서 있는 곳(%) — 이동이 끝날 때마다 갱신한다. */
  const pos = useRef<{ left: number; top: number } | null>(null)
  /** 이동 세대. 새 이동·접기가 오면 올라가고, 낡은 이동 루프는 스스로 멈춘다. */
  const generation = useRef(0)
  const animations = useRef<Animation[]>([])

  const initial = useMemo(() => pct(layout, props.initialAt) ?? { left: 100, top: 100 }, [layout, props.initialAt])
  const initialRef = useRef(initial)

  const edges = useMemo(() => edgePairs(config), [config])
  const nodeIds = useMemo(() => Object.keys(config.nodes), [config])
  const forkIds = useMemo(() => Object.keys(config.forks), [config])

  // 꼬리표·«지름길» 글자 자리. 글자 상자를 먼저 놓고 꼬리표가 그 둘레를 피한다(`chipPlan`, 순수·테스트됨).
  const placements = useMemo(
    () => planChips({ layout, config, previews, currentAt: props.currentAt, chipNames }),
    [layout, config, previews, props.currentAt, chipNames],
  )

  const routeNodes = useMemo(() => {
    if (openRoute === null) return new Map<string, number>()
    const nodes = config.routes[openRoute] ?? []
    const order = new Map<string, number>()
    // 갈림길 칸(첫 칸) 자신은 이미 밟은 자리라 켜지 않고, 그다음부터 차례로 켠다.
    nodes.slice(1).forEach((id, i) => order.set(id, i))
    return order
  }, [config, openRoute])

  function clearAnimations(): void {
    for (const anim of animations.current) anim.cancel()
    animations.current = []
  }

  function place(p: { left: number; top: number }): void {
    const el = tokenRef.current
    if (el !== null) {
      el.style.left = `${p.left}%`
      el.style.top = `${p.top}%`
    }
    pos.current = p
  }

  useImperativeHandle(
    ref,
    () => ({
      async moveToken(path, hopMs, onHop) {
        const mine = ++generation.current
        clearAnimations()
        const token = tokenRef.current
        const inner = tokenInnerRef.current
        if (token === null) return
        for (let i = 0; i < path.length; i += 1) {
          if (generation.current !== mine) return
          const id = path[i] as string
          const target = pct(layout, id)
          if (target === null) continue
          const from = pos.current ?? initialRef.current
          onHop?.(i, id)
          if (hopMs <= 0 || typeof token.animate !== 'function') {
            place(target)
            if (hopMs <= 0 && i === path.length - 1 && typeof token.animate === 'function') {
              // 모션 축소: 한 번에 놓고 짧게 페이드로만 알린다.
              animations.current.push(token.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 120 }))
            }
            continue
          }
          const slide = token.animate(
            [
              { left: `${from.left}%`, top: `${from.top}%` },
              { left: `${target.left}%`, top: `${target.top}%` },
            ],
            { duration: hopMs, easing: 'ease-in-out', fill: 'forwards' },
          )
          animations.current.push(slide)
          if (inner !== null && typeof inner.animate === 'function') {
            animations.current.push(
              inner.animate(
                [
                  { transform: 'translateY(0) scale(1, 1)' },
                  { transform: 'translateY(-9%) scale(0.94, 1.06)', offset: 0.5 },
                  { transform: 'translateY(0) scale(1.07, 0.92)', offset: 0.86 },
                  { transform: 'translateY(0) scale(1, 1)' },
                ],
                { duration: hopMs, easing: 'ease-out' },
              ),
            )
          }
          try {
            await slide.finished
          } catch {
            // 접혔다(cancel) — 새 이동·snapToken이 위치를 정한다.
            return
          }
          if (generation.current !== mine) return
          place(target)
          slide.cancel()
        }
      },

      snapToken(id) {
        generation.current += 1
        clearAnimations()
        const target = pct(layout, id)
        if (target !== null) place(target)
      },

      nodeFraction(id) {
        const c = nodeCenter(layout, id, YUT_BOARD_SIZE)
        return c === null ? null : { x: c.x / YUT_BOARD_SIZE, y: c.y / YUT_BOARD_SIZE }
      },

      element: () => mapRef.current,
    }),
    [layout],
  )

  const tokenUrl = symbols?.[props.tokenSymbol]
  const towerUrl = symbols?.[props.towerSymbol]

  return (
    <div ref={mapRef} className="board-map" data-reduced={reducedMotion ? 'true' : undefined}>
      <svg className="board-map__svg" viewBox={`0 0 ${YUT_BOARD_SIZE} ${YUT_BOARD_SIZE}`} role="img" aria-hidden="true">
        {/* 옅은 정적 점선 — 빛·움직임 없음 */}
        <g className="board-map__edges">
          {edges.map(([a, b]) => {
            const pa = nodeCenter(layout, a, YUT_BOARD_SIZE)
            const pb = nodeCenter(layout, b, YUT_BOARD_SIZE)
            if (pa === null || pb === null) return null
            return <line key={`${a}|${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
          })}
        </g>

        {/* 갈림길: 금빛 점선 고리 + «지름길» 작은 글자 */}
        {forkIds.map((id) => {
          const c = nodeCenter(layout, id, YUT_BOARD_SIZE)
          if (c === null) return null
          const open = openRoute !== null && config.forks[id] === openRoute
          const label = placements.forkLabels.get(id)
          return (
            <g key={`fork-${id}`} className={open ? 'board-fork board-fork--open' : 'board-fork'}>
              <circle cx={c.x} cy={c.y} r={nodeRadius(id, YUT_BOARD_SIZE) + 4.5} className="board-fork__ring" />
              {/* 칸 효과 글자(«+2» 등)가 뜨는 동안은 숨긴다 — 이웃 칸 효과 글자와 겹쳐 읽힌다 */}
              {label !== undefined && nodeEffect === null && (
                <text x={label.x} y={label.y} className="board-fork__label" textAnchor="middle" dominantBaseline="central">
                  {props.forkLabel}
                </text>
              )}
            </g>
          )
        })}

        {/* 칸 */}
        {nodeIds.map((id) => {
          const node = config.nodes[id]
          const c = nodeCenter(layout, id, YUT_BOARD_SIZE)
          if (node === undefined || c === null) return null
          // 출발과 결승은 같은 자리 — 결승 탑만 그리고 출발은 멍석 받침으로 깐다.
          const r = nodeRadius(id, YUT_BOARD_SIZE)
          const dim = visited.has(id) && node.kind !== 'goal'
          const lit = routeNodes.has(id)
          const delay = routeNodes.get(id)
          const fill = TILE_FILL[node.kind]
          return (
            <g
              key={id}
              className={['board-node', `board-node--${node.kind}`, dim ? 'board-node--visited' : '', lit ? 'board-node--route' : '']
                .filter(Boolean)
                .join(' ')}
              transform={`translate(${c.x} ${c.y})`}
              data-node={id}
            >
              {lit && (
                <circle
                  key={`${id}-${forkKey}`}
                  className="board-node__light"
                  r={r + 3.5}
                  style={{ animationDelay: `${(delay ?? 0) * 45}ms` }}
                />
              )}
              {node.kind === 'goal' ? (
                <g transform={`scale(${r / 29})`}>
                  {towerLit && !reducedMotion && (
                    <>
                      <circle className="board-goal-halo" r="29" />
                      <circle className="board-goal-halo board-goal-halo--2" r="29" />
                    </>
                  )}
                  <circle r="29" fill={fill.fill} stroke={fill.stroke} strokeWidth="2.2" />
                  <TowerGlyph bonusUrl={towerUrl} lit={towerLit} />
                </g>
              ) : node.kind === 'start' ? (
                <g>
                  <circle r={r} fill={fill.fill} stroke={fill.stroke} strokeWidth="1.6" />
                  <MatGlyph />
                </g>
              ) : (
                <NodeFace kind={node.kind} value={node.value} r={r} fill={fill} />
              )}
            </g>
          )
        })}

        {/* 칸 위 순간 이펙트 */}
        {nodeEffect !== null &&
          (() => {
            const c = nodeCenter(layout, nodeEffect.id, YUT_BOARD_SIZE)
            if (c === null) return null
            const r = nodeRadius(nodeEffect.id, YUT_BOARD_SIZE)
            // 위 변의 칸은 글자를 아래로 띄운다 — 위로 올리면 HUD 숫자를 가린다.
            const labelY = c.y < 52 ? r + 20 : -r - 6
            // 양쪽 변의 칸은 글자를 판 안쪽으로 붙인다 — 가운데 정렬이면 «결승! 큰 상 30»이 판 밖으로 잘린다.
            const edge = YUT_BOARD_SIZE * 0.22
            const labelAnchor = c.x > YUT_BOARD_SIZE - edge ? 'end' : c.x < edge ? 'start' : 'middle'
            const labelX = labelAnchor === 'end' ? r : labelAnchor === 'start' ? -r : 0
            return (
              <g key={nodeEffect.key} className={`board-nodefx board-nodefx--${nodeEffect.kind}`} transform={`translate(${c.x} ${c.y})`}>
                <circle className="board-nodefx__ring" r={r} stroke={NODE_FX_COLOR[nodeEffect.kind]} />
                <circle className="board-nodefx__ring board-nodefx__ring--2" r={r} stroke={NODE_FX_COLOR[nodeEffect.kind]} />
                {nodeEffect.kind === 'trap' && <g className="board-nodefx__swirl"><SwirlGlyph /></g>}
                <text className="board-nodefx__label" x={labelX} y={labelY} textAnchor={labelAnchor} fill={NODE_FX_COLOR[nodeEffect.kind]}>
                  {nodeEffect.label}
                </text>
              </g>
            )
          })()}

        {/* 도·개·걸·윷·모 꼬리표(앞으로 갈 자리 미리보기) */}
        {previews !== null && (
          <g className="board-chips">
            {previews.map((preview) => {
              const box = placements.chips.get(preview.at)
              if (box === undefined) return null
              const text = chipLabel(preview.steps, chipNames)
              const hot = hotNode === preview.at
              const target = nodeCenter(layout, preview.at, YUT_BOARD_SIZE)
              // 말풍선 꼬리: 꼬리표가 어느 칸 것인지 눈으로 묶는다(이웃 칸 꼬리표로 오독 방지).
              const tail = target === null ? null : chipTail(box, target, nodeRadius(preview.at, YUT_BOARD_SIZE))
              return (
                <g key={preview.at} transform={`translate(${box.x} ${box.y})`}>
                  <g
                    className={['board-chip', /^[\d~·]+$/.test(text) ? 'board-chip--num' : '', preview.fork ? 'board-chip--fork' : '', hot ? 'board-chip--hot' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {tail !== null && (
                      <polygon
                        className="board-chip__tail"
                        points={`${tail.base1.x},${tail.base1.y} ${tail.tip.x},${tail.tip.y} ${tail.base2.x},${tail.base2.y}`}
                      />
                    )}
                    <rect x={-box.w / 2} y={-box.h / 2} width={box.w} height={box.h} rx={box.h / 2} />
                    <text textAnchor="middle" dominantBaseline="central" y={0.5}>
                      {text}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>
        )}
      </svg>

      {/* 말 = 초롱 아가씨 그림을 둥근 받침에 얹은 것 */}
      <div
        ref={tokenRef}
        className="board-token"
        style={{
          left: `${initialRef.current.left}%`,
          top: `${initialRef.current.top}%`,
          width: `${(TOKEN_DIAMETER / YUT_BOARD_SIZE) * 100}%`,
        }}
      >
        <div ref={tokenInnerRef} className="board-token__inner">
          {tokenUrl !== undefined ? (
            <img
              className="board-token__img"
              src={tokenUrl}
              alt=""
              draggable={false}
              style={{
                transform: `scale(${TOKEN_CROP.scale})`,
                objectPosition: `${TOKEN_CROP.x}% ${TOKEN_CROP.y}%`,
                transformOrigin: `${TOKEN_CROP.x}% ${TOKEN_CROP.y}%`,
              }}
            />
          ) : (
            <span className="board-token__fallback" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* 결승 «큰 상» 딱지 — 코인 칸처럼 숫자로 «여기 오면 +30»을 늘 보여 준다. 출발 대기에서 말이 탑에 서 있어도
          보이게 말 위 층(별도 SVG, 같은 viewBox)에 그린다. */}
      <svg className="board-map__svg board-map__over" viewBox={`0 0 ${YUT_BOARD_SIZE} ${YUT_BOARD_SIZE}`} aria-hidden="true">
        {(() => {
          const badge = goalBadgeCircle(layout, YUT_BOARD_SIZE)
          const prize = config.nodes.goal?.value
          if (badge === null || prize === undefined || prize <= 0) return null
          return (
            <g className={towerLit ? 'board-goalbadge board-goalbadge--lit' : 'board-goalbadge'} transform={`translate(${badge.x} ${badge.y})`}>
              <circle r={badge.r} />
              <text textAnchor="middle" dominantBaseline="central" y={0.6}>
                +{prize}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* 이펙트 풀(엽전·불꽃)이 붙는 층 */}
      <div className="board-map__fx" data-fx-layer="" />
    </div>
  )
})

/** 칸 하나의 얼굴: 바탕 원 + 그림 + 값 글자. */
function NodeFace({
  kind,
  value,
  r,
  fill,
}: {
  kind: Exclude<keyof typeof TILE_FILL, 'goal' | 'start'>
  value: number | undefined
  r: number
  fill: { fill: string; stroke: string; text: string }
}): ReactNode {
  const k = r / 18 // 36px 일반 칸 기준 비율
  let body: ReactNode
  switch (kind) {
    case 'coin':
      body = (
        <>
          <circle r={r - 2.4} fill="none" stroke="#b8941f" strokeWidth={0.9 * k} opacity="0.7" />
          <text className="board-node__value" fill={fill.text} dominantBaseline="central" textAnchor="middle" y={0.8 * k} fontSize={15 * k}>
            {value}
          </text>
        </>
      )
      break
    case 'mult':
      body = (
        <>
          <g transform={`translate(0 ${-5.2 * k}) scale(${0.52 * k})`}>
            <LanternGlyph layers={2} />
          </g>
          <text className="board-node__value board-node__value--small" fill={fill.text} textAnchor="middle" y={9.4 * k} fontSize={11.5 * k}>
            ×+{value}
          </text>
        </>
      )
      break
    case 'forward':
      body = (
        <>
          <g transform={`translate(0 ${-5 * k}) scale(${0.62 * k})`}>
            <ArrowGlyph />
          </g>
          <text className="board-node__value board-node__value--small" fill={fill.text} textAnchor="middle" y={9.6 * k} fontSize={12 * k}>
            {value}
          </text>
        </>
      )
      break
    case 'again':
      body = (
        <>
          <g transform={`translate(0 ${-5 * k}) scale(${0.58 * k})`}>
            <YutCrossGlyph />
          </g>
          <text className="board-node__value board-node__value--small" fill={fill.text} textAnchor="middle" y={9.6 * k} fontSize={11.5 * k}>
            +1
          </text>
        </>
      )
      break
    case 'trap':
      body = (
        <g transform={`scale(${0.95 * k})`}>
          <SwirlGlyph />
        </g>
      )
      break
  }
  return (
    <>
      <circle r={r} fill={fill.fill} stroke={fill.stroke} strokeWidth={kind === 'trap' ? 2 * k : 1.6 * k} />
      {body}
    </>
  )
}
