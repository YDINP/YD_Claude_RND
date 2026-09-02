import { AnimatedSprite, Assets, Rectangle, Texture } from 'pixi.js'
import {
  atlasUrlFor,
  parseSpriteSheet,
  sheetAnimationSpeed,
  sheetScaleFor,
  type SpriteSheet,
} from '../sheet.js'
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
 * 렌더러 인스턴스가 사라져도 살아 있어야 한다. 그래서 `TextureRegistry`에 넣지 않는다.
 * 등록해서 `destroy(true)`를 부르면 캐시에 남은 아틀라스 원본까지 죽는다.
 */
const sheetCache = new Map<string, Promise<LoadedSheet | null>>()
const readySheets = new Map<string, LoadedSheet>()

/** 이미 준비된 시트만 즉시 돌려준다. 없으면 null이고 호출 측이 절차적 연출로 간다. */
export function peekSheet(url: string): LoadedSheet | null {
  return readySheets.get(url) ?? null
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

/** 테스트와 게임 전환에서 캐시를 비운다. */
export function clearSheetCache(): void {
  sheetCache.clear()
  readySheets.clear()
}

/**
 * 승리 연출 동안 정지 이미지를 시트 애니메이션으로 갈아 끼운다.
 *
 * 원본 스프라이트는 숨기기만 하고 텍스처를 건드리지 않는다.
 * 연출이 끝나면 그대로 되돌아온다.
 */
export function playSheetFx(target: FxTarget, loaded: LoadedSheet): SymbolFxHandle {
  const { sheet, frames } = loaded
  if (frames.length === 0) return { stop: () => undefined }

  const animated = new AnimatedSprite(frames)
  animated.anchor.set(0.5)
  // 렌더된 크기를 유지한다. 기준은 frameW이고 정지 심볼의 실제 폭에 맞춘다.
  animated.scale.set(sheetScaleFor(sheet, target.sprite.width))
  animated.animationSpeed = sheetAnimationSpeed(sheet)
  animated.loop = true
  animated.play()

  target.sprite.visible = false
  target.view.addChild(animated)

  return {
    stop: () => {
      animated.stop()
      animated.destroy()
      // 무조건 되돌린다. 직전 상태를 기억해 두면 시트가 겹쳐 붙었을 때
      // 나중 것이 "숨김"을 기억했다가 마지막에 심볼을 영영 숨겨 버린다.
      target.sprite.visible = true
    },
  }
}
