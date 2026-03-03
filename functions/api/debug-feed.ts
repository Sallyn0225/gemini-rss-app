import type { Env } from '../../server/env.js';
import { createDbClient } from '../../server/db/client.js';
import { Repository } from '../../server/db/repository.js';
import { safeParseUrl } from '../../server/security.js';
import { secureFetch } from '../../server/http.js';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const feedId = url.searchParams.get('id');

  if (!feedId) {
    return Response.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const dbClient = createDbClient(context.env);
  const repo = new Repository(dbClient);

  try {
    // Step 1: Check if feed exists in DB
    const feed = await repo.getFeedById(feedId);
    if (!feed || !feed.url) {
      return Response.json({
        step: 'database',
        success: false,
        error: 'Feed not found in database',
        feedId,
      }, { status: 404 });
    }

    // Step 2: Validate URL format
    const parsedTarget = safeParseUrl(feed.url);
    if (!parsedTarget || !parsedTarget.hostname) {
      return Response.json({
        step: 'url_validation',
        success: false,
        error: 'Invalid URL format',
        feedId,
        url: feed.url,
      }, { status: 400 });
    }

    // Step 3: Try to fetch
    let fetchError = null;
    let fetchStatus = null;
    let fetchBody = null;

    try {
      const response = await secureFetch(parsedTarget.toString(), { timeout: 15000 });
      fetchStatus = response.status;

      if (response.ok) {
        const text = await response.text();
        fetchBody = text.substring(0, 500); // First 500 chars
      } else {
        fetchBody = await response.text();
      }
    } catch (error: unknown) {
      fetchError = error instanceof Error ? error.message : String(error);
    }

    return Response.json({
      step: 'complete',
      feedId,
      url: feed.url,
      parsedUrl: parsedTarget.toString(),
      hostname: parsedTarget.hostname,
      port: parsedTarget.port,
      pathname: parsedTarget.pathname,
      search: parsedTarget.search,
      fetch: {
        status: fetchStatus,
        error: fetchError,
        bodyPreview: fetchBody,
      },
    });
  } catch (error: unknown) {
    return Response.json({
      step: 'unknown',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
};
