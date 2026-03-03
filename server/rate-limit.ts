/**
 * Rate limiter abstraction with KV and in-memory implementations.
 */

export interface RateLimiter {
  /** Returns true if the request should be rate-limited (rejected). */
  check(key: string, maxRequests: number, windowMs: number): Promise<boolean>;
}

/**
 * KV-backed distributed rate limiter for Cloudflare Workers.
 * Uses expirationTtl for automatic key cleanup.
 */
export class KVRateLimiter implements RateLimiter {
  constructor(private kv: KVNamespace) {}

  async check(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    const kvKey = `rl:${key}`;
    const ttlSeconds = Math.ceil(windowMs / 1000);

    const raw = await this.kv.get(kvKey);
    const entry: { start: number; count: number } = raw
      ? JSON.parse(raw)
      : { start: Date.now(), count: 0 };

    const now = Date.now();
    // Window expired — reset
    if (now - entry.start >= windowMs) {
      entry.start = now;
      entry.count = 1;
      await this.kv.put(kvKey, JSON.stringify(entry), { expirationTtl: ttlSeconds });
      return false;
    }

    entry.count += 1;
    await this.kv.put(kvKey, JSON.stringify(entry), { expirationTtl: ttlSeconds });
    return entry.count > maxRequests;
  }
}

/**
 * In-memory rate limiter fallback (single-isolate only).
 */
export class InMemoryRateLimiter implements RateLimiter {
  private state = new Map<string, { start: number; count: number }>();

  async check(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const entry = this.state.get(key);

    if (!entry || now - entry.start >= windowMs) {
      this.state.set(key, { start: now, count: 1 });
      return false;
    }

    entry.count += 1;
    return entry.count > maxRequests;
  }
}

/**
 * Create a rate limiter: KV if available, otherwise in-memory.
 */
export function createRateLimiter(kv?: KVNamespace): RateLimiter {
  return kv ? new KVRateLimiter(kv) : new InMemoryRateLimiter();
}
