import type { Env } from '../../server/env.js';
import { createDbClient } from '../../server/db/client.js';
import { Repository } from '../../server/db/repository.js';
import { handleFeed } from '../../server/handlers/feed.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbClient = createDbClient(context.env);
  const repo = new Repository(dbClient);
  return handleFeed(context.request, repo);
};
