'use client';

interface HudProps {
  puzzleNumber: number;
  themeLabel: string;
  mistakes: number;
  streak: number;
  hintsShown: number;
  onHintClick: () => void;
  cleared: boolean;
}

export default function Hud({
  puzzleNumber,
  themeLabel,
  mistakes,
  streak,
  hintsShown,
  onHintClick,
  cleared,
}: HudProps) {
  const hintAvailable = !cleared && hintsShown < 3;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '460px',
        margin: '0 auto',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* 왼쪽: 퍼즐 번호 + 테마 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          #{puzzleNumber}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.02em',
          }}
        >
          {themeLabel}의 날
        </span>
      </div>

      {/* 가운데: 시도 횟수 + 스트릭 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* 시도 횟수 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 3,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {mistakes}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>회</span>
        </div>

        {/* 스트릭 */}
        {streak > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 8px',
              borderRadius: 20,
              background: 'rgba(234,179,8,0.1)',
              border: '1px solid rgba(234,179,8,0.25)',
            }}
          >
            <span style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#eab308', fontVariantNumeric: 'tabular-nums' }}>
              {streak}
            </span>
          </div>
        )}
      </div>

      {/* 오른쪽: 힌트 버튼 */}
      <button
        onClick={onHintClick}
        disabled={!hintAvailable}
        aria-label={
          cleared
            ? '클리어 완료'
            : hintsShown >= 3
            ? '힌트를 모두 사용했습니다'
            : `힌트 보기 (${hintsShown}/3 사용)`
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '7px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
          background: hintAvailable ? 'var(--bg-elevated)' : 'transparent',
          color: hintAvailable ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: hintAvailable ? 'pointer' : 'not-allowed',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'inherit',
          letterSpacing: '-0.01em',
          transition: 'background 0.12s ease, opacity 0.12s ease',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          opacity: hintAvailable ? 1 : 0.4,
        }}
      >
        <span style={{ fontSize: 14 }}>💡</span>
        <span>힌트</span>
        {!cleared && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
            }}
          >
            {hintsShown}/3
          </span>
        )}
      </button>
    </header>
  );
}
