import { W } from '../core/constants'

export interface Layout { w: number; h: number; dpr: number; cell: number; ox: number; oy: number; size: number }

const MAX_DPR = 2

export function computeLayout(cssW: number, cssH: number): Layout {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const pad = Math.max(8, Math.min(cssW, cssH) * 0.032)
  const cell = Math.max(8, Math.floor((Math.min(cssW - pad * 2, cssH - pad * 2) / W) * 4) / 4)
  const size = cell * W
  return { w: cssW, h: cssH, dpr, cell, size, ox: Math.round((cssW - size) / 2), oy: Math.round((cssH - size) / 2) }
}

export function cellAt(l: Layout, x: number, y: number): number {
  const c = Math.floor((x - l.ox) / l.cell)
  const r = Math.floor((y - l.oy) / l.cell)
  return c < 0 || c >= W || r < 0 || r >= W ? -1 : r * W + c
}
