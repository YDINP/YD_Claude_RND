/**
 * 프리스핀 진입/종료 세리머니 팝업 — 중앙 정렬 모달(`Modal`) 한 장.
 *
 * 규칙(사용자 요구사항 그대로):
 * - 진입은 받은 프리스핀 횟수를(배수는 1보다 클 때만) 알리고, 종료는 총 획득액을 알린다.
 * - **어디를 탭해도 닫힌다** — 배경(Modal의 backdrop)이든 카드 안이든. 단 숫자가 굴러가는 중의
 *   첫 탭은 "끝까지 감기"다(닫지 않는다). 얼마를 땄는지 못 보고 닫히는 게 제일 나쁘고,
 *   그다음 탭이면 바로 닫히니 급한 사람도 두 번이면 넘어간다.
 * - 자동 닫힘은 안전장치일 뿐이라 여기서 다루지 않는다(store의 ROUND_POPUP_AUTO_CLOSE_MS).
 * - 커튼은 이 팝업이 닫힌 **뒤에야** 시작한다 — 둘은 절대 겹치지 않는다(roundFlow 참고).
 *
 * 종료 팝업의 연출은 일반 스핀의 빅윈 오버레이와 **같은 물건**이다(`WinCelebration`).
 * 등급·색·길이를 여기서 따로 정하지 않는다 — 같은 배수면 어디서 터지든 같아야 한다.
 * 이 팝업이 더하는 것은 프리스핀 문맥뿐이다: 진입의 스캐터 심볼·카운트업·배수 배지,
 * 종료의 "프리스핀 8회" 요약 한 줄.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Modal } from '../Modal'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import type { RoundPopup } from '../../game/roundFlow'
import { WinCelebration, WinCelebrationFx, useWinRollup } from './WinCelebration'
import {
  ENTRY_SPARKLES,
  celebrationTier,
  celebrationTiming,
  countUpMs,
  type CelebrationTier,
  type WinTierLabels,
} from './winTiers'
import './RoundPopup.css'

const TITLE_ID = 'hub-round-popup-title'

interface RoundPopupViewProps {
  popup: RoundPopup
  onDismiss: () => void
  /**
   * 등급 판정의 분모가 되는 이번 프리스핀 총 베팅. **없으면 등급을 올리지 않는다**
   * (`celebrationTier`) — 베팅을 짐작해서 STORM을 띄우지 않는다.
   */
  totalBet?: number
  /** 이번 프리스핀에서 실제로 돌린 판 수. 종료 팝업 요약줄에만 쓰고, 없으면 요약줄을 대체한다. */
  freeSpinsPlayed?: number
  /** 진입 팝업에서 제목 위로 떨어지는 트리거(스캐터) 심볼 이미지. 없으면 심볼 없이 그린다. */
  scatterImageUrl?: string
  /** 게임팩이 `theme.json`으로 덮어쓴 등급 이름. 빠진 등급은 허브 기본값. */
  labels?: WinTierLabels
}

