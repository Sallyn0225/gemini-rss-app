import { get, set } from 'idb-keyval';
import type { Article, ArticleExtractionResponse } from '../../types';
import { hasRichRssContent, fetchAndExtractClientSide } from './readabilityService';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedExtraction {
  data: ArticleExtractionResponse;
  timestamp: number;
}

/**
 * 从原网站提取完整文章内容（三层提取策略）
 *
 * Tier 1: 使用 RSS feed 中已有的 content（零服务端调用）
 * Tier 2: 通过轻量 CORS 代理获取 HTML + 浏览器端 Readability 解析
 * Tier 3: 回退到 RSS content + 显示错误提示
 */
export async function fetchFullArticle(article: Article): Promise<ArticleExtractionResponse> {
  try {
    // 1. 检查 IndexedDB 缓存
    const cacheKey = `article_extract:${article.link}`;
    const cached = await get<CachedExtraction>(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[Article Extract] Cache hit:', article.link);
      return cached.data;
    }

    // 2. Tier 1: RSS content 已经比 description 丰富，直接使用
    if (hasRichRssContent(article)) {
      console.log('[Article Extract] Tier 1: Using rich RSS content');
      const result: ArticleExtractionResponse = {
        success: true,
        data: {
          title: article.title,
          content: article.content,
          textContent: article.content.replace(/<[^>]+>/g, ''),
          excerpt: (article.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
          byline: article.author || '',
          siteName: article.feedTitle || '',
          length: article.content.replace(/<[^>]+>/g, '').length,
        },
      };

      await set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // 3. Tier 2: 客户端提取（通过 CORS 代理获取原始 HTML + 浏览器端 Readability）
    console.log('[Article Extract] Tier 2: Client-side extraction via proxy:', article.link);
    const extracted = await fetchAndExtractClientSide(article.link);

    if (extracted) {
      const result: ArticleExtractionResponse = {
        success: true,
        data: extracted,
      };

      await set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // 4. Tier 3: 回退到 RSS content
    console.log('[Article Extract] Tier 3: Falling back to RSS content');
    return {
      success: false,
      error: '无法从原网站提取内容',
      fallback: 'use_rss_content',
    };
  } catch (error) {
    console.error('[Article Extract] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: 'use_rss_content',
    };
  }
}

/**
 * 清除文章提取缓存
 * @param articleUrl - 可选，指定文章 URL。如果不提供，则清除所有缓存
 */
export async function clearArticleCache(articleUrl?: string): Promise<void> {
  if (articleUrl) {
    const cacheKey = `article_extract:${articleUrl}`;
    await set(cacheKey, undefined);
  }
  // 注意：idb-keyval 不支持批量删除，如需清除所有缓存需要遍历所有键
}
