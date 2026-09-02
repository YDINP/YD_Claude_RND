/**
 * 릴 위가 아니라 컨트롤(베팅/스핀) 바로 위에 고정으로 떠 있는 당첨금 표시줄.
 * 등급 배너(BIG/MEGA/EPIC/MAX, 프리스핀 인트로/종료)는 이제 금액 없이 등급 단어만 릴 위에 짧게
 * 뜨고, 실제 금액은 늘 이 줄에서만 보여준다 — GameScreen이 롤업/탭-스킵 로직을 그대로 소유하고
 * 이 컴포넌트는 순수 표시 + 탭 전달만 한다.
 *
 * 더블업 세션이 진행 중이면(Wave 1) 금액 옆에 "받기/더블" 버튼 두 개가 붙는다 — 실제 판정은
 * GameScreen이 store를 통해 서버에 묻고, 이 컴포넌트는 버튼 클릭만 전달한다.
 */
import type { KeyboardEvent, ReactNode } from 'react'

interface GambleActions {
  onCollect: () => void
  onDouble: () => void
  collectLabel: string
  doubleLabel: string
  /** 코인 던지기/회수 응답을 기다리는 동안 두 버튼을 잠깐 잠근다. */
  disabled?: boolean
  /** 제안이 만료됐으면(로컬 시계 기준) "더블"은 숨기고 "받기"만 남긴다 — 새 판을 걸 수는 없어도
   * 서버가 아직 회수 처리 중일 수 있으니 눌러서 화면을 바로 맞출 수 있게는 해 둔다. */
  hideDouble?: boolean
  /** 만료까지 남은 시간을 짧게 보여준다(예: "9:45"). 없으면 표시하지 않는다. */
  expiresInLabel?: string
}

interface WinStripProps {
  /** 왼쪽 라벨 — 평소 "WIN", 프리스핀 중 굴릴 당첨이 없으면 "FREE SPINS TOTAL", 더블업 중이면 대기 금액 라벨. */
  label: string
  /** 오른쪽 금액. 굴러가는 중이면 중간값, 아니면 최종/누적/더블업 대기 값. */
  amount: number
  /** 롤업 중이거나 홀드 중일 때 탭하면 건너뛴다(GameScreen의 handleWinPresentationTap). gambleActions와는 동시에 안 쓴다. */
  onTap?: () => void
  /** 있으면 탭 대신 "받기/더블" 버튼 두 개를 보여준다. */
  gambleActions?: GambleActions
}

export function WinStrip({ label, amount, onTap, gambleActions }: WinStripProps): ReactNode {
  const formattedAmount = amount.toLocaleString('en-US')

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!onTap) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTap()
  }

  if (gambleActions) {
    return (
      <div className="hub-win-strip hub-win-strip--gamble">
        <div className="hub-win-strip__gamble-amount">
          <span className="hub-win-strip__label">{label}</span>
          <span className="hub-win-strip__amount">{formattedAmount}</span>
          {gambleActions.expiresInLabel && (
            <span className="hub-win-strip__gamble-countdown">{gambleActions.expiresInLabel}</span>
          )}
        </div>
        <div className="hub-win-strip__gamble-actions">
          <button
            type="button"
            className="hub-win-strip__gamble-btn hub-win-strip__gamble-btn--collect"
            onClick={gambleActions.onCollect}
            disabled={gambleActions.disabled}
            aria-busy={gambleActions.disabled}
          >
            {gambleActions.collectLabel}
          </button>
          {!gambleActions.hideDouble && (
            <button
              type="button"
              className="hub-win-strip__gamble-btn hub-win-strip__gamble-btn--double"
              onClick={gambleActions.onDouble}
              disabled={gambleActions.disabled}
              aria-busy={gambleActions.disabled}
            >
              {gambleActions.doubleLabel}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="hub-win-strip"
      onClick={onTap}
      onKeyDown={onTap ? handleKeyDown : undefined}
      role={onTap ? 'button' : undefined}
      tabIndex={onTap ? 0 : undefined}
      aria-label={onTap ? `${label} ${formattedAmount}` : undefined}
    >
      <span className="hub-win-strip__label">{label}</span>
      <span className="hub-win-strip__amount">{formattedAmount}</span>
    </div>
  )
}
