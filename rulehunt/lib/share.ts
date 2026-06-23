// ── 결과 공유: Wordle식 이모지 그리드 생성 ─────────────────────────

import { Board } from './types';
import { Feedback, starRating } from './engine';

const STAR = '⭐';

/**
 * 최종 클리어 보드의 피드백을 이모지 그리드로 변환.
 * 🟩 = 규칙 준수, 🟥 = 위반, ⬛ = 빈 칸
 */
export function feedbackToEmoji(feedback: Feedback): string {
  return feedback
    .map((row) => row.map((f) => (f === null ? '⬛' : f ? '🟩' : '🟥')).join(''))
    .join('\n');
}

export interface ShareOptions {
  puzzleNumber: number;
  attempts: number;
  streak?: number;
  cleared: boolean;
  feedback: Feedback;
  url?: string;
}

/** 공유용 텍스트 전체 생성 (규칙 내용은 절대 노출하지 않음) */
export function buildShareText(opts: ShareOptions): string {
  const { puzzleNumber, attempts, streak, cleared, feedback, url } = opts;
  const lines: string[] = [];
  lines.push(`오늘의 규칙 #${puzzleNumber} 🔍`);
  lines.push(feedbackToEmoji(feedback));
  if (cleared) {
    const stars = STAR.repeat(starRating(attempts));
    lines.push(`시도: ${attempts}회 | ${stars}`);
  } else {
    lines.push(`시도: ${attempts}회 | 미해결`);
  }
  if (streak && streak > 1) lines.push(`🔥 ${streak}일 연속!`);
  lines.push(url ?? 'rulehunt.today');
  return lines.join('\n');
}

// 보드 자체를 직접 쓰진 않지만, 호출부 편의를 위해 재노출
export type { Board };
