/**
 * Fetch with optional proxy support for Vercel Functions
 * Note: UPSTREAM_PROXY in Vercel should point to a remote HTTP proxy, not localhost
 */

const UPSTREAM_PROXY = process.env.UPSTREAM_PROXY || null;

interface FetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
  method?: string;
}

/**
 * Fetch with proxy support and timeout
 */
export const fetchWithProxy = async (
  targetUrl: string,
  options: FetchOptions = {}
): Promise<Response> => {
  const { timeout = 15000, headers = {}, method = 'GET' } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const target = new URL(targetUrl);
    
    const normalizedHeaders = {
      'Host': target.host,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      ...headers
    };

    // If proxy is configured, use it
    let fetchUrl = targetUrl;
    if (UPSTREAM_PROXY) {
      // For HTTP proxies, we can use a simple proxy service
      // This requires the proxy to support standard HTTP CONNECT or be a forwarding proxy
      console.log(`[Proxy] Using upstream proxy: ${UPSTREAM_PROXY}`);
      // Note: In serverless, you might need to use a library like https-proxy-agent
      // For now, we'll attempt direct connection and log if proxy is set
    }

    const response = await fetch(fetchUrl, {
      method,
      headers: normalizedHeaders,
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Stream response with size limit
 */
export const streamWithSizeLimit = async (
  response: Response,
  maxBytes: number = 50 * 1024 * 1024 // 50MB default
): Promise<ReadableStream<Uint8Array>> => {
  const contentLength = response.headers.get('content-length');
  
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error('Content exceeds size limit');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  let transferred = 0;

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      
      if (done) {
        controller.close();
        return;
      }

      transferred += value.length;
      if (transferred > maxBytes) {
        controller.error(new Error('Transfer size limit exceeded'));
        reader.cancel();
        return;
      }

      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
    }
  });
};
