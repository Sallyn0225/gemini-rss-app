import type { Env } from '../../../server/env.js';
import { createDbClient } from '../../../server/db/client.js';
import { Repository } from '../../../server/db/repository.js';
import { handleMediaProxy } from '../../../server/handlers/media-proxy.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbClient = createDbClient(context.env);
  const repo = new Repository(dbClient);
  const maxBytes = parseInt(context.env.MEDIA_PROXY_MAX_BYTES || '52428800', 10);
  return handleMediaProxy(context.request, repo, maxBytes);
};
