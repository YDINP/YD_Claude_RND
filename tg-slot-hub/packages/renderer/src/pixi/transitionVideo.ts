import { Sprite, Texture, VideoSource } from 'pixi.js'
import {
  coverFit,
  createTransitionVideoLogger,
  type TransitionVideoLogger,
  type TransitionVideoPlan,
  type TransitionVideoSink,
} from '../transitionVideo.js'
import type { TextureRegistry } from '../textureRegistry.js'

/**
 * Vite가 주입하는 개발 플래그.
 *
 * **텍스트가 `import.meta.env` 그대로여야** Vite가 모듈 앞에 env 객체를 심는다. 별칭으로 받으면
 * (`const meta = import.meta; meta.env`) 주입이 일어나지 않아 언제나 undefined다 — 실측으로
 * 확인했고, 그 탓에 진단 로그가 한 줄도 나오지 않았다. 타입은 이 패키지에서 쓸 수 없다
 * (pnpm 격리로 `vite/client`가 resolve되지 않는다). 허브 쪽 타입체크에서는 정상 속성이라
 * `@ts-expect-error`가 아니라 `@ts-ignore`여야 양쪽 모두 통과한다.
 */
// @ts-ignore -- Vite가 주입한다. 위 주석 참고.
const VITE_ENV: { DEV?: boolean } | undefined = import.meta.env

/** 개발 빌드인지. 운영 번들에서는 진단을 한 줄도 남기지 않는다. */
export function isDevBuild(): boolean {
  return VITE_ENV?.DEV === true
}

/**
 * 개발 빌드에서만 콘솔에 찍는 진단 sink. 운영 번들에서는 한 줄도 나가지 않는다
 * (`import.meta.env.DEV`가 false로 정적 치환되며 호출부까지 흔들려 사라진다).
 */
export const devTransitionVideoSink: TransitionVideoSink = (message, detail) => {
  if (!isDevBuild()) return
  if (detail === undefined) console.warn(`[transition-video] ${message}`)
  else console.warn(`[transition-video] ${message}`, detail)
}

/** 이 화면(게임 하나) 동안 같은 사유를 한 번만 남기는 개발용 로거. */
export function createDevTransitionVideoLogger(): TransitionVideoLogger {
  return createTransitionVideoLogger(devTransitionVideoSink)
}

/** `HTMLMediaElement.HAVE_CURRENT_DATA`. 이 값 이상이어야 첫 프레임을 그릴 수 있다. */
const HAVE_CURRENT_DATA = 2
/**
 * 탐색이 목표 지점에 닿았다고 볼 오차(초). 클립은 24fps라 한 프레임이 약 0.042초다.
 * 이 안에 들어오지 않으면 "원하는 장면이 아직 아니다"로 보고 클립을 띄우지 않는다.
 */
const SEEK_TOLERANCE_SEC = 0.25

/**
 * 전환 클립 하나의 수명. **어떤 경로로도 예외를 밖으로 내보내지 않는다** — 클립이 없거나
 * 깨졌거나 자동재생이 막혀도 전환은 단색 커튼으로 그대로 끝나야 한다.
 *
 * 한 번 만들어 두고 전환마다 다시 쓴다. 전환이 시작될 때 만들면 **늦는다**: 실측으로 요소
 * 생성부터 첫 프레임(readyState 2)까지 230~280ms, 목표 지점 탐색에 90ms가 더 들어
 * 덮기 구간(normal 380ms)을 넘긴다.
 */
