import { describe, expect, it } from 'vitest'
import { loadIdolMath, sampleRoulettes } from '../test/idolMath'
import { runRouletteShow, type RouletteHost } from './rouletteDirector'
import { planRoulette, type RoulettePlan } from './rouletteShow'

const math = loadIdolMath()
const config = math.stageRoulette
if (config === undefined) throw new Error('룰렛 math 없음')
const samples = sampleRoulettes(math, 60)
const sample = samples.find((s) => s.feature.steps.length >= 5) ?? samples[0]
if (sample === undefined) throw new Error('표본 없음')
const plan: RoulettePlan = planRoulette(sample.feature, config, { seed: sample.seed })

function recordingHost(abortAfter?: number): { host: RouletteHost; log: string[] } {
  const log: string[] = []
  let calls = 0
  const tick = (name: string): void => {
    log.push(name)
    calls += 1
  }
  const host: RouletteHost = {
    aborted: () => abortAfter !== undefined && calls >= abortAfter,
    restore: (n) => tick(`restore:${n}`),
    rise: async () => tick('rise'),
    lightUp: async () => tick('lightUp'),
    focus: async (s) => tick(`focus:${s.index}`),
    awaitSpin: async (s) => tick(`await:${s.index}`),
    spin: async (s) => tick(`spin:${s.index}`),
    reveal: async (s) => tick(`reveal:${s.index}`),
    commit: (n) => tick(`commit:${n}`),
    summary: async () => tick('summary'),
  }
  return { host, log }
}

describe('runRouletteShow', () => {
  it('처음부터: 떠오름 → 점등 → 회전마다 맞춤·대기·회전·결과·기록 → 요약', async () => {
    const { host, log } = recordingHost()
    const result = await runRouletteShow(plan, host)
    expect(result).toBe('done')
    const expected = ['rise', 'lightUp']
    plan.steps.forEach((_, i) => expected.push(`focus:${i}`, `await:${i}`, `spin:${i}`, `reveal:${i}`, `commit:${i + 1}`))
    expected.push('summary')
    expect(log).toEqual(expected)
  })

  it('이어 보기: 상태를 복원하고 점등은 건너뛰며 다음 회전부터 돈다', async () => {
    const { host, log } = recordingHost()
    await runRouletteShow(plan, host, { startAt: 2 })
    expect(log[0]).toBe('restore:2')
    expect(log).not.toContain('lightUp')
    expect(log).not.toContain('spin:0')
    expect(log).not.toContain('spin:1')
    expect(log).toContain('spin:2')
    expect(log[log.length - 1]).toBe('summary')
  })

  it('다 본 뒤에 이어 보면 요약만 다시 보여 준다', async () => {
    const { host, log } = recordingHost()
    await runRouletteShow(plan, host, { startAt: plan.steps.length })
    expect(log).toEqual([`restore:${plan.steps.length}`, 'rise', 'summary'])
  })

  it('startAt이 범위를 넘으면 접는다', async () => {
    const { host, log } = recordingHost()
    await runRouletteShow(plan, host, { startAt: 999 })
    expect(log).toContain('summary')
    expect(log.filter((l) => l.startsWith('spin:'))).toEqual([])
  })

  it('회전은 항상 서버가 정한 순서 그대로다(건너뛰어도 순서·개수가 같다)', async () => {
    const { host, log } = recordingHost()
    await runRouletteShow(plan, host)
    const spins = log.filter((l) => l.startsWith('spin:')).map((l) => Number(l.split(':')[1]))
    expect(spins).toEqual(plan.steps.map((s) => s.index))
  })

  it('중간에 취소되면 그 뒤로 아무것도 부르지 않는다', async () => {
    const { host, log } = recordingHost(6)
    const result = await runRouletteShow(plan, host)
    expect(result).toBe('aborted')
    expect(log.length).toBe(6)
    expect(log).not.toContain('summary')
  })

  it('시작하자마자 취소돼도 안전하다', async () => {
    const { host, log } = recordingHost(1)
    expect(await runRouletteShow(plan, host)).toBe('aborted')
    expect(log).toEqual(['rise'])
  })

  it('요약 도중 취소되면 aborted를 돌려준다', async () => {
    const total = 2 + plan.steps.length * 5 + 1
    const { host } = recordingHost(total)
    expect(await runRouletteShow(plan, host)).toBe('aborted')
  })
})
