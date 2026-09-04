/**
 * 개발자 디버그 패널 노출 여부 — 절대 기본으로 보이면 안 된다(운영 빌드에서도 URL/로컬스토리지로만
 * 켜진다). 세 가지 방법 중 하나라도 해당하면 켜진다:
 *  1. 진짜 쿼리스트링에 `debug=1` (예: `?debug=1#/play/...`)
 *  2. 해시 뒤에 붙은 "해시 쿼리"에 `debug=1` (예: `#/play/shiba-shrine?debug=1`) — 라우터
 *     자체는 이 쿼리를 모르므로(router.ts의 parseHash는 경로만 본다) 여기서 직접 다시 읽는다.
 *  3. localStorage['tgslot.debug'] === '1' (게임 제목 5탭 제스처로 여기 저장된다)
 */
export const DEBUG_STORAGE_KEY = 'tgslot.debug'

/** "#/play/shiba-shrine?debug=1"의 "?debug=1" 부분만 골라 파싱한다. 쿼리가 없으면 빈 문자열. */
function hashQuery(hash: string): string {
  const queryIndex = hash.indexOf('?')
  return queryIndex === -1 ? '' : hash.slice(queryIndex + 1)
}

function readLocalStorageFlag(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 꺼진 것으로 취급한다.
    return false
  }
}

/** 지금 이 순간 디버그 패널을 켜야 하는지. 마운트 시 한 번 읽는 용도(반응형 구독 아님). */
export function detectDebugFlag(): boolean {
  if (typeof window === 'undefined') return false
  const search = new URLSearchParams(window.location.search)
  if (search.get('debug') === '1') return true
  const hashSearch = new URLSearchParams(hashQuery(window.location.hash))
  if (hashSearch.get('debug') === '1') return true
  return readLocalStorageFlag()
}

/** 게임 제목 5탭 제스처 등으로 디버그 패널을 켜고 끌 때 쓴다. 껐다 켜도 URL 값과는 무관하게 남는다. */
export function writeStoredDebugFlag(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(DEBUG_STORAGE_KEY, '1')
    else localStorage.removeItem(DEBUG_STORAGE_KEY)
  } catch {
    /* localStorage 접근 불가 — 이번 세션 동안은 메모리 상태(호출부의 useState)만으로 계속 진행 */
  }
}
