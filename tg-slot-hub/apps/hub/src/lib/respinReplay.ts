/**
 * 코인 리스핀 «이어 보기» 저장소.
 *
 * 결과와 잔액은 서버 응답을 받은 순간 이미 확정이다 — 새로고침해도 돈은 잃지 않는다. 잃는 것은 **연출**뿐이라,
 * 리스핀 응답을 받으면 연출을 시작하기 전에 그 응답을 `localStorage`에 저장하고 연출이 끝나면 지운다.
 * 다시 열었을 때 10분 안이면 그 응답을 «표시 전용»으로 처음부터 재생한다(잔액은 서버 값 그대로, 재생 중 갱신하지 않는다).
 *
 * `sessionStorage`가 아닌 이유: 텔레그램 미니앱은 닫았다 다시 열면 새 웹뷰라 `sessionStorage`가 비어 있다.
 * 읽기·쓰기는 전부 try/catch다 — 시크릿 창·저장소 차단에서도 오류 없이 평소 화면으로 간다(재생 없음).
 */
import { SpinResponseSchema, type SpinResponse } from '@tgslot/shared'
import { useSessionStore } from '../store/session'

export const RESPIN_REPLAY_KEY_PREFIX = 'tgslot.respinReplay.'
/** 이 시간(ms)이 지난 기록은 재생하지 않는다. */
export const RESPIN_REPLAY_MAX_AGE_MS = 10 * 60 * 1000

export interface RespinReplayRecord {
  roundId: string
  response: SpinResponse
  savedAt: number
}

/**
 * 저장 키. 로그인한 사용자 id를 붙인다 — 같은 기기에서 계정을 바꾸면 남의 리스핀 연출이 재생되지 않게 한다.
 * (표시 전용이라 돈 문제는 없지만 헷갈린다.) 사용자를 모르면 게임 id만 쓴다.
 */
function keyOf(gameId: string): string {
  let owner: string | undefined
  try {
    owner = useSessionStore.getState().user?.id
  } catch {
    owner = undefined
  }
  return owner === undefined ? `${RESPIN_REPLAY_KEY_PREFIX}${gameId}` : `${RESPIN_REPLAY_KEY_PREFIX}${gameId}.${owner}`
}

/** 코인 리스핀을 담은 응답인가. 이어 볼 것이 있는 응답만 저장한다. */
export function hasCoinRespin(response: Pick<SpinResponse, 'features'>): boolean {
  return response.features.some((feature) => feature.type === 'coinRespin')
}

/** 기록이 아직 이어 볼 만한가. 순수 함수라 시계를 주입해 검증한다. */
export function isReplayFresh(record: Pick<RespinReplayRecord, 'savedAt'>, now: number): boolean {
  const age = now - record.savedAt
  return Number.isFinite(age) && age >= 0 && age <= RESPIN_REPLAY_MAX_AGE_MS
}

export function saveRespinReplay(gameId: string, response: SpinResponse, now: number = Date.now()): void {
  if (!hasCoinRespin(response)) return
  try {
    const record: RespinReplayRecord = { roundId: response.roundId, response, savedAt: now }
    localStorage.setItem(keyOf(gameId), JSON.stringify(record))
  } catch {
    /* 저장소를 못 쓴다 — 이어 보기 없이 계속 진행 */
  }
}

export function clearRespinReplay(gameId: string): void {
  try {
    localStorage.removeItem(keyOf(gameId))
  } catch {
    /* 저장소를 못 쓴다 */
  }
}

/**
 * 이어 볼 기록. 없거나 10분이 지났거나 모양이 틀리면 null이다(틀린 기록은 지워 다음에 또 읽지 않게 한다).
 * 응답은 서버 스키마로 다시 검증한다 — 저장소는 누구나 고칠 수 있는 곳이다.
 */
export function readRespinReplay(gameId: string, now: number = Date.now()): RespinReplayRecord | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(keyOf(gameId))
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as { roundId?: unknown; response?: unknown; savedAt?: unknown }
    const response = SpinResponseSchema.safeParse(parsed.response)
    if (
      typeof parsed.roundId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      !response.success ||
      !hasCoinRespin(response.data)
    ) {
      clearRespinReplay(gameId)
      return null
    }
    const record: RespinReplayRecord = { roundId: parsed.roundId, response: response.data, savedAt: parsed.savedAt }
    if (!isReplayFresh(record, now)) {
      clearRespinReplay(gameId)
      return null
    }
    return record
  } catch {
    clearRespinReplay(gameId)
    return null
  }
}

interface RespinLike {
  type: string
  final?: unknown
  steps?: readonly unknown[]
  win?: unknown
}

/**
 * 종료 판을 키 순서와 무관한 문자열로 만든다. 엔진(cloneCell)과 서버 스키마는 셀 필드 순서가 달라
 * `JSON.stringify` 그대로 비교하면 같은 판도 틀렸다고 나온다. 필드를 정해진 순서로 뽑아 비교한다.
 */
function finalKey(final: unknown): string {
  if (!Array.isArray(final)) return JSON.stringify(final ?? null)
  const cells = final.map((cell: unknown) => {
    const c = (cell ?? {}) as { pos?: unknown; kind?: unknown; value?: unknown; tier?: unknown; amount?: unknown }
    return [c.pos ?? null, c.kind ?? null, c.value ?? null, c.tier ?? null, c.amount ?? null]
  })
  return JSON.stringify(cells)
}

/**
 * 시드 공개 검증 보조: 공개된 시드로 다시 돌린 리스핀이 화면에서 본 리스핀과 같은가.
 * `totalWin`이 같아도 리스핀 도중 경로가 다를 수 있어 종료 판(`final`)·리스핀 수·지급(`win`)까지 비교한다.
 * 어느 쪽에도 코인 리스핀이 없으면 비교할 것이 없어 true다.
 */
export function respinFeaturesMatch(replayed: readonly { type: string }[], shown: readonly { type: string }[]): boolean {
  const pick = (features: readonly { type: string }[]): RespinLike | undefined =>
    features.find((feature) => feature.type === 'coinRespin') as RespinLike | undefined
  const a = pick(replayed)
  const b = pick(shown)
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return (
    finalKey(a.final) === finalKey(b.final) &&
    (a.steps?.length ?? -1) === (b.steps?.length ?? -2) &&
    a.win === b.win
  )
}
