/**
 * 전환 클립(애니메이션 WebP)을 미리 받아 두는 작은 캐시.
 *
 * 말판 진입·복귀 커튼은 클립이 화면을 덮는 순간(`opaqueMs`)에 화면을 갈아 끼운다. 그 순간 첫 프레임이 아직
 * 네트워크에 있으면 클립이 통째로 접힌다 — 그래서 게임 화면이 열릴 때 **Blob으로 받아 메모리에 쥐고** 있다가
 * 커튼이 뜰 때 그 Blob URL을 `<img>`에 물린다(렌더러의 프리워밍과 같은 이유). `<img>` 요소는 커튼이 뜰 때만 만들고
 * 끝나면 걷으므로 디코드된 프레임은 전환 사이에 메모리에 남지 않는다. Blob(수백 KB)은 게임 화면을 떠날 때 반납한다.
 */

interface Entry {
  promise: Promise<string | null>
  objectUrl: string | null
  refs: number
  disposed: boolean
}

const cache = new Map<string, Entry>()

export interface ClipLease {
  /** 준비되면 Blob URL, 못 받으면 null(단색 커튼으로 폴백). */
  ready: Promise<string | null>
  /** 현재 Blob URL(아직이면 null). */
  current(): string | null
  /** 반납. 마지막 사용자가 놓으면 Blob URL을 해제한다. */
  release(): void
}

function load(url: string): Entry {
  const entry: Entry = { promise: Promise.resolve(null), objectUrl: null, refs: 0, disposed: false }
  entry.promise = (async () => {
    try {
      if (typeof fetch !== 'function') return null
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (entry.disposed) return null
      entry.objectUrl = URL.createObjectURL(blob)
      return entry.objectUrl
    } catch {
      return null
    }
  })()
  return entry
}

/** 클립을 빌린다. 같은 URL은 한 번만 받는다. URL이 없으면 항상 null을 주는 빈 임대다. */
export function acquireClip(url: string | undefined): ClipLease {
  if (url === undefined || url === '') {
    return { ready: Promise.resolve(null), current: () => null, release: () => undefined }
  }
  let entry = cache.get(url)
  if (entry === undefined) {
    entry = load(url)
    cache.set(url, entry)
  }
  entry.refs += 1
  const held = entry
  let released = false
  return {
    ready: held.promise,
    current: () => held.objectUrl,
    release() {
      if (released) return
      released = true
      held.refs -= 1
      if (held.refs > 0) return
      held.disposed = true
      if (held.objectUrl !== null) URL.revokeObjectURL(held.objectUrl)
      held.objectUrl = null
      if (cache.get(url) === held) cache.delete(url)
    },
  }
}

/** 테스트용: 캐시에 남은 항목 수. */
export function clipCacheSize(): number {
  return cache.size
}
