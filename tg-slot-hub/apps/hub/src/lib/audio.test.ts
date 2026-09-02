import { describe, expect, it } from 'vitest'
import { isAudioMuted, setAudioMuted } from './audio'

describe('audio mute flag', () => {
  it('defaults to unmuted and reflects setAudioMuted()', () => {
    setAudioMuted(false)
    expect(isAudioMuted()).toBe(false)

    setAudioMuted(true)
    expect(isAudioMuted()).toBe(true)

    setAudioMuted(false)
    expect(isAudioMuted()).toBe(false)
  })
})
