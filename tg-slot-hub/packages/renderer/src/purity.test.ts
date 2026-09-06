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
    expect(renderer()).toContain(
      'const overridden = mutationOverlaySymbolAt(this.overlay, reel, stripIndex)',
    )
  })

  it('변형 층은 화면 행이 아니라 스트립 자리로 찾는다', () => {
    // 행으로 찾으면 릴이 돌 때 얹힌 심볼만 그 행에 붙박이고 원래 심볼이 아래에서 드러난다.
    const source = renderer()
    expect(source).toContain('const stripIndex = wrapIndex(base + row, strip.length)')
    expect(source).not.toContain('this.gridOverride')
  })

  it('스핀을 시작할 때 변형 층을 걷지 않는다', () => {
    // 걷어 버리면 릴이 움직이기도 전에 변형이 풀린 모습이 한 프레임 그대로 보인다.
    // 사용자가 "스핀을 누르면 다시 물음표가 된다"고 말한 자리가 정확히 여기다.
    const source = renderer()
    const start = source.indexOf('  private async runSpin(')
    const head = source.slice(start, start + 1200)
    expect(head).toContain('this.fadeGridOverride()')
    // 즉시 걷어 내는 문은 아예 없앴다. 남겨 두면 "고쳤는데 왜 그대로냐"는 오해를 부른다.
    expect(source).not.toContain('clearGridOverride')
  })

  it('변형 층은 흘러 나간 뒤에 릴 단위로 놓인다', () => {
    const source = renderer()
    // 다시 그릴 때마다 이 릴이 충분히 지나갔는지 본다.
    expect(source).toContain(
      'this.overlay = expireMutationOverlay(this.overlay, reel, view.position, this.overlayClearance)',
    )
    // 착지와 스킵은 흘러 나갈 구간이 없으므로 그 자리에서 놓는다.
    expect(source).toContain('this.overlay = releaseMutationOverlayReel(this.overlay, plan.reel)')
    expect(source).toContain('this.overlay = releaseMutationOverlayReel(this.overlay, reel)')
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

describe('전환 클립 배선', () => {
  const renderer = (): string => readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
  const video = (): string => readFileSync(join(srcDir, 'pixi', 'transitionVideo.ts'), 'utf8')

  it('재생 판단은 순수 모듈이 하고 pixi는 그 결과만 쓴다', () => {
    // jsdom에는 WebGL도 비디오 디코더도 없다(위 "브라우저 전용 코드 격리" 참고).
    // 켤지 말지·어디서부터 몇 배속인지는 전부 src 루트에서 계산해 테스트로 붙잡는다.
    expect(existsSync(join(srcDir, 'transitionVideo.ts'))).toBe(true)
    const source = renderer()
    expect(source).toContain('planTransitionVideo(plan, inputs)')
    expect(source).toContain('transitionClipUrl(this.options.theme, to)')
    expect(source).toContain('reducedMotion: this.options.reducedMotion')
  })

  it('클립은 전환이 시작되기 전에 미리 받아 둔다', () => {
    // 이 한 줄이 회귀의 핵심이다. 전환 시작 시점에 만들면 요소 생성~첫 프레임 230~280ms +
    // 탐색 90ms가 덮기 구간(normal 380ms)을 넘겨, 매번 접히고 단색 커튼만 보였다.
    const source = renderer()
    const ctorEnd = source.indexOf('private warmTransitionVideos()')
    expect(ctorEnd).toBeGreaterThan(-1)
    expect(source.indexOf('this.warmTransitionVideos()')).toBeLessThan(ctorEnd)
    expect(source).toContain('createTransitionVideo(url, {')
  })

  it('모션 축소에서는 미리 받지도 않는다', () => {
    const source = renderer()
    const at = source.indexOf('private warmTransitionVideos()')
    const body = source.slice(at, source.indexOf('// ------', at))
    expect(body).toContain('if (this.options.reducedMotion) return')
  })

  it('클립은 커튼보다 위에, 커튼은 그대로 깔린 채로 얹힌다', () => {
    // 클립이 늦게 뜨거나 실패해도 뒤가 비치면 안 되므로 커튼을 걷지 않는다.
    const source = renderer()
    expect(source).toContain('this.root.addChild(handle.sprite)')
    expect(stripComments(source)).not.toContain('this.curtain.alpha = 0.5')
  })

  it('재생은 커튼이 완전히 덮인 순간, applyModeSwap과 같은 자리에서 시작한다', () => {
    const source = renderer()
    const swapAt = source.indexOf('this.applyModeSwap(to)')
    const startAt = source.indexOf('this.startTransitionVideo(plan, to)')
    expect(swapAt).toBeGreaterThan(-1)
    // 같은 `.call` 안에서, 배경 교체 바로 뒤에 붙어야 한다.
    expect(startAt).toBeGreaterThan(swapAt)
    expect(startAt - swapAt).toBeLessThan(60)
    // 그 자리는 여전히 swapAtMs다 — 전환 길이를 늘리지 않는다.
    expect(source).toContain('plan.swapAtMs / 1000')
  })

  it('클립은 커튼과 같은 알파로 걷힌다', () => {
    // 따로 두면 불투명한 클립이 남아 새 모드를 가린다.
    expect(renderer()).toContain('video.sprite.alpha = this.curtain.alpha')
  })

  it('첫 프레임이 늦으면 차폐 구간 안에서 기다렸다 시작한다', () => {
    const source = renderer()
    const startAt = source.indexOf('private startTransitionVideo(')
    const endAt = source.indexOf('private releaseTransitionVideo()', startAt)
    const body = source.slice(startAt, endAt)
    expect(body).toContain('video.whenReady(')
    // 늦게 시작하면 남은 차폐 구간으로 계획을 다시 세운다 — 정점이 가려진 동안 와야 한다.
    expect(body).toContain('bannerMs: plan.coverOutStartMs - elapsedMs')
    expect(body).toContain('if (late === null)')
  })

  it('전환이 끝나면 클립을 화면에서 걷는다 (요소는 살려 둔다)', () => {
    const source = renderer()
    const finishAt = source.indexOf('private finishModeTransition()')
    const drawAt = source.indexOf('private drawMode()', finishAt)
    const body = source.slice(finishAt, drawAt)
    expect(body).toContain('this.releaseTransitionVideo()')
    // 여기서 dispose하면 다음 전환이 다시 콜드 스타트가 되어 같은 회귀가 되살아난다.
    expect(body).not.toContain('this.disposeTransitionVideos()')
  })

  it('기다리던 클립은 전환이 끝날 때 대기를 취소한다', () => {
    // 취소하지 않으면 커튼이 걷힌 뒤에 클립이 뒤늦게 떠서 새 모드를 덮는다.
    const source = renderer()
    expect(source).toContain('this.cancelTransitionVideoWait?.()')
  })

  it('해제할 때는 미리 받아 둔 것까지 전부 반납한다', () => {
    const source = renderer()
    const destroyAt = source.indexOf('  destroy(): void {')
    expect(destroyAt).toBeGreaterThan(-1)
    expect(source.slice(destroyAt)).toContain('this.disposeTransitionVideos()')
    const disposeAll = source.slice(source.indexOf('private disposeTransitionVideos()'))
    expect(disposeAll).toContain('handle.dispose()')
    expect(disposeAll).toContain('this.transitionVideos.clear()')
  })

  it('리사이즈하면 받아 둔 클립을 전부 다시 맞춘다', () => {
    expect(renderer()).toContain(
      'for (const handle of this.transitionVideos.values()) handle.fit(canvasWidth, canvasHeight)',
    )
  })

  it('클립은 자동재생이 허용되는 형태로 만든다', () => {
    const source = video()
    expect(source).toContain('video.muted = true')
    expect(source).toContain('video.playsInline = true')
    expect(source).toContain("video.preload = 'auto'")
    expect(source).toContain('video.loop = false')
  })

  it('로딩·자동재생 실패를 밖으로 내보내지 않는다', () => {
    // 여기서 던지거나 reject하면 전환 약속이 깨지고 커튼이 붙박인다.
    const source = video()
    expect(source).toContain('void source.load().catch(')
    expect(source).toContain('started.catch(')
    expect(source).toContain("video.addEventListener('error', onError)")
  })

  it('탐색 중에는 준비 안 됨으로 판정하지 않는다', () => {
    // currentTime을 바꾸면 readyState가 1로 떨어졌다 seeked에서 다시 오른다.
    // seeked를 안 들으면 그 골짜기에 걸려 매번 접힌다.
    expect(video()).toContain("video.addEventListener('seeked', onReadyEvent)")
  })

  it('클립을 통째로 받아 Blob으로 물린다', () => {
    // URL을 그대로 물리면 화면에 붙지 않은 <video>가 readyState 1에서 멈춰 서고(suspend),
    // seekable이 비어 있어 currentTime 지정이 조용히 무시된다 — 실측으로 확인한 증상이다.
    // 그러면 클립이 0초(도입부)부터 재생돼 정점이 차폐 구간 밖으로 밀린다.
    const source = video()
    expect(source).toContain('void fetch(url)')
    expect(source).toContain('URL.createObjectURL(blob)')
    expect(source).toContain('attach(objectUrl)')
    // 못 받으면 URL을 그대로 물려서라도 굴러가야 한다.
    expect(source).toContain('attach(url)')
    expect(source).toContain('URL.revokeObjectURL(objectUrl)')
  })

  it('탐색할 수 없는 동안에는 지점을 걸지 않는다', () => {
    const source = video()
    expect(source).toContain('video.seekable.length === 0')
  })

  it('지점이 맞아야 준비된 것으로 본다', () => {
    // 그림이 있다는 것만으로 틀면 클립의 엉뚱한 대목이 나온다.
    const source = video()
    expect(source).toContain('Math.abs(video.currentTime - plan.startAtSec) <= SEEK_TOLERANCE_SEC')
    expect(source).toContain('isReady(): boolean {')
    expect(source).toMatch(/isReady\(\): boolean \{\s+return cued\(\)/)
  })

  it('한 번의 실패가 세션 전체를 죽이지 않는다', () => {
    // 예전에는 sticky한 `failed` 플래그가 있어, 마운트 직후 자동재생이 한 번 막히면
    // 그 세션의 모든 전환에서 클립이 영영 죽었다. 판단은 요소의 지금 상태로만 한다.
    const source = stripComments(video())
    expect(source).not.toContain('failed = true')
    expect(source).toContain('video.error === null')
  })

  it('반납은 텍스처와 소스와 엘리먼트를 모두 놓는다', () => {
    const source = video()
    // 스프라이트는 텍스처를 건드리지 않고 걷는다 — 파괴는 레지스트리 한 문으로만 지난다.
    expect(source).toContain('sprite.destroy({ texture: false, textureSource: false })')
    expect(source).toContain('registry.release(texture)')
    expect(source).toContain("video.removeAttribute('src')")
    expect(source).toContain('video.load()')
  })

  it('클립 텍스처도 텍스처 레지스트리가 소유한다', () => {
    // 소유권 규칙("누가 아직 쓰는가")을 한 곳에 모으기 위해 등록·해제가 모두 레지스트리를 지난다.
    const source = video()
    expect(source).toContain('registry?.own(texture)')
    // `retain`이 아니라 `own`이어야 한다. 캐시 텍스처가 되면 참조가 끊겨도 곧장 파괴되지 않고
    // LRU 상한을 넘길 때까지 GPU에 남는다 — 클립은 화면을 나가는 즉시 반납돼야 한다.
    expect(source).not.toContain('registry?.retain(')
    expect(source).not.toContain('registry.retain(')
    const renderSource = renderer()
    expect(renderSource).toContain('registry: this.ownedTextures')
    // 클립은 렌더러보다 먼저 반납되므로 destroyAll이 다시 파괴하려 들면 안 된다.
    const destroyAt = renderSource.indexOf('  destroy(): void {')
    const body = renderSource.slice(destroyAt)
    expect(body.indexOf('this.disposeTransitionVideos()')).toBeLessThan(
      body.indexOf('this.ownedTextures.destroyAll()'),
    )
  })

  it('레지스트리가 없어도 텍스처를 흘리지 않는다', () => {
    expect(video()).toContain('if (registry === undefined || !registry.release(texture))')
  })

  it('진단은 순수 로거가 정하고 pixi는 콘솔만 맡는다', () => {
    // 무엇을 남길지(억제 규칙)는 src 루트의 순수 모듈에 있어 테스트로 붙잡을 수 있다.
    const source = video()
    expect(source).toContain('createTransitionVideoLogger')
    expect(source).toContain('devTransitionVideoSink')
    expect(readFileSync(join(srcDir, 'transitionVideo.ts'), 'utf8')).toContain(
      'export function createTransitionVideoLogger(sink: TransitionVideoSink)',
    )
  })

  it('예상된 폴백은 방향+사유별로 한 번만, 실제 실패는 매번 남긴다', () => {
    const renderSource = renderer()
    expect(renderSource).toContain("this.clipLog.once(`skip:${to}:${reason ?? 'unknown'}`")
    const videoSource = video()
    // 실패 경로는 전부 always다 — 반복 자체가 신호다.
    expect(videoSource).toContain("log.always('클립 로딩 실패 (네트워크/코덱)'")
    expect(videoSource).toContain("log.always('자동재생이 막혔다'")
    expect(videoSource).not.toContain("log.once('자동재생")
  })

  it('개발 플래그는 import.meta.env를 그대로 적는다', () => {
    // 별칭으로 받으면(`const meta = import.meta`) Vite가 env 객체를 주입하지 않아
    // 언제나 undefined가 된다 — 실제로 그 탓에 진단이 한 줄도 나오지 않았다.
    const source = video()
    expect(source).toContain('= import.meta.env')
    expect(stripComments(source)).not.toContain('const meta = import.meta')
  })
})

describe('풀링 — 순환 연출이 매번 새로 만들지 않는다', () => {
  const read = (...parts: string[]): string => readFileSync(join(srcDir, ...parts), 'utf8')
  const renderer = (): string => read('pixi', 'pixiRenderer.ts')

  it('풀과 진단은 순수 모듈이다', () => {
    // src 루트에 있으므로 pixi/gsap 금지 규칙이 자동으로 걸린다. 여기서는 존재만 붙잡는다.
    expect(existsSync(join(srcDir, 'pool.ts'))).toBe(true)
    expect(existsSync(join(srcDir, 'diagnostics.ts'))).toBe(true)
    expect(read('pool.ts')).toContain('export class ObjectPool<T>')
  })

  it('시트 스프라이트는 풀을 거쳐서만 만들어진다', () => {
    const source = stripComments(read('pixi', 'sheetFx.ts'))
    // 하나는 풀의 create, 하나는 풀이 없을 때의 널 오브젝트. 재생 경로에는 없다.
    expect(source.match(/new AnimatedSprite\(/g) ?? []).toHaveLength(2)
    expect(source).toContain('const animated = sprites.acquire(frames)')
    expect(source).toContain('sprites.release(frames, animated)')
  })

  it('시트 손잡이는 두 번 멈춰도 한 번만 반납한다', () => {
    // 손잡이가 셀별 목록과 전체 목록 두 곳에 걸려 있어 stop()이 두 번 불린다.
    // 막지 않으면 두 번째 반납이 이미 다른 칸이 쓰고 있는 스프라이트를 회수한다.
    const source = stripComments(read('pixi', 'sheetFx.ts'))
    expect(source).toContain('let stopped = false')
    expect(stripComments(read('pixi', 'mutationFx.ts'))).toContain('let stopped = false')
  })

  it('승리 파티클은 스프라이트를 직접 만들지도 파괴하지도 않는다', () => {
    const source = stripComments(read('pixi', 'coins.ts'))
    expect(source).not.toContain('new Sprite(')
    expect(source).not.toContain('.destroy()')
    // 코인·색종이·스캐터 세 연출이 모두 같은 풀에서 꺼낸다.
    expect(source.match(/pool\.acquire\(/g) ?? []).toHaveLength(3)
    expect(source.match(/pool\.release\(sprites\)/g) ?? []).toHaveLength(3)
  })

  it('파티클 층을 통째로 비우지 않는다', () => {
    // removeChildren()은 같은 층에서 돌고 있던 다른 연출의 스프라이트까지 걷어낸다.
    expect(stripComments(read('pixi', 'coins.ts'))).not.toContain('removeChildren()')
  })

  it('렌더러가 재생에 풀을 넘긴다', () => {
    const source = renderer()
    expect(source).toContain('playSheetFx(target, ready, this.sheetSprites)')
    expect(source).toContain('playSheetFx(target, loaded, this.sheetSprites)')
    expect(source).toContain('new ParticlePool(this.fxLayer)')
  })

  it('시트는 화면당 한 번만 붙잡는다', () => {
    const source = renderer()
    expect(source).toContain('if (this.retainedSheets.has(url)) return peekSheet(url)')
    expect(source).toContain('if (loaded !== null) this.retainedSheets.add(url)')
  })

  it('해제할 때 붙잡은 시트를 놓고 보관분을 버린다', () => {
    const source = renderer()
    const start = source.indexOf('  destroy(): void {')
    const body = source.slice(start, source.indexOf('\n  }', start))
    expect(body).toContain('this.mutationPool.clear()')
    expect(body).toContain('this.particlePool.clear()')
    expect(body).toContain('this.sheetSprites.clear()')
    expect(body).toContain('for (const url of this.retainedSheets) releaseSheet(url)')
  })

  it('진단은 데이터만 돌려준다', () => {
    const source = renderer()
    const start = source.indexOf('  diagnostics(): RendererDiagnostics {')
    expect(start).toBeGreaterThan(0)
    const body = source.slice(start, source.indexOf('\n  }', start))
    // 세는 곳이 곧 소유한 곳이다. 여기서 만들거나 고치는 것은 없다.
    expect(body).not.toContain('new ')
    expect(body).toContain('this.mutationPool.stats')
    expect(body).toContain('this.particlePool.budgetSnapshot')
    expect(body).toContain('sheetTextureSnapshot()')
  })

  it('초기화 전 진단은 null이 아니라 빈 값이다', () => {
    expect(read('createRenderer.ts')).toContain(
      'diagnostics: () => core?.diagnostics() ?? emptyDiagnostics()',
    )
  })
})

describe('심볼 연출 덧그림 풀링', () => {
  const read = (...parts: string[]): string => readFileSync(join(srcDir, ...parts), 'utf8')
  const symbolFx = (): string => stripComments(read('pixi', 'symbolFx.ts'))

  it('덧그림은 풀의 create 훅에서만 만들어진다', () => {
    const source = symbolFx()
    // 남은 두 곳은 마스크 두 종류(심볼 모양 스프라이트, 사각형 그래픽)의 create 훅뿐이다.
    // 띠 스프라이트는 OverlayPairPool 안에서 만들어져 여기 이름이 나오지 않는다.
    expect(source.match(/new Sprite\(/g) ?? []).toHaveLength(1)
    expect(source.match(/new Graphics\(/g) ?? []).toHaveLength(1)
    expect(source).toContain('createMask: () => new Sprite()')
    expect(source).toContain('createMask: () => new Graphics()')
  })

  it('연출은 덧그림을 직접 파괴하지 않는다', () => {
    // 파괴는 풀 한 문으로만 지난다 — 상한을 넘겼을 때만 일어나는 일이다.
    expect(symbolFx()).not.toContain('.destroy()')
  })

  it('띠와 마스크는 쌍으로 빌리고 쌍으로 돌려준다', () => {
    const source = symbolFx()
    expect(source).toContain('const pair = pool.acquireShine(textures.shine)')
    expect(source).toContain('pool.releaseShine(pair)')
    expect(source).toContain('const pair = pool.acquireBand(target.sprite.texture)')
    expect(source).toContain('pool.releaseBand(pair)')
    // 쌍을 갈라 반납하는 문이 없어야 한다. 마스크만 따로 놓는 순간 불변식이 깨진다.
    expect(source).not.toContain('releaseSprite(mask)')
    expect(source).not.toContain('releaseSprite(band)')
  })

  it('마스크 연결은 풀이 끊는다', () => {
    // 반납 순서가 뒤집히면 pixi가 죽은 마스크를 붙든 채로 다음 쌍을 그린다.
    const pool = stripComments(read('pixi', 'spritePool.ts'))
    const resetAt = pool.indexOf('reset: (pair) => {')
    expect(resetAt).toBeGreaterThan(0)
    expect(pool.slice(resetAt, resetAt + 120)).toContain('pair.band.mask = null')
    // 마스크를 비우는 방법은 종류마다 다르다. 스프라이트는 텍스처를 놓고, 그래픽은 그림을 지운다.
    expect(pool).toContain('mask.texture = Texture.EMPTY')
    expect(symbolFx()).toContain('resetMask: (mask) => mask.clear()')
  })

  it('덧그림 손잡이는 두 번 멈춰도 한 번만 반납한다', () => {
    const source = symbolFx()
    // 네 연출(분할 flash·광채·빛줄기·파티클)과 묶음 손잡이까지 다섯 곳.
    expect(source.match(/return onceStopped\(/g) ?? []).toHaveLength(5)
    expect(source).toContain('function onceStopped(stop: () => void): SymbolFxHandle {')
  })

  it('풀이 없는 자리는 상한 0짜리 풀이 대신한다', () => {
    // 널 오브젝트를 따로 두지 않는다 — 상한 0이면 보관하지 않고 곧장 버리므로
    // 풀을 끼우기 전의 동작과 결과가 같다.
    expect(symbolFx()).toContain('export const UNPOOLED_SYMBOL_FX = new SymbolFxPool(0, 0)')
  })

  it('렌더러가 절차적 연출에 풀을 넘기고 해제할 때 비운다', () => {
    const source = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(source).toContain(
      'playSymbolFxSet(target, plan.procedural, this.fxTextures, this.symbolFxPool)',
    )
    const start = source.indexOf('  destroy(): void {')
    expect(source.slice(start, source.indexOf('\n  }', start))).toContain('this.symbolFxPool.clear()')
  })
})

describe('릴 뒤 배경 패널 배선', () => {
  const read = (...parts: string[]): string => readFileSync(join(srcDir, ...parts), 'utf8')
  const renderer = (): string => read('pixi', 'pixiRenderer.ts')

  it('패널은 콘텐츠 층의 맨 앞에 온다', () => {
    // 배경 위, 심볼 아래. 릴보다 먼저 그려져야 심볼이 그 위에 뜬다.
    const source = renderer()
    const addAt = source.indexOf('this.contentLayer.addChild(')
    const body = source.slice(addAt, source.indexOf(')', addAt))
    expect(body.indexOf('this.backdropGraphics')).toBeGreaterThan(0)
    expect(body.indexOf('this.backdropGraphics')).toBeLessThan(body.indexOf('this.reelsLayer'))
  })

  it('레이아웃이 바뀔 때만 다시 그린다', () => {
    // 매 프레임 그리면 스크림 한 장 때문에 그리기 비용이 배로 든다.
    const source = renderer()
    const layoutAt = source.indexOf('  private applyLayout(): void {')
    expect(source.slice(layoutAt, source.indexOf('\n  }', layoutAt))).toContain('this.drawBackdrop()')
    // 릴을 다시 그리는 경로에는 없어야 한다.
    const reelAt = source.indexOf('  private renderReel(reel: number): void {')
    expect(source.slice(reelAt, source.indexOf('\n  }', reelAt))).not.toContain('drawBackdrop')
  })

  it('패널은 릴이 보이는 영역과 같은 사각형을 쓴다', () => {
    // 마스크(reelArea)와 다른 값을 쓰면 창 밖으로 비어져 나온다.
    const source = renderer()
    const drawAt = source.indexOf('  private drawBackdrop(): void {')
    const body = source.slice(drawAt, source.indexOf('\n  }', drawAt))
    expect(body).toContain('this.layout.reelArea')
    expect(body).toContain('this.options.theme.reelBackdrop')
    expect(body).toContain('this.layout.symbolSize')
  })

  it('그리지 않기로 한 계획은 층까지 숨긴다', () => {
    const source = renderer()
    const drawAt = source.indexOf('  private drawBackdrop(): void {')
    const body = source.slice(drawAt, source.indexOf('\n  }', drawAt))
    expect(body).toContain("this.backdropGraphics.visible = plan.kind === 'panel'")
    expect(body).toContain("if (plan.kind !== 'panel') return")
  })

  it('배경이 프리스핀 것으로 갈려도 패널은 건드리지 않는다', () => {
    // 패널은 배경 층이 아니라 콘텐츠 층에 산다. 모드 전환 경로가 이 이름을 알 이유가 없다.
    const source = renderer()
    const modeAt = source.indexOf('  private applyModeBackground(')
    const body = modeAt < 0 ? '' : source.slice(modeAt, source.indexOf('\n  }', modeAt))
    expect(body).not.toContain('backdrop')
    expect(source.slice(source.indexOf('  setMode('), source.indexOf('  resize()'))).not.toContain(
      'backdrop',
    )
  })

  it('스키마는 game-sdk가 갖고 렌더러는 재수출만 한다', () => {
    expect(read('theme.ts')).toContain('ReelBackdropSchema')
    // 렌더러 안에 zod 스키마를 다시 정의하지 않는다.
    expect(read('theme.ts')).not.toContain('z.object')
  })
})

describe('시트 스프라이트 상한은 격자에서 나온다', () => {
  const read = (...parts: string[]): string => readFileSync(join(srcDir, ...parts), 'utf8')

  it('상한을 상수로 못박지 않는다', () => {
    // 매직넘버 12/20은 특정 격자의 우연한 산물이라 다음 팩에서 또 틀린다.
    const source = read('pixi', 'sheetFx.ts')
    expect(source).not.toContain('SHEET_SPRITE_POOL_MAX_PER_KEY')
    expect(read('constants.ts')).not.toContain('SHEET_SPRITE_POOL_MAX_PER_KEY')
  })

  it('렌더러가 reels x rows를 넘긴다', () => {
    // 한 심볼이 동시에 점등될 수 있는 최대가 정의상 격자 칸 수다.
    expect(read('pixi', 'pixiRenderer.ts')).toContain(
      'new SheetSpritePool(options.math.reels * options.math.rows)',
    )
  })

  it('풀은 상한을 주입받는다', () => {
    expect(read('pixi', 'sheetFx.ts')).toContain('constructor(maxRetainedPerKey: number)')
  })
})
