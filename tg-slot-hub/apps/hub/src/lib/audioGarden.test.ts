import { describe, expect, it, vi } from 'vitest'
import { bloomTierOf, createGardenAudio, GARDEN_POP_STEPS, GARDEN_SCALE } from './audioGarden'

/** 합성 재료 대신 호출을 모으는 가짜 키트. */
function fakeKit() {
  const tones: number[] = []
  const kit = {
    tone: vi.fn((_c: AudioContext, o: { freq: number }) => tones.push(o.freq)),
    noise: vi.fn(),
    live: () => null,
    duck: vi.fn(),
  }
  return { kit, tones }
}

describe('garden 효과음', () => {
  it('음계는 오름차순이고 팝 단계 수는 음계 길이다', () => {
    expect([...GARDEN_SCALE].sort((a, b) => a - b)).toEqual([...GARDEN_SCALE])
    expect(GARDEN_POP_STEPS).toBe(GARDEN_SCALE.length)
  })

  it('팝은 단계가 오를수록 높아지고 마지막 칸에서 멈춘다', () => {
    const first = (step: number): number => {
      const { kit, tones } = fakeKit()
      createGardenAudio(kit).cues.pop({} as AudioContext, step)
      return tones[0]!
    }
    expect(first(3)).toBeGreaterThan(first(0))
    expect(first(GARDEN_POP_STEPS + 5)).toBe(first(GARDEN_POP_STEPS - 1))
    expect(first(-2)).toBe(first(0))
  })

  it('개화 등급은 배율로 정해지고 가장 큰 등급만 배경음을 낮춘다', () => {
    expect(bloomTierOf(2)).toBe('sprout')
    expect(bloomTierOf(5)).toBe('bud')
    expect(bloomTierOf(20)).toBe('bloom')
    const small = fakeKit()
    createGardenAudio(small.kit).cues.bloom({} as AudioContext, 'sprout')
    expect(small.kit.duck).not.toHaveBeenCalled()
    const big = fakeKit()
    createGardenAudio(big.kit).cues.bloom({} as AudioContext, 'bloom')
    expect(big.kit.duck).toHaveBeenCalled()
  })

  it('성장 덮개 소리는 아무리 칸이 많아도 6번을 넘지 않는다', () => {
    const count = (cells: number): number => {
      const { kit } = fakeKit()
      createGardenAudio(kit).cues.grow({} as AudioContext, 6, cells)
      return kit.tone.mock.calls.length
    }
    expect(count(500)).toBe(count(36))
    expect(count(500)).toBeGreaterThan(count(1))
  })
})
