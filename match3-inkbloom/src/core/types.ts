export type Cell = number
export const EMPTY = -1
export const NO_FLOOR = -1

export const RED = 0
export const YELLOW = 1
export const BLUE = 2
export const ORANGE = 3
export const GREEN = 4
export const PURPLE = 5
export const NO_COLOR = -1

export const KIND_NORMAL = 0
export const KIND_ROW = 1
export const KIND_COL = 2
export const KIND_BUCKET = 3
export const KIND_STRIDE = 8
export const BRUSH = 40

export const makePiece = (color: number, kind: number): number => kind * KIND_STRIDE + color
export const isColored = (p: number): boolean => p >= 0 && p < BRUSH
export const colorOf = (p: number): number => (isColored(p) ? p % KIND_STRIDE : NO_COLOR)
export const kindOf = (p: number): number => (isColored(p) ? Math.floor(p / KIND_STRIDE) : -1)
export const isSpecial = (p: number): boolean => p === BRUSH || (isColored(p) && kindOf(p) !== KIND_NORMAL)

export interface StainChange { cell: Cell; from: number; to: number; src: 'clear' | 'spread' | 'brush' }
export interface MatchGroup { color: number; cells: Cell[]; maxRun: number; spread: 0 | 1 | 2 }
export type FireShape = 'row' | 'col' | 'cross' | 'box' | 'color'
export interface Fire { at: Cell; color: number; cells: Cell[]; shape: FireShape; brush: boolean }
export interface OrderLine { color: number; need: number }
export interface OrderProgress extends OrderLine { have: number }

export interface ClearEvent {
  k: 'clear'
  chain: number
  groups: MatchGroup[]
  fires: Fire[]
  cleared: Cell[]
  stains: StainChange[]
  created: { cell: Cell; piece: number }[]
  collected: number[]
  points: number
}

export type TurnEvent =
  | { k: 'swap'; a: Cell; b: Cell; valid: boolean }
  | { k: 'mix'; from: Cell; to: Cell; piece: number }
  | ClearEvent
  | { k: 'fall'; moves: { from: Cell; to: Cell }[] }
  | { k: 'refill'; spawns: { cell: Cell; piece: number; rowsAbove: number }[] }
  | { k: 'shuffle'; moves: { from: Cell; to: Cell }[]; recolor: boolean }
  | { k: 'end'; result: 'win' | 'lose' | 'continue'; progress: OrderProgress[]; bonus: number; stars: number; mixes: number }

export interface TurnResult { events: TurnEvent[]; score: number; movesLeft: number }
export type Status = 'playing' | 'win' | 'lose'
export interface Snapshot { pieces: number[]; floor: number[]; collected: number[]; score: number; movesLeft: number; mixes: number; status: Status }
