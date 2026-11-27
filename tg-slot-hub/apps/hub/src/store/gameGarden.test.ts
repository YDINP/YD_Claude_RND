import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import { createSeededRng, parseGameMath, spinUnchecked } from '@tgslot/slot-engine'
import type { SpinResponse } from '@tgslot/shared'
import { buildSpinToOptions, hasCascadeSteps, hasGardenSteps } from './game'

function loadMath() {
  const path = resolve(process.cwd(), '..', '..', 'games', 'greenhouse-garden', 'math.json')
  return parseGameMath(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

/** 엔진 결과 하나를 응답 모양으로 감싼다(허브는 서버가 준 값을 그대로 렌더러에 넘긴다). */
function responseOf(seed: string): SpinResponse {
  const result = spinUnchecked(loadMath(), 100, createSeededRng(seed))
  return { ...result, isFreeSpin: false, totalBet: 100, freeSpins: null } as unknown as SpinResponse
}

describe('정원 스핀 → 렌더러 옵션', () => {
  it('garden 피처와 8×8 착지 창(grid)을 그대로 넘긴다', () => {
    const response = responseOf('hub-garden:1')
    const options = buildSpinToOptions(response)
    expect(options?.garden?.type).toBe('garden')
    expect(options?.gridBefore).toBe(response.grid)
    expect(options?.gridBefore).toHaveLength(8)
    // 정원은 연쇄 필드(cascades·finalGrid)를 쓰지 않는다.
    expect(options?.cascades).toBeUndefined()
    expect(options?.finalGrid).toBeUndefined()
  })

  it('프리스핀이면 fast도 함께 준다(렌더러가 프리스핀 전용 스트립을 읽는다)', () => {
    const options = buildSpinToOptions({ ...responseOf('hub-garden:2'), isFreeSpin: true })
    expect(options?.fast).toBe(true)
    expect(options?.garden?.type).toBe('garden')
  })

  it('정원 피처가 있으면 승리 연출은 «연쇄 모드»(A단계만)다', () => {
    const response = responseOf('hub-garden:3')
    expect(hasGardenSteps(response)).toBe(true)
    expect(hasCascadeSteps(response)).toBe(false)
    expect(hasGardenSteps({ features: [] })).toBe(false)
  })
})