export interface TransitionVideoHandle {
  /** 커튼 위에 얹는 스프라이트. 알파는 호출 측(커튼 타임라인)이 정한다. */
  sprite: Sprite
  /** 이번 전환의 시작 지점·배속을 걸어 둔다. 메타데이터가 아직이면 오는 대로 다시 건다. */
  prepare(plan: TransitionVideoPlan): void
  /** 지금 재생을 시작해도 첫 프레임이 나오는지. 요소의 실제 상태만 본다. */
  isReady(): boolean
  /**
   * 준비되면 한 번 부른다. 이미 준비됐으면 즉시 동기 호출한다.
   * 돌려주는 함수를 부르면 대기를 취소한다(전환이 끝났는데 뒤늦게 뜨는 일을 막는다).
   */
  whenReady(callback: () => void): () => void
  /** 진단용 상태 한 덩어리. 개발 모드 로그에만 쓴다. */
  describe(): Record<string, unknown>
  /** 걸어 둔 지점·배속으로 재생을 시작한다. 실패해도 던지지 않는다. */
  play(): void
  /** 캔버스를 꽉 채우도록 배치한다(`cover`, 넘치는 쪽은 잘림). 리사이즈마다 다시 부른다. */
  fit(canvasWidth: number, canvasHeight: number): void
  /** 전환이 끝났다 — 멈추고 화면에서 걷는다. 요소는 다음 전환을 위해 살려 둔다. */
  reset(): void
  /** 스프라이트·텍스처·디코더를 모두 반납한다. 여러 번 불러도 안전하다. */
  dispose(): void
}

/**
 * 클립 하나를 만들어 **미리 받아 둔다**. 만들 수 없으면 null이다.
 * 재생은 하지 않는다 — 커튼이 완전히 덮인 뒤에 `play()`가 불린다.
 */
export interface TransitionVideoOptions {
  /**
   * 텍스처 소유권을 맡길 레지스트리. 넘기면 등록·해제가 전부 이 문을 지난다 —
   * "누가 아직 쓰는가"를 한 곳에서 판단하게 하려는 것이다. 없으면 직접 파괴한다.
   */
  registry?: TextureRegistry
  /** 진단 로거. 없으면 아무것도 남기지 않는다. */
  logger?: TransitionVideoLogger
}

