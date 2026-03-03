/**
 * Cloudflare Pages Functions middleware.
 * Handles CORS preflight, security headers, and error boundary.
 */
import type { Env } from '../server/env.js';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
  }

  try {
    const response = await context.next();

    // Append security + CORS headers to every response
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) newHeaders.set(k, v);
    for (const [k, v] of Object.entries(CORS_HEADERS)) newHeaders.set(k, v);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error: unknown) {
    console.error('[Middleware Error]', error);
    return Response.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } },
    );
  }
};
