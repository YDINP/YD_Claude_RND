/**
 * 말판 화면 안전장치 — 말판(BoardBonus)·전환 커튼이 그리다 예외를 던져도 게임이 멈추지 않게 한다.
 *
 * spin()은 말판 재생이 끝났다는 `finishBoard()`를 기다린다. 말판 컴포넌트가 렌더 중 죽으면 그 신호가 영영 오지 않아
 * 스핀 버튼이 잠긴 채로 남는다. 이 경계가 예외를 잡아 `onFail`(말판 접기 + finishBoard)을 한 번 부른다.
 * 결과·지갑은 서버가 이미 정했으니 화면만 접으면 된다.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onFail: (error: unknown) => void
}

interface State {
  failed: boolean
}

export class BoardErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[board] 말판 화면 오류 — 말판을 접고 게임을 이어 간다', error, info.componentStack)
    this.props.onFail(error)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
