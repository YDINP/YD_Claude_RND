'use client';

import { getStageStars, isStageUnlocked } from '@/lib/storage';
import { STAGES, TOTAL_STAGES } from '@/lib/stages';

const GRADE_LABEL: Record<string, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
  expert: '전문가',
};

const GRADE_COLOR: Record<string, string> = {
  easy: '#22c55e',
  medium: '#3b82f6',
  hard: '#f59e0b',
  expert: '#ef4444',
};

interface StageMapProps {
  onBack: () => void;
  onSelectStage: (stageNumber: number) => void;
}

export default function StageMap({ onBack, onSelectStage }: StageMapProps) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* 헤더 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '460px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="홈으로 돌아가기"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ← 홈
        </button>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
            }}
          >
            스테이지 모드
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            전체 {TOTAL_STAGES}스테이지
          </div>
        </div>
        <div style={{ width: 64 }} />
      </header>

      {/* 스테이지 그리드 */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
        }}
      >
        {STAGES.map((rule, idx) => {
          const stageNumber = idx + 1;
          const unlocked = isStageUnlocked(stageNumber);
          const stars = getStageStars(stageNumber);
          const gradeColor = GRADE_COLOR[rule.grade] ?? 'var(--text-muted)';

          return (
            <button
              key={stageNumber}
              onClick={() => unlocked && onSelectStage(stageNumber)}
              disabled={!unlocked}
              aria-label={
                unlocked
                  ? `스테이지 ${stageNumber} (${GRADE_LABEL[rule.grade]})${stars > 0 ? ` - ${stars}성` : ''}`
                  : `스테이지 ${stageNumber} - 잠김`
              }
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '12px 6px',
                borderRadius: 'var(--radius-md)',
                border: unlocked
                  ? stars > 0
                    ? `1.5px solid ${gradeColor}40`
                    : '1.5px solid var(--border-default)'
                  : '1.5px solid var(--border-subtle)',
                background: unlocked
                  ? stars > 0
                    ? `${gradeColor}08`
                    : 'var(--bg-surface)'
                  : 'transparent',
                cursor: unlocked ? 'pointer' : 'not-allowed',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                opacity: unlocked ? 1 : 0.4,
                transition: 'border-color 0.12s ease, background 0.12s ease',
                minHeight: 80,
              }}
            >
              {unlocked ? (
                <>
                  {/* 스테이지 번호 */}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {stageNumber}
                  </span>

                  {/* 난이도 뱃지 */}
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: gradeColor,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {GRADE_LABEL[rule.grade]}
                  </span>

                  {/* 별 */}
                  {stars > 0 ? (
                    <div style={{ display: 'flex', gap: 1 }}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 10,
                            opacity: i < stars ? 1 : 0.2,
                          }}
                        >
                          ⭐
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ height: 14 }} />
                  )}
                </>
              ) : (
                <span style={{ fontSize: 18, opacity: 0.5 }}>🔒</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 하단 안내 */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '0 16px 32px',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            스테이지를 클리어하면 다음 스테이지가 해금됩니다.
            제출 횟수가 적을수록 높은 별 등급을 받습니다 (1회 제출 = ⭐⭐⭐).
          </p>
        </div>
      </div>
    </div>
  );
}
