/**
 * Platform-agnostic security functions.
 * No Node.js dependencies (dns, net, http) — works in CF Workers.
 */

/**
 * Safe URL parsing with protocol validation
 */
export const safeParseUrl = (raw: string | null | undefined): URL | null => {
  if (!raw || typeof raw !== 'string') return null;
  if (!/^https?:\/\//i.test(raw.trim())) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Check if an IP string looks like a private/loopback/link-local address.
 * Uses regex instead of Node's net.isIP().
 */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export const isPrivateIp = (ip: string): boolean => {
  if (!ip || typeof ip !== 'string') return true;

  // IPv6 loopback or unique local
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;

  const m = IPV4_RE.exec(ip);
  if (!m) return true; // Not a valid IPv4 → treat as private (safe default)

  const parts = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10)];
  if (parts.some(n => n < 0 || n > 255)) return true;

  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;

  return false;
};

/**
 * Infer allowed image hosts based on RSSHub-style routes
 */
export const inferAllowedImageHosts = (feedUrl: string): string[] => {
  const parsed = safeParseUrl(feedUrl);
  if (!parsed) return [];

  const pathname = parsed.pathname || '';
  const hosts = new Set<string>();

  if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());

  if (pathname.startsWith('/twitter/')) {
    hosts.add('twimg.com');
    hosts.add('pbs.twimg.com');
    hosts.add('abs.twimg.com');
  }

  return Array.from(hosts);
};

/**
 * Normalize client IP from request headers (Web API Headers only)
 */
export const normalizeClientIp = (headers: Headers): string => {
  const forwarded = (headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const raw = forwarded || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown';
  if (!raw) return 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

/**
 * Validate admin secret from request headers
 */
export const validateAdminSecret = (headers: Headers, adminSecret: string | undefined): boolean => {
  if (!adminSecret) return false;
  const provided = headers.get('x-admin-secret');
  return !!provided && provided === adminSecret;
};