export function RoundPopupView({
  popup,
  onDismiss,
  totalBet,
  freeSpinsPlayed,
  scatterImageUrl,
  labels,
}: RoundPopupViewProps): ReactNode {
  const t = useT()
  // 스토어의 reducedMotion은 초기값 자체가 OS의 prefers-reduced-motion을 반영한다(store/settings.ts) —
  // 그래서 여기선 이 값 하나만 보면 두 조건을 모두 존중하는 셈이다.
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

  const entry = popup.kind === 'freeSpinsEntry'
  /** 굴러 올라갈 목표값 — 진입은 스핀 수, 종료는 총 획득액. */
  const target = popup.kind === 'freeSpinsEntry' ? popup.spins : popup.totalWin
  /** 진입 팝업은 등급을 매기지 않는다(딴 금액이 아직 없다). */
  const tier: CelebrationTier =
    popup.kind === 'freeSpinsEntry' ? 'none' : celebrationTier(popup.totalWin, totalBet)
  const multiplier = popup.kind === 'freeSpinsEntry' ? popup.multiplier : 1
  // 세리머니는 이미 판을 멈춰 세운 자리라 서두르지 않는다(`hurried` 없음).
  const duration = entry ? countUpMs(reducedMotion) : celebrationTiming(tier, { reducedMotion }).rollupMs

  const roll = useWinRollup(target, duration)
  /**
   * 스크린리더에 한 번만 읽히는 최종 문장. 첫 렌더에서 비워 두었다가 롤업이 끝난 뒤 채우는 게
   * 요점이다 — 처음부터 값이 들어 있으면 live 영역은 "변화"가 없어 아예 읽히지 않고,
   * 매 프레임 갱신하면 중간값이 전부 읽힌다.
   */
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (roll.phase !== 'settled') return
    setAnnouncement(
      entry
        ? multiplier > 1
          ? t('freeSpinsPopupSpinsWithMultiplier', { spins: target, multiplier })
          : t('freeSpinsPopupSpins', { spins: target })
        : t('freeSpinsPopupTotal', { amount: target.toLocaleString('en-US') }),
    )
  }, [roll.phase, entry, multiplier, target, t])

  /** 탭 한 번의 뜻: 굴러가는 중이면 "끝까지 감기", 다 굴렀으면 "닫기". */
  const handleTap = (): void => {
    if (roll.phase === 'rolling') {
      roll.complete()
      return
    }
    onDismiss()
  }

  const summary =
    freeSpinsPlayed !== undefined && freeSpinsPlayed > 0
      ? t('freeSpinsPopupSpins', { spins: freeSpinsPlayed })
      : t('freeSpinsComplete')

  const cardClass = [
    'hub-round-popup',
    `hub-round-popup--${entry ? 'entry' : 'exit'}`,
    // 심볼·반짝임·배지가 등급 팔레트를 쓴다 — 팔레트는 카드 **위**에 있어야 상속된다.
    `hub-tier--${tier}`,
    reducedMotion ? 'hub-round-popup--still' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Modal onClose={handleTap} titleId={TITLE_ID}>
      {/* 배경 연출은 카드의 형제여야 한다(z-index/컨테이닝 블록 — WinCelebration.css 참고).
          진입에는 코인 샤워 대신 심볼 주위의 반짝임을 쓴다. */}
      <WinCelebrationFx tier={tier} reducedMotion={reducedMotion} shower={!entry} />

      {/* 카드 전체가 하나의 탭 영역이다 — 탭/클릭은 물론 키보드(Enter/Space)로도 같은 뜻이다.
          Modal이 열릴 때 카드 안 첫 포커스 가능 요소로 포커스를 옮기므로 이게 그 대상이 된다. */}
      <button type="button" className={cardClass} onClick={handleTap}>
        {/* 트리거 심볼은 이미지가 있을 때만 — 없으면 자리를 비워 두고 제목이 위로 올라온다. */}
        {entry && scatterImageUrl !== undefined && (
          <span className="hub-round-popup__symbol" aria-hidden="true">
            <img className="hub-round-popup__symbol-img" src={scatterImageUrl} alt="" />
          </span>
        )}

        {entry && !reducedMotion && (
          <span className="hub-round-popup__sparkles" aria-hidden="true">
            {ENTRY_SPARKLES.map((sparkle, i) => (
              <span
                key={i}
                className="hub-round-popup__sparkle"
                style={
                  {
                    '--hub-sparkle-angle': `${sparkle.angle}deg`,
                    '--hub-sparkle-distance': `${sparkle.distance}px`,
                    '--hub-sparkle-delay': `${sparkle.delay}ms`,
                    '--hub-sparkle-size': `${sparkle.size}px`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
        )}

        <WinCelebration
          tier={tier}
          value={roll.value}
          labels={labels}
          plainTitle={entry ? t('freeSpinsPopupTitle') : t('winTierPlain')}
          unit={entry ? t('freeSpinsPopupCountUnit') : undefined}
          titleId={TITLE_ID}
          reducedMotion={reducedMotion}
        >
          {/* 배수 배지는 카운트업이 **끝난 뒤에야** 나온다 — 순서가 뒤집히면 배수가 스핀 수를 잡아먹는다. */}
          {entry && multiplier > 1 && roll.phase === 'settled' && (
            <span
              className="hub-round-popup__badge"
              aria-label={t('freeSpinsPopupMultiplierLabel', { multiplier })}
            >
              ×{multiplier}
            </span>
          )}

          {!entry && <span className="hub-win__summary">{summary}</span>}

          {/* 탭의 뜻이 단계마다 다르니 힌트도 그대로 따라간다 — 굴러가는 중에 "닫혀요"라고
              써 두면 탭했는데 안 닫히는 화면이 된다. */}
          <span className="hub-win__hint">
            {t(roll.phase === 'rolling' ? 'popupTapToSkip' : 'popupTapToClose')}
          </span>

          {/* 중간값이 아니라 최종 문장만, 한 번만 읽힌다. */}
          <span className="hub-win__live" aria-live="polite">
            {announcement}
          </span>
        </WinCelebration>
      </button>
    </Modal>
  )
}
