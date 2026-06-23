'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Board as BoardType, Cell } from '@/lib/types';
import type { Feedback } from '@/lib/engine';
import TileGlyph from './TileGlyph';

interface BoardProps {
  board: BoardType;
  feedback: Feedback;
  onCellTap: (r: number, c: number) => void;
  lastViolated?: { r: number; c: number } | null;
}

export default function Board({ board, feedback, onCellTap, lastViolated }: BoardProps) {
  const [shakeCells, setShakeCells] = useState<Set<string>>(new Set());
  const prevViolatedRef = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => {
    if (!lastViolated) return;
    const key = `${lastViolated.r}-${lastViolated.c}`;
    const prev = prevViolatedRef.current;
    // 동일한 셀이 연속으로 shake 트리거될 수 있도록 항상 갱신
    if (prev?.r !== lastViolated.r || prev?.c !== lastViolated.c) {
      prevViolatedRef.current = lastViolated;
    }
    setShakeCells(new Set([key]));
    const t = setTimeout(() => {
      setShakeCells(new Set());
    }, 420);
    return () => clearTimeout(t);
  }, [lastViolated]);

  const handleTap = useCallback(
    (r: number, c: number) => {
      onCellTap(r, c);
    },
    [onCellTap]
  );

  return (
    <div
      role="grid"
      aria-label="5×5 게임 보드"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 'var(--cell-gap)',
        width: '100%',
        maxWidth: '320px',
        aspectRatio: '1 / 1',
        margin: '0 auto',
      }}
    >
      {board.map((row, r) =>
        row.map((cell, c) => {
          const fb = feedback[r][c];
          const isPass = fb === true;
          const isFail = fb === false;
          const key = `${r}-${c}`;
          const isShaking = shakeCells.has(key);

          return (
            <BoardCell
              key={key}
              cell={cell}
              isPass={isPass}
              isFail={isFail}
              isShaking={isShaking}
              onTap={() => handleTap(r, c)}
              row={r}
              col={c}
            />
          );
        })
      )}
    </div>
  );
}

interface BoardCellProps {
  cell: Cell;
  isPass: boolean;
  isFail: boolean;
  isShaking: boolean;
  onTap: () => void;
  row: number;
  col: number;
}

function BoardCell({ cell, isPass, isFail, isShaking, onTap, row, col }: BoardCellProps) {
  const ringColor = isPass
    ? 'var(--feedback-pass)'
    : isFail
    ? 'var(--feedback-fail)'
    : 'var(--border-default)';

  const bgColor = isPass
    ? 'rgba(34,197,94,0.08)'
    : isFail
    ? 'rgba(239,68,68,0.08)'
    : 'var(--bg-surface)';

  const boxShadow = isPass
    ? '0 0 0 2px var(--feedback-pass), 0 0 10px var(--feedback-pass-glow)'
    : isFail
    ? '0 0 0 2px var(--feedback-fail)'
    : '0 0 0 1.5px var(--border-default)';

  return (
    <button
      role="gridcell"
      aria-label={
        cell
          ? `${row + 1}행 ${col + 1}열: ${cell.color} ${cell.shape}${isPass ? ' (규칙 준수)' : isFail ? ' (규칙 위반)' : ''}`
          : `${row + 1}행 ${col + 1}열: 빈 칸`
      }
      aria-pressed={cell !== null}
      onClick={onTap}
      className={isShaking ? 'animate-shake' : ''}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '44px',
        minHeight: '44px',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        cursor: 'pointer',
        background: bgColor,
        boxShadow,
        transition: 'box-shadow 0.15s ease, background 0.15s ease',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {cell ? (
        <TileGlyph color={cell.color} shape={cell.shape} size={28} />
      ) : (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--border-subtle)',
            display: 'block',
          }}
        />
      )}
    </button>
  );
}
