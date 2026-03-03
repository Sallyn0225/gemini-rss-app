import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

export interface ExtractedArticle {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string;
  siteName: string;
  length: number;
}

/**
 * 使用 Mozilla Readability 从 HTML 中提取文章内容
 * @param html - 原始 HTML 字符串
 * @param url - 文章 URL（用于解析相对链接）
 * @returns 提取的文章内容，如果提取失败返回 null
 */
export async function extractArticleContent(
  html: string,
  _url: string
): Promise<ExtractedArticle | null> {
  try {
    // 使用 linkedom 解析 HTML
    const { document } = parseHTML(html);

    // 使用 Readability 提取内容
    const reader = new Readability(document, {
      // 保留类名，用于样式
      keepClasses: true,
    });

    const article = reader.parse();

    if (!article) {
      return null;
    }

    return {
      title: article.title || '',
      content: article.content || '',
      textContent: article.textContent || '',
      excerpt: article.excerpt || '',
      byline: article.byline || '',
      siteName: article.siteName || '',
      length: article.length || 0,
    };
  } catch (error) {
    console.error('Readability extraction failed:', error);
    return null;
  }
}
