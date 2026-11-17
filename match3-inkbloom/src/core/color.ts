import { BLUE, GREEN, MUDDY, NO_FLOOR, ORANGE, PURPLE, RED, YELLOW } from './types'

export const isPrimary = (f: number): boolean => f >= RED && f <= BLUE
export const isSecondary = (f: number): boolean => f >= ORANGE && f <= PURPLE

const SECONDARY: Record<number, number> = { [RED | (YELLOW << 2)]: ORANGE, [YELLOW | (BLUE << 2)]: GREEN, [RED | (BLUE << 2)]: PURPLE }

export function blend(a: number, b: number): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return SECONDARY[lo | (hi << 2)]!
}

export function mix(f: number, c: number): number {
  if (f === NO_FLOOR) return c
  if (isPrimary(f)) return f === c ? f : blend(f, c)
  return MUDDY
}

export function wash(f: number, base: number): number {
  return isSecondary(f) ? base : NO_FLOOR
}
