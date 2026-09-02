import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

/** Supabase pooler(pgbouncer)와 함께 쓸 때는 prepared statement를 꺼야 한다. */
export function createDbClient(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false })
  return drizzle(client, { schema })
}

export type DrizzleDb = ReturnType<typeof createDbClient>
