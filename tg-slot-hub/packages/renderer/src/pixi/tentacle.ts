import { Container, Graphics, MeshRope, type Texture } from 'pixi.js'
import {
  RESPIN_TENTACLE_ART_FILL,
  RESPIN_TENTACLE_POINTS,
  RESPIN_TENTACLE_POOL_MAX,
  RESPIN_TENTACLE_THICKNESS,
} from '../respinConstants.js'
import { ObjectPool, type PoolStats } from '../pool.js'
import { tentaclePoints, type TentacleGeometry, type TentacleShape } from '../tentaclePath.js'

/** 촉수 색(그림이 없을 때 코드로 그리는 몸통과 빨판). */
const BODY_COLOR = 0x7b5cff
const BODY_DARK = 0x4a35b8
const SUCKER_COLOR = 0xffc2d9

/**
 * 촉수 한 가닥. 그림(`props/tentacle`)이 있으면 `MeshRope`로, 없으면 굵기가 줄어드는 선으로 코드가 그린다.
 *
 * 정점 수는 `RESPIN_TENTACLE_POINTS`(≤ 40)로 고정이고, 경로는 순수 함수(`tentaclePoints`)가 정한다.
 * 객체는 풀(`TentaclePool`)에서 빌려 쓰고 돌려준다 — 감길 때마다 새로 만들지 않는다.
 */
export class TentacleRope {
  readonly view = new Container()
  private readonly mesh: MeshRope | null
  private readonly line: Graphics | null
  /** 메시 정점(메시 지역 좌표). 메시 배율의 역수를 곱해 화면 좌표와 맞춘다. */
  private readonly meshPoints: { x: number; y: number }[]
  private scale = 1
  private thickness = 12
  private shown = false

  constructor(texture: Texture | null) {
    this.meshPoints = Array.from({ length: RESPIN_TENTACLE_POINTS }, () => ({ x: 0, y: 0 }))
    if (texture !== null) {
      // textureScale 0이면 그림이 줄 전체에 늘어난다 — 몸통이 자라는 동안에도 모양이 온전하다.
      this.mesh = new MeshRope({ texture, points: this.meshPoints, textureScale: 0 })
      this.line = null
      this.view.addChild(this.mesh)
    } else {
      this.mesh = null
      this.line = new Graphics()
      this.view.addChild(this.line)
    }
    this.view.visible = false
  }

  /** 레이아웃이 바뀔 때 굵기(px)를 다시 정한다. */
  configure(cell: number): void {
    this.thickness = cell * RESPIN_TENTACLE_THICKNESS
    if (this.mesh !== null) {
      const textureHeight = this.mesh.texture.height > 0 ? this.mesh.texture.height : 1
      // 그림에서 몸통이 차지하는 비율만큼 보정해 화면에서 굵기가 `thickness`가 되게 한다.
      this.scale = this.thickness / (textureHeight * RESPIN_TENTACLE_ART_FILL)
      this.mesh.scale.set(this.scale)
    }
  }

  /** 모양을 그린다. 머리가 아직 안 올라왔으면(≈0) 숨긴다. */
  setShape(geo: TentacleGeometry, shape: TentacleShape): void {
    if (shape.head <= 0.002) {
      this.hide()
      return
    }
    const world = tentaclePoints(geo, shape, RESPIN_TENTACLE_POINTS)
    if (!this.shown) {
      this.shown = true
      this.view.visible = true
    }
    if (this.mesh !== null) {
      for (let i = 0; i < world.length; i += 1) {
        const p = world[i]
        const m = this.meshPoints[i]
        if (p === undefined || m === undefined) continue
        m.x = p.x / this.scale
        m.y = p.y / this.scale
      }
      return
    }
    this.drawLine(world)
  }

  private drawLine(points: readonly { x: number; y: number }[]): void {
    const g = this.line
    if (g === null) return
    g.clear()
    const last = points.length - 1
    for (let i = 0; i < last; i += 1) {
      const a = points[i]
      const b = points[i + 1]
      if (a === undefined || b === undefined) continue
      // 아래(몸)는 굵고 위(끝)는 가늘다.
      const t = i / Math.max(1, last)
      const width = this.thickness * (1 - 0.72 * t)
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke({ width, color: i % 2 === 0 ? BODY_COLOR : BODY_DARK, cap: 'round', join: 'round' })
    }
    // 빨판: 몸통을 따라 몇 군데 작은 점.
    for (let i = 3; i < last; i += 4) {
      const p = points[i]
      if (p === undefined) continue
      const t = i / Math.max(1, last)
      g.circle(p.x, p.y, Math.max(1.5, this.thickness * (0.16 - 0.08 * t)))
      g.fill({ color: SUCKER_COLOR, alpha: 0.9 })
    }
  }

  hide(): void {
    if (!this.shown) return
    this.shown = false
    this.view.visible = false
    this.line?.clear()
  }

  get visible(): boolean {
    return this.shown
  }

  destroy(): void {
    this.view.removeFromParent()
    this.view.destroy({ children: true })
  }
}

/** 촉수 풀. 한 라운드에 동시에 보이는 촉수는 세로줄 수(5)를 넘지 않는다. */
export class TentaclePool {
  private readonly pool: ObjectPool<TentacleRope>

  constructor(
    private readonly layer: Container,
    private readonly texture: Texture | null,
    max: number = RESPIN_TENTACLE_POOL_MAX,
  ) {
    this.pool = new ObjectPool<TentacleRope>({
      create: () => {
        const rope = new TentacleRope(this.texture)
        this.layer.addChild(rope.view)
        return rope
      },
      reset: (rope) => rope.hide(),
      dispose: (rope) => rope.destroy(),
      maxRetained: max,
    })
  }

  acquire(cell: number): TentacleRope {
    const rope = this.pool.acquire()
    rope.configure(cell)
    return rope
  }

  release(rope: TentacleRope): void {
    this.pool.release(rope)
  }

  clear(): void {
    this.pool.clear()
  }

  get stats(): PoolStats {
    return this.pool.stats
  }
}
