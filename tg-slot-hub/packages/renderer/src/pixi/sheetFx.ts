import { AnimatedSprite, Assets, Rectangle, Texture } from 'pixi.js'
import {
  atlasUrlFor,
  parseSpriteSheet,
  sheetAnimationSpeed,
  sheetScaleFor,
  type SpriteSheet,
} from '../sheet.js'
import { SHEET_TEXTURE_CACHE_CAPACITY } from '../constants.js'
import { KeyedObjectPool, type PoolStats } from '../pool.js'
import { TextureRegistry, type TextureRegistrySnapshot } from '../textureRegistry.js'
import type { FxTarget, SymbolFxHandle } from './symbolFx.js'

/** 불러온 시트 하나. 프레임 텍스처는 아틀라스 원본을 잘라 만든 뷰다. */
export interface LoadedSheet {
  sheet: SpriteSheet
  frames: Texture[]
}

/**
 * URL별 캐시.
 *
 * 프레임 텍스처는 아틀라스 원본(`Assets` 캐시 소유)을 잘라 본 것이라
 * 렌더러 인스턴스가 사라져도 살아 있어야 한다. 그래서 렌더러의 텍스처 장부에 넣지 않는다.
 * 등록해서 `destroy(true)`를 부르면 캐시에 남은 아틀라스 원본까지 죽는다.
 *
 * 대신 시트는 **자기 수명 장부**(`sheetTextures`)를 따로 가진다. 게임을 오갈수록 아틀라스가
 * 쌓이는 것이 진짜 문제였고, 그것은 렌더러 하나의 수명으로는 풀 수 없다.
 */
const sheetCache = new Map<string, Promise<LoadedSheet | null>>()
const readySheets = new Map<string, LoadedSheet>()

/**
 * 시트 한 벌의 수명 단위.
 *
 * 무거운 것은 프레임 텍스처 여덟 장이 아니라 그것들이 함께 보는 아틀라스 한 장이다.
 * 그래서 세는 단위도 시트 한 벌이다. 파괴할 때는 잘라 본 프레임만 버리고(`destroy(false)`),
 * 원본은 `Assets`에 정식으로 돌려준다 — 그래야 다음에 다시 받을 때 캐시가 죽은 것을 주지 않는다.
 */
class SheetLifetime {
  constructor(
    private readonly url: string,
    private readonly loaded: LoadedSheet,
  ) {}

  destroy(): void {
    for (const frame of this.loaded.frames) frame.destroy(false)
    sheetLifetimes.delete(this.url)
    readySheets.delete(this.url)
    sheetCache.delete(this.url)
    void Assets.unload(atlasUrlFor(this.url)).catch(() => undefined)
  }
}

const sheetLifetimes = new Map<string, SheetLifetime>()
/** 시트 아틀라스 장부. 참조가 끊긴 것부터 상한을 넘는 만큼 밀려난다. */
const sheetTextures = new TextureRegistry({ cacheCapacity: SHEET_TEXTURE_CACHE_CAPACITY })

/** 이미 준비된 시트만 즉시 돌려준다. 없으면 null이고 호출 측이 절차적 연출로 간다. */
export function peekSheet(url: string): LoadedSheet | null {
  return readySheets.get(url) ?? null
}

/**
 * 시트를 쓰겠다고 알린다. 붙잡고 있는 동안에는 상한을 넘어도 밀려나지 않는다.
 * 아직 도착하지 않은 시트는 null이고, 그때는 붙잡을 것도 없다.
 *
 * 붙잡은 쪽이 `releaseSheet`로 놓는 것이 규칙이다 — 수명은 "누가 아직 쓰는가"를 따른다.
 */
export function retainSheet(url: string): LoadedSheet | null {
  const loaded = readySheets.get(url)
  if (loaded === undefined) return null

  const existing = sheetLifetimes.get(url)
  const lifetime = existing ?? new SheetLifetime(url, loaded)
  if (existing === undefined) sheetLifetimes.set(url, lifetime)
  sheetTextures.retain(lifetime)
  return loaded
}

