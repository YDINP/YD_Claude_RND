export type Cell = number
export const EMPTY = -1
export const BRUSH = 5
export const NO_FLOOR = -1

export interface StainChange { cell: Cell; from: number; to: number; src: 'clear' | 'spread' | 'brush' }
export interface MatchGroup { color: number; cells: Cell[]; maxRun: number; spread: 0 | 1 | 2 }
export interface BrushFire { at: Cell; color: number; cells: Cell[]; cross: boolean }

export interface ClearEvent {
  k: 'clear'
  chain: number
  groups: MatchGroup[]
  brushes: BrushFire[]
  cleared: Cell[]
  stains: StainChange[]
  created: { cell: Cell; piece: number }[]
  points: number
}

export type TurnEvent =
  | { k: 'swap'; a: Cell; b: Cell; valid: boolean }
  | ClearEvent
  | { k: 'fall'; moves: { from: Cell; to: Cell }[] }
  | { k: 'refill'; spawns: { cell: Cell; piece: number; rowsAbove: number }[] }
  | { k: 'shuffle'; moves: { from: Cell; to: Cell }[]; recolor: boolean }
  | { k: 'end'; result: 'win' | 'lose' | 'continue'; stained: number; bonus: number }

export interface TurnResult { events: TurnEvent[]; score: number; movesLeft: number }
export type Status = 'playing' | 'win' | 'lose'
export interface Snapshot { pieces: number[]; floor: number[]; score: number; movesLeft: number; status: Status }
