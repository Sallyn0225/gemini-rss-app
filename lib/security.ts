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

  // 0.0.0.0/8 (current network)
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10 (carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 192.0.0.0/24 (reserved)
  if (a === 192 && b === 0) return true;
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved)
  if (a >= 224) return true;

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
export const normalizeClientIp = (headers: any): string => {
  // Handle both Web API Headers and Node.js IncomingHttpHeaders
  const getHeader = (name: string) => {
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name.toLowerCase()];
  };

  const forwarded = (getHeader('x-forwarded-for') || '').split(',')[0].trim();
  const raw = forwarded || getHeader('x-real-ip') || 'unknown';
  if (!raw) return 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

/**
 * Validate admin secret from request headers
 */
export const validateAdminSecret = (headers: any): boolean => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return false;
  
  // Handle both Web API Headers and Node.js IncomingHttpHeaders
  let providedSecret: string | null = null;
  if (typeof headers.get === 'function') {
    providedSecret = headers.get('x-admin-secret');
  } else {
    providedSecret = headers['x-admin-secret'] as string;
  }
  
  return !!providedSecret && providedSecret === adminSecret;
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
