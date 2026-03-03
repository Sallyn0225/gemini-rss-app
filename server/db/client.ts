import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as pgSchema from './schema.pg.js';
import * as d1Schema from './schema.d1.js';
import type { Env } from '../env.js';

export type DbType = 'd1' | 'neon';

export type D1Client = ReturnType<typeof drizzleD1<typeof d1Schema>>;
export type NeonClient = ReturnType<typeof drizzleNeon<typeof pgSchema>>;

export interface DbClient {
  type: DbType;
  d1?: D1Client;
  neon?: NeonClient;
}

export function createDbClient(env: Env): DbClient {
  // Prefer D1 binding if available
  if (env.DB) {
    return {
      type: 'd1',
      d1: drizzleD1(env.DB, { schema: d1Schema }),
    };
  }

  // Fallback to Neon PostgreSQL
  if (env.DATABASE_URL) {
    const sql = neon(env.DATABASE_URL);
    return {
      type: 'neon',
      neon: drizzleNeon(sql, { schema: pgSchema }),
    };
  }

  throw new Error('No database configured: need either D1 binding (env.DB) or DATABASE_URL');
}
