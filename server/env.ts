/**
 * Cloudflare Workers/Pages environment bindings type definition.
 */
export interface Env {
  // D1 database binding (SQLite, preferred)
  DB?: D1Database;

  // Neon PostgreSQL connection string (fallback)
  DATABASE_URL?: string;

  // Admin secret for feed management endpoints
  ADMIN_SECRET?: string;

  // KV namespace for distributed rate limiting
  RATE_LIMIT_KV?: KVNamespace;

  // Max proxied media size in bytes (default 50MB)
  MEDIA_PROXY_MAX_BYTES?: string;
}
