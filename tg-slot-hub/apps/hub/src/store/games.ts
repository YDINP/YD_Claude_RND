/**
 * 로비 게임 목록 스토어
 */
import { create } from 'zustand'
import type { GameSummary } from '@tgslot/shared'
import { getGames, ApiClientError } from '../sdk/api'

export type GamesStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface GamesState {
  status: GamesStatus
  games: GameSummary[]
  errorMessage: string | null
}

export interface GamesActions {
  load: () => Promise<void>
}

export type GamesStore = GamesState & GamesActions

export const useGamesStore = create<GamesStore>((set, get) => ({
  status: 'idle',
  games: [],
  errorMessage: null,

  async load() {
    if (get().status === 'loading') return
    set({ status: 'loading', errorMessage: null })
    try {
      const res = await getGames()
      set({ status: 'ready', games: res.games })
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : '게임 목록을 불러오지 못했습니다'
      set({ status: 'error', errorMessage: message })
    }
  },
}))
