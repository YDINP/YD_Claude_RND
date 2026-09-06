import { describe, expect, it } from 'vitest'
import {
  MODE_VIDEO_MAX_RATE,
  MODE_VIDEO_MIN_COVERED_MS,
  MODE_VIDEO_PEAK_MS,
} from './constants.js'
import { buildModeTransition, coverAlphaAt } from './transition.js'
import {
  coverFit,
  createTransitionVideoLogger,
  planTransitionVideo,
  transitionClipUrl,
  transitionVideoSkipReason,
} from './transitionVideo.js'
import type { Theme } from './types.js'

const CLIP = '/games/sheriff-sixgun/theme/transitions/fs-enter.webm'

function planFor(speed: 'normal' | 'quick' | 'turbo', reducedMotion = false) {
  return buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, speed, reducedMotion })
}

describe('transitionClipUrl', () => {
  const theme = {
    transitions: { freeSpinsEnter: CLIP, freeSpinsExit: '/x/out.webm' },
  } as Pick<Theme, 'transitions'>

  it('방향마다 다른 클립을 고른다', () => {
    expect(transitionClipUrl(theme, 'freeSpins')).toBe(CLIP)
    expect(transitionClipUrl(theme, 'base')).toBe('/x/out.webm')
  })

  it('transitions가 없는 테마는 어느 방향이든 undefined다', () => {
    // 클립을 갖지 않은 다른 게임들이 지금까지처럼 단색 커튼으로 남는 자리다.
    expect(transitionClipUrl({}, 'freeSpins')).toBeUndefined()
    expect(transitionClipUrl({}, 'base')).toBeUndefined()
  })

  it('한쪽 방향만 걸린 테마는 반대쪽이 undefined다', () => {
    const enterOnly = { transitions: { freeSpinsEnter: CLIP } }
    expect(transitionClipUrl(enterOnly, 'freeSpins')).toBe(CLIP)
    expect(transitionClipUrl(enterOnly, 'base')).toBeUndefined()
  })

  it('빈 문자열은 클립이 없는 것으로 본다', () => {
    expect(transitionClipUrl({ transitions: { freeSpinsEnter: '   ' } }, 'freeSpins')).toBeUndefined()
  })
})

describe('planTransitionVideo — 틀지 말지', () => {
  it('클립이 없으면 계획도 없다', () => {
    expect(planTransitionVideo(planFor('normal'), {})).toBeNull()
    expect(planTransitionVideo(planFor('normal'), { url: '' })).toBeNull()
  })

  it('normal과 quick은 클립을 쓴다', () => {
    expect(planTransitionVideo(planFor('normal'), { url: CLIP })).not.toBeNull()
    expect(planTransitionVideo(planFor('quick'), { url: CLIP })).not.toBeNull()
  })

  it('터보는 차폐 구간이 너무 짧아 클립을 접는다', () => {
    // 전환을 늘려서 맞추면 안 된다 — 클립을 버리고 단색 커튼으로 남는 쪽이 규약이다.
    const plan = planFor('turbo')
    expect(plan.bannerMs).toBeLessThan(MODE_VIDEO_MIN_COVERED_MS)
    expect(planTransitionVideo(plan, { url: CLIP })).toBeNull()
  })

  it('모션 축소는 클립을 아예 틀지 않는다', () => {
    expect(planTransitionVideo(planFor('normal', true), { url: CLIP, reducedMotion: true })).toBeNull()
  })

  it('속도가 무엇이든 전환 길이는 그대로다', () => {
    // 클립을 붙였다고 총 길이가 늘어나면 스핀 리듬이 어긋난다.
    for (const speed of ['normal', 'quick', 'turbo'] as const) {
      const plan = planFor(speed)
      const scale = { normal: 1, quick: 0.7, turbo: 0.45 }[speed]
      expect(plan.totalMs).toBeCloseTo(1500 * scale, 6)
    }
  })
})

