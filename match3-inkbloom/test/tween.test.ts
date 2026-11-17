import { describe, expect, it } from 'vitest'
import { Tweens } from '../src/view/tween'

describe('Tweens', () => {
  it('앞 트윈의 지연이 끝나는 프레임에도 뒤 트윈은 전체 dt 를 받는다', () => {
    const tweens = new Tweens()
    const linear = (p: number): number => p
    tweens.add(100, 10, linear, () => {})
    let progress = 0
    tweens.add(100, 0, linear, (p) => { progress = p })
    tweens.update(16)
    expect(progress).toBeCloseTo(0.16)
  })
})
