import './styles.css'
import { encodeFloor, loadAlbum, mergeEntry, saveAlbum } from './core/album'
import { Sfx } from './audio/sfx'
import { areAdjacent } from './core/board'
import { STAR2_RATIO, STAR3_RATIO, W } from './core/constants'
import { Game } from './core/game'
import { findHint } from './core/hint'
import { firstMixLevel, LEVELS, needsMix } from './core/levels'
import { EMPTY } from './core/types'
import { bindPointer } from './input/pointer'
import { Hud } from './ui/hud'
import { Director, type PreviewMark } from './view/director'
import { computeLayout, type Layout } from './view/layout'
import { Renderer } from './view/renderer'

const RESULT_DELAY_MS = 900
const MAX_DT_MS = 50
const HINT_IDLE_MS = 5000
const LEVEL_KEY = 'inkbloom.level'
const MIX_GUIDE_KEY = 'inkbloom.mixGuide'

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
  const piece = game.previewMix(from, to)
  return piece === EMPTY ? [] : [{ cell: to, piece }]
}

function unionMarks(game: Game, from: number): PreviewMark[] {
  const marks: PreviewMark[] = []
  for (const d of [-W, -1, 1, W]) {
    const to = from + d
    if (areAdjacent(from, to)) marks.push(...previewMarks(game, from, to))
  }
  return marks
}

function starTexts(game: Game): { star2: string; star3: string } {
  const lv = game.lv
  const star2 = `남은 이동 ${Math.ceil(lv.moves * STAR2_RATIO)}번 이상`
  const star3 = needsMix(lv)
    ? `${star2} + 섞기 ${lv.mixes}번 이상 (이번 판 ${game.mixes}번)`
    : `남은 이동 ${Math.ceil(lv.moves * STAR3_RATIO)}번 이상`
  return { star2, star3 }
}

function mixGuideSeen(): boolean {
  try {
    return localStorage.getItem(MIX_GUIDE_KEY) === '1'
  } catch {
    return true
  }
}

function markMixGuide(): void {
  try {
    localStorage.setItem(MIX_GUIDE_KEY, '1')
  } catch {
    return
  }
}

interface RoundEnv { canvas: HTMLCanvasElement; stage: HTMLElement; hud: Hud; sfx: Sfx }

function createRound(env: RoundEnv, seed: number, level: number, onResult: (win: boolean, game: Game) => void): () => void {
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

  let idle = 0
  let hintChecked = false
  const wake = (): void => {
    idle = 0
    hintChecked = false
    director.hint = []
  }

  bindPointer(canvas, {
    layout: () => layout,
    gesture: () => {
      sfx.unlock()
      wake()
    },
    select: (c) => {
      if (director.state !== 'idle') return false
      wake()
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
      wake()
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
    if (director.state === 'idle' && director.selected < 0 && !hintChecked && (idle += dt) >= HINT_IDLE_MS) {
      hintChecked = true
      const h = findHint(game)
      director.hint = h ? [h.a, h.b] : []
    }
    renderer.draw(director, now / 1000)
    if (!resultShown && (director.state === 'win' || director.state === 'lose')) {
      endTimer += dt
      if (endTimer >= RESULT_DELAY_MS) {
        resultShown = true
        const win = director.state === 'win'
        onResult(win, game)
        hud.showResult(win, game.score, game.progress(), game.level, game.level === LEVELS.length - 1,
          win ? { stars: game.stars, ...starTexts(game), onStar: (i) => sfx.play('pop', i * 2 + 1) } : undefined,
        )
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
  let album = loadAlbum()
  const onResult = (win: boolean, game: Game): void => {
    if (!win) return
    saveLevel((level + 1) % LEVELS.length)
    const entry = { stars: game.stars, score: game.score, floor: encodeFloor(game.floor), at: Date.now() }
    album[String(game.level)] = mergeEntry(album[String(game.level)], entry)
    saveAlbum(album)
  }
  let dispose = createRound(env, newSeed(), level, onResult)
  const startLevel = (lv: number): void => {
    level = lv
    dispose()
    env.hud.hideOverlay()
    dispose = createRound(env, newSeed(), level, onResult)
    if (lv === firstMixLevel() && !mixGuideSeen()) {
      markMixGuide()
      env.hud.showMixGuide(LEVELS[lv]!, () => env.sfx.unlock(), app.signal)
    }
  }
  const restart = (): void => startLevel(level)
  const app = new AbortController()
  env.hud.showIntro(level, LEVELS[level]!, () => env.sfx.unlock(), app.signal)
  env.hud.onRestart(restart, app.signal)
  env.hud.onNext(() => startLevel((level + 1) % LEVELS.length), app.signal)
  env.hud.onMute(() => env.sfx.toggleMute(), app.signal)
  env.hud.onAlbumBtn(() => {
    album = loadAlbum()
    env.hud.showAlbum(album, level, (lv) => startLevel(lv), app.signal)
  }, app.signal)
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return
    dispose()
    app.abort()
  }, { signal: app.signal })
}

main()
