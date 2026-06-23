import type { Color, Shape } from '@/lib/types';

interface TileGlyphProps {
  color: Color;
  shape: Shape;
  size?: number;
}

const COLOR_MAP: Record<Color, string> = {
  red:    '#ef4444',
  blue:   '#3b82f6',
  yellow: '#eab308',
  green:  '#22c55e',
};

export default function TileGlyph({ color, shape, size = 32 }: TileGlyphProps) {
  const fill = COLOR_MAP[color];
  const half = size / 2;
  const s = size;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {shape === 'circle' && (
        <circle
          cx={half}
          cy={half}
          r={half * 0.78}
          fill={fill}
        />
      )}

      {shape === 'triangle' && (
        <polygon
          points={`${half},${s * 0.1} ${s * 0.92},${s * 0.88} ${s * 0.08},${s * 0.88}`}
          fill={fill}
        />
      )}

      {shape === 'square' && (
        <rect
          x={s * 0.12}
          y={s * 0.12}
          width={s * 0.76}
          height={s * 0.76}
          rx={s * 0.08}
          fill={fill}
        />
      )}

      {shape === 'star' && (
        <polygon
          points={starPoints(half, half, half * 0.78, half * 0.34, 5)}
          fill={fill}
        />
      )}
    </svg>
  );
}

/** 5각 별 꼭짓점 계산 */
function starPoints(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  const pts: string[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const angle = i * step - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}
