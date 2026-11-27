/**
 * 미션 완료 토스트 — 게임 화면 상단바 아래에 6초. 받지 않아도 미션 탭에 남는다.
 * 큐(hub.missionNotices)의 맨 앞 한 건만 보이고, 닫히면 다음 건이 이어서 뜬다.
 *
 * 받기는 화면이 idle이고 오토스핀이 꺼져 있을 때만 누를 수 있다. 오토 중에는 버튼 없이 «미션 탭에서 받기»만 3초.
 * 지갑 경합: 요청 시점의 lastResult.roundId가 응답 때 바뀌었으면 그 사이 스핀 응답이 더 새로우므로 wallet을 쓰지 않는다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Mission } from '@tgslot/shared'
import { useHubStore } from '../../store/hub'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useT, useEffectiveLocale } from '../../i18n'
import './MissionToast.css'

export const MISSION_TOAST_MS = 6000
export const MISSION_TOAST_AUTO_MS = 3000
const CLAIMED_FLASH_MS = 1000

/** idle을 기다리는 구독이 영영 남지 않게 하는 상한. 넘기면 맞추지 않고 구독만 푼다(다음 스핀 응답이 맞춘다). */
export const WALLET_REFRESH_WAIT_MS = 60_000
let pendingWalletRefresh: (() => void) | null = null

function refreshWalletWhenIdle(): void {
  pendingWalletRefresh?.()
  const run = (): void => void useSessionStore.getState().refreshMe()
  const startState = useGameStore.getState()
  if (startState.phase === 'idle') {
    run()
    return
  }
  const gameAtRequest = startState.gameId
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer)
    unsub()
    if (pendingWalletRefresh === stop) pendingWalletRefresh = null
  }
  const unsub = useGameStore.subscribe((s) => {
    // idle이 되거나, 게임을 나가 판이 더는 진행되지 않으면(로딩·오류·다른 게임) 그때 한 번 맞추고 구독을 푼다.
    if (s.phase === 'idle' || s.phase === 'loading' || s.phase === 'error' || s.gameId !== gameAtRequest) {
      stop()
      run()
    }
  })
  timer = setTimeout(stop, WALLET_REFRESH_WAIT_MS)
  pendingWalletRefresh = stop
}

export interface MissionToastProps {
  /** 게임 화면이 idle(릴 정지·정산 끝)인지 */
  idle: boolean
  autoSpinning: boolean
}

export function MissionToast({ idle, autoSpinning }: MissionToastProps): ReactNode {
  const t = useT()
  const locale = useEffectiveLocale()
  const notice = useHubStore((s) => s.missionNotices[0])
  const claimingId = useHubStore((s) => s.claimingMissionId)
  const claimMission = useHubStore((s) => s.claimMission)
  const dismiss = useHubStore((s) => s.dismissMissionNotice)
  const [claimed, setClaimed] = useState<{ mission: Mission; amount: number } | null>(null)
  const autoRef = useRef(autoSpinning)
  autoRef.current = autoSpinning

  // 알림이 새로 앞자리에 오면 그때의 오토 여부로 표시 시간을 정한다.
  const noticeId = notice?.id
  useEffect(() => {
    if (noticeId === undefined || claimed) return
    const ms = autoRef.current ? MISSION_TOAST_AUTO_MS : MISSION_TOAST_MS
    const id = setTimeout(() => dismiss(noticeId), ms)
    return () => clearTimeout(id)
  }, [noticeId, claimed, dismiss])

  useEffect(() => {
    if (!claimed) return
    const id = setTimeout(() => setClaimed(null), CLAIMED_FLASH_MS)
    return () => clearTimeout(id)
  }, [claimed])

  const current = claimed?.mission ?? notice
  if (!current) return null

  const name = locale === 'ko' && current.name.ko ? current.name.ko : current.name.en
  const fmt = (n: number): string => n.toLocaleString('en-US')

  const handleClaim = async (): Promise<void> => {
    if (!notice) return
    const roundIdAtRequest = useGameStore.getState().lastResult?.roundId
    const result = await claimMission(notice.id, {
      shouldApplyWallet: () => useGameStore.getState().lastResult?.roundId === roundIdAtRequest,
    })
    if (!result) return
    setClaimed({ mission: notice, amount: result.amount })
    // 응답 wallet을 버렸다면(그 사이 스핀이 나감) 서버가 받기를 나중에 처리했을 수도 있다 — 그 판이 끝나 idle이 되면
    // /me로 한 번 맞춘다. 판 도중에 받으면 결과가 먼저 보일 수 있어 idle까지 기다린다.
    if (useGameStore.getState().lastResult?.roundId !== roundIdAtRequest) refreshWalletWhenIdle()
  }

  let action: ReactNode
  if (claimed) {
    action = <span className="hub-mission-toast__claimed">+{fmt(claimed.amount)}</span>
  } else if (autoSpinning) {
    action = <span className="hub-mission-toast__hint">{t('missionToastAutoHint')}</span>
  } else {
    action = (
      <button
        type="button"
        className="hub-mission-toast__claim"
        disabled={!idle || claimingId !== null}
        onClick={(e) => {
          e.stopPropagation()
          void handleClaim()
        }}
      >
        {t('missionToastClaim', { amount: fmt(current.reward) })}
      </button>
    )
  }

  return (
    <div className="hub-mission-toast" role="status" data-testid="mission-toast">
      <span className="hub-mission-toast__text">{t('missionToastDone', { name })}</span>
      {action}
    </div>
  )
}
