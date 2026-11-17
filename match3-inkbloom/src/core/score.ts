import { POINT_CLEAR } from './constants'

export const stepPoints = (count: number, chain: number): number => Math.floor((count * POINT_CLEAR * (chain + 1)) / 2)