describe('planTransitionVideo — 정점 맞추기', () => {
  it('정점은 차폐 구간 안에 떨어진다', () => {
    for (const speed of ['normal', 'quick'] as const) {
      const plan = planFor(speed)
      const clip = planTransitionVideo(plan, { url: CLIP })
      expect(clip).not.toBeNull()
      if (clip === null) continue
      // 커튼이 완전히 덮은 뒤에 시작하고, 걷히기 시작하기 전에 정점을 지난다.
      expect(clip.startAtMs).toBe(plan.swapAtMs)
      expect(clip.peakAtMs).toBeGreaterThan(plan.swapAtMs)
      expect(clip.peakAtMs).toBeLessThan(plan.coverOutStartMs)
      // 그 순간 화면은 완전히 가려져 있어야 한다.
      expect(coverAlphaAt(plan, clip.peakAtMs)).toBe(1)
    }
  })

  it('클립을 늘이지 않고 앞을 잘라 들어간다', () => {
    const clip = planTransitionVideo(planFor('normal'), { url: CLIP })
    expect(clip).not.toBeNull()
    if (clip === null) return
    // 3초 클립의 정점은 2.2초다. 그 앞 어딘가에서 시작해야 정점이 구간 안에 들어온다.
    expect(clip.startAtSec).toBeGreaterThan(0)
    expect(clip.startAtSec * 1000).toBeLessThan(MODE_VIDEO_PEAK_MS)
  })

  it('배속은 1과 상한 사이다', () => {
    for (const speed of ['normal', 'quick'] as const) {
      const clip = planTransitionVideo(planFor(speed), { url: CLIP })
      expect(clip?.playbackRate).toBeGreaterThanOrEqual(1)
      expect(clip?.playbackRate).toBeLessThanOrEqual(MODE_VIDEO_MAX_RATE)
    }
  })

  it('시작 지점과 배속이 실제로 정점 시각을 만든다', () => {
    // 재생 시작부터 정점까지의 **클립 시간**을 배속으로 나눈 것이 실제 경과 시간이다.
    const plan = planFor('normal')
    const clip = planTransitionVideo(plan, { url: CLIP })
    expect(clip).not.toBeNull()
    if (clip === null) return
    const clipTimeToPeakMs = MODE_VIDEO_PEAK_MS - clip.startAtSec * 1000
    expect(clip.startAtMs + clipTimeToPeakMs / clip.playbackRate).toBeCloseTo(clip.peakAtMs, 6)
  })

  it('정점이 클립 맨 앞이면 잘라 들어가지 않는다', () => {
    const clip = planTransitionVideo(planFor('normal'), { url: CLIP, peakMs: 120 })
    expect(clip?.startAtSec).toBe(0)
    // 그래도 정점은 차폐 구간 안이다.
    expect(clip?.peakAtMs).toBeLessThan(planFor('normal').coverOutStartMs)
  })

  it('정점 값이 말이 안 되면 클립을 접는다', () => {
    expect(planTransitionVideo(planFor('normal'), { url: CLIP, peakMs: 0 })).toBeNull()
    expect(planTransitionVideo(planFor('normal'), { url: CLIP, peakMs: Number.NaN })).toBeNull()
  })
})

