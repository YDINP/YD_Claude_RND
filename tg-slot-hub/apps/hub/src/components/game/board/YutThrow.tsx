/**
 * 윷가락 4개 — CSS 3D 뒤집기(코드 드로잉). 납작한 면(밝은 면, X 무늬 3개)과 둥근 면(나무결)이 있고,
 * «납작한 면이 몇 개 위로 오나»가 도(1)·개(2)·걸(3)·윷(4)·모(0=5)다.
 *
 * 이 컴포넌트는 **정해진 결과를 보여 주기만 한다.** 어느 가락이 납작한지는 던지기 순번으로 결정론적으로 고른다
 * (`yutFaceMask`, RNG 없음). 읽는 정본은 «걸! 3칸» 같은 글자이고 가락은 연출이다(기획서 K11).
 *
 * 뒤집기는 WAAPI다. 모션 축소거나 WAAPI가 없으면 곧장 결과 면으로 놓는다.
 */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { yutFaceMask } from '../../../game/boardPlayback'

export interface YutThrowHandle {
  /** 결과(`steps` 1~5)를 던진다. `throwIndex`는 가락 배치를 정하는 순번(0부터). */
  toss(steps: number, throwIndex: number, durationMs: number): void
  /** 날고 있는 가락을 곧장 결과 면으로 내려놓는다(빨리 감기). */
  finish(): void
}

type FourFlags = readonly [boolean, boolean, boolean, boolean]

/** 가락 한 개의 두 면. `flat`이 위로 오면 앞면, 아니면 뒷면이 보인다. */
function StickFaces(): ReactNode {
  return (
    <>
      <span className="board-yut__face board-yut__face--flat" aria-hidden="true">
        <svg viewBox="0 0 18 86" width="100%" height="100%" preserveAspectRatio="none">
          {[18, 43, 68].map((y) => (
            <path key={y} d={`M5 ${y - 5} L13 ${y + 5} M13 ${y - 5} L5 ${y + 5}`} stroke="#6b4a2a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          ))}
        </svg>
      </span>
      <span className="board-yut__face board-yut__face--round" aria-hidden="true" />
    </>
  )
}

/** 멈춘 윷가락 4개(도움말 그림·대기 상태). `flat[i]`가 true면 i번째 가락의 납작한 면이 위다. */
export function YutSticksStatic({ flat, className }: { flat: FourFlags; className?: string }): ReactNode {
  return (
    <span className={['board-yut__row', className].filter(Boolean).join(' ')} aria-hidden="true">
      {flat.map((isFlat, i) => (
        <span key={i} className="board-yut__slot">
          <span className="board-yut__stick" style={{ transform: `rotateY(${isFlat ? 0 : 180}deg)` }}>
            <StickFaces />
          </span>
        </span>
      ))}
    </span>
  )
}

const REST: FourFlags = [false, false, false, false]

interface YutThrowProps {
  reducedMotion: boolean
}

export const YutThrow = forwardRef<YutThrowHandle, YutThrowProps>(function YutThrow({ reducedMotion }, ref): ReactNode {
  const stickRefs = useRef<(HTMLSpanElement | null)[]>([])
  const running = useRef<Animation[]>([])
  const [flat, setFlat] = useState<FourFlags>(REST)
  /** 던질 때마다 올라가는 번호 — 레이아웃 이펙트가 «이번에 새로 던졌다»를 알아챈다. */
  const [toss, setToss] = useState<{ key: number; durationMs: number }>({ key: 0, durationMs: 0 })

  function cancelRunning(): void {
    for (const anim of running.current) anim.cancel()
    running.current = []
  }

  useImperativeHandle(
    ref,
    () => ({
      toss(steps, throwIndex, durationMs) {
        setFlat(yutFaceMask(steps, throwIndex))
        setToss((prev) => ({ key: prev.key + 1, durationMs }))
      },
      finish() {
        for (const anim of running.current) {
          try {
            anim.finish()
          } catch {
            anim.cancel()
          }
        }
        running.current = []
      },
    }),
    [],
  )

  // 새로 던졌을 때: 화면에 그려지기 **전에** 애니메이션을 걸어 결과 면이 한 프레임도 먼저 보이지 않게 한다.
  useLayoutEffect(() => {
    if (toss.key === 0) return
    cancelRunning()
    if (reducedMotion || toss.durationMs <= 0) return
    stickRefs.current.forEach((el, i) => {
      if (el === null || typeof el.animate !== 'function') return
      const isFlat = flat[i] === true
      const final = isFlat ? 0 : 180
      const tilt = (i % 2 === 0 ? 1 : -1) * (8 + i * 3)
      const anim = el.animate(
        [
          { transform: 'translateY(0) rotateY(0deg) rotateZ(0deg)' },
          { transform: `translateY(-58px) rotateY(${540 + (i % 2) * 180}deg) rotateZ(${tilt}deg)`, offset: 0.46 },
          { transform: `translateY(0) rotateY(${720 + final}deg) rotateZ(0deg)` },
        ],
        { duration: toss.durationMs, delay: i * Math.min(40, toss.durationMs * 0.06), easing: 'cubic-bezier(.3,.5,.5,1)', fill: 'backwards' },
      )
      running.current.push(anim)
    })
    return cancelRunning
    // flat은 toss와 같은 렌더에서 바뀐다 — toss.key만 보면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toss.key])

  return (
    <span className="board-yut__row board-yut__row--live" aria-hidden="true">
      {flat.map((isFlat, i) => {
        const style: CSSProperties = { transform: `rotateY(${isFlat ? 0 : 180}deg)` }
        return (
          <span key={i} className="board-yut__slot">
            <span
              ref={(el) => {
                stickRefs.current[i] = el
              }}
              className="board-yut__stick"
              style={style}
            >
              <StickFaces />
            </span>
          </span>
        )
      })}
    </span>
  )
})
