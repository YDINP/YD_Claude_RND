/**
 * 릴 위가 아니라 컨트롤(베팅/스핀) 바로 위에 고정으로 떠 있는 당첨금 표시줄. 모든 내용을
 * 가운데 정렬한 4단 레이아웃으로 고정한다 — (1) 작은 라벨(WIN/FREE SPINS TOTAL/더블업 대기),
 * (2) 금액(중앙 큰 글씨), (3) 라인 텍스트 줄(고정 높이 — 비어 있어도 높이를 유지해 아래 요소가
 * 들썩이지 않는다), (4) 더블업 받기/더블 버튼 줄(있을 때만 나타나되, 한 번 나타나면 고정이다).
 * 등급 배너(BIG/MEGA/EPIC/MAX 등, 릴 위 오버레이)는 없앴다 — 실제 금액은 늘 이 줄에서만
 * 보여준다. GameScreen이 롤업 로직을 소유하고 이 컴포넌트는 순수 표시 + 탭 전달만 한다.
 *
 * 렌더러가 승리 연출을 순환(loop)하는 동안 `winLine`/`winCycle` 이벤트가 계속 들어오는데,
 * GameScreen은 그걸 받아 `lineLabel`로 "어떤 심볼이 얼마를 땄는지"를 여기 실어 준다 — 같은
 * 문구가 매 바퀴 반복돼도(당첨 라인이 하나뿐이면 특히) 순환이 눈에 보이도록 `lineLabel.key`가
 * 바뀔 때마다 짧게 페이드/팝 한다(문구 자체가 같아도 key를 바꿔서 애니메이션을 다시 튼다).
 *
 * 더블업 세션이 진행 중이면(Wave 1) 받기/더블 버튼 두 개가 붙는다 — 실제 판정은 GameScreen이
 * store를 통해 서버에 묻고, 이 컴포넌트는 버튼 클릭만 전달한다. gambleActions가 떠 있는
 * 동안에도 lineLabel은 계속 보여준다(사용자 요청 — 루핑 돌 때마다 어떤 심볼이 얼마 당첨됐는지
 * 반복 표기한다) — (3)번 줄에 라인 텍스트와 만료 카운트다운이 함께 있을 수 있으므로 둘 다 같은
 * 줄에 나란히 얹되 사이에 여백을 둔다(CSS gap). (4)번 버튼 줄은 별도라 라인 텍스트가 바뀌어도
 * 리마운트되거나 움직이지 않는다.
 *
 * 프리스핀 진행 상황("프리스핀 5/8 ×2")은 릴 위에 그리던 명판을 없애면서 이 줄로 옮겨왔다 —
 * (1) 라벨 바로 아래에 `freeSpinsCounter`를 얹어 라벨과 한 블록으로 읽히게 한다. lineRow와
 * 같은 이유로 항상 렌더링된 채 내용만 비웠다 채웠다 한다(min-height 고정) — 프리스핀
 * 진입/이탈 때 금액·버튼 줄이 들썩이지 않는다. 원천 데이터는 store의 freeSpins 상태이지
 * 렌더러 이벤트가 아니다(GameScreen이 문구까지 합성해 내려준다).
 */
import type { KeyboardEvent, ReactNode } from 'react'

