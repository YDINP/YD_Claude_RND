import { describe, expect, it } from 'vitest'
import {
  createTransitionClipLogger,
  planTransitionClip,
  transitionClipFor,
  transitionClipSkipReason,
  type TransitionClipInputs,
} from './transitionClip.js'
import { buildModeTransition, clipAlphaAt, coverAlphaAt, curtainAlphaAt } from './transition.js'
import {
  CLIP_FADE_MS,
  CURTAIN_RETIRE_MS,
  MODE_BANNER_MS,
  MODE_CLIP_MIN_COVERED_MS,
  MODE_COVER_IN_MS,
  MODE_COVER_OUT_MS,
  MODE_TRANSITION_SPEED_SCALE,
} from './constants.js'
import type { Theme } from './types.js'
import type { SpinSpeed } from './timing.js'

const ENTER = { src: '/x/enter.webp', opaqueMs: 1200 }
const EXIT = { src: '/x/exit.webp' }

function inputsFor(speed: SpinSpeed = 'normal', overrides: Partial<TransitionClipInputs> = {}): TransitionClipInputs {
  return {
    clip: ENTER,
    defaultOpaqueMs: MODE_COVER_IN_MS,
    bannerMs: MODE_BANNER_MS * MODE_TRANSITION_SPEED_SCALE[speed],
    ...overrides,
  }
}

describe('transitionClipFor', () => {
  it('방향마다 다른 클립을 고른다', () => {
    const theme = { transitions: { freeSpinsEnter: ENTER, freeSpinsExit: EXIT } } as Pick<Theme, 'transitions'>
    expect(transitionClipFor(theme, 'freeSpins')).toBe(ENTER)
    expect(transitionClipFor(theme, 'base')).toBe(EXIT)
  })

  it('한쪽만 걸면 반대쪽은 undefined다', () => {
    const theme = { transitions: { freeSpinsEnter: ENTER } } as Pick<Theme, 'transitions'>
    expect(transitionClipFor(theme, 'freeSpins')).toBe(ENTER)
    expect(transitionClipFor(theme, 'base')).toBeUndefined()
  })

  it('transitions 자체가 없으면 undefined다', () => {
    expect(transitionClipFor({}, 'freeSpins')).toBeUndefined()
    expect(transitionClipFor({}, 'base')).toBeUndefined()
  })

  it('빈 경로는 없는 것으로 본다', () => {
    const theme = { transitions: { freeSpinsEnter: { src: '   ' } } } as Pick<Theme, 'transitions'>
    expect(transitionClipFor(theme, 'freeSpins')).toBeUndefined()
  })
})

