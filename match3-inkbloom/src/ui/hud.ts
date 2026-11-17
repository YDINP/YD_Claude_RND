import { decodeFloor, type AlbumEntry } from '../core/album'
import { LEVELS, type Level } from '../core/levels'
import { BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type OrderLine, type OrderProgress } from '../core/types'
import { PIECE_PALETTE } from '../view/blob'
import { COLOR_NAMES } from './names'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} 없음`)
  return el as T
}

const el = (tag: string, cls: string, text = ''): HTMLElement => {
  const e = document.createElement(tag)
  e.className = cls
  if (text) e.textContent = text
  return e
}

const dot = (hex: string, extra = ''): HTMLElement => {
  const d = el('i', `dot${extra}`)
  d.style.background = hex
  return d
}

const orderText = (order: OrderLine[]): string => order.map((o) => `${COLOR_NAMES[o.color]} ${o.need}개`).join(', ')

const BASIC_RULES = [
  '같은 색 3개를 이어 터뜨려 주문을 채워요.',
  '다른 원색 둘을 맞바꿔 줄이 안 생기면 섞여요 (빨+노=주황, 노+파=초록, 빨+파=보라).',
  '4개·5개를 이으면 특수 방울이 생겨요.',
]

const SPECIALS = [
  '4개 한 줄 → 줄 방울: 터지면 가로나 세로 한 줄을 터뜨려요.',
  'ㄱ·ㅜ 모양 → 물감 통: 터지면 둘레 3×3 칸을 터뜨려요.',
  '5개 한 줄 → 붓: 옆 방울과 바꾸면 그 색 방울을 모두 터뜨려요.',
]

const MIX_GUIDE = [
  '이번 판부터 섞은 색 주문이 나와요.',
  '빨강과 노랑처럼 다른 원색 둘을 맞바꿔 보세요. 줄이 안 생기면 옮긴 자리에 섞인 색 방울이 생겨요.',
  '섞기도 한 번 움직인 것으로 세요. 방울을 고르면 섞일 색이 작게 보여요.',
]

export interface StarExtras {
  stars: number
  star2: string
  star3: string
  onStar(i: number): void
}

export class Hud {
  private moves = $('moves')
  private score = $('score')
  private level = $('level')
  private order = $('order')
  private overlay = $('overlay')
  private starTimers: number[] = []
  private card = $('card')
  private seal = $('seal')
  private heading = $('heading')
  private detail = $('detail')
  private starsEl = $('stars')
  private albumNotice = $('album-notice')
  private albumViewBtn = $<HTMLButtonElement>('album-view')
  private start = $<HTMLButtonElement>('start')
  private again = $<HTMLButtonElement>('again')
  private next = $<HTMLButtonElement>('next')
  private shown = { moves: -1, score: -1, order: '' }
  private chips: { chip: HTMLElement; count: HTMLElement }[] = []
  private albumOverlay = $('album-overlay')
  private albumGrid = $('album-grid')
  private albumAc: AbortController | null = null

  constructor() {
    this.buildLegend()
  }

  private setRules(main: string[], small: string[]): void {
    $('rules').replaceChildren(...main.map((t) => el('span', 'rule', t)), ...small.map((t) => el('span', 'rule small', t)))
  }

  private buildLegend(): void {
    const legend = $('legend')
    const P = PIECE_PALETTE
    const pair = (a: number, b: number, c: number): HTMLElement => {
      const g = el('span', 'combo')
      g.append(dot(P[a]!), '+', dot(P[b]!), '=', dot(P[c]!), el('em', '', COLOR_NAMES[c]))
      return g
    }
    legend.replaceChildren(pair(RED, YELLOW, ORANGE), pair(YELLOW, BLUE, GREEN), pair(RED, BLUE, PURPLE))
    $('specials').textContent = '다른 원색 둘을 맞바꾸면 섞여요 · 4개=줄 방울 · ㄱ·ㅜ=물감 통 · 5개=붓'
  }

  setLevel(index: number): void {
    this.level.textContent = String(index + 1)
  }

  setMoves(n: number): void {
    if (n === this.shown.moves) return
    this.shown.moves = n
    this.moves.textContent = String(n)
    this.moves.classList.toggle('low', n <= 3)
    this.pop(this.moves)
  }

  setScore(n: number): void {
    if (n === this.shown.score) return
    this.shown.score = n
    this.score.textContent = n.toLocaleString('ko-KR')
    this.pop(this.score)
  }

  setOrder(progress: OrderProgress[]): void {
    const key = progress.map((p) => `${p.color}:${p.need}`).join(',')
    if (key !== this.shown.order) {
      this.shown.order = key
      this.chips = progress.map((p) => {
        const chip = el('span', 'chip')
        const count = el('b', 'count')
        chip.append(dot(PIECE_PALETTE[p.color]!, ' sw'), el('span', 'name', COLOR_NAMES[p.color]), count, el('span', 'done-mark', '완'))
        return { chip, count }
      })
      this.order.replaceChildren(...this.chips.map((c) => c.chip))
    }
    progress.forEach((p, i) => {
      const c = this.chips[i]!
      const text = `${Math.min(p.have, p.need)}/${p.need}`
      if (c.count.textContent !== text) {
        c.count.textContent = text
        this.pop(c.count)
      }
      c.chip.classList.toggle('done', p.have >= p.need)
    })
  }

  private pop(e: HTMLElement): void {
    e.classList.remove('pop')
    void e.offsetWidth
    e.classList.add('pop')
  }

  private open(kind: string, seal: string, heading: string, detail: string, button: HTMLButtonElement): void {
    this.card.className = `card ${kind}`
    this.seal.textContent = seal
    this.heading.textContent = heading
    this.detail.textContent = detail
    this.starsEl.hidden = true
    this.starsEl.replaceChildren()
    this.albumNotice.hidden = true
    this.albumViewBtn.hidden = true
    for (const b of [this.start, this.again, this.next]) b.hidden = b !== button
    this.overlay.hidden = false
  }

  showIntro(index: number, lv: Level, onStart: () => void, signal: AbortSignal): void {
    this.open('intro', '염', '염색 공방', `${index + 1}판 주문: ${orderText(lv.order)} 모으기 · ${lv.moves}번 안에`, this.start)
    this.setRules(BASIC_RULES, SPECIALS)
    this.waitStart(onStart, signal)
  }

  showMixGuide(lv: Level, onStart: () => void, signal: AbortSignal): void {
    this.open('intro', '섞', '색 섞기', `주문: ${orderText(lv.order)} 모으기 · ${lv.moves}번 안에`, this.start)
    this.setRules(MIX_GUIDE, [])
    this.waitStart(onStart, signal)
  }

  private waitStart(onStart: () => void, signal: AbortSignal): void {
    this.start.addEventListener('click', () => {
      this.overlay.hidden = true
      onStart()
    }, { once: true, signal })
  }

  showResult(win: boolean, score: number, progress: OrderProgress[], index: number, last: boolean, extras?: StarExtras, onAlbum?: () => void): void {
    this.clearStarTimers()
    const lines = progress.map((p) => `${COLOR_NAMES[p.color]} ${p.have}/${p.need}${p.have >= p.need ? ' ✓' : ''}`).join('  ·  ')
    const heading = win ? (last ? '모든 주문을 마쳤어요' : `${index + 1}판 주문 완성`) : '주문을 못 맞췄어요'
    const starLines = win && extras ? `\n★2 ${extras.star2}\n★3 ${extras.star3}` : ''
    this.open(win ? 'win' : 'lose', win ? '완성' : '아쉬움', heading, `${lines}\n점수 ${score.toLocaleString('ko-KR')}${starLines}`, win ? this.next : this.again)
    this.next.textContent = last ? '처음 판부터' : '다음 판'
    if (win && extras) {
      this.starsEl.hidden = false
      const starEls: HTMLElement[] = []
      for (let i = 0; i < 3; i++) {
        const s = el('span', 'star', '★')
        starEls.push(s)
        this.starsEl.appendChild(s)
      }
      for (let i = 0; i < extras.stars; i++) {
        const idx = i
        this.starTimers.push(window.setTimeout(() => {
          const se = starEls[idx]!
          se.classList.add('lit')
          se.classList.remove('pop')
          void se.offsetWidth
          se.classList.add('pop')
          extras.onStar(idx)
        }, 400 + idx * 400))
      }
    }
    if (win && onAlbum) {
      this.albumNotice.textContent = '천 모음에 걸었어요'
      this.albumNotice.hidden = false
      this.albumViewBtn.hidden = false
      this.albumViewBtn.onclick = onAlbum
    }
  }

  showAlbum(album: Partial<Record<string, AlbumEntry>>, currentLevel: number, onSelect: (level: number) => void, signal: AbortSignal): void {
    this.albumAc?.abort()
    this.albumAc = new AbortController()
    const ac = this.albumAc
    this.albumGrid.replaceChildren()
    for (let i = 0; i < LEVELS.length; i++) {
      const entry = album[String(i)]
      const tile = el('div', entry ? 'album-tile' : i <= currentLevel ? 'album-tile next-level' : 'album-tile empty')
      const numEl = el('span', 'tile-num', String(i + 1))
      tile.appendChild(numEl)
      if (entry) {
        const cv = document.createElement('canvas')
        const size = 64
        cv.width = cv.height = size
        const ctx = cv.getContext('2d')!
        const floor = decodeFloor(entry.floor)
        this.drawThumbnail(ctx, floor, size)
        tile.insertBefore(cv, numEl)
        const starsEl = el('span', 'tile-stars', '★'.repeat(entry.stars))
        tile.appendChild(starsEl)
      }
      tile.addEventListener('click', () => {
        this.closeAlbum()
        onSelect(i)
      }, { signal: ac.signal })
      this.albumGrid.appendChild(tile)
    }
    this.albumOverlay.hidden = false
    const close = (): void => this.closeAlbum()
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() }, { signal: ac.signal })
    this.albumOverlay.addEventListener('click', (e) => { if (e.target === this.albumOverlay) close() }, { signal: ac.signal })
    $('album-close').addEventListener('click', close, { signal: ac.signal })
    signal.addEventListener('abort', close, { signal: ac.signal })
  }

  closeAlbum(): void {
    this.albumOverlay.hidden = true
    this.albumAc?.abort()
    this.albumAc = null
    this.albumGrid.replaceChildren()
  }

  private drawThumbnail(ctx: CanvasRenderingContext2D, floor: Int8Array, size: number): void {
    const cell = size / 8
    const pal = PIECE_PALETTE
    for (let i = 0; i < 64; i++) {
      const c = floor[i]!
      if (c < 0 || c >= pal.length) continue
      ctx.fillStyle = pal[c]!
      ctx.globalAlpha = 0.9
      ctx.fillRect((i % 8) * cell, Math.floor(i / 8) * cell, cell, cell)
    }
    ctx.globalAlpha = 1
  }

  private clearStarTimers(): void {
    for (const t of this.starTimers) clearTimeout(t)
    this.starTimers = []
  }

  hideOverlay(): void {
    this.clearStarTimers()
    this.overlay.hidden = true
  }

  onRestart(fn: () => void, signal: AbortSignal): void {
    $('restart').addEventListener('click', fn, { signal })
    this.again.addEventListener('click', fn, { signal })
  }

  onNext(fn: () => void, signal: AbortSignal): void {
    this.next.addEventListener('click', fn, { signal })
  }

  onMute(fn: () => boolean, signal: AbortSignal): void {
    const btn = $('mute')
    btn.addEventListener('click', () => {
      btn.textContent = fn() ? '소리 꺼짐' : '소리 켜짐'
    }, { signal })
  }

  onAlbumBtn(fn: () => void, signal: AbortSignal): void {
    $('album-btn').addEventListener('click', fn, { signal })
  }
}