export interface WinStripLineLabel {
  /**
   * "위스키 ×3 · 20" 같은, 이번 라인/사이클이 무엇을 땄는지 보여주는 문구. `icons`가 있어도
   * 이 값은 항상 완전한 폴백 문구로 채워 둔다 — 이미지가 없거나 접근성 트리에서 대체 텍스트가
   * 필요할 때(스크린리더의 `icons.ariaLabel` + suffix 조합과 별개로) 그대로 쓸 수 있게.
   */
  text: string
  /**
   * 같은 문구가 다시 와도(당첨 라인이 하나뿐이면 매 바퀴 반복된다) React가 새 엘리먼트로 보고
   * 페이드/팝 애니메이션을 다시 틀도록 매번 바뀌는 값(단조 증가 카운터 등)을 넣는다.
   */
  key: number
  /**
   * 있으면 심볼 이름 대신 이미지를 count번 반복해 보여준다("사용자 요청: 심볼 이름 대신
   * 이미지 개수만큼"). 그룹 승리(Any BAR 등, 대표 이미지가 없다)나 이미지를 못 찾은 경우엔
   * 호출부가 이 필드를 아예 비워 `text`만으로 폴백하게 만든다 — WinStrip 자신은 폴백 판단을
   * 하지 않는다.
   */
  icons?: {
    /** 심볼 이미지 URL. 배열 길이가 곧 맞은 개수(count)다 — 그대로 나열해서 그린다. */
    srcs: string[]
    /** 아이콘 그룹의 스크린리더용 대체 텍스트 — "위스키 ×3"(이름 + 개수). 개별 img는 alt="". */
    ariaLabel: string
    /** 아이콘 뒤에 이어 붙는 나머지 문구(예: "4 ways · 348" 또는 "20"). */
    suffix: string
  }
}

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
  /** 라벨 — 평소 "WIN", 프리스핀 중 굴릴 당첨이 없으면 "FREE SPINS TOTAL", 더블업 중이면 대기 금액 라벨. */
  label: string
  /** 금액. 굴러가는 중이면 중간값, 아니면 최종/누적/더블업 대기 값. */
  amount: number
  /** 있으면 탭 가능하게 만든다(스킵 등). gambleActions와는 동시에 안 쓴다. */
  onTap?: () => void
  /** 있으면 받기/더블 버튼 줄을 보여준다. */
  gambleActions?: GambleActions
  /** 렌더러의 winLine/winCycle 이벤트로 채워지는, "어떤 심볼이 얼마를 땄는지" 한 줄. 없으면 빈 줄(높이만 유지). */
  lineLabel?: WinStripLineLabel | null
  /**
   * 프리스핀 진행 상황("프리스핀 5/8 ×2" 등, store의 freeSpins 상태에서 만든 문구). 릴 위에
   * 그리던 명판을 없애면서 이 자리로 옮겨왔다 — label(프리스핀 누적)과 한 블록으로 붙어 보이도록
   * 라벨 바로 아래, 금액 위에 둔다. 프리스핀 중이 아니면 null/undefined — 그래도 줄 자체는 항상
   * 남겨 높이만 유지한다(진입/이탈 시 아래 금액·버튼 줄이 들썩이지 않도록).
   */
  freeSpinsCounter?: string | null
}

export function WinStrip({
  label,
  amount,
  onTap,
  gambleActions,
  lineLabel,
  freeSpinsCounter,
}: WinStripProps): ReactNode {
  const formattedAmount = amount.toLocaleString('en-US')

  // 라벨과 한 블록으로 읽히도록 라벨 바로 아래, 금액 위에 둔다. 프리스핀이 아니면 내용 없이
  // 높이만 유지해(min-height) 진입/이탈 때 금액·버튼 줄이 튀지 않게 한다.
  const freeSpinsRow = (
    <div className="hub-win-strip__free-spins-row">
      {freeSpinsCounter && <span className="hub-win-strip__free-spins-counter">{freeSpinsCounter}</span>}
    </div>
  )

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!onTap) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTap()
  }

  // (3)번 줄 — 라인 텍스트와 더블업 만료 카운트다운이 동시에 있을 수 있다(둘 다 같은 고정 높이
  // 줄에 나란히 얹는다, gap은 CSS가 준다). 둘 다 없으면 빈 채로 높이만 유지해 아래 버튼 줄이
  // 들썩이지 않는다.
  const lineRow = (
    <div className="hub-win-strip__line-row">
      {lineLabel &&
        (lineLabel.icons ? (
          <span key={lineLabel.key} className="hub-win-strip__line-label">
            <span className="hub-win-strip__line-icons" aria-label={lineLabel.icons.ariaLabel}>
              {lineLabel.icons.srcs.map((src, i) => (
                <img key={i} className="hub-win-strip__line-icon" src={src} alt="" aria-hidden="true" />
              ))}
            </span>
            {lineLabel.icons.suffix && <span> · {lineLabel.icons.suffix}</span>}
          </span>
        ) : (
          <span key={lineLabel.key} className="hub-win-strip__line-label">
            {lineLabel.text}
          </span>
        ))}
      {gambleActions?.expiresInLabel && (
        <span className="hub-win-strip__gamble-countdown">{gambleActions.expiresInLabel}</span>
      )}
    </div>
  )

  const gambleActionsRow = gambleActions && (
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
  )

  if (gambleActions) {
    return (
      <div className="hub-win-strip hub-win-strip--gamble">
        <span className="hub-win-strip__label">{label}</span>
        {freeSpinsRow}
        <span className="hub-win-strip__amount">{formattedAmount}</span>
        {lineRow}
        {gambleActionsRow}
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
      {freeSpinsRow}
      <span className="hub-win-strip__amount">{formattedAmount}</span>
      {lineRow}
    </div>
  )
}
