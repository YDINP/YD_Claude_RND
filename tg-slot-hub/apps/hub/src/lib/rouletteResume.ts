/**
 * 무대 룰렛 «이어 보기» 캐시. 정산은 스핀 응답 시점에 이미 끝났으므로(지갑·원장 확정) 이 캐시는 **표시용**이다.
 * 새로고침하면 연출만 `shownSteps` 다음 회전부터 이어 본다. 잔액은 언제나 서버(`/me`) 값이다.
 *
 * - 저장소는 `sessionStorage`(탭 단위). 접근은 전부 try/catch — 막혀 있으면 이어 보기만 없을 뿐이다.
 * - 쓴 지 10분이 지났거나 게임이 다르면 버린다(오래된 연출이 다음 날 튀어나오지 않게).
 * - 모양이 서버 계약과 다르면(스키마 검사 실패) 버린다.
 */
import { StageRouletteFeatureSchema, type StageRouletteFeature } from '@tgslot/shared'

export const ROULETTE_RESUME_KEY = 'tgslot.roulette.v1'
export const ROULETTE_RESUME_TTL_MS = 10 * 60 * 1000

export interface RouletteResumeCache {
  gameId: string
  roundId: string
  feature: StageRouletteFeature
  /** 룰렛을 뺀 지급(기본 ways). `totalWin - feature.total`. */
  baseWin: number
  totalWin: number
  totalBet: number
  /** 이미 끝까지 본 회전 수. */
  shownSteps: number
  savedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function writeRouletteCache(cache: RouletteResumeCache, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(ROULETTE_RESUME_KEY, JSON.stringify(cache))
  } catch {
    /* 저장 불가 — 이어 보기 없이 진행한다 */
  }
}

export function clearRouletteCache(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(ROULETTE_RESUME_KEY)
  } catch {
    /* 지울 수 없어도 다음 읽기가 TTL·게임 검사로 걸러 낸다 */
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 유효한 캐시만 돌려준다. 게임이 다르거나 만료됐거나 깨졌으면 지우고 null. */
export function readRouletteCache(
  gameId: string,
  now: number = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): RouletteResumeCache | null {
  let raw: string | null = null
  try {
    raw = storage?.getItem(ROULETTE_RESUME_KEY) ?? null
  } catch {
    return null
  }
  if (raw === null) return null
  const discard = (): null => {
    clearRouletteCache(storage)
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return discard()
  }
  if (typeof value !== 'object' || value === null) return discard()
  const obj = value as Record<string, unknown>
  const feature = StageRouletteFeatureSchema.safeParse(obj.feature)
  if (
    !feature.success ||
    obj.gameId !== gameId ||
    typeof obj.roundId !== 'string' ||
    !isCount(obj.baseWin) ||
    !isCount(obj.totalWin) ||
    !isCount(obj.totalBet) ||
    !isCount(obj.shownSteps) ||
    typeof obj.savedAt !== 'number' ||
    !Number.isFinite(obj.savedAt)
  ) {
    return discard()
  }
  if (now - obj.savedAt > ROULETTE_RESUME_TTL_MS || now < obj.savedAt - 60_000) return discard()
  if (obj.shownSteps > feature.data.steps.length) return discard()
  return {
    gameId,
    roundId: obj.roundId,
    feature: feature.data,
    baseWin: obj.baseWin,
    totalWin: obj.totalWin,
    totalBet: obj.totalBet,
    shownSteps: obj.shownSteps,
    savedAt: obj.savedAt,
  }
}

/** 회전 하나를 끝까지 보여 줄 때마다 부른다. 캐시가 없거나 다른 라운드면 아무것도 하지 않는다. */
export function advanceRouletteCache(
  roundId: string,
  shownSteps: number,
  storage: StorageLike | null = defaultStorage(),
): void {
  let raw: string | null = null
  try {
    raw = storage?.getItem(ROULETTE_RESUME_KEY) ?? null
  } catch {
    return
  }
  if (raw === null) return
  try {
    const value = JSON.parse(raw) as { roundId?: unknown; shownSteps?: unknown }
    if (value.roundId !== roundId) return
    if (typeof value.shownSteps === 'number' && shownSteps <= value.shownSteps) return
    storage?.setItem(ROULETTE_RESUME_KEY, JSON.stringify({ ...value, shownSteps }))
  } catch {
    /* 깨진 캐시는 다음 읽기가 버린다 */
  }
}
