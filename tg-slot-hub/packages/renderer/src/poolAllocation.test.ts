import { describe, expect, it } from 'vitest'
import type { WinLine } from '@tgslot/slot-engine'
import { buildPresentation } from './presentation.js'
import { KeyedObjectPool } from './pool.js'
import { loadGameMath } from './testSupport.js'

/**
 * 승리 순환이 실제로 몇 개를 만드는지 재는 시험.
 *
 * 연출 자체는 pixi를 쓰지만 **몇 번 만드는가**는 순수하다 — 계획(`buildPresentation`)이 짚는
 * 자리 수와 풀의 재사용 규칙만으로 정해진다. 그래서 캔버스 없이도 정확히 잴 수 있고,
 * 여기서 나오는 숫자가 곧 저사양 기기에서 GC로 흘러가는 양이다.
 *
 * 실측(classic-777, 3라인 승리, 20바퀴): 풀이 없으면 360개, 풀을 끼우면 9개.
 */
const math = loadGameMath('classic-777')
const CYCLES = 20

function win(line: number, symbol: string, positions: [number, number][]): WinLine {
  return { line, symbol, count: positions.length, multiplier: 10, win: 50, positions }
}

/** 5릴 3행에서 가로 세 줄이 각기 다른 심볼로 이긴, 흔한 승리 한 판. */
const WINS: WinLine[] = [
  win(0, 'seven', [
    [0, 1],
    [1, 1],
    [2, 1],
  ]),
  win(1, 'bar3', [
    [0, 0],
    [1, 0],
    [2, 0],
  ]),
  win(2, 'cherry', [
    [0, 2],
    [1, 2],
    [2, 2],
  ]),
]

/**
 * 한 바퀴가 짚는 자리를 스텝별로 묶어 돌려준다.
 * A단계는 이긴 자리를 한꺼번에 짚고, B단계는 라인 하나씩 짚는다 —
 * 그래서 같은 자리가 한 바퀴에 두 번 연출된다.
 */
function cycleSteps(): { symbol: string; cell: string }[][] {
  return buildPresentation(WINS, math, { totalBet: 10 }).flatMap((step) => {
    const spots = (line: WinLine): { symbol: string; cell: string }[] =>
      line.positions.map((position) => ({ symbol: line.symbol, cell: position.join(':') }))
    if (step.phase === 'all') return [step.wins.flatMap(spots)]
    if (step.phase === 'line') return [spots(step.win)]
    return []
  })
}

describe('승리 순환의 시트 스프라이트 할당량', () => {
  it('한 바퀴가 같은 자리를 두 번 짚는다', () => {
    const steps = cycleSteps()
    const spots = steps.reduce((sum, step) => sum + step.length, 0)

    // A단계 9자리 + 라인 3스텝 x 3자리 = 18. 순환은 이것을 다음 스핀까지 되풀이한다.
    expect(steps).toHaveLength(4)
    expect(spots).toBe(18)
  })

  it('풀을 끼우면 20바퀴를 돌아도 첫 바퀴 몫만 만든다', () => {
    const steps = cycleSteps()
    let created = 0
    const pool = new KeyedObjectPool<string, { id: number }>({
      create: () => {
        created += 1
        return { id: created }
      },
      maxRetainedPerKey: math.reels * math.rows,
    })

    let withoutPool = 0
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      for (const step of steps) {
        // 스텝 하나가 짚은 자리는 그 스텝이 끝날 때 한꺼번에 돌아온다.
        const held = step.map((spot) => {
          withoutPool += 1
          return { key: spot.symbol, item: pool.acquire(spot.symbol) }
        })
        for (const { key, item } of held) pool.release(key, item)
      }
    }

    expect(withoutPool).toBe(360)
    // 한 스텝이 같은 심볼을 최대 세 자리에서 쓰고 심볼은 셋이다 — 그 아홉이 상주량의 전부다.
    expect(created).toBe(9)
    expect(pool.stats.hitRate).toBeCloseTo(1 - 9 / 360, 3)
    expect(pool.stats.discarded).toBe(0)
  })
})
