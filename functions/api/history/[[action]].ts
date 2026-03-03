import type { Env } from '../../../server/env.js';
import { createDbClient } from '../../../server/db/client.js';
import { Repository } from '../../../server/db/repository.js';
import { createRateLimiter } from '../../../server/rate-limit.js';
import { handleHistory } from '../../../server/handlers/history.js';

/**
 * Catch-all route for /api/history/*
 *
 * Matches:
 *   GET  /api/history/get?id=X     → get history
 *   POST /api/history/upsert       → upsert history
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const dbClient = createDbClient(context.env);
  const repo = new Repository(dbClient);
  const rateLimiter = createRateLimiter(context.env.RATE_LIMIT_KV);

  // Rewrite path-based action to query param so the handler can read it
  // /api/history/get?id=X → action=get, /api/history/upsert → action=upsert
  const url = new URL(context.request.url);
  const pathParts = url.pathname.replace(/\/+$/, '').split('/');
  // pathParts = ['', 'api', 'history', 'get'] or ['', 'api', 'history', 'upsert']
  if (pathParts.length > 3 && !url.searchParams.has('action')) {
    url.searchParams.set('action', pathParts[3]);
  }

  // Build a new request with the updated URL
  const newRequest = new Request(url.toString(), {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });

  return handleHistory(newRequest, repo, rateLimiter);
};
