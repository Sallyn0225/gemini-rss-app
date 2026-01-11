import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { feeds } from '../../db/schema.js';
import { 
  safeParseUrl, 
  resolveAndValidateHost, 
  inferAllowedImageHosts 
} from '../../lib/security.js';
import { fetchWithResolvedIp, streamWithSizeLimit } from '../../lib/http.js';

const MEDIA_PROXY_MAX_BYTES = parseInt(process.env.MEDIA_PROXY_MAX_BYTES || '52428800', 10); // 50MB
const getAllowedMediaHosts = async (): Promise<Set<string>> => {
  const allFeeds = await db.select().from(feeds);
  const hosts = new Set<string>();

  for (const feed of allFeeds) {
    const parsed = safeParseUrl(feed.url);
    if (parsed?.hostname) {
      hosts.add(parsed.hostname.toLowerCase());
    }
    if (feed.allowedMediaHosts) {
      try {
        const parsedHosts = JSON.parse(feed.allowedMediaHosts);
        if (Array.isArray(parsedHosts)) {
          parsedHosts.forEach(h => hosts.add(String(h).toLowerCase()));
        }
      } catch {}
    }
    inferAllowedImageHosts(feed.url).forEach(h => hosts.add(h));
  }

  return hosts;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mediaUrl = req.query.url as string;
    
    if (!mediaUrl || typeof mediaUrl !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const parsedMedia = safeParseUrl(mediaUrl);
    if (!parsedMedia || !parsedMedia.hostname) {
      return res.status(400).json({ error: 'Invalid media URL' });
    }

    // Protocol restriction
    if (parsedMedia.protocol !== 'http:' && parsedMedia.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http/https URLs can be proxied' });
    }

    // Domain whitelist check
    const allowedMediaHosts = await getAllowedMediaHosts();

    const mediaHost = parsedMedia.hostname.toLowerCase();
    if (!allowedMediaHosts.has(mediaHost)) {
      if (res.headersSent) return;
      console.error(`[Server Error] [Media Proxy] Blocked media host: ${mediaHost}`);
      return res.status(403).json({ error: 'Media host is not allowed by server configuration' });
    }

    // SSRF protection
    const resolvedIp = await resolveAndValidateHost(parsedMedia.hostname);

    // Fetch media using resolved IP to prevent DNS rebinding
    const response = await fetchWithResolvedIp(parsedMedia.toString(), resolvedIp, { timeout: 30000 });

    if (!response.ok) {
      if (res.headersSent) return;
      return res.status(response.status).json({ error: 'Upstream media fetch failed' });
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MEDIA_PROXY_MAX_BYTES) {
      if (res.headersSent) return;
      return res.status(413).json({ error: 'Media exceeds configured size limit' });
    }

    // Stream response with size limit
    const limitedStream = await streamWithSizeLimit(response, MEDIA_PROXY_MAX_BYTES);

    // Set response headers
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream to response
    const reader = limitedStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }

    return res.end();
  } catch (error: any) {
    if (res.headersSent) {
      console.error(`[Server Error] [Media Proxy] Headers already sent:`, error);
      return;
    }
    console.error(`[Server Error] [Media Proxy Error]`, error);
    const isPrivateHost = error.code === 'PRIVATE_HOST';
    const isSizeLimit = error.message.includes('size limit') || error.message.includes('exceeds');
    
    if (isSizeLimit) {
      return res.status(413).json({ error: 'Media exceeds configured size limit' });
    }
    
    return res.status(isPrivateHost ? 403 : 502).json({
      error: isPrivateHost ? 'Host resolves to private address' : 'Media proxy failed',
      details: error.message,
    });
  }
}
