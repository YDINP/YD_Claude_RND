/**
 * 말판 진입·복귀 커튼 — 전환 클립을 **허브 DOM에서** 재생한다.
 *
 * 렌더러의 `setMode`는 쓰지 않는다: `RendererMode`는 프리스핀 명판·금테까지 바꾸고 말판과 맞지 않기 때문이다.
 * 대신 테마의 `transitions.freeSpinsEnter/Exit`(클립 경로 + `opaqueMs` + `durationMs`)를 그대로 받아 화면 전체를 덮고,
 * **덮인 순간(`opaqueMs`)**에 `onCovered`를 불러 화면 교체(말판 장착/해제)가 그 뒤에서 일어나게 한다.
 * 클립이 없거나 못 받았거나 터보·모션 축소면 단색 커튼으로 같은 순서를 짧게 돈다.
 *
 * 타임라인(전부 `planCurtain`이 정한다):
 *   0 ── coveredAt ── revealAt ── endAt
 *   덮는 중   │ 덮여 있다(교체) │ 걷힌다 │ 끝(onDone, 요소 제거)
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SpinSpeed } from '../../../store/settings'

export interface CurtainClipSpec {
  opaqueMs?: number | undefined
  durationMs?: number | undefined
}

export interface CurtainPlan {
  /** 클립을 틀지(true) 단색 커튼만 쓸지. */
  useClip: boolean
  /** 화면이 완전히 덮이는 시각(ms). */
  coveredAtMs: number
  /** 걷히기 시작하는 시각. */
  revealAtMs: number
  /** 전부 끝나는 시각. */
  endAtMs: number
}

/** 기본값: 클립이 불투명 시각을 주지 않았을 때. 진입은 덮이는 데 시간이 걸리고 복귀 클립은 덮인 채 시작한다. */
const DEFAULT_OPAQUE_MS = { enter: 1100, exit: 0 } as const
/** 클립 길이를 모를 때 덮인 뒤 남는 시간. */
const DEFAULT_TAIL_MS = 1700
/** 걷히는 구간 길이(클립 마지막 이만큼이 걷히는 그림이다). */
const REVEAL_MS = 800

export function planCurtain(input: {
  mode: 'enter' | 'exit'
  clip: CurtainClipSpec | undefined
  /** 클립 파일을 실제로 받아 두었는가. */
  clipReady: boolean
  reducedMotion: boolean
  speed: SpinSpeed
}): CurtainPlan {
  const solid = input.reducedMotion || input.speed === 'turbo' || input.clip === undefined || !input.clipReady
  if (solid) {
    const covered = input.reducedMotion ? 120 : input.speed === 'turbo' ? 160 : 320
    const reveal = covered + 60
    return { useClip: false, coveredAtMs: covered, revealAtMs: reveal, endAtMs: reveal + (input.reducedMotion ? 120 : 280) }
  }
  const opaque = Math.max(0, input.clip?.opaqueMs ?? DEFAULT_OPAQUE_MS[input.mode])
  const duration = Math.max(opaque + 600, input.clip?.durationMs ?? opaque + DEFAULT_TAIL_MS)
  const reveal = Math.max(opaque + 200, duration - REVEAL_MS)
  return { useClip: true, coveredAtMs: opaque, revealAtMs: reveal, endAtMs: duration }
}

interface BoardCurtainProps {
  mode: 'enter' | 'exit'
  clip: CurtainClipSpec | undefined
  /** 미리 받아 둔 클립의 Blob URL. null이면 단색 커튼. */
  clipUrl: string | null
  reducedMotion: boolean
  speed: SpinSpeed
  /** 커튼이 막 시작됐다(효과음·배경음 덕킹). */
  onStart?: () => void
  /** 화면이 완전히 덮였다 — 이 순간 화면 교체. */
  onCovered: () => void
  /** 걷히기 시작한다(진입에서는 말판 진입 연출이 이때 시작한다). */
  onReveal?: () => void
  /** 다 걷혔다. 이 컴포넌트는 곧 언마운트된다. */
  onDone: () => void
}

export function BoardCurtain(props: BoardCurtainProps): ReactNode {
  const { mode, clip, clipUrl, reducedMotion, speed } = props
  const [plan] = useState(() => planCurtain({ mode, clip, clipReady: clipUrl !== null, reducedMotion, speed }))
  const [phase, setPhase] = useState<'covering' | 'covered' | 'revealing'>('covering')
  const handlers = useRef(props)
  handlers.current = props

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    handlers.current.onStart?.()
    timers.push(
      setTimeout(() => {
        setPhase('covered')
        handlers.current.onCovered()
      }, plan.coveredAtMs),
    )
    timers.push(
      setTimeout(() => {
        setPhase('revealing')
        handlers.current.onReveal?.()
      }, plan.revealAtMs),
    )
    timers.push(setTimeout(() => handlers.current.onDone(), plan.endAtMs))
    return () => {
      for (const id of timers) clearTimeout(id)
    }
  }, [plan])

  return (
    <div
      className={`board-curtain board-curtain--${mode} board-curtain--${phase}${plan.useClip && clipUrl !== null ? ' board-curtain--clip' : ''}`}
      style={{
        // 덮는 동안은 덮이는 시각까지, 걷는 동안은 남은 시간만큼 천천히 바뀐다.
        ['--curtain-in' as string]: `${Math.max(1, plan.coveredAtMs)}ms`,
        ['--curtain-out' as string]: `${Math.max(1, plan.endAtMs - plan.revealAtMs)}ms`,
      }}
      aria-hidden="true"
    >
      <div className="board-curtain__solid" />
      {plan.useClip && clipUrl !== null && <img className="board-curtain__clip" src={clipUrl} alt="" draggable={false} decoding="async" />}
    </div>
  )
}
