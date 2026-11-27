import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 모양 판·얼림 연출의 배선 계약. pixi는 브라우저 없이 돌릴 수 없어서, 깨지면 조용히 화면이 어긋나는 약속을
 * 소스 문자열로 못 박는다(코인 리스핀 배선 테스트와 같은 방식).
 */
const srcDir = resolve(process.cwd(), 'src')
const read = (...parts: string[]): string => readFileSync(join(srcDir, ...parts), 'utf8').replace(/\r\n/g, '\n')

const pixi = read('pixi', 'pixiRenderer.ts')
const fx = read('pixi', 'frostFx.ts')

function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`메서드를 찾지 못했다: ${signature}`)
  const end = source.indexOf('\n  }\n', start)
  return source.slice(start, end + 4)
}

describe('모양 판 — 직사각 판 경로는 건드리지 않는다', () => {
  it('릴 높이가 같은 판은 모양이 null이라 정지 순서·마스크·받침판 분기를 모두 건너뛴다', () => {
    expect(pixi).toContain('this.shape = shapeHeights(options.math)')
    expect(pixi).toMatch(/this\.stopOrder =\s+this\.shape === null\s+\? null/)
    const measure = methodBody(pixi, 'private measureGeometry(): Geometry {')
    expect(measure).toContain('this.shape === null ? raw')
    const mask = methodBody(pixi, 'private drawMask(): void {')
    expect(mask.indexOf('if (this.shape !== null)')).toBeGreaterThan(-1)
    // 기존 마스크 한 줄(roundRect)은 분기 뒤에 그대로 있다
    expect(mask.indexOf('roundRect(reelArea.x')).toBeGreaterThan(mask.indexOf('if (this.shape !== null)'))
  })

  it('릴은 모양에 따라 세로 오프셋을 받고, 없으면 0이다', () => {
    expect(pixi).toContain('view.root.y = this.layout.reelOffsets?.[reel] ?? 0')
  })

  it('변형 층에는 판 밖 칸을 앉히지 않는다', () => {
    const grid = methodBody(pixi, 'private applyGridOverride(')
    expect(grid).toContain('this.fillVoid(source)')
  })

  it('정지 순서가 있는 판은 묶음 계획을 쓰고, 묶음이 다 선 뒤에 기대감을 건다', () => {
    const run = methodBody(pixi, 'private async runSpin(')
    expect(run).toContain('buildOrderedSpinPlan(this.stopOrder')
    expect(run).toContain('buildSpinPlan({')
    const reel = methodBody(pixi, 'private spinReel(')
    expect(reel).toContain('groupDone(order, group, this.landedReels)')
  })
})

describe('얼림 팩 — 프리스핀 스트립과 새 스핀', () => {
  it('스핀을 시작할 때 지난 얼림을 끊고 스트립을 고른다(착지 계획보다 먼저)', () => {
    const run = methodBody(pixi, 'private async runSpin(')
    const abort = run.indexOf('this.abortFrost()')
    const select = run.indexOf('this.selectStrips(opts?.frost?.freeSpin)')
    const plan = run.indexOf('buildOrderedSpinPlan(')
    expect(abort).toBeGreaterThan(-1)
    expect(select).toBeGreaterThan(abort)
    expect(plan).toBeGreaterThan(select)
  })

  it('프리스핀 스트립 사본은 한 번만 만들어 돌려 쓴다', () => {
    const free = methodBody(pixi, 'private freeMath(): GameMath {')
    expect(free).toContain('this.freeMathCache ??=')
  })

  it('얼림이 끝나면(또는 끊기면) 덮개·밝기·트윈을 거둔다', () => {
    const play = methodBody(pixi, 'async playFrost(')
    expect(play).toContain('} finally {')
    expect(play.slice(play.indexOf('} finally {'))).toContain('scene.clear()')
    // 시작 이벤트마다 끝 이벤트가 따른다(정상 경로)
    expect(play).toContain("phase: 'end' })")
  })

  it('끝나면 화면을 서버 판으로 확정한다(어긋나면 서버 값이 이긴다)', () => {
    const play = methodBody(pixi, 'async playFrost(')
    expect(play).toContain('plan.consistent ?')
    expect(play).toContain('plan.finalGrid')
  })

  it('해제할 때 얼림 무대도 내린다', () => {
    const destroy = methodBody(pixi, '  destroy(): void {')
    expect(destroy).toContain('this.frostScene?.destroy()')
  })

  it('STOP은 남은 단계를 압축한다: 트윈을 몰아가고 대기 타이머를 끝낸다', () => {
    const skip = methodBody(pixi, 'skipFrost(): void {')
    expect(skip).toContain('this.frostScene?.compress()')
    expect(skip).toContain('this.clearTimers()')
  })
})

describe('얼림 무대 — 메모리', () => {
  it('텍스처는 레지스트리가 소유하고, 파편은 공용 파티클 풀에서 빌려 돌려준다', () => {
    expect(fx).toContain('createCanvasTexture(CAP_TEXTURE_PX, CAP_TEXTURE_PX, (ctx, w) => paintCap(ctx, w), deps.registry)')
    expect(fx).toContain('this.deps.particles.acquire(')
    expect(fx).toContain('this.deps.particles.release(sprites)')
  })

  it('덮개 스프라이트는 칸 수만큼만 만들어 돌려 쓴다', () => {
    expect(fx).toContain('this.freeCaps.pop() ??')
    expect(fx).toContain('this.freeCaps.push(cap.sprite)')
  })

  it('clear는 트윈과 파편을 모두 거둔다', () => {
    const clear = methodBody(fx, '  clear(): void {')
    expect(clear).toContain('tween.kill()')
    expect(clear).toContain('this.releaseShards(sprites)')
    expect(clear).toContain('this.giveCap(key)')
  })
})
