/**
 * 주문 카드판 — 주문 카드 라운드 중 스테이지 위에 카드 3장(430px에서 칸당 약 132×56px)을 둔다.
 * 릴 위 글자 금지 규칙에 따라 캔버스가 아닌 DOM이다.
 *
 * 값의 주인은 서버다(`cards` prop = store.orderRound). 연쇄 재생 중에는 `cascadeStep()`으로 받은
 * 지운 심볼 목록으로 **표시용** 진행도만 먼저 올리고, 스핀 응답이 오면 서버 값으로 덮어쓴다.
 * 어긋났으면 덮어쓰면서 진단 로그를 남긴다. 서버 값에서 칸의 카드가 바뀌었다면 그 칸은 완료한
 * 것이다: 도장 → 카드 뒤집힘 → 새 카드 등장 순서로 보여 준다.
 *
 * 토큰은 렌더러의 칸 좌표(`getCellRect`)에서 카드로 날아간다(단계당 최대 8개). 모션 축소와
 * STOP 압축 재생 중에는 토큰 없이 숫자만 갱신한다.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Locale, OrderCard } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import {
  addChainStep,
  addClusterSize,
  addPoppedSymbols,
  findMismatches,
  orderCardText,
  planTokens,
  replacedSlots,
} from '../../game/orders'
import './OrderBoard.css'

export interface OrderCascadeStepInput {
  index: number
  removed: readonly (readonly [number, number])[]
  removedSymbols: readonly string[]
  /** `removed`와 같은 순서의 칸 사각형(캔버스 기준 CSS px). 못 구한 칸은 null. */
  cellRects: readonly ({ x: number; y: number; w: number; h: number } | null)[]
  /** 캔버스 왼쪽 위의 화면 좌표. */
  canvasOrigin: { x: number; y: number }
  /** STOP 압축 재생 중이거나 모션 축소면 토큰 없이 숫자만 올린다. */
  skipTokens: boolean
}

export interface OrderBoardHandle {
  cascadeStep(input: OrderCascadeStepInput): void
  /** 한 번에 터뜨린 클러스터 크기(clusterSize 카드 표시용). */
  clusterSize(size: number): void
}

type SlotPhase = 'idle' | 'stamp' | 'flip' | 'deal'

interface OrderBoardProps {
  /** 서버가 확정한 카드. null이면 직전 값을 그대로 둔다(라운드가 끝나는 판에 서버 값이 먼저 사라진다). */
  cards: readonly OrderCard[] | null
  slots: number
  visible: boolean
  math: GameMath | null
  locale: Locale
  symbols?: Record<string, string>
  reducedMotion: boolean
  onTick?: () => void
  onComplete?: () => void
  onDeal?: () => void
}

const STAMP_MS = 420
const FLIP_MS = 120
const DEAL_MS = 180
const DEAL_STAGGER_MS = 140

