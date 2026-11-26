import { describe, expect, it } from 'vitest'
import type { GameMath } from '@tgslot/slot-engine'
import { coinFreeInitialStops } from './initialStops.js'
import { loadGameMath } from './testSupport.js'

describe('코인 리스핀 팩의 첫 화면 정지 위치', () => {
  it('코인 리스핀이 없는 팩은 null(기존 기본값 유지)', () => {
    expect(coinFreeInitialStops(loadGameMath('classic-777'))).toBeNull()
  })

  it('kraken-cove 첫 화면 15칸에 코인이 하나도 없다', () => {
    const math = loadGameMath('kraken-cove') as GameMath
    const stops = coinFreeInitialStops(math)
    expect(stops).not.toBeNull()
    math.strips.forEach((strip, reel) => {
      for (let row = 0; row < math.rows; row += 1) {
        expect(strip[((stops?.[reel] ?? 0) + row) % strip.length]).not.toBe('coin')
      }
    })
  })

  it('코인만 있는 스트립은 0으로 물러난다', () => {
    const stops = coinFreeInitialStops({ rows: 3, strips: [['coin', 'coin', 'coin']], coinRespin: { symbol: 'coin' } } as never)
    expect(stops).toEqual([0])
  })
})
