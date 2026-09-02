import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(process.cwd(), 'src')

/** 줄 주석과 블록 주석 본문을 걷어낸 소스. 규칙을 설명하는 문장이 검사에 걸리지 않게 한다. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')
}

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(dir, entry.name))
}

/** 브라우저 전용 라이브러리. src 루트에서는 정적 import가 금지다. */
const BROWSER_ONLY = ["'pixi.js'", "'gsap'"]

describe('브라우저 전용 코드 격리', () => {
  const rootFiles = listTsFiles(srcDir)

  it('src 루트에 파일이 있다', () => {
    expect(rootFiles.length).toBeGreaterThan(5)
  })

  it('src 루트 모듈은 pixi.js와 gsap을 정적으로 import하지 않는다', () => {
    const offenders: string[] = []
    for (const file of rootFiles) {
      const source = readFileSync(file, 'utf8')
      for (const marker of BROWSER_ONLY) {
        if (source.includes(`from ${marker}`)) offenders.push(`${file} -> ${marker}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('slot-engine은 타입으로만 가져온다', () => {
    const offenders: string[] = []
    for (const file of rootFiles) {
      if (file.endsWith('.test.ts') || file.endsWith('testSupport.ts')) continue
      const source = readFileSync(file, 'utf8')
      for (const line of source.split('\n')) {
        if (!line.includes("from '@tgslot/slot-engine'")) continue
        if (!line.trimStart().startsWith('import type')) offenders.push(`${file}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('pixi 진입점은 동적 import로만 연결된다', () => {
    const facade = readFileSync(join(srcDir, 'createRenderer.ts'), 'utf8')
    expect(facade).toContain("await import('./pixi/pixiRenderer.js')")
    expect(facade).not.toContain("from './pixi/")
  })

  it('그리는 쪽은 win.symbol을 아예 읽지 않는다', () => {
    // 그룹 배당에서 win.symbol은 그룹 id(anybar)라 테마에 없는 키다.
    // 화면에 무엇이 보이는지는 격자만 알고, 렌더러는 셀이 들고 있는 심볼을 쓴다.
    // (설명 주석에는 그 이름이 나오므로 주석을 걷어내고 검사한다.)
    for (const file of listTsFiles(join(srcDir, 'pixi'))) {
      if (file.endsWith('.test.ts')) continue
      expect(stripComments(readFileSync(file, 'utf8'))).not.toContain('win.symbol')
    }
  })

  it('연출은 셀에 그려진 심볼로 찾는다', () => {
    const entry = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(entry).toContain('resolveSymbolFx(this.options.theme.fx, cell.symbol')
  })

  it('해제할 때 직접 만든 텍스처를 정리한다', () => {
    // 캔버스로 만든 텍스처는 아무도 소유하지 않아 이 호출이 빠지면 GPU에 그대로 쌓인다.
    const entry = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(entry).toContain('this.ownedTextures.destroyAll()')
  })

  it('동적 import가 가리키는 파일이 실제로 있다', () => {
    // jsdom에는 캔버스가 없어 이 모듈을 실행해 볼 수 없다. 경로만이라도 붙잡아 둔다.
    expect(existsSync(join(srcDir, 'pixi', 'pixiRenderer.ts'))).toBe(true)
    const entry = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(entry).toContain('export async function createPixiRendererCore')
  })
})

describe('리뷰에서 잡힌 회귀 방지', () => {
  const renderer = (): string => readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')

  it('showWins가 피처 옵션을 계획으로 넘긴다', () => {
    expect(renderer()).toContain('presentationOptionsFor(opts, this.options.reducedMotion)')
  })

  it('라인 승리가 없다고 곧장 돌아서지 않는다', () => {
    // 스캐터나 프리스핀만 있는 스핀도 보여줄 것이 있다.
    expect(renderer()).not.toContain('this.destroyed || wins.length === 0')
  })

  it('빛이 같은 셀을 다시 터뜨리기 전에 앞의 연출을 끈다', () => {
    expect(renderer()).toContain('this.stopCellFx(key)')
  })

  it('연출을 정리할 때 정지 스프라이트를 되살린다', () => {
    // 시트가 숨겨 둔 채 끝나면 심볼이 영영 사라진다.
    expect(renderer()).toContain('cell.sprite.visible = true')
  })

  it('모드 테두리를 그리기 전에 자기 층을 비운다', () => {
    expect(renderer()).toContain('this.modeGraphics.clear()')
  })

  it('전환을 끊을 때도 끝을 알리는 한 곳을 지난다', () => {
    const source = renderer()
    expect(source).toContain('private finishModeTransition()')
    expect(source).toContain("phase: 'end'")
  })

  it('스킵은 한 바퀴를 더 돌지 않는다', () => {
    expect(renderer()).toContain('active.stripLength, 0)')
  })

  it('이미 접은 릴은 다시 접지 않는다', () => {
    expect(renderer()).toContain('if (active.skipped) continue')
  })
})

describe('변형(뮤테이션) 배선', () => {
  const renderer = (): string => readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')

  it('변형은 착지와 spinEnd 사이에 재생된다', () => {
    // 순서가 뒤집히면 허브가 변형 전 그리드 위에서 승리를 보여준다.
    const source = renderer()
    const phaseAt = source.indexOf('await this.runMutationPhase(mutationPlan, token)')
    const endAt = source.indexOf("this.emit({ type: 'spinEnd' })")
    expect(phaseAt).toBeGreaterThan(-1)
    expect(endAt).toBeGreaterThan(phaseAt)
  })

  it('정지 위치를 되짚다 실패해도 스핀은 정상 종료한다', () => {
    // 변형은 연출이지 결과가 아니다. 여기서 던지면 spinEnd가 영영 안 나간다.
    const source = renderer()
    // 되짚기가 try 안에 있고, 실패하면 계획 없이 물러난다.
    const guarded = source.slice(source.indexOf('private planMutations('))
    expect(guarded).toContain('gridBefore = stopsToGrid(this.options.math, stops)')
    expect(guarded.indexOf('try {')).toBeLessThan(guarded.indexOf('stopsToGrid'))
    expect(guarded).toMatch(/\} catch \{\s+return null/)
  })

  it('연출이 끝나면 화면을 엔진의 최종 그리드로 확정한다', () => {
    expect(renderer()).toContain('this.applyGridOverride(plan.finalGrid)')
  })

  it('변형이 앉힌 심볼이 스트립보다 우선한다', () => {
    // 이 한 줄이 빠지면 다시 그릴 때마다 물음표가 되돌아온다.
    expect(renderer()).toContain('const overridden = this.gridOverride?.[row]?.[reel]')
  })

  it('스핀을 시작할 때 지난 변형을 걷어낸다', () => {
    expect(renderer()).toContain('this.clearGridOverride()')
  })

  it('스킵은 남은 변형 단계를 열지 않는다', () => {
    expect(renderer()).toContain('if (this.skipRequestedToken === token) break')
  })

  it('스킵은 재생 중인 단계를 곧장 끝낸다', () => {
    expect(renderer()).toContain('this.activeMutation?.finish()')
  })

  it('start 하나에 end 하나가 따른다', () => {
    const source = renderer()
    expect(source).toContain("this.emitMutation(step, 'start')")
    expect(source).toContain("this.emitMutation(step, 'end')")
  })

  it('이벤트에 바뀐 심볼을 함께 올린다', () => {
    // 허브 배너가 mutation 안으로 한 단계 더 들어가지 않게 하는 자리다.
    expect(renderer()).toContain('const symbol = step.mutation.symbol')
  })

  it('A단계는 겹친 좌표를 하나로 줄인 뒤 연출을 건다', () => {
    // ways는 여러 심볼이 같은 칸을 겹쳐 짚는다. 그대로 두면 한 칸에 연출이 겹겹이 쌓인다.
    expect(renderer()).toContain('dedupePositions(step.wins.flatMap((win) => win.positions))')
  })

  it('파티클은 풀에서 꺼내 쓴다', () => {
    expect(renderer()).toContain('new MutationSpritePool(this.mutationLayer)')
    const fx = readFileSync(join(srcDir, 'pixi', 'mutationFx.ts'), 'utf8')
    expect(fx).toContain('pool.release(sprite)')
    // 풀이 스프라이트를 파괴하면 다음 차례에 꺼낼 것이 없다.
    expect(stripComments(fx)).not.toContain('sprite.destroy()')
  })

  it('스킵은 자기 스핀만 접는다', () => {
    // 지난 스핀의 손잡이가 다음 스핀의 변형을 접으면 화면이 결과보다 먼저 확정된다.
    const source = renderer()
    expect(source).toContain('skip: () => this.skipSpin(token)')
    expect(source).toContain('if (this.destroyed || token !== this.spinToken) return')
  })

  it('시트도 그 시점의 셀 심볼로 찾는다', () => {
    // 변형으로 심볼이 바뀐 칸은 바뀐 뒤의 시트를 써야 한다.
    expect(renderer()).toContain('this.options.theme.sheets?.[cell.symbol]')
  })
})

describe('ways 배선', () => {
  const renderer = (): string => readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')

  it('페이라인이 없어도 승리 광채를 그린다', () => {
    // ways 게임의 line은 -1이라 paylines[-1]은 언제나 undefined다.
    const source = stripComments(renderer())
    expect(source).not.toContain('if (payline === undefined) return')
  })

  it('명판 좌표는 빛이 닿은 자리에서 온다', () => {
    expect(renderer()).toContain('arrival: GridPosition')
  })

  it('빛의 방향이 지급 방향을 따른다', () => {
    expect(renderer()).toContain('waysDirectionOf(win)')
  })
})

describe('변형 단계는 반드시 닫힌다', () => {
  const renderer = (): string => readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')

  it('연출이 없는 단계도 계획이 말한 길이만큼은 머문다', () => {
    // 0ms에 닫으면 buildMutationPlan이 약속한 길이와 화면이 갈린다. 길이의 SSOT은 계획이다.
    const source = renderer()
    expect(source).toContain('hold = setTimeout(finish, step.durationMs)')
    expect(source).toContain('if (this.options.reducedMotion || targets.length === 0) {')
  })

  it('머무는 타이머는 clearWins가 걷어 가지 않는다', () => {
    // this.timers에 넣으면 clearWins가 지워 버리고 단계가 영영 안 닫힌다.
    const source = renderer()
    expect(source).not.toContain('hold = this.wait(')
    expect(source).toContain('if (hold !== null) clearTimeout(hold)')
  })

  it('start를 낸 단계는 끼어들기가 있어도 end를 낸다', () => {
    const source = renderer()
    const start = source.indexOf("this.emitMutation(step, 'start')")
    const end = source.indexOf("this.emitMutation(step, 'end')", start)
    const guard = source.indexOf('if (this.destroyed || token !== this.spinToken) return', end)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(guard).toBeGreaterThan(end)
  })
})
