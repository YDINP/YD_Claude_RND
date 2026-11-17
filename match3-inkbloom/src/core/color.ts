import { BLUE, GREEN, NO_COLOR, ORANGE, PURPLE, RED, YELLOW } from './types'

export const isPrimary = (c: number): boolean => c >= RED && c <= BLUE
export const isSecondary = (c: number): boolean => c >= ORANGE && c <= PURPLE

const PARTS: Record<number, [number, number]> = { [ORANGE]: [RED, YELLOW], [GREEN]: [YELLOW, BLUE], [PURPLE]: [RED, BLUE] }

export const partsOf = (c: number): [number, number] | null => PARTS[c] ?? null

export function blend(a: number, b: number): number {
  if (!isPrimary(a) || !isPrimary(b) || a === b) return NO_COLOR
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return lo === RED ? (hi === YELLOW ? ORANGE : PURPLE) : GREEN
}
