import type { Repository } from '../db/repository.js';
import type { RateLimiter } from '../rate-limit.js';
import { safeParseUrl, normalizeClientIp } from '../security.js';
import { secureFetch } from '../http.js';
import { extractArticleContent } from '../utils/readability.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT = 20000; // 20 seconds
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

interface ArticleExtractionResponse {
  success: boolean;
  data?: {
    title: string;
    content: string;
    textContent: string;
    excerpt: string;
    byline: string;
    siteName: string;
    length: number;
  };
  error?: string;
  fallback?: 'use_rss_content';
}

/**
 * 处理文章内容提取请求
 */
export async function handleArticleExtract(
  request: Request,
  repo: Repository,
  rateLimiter: RateLimiter,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<Response> {
  try {
    // 1. 速率限制检查
    const clientIp = normalizeClientIp(request.headers);
    const isRateLimited = await rateLimiter.check(
      `article_extract:${clientIp}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW
    );

    if (isRateLimited) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rate limit exceeded',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // 2. 获取并验证 URL
    const url = new URL(request.url);
    const articleUrl = url.searchParams.get('url');

    if (!articleUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing url parameter',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const parsedUrl = safeParseUrl(articleUrl);
    if (!parsedUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid URL',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. 域名白名单验证
    const allowedHosts = await repo.getAllAllowedMediaHosts();
    const hostname = parsedUrl.hostname.toLowerCase();

    // 检查是否在白名单中（支持子域名）
    const isAllowed = Array.from(allowedHosts).some(allowedHost => {
      return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
    });

    if (!isAllowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Domain not in whitelist',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. 抓取 HTML
    let response: Response;
    try {
      response = await secureFetch(articleUrl, {
        timeout: FETCH_TIMEOUT,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Fetch failed',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `HTTP ${response.status}`,
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. 检查内容大小
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Content too large',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 6. 读取 HTML（带大小限制）
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
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read response',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. 提取内容
    const extracted = await extractArticleContent(html, articleUrl);

    if (!extracted || !extracted.content) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to extract content',
          fallback: 'use_rss_content',
        } as ArticleExtractionResponse),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
          },
        }
      );
    }

    // 8. 返回成功结果
    return new Response(
      JSON.stringify({
        success: true,
        data: extracted,
      } as ArticleExtractionResponse),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400', // 缓存 24 小时
        },
      }
    );
  } catch (error) {
    console.error('Article extraction error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        fallback: 'use_rss_content',
      } as ArticleExtractionResponse),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
