import { afterEach, describe, expect, it, vi } from 'vitest'
import { playRouletteCue, setRouletteCueSink, type RouletteCue } from './rouletteCues'

vi.mock('./audio', () => ({
  playFeature: vi.fn(),
  playRouletteLand: vi.fn(),
  playRouletteLight: vi.fn(),
  playRouletteSummary: vi.fn(),
  playRouletteTick: vi.fn(),
  playRouletteZoom: vi.fn(),
  playUiSound: vi.fn(),
}))

import * as audio from './audio'

describe('roulette cue sink (idol)', () => {
  afterEach(() => {
    setRouletteCueSink(null)
    vi.clearAllMocks()
  })

  it('maps every cue to its idol sound', () => {
    const cases: [RouletteCue, unknown, unknown[]][] = [
      [{ kind: 'entry' }, audio.playFeature, []],
      [{ kind: 'light', index: 3 }, audio.playRouletteLight, [3]],
      [{ kind: 'tick', speed: 0.4 }, audio.playRouletteTick, [0.4]],
      [{ kind: 'land', result: 'encore', lit: false }, audio.playRouletteLand, ['encore', false]],
      [{ kind: 'zoom', ring: 1 }, audio.playRouletteZoom, []],
      [{ kind: 'summary', big: true }, audio.playRouletteSummary, [true]],
      [{ kind: 'exit' }, audio.playUiSound, ['close']],
    ]
    for (const [cue, fn, args] of cases) {
      playRouletteCue(cue)
      expect(fn, cue.kind).toHaveBeenCalledWith(...args)
    }
  })

  it('lets a replacement sink take over and restores the idol sink on null', () => {
    const seen: string[] = []
    setRouletteCueSink((cue) => seen.push(cue.kind))
    playRouletteCue({ kind: 'zoom', ring: 2 })
    expect(seen).toEqual(['zoom'])
    expect(audio.playRouletteZoom).not.toHaveBeenCalled()
    setRouletteCueSink(null)
    playRouletteCue({ kind: 'zoom', ring: 2 })
    expect(audio.playRouletteZoom).toHaveBeenCalledTimes(1)
  })

  it('never lets a failing sound stop the show', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(audio.playRouletteTick).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(() => playRouletteCue({ kind: 'tick', speed: 1 })).not.toThrow()
  })
})
