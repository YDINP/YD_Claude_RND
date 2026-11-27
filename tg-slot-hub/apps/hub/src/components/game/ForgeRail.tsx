/**
 * 화로 배율 줄(volcano-forge) — 판 위 한 줄: 합계 상자 · 화로 칸 4개 · 모루 칩.
 * 순수 표시 컴포넌트다. 줄 값(합계·켜진 칸)은 GameScreen이 서버 응답과 연쇄 진행으로 정하고,
 * 여기서는 그리기와 불씨 비행 토큰(DOM 12개 풀 재사용)만 맡는다. 그림이 없어도 CSS 플레이스홀더로 동작한다.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type CSSProperties, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { heatFontStep } from '../../game/forge'
import './ForgeRail.css'

/** 불씨 비행 토큰 개수. 한 단계 리필 칸이 많아도 이 안에서 돌려 쓴다(넘치면 즉시 착지). */
export const EMBER_TOKEN_POOL = 12

export interface ForgeRailHandle {
  /** 뷰포트 좌표의 `from` 칸 중앙에서 화로 칸 `slot`으로 불씨를 날린다. `ms`가 0이면 바로 `onLand`. */
  launch(options: { from: { x: number; y: number }; slot: number; value: number; ms: number; onLand: () => void }): void
  /** 날고 있는 토큰을 전부 치우고 `onLand`는 부르지 않는다. */
  clear(): void
}

interface ForgeRailProps {
  heat: number
  filled: number
  slots: number
  /** 모루 칩. `count`는 판 위 모루 수, `need`는 프리스핀 진입 수, `hot`이면 3개 이상으로 붉게. */
  anvil: { count: number; need: number; hot: boolean }
  /** 프리스핀 라운드: 테두리 불꽃이 꺼지지 않는다. */
  burning: boolean
  /** 값이 바뀔 때마다 올라가는 번호. 합계 숫자 틱·가득·정산 애니메이션을 다시 튼다. */
  tickKey: number
  fullKey: number
  slamKey: number
  /** 정산 중이면 곱해질 합계를 강조한다. */
  settling: boolean
  /** `theme.props`(ember·furnace-slot). 없으면 CSS 플레이스홀더. */
  props?: Record<string, string> | undefined
  reducedMotion: boolean
}

interface Token {
  el: HTMLSpanElement | null
  busy: boolean
  anim: Animation | null
}

export const ForgeRail = forwardRef<ForgeRailHandle, ForgeRailProps>(function ForgeRail(
  { heat, filled, slots, anvil, burning, tickKey, fullKey, slamKey, settling, props, reducedMotion },
  ref,
): ReactNode {
  const t = useT()
  const slotRefs = useRef<(HTMLSpanElement | null)[]>([])
  const tokens = useRef<Token[]>(Array.from({ length: EMBER_TOKEN_POOL }, () => ({ el: null, busy: false, anim: null })))

  const release = useCallback((token: Token): void => {
    token.anim?.cancel()
    token.anim = null
    token.busy = false
    if (token.el !== null) token.el.style.display = 'none'
  }, [])

  const clear = useCallback((): void => {
    for (const token of tokens.current) release(token)
  }, [release])

  useImperativeHandle(
    ref,
    () => ({
      launch({ from, slot, value, ms, onLand }) {
        const target = slotRefs.current[Math.min(slot, slots - 1)]?.getBoundingClientRect()
        const token = tokens.current.find((candidate) => !candidate.busy && candidate.el !== null)
        if (ms <= 0 || target === undefined || token === undefined || token.el === null || typeof token.el.animate !== 'function') {
          onLand()
          return
        }
        const el = token.el
        token.busy = true
        el.textContent = `×${value}`
        el.style.display = 'grid'
        const half = 14
        const fromX = from.x - half
        const fromY = from.y - half
        const toX = target.left + target.width / 2 - half
        const toY = target.top + target.height / 2 - half
        // 솟았다가(앞 30%) 화로 칸으로 날아간다.
        const rise = Math.min(34, Math.abs(toY - fromY) * 0.2 + 14)
        const animation = el.animate(
          [
            { transform: `translate(${fromX}px, ${fromY}px) scale(0.4)`, opacity: 0 },
            { transform: `translate(${fromX}px, ${fromY - rise}px) scale(1.15)`, opacity: 1, offset: 0.3 },
            { transform: `translate(${toX}px, ${toY}px) scale(0.8)`, opacity: 1 },
          ],
          { duration: ms, easing: 'cubic-bezier(0.3, 0.1, 0.5, 1)', fill: 'forwards' },
        )
        token.anim = animation
        animation.onfinish = () => {
          release(token)
          onLand()
        }
      },
      clear,
    }),
    [clear, release, slots],
  )

  // 언마운트: 비행 토큰과 애니메이션을 전부 정리한다(메모리).
  useEffect(() => clear, [clear])

  const style: CSSProperties = {}
  const slotImg = props?.['furnace-slot']
  const emberImg = props?.ember
  if (slotImg) (style as Record<string, string>)['--forge-slot-img'] = `url(${slotImg})`
  if (emberImg) (style as Record<string, string>)['--forge-ember-img'] = `url(${emberImg})`
  const nextToFull = filled === slots - 1
  const totalMotion = slamKey > 0 ? ' hub-forge-rail__total--slam' : fullKey > 0 ? ' hub-forge-rail__total--full' : tickKey > 0 ? ' hub-forge-rail__total--tick' : ''

  return (
    <div
      className={`hub-forge-rail${burning ? ' hub-forge-rail--burning' : ''}${settling ? ' hub-forge-rail--settling' : ''}${reducedMotion ? ' hub-forge-rail--calm' : ''}`}
      style={style}
      role="group"
      aria-label={t('forgeRailAria', { heat: Math.max(1, heat), filled, slots })}
      data-heat={heat}
      data-filled={filled}
    >
      <div
        key={`${tickKey}-${fullKey}-${slamKey}`}
        className={`hub-forge-rail__total hub-forge-rail__total--${heatFontStep(heat)}${heat > 1 ? ' hub-forge-rail__total--hot' : ''}${totalMotion}`}
      >
        <span className="hub-forge-rail__times">×</span>
        <span className="hub-forge-rail__heat">{Math.max(1, heat)}</span>
      </div>
      <div className="hub-forge-rail__slots" aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            ref={(node) => {
              slotRefs.current[i] = node
            }}
            className={`hub-forge-rail__slot${i < filled ? ' hub-forge-rail__slot--lit' : ''}${nextToFull && i === slots - 1 ? ' hub-forge-rail__slot--breath' : ''}`}
          />
        ))}
      </div>
      <div
        className={`hub-forge-rail__anvil${anvil.hot ? ' hub-forge-rail__anvil--hot' : ''}${anvil.count > 0 ? ' hub-forge-rail__anvil--seen' : ''}`}
      >
        {t('forgeAnvilChip', { n: Math.min(anvil.count, anvil.need), need: anvil.need })}
      </div>
      {/* 불씨 비행 토큰 풀 — position: fixed, 평소엔 숨김 */}
      {tokens.current.map((token, i) => (
        <span
          key={i}
          ref={(node) => {
            token.el = node
          }}
          className="hub-forge-ember"
          aria-hidden="true"
        />
      ))}
    </div>
  )
})
