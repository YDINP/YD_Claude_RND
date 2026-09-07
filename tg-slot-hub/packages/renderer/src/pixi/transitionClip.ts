import {
  createTransitionClipLogger,
  type TransitionClipLogger,
  type TransitionClipSink,
} from '../transitionClip.js'

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
export const devTransitionClipSink: TransitionClipSink = (message, detail) => {
  if (!isDevBuild()) return
  if (detail === undefined) console.warn(`[transition-clip] ${message}`)
  else console.warn(`[transition-clip] ${message}`, detail)
}

/** 이 화면(게임 하나) 동안 같은 사유를 한 번만 남기는 개발용 로거. */
export function createDevTransitionClipLogger(): TransitionClipLogger {
  return createTransitionClipLogger(devTransitionClipSink)
}

/**
 * 전환 클립 하나의 수명. **어떤 경로로도 예외를 밖으로 내보내지 않는다** — 클립이 없거나
 * 깨졌거나 디코드가 실패해도 전환은 단색 커튼으로 그대로 끝나야 한다.
 *
 * 한 번 만들어 두고 전환마다 다시 쓴다. 전환이 시작될 때 만들면 **늦는다**: 받아서 디코드하는
 * 데만 수백 ms가 들어 덮기 구간을 넘긴다.
 */
export interface TransitionClipHandle {
  /** 지금 재생을 시작해도 첫 프레임이 나오는지. */
  isReady(): boolean
  /**
   * 준비되면 한 번 부른다. 이미 준비됐으면 즉시 동기 호출한다.
   * 돌려주는 함수를 부르면 대기를 취소한다(전환이 끝났는데 뒤늦게 뜨는 일을 막는다).
   */
  whenReady(callback: () => void): () => void
  /** 화면에 얹고 **처음 프레임부터** 재생시킨다. 실패해도 던지지 않는다. */
  play(): void
  /** 커튼과 같은 불투명도로 맞춘다. */
  setAlpha(alpha: number): void
  /** 전환이 끝났다 — 화면에서 걷는다. 요소는 다음 전환을 위해 살려 둔다. */
  reset(): void
  /** 진단용 상태 한 덩어리. 개발 모드 로그에만 쓴다. */
  describe(): Record<string, unknown>
  /** 요소와 Blob을 모두 반납한다. 여러 번 불러도 안전하다. */
  dispose(): void
}

export interface TransitionClipOptions {
  /**
   * 클립을 얹을 곳. 렌더러 캔버스의 **부모**다 — 클립은 캔버스의 형제로 그 위에 겹친다.
   *
   * 캔버스에 그리지 않는 이유가 이 모듈의 존재 이유다: 애니메이션 WebP는 DOM `<img>`로
   * 문서에 붙었을 때만 브라우저가 프레임을 넘겨 준다. `drawImage`로 캔버스에 옮기면
   * **첫 프레임에서 멈춘다.**
   */
  container: HTMLElement
  /** 진단 로거. 없으면 아무것도 남기지 않는다. */
  logger?: TransitionClipLogger
}

/** 클립이 캔버스를 덮는 방식. 넘치는 쪽은 잘린다(레터박스를 만들지 않는다). */
const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  // 커튼 위, 허브 UI 아래. 캔버스와 같은 상자 안이라 이 층은 게임 화면 안에서만 쌓인다.
  zIndex: '2',
  opacity: '0',
  // 클립은 보여 주기만 한다. 탭이 그대로 캔버스로 내려가야 스킵이 먹는다.
  pointerEvents: 'none',
  display: 'none',
}

/**
 * 클립 하나를 만들어 **미리 받아 둔다**. 만들 수 없으면 null이다.
 * 재생은 하지 않는다 — 커튼이 완전히 덮은 뒤에 `play()`가 불린다.
 */
