import { afterEach, beforeAll, describe, expect, it } from 'vitest'

// pixi가 import 시점에 캔버스 2D 문맥을 한 번 물어본다. jsdom엔 없으니 빈 문맥으로 막아 둔다(그리기는 하지 않는다).
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
})

async function load() {
  const [{ Container }, { gsap }, { AnticipationFx }] = await Promise.all([
    import('pixi.js'),
    import('gsap'),
    import('./anticipationFx.js'),
  ])
  return { Container, gsap, AnticipationFx }
}

const column = { x: 10, y: 0, width: 60, height: 180 }

describe('AnticipationFx — 정리(트윈 누수 0)', () => {
  afterEach(async () => {
    const { gsap } = await load()
    gsap.globalTimeline.clear()
  })

  it('켰다가 즉시 걷으면 트윈도 맥동도 남지 않는다', async () => {
    const { Container, gsap, AnticipationFx } = await load()
    const fx = new AnticipationFx(0xffcc66)
    const views = [new Container(), new Container()]
    fx.begin([column], views, 1500)
    expect(fx.liveTweens).toBeGreaterThan(0)
    expect(fx.container.visible).toBe(true)
    fx.clear()
    expect(fx.liveTweens).toBe(0)
    expect(gsap.globalTimeline.getChildren().length).toBe(0)
    for (const view of views) expect(view.scale.x).toBe(1)
    expect(fx.container.visible).toBe(false)
    fx.destroy()
  })

  it('연속 기대 릴: 다시 켜도 맥동 트윈이 쌓이지 않는다', async () => {
    const { Container, AnticipationFx } = await load()
    const fx = new AnticipationFx(0xffcc66)
    const views = [new Container()]
    fx.begin([column], views, 1500)
    const first = fx.liveTweens
    fx.end('miss')
    fx.begin([{ ...column, x: 80 }], views, 1500)
    fx.end('miss')
    fx.begin([{ ...column, x: 150 }], views, 1500)
    // 꺼지는 페이드가 끊기고 새 기둥·맥동만 남는다 — 처음과 같은 수준(누적되지 않음).
    expect(fx.liveTweens).toBeLessThanOrEqual(first + 1)
    fx.destroy()
    expect(fx.liveTweens).toBe(0)
  })

  it('터짐·꺼짐이 끝나면 트윈이 저절로 0이 된다', async () => {
    const { Container, gsap, AnticipationFx } = await load()
    for (const outcome of ['hit', 'miss'] as const) {
      const fx = new AnticipationFx(0xffffff)
      const view = new Container()
      fx.begin([column], [view], 1200)
      fx.end(outcome)
      // 시간을 끝까지 감는다.
      for (const tween of gsap.globalTimeline.getChildren()) tween.totalProgress(1)
      expect(fx.liveTweens).toBe(0)
      expect(view.scale.x).toBe(1)
      expect(fx.container.visible).toBe(false)
      fx.destroy()
    }
  })

  it('스킵(결과 없음)은 곧장 걷는다', async () => {
    const { AnticipationFx } = await load()
    const fx = new AnticipationFx(0xffffff)
    fx.begin([column], [], 800)
    fx.end()
    expect(fx.liveTweens).toBe(0)
    expect(fx.isActive).toBe(false)
    fx.destroy()
  })
})
