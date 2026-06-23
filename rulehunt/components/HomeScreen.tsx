'use client';

import type { DailyInfo } from '@/lib/daily';
import { getDayResult, getStageState } from '@/lib/storage';
import { effectiveStreak } from '@/lib/storage';
import { TOTAL_STAGES } from '@/lib/stages';

interface HomeScreenProps {
  daily: DailyInfo;
  onPlayDaily: () => void;
  onPlayStage: () => void;
}

export default function HomeScreen({ daily, onPlayDaily, onPlayStage }: HomeScreenProps) {
  const dayResult = getDayResult(daily.dateStr);
  const stageState = getStageState();
  const streak = effectiveStreak(daily.dateStr);

  const dailyCleared = dayResult?.cleared ?? false;
  const dailyAttempts = dayResult?.attempts ?? 0;

  const clearedStages = Math.max(0, stageState.maxUnlocked - 1);
  const stageProgress = TOTAL_STAGES > 0 ? clearedStages / TOTAL_STAGES : 0;

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 16px 48px',
      }}
    >
      {/* 헤더 */}
      <header
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '20px 0 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: 'var(--text-primary)',
              letterSpacing: '-0.05em',
              lineHeight: 1.1,
            }}
          >
            오늘의 규칙
          </h1>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 3,
              letterSpacing: '-0.01em',
            }}
          >
            숨겨진 규칙을 증거로 추론하세요
          </p>
        </div>
        <div style={{ fontSize: 28 }}>🔍</div>
      </header>

      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* 카드 A: 오늘의 규칙 (데일리) */}
        <button
          onClick={onPlayDaily}
          aria-label={`오늘의 규칙 ${dailyCleared ? '(완료)' : '도전하기'}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '20px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-surface)',
            border: `1.5px solid ${dailyCleared ? 'rgba(34,197,94,0.4)' : 'var(--border-default)'}`,
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            textAlign: 'left',
            transition: 'border-color 0.15s ease, background 0.15s ease',
          }}
        >
          {/* 상단: 라벨 + 상태 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                }}
              >
                데일리 퍼즐
              </div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.04em',
                }}
              >
                #{daily.puzzleNumber}
              </div>
            </div>

            {dailyCleared ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 20,
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.3)',
                }}
              >
                <span style={{ fontSize: 14 }}>✓</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--feedback-pass)',
                  }}
                >
                  완료
                </span>
              </div>
            ) : (
              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: 'var(--text-primary)',
                  color: '#0d0d0d',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                도전
              </div>
            )}
          </div>

          {/* 하단: 스트릭 + 시도횟수 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {streak > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: 'rgba(234,179,8,0.1)',
                  border: '1px solid rgba(234,179,8,0.2)',
                }}
              >
                <span style={{ fontSize: 13 }}>🔥</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#eab308',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {streak}일 연속
                </span>
              </div>
            )}
            {dailyCleared && dailyAttempts > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                제출 {dailyAttempts}회
              </span>
            )}
            {!dailyCleared && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                증거를 보고 규칙을 추론하세요
              </span>
            )}
          </div>
        </button>

        {/* 카드 B: 스테이지 모드 */}
        <button
          onClick={onPlayStage}
          aria-label="스테이지 모드 도전하기"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '20px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-surface)',
            border: '1.5px solid var(--border-default)',
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            textAlign: 'left',
            transition: 'border-color 0.15s ease',
          }}
        >
          {/* 상단 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                }}
              >
                스테이지 모드
              </div>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.04em',
                }}
              >
                {clearedStages} / {TOTAL_STAGES}
              </div>
            </div>
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              선택
            </div>
          </div>

          {/* 진행 바 */}
          <div>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: 'var(--border-subtle)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background: 'var(--text-primary)',
                  width: `${stageProgress * 100}%`,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 5,
              }}
            >
              난이도 순 끝없는 도전
            </div>
          </div>
        </button>

        {/* 하단 안내 */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              letterSpacing: '-0.01em',
            }}
          >
            ✓/✗ 예시 보드를 보고 숨겨진 규칙을 추론하세요.
            보드를 채운 뒤 제출하면 결과를 알 수 있습니다.
            제출 횟수가 적을수록 높은 별 등급을 받습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
