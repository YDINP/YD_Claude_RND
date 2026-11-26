import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyDiagnostics } from './diagnostics.js'

/**
 * 코인 리스핀 연출의 배선 계약. pixi는 브라우저 없이 돌릴 수 없어서, 깨지면 조용히 화면이 어긋나는 약속을
 * 소스 문자열로 못 박는다(`modeTransition` 순서를 못 박은 기존 테스트와 같은 방식).
 */
const srcDir = resolve(process.cwd(), 'src')
const read = (...parts: string[]): string => readFileSync(join(srcDir, ...parts), 'utf8').replace(/\r\n/g, '\n')

const pixi = read('pixi', 'pixiRenderer.ts')

/** `private name(` 부터 같은 들여쓰기의 닫는 중괄호까지. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`메서드를 찾지 못했다: ${signature}`)
  const end = source.indexOf('\n  }\n', start)
  return source.slice(start, end + 4)
}

describe('코인 리스핀 — 시작/끝 이벤트 쌍', () => {
  const phase = methodBody(pixi, 'private async runRespinPhase(')

  it('respinStep은 start를 낸 같은 자리에서 end도 낸다', () => {
    const start = phase.indexOf("this.emitRespinStep(step, total, 'start')")
    const play = phase.indexOf('await this.playRespinStep(', start)
    const end = phase.indexOf("this.emitRespinStep(step, total, 'end')", play)
    expect(start).toBeGreaterThan(-1)
    expect(play).toBeGreaterThan(start)
    expect(end).toBeGreaterThan(play)
    // 끼어들어 return 하는 줄은 end 뒤에 있어야 한다 — start를 냈으면 end도 반드시 나간다.
    expect(phase.indexOf('if (!alive()) return', play)).toBeGreaterThan(end)
  })

  it('columnWrap은 같은 약속 하나를 사이에 두고 start와 end를 낸다', () => {
    const wrap = methodBody(pixi, 'private async playRespinWrap(')
    const start = wrap.indexOf("phase: 'start'")
    const run = wrap.indexOf('await this.runRespinHandle(')
    const end = wrap.indexOf("phase: 'end'")
    expect(start).toBeGreaterThan(-1)
    expect(run).toBeGreaterThan(start)
    expect(end).toBeGreaterThan(run)
  })

  it('진행 순서는 진입 → 진입 감기 → 스텝 → 정산 → 종료다', () => {
    const order = [
      'await this.respinIntro(',
      'await this.enterCave(',
      'plan.entryWraps',
      'for (const step of plan.steps)',
      'await this.playRespinCollect(',
      "type: 'respinEnd'",
    ].map((token) => phase.indexOf(token))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('STOP은 건너뛰지 않고 압축한다 — 스텝·감기·정산이 모두 skipRequestedToken을 본다', () => {
    expect(phase).toContain('respinSkipStepMs(')
    // 감기는 남은 줄 전부가 한 예산을 나눠 쓴다 — 판단은 재생 루프(wrapMsAt)가 하고 감기는 그 값을 받는다.
    expect(phase).toContain('respinSkipWrapMs(')
    expect(methodBody(pixi, 'private async playRespinWrap(')).toContain('skipWrapMs()')
    expect(methodBody(pixi, 'private async playRespinCollect(')).toContain('this.skipRequestedToken === token')
    expect(methodBody(pixi, 'private skipSpin(')).toContain('this.activeRespin?.compress()')
  })
})

describe('코인 리스핀 — 동굴 출입과 정리', () => {
  it('진입은 freeSpins 전환을, 복귀는 base 전환을 재사용한다', () => {
    expect(methodBody(pixi, 'private enterCave(')).toContain("this.runCaveTransition('freeSpins'")
    expect(methodBody(pixi, 'endRespin(): Promise<void>')).toContain("this.runCaveTransition('base'")
  })

  it('전환을 시작하기 전에 끝나지 않은 전환부터 닫는다', () => {
    const body = methodBody(pixi, 'private runCaveTransition(')
    expect(body.indexOf('this.finishModeTransition()')).toBeGreaterThan(-1)
    expect(body.indexOf('this.finishModeTransition()')).toBeLessThan(body.indexOf('this.playModeTransition(to)'))
  })

  it('복귀하면 종료 판을 다음 스핀까지 세워 두고, 새 스핀이 걷는다', () => {
    expect(methodBody(pixi, 'endRespin(): Promise<void>')).toContain('this.leaveCave(true)')
    expect(methodBody(pixi, 'private leaveCave(')).toContain('this.respinScene.freeze()')
    const run = methodBody(pixi, 'private async runSpin(')
    expect(run.indexOf('this.releaseHeldBoard()')).toBeGreaterThan(-1)
    expect(run.indexOf('this.releaseHeldBoard()')).toBeLessThan(run.indexOf('this.prepareReelFaces('))
    // 트리거 판의 라인 당첨을 보여 줄 때는 릴을 되살린다(숨은 릴 위에 당첨을 그리지 않는다).
    expect(methodBody(pixi, 'async showWins(')).toContain('if (this.boardHeld && wins.length > 0) this.releaseHeldBoard()')
  })

  it('새 스핀은 지난 리스핀부터 정리하고 시작한다', () => {
    const run = methodBody(pixi, 'private async runSpin(')
    expect(run.indexOf('this.abortRespin()')).toBeGreaterThan(-1)
    expect(run.indexOf('this.abortRespin()')).toBeLessThan(run.indexOf('this.prepareReelFaces('))
  })

  it('abortRespin은 진행 중 토막을 확정하고 트윈을 걷고 동굴을 내린다', () => {
    const body = methodBody(pixi, 'private abortRespin(')
    expect(body).toContain('this.activeRespin?.finish()')
    expect(body).toContain('this.killRespinTweens()')
    expect(body).toContain('this.leaveCave()')
  })

  it('destroy는 트윈을 걷고 무대를 파괴한다', () => {
    const destroy = pixi.slice(pixi.indexOf('this.killRespinTweens()', pixi.indexOf('destroy(): void')))
    expect(destroy.indexOf('this.respinScene?.destroy()')).toBeGreaterThan(-1)
  })

  it('동굴에 없으면 endRespin은 곧장 끝나고, 두 번 불러도 같은 약속이다', () => {
    const body = methodBody(pixi, 'endRespin(): Promise<void>')
    expect(body).toContain('if (!this.caveActive || this.destroyed) return Promise.resolve()')
    expect(body).toContain('return this.endRespinPromise')
  })
})

describe('코인 리스핀 — 얼굴 텍스처와 스트립', () => {
  it('릴이 감속에 들어갈 때 코인 얼굴을 켠다 — 착지 순간 제자리 교체가 없다', () => {
    const call = pixi.indexOf('.call(() => this.enableReelFaces(plan.reel))')
    expect(call).toBeGreaterThan(-1)
    // 가속 트윈 뒤, 감속(착지) 트윈 앞이어야 한다.
    expect(pixi.lastIndexOf('p: accelTo,', call)).toBeGreaterThan(-1)
    expect(pixi.indexOf('p: landing,', call)).toBeGreaterThan(call)
    expect(pixi.indexOf('p: landing,', call) - call).toBeLessThan(200)
  })

  it('코인 리스핀이 있는 게임만 코인 예감 규칙으로 갈아 끼운다', () => {
    const run = methodBody(pixi, 'private async runSpin(')
    expect(run).toContain('coinAnticipatedReels(this.options.math, stops)')
    expect(run).toContain('math.coinRespin')
  })

  it('얼굴 텍스처는 레지스트리 소유 — 무대는 텍스처를 파괴하지 않는다', () => {
    const fx = read('pixi', 'respinFx.ts')
    expect(fx).not.toMatch(/texture\.destroy\(/)
    expect(fx).not.toMatch(/face\.destroy\(true\)/)
  })

  it('얼굴 캐시는 상한이 있다', () => {
    const face = read('pixi', 'coinFace.ts')
    expect(face).toContain('RESPIN_FACE_CACHE_MAX')
  })
})

describe('코인 리스핀 — 순수 모듈 격리', () => {
  it.each(['respin.ts', 'coinAnticipation.ts', 'tentaclePath.ts', 'respinConstants.ts'])(
    '%s는 pixi.js와 gsap을 import하지 않는다',
    (file) => {
      const source = read(file)
      // 따옴표 안의 모듈 이름을 한 덩어리로 쓰면 purity.test가 이 파일을 위반으로 읽는다.
      for (const lib of ['pixi.js', 'gsap']) expect(source).not.toContain(`from '${lib}'`)
    },
  )
})

describe('코인 리스핀 — 진단', () => {
  it('리스핀 무대가 없는 팩의 빈 진단에는 respin 항목이 없다', () => {
    expect('respin' in emptyDiagnostics()).toBe(false)
  })

  it('무대가 있을 때만 respin 항목을 싣는다', () => {
    expect(pixi).toContain('...(this.respinScene === null ? {} : { respin: this.respinScene.stats })')
  })

  it('무대 통계는 진단 형식의 다섯 항목을 모두 낸다', () => {
    const fx = read('pixi', 'respinFx.ts')
    const start = fx.indexOf('get stats()')
    expect(start).toBeGreaterThan(-1)
    const body = fx.slice(start, start + 600)
    for (const key of ['coinFaces', 'tentaclesCreated', 'tentaclesLive', 'fxLive', 'liveTweens']) {
      expect(body).toContain(key)
    }
  })
})
