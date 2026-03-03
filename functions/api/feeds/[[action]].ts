import type { Env } from '../../../server/env.js';
import { createDbClient } from '../../../server/db/client.js';
import { Repository } from '../../../server/db/repository.js';
import { handleFeeds } from '../../../server/handlers/feeds.js';

/**
 * Catch-all route for /api/feeds/*
 *
 * Matches:
 *   GET  /api/feeds           → public list
 *   GET  /api/feeds/summary   → feed summaries
 *   POST /api/feeds/admin     → admin list
 *   POST /api/feeds/add       → add feed
 *   POST /api/feeds/update    → update feed
 *   POST /api/feeds/delete    → delete feed
 *   POST /api/feeds/reorder   → reorder feeds
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const dbClient = createDbClient(context.env);
  const repo = new Repository(dbClient);

  // Extract action from URL path: /api/feeds/add → "add", /api/feeds → null
  const url = new URL(context.request.url);
  const pathParts = url.pathname.replace(/\/+$/, '').split('/');
  // pathParts = ['', 'api', 'feeds', 'add'] or ['', 'api', 'feeds', 'list', 'admin']
  let action: string | null = null;

  if (pathParts.length > 3) {
    // Handle /api/feeds/list/admin → action = 'admin'
    if (pathParts[3] === 'list' && pathParts[4] === 'admin') {
      action = 'admin';
    } else if (pathParts[3] === 'list') {
      // /api/feeds/list → same as /api/feeds (public list)
      action = null;
    } else if (pathParts[3] === 'summary') {
      action = 'summary';
    } else {
      action = pathParts[3]; // add, update, delete, reorder, admin
    }
  }

  return handleFeeds(context.request, repo, action, context.env.ADMIN_SECRET);
};
