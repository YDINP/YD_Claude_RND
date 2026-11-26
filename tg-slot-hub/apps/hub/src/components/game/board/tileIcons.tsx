/**
 * 말판 칸 아이콘 — 전부 코드로 그린 SVG(생성 그림을 쓰지 않는다). 28~32px 작은 크기에서 선명하고, 상태(지나감·함정·
 * 점등)에 따라 색을 바꿀 수 있어서다. 원점 중심의 `<g>`라 말판 SVG 안에서도, 도움말의 작은 `<svg>`에서도 같은 걸 쓴다.
 *
 * 팔레트는 기획서 §8-1의 오방색: 적 #d8433c · 청 #2f6fb0 · 황 #e8c34a · 백 #f2ece0 · 흑 #1c1a18 · 등불 #ffb765 · 밤 #1f2440.
 */
import type { ReactNode } from 'react'
import type { BoardTileKind } from '@tgslot/shared'

export const BOARD_COLORS = {
  red: '#d8433c',
  blue: '#2f6fb0',
  yellow: '#e8c34a',
  ivory: '#f2ece0',
  ink: '#1c1a18',
  lantern: '#ffb765',
  night: '#1f2440',
  mat: '#b98a4a',
} as const

const C = BOARD_COLORS

/** 엽전: 둥근 놋쇠 + 네모 구멍. */
export function CoinGlyph(): ReactNode {
  return (
    <g>
      <circle r="11" fill={C.yellow} stroke="#8a6a1a" strokeWidth="1.6" />
      <circle r="8" fill="none" stroke="#b8941f" strokeWidth="0.8" />
      <rect x="-3.6" y="-3.6" width="7.2" height="7.2" fill={C.night} stroke="#8a6a1a" strokeWidth="1" />
    </g>
  )
}

/** 등불: 홍 등불 하나(위아래 마개 + 갈비선 + 술). `겹`이 2면 한 겹 더 뒤에 깐다. */
export function LanternGlyph({ layers = 1, lit = true }: { layers?: number; lit?: boolean }): ReactNode {
  const body = lit ? C.red : '#5a4a52'
  const glow = lit ? C.lantern : '#7a6a72'
  const one = (dx: number, dy: number, key: number): ReactNode => (
    <g key={key} transform={`translate(${dx} ${dy})`}>
      <rect x="-5" y="-11" width="10" height="2.6" rx="1" fill={C.ink} />
      <rect x="-7" y="-9" width="14" height="16" rx="6" fill={body} stroke={C.ink} strokeWidth="1" />
      <ellipse cx="0" cy="-1" rx="3" ry="6.4" fill={glow} opacity={lit ? 0.9 : 0.35} />
      <rect x="-5" y="7" width="10" height="2.6" rx="1" fill={C.ink} />
      <path d="M0 9.6 V13" stroke={C.yellow} strokeWidth="1.4" strokeLinecap="round" />
    </g>
  )
  return layers >= 2 ? (
    <g>
      {one(-4, -2, 0)}
      {one(4, 1, 1)}
    </g>
  ) : (
    one(0, 0, 0)
  )
}

/** 앞으로: 굵은 화살표. */
export function ArrowGlyph(): ReactNode {
  return (
    <g fill="none" stroke={C.ivory} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-9 0 H6" />
      <path d="M1 -7 L8 0 L1 7" />
    </g>
  )
}

/** 한 번 더: 엇갈린 윷가락 두 개. */
export function YutCrossGlyph(): ReactNode {
  return (
    <g>
      <rect x="-3.2" y="-11" width="6.4" height="22" rx="3.2" fill={C.ivory} stroke="#8a7a62" strokeWidth="1" transform="rotate(38)" />
      <rect x="-3.2" y="-11" width="6.4" height="22" rx="3.2" fill="#a9733b" stroke="#5a3b1a" strokeWidth="1" transform="rotate(-38)" />
    </g>
  )
}

