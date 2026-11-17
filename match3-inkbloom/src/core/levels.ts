import { isSecondary } from './color'
import type { OrderLine } from './types'
import { BLUE, GREEN, ORANGE, PURPLE, RED, YELLOW } from './types'

export interface Level { moves: number; order: OrderLine[]; spawn: readonly number[]; mixes: number }

const o = (...pairs: [number, number][]): OrderLine[] => pairs.map(([color, need]) => ({ color, need }))
const sp = (secondary: number): number[] => [3, 3, 3, secondary, secondary, secondary]

export const LEVELS: Level[] = [
  { moves: 16, order: o([RED, 24]),                           spawn: sp(1.5), mixes: 0 },
  { moves: 16, order: o([YELLOW, 20], [BLUE, 20]),            spawn: sp(1.5), mixes: 0 },
  { moves: 18, order: o([RED, 20], [ORANGE, 8]),              spawn: sp(0.2), mixes: 3 },
  { moves: 18, order: o([BLUE, 28], [GREEN, 14]),             spawn: sp(0.2), mixes: 3 },
  { moves: 18, order: o([YELLOW, 22], [PURPLE, 14]),          spawn: sp(0.2), mixes: 3 },
  { moves: 18, order: o([ORANGE, 12], [GREEN, 12]),           spawn: sp(0.2), mixes: 3 },
  { moves: 18, order: o([RED, 20], [PURPLE, 16]),             spawn: sp(0.2), mixes: 2 },
  { moves: 18, order: o([ORANGE, 14], [PURPLE, 14]),          spawn: sp(0.2), mixes: 2 },
  { moves: 20, order: o([BLUE, 14], [GREEN, 17], [PURPLE, 17]), spawn: sp(0.2), mixes: 2 },
  { moves: 20, order: o([ORANGE, 15], [GREEN, 15], [PURPLE, 15]), spawn: sp(0.2), mixes: 2 },
]

export const levelAt = (i: number): Level => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))]!

export const needsMix = (lv: Level): boolean => lv.order.some((x) => isSecondary(x.color))

export const firstMixLevel = (): number => LEVELS.findIndex(needsMix)
