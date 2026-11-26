/**
 * 리스핀 HUD — 남은 리스핀 점(●●●) · «마지막!» · «판 채우기까지 N칸» 한 줄. 판 위 코인 합계는 WinStrip 한 곳에만 둔다.
 *
 * 자리를 차지하지 않고 릴 캔버스 위쪽(물 배경)에 떠 있는 알약이다 — 기본 게임에서 빈 띠가 남지 않고, 켜지고 꺼져도
 * 캔버스 크기가 바뀌지 않는다. 기본 게임에서는 보이지 않는다. 규칙 문구를 여기
 * 쓰지 않는다 — 규칙은 도움말 페이지 몫이다. 값은 렌더러가 서버 피처를 재생하며 내보낸 이벤트에서만 온다.
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import { useT } from '../../i18n'
import type { RespinView } from '../../store/coinRespin'

/** «판 채우기까지 N칸»은 빈칸이 이 수 이하일 때만 띄운다(기획서 §1-2). */
export const FILL_HINT_MAX_EMPTY = 3

interface RespinHudProps {
  view: Pick<RespinView, 'active' | 'respins' | 'left' | 'last' | 'empty' | 'coinTotal' | 'wrapping'>
  locale?: Locale
}

export function RespinHud({ view }: RespinHudProps): ReactNode {
  const t = useT()
  const showFill = view.empty > 0 && view.empty <= FILL_HINT_MAX_EMPTY
  return (
    <div className="hub-respin-hud" data-on={view.active ? 'true' : 'false'} data-last={view.last ? 'true' : 'false'}>
      <span
        className="hub-respin-hud__dots"
        role="img"
        aria-label={`${t('coinRespinLeftLabel')} ${view.left}`}
      >
        {Array.from({ length: Math.max(1, view.respins) }, (_, i) => (
          <span key={i} className="hub-respin-hud__dot" data-on={i < view.left ? 'true' : 'false'} />
        ))}
      </span>
      <span className="hub-respin-hud__mid" aria-live="polite">
        {view.active && view.empty === 0 ? (
          <b className="hub-respin-hud__full">{t('coinRespinBoardFull')}</b>
        ) : view.last ? (
          <b className="hub-respin-hud__last">{t('coinRespinLast')}</b>
        ) : showFill ? (
          <span className="hub-respin-hud__fill">{t('coinRespinFillLeft', { n: view.empty })}</span>
        ) : null}
      </span>
    </div>
  )
}
