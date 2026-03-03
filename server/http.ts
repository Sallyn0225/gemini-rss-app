/**
 * HTTP utility functions for Cloudflare Workers/Pages.
 * No Node.js dependencies — uses Web API fetch + AbortController.
 */

interface SecureFetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
  method?: string;
}

/**
 * Fetch with timeout via AbortController.
 * In CF Workers, fetch() automatically blocks requests to private IPs,
 * so no explicit DNS resolution / SSRF check is needed.
 */
export const secureFetch = async (
  targetUrl: string,
  options: SecureFetchOptions = {}
): Promise<Response> => {
  const { timeout = 15000, headers = {}, method = 'GET' } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const target = new URL(targetUrl);
    const normalizedHeaders: Record<string, string> = {
      'Host': target.host,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      ...headers,
    };

    return await fetch(target.toString(), {
      method,
      headers: normalizedHeaders,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Stream response body with a size limit.
 */
export const streamWithSizeLimit = async (
  response: Response,
  maxBytes: number = 50 * 1024 * 1024
): Promise<ReadableStream<Uint8Array>> => {
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error('Content exceeds size limit');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  let transferred = 0;

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }
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
    },
  });
};
