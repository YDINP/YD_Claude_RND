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
  // 여기 도달했다는 것은 프로덕션이 아니라는 뜻이다 (`loadConfig`가 프로덕션에서 DATABASE_URL
  // 없이 뜨는 것을 막는다). in-memory 레포는 프로세스 메모리에만 살아서 인스턴스를 여러 개 띄우면
  // 지갑이 인스턴스마다 갈라지고, `spin/lock.ts`의 인프로세스 락도 경계를 넘지 못해 이중 차감
  // 방어가 통째로 사라진다 — 즉 **단일 인스턴스 전용**이다.
  console.log('[repos] DATABASE_URL not set -> using in-memory repos (단일 인스턴스 dev/test 전용)')
  return new MemoryRepos()
}
