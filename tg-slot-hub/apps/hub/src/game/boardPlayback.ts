/**
 * 말판 재생의 «표시 값» 계산과 복원 스냅숏 — 순수 모듈(DOM·React 없음).
 *
 * 서버가 트리거 스핀 응답 하나에 말판 전체(`features[].type === 'boardBonus'`)를 실어 보낸다. 화면의
 * «윷 던지기»는 그 기록을 던지기 하나씩 보여 주는 연출일 뿐이라, 여기서 하는 일은 전부 «이미 정해진
 * 값을 어느 시점에 어떤 모양으로 읽을까»다. 입력(탭·자동·빨리 감기)은 결과를 바꾸지 못한다.
 *
 * 엔진의 순수 함수(`previewBoardLanding`·`replayBoard`·`boardPayout`)를 그대로 가져다 쓰므로 화면이 규칙을
 * 따로 구현하지 않는다 — 규칙이 바뀌어도 도움말·미리보기·검증이 같이 따라간다.
 */
import {
  BoardBonusFeatureSchema,
  type BoardBonusFeature,
  type BoardEnd,
  type BoardThrow,
} from '@tgslot/shared'
import {
  boardPayout,
  initialBoardState,
  previewBoardLanding,
  replayBoard,
  type BoardBonusConfig,
} from '@tgslot/slot-engine'

/** 던지기 `shown`번을 처리한 **뒤** 판의 상태. `shown = 0`이면 시작 상태다. */
export interface BoardView {
  at: string
  route: string
  /** 바구니(총 베팅 배수). */
  pot: number
  multiplier: number
  /** 꺼진 등불 수. */
  traps: number
  throwsLeft: number
  thrown: number
}

/** 서버 기록에서 `shown`번째 던지기까지 반영한 상태. 범위를 벗어난 `shown`은 끝으로 맞춘다. */
export function boardViewAfter(config: BoardBonusConfig, feature: Pick<BoardBonusFeature, 'throws'>, shown: number): BoardView {
  const count = Math.max(0, Math.min(shown, feature.throws.length))
  const last = count === 0 ? undefined : feature.throws[count - 1]
  if (last === undefined) {
    const start = initialBoardState(config)
    return {
      at: start.at,
      route: start.route,
      pot: start.pot,
      multiplier: start.multiplier,
      traps: start.traps,
      throwsLeft: start.throwsLeft,
      thrown: 0,
    }
  }
  return {
    at: last.at,
    route: last.route,
    pot: last.pot,
    multiplier: last.multiplier,
    traps: last.traps,
    throwsLeft: last.throwsLeft,
    thrown: count,
  }
}

/** 지금 끝난다면 받는 배수(총 베팅 배수) — «지금 끝나면 N배» 줄. */
export function boardEndsNowPayout(config: BoardBonusConfig, view: Pick<BoardView, 'pot' | 'multiplier'>): number {
  return boardPayout(config, view.pot, view.multiplier)
}

/** 켜져 있는 등불 수(= 함정 한도 − 꺼진 수). */
export function lanternsLit(config: BoardBonusConfig, view: Pick<BoardView, 'traps'>): number {
  return Math.max(0, config.trapLimit - view.traps)
}

/** 던지기 직전 미리보기: 같은 칸을 가리키는 결과는 한 칩으로 합친다. */
export interface LandingPreview {
  at: string
  /** 그 칸이 갈림길(딱 멈추면 지름길)인가. */
  fork: boolean
  /** 이 칸으로 가는 결과(1~5 = 도~모), 오름차순. */
  steps: number[]
}

/** 도~모 각각이 어디에 서게 되는지(앞으로 칸까지 따라간 최종 칸). 표시 전용이고 결과를 정하지 않는다. */
export function previewLandings(config: BoardBonusConfig, view: Pick<BoardView, 'at' | 'route'>): LandingPreview[] {
  const byNode = new Map<string, LandingPreview>()
  const steps = config.throwTable.map((row) => row.steps).sort((a, b) => a - b)
  for (const step of steps) {
    const landing = previewBoardLanding(config, view.at, view.route, step)
    const found = byNode.get(landing.at)
    if (found === undefined) byNode.set(landing.at, { at: landing.at, fork: landing.fork, steps: [step] })
    else found.steps.push(step)
  }
  return [...byNode.values()]
}

/**
 * 미리보기 칸 중 가장 값진 칸 — «마지막 한 번!”에서 한 번 반짝이게 할 자리.
 * 결승 > 큰 코인 > 배수 > 갈림길 순이고 함정은 점수가 낮다(반짝일 이유가 없다).
 */
