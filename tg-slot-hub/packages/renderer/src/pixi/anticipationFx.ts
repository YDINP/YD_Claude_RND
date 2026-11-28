import { Container, Graphics, type ColorSource } from 'pixi.js'
import { gsap } from 'gsap'
import {
  ANTICIPATION_DIM_ALPHA,
  ANTICIPATION_FADE_IN_MS,
  ANTICIPATION_GLOW_LAYERS,
  ANTICIPATION_HIT_MS,
  ANTICIPATION_MISS_FADE_MS,
  ANTICIPATION_PILLAR_ALPHA,
  ANTICIPATION_PULSE_MS,
  ANTICIPATION_PULSE_SCALE,
} from '../constants.js'

export interface FxRect {
  x: number
  y: number
  width: number
  height: number
}

/** 기대감이 끝난 까닭. `hit`=트리거 완성, `miss`=빗나감, 없음=스킵·끊김(조용히 걷는다). */
export type AnticipationOutcome = 'hit' | 'miss'

/** 화면을 덮는 어둠 사각형의 반폭(px). 캔버스·카메라 배율과 무관하게 넉넉히 덮는다. */
const COVER = 8000

/**
 * 기대감 연출의 그림 쪽 — 대상 릴 기둥의 빛 테두리, 나머지 화면 어둡게, 이미 떨어진 스캐터(코인) 맥동,
 * 트리거 완성 때의 터짐. 빗나가면 조용히 꺼진다(«아깝다» 연출은 하지 않는다).
 *
 * 그래픽 세 장을 한 번 만들어 판마다 다시 그린다(새로 만들지 않는다). 트윈은 전부 `tweens`에 들고 있다가
 * 걷을 때 한꺼번에 끊는다 — `liveTweens`가 0이면 남은 것이 없다(테스트가 본다).
 */
export class AnticipationFx {
  readonly container = new Container()
  private readonly dim = new Graphics()
  private readonly pillar = new Graphics()
  private readonly flash = new Graphics()
  private readonly tweens = new Set<gsap.core.Animation>()
  private pulsing: Container[] = []
  private readonly pulseTweens = new Map<Container, gsap.core.Animation>()
  private fade: gsap.core.Animation | null = null
  private glow: gsap.core.Animation | null = null
  private active = false

  constructor(private readonly color: ColorSource) {
    this.container.label = 'anticipation-fx'
    this.container.visible = false
    this.container.alpha = 0
    this.flash.alpha = 0
    this.container.addChild(this.dim, this.pillar, this.flash)
  }

  /** 지금 살아 있는 트윈 수. */
  get liveTweens(): number {
    return this.tweens.size
  }

  get isActive(): boolean {
    return this.active
  }

  /**
   * 기대감 시작. 이미 켜져 있으면(연속 기대 릴) 어둠을 유지한 채 기둥만 옮긴다.
   * `pulse`는 이미 떨어진 스캐터 칸의 뷰 — 크기만 맥동하고 끝나면 1로 돌아온다.
   */
  begin(columns: readonly FxRect[], pulse: readonly Container[], durationMs: number, holes: readonly FxRect[] = []): void {
    // 앞 릴의 꺼짐·되돌림 트윈을 전부 끊고 새로 건다(어둠의 지금 alpha는 그대로 두고 거기서 다시 올린다).
    for (const tween of this.tweens) tween.kill()
    this.tweens.clear()
    this.pulseTweens.clear()
    this.fade = null
    this.glow = null
    for (const view of this.pulsing) view.scale.set(1)
    this.pulsing = []
    this.active = true
    this.drawDim(columns, holes)
    this.drawPillar(columns)
    this.flash.clear()
    this.flash.alpha = 0
    this.container.visible = true
    this.track(gsap.to(this.container, { alpha: 1, duration: ANTICIPATION_FADE_IN_MS / 1000, ease: 'power1.out' }))
    // 기둥은 맥동하며 창이 끝날수록 조금씩 밝아진다 — 긴장이 쌓이는 쪽으로.
    this.pillar.alpha = 0.55
    this.glow = this.track(
      gsap.to(this.pillar, {
        alpha: 1,
        duration: ANTICIPATION_PULSE_MS / 1000,
        yoyo: true,
        repeat: Math.max(1, Math.ceil(durationMs / ANTICIPATION_PULSE_MS)),
        ease: 'sine.inOut',
      }),
    )
    this.setPulse(pulse)
  }