export function createTransitionVideo(
  url: string,
  options: TransitionVideoOptions = {},
): TransitionVideoHandle | null {
  const log = options.logger ?? createDevTransitionVideoLogger()
  const registry = options.registry
  if (typeof document === 'undefined') return null

  let video: HTMLVideoElement
  try {
    video = document.createElement('video')
  } catch {
    return null
  }

  let disposed = false
  let plan: TransitionVideoPlan | null = null
  /** Blob URL. 다 받은 뒤에만 생기고 해제할 때 반납한다. */
  let objectUrl: string | null = null
  const waiters = new Set<() => void>()

  /**
   * 지금 첫 프레임을 그릴 수 있는지 — **요소의 실제 상태만** 본다.
   *
   * 예전에는 실패를 `failed` 플래그로 붙들었는데, 그러면 마운트 직후 자동재생이 한 번
   * 막히거나 네트워크가 한 번 튀는 것만으로 그 세션의 모든 전환에서 클립이 영영 죽었다
   * (실측: 프리스핀 진행 중 입장 → 첫 전환에서 실패 → 이후 진입 전환이 전부 단색 커튼).
   * 실패는 지나가는 것이고, 판단 기준은 언제나 지금의 `error`/`readyState`다.
   */
  const drawable = (): boolean =>
    !disposed && video.error === null && video.readyState >= HAVE_CURRENT_DATA && video.videoWidth > 0

  /**
   * 그릴 수 있을 뿐 아니라 **계획한 지점에 가 있는지**.
   *
   * 그림이 있다는 것만으로 틀면 클립의 엉뚱한 대목(대개 0초 근처의 도입부)이 나온다 —
   * 실제로 탐색이 조용히 무시된 채로 재생돼, 차폐 구간 안에 정점이 오지 않았다.
   * 지점이 맞지 않으면 아예 띄우지 않고 단색 커튼으로 남는 편이 낫다.
   */
  const cued = (): boolean => {
    if (!drawable() || plan === null) return false
    return Math.abs(video.currentTime - plan.startAtSec) <= SEEK_TOLERANCE_SEC
  }

  video.muted = true
  // 사파리는 `muted` 프로퍼티만으로는 자동재생을 허용하지 않는 판이 있어 속성도 함께 건다.
  video.defaultMuted = true
  video.setAttribute('muted', '')
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  video.loop = false
  video.autoplay = false

  /**
   * 걸어 둔 계획대로 탐색한다. 아직 탐색할 수 없으면 아무것도 하지 않는다 — 버퍼가 차면
   * 다시 불린다.
   *
   * `seekable`이 비어 있는 동안의 `currentTime` 지정은 **조용히 무시된다**(사양상 중단).
   * readyState 1(메타데이터만)에서 목표 1.36초를 걸어도 0에 머무는 것을 실측했다.
   */
  const applyPlan = (): void => {
    if (disposed || plan === null) return
    if (!drawable() || video.seekable.length === 0) return
    try {
      video.playbackRate = plan.playbackRate
      if (video.duration > plan.startAtSec && Math.abs(video.currentTime - plan.startAtSec) > SEEK_TOLERANCE_SEC) {
        video.currentTime = plan.startAtSec
      }
    } catch {
      // 탐색 실패는 치명적이지 않다. 지점이 안 맞으면 `cued()`가 걸러 낸다.
    }
  }

  const notifyReady = (): void => {
    if (!cued()) return
    // 복사본을 돌린다 — 콜백이 자기 대기를 취소해도 순회가 깨지지 않는다.
    for (const waiter of [...waiters]) {
      waiters.delete(waiter)
      waiter()
    }
  }

  const onReadyEvent = (): void => {
    // 버퍼가 차면 그제서야 탐색이 먹는다. 매번 다시 걸어 보고 나서 대기자를 깨운다.
    applyPlan()
    notifyReady()
  }
  const onError = (): void => {
    log.always('클립 로딩 실패 (네트워크/코덱)', { url, error: video.error?.message })
  }

  video.addEventListener('loadedmetadata', onReadyEvent)
  video.addEventListener('loadeddata', onReadyEvent)
  video.addEventListener('canplay', onReadyEvent)
  video.addEventListener('progress', onReadyEvent)
  // 탐색이 끝나면 readyState가 다시 오른다 — 탐색 중(1로 떨어진 상태)에 포기하지 않게 한다.
  video.addEventListener('seeked', onReadyEvent)
  video.addEventListener('error', onError)

  let source: VideoSource
  try {
    // `autoLoad: false` — 소스를 붙이는 건 아래 fetch가 끝난 뒤다.
    source = new VideoSource({
      resource: video,
      autoPlay: false,
      autoLoad: false,
      loop: false,
      muted: true,
      playsinline: true,
      preload: true,
    })
  } catch (error) {
    log.always('VideoSource를 만들지 못했다', { url, error })
    releaseElement(video)
    return null
  }

  /** 소스를 붙이고 로딩을 건다. 실패는 삼킨다 — 재생 가능 여부는 요소의 상태가 정한다. */
  const attach = (src: string): void => {
    if (disposed) return
    video.src = src
    void source.load().catch((error: unknown) => {
      log.always('VideoSource 로딩 실패', { url, error })
    })
  }

  /**
   * 클립을 통째로 받아 Blob으로 물린다.
   *
   * URL을 그대로 물리면 화면에 붙지 않은(detached) `<video>`는 `preload='auto'`라도
   * 메타데이터(readyState 1)에서 멈춰 선다(`suspend`). 그 상태에서는 `seekable`이 비어 있어
   * **`currentTime` 지정이 조용히 무시되고**, 결국 클립의 도입부(0초)가 재생돼 정점이 차폐
   * 구간 밖으로 밀린다 — 실측으로 확인한 실제 증상이다. Blob은 메모리에 다 있으므로 곧바로
   * readyState 4가 되고 탐색이 먹는다. 전환 클립은 수백 KB라 이 대가가 싸다.
   */
  void fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.blob()
    })
    .then((blob) => {
      if (disposed) return
      objectUrl = URL.createObjectURL(blob)
      attach(objectUrl)
    })
    .catch((error: unknown) => {
      log.always('클립을 통째로 받지 못했다 — URL을 그대로 물린다', { url, error })
      attach(url)
    })

  let texture: Texture
  let sprite: Sprite
  try {
    texture = new Texture({ source })
    sprite = new Sprite(texture)
  } catch (error) {
    log.always('클립 스프라이트를 만들지 못했다', { url, error })
    source.destroy()
    releaseElement(video)
    return null
  }
  // 소유권을 레지스트리에 맡긴다. 이 텍스처(540x960x4 ≈ 2MB)는 렌더러보다 먼저 수명이
  // 끝날 수 있으므로, 파괴도 등록과 같은 문(`release`)을 지나게 한다.
  registry?.own(texture)
  sprite.visible = false
  sprite.alpha = 0
  // 어두운 불투명 클립이라 커튼을 그대로 대신한다. 섞지 않고 덮어야 뒤가 비치지 않는다.
  sprite.blendMode = 'normal'

  return {
    sprite,
    prepare(next: TransitionVideoPlan): void {
      if (disposed) return
      plan = next
      applyPlan()
    },
    isReady(): boolean {
      return cued()
    },
    whenReady(callback: () => void): () => void {
      if (disposed) return () => undefined
      if (cued()) {
        callback()
        return () => undefined
      }
      waiters.add(callback)
      return () => waiters.delete(callback)
    },
    describe(): Record<string, unknown> {
      return {
        url,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        currentTime: Number(video.currentTime.toFixed(3)),
        playbackRate: video.playbackRate,
        duration: video.duration,
        seekableRanges: video.seekable.length,
        cued: cued(),
        error: video.error?.message ?? null,
        prepared: plan === null ? null : { startAtSec: plan.startAtSec, playbackRate: plan.playbackRate },
      }
    },
    play(): void {
      if (disposed) return
      try {
        if (plan !== null) video.playbackRate = plan.playbackRate
        const started: unknown = video.play()
        // 자동재생이 막히면 여기서 reject한다. 커튼은 이미 화면을 덮고 있으므로 그대로 두면 된다.
        if (started instanceof Promise) {
          // 이번 전환만 접는다. 다음 전환에서는 다시 시도한다 — 자동재생 차단은
          // 사용자가 화면을 한 번 건드리면 풀리는, 지나가는 상태다.
          started.catch((error: unknown) => {
            sprite.visible = false
            log.always('자동재생이 막혔다', { url, error })
          })
        }
      } catch (error) {
        sprite.visible = false
        log.always('재생 시작 실패', { url, error })
      }
    },
    fit(canvasWidth: number, canvasHeight: number): void {
      if (disposed) return
      const rect = coverFit(canvasWidth, canvasHeight, video.videoWidth, video.videoHeight)
      sprite.position.set(rect.x, rect.y)
      sprite.width = rect.width
      sprite.height = rect.height
    },
    reset(): void {
      if (disposed) return
      waiters.clear()
      sprite.visible = false
      sprite.alpha = 0
      sprite.parent?.removeChild(sprite)
      try {
        video.pause()
      } catch {
        // 이미 멈춰 있다. 무시한다.
      }
      // 다음 전환을 위해 시작 지점으로 되감아 둔다 — 그때 탐색을 기다리지 않아도 되게.
      applyPlan()
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      waiters.clear()
      video.removeEventListener('loadedmetadata', onReadyEvent)
      video.removeEventListener('loadeddata', onReadyEvent)
      video.removeEventListener('canplay', onReadyEvent)
      video.removeEventListener('progress', onReadyEvent)
      video.removeEventListener('seeked', onReadyEvent)
      video.removeEventListener('error', onError)
      sprite.parent?.removeChild(sprite)
      // 스프라이트만 걷는다 — 텍스처 파괴는 레지스트리가 맡는다(소유권 규칙을 한 곳에).
      try {
        sprite.destroy({ texture: false, textureSource: false })
      } catch {
        // 이미 파괴된 스프라이트. 무시한다.
      }
      // 텍스처와 그 소스(=디코더에 물린 비디오)를 함께 반납한다.
      if (registry === undefined || !registry.release(texture)) {
        try {
          texture.destroy(true)
        } catch {
          // 이미 파괴됐다. 무시한다.
        }
      }
      releaseElement(video)
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
    },
  }
}

/** `<video>`가 물고 있는 네트워크·디코더 자원을 놓게 한다. */
function releaseElement(video: HTMLVideoElement): void {
  try {
    video.pause()
    video.removeAttribute('src')
    video.load()
  } catch {
    // 해제 중 오류는 삼킨다. 여기서 던지면 전환이 끝나지 못한다.
  }
}
