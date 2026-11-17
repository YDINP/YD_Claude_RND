import './styles.css'
import { Sfx } from './audio/sfx'
import { areAdjacent } from './core/board'
import { W } from './core/constants'
import { Game } from './core/game'
import { levelAt, LEVELS } from './core/levels'
import { bindPointer } from './input/pointer'
import { Hud } from './ui/hud'
import { Director, type PreviewMark } from './view/director'
import { computeLayout, type Layout } from './view/layout'
import { Renderer } from './view/renderer'

const RESULT_DELAY_MS = 900
const MAX_DT_MS = 50
const LEVEL_KEY = 'inkbloom.level'

function loadLevel(): number {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY))
    return Number.isInteger(n) && n >= 0 && n < LEVELS.length ? n : 0
  } catch {
    return 0
  }
}

function saveLevel(n: number): void {
  try {
    localStorage.setItem(LEVEL_KEY, String(n))
  } catch {
    return
  }
}

function previewMarks(game: Game, from: number, to: number): PreviewMark[] {
  const stains = game.previewSwap(from, to) ?? []
  return stains.filter((s) => s.from !== s.to).map((s) => ({ cell: s.cell, to: s.to }))
}

function unionMarks(game: Game, from: number): PreviewMark[] {
  const seen = new Map<number, number>()
  for (const d of [-W, -1, 1, W]) {
    const to = from + d
    if (!areAdjacent(from, to)) continue
    for (const m of previewMarks(game, from, to)) if (!seen.has(m.cell)) seen.set(m.cell, m.to)
  }
  return [...seen].map(([cell, to]) => ({ cell, to }))
}

interface RoundEnv { canvas: HTMLCanvasElement; stage: HTMLElement; hud: Hud; sfx: Sfx }

function createRound(env: RoundEnv, seed: number, level: number, onResult: (win: boolean) => void): () => void {
  const { canvas, stage, hud, sfx } = env
  const ac = new AbortController()
  const { signal } = ac
  const game = new Game(seed, level)
  hud.setLevel(game.level)
  const director = new Director(game, {
    moves: (n) => hud.setMoves(n),
    score: (n) => hud.setScore(n),
    order: (p) => hud.setOrder(p),
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
      director.preview = c >= 0 ? unionMarks(game, c) : []
      return true
    },
    aim: (from, to) => {
      if (director.state !== 'idle' || director.selected !== from) return
      director.preview = to >= 0 ? previewMarks(game, from, to) : unionMarks(game, from)
    },
    swap: (a, b) => {
      if (director.state !== 'idle') return
      director.preview = []
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
        const win = director.state === 'win'
        onResult(win)
        hud.showResult(win, game.score, game.progress(), game.level, game.level === LEVELS.length - 1)
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
  const env: RoundEnv = {
    canvas: document.getElementById('board') as HTMLCanvasElement,
    stage: document.getElementById('stage') as HTMLElement,
    hud: new Hud(),
    sfx: new Sfx(),
  }
  const params = new URLSearchParams(location.search)
  const fixed = params.get('seed')
  const newSeed = (): number => (fixed ? Number(fixed) : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)
  let level = params.has('level') ? Math.max(0, Math.min(LEVELS.length - 1, Number(params.get('level')) - 1 || 0)) : loadLevel()
  const onResult = (win: boolean): void => {
    if (win) saveLevel((level + 1) % LEVELS.length)
  }
  let dispose = createRound(env, newSeed(), level, onResult)
  const restart = (): void => {
    dispose()
    env.hud.hideOverlay()
    dispose = createRound(env, newSeed(), level, onResult)
  }
  const app = new AbortController()
  env.hud.showIntro(level, levelAt(level), () => env.sfx.unlock(), app.signal)
  env.hud.onRestart(restart, app.signal)
  env.hud.onNext(() => {
    level = (level + 1) % LEVELS.length
    restart()
  }, app.signal)
  env.hud.onMute(() => env.sfx.toggleMute(), app.signal)
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return
    dispose()
    app.abort()
  }, { signal: app.signal })
}

main()