export function mostValuableLanding(config: BoardBonusConfig, previews: readonly LandingPreview[]): string | null {
  let best: { at: string; score: number } | null = null
  for (const preview of previews) {
    const node = config.nodes[preview.at]
    if (node === undefined) continue
    let score = 0
    switch (node.kind) {
      case 'goal':
        score = 1000 + (node.value ?? 0)
        break
      case 'coin':
        score = node.value ?? 0
        break
      case 'mult':
        score = 20 * (node.value ?? 0)
        break
      case 'again':
        score = 6
        break
      case 'forward':
        score = 3
        break
      case 'trap':
        score = -100
        break
      default:
        score = 0
    }
    if (preview.fork) score += 4
    if (best === null || score > best.score) best = { at: preview.at, score }
  }
  return best === null || best.score <= 0 ? null : best.at
}

/** 던지기 기록의 칸 수 목록. `replayBoard` 입력이자 윷가락 연출의 순번 재료다. */
export function stepsOf(feature: Pick<BoardBonusFeature, 'throws'>): number[] {
  return feature.throws.map((record) => record.steps)
}

/** 도~모(1~5) → 윷가락 4개 중 «납작한 면이 위로» 온 개수. 모(5)는 전부 둥근 면이다. */
export function flatCountOf(steps: number): number {
  return steps >= 5 ? 0 : Math.max(0, Math.min(4, steps))
}

/**
 * 윷가락 4개의 앞뒷면 배치(`true` = 납작한 면이 위). **연출 전용**이다 — 결과에 맞게 던지기 순번으로
 * 결정론적으로 고르며 RNG를 쓰지 않는다. 같은 던지기는 언제나 같은 모양이다.
 */
export function yutFaceMask(steps: number, throwIndex: number): [boolean, boolean, boolean, boolean] {
  const flat = flatCountOf(steps)
  const mask: [boolean, boolean, boolean, boolean] = [false, false, false, false]
  const offset = ((throwIndex % 4) + 4) % 4
  for (let i = 0; i < flat; i += 1) mask[(offset + i) % 4] = true
  return mask
}

export interface BoardVerification {
  ok: boolean
  /** 어긋난 항목들(진단 로그용). ok면 비어 있다. */
  reasons: string[]
}

/**
 * 서버 피처를 `replayBoard`로 다시 계산해 맞는지 본다. 어긋나면 화면은 서버 값을 그대로 쓰되 진단 로그를 남기고,
 * 복원 스냅숏이면 재생 없이 버린다. 지갑에는 아무 영향이 없다(표시 전용).
 *
 * 캡은 모른다(스핀 응답에 라인 지급이 따로 없다) — 무한대로 다시 계산해 서버의 `win`이 그 이하인지만 본다.
 */
export function verifyBoardFeature(config: BoardBonusConfig, feature: BoardBonusFeature, totalBet: number): BoardVerification {
  const reasons: string[] = []
  let replayed: ReturnType<typeof replayBoard>
  try {
    replayed = replayBoard(config, stepsOf(feature), totalBet, Number.MAX_SAFE_INTEGER)
  } catch (error) {
    return { ok: false, reasons: [`replay-failed: ${error instanceof Error ? error.message : String(error)}`] }
  }
  if (replayed.throws.length !== feature.throws.length) reasons.push('throw-count')
  const count = Math.min(replayed.throws.length, feature.throws.length)
  for (let i = 0; i < count; i += 1) {
    const mine = replayed.throws[i] as BoardThrow
    const theirs = feature.throws[i] as BoardThrow
    if (
      mine.at !== theirs.at ||
      mine.route !== theirs.route ||
      mine.tile !== theirs.tile ||
      mine.pot !== theirs.pot ||
      mine.multiplier !== theirs.multiplier ||
      mine.traps !== theirs.traps ||
      mine.throwsLeft !== theirs.throwsLeft ||
      mine.extraThrow !== theirs.extraThrow ||
      mine.path.join('>') !== theirs.path.join('>') ||
      (mine.forward ?? []).join('>') !== (theirs.forward ?? []).join('>')
    ) {
      reasons.push(`throw-${i + 1}`)
    }
  }
  if (replayed.end !== feature.end) reasons.push('end')
  if (replayed.pot !== feature.pot) reasons.push('pot')
  if (replayed.multiplier !== feature.multiplier) reasons.push('multiplier')
  if (replayed.payout !== feature.payout) reasons.push('payout')
  if (feature.win > replayed.win) reasons.push('win')
  return { ok: reasons.length === 0, reasons }
}

/** 끝난 이유 → i18n 키 접미사. */
export function boardEndKey(end: BoardEnd): 'goal' | 'traps' | 'throws' {
  return end
}

// ───────────────────────── 복원 스냅숏(localStorage) ─────────────────────────

