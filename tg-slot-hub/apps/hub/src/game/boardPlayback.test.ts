import { describe, expect, it } from 'vitest'
import {
  BOARD_SNAPSHOT_TTL_MS,
  boardEndsNowPayout,
  boardFeatureOf,
  boardSnapshotKey,
  boardViewAfter,
  clearBoardSnapshot,
  flatCountOf,
  lanternsLit,
  loadBoardSnapshot,
  markBoardProgress,
  mostValuableLanding,
  previewLandings,
  saveBoardSnapshot,
  stepsOf,
  verifyBoardFeature,
  yutFaceMask,
  type BoardSnapshot,
  type SnapshotStorage,
} from './boardPlayback'
import { findBoardFeature, hanbokBoardConfig, makeBoardFeature } from '../test/hanbokMath'

const config = hanbokBoardConfig()

function memoryStorage(): SnapshotStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('boardViewAfter', () => {
  const feature = makeBoardFeature('view-1')

  it('0번째는 시작 상태다 — 출발·바깥 길·기회 5·x1·바구니 0', () => {
    expect(boardViewAfter(config, feature, 0)).toEqual({
      at: 'start',
      route: 'outer',
      pot: 0,
      multiplier: 1,
      traps: 0,
      throwsLeft: 5,
      thrown: 0,
    })
  })

  it('n번째는 n번째 던지기 «뒤» 값이다', () => {
    for (let n = 1; n <= feature.throws.length; n += 1) {
      const view = boardViewAfter(config, feature, n)
      const record = feature.throws[n - 1]
      expect(view).toMatchObject({
        at: record?.at,
        route: record?.route,
        pot: record?.pot,
        multiplier: record?.multiplier,
        traps: record?.traps,
        throwsLeft: record?.throwsLeft,
        thrown: n,
      })
    }
  })

  it('끝 상태의 바구니·배수는 피처 합계와 같다', () => {
    const last = boardViewAfter(config, feature, feature.throws.length)
    expect(last.pot).toBe(feature.pot)
    expect(last.multiplier).toBe(feature.multiplier)
  })

  it('범위를 벗어난 shown은 끝/처음으로 맞춘다', () => {
    expect(boardViewAfter(config, feature, 999).thrown).toBe(feature.throws.length)
    expect(boardViewAfter(config, feature, -3).thrown).toBe(0)
  })

  it('지금 끝나면 N배 = max(최소, 바구니 x 배수)', () => {
    expect(boardEndsNowPayout(config, { pot: 0, multiplier: 1 })).toBe(5)
    expect(boardEndsNowPayout(config, { pot: 7, multiplier: 3 })).toBe(21)
    expect(boardEndsNowPayout(config, { pot: 1, multiplier: 1 })).toBe(5)
  })

  it('켜진 등불 = 함정 한도 − 꺼진 수', () => {
    expect(lanternsLit(config, { traps: 0 })).toBe(3)
    expect(lanternsLit(config, { traps: 2 })).toBe(1)
    expect(lanternsLit(config, { traps: 9 })).toBe(0)
  })
})

