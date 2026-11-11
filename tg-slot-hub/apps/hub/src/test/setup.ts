/**
 * Vitest + jsdom 전역 설정 — jest-dom 커스텀 매처(toBeInTheDocument 등) 등록
 */
import '@testing-library/jest-dom/vitest'

// 앱 기본 언어는 ko지만 컴포넌트 테스트는 en 문구로 쓰여 있다. 설정 스토어가 처음 읽기 전에 en을 심어 둔다.
localStorage.setItem('tgslot.settings', JSON.stringify({ locale: 'en' }))
