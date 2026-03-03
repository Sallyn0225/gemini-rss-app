import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { feeds } from '../../db/schema.js';
import { safeParseUrl, inferAllowedImageHosts, normalizeClientIp } from '../../lib/security.js';
import { extractArticleContent } from '../../server/utils/readability.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT = 20000; // 20 seconds
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

// In-memory rate limiter for Vercel
const rateLimitState = new Map<string, { start: number; count: number }>();

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const entry = rateLimitState.get(ip);
  if (!entry || now - entry.start >= RATE_LIMIT_WINDOW) {
    rateLimitState.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
};

// Get all allowed media hosts from database (with 5-minute cache)
let _vercelHostCache: { hosts: Set<string>; expiresAt: number } | null = null;
const HOST_CACHE_TTL = 5 * 60 * 1000;

const getAllAllowedMediaHosts = async (): Promise<Set<string>> => {
  if (_vercelHostCache && Date.now() < _vercelHostCache.expiresAt) {
    return _vercelHostCache.hosts;
  }

  const allFeeds = await db.select().from(feeds);
  const hosts = new Set<string>();

  for (const feed of allFeeds) {
    const parsed = safeParseUrl(feed.url);
    if (parsed?.hostname) hosts.add(parsed.hostname.toLowerCase());
    if (feed.allowedMediaHosts) {
      try {
        const parsedHosts = JSON.parse(feed.allowedMediaHosts);
        if (Array.isArray(parsedHosts)) parsedHosts.forEach(h => hosts.add(String(h).toLowerCase()));
      } catch {}
    }
    inferAllowedImageHosts(feed.url).forEach(h => hosts.add(h));
  }

  _vercelHostCache = { hosts, expiresAt: Date.now() + HOST_CACHE_TTL };
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
    // 1. Rate limit check
    const clientIp = normalizeClientIp(req.headers);
    if (checkRateLimit(clientIp)) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        fallback: 'use_rss_content',
      });
    }

    // 2. Get and validate URL
    const articleUrl = req.query.url as string;

    if (!articleUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing url parameter',
        fallback: 'use_rss_content',
      });
    }

    const parsedUrl = safeParseUrl(articleUrl);
    if (!parsedUrl) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL',
        fallback: 'use_rss_content',
      });
    }

    // 3. Domain whitelist validation
    const allowedHosts = await getAllAllowedMediaHosts();
    const hostname = parsedUrl.hostname.toLowerCase();

    const isAllowed = Array.from(allowedHosts).some(allowedHost => {
      return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
    });

    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        error: 'Domain not in whitelist',
        fallback: 'use_rss_content',
      });
    }

    // 4. Fetch HTML
    const maxBytes = parseInt(process.env.ARTICLE_EXTRACT_MAX_BYTES || String(DEFAULT_MAX_BYTES), 10);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(articleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `HTTP ${response.status}`,
        fallback: 'use_rss_content',
      });
    }

    // 5. Check content size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return res.status(413).json({
        success: false,
        error: 'Content too large',
        fallback: 'use_rss_content',
      });
    }

    // 6. Read HTML with size limit
    let html: string;
    try {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > maxBytes) {
          reader.cancel();
          throw new Error('Content size limit exceeded');
        }

        chunks.push(value);
      }

      const blob = new Blob(chunks);
      html = await blob.text();
    } catch (error) {
      return res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read response',
        fallback: 'use_rss_content',
      });
    }

    // 7. If mode=raw, return raw HTML (client will parse with Readability)
    const mode = (req.query.mode as string) || '';
    if (mode === 'raw') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(html);
    }

    // 8. Extract content
    const extracted = await extractArticleContent(html, articleUrl);

    if (!extracted || !extracted.content) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).json({
        success: false,
        error: 'Failed to extract content',
        fallback: 'use_rss_content',
      });
    }

    // 9. Return success
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({
      success: true,
      data: extracted,
    });
  } catch (error: unknown) {
    console.error('Article extraction error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      fallback: 'use_rss_content',
    });
  }
}