describe('previewLandings (도·개·걸·윷·모 꼬리표)', () => {
  it('출발 칸에서 바깥 길로 던지면 5결과가 다섯 칸을 가리킨다(앞으로 칸 없음)', () => {
    const previews = previewLandings(config, { at: 'start', route: 'outer' })
    expect(previews.map((p) => [p.at, p.steps])).toEqual([
      ['o1', [1]],
      ['o2', [2]],
      ['o3', [3]],
      ['o4', [4]],
      ['o5', [5]],
    ])
    expect(previews.find((p) => p.at === 'o5')?.fork).toBe(true)
    expect(previews.find((p) => p.at === 'o3')?.fork).toBe(false)
  })

  it('결승을 넘치는 결과는 같은 칸(결승)으로 합쳐진다', () => {
    const previews = previewLandings(config, { at: 'o18', route: 'outer' })
    const goal = previews.find((p) => p.at === 'goal')
    expect(goal?.steps).toEqual([2, 3, 4, 5])
  })

  it('앞으로 칸은 따라간 최종 칸으로 표시한다(o13 +2 → o15)', () => {
    const previews = previewLandings(config, { at: 'o12', route: 'outer' })
    expect(previews.find((p) => p.steps.includes(1))?.at).toBe('o15')
  })

  it('미리보기 칸은 실제 도착 칸과 일치한다(300판 전 던지기, 갈림길 길 포함)', () => {
    let checked = 0
    for (let i = 0; i < 300; i += 1) {
      const feature = makeBoardFeature(`preview-${i}`)
      let view = boardViewAfter(config, feature, 0)
      for (let n = 0; n < feature.throws.length; n += 1) {
        const previews = previewLandings(config, view)
        const record = feature.throws[n]
        const hit = previews.find((p) => record !== undefined && p.steps.includes(record.steps))
        expect(hit?.at).toBe(record?.at)
        view = boardViewAfter(config, feature, n + 1)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('가장 값진 칸: 결승 > 큰 코인 > 배수, 함정만 있으면 null', () => {
    const near = previewLandings(config, { at: 'o17', route: 'outer' })
    expect(mostValuableLanding(config, near)).toBe('goal')
    const trapOnly = [{ at: 'o3', fork: false, steps: [3] }]
    expect(mostValuableLanding(config, trapOnly)).toBeNull()
    expect(mostValuableLanding(config, [])).toBeNull()
  })
})

describe('윷가락 앞뒷면(연출 전용)', () => {
  it('납작한 면이 위로 온 개수 = 도1·개2·걸3·윷4·모0', () => {
    expect([1, 2, 3, 4, 5].map(flatCountOf)).toEqual([1, 2, 3, 4, 0])
  })

  it('마스크의 납작 개수가 결과와 맞고, 같은 입력은 언제나 같은 모양이다', () => {
    for (let steps = 1; steps <= 5; steps += 1) {
      for (let index = 0; index < 12; index += 1) {
        const mask = yutFaceMask(steps, index)
        expect(mask.filter(Boolean).length).toBe(flatCountOf(steps))
        expect(yutFaceMask(steps, index)).toEqual(mask)
      }
    }
  })

  it('던지기 순번이 바뀌면 같은 결과도 어느 가락이 납작한지가 달라진다', () => {
    const masks = new Set([0, 1, 2, 3].map((i) => yutFaceMask(1, i).join()))
    expect(masks.size).toBe(4)
  })
})

describe('verifyBoardFeature (replayBoard 자체 검증)', () => {
  it('서버 피처 그대로면 통과한다 — 샘플 200판', () => {
    for (let i = 0; i < 200; i += 1) {
      const feature = makeBoardFeature(`verify-${i}`)
      expect(verifyBoardFeature(config, feature, 100)).toEqual({ ok: true, reasons: [] })
    }
  })

  it('바구니·배수·지급·끝 이유를 바꾸면 걸린다', () => {
    const feature = makeBoardFeature('verify-tamper')
    expect(verifyBoardFeature(config, { ...feature, pot: feature.pot + 1 }, 100).ok).toBe(false)
    expect(verifyBoardFeature(config, { ...feature, multiplier: feature.multiplier + 1 }, 100).reasons).toContain('multiplier')
    expect(verifyBoardFeature(config, { ...feature, payout: feature.payout + 1 }, 100).reasons).toContain('payout')
    expect(verifyBoardFeature(config, { ...feature, win: feature.win + 1 }, 100).reasons).toContain('win')
    const other = feature.end === 'goal' ? 'traps' : 'goal'
    expect(verifyBoardFeature(config, { ...feature, end: other }, 100).reasons).toContain('end')
  })

  it('던지기 한 칸의 도착 칸을 바꾸면 그 던지기 번호가 reasons에 남는다', () => {
    const feature = makeBoardFeature('verify-tamper-2')
    const throws = feature.throws.map((record, i) => (i === 0 ? { ...record, at: 'o19' } : record))
    expect(verifyBoardFeature(config, { ...feature, throws }, 100).reasons).toContain('throw-1')
  })

  it('끝나지 않는 기록(던지기가 모자람)은 replay 실패로 걸린다', () => {
    const feature = makeBoardFeature('verify-tamper-3')
    const result = verifyBoardFeature(config, { ...feature, throws: feature.throws.slice(0, 1) }, 100)
    expect(result.ok).toBe(false)
  })

  it('캡에 잘린 지급(win < payout x 베팅)은 정상으로 본다', () => {
    const feature = makeBoardFeature('verify-capped')
    expect(verifyBoardFeature(config, { ...feature, win: Math.max(0, feature.win - 50) }, 100).ok).toBe(true)
  })
})

describe('복원 스냅숏', () => {
  const feature = makeBoardFeature('snap-1')
  const base: BoardSnapshot = { roundId: 'r1', savedAt: 1_000, totalBet: 100, feature, shown: 2 }
  const shownOf = (n: number): number => Math.min(n, feature.throws.length)

  it('저장하고 읽으면 같은 값이다(shown 포함)', () => {
    const storage = memoryStorage()
    saveBoardSnapshot('hanbok-night-market', base, storage)
    expect(storage.data.has('tgslot.board.hanbok-night-market')).toBe(true)
    expect(loadBoardSnapshot('hanbok-night-market', 2_000, storage)).toEqual({ ...base, shown: shownOf(2) })
  })

  it('30분이 지났거나 미래 시각이면 null', () => {
    const storage = memoryStorage()
    saveBoardSnapshot('g', base, storage)
    expect(loadBoardSnapshot('g', base.savedAt + BOARD_SNAPSHOT_TTL_MS, storage)).not.toBeNull()
    expect(loadBoardSnapshot('g', base.savedAt + BOARD_SNAPSHOT_TTL_MS + 1, storage)).toBeNull()
    expect(loadBoardSnapshot('g', base.savedAt - 1, storage)).toBeNull()
  })

  it('다른 계정이 저장한 판은 복원하지 않는다(한 기기에서 계정 전환)', () => {
    const storage = memoryStorage()
    saveBoardSnapshot('g', { ...base, userId: 'u1' }, storage)
    expect(loadBoardSnapshot('g', 2_000, storage, 'u1')?.userId).toBe('u1')
    expect(loadBoardSnapshot('g', 2_000, storage, 'u2')).toBeNull()
    // 계정을 모르면(로그인 전) 대조하지 않는다
    expect(loadBoardSnapshot('g', 2_000, storage)).not.toBeNull()
    markBoardProgress('g', 'r1', 3, storage)
    expect(loadBoardSnapshot('g', 2_000, storage, 'u1')?.shown).toBe(shownOf(3))
  })

  it('라운드 합계(totalWin)는 말판 몫 이상일 때만 살리고, 진행 갱신 뒤에도 남는다', () => {
    const storage = memoryStorage()
    saveBoardSnapshot('g', { ...base, totalWin: feature.win + 50 }, storage)
    markBoardProgress('g', 'r1', 3, storage)
    expect(loadBoardSnapshot('g', 2_000, storage)?.totalWin).toBe(feature.win + 50)
    saveBoardSnapshot('g', { ...base, totalWin: feature.win - 1 }, storage)
    expect(loadBoardSnapshot('g', 2_000, storage)?.totalWin).toBeUndefined()
  })

  it('다 본 판(done)은 복원하지 않는다', () => {
    const storage = memoryStorage()
    saveBoardSnapshot('g', { ...base, shown: 'done' }, storage)
    expect(loadBoardSnapshot('g', 2_000, storage)).toBeNull()
  })

  it('markBoardProgress는 같은 판일 때만 갱신한다', () => {
    const storage = memoryStorage()
    saveBoardSnapshot('g', base, storage)
    markBoardProgress('g', 'other', 4, storage)
    expect(loadBoardSnapshot('g', 2_000, storage)?.shown).toBe(shownOf(2))
    markBoardProgress('g', 'r1', 3, storage)
    expect(loadBoardSnapshot('g', 2_000, storage)?.shown).toBe(shownOf(3))
    markBoardProgress('g', 'r1', 'done', storage)
    expect(loadBoardSnapshot('g', 2_000, storage)).toBeNull()
  })

  it('손으로 망가뜨린 값은 null이고 던지지 않는다', () => {
    const storage = memoryStorage()
    const key = boardSnapshotKey('g')
    const broken = [
      'not json',
      '{}',
      'null',
      JSON.stringify({ ...base, feature: { type: 'boardBonus' } }),
      JSON.stringify({ ...base, totalBet: -1 }),
      JSON.stringify({ ...base, shown: 1.5 }),
    ]
    for (const bad of broken) {
      storage.data.set(key, bad)
      expect(loadBoardSnapshot('g', 2_000, storage)).toBeNull()
    }
  })

  it('저장소가 던져도(차단·가득 참) 조용히 넘어간다', () => {
    const blocked: SnapshotStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => saveBoardSnapshot('g', base, blocked)).not.toThrow()
    expect(loadBoardSnapshot('g', 2_000, blocked)).toBeNull()
    expect(() => clearBoardSnapshot('g', blocked)).not.toThrow()
    expect(() => markBoardProgress('g', 'r1', 1, blocked)).not.toThrow()
  })

  it('저장소가 없으면(null) 아무 일도 하지 않는다', () => {
    expect(() => saveBoardSnapshot('g', base, null)).not.toThrow()
    expect(loadBoardSnapshot('g', 2_000, null)).toBeNull()
  })
})

describe('boardFeatureOf', () => {
  it('features 목록에서 말판 피처를 뽑는다', () => {
    const feature = makeBoardFeature('feat')
    expect(boardFeatureOf([{ type: 'scatterWin' }, feature])).toBe(feature)
    expect(boardFeatureOf([{ type: 'scatterWin' }])).toBeUndefined()
  })

  it('갈림길에 멈춘 판을 찾아 쓸 수 있다(복원·연출 테스트 재료)', () => {
    const forked = findBoardFeature((f) => f.throws.some((t) => config.forks[t.at] !== undefined))
    expect(stepsOf(forked).length).toBe(forked.throws.length)
  })
})
