import { Hono } from 'hono'
import type { GamesResponse } from '@tgslot/shared'
import { listVisibleGames } from '../games/registry.js'

export function createGamesRoute(): Hono {
  const route = new Hono()

  route.get('/', (c) => {
    const response: GamesResponse = { games: listVisibleGames() }
    return c.json(response, 200)
  })

  return route
}