export const OrderBoard = forwardRef<OrderBoardHandle, OrderBoardProps>(function OrderBoard(
  { cards, slots, visible, math, locale, symbols, reducedMotion, onTick, onComplete, onDeal },
  ref,
) {
  const t = useT()
  const [shown, setShown] = useState<readonly OrderCard[]>(cards ?? [])
  const shownRef = useRef<readonly OrderCard[]>(shown)
  const [phases, setPhases] = useState<readonly SlotPhase[]>([])
  const [dealAll, setDealAll] = useState(false)
  const [bumped, setBumped] = useState<readonly boolean[]>([])
  const cardEls = useRef<(HTMLDivElement | null)[]>([])
  const timers = useRef<number[]>([])
  const tokenEls = useRef<Set<HTMLElement>>(new Set())
  const wasVisible = useRef(false)
  const cb = useRef({ onTick, onComplete, onDeal })
  cb.current = { onTick, onComplete, onDeal }

  const commit = useCallback((next: readonly OrderCard[]) => {
    shownRef.current = next
    setShown(next)
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => {
    const pending = timers.current
    const flying = tokenEls.current
    return () => {
      pending.forEach((id) => window.clearTimeout(id))
      flying.forEach((el) => el.remove())
    }
  }, [])

  // 라운드에 들어오는 순간 카드를 한 장씩 깐다.
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setDealAll(true)
      cb.current.onDeal?.()
      later(() => setDealAll(false), DEAL_MS + DEAL_STAGGER_MS * Math.max(1, slots))
    }
    wasVisible.current = visible
  }, [visible, slots, later])

  // 서버 값이 오면 화면 값을 덮는다. 교체된 칸은 완료 연출 뒤에 새 카드를 깐다.
  useEffect(() => {
    if (cards === null) return
    const before = shownRef.current
    const mismatches = findMismatches(before, cards)
    if (mismatches.length > 0) {
      console.warn('[orders] 화면 진행도가 서버 값과 달라 서버 값으로 덮는다', mismatches)
    }
    const replaced = before.length === 0 ? [] : replacedSlots(before, cards).filter((s) => before[s] !== undefined)
    if (replaced.length === 0) {
      commit(cards)
      return
    }
    // 교체되는 칸은 옛 카드를 가득 찬 채로 잠깐 남긴다.
    const holding = cards.map((card, slot) =>
      replaced.includes(slot) && before[slot] !== undefined
        ? { ...(before[slot] as OrderCard), progress: (before[slot] as OrderCard).target }
        : card,
    )
    commit(holding)
    const stampMs = reducedMotion ? 160 : STAMP_MS
    setPhases(cards.map((_, slot) => (replaced.includes(slot) ? 'stamp' : 'idle')))
    cb.current.onComplete?.()
    later(() => setPhases(cards.map((_, slot) => (replaced.includes(slot) ? 'flip' : 'idle'))), stampMs)
    later(
      () => {
        commit(cards)
        setPhases(cards.map((_, slot) => (replaced.includes(slot) ? 'deal' : 'idle')))
        cb.current.onDeal?.()
      },
      stampMs + (reducedMotion ? 0 : FLIP_MS),
    )
    later(() => setPhases([]), stampMs + (reducedMotion ? 0 : FLIP_MS) + DEAL_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 콜백은 ref로 읽는다. 서버 값이 바뀔 때만 다시 돈다.
  }, [cards])

  useImperativeHandle(
    ref,
    () => ({
      clusterSize(size) {
        commit(addClusterSize(shownRef.current, size))
      },
      cascadeStep(input) {
        const before = shownRef.current
        const after = addChainStep(addPoppedSymbols(before, input.removedSymbols), input.index)
        const changed = after.some((card, i) => card.progress !== before[i]?.progress)
        const plan = input.skipTokens ? [] : planTokens(before, input.removed, input.removedSymbols)
        commit(after)
        if (!changed) return

        const finish = (): void => {
          setBumped(after.map((card, i) => card.progress !== before[i]?.progress))
          later(() => setBumped([]), 360)
          cb.current.onTick?.()
        }
        const flights = plan.flatMap((p, i) => {
          const removedIndex = input.removed.findIndex((r) => r[0] === p.from[0] && r[1] === p.from[1])
          const rect = input.cellRects[removedIndex]
          const target = cardEls.current[p.slot]?.getBoundingClientRect()
          const symbol = before[p.slot]?.symbol
          return rect && target && symbol !== undefined ? [{ rect, target, symbol, i }] : []
        })
        if (flights.length === 0 || typeof document.body.animate !== 'function') {
          finish()
          return
        }
        let landed = 0
        for (const { rect, target, symbol, i } of flights) {
          const el = document.createElement('span')
          el.className = 'hub-order-token'
          const src = symbols?.[symbol]
          if (src) el.style.backgroundImage = `url("${src}")`
          const x0 = input.canvasOrigin.x + rect.x + rect.w / 2 - 11
          const y0 = input.canvasOrigin.y + rect.y + rect.h / 2 - 11
          const dx = target.left + target.width / 2 - 11 - x0
          const dy = target.top + target.height / 2 - 11 - y0
          el.style.left = `${x0}px`
          el.style.top = `${y0}px`
          document.body.appendChild(el)
          tokenEls.current.add(el)
          const anim = el.animate(
            [
              { transform: 'translate(0,0) scale(1)', opacity: 1 },
              { transform: `translate(${dx}px,${dy}px) scale(0.6)`, opacity: 0.9 },
            ],
            { duration: 380 + i * 28, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' },
          )
          anim.onfinish = () => {
            el.remove()
            tokenEls.current.delete(el)
            landed += 1
            if (landed === flights.length) finish()
          }
        }
      },
    }),
    [commit, later, symbols],
  )

  const columns = Math.max(1, slots)
  return (
    <div
      className={visible ? 'hub-order-board hub-order-board--on' : 'hub-order-board'}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="group"
      aria-label={t('orderBoardLabel')}
      aria-hidden={visible ? undefined : true}
    >
      {Array.from({ length: columns }, (_, slot) => {
        const card = shown[slot]
        if (card === undefined) return <div key={slot} className="hub-order-card hub-order-card--empty" />
        const phase = phases[slot] ?? 'idle'
        const percent = Math.round((card.progress / card.target) * 100)
        const icon = card.symbol !== undefined ? symbols?.[card.symbol] : undefined
        const cls = [
          'hub-order-card',
          `hub-order-card--${phase}`,
          dealAll ? 'hub-order-card--deal-all' : '',
          bumped[slot] ? 'hub-order-card--bump' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <div
            key={slot}
            ref={(el) => {
              cardEls.current[slot] = el
            }}
            className={cls}
            style={{ animationDelay: dealAll ? `${slot * DEAL_STAGGER_MS}ms` : undefined }}
          >
            <div className="hub-order-card__top">
              <span className="hub-order-card__icon" aria-hidden="true">
                {icon ? <img src={icon} alt="" /> : <span>{card.kind === 'clusterSize' ? '▦' : '↯'}</span>}
              </span>
              <span className="hub-order-card__text">{orderCardText(card, math, locale, t)}</span>
            </div>
            <div className="hub-order-card__bottom">
              <span className="hub-order-card__bar" aria-hidden="true">
                <span className="hub-order-card__fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="hub-order-card__count">
                {card.progress}/{card.target}
              </span>
              <span className="hub-order-card__prize">×{card.prize}</span>
            </div>
            {phase === 'stamp' && <span className="hub-order-card__stamp">{t('orderStampDone')}</span>}
          </div>
        )
      })}
    </div>
  )
})