describe('planTransitionClip — 틀지 말지', () => {
  it('클립이 없으면 틀지 않는다', () => {
    expect(planTransitionClip(inputsFor('normal', { clip: undefined }))).toBeNull()
    expect(transitionClipSkipReason(inputsFor('normal', { clip: undefined }))).toBe('noClip')
  })

  it('normal과 quick에서는 튼다', () => {
    expect(planTransitionClip(inputsFor('normal'))).not.toBeNull()
    expect(planTransitionClip(inputsFor('quick'))).not.toBeNull()
  })

  it('터보에서는 차폐 구간이 짧아 접는다', () => {
    // 315ms < 420ms. 그 아래에서는 연출이 한 번 번쩍이고 사라져 오히려 산만하다.
    expect(MODE_BANNER_MS * MODE_TRANSITION_SPEED_SCALE.turbo).toBeLessThan(MODE_CLIP_MIN_COVERED_MS)
    expect(planTransitionClip(inputsFor('turbo'))).toBeNull()
    expect(transitionClipSkipReason(inputsFor('turbo'))).toBe('coveredTooShort')
  })

  it('모션 축소에서는 무조건 접는다', () => {
    const inputs = inputsFor('normal', { reducedMotion: true })
    expect(planTransitionClip(inputs)).toBeNull()
    expect(transitionClipSkipReason(inputs)).toBe('reducedMotion')
  })

  it('불투명 시각이 말이 안 되면 접는다', () => {
    for (const opaqueMs of [-100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const inputs = inputsFor('normal', { clip: { src: '/x/a.webp', opaqueMs } })
      expect(planTransitionClip(inputs)).toBeNull()
      expect(transitionClipSkipReason(inputs)).toBe('invalidOpaque')
    }
  })

  it('사유와 계획이 갈리지 않는다', () => {
    const cases: TransitionClipInputs[] = [
      inputsFor('normal'),
      inputsFor('turbo'),
      inputsFor('normal', { clip: undefined }),
      inputsFor('normal', { reducedMotion: true }),
    ]
    for (const inputs of cases) {
      expect(planTransitionClip(inputs) === null).toBe(transitionClipSkipReason(inputs) !== null)
    }
  })
})

describe('planTransitionClip — 언제 갈아 끼우나', () => {
  it('테마가 준 불투명 시각을 그대로 쓴다', () => {
    expect(planTransitionClip(inputsFor('normal'))).toEqual({ url: ENTER.src, opaqueMs: 1200 })
  })

  it('클립이 말하지 않으면 기본 덮기 길이를 쓴다', () => {
    const plan = planTransitionClip(inputsFor('normal', { clip: EXIT }))
    expect(plan).toEqual({ url: EXIT.src, opaqueMs: MODE_COVER_IN_MS })
  })

  it('클립을 잘라 쓰지 않는다 — 시작 지점도 배속도 계획에 없다', () => {
    // 애니메이션 WebP는 탐색도 배속도 없다. 계획이 그것을 아는 척하면 안 된다.
    const plan = planTransitionClip(inputsFor('normal'))
    expect(Object.keys(plan ?? {}).sort()).toEqual(['opaqueMs', 'url'])
  })
})

describe('전환 계획이 클립을 따라간다', () => {
  const base = { hasFreeSpinsBackground: true }

  it('덮기 구간이 클립의 불투명 시각이 된다', () => {
    const plan = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1200 })
    expect(plan.coverInMs).toBe(1200)
    // 교체는 그 끝에서 일어난다 — 그 순간이 클립에 가려 보이지 않는다.
    expect(plan.swapAtMs).toBe(1200)
  })

  it('배너와 걷기는 손대지 않는다', () => {
    const withClip = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1200 })
    const without = buildModeTransition('freeSpins', base)
    expect(withClip.bannerMs).toBe(without.bannerMs)
    expect(withClip.coverOutMs).toBe(without.coverOutMs)
  })

  it('클립이 없으면 지금까지의 길이 그대로다', () => {
    expect(buildModeTransition('freeSpins', base).coverInMs).toBe(MODE_COVER_IN_MS)
  })

  it('말이 안 되는 값은 무시하고 기본 길이로 간다', () => {
    // 0은 여기 없다 — «첫 프레임부터 덮는다»는 정상값이라 아래 describe에서 따로 다룬다.
    for (const clipOpaqueMs of [-5, Number.NaN]) {
      expect(buildModeTransition('freeSpins', { ...base, clipOpaqueMs }).coverInMs).toBe(MODE_COVER_IN_MS)
    }
  })

  it('모션 축소는 클립과 무관하게 짧은 길이를 지킨다', () => {
    const plan = buildModeTransition('freeSpins', { ...base, reducedMotion: true, clipOpaqueMs: 3000 })
    expect(plan.totalMs).toBeLessThan(500)
  })

  it('완전히 가려지는 구간이 여전히 있다', () => {
    // 클립이 덮기를 늘려도 «배경이 갈리는 순간이 가려진다»는 계약은 그대로여야 한다.
    const plan = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1200 })
    expect(plan.coverOutStartMs).toBeGreaterThan(plan.swapAtMs)
  })
})

describe('createTransitionClipLogger', () => {
  it('always는 매번, once는 키마다 한 번만 남긴다', () => {
    const lines: string[] = []
    const logger = createTransitionClipLogger((message) => lines.push(message))

    logger.always('실패')
    logger.always('실패')
    logger.once('skip', '접었다')
    logger.once('skip', '접었다')
    logger.once('other', '다른 사유')

    expect(lines).toEqual(['실패', '실패', '접었다', '다른 사유'])
  })
})

