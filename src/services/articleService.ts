import { get, set } from 'idb-keyval';
import type { ArticleExtractionResponse } from '../types';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedExtraction {
  data: ArticleExtractionResponse;
  timestamp: number;
}

/**
 * 从原网站提取完整文章内容
 * @param articleUrl - 文章原始 URL
 * @returns 提取结果
 */
export async function fetchFullArticle(articleUrl: string): Promise<ArticleExtractionResponse> {
  try {
    // 1. 检查缓存
    const cacheKey = `article_extract:${articleUrl}`;
    const cached = await get<CachedExtraction>(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[Article Extract] Cache hit:', articleUrl);
      return cached.data;
    }

    // 2. 调用后端 API
    console.log('[Article Extract] Fetching from server:', articleUrl);
    const response = await fetch(`/api/article/extract?url=${encodeURIComponent(articleUrl)}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result: ArticleExtractionResponse = await response.json();

    // 3. 缓存成功的提取结果
    if (result.success && result.data) {
      await set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });
    }

    return result;
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
