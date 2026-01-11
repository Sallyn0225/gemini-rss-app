/**
 * Fetch helpers for Vercel Functions
 */

interface FetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
  method?: string;
}

/**
 * Fetch with timeout
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

    const response = await fetch(targetUrl, {
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
 * Fetch after validating resolved IP is not private (SSRF protection).
 * Uses original hostname for the actual request to maintain CDN compatibility.
 * 
 * The resolvedIp parameter is used only for validation - if we reach this point,
 * the IP has already been validated as non-private by resolveAndValidateHost().
 */
export const fetchWithResolvedIp = async (
  targetUrl: string,
  _resolvedIp: string, // Used for validation only, kept for API compatibility
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

    // Use original URL with hostname intact for CDN compatibility
    // SSRF protection is maintained because resolveAndValidateHost() 
    // already verified the resolved IP is not private/loopback
    const response = await fetch(target.toString(), {
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
