import type { Repository } from '../db/repository.js';
import { safeParseUrl } from '../security.js';
import { secureFetch, streamWithSizeLimit } from '../http.js';

export async function handleMediaProxy(
  request: Request,
  repo: Repository,
  maxBytes: number = 50 * 1024 * 1024,
): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const mediaUrl = url.searchParams.get('url');

    if (!mediaUrl) {
      return Response.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const parsedMedia = safeParseUrl(mediaUrl);
    if (!parsedMedia || !parsedMedia.hostname) {
      return Response.json({ error: 'Invalid media URL' }, { status: 400 });
    }

    // Protocol restriction
    if (parsedMedia.protocol !== 'http:' && parsedMedia.protocol !== 'https:') {
      return Response.json({ error: 'Only http/https URLs can be proxied' }, { status: 400 });
    }

    // Domain whitelist check
    const allowedHosts = await repo.getAllAllowedMediaHosts();
    const mediaHost = parsedMedia.hostname.toLowerCase();
    if (!allowedHosts.has(mediaHost)) {
      console.error(`[Server Error] [Media Proxy] Blocked media host: ${mediaHost}`);
      return Response.json({ error: 'Media host is not allowed by server configuration' }, { status: 403 });
    }

    // CF Workers fetch blocks private IPs automatically
    const response = await secureFetch(parsedMedia.toString(), { timeout: 30000 });

    if (!response.ok) {
      return Response.json({ error: 'Upstream media fetch failed' }, { status: response.status });
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return Response.json({ error: 'Media exceeds configured size limit' }, { status: 413 });
    }

    // Stream response with size limit
    const limitedStream = await streamWithSizeLimit(response, maxBytes);

    const responseHeaders: Record<string, string> = {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    };

    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    return new Response(limitedStream, { status: 200, headers: responseHeaders });
  } catch (error: any) {
    console.error(`[Server Error] [Media Proxy Error]`, error);
    const isSizeLimit = error.message?.includes('size limit') || error.message?.includes('exceeds');
    if (isSizeLimit) {
      return Response.json({ error: 'Media exceeds configured size limit' }, { status: 413 });
    }
    return Response.json({ error: 'Media proxy failed', details: error.message }, { status: 502 });
  }
}
