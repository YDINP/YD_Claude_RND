// ── 규칙 진술(단어 조합) 시스템 ────────────────────────────────
//
// 증거 추리형 v3: 보드를 채우는 대신, 증거(✓/✗ 예시 보드)를 보고
// 숨은 규칙을 "단어 칩"으로 조합해 문장으로 진술한다.
//
// 각 규칙은 정답 칩 시퀀스(RULE_PHRASE)를 가진다.
// 팔레트 = 정답 칩 + 함정 칩(다른 규칙들의 칩)을 시드로 섞어 구성.
// 찍기가 불가능하고, 규칙을 정확히 이해해야만 맞출 수 있다.

import { RULES } from './rules';

/** 규칙 id → 정답 문장(칩 텍스트 배열, 순서 있음) */
export const RULE_PHRASE: Record<string, string[]> = {
  // 초급
  'e2-no-star': ['별 모양은', '놓을 수 없다'],
  'e5-no-yellow': ['노란색은', '놓을 수 없다'],
  'e1-red-circle': ['빨간 타일은', '원', '이어야 한다'],
  'e3-green-square': ['초록 타일은', '사각형', '이어야 한다'],
  'e4-blue-even-col': ['파란 타일은', '짝수 열에만', '놓을 수 있다'],
  'e6-triangle-top-row': ['삼각형은', '맨 윗줄에만', '놓을 수 있다'],
  'e7-circle-edge': ['원은', '가장자리에만', '놓을 수 있다'],
  // 중급
  'm1-no-adjacent-same-color': ['상하좌우 이웃은', '같은 색', '일 수 없다'],
  'm2-no-horizontal-same-shape': ['가로 이웃은', '같은 모양', '일 수 없다'],
  'm3-no-vertical-same-color': ['세로 이웃은', '같은 색', '일 수 없다'],
  'm4-blue-not-adjacent-red': ['파랑과 빨강은', '서로 인접', '할 수 없다'],
  'm5-no-diagonal-same-shape': ['대각선 이웃은', '같은 모양', '일 수 없다'],
  'm6-red-circle-blue-square': ['빨강은 원', '파랑은 사각형', '이어야 한다'],
  'm7-strong-adjacency': ['상하좌우 이웃은', '색과 모양이 모두', '달라야 한다'],
  'd1-red-then-blue': ['빨강의 오른쪽은', '파랑', '이어야 한다'],
  // 고급
  'g4-no-3h-same-color': ['같은 색은', '가로로 3연속', '될 수 없다'],
  'g5-no-2x2-same-color': ['2×2 네 칸은', '같은 색', '일 수 없다'],
  'g6-shape-zones': ['왼쪽은 원·사각', '오른쪽은 삼각·별', '이어야 한다'],
  'g1-chessboard-warm-cool': ['체스판처럼', '따뜻한색과 차가운색이', '번갈아야 한다'],
  'g3-ortho-color-diag-shape': ['상하좌우는 색이', '대각선은 모양이', '달라야 한다'],
  'o1-row-color-sorted': ['각 행은', '왼→오로 색 순서', '여야 한다'],
  's1-mirror-color': ['보드의 색이', '좌우 대칭', '이어야 한다'],
  // 전문가
  'g2-color-shape-pairing': ['색마다', '정해진 짝 모양이', '있다'],
  'x1-chessboard-red-circle': ['체스판 색이고', '빨강은 원', '이어야 한다'],
  'x2-king-color-ortho-shape': ['여덟 방향 색이 다르고', '상하좌우 모양도', '달라야 한다'],
  'p1-color-shape-parity': ['색값과 모양값의', '합이 짝수', '여야 한다'],
};

/** 모든 칩 텍스트(중복 제거) — 함정 칩 풀 */
export const ALL_CHIPS: string[] = Array.from(
  new Set(Object.values(RULE_PHRASE).flat())
);

// 빌드 타임 안전장치: 모든 규칙에 정답 문장이 있어야 함
for (const r of RULES) {
  if (!RULE_PHRASE[r.id]) {
    throw new Error(`RULE_PHRASE 누락: ${r.id}`);
  }
}

// ── 시드 셔플 ──────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 정답 칩 배열 (방어적 복사) */
export function answerFor(ruleId: string): string[] {
  return (RULE_PHRASE[ruleId] ?? []).slice();
}

/**
 * 규칙의 칩 팔레트 생성 (정답 칩 + 함정 칩, 시드로 셔플).
 * 같은 시드 → 같은 팔레트 (데일리 전 세계 동일).
 */
export function buildPalette(ruleId: string, seed: number, distractors = 6): string[] {
  const answer = answerFor(ruleId);
  const rng = mulberry32(seed >>> 0);
  const pool = shuffle(
    ALL_CHIPS.filter((c) => !answer.includes(c)),
    rng
  );
  const picked = pool.slice(0, Math.min(distractors, pool.length));
  return shuffle([...answer, ...picked], rng);
}

/**
 * 제출한 칩들이 정답과 일치하는가 — **어순 무관**.
 * 한국어는 어순이 유연하고 각 칩이 의미를 자체적으로 담으므로,
 * 필요한 칩을 정확히 모으면(같은 다중집합) 정답으로 인정한다.
 */
export function checkAnswer(ruleId: string, sequence: string[]): boolean {
  const answer = RULE_PHRASE[ruleId];
  if (!answer || sequence.length !== answer.length) return false;
  const a = [...answer].sort();
  const b = [...sequence].sort();
  return a.every((chip, i) => chip === b[i]);
}

/** 부분 채점: 제출 칩 중 정답에 속하는 칩 개수 (어순 무관 피드백용) */
export function countCorrectPositions(ruleId: string, sequence: string[]): number {
  const answer = RULE_PHRASE[ruleId];
  if (!answer) return 0;
  const remaining = [...answer];
  let n = 0;
  for (const chip of sequence) {
    const idx = remaining.indexOf(chip);
    if (idx !== -1) {
      remaining.splice(idx, 1);
      n++;
    }
  }
  return n;
}
