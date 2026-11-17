import type { OrderLine } from './types'
import { BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW } from './types'

export interface Level { moves: number; order: OrderLine[] }

const o = (...pairs: [number, number][]): OrderLine[] => pairs.map(([color, need]) => ({ color, need }))

export const LEVELS: Level[] = [
  { moves: 12, order: o([RED, 12]) },
  { moves: 12, order: o([YELLOW, 14]) },
  { moves: 12, order: o([BLUE, 16]) },
  { moves: 13, order: o([RED, 13], [BLUE, 12]) },
  { moves: 13, order: o([ORANGE, 9]) },
  { moves: 14, order: o([GREEN, 10]) },
  { moves: 16, order: o([RED, 11], [GREEN, 9]) },
  { moves: 15, order: o([ORANGE, 8], [PURPLE, 7]) },
  { moves: 18, order: o([PURPLE, 10], [YELLOW, 9]) },
  { moves: 18, order: o([ORANGE, 7], [GREEN, 7], [PURPLE, 6]) },
]

export const levelAt = (i: number): Level => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))]!
