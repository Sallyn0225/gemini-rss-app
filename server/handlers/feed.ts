import type { Repository } from '../db/repository.js';
import { safeParseUrl } from '../security.js';
import { secureFetch } from '../http.js';

const CACHE_CONTROL_HEADER = 'public, max-age=60, s-maxage=1800, stale-while-revalidate=600';

export async function handleFeed(request: Request, repo: Repository): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const feedId = url.searchParams.get('id');

    if (!feedId) {
      return Response.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const feed = await repo.getFeedById(feedId);
    if (!feed || !feed.url) {
      console.error(`[Server Error] ID Not Found or URL missing: ${feedId}`);
      return Response.json({ error: `Feed ID '${feedId}' not found on server` }, { status: 404 });
    }

    const parsedTarget = safeParseUrl(feed.url);
    if (!parsedTarget || !parsedTarget.hostname) {
      console.error(`[Server Error] Invalid target URL for ID: ${feedId}`);
      return Response.json({ error: 'Invalid upstream URL for this feed' }, { status: 502 });
    }

    // CF Workers fetch blocks private IPs automatically — no resolveAndValidateHost needed
    const response = await secureFetch(parsedTarget.toString(), { timeout: 15000 });
    console.log(`[Feed Fetch] ID: ${feedId} | Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        error: `Upstream error for ID '${feedId}'`,
        status: response.status,
        body: errorText.substring(0, 200),
      }, { status: response.status });
    }

    const body = await response.text();
    const contentType = response.headers.get('content-type') || 'application/xml';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': CACHE_CONTROL_HEADER,
      },
    });
  } catch (error: any) {
    console.error(`[Server Error] [Feed Fetch Error]`, error);
    const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');
    return Response.json({
      error: isTimeout ? 'Fetch timeout' : 'Fetch failed',
      details: error.message,
    }, { status: isTimeout ? 504 : 502 });
  }
}
