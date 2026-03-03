import { Readability } from '@mozilla/readability';
import type { Article, ExtractedArticle } from '../../types';
import { fetchViaCorsProxy } from './corsProxy';

/**
 * 判断 article.content 是否比 article.description 更丰富
 * 当 RSS 源提供了 content:encoded 全文时返回 true
 */
export function hasRichRssContent(article: Article): boolean {
  const content = article.content || '';
  const description = article.description || '';

  // 去除 HTML 标签，获取纯文本
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').trim();

  const contentText = stripHtml(content);
  const descriptionText = stripHtml(description);

  // content 必须非空且 >= 100 字符
  if (!contentText || contentText.length < 100) {
    return false;
  }

  // content 与 description 不能相同（rssService 在没有 content:encoded 时会 fallback 为 desc）
  if (contentText === descriptionText) {
    return false;
  }

  // content 长度至少是 description 的 1.2 倍
  if (descriptionText.length > 0 && contentText.length < descriptionText.length * 1.2) {
    return false;
  }

  return true;
}

/**
 * 在浏览器中使用 DOMParser + Readability 解析 HTML
 */
export function extractFromHtml(html: string, url: string): ExtractedArticle | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 设置 <base href> 解决相对 URL 问题
    const base = doc.createElement('base');
    base.href = url;
    doc.head.insertBefore(base, doc.head.firstChild);

    const reader = new Readability(doc, { keepClasses: true });
    const article = reader.parse();

    if (!article || !article.content) {
      return null;
    }

    return {
      title: article.title || '',
      content: article.content,
      textContent: article.textContent || '',
      excerpt: article.excerpt || '',
      byline: article.byline || '',
      siteName: article.siteName || '',
      length: article.length || 0,
    };
  } catch (error) {
    console.error('[Readability] Client-side extraction failed:', error);
    return null;
  }
}

/** 简单检查响应是否为 HTML */
const isHtml = (text: string): boolean => {
  const trimmed = text.trimStart().substring(0, 500).toLowerCase();
  return trimmed.includes('<!doctype html') || trimmed.includes('<html') || trimmed.includes('<head');
};

/**
 * 获取文章全文：优先走公共 CORS 代理（零服务端开销），失败再 fallback 到服务端
 */
export async function fetchAndExtractClientSide(articleUrl: string): Promise<ExtractedArticle | null> {
  // 策略 1：公共 CORS 代理（不消耗 Workers 请求）
  try {
    const html = await fetchViaCorsProxy(articleUrl, { validate: isHtml });
    if (html) {
      const result = extractFromHtml(html, articleUrl);
      if (result) {
        console.log('[Readability] Extracted via CORS proxy');
        return result;
      }
    }
  } catch {
    console.warn('[Readability] All CORS proxies failed, falling back to server');
  }

  // 策略 2：服务端代理（fallback）
  try {
    const response = await fetch(
      `/api/article/extract?url=${encodeURIComponent(articleUrl)}&mode=raw`
    );

    if (!response.ok) {
      console.warn('[Readability] Server raw HTML fetch failed:', response.status);
      return null;
    }

    const html = await response.text();
    return extractFromHtml(html, articleUrl);
  } catch (error) {
    console.error('[Readability] fetchAndExtractClientSide error:', error);
    return null;
  }
}
