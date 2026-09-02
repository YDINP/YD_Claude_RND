import type { GameSummary } from '@tgslot/shared'
import { loadGamePacks, resolveGamesDir } from './packs.js'
import type { GamePack } from './packs.js'

/**
 * 디스크에서 읽은 게임 팩 조회기. 하드코딩 목록을 대체한다.
 * `games/<id>/` 폴더를 추가하는 것만으로 로비에 새 게임이 뜬다 (Phase 5 양산 목표).
 */
export interface GameRegistry {
  /** 로비 목록. `hidden` 제외, `sort` 오름차순. */
  list(): GameSummary[]
  /** status와 무관하게 조회. 운영/디버그용. */
  get(id: string): GamePack | undefined
  /** `hidden`이면 없는 것으로 취급한다. 공개 라우트는 항상 이것을 쓴다. */
  getVisible(id: string): GamePack | undefined
}

export function createGameRegistry(packs: GamePack[]): GameRegistry {
  const byId = new Map<string, GamePack>()
  for (const pack of packs) {
    if (byId.has(pack.id)) throw new Error(`[games] 중복 게임 id: ${pack.id}`)
    byId.set(pack.id, pack)
  }

  const visibleSummaries = packs
    .filter((pack) => pack.summary.status !== 'hidden')
    .map((pack) => pack.summary)
    .sort((a, b) => a.sort - b.sort)

  return {
    list: () => visibleSummaries,
    get: (id) => byId.get(id),
    getVisible: (id) => {
      const pack = byId.get(id)
      return pack && pack.summary.status !== 'hidden' ? pack : undefined
    },
  }
}

export function loadGameRegistry(gamesDir?: string): GameRegistry {
  return createGameRegistry(loadGamePacks(gamesDir ?? resolveGamesDir()))
}

let defaultRegistry: GameRegistry | null = null

/** 프로세스당 한 번만 디스크를 읽는다. 게임 팩은 런타임에 바뀌지 않는다. */
export function getDefaultGameRegistry(): GameRegistry {
  if (defaultRegistry === null) {
    const dir = resolveGamesDir()
    defaultRegistry = createGameRegistry(loadGamePacks(dir))
    console.log(`[games] loaded ${defaultRegistry.list().length} visible game pack(s) from ${dir}`)
  }
  return defaultRegistry
}