export function createTransitionClip(
  url: string,
  options: TransitionClipOptions,
): TransitionClipHandle | null {
  const log = options.logger ?? createDevTransitionClipLogger()
  if (typeof document === 'undefined') return null

  let image: HTMLImageElement
  try {
    image = document.createElement('img')
  } catch {
    return null
  }

  let disposed = false
  let decoded = false
  /** Blob URL. 다 받은 뒤에만 생기고 해제할 때 반납한다. */
  let objectUrl: string | null = null
  const waiters = new Set<() => void>()

  Object.assign(image.style, OVERLAY_STYLE)
  image.decoding = 'async'
  image.setAttribute('aria-hidden', 'true')
  image.alt = ''
  options.container.appendChild(image)

  const ready = (): boolean => !disposed && decoded && objectUrl !== null

  const notifyReady = (): void => {
    if (!ready()) return
    // 복사본을 돌린다 — 콜백이 자기 대기를 취소해도 순회가 깨지지 않는다.
    for (const waiter of [...waiters]) {
      waiters.delete(waiter)
      waiter()
    }
  }

  /**
   * 클립을 통째로 받아 Blob으로 물린다.
   *
   * URL을 그대로 물리면 첫 재생이 네트워크를 기다린다 — 덮기 구간(수백 ms) 안에 첫 프레임이
   * 오지 못해 클립이 통째로 접힌다. 예전 `<video>` 경로에서 실측으로 확인하고 Blob 프리워밍으로
   * 고친 문제이고, 포맷이 바뀌어도 원인은 그대로다. 전환 클립은 수백 KB라 이 대가가 싸다.
   */
  void fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.blob()
    })
    .then(async (blob) => {
      if (disposed) return
      objectUrl = URL.createObjectURL(blob)
      image.src = objectUrl
      // `decode()`는 첫 프레임이 그려질 수 있을 때 resolve한다. 여기까지 와야 "준비됨"이다.
      try {
        await image.decode()
      } catch {
        // 디코드를 못 해도 `complete`면 띄울 수는 있다. 판단은 아래 한 줄로 모은다.
      }
      if (disposed) return
      decoded = image.complete && image.naturalWidth > 0
      if (!decoded) log.always('클립을 디코드하지 못했다', { url })
      notifyReady()
    })
    .catch((error: unknown) => {
      log.always('클립 로딩 실패 (네트워크/포맷)', { url, error })
    })

  return {
    isReady: ready,

    whenReady(callback) {
      if (ready()) {
        callback()
        return () => undefined
      }
      waiters.add(callback)
      return () => waiters.delete(callback)
    },

    play() {
      if (!ready() || objectUrl === null) return
      image.style.display = 'block'
      // **애니메이션을 처음부터 되돌리는 유일한 방법이 src 재설정이다.**
      // `<img>`에는 `currentTime`이 없어, 두 번째 전환은 지난번이 끝난 프레임에서 이어진다.
      // 같은 문자열을 그대로 다시 넣으면 무시될 수 있어 한 번 비웠다가 넣는다.
      // Blob은 이미 메모리에 있으므로 이 왕복에 네트워크가 끼지 않는다.
      image.removeAttribute('src')
      image.src = objectUrl
    },

    setAlpha(alpha) {
      image.style.opacity = String(Math.min(1, Math.max(0, alpha)))
    },

    reset() {
      image.style.display = 'none'
      image.style.opacity = '0'
    },

    describe() {
      return {
        url,
        decoded,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        hasBlob: objectUrl !== null,
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      waiters.clear()
      image.removeAttribute('src')
      image.remove()
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
    },
  }
}

/** 클립을 만들지 못했을 때 개발 모드에서 한 줄 남긴다. 전환은 단색 커튼으로 그대로 간다. */
export function warnTransitionClip(logger: TransitionClipLogger, url: string): void {
  logger.once(`create:${url}`, '클립 요소를 만들지 못했다 — 단색 커튼으로 진행한다', { url })
}
