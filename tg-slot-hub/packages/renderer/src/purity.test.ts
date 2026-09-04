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

  it('showWins가 피처 옵션과 속도를 계획으로 넘긴다', () => {
    expect(renderer()).toContain(
      'presentationOptionsFor(opts, this.options.reducedMotion, this.spinSpeed)',
    )
  })

  it('라인 승리가 없다고 곧장 돌아서지 않는다', () => {
    // 스캐터나 프리스핀만 있는 스핀도 보여줄 것이 있다.
    expect(renderer()).not.toContain('this.destroyed || wins.length === 0')
  })

  it('같은 셀을 다시 터뜨리기 전에 앞의 연출을 끈다', () => {
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

  it('스킵은 남은 거리를 훑지 않고 정지 위치로 스냅한다', () => {
    // 남은 거리를 시간에 몰아 지나가면 스트립이 긴 게임에서 "다시 돌다 멈춘다"로 보인다.
    const source = renderer()
    expect(source).toContain('const stopPosition = normalizePosition(active.stop, active.stripLength)')
    expect(source).toContain('p: stopPosition + SKIP_SETTLE_SYMBOLS')
    // 스킵 경로에는 회전 목표를 계산하는 자리가 남아 있으면 안 된다.
    const skipAt = source.indexOf('private skipSpin(token: number)')
    const skipEnd = source.indexOf('private async runSpin(', skipAt)
    expect(source.slice(skipAt, skipEnd)).not.toContain('spinTargetPosition')
  })

  it('스킵 착지는 감속만 한다', () => {
    const source = renderer()
    const skipAt = source.indexOf('private skipSpin(token: number)')
    const skipEnd = source.indexOf('private async runSpin(', skipAt)
    const body = source.slice(skipAt, skipEnd)
    expect(body).toContain("ease: 'power2.out'")
    expect(body).not.toContain("power2.in'")
  })

  it('A단계와 B단계가 같은 테두리를 쓴다', () => {
    // A단계에만 테두리가 빠져 전체 연출에서 광채가 사라져 보였다.
    const source = renderer()
    expect(source).toContain('private drawWinGlow(')
    expect(source).toContain('this.drawWinGlow(positions)')
    expect(source).toContain('this.drawWinGlow(win.positions)')
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

  it('ways 승리의 방향은 이벤트에 실려 허브로 간다', () => {
    // 릴 위에는 방향을 말해 줄 빛이 없다. 어느 쪽으로 읽었는지는 허브가 문구로 보여준다.
    const presentation = readFileSync(join(srcDir, 'presentation.ts'), 'utf8')
    expect(presentation).toContain('event.direction = win.direction')
  })
})

describe('승리 연출은 움직이는 빛을 쓰지 않는다', () => {
  const rootAndPixi = (): string[] => [...listTsFiles(srcDir), ...listTsFiles(join(srcDir, 'pixi'))]

  it('훑고 지나가는 빛 모듈이 남아 있지 않다', () => {
    expect(existsSync(join(srcDir, 'pulse.ts'))).toBe(false)
    expect(existsSync(join(srcDir, 'pixi', 'winPulse.ts'))).toBe(false)
  })

  it('아무도 빛 경로를 만들지 않는다', () => {
    const offenders: string[] = []
    for (const file of rootAndPixi()) {
      // 이 검사 자체가 그 이름을 들고 있다. 테스트 파일은 건너뛴다.
      if (file.endsWith('.test.ts')) continue
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const marker of ['buildPulsePath', 'playWinPulse', 'pulseArrive']) {
        if (source.includes(marker)) offenders.push(`${file} -> ${marker}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('이벤트 유니온에 pulseArrive가 없다', () => {
    expect(readFileSync(join(srcDir, 'types.ts'), 'utf8')).not.toContain('pulseArrive')
  })

  it('릴 위에 라인 문구를 찍지 않는다', () => {
    // 문구는 허브가 winLine 이벤트를 받아 릴 밖 스트립에 그린다.
    const source = stripComments(readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8'))
    expect(source).not.toContain('winLabel')
    expect(source).not.toContain('formatLineLabel')
  })

  it('릴 위에 프리스핀 남은 횟수/배수 명판을 찍지 않는다', () => {
    // 카운터 텍스트는 허브가 store의 freeSpins 상태로 릴 밖 스트립에 그린다.
    // Text(pixi.js)를 새로 만드는 자리가 남아 있으면 안 된다 — 심볼과 겹쳐 가독성을 해쳤다.
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(source).not.toContain('new Text(')
    expect(source).not.toContain('modeLabel')
    expect(source).not.toContain('formatFreeSpinsPlaque')
  })

  it('다른 프리스핀 연출(배경 전환·테두리)은 그대로 남는다', () => {
    // 텍스트만 없앴을 뿐, 배경 스와이프/전환/테두리 로직은 건드리지 않는다.
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(source).toContain('this.freeSpinsSprite')
    expect(source).toContain('playModeTransition')
    expect(source).toContain('FREE_SPINS_EDGE_STROKE_PX')
    expect(source).toContain(
      '.roundRect(reelArea.x, reelArea.y, reelArea.width, reelArea.height, radius * 0.5)',
    )
  })
})

describe('모드 전환은 화면 전체를 완전히 가리는 커튼이다', () => {
  const renderer = (): string => readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')

  it('반투명 와이프/섬광은 남아 있지 않다 — 완전 차폐 커튼으로 대체됐다', () => {
    const source = renderer()
    expect(source).not.toContain('flashSprite')
    expect(source).not.toContain('wipeMask')
    expect(source).not.toContain('drawWipe')
    expect(source).not.toContain('wipeRadius')
  })

  it('커튼은 프레임·베젤까지 덮도록 root의 맨 위(마지막 자식)에 얹힌다', () => {
    const source = renderer()
    const addCurtain = source.indexOf('this.root.addChild(this.curtain)')
    const addFrameOrSparkle = source.lastIndexOf('this.root.addChild(this.frameSprite')
    expect(addCurtain).toBeGreaterThan(-1)
    expect(addCurtain).toBeGreaterThan(addFrameOrSparkle)
  })

  it('배경/테두리 교체는 커튼이 완전히 덮인 뒤(swapAtMs)에 한 번에 일어난다', () => {
    const source = renderer()
    const playAt = source.indexOf('private playModeTransition(')
    const applyAt = source.indexOf('private applyModeSwap(')
    const body = source.slice(playAt, applyAt)
    expect(body).toContain('this.applyModeSwap(to)')
    expect(body).toContain('plan.swapAtMs / 1000')
    // 배경 교체 호출이 덮기(alpha: 1) 다음, 걷기(alpha: 0) 앞에 와야 커튼에 완전히 가려진다.
    const callAt = body.indexOf('this.applyModeSwap(to)')
    const coverInAt = body.indexOf("{ alpha: 1,")
    const coverOutAt = body.indexOf('{ alpha: 0,')
    expect(coverInAt).toBeGreaterThan(-1)
    expect(coverOutAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(coverInAt)
    expect(callAt).toBeLessThan(coverOutAt)
  })

  it('전환 속도는 지금 걸린 스핀 속도를 그대로 따른다', () => {
    expect(renderer()).toContain('speed: this.spinSpeed')
  })

  it('modeTransition 이벤트는 start 하나에 end 하나, end는 걷기까지 끝난 뒤에만 나간다', () => {
    const source = renderer()
    const startAt = source.indexOf("this.emit({ type: 'modeTransition', to, phase: 'start' })")
    const endAt = source.indexOf("this.emit({ type: 'modeTransition', to, phase: 'end' })")
    expect(startAt).toBeGreaterThan(-1)
    expect(endAt).toBeGreaterThan(-1)
    // end는 finishModeTransition 안, curtain을 완전히 숨긴 뒤에 나간다.
    const finishAt = source.indexOf('private finishModeTransition()')
    const hideCurtainAt = source.indexOf('this.curtain.visible = false', finishAt)
    expect(hideCurtainAt).toBeGreaterThan(finishAt)
    expect(endAt).toBeGreaterThan(hideCurtainAt)
  })
})

describe('승리 연출 순환·스킵', () => {
  it('라인 스텝은 그 자리에서 심볼 연출만 터뜨린다', () => {
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(source).toContain('this.playFxAt(win.positions)')
    expect(source).toContain('this.emit(winLineEvent(win, context))')
  })

  it('순환은 clearWins·다음 스핀·모드 전환이 끊는다', () => {
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    // 취소 판정은 winToken 하나로만 한다. clearWins가 그 토큰을 올린다.
    expect(source).toContain('cancelled: () => token !== this.winToken || this.destroyed')
    expect(source).toContain('this.winToken += 1')
    // 전환은 mode를 갈아 끼우기 전에 순환을 끊는다.
    const setModeAt = source.indexOf('setMode(mode: RendererMode)')
    const clearAt = source.indexOf('this.clearWins()', setModeAt)
    const assignAt = source.indexOf('this.mode = mode', setModeAt)
    expect(setModeAt).toBeGreaterThan(-1)
    expect(clearAt).toBeGreaterThan(-1)
    expect(clearAt).toBeLessThan(assignAt)
  })

  it('스킵은 순환을 멈추지 않는다', () => {
    // skipWins는 손잡이만 부른다. winToken을 올리면 순환까지 끊겨 화면이 승리 없이 남는다.
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(source).toContain('skipWins(): void {')
    expect(source).toContain('this.winSkip?.()')
    // skipWins가 취소 토큰을 건드리면 순환이 통째로 죽는다. 그 자리는 clearWins 하나뿐이다.
    const skipAt = source.indexOf('skipWins(): void {')
    expect(source.slice(skipAt, skipAt + 200)).not.toContain('this.winToken')
    // 연출이 끝나면 손잡이를 놓는다. 지난 스핀의 손잡이가 남으면 엉뚱한 바퀴를 접는다.
    expect(source).toContain('this.winSkip = null')
  })

  it('타이머를 걷어 갈 때 기다리던 쪽을 깨운다', () => {
    // 깨우지 않으면 순환 한 바퀴가 매달린 약속에 붙잡혀 그대로 남는다.
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(source).toContain('clearTimeout(id)')
    expect(source).toContain('resolve()')
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