/** 붙잡았던 시트를 놓는다. 마지막 사용자가 놓으면 축출 후보가 된다. */
export function releaseSheet(url: string): void {
  const lifetime = sheetLifetimes.get(url)
  if (lifetime === undefined) return
  sheetTextures.release(lifetime)
}

/** 시트 아틀라스 장부의 읽기 전용 스냅샷. */
export function sheetTextureSnapshot(): TextureRegistrySnapshot {
  return sheetTextures.snapshot
}

async function fetchSheet(url: string, fetchImpl: typeof fetch): Promise<LoadedSheet | null> {
  try {
    const response = await fetchImpl(url)
    if (!response.ok) return null
    const sheet = parseSpriteSheet((await response.json()) as unknown)

    const atlas = await Assets.load<Texture>(atlasUrlFor(url))
    const frames = sheet.frames.map(
      (frame) =>
        new Texture({
          source: atlas.source,
          frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
        }),
    )
    const loaded: LoadedSheet = { sheet, frames }
    readySheets.set(url, loaded)
    return loaded
  } catch {
    // 사이드카가 없거나, 검증에 실패했거나, 아틀라스를 못 받은 경우.
    // 어느 쪽이든 조용히 포기하고 절차적 연출로 돌아간다.
    return null
  }
}

/** 시트를 불러온다. 같은 URL은 한 번만 받고 결과를 나눠 쓴다. */
export function loadSheetFrames(url: string, fetchImpl?: typeof fetch): Promise<LoadedSheet | null> {
  const cached = sheetCache.get(url)
  if (cached !== undefined) return cached

  const doFetch = fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') return Promise.resolve(null)

  const pending = fetchSheet(url, doFetch)
  sheetCache.set(url, pending)
  return pending
}

/** 테스트와 게임 전환에서 캐시를 비운다. 붙잡혀 있든 아니든 전부 되돌린다. */
export function clearSheetCache(): void {
  sheetTextures.destroyAll()
  sheetLifetimes.clear()
  sheetCache.clear()
  readySheets.clear()
}

/**
 * 시트 애니메이션 스프라이트를 어디서 얻는가.
 *
 * 풀이 없는 자리에서도 재생 코드가 갈래를 갖지 않도록 널 오브젝트를 둔다 —
 * `DIRECT_SHEET_SPRITES`는 매번 만들고 매번 버리는, 풀을 끼우기 전의 동작 그대로다.
 */
export interface SheetSpriteSource {
  acquire(frames: Texture[]): AnimatedSprite
  release(frames: Texture[], sprite: AnimatedSprite): void
}

export const DIRECT_SHEET_SPRITES: SheetSpriteSource = {
  acquire: (frames) => new AnimatedSprite(frames),
  release: (_frames, sprite) => {
    sprite.removeFromParent()
    sprite.destroy()
  },
}

/**
 * 프레임 묶음별 시트 스프라이트 풀.
 *
 * 승리 연출은 다음 스핀까지 A -> B -> A로 계속 돈다. 한 바퀴마다 이긴 칸의 스프라이트를
 * 새로 만들고 버리면, 만드는 수가 "판당 몇 개"가 아니라 "초당 몇 개"가 된다.
 * 프레임 묶음이 다르면 서로 바꿔 쓸 수 없으므로 묶음을 키로 나눠 담는다.
 *
 * 텍스처는 여전히 시트 장부의 것이다. 여기서 파괴하는 것은 스프라이트뿐이다.
 */
export class SheetSpritePool implements SheetSpriteSource {
  private readonly pool: KeyedObjectPool<Texture[], AnimatedSprite>