describe('opaqueMs 0 — 첫 프레임부터 덮는 클립', () => {
  // 복귀 클립이 대개 이렇다. 0은 «쓰지 않음»이 아니라 «이미 덮여 있다»는 정상값이다.
  const ZERO = { src: '/x/exit.webp', opaqueMs: 0 }

  it('0은 유효한 값이라 접지 않는다', () => {
    const inputs = inputsFor('normal', { clip: ZERO })
    expect(transitionClipSkipReason(inputs)).toBeNull()
    expect(planTransitionClip(inputs)).toEqual({ url: ZERO.src, opaqueMs: 0 })
  })

  it('0과 «키 없음»은 다른 결과를 낸다', () => {
    // 이 둘이 같아지면 복귀 연출이 기본 덮기(380ms) 동안 단색 커튼에 묻힌다.
    const withZero = planTransitionClip(inputsFor('normal', { clip: ZERO }))
    const withNone = planTransitionClip(inputsFor('normal', { clip: { src: ZERO.src } }))
    expect(withZero?.opaqueMs).toBe(0)
    expect(withNone?.opaqueMs).toBe(MODE_COVER_IN_MS)
    expect(withZero?.opaqueMs).not.toBe(withNone?.opaqueMs)
  })

  it('음수는 여전히 거부한다', () => {
    expect(transitionClipSkipReason(inputsFor('normal', { clip: { src: '/x/a.webp', opaqueMs: -1 } }))).toBe(
      'invalidOpaque',
    )
  })

  it('덮기 구간이 사라지고 곧바로 갈아 끼운다', () => {
    const plan = buildModeTransition('base', { hasFreeSpinsBackground: true, clipOpaqueMs: 0 })
    expect(plan.coverInMs).toBe(0)
    expect(plan.swapAtMs).toBe(0)
  })

  it('덮기가 0이어도 완전히 가려지는 구간은 남는다', () => {
    // 배경이 갈리는 순간이 가려진다는 계약은 클립이 무엇을 하든 지켜져야 한다.
    const plan = buildModeTransition('base', { hasFreeSpinsBackground: true, clipOpaqueMs: 0 })
    expect(plan.coverOutStartMs).toBeGreaterThan(plan.swapAtMs)
    expect(coverAlphaAt(plan, plan.swapAtMs + 1)).toBe(1)
  })
})

describe('전환이 클립을 끝까지 재생한다', () => {
  const base = { hasFreeSpinsBackground: true }
  const CLIP_MS = 3000

  it('클립 길이를 주면 전환 전체가 그만큼 지속된다', () => {
    // 실측: 복귀 클립 3.0초 중 1.12초만 재생되고 잘렸다. 잘린 1.88초가 연출의 전부였다.
    const plan = buildModeTransition('base', { ...base, clipOpaqueMs: 0, clipDurationMs: CLIP_MS })
    expect(plan.totalMs).toBe(CLIP_MS)
  })

  it('늘어나는 것은 걷기뿐이다', () => {
    // 덮기는 클립이 가리는 시각이 정하고, 배너는 허브가 얹는 구간이라 둘 다 손대면 안 된다.
    const plan = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1600, clipDurationMs: CLIP_MS })
    const without = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1600 })
    expect(plan.coverInMs).toBe(1600)
    expect(plan.bannerMs).toBe(without.bannerMs)
    expect(plan.coverOutMs).toBeGreaterThan(without.coverOutMs)
    expect(plan.totalMs).toBe(CLIP_MS)
  })

  it('진입도 이탈도 잘리지 않는다', () => {
    // sheriff 실측값 그대로. 진입 2.72초/이탈 1.12초로 잘리던 자리다.
    const enter = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1600, clipDurationMs: 2999 })
    const exit = buildModeTransition('base', { ...base, clipOpaqueMs: 0, clipDurationMs: 3000 })
    expect(enter.totalMs).toBe(2999)
    expect(exit.totalMs).toBe(3000)
  })

  it('클립이 짧으면 아무것도 늘리지 않는다', () => {
    const plan = buildModeTransition('base', { ...base, clipOpaqueMs: 0, clipDurationMs: 300 })
    expect(plan.coverOutMs).toBe(MODE_COVER_OUT_MS)
  })

  it('길이를 모르면 지금까지의 계산 그대로다', () => {
    const plan = buildModeTransition('base', { ...base, clipOpaqueMs: 0 })
    expect(plan.coverOutMs).toBe(MODE_COVER_OUT_MS)
    expect(plan.totalMs).toBe(MODE_COVER_OUT_MS + plan.bannerMs)
  })

  it('망가진 길이는 무시한다', () => {
    for (const clipDurationMs of [0, -1, Number.NaN]) {
      const plan = buildModeTransition('base', { ...base, clipOpaqueMs: 0, clipDurationMs })
      expect(plan.coverOutMs).toBe(MODE_COVER_OUT_MS)
    }
  })
})

