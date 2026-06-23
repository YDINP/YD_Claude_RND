// ── 스테이지 커리큘럼 ──────────────────────────────────────────
//
// 데일리(하루 1판)와 별개로, 난이도 순으로 계속 도전하는 끝없는 모드.
// 규칙을 difficulty 오름차순으로 정렬한 것이 곧 스테이지 진행.

import { RULES } from './rules';
import { RuleDef } from './types';

/** 난이도 오름차순 정렬된 스테이지 목록 (동률은 id로 안정 정렬) */
export const STAGES: RuleDef[] = [...RULES].sort(
  (a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id)
);

export const TOTAL_STAGES = STAGES.length;

/** 1-based 스테이지 번호 → 규칙 */
export function getStageRule(stageNumber: number): RuleDef | null {
  return STAGES[stageNumber - 1] ?? null;
}

/** 스테이지별 결정론적 예시 시드 (데일리와 충돌하지 않도록 별도 공간) */
export function stageSeed(stageNumber: number): number {
  return (Math.imul(stageNumber, 2654435761) ^ 0x9e3779b9) >>> 0;
}
