import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEBUG_STORAGE_KEY, detectDebugFlag, writeStoredDebugFlag } from './debugFlag'

function setLocation(hash: string, search = ''): void {
  // pathname을 항상 명시한다 — "#/..."만 넘기면(jsdom의 history.replaceState) 해시만 바뀌고
  // 이전 테스트가 남긴 search가 그대로 남는다(진짜 버그를 잡을 뻔했다: 실제로 처음엔 이 헬퍼가
  // 그렇게 짜여 있어서 "ignores unrelated hash query params" 테스트가 이전 테스트의 ?debug=1을
  // 이어받아 실패했다).
  window.history.replaceState(null, '', `/${search}${hash}`)
}

describe('detectDebugFlag', () => {
  beforeEach(() => {
    localStorage.clear()
    setLocation('#/play/classic-777')
  })

  afterEach(() => {
    localStorage.clear()
    setLocation('#/')
  })

  it('is false with no query, hash query, or stored flag', () => {
    expect(detectDebugFlag()).toBe(false)
  })

  it('is true when the real query string has debug=1', () => {
    setLocation('#/play/classic-777', '?debug=1')
    expect(detectDebugFlag()).toBe(true)
  })

  it('is true when the hash query has debug=1 (e.g. "#/play/shiba-shrine?debug=1")', () => {
    setLocation('#/play/shiba-shrine?debug=1')
    expect(detectDebugFlag()).toBe(true)
  })

  it('ignores unrelated hash query params', () => {
    setLocation('#/play/shiba-shrine?foo=1')
    expect(detectDebugFlag()).toBe(false)
  })

  it('is true when localStorage has the stored flag', () => {
    localStorage.setItem(DEBUG_STORAGE_KEY, '1')
    expect(detectDebugFlag()).toBe(true)
  })

  it('is false when the stored flag is any value other than "1"', () => {
    localStorage.setItem(DEBUG_STORAGE_KEY, 'true')
    expect(detectDebugFlag()).toBe(false)
  })
})

describe('writeStoredDebugFlag', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('stores "1" when enabling', () => {
    writeStoredDebugFlag(true)
    expect(localStorage.getItem(DEBUG_STORAGE_KEY)).toBe('1')
  })

  it('removes the key when disabling', () => {
    localStorage.setItem(DEBUG_STORAGE_KEY, '1')
    writeStoredDebugFlag(false)
    expect(localStorage.getItem(DEBUG_STORAGE_KEY)).toBeNull()
  })
})
