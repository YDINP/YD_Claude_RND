import type { ApiConfig } from '../config.js'
import { createDbClient } from '../db/client.js'
import { DrizzleRepos } from './drizzle.js'
import { MemoryRepos } from './memory.js'
import type { Repos } from './types.js'

export function createRepos(config: Pick<ApiConfig, 'databaseUrl'>): Repos {
  if (config.databaseUrl) {
    console.log('[repos] DATABASE_URL set -> using Postgres (drizzle) repos')
    const db = createDbClient(config.databaseUrl)
    return new DrizzleRepos(db)
  }
  console.log('[repos] DATABASE_URL not set -> using in-memory repos')
  return new MemoryRepos()
}