/** 함정: 도깨비 바람 소용돌이. */
export function SwirlGlyph(): ReactNode {
  return (
    <g fill="none" stroke="#e7d9ff" strokeWidth="2.2" strokeLinecap="round">
      <path d="M1 0 C3 -3 7 -2 7 2 C7 8 -4 10 -8 3 C-12 -4 -4 -11 4 -9" />
      <path d="M-2 1 C-1 -1 2 -1 2 1" strokeWidth="1.6" />
    </g>
  )
}

/** 출발 멍석: 엮인 짚 무늬. */
export function MatGlyph(): ReactNode {
  return (
    <g stroke="#6b4a1f" strokeWidth="1.2" fill="none" strokeLinecap="round">
      <path d="M-9 -4 H9 M-9 0 H9 M-9 4 H9" />
      <path d="M-4 -7 V7 M0 -7 V7 M4 -7 V7" opacity="0.6" />
    </g>
  )
}

/**
 * 결승 등불탑: 3단 탑 + 꼭대기에 `bonus`(청사초롱) 그림. 그림이 없으면 코드로 그린 작은 초롱이 올라간다.
 * `lit`이면 불빛이 번지고 창이 켜진다(결승 도착).
 */
export function TowerGlyph({ bonusUrl, lit = false }: { bonusUrl?: string | undefined; lit?: boolean }): ReactNode {
  const win = lit ? C.lantern : '#6a5a4a'
  return (
    <g>
      {lit && <circle r="30" fill={C.lantern} opacity="0.28" />}
      {/* 아래 단 */}
      <path d="M-17 22 L17 22 L14 12 L-14 12 Z" fill={C.red} stroke={C.ink} strokeWidth="1.2" />
      <rect x="-6" y="14.5" width="12" height="7" rx="1" fill={win} />
      {/* 가운데 단 */}
      <path d="M-14 10 L14 10 L11 1 L-11 1 Z" fill={C.blue} stroke={C.ink} strokeWidth="1.2" />
      <rect x="-4" y="3" width="8" height="6" rx="1" fill={win} />
      {/* 위 단(지붕) */}
      <path d="M-11 -1 L11 -1 L7 -9 L-7 -9 Z" fill={C.yellow} stroke={C.ink} strokeWidth="1.2" />
      <path d="M-9 -9 Q0 -17 9 -9" fill={C.red} stroke={C.ink} strokeWidth="1.2" />
      {bonusUrl !== undefined ? (
        <image href={bonusUrl} x="-11" y="-31" width="22" height="22" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <g transform="translate(0 -20) scale(0.8)">
          <LanternGlyph lit={lit} />
        </g>
      )}
    </g>
  )
}

/** 칸 종류 → 글리프(값 없이 그림만). 도움말의 칸 종류 줄에서 쓴다. */
export function TileGlyph({ kind, bonusUrl }: { kind: BoardTileKind; bonusUrl?: string | undefined }): ReactNode {
  switch (kind) {
    case 'coin':
      return <CoinGlyph />
    case 'mult':
      return <LanternGlyph layers={2} />
    case 'forward':
      return <ArrowGlyph />
    case 'again':
      return <YutCrossGlyph />
    case 'trap':
      return <SwirlGlyph />
    case 'goal':
      return <TowerGlyph bonusUrl={bonusUrl} />
    case 'start':
      return <MatGlyph />
  }
}

/** 칸 종류별 바탕색(칸 원). */
export const TILE_FILL: Record<BoardTileKind, { fill: string; stroke: string; text: string }> = {
  coin: { fill: '#f4d36a', stroke: '#8a6a1a', text: '#4a300a' },
  mult: { fill: C.red, stroke: '#7a1f1b', text: C.ivory },
  forward: { fill: C.blue, stroke: '#173a5e', text: C.ivory },
  again: { fill: C.ivory, stroke: '#8a7a62', text: C.ink },
  trap: { fill: '#2a2340', stroke: C.red, text: '#e7d9ff' },
  goal: { fill: C.night, stroke: C.yellow, text: C.yellow },
  start: { fill: C.mat, stroke: '#6b4a1f', text: C.ink },
}
