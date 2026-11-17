import type { Level } from '../core/levels'
import { BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW, type OrderLine, type OrderProgress } from '../core/types'
import { FLOOR_PALETTE, PIECE_PALETTE } from '../view/blob'
import { FLOOR_NAMES } from './names'

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

const orderText = (order: OrderLine[]): string => order.map((o) => `${FLOOR_NAMES[o.color]} ${o.need}칸`).join(', ')

const SPECIALS = [
  '4개 한 줄 → 줄 방울: 터지면 가로나 세로 한 줄을 그 색으로 칠해요.',
  'ㄱ·ㅜ 모양 → 물감 통: 터지면 둘레 3×3 칸을 칠해요.',
  '5개 한 줄 → 붓: 옆 방울과 바꾸면 한 줄을 그 방울 색으로 칠해요.',
]

export class Hud {
  private moves = $('moves')
  private score = $('score')
  private level = $('level')
  private order = $('order')
  private overlay = $('overlay')
  private card = $('card')
  private seal = $('seal')
  private heading = $('heading')
  private detail = $('detail')
  private start = $<HTMLButtonElement>('start')
  private again = $<HTMLButtonElement>('again')
  private next = $<HTMLButtonElement>('next')
  private shown = { moves: -1, score: -1, order: '' }
  private chips: { chip: HTMLElement; count: HTMLElement }[] = []

  constructor() {
    this.buildLegend()
    const rules = $('rules')
    rules.replaceChildren(
      el('span', 'rule', '같은 방울 3개를 이으면 그 자리 바닥이 물들어요. 다른 색을 겹치면 섞이고, 섞인 색에 또 칠하면 탁해져요. 맑은 물은 한 단계 지워요.'),
      ...SPECIALS.map((t) => el('span', 'rule small', t)),
    )
  }

  private buildLegend(): void {
    const legend = $('legend')
    const P = PIECE_PALETTE
    const F = FLOOR_PALETTE
    const pair = (a: number, b: number, c: number): HTMLElement => {
      const g = el('span', 'combo')
      g.append(dot(P[a]!), '+', dot(P[b]!), '=', dot(F[c]!), el('em', '', FLOOR_NAMES[c]))
      return g
    }
    const water = el('span', 'combo')
    water.append(dot(P[3], ' drop'), el('em', '', '한 단계 지우기'))
    legend.replaceChildren(pair(RED, YELLOW, ORANGE), pair(YELLOW, BLUE, GREEN), pair(RED, BLUE, PURPLE), water)
    $('specials').textContent = '4개=줄 방울 · ㄱ·ㅜ=물감 통 · 5개=붓'
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
        chip.append(dot(FLOOR_PALETTE[p.color]!, ' sw'), el('span', 'name', FLOOR_NAMES[p.color]), count, el('span', 'done-mark', '완'))
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
    for (const b of [this.start, this.again, this.next]) b.hidden = b !== button
    this.overlay.hidden = false
  }

  showIntro(index: number, lv: Level, onStart: () => void, signal: AbortSignal): void {
    this.open('intro', '염', '염색 공방', `${index + 1}판 주문: ${orderText(lv.order)} · ${lv.moves}번 안에`, this.start)
    this.start.addEventListener('click', () => {
      this.overlay.hidden = true
      onStart()
    }, { once: true, signal })
  }

  showResult(win: boolean, score: number, progress: OrderProgress[], index: number, last: boolean): void {
    const lines = progress.map((p) => `${FLOOR_NAMES[p.color]} ${p.have}/${p.need}${p.have >= p.need ? ' ✓' : ''}`).join('  ·  ')
    const heading = win ? (last ? '모든 주문을 마쳤어요' : `${index + 1}판 주문 완성`) : '주문을 못 맞췄어요'
    this.open(win ? 'win' : 'lose', win ? '완성' : '아쉬움', heading, `${lines}\n점수 ${score.toLocaleString('ko-KR')}`, win ? this.next : this.again)
    this.next.textContent = last ? '처음 판부터' : '다음 판'
  }

  hideOverlay(): void {
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
}
