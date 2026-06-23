'use client';

import type { Board } from '@/lib/types';
import TileGlyph from './TileGlyph';

interface ExampleBoardProps {
  board: Board;
  /** true = ✓ 규칙 준수, false = ✗ 규칙 위반 */
  valid: boolean;
  size?: number;
}

/**
 * 읽기 전용 미니 5x5 보드.
 * ✓ → 초록 테두리, ✗ → 빨강 테두리.
 * 빈 칸은 옅은 점으로 표시.
 */
export default function ExampleBoard({ board, valid, size = 130 }: ExampleBoardProps) {
  const accent = valid ? 'var(--feedback-pass)' : 'var(--feedback-fail)';
  const accentBg = valid ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
  const PAD = 8; // 양쪽 패딩
  const gap = 3;
  // 셀 크기 = (전체 - 양쪽패딩 - 4개 간격) / 5  ← 간격을 빼야 그리드가 프레임을 벗어나지 않음
  const cellSize = (size - PAD * 2 - gap * 4) / 5;

  return (
    <div
      aria-label={`${valid ? '규칙 준수' : '규칙 위반'} 예시 보드`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        borderRadius: 'var(--radius-md)',
        background: accentBg,
        border: `1.5px solid ${accent}`,
        width: size,
        flexShrink: 0,
      }}
    >
      {/* 뱃지 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: accent,
            letterSpacing: '0.05em',
          }}
        >
          {valid ? '✓ 준수' : '✗ 위반'}
        </span>
      </div>

      {/* 그리드 */}
      <div
        role="img"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(5, ${cellSize}px)`,
          gridTemplateRows: `repeat(5, ${cellSize}px)`,
          gap,
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 4,
                background: cell ? 'var(--bg-elevated)' : 'transparent',
                border: cell
                  ? '1px solid var(--border-subtle)'
                  : '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cell ? (
                <TileGlyph color={cell.color} shape={cell.shape} size={cellSize * 0.62} />
              ) : (
                <div
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: 'var(--border-subtle)',
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