describe('coverFit', () => {
  it('세로 클립을 정사각 캔버스에 얹으면 위아래가 잘린다', () => {
    const rect = coverFit(540, 540, 540, 960)
    expect(rect.width).toBe(540)
    expect(rect.height).toBe(960)
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(-210)
  })

  it('가로가 넓은 캔버스는 폭을 채우고 넘치는 세로를 자른다', () => {
    const rect = coverFit(1080, 540, 540, 960)
    expect(rect.width).toBe(1080)
    expect(rect.height).toBe(1920)
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(-690)
  })

  it('캔버스를 언제나 완전히 덮는다 (레터박스가 생기지 않는다)', () => {
    for (const [cw, ch] of [[320, 480], [412, 300], [540, 960], [1000, 200]] as const) {
      const rect = coverFit(cw, ch, 540, 960)
      expect(rect.x).toBeLessThanOrEqual(0)
      expect(rect.y).toBeLessThanOrEqual(0)
      expect(rect.x + rect.width).toBeGreaterThanOrEqual(cw)
      expect(rect.y + rect.height).toBeGreaterThanOrEqual(ch)
    }
  })

  it('크기를 아직 모르면 캔버스를 그대로 채운다', () => {
    // videoWidth/Height는 메타데이터가 오기 전까지 0이다. 여기서 NaN이 나오면 안 된다.
    expect(coverFit(320, 480, 0, 0)).toEqual({ x: 0, y: 0, width: 320, height: 480 })
    expect(coverFit(0, 0, 540, 960)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('transitionVideoSkipReason', () => {
  it('사유를 구분해서 알려준다', () => {
    expect(transitionVideoSkipReason(planFor('normal'), {})).toBe('noClip')
    expect(transitionVideoSkipReason(planFor('normal'), { url: '  ' })).toBe('noClip')
    expect(transitionVideoSkipReason(planFor('normal'), { url: CLIP, reducedMotion: true })).toBe(
      'reducedMotion',
    )
    expect(transitionVideoSkipReason(planFor('turbo'), { url: CLIP })).toBe('coveredTooShort')
    expect(transitionVideoSkipReason(planFor('normal'), { url: CLIP, peakMs: 0 })).toBe('invalidPeak')
  })

  it('틀 수 있으면 null이다 — planTransitionVideo와 판단이 갈리지 않는다', () => {
    for (const speed of ['normal', 'quick', 'turbo'] as const) {
      const plan = planFor(speed)
      const inputs = { url: CLIP }
      const skipped = transitionVideoSkipReason(plan, inputs) !== null
      expect(planTransitionVideo(plan, inputs) === null).toBe(skipped)
    }
  })
})

describe('createTransitionVideoLogger', () => {
  function spyLogger() {
    const lines: { message: string; detail?: unknown }[] = []
    const logger = createTransitionVideoLogger((message, detail) => {
      lines.push(detail === undefined ? { message } : { message, detail })
    })
    return { lines, logger }
  }

  it('예상된 폴백은 사유별로 한 번만 남긴다', () => {
    // 클립이 없는 방향은 전환마다 같은 줄이 나온다. 그대로 두면 콘솔이 잠겨
    // 정작 봐야 할 실패가 묻힌다.
    const { lines, logger } = spyLogger()
    for (let i = 0; i < 5; i += 1) logger.once('skip:base:noClip', '접었다')
    expect(lines).toHaveLength(1)
  })

  it('사유가 다르면 각각 한 번씩 남긴다', () => {
    const { lines, logger } = spyLogger()
    logger.once('skip:base:noClip', '접었다')
    logger.once('skip:freeSpins:coveredTooShort', '접었다')
    logger.once('skip:base:noClip', '접었다')
    expect(lines.map((l) => l.message)).toEqual(['접었다', '접었다'])
  })

  it('실제 실패는 매번 남긴다', () => {
    // 로드/디코드/재생 거부는 반복 자체가 신호다. 억제하면 안 된다.
    const { lines, logger } = spyLogger()
    for (let i = 0; i < 3; i += 1) logger.always('자동재생이 막혔다', { attempt: i })
    expect(lines).toHaveLength(3)
    expect(lines[2]?.detail).toEqual({ attempt: 2 })
  })

  it('로거마다 따로 센다 — 게임 화면을 다시 열면 다시 남는다', () => {
    const first = spyLogger()
    const second = spyLogger()
    first.logger.once('k', 'x')
    second.logger.once('k', 'x')
    expect(first.lines).toHaveLength(1)
    expect(second.lines).toHaveLength(1)
  })

  it('detail이 없으면 sink에도 넘기지 않는다', () => {
    const { lines, logger } = spyLogger()
    logger.always('메시지만')
    expect(lines[0]).toEqual({ message: '메시지만' })
  })
})
