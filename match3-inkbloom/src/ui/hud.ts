import { GOAL_PCT, MOVES, N } from '../core/constants'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} 없음`)
  return el as T
}

export class Hud {
  private moves = $('moves')
  private score = $('score')
  private pct = $('pct')
  private fill = $('fill')
  private goal = $('goal')
  private overlay = $('overlay')
  private card = $('card')
  private seal = $('seal')
  private heading = $('heading')
  private detail = $('detail')
  private start = $<HTMLButtonElement>('start')
  private again = $<HTMLButtonElement>('again')
  private shown = { moves: -1, score: -1, stained: -1 }

  constructor() {
    this.goal.style.left = `${GOAL_PCT}%`
    $('goal-label').textContent = `목표 ${GOAL_PCT}%`
    $('rules').textContent = `같은 색 방울 3개를 이어 터뜨리면 그 자리 바닥이 물들어요. ${MOVES}번 안에 바닥의 ${GOAL_PCT}%를 물들이세요. 5개를 이으면 붓이 생겨요. 붓을 옆 방울과 바꾸면 한 줄이 통째로 물들어요.`
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

  setStained(n: number): void {
    if (n === this.shown.stained) return
    this.shown.stained = n
    const p = (n / N) * 100
    this.fill.style.width = `${p}%`
    this.pct.textContent = `${Math.round(p)}%`
    this.fill.classList.toggle('done', p >= GOAL_PCT)
  }

  private pop(el: HTMLElement): void {
    el.classList.remove('pop')
    void el.offsetWidth
    el.classList.add('pop')
  }

  showIntro(onStart: () => void, signal: AbortSignal): void {
    this.card.className = 'card intro'
    this.seal.textContent = '먹'
    this.heading.textContent = '먹물 번짐'
    this.detail.textContent = ''
    this.start.hidden = false
    this.again.hidden = true
    this.overlay.hidden = false
    this.start.addEventListener('click', () => {
      this.overlay.hidden = true
      onStart()
    }, { once: true, signal })
  }

  showResult(win: boolean, score: number, stained: number): void {
    this.card.className = `card ${win ? 'win' : 'lose'}`
    this.seal.textContent = win ? '완성' : '아쉬움'
    this.heading.textContent = win ? '바닥이 물들었어요' : '조금 모자랐어요'
    this.detail.textContent = `물든 바닥 ${Math.round((stained / N) * 100)}%  ·  점수 ${score.toLocaleString('ko-KR')}`
    this.start.hidden = true
    this.again.hidden = false
    this.overlay.hidden = false
  }

  hideOverlay(): void {
    this.overlay.hidden = true
  }

  onRestart(fn: () => void, signal: AbortSignal): void {
    $('restart').addEventListener('click', fn, { signal })
    this.again.addEventListener('click', fn, { signal })
  }

  onMute(fn: () => boolean, signal: AbortSignal): void {
    const btn = $('mute')
    btn.addEventListener('click', () => {
      btn.textContent = fn() ? '소리 꺼짐' : '소리 켜짐'
    }, { signal })
  }
}
