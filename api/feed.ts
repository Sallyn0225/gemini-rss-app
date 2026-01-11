import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../db/index.js';
import { feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { safeParseUrl, resolveAndValidateHost } from '../lib/security.js';
import { fetchWithResolvedIp } from '../lib/http.js';

const CACHE_CONTROL_HEADER = 'public, max-age=60, s-maxage=600, stale-while-revalidate=300';

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
    const feedId = req.query.id as string;

    if (!feedId || typeof feedId !== 'string') {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    // Get feed config from database
    const feedConfigs = await db.select()
      .from(feeds)
      .where(eq(feeds.id, feedId))
      .limit(1);

    if (feedConfigs.length === 0 || !feedConfigs[0].url) {
      console.error(`[Server Error] ID Not Found or URL missing: ${feedId}`);
      return res.status(404).json({ error: `Feed ID '${feedId}' not found on server` });
    }

    const feedConfig = feedConfigs[0];
    const parsedTarget = safeParseUrl(feedConfig.url);
    
    if (!parsedTarget || !parsedTarget.hostname) {
      console.error(`[Server Error] Invalid target URL for ID: ${feedId}`);
      return res.status(502).json({ error: 'Invalid upstream URL for this feed' });
    }

    // Validate host (SSRF protection)
    const resolvedIp = await resolveAndValidateHost(parsedTarget.hostname);

    // Fetch feed using resolved IP to prevent DNS rebinding
    const response = await fetchWithResolvedIp(parsedTarget.toString(), resolvedIp, { timeout: 15000 });
    console.log(`[Feed Fetch] ID: ${feedId} | Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      if (res.headersSent) return;
      return res.status(response.status).json({
        error: `Upstream error for ID '${feedId}'`,
        status: response.status,
        body: errorText.substring(0, 200),
      });
    }

    const body = await response.text();
    const contentType = response.headers.get('content-type') || 'application/xml';


    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).send(body);
  } catch (error: any) {
    if (res.headersSent) {
      console.error(`[Server Error] [Feed Fetch] Headers already sent:`, error);
      return;
    }
    console.error(`[Server Error] [Feed Fetch Error]`, error);
    const isTimeout = error.message.includes('timeout') || error.message.includes('超时');
    const isPrivateHost = error.code === 'PRIVATE_HOST';
    
    return res.status(isPrivateHost ? 403 : (isTimeout ? 504 : 502)).json({
      error: isTimeout ? 'Fetch timeout' : (isPrivateHost ? 'Host resolves to private address' : 'Fetch failed'),
      details: error.message,
    });
  }
}
