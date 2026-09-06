/**
 * 승리 축하 연출의 표현부 — **일반 스핀의 빅윈 오버레이와 프리스핀 종료 팝업이 함께 쓴다.**
 * 같은 배수면 어디서 터지든 같은 이름·같은 색·같은 길이가 나와야 하므로 연출을 두 벌 만들지 않는다.
 *
 * 세 조각으로 나눠 두었다:
 *  - `useWinRollup` — 0에서 목표까지 굴러가는 숫자. "굴러가는 중 / 다 굴렀음" 두 상태뿐이고,
 *    탭의 뜻(감기 vs 닫기)이 그 위에서 갈린다. 소비자가 각자 탭 표면을 소유한다.
 *  - `WinCelebrationFx` — 화면 전체를 덮는 배경 레이어(광선·충격파·코인). 카드의 **형제**로
 *    놓여야 한다. 카드에는 팝인 transform이 걸리는데, 그 안에 들어가면 fixed의 컨테이닝 블록이
 *    되어 위치가 어긋나고 `z-index: -1`도 무력해진다.
 *  - `WinCelebration` — 제목 + 금액. 등급 라벨은 게임팩(`theme.json`) 오버라이드가 있으면
 *    그것을, 없으면 허브 기본값(i18n)을 쓴다.
 *
 * 계산은 전부 `winCelebration.ts`(순수)에 있고 여기서는 rAF/타이머로 재생만 한다.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useT, type TranslationKey } from '../../i18n'
import {
  ROLLUP_BACKSTOP_MS,
  digitCount,
  overrideLabel,
  rollupValue,
  shockwaveDelays,
  showerCoins,
  type CelebrationTier,
  type NamedTier,
  type WinTierLabels,
} from './winTiers'
import './WinCelebration.css'

/** 허브 기본 등급 이름. 게임팩이 덮어쓰지 않으면 이 값이 화면에 나온다. */
const TIER_LABEL_KEY: Record<NamedTier, TranslationKey> = {
  surge: 'winTierSurge',
  blast: 'winTierBlast',
  storm: 'winTierStorm',
  cataclysm: 'winTierCataclysm',
}

/** 숫자가 굴러가는 중인지, 다 굴러 최종값에 앉았는지. 탭의 뜻이 이 둘 사이에서 갈린다. */
export type RollPhase = 'rolling' | 'settled'

export interface WinRollup {
  /** 지금 화면에 찍을 값 */
  readonly value: number
  readonly phase: RollPhase
  /** 굴러가는 중이면 즉시 최종값으로 감는다. 이미 끝났으면 아무 일도 없다. */
  readonly complete: () => void
}

/**
 * 0에서 `target`까지 `durationMs` 동안 굴러 올라가는 숫자.
 *
 * 값 계산은 순수 함수가 하고 여기서는 프레임마다 물어보기만 한다. rAF가 멈춘 탭/환경에서도
 * 최종 값에는 반드시 도달하도록 안전장치 타이머를 함께 건다.
 */
export function useWinRollup(target: number, durationMs: number): WinRollup {
  const [phase, setPhase] = useState<RollPhase>(() => (target > 0 ? 'rolling' : 'settled'))
  const [value, setValue] = useState(0)

  // 목표가 바뀌면 처음부터 다시 굴린다(같은 자리에서 팝업이 갈아 끼워져도 안전하게).
  useEffect(() => {
    setValue(0)
    setPhase(target > 0 ? 'rolling' : 'settled')
  }, [target])

  useEffect(() => {
    if (phase !== 'rolling') return
    let raf = 0
    let start = 0
    const step = (now: number): void => {
      if (start === 0) start = now
      const progress = (now - start) / durationMs
      setValue(rollupValue(target, progress))
      if (progress < 1) raf = requestAnimationFrame(step)
      else setPhase('settled')
    }
    raf = requestAnimationFrame(step)
    const backstop = setTimeout(() => {
      setValue(target)
      setPhase('settled')
    }, durationMs + ROLLUP_BACKSTOP_MS)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(backstop)
    }
  }, [phase, target, durationMs])

  return {
    value,
    phase,
    complete: () => {
      setValue(target)
      setPhase('settled')
    },
  }
}