describe('커튼과 클립은 서로 다른 곡선을 탄다', () => {
  const base = { hasFreeSpinsBackground: true }
  const exitPlan = buildModeTransition('base', { ...base, clipOpaqueMs: 0, clipDurationMs: 3000 })
  const enterPlan = buildModeTransition('freeSpins', { ...base, clipOpaqueMs: 1600, clipDurationMs: 2999 })

  it('클립이 떴으면 커튼은 교체 직후 물러난다', () => {
    // 물러나지 않으면 클립이 제 그림으로 걷혀도 뒤에서 검정만 드러난다.
    expect(curtainAlphaAt(exitPlan, exitPlan.swapAtMs + CURTAIN_RETIRE_MS, true)).toBe(0)
    expect(curtainAlphaAt(exitPlan, 1500, true)).toBe(0)
  })

  it('클립이 못 떴으면 커튼이 완전 차폐 구간을 붙든다', () => {
    // 늦은 디코드·로딩 실패가 여기 걸린다. 교체가 그대로 비치면 안 된다.
    const inBanner = exitPlan.swapAtMs + 1
    expect(curtainAlphaAt(exitPlan, inBanner, false)).toBe(1)
    // 클립이 없을 때의 곡선은 지금까지와 한 글자도 다르지 않아야 한다.
    for (const t of [0, 100, inBanner, exitPlan.coverOutStartMs + 500, exitPlan.totalMs]) {
      expect(curtainAlphaAt(exitPlan, t, false)).toBe(coverAlphaAt(exitPlan, t))
    }
  })

  it('덮는 동안에는 클립이 떠 있어도 커튼이 함께 오른다', () => {
    // 클립이 아직 다 가리지 못한 구간이라 안전망이 필요하다.
    expect(curtainAlphaAt(enterPlan, 800, true)).toBeGreaterThan(0)
    expect(curtainAlphaAt(enterPlan, 800, true)).toBeLessThan(1)
  })

  it('클립은 마지막 걷기 구간에서만 사라진다', () => {
    expect(clipAlphaAt(exitPlan, 0)).toBe(1)
    expect(clipAlphaAt(exitPlan, exitPlan.coverOutStartMs - 1)).toBe(1)
    expect(clipAlphaAt(exitPlan, exitPlan.coverOutStartMs + exitPlan.coverOutMs)).toBe(0)
  })

  it('페이드는 끝의 짧은 구간에만 걸린다', () => {
    // 걷기가 클립 길이만큼(2.3초) 늘어나도 알파는 그만큼 길게 내리지 않는다 —
    // 제 그림으로 걷히는 클립 위에 반투명이 겹치면 뒤가 미리 비친다.
    expect(exitPlan.coverOutMs).toBeGreaterThan(CLIP_FADE_MS)
    expect(clipAlphaAt(exitPlan, exitPlan.totalMs - CLIP_FADE_MS - 1)).toBe(1)
    expect(clipAlphaAt(exitPlan, exitPlan.totalMs - CLIP_FADE_MS / 2)).toBeLessThan(1)
  })

  it('클립 알파는 단조 감소한다', () => {
    let previous = 1
    for (let t = enterPlan.coverOutStartMs; t <= enterPlan.totalMs; t += 50) {
      const alpha = clipAlphaAt(enterPlan, t)
      expect(alpha).toBeLessThanOrEqual(previous + 1e-9)
      previous = alpha
    }
    expect(clipAlphaAt(enterPlan, enterPlan.totalMs)).toBe(0)
  })

  it('전환이 끝나면 둘 다 사라진다', () => {
    for (const plan of [enterPlan, exitPlan]) {
      expect(clipAlphaAt(plan, plan.totalMs)).toBe(0)
      expect(curtainAlphaAt(plan, plan.totalMs, true)).toBe(0)
      expect(curtainAlphaAt(plan, plan.totalMs, false)).toBe(0)
    }
  })
})