/** 응답 수신 즉시 저장하는 말판 한 판의 기록. 표시가 끝나면 `shown: 'done'`으로 덮어 두 번 보이지 않게 한다. */
export interface BoardSnapshot {
  roundId: string
  savedAt: number
  totalBet: number
  feature: BoardBonusFeature
  /** 보여 준 던지기 수. `'done'`이면 끝까지 본 판이다. */
  shown: number | 'done'
  /** 저장한 계정. 한 기기에서 계정을 바꾸면 남의 말판 재생·WinStrip 금액이 보이지 않게 읽을 때 대조한다. */
  userId?: string
  /** 라운드 전체 당첨(라인 + 초롱 + 말판). 복원한 판이 끝난 뒤 WinStrip이 이 합계까지 오른다. 표시용일 뿐이다. */
  totalWin?: number
}

/** 이 시간이 지난 스냅숏은 복원하지 않는다(30분). */
export const BOARD_SNAPSHOT_TTL_MS = 30 * 60 * 1000

export interface SnapshotStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function boardSnapshotKey(gameId: string): string {
  return `tgslot.board.${gameId}`
}

function defaultStorage(): SnapshotStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 저장. 저장소가 막혔거나 가득 차도 정상 진행한다(편의 기능일 뿐이다). */
export function saveBoardSnapshot(gameId: string, snapshot: BoardSnapshot, storage: SnapshotStorage | null = defaultStorage()): void {
  if (storage === null) return
  try {
    storage.setItem(boardSnapshotKey(gameId), JSON.stringify(snapshot))
  } catch {
    /* 저장 불가 — 복원 없이 계속 */
  }
}

/** 지우기. */
export function clearBoardSnapshot(gameId: string, storage: SnapshotStorage | null = defaultStorage()): void {
  if (storage === null) return
  try {
    storage.removeItem(boardSnapshotKey(gameId))
  } catch {
    /* 무시 */
  }
}

/**
 * 읽기. 모양이 어긋나거나(손으로 망가뜨림) 30분이 지났거나 이미 끝까지 본 판이면 null이다.
 * `now`보다 미래의 `savedAt`(시계가 뒤로 감김)도 버린다. `userId`를 주면 다른 계정이 저장한 판도 버린다.
 */
export function loadBoardSnapshot(
  gameId: string,
  now: number,
  storage: SnapshotStorage | null = defaultStorage(),
  userId: string | null = null,
): BoardSnapshot | null {
  if (storage === null) return null
  let raw: string | null
  try {
    raw = storage.getItem(boardSnapshotKey(gameId))
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const value = JSON.parse(raw) as Partial<BoardSnapshot> | null
    if (value === null || typeof value !== 'object') return null
    const { roundId, savedAt, totalBet, feature, shown } = value
    if (typeof roundId !== 'string' || roundId === '') return null
    if (userId !== null && value.userId !== userId) return null
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
    if (typeof totalBet !== 'number' || !Number.isFinite(totalBet) || totalBet <= 0) return null
    if (shown !== 'done' && (typeof shown !== 'number' || !Number.isInteger(shown) || shown < 0)) return null
    const parsed = BoardBonusFeatureSchema.safeParse(feature)
    if (!parsed.success) return null
    if (shown === 'done') return null
    if (savedAt > now || now - savedAt > BOARD_SNAPSHOT_TTL_MS) return null
    const restored: BoardSnapshot = { roundId, savedAt, totalBet, feature: parsed.data, shown: Math.min(shown as number, parsed.data.throws.length) }
    if (typeof value.userId === 'string') restored.userId = value.userId
    // 합계는 말판 몫 이상이어야 한다 — 어긋나면 버리고 말판 몫만 보여 준다(지갑은 늘 서버 값이라 표시만의 문제).
    const total = value.totalWin
    if (typeof total === 'number' && Number.isInteger(total) && total >= parsed.data.win) restored.totalWin = total
    return restored
  } catch {
    return null
  }
}

/** 보여 준 던지기 수를 갱신한다. 같은 판(roundId)일 때만 — 다른 판의 스냅숏을 덮지 않는다. */
export function markBoardProgress(
  gameId: string,
  roundId: string,
  shown: number | 'done',
  storage: SnapshotStorage | null = defaultStorage(),
): void {
  if (storage === null) return
  try {
    const raw = storage.getItem(boardSnapshotKey(gameId))
    if (raw === null) return
    const value = JSON.parse(raw) as BoardSnapshot
    if (value.roundId !== roundId) return
    storage.setItem(boardSnapshotKey(gameId), JSON.stringify({ ...value, shown }))
  } catch {
    /* 무시 */
  }
}

/** 응답에서 말판 피처를 뽑는다. 없으면 undefined. */
export function boardFeatureOf(features: readonly { type: string }[]): BoardBonusFeature | undefined {
  return features.find((feature): feature is BoardBonusFeature => feature.type === 'boardBonus')
}