interface WinCelebrationFxProps {
  tier: CelebrationTier
  reducedMotion: boolean
  /** 코인 샤워를 그릴지. 진입 팝업처럼 반짝임으로 대신하는 화면은 false. */
  shower?: boolean
}

/**
 * 배경 연출 — 광선/충격파/코인이 각각 화면 전체를 덮는 고정 레이어다.
 * 래퍼는 상자를 만들지 않으므로(`display: contents`) 세 레이어가 카드의 형제로 놓이고,
 * `z-index: -1`(광선, 카드 뒤)과 `1`(코인, 카드 앞) 사이에 글자가 낀다.
 * 모션 줄이기면 통째로 렌더하지 않는다.
 */
export function WinCelebrationFx({ tier, reducedMotion, shower = true }: WinCelebrationFxProps): ReactNode {
  if (reducedMotion) return null

  const rings = shockwaveDelays(tier)

  return (
    <div className={`hub-win-fx hub-win-fx--${tier} hub-tier--${tier}`} aria-hidden="true">
      <div className="hub-win-fx__rays" />
      {rings.length > 0 && (
        <div className="hub-win-fx__waves">
          {rings.map((delay, i) => (
            <span
              key={i}
              className="hub-win-fx__wave"
              style={{ '--hub-wave-delay': `${delay}ms` } as CSSProperties}
            />
          ))}
        </div>
      )}
      {shower && (
        <div className="hub-win-fx__shower">
          {showerCoins(tier).map((coin, i) => (
            <span
              key={i}
              className="hub-win-fx__coin"
              style={
                {
                  '--hub-coin-left': `${coin.left}%`,
                  '--hub-coin-delay': `${coin.delay}ms`,
                  '--hub-coin-duration': `${coin.duration}ms`,
                  '--hub-coin-drift': `${coin.drift}px`,
                  '--hub-coin-size': `${coin.size}px`,
                  '--hub-coin-spin': `${coin.spin}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface WinCelebrationProps {
  tier: CelebrationTier
  /** 지금 찍을 금액 — `useWinRollup`의 value. */
  value: number
  /** 게임팩이 `theme.json`으로 덮어쓴 등급 이름. 빠진 등급은 허브 기본값으로 떨어진다. */
  labels?: WinTierLabels
  /** 등급이 없을 때(`none`) 쓸 제목. 없으면 제목을 그리지 않는다. */
  plainTitle?: string
  /** 숫자 뒤에 붙는 단위('회'/'SPINS' 등). 금액에는 단위가 없어 보통 비어 있다. */
  unit?: string
  titleId?: string
  reducedMotion: boolean
  /** 금액 아래에 붙는 줄들(요약·힌트·live 영역 등) — 소비자마다 다르다. */
  children?: ReactNode
}

/**
 * 제목 + 금액 카드. 등급이 카드의 결(밀려 올라옴/터짐/휘몰아침/뒤흔듦)과 팔레트를 결정한다.
 * 탭 표면은 여기가 아니라 소비자(오버레이/모달)가 소유한다 — 배경 탭까지 같은 규칙으로
 * 다뤄야 하는데 그 표면의 모양이 서로 다르기 때문이다.
 */
export function WinCelebration({
  tier,
  value,
  labels,
  plainTitle,
  unit,
  titleId,
  reducedMotion,
  children,
}: WinCelebrationProps): ReactNode {
  const t = useT()
  const title =
    tier === 'none' ? plainTitle : (overrideLabel(tier, labels) ?? t(TIER_LABEL_KEY[tier]))

  const className = [
    'hub-win',
    `hub-win--${tier}`,
    `hub-tier--${tier}`,
    reducedMotion ? 'hub-win--still' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={className}>
      {title !== undefined && (
        <span className="hub-win__title" id={titleId}>
          {title}
        </span>
      )}
      {/* key가 자릿수라 9→10처럼 자릿수가 늘 때만 요소가 새로 붙고, 그 순간 CSS 펄스가 다시 돈다. */}
      <span className="hub-win__value" aria-hidden="true">
        <strong className="hub-win__number" key={digitCount(value)} data-testid="win-amount">
          {value.toLocaleString('en-US')}
        </strong>
        {unit !== undefined && <span className="hub-win__unit">{unit}</span>}
      </span>
      {children}
    </span>
  )
}