  /** 기대감 끝. 트리거가 완성됐으면 터지고, 빗나가면 조용히 꺼지고, 없음이면 곧장 걷는다. */
  end(outcome?: AnticipationOutcome): void {
    if (!this.active) return
    this.active = false
    if (outcome === undefined) {
      this.clear()
      return
    }
    const views = this.pulsing
    this.glow?.kill()
    this.glow = null
    this.stopPulse(outcome === 'miss')
    if (outcome === 'hit') {
      this.flash.alpha = 0.85
      this.track(gsap.to(this.flash, { alpha: 0, duration: ANTICIPATION_HIT_MS / 1000, ease: 'power2.out' }))
      for (const view of views) {
        view.scale.set(ANTICIPATION_PULSE_SCALE * 1.15)
        this.track(gsap.to(view.scale, { x: 1, y: 1, duration: ANTICIPATION_HIT_MS / 1000, ease: 'back.out(3)' }))
      }
    }
    const fadeMs = outcome === 'hit' ? ANTICIPATION_HIT_MS : ANTICIPATION_MISS_FADE_MS
    this.fade = this.track(
      gsap.to(this.container, {
        alpha: 0,
        duration: fadeMs / 1000,
        ease: 'power1.in',
        onComplete: () => {
          this.fade = null
          if (!this.active) this.container.visible = false
        },
      }),
    )
  }

  /** 즉시 걷는다(새 스핀·스킵·파괴). 트윈은 남지 않는다. */
  clear(): void {
    this.active = false
    for (const tween of this.tweens) tween.kill()
    this.tweens.clear()
    this.fade = null
    this.pulseTweens.clear()
    for (const view of this.pulsing) view.scale.set(1)
    this.pulsing = []
    this.container.visible = false
    this.container.alpha = 0
    this.flash.alpha = 0
  }

  destroy(): void {
    this.clear()
    this.container.destroy({ children: true })
  }

  private setPulse(views: readonly Container[]): void {
    this.stopPulse(false)
    this.pulsing = [...views]
    for (const view of views) {
      view.scale.set(1)
      this.pulseTweens.set(
        view,
        this.track(
          gsap.to(view.scale, {
          x: ANTICIPATION_PULSE_SCALE,
          y: ANTICIPATION_PULSE_SCALE,
          duration: ANTICIPATION_PULSE_MS / 1000,
          yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
          }),
        ),
      )
    }
  }

  private stopPulse(smooth: boolean): void {
    const views = this.pulsing
    this.pulsing = []
    for (const view of views) {
      const tween = this.pulseTweens.get(view)
      if (tween === undefined) continue
      tween.kill()
      this.tweens.delete(tween)
    }
    this.pulseTweens.clear()
    for (const view of views) {
      if (smooth) this.track(gsap.to(view.scale, { x: 1, y: 1, duration: ANTICIPATION_MISS_FADE_MS / 1000 }))
      else view.scale.set(1)
    }
  }

  /** 화면 전체를 살짝 어둡게 덮되 기대 기둥과 이미 떨어진 스캐터 칸(`holes`)은 뚫어 밝게 남긴다. */
  private drawDim(columns: readonly FxRect[], holes: readonly FxRect[]): void {
    this.dim.clear()
    this.dim.rect(-COVER, -COVER, COVER * 2, COVER * 2).fill({ color: 0x000000, alpha: ANTICIPATION_DIM_ALPHA })
    for (const rect of columns) this.dim.rect(rect.x, rect.y, rect.width, rect.height).cut()
    for (const rect of holes) this.dim.roundRect(rect.x, rect.y, rect.width, rect.height, rect.width * 0.18).cut()
  }

  private drawPillar(columns: readonly FxRect[]): void {
    this.pillar.clear()
    this.flash.clear()
    for (const rect of columns) {
      // 기둥 안쪽: 위아래 끝이 더 밝은 빛 띠 두 장 + 전체 옅은 빛.
      this.pillar.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: this.color, alpha: ANTICIPATION_PILLAR_ALPHA })
      const band = rect.height * 0.16
      this.pillar.rect(rect.x, rect.y, rect.width, band).fill({ color: 0xffffff, alpha: ANTICIPATION_PILLAR_ALPHA })
      this.pillar.rect(rect.x, rect.y + rect.height - band, rect.width, band).fill({ color: 0xffffff, alpha: ANTICIPATION_PILLAR_ALPHA })
      for (const layer of ANTICIPATION_GLOW_LAYERS) {
        this.pillar
          .roundRect(rect.x, rect.y, rect.width, rect.height, Math.min(rect.width, rect.height) * 0.08)
          .stroke({ width: layer.widthPx, color: layer.white ? 0xffffff : this.color, alpha: layer.alpha, alignment: 0.5 })
      }
      this.flash.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: 0xffffff, alpha: 1 })
    }
  }

  private track<T extends gsap.core.Animation>(tween: T): T {
    this.tweens.add(tween)
    tween.eventCallback('onInterrupt', () => this.tweens.delete(tween))
    const done = tween.eventCallback('onComplete') as (() => void) | null | undefined
    tween.eventCallback('onComplete', () => {
      this.tweens.delete(tween)
      done?.()
    })
    return tween
  }
}