  /**
   * @param maxRetainedPerKey 프레임 묶음 하나가 보관할 스프라이트 수.
   *   **격자 칸 수(`reels x rows`)를 그대로 준다.** 한 심볼이 동시에 점등될 수 있는 최대가
   *   정의상 격자 칸 수이기 때문이다 — 그보다 큰 값은 닿지 않고, 작은 값은 꽉 찬 판에서
   *   반납분을 버리게 해 그 판에서만 풀이 없는 것과 같아진다.
   *
   *   상한을 넉넉히 잡아도 상주량은 늘지 않는다. 풀은 **실제 동시 사용량만큼만** 만들고
   *   상한은 "보관을 허용하는 최대"일 뿐이라, 12칸까지만 켜지는 게임에서 상한이 20이어도
   *   13번째 스프라이트는 애초에 만들어지지 않는다.
   */
  constructor(maxRetainedPerKey: number) {
    this.pool = new KeyedObjectPool<Texture[], AnimatedSprite>({
      create: (frames) => new AnimatedSprite(frames),
      reset: (sprite) => {
        sprite.stop()
        sprite.removeFromParent()
        // 다음에 꺼내는 쪽이 크기와 속도를 다시 정하므로, 여기서는 셀에 남을 만한 것만 지운다.
        sprite.visible = true
        sprite.alpha = 1
        sprite.rotation = 0
        sprite.tint = 0xffffff
        sprite.position.set(0, 0)
      },
      dispose: (sprite) => {
        sprite.removeFromParent()
        sprite.destroy()
      },
      maxRetainedPerKey,
    })
  }

  acquire(frames: Texture[]): AnimatedSprite {
    return this.pool.acquire(frames)
  }

  release(frames: Texture[], sprite: AnimatedSprite): void {
    this.pool.release(frames, sprite)
  }

  /** 보관분을 전부 파괴한다. 렌더러가 내려갈 때 한 번 부른다. */
  clear(): void {
    this.pool.clear()
  }

  /** 지금 상주 중인 프레임 묶음 수. */
  get keyCount(): number {
    return this.pool.keyCount
  }

  get stats(): PoolStats {
    return this.pool.stats
  }
}

/**
 * 승리 연출 동안 정지 이미지를 시트 애니메이션으로 갈아 끼운다.
 *
 * 원본 스프라이트는 숨기기만 하고 텍스처를 건드리지 않는다.
 * 연출이 끝나면 그대로 되돌아온다.
 */
export function playSheetFx(
  target: FxTarget,
  loaded: LoadedSheet,
  sprites: SheetSpriteSource = DIRECT_SHEET_SPRITES,
): SymbolFxHandle {
  const { sheet, frames } = loaded
  if (frames.length === 0) return { stop: () => undefined }

  const animated = sprites.acquire(frames)
  animated.anchor.set(0.5)
  // 렌더된 크기를 유지한다. 기준은 frameW이고 정지 심볼의 실제 폭에 맞춘다.
  animated.scale.set(sheetScaleFor(sheet, target.sprite.width))
  animated.animationSpeed = sheetAnimationSpeed(sheet)
  animated.loop = true
  // 돌려 쓴 스프라이트는 지난번 프레임에 서 있다. 언제나 처음부터 시작한다.
  animated.gotoAndPlay(0)

  target.sprite.visible = false
  target.view.addChild(animated)

  // 손잡이는 두 곳(셀별 목록과 전체 목록)에 걸려 있어 `stop()`이 두 번 불린다.
  // 풀에 돌려준 뒤의 두 번째 호출은 **다른 칸이 쓰고 있는** 스프라이트를 멈추게 된다.
  let stopped = false
  return {
    stop: () => {
      if (stopped) return
      stopped = true
      animated.stop()
      sprites.release(frames, animated)
      // 무조건 되돌린다. 직전 상태를 기억해 두면 시트가 겹쳐 붙었을 때
      // 나중 것이 "숨김"을 기억했다가 마지막에 심볼을 영영 숨겨 버린다.
      target.sprite.visible = true
    },
  }
}
