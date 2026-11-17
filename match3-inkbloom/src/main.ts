import './styles.css'
import { Sfx } from './audio/sfx'
import { Game } from './core/game'
import { bindPointer } from './input/pointer'
import { Hud } from './ui/hud'
import { Director } from './view/director'
import { computeLayout, type Layout } from './view/layout'
import { Renderer } from './view/renderer'

const RESULT_DELAY_MS = 900
const MAX_DT_MS = 50

function createRound(canvas: HTMLCanvasElement, stage: HTMLElement, hud: Hud, sfx: Sfx, seed: number): () => void {
  const ac = new AbortController()
  const { signal } = ac
  const game = new Game(seed)
  const director = new Director(game, {
    moves: (n) => hud.setMoves(n),
    score: (n) => hud.setScore(n),
    stained: (n) => hud.setStained(n),
    sfx: (name, arg) => sfx.play(name, arg),
  })
  const renderer = new Renderer(canvas, canvas.getContext('2d')!)
  const fit = (): Layout => {
    const l = computeLayout(stage.clientWidth, stage.clientHeight)
    renderer.resize(l)
    stage.parentElement?.style.setProperty('--sheet', `${Math.round(l.size + l.cell * 0.44)}px`)
    return l
  }
  let layout: Layout = fit()

  const ro = new ResizeObserver(() => {
    layout = fit()
  })
  ro.observe(stage)

  bindPointer(canvas, {
    layout: () => layout,
    gesture: () => sfx.unlock(),
    select: (c) => {
      if (director.state !== 'idle') return false
      director.selected = c
      return true
    },
    swap: (a, b) => {
      if (director.state !== 'idle') return
      director.play(game.trySwap(a, b))
    },
  }, signal)

  let raf = 0
  let last = 0
  let endTimer = 0
  let resultShown = false
  const frame = (now: number): void => {
    const dt = Math.max(0, Math.min(MAX_DT_MS, now - last))
    last = now
    director.update(dt, now / 1000)
    renderer.draw(director, now / 1000)
    if (!resultShown && (director.state === 'win' || director.state === 'lose')) {
      endTimer += dt
      if (endTimer >= RESULT_DELAY_MS) {
        resultShown = true
        hud.showResult(director.state === 'win', game.score, game.stainedCount())
      }
    }
    raf = requestAnimationFrame(frame)
  }
  const start = (): void => {
    cancelAnimationFrame(raf)
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf)
    else start()
  }, { signal })
  start()

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    director.dispose()
    ac.abort()
  }
}

function main(): void {
  const canvas = document.getElementById('board') as HTMLCanvasElement
  const stage = document.getElementById('stage') as HTMLElement
  const hud = new Hud()
  const sfx = new Sfx()
  const fixed = new URLSearchParams(location.search).get('seed')
  const newSeed = (): number => (fixed ? Number(fixed) : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)
  let dispose = createRound(canvas, stage, hud, sfx, newSeed())
  const app = new AbortController()
  hud.showIntro(() => sfx.unlock(), app.signal)
  hud.onRestart(() => {
    dispose()
    hud.hideOverlay()
    dispose = createRound(canvas, stage, hud, sfx, newSeed())
  }, app.signal)
  hud.onMute(() => sfx.toggleMute(), app.signal)
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return
    dispose()
    app.abort()
  }, { signal: app.signal })
}

main()
