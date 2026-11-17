export const W = 8
export const H = 8
export const N = W * H
export const COLORS = 5
export const MOVES = 12
export const GOAL_PCT = 95
export const MIN_MATCH = 3
export const BRUSH_RUN = 5
export const BRUSH_STAIN_COLOR = 4
export const MAX_CHAIN = 50
export const POINT_CLEAR = 10
export const POINT_SAME = 15
export const BONUS_PER_MOVE = 100
export const INIT_RETRIES = 100
export const SHUFFLE_RETRIES = 50

export const isGoal = (stained: number): boolean => stained * 100 >= GOAL_PCT * N
