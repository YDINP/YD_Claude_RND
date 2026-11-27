import { beforeEach, describe, expect, it } from 'vitest'
import {
  BREAK_INTERVAL_MS,
  NEW_SESSION_HIDDEN_MS,
  breakStepOf,
  formatPlayTime,
  formatSigned,
  spinNetOf,
  usePlaySessionStore,
} from './playSession'

const T0 = 1_000_000_000_000
const MIN = 60_000

function freshSession(): void {
  sessionStorage.clear()
  usePlaySessionStore.setState({ visibleMs: 0, spinNet: 0, breakStep: 0, lastTickAt: T0, hiddenAt: null })
}

describe('spinNetOf', () => {
  it('유료 판 = 당첨 − 베팅', () => {
    expect(spinNetOf({ totalWin: 0, totalBet: 100, isFreeSpin: false })).toBe(-100)
    expect(spinNetOf({ totalWin: 350, totalBet: 100, isFreeSpin: false })).toBe(250)
  })
  it('프리스핀은 베팅이 공짜라 당첨만 더한다', () => {
    expect(spinNetOf({ totalWin: 80, totalBet: 100, isFreeSpin: true })).toBe(80)
    expect(spinNetOf({ totalWin: 0, totalBet: 100, isFreeSpin: true })).toBe(0)
  })
  it('잭팟은 더한다', () => {
    expect(spinNetOf({ totalWin: 0, jackpotWin: 5_000, totalBet: 100, isFreeSpin: false })).toBe(4_900)
  })
})

describe('playSession store', () => {
  beforeEach(freshSession)

  it('스핀과 더블업이 손익에 쌓인다(보너스류는 기록 경로 자체가 없다)', () => {
    const s = usePlaySessionStore.getState()
    s.recordSpin({ totalWin: 0, totalBet: 100, isFreeSpin: false })
    s.recordSpin({ totalWin: 300, totalBet: 100, isFreeSpin: false })
    s.recordSpin({ totalWin: 50, totalBet: 100, isFreeSpin: true })
    expect(usePlaySessionStore.getState().spinNet).toBe(-100 + 200 + 50)
    // 더블업 — 요청 전후 «지갑 + 걸린 금액» 합계의 차이
    usePlaySessionStore.getState().recordGambleDelta(1_000, 1_000 - 100)
    expect(usePlaySessionStore.getState().spinNet).toBe(150 - 100)
  })

  it('보이는 시간만 센다(숨겨진 동안은 늘지 않는다)', () => {
    usePlaySessionStore.getState().tick(T0 + 10 * MIN)
    expect(usePlaySessionStore.getState().visibleMs).toBe(10 * MIN)
    usePlaySessionStore.getState().setVisible(false, T0 + 12 * MIN)
    expect(usePlaySessionStore.getState().visibleMs).toBe(12 * MIN)
    usePlaySessionStore.getState().tick(T0 + 20 * MIN)
    expect(usePlaySessionStore.getState().visibleMs).toBe(12 * MIN)
    usePlaySessionStore.getState().setVisible(true, T0 + 25 * MIN)
    usePlaySessionStore.getState().tick(T0 + 30 * MIN)
    expect(usePlaySessionStore.getState().visibleMs).toBe(17 * MIN)
  })

  it('30분 이상 숨겨졌다 돌아오면 새 세션(시간·손익·안내 단계 초기화)', () => {
    usePlaySessionStore.getState().recordSpin({ totalWin: 0, totalBet: 100, isFreeSpin: false })
    usePlaySessionStore.getState().tick(T0 + 5 * MIN)
    usePlaySessionStore.getState().setVisible(false, T0 + 5 * MIN)
    usePlaySessionStore.getState().setVisible(true, T0 + 5 * MIN + NEW_SESSION_HIDDEN_MS)
    const s = usePlaySessionStore.getState()
    expect(s.visibleMs).toBe(0)
    expect(s.spinNet).toBe(0)
    expect(s.breakStep).toBe(0)
  })

  it('30분 미만 숨김은 같은 세션이다', () => {
    usePlaySessionStore.getState().recordSpin({ totalWin: 0, totalBet: 100, isFreeSpin: false })
    usePlaySessionStore.getState().tick(T0 + 5 * MIN)
    usePlaySessionStore.getState().setVisible(false, T0 + 5 * MIN)
    usePlaySessionStore.getState().setVisible(true, T0 + 5 * MIN + NEW_SESSION_HIDDEN_MS - 1)
    expect(usePlaySessionStore.getState().spinNet).toBe(-100)
    expect(usePlaySessionStore.getState().visibleMs).toBe(5 * MIN)
  })

  it('60분 알림은 단계마다 한 번씩(60, 120…)', () => {
    expect(breakStepOf(59 * MIN)).toBe(0)
    expect(breakStepOf(BREAK_INTERVAL_MS)).toBe(1)
    expect(breakStepOf(125 * MIN)).toBe(2)

    usePlaySessionStore.getState().tick(T0 + 59 * MIN)
    expect(usePlaySessionStore.getState().breakDue()).toBe(false)
    usePlaySessionStore.getState().tick(T0 + 60 * MIN)
    expect(usePlaySessionStore.getState().breakDue()).toBe(true)
    usePlaySessionStore.getState().ackBreak()
    expect(usePlaySessionStore.getState().breakDue()).toBe(false)
    usePlaySessionStore.getState().tick(T0 + 119 * MIN)
    expect(usePlaySessionStore.getState().breakDue()).toBe(false)
    usePlaySessionStore.getState().tick(T0 + 120 * MIN)
    expect(usePlaySessionStore.getState().breakDue()).toBe(true)
  })

  it('debugAdvance로 시간을 당기면 알림이 선다(QA 훅)', () => {
    usePlaySessionStore.getState().debugAdvance(BREAK_INTERVAL_MS)
    expect(usePlaySessionStore.getState().breakDue()).toBe(true)
  })

  it('sessionStorage에 백업된다', () => {
    usePlaySessionStore.getState().recordSpin({ totalWin: 0, totalBet: 40, isFreeSpin: false })
    const saved = JSON.parse(sessionStorage.getItem('tgslot.playSession.v1') ?? 'null') as { spinNet: number }
    expect(saved.spinNet).toBe(-40)
  })
})

describe('표기 도우미', () => {
  const labels = { hour: 'h', minute: 'm', underMinute: '<1m' }
  it('플레이 시간', () => {
    expect(formatPlayTime(30_000, labels)).toBe('<1m')
    expect(formatPlayTime(65 * MIN, labels)).toBe('1h 5m')
    expect(formatPlayTime(120 * MIN, labels)).toBe('2h')
    expect(formatPlayTime(7 * MIN, labels)).toBe('7m')
  })
  it('부호 표기(마이너스는 −)', () => {
    expect(formatSigned(-340)).toBe('−340')
    expect(formatSigned(1_250)).toBe('+1,250')
    expect(formatSigned(0)).toBe('0')
  })
})
