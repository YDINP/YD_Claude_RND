/**
 * 무대 룰렛 판 — SVG 3겹. 칸 경로·라벨은 math(`StageRouletteConfig`)에서 한 번 만들어 메모하고, 돌아갈 때는
 * 고리 그룹의 `transform` 속성 하나만 바뀐다(리액트 재렌더 없음). 숫자가 math와 반드시 같아야 하므로 이미지가 아니라 코드로 그린다.
 *
 * 규칙(사용자 취향): 사선 광택 없음 · 당첨 선 없음 — 지금 고리는 원색, 나머지는 어둡게, 전구가 둘레를 돈다.
 * 칸은 `rouletteShow.ringSegments`가 정한다(불 켜진 코인 칸은 이미 2배가 된 값).
 */
import {
  forwardRef,
  memo,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { StageRouletteConfig } from '@tgslot/slot-engine'
import { useT, type TranslationKey } from '../../i18n'
import {
  WHEEL_PAD,
  WHEEL_VIEW,
  polar,
  ringBands,
  ringSegments,
  type RingBand,
  type WheelSegment,
} from '../../lib/rouletteShow'
import { trackAnimation } from '../../lib/rouletteRuntime'

export interface RouletteWheelHandle {
  /** 고리를 `deg`도(누적)로 돌려 놓는다. DOM만 바꾼다. */
  setAngle(ring: number, deg: number): void
  /** 고리가 지금 놓인 각도. */
  angleOf(ring: number): number
  /** 칸 중앙의 화면 좌표(CSS px, 뷰포트 기준). 고리의 지금 각도와 줌을 반영한다. */
  segmentPoint(ring: number, segment: number): { x: number; y: number } | null
  /** 판 중심의 화면 좌표. */
  centerPoint(): { x: number; y: number } | null
  /** 칸을 한 번 번쩍인다(멈춘 칸 강조). */
  flashSegment(ring: number, segment: number, strong?: boolean): void
  /** 포인터를 살짝 튕긴다(착지). */
  bouncePointer(): void
}

interface RouletteWheelProps {
  config: StageRouletteConfig
  /** 지금 켜진 불: 고리마다 칸 인덱스. */
  lit: readonly (readonly number[])[]
  /** 지금 돌릴 고리. 나머지는 어둡게 눌린다. */
  activeRing: number
  /** 앙코르 상한을 다 써서 «앙코르» 글자를 흐리게 할지. */
  encoreSpent: boolean
  /** 가운데 합계. */
  total: number
  /** 합계가 오를 때마다 바뀌어 숫자가 한 번 튄다. */
  totalKey: number
  /** 초기 각도(이어 보기). 마운트 때 한 번만 읽는다. */
  initialAngles: readonly number[]
  /** 응원봉 그림(작은 아이콘). 없으면 점으로 그린다. */
  lightstickSrc: string | undefined
  reducedMotion: boolean
  /** 대상 착지: 전구를 전부 켠다. */
  grandGlow: boolean
}

const RING_NAME_KEYS: Record<string, TranslationKey> = {
  outer: 'stageRouletteRingOuter',
  middle: 'stageRouletteRingMiddle',
  inner: 'stageRouletteRingInner',
}

/** 칸 라벨 글자 크기(viewBox 단위). 430px 판에서 1단위 ≈ 1.8px라 코인 값 18px, 작은 글자 14px. */
const FONT_VALUE = 10
const FONT_SMALL = 7.8

/** 거꾸로 읽으면 다른 값이 되는 숫자(6·9가 든 값). 밑줄로 방향을 알린다. */
function flipClass(value: number): string {
  return /[69]/.test(String(value)) ? ' hub-roulette__value--flip' : ''
}

export function ringNameKey(id: string, index: number): TranslationKey {
  return RING_NAME_KEYS[id] ?? (['stageRouletteRingOuter', 'stageRouletteRingMiddle', 'stageRouletteRingInner'] as const)[Math.min(index, 2)] as TranslationKey
}

interface SegmentViewProps {
  segment: WheelSegment
  encoreSpent: boolean
  lightstickSrc: string | undefined
  labels: { stepUp: string; encore: string; grand: string }
}

function SegmentLabel({ segment, encoreSpent, lightstickSrc, labels }: SegmentViewProps): ReactNode {
  // 글자는 접선 방향이라 12시에서 읽기 편하다. 칸 중앙 각도만큼 돌려 반지름 위에 놓는다.
  const at = segment.labelAt
  const common = { textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
  const transform = `rotate(${segment.midDeg} ${at.x.toFixed(2)} ${at.y.toFixed(2)})`
  switch (segment.kind) {
    case 'coin':
      return (
        <g transform={transform} className="hub-roulette__label">
          {segment.lit && (
            <>
              {lightstickSrc ? (
                <image
                  href={lightstickSrc}
                  x={at.x - 5}
                  y={at.y - 17}
                  width={10}
                  height={10}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : (
                <circle cx={at.x} cy={at.y - 11.5} r={2.4} className="hub-roulette__spark" />
              )}
            </>
          )}
          <text x={at.x} y={at.y + (segment.lit ? 2.2 : 0)} fontSize={FONT_VALUE} className={`hub-roulette__value${flipClass(segment.shownValue)}`} {...common}>
            ×{segment.shownValue}
          </text>
        </g>
      )
    case 'stepUp':
      return (
        <g transform={transform} className="hub-roulette__label">
          <path
            d={`M${at.x} ${at.y - 8.2}L${at.x + 5.2} ${at.y - 1.2}H${at.x - 5.2}Z`}
            className="hub-roulette__arrow"
          />
          <text x={at.x} y={at.y + 5.8} fontSize={FONT_SMALL} className="hub-roulette__small" {...common}>
            {labels.stepUp}
          </text>
        </g>
      )
    case 'encore':
      return (
        <g transform={transform} className={encoreSpent ? 'hub-roulette__label hub-roulette__label--spent' : 'hub-roulette__label'}>
          <text x={at.x} y={at.y - 4.6} fontSize={FONT_SMALL} className="hub-roulette__small hub-roulette__encore-word" {...common}>
            {labels.encore}
          </text>
          <text x={at.x} y={at.y + 5} fontSize={FONT_VALUE - 0.6} className={`hub-roulette__value${flipClass(segment.shownValue)}`} {...common}>
            ×{segment.shownValue}
          </text>
        </g>
      )
    default:
      return (
        <g transform={transform} className="hub-roulette__label">
          <text x={at.x} y={at.y - 5} fontSize={FONT_SMALL} className="hub-roulette__small hub-roulette__grand-word" {...common}>
            ★ {labels.grand}
          </text>
          <text x={at.x} y={at.y + 5.2} fontSize={FONT_VALUE} className={`hub-roulette__value hub-roulette__value--grand${flipClass(segment.shownValue)}`} {...common}>
            ×{segment.shownValue}
          </text>
        </g>
      )
  }
}

interface RingViewProps {
  config: StageRouletteConfig
  band: RingBand
  lit: readonly number[]
  active: boolean
  encoreSpent: boolean
  lightstickSrc: string | undefined
  labels: { stepUp: string; encore: string; grand: string }
  name: string
  setRef: (el: SVGGElement | null) => void
  glow: boolean
}

/** 고리 하나. 불·활성·앙코르 소진이 바뀔 때만 다시 그린다(회전은 이 안을 건드리지 않는다). */
const RingView = memo(function RingView({
  config,
  band,
  lit,
  active,
  encoreSpent,
  lightstickSrc,
  labels,
  name,
  setRef,
  glow,
}: RingViewProps): ReactNode {
  const segments = useMemo(() => ringSegments(config, band, lit), [config, band, lit])
  const bulbCount = band.count * 2
  const bulbRadius = band.outer - 1.7
  return (
    <g className="hub-roulette__ring" data-ring={band.ring} data-active={active ? 'true' : 'false'} data-glow={glow ? 'true' : 'false'}>
      <title>{name}</title>
      <g ref={setRef} className="hub-roulette__spinner">
        {segments.map((segment) => (
          <g
            key={segment.index}
            data-seg={segment.index}
            className={`hub-roulette__seg hub-roulette__seg--${segment.kind}${segment.lit ? ' hub-roulette__seg--lit' : ''}${
              encoreSpent && segment.kind === 'encore' ? ' hub-roulette__seg--spent' : ''
            }`}
          >
            <path d={segment.path} />
            <SegmentLabel segment={segment} encoreSpent={encoreSpent} lightstickSrc={lightstickSrc} labels={labels} />
          </g>
        ))}
        {Array.from({ length: bulbCount }, (_, i) => {
          const p = polar(bulbRadius, (i + 0.5) * (360 / bulbCount))
          return (
            <circle
              key={i}
              cx={p.x.toFixed(2)}
              cy={p.y.toFixed(2)}
              r={1.25}
              className="hub-roulette__bulb"
              style={{ ['--bulb' as string]: i % 4 }}
            />
          )
        })}
      </g>
    </g>
  )
})

export const RouletteWheel = forwardRef<RouletteWheelHandle, RouletteWheelProps>(function RouletteWheel(
  { config, lit, activeRing, encoreSpent, total, totalKey, initialAngles, lightstickSrc, reducedMotion, grandGlow },
  ref,
) {
  const t = useT()
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointerRef = useRef<SVGGElement | null>(null)
  const ringEls = useRef<(SVGGElement | null)[]>([])
  const angles = useRef<number[]>(config.rings.map((_, i) => initialAngles[i] ?? 0))
  const { bands, hub } = useMemo(() => ringBands(config.rings.map((r) => r.segments.length)), [config])
  const labels = useMemo(
    () => ({ stepUp: t('stageRouletteLabelStepUp'), encore: t('stageRouletteLabelEncore'), grand: t('stageRouletteLabelGrand') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 언어가 바뀔 때만 다시 만든다(useT는 매 렌더 새 함수).
    [t('stageRouletteLabelStepUp')],
  )

  // 마운트 때 한 번 초기 각도를 DOM에 놓는다. 이후에는 setAngle만 바꾼다(리액트가 이 속성을 다시 쓰지 않는다).
  useLayoutEffect(() => {
    config.rings.forEach((_, i) => {
      ringEls.current[i]?.setAttribute('transform', `rotate(${angles.current[i] ?? 0})`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 초기값 한 번.
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      setAngle(ring, deg) {
        angles.current[ring] = deg
        ringEls.current[ring]?.setAttribute('transform', `rotate(${deg.toFixed(3)})`)
      },
      angleOf(ring) {
        return angles.current[ring] ?? 0
      },
      segmentPoint(ring, segment) {
        const svg = svgRef.current
        const band = bands[ring]
        const cfg = config.rings[ring]
        if (!svg || !band || !cfg) return null
        const sweep = 360 / cfg.segments.length
        const p = polar(band.mid, (segment + 0.5) * sweep + (angles.current[ring] ?? 0))
        const rect = svg.getBoundingClientRect()
        return {
          x: rect.left + ((p.x + WHEEL_VIEW) / (2 * WHEEL_VIEW)) * rect.width,
          y: rect.top + ((p.y + WHEEL_VIEW) / (2 * WHEEL_VIEW)) * rect.height,
        }
      },
      centerPoint() {
        const svg = svgRef.current
        if (!svg) return null
        const rect = svg.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      },
      flashSegment(ring, segment, strong = false) {
        if (reducedMotion) return
        const path = ringEls.current[ring]?.querySelector(`[data-seg="${segment}"] path`)
        if (!path || typeof (path as SVGPathElement).animate !== 'function') return
        const anim = (path as SVGPathElement).animate(
          [
            { strokeWidth: '0.6px', filter: 'brightness(1)' },
            { strokeWidth: strong ? '3.4px' : '2.4px', filter: 'brightness(1.6)', offset: 0.35 },
            { strokeWidth: '0.6px', filter: 'brightness(1)' },
          ],
          { duration: strong ? 900 : 560, easing: 'ease-out' },
        )
        trackAnimation(anim)
      },
      bouncePointer() {
        const el = pointerRef.current?.querySelector('.hub-roulette__pointer-body')
        if (reducedMotion || !el || typeof (el as SVGGElement).animate !== 'function') return
        const anim = (el as SVGGElement).animate(
          [{ transform: 'translateY(0px)' }, { transform: 'translateY(-4px)', offset: 0.3 }, { transform: 'translateY(0px)' }],
          { duration: 260, easing: 'ease-out' },
        )
        trackAnimation(anim)
      },
    }),
    [bands, config, reducedMotion],
  )

  const activeBand = bands[Math.min(activeRing, bands.length - 1)]
  const tip = activeBand ? activeBand.mid : bands[0]?.mid ?? 80
  const view = WHEEL_VIEW

  return (
    <svg
      ref={svgRef}
      className="hub-roulette__svg"
      viewBox={`${-view} ${-view} ${2 * view} ${2 * view}`}
      role="img"
      aria-label={t('stageRouletteTitle')}
      data-reduced={reducedMotion ? 'true' : 'false'}
    >
      <defs>
        <radialGradient id={`${uid}-hub`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#3a2a5c" />
          <stop offset="1" stopColor="#14101f" />
        </radialGradient>
      </defs>
      <circle r={bands[0] ? bands[0].outer + 3.4 : 104} className="hub-roulette__rim" />
      {bands.map((band) => (
        <RingView
          key={band.ring}
          config={config}
          band={band}
          lit={lit[band.ring] ?? []}
          active={band.ring === activeRing}
          encoreSpent={encoreSpent}
          lightstickSrc={lightstickSrc}
          labels={labels}
          name={t(ringNameKey(config.rings[band.ring]?.id ?? '', band.ring))}
          glow={grandGlow && band.ring === bands.length - 1}
          setRef={(el) => {
            ringEls.current[band.ring] = el
          }}
        />
      ))}
      <circle r={hub} fill={`url(#${uid}-hub)`} className="hub-roulette__hub" />
      <text y={-hub * 0.34} className="hub-roulette__hub-label" textAnchor="middle" dominantBaseline="central">
        {t('stageRouletteTotalShort')}
      </text>
      <text
        key={totalKey}
        y={hub * 0.18}
        className="hub-roulette__hub-total"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={total >= 100000 ? 11 : total >= 10000 ? 13 : 15.5}
      >
        {total.toLocaleString('en-US')}
      </text>
      <g ref={pointerRef} className="hub-roulette__pointer" style={{ transform: `translateY(${(-tip).toFixed(2)}px)` }}>
        <g className="hub-roulette__pointer-body">
          <path d="M-7.4 -17.5H7.4L0 -1.2Z" />
        </g>
      </g>
    </svg>
  )
})

interface RouletteBoardPreviewProps {
  config: StageRouletteConfig
  lightstickSrc: string | undefined
}

/**
 * 도움말용 정지 판 그림. 칸 값은 math 그대로이고 돌지도 불이 켜지지도 않는다.
 * 라벨·색은 실제 판과 같은 클래스를 쓴다(`.hub-roulette__*`).
 */
export function RouletteBoardPreview({ config, lightstickSrc }: RouletteBoardPreviewProps): ReactNode {
  const t = useT()
  const { bands, hub } = useMemo(() => ringBands(config.rings.map((r) => r.segments.length)), [config])
  const labels = {
    stepUp: t('stageRouletteLabelStepUp'),
    encore: t('stageRouletteLabelEncore'),
    grand: t('stageRouletteLabelGrand'),
  }
  const view = WHEEL_VIEW - WHEEL_PAD + 4
  return (
    <svg
      className="hub-roulette__svg"
      viewBox={`${-view} ${-view} ${2 * view} ${2 * view}`}
      role="img"
      aria-label={t('stageRouletteHelpBoardTitle')}
    >
      <circle r={(bands[0]?.outer ?? 100) + 3.4} className="hub-roulette__rim" />
      {bands.map((band) => (
        <g key={band.ring} className="hub-roulette__ring" data-active="true">
          {ringSegments(config, band, []).map((segment) => (
            <g key={segment.index} className={`hub-roulette__seg hub-roulette__seg--${segment.kind}`}>
              <path d={segment.path} />
              <SegmentLabel segment={segment} encoreSpent={false} lightstickSrc={lightstickSrc} labels={labels} />
            </g>
          ))}
        </g>
      ))}
      <circle r={hub} className="hub-roulette__hub" fill="#14101f" />
      <text y={0} className="hub-roulette__hub-label" textAnchor="middle" dominantBaseline="central">
        {t('stageRouletteTitle')}
      </text>
    </svg>
  )
}
