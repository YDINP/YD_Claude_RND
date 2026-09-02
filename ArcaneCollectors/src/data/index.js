/**
 * DEPRECATED legacy shim (C-1.x 정리)
 *
 * 이 파일은 mood 시스템(v3) 이전의 element 기반 구버전 데이터 접근 모듈이었다.
 * 현재 실제 구현은 index.ts이며, Vite/Vitest 해석 순서에 따라 .js/.ts 중
 * 어느 쪽이 로드되더라도 동일한 API가 노출되도록 순수 재-export shim으로 교체했다.
 * (getCharacterOrHero 등 확장 export는 index.ts 참조)
 */
export * from './index.ts';
