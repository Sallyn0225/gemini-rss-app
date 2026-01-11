import { promises as dns } from 'dns';
import { isIP } from 'net';

/**
 * Safe URL parsing with protocol validation
 */
export const safeParseUrl = (raw: string | null | undefined): URL | null => {
  if (!raw || typeof raw !== 'string') return null;
  // Basic hardening: reject obvious non-http(s) schemes early
  if (!/^https?:\/\//i.test(raw.trim())) return null;
  try {
    const parsed = new URL(raw.trim());
    // Disallow username/password in URLs used for proxying
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Check if IP is private / loopback / link-local
 */
export const isPrivateIp = (ip: string): boolean => {
  if (!ip || typeof ip !== 'string') return true;

  // IPv6 loopback or unique local
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7

  if (!isIP(ip)) return true;

  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;

  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;

  return false;
};

/**
 * Resolve hostname and reject private/loopback targets
 */
export const resolveAndValidateHost = async (hostname: string): Promise<string> => {
  const result = await dns.lookup(hostname, { all: false });
  const ip = typeof result === 'string' ? result : result.address;
  if (isPrivateIp(ip)) {
    const err = new Error('Target host resolves to a private or loopback address');
    (err as any).code = 'PRIVATE_HOST';
    throw err;
  }
  return ip;
};

/**
 * Infer allowed image hosts based on RSSHub-style routes
 */
export const inferAllowedImageHosts = (feedUrl: string): string[] => {
  const parsed = safeParseUrl(feedUrl);
  if (!parsed) return [];

  const pathname = parsed.pathname || '';
  const hosts = new Set<string>();

  // Always allow the feed host itself for images from the same origin
  if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());

  // Twitter-style routes (rsshub /twitter/...)
  if (pathname.startsWith('/twitter/')) {
    hosts.add('twimg.com');
    hosts.add('pbs.twimg.com');
    hosts.add('abs.twimg.com');
  }

  return Array.from(hosts);
};

/**
 * Normalize client IP from request headers
 */
export const normalizeClientIp = (headers: Headers): string => {
  const forwarded = (headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const raw = forwarded || headers.get('x-real-ip') || 'unknown';
  if (!raw) return 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

/**
 * Validate admin secret from request headers
 */
export const validateAdminSecret = (headers: Headers): boolean => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return false;
  const providedSecret = headers.get('x-admin-secret');
  return providedSecret === adminSecret;
};

/**
 * Rate limiting state for media proxy
 */
const mediaProxyRateState = new Map<string, { start: number; count: number }>();
const MEDIA_PROXY_WINDOW_MS = 60 * 1000; // 1 minute window
const MEDIA_PROXY_MAX_REQUESTS = parseInt(process.env.MEDIA_PROXY_MAX_REQUESTS || '120', 10);

/**
 * Check media proxy rate limit
 */
export const checkMediaProxyRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const entry = mediaProxyRateState.get(ip);
  if (!entry || now - entry.start >= MEDIA_PROXY_WINDOW_MS) {
    mediaProxyRateState.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MEDIA_PROXY_MAX_REQUESTS;
};

/**
 * Build proxied media URL
 */
export const buildProxiedMediaUrl = (originalUrl: string): string => {
  if (!originalUrl || !originalUrl.startsWith('http')) {
    return originalUrl;
  }
  return `/api/media/proxy?url=${encodeURIComponent(originalUrl)}`;
};
