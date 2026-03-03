import type { Config } from 'drizzle-kit';

export default {
  schema: './server/db/schema.d1.ts',
  out: './drizzle/d1-migrations',
  dialect: 'sqlite',
} satisfies Config;
