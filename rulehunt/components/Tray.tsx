'use client';

import type { Color, Shape } from '@/lib/types';
import { COLORS, SHAPES } from '@/lib/types';
import TileGlyph from './TileGlyph';

interface Brush {
  color: Color;
  shape: Shape;
}

interface TrayProps {
  brush: Brush;
  onPick: (brush: Brush) => void;
}

const COLOR_LABELS: Record<Color, string> = {
  red: '빨강',
  blue: '파랑',
  yellow: '노랑',
  green: '초록',
};

const SHAPE_LABELS: Record<Shape, string> = {
  circle: '원',
  triangle: '삼각형',
  square: '사각형',
  star: '별',
};

const COLOR_DOT: Record<Color, string> = {
  red:    '#ef4444',
  blue:   '#3b82f6',
  yellow: '#eab308',
  green:  '#22c55e',
};

export default function Tray({ brush, onPick }: TrayProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
        maxWidth: '320px',
        margin: '0 auto',
      }}
    >
      {/* 색 선택 */}
      <div
        role="radiogroup"
        aria-label="타일 색상 선택"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}
      >
        {COLORS.map((color) => {
          const selected = brush.color === color;
          return (
            <button
              key={color}
              role="radio"
              aria-checked={selected}
              aria-label={`${COLOR_LABELS[color]} 색상 선택`}
              onClick={() => onPick({ ...brush, color })}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                minHeight: '44px',
                padding: '8px 4px',
                borderRadius: 'var(--radius-sm)',
                border: selected
                  ? `2px solid ${COLOR_DOT[color]}`
                  : '2px solid var(--border-subtle)',
                background: selected
                  ? `rgba(${hexToRgb(COLOR_DOT[color])}, 0.12)`
                  : 'var(--bg-surface)',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.12s ease, background 0.12s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: COLOR_DOT[color],
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: selected ? 700 : 400,
                  color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {COLOR_LABELS[color]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 모양 선택 */}
      <div
        role="radiogroup"
        aria-label="타일 모양 선택"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}
      >
        {SHAPES.map((shape) => {
          const selected = brush.shape === shape;
          return (
            <button
              key={shape}
              role="radio"
              aria-checked={selected}
              aria-label={`${SHAPE_LABELS[shape]} 모양 선택`}
              onClick={() => onPick({ ...brush, shape })}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                minHeight: '56px',
                padding: '6px 4px',
                borderRadius: 'var(--radius-sm)',
                border: selected
                  ? '2px solid var(--text-primary)'
                  : '2px solid var(--border-subtle)',
                background: selected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.12s ease, background 0.12s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <TileGlyph color={brush.color} shape={shape} size={26} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: selected ? 700 : 400,
                  color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {SHAPE_LABELS[shape]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 현재 브러시 프리뷰 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <TileGlyph color={brush.color} shape={brush.shape} size={32} />
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 1 }}>현재 선택</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {COLOR_LABELS[brush.color]} {SHAPE_LABELS[brush.shape]}
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return '255,255,255';
  return m.map((h) => parseInt(h, 16)).join(',');
}
