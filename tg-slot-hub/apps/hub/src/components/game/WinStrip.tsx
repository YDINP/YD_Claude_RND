/**
 * 릴 위가 아니라 컨트롤(베팅/스핀) 바로 위에 고정으로 떠 있는 당첨금 표시줄.
 * 등급 배너(BIG/MEGA/EPIC/MAX, 프리스핀 인트로/종료)는 이제 금액 없이 등급 단어만 릴 위에 짧게
 * 뜨고, 실제 금액은 늘 이 줄에서만 보여준다 — GameScreen이 롤업/탭-스킵 로직을 그대로 소유하고
 * 이 컴포넌트는 순수 표시 + 탭 전달만 한다.
 */
import type { KeyboardEvent, ReactNode } from 'react'

interface WinStripProps {
  /** 왼쪽 라벨 — 평소 "WIN", 프리스핀 중 굴릴 당첨이 없으면 "FREE SPINS TOTAL". */
  label: string
  /** 오른쪽 금액. 굴러가는 중이면 중간값, 아니면 최종/누적값. */
  amount: number
  /** 롤업 중이거나 홀드 중일 때 탭하면 건너뛴다(GameScreen의 handleWinPresentationTap). */
  onTap?: () => void
}

export function WinStrip({ label, amount, onTap }: WinStripProps): ReactNode {
  const formattedAmount = amount.toLocaleString('en-US')

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!onTap) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTap()
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
