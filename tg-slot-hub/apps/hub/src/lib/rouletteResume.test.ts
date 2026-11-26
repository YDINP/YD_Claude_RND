import { describe, expect, it } from 'vitest'
import { loadIdolMath, sampleRoulettes } from '../test/idolMath'
import {
  ROULETTE_RESUME_KEY,
  ROULETTE_RESUME_TTL_MS,
  advanceRouletteCache,
  clearRouletteCache,
  readRouletteCache,
  writeRouletteCache,
  type RouletteResumeCache,
} from './rouletteResume'

function memoryStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

const sample = sampleRoulettes(loadIdolMath(), 1)[0]
if (sample === undefined) throw new Error('표본 없음')

const base: RouletteResumeCache = {
  gameId: 'idol-stage-live',
  roundId: 'round-1',
  feature: sample.feature,
  baseWin: 200,
  totalWin: 200 + sample.feature.total,
  totalBet: 100,
  shownSteps: 0,
  savedAt: 1_000_000,
}

describe('룰렛 이어 보기 캐시', () => {
  it('쓰고 읽으면 같은 값이다', () => {
    const storage = memoryStorage()
    writeRouletteCache(base, storage)
    expect(readRouletteCache('idol-stage-live', base.savedAt + 1000, storage)).toEqual(base)
  })

  it('다른 게임의 캐시는 버린다(그리고 지운다)', () => {
    const storage = memoryStorage()
    writeRouletteCache(base, storage)
    expect(readRouletteCache('other-game', base.savedAt + 1000, storage)).toBeNull()
    expect(storage.map.has(ROULETTE_RESUME_KEY)).toBe(false)
  })

  it('10분이 지나면 버린다', () => {
    const storage = memoryStorage()
    writeRouletteCache(base, storage)
    expect(readRouletteCache('idol-stage-live', base.savedAt + ROULETTE_RESUME_TTL_MS - 1, storage)).not.toBeNull()
    expect(readRouletteCache('idol-stage-live', base.savedAt + ROULETTE_RESUME_TTL_MS + 1, storage)).toBeNull()
    expect(storage.map.has(ROULETTE_RESUME_KEY)).toBe(false)
  })

  it('깨진 JSON·모양이 다른 값·회전 수를 넘는 shownSteps는 버린다', () => {
    const storage = memoryStorage()
    storage.setItem(ROULETTE_RESUME_KEY, '{oops')
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)).toBeNull()
    storage.setItem(ROULETTE_RESUME_KEY, JSON.stringify({ ...base, feature: { type: 'stageRoulette' } }))
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)).toBeNull()
    storage.setItem(ROULETTE_RESUME_KEY, JSON.stringify({ ...base, shownSteps: 99 }))
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)).toBeNull()
    storage.setItem(ROULETTE_RESUME_KEY, JSON.stringify({ ...base, totalWin: -1 }))
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)).toBeNull()
  })

  it('끝까지 본 회전 수만 단조롭게 올린다', () => {
    const storage = memoryStorage()
    writeRouletteCache(base, storage)
    advanceRouletteCache('round-1', 2, storage)
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)?.shownSteps).toBe(2)
    advanceRouletteCache('round-1', 1, storage)
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)?.shownSteps).toBe(2)
  })

  it('다른 라운드의 진행은 반영하지 않는다', () => {
    const storage = memoryStorage()
    writeRouletteCache(base, storage)
    advanceRouletteCache('round-2', 3, storage)
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)?.shownSteps).toBe(0)
  })

  it('지우면 읽을 수 없다', () => {
    const storage = memoryStorage()
    writeRouletteCache(base, storage)
    clearRouletteCache(storage)
    expect(readRouletteCache('idol-stage-live', base.savedAt, storage)).toBeNull()
  })

  it('저장소가 막혀 있어도 던지지 않는다', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => writeRouletteCache(base, broken)).not.toThrow()
    expect(readRouletteCache('idol-stage-live', base.savedAt, broken)).toBeNull()
    expect(() => advanceRouletteCache('round-1', 1, broken)).not.toThrow()
    expect(() => clearRouletteCache(broken)).not.toThrow()
    expect(readRouletteCache('idol-stage-live', base.savedAt, null)).toBeNull()
  })
})
