import type { Env } from '../../../server/env.js';
import { createDbClient } from '../../../server/db/client.js';
import { Repository } from '../../../server/db/repository.js';
import { createRateLimiter } from '../../../server/rate-limit.js';
import { handleArticleExtract } from '../../../server/handlers/article-extract.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbClient = createDbClient(context.env);
  const repo = new Repository(dbClient);
  const rateLimiter = createRateLimiter(context.env.RATE_LIMIT_KV);
  const maxBytes = parseInt(context.env.ARTICLE_EXTRACT_MAX_BYTES || '5242880', 10);

  return handleArticleExtract(context.request, repo, rateLimiter, maxBytes);
};
